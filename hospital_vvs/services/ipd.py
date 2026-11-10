"""IPD admission → discharge (06-ipd.md). All money and stock rules live here; the API files only check roles.

Billing model (DECISIONS D-28 … D-32):
- Everything billable during a stay is an **IPD Charge** row (labs, medicines given, procedures, diet, oxygen, consumables,
  ad-hoc, ER charges carried over). Bed days, ICU surcharge and nursing shifts are computed from the bed history when the
  bill is shown, and written as charges when the final invoice is made.
- Bed days = midnights spent in each bed (midnight census), at least `min_bed_days` for the stay.
- The final invoice is one Sales Invoice on the IPD Slip POS Profile (credit, not POS). The admission's advance Payment
  Entries are allocated on it; the balance is collected with a Payment Entry in the collector's cashier shift.
"""

import hashlib
import secrets
from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, getdate, now_datetime, today

from hospital_vvs.services import billing, discounts, safety
from hospital_vvs.utils import branch_company, check_branch, publish, setting, settings

OPEN_STATES = ("Admitted", "Discharge Pending")
FREQ_TIMES = {
	"OD": ["08:00"], "BD": ["08:00", "20:00"], "TDS": ["08:00", "14:00", "20:00"], "QID": ["06:00", "12:00", "18:00", "00:00"],
	"Q4H": ["02:00", "06:00", "10:00", "14:00", "18:00", "22:00"], "Q6H": ["00:00", "06:00", "12:00", "18:00"],
	"Q8H": ["06:00", "14:00", "22:00"], "HS": ["22:00"], "STAT": [], "PRN": [],
}


def patient_links():
	"""hv_patient_links hook: records the patient merge tool moves to the survivor."""
	return [("Bed Allotment", "patient"), ("IPD Charge", "patient"), ("IPD Note", "patient"), ("Ward Round", "patient"),
		("IPD Medication Order", "patient"), ("MAR Entry", "patient"), ("Diet Order", "patient"), ("IPD Procedure", "patient"),
		("Vitals Chart", "patient"), ("Consent Form", "patient"), ("Discharge Summary", "patient"), ("Patient Comms Profile", "patient"),
		("ER Visit", "patient"), ("Insurance Pre-Auth", "patient"), ("Test Invoice", "patient"), ("Payment Entry", "hv_patient"), ("Online Visit Request", "patient")]


# ------------------------------------------------------------------ helpers
def item_setting(field, code):
	return setting(field) or code


def ipd_warehouse(branch):
	profile = billing.pos_profile_for("IPD Slip", branch)
	return frappe.db.get_value("POS Profile", profile, "warehouse") or setting("ipd_dispensing_warehouse")


def open_admission(patient):
	return frappe.db.get_value("Bed Allotment", {"patient": patient, "status": ["in", OPEN_STATES]}, "name")


def get_open(name):
	adm = frappe.get_doc("Bed Allotment", name)
	check_branch(adm.branch)
	if adm.status not in OPEN_STATES:
		frappe.throw(_("Admission {0} is {1}.").format(adm.name, adm.status))
	return adm


def ward_rates(bed):
	b = frappe.db.get_value("Hospital Bed", bed, ["ward", "daily_rate"], as_dict=True)
	w = frappe.db.get_value("Ward", b.ward, ["ward_type", "bed_charge_per_day", "icu_surcharge_per_day", "nursing_charge_per_shift"], as_dict=True)
	return b.ward, w.ward_type, flt(b.daily_rate) or flt(w.bed_charge_per_day), flt(w.icu_surcharge_per_day), flt(w.nursing_charge_per_shift)


def _scope(adm=None, er=None):
	"""Filter for charges / clinical rows of an admission (which includes its ER visit's carried-over rows) or an ER visit."""
	return {"bed_allotment": adm} if adm else {"er_visit": er, "bed_allotment": ["is", "not set"]}


def _hash(token):
	return hashlib.sha256(token.encode()).hexdigest()


# ------------------------------------------------------------------ admission
def admit(patient, bed, doctor, *, reason=None, diagnosis=None, planned_days=1, source="Direct", payer_type=None, payer=None,
	pre_auth=None, package=None, daily_rate=None, er_visit=None, opd_slip=None, consultants=None, admit_at=None):
	if open_admission(patient):
		frappe.throw(_("This patient is already admitted ({0}).").format(open_admission(patient)))
	bed_doc = frappe.get_doc("Hospital Bed", bed)
	check_branch(bed_doc.branch)
	if bed_doc.status not in ("Available", "Reserved"):
		frappe.throw(_("Bed {0} is {1}.").format(bed_doc.bed_no, bed_doc.status))
	pat = frappe.db.get_value("Patient", patient, ["patient_name", "category", "panel", "insurance_provider", "disabled"], as_dict=True)
	if not pat or pat.disabled:
		frappe.throw(_("Patient {0} is not active.").format(patient))
	if not payer_type or payer_type == "Patient":
		from hospital_vvs.services.payers import resolve  # one payer rule (D-46)

		r = resolve(patient, "IPD Slip", 100, payer_type=payer_type, payer=payer)
		payer_type, payer = r["payer_type"], r["payer"]
	check_pre_auth(payer_type, payer, pre_auth, patient)
	now = get_datetime(admit_at) if admit_at else now_datetime()
	ward, wtype, rate, icu, nursing = ward_rates(bed)
	adm = frappe.get_doc({
		"doctype": "Bed Allotment", "patient": patient, "branch": bed_doc.branch, "company": branch_company(bed_doc.branch), "status": "Admitted",
		"admit_datetime": now, "planned_days": max(cint(planned_days), 1), "expected_discharge": add_to_date(now, days=max(cint(planned_days), 1)),
		"bed": bed, "ward": ward, "admitting_doctor": doctor, "source": source, "er_visit": er_visit, "opd_slip": opd_slip, "reason": reason,
		"provisional_diagnosis": diagnosis, "payer_type": payer_type, "payer": payer if payer_type != "Patient" else None, "pre_auth": pre_auth,
		"service_package": package, "daily_rate": flt(daily_rate) or None,
		"consultants": [{"doctor": d} for d in (consultants or []) if d],
		"segments": [{"bed": bed, "ward": ward, "ward_type": wtype, "from_time": now, "daily_rate": flt(daily_rate) or rate, "icu_surcharge": icu,
			"reason": _("Admission")}],
	})
	adm.readmission_of = frappe.db.get_value("Bed Allotment", {"patient": patient, "status": "Discharged",
		"release_datetime": [">=", add_to_date(now, days=-30)]}, "name")
	adm.insert(ignore_permissions=True)
	if pre_auth:
		frappe.db.set_value("Insurance Pre-Auth", pre_auth, "bed_allotment", adm.name)
	from hospital_vvs.api.ward import _set

	_set(bed, "Occupied", _("Admitted · {0}").format(adm.name), current_patient=patient, patient_name=pat.patient_name, occupied_since=now,
		attending_doctor=doctor, expected_discharge=adm.expected_discharge, agreed_rate=flt(daily_rate) or rate, admission_reason=reason)
	token = make_comms_profile(adm)
	if er_visit:
		carry_er(er_visit, adm.name)
	publish("ipd", {"action": "admitted", "admission": adm.name}, adm.branch)
	return adm, token


def check_pre_auth(payer_type, payer, pre_auth, patient, amount=None):
	if payer_type != "Insurance" or not cint(setting("require_preauth_for_insurance")):
		return
	if not pre_auth:
		frappe.throw(_("Insurance admission needs an approved pre-authorization."), title=_("Pre-auth required"))
	pa = frappe.db.get_value("Insurance Pre-Auth", pre_auth, ["status", "patient", "payer", "valid_till"], as_dict=True)
	if not pa or pa.status not in ("Approved", "Partially Approved"):
		frappe.throw(_("Pre-auth {0} is not approved.").format(pre_auth))
	if pa.patient != patient or (payer and pa.payer != payer):
		frappe.throw(_("Pre-auth {0} belongs to another patient or payer.").format(pre_auth))
	if pa.valid_till and getdate(pa.valid_till) < getdate(today()):
		frappe.throw(_("Pre-auth {0} expired on {1}.").format(pre_auth, pa.valid_till))


