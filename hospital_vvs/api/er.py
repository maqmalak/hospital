"""Emergency API (/er). Rules live in services/er.py; clinical records reuse the IPD endpoints with er_visit."""

import frappe
from frappe.utils import cint

from hospital_vvs import roles as R
from hospital_vvs.services import er
from hospital_vvs.utils import check_branch, log_access, module_enabled, require_roles

STAFF = (R.DOCTOR, R.NURSE, R.RECEPTIONIST)


def _on():
	if not module_enabled("enable_emergency"):
		frappe.throw(frappe._("The Emergency module is switched off (Clinic Settings → Modules)."))


@frappe.whitelist()
def board(branch=None):
	require_roles(*STAFF)
	_on()
	return er.board(branch)


@frappe.whitelist(methods=["POST"])
def register(data):
	require_roles(*STAFF)
	_on()
	d = frappe.parse_json(data) if isinstance(data, str) else data
	v = er.register(patient=d.get("patient"), unknown=d.get("unknown"), branch=d.get("branch"), arrival_mode=d.get("arrival_mode") or "Walk-in",
		brought_by=d.get("brought_by"), brought_by_phone=d.get("brought_by_phone"), chief_complaint=d.get("chief_complaint"),
		medico_legal=d.get("medico_legal"), mlc_no=d.get("mlc_no"), police_station=d.get("police_station"))
	if d.get("triage_level"):
		er.triage(v.name, d["triage_level"], d.get("vitals"), None)
	return v.name


@frappe.whitelist(methods=["POST"])
def triage(name, level, vitals=None, chief_complaint=None):
	require_roles(R.NURSE, R.DOCTOR)
	return er.triage(name, level, frappe.parse_json(vitals) if isinstance(vitals, str) else vitals, chief_complaint).name


@frappe.whitelist(methods=["POST"])
def assign(name, doctor=None, bay=None, status=None):
	require_roles(*STAFF)
	return er.assign(name, doctor, bay, status).name


@frappe.whitelist()
def visit(name):
	require_roles(*STAFF)
	v = frappe.get_doc("ER Visit", name)
	check_branch(v.branch)
	log_access("ER visit", patient=v.patient, reference_doctype="ER Visit", reference_name=v.name, branch=v.branch)
	out = v.as_dict()
	scope = {"er_visit": name}
	out["notes"] = frappe.get_all("IPD Note", filters=dict(scope, docstatus=1), fields=["name", "note_type", "note", "recorded_at", "author"],
		order_by="recorded_at desc")
	out["orders"] = frappe.get_all("IPD Medication Order", filters=scope, fields=["name", "item_name", "dose", "route", "frequency", "status",
		"alert_type", "override_reason"], order_by="creation desc")
	out["mar"] = frappe.get_all("MAR Entry", filters=scope, fields=["name", "item_name", "dose", "scheduled_at", "status", "administered_at",
		"administered_by"], order_by="scheduled_at")
	out["vitals"] = frappe.get_all("Vitals Chart", filters=scope, fields=["recorded_at", "bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2",
		"resp_rate", "gcs"], order_by="recorded_at desc")
	labs = frappe.get_all("Test Invoice", filters=scope, fields=["name", "status", "priority"], order_by="creation desc")
	for t in labs:
		t["items"] = frappe.get_all("Test Invoice Item", filters={"parent": t.name}, fields=["template", "status", "result"])
	out["labs"] = labs
	out["procedures"] = frappe.get_all("IPD Procedure", filters=scope, fields=["name", "procedure_type", "status", "consent"], order_by="creation desc")
	out["charges"] = frappe.get_all("IPD Charge", filters=dict(scope, status=["!=", "Cancelled"]), fields=["name", "charge_type", "description", "qty",
		"rate", "amount", "status", "posted_at"], order_by="posted_at")
	p = frappe.db.get_value("Patient", v.patient, ["name", "patient_name", "gender", "dob", "phone", "temporary_record", "merged_into", "disabled"], as_dict=True)
	from hospital_vvs.api.patients import age_of

	p["age"] = age_of(p.dob)
	p["allergies"] = frappe.get_all("Patient Allergy", filters={"parent": v.patient, "parenttype": "Patient"}, fields=["allergy", "severity"])
	out["patient_info"] = p
	return out


@frappe.whitelist(methods=["POST"])
def dispose(name, disposition, note=None, referred_to=None, death_datetime=None, cause_of_death=None, admit=None, payment_mode="Cash", lama_form=None):
	require_roles(R.DOCTOR, R.RECEPTIONIST) if disposition == "Admitted" else require_roles(R.DOCTOR)
	v = er.dispose(name, disposition, note, referred_to, death_datetime, cause_of_death, admit, payment_mode, lama_form)
	return {"name": v.name, "bed_allotment": v.bed_allotment, "sales_invoice": v.sales_invoice}


@frappe.whitelist(methods=["POST"])
def identify(name, patient):
	"""Unknown patient identified: merge the temporary record into the real one (Admin; uses the patient merge tool)."""
	require_roles(R.ADMIN)
	v = frappe.get_doc("ER Visit", name)
	tmp = v.patient
	if not cint(frappe.db.get_value("Patient", tmp, "temporary_record")):
		frappe.throw(frappe._("This visit is not on a temporary record."))
	from hospital_vvs.api.patients import merge

	out = merge(patient, tmp, tmp)
	frappe.db.set_value("ER Visit", name, "is_unknown", 0)
	return out
