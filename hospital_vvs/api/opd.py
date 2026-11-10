"""OPD slip counter, physician queue and waiting-room display (02-opd.md)."""

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.services import discounts
from hospital_vvs.utils import check_branch, default_branch, publish, require_roles, setting, settings, hhmm, scope_branch

COUNTER_ROLES = (R.RECEPTIONIST,)


@frappe.whitelist()
def counter_context(branch=None):
	"""Doctors with fee and today's queue, service items and payment modes for the OPD counter."""
	branch = scope_branch(branch, required=False)
	branch = branch or default_branch()
	doctors = frappe.get_all("Doctor", filters={"is_active": 1, "doctor_type": ["!=", "External Referring"]},
		fields=["name", "doctor_name", "doctor_name_ur", "specialization", "department", "default_fee", "follow_up_fee", "consultation_room",
			"color", "photo", "branch"], order_by="doctor_name")
	counts = {r.doctor: r for r in frappe.db.sql("""select doctor, count(*) total, sum(status='Waiting') waiting,
		sum(status in ('Called','In Consultation')) with_doctor from `tabQueue Entry` where queue_date=%s and branch=%s group by doctor""",
		(today(), branch), as_dict=True)}
	for d in doctors:
		c = counts.get(d.name) or {}
		d.update({"today": cint(c.get("total")), "waiting": cint(c.get("waiting")), "with_doctor": cint(c.get("with_doctor"))})
	items = frappe.get_all("Item", filters={"item_group": "Medical Services", "disabled": 0}, fields=["name as item_code", "item_name",
		"hv_billing_type", "standard_rate"], order_by="item_name")
	for it in items:
		it["rate"] = flt(frappe.db.get_value("Item Price", {"item_code": it["item_code"], "selling": 1}, "price_list_rate"))
	return {"branch": branch, "doctors": doctors, "items": items, "modes": ["Cash", "Card", "Bank Transfer", "JazzCash", "Easypaisa"],
		"follow_up_free_days": cint(setting("follow_up_free_days", branch)), "consultation_item": setting("consultation_item"),
		"follow_up_item": setting("follow_up_item")}


@frappe.whitelist()
def preview(data):
	"""Totals as the server computes them (free follow-up, payer split) before the cashier saves."""
	require_roles(*R.FRONT_DESK, R.CASH_SUPERVISOR)
	d = frappe.parse_json(data)
	doc = _build(d)
	doc.run_method("validate")
	return _summary(doc)


def _build(d):
	allowed = {"patient", "doctor", "branch", "purpose", "chief_complaint", "notes", "bp_systolic", "bp_diastolic", "pulse",
		"temperature", "spo2", "rbs", "weight", "height", "discount_amount", "discount_reason", "discount_authorization", "payment_mode",
		"cash_tendered", "appointment", "payer_type", "payer"}
	doc = frappe.new_doc("OPD Slip")
	doc.update({k: v for k, v in d.items() if k in allowed})
	doc.branch = doc.branch or default_branch()
	doc.posting_date = today()
	for it in d.get("items") or []:
		doc.append("items", {"item_code": it["item_code"], "qty": flt(it.get("qty") or 1), "rate": flt(it.get("rate"))})
	return doc


def _summary(doc):
	return {k: doc.get(k) for k in ("gross_total", "discount_amount", "discount_percent", "net_total", "payer_type", "payer", "payer_share",
		"patient_share", "change_amount", "is_free_follow_up", "purpose")} | {"items": [r.as_dict() for r in doc.items]}


@frappe.whitelist(methods=["POST"])
def request_discount(data):
	require_roles(*COUNTER_ROLES, R.LAB_USER, R.PHARMACY_CASHIER, R.DISPENSER, R.CASH_SUPERVISOR, R.ACCOUNTANT)
	d = frappe.parse_json(data)
	doc = _build(d)
	doc.discount_amount = 0
	doc.run_method("validate")
	auth = discounts.request(billing_type="OPD Slip", gross=doc.gross_total, discount_amount=flt(d.get("discount_amount")),
		reason=d.get("discount_reason"), branch=doc.branch, patient=doc.patient)
	return {"name": auth.name, "status": auth.status, "percent": auth.discount_percent}


@frappe.whitelist(methods=["POST"])
def create_slip(data):
	"""Save + submit the slip: invoice on the OPD POS Profile (skipped when 0), token and queue entry."""
	require_roles(*COUNTER_ROLES)
	d = frappe.parse_json(data)
	if d.get("client_ref"):
		existing = frappe.db.get_value("OPD Slip", {"client_ref": d["client_ref"], "docstatus": 1})
		if existing:
			return slip_print(existing)
	doc = _build(d)
	doc.client_ref = d.get("client_ref")
	check_branch(doc.branch)
	doc.insert()
	doc.submit()
	return slip_print(doc.name)