def make_comms_profile(adm):
	"""Patient Comms Profile + bedside token (08-online-visit-comms.md). Only the hash is stored; the token is returned once."""
	token = secrets.token_urlsafe(18)
	station = frappe.db.get_value("Ward", adm.ward, "nursing_station")
	prof = frappe.get_doc({"doctype": "Patient Comms Profile", "patient": adm.patient, "bed_allotment": adm.name, "station": station,
		"bed": adm.bed, "active": 1, "token_hash": _hash(token), "activated_on": now_datetime()}).insert(ignore_permissions=True)
	adm.db_set("comms_profile", prof.name)
	return token


def new_comms_token(adm_name):
	adm = get_open(adm_name)
	token = secrets.token_urlsafe(18)
	frappe.db.set_value("Patient Comms Profile", adm.comms_profile, {"token_hash": _hash(token), "active": 1})
	return token


def carry_er(er_visit, adm_name):
	"""Admit from ER: the visit's open charges, orders, notes, labs and vitals continue on the admission."""
	for dt in ("IPD Charge", "IPD Note", "IPD Medication Order", "MAR Entry", "IPD Procedure", "Vitals Chart", "Consent Form", "Test Invoice"):
		frappe.db.sql(f"update `tab{dt}` set bed_allotment=%s where er_visit=%s and ifnull(bed_allotment,'')=''", (adm_name, er_visit))
	frappe.db.sql("update `tabPayment Entry` set hv_bed_allotment=%s where hv_er_visit=%s and docstatus=1 and ifnull(hv_bed_allotment,'')=''",
		(adm_name, er_visit))


def transfer(adm_name, to_bed, reason=None, at=None):
	adm = get_open(adm_name)
	if to_bed == adm.bed:
		frappe.throw(_("The patient is already in this bed."))
	target = frappe.get_doc("Hospital Bed", to_bed)
	if target.status not in ("Available", "Reserved"):
		frappe.throw(_("Bed {0} is {1}.").format(target.bed_no, target.status))
	now = get_datetime(at) if at else now_datetime()
	cur = adm.segments[-1]
	cur.to_time = now
	ward, wtype, rate, icu, _n = ward_rates(to_bed)
	adm.append("segments", {"bed": to_bed, "ward": ward, "ward_type": wtype, "from_time": now, "daily_rate": rate, "icu_surcharge": icu,
		"reason": reason or _("Transfer")})
	old = adm.bed
	adm.bed, adm.ward = to_bed, ward
	adm.save(ignore_permissions=True)
	from hospital_vvs.api.ward import _set

	src = frappe.get_doc("Hospital Bed", old)
	_set(old, "Cleaning", _("Transferred to {0}").format(target.bed_no))
	_set(to_bed, "Occupied", _("Transferred from {0}").format(src.bed_no), current_patient=adm.patient, patient_name=adm.patient_name,
		occupied_since=adm.admit_datetime, attending_doctor=adm.admitting_doctor, expected_discharge=adm.expected_discharge, agreed_rate=rate,
		admission_reason=adm.reason)
	frappe.db.set_value("Patient Comms Profile", adm.comms_profile, {"bed": to_bed, "station": frappe.db.get_value("Ward", ward, "nursing_station")})
	publish("ipd", {"action": "transfer", "admission": adm.name}, adm.branch)
	return adm


def extend(adm_name, days):
	adm = get_open(adm_name)
	base = max(get_datetime(adm.expected_discharge or now_datetime()), now_datetime())
	adm.expected_discharge = add_to_date(base, days=max(cint(days), 1))
	adm.planned_days = cint(adm.planned_days) + max(cint(days), 1)
	adm.save(ignore_permissions=True)
	frappe.db.set_value("Hospital Bed", adm.bed, "expected_discharge", adm.expected_discharge)
	publish("beds", {"bed": adm.bed, "status": "Occupied"}, adm.branch)
	return adm


# ------------------------------------------------------------------ bed days, nursing shifts
def midnights(start, end):
	start, end = get_datetime(start), get_datetime(end)
	return max((end.date() - start.date()).days, 0) if end > start else 0


def bed_days(segments, until):
	"""[(segment, days)] by midnight census; a stay with fewer days than min_bed_days is topped up on the first bed."""
	out = [(s, midnights(s.from_time, s.to_time or until)) for s in segments]
	minimum = max(cint(setting("min_bed_days")), 1) if out else 0
	short = minimum - sum(d for _s, d in out)
	if short > 0 and out:
		out[0] = (out[0][0], out[0][1] + short)
	return out


def shift_starts():
	out = []
	for t in (setting("nursing_shift_starts") or "08:00,14:00,20:00").split(","):
		t = t.strip()
		if t:
			h, m = (t.split(":") + ["0"])[:2]
			out.append((int(h), int(m)))
	return sorted(out) or [(8, 0)]


def nursing_shifts(segments, until):
	"""[(segment, shifts)]: every nursing shift the patient was present in is charged once, to the bed they were in when it began
	(or when they arrived, for the first one)."""
	if not segments:
		return []
	start = get_datetime(segments[0].from_time)
	end = get_datetime(until)
	starts = shift_starts()
	bounds = []
	day = start.date() - timedelta(days=1)
	while day <= end.date():
		bounds += [datetime(day.year, day.month, day.day, h, m) for h, m in starts]
		day += timedelta(days=1)
	counts = {s.name or s.idx: 0 for s in segments}
	for i, b in enumerate(bounds):
		nxt = bounds[i + 1] if i + 1 < len(bounds) else b + timedelta(days=1)
		if nxt <= start or b >= end:
			continue
		at = max(b, start)
		seg = next((s for s in segments if get_datetime(s.from_time) <= at < get_datetime(s.to_time or end)), segments[-1])
		counts[seg.name or seg.idx] += 1
	return [(s, counts[s.name or s.idx]) for s in segments]


# ------------------------------------------------------------------ running bill
def _line(charge_type, item_code, description, qty, rate, charge=None, source=None, posted_at=None):
	return {"charge_type": charge_type, "item_code": item_code, "description": description, "qty": flt(qty), "rate": flt(rate),
		"amount": flt(qty) * flt(rate), "charge": charge, "source": source, "posted_at": str(posted_at or ""), "covered": 0, "covered_amount": 0}


def computed_lines(adm, until):
	"""Bed, ICU and nursing lines from the bed history, plus doses / procedures billed at discharge (settings)."""
	lines = []
	bed_item = item_setting("bed_charge_item", "IPD-BED")
	for s, days in bed_days(adm.segments, until):
		if not days:
			continue
		bed_no = frappe.db.get_value("Hospital Bed", s.bed, "bed_no")
		lines.append(_line("Bed", bed_item, _("Bed {0} · {1} · {2} day(s)").format(bed_no, s.ward, days), days, s.daily_rate, source="bed",
			posted_at=s.from_time))
		if flt(s.icu_surcharge):
			lines.append(_line("ICU", item_setting("icu_charge_item", "IPD-ICU"), _("ICU surcharge · {0} · {1} day(s)").format(s.ward, days), days,
				s.icu_surcharge, source="icu", posted_at=s.from_time))
	nurse_item = item_setting("nursing_charge_item", "IPD-NURSING")
	for s, n in nursing_shifts(adm.segments, until):
		rate = flt(adm.nursing_charge_per_shift) or flt(frappe.db.get_value("Ward", s.ward, "nursing_charge_per_shift"))
		if n and rate:
			lines.append(_line("Nursing", nurse_item, _("Nursing · {0} · {1} shift(s)").format(s.ward, n), n, rate, source="nursing", posted_at=s.from_time))
	if not pharmacy_bills() and setting("mar_billing_trigger") == "At discharge":
		for m in frappe.get_all("MAR Entry", filters={"bed_allotment": adm.name, "status": "Administered", "billed": 0},
			fields=["name", "item", "item_name", "qty_units", "administered_at", "batch_no"]):
			lines.append(_line("Medicine", m.item, f"{m.item_name} · {m.administered_at}", m.qty_units, unit_price(m.item, m.batch_no), source=f"mar:{m.name}",
				posted_at=m.administered_at))
	if setting("procedure_invoice_trigger") == "At discharge":
		for pr in frappe.get_all("IPD Procedure", filters={"bed_allotment": adm.name, "status": "Completed", "ipd_charge": ["is", "not set"]},
			fields=["name", "procedure_type", "procedure_fee", "theatre_charge", "anesthesia_charge", "completed_at"]):
			lines.append(_line("Procedure", procedure_item(pr.procedure_type), pr.procedure_type, 1,
				flt(pr.procedure_fee) + flt(pr.theatre_charge) + flt(pr.anesthesia_charge), source=f"proc:{pr.name}", posted_at=pr.completed_at))
	return lines


