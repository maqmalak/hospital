"""Nephrology & Dialysis API (D-99). Staff calls are role-checked; public: facts, slot request, portal (OTP), document verification."""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit

from hospital_vvs import roles as R
from hospital_vvs.services import dialysis as dz
from hospital_vvs.services import dialysis_docs as docs
from hospital_vvs.utils import require_roles, scope_branch

STAFF = (R.NEPHROLOGIST, R.DIALYSIS_INCHARGE, R.DIALYSIS_NURSE, R.DIALYSIS_TECH)
VIEW = (*STAFF, R.RECEPTIONIST, R.DOCTOR, R.CASH_SUPERVISOR, R.ACCOUNTANT)
CLINIC = (R.NEPHROLOGIST, R.DOCTOR, R.DIALYSIS_INCHARGE)


def _j(x):
	return frappe.parse_json(x) if isinstance(x, str) else (x or {})


# ------------------------------------------------------------------ public
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=600)
def public_facts():
	return dz.public_facts()


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=900)
def request_slot(data):
	return dz.public_request(_j(data))


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def verify(kind, name, sig):
	return dz.public_check(kind, name, sig)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=6, seconds=900)
def portal_request(ident, phone):
	return dz.portal_request(ident, phone)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=12, seconds=900)
def portal_verify(ident, phone, code):
	return dz.portal_verify(ident, phone, code)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def portal_home(session):
	return dz.portal_home(session)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=900)
def portal_swap(session, name, date, shift, reason):
	return dz.portal_swap(session, name, date, shift, reason)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def portal_pdf(session, kind, name=None):
	"""Monthly summary / schedule card for the signed-in portal patient (POSTed, no tokens in URLs)."""
	dp = dz.portal_dp(session)
	if kind == "card":
		name = dp.name
	elif kind == "monthly":
		if frappe.db.get_value("Dialysis Monthly Review", name, "dialysis_patient") != dp.name:
			frappe.throw(_("Not found."))
	elif kind == "session":
		if frappe.db.get_value("Dialysis Session", name, "dialysis_patient") != dp.name:
			frappe.throw(_("Not found."))
	else:
		frappe.throw(_("Not available in the portal."))
	_pdf_response(kind, name)


def _pdf_response(kind, name):
	frappe.local.response.filename = f"{kind}-{name}.pdf"
	frappe.local.response.filecontent = docs.pdf(kind, name)
	frappe.local.response.type = "pdf"


# ------------------------------------------------------------------ staff: board / sessions
@frappe.whitelist()
def board(date=None, branch=None):
	require_roles(*VIEW)
	return dz.board(date, scope_branch(branch, required=False))


@frappe.whitelist()
def context():
	require_roles(*VIEW)
	return {"stations": frappe.get_all("Dialysis Station", filters={"status": ["!=", "Retired"]}, fields=["name", "station_no", "zone", "status"], order_by="sort_order"),
		"shifts": dz.SHIFTS, "active_shifts": dz.ACTIVE_SHIFTS, "days": dz.DAYS,
		"nephrologists": frappe.get_all("Doctor", filters={"is_active": 1, "department": "Nephrology & Dialysis"}, fields=["name", "doctor_name"]),
		"doctors": frappe.get_all("Doctor", filters={"is_active": 1}, fields=["name", "doctor_name", "department"], order_by="doctor_name"),
		"panels": frappe.get_all("Customer", filters={"customer_group": "Insurance Providers"}, pluck="name"),
		"consumables": [{"item_code": c, "item_name": n} for c, n, _q, _u in dz.CONSUMABLES], "targets": {"urr": dz.URR_TARGET, "ktv": dz.KTV_TARGET,
			"weight_gain": dz.WEIGHT_GAIN_ALERT_KG, "sbp_low": dz.SBP_LOW, "sbp_high": dz.SBP_HIGH}}


@frappe.whitelist()
def session(name):
	require_roles(*VIEW)
	return dz.session_view(name)


@frappe.whitelist(methods=["POST"])
def checkin(name):
	return dz.checkin(name).as_dict()


@frappe.whitelist(methods=["POST"])
def chart(name, data):
	return dz.chart(name, _j(data))


@frappe.whitelist(methods=["POST"])
def complete(name):
	return dz.complete(name)


