"""Patient identity (00-masters-patients.md): search, duplicate check, registration, CNIC reveal, card, history, merge."""

import json
import re
from difflib import SequenceMatcher

import frappe
from frappe import _
from frappe.utils import add_years, cint, flt, getdate, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.hospital_vvs.doctype.patient.patient import cnic_digits, cnic_hash, dob_from_age, normalize_phone
from hospital_vvs.utils import can_see_clinical, check_branch, default_branch, has_any_role, hhmm, log_access, require_roles, scope_branch

LIST_FIELDS = ["name", "patient_name", "patient_name_ur", "gender", "dob", "phone", "city", "category", "cnic_masked", "photo",
	"branch", "disabled", "merged_into", "creation"]
CLINICAL_FIELDS = {"allergies", "chronic_conditions", "long_term_medicines", "blood_group"}
REGISTER_ROLES = (R.RECEPTIONIST, R.DEO, R.DOCTOR, R.NURSE)


def age_of(dob):
	if not dob:
		return None
	d, t = getdate(dob), getdate(today())
	return t.year - d.year - ((t.month, t.day) < (d.month, d.day))


def _row(p):
	p["age"] = age_of(p.get("dob"))
	p["last_visit"] = frappe.db.get_value("OPD Slip", {"patient": p["name"], "docstatus": 1}, "posting_date", order_by="posting_date desc")
	return p


@frappe.whitelist()
def search(q="", limit=20, include_disabled=0):
	"""MR no. / QR scan, phone, CNIC (exact, via hash), legacy MR or name."""
	q = (q or "").strip()
	if len(q) < 2:
		return []
	filters = {} if cint(include_disabled) else {"disabled": 0}
	limit = min(cint(limit) or 20, 50)
	if q.upper().startswith("MR-"):
		return [_row(r) for r in frappe.get_all("Patient", filters=dict(filters, name=["like", q.upper() + "%"]), fields=LIST_FIELDS, limit=limit)]
	digits = cnic_digits(q)
	if len(digits) == 13 and re.fullmatch(r"[\d\- ]+", q):
		return [_row(r) for r in frappe.get_all("Patient", filters=dict(filters, cnic_hash=cnic_hash(digits)), fields=LIST_FIELDS)]
	if re.fullmatch(r"[\d+\- ]{6,}", q):
		phone = normalize_phone(q)
		return [_row(r) for r in frappe.get_all("Patient", filters=filters, or_filters={"phone": ["like", f"%{phone[-10:]}%"],
			"alt_phone": ["like", f"%{phone[-10:]}%"], "legacy_mr_no": q}, fields=LIST_FIELDS, limit=limit)]
	return [_row(r) for r in frappe.get_all("Patient", filters=filters, or_filters={"patient_name": ["like", f"%{q}%"],
		"patient_name_ur": ["like", f"%{q}%"], "legacy_mr_no": q, "name": ["like", f"%{q}%"]}, fields=LIST_FIELDS,
		limit=limit, order_by="modified desc")]


def _similar(a, b):
	return SequenceMatcher(None, (a or "").lower().strip(), (b or "").lower().strip()).ratio()


