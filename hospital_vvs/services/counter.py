"""Reception counter (Restaurant OS-style POS): one cart for everything a receptionist collects, one Counter Receipt per sale.

Lines and the documents they become (each in the receptionist's cashier shift):
- Consultation (per doctor) → OPD Slip (token + queue; free follow-up and panel split as usual)
- Lab                       → Test Invoice, paid (samples created)
- Service                   → one General Sales Invoice for all service lines
- IPD Advance / Settlement  → Payment Entry on the admission (services/ipd.take_payment)
- Online Fee                → online visit fee (services/online_visit.verify_fee)
- Dues                      → Payment Entry against an unpaid hospital invoice
The tenders (Cash / Bank Transfer / JazzCash / Easypaisa …) are spread over those documents in order; change comes only out of cash.
A sale rung up offline carries a client_ref and is posted once when it syncs (DECISIONS D-39).
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime, today

from hospital_vvs.services import billing, discounts
from hospital_vvs.utils import branch_company, check_branch, default_branch, publish, setting, settings

CHARGE_KINDS = ("Consultation", "Lab", "Service")
IMAGING = ("Imaging", "Imaging Order")  # D-98: X-ray / ultrasound / Doppler / MRI / CT — billed with the services, creates / pays the Imaging Study


DIALYSIS = ("Dialysis", "Dialysis Package")  # D-99: dialysis session (paid / package / panel credit) and package sale — billed with the services


def _group(kind):
	return "Service" if kind in IMAGING or kind in DIALYSIS else kind


def _dialysis_rate(ln):
	"""Server price of a dialysis line: the session's own charge, or the package item price. Package / panel-credit sessions cost 0 at the counter."""
	from hospital_vvs.services import dialysis as dz

	if ln.get("kind") == "Dialysis Package":
		return dz.session_rate_item(ln["item_code"])
	return flt(frappe.db.get_value("Dialysis Session", ln["target"], "amount"))


def _dialysis_paid_by(ln):
	return "Package" if cint(ln.get("use_package")) else ("Panel credit" if cint(ln.get("credit")) else "Paid")


def pending_dialysis(patient):
	"""Unpaid dialysis sessions (today + 14 days) and the package balance — one click into the cart."""
	from hospital_vvs.services import dialysis as dz

	dp = frappe.db.get_value("Dialysis Patient", {"patient": patient, "status": ["in", ["Active", "Paused"]]}, "name") if patient else None
	if not dp:
		return None
	doc = frappe.get_doc("Dialysis Patient", dp)
	rows = frappe.get_all("Dialysis Session", filters={"dialysis_patient": dp, "payment_status": "Unpaid", "status": ["in", ["Scheduled", "Checked-in", "In Session", "Completed"]],
		"session_date": ["between", [frappe.utils.add_days(today(), -30), frappe.utils.add_days(today(), 14)]]},
		fields=["name", "session_date", "shift", "station", "status", "session_type", "amount"], order_by="session_date", limit=12)
	for r in rows:
		r["session_date"] = str(r.session_date)
	return {"dialysis_patient": dp, "patient_name": doc.patient_name, "payer": doc.payer, "panel_ref": doc.panel_ref, "zone": doc.zone, "sessions": rows,
		"package": dz.package_balance(doc), "packages": [{"item_code": c, "item_name": n, "sessions": dz.PACKAGES[c], "rate": dz.session_rate_item(c)} for c, n, _r in dz.ITEMS if c in dz.PACKAGES]}


def _imaging_rate(ln):
	"""Imaging line price from the catalogue (+ contrast / urgent surcharge) or the booked study's amount."""
	if ln.get("kind") == "Imaging Order":
		return flt(frappe.db.get_value("Imaging Study", ln["target"], "amount"))
	p = frappe.get_cached_doc("Imaging Procedure", ln["procedure"])
	return flt(p.price) + (flt(p.contrast_surcharge) if (p.contrast == "Yes" or (p.contrast == "Optional" and cint(ln.get("contrast")))) else 0) \
		+ (flt(p.urgent_surcharge) if cint(ln.get("urgent")) else 0)


def unpaid_imaging(patient):
	"""Booked / ordered imaging not paid yet — pulled into the cart with one click."""
	if not patient:
		return []
	rows = frappe.get_all("Imaging Study", filters={"patient": patient, "payment_status": ["in", ["Unpaid"]], "status": ["in", ["Booked", "Registered"]]},
		fields=["name", "booking_ref", "procedure", "procedure_name", "modality", "scheduled_date", "slot_time", "amount", "safety_status"], order_by="scheduled_date")
	for r in rows:
		r["scheduled_date"] = str(r.scheduled_date)
		r["slot_time"] = str(r.slot_time or "")[:5]
	return rows
MONEY_KINDS = ("IPD Advance", "IPD Settlement", "Online Fee", "Dues")
# D-60: a lab order made in the lab (unpaid) is collected here; its receipt lines are ordinary Lab lines (refunds work the same)
LAB_ORDER = "Lab Order"
GROUP_BT = {"Consultation": "OPD Slip", "Lab": "Lab", "Service": "General"}
EXCLUDED_ITEMS = ("IPD-", "ER-FEE", "OV-CONSULT", "PKG-", "REG-FEE", "DIA-PKG-", "DIA-HD-")  # dialysis sessions / packages have their own lines


def hospital_company():
	return setting("company") or branch_company(default_branch())


# ------------------------------------------------------------------ catalogue
def catalogue(branch):
	s = settings()
	doctors = frappe.get_all("Doctor", filters={"is_active": 1, "doctor_type": ["!=", "External Referring"]}, fields=["name", "doctor_name",
		"doctor_name_ur", "specialization", "default_fee", "follow_up_fee", "consultation_room", "color", "photo", "branch"], order_by="doctor_name")
	doctors = [d for d in doctors if not d.branch or d.branch == branch]
	counts = {r.doctor: r for r in frappe.db.sql("""select doctor, count(*) total, sum(status='Waiting') waiting from `tabQueue Entry`
		where queue_date=%s and branch=%s group by doctor""", (today(), branch), as_dict=True)}
	for d in doctors:
		d["fee"] = flt(d.default_fee) or flt(s.default_fee)
		d["waiting"] = cint((counts.get(d.name) or {}).get("waiting"))
	items = frappe.get_all("Item", filters={"item_group": "Medical Services", "disabled": 0}, fields=["name as item_code", "item_name", "hv_billing_type",
		"standard_rate"], order_by="item_name")
	cons = {s.consultation_item, s.follow_up_item}
	services = []
	for it in items:
		if it.item_code in cons or it.item_code.startswith(EXCLUDED_ITEMS):
			continue
		it["rate"] = flt(frappe.db.get_value("Item Price", {"item_code": it.item_code, "selling": 1}, "price_list_rate")) or flt(it.standard_rate)
		it["category"] = "Dialysis / Nephrology" if it.item_code.startswith("DIA-") else None
		services.append(it)
	labs = frappe.get_all("Lab Test Template", filters={"is_active": 1}, fields=["name", "test_code", "department", "price", "sample_type", "tat_hours"],
		order_by="department, name")
	imaging = frappe.get_all("Imaging Procedure", filters={"is_active": 1}, fields=["name", "procedure_name", "code", "modality", "category", "price", "contrast",
		"contrast_surcharge", "urgent_surcharge", "walk_in", "duration_min", "tat_hours"], order_by="modality, sort_order, procedure_name")
	return {"doctors": doctors, "services": services, "labs": labs, "imaging": imaging}