def charge_lines(scope):
	rows = frappe.get_all("IPD Charge", filters=dict(scope, status=["in", ["Open", "Billed"]]), fields=["name", "charge_type", "item_code",
		"description", "qty", "rate", "amount", "posted_at", "status", "reference_doctype", "reference_name"], order_by="posted_at, creation")
	out = []
	for r in rows:
		ln = _line(r.charge_type, r.item_code, r.description or r.item_code, r.qty, r.rate, charge=r.name, source=r.reference_doctype, posted_at=r.posted_at)
		ln["billed"] = int(r.status == "Billed")
		out.append(ln)
	return out


def apply_package(lines, package_name):
	"""Package price replaces the charge types it covers (up to each limit); bed days beyond the package's days stay billable."""
	if not package_name:
		return lines
	pkg = frappe.get_cached_doc("Service Package", package_name)
	limits = {r.charge_type: flt(r.limit_amount) for r in pkg.inclusions}
	used = {}
	bed_days_left = cint(pkg.days) or 0
	out = []
	for ln in lines:
		ct = ln["charge_type"]
		if ct not in limits:
			out.append(ln)
			continue
		if ct == "Bed":
			cover_days = min(bed_days_left, ln["qty"])
			bed_days_left -= cover_days
			ln["covered_amount"] = cover_days * ln["rate"]
		else:
			ln["covered_amount"] = ln["amount"]
		if limits[ct]:
			room = max(limits[ct] - used.get(ct, 0), 0)
			ln["covered_amount"] = min(ln["covered_amount"], room)
		used[ct] = used.get(ct, 0) + ln["covered_amount"]
		ln["covered"] = int(ln["covered_amount"] >= ln["amount"] - 0.005)
		out.append(ln)
	out.insert(0, _line("Package", package_item(pkg), _("Package: {0}").format(pkg.package_name), 1, pkg.price, source="package"))
	return out


def payer_split(adm, net):
	if adm.payer_type == "Patient" or not adm.payer:
		return 0.0
	from hospital_vvs.services.payers import resolve

	share = resolve(adm.patient, "IPD Slip", net, None, adm.payer_type, adm.payer)["share"]
	if adm.pre_auth:
		approved = flt(frappe.db.get_value("Insurance Pre-Auth", adm.pre_auth, "approved_amount"))
		if approved:
			share = min(share, approved)
	return share


def payments(adm_name=None, er=None):
	filters = {"docstatus": 1}
	if adm_name:
		filters["hv_bed_allotment"] = adm_name
	else:
		filters.update(hv_er_visit=er, hv_bed_allotment=["is", "not set"])
	rows = frappe.get_all("Payment Entry", filters=filters, fields=["name", "posting_date", "payment_type", "mode_of_payment", "paid_amount",
		"hv_purpose", "creation", "owner"], order_by="creation")
	adv = sum(flt(r.paid_amount) for r in rows if r.payment_type == "Receive" and r.hv_purpose == "Advance")
	settled = sum(flt(r.paid_amount) for r in rows if r.payment_type == "Receive" and r.hv_purpose != "Advance")
	refunded = sum(flt(r.paid_amount) for r in rows if r.payment_type == "Pay")
	return rows, adv, settled, refunded


def running_bill(adm_name=None, er_visit=None, until=None):
	"""Every line of the bill as it stands now (or at `until`), package and payer split applied."""
	adm = frappe.get_doc("Bed Allotment", adm_name) if adm_name else None
	if adm and adm.release_datetime:
		until = adm.release_datetime
	until = get_datetime(until) if until else now_datetime()
	if adm:
		lines = charge_lines({"bed_allotment": adm.name})
		# bed / ICU / nursing are computed until the final bill writes them as charges (referenced to the admission)
		if not frappe.db.exists("IPD Charge", {"bed_allotment": adm.name, "reference_doctype": "Bed Allotment", "status": ["!=", "Cancelled"]}):
			lines += computed_lines(adm, until)
		lines = apply_package(lines, adm.service_package)
	else:
		lines = charge_lines(_scope(er=er_visit))
	gross = sum(ln["amount"] for ln in lines)
	covered = sum(ln["covered_amount"] for ln in lines)
	net = gross - covered
	discount = flt(adm.discount_amount) if adm else 0
	after = max(net - discount, 0)
	payer_share = payer_split(adm, after) if adm else 0.0
	patient_share = after - payer_share
	rows, adv, settled, refunded = payments(adm.name if adm else None, er_visit)
	inv = adm.final_invoice if adm else frappe.db.get_value("ER Visit", er_visit, "sales_invoice")
	if inv:
		si = frappe.db.get_value("Sales Invoice", inv, ["grand_total", "rounded_total", "outstanding_amount"], as_dict=True)
		patient_share = flt(si.rounded_total or si.grand_total)
		balance = flt(si.outstanding_amount)
		# advances above the bill are refunded with a Pay entry; what is left over is the credit still owed to the patient
		credit = max(adv + settled - refunded - patient_share, 0)
	else:
		balance = patient_share - adv - settled + refunded
		credit = max(-balance, 0)
	by_type = {}
	for ln in lines:
		by_type[ln["charge_type"]] = by_type.get(ln["charge_type"], 0) + ln["amount"] - ln["covered_amount"]
	return {"lines": lines, "gross": gross, "package_covered": covered, "net": net, "discount": discount, "payer_share": payer_share,
		"patient_share": patient_share, "advances": adv, "settled": settled, "refunded": refunded, "balance": max(balance, 0), "credit": credit,
		"payments": rows, "by_type": by_type, "until": str(until), "final_invoice": inv,
		"payer_type": adm.payer_type if adm else "Patient", "payer": adm.payer if adm else None}


# ------------------------------------------------------------------ charges
def unit_price(item_code, batch=None):
	from hospital_vvs.services import pharmacy

	p = pharmacy.pack(item_code)
	return pharmacy.round_price(pharmacy.pack_price(item_code, batch) / (p.upp or 1))


def item_price(item_code):
	return flt(frappe.db.get_value("Item Price", {"item_code": item_code, "selling": 1}, "price_list_rate")) or flt(
		frappe.db.get_value("Item", item_code, "standard_rate"))


def ensure_service_item(code, name, billing_type="IPD Slip", rate=None):
	if not frappe.db.exists("Item", code):
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "item_group": "Medical Services", "stock_uom": "Nos",
			"is_stock_item": 0, "include_item_in_manufacturing": 0, "hv_billing_type": billing_type, "standard_rate": flt(rate)}).insert(ignore_permissions=True)
	return code


def procedure_item(procedure_type):
	pt = frappe.get_doc("Procedure Type", procedure_type)
	if not pt.item:
		code = ensure_service_item("PROC-" + frappe.scrub(pt.name).upper().replace("_", "-")[:30], pt.name, rate=pt.price)
		pt.db_set("item", code)
	return pt.item


def package_item(pkg):
	if not pkg.item:
		code = ensure_service_item("PKG-" + frappe.scrub(pkg.name).upper().replace("_", "-")[:30], _("Package: {0}").format(pkg.name), rate=pkg.price)
		frappe.db.set_value("Service Package", pkg.name, "item", code)
		frappe.clear_document_cache("Service Package", pkg.name)
		return code
	return pkg.item