@frappe.whitelist()
def find_duplicates(patient_name=None, phone=None, cnic=None, dob=None, age=None, exclude=None):
	"""Likely duplicates: same CNIC; same phone + similar name; same name + DOB/age within a year."""
	require_roles(*R.FRONT_DESK, R.DEO)
	matches = {}
	digits = cnic_digits(cnic)
	if len(digits) == 13:
		for r in frappe.get_all("Patient", filters={"cnic_hash": cnic_hash(digits), "disabled": 0}, fields=LIST_FIELDS):
			matches[r.name] = dict(r, reason="Same CNIC", score=100)
	if phone:
		ph = normalize_phone(phone)
		for r in frappe.get_all("Patient", filters={"disabled": 0}, or_filters={"phone": ph, "alt_phone": ph}, fields=LIST_FIELDS):
			sim = _similar(r.patient_name, patient_name)
			if sim >= 0.6 and r.name not in matches:
				matches[r.name] = dict(r, reason=f"Same phone, similar name ({round(sim * 100)}%)", score=round(sim * 90))
	if patient_name:
		born = getdate(dob) if dob else (dob_from_age(age) if age not in (None, "") else None)
		if born:
			first = patient_name.strip().split(" ")[0]
			for r in frappe.get_all("Patient", filters={"disabled": 0, "patient_name": ["like", f"{first}%"],
				"dob": ["between", [add_years(born, -1), add_years(born, 1)]]}, fields=LIST_FIELDS, limit=50):
				sim = _similar(r.patient_name, patient_name)
				if sim >= 0.85 and r.name not in matches:
					matches[r.name] = dict(r, reason="Same name and age", score=round(sim * 80))
	matches.pop(exclude, None)
	return sorted((_row(m) for m in matches.values()), key=lambda m: -m["score"])


@frappe.whitelist(methods=["POST"])
def register(data, duplicate_reason=None):
	require_roles(*REGISTER_ROLES)
	d = frappe.parse_json(data)
	branch = d.get("branch") or default_branch()
	check_branch(branch)
	dups = find_duplicates(d.get("patient_name"), d.get("phone"), d.get("cnic"), d.get("dob"), d.get("age"))
	if dups and not (duplicate_reason or "").strip():
		frappe.throw(_("Possible duplicate patients found. Use an existing record or give a reason to create a new one."),
			title=_("Possible duplicate"))
	doc = frappe.new_doc("Patient")
	allowed = {"patient_name", "patient_name_ur", "patient_name_ar", "relation_type", "guardian_name", "gender", "dob", "phone",
		"alt_phone", "preferred_language", "category", "photo", "blood_group", "address", "city", "cnic", "legacy_mr_no", "panel",
		"employee_id", "panel_relation", "insurance_provider", "policy_no", "policy_valid_till", "welfare_scheme",
		"allergies", "chronic_conditions", "long_term_medicines", "emergency_contacts", "consents"}
	doc.update({k: v for k, v in d.items() if k in allowed})
	if not doc.dob and d.get("age") not in (None, ""):
		doc.dob, doc.dob_estimated = dob_from_age(d["age"]), 1
	doc.branch = branch
	if dups:
		doc.duplicate_reason = duplicate_reason
	doc.insert()
	if d.get("household_phone_link"):
		link_household(doc.name, d.get("household_relation") or "Other")
	return {"name": doc.name, "patient_name": doc.patient_name, "customer": frappe.db.get_value("Patient", doc.name, "customer")}


def link_household(patient, relation="Other"):
	"""Group patients that share a phone into one Household."""
	phone = frappe.db.get_value("Patient", patient, "phone")
	if not phone:
		return None
	hh = frappe.db.get_value("Household", {"phone": phone})
	if not hh:
		others = frappe.get_all("Patient", filters={"phone": phone, "disabled": 0}, fields=["name", "patient_name"], order_by="creation")
		head = others[0] if others else None
		doc = frappe.get_doc({"doctype": "Household", "phone": phone, "household_name": f"{head.patient_name if head else 'Family'} family",
			"head": head.name if head else patient, "members": [{"patient": o.name, "relation": "Head" if i == 0 else "Other"}
				for i, o in enumerate(others)]}).insert(ignore_permissions=True)
		hh = doc.name
	doc = frappe.get_doc("Household", hh)
	if not any(m.patient == patient for m in doc.members):
		doc.append("members", {"patient": patient, "relation": relation})
		doc.save(ignore_permissions=True)
	for m in doc.members:
		frappe.db.set_value("Patient", m.patient, "household", hh, update_modified=False)
	return hh