@frappe.whitelist()
def slip_print(name):
	doc = frappe.get_doc("OPD Slip", name)
	doc.check_permission("read")
	s = settings()
	branch = frappe.db.get_value("Branch", doc.branch, ["hv_address", "hv_phone"], as_dict=True) or {}
	doctor = frappe.db.get_value("Doctor", doc.doctor, ["doctor_name", "doctor_name_ur", "specialization", "consultation_room",
		"qualification", "registration_no", "show_license"], as_dict=True)
	inv = frappe.db.get_value("Sales Invoice", doc.sales_invoice, ["name", "grand_total", "rounded_total", "paid_amount",
		"total_taxes_and_charges"], as_dict=True) if doc.sales_invoice else None
	return {"name": doc.name, "token_no": doc.token_no, "posting_date": str(doc.posting_date), "posting_time": hhmm(doc.posting_time),
		"patient": doc.patient, "patient_name": doc.patient_name, "purpose": doc.purpose, "doctor": doctor, "branch": doc.branch,
		"items": [{"item_name": r.item_name, "qty": r.qty, "rate": r.rate, "amount": r.amount} for r in doc.items],
		"gross_total": doc.gross_total, "discount_amount": doc.discount_amount, "net_total": doc.net_total, "payer_type": doc.payer_type,
		"payer_share": doc.payer_share, "patient_share": doc.patient_share, "payment_mode": doc.payment_mode,
		"cash_tendered": doc.cash_tendered, "change_amount": doc.change_amount, "is_free_follow_up": doc.is_free_follow_up,
		"invoice": inv, "payer_invoice": doc.payer_invoice, "cashier": frappe.db.get_value("User", doc.owner, "full_name"),
		"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "address": branch.get("hv_address") or s.address,
			"phone": branch.get("hv_phone") or s.phone, "logo": s.logo}}


@frappe.whitelist()
def recent_slips(branch=None, limit=30):
	require_roles(*R.FRONT_DESK, R.CASH_SUPERVISOR, R.ACCOUNTANT, R.DEO)
	branch = scope_branch(branch, required=False)
	branch = branch or default_branch()
	return frappe.get_all("OPD Slip", filters={"branch": branch, "posting_date": today(), "docstatus": 1},
		fields=["name", "patient", "patient_name", "doctor_name", "token_no", "net_total", "patient_share", "payment_mode", "posting_time",
			"is_free_follow_up", "purpose"], order_by="creation desc", limit=cint(limit))


# ------------------------------------------------------------------ queue
@frappe.whitelist()
def queue(doctor=None, branch=None, date=None):
	require_roles(*R.ALL)
	branch = scope_branch(branch, required=False)
	branch = branch or default_branch()
	filters = {"branch": branch, "queue_date": date or today()}
	if doctor:
		filters["doctor"] = doctor
	rows = frappe.get_all("Queue Entry", filters=filters, fields=["name", "doctor", "doctor_name", "patient", "patient_name", "token_no",
		"status", "priority", "is_follow_up", "room", "creation", "called_at", "started_at", "completed_at", "opd_slip", "vitals_at"],
		order_by="token_no asc")
	order = {"In Consultation": 0, "Called": 1, "Waiting": 2, "Vitals": 3, "Skipped": 4, "Done": 5}
	prio = {"Urgent": 0, "Elderly": 1, "Disabled": 1}
	rows.sort(key=lambda r: (order.get(r.status, 9), prio.get(r.priority or "", 5) if r.status in ("Waiting", "Vitals") else 0, r.token_no or 0))
	photos = {p.name: p.photo for p in frappe.get_all("Patient", filters={"name": ["in", [r.patient for r in rows] or [""]]},
		fields=["name", "photo"])}
	for r in rows:
		r["photo"] = photos.get(r.patient)
		r["prescription"] = frappe.db.get_value("Prescription", {"queue_entry": r.name, "docstatus": ["<", 2]}, "name")
	doctors = frappe.get_all("Doctor", filters={"is_active": 1, "doctor_type": ["!=", "External Referring"]},
		fields=["name", "doctor_name", "consultation_room", "color", "specialization"], order_by="doctor_name")
	return {"branch": branch, "rows": rows, "doctors": doctors}


@frappe.whitelist(methods=["POST"])
def set_queue_status(name, status, priority=None):
	require_roles(R.DOCTOR, R.RECEPTIONIST, R.NURSE, R.DEO)
	q = frappe.get_doc("Queue Entry", name)
	if status not in ("Vitals", "Waiting", "Called", "In Consultation", "Done", "Skipped"):
		frappe.throw(_("Unknown status"))
	q.status = status
	now = now_datetime()
	if status == "Called":
		q.called_at = now
	elif status == "In Consultation":
		q.started_at = q.started_at or now
	elif status == "Done":
		q.completed_at = now
	if priority is not None:
		q.priority = priority
	q.save()
	publish("queue", {"doctor": q.doctor, "action": status, "token": q.token_no, "room": q.room, "patient_name": q.patient_name}, q.branch)
	return q.as_dict()