def modes_for(counter):
	from hospital_vvs.services.shifts import ensure_counter_profile

	profile = ensure_counter_profile(counter)
	return [p.mode_of_payment for p in frappe.get_cached_doc("POS Profile", profile).payments]


def patient_panel(patient):
	"""What else this patient owes or can pay at the counter."""
	from hospital_vvs.services import ipd

	p = frappe.db.get_value("Patient", patient, ["name", "patient_name", "patient_name_ur", "gender", "dob", "phone", "category", "panel",
		"insurance_provider", "photo", "customer", "temporary_record"], as_dict=True)
	if not p:
		frappe.throw(_("Patient {0} not found.").format(patient))
	from hospital_vvs.api.patients import age_of

	p["age"] = age_of(p.dob)
	adm = ipd.open_admission(patient)
	admission = None
	if adm:
		b = ipd.running_bill(adm)
		a = frappe.db.get_value("Bed Allotment", adm, ["name", "ward", "bed", "status", "final_invoice", "payer_type"], as_dict=True)
		admission = dict(a, bed_no=frappe.db.get_value("Hospital Bed", a.bed, "bed_no"), running=b["patient_share"], advances=b["advances"],
			balance=b["balance"], outstanding=flt(frappe.db.get_value("Sales Invoice", a.final_invoice, "outstanding_amount")) if a.final_invoice else 0)
	online = frappe.get_all("Online Visit Request", filters={"patient": patient, "status": ["in", ["Pending", "Accepted"]], "fee_status": ["in", ["Unpaid", "Proof Submitted"]]},
		fields=["name", "fee", "fee_status", "payment_method", "payment_reference", "status"])
	dues = frappe.db.sql("""select si.name, si.posting_date, si.hv_billing_type, si.grand_total, si.outstanding_amount from `tabSales Invoice` si
		where si.customer=%s and si.docstatus=1 and si.outstanding_amount > 0 and si.company=%s and si.is_return=0
		and ifnull(si.hv_reference_doctype,'')!='Bed Allotment' order by si.posting_date""", (p.customer, hospital_company()), as_dict=True) if p.customer else []
	recent = frappe.get_all("Counter Receipt", filters={"patient": patient}, fields=["name", "posted_at", "patient_total", "status"], order_by="posted_at desc", limit=5)
	return {"patient": p, "admission": admission, "online": online, "dues": dues, "recent": recent, "lab_orders": unpaid_lab_orders(patient=patient)}


def unpaid_lab_orders(patient=None, branch=None, limit=50):
	"""Lab orders waiting for payment at reception (made in the lab, or saved without payment)."""
	f = {"status": ["in", ["Ordered", "Draft"]], "docstatus": ["<", 2], "bill_to_admission": 0, "er_visit": ["in", ["", None]]}
	if patient:
		f["patient"] = patient
	if branch:
		f["branch"] = branch
	meta = frappe.get_meta("Test Invoice")
	for k in ("bill_to_admission", "er_visit"):
		if not meta.has_field(k):
			f.pop(k, None)
	rows = frappe.get_all("Test Invoice", filters=f, fields=["name", "patient", "patient_name", "gross_total", "patient_share", "payer_share", "priority", "owner",
		"creation", "referring_doctor"], order_by="creation asc", limit=limit)
	for r in rows:
		r["tests"] = frappe.get_all("Test Invoice Item", filters={"parent": r.name}, pluck="template")
		r["ordered_by"] = frappe.db.get_value("User", r.owner, "full_name")
	return rows


def _lab_order(name, discount=0):
	ti = frappe.get_doc("Test Invoice", name)
	if ti.status not in ("Ordered", "Draft"):
		frappe.throw(_("Lab order {0} is already {1}.").format(name, ti.status))
	ti.discount_amount = flt(discount)
	ti.run_method("validate")
	return ti


# ------------------------------------------------------------------ pricing (server is the source of truth)
def _opd(patient, doctor, branch, discount=0, auth=None, mode="Cash"):
	from hospital_vvs.api.opd import _build

	doc = _build({"patient": patient, "doctor": doctor, "branch": branch, "purpose": "Consultation", "discount_amount": flt(discount),
		"discount_authorization": auth, "payment_mode": mode})
	doc.posting_date = today()
	doc.run_method("validate")
	return doc


def _service_rate(item_code):
	return flt(frappe.db.get_value("Item Price", {"item_code": item_code, "selling": 1}, "price_list_rate")) or flt(frappe.db.get_value("Item", item_code, "standard_rate"))


def price(data):
	"""Price every line as the server will post it (free follow-ups, panel share, current fees)."""
	d = frappe.parse_json(data) if isinstance(data, str) else data
	patient, branch = d.get("patient"), d.get("branch") or default_branch()
	out, payer = [], 0.0
	for ln in d.get("lines") or []:
		kind, disc = ln.get("kind"), flt(ln.get("discount"))
		row = dict(ln)
		if kind == "Consultation":
			if patient:
				slip = _opd(patient, ln["doctor"], branch, disc)
				row.update(rate=flt(slip.gross_total), amount=flt(slip.patient_share), payer_share=flt(slip.payer_share), free=cint(slip.is_free_follow_up),
					label=_("Consultation · {0}").format(frappe.db.get_value("Doctor", ln["doctor"], "doctor_name")) + (_(" · free follow-up") if slip.is_free_follow_up else ""))
				payer += flt(slip.payer_share)
			else:
				fee = flt(frappe.db.get_value("Doctor", ln["doctor"], "default_fee")) or flt(setting("default_fee"))
				row.update(rate=fee, amount=max(fee - disc, 0))
		elif kind == "Lab":
			r = flt(frappe.db.get_value("Lab Test Template", ln["template"], "price"))
			row.update(rate=r, amount=max(r - disc, 0))
		elif kind == LAB_ORDER:
			ti = _lab_order(ln["target"], disc)
			row.update(rate=flt(ti.gross_total), amount=flt(ti.patient_share), payer_share=flt(ti.payer_share),
				label=_("Lab order {0} · {1}").format(ti.name, ", ".join(r.template for r in ti.items)))
			payer += flt(ti.payer_share)
		elif kind == "Service":
			r = _service_rate(ln["item_code"])
			row.update(rate=r, amount=max(r * (flt(ln.get("qty")) or 1) - disc, 0))
		elif kind in IMAGING:
			r = _imaging_rate(ln)
			row.update(rate=r, amount=max(r - disc, 0))
		elif kind in DIALYSIS:
			r = _dialysis_rate(ln)
			free = kind == "Dialysis" and _dialysis_paid_by(ln) != "Paid"
			row.update(rate=r, amount=0 if free else max(r - disc, 0))
		elif kind == "Online Fee":
			row.update(amount=flt(frappe.db.get_value("Online Visit Request", ln["target"], "fee")))
		else:
			row.update(amount=flt(ln.get("amount")))
		out.append(row)
	total = sum(flt(r["amount"]) for r in out)
	return {"lines": out, "total": total, "payer_share": payer}