@frappe.whitelist()
def get(name):
	"""Patient record. Clinical fields only for clinical roles and the front desk (field-level, server side)."""
	doc = frappe.get_doc("Patient", name)
	doc.check_permission("read")
	out = doc.as_dict()
	out.pop("cnic", None)
	out.pop("cnic_hash", None)
	if not can_see_clinical():
		for f in CLINICAL_FIELDS:
			out.pop(f, None)
	out["age"] = age_of(doc.dob)
	out["can_reveal_cnic"] = has_any_role(*R.CNIC_REVEAL)
	out["household_members"] = frappe.get_all("Household Member", filters={"parent": doc.household}, fields=["patient", "patient_name",
		"relation"]) if doc.household else []
	return out


@frappe.whitelist(methods=["POST"])
def update(name, data):
	require_roles(*REGISTER_ROLES)
	doc = frappe.get_doc("Patient", name)
	d = frappe.parse_json(data)
	blocked = {"name", "customer", "household", "merged_into", "cnic_hash", "cnic_last4", "cnic_masked", "registered_by", "branch"}
	if not can_see_clinical():
		blocked |= CLINICAL_FIELDS
	for k, v in d.items():
		if k in blocked or not doc.meta.has_field(k):
			continue
		doc.set(k, v)
	if d.get("age") not in (None, "") and not d.get("dob"):
		doc.dob, doc.dob_estimated = dob_from_age(d["age"]), 1
	doc.save()
	return get(name)


@frappe.whitelist(methods=["POST"])
def reveal_cnic(name):
	"""Full CNIC for Admin / Receptionist only; every reveal is written to the access log."""
	if not has_any_role(*R.CNIC_REVEAL):
		log_access("CNIC reveal denied", patient=name, reference_doctype="Patient", reference_name=name)
		if not frappe.in_test:
			frappe.db.commit()  # keep the denied attempt even though the request fails
		frappe.throw(_("You are not permitted to see the full CNIC."), frappe.PermissionError)
	from frappe.utils.password import get_decrypted_password

	value = get_decrypted_password("Patient", name, "cnic", raise_exception=False)
	log_access("CNIC reveal", patient=name, reference_doctype="Patient", reference_name=name)
	d = cnic_digits(value)
	return f"{d[:5]}-{d[5:12]}-{d[12:]}" if len(d) == 13 else value


@frappe.whitelist(methods=["POST"])
def add_consent(name, consent_type, status):
	require_roles(*REGISTER_ROLES)
	doc = frappe.get_doc("Patient", name)
	doc.append("consents", {"consent_type": consent_type, "status": status, "recorded_on": now_datetime(),
		"recorded_by": frappe.session.user})
	doc.save()
	return get(name)


@frappe.whitelist()
def card(name):
	doc = frappe.get_doc("Patient", name)
	doc.check_permission("read")
	return {"name": doc.name, "patient_name": doc.patient_name, "patient_name_ur": doc.patient_name_ur, "gender": doc.gender,
		"age": age_of(doc.dob), "phone": doc.phone, "photo": doc.photo, "blood_group": doc.blood_group if can_see_clinical() else None,
		"guardian": f"{doc.relation_type or ''} {doc.guardian_name or ''}".strip(), "registered": str(doc.creation)[:10], "qr": doc.name}


