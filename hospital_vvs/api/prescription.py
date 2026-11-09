"""Speed-first prescription workspace (02-opd.md)."""

import frappe
from frappe import _
from frappe.utils import cint, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.api.patients import age_of
from hospital_vvs.services import safety
from hospital_vvs.utils import log_access, publish, require_roles, setting

DOCTOR_ROLES = (R.DOCTOR, R.OV_DOCTOR)
LINE_FIELDS = ("item", "dose", "frequency", "route", "duration", "qty", "instructions", "no_substitution", "override_reason")


def my_doctor():
	return frappe.db.get_value("Doctor", {"user": frappe.session.user}, "name")


@frappe.whitelist()
def workspace(queue_entry=None, patient=None, prescription=None, online_visit=None):
	require_roles(*DOCTOR_ROLES, R.NURSE, R.DEO)
	q = frappe.get_doc("Queue Entry", queue_entry) if queue_entry else None
	rx = frappe.get_doc("Prescription", prescription) if prescription else None
	ov = frappe.get_doc("Online Visit Request", online_visit) if online_visit else None
	patient = patient or (q.patient if q else rx.patient if rx else ov.patient if ov else None)
	if not patient:
		frappe.throw(_("Choose a patient."))
	p = frappe.get_doc("Patient", patient)
	log_access("Prescription workspace", patient=patient, reference_doctype="Queue Entry" if q else "Patient",
		reference_name=queue_entry or patient)
	if not rx and ov:
		existing = frappe.db.get_value("Prescription", {"online_visit": ov.name, "docstatus": ["<", 2]}, "name", order_by="creation desc")
		rx = frappe.get_doc("Prescription", existing) if existing else None
	if not rx and q:
		existing = frappe.db.get_value("Prescription", {"queue_entry": q.name, "docstatus": 0}, "name")
		rx = frappe.get_doc("Prescription", existing) if existing else None
	slip = frappe.get_doc("OPD Slip", q.opd_slip) if q and q.opd_slip else None
	count = cint(setting("vitals_history_count")) or 5
	vitals = frappe.get_all("OPD Slip", filters={"patient": patient, "docstatus": 1}, fields=["posting_date", "bp_systolic", "bp_diastolic",
		"pulse", "temperature", "spo2", "weight", "bmi", "rbs"], order_by="posting_date desc, creation desc", limit=count)
	previous = frappe.get_all("Prescription", filters={"patient": patient, "docstatus": 1, "status": "Signed"},
		fields=["name", "prescription_date", "doctor_name"], order_by="creation desc", limit=5)
	for r in previous:
		r["medicines"] = frappe.get_all("Prescription Medicine", filters={"parent": r.name}, fields=["item_name", "dose", "frequency",
			"duration"], order_by="idx")
		r["diagnoses"] = frappe.get_all("Prescription Diagnosis", filters={"parent": r.name}, pluck="diagnosis_name")
	doctor = (q.doctor if q else None) or (rx.doctor if rx else None) or (ov.assigned_doctor if ov else None) or my_doctor()
	return {
		"patient": {"name": p.name, "patient_name": p.patient_name, "patient_name_ur": p.patient_name_ur, "gender": p.gender,
			"age": age_of(p.dob), "phone": p.phone, "photo": p.photo, "blood_group": p.blood_group, "category": p.category,
			"allergies": [a.as_dict() for a in p.allergies], "conditions": [c.as_dict() for c in p.chronic_conditions],
			"long_term_medicines": [m.as_dict() for m in p.long_term_medicines]},
		"queue": q.as_dict() if q else None,
		"slip": {k: slip.get(k) for k in ("name", "chief_complaint", "notes", "bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2",
			"rbs", "weight", "height", "bmi", "purpose")} if slip else None,
		"vitals": vitals, "previous": previous,
		"online_visit": {k: ov.get(k) for k in ("name", "complaint", "symptoms", "duration", "conditions", "current_meds", "allergies_text", "video_link",
			"scheduled_at", "status")} | {"photos": [r.file_url for r in ov.photos]} if ov else None,
		"prescription": rx.as_dict() if rx else None,
		"doctor": frappe.db.get_value("Doctor", doctor, ["name", "doctor_name", "revisit_days"], as_dict=True) if doctor else None,
		"templates": frappe.get_all("Prescription Template", or_filters=[["doctor", "=", doctor or ""], ["doctor", "is", "not set"]],
			fields=["name", "template_name", "doctor"], order_by="template_name"),
		"favorites": favorites(doctor),
	}