def add_charge(*, charge_type, item_code, qty=1, rate=None, description=None, adm=None, er_visit=None, reference_doctype=None,
	reference_name=None, posted_at=None, stock=False, note=None):
	"""One running-bill line. stock=True issues the item from the IPD dispensing warehouse (consumables)."""
	if not adm and not er_visit:
		frappe.throw(_("A charge needs an admission or an ER visit."))
	src = frappe.get_doc("Bed Allotment", adm) if adm else frappe.get_doc("ER Visit", er_visit)
	check_branch(src.branch)
	if adm and src.status not in OPEN_STATES:
		frappe.throw(_("Admission {0} is {1}; no new charges.").format(adm, src.status))
	if adm and src.final_invoice:
		frappe.throw(_("The final bill is already made. Cancel it to add charges."))
	if not adm and src.status == "Disposed" and src.sales_invoice:
		frappe.throw(_("This ER visit is already billed."))
	rate = flt(rate) if rate is not None else item_price(item_code)
	ch = frappe.get_doc({"doctype": "IPD Charge", "bed_allotment": adm, "er_visit": er_visit if not adm else (src.er_visit or None),
		"patient": src.patient, "branch": src.branch, "charge_type": charge_type, "item_code": item_code,
		"description": description or frappe.db.get_value("Item", item_code, "item_name"), "qty": flt(qty) or 1, "rate": rate,
		"amount": (flt(qty) or 1) * rate, "posted_at": posted_at or now_datetime(), "posted_by": frappe.session.user,
		"reference_doctype": reference_doctype, "reference_name": reference_name, "status": "Open", "note": note})
	if stock:
		wh = ipd_warehouse(src.branch)
		ch.warehouse = wh
		ch.stock_entry = issue_stock(item_code, ch.qty, wh, remarks=_("Consumable · {0}").format(adm or er_visit))
	ch.insert(ignore_permissions=True)
	refresh_total(adm)
	publish("ipd", {"action": "charge", "admission": adm, "er_visit": er_visit}, src.branch)
	return ch


def cancel_charge(name, reason):
	if not (reason or "").strip():
		frappe.throw(_("Enter the reason."))
	ch = frappe.get_doc("IPD Charge", name)
	check_branch(ch.branch)
	if ch.status != "Open":
		frappe.throw(_("Only open charges can be cancelled (this one is {0}).").format(ch.status))
	if ch.stock_entry and frappe.db.get_value("Stock Entry", ch.stock_entry, "docstatus") == 1:
		se = frappe.get_doc("Stock Entry", ch.stock_entry)
		se.flags.ignore_permissions = True
		se.cancel()
	ch.db_set({"status": "Cancelled", "cancel_reason": reason})
	refresh_total(ch.bed_allotment)
	return ch


def refresh_total(adm_name):
	"""Charges posted so far (bed days are added when the bill is shown)."""
	if adm_name:
		total = flt(frappe.db.sql("select sum(amount) from `tabIPD Charge` where bed_allotment=%s and status!='Cancelled'", adm_name)[0][0])
		frappe.db.set_value("Bed Allotment", adm_name, "charges_total", total, update_modified=False)


def issue_stock(item_code, qty, warehouse, remarks=None):
	"""Material Issue by batch (FEFO). With allow_negative_stock on, a shortfall is left for the store to fix instead of blocking care."""
	from hospital_vvs.services import pharmacy

	if not frappe.get_cached_value("Item", item_code, "is_stock_item"):
		return None
	try:
		return pharmacy.fefo_transfer(warehouse, None, [{"item_code": item_code, "qty": flt(qty)}], purpose="Material Issue", remarks=remarks)
	except frappe.ValidationError:
		if cint(setting("allow_negative_stock")):
			frappe.clear_last_message()
			return None
		raise


# ------------------------------------------------------------------ medication orders + MAR
def order_medicine(*, patient, item, dose, frequency="BD", route="Oral", units_per_dose=1, times=None, days=3, start_at=None, doctor=None,
	override_reason=None, adm=None, er_visit=None, prn=False):
	src = frappe.get_doc("Bed Allotment", adm) if adm else frappe.get_doc("ER Visit", er_visit)
	check_branch(src.branch)
	active = frappe.get_all("IPD Medication Order", filters=dict(_scope(adm, er_visit), status="Active"), fields=["item", "dose", "frequency"])
	res = safety.check(patient, [{"item": item, "dose": dose, "frequency": frequency}] + [dict(a) for a in active])[0]
	atype, sev, msg = safety.summarize(res["alerts"])
	if res["blocking"] and not (override_reason or "").strip():
		frappe.throw(msg or _("Safety alert"), title=_("{0} alert — enter an override reason").format(atype))
	mo = frappe.get_doc({"doctype": "IPD Medication Order", "bed_allotment": adm, "er_visit": er_visit if not adm else src.er_visit,
		"patient": patient, "branch": src.branch, "item": item, "dose": dose, "units_per_dose": flt(units_per_dose) or 1, "route": route,
		"frequency": "PRN" if prn else frequency, "times": times, "days": cint(days) or 1, "start_at": start_at or now_datetime(), "status": "Active",
		"doctor": doctor, "ordered_by": frappe.session.user, "alert_type": atype, "alert_message": msg, "override_reason": override_reason})
	mo.insert(ignore_permissions=True)
	schedule_doses(mo)
	if pharmacy_bills() and mo.frequency != "PRN":
		doses = frappe.db.count("MAR Entry", {"medication_order": mo.name})
		mo.db_set("prescription", ward_prescription(mo, flt(mo.units_per_dose) * doses))
	publish("mar", {"action": "order", "admission": adm, "er_visit": er_visit}, src.branch)
	return mo, res["alerts"]


def dose_times(mo):
	if mo.times:
		return [t.strip() for t in mo.times.split(",") if t.strip()]
	return FREQ_TIMES.get(mo.frequency, ["08:00"])


def schedule_doses(mo):
	start = get_datetime(mo.start_at)
	item_name = frappe.db.get_value("Item", mo.item, "item_name")
	base = {"doctype": "MAR Entry", "medication_order": mo.name, "bed_allotment": mo.bed_allotment, "er_visit": mo.er_visit, "patient": mo.patient,
		"branch": mo.branch, "item": mo.item, "item_name": item_name, "dose": mo.dose, "route": mo.route, "qty_units": mo.units_per_dose}
	if mo.frequency == "STAT":
		frappe.get_doc(dict(base, scheduled_at=start, status=_initial())).insert(ignore_permissions=True)
		return
	end = start + timedelta(days=cint(mo.days) or 1)
	for d in range((end.date() - start.date()).days + 1):
		day = start.date() + timedelta(days=d)
		for t in dose_times(mo):
			h, m = (t.split(":") + ["0"])[:2]
			at = datetime(day.year, day.month, day.day, int(h), int(m))
			if start - timedelta(minutes=30) <= at < end:
				frappe.get_doc(dict(base, scheduled_at=at, status=_initial())).insert(ignore_permissions=True)


def pharmacy_bills():
	"""Contract pharmacy (D-38): ward medicines are billed by the pharmacy to the patient, not on the IPD bill."""
	return (setting("ipd_medicine_billing") or "Pharmacy bills patient") != "Hospital IPD bill"


ROUTE_MAP = {"PR": "Rectal", "SL": "Sublingual", "NG": "Oral", "Other": "Oral"}


def ward_prescription(mo, qty_units, note=None):
	"""A ward medicine order reaches the contract pharmacy as a signed IPD / ER prescription: the pharmacy's waiting list gets a draft
	invoice for the attendant to pay, and prescription-only and controlled-drug rules apply as for OPD."""
	if not qty_units:
		return None
	src = frappe.db.get_value("Bed Allotment", mo.bed_allotment, ["admitting_doctor", "bed"], as_dict=True) if mo.bed_allotment else None
	bed_no = frappe.db.get_value("Hospital Bed", src.bed, "bed_no") if src else None
	doctor = mo.doctor or (src.admitting_doctor if src else frappe.db.get_value("ER Visit", mo.er_visit, "assigned_doctor"))
	if not doctor:
		frappe.throw(_("Choose the ordering doctor."))
	rx = frappe.get_doc({"doctype": "Prescription", "patient": mo.patient, "doctor": doctor, "branch": mo.branch, "source": "IPD" if mo.bed_allotment else "ER",
		"advice": note or _("Ward order {0}{1}").format(mo.name, f" · bed {bed_no}" if bed_no else ""),
		"medicines": [{"item": mo.item, "dose": mo.dose, "frequency": mo.frequency, "route": ROUTE_MAP.get(mo.route, mo.route),
			"duration": f"{cint(mo.days) or 1} days" if mo.frequency != "PRN" else "1 dose", "qty": qty_units,
			"instructions": _("Ward order {0}{1}").format(mo.name, f" · bed {bed_no}" if bed_no else ""), "override_reason": mo.override_reason}]})
	rx.insert(ignore_permissions=True)
	rx.submit()
	return rx.name