@frappe.whitelist(methods=["POST"])
def sign(name, as_doctor=0, note=None):
	return dz.sign(name, bool(frappe.utils.cint(as_doctor)), note)


@frappe.whitelist(methods=["POST"])
def assign_station(name, station):
	return dz.assign_station(name, station).as_dict()


@frappe.whitelist(methods=["POST"])
def move_session(name, date, shift, station=None, reason=None, approve_swap=0):
	return dz.move_session(name, date, shift, station, reason, bool(frappe.utils.cint(approve_swap))).as_dict()


@frappe.whitelist(methods=["POST"])
def reject_swap(name, reason):
	return dz.reject_swap(name, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def cancel_session(name, reason, missed=0):
	return dz.cancel_session(name, reason, bool(frappe.utils.cint(missed))).as_dict()


@frappe.whitelist(methods=["POST"])
def allow_unpaid(name, reason):
	return dz.allow_unpaid(name, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def extra_session(name, date, shift, station=None, session_type="Extra", ward_location=None):
	return dz.extra_session(name, date, shift, station, session_type, ward_location).as_dict()


# ------------------------------------------------------------------ staff: patients
@frappe.whitelist()
def patients(status=None, q=None, zone=None):
	require_roles(*VIEW)
	flt = {}
	if status:
		flt["status"] = status
	else:
		flt["status"] = ["not in", ["Rejected"]]
	if zone:
		flt["zone"] = zone
	or_f = {"patient_name": ["like", f"%{q}%"], "patient": ["like", f"%{q}%"], "phone": ["like", f"%{q}%"], "name": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("Dialysis Patient", filters=flt, or_filters=or_f, fields=["name", "patient", "patient_name", "gender", "age", "status", "request_type", "zone",
		"sched_days", "sched_shift", "station", "access_type", "viral_next_due", "viral_tested_on", "hbsag", "anti_hcv", "hiv", "override_until", "payer", "dry_weight",
		"requested_at", "phone", "pref_days", "pref_shift", "current_hospital", "nephrologist", "dialysis_start"], order_by="status, patient_name", limit=500)
	for r in rows:
		dp = frappe._dict(r)
		r["screening"] = dz.screening_state(dp)
		r["package"] = dz.package_balance(frappe.get_doc("Dialysis Patient", r["name"]))["remaining"] if r["status"] == "Active" else None
	return rows


@frappe.whitelist()
def profile(name):
	require_roles(*VIEW)
	dp = frappe.get_doc("Dialysis Patient", name)
	out = dp.as_dict()
	out["screening"] = dz.screening_state(dp)
	out["package"] = dz.package_balance(dp)
	out["upcoming"] = frappe.get_all("Dialysis Session", filters={"dialysis_patient": name, "session_date": [">=", frappe.utils.today()], "status": ["!=", "Cancelled"]},
		fields=["name", "session_date", "shift", "station", "status", "payment_status", "session_type", "alerts", "swap_status"], order_by="session_date", limit=30)
	out["history"] = frappe.get_all("Dialysis Session", filters={"dialysis_patient": name, "session_date": ["<", frappe.utils.today()], "status": ["!=", "Cancelled"]},
		fields=["name", "session_date", "shift", "station", "status", "payment_status", "pre_weight", "post_weight", "weight_gain", "pre_bp_sys", "pre_bp_dia",
			"post_bp_sys", "post_bp_dia", "total_uf", "urr", "ktv", "alerts"], order_by="session_date desc", limit=60)
	out["reviews"] = frappe.get_all("Dialysis Monthly Review", filters={"dialysis_patient": name}, fields=["name", "month", "status", "urr", "ktv", "hb", "sessions_done",
		"sessions_missed"], order_by="month desc")
	out["consents"] = frappe.get_all("Consent Form", filters={"dialysis_patient": name, "docstatus": ["!=", 2]}, fields=["name", "consent_type", "signed_at", "signer_name", "docstatus"])
	out["timeline"] = frappe.get_all("Comment", filters={"reference_doctype": "Dialysis Patient", "reference_name": name, "comment_type": "Info"},
		fields=["content", "creation", "owner"], order_by="creation desc", limit=50)
	return out


@frappe.whitelist(methods=["POST"])
def save_profile(name=None, data=None):
	return dz.save_profile(name, _j(data)).as_dict()


@frappe.whitelist(methods=["POST"])
def add_screening(name, row):
	return dz.add_screening(name, _j(row)).as_dict()


@frappe.whitelist(methods=["POST"])
def add_access(name, row):
	return dz.add_access(name, _j(row)).as_dict()


@frappe.whitelist(methods=["POST"])
def override_screening(name, until, reason):
	return dz.override_screening(name, until, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def set_schedule(name, days, shift, station, start=None):
	return dz.set_schedule(name, days, shift, station, start)


@frappe.whitelist(methods=["POST"])
def set_status(name, status, reason=None):
	return dz.set_status(name, status, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def approve_request(name, data):
	return dz.approve_request(name, _j(data))


@frappe.whitelist(methods=["POST"])
def reject_request(name, reason):
	return dz.reject_request(name, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def start_from_opd(patient, prescription=None):
	return dz.start_from_opd(patient, prescription).as_dict()


@frappe.whitelist()
def lab_trends(patient, months=12):
	require_roles(*VIEW, R.NURSE)
	return dz.lab_trends(patient, frappe.utils.cint(months) or 12)


@frappe.whitelist(methods=["POST"])
def order_monthly_labs(name):
	return dz.order_monthly_labs(name)


@frappe.whitelist(methods=["POST"])
def create_review(name, month=None):
	return dz.create_review(name, month).as_dict()


@frappe.whitelist()
def review(name):
	require_roles(*VIEW)
	doc = frappe.get_doc("Dialysis Monthly Review", name)
	out = doc.as_dict()
	out["stats"] = dz.month_stats(frappe.get_doc("Dialysis Patient", doc.dialysis_patient), doc.month)
	return out


@frappe.whitelist(methods=["POST"])
def sign_review(name, review_note, rx_changes=None):
	return dz.sign_review(name, review_note, rx_changes).as_dict()


# ------------------------------------------------------------------ CKD clinic (Prescription reuse)
@frappe.whitelist()
def ckd_clinic(patient):
	"""Nephrology OPD view of one patient: CKD fields from their prescriptions, lab trends, dialysis profile if any."""
	require_roles(*CLINIC, R.DIALYSIS_NURSE)
	rx = frappe.get_all("Prescription", filters={"patient": patient, "docstatus": ["!=", 2]}, fields=["name", "prescription_date", "doctor_name", "ckd_stage", "ckd_cause",
		"neph_bp", "neph_weight", "neph_oedema", "neph_urine_output", "neph_comorbidities", "advice", "examination_notes", "follow_up_date", "status"],
		order_by="prescription_date desc, creation desc", limit=20)
	p = frappe.db.get_value("Patient", patient, ["name", "patient_name", "gender", "dob", "phone"], as_dict=True)
	return {"patient": p, "age": dz._age(p.dob) if p else None, "visits": rx, "labs": dz.lab_trends(patient, 24),
		"dialysis": frappe.db.get_value("Dialysis Patient", {"patient": patient, "status": ["in", ["Active", "Paused", "Requested"]]}, ["name", "status", "sched_days", "sched_shift"], as_dict=True)}


@frappe.whitelist(methods=["POST"])
def save_ckd_visit(patient, data):
	"""A nephrology consultation saved on the hospital's own Prescription doctype (CKD section)."""
	require_roles(R.NEPHROLOGIST, R.DOCTOR)
	d = _j(data)
	doctor = frappe.db.get_value("Doctor", {"user": frappe.session.user}, "name") or d.get("doctor")
	if not doctor:
		frappe.throw(_("Your user is not linked to a doctor."))
	rx = frappe.get_doc({"doctype": "Prescription", "patient": patient, "doctor": doctor, "branch": frappe.db.get_value("Doctor", doctor, "branch") or None,
		"prescription_date": frappe.utils.today(), "source": "OPD" if "OPD" in (frappe.get_meta("Prescription").get_field("source").options or "") else None,
		"ckd_stage": d.get("ckd_stage"), "ckd_cause": d.get("ckd_cause"), "neph_comorbidities": d.get("comorbidities"), "neph_bp": d.get("bp"),
		"neph_weight": d.get("weight"), "neph_oedema": d.get("oedema"), "neph_urine_output": d.get("urine_output"), "examination_notes": d.get("notes"),
		"advice": d.get("plan"), "follow_up_days": frappe.utils.cint(d.get("follow_up_days")) or None,
		"diagnoses": [{"diagnosis": x} for x in (d.get("diagnoses") or []) if frappe.db.exists("Diagnosis", x)],
		"medicines": []})
	rx.flags.ignore_mandatory = True
	rx.insert(ignore_permissions=True)
	return {"name": rx.name}


# ------------------------------------------------------------------ consent (Consent Form reuse)
@frappe.whitelist(methods=["POST"])
def save_consent(name, consent_type, signer_name, relation=None, witness_name=None, signature=None, details=None):
	require_roles(R.NEPHROLOGIST, R.DIALYSIS_INCHARGE, R.DIALYSIS_NURSE)
	if consent_type not in ("Haemodialysis", "Catheter Insertion"):
		frappe.throw(_("Invalid consent."))
	if not (signer_name and witness_name):
		frappe.throw(_("Enter the signer and the witness."))
	dp = frappe.get_doc("Dialysis Patient", name)
	if not dp.patient:
		frappe.throw(_("Link the patient's MR first."))
	cf = frappe.get_doc({"doctype": "Consent Form", "patient": dp.patient, "patient_name": dp.patient_name, "branch": dp.branch, "dialysis_patient": dp.name,
		"consent_type": consent_type, "signed_at": frappe.utils.now_datetime(), "signed_by": "Patient" if not relation else "Attendant", "signer_name": signer_name,
		"relation": relation, "witness_name": witness_name, "details": details or docs.CONSENT_TEXT[consent_type][0]})
	cf.insert(ignore_permissions=True)
	if signature and str(signature).startswith("data:image"):
		import base64

		from frappe.utils.file_manager import save_file

		f = save_file(f"consent-{cf.name}.png", base64.b64decode(signature.split(",", 1)[1]), "Consent Form", cf.name, is_private=1)
		cf.db_set("signature", f.file_url)
	cf.submit()
	dz.audit(dp, f"{consent_type} consent signed", cf.name)
	return cf.as_dict()


# ------------------------------------------------------------------ documents
@frappe.whitelist()
def pdf(kind, name, inline=0):
	require_roles(*VIEW)
	_pdf_response(kind, name)


# ------------------------------------------------------------------ unit / reports
@frappe.whitelist()
def unit(branch=None):
	require_roles(*STAFF, R.STORE_KEEPER)
	return dz.unit(scope_branch(branch, required=False))


@frappe.whitelist(methods=["POST"])
def add_log(data):
	return dz.add_log(_j(data)).as_dict()


@frappe.whitelist(methods=["POST"])
def save_station(data):
	require_roles(R.DIALYSIS_INCHARGE, R.ADMIN)
	d = _j(data)
	doc = frappe.get_doc("Dialysis Station", d["name"]) if d.get("name") and frappe.db.exists("Dialysis Station", d["name"]) else frappe.new_doc("Dialysis Station")
	for k in ("station_no", "label", "zone", "status", "machine_serial", "machine_model", "machine_installed", "last_service", "next_service", "out_of_service_reason", "sort_order", "notes"):
		if k in d:
			doc.set(k, d[k])
	if not doc.is_new() and doc.has_value_changed("zone") and frappe.db.exists("Dialysis Session", {"station": doc.name, "session_date": [">=", frappe.utils.today()], "status": "Scheduled"}):
		frappe.throw(_("Move the station's future sessions before changing its infection zone."))
	doc.save(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist()
def report(from_date=None, to_date=None, branch=None):
	require_roles(R.NEPHROLOGIST, R.DIALYSIS_INCHARGE, R.CASH_SUPERVISOR, R.ACCOUNTANT)
	return dz.report(from_date, to_date, scope_branch(branch, required=False))


@frappe.whitelist()
def requests():
	require_roles(*STAFF, R.RECEPTIONIST)
	return frappe.get_all("Dialysis Patient", filters={"status": "Requested"}, fields=["name", "patient", "patient_name", "phone", "gender", "age", "request_type", "pref_days",
		"pref_shift", "access_type", "current_hospital", "referring_doctor", "external_referrer", "request_notes", "request_file", "requested_at"], order_by="requested_at")