def favorites(doctor, limit=12):
	if not doctor:
		return []
	return frappe.db.sql("""select m.item, m.item_name, m.dose, m.frequency, m.route, m.duration, count(*) n
		from `tabPrescription Medicine` m join `tabPrescription` p on p.name=m.parent
		where p.doctor=%s and p.docstatus=1 group by m.item order by n desc limit %s""", (doctor, limit), as_dict=True)


@frappe.whitelist()
def search_medicines(q="", limit=15):
	"""Brand or generic, with strength and form."""
	q = (q or "").strip()
	if not q:
		return []
	like = f"%{q}%"
	return frappe.db.sql("""select name as item, item_name, hv_generic as generic, hv_strength as strength, hv_dosage_form as form,
		hv_drug_class as drug_class, hv_prescription_required as rx_required from tabItem
		where disabled=0 and hv_is_medicine=1 and (item_name like %s or hv_generic like %s or name like %s)
		order by (item_name like %s) desc, item_name limit %s""", (like, like, like, f"{q}%", cint(limit) or 15), as_dict=True)


@frappe.whitelist()
def search_diagnoses(q="", limit=15):
	like = f"%{(q or '').strip()}%"
	return frappe.get_all("Diagnosis", or_filters={"name": ["like", like], "diagnosis_name": ["like", like]},
		fields=["name", "diagnosis_name", "category"], limit=cint(limit) or 15, order_by="diagnosis_name")


@frappe.whitelist()
def check(patient, lines, prescription=None):
	"""Live safety check as lines are added (same rules as on save)."""
	lines = frappe.parse_json(lines)
	return safety.check(patient, lines, exclude_prescription=prescription)


@frappe.whitelist(methods=["POST"])
def save(data, sign=0):
	"""Create or update the draft; sign=1 submits it (blocked while a blocking alert has no override reason)."""
	require_roles(*DOCTOR_ROLES)
	d = frappe.parse_json(data)
	if d.get("name"):
		doc = frappe.get_doc("Prescription", d["name"])
		if doc.docstatus != 0:
			frappe.throw(_("This prescription is signed. Amend it to make a correction."))
	else:
		doc = frappe.new_doc("Prescription")
		q = frappe.get_doc("Queue Entry", d["queue_entry"]) if d.get("queue_entry") else None
		doc.update({"patient": d.get("patient") or (q.patient if q else None), "queue_entry": q.name if q else None,
			"opd_slip": q.opd_slip if q else d.get("opd_slip"), "branch": (q.branch if q else d.get("branch")) or setting("default_branch"),
			"doctor": d.get("doctor") or (q.doctor if q else None) or my_doctor(), "source": d.get("source") or "OPD",
			"amended_from": d.get("amended_from"), "amendment_reason": d.get("amendment_reason")})
		if d.get("online_visit"):
			ov = frappe.db.get_value("Online Visit Request", d["online_visit"], ["patient", "assigned_doctor", "branch", "status"], as_dict=True)
			if not ov or ov.status != "Accepted":
				frappe.throw(_("The online visit is not open."))
			doc.update({"online_visit": d["online_visit"], "source": "Online Visit", "patient": ov.patient, "branch": ov.branch,
				"doctor": d.get("doctor") or ov.assigned_doctor})
	for k in ("examination_notes", "advice", "follow_up_days", "follow_up_date", "amendment_reason"):
		if k in d:
			doc.set(k, d[k])
	if not d.get("follow_up_date") and d.get("follow_up_days"):
		doc.follow_up_date = None
	doc.set("medicines", [{k: m.get(k) for k in LINE_FIELDS} for m in d.get("medicines") or [] if m.get("item")])
	doc.set("diagnoses", [{"diagnosis": x.get("diagnosis"), "is_primary": x.get("is_primary")} for x in d.get("diagnoses") or [] if x.get("diagnosis")])
	doc.set("lab_tests", [{"test_name": x.get("test_name"), "urgent": x.get("urgent"), "notes": x.get("notes")} for x in d.get("lab_tests") or []
		if x.get("test_name")])
	doc.save()
	if doc.queue_entry:
		q = frappe.get_doc("Queue Entry", doc.queue_entry)
		if q.status in ("Waiting", "Called"):
			q.status, q.started_at = "In Consultation", q.started_at or now_datetime()
			q.save(ignore_permissions=True)
			publish("queue", {"doctor": q.doctor, "action": "In Consultation", "token": q.token_no}, q.branch)
	if cint(sign):
		doc.submit()
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def amend(name, reason):
	"""Cancel-and-keep the signed version, return a new draft (version N+1) carrying the reason."""
	require_roles(*DOCTOR_ROLES)
	if not (reason or "").strip():
		frappe.throw(_("Enter the reason for the amendment."))
	old = frappe.get_doc("Prescription", name)
	if old.docstatus != 1:
		frappe.throw(_("Only a signed prescription can be amended."))
	old.flags.ignore_links = True
	old.cancel()
	new = frappe.copy_doc(old)
	new.docstatus = 0
	new.amended_from = old.name
	new.amendment_reason = reason
	new.status = "Draft"
	new.signed_by = new.signed_at = None
	for m in new.medicines:
		m.override_by = m.override_at = None
	new.insert()
	frappe.db.set_value("Prescription", old.name, "status", "Superseded")
	return new.as_dict()