def _drop_unpaid_ward_rx(rx_name):
	"""Order stopped before the attendant paid: withdraw the pharmacy draft (paid invoices are the pharmacy's to return)."""
	if not rx_name:
		return
	for si in frappe.get_all("Sales Invoice", filters={"hv_prescription": rx_name, "docstatus": 0}, pluck="name"):
		frappe.delete_doc("Sales Invoice", si, ignore_permissions=True, force=True)


def _initial():
	return "Pending Approval" if cint(setting("mar_approval_gate")) else "Scheduled"


def approve_dose(name):
	e = frappe.get_doc("MAR Entry", name)
	check_branch(e.branch)
	if e.status != "Pending Approval":
		frappe.throw(_("This dose is {0}.").format(e.status))
	e.db_set({"status": "Approved", "approved_by": frappe.session.user})
	return e


def prn_dose(order, note=None):
	mo = frappe.get_doc("IPD Medication Order", order)
	if mo.status != "Active":
		frappe.throw(_("The order is {0}.").format(mo.status))
	e = frappe.get_doc({"doctype": "MAR Entry", "medication_order": mo.name, "bed_allotment": mo.bed_allotment, "er_visit": mo.er_visit,
		"patient": mo.patient, "branch": mo.branch, "item": mo.item, "item_name": frappe.db.get_value("Item", mo.item, "item_name"), "dose": mo.dose,
		"route": mo.route, "qty_units": mo.units_per_dose, "scheduled_at": now_datetime(), "status": _initial(), "reason": note}).insert(ignore_permissions=True)
	if pharmacy_bills():
		ward_prescription(mo, flt(mo.units_per_dose), _("PRN dose for {0}: {1}").format(mo.name, note or ""))
	return e


def chart_dose(name, status="Administered", reason=None):
	"""Nurse charts one dose. Administered → stock (immediately, per setting) and the bill line (on administration, per setting)."""
	e = frappe.get_doc("MAR Entry", name)
	check_branch(e.branch)
	if e.status in ("Administered", "Missed", "Refused", "Cancelled"):
		frappe.throw(_("This dose is already {0}.").format(e.status))
	if status not in ("Administered", "Missed", "Refused", "Held"):
		frappe.throw(_("Unknown status {0}.").format(status))
	if status != "Administered" and not (reason or "").strip():
		frappe.throw(_("Enter why the dose was {0}.").format(status.lower()))
	if status == "Administered":
		if e.status == "Pending Approval":
			frappe.throw(_("This dose needs approval before it is given."), title=_("Approval gate"))
		adm = frappe.db.get_value("Bed Allotment", e.bed_allotment, ["status", "final_invoice"], as_dict=True) if e.bed_allotment else None
		if adm and (adm.status not in OPEN_STATES or adm.final_invoice):
			frappe.throw(_("The admission is closed for new doses."))
		e.administered_by, e.administered_at = frappe.session.user, now_datetime()
		if pharmacy_bills():
			pass  # the contract pharmacy dispensed and billed it; the chart is clinical only
		elif setting("stock_deduction_timing") != "At discharge":
			wh = ipd_warehouse(e.branch)
			e.stock_entry = issue_stock(e.item, e.qty_units, wh, remarks=_("MAR {0}").format(e.name))
			if e.stock_entry:
				e.batch_no = frappe.db.get_value("Stock Entry Detail", {"parent": e.stock_entry}, "batch_no")
		if not pharmacy_bills() and setting("mar_billing_trigger") != "At discharge":
			ch = add_charge(charge_type="Medicine", item_code=e.item, qty=e.qty_units, rate=unit_price(e.item, e.batch_no),
				description=f"{e.item_name} · {e.dose}", adm=e.bed_allotment, er_visit=None if e.bed_allotment else e.er_visit,
				reference_doctype="MAR Entry", reference_name=e.name, posted_at=e.administered_at)
			e.ipd_charge, e.billed = ch.name, 1
	e.status = status
	e.reason = reason or e.reason
	e.save(ignore_permissions=True)
	publish("mar", {"action": "charted", "entry": e.name}, e.branch)
	return e


def stop_order(order, reason):
	mo = frappe.get_doc("IPD Medication Order", order)
	check_branch(mo.branch)
	if mo.status != "Active":
		frappe.throw(_("The order is {0}.").format(mo.status))
	mo.db_set({"status": "Stopped", "stop_reason": reason, "stopped_by": frappe.session.user})
	_drop_unpaid_ward_rx(mo.prescription)
	frappe.db.sql("""update `tabMAR Entry` set status='Cancelled', reason=%s where medication_order=%s
		and status in ('Scheduled','Pending Approval','Approved') and scheduled_at > %s""", (_("Order stopped: {0}").format(reason), order, now_datetime()))
	return mo


def due_doses(branch, ward=None, hours_ahead=2):
	cond = {"branch": branch, "status": ["in", ["Scheduled", "Pending Approval", "Approved", "Held"]],
		"scheduled_at": ["<=", add_to_date(now_datetime(), hours=hours_ahead)]}
	rows = frappe.get_all("MAR Entry", filters=cond, fields=["name", "bed_allotment", "er_visit", "patient", "patient_name", "item", "item_name",
		"dose", "route", "qty_units", "scheduled_at", "status", "medication_order"], order_by="scheduled_at", limit=500)
	beds = {a.name: a for a in frappe.get_all("Bed Allotment", filters={"name": ["in", [r.bed_allotment for r in rows if r.bed_allotment] or [""]]},
		fields=["name", "bed", "ward", "status"])}
	out = []
	for r in rows:
		a = beds.get(r.bed_allotment)
		if a and a.status not in OPEN_STATES:
			continue
		if ward and (not a or a.ward != ward):
			continue
		r["bed"] = frappe.db.get_value("Hospital Bed", a.bed, "bed_no") if a else None
		r["ward"] = a.ward if a else "Emergency"
		r["overdue"] = get_datetime(r.scheduled_at) < add_to_date(now_datetime(), minutes=-30)
		out.append(r)
	return out


# ------------------------------------------------------------------ diet, procedures, consent
def order_diet(adm_name, diet_type, diet_date=None, meals=None, instructions=None):
	adm = get_open(adm_name)
	meals = meals or {"breakfast": 1, "lunch": 1, "dinner": 1}
	dt = frappe.get_cached_doc("Diet Type", diet_type)
	mode = setting("diet_billing_mode") or "Per day"
	n = sum(cint(meals.get(k)) for k in ("breakfast", "lunch", "dinner", "snacks"))
	charge = 0 if mode == "Included in bed charge" else flt(dt.per_meal_rate) * n if mode == "Per meal" else flt(dt.per_day_rate)
	do = frappe.get_doc({"doctype": "Diet Order", "bed_allotment": adm.name, "patient": adm.patient, "branch": adm.branch,
		"diet_date": diet_date or today(), "diet_type": diet_type, "status": "Ordered", "instructions": instructions, "charge": charge,
		**{k: cint(meals.get(k)) for k in ("breakfast", "lunch", "dinner", "snacks")}}).insert(ignore_permissions=True)
	if charge:
		ch = add_charge(charge_type="Diet", item_code=item_setting("diet_charge_item", "IPD-DIET"), qty=1, rate=charge,
			description=_("Diet · {0} · {1}").format(diet_type, do.diet_date), adm=adm.name, reference_doctype="Diet Order", reference_name=do.name)
		do.db_set("ipd_charge", ch.name)
	return do


def cancel_diet(name, reason):
	do = frappe.get_doc("Diet Order", name)
	if do.status != "Ordered":
		frappe.throw(_("This diet order is {0}.").format(do.status))
	if do.ipd_charge:
		cancel_charge(do.ipd_charge, reason)
	do.db_set("status", "Cancelled")
	return do