def request_discounts(data):
	"""One authorization per charge group with a discount (OPD Slip / Lab / General limits). Within limit = usable at once."""
	d = frappe.parse_json(data) if isinstance(data, str) else data
	priced = price(d)["lines"]
	out = {}
	for r in [x for x in priced if x.get("kind") == LAB_ORDER and flt(x.get("discount"))]:  # one authorization per lab order
		a = discounts.request(billing_type="Lab", gross=flt(r["rate"]), discount_amount=flt(r["discount"]), reason=d.get("discount_reason"),
			branch=d.get("branch"), patient=d.get("patient"), reference_doctype="Test Invoice", reference_name=r["target"])
		out[f"LabOrder:{r['target']}"] = {"name": a.name, "status": a.status, "percent": a.discount_percent}
	for kind in CHARGE_KINDS:
		rows = [r for r in priced if _group(r.get("kind")) == kind and flt(r.get("discount"))]
		if not rows:
			continue
		disc = sum(flt(r["discount"]) for r in rows)
		gross = sum(flt(r.get("rate")) * (flt(r.get("qty")) or 1) for r in priced if _group(r.get("kind")) == kind)
		if kind == "Consultation":  # one slip per doctor: one authorization per doctor line
			for r in rows:
				a = discounts.request(billing_type="OPD Slip", gross=flt(r["rate"]), discount_amount=flt(r["discount"]),
					reason=d.get("discount_reason"), branch=d.get("branch"), patient=d.get("patient"))
				out[f"Consultation:{r['doctor']}"] = {"name": a.name, "status": a.status, "percent": a.discount_percent}
			continue
		a = discounts.request(billing_type=GROUP_BT[kind], gross=gross, discount_amount=disc, reason=d.get("discount_reason"), branch=d.get("branch"),
			patient=d.get("patient"))
		out[kind] = {"name": a.name, "status": a.status, "percent": a.discount_percent}
	return out


# ------------------------------------------------------------------ checkout
def _ensure_patient(d, branch):
	if d.get("patient"):
		return d["patient"]
	n = d.get("new_patient") or {}
	if not (n.get("patient_name") or "").strip() or not n.get("gender"):
		frappe.throw(_("Choose the patient or enter a new patient's name and sex."))
	from hospital_vvs.hospital_vvs.doctype.patient.patient import dob_from_age

	p = frappe.get_doc({"doctype": "Patient", "patient_name": n["patient_name"].strip(), "gender": n["gender"], "phone": n.get("phone"), "branch": branch,
		"dob": dob_from_age(n["age"]) if cint(n.get("age")) else None, "dob_estimated": 1 if cint(n.get("age")) else 0,
		"duplicate_reason": _("Registered at the reception counter{0}").format(_(" (offline)") if d.get("offline") else "")})
	p.insert(ignore_permissions=True)
	return p.name


class Tenders:
	"""Hand out the paid amounts to each document in turn (change is taken off cash first)."""

	def __init__(self, tenders, total):
		self.rows = [dict(t, amount=flt(t.get("amount"))) for t in tenders if flt(t.get("amount")) > 0]
		paid = sum(t["amount"] for t in self.rows)
		if paid + 0.5 < total:
			frappe.throw(_("Paid {0} is less than the total {1}.").format(frappe.format_value(paid, "Currency"), frappe.format_value(total, "Currency")))
		self.change = max(round(paid - total, 2), 0)
		cash = sum(t["amount"] for t in self.rows if t["mode_of_payment"] == "Cash")
		if self.change > cash + 0.01:
			frappe.throw(_("Only cash can be given back as change. Lower the card / wallet / bank amount."))
		left = self.change
		for t in self.rows:
			if t["mode_of_payment"] == "Cash" and left:
				take = min(t["amount"], left)
				t["amount"] -= take
				left -= take
		self.rows = [t for t in self.rows if t["amount"] > 0.004]
		self.paid = paid

	def take(self, amount):
		out, need = [], round(flt(amount), 2)
		for t in self.rows:
			if need <= 0.004:
				break
			part = min(t["amount"], need)
			if part > 0.004:
				out.append({"mode_of_payment": t["mode_of_payment"], "amount": round(part, 2), "reference_no": t.get("reference_no")})
				t["amount"] -= part
				need -= part
		return out