# ------------------------------------------------------------------ history
@frappe.whitelist()
def history(name):
	"""Timeline across branches (02-opd.md). Every open is written to the access log."""
	require_roles(R.DOCTOR, R.NURSE, R.OV_DOCTOR, R.DEO)
	p = get(name)
	log_access("Patient history", patient=name, reference_doctype="Patient", reference_name=name)
	slips = frappe.get_all("OPD Slip", filters={"patient": name, "docstatus": 1}, fields=["name", "posting_date", "posting_time", "doctor_name",
		"purpose", "branch", "chief_complaint", "bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2", "weight", "height", "bmi",
		"rbs", "net_total", "token_no"], order_by="posting_date desc, posting_time desc", limit=200)
	rx = frappe.get_all("Prescription", filters={"patient": name, "docstatus": ["in", [1, 2]]}, fields=["name", "prescription_date",
		"doctor_name", "status", "version_no", "amended_from", "follow_up_date", "advice", "examination_notes", "branch", "signed_at",
		"has_overrides", "amendment_reason"], order_by="prescription_date desc, creation desc", limit=200)
	names = [r.name for r in rx] or [""]
	meds = frappe.get_all("Prescription Medicine", filters={"parent": ["in", names]}, fields=["parent", "item_name", "generic", "dose",
		"frequency", "route", "duration", "alert_type", "override_reason"], order_by="idx")
	dx = frappe.get_all("Prescription Diagnosis", filters={"parent": ["in", names]}, fields=["parent", "diagnosis", "diagnosis_name"])
	labs = frappe.get_all("Prescription Lab Test", filters={"parent": ["in", names]}, fields=["parent", "test_name"])
	for r in rx:
		r["medicines"] = [m for m in meds if m.parent == r.name]
		r["diagnoses"] = [d for d in dx if d.parent == r.name]
		r["lab_tests"] = [l for l in labs if l.parent == r.name]
	appts = frappe.get_all("Appointment", filters={"patient": name}, fields=["name", "appointment_date", "start_time", "doctor_name",
		"status", "source_channel", "booking_ref"], order_by="appointment_date desc", limit=50)
	beds = frappe.get_all("Bed Status Log", filters={"patient": name}, fields=["bed", "ward", "to_status", "changed_on"],
		order_by="changed_on desc", limit=50)
	vitals = [s for s in reversed(slips) if any(s.get(k) for k in ("bp_systolic", "pulse", "temperature", "spo2", "weight", "rbs"))]
	return {"patient": p, "visits": slips, "prescriptions": rx, "appointments": appts, "beds": beds, "vitals": vitals}


# ------------------------------------------------------------------ merge
MERGE_LINKS = [("OPD Slip", "patient"), ("Prescription", "patient"), ("Queue Entry", "patient"), ("Appointment", "patient"),
	("Message Log", "patient"), ("Sales Invoice", "hv_patient"), ("Household Member", "patient"), ("Clinical Access Log", "patient"),
	("Hospital Bed", "current_patient"), ("Bed Status Log", "patient"), ("Discount Authorization", "patient")]


def _extra_links():
	"""Later phases register more (doctype, field) pairs through the hv_patient_links hook."""
	out = list(MERGE_LINKS)
	for fn in frappe.get_hooks("hv_patient_links"):
		out.extend(frappe.get_attr(fn)())
	return [(dt, f) for dt, f in out if frappe.db.exists("DocType", dt) and frappe.get_meta(dt).has_field(f)]


@frappe.whitelist()
def merge_preview(survivor, duplicate):
	require_roles(R.ADMIN)
	if survivor == duplicate:
		frappe.throw(_("Pick two different patients."))
	counts = {dt: frappe.db.count(dt, {f: duplicate}) for dt, f in _extra_links()}
	return {"survivor": get(survivor), "duplicate": get(duplicate), "counts": {k: v for k, v in counts.items() if v}}