def schedule_procedure(*, procedure_type, scheduled_at=None, theatre=None, anesthesia=None, team=None, pre_auth=None, notes=None, adm=None,
	er_visit=None):
	src = frappe.get_doc("Bed Allotment", adm) if adm else frappe.get_doc("ER Visit", er_visit)
	check_branch(src.branch)
	pt = frappe.get_cached_doc("Procedure Type", procedure_type)
	if adm and pt.requires_preauth and src.payer_type == "Insurance":
		check_pre_auth("Insurance", src.payer, pre_auth or src.pre_auth, src.patient)
	pr = frappe.get_doc({"doctype": "IPD Procedure", "bed_allotment": adm, "er_visit": er_visit if not adm else src.er_visit, "patient": src.patient,
		"branch": src.branch, "procedure_type": procedure_type, "scheduled_at": scheduled_at or now_datetime(), "theatre": theatre or "Minor OT",
		"anesthesia": anesthesia or "Local", "status": "Scheduled", "pre_auth": pre_auth, "notes": notes, "procedure_fee": pt.price,
		"theatre_charge": pt.theatre_charge, "anesthesia_charge": pt.anesthesia_charge if (anesthesia or "Local") not in ("None", "Local") else 0,
		"team": team or []}).insert(ignore_permissions=True)
	return pr


def record_consent(*, patient, consent_type, signer_name, witness_name, signed_by="Patient", relation=None, witness_2=None, details=None,
	scanned_copy=None, procedure=None, adm=None, er_visit=None):
	branch = frappe.db.get_value("Bed Allotment", adm, "branch") if adm else frappe.db.get_value("ER Visit", er_visit, "branch")
	cf = frappe.get_doc({"doctype": "Consent Form", "bed_allotment": adm, "er_visit": er_visit, "patient": patient, "branch": branch,
		"consent_type": consent_type, "procedure": procedure, "signed_at": now_datetime(), "signed_by": signed_by, "signer_name": signer_name,
		"relation": relation, "witness_name": witness_name, "witness_2": witness_2, "details": details, "scanned_copy": scanned_copy})
	cf.insert(ignore_permissions=True)
	cf.submit()
	if procedure:
		frappe.db.set_value("IPD Procedure", procedure, "consent", cf.name)
	return cf


def procedure_status(name, status, reason=None, notes=None):
	pr = frappe.get_doc("IPD Procedure", name)
	check_branch(pr.branch)
	allowed = {"Scheduled": ("In Progress", "Completed", "Cancelled"), "In Progress": ("Completed", "Cancelled")}
	if status not in allowed.get(pr.status, ()):
		frappe.throw(_("A {0} procedure cannot become {1}.").format(pr.status.lower(), status.lower()))
	needs_consent = cint(frappe.get_cached_value("Procedure Type", pr.procedure_type, "requires_consent")) and cint(setting("enable_consent"))
	if status in ("In Progress", "Completed") and needs_consent and not pr.consent:
		frappe.throw(_("Record the signed consent before the procedure starts."), title=_("Consent required"))
	if status == "Cancelled" and not (reason or "").strip():
		frappe.throw(_("Enter the reason."))
	pr.status = status
	if notes:
		pr.notes = notes
	if status == "Cancelled":
		pr.cancel_reason = reason
	if status == "Completed":
		pr.completed_at = now_datetime()
		if setting("procedure_invoice_trigger") != "At discharge":
			ch = add_charge(charge_type="Procedure", item_code=procedure_item(pr.procedure_type), qty=1,
				rate=flt(pr.procedure_fee) + flt(pr.theatre_charge) + flt(pr.anesthesia_charge), description=pr.procedure_type,
				adm=pr.bed_allotment, er_visit=None if pr.bed_allotment else pr.er_visit, reference_doctype="IPD Procedure", reference_name=pr.name)
			pr.ipd_charge = ch.name
	pr.save(ignore_permissions=True)
	return pr


# ------------------------------------------------------------------ labs ordered for an admission / ER visit
def order_labs(tests, priority="Routine", doctor=None, adm=None, er_visit=None):
	from hospital_vvs.services import lab

	src = frappe.get_doc("Bed Allotment", adm) if adm else frappe.get_doc("ER Visit", er_visit)
	check_branch(src.branch)
	ti = lab.create_order(src.patient, tests, src.branch, referring_doctor=doctor or (src.admitting_doctor if adm else src.assigned_doctor),
		priority=priority)
	ti.db_set({"bed_allotment": adm, "er_visit": er_visit if not adm else src.er_visit, "bill_to_admission": 1, "status": "Paid",
		"expected_at": lab.expected_time(max((flt(r.tat_hours) for r in ti.items), default=24))})
	ti.reload()
	for r in ti.items:
		add_charge(charge_type="Lab", item_code=frappe.db.get_value("Lab Test Template", r.template, "item")
			or lab.ensure_template_item(frappe.get_doc("Lab Test Template", r.template)), qty=1, rate=r.price, description=r.template,
			adm=adm, er_visit=None if adm else er_visit, reference_doctype="Test Invoice", reference_name=ti.name)
	lab.make_samples(ti)
	publish("lab", {"action": "paid", "test_invoice": ti.name}, ti.branch)
	return ti


# ------------------------------------------------------------------ discharge
def clearance(adm_name):
	"""Checklist shown before the final bill and before the bed is released."""
	adm = frappe.get_doc("Bed Allotment", adm_name)
	summary_signed = bool(adm.discharge_summary and frappe.db.get_value("Discharge Summary", adm.discharge_summary, "docstatus") == 1)
	pending_labs = frappe.db.sql("""select ti.name, tii.template, tii.status from `tabTest Invoice Item` tii join `tabTest Invoice` ti on ti.name=tii.parent
		where ti.bed_allotment=%s and tii.status not in ('Released','Verified','Cancelled','Rejected','Report Received')""", adm.name, as_dict=True)
	undocumented = frappe.get_all("MAR Entry", filters={"bed_allotment": adm.name, "status": ["in", ["Scheduled", "Pending Approval", "Approved"]],
		"scheduled_at": ["<", now_datetime()]}, fields=["name", "item_name", "scheduled_at"])
	open_procs = frappe.get_all("IPD Procedure", filters={"bed_allotment": adm.name, "status": ["in", ["Scheduled", "In Progress"]]},
		fields=["name", "procedure_type", "status"])
	bill = running_bill(adm.name)
	expired = adm.discharge_type == "Expired"
	unpaid_rx = frappe.db.sql("""select si.name, si.grand_total from `tabSales Invoice` si join tabPrescription rx on rx.name=si.hv_prescription
		join `tabIPD Medication Order` mo on mo.prescription=rx.name where mo.bed_allotment=%s and si.docstatus=0""", adm.name, as_dict=True)
	checks = [
		{"key": "summary", "label": _("Discharge summary signed"), "ok": summary_signed},
		{"key": "labs", "label": _("No lab tests pending"), "ok": not pending_labs, "items": [f"{r.template} ({r.status})" for r in pending_labs]},
		{"key": "mar", "label": _("Every due dose charted"), "ok": not undocumented,
			"items": [f"{r.item_name} @ {str(r.scheduled_at)[:16]}" for r in undocumented]},
		{"key": "procedures", "label": _("No procedure left open"), "ok": not open_procs, "items": [f"{r.procedure_type} ({r.status})" for r in open_procs]},
		{"key": "bill", "label": _("Final bill made"), "ok": bool(adm.final_invoice)},
		{"key": "pharmacy", "label": _("Ward medicines paid at the pharmacy"), "ok": True, "warn": bool(unpaid_rx),
			"items": [f"{r.name}: {frappe.format_value(r.grand_total, 'Currency')}" for r in unpaid_rx], "info": True},
		{"key": "dues", "label": _("Patient dues cleared"), "ok": bool(adm.final_invoice) and (bill["balance"] <= 0.5 or expired),
			"amount": bill["balance"]},
	]
	return {"checks": checks, "hold": cint(setting("discharge_clearance_hold")), "bill": bill,
		"ready_for_bill": all(c["ok"] for c in checks if c["key"] in ("summary", "labs", "mar", "procedures")),
		"ready": all(c["ok"] for c in checks)}


def start_discharge(adm_name, discharge_type="Normal"):
	adm = get_open(adm_name)
	adm.db_set({"status": "Discharge Pending", "discharge_type": discharge_type})
	publish("ipd", {"action": "discharge_pending", "admission": adm.name}, adm.branch)
	return adm