@frappe.whitelist(methods=["POST"])
def call_next(doctor, branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(R.DOCTOR, R.NURSE, R.RECEPTIONIST)
	data = queue(doctor=doctor, branch=branch)
	waiting = [r for r in data["rows"] if r.status == "Waiting"]
	if not waiting:
		frappe.throw(_("No one is waiting."))
	return set_queue_status(waiting[0].name, "Called")


@frappe.whitelist()
def display(branch=None):
	"""Waiting-room display: token and room only (first name when the setting allows)."""
	branch = scope_branch(branch, required=False)
	branch = branch or default_branch()
	show_name = cint(setting("show_first_name_on_display"))
	rows = frappe.get_all("Queue Entry", filters={"branch": branch, "queue_date": today(), "status": ["in", ["Waiting", "Called",
		"In Consultation"]]}, fields=["doctor", "doctor_name", "token_no", "status", "room", "patient_name", "called_at", "priority"],
		order_by="token_no")
	by_doc = {}
	for r in rows:
		d = by_doc.setdefault(r.doctor, {"doctor": r.doctor_name, "room": r.room, "now": None, "next": [], "waiting": 0})
		name = (r.patient_name or "").split(" ")[0] if show_name else None
		if r.status in ("Called", "In Consultation"):
			if not d["now"] or (r.called_at and str(r.called_at) > str(d["now"].get("called_at") or "")):
				d["now"] = {"token": r.token_no, "name": name, "status": r.status, "called_at": str(r.called_at or "")}
		else:
			d["waiting"] += 1
			if len(d["next"]) < 4:
				d["next"].append({"token": r.token_no, "name": name})
	return {"branch": branch, "doctors": list(by_doc.values()), "clinic": settings().clinic_name, "clinic_ur": settings().clinic_name_ur}


# ------------------------------------------------------------------ nurse vitals station (/opd/vitals)
VITALS = ("bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2", "rbs", "weight", "height")


@frappe.whitelist()
def vitals_queue(branch=None):
	"""Tokens waiting for the nurse, urgent / elderly first, then by arrival."""
	branch = scope_branch(branch, required=False)
	require_roles(R.NURSE, R.DOCTOR, R.RECEPTIONIST)
	branch = branch or default_branch()
	rows = frappe.get_all("Queue Entry", filters={"branch": branch, "queue_date": today(), "status": "Vitals"},
		fields=["name", "token_no", "patient", "patient_name", "doctor", "doctor_name", "room", "priority", "creation", "opd_slip", "is_follow_up"], order_by="creation")
	prio = {"Urgent": 0, "Elderly": 1, "Disabled": 1}
	rows.sort(key=lambda r: (prio.get(r.priority or "", 5), str(r.creation)))
	pats = {p.name: p for p in frappe.get_all("Patient", filters={"name": ["in", [r.patient for r in rows] or [""]]}, fields=["name", "gender", "dob", "photo", "phone"])}
	from hospital_vvs.api.patients import age_of

	for r in rows:
		p = pats.get(r.patient) or {}
		r.update(gender=p.get("gender"), age=age_of(p.get("dob")), photo=p.get("photo"),
			chief_complaint=frappe.db.get_value("OPD Slip", r.opd_slip, "chief_complaint") if r.opd_slip else None,
			last=frappe.get_all("OPD Slip", filters={"patient": r.patient, "docstatus": 1, "name": ["!=", r.opd_slip or ""], "bp_systolic": [">", 0]},
				fields=["posting_date", "bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2", "weight", "rbs"], order_by="posting_date desc", limit=1))
	done_today = frappe.db.count("Queue Entry", {"branch": branch, "queue_date": today(), "vitals_at": ["is", "set"]})
	return {"rows": rows, "done_today": done_today}


@frappe.whitelist(methods=["POST"])
def record_vitals(queue_entry, vitals, priority=None, chief_complaint=None):
	"""Nurse saves vitals on the OPD slip and sends the patient to the doctor's waiting list."""
	require_roles(R.NURSE, R.DOCTOR)
	v = frappe.parse_json(vitals) or {}
	q = frappe.get_doc("Queue Entry", queue_entry)
	if q.status not in ("Vitals", "Waiting"):
		frappe.throw(_("Token {0} is already {1}.").format(q.token_no, q.status))
	if not any(flt(v.get(k)) for k in ("bp_systolic", "pulse", "temperature", "spo2", "weight")):
		frappe.throw(_("Enter at least BP, pulse, temperature, SpO2 or weight."))
	from hospital_vvs.utils import check_vitals

	check_vitals(v)
	if q.opd_slip:
		upd = {k: flt(v[k]) for k in VITALS if v.get(k) not in (None, "")}
		w, h = flt(v.get("weight")), flt(v.get("height"))
		if w and h:
			upd["bmi"] = round(w / ((h / 100) ** 2), 1)
		if chief_complaint:
			upd["chief_complaint"] = chief_complaint
		frappe.db.set_value("OPD Slip", q.opd_slip, upd)  # submitted slip: vitals are clinical notes, not billing fields
	q.status, q.vitals_at, q.vitals_by = "Waiting", now_datetime(), frappe.session.user
	if priority is not None:
		q.priority = priority
	q.save(ignore_permissions=True)
	publish("queue", {"doctor": q.doctor, "action": "Waiting", "token": q.token_no, "room": q.room}, q.branch)
	return q.as_dict()