@frappe.whitelist(methods=["POST"])
def merge(survivor, duplicate, confirm_mr):
	"""Move every linked record and the Customer to the survivor; disable the duplicate. Cannot be undone automatically."""
	require_roles(R.ADMIN)
	if (confirm_mr or "").strip().upper() != duplicate.upper():
		frappe.throw(_("Type the duplicate's MR number to confirm."))
	s = frappe.get_doc("Patient", survivor)
	d = frappe.get_doc("Patient", duplicate)
	if d.disabled and d.merged_into:
		frappe.throw(_("{0} was already merged into {1}.").format(duplicate, d.merged_into))
	moved = {}
	for dt, f in _extra_links():
		names = frappe.get_all(dt, filters={f: duplicate}, pluck="name")
		if names:
			frappe.db.sql(f"update `tab{dt}` set `{f}`=%s where `{f}`=%s", (survivor, duplicate))
			moved[f"{dt}.{f}"] = len(names)
	# Customer: move the duplicate's ledger to the survivor's customer (rename with merge)
	if d.customer and s.customer and d.customer != s.customer and frappe.db.exists("Customer", d.customer):
		frappe.rename_doc("Customer", d.customer, s.customer, merge=True, force=True, show_alert=False)
		moved["Customer"] = d.customer
	elif d.customer and not s.customer:
		s.db_set("customer", d.customer)
	# carry over clinical lists the survivor lacks
	for table, key in (("allergies", "allergy"), ("chronic_conditions", "diagnosis"), ("long_term_medicines", "item")):
		have = {r.get(key) for r in s.get(table)}
		for r in d.get(table):
			if r.get(key) not in have:
				s.append(table, {k: v for k, v in r.as_dict().items() if k not in ("name", "parent", "idx")})
	s.flags.skip_customer_sync = True
	s.save(ignore_permissions=True)
	frappe.db.set_value("Patient", duplicate, {"disabled": 1, "merged_into": survivor, "customer": None})
	log = frappe.get_doc({"doctype": "Patient Merge Log", "survivor": survivor, "duplicate": duplicate, "merged_by": frappe.session.user,
		"merged_on": now_datetime(), "moved": json.dumps(moved, indent=1)}).insert(ignore_permissions=True)
	return {"log": log.name, "moved": moved}


@frappe.whitelist()
def board(q=None, category=None, gender=None, branch=None, sort="recent", start=0, limit=24):
	"""Patients screen: a page of patients with visit counts, last visit, allergy flag and upcoming booking, plus totals."""
	branch = scope_branch(branch, required=False)
	require_roles(*REGISTER_ROLES)
	cond, args = ["p.disabled=0"], {}
	for field, val in (("category", category), ("gender", gender), ("branch", branch)):
		if val:
			cond.append(f"p.{field}=%({field})s")
			args[field] = val
	if q:
		cond.append("(p.patient_name like %(q)s or p.patient_name_ur like %(q)s or p.name like %(q)s or p.phone like %(q)s or p.legacy_mr_no=%(qe)s)")
		args.update(q=f"%{q.strip()}%", qe=q.strip())
	where = " and ".join(cond)
	order = {"recent": "p.creation desc", "name": "p.patient_name asc", "visit": "last_visit is null, last_visit desc", "visits": "visits desc"}.get(sort, "p.creation desc")
	args.update(start=cint(start), limit=min(cint(limit) or 24, 100))
	rows = frappe.db.sql(f"""select p.name, p.patient_name, p.patient_name_ur, p.gender, p.dob, p.phone, p.city, p.category, p.photo, p.branch,
		p.blood_group, p.cnic_masked, p.creation, p.panel, p.insurance_provider, p.whatsapp_consent,
		(select count(*) from `tabOPD Slip` s where s.patient=p.name and s.docstatus=1) visits,
		(select max(s.posting_date) from `tabOPD Slip` s where s.patient=p.name and s.docstatus=1) last_visit,
		(select count(*) from `tabPatient Allergy` a where a.parent=p.name and a.parenttype='Patient') allergies,
		(select min(ap.appointment_date) from tabAppointment ap where ap.patient=p.name and ap.status in ('Pending','Confirmed')
			and ap.appointment_date >= curdate()) next_appointment,
		(select b.bed_no from `tabHospital Bed` b where b.current_patient=p.name and b.status='Occupied' limit 1) bed
		from tabPatient p where {where} order by {order} limit %(start)s, %(limit)s""", args, as_dict=True)
	clinical = can_see_clinical()
	for r in rows:
		r["age"] = age_of(r.dob)
		if not clinical:
			r["allergies"] = None
			r["blood_group"] = None
	total = frappe.db.sql(f"select count(*) from tabPatient p where {where}", args)[0][0]
	stats = frappe.db.sql("""select count(*) total, sum(category in ('Panel','Insurance')) payer, sum(category='Welfare') welfare,
		sum(creation >= curdate() - interval 30 day) new30, sum(gender='Female') female, sum(gender='Male') male from tabPatient where disabled=0""", as_dict=True)[0]
	stats["admitted"] = frappe.db.count("Hospital Bed", {"status": "Occupied"})
	stats["seen_today"] = frappe.db.sql("select count(distinct patient) from `tabOPD Slip` where docstatus=1 and posting_date=curdate()")[0][0]
	return {"rows": rows, "total": total, "stats": stats}