def sign_summary(adm_name, data):
	adm = get_open(adm_name)
	if adm.discharge_summary and frappe.db.get_value("Discharge Summary", adm.discharge_summary, "docstatus") == 1:
		frappe.throw(_("The summary is already signed. Amend it to change it."))
	d = frappe.parse_json(data) if isinstance(data, str) else data
	dtype = d.get("discharge_type") or adm.discharge_type or "Normal"
	if dtype == "LAMA" and not d.get("lama_form"):
		frappe.throw(_("Attach the signed LAMA form."))
	if dtype == "Expired" and not d.get("death_datetime"):
		frappe.throw(_("Enter the date and time of death."))
	allowed = ("final_diagnosis", "treatment_summary", "procedures_done", "condition_at_discharge", "follow_up_plan", "follow_up_date", "referred_to",
		"lama_form", "death_datetime", "cause_of_death", "death_certificate_no")
	ds = frappe.get_doc({"doctype": "Discharge Summary", "bed_allotment": adm.name, "patient": adm.patient, "branch": adm.branch, "discharge_type": dtype,
		"doctor": d.get("doctor") or adm.admitting_doctor, "medicines": d.get("medicines") or [], **{k: d.get(k) for k in allowed if d.get(k)}})
	if dtype == "Expired":
		ds.condition_at_discharge = "Expired"
	ds.signed_at = now_datetime()
	ds.insert(ignore_permissions=True)
	ds.submit()
	adm.db_set({"discharge_summary": ds.name, "discharge_type": dtype, "status": "Discharge Pending"})
	return ds


def make_final_bill(adm_name, discount_amount=0, discount_authorization=None, override_reason=None):
	"""Write the computed lines as charges, issue at-discharge stock, then one invoice for the patient share (+ payer invoice)."""
	adm = get_open(adm_name)
	if adm.final_invoice:
		return adm.final_invoice
	cl = clearance(adm.name)
	if not cl["ready_for_bill"] and cint(setting("discharge_clearance_hold")):
		missing = [c["label"] for c in cl["checks"] if c["key"] in ("summary", "labs", "mar", "procedures") and not c["ok"]]
		if not (override_reason or "").strip():
			frappe.throw(_("Clearance hold: {0}").format(", ".join(missing)), title=_("Not ready for the final bill"))
		adm.db_set({"clearance_override": 1, "clearance_override_reason": override_reason, "clearance_override_by": frappe.session.user})
	until = now_datetime()
	adm.db_set("release_datetime", until)
	adm.reload()
	# at-discharge stock: doses given but not yet issued
	if setting("stock_deduction_timing") == "At discharge" and not pharmacy_bills():
		wh = ipd_warehouse(adm.branch)
		for m in frappe.get_all("MAR Entry", filters={"bed_allotment": adm.name, "status": "Administered", "stock_entry": ["is", "not set"]},
			fields=["name", "item", "qty_units"]):
			se = issue_stock(m.item, m.qty_units, wh, remarks=_("MAR {0} (at discharge)").format(m.name))
			frappe.db.set_value("MAR Entry", m.name, {"stock_entry": se, "batch_no": frappe.db.get_value("Stock Entry Detail", {"parent": se}, "batch_no") if se else None})
	for ln in computed_lines(adm, until):
		src = ln["source"] or ""
		ref_dt, ref_name = (("MAR Entry", src[4:]) if src.startswith("mar:") else ("IPD Procedure", src[5:]) if src.startswith("proc:")
			else ("Bed Allotment", adm.name))
		ch = frappe.get_doc({"doctype": "IPD Charge", "bed_allotment": adm.name, "patient": adm.patient, "branch": adm.branch,
			"charge_type": ln["charge_type"], "item_code": ln["item_code"], "description": ln["description"], "qty": ln["qty"], "rate": ln["rate"],
			"amount": ln["amount"], "posted_at": ln["posted_at"] or until, "posted_by": frappe.session.user, "reference_doctype": ref_dt,
			"reference_name": ref_name, "status": "Open"}).insert(ignore_permissions=True)
		if ref_dt == "MAR Entry":
			frappe.db.set_value("MAR Entry", ref_name, {"billed": 1, "ipd_charge": ch.name})
		elif ref_dt == "IPD Procedure":
			frappe.db.set_value("IPD Procedure", ref_name, "ipd_charge", ch.name)
	bill = running_bill(adm.name, until=until)
	if flt(discount_amount):
		discounts.assert_usable(discount_authorization, discount_amount)
		adm.db_set({"discount_amount": flt(discount_amount), "discount_authorization": discount_authorization})
		bill = running_bill(adm.name, until=until)
	customer = frappe.db.get_value("Patient", adm.patient, "customer")
	# invoice lines: billable part of each line, grouped by item + rate + type to keep the invoice short
	grouped = {}
	for ln in bill["lines"]:
		amount = ln["amount"] - ln["covered_amount"]
		if amount <= 0.004:
			continue
		qty = ln["qty"] if not ln["covered_amount"] else (amount / ln["rate"] if ln["rate"] else 1)
		key = (ln["item_code"], round(ln["rate"], 2), ln["charge_type"])
		g = grouped.setdefault(key, {"item_code": ln["item_code"], "rate": ln["rate"], "qty": 0, "description": ln["charge_type"] if ln["charge_type"] not in ("Package",) else ln["description"]})
		g["qty"] += qty
	lines = list(grouped.values()) or [{"item_code": item_setting("adhoc_charge_item", "IPD-ADHOC"), "rate": 0, "qty": 1}]
	net = bill["net"] - bill["discount"]
	fraction = (bill["patient_share"] / net) if net else 1

	def allocate(si):
		"""Only this admission's advances go on its bill."""
		mine = set(frappe.get_all("Payment Entry", filters={"hv_bed_allotment": adm.name, "docstatus": 1, "payment_type": "Receive",
			"hv_purpose": "Advance"}, pluck="name"))
		si.allocate_advances_automatically = 0
		if not mine:
			return
		si.set_advances()
		si.set("advances", [a for a in si.advances if a.reference_name in mine])
		left = flt(si.rounded_total or si.grand_total)
		for a in si.advances:
			a.allocated_amount = min(flt(a.advance_amount), left)
			left -= a.allocated_amount
		si.set("advances", [a for a in si.advances if flt(a.allocated_amount) > 0])
		si.calculate_taxes_and_totals()

	inv = billing.create_invoice(customer=customer, patient=adm.patient, lines=billing.split_lines(lines, fraction) if bill["payer_share"] else lines,
		billing_type="IPD Slip", branch=adm.branch, reference_doctype="Bed Allotment", reference_name=adm.name,
		discount_amount=flt(bill["discount"]) * fraction, pos=False, remarks=_("Final bill · admission {0}").format(adm.name), prepare=allocate)
	payer_inv = None
	if bill["payer_share"]:
		payer_inv = billing.create_invoice(customer=adm.payer, patient=adm.patient, lines=billing.split_lines(lines, 1 - fraction), billing_type="IPD Slip",
			branch=adm.branch, reference_doctype="Bed Allotment", reference_name=adm.name, pos=False, payer=True, payer_share_of=inv,
			discount_amount=flt(bill["discount"]) * (1 - fraction), remarks=_("{0} share · admission {1}").format(adm.payer_type, adm.name))
	frappe.db.sql("update `tabIPD Charge` set status='Billed', sales_invoice=%s where bed_allotment=%s and status='Open'", (inv, adm.name))
	adm.db_set({"final_invoice": inv, "payer_invoice": payer_inv, "status": "Discharge Pending", "charges_total": bill["gross"]})
	if discount_authorization:
		discounts.mark_used(discount_authorization, "Bed Allotment", adm.name)
	publish("ipd", {"action": "billed", "admission": adm.name}, adm.branch)
	return inv