def _settle_invoice(invoice, slices, patient, branch, purpose="Dues"):
	"""Payment Entry per tender against an unpaid hospital invoice, tagged with the collector's shift."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account
	from hospital_vvs.services.shifts import billing_shift

	shift = billing_shift(branch)
	names = []
	for sl in slices:
		pe = get_payment_entry("Sales Invoice", invoice, party_amount=sl["amount"])
		company = pe.company
		pe.mode_of_payment = sl["mode_of_payment"]
		pe.paid_to = get_bank_cash_account(sl["mode_of_payment"], company).get("account") or pe.paid_to
		pe.paid_amount = pe.received_amount = sl["amount"]
		for r in pe.references:
			r.allocated_amount = sl["amount"]
		pe.reference_no = sl.get("reference_no") or (invoice if sl["mode_of_payment"] != "Cash" else None)
		pe.reference_date = today() if pe.reference_no else None
		pe.update({"hv_patient": patient, "hv_shift": shift.name if shift else None, "hv_counter": shift.hv_counter if shift else None, "hv_purpose": "Settlement",
			"remarks": _("{0} · {1}").format(purpose, invoice)})
		pe.flags.ignore_permissions = True
		pe.insert()
		pe.submit()
		names.append(pe.name)
	return names


def checkout(data, counter=None):
	d = frappe.parse_json(data) if isinstance(data, str) else data
	if d.get("client_ref"):
		done = frappe.db.get_value("Counter Receipt", {"client_ref": d["client_ref"]}, "name")
		if done:
			return receipt_data(done)
	branch = d.get("branch") or default_branch()
	check_branch(branch)
	lines = d.get("lines") or []
	if not lines:
		frappe.throw(_("The cart is empty."))
	from hospital_vvs.services import ipd, lab, online_visit
	from hospital_vvs.services.shifts import billing_shift

	shift = billing_shift(branch)
	counter = counter or (shift.hv_counter if shift else d.get("counter"))
	patient = _ensure_patient(d, branch)
	auths = d.get("auths") or {}
	tenders = d.get("tenders") or []
	first_mode = (tenders[0].get("mode_of_payment") if tenders else None) or "Cash"

	# 1. price and validate every group before anything is posted
	slips = []
	for ln in [x for x in lines if x.get("kind") == "Consultation"]:
		key = f"Consultation:{ln['doctor']}"
		slip = _opd(patient, ln["doctor"], branch, flt(ln.get("discount")), (auths.get(key) or {}).get("name") if isinstance(auths.get(key), dict) else auths.get(key), first_mode)
		slips.append((ln, slip))
	lab_lines = [x for x in lines if x.get("kind") == "Lab"]
	ti = None
	if lab_lines:
		ti = lab.create_order(patient, [x["template"] for x in lab_lines], branch, referring_doctor=d.get("referring_doctor"),
			priority="Urgent" if cint(d.get("lab_urgent")) else "Normal")
		ti.discount_amount = sum(flt(x.get("discount")) for x in lab_lines)
		ti.run_method("validate")
	lab_orders = [(x, _lab_order(x["target"], flt(x.get("discount")))) for x in lines if x.get("kind") == LAB_ORDER]
	svc_lines = [x for x in lines if x.get("kind") == "Service"]
	svc_rows = [{"item_code": x["item_code"], "qty": flt(x.get("qty")) or 1, "rate": _service_rate(x["item_code"])} for x in svc_lines]
	# imaging: a walk-in study is created now (or the booked one is used); its item joins the services invoice (D-98)
	from hospital_vvs.services import radiology as rad

	img = []
	for x in [y for y in lines if y.get("kind") in IMAGING]:
		if x["kind"] == "Imaging Order":
			st = frappe.get_doc("Imaging Study", x["target"])
			if st.payment_status != "Unpaid" or st.status not in ("Booked", "Registered"):
				frappe.throw(_("{0} is already {1}.").format(st.booking_ref, st.payment_status if st.payment_status != "Unpaid" else st.status))
		else:
			pa = frappe.db.get_value("Patient", patient, ["patient_name", "gender", "phone", "dob"], as_dict=True)
			from hospital_vvs.api.patients import age_of

			st = rad.book({"procedure": x["procedure"], "patient": patient, "patient_name": pa.patient_name, "gender": pa.gender, "phone": pa.phone, "age": age_of(pa.dob),
				"date": today(), "walk_in": 1, "priority": "Urgent" if cint(x.get("urgent")) else "Routine", "contrast_requested": cint(x.get("contrast")),
				"urgent": cint(x.get("urgent")), "referring_doctor": d.get("referring_doctor"), "external_referrer": d.get("external_referrer"),
				"payment_option": "Pay at counter"}, source="Walk-in", staff=True)
		pr = rad.proc(st.procedure)
		img.append((x, st, {"item_code": rad.ensure_item(pr), "qty": 1, "rate": _imaging_rate(x if x["kind"] == "Imaging" else dict(x, target=st.name)),
			"description": pr.procedure_name}))
	svc_rows += [r for _x, _s, r in img]
	# dialysis (D-99): sessions paid in cash join the services invoice; package / panel-credit sessions are recorded at 0; packages are sold as items
	from hospital_vvs.services import dialysis as dz

	dia = []
	for x in [y for y in lines if y.get("kind") in DIALYSIS]:
		if x["kind"] == "Dialysis":
			ses = frappe.get_doc("Dialysis Session", x["target"])
			if ses.payment_status != "Unpaid" or ses.status in ("Cancelled", "Missed"):
				frappe.throw(_("Dialysis session {0} is already {1}.").format(ses.name, ses.payment_status if ses.payment_status != "Unpaid" else ses.status))
			if frappe.db.get_value("Dialysis Patient", ses.dialysis_patient, "patient") != patient:
				frappe.throw(_("Session {0} belongs to another patient.").format(ses.name))
			via = _dialysis_paid_by(x)
			if via == "Package" and not any(y.get("kind") == "Dialysis Package" for y in lines) and dz.package_balance(frappe.get_doc("Dialysis Patient", ses.dialysis_patient))["remaining"] <= 0:
				frappe.throw(_("No package sessions left — sell a package or collect the session fee."))
			if via == "Panel credit" and not frappe.db.get_value("Dialysis Patient", ses.dialysis_patient, "panel_ref"):
				frappe.throw(_("Panel / Sehat Card credit needs the approval reference on the dialysis profile."))
			code = dz.SESSION_ITEM.get(ses.session_type, "DIA-HD-SESSION")
			dia.append((x, ses, via, {"item_code": code, "qty": 1, "rate": flt(ses.amount), "description": f"{frappe.db.get_value('Item', code, 'item_name')} · {ses.session_date} {ses.shift}"} if via == "Paid" else None))
		else:
			if x.get("item_code") not in dz.PACKAGES:
				frappe.throw(_("Choose a dialysis package."))
			dpn = frappe.db.get_value("Dialysis Patient", {"patient": patient, "status": ["in", ["Active", "Paused"]]}, "name")
			if not dpn:
				frappe.throw(_("Register the patient in the dialysis unit before selling a package."))
			dia.append((x, dpn, "Package sale", {"item_code": x["item_code"], "qty": 1, "rate": dz.session_rate_item(x["item_code"])}))
	svc_rows += [r for _x, _s, _v, r in dia if r]
	svc_disc = sum(flt(x.get("discount")) for x in svc_lines) + sum(flt(x.get("discount")) for x, _s, _r in img) + sum(flt(x.get("discount")) for x, _s, _v, r in dia if r)
	svc_total = max(sum(r["qty"] * r["rate"] for r in svc_rows) - svc_disc, 0)
	money = []
	for ln in [x for x in lines if x.get("kind") in MONEY_KINDS]:
		kind, amt = ln["kind"], flt(ln.get("amount"))
		if kind == "Online Fee":
			amt = flt(frappe.db.get_value("Online Visit Request", ln["target"], "fee"))
		elif kind == "IPD Settlement":
			inv = frappe.db.get_value("Bed Allotment", ln["target"], "final_invoice")
			if not inv:
				frappe.throw(_("The final bill for {0} is not made yet; take an advance instead.").format(ln["target"]))
			amt = min(amt or 10**12, flt(frappe.db.get_value("Sales Invoice", inv, "outstanding_amount")))
		elif kind == "Dues":
			out = flt(frappe.db.get_value("Sales Invoice", ln["target"], "outstanding_amount"))
			amt = min(amt or out, out)
		if amt <= 0:
			frappe.throw(_("{0}: nothing to collect.").format(ln.get("label") or kind))
		money.append((ln, amt))
	total = sum(flt(s.patient_share) for _l, s in slips) + (flt(ti.patient_share) if ti else 0) + svc_total + sum(a for _l, a in money) \
		+ sum(flt(o.patient_share) for _l, o in lab_orders)
	pool = Tenders(tenders, total)

	# 2. post each document with its share of the tenders
	rcpt = frappe.new_doc("Counter Receipt")
	rcpt.update({"patient": patient, "branch": branch, "counter": counter, "shift": shift.name if shift else None, "cashier": frappe.session.user,
		"referring_doctor": d.get("referring_doctor") if d.get("referring_doctor") and frappe.db.exists("Doctor", d.get("referring_doctor")) else None,
		"external_referrer": (d.get("external_referrer") or "")[:140] or None,
		"posted_at": now_datetime(), "status": "Paid", "client_ref": d.get("client_ref"), "offline": cint(d.get("offline")),
		"offline_created": d.get("offline_created")})
	gross = disc_total = payer_total = 0.0
	for ln, slip in slips:
		slip.flags.hv_payments = pool.take(slip.patient_share)
		slip.payment_mode = (slip.flags.hv_payments[0]["mode_of_payment"] if slip.flags.hv_payments else first_mode)
		slip.cash_tendered = None
		slip.insert(ignore_permissions=True)
		slip.submit()
		prio = ln.get("priority") or d.get("priority")
		if prio in ("Urgent", "Elderly", "Disabled") and slip.queue_entry:
			frappe.db.set_value("Queue Entry", slip.queue_entry, "priority", prio)  # front of the doctor's queue
		gross += flt(slip.gross_total); disc_total += flt(slip.discount_amount); payer_total += flt(slip.payer_share)
		rcpt.append("lines", {"kind": "Consultation", "label": _("Consultation · {0}").format(slip.doctor_name or slip.doctor), "doctor": slip.doctor, "qty": 1,
			"rate": slip.gross_total, "discount": slip.discount_amount, "amount": slip.patient_share, "reference_doctype": "OPD Slip", "reference_name": slip.name,
			"token_no": slip.token_no, "label": _("Consultation · {0}").format(slip.doctor_name or slip.doctor) + (f" · {prio}" if prio in ("Urgent", "Elderly", "Disabled") else "")})
	if ti:
		auth = auths.get("Lab")
		auth = auth.get("name") if isinstance(auth, dict) else auth
		lab.pay(ti.name, first_mode, discount_amount=ti.discount_amount, discount_authorization=auth, payments=pool.take(ti.patient_share))
		ti.reload()
		gross += flt(ti.gross_total); disc_total += flt(ti.discount_amount); payer_total += flt(ti.payer_share)
		for x in lab_lines:
			price_ = flt(frappe.db.get_value("Lab Test Template", x["template"], "price"))
			rcpt.append("lines", {"kind": "Lab", "label": x["template"], "template": x["template"], "qty": 1, "rate": price_, "discount": flt(x.get("discount")),
				"amount": price_ - flt(x.get("discount")), "reference_doctype": "Test Invoice", "reference_name": ti.name})
	for ln, order in lab_orders:
		key = f"LabOrder:{order.name}"
		auth = auths.get(key)
		auth = auth.get("name") if isinstance(auth, dict) else auth
		share = flt(order.patient_share)
		lab.pay(order.name, first_mode, discount_amount=flt(ln.get("discount")), discount_authorization=auth, payments=pool.take(share))
		order.reload()
		gross += flt(order.gross_total); disc_total += flt(order.discount_amount); payer_total += flt(order.payer_share)
		disc_left = flt(order.discount_amount)
		for it in order.items:
			d_ = min(disc_left, flt(it.price)); disc_left -= d_
			rcpt.append("lines", {"kind": "Lab", "label": f"{it.template} · {order.name}", "template": it.template, "qty": 1, "rate": flt(it.price), "discount": d_,
				"amount": flt(it.price) - d_, "reference_doctype": "Test Invoice", "reference_name": order.name})
	if svc_rows:
		auth = auths.get("Service")
		auth = auth.get("name") if isinstance(auth, dict) else auth
		if svc_disc:
			discounts.assert_usable(auth, svc_disc)
		rcpt.insert(ignore_permissions=True)  # services invoice references the receipt
		customer = frappe.db.get_value("Patient", patient, "customer")
		si = billing.create_invoice(customer=customer, patient=patient, lines=svc_rows, billing_type="General", branch=branch, reference_doctype="Counter Receipt",
			reference_name=rcpt.name, discount_amount=svc_disc, payment_mode=first_mode, payments=pool.take(svc_total))
		if auth:
			discounts.mark_used(auth, "Counter Receipt", rcpt.name)
		gross += sum(r["qty"] * r["rate"] for r in svc_rows); disc_total += svc_disc
		for x, r in zip(svc_lines, svc_rows):
			rcpt.append("lines", {"kind": "Service", "label": frappe.db.get_value("Item", r["item_code"], "item_name"), "item_code": r["item_code"], "qty": r["qty"],
				"rate": r["rate"], "discount": flt(x.get("discount")), "amount": r["qty"] * r["rate"] - flt(x.get("discount")), "reference_doctype": "Sales Invoice",
				"reference_name": si, "department": frappe.db.get_value("Item", r["item_code"], "item_group")})
		for x, st, r in img:
			st.reload()
			st.payment_status, st.sales_invoice, st.counter_receipt = "Paid", si, rcpt.name
			rad.event(st, "Billed", f"Counter slip {rcpt.name}")
			st.save(ignore_permissions=True)
			if st.status == "Booked":
				st = rad.register(st.name)
			rcpt.append("lines", {"kind": x["kind"], "label": st.procedure_name + (" · contrast" if flt(st.contrast_charge) else "") + (" · urgent" if flt(st.urgent_charge) else ""),
				"item_code": r["item_code"], "procedure": st.procedure, "target": st.name, "qty": 1, "rate": r["rate"], "discount": flt(x.get("discount")),
				"amount": r["rate"] - flt(x.get("discount")), "reference_doctype": "Sales Invoice", "reference_name": si, "department": st.modality})
	si_ = locals().get("si") if svc_rows else None
	pkg_first = sorted(dia, key=lambda t: 0 if t[0]["kind"] == "Dialysis Package" else 1)  # sell the package before using it
	if dia and rcpt.is_new():
		rcpt.insert(ignore_permissions=True)
	for x, obj, via, r in pkg_first:
		disc_ = flt(x.get("discount")) if r else 0
		if x["kind"] == "Dialysis Package":
			bal = dz.sell_package(obj, x["item_code"], rcpt.name, r["rate"] - disc_)
			rcpt.append("lines", {"kind": "Dialysis Package", "label": f"{frappe.db.get_value('Item', x['item_code'], 'item_name')} · balance {bal['remaining']} of {bal['total']}",
				"item_code": x["item_code"], "target": obj, "qty": 1, "rate": r["rate"], "discount": disc_, "amount": r["rate"] - disc_,
				"reference_doctype": "Sales Invoice", "reference_name": si_, "department": "Dialysis"})
		else:
			ses = dz.mark_paid(obj.name, rcpt.name, via)
			label = f"Haemodialysis · {frappe.utils.formatdate(ses.session_date, 'dd MMM')} {ses.shift} · station {ses.station or ses.ward_location or '—'}"
			if via == "Package":
				bal = dz.package_balance(frappe.get_doc("Dialysis Patient", ses.dialysis_patient))
				label += f" · package (sessions remaining {bal['remaining']} of {bal['total']})"
			elif via == "Panel credit":
				label += f" · {frappe.db.get_value('Dialysis Patient', ses.dialysis_patient, 'payer')} credit"
			rcpt.append("lines", {"kind": "Dialysis", "label": label, "item_code": r["item_code"] if r else dz.SESSION_ITEM.get(ses.session_type), "target": ses.name, "qty": 1,
				"rate": flt(ses.amount), "discount": disc_, "amount": (flt(ses.amount) - disc_) if r else 0, "reference_doctype": "Sales Invoice" if r else "Dialysis Session",
				"reference_name": si_ if r else ses.name, "department": "Dialysis"})
	for ln, amt in money:
		kind, slices = ln["kind"], pool.take(amt)
		posted = []  # (reference doctype, name, amount) — one receipt line per payment so each can be refunded
		if kind in ("IPD Advance", "IPD Settlement"):
			for sl in slices:
				r = ipd.take_payment(sl["amount"], sl["mode_of_payment"], "Advance" if kind == "IPD Advance" else "Settlement", adm=ln["target"])
				posted.append(("Payment Entry", r["payment_entry"], sl["amount"], sl["mode_of_payment"]))
		elif kind == "Online Fee":
			ov = online_visit.verify_fee(ln["target"], 1, payment_reference=next((s_.get("reference_no") for s_ in slices if s_.get("reference_no")), None),
				payment_mode=slices[0]["mode_of_payment"] if slices else first_mode, payments=slices)
			posted.append(("Online Visit Request", ov.name, amt, None))
		elif kind == "Dues":
			for sl, pe in zip(slices, _settle_invoice(ln["target"], slices, patient, branch)):
				posted.append(("Payment Entry", pe, sl["amount"], sl["mode_of_payment"]))
		gross += amt
		for ref_dt, ref, part, mode in posted:
			label = (ln.get("label") or kind) + (f" · {mode}" if mode and len(posted) > 1 else "")
			rcpt.append("lines", {"kind": kind, "label": label, "target": ln.get("target"), "qty": 1, "rate": part, "amount": part,
				"reference_doctype": ref_dt, "reference_name": ref})
	rcpt.update({"gross_total": gross, "discount_total": disc_total, "payer_share": payer_total, "net_total": gross - disc_total, "patient_total": total,
		"tendered": pool.paid, "change_amount": pool.change,
		"tenders": [{"mode_of_payment": t["mode_of_payment"], "amount": flt(t["amount"]), "reference_no": t.get("reference_no")} for t in tenders if flt(t.get("amount")) > 0]})
	if rcpt.is_new():
		rcpt.insert(ignore_permissions=True)
	else:
		rcpt.save(ignore_permissions=True)
	publish("counter", {"action": "sale", "receipt": rcpt.name}, branch)
	return receipt_data(rcpt.name)


def sync(receipts):
	"""Offline sales: each posted once (client_ref), in order; one failing sale does not stop the others."""
	rows = frappe.parse_json(receipts) if isinstance(receipts, str) else receipts
	out = []
	for d in rows:
		frappe.db.savepoint("hv_counter_sync")
		try:
			r = checkout(dict(d, offline=1))
			out.append({"client_ref": d.get("client_ref"), "ok": 1, "name": r["name"], "receipt": r})
		except Exception as e:
			frappe.db.rollback(save_point="hv_counter_sync")
			frappe.clear_last_message()
			out.append({"client_ref": d.get("client_ref"), "ok": 0, "error": frappe.utils.strip_html(str(e)) or e.__class__.__name__})
	return out


# ------------------------------------------------------------------ receipts, refunds
def receipt_data(name):
	r = frappe.get_doc("Counter Receipt", name)
	s = settings()
	branch = frappe.db.get_value("Branch", r.branch, ["hv_address", "hv_phone"], as_dict=True) or {}
	tokens = []
	for ln in r.lines:
		if ln.kind == "Consultation" and ln.reference_name:
			doc = frappe.db.get_value("OPD Slip", ln.reference_name, ["doctor_name", "token_no", "doctor"], as_dict=True)
			tokens.append({"doctor": doc.doctor_name, "token": doc.token_no, "room": frappe.db.get_value("Doctor", doc.doctor, "consultation_room")})
	from hospital_vvs.services import radiology as rad

	dept = []
	for ln in r.lines:
		if ln.kind in IMAGING and ln.target:
			st = frappe.db.get_value("Imaging Study", ln.target, ["token_no", "modality", "procedure", "expected_at", "booking_ref", "status", "safety_status"], as_dict=True)
			if st:
				pr = rad.proc(st.procedure)
				due = st.expected_at or frappe.utils.add_to_date(r.posted_at, hours=flt(pr.tat_hours) or 4)
				dept.append({"line": ln.idx, "department": st.modality, "token": st.token_no, "where": rad.WHERE.get(st.modality), "prep": rad.prep_text(pr),
					"report_at": frappe.utils.format_datetime(due, "dd MMM, hh:mm a"), "booking_ref": st.booking_ref, "safety": st.safety_status})
		elif ln.kind == "Dialysis" and ln.target:
			from hospital_vvs.services import dialysis as dz

			info = dz.slip_info(ln.target)
			if info:
				dept.append({"line": ln.idx, **info})
		elif ln.kind == "Lab" and ln.reference_name and not any(x.get("ref") == ln.reference_name for x in dept):
			ti = frappe.db.get_value("Test Invoice", ln.reference_name, ["name", "expected_at"], as_dict=True)
			if ti:
				dept.append({"ref": ti.name, "department": "Laboratory", "token": ti.name, "where": "Sample collection, ground floor", "prep": "",
					"report_at": frappe.utils.format_datetime(ti.expected_at, "dd MMM, hh:mm a") if ti.expected_at else ""})
	ref = frappe.db.get_value("Doctor", r.referring_doctor, "doctor_name") if r.get("referring_doctor") else r.get("external_referrer")
	pat = frappe.db.get_value("Patient", r.patient, ["gender", "dob", "phone", "panel"], as_dict=True) if r.patient else None
	from hospital_vvs.api.patients import age_of

	return {"name": r.name, "posted_at": str(r.posted_at), "patient": r.patient, "patient_name": r.patient_name, "status": r.status, "departments": dept,
		"referring": ref, "print_count": cint(r.get("print_count")), "refund_reason": r.refund_reason,
		"patient_info": {"gender": pat.gender, "age": age_of(pat.dob), "phone": pat.phone, "panel": pat.panel} if pat else None,
		"lines": [ln.as_dict() for ln in r.lines], "tenders": [t.as_dict() for t in r.tenders], "gross_total": r.gross_total, "discount_total": r.discount_total,
		"payer_share": r.payer_share, "patient_total": r.patient_total, "tendered": r.tendered, "change_amount": r.change_amount, "tokens": tokens,
		"cashier": frappe.db.get_value("User", r.cashier, "full_name"), "counter": r.counter, "offline": r.offline,
		"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "address": branch.get("hv_address") or s.address, "phone": branch.get("hv_phone") or s.phone}}


def _approve_refund(approver=None, password=None):
	"""Cashiers need a cash supervisor / admin to approve a refund on the spot (their own login); supervisors approve their own."""
	from hospital_vvs import roles as RR
	from hospital_vvs.utils import has_any_role

	if has_any_role(RR.CASH_SUPERVISOR):
		return frappe.session.user
	if not approver or not password:
		frappe.throw(_("A refund needs the cash supervisor's approval — ask them to enter their login."), title=_("Supervisor approval"))
	if approver == frappe.session.user:
		frappe.throw(_("You cannot approve your own refund."))
	from frappe.utils.password import check_password

	try:
		check_password(approver, password)
	except frappe.AuthenticationError:
		frappe.throw(_("The supervisor's login is not correct."))
	if not has_any_role(RR.CASH_SUPERVISOR, user=approver):
		frappe.throw(_("{0} is not a cash supervisor.").format(approver))
	return approver


def refund(name, rows=None, reason=None, approver=None, password=None):
	"""Refund some or all lines from the current shift. Consultation / lab / service → credit note; advances, settlements and dues →
	the Payment Entry is cancelled (same day, nothing allocated yet). Online fees are refunded from the online visit."""
	if not (reason or "").strip():
		frappe.throw(_("Enter the refund reason."))
	r = frappe.get_doc("Counter Receipt", name)
	check_branch(r.branch)
	ok_by = _approve_refund(approver, password)
	idx = {cint(i) for i in (frappe.parse_json(rows) if isinstance(rows, str) else rows or [])} or {ln.idx for ln in r.lines}
	for ln in r.lines:  # imaging can be refunded only before the scan is started
		if ln.idx in idx and not ln.refunded and ln.kind in IMAGING and ln.target and \
			frappe.db.get_value("Imaging Study", ln.target, "status") not in ("Booked", "Registered", "Cancelled", "No Show"):
			frappe.throw(_("{0}: the scan has already been performed — it cannot be refunded here.").format(ln.label))
	for ln in r.lines:  # dialysis: only sessions not started; packages only while no session has been used
		if ln.idx in idx and not ln.refunded and ln.kind == "Dialysis" and ln.target and \
			frappe.db.get_value("Dialysis Session", ln.target, "status") not in ("Scheduled", "Cancelled", "Missed"):
			frappe.throw(_("{0}: the dialysis session has started — it cannot be refunded here.").format(ln.label))
		if ln.idx in idx and not ln.refunded and ln.kind == "Dialysis Package" and ln.target and frappe.db.get_value("Dialysis Package Purchase",
			{"parent": ln.target, "counter_receipt": r.name}, "used"):
			frappe.throw(_("{0}: package sessions are already used — refund the unused balance from accounts.").format(ln.label))
	done = set()
	for ln in r.lines:
		if ln.idx not in idx or ln.refunded:
			continue
		if ln.kind == "Online Fee":
			frappe.throw(_("Refund the online fee from the online visit (cancel or reject the visit first)."))
		doc_ref = None
		if ln.kind == "Consultation" and ln.reference_name:
			si = frappe.db.get_value("OPD Slip", ln.reference_name, "sales_invoice")
			doc_ref = billing.refund_invoice(si, reason) if si else None
			q = frappe.db.get_value("OPD Slip", ln.reference_name, "queue_entry")
			if q:
				frappe.db.set_value("Queue Entry", q, "status", "Skipped")
		elif ln.kind == "Lab" and ln.reference_name not in done:
			si = frappe.db.get_value("Test Invoice", ln.reference_name, "sales_invoice")
			items = {frappe.db.get_value("Lab Test Template", x.template, "item"): 1 for x in r.lines if x.kind == "Lab" and x.idx in idx and not x.refunded}
			doc_ref = billing.refund_invoice(si, reason, items=items) if si else None
			for x in frappe.get_all("Test Invoice Item", filters={"parent": ln.reference_name, "template": ["in", [y.template for y in r.lines if y.kind == "Lab" and y.idx in idx]],
				"status": ["in", ["Ordered", "Collected", "Received"]]}, pluck="name"):
				frappe.db.set_value("Test Invoice Item", x, "status", "Cancelled")
			done.add(ln.reference_name)
		elif ln.kind == "Service":
			doc_ref = billing.refund_invoice(ln.reference_name, reason, items={ln.item_code: ln.qty})
		elif ln.kind in IMAGING:
			doc_ref = billing.refund_invoice(ln.reference_name, reason, items={ln.item_code: 1})
			if ln.target:
				from hospital_vvs.services import radiology as rad

				st = frappe.get_doc("Imaging Study", ln.target)
				st.status, st.payment_status = "Cancelled", "Unpaid"
				rad.event(st, "Cancelled", f"Refunded on counter slip {r.name}: {reason}")
				st.save(ignore_permissions=True)
		elif ln.kind in DIALYSIS:
			if ln.reference_doctype == "Sales Invoice" and ln.reference_name:
				doc_ref = billing.refund_invoice(ln.reference_name, reason, items={ln.item_code: 1})
			from hospital_vvs.services import dialysis as dz

			if ln.kind == "Dialysis" and ln.target:
				ses = frappe.get_doc("Dialysis Session", ln.target)
				if ses.payment_status == "Package":
					dz._return_package_session(ses)
				ses.payment_status, ses.counter_receipt, ses.token_no = "Unpaid", None, None
				ses.save(ignore_permissions=True)
			elif ln.target:
				dp = frappe.get_doc("Dialysis Patient", ln.target)
				for p_ in dp.packages:
					if p_.counter_receipt == r.name:
						p_.status = "Refunded"
				dp.save(ignore_permissions=True)
		elif ln.reference_doctype == "Payment Entry" and ln.reference_name:
			pe = frappe.get_doc("Payment Entry", ln.reference_name)
			if str(pe.posting_date) != today():
				frappe.throw(_("{0} was taken on another day; refund it from the IPD bill instead.").format(ln.label))
			pe.flags.ignore_permissions = True
			pe.cancel()
			doc_ref = pe.name
		ln.refunded, ln.refund_document = 1, doc_ref or (ln.reference_name if ln.kind == "Lab" else None)
	r.status = "Refunded" if all(x.refunded for x in r.lines) else "Partly Refunded"
	r.refund_reason = ((r.refund_reason or "") + "\n" + f"{reason} — approved by {ok_by} {now_datetime():%Y-%m-%d %H:%M}").strip()
	r.save(ignore_permissions=True)
	publish("counter", {"action": "refund", "receipt": r.name}, r.branch)
	return receipt_data(r.name)


def offline_bundle(branch, counter):
	"""Everything the counter needs to keep selling consultations, services and lab tests without the server."""
	s = settings()
	cat = catalogue(branch)
	pats = frappe.db.sql("""select name, patient_name, phone, gender, dob, category from tabPatient where disabled=0 and branch=%s
		order by modified desc limit 1500""", branch, as_dict=True)
	from hospital_vvs.api.patients import age_of

	for p in pats:
		p["age"] = age_of(p.pop("dob"))
	return {**cat, "patients": pats, "modes": modes_for(counter) if counter else ["Cash"], "generated_at": str(now_datetime()), "branch": branch,
		"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "phone": s.phone, "address": s.address}, "follow_up_free_days": cint(s.follow_up_free_days)}


# ------------------------------------------------------------------ collection report (D-98)
CATEGORY = {"X-Ray": "Radiology (X-ray)", "Ultrasound": "Ultrasound / Doppler", "Doppler": "Ultrasound / Doppler", "MRI": "MRI", "CT": "CT Scan"}


def line_category(ln):
	if ln.kind in IMAGING:
		return CATEGORY.get(ln.department or frappe.db.get_value("Imaging Procedure", ln.procedure, "modality"), "Radiology (X-ray)")
	if ln.kind in DIALYSIS or (ln.kind == "Service" and str(ln.get("item_code") or "").startswith("DIA-")):
		return "Dialysis / Nephrology"
	return {"Consultation": "OPD consultation", "Lab": "Laboratory", "Lab Order": "Laboratory", "Service": "Other procedures"}.get(ln.kind, "IPD / dues / online fees")


def collection_report(from_date=None, to_date=None, branch=None, counter=None, cashier=None):
	"""Totals from the counter slips themselves (refunded lines shown separately), so the report always matches the slips."""
	from frappe.utils import add_days, getdate

	f, t = getdate(from_date or today()), getdate(to_date or today())
	flt_ = {"posted_at": ["between", [f"{f} 00:00:00", f"{t} 23:59:59"]], "branch": branch}
	if counter:
		flt_["counter"] = counter
	if cashier:
		flt_["cashier"] = cashier
	rcpts = frappe.get_all("Counter Receipt", filters=flt_, fields=["name", "posted_at", "cashier", "counter", "referring_doctor", "external_referrer", "patient_name",
		"gross_total", "discount_total", "patient_total", "payer_share", "status", "refund_reason"], order_by="posted_at")
	names = [r.name for r in rcpts] or [""]
	lines = frappe.get_all("Counter Receipt Line", filters={"parent": ["in", names], "parenttype": "Counter Receipt"}, fields=["parent", "kind", "label", "procedure", "item_code",
		"department", "qty", "rate", "discount", "amount", "refunded"])
	tenders = frappe.get_all("Counter Receipt Tender", filters={"parent": ["in", names], "parenttype": "Counter Receipt"}, fields=["parent", "mode_of_payment", "amount"])
	by_r = {r.name: r for r in rcpts}
	cat, disc, refunds, docs = {}, [], [], {}
	for ln in lines:
		c = line_category(frappe._dict(ln))
		row = cat.setdefault(c, {"label": c, "count": 0, "gross": 0.0, "discount": 0.0, "net": 0.0, "refunded": 0.0})
		gross = flt(ln.rate) * (flt(ln.qty) or 1)
		if ln.refunded:
			row["refunded"] += flt(ln.amount)
			refunds.append({"slip": ln.parent, "service": ln.label, "amount": flt(ln.amount), "reason": by_r[ln.parent].refund_reason})
			continue
		row["count"] += 1
		row["gross"] += gross
		row["discount"] += flt(ln.discount)
		row["net"] += flt(ln.amount)
		if flt(ln.discount):
			disc.append({"slip": ln.parent, "service": ln.label, "discount": flt(ln.discount), "cashier": by_r[ln.parent].cashier})
		r = by_r[ln.parent]
		dk = (frappe.db.get_value("Doctor", r.referring_doctor, "doctor_name") if r.referring_doctor else r.external_referrer) or "Self / not given"
		docs.setdefault(dk, {"label": dk, "count": 0, "net": 0.0})
		docs[dk]["count"] += 1
		docs[dk]["net"] += flt(ln.amount)
	modes = {}
	for tn in tenders:
		modes[tn.mode_of_payment] = modes.get(tn.mode_of_payment, 0.0) + flt(tn.amount)
	cashiers = {}
	for r in rcpts:
		k = frappe.db.get_value("User", r.cashier, "full_name") or r.cashier
		c = cashiers.setdefault(k, {"label": k, "slips": 0, "collected": 0.0})
		c["slips"] += 1
		c["collected"] += flt(r.patient_total)
	daily = {}
	for r in rcpts:
		k = str(r.posted_at)[:10]
		daily[k] = daily.get(k, 0.0) + flt(r.patient_total)
	order = ["Dialysis / Nephrology", "Radiology (X-ray)", "Ultrasound / Doppler", "MRI", "CT Scan", "Laboratory", "Other procedures", "OPD consultation", "IPD / dues / online fees"]
	return {"from": str(f), "to": str(t), "categories": sorted(cat.values(), key=lambda x: order.index(x["label"]) if x["label"] in order else 99),
		"modes": [{"label": k, "value": v} for k, v in sorted(modes.items(), key=lambda x: -x[1])], "cashiers": list(cashiers.values()),
		"doctors": sorted(docs.values(), key=lambda x: -x["net"])[:15], "discounts": disc[:200], "refunds": refunds[:200],
		"daily": [{"d": k, "value": v} for k, v in sorted(daily.items())],
		"totals": {"slips": len(rcpts), "gross": sum(x["gross"] for x in cat.values()), "discount": sum(x["discount"] for x in cat.values()),
			"net": sum(x["net"] for x in cat.values()), "refunded": sum(x["refunded"] for x in cat.values()), "tendered": sum(modes.values()),
			"panel_credit": sum(flt(r.payer_share) for r in rcpts)}}