@frappe.whitelist()
def file(name):
	"""Patient file: reception visits (with appointment + check-up status), invoices, payments, treatment costs, amount owed,
	procedures and bed log. Money roles see this too; clinical text (complaint, diagnosis) only for clinical roles."""
	require_roles(*REGISTER_ROLES, R.ACCOUNTANT, R.CASH_SUPERVISOR)
	p = frappe.db.get_value("Patient", name, ["name", "customer", "patient_name"], as_dict=True)
	if not p:
		frappe.throw(_("Patient not found."))
	clinical = can_see_clinical()
	log_access("Patient file", patient=name, reference_doctype="Patient", reference_name=name)

	visits = frappe.db.sql("""select s.name, s.posting_date, s.posting_time, s.doctor_name, s.purpose, s.token_no, s.branch, s.net_total,
		s.patient_share, s.payer_share, s.payer_type, s.discount_amount, s.is_free_follow_up, s.sales_invoice, s.payment_mode, s.chief_complaint,
		s.appointment, q.status queue_status, q.called_at, q.completed_at, a.booking_ref, a.source_channel, a.start_time appt_time, a.status appt_status,
		(select name from tabPrescription rx where rx.opd_slip=s.name and rx.docstatus=1 order by rx.creation desc limit 1) prescription
		from `tabOPD Slip` s left join `tabQueue Entry` q on q.name=s.queue_entry left join tabAppointment a on a.name=s.appointment
		where s.patient=%s and s.docstatus=1 order by s.posting_date desc, s.posting_time desc""", name, as_dict=True)
	for v in visits:
		v["checkup"] = ("Seen" if v.queue_status == "Done" or v.prescription else "With doctor" if v.queue_status in ("Called", "In Consultation")
			else "Skipped" if v.queue_status == "Skipped" else "Waiting")
		v["appt_time"] = hhmm(v.appt_time)
		v["posting_time"] = hhmm(v.posting_time)
		if not clinical:
			v["chief_complaint"] = None
	appointments = frappe.get_all("Appointment", filters={"patient": name}, fields=["name", "booking_ref", "appointment_date", "start_time", "doctor_name",
		"status", "source_channel", "fee", "payment_status", "opd_slip"], order_by="appointment_date desc")
	for a in appointments:
		a["start_time"] = hhmm(a.start_time)

	invoices = frappe.db.sql("""select name, posting_date, customer, hv_billing_type billing_type, hv_reference_doctype ref_doctype, hv_reference_name ref_name,
		grand_total, rounded_total, paid_amount, outstanding_amount, status, is_return, is_pos, hv_is_payer_share payer
		from `tabSales Invoice` where docstatus=1 and (hv_patient=%(p)s or customer=%(c)s) order by posting_date desc, creation desc""",
		{"p": name, "c": p.customer or ""}, as_dict=True)
	inv_names = [i.name for i in invoices] or [""]
	payments = frappe.db.sql("""select si.name invoice, si.posting_date date, sip.mode_of_payment mode, sip.amount, 'Counter (POS)' source, null reference
		from `tabSales Invoice Payment` sip join `tabSales Invoice` si on si.name=sip.parent where si.name in %(inv)s and si.docstatus=1 and sip.amount != 0
		union all
		select pe.name invoice, pe.posting_date date, pe.mode_of_payment mode, pe.paid_amount amount, 'Payment Entry' source, pe.reference_no reference
		from `tabPayment Entry` pe where pe.docstatus=1 and pe.party_type='Customer' and pe.party=%(c)s
		order by date desc""", {"inv": inv_names, "c": p.customer or ""}, as_dict=True)
	costs = frappe.db.sql("""select coalesce(si.hv_billing_type, 'Other') billing_type, sii.item_name, sum(sii.qty) qty, sum(sii.amount) amount
		from `tabSales Invoice Item` sii join `tabSales Invoice` si on si.name=sii.parent where si.name in %(inv)s and si.docstatus=1 and si.is_return=0
		group by billing_type, sii.item_code order by amount desc""", {"inv": inv_names}, as_dict=True)
	procedures = frappe.db.sql("""select s.posting_date date, i.item_name, i.qty, i.amount, s.doctor_name, s.name source
		from `tabOPD Slip Item` i join `tabOPD Slip` s on s.name=i.parent join tabItem it on it.name=i.item_code
		where s.patient=%s and s.docstatus=1 and it.item_code like 'PROC-%%' order by s.posting_date desc""", name, as_dict=True)
	beds = frappe.get_all("Bed Status Log", filters={"patient": name}, fields=["bed", "ward", "from_status", "to_status", "changed_on", "changed_by", "note"],
		order_by="changed_on desc")

	own = [i for i in invoices if i.customer == p.customer]
	payer = [i for i in invoices if i.customer != p.customer]
	totals = {
		"billed": sum(flt(i.grand_total) for i in own if not i.is_return) + sum(flt(i.grand_total) for i in payer),
		"patient_billed": sum(flt(i.grand_total) for i in own),
		"payer_billed": sum(flt(i.grand_total) for i in payer),
		"paid": sum(flt(x.amount) for x in payments),
		"owed": sum(flt(i.outstanding_amount) for i in own),
		"payer_owed": sum(flt(i.outstanding_amount) for i in payer),
		"discount": sum(flt(v.discount_amount) for v in visits),
		"visits": len(visits), "seen": sum(1 for v in visits if v.checkup == "Seen"),
	}
	return {"visits": visits, "appointments": appointments, "invoices": invoices, "payments": payments, "costs": costs,
		"procedures": procedures, "beds": beds, "totals": totals, "customer": p.customer}