def cancel_final_bill(adm_name, reason):
	adm = get_open(adm_name)
	if not adm.final_invoice:
		frappe.throw(_("There is no final bill."))
	if not (reason or "").strip():
		frappe.throw(_("Enter the reason."))
	for inv in (adm.payer_invoice, adm.final_invoice):
		if inv:
			si = frappe.get_doc("Sales Invoice", inv)
			if frappe.db.exists("Payment Entry Reference", {"reference_name": inv, "docstatus": 1, "parenttype": "Payment Entry"}):
				frappe.throw(_("A payment is already allocated to {0}. Cancel that payment first.").format(inv))
			si.flags.hv_cancel = True
			si.flags.ignore_permissions = True
			si.cancel()
	# computed lines (bed, nursing …) are rebuilt on the next bill; real charges reopen
	frappe.db.sql("""delete from `tabIPD Charge` where bed_allotment=%s and status='Billed' and reference_doctype='Bed Allotment'""", adm.name)
	frappe.db.sql("update `tabIPD Charge` set status='Open', sales_invoice=null where bed_allotment=%s and status='Billed'", adm.name)
	adm.db_set({"final_invoice": None, "payer_invoice": None, "release_datetime": None})
	frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Bed Allotment", "reference_name": adm.name,
		"content": _("Final bill cancelled: {0}").format(reason)}).insert(ignore_permissions=True)
	return adm


def complete_discharge(adm_name, override_reason=None):
	adm = get_open(adm_name)
	if not adm.final_invoice:
		frappe.throw(_("Make the final bill first."))
	cl = clearance(adm.name)
	if not cl["ready"] and cint(setting("discharge_clearance_hold")):
		missing = [c["label"] for c in cl["checks"] if not c["ok"]]
		if not (override_reason or "").strip():
			frappe.throw(_("Clearance hold: {0}").format(", ".join(missing)), title=_("Discharge on hold"))
		adm.db_set({"clearance_override": 1, "clearance_override_reason": override_reason, "clearance_override_by": frappe.session.user})
	release = adm.release_datetime or now_datetime()
	adm.segments[-1].to_time = release
	adm.status = "Discharged"
	adm.save(ignore_permissions=True)
	from hospital_vvs.api.ward import _set

	bed = frappe.db.get_value("Hospital Bed", adm.bed, ["status", "current_patient"], as_dict=True)
	if bed.status == "Occupied" and bed.current_patient == adm.patient:
		_set(adm.bed, "Cleaning", _("{0} discharge · {1}").format(adm.discharge_type or "Normal", adm.name))
	if adm.comms_profile:
		frappe.db.set_value("Patient Comms Profile", adm.comms_profile, {"active": 0, "deactivated_on": now_datetime()})
	frappe.db.sql("update `tabIPD Medication Order` set status='Completed' where bed_allotment=%s and status='Active'", adm.name)
	frappe.db.sql("""update `tabMAR Entry` set status='Cancelled', reason='Discharged' where bed_allotment=%s
		and status in ('Scheduled','Pending Approval','Approved')""", adm.name)
	if adm.discharge_type != "Expired" and cint(setting("enable_feedback")) and frappe.db.exists("Message Template", {"event": "ipd_feedback"}):
		from hospital_vvs.services import messaging

		messaging.send("ipd_feedback", patient=adm.patient, reference_doctype="Bed Allotment", reference_name=adm.name, context={"ref": adm.name})
	publish("ipd", {"action": "discharged", "admission": adm.name}, adm.branch)
	return adm


# ------------------------------------------------------------------ payments (advance / settlement / refund) in the cashier shift
def take_payment(amount, payment_mode="Cash", purpose="Advance", adm=None, er_visit=None, reference=None, cash_tendered=None):
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account
	from hospital_vvs.services.shifts import billing_shift

	src = frappe.get_doc("Bed Allotment", adm) if adm else frappe.get_doc("ER Visit", er_visit)
	check_branch(src.branch)
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Enter an amount."))
	shift = billing_shift(src.branch)
	company = branch_company(src.branch)
	customer = frappe.db.get_value("Patient", src.patient, "customer")
	account = get_bank_cash_account(payment_mode, company).get("account")
	invoice = reference or (src.final_invoice if adm else src.sales_invoice)
	if purpose == "Refund":
		bill = running_bill(adm, er_visit)
		if amount > bill["credit"] + 0.5:
			frappe.throw(_("Only {0} can be refunded.").format(frappe.format_value(bill["credit"], "Currency")))
		pe = frappe.new_doc("Payment Entry")
		pe.update({"payment_type": "Pay", "party_type": "Customer", "party": customer, "company": company, "paid_from": account,
			"paid_to": frappe.db.get_value("Company", company, "default_receivable_account"), "paid_amount": amount, "received_amount": amount})
	elif purpose == "Settlement" and invoice and flt(frappe.db.get_value("Sales Invoice", invoice, "outstanding_amount")) > 0:
		out = flt(frappe.db.get_value("Sales Invoice", invoice, "outstanding_amount"))
		amount = min(amount, out)
		pe = get_payment_entry("Sales Invoice", invoice, party_amount=amount)
		pe.paid_to = account
		pe.paid_amount = pe.received_amount = amount
		for r in pe.references:
			r.allocated_amount = amount
	else:
		purpose = "Advance"
		pe = frappe.new_doc("Payment Entry")
		pe.update({"payment_type": "Receive", "party_type": "Customer", "party": customer, "company": company, "paid_to": account,
			"paid_from": frappe.db.get_value("Company", company, "default_receivable_account"), "paid_amount": amount, "received_amount": amount})
	pe.update({"mode_of_payment": payment_mode, "posting_date": today(), "branch": src.branch, "reference_no": src.name if payment_mode != "Cash" else None,
		"reference_date": today() if payment_mode != "Cash" else None, "hv_patient": src.patient, "hv_bed_allotment": adm,
		"hv_er_visit": er_visit if not adm else src.er_visit, "hv_shift": shift.name if shift else None, "hv_counter": shift.hv_counter if shift else None,
		"hv_purpose": purpose, "remarks": _("{0} · {1}").format(purpose, src.name)})
	if payment_mode != "Cash" and not pe.reference_no:
		pe.reference_no, pe.reference_date = src.name, today()
	pe.setup_party_account_field()
	pe.set_missing_values()
	pe.set_amounts()
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	if adm:
		frappe.db.set_value("Bed Allotment", adm, "advance_total", payments(adm)[1])
	publish("ipd", {"action": "payment", "admission": adm, "er_visit": er_visit}, src.branch)
	change = max(flt(cash_tendered) - amount, 0) if cash_tendered else 0
	return {"payment_entry": pe.name, "amount": amount, "purpose": purpose, "change": change}


def adopt_occupied_beds():
	"""Beds occupied before admissions existed (Phase 1 quick allot) get an admission record, so billing and discharge work for them."""
	made = []
	for b in frappe.get_all("Hospital Bed", filters={"status": "Occupied", "current_patient": ["is", "set"]}, fields=["name", "current_patient",
		"occupied_since", "attending_doctor", "expected_discharge", "agreed_rate", "admission_reason", "branch", "ward"]):
		if open_admission(b.current_patient) or frappe.db.exists("ER Visit", {"bay": b.name, "status": ["!=", "Disposed"]}):
			continue
		if frappe.db.get_value("Ward", b.ward, "ward_type") == "Emergency":
			continue
		doctor = b.attending_doctor or frappe.db.get_value("Doctor", {"is_active": 1, "doctor_type": ["!=", "External Referring"]})
		ward, wtype, rate, icu, _n = ward_rates(b.name)
		since = b.occupied_since or now_datetime()
		pat = frappe.db.get_value("Patient", b.current_patient, ["category", "panel", "insurance_provider"], as_dict=True) or {}
		payer_type = pat.get("category") if pat.get("category") in ("Panel",) else "Patient"
		adm = frappe.get_doc({"doctype": "Bed Allotment", "patient": b.current_patient, "branch": b.branch, "status": "Admitted", "admit_datetime": since,
			"expected_discharge": b.expected_discharge or add_to_date(since, days=1), "bed": b.name, "ward": ward, "admitting_doctor": doctor,
			"source": "Direct", "reason": b.admission_reason, "payer_type": payer_type, "payer": pat.get("panel") if payer_type == "Panel" else None,
			"daily_rate": flt(b.agreed_rate) or None, "segments": [{"bed": b.name, "ward": ward, "ward_type": wtype, "from_time": since,
			"daily_rate": flt(b.agreed_rate) or rate, "icu_surcharge": icu, "reason": _("Admission")}]})
		adm.insert(ignore_permissions=True)
		make_comms_profile(adm)
		made.append(adm.name)
	return made