@frappe.whitelist()
def get_template(name):
	t = frappe.get_doc("Prescription Template", name)
	return {"medicines": [m.as_dict() for m in t.medicines], "diagnoses": [x.as_dict() for x in t.diagnoses], "advice": t.advice}


@frappe.whitelist(methods=["POST"])
def save_template(template_name, data, shared=0):
	require_roles(*DOCTOR_ROLES)
	d = frappe.parse_json(data)
	t = frappe.get_doc({"doctype": "Prescription Template", "template_name": template_name, "doctor": None if cint(shared) else my_doctor(),
		"advice": d.get("advice"), "medicines": [{k: m.get(k) for k in LINE_FIELDS if k != "override_reason"} for m in d.get("medicines") or []
			if m.get("item")], "diagnoses": [{"diagnosis": x["diagnosis"]} for x in d.get("diagnoses") or [] if x.get("diagnosis")]})
	t.insert()
	return t.name


@frappe.whitelist()
def copy_previous(patient):
	name = frappe.db.get_value("Prescription", {"patient": patient, "docstatus": 1, "status": "Signed"}, "name", order_by="creation desc")
	if not name:
		frappe.throw(_("No previous prescription."))
	rx = frappe.get_doc("Prescription", name)
	return {"medicines": [{k: m.get(k) for k in LINE_FIELDS + ("item_name", "generic") if k != "override_reason"} for m in rx.medicines],
		"diagnoses": [x.as_dict() for x in rx.diagnoses], "advice": rx.advice, "from": name}


@frappe.whitelist()
def print_data(name):
	rx = frappe.get_doc("Prescription", name)
	rx.check_permission("read")
	log_access("Prescription print", patient=rx.patient, reference_doctype="Prescription", reference_name=name)
	p = frappe.db.get_value("Patient", rx.patient, ["patient_name", "patient_name_ur", "gender", "dob", "phone", "relation_type",
		"guardian_name"], as_dict=True)
	doc = frappe.db.get_value("Doctor", rx.doctor, ["doctor_name", "doctor_name_ur", "qualification", "registration_no", "show_license",
		"signature", "specialization", "consultation_room"], as_dict=True)
	s = frappe.get_cached_doc("Clinic Settings")
	slip = frappe.db.get_value("OPD Slip", rx.opd_slip, ["bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2", "weight", "rbs",
		"chief_complaint"], as_dict=True) if rx.opd_slip else None
	branch = frappe.db.get_value("Branch", rx.branch, ["hv_address", "hv_phone"], as_dict=True) or {}
	return {"rx": rx.as_dict(), "patient": dict(p, age=age_of(p.dob)), "doctor": doc, "vitals": slip,
		"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "logo": s.logo, "address": branch.get("hv_address") or s.address,
			"phone": branch.get("hv_phone") or s.phone},
		"amended": bool(rx.amended_from), "version": rx.version_no}