# ------------------------------------------------------------------ English → Urdu learning (D-51)
@frappe.whitelist()
def urdu_words():
	"""Every correction staff have taught: {english: urdu}. Cached; the browser merges it with its built-in name list."""
	return frappe.cache.get_value("hv_urdu_words", lambda: {r.english: r.urdu for r in frappe.get_all("Urdu Word", fields=["english", "urdu"], limit=20000)})


@frappe.whitelist(methods=["POST"])
def learn_urdu(pairs):
	"""pairs: [[english, urdu], …] — a corrected word replaces the old spelling for everyone."""
	require_roles(*REGISTER_ROLES, R.ADMIN)
	import re

	n = 0
	for en, ur in (frappe.parse_json(pairs) or [])[:30]:
		en = re.sub(r"[^a-z\-']", "", str(en or "").strip().lower())[:40]
		ur = str(ur or "").strip()[:60]
		if not en or not ur or not re.search(r"[\u0600-\u06FF]", ur):
			continue
		if frappe.db.exists("Urdu Word", en):
			frappe.db.set_value("Urdu Word", en, {"urdu": ur, "uses": (frappe.db.get_value("Urdu Word", en, "uses") or 0) + 1, "learned_by": frappe.session.user})
		else:
			frappe.get_doc({"doctype": "Urdu Word", "english": en, "urdu": ur, "uses": 1, "learned_by": frappe.session.user}).insert(ignore_permissions=True)
		n += 1
	frappe.cache.delete_value("hv_urdu_words")
	return {"learned": n}

