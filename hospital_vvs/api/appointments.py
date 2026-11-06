"""Appointments: reception desk (staff) and the public web portal / manage-booking page (guest, rate limited)."""

import random

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, flt, getdate, today

from hospital_vvs import roles as R
from hospital_vvs.hospital_vvs.doctype.patient.patient import normalize_phone
from hospital_vvs.services import appointments as svc
from hospital_vvs.services import messaging
from hospital_vvs.utils import default_branch, require_roles, setting, settings

STAFF = (R.RECEPTIONIST, R.DEO)
PUBLIC_FIELDS = ["name", "doctor_name", "doctor_name_ur", "specialization", "default_fee", "photo", "qualification", "branch"]


# ------------------------------------------------------------------ staff
@frappe.whitelist()
def board(date=None, branch=None, status=None, channel=None, doctor=None):
	require_roles(*STAFF, R.DOCTOR, R.NURSE)
	filters = {"appointment_date": date or today(), "branch": branch or default_branch()}
	if status:
		filters["status"] = status
	if channel:
		filters["source_channel"] = channel
	if doctor:
		filters["doctor"] = doctor
	rows = frappe.get_all("Appointment", filters=filters, fields=["name", "patient", "patient_name", "phone", "doctor", "doctor_name",
		"appointment_date", "start_time", "status", "source_channel", "booking_ref", "fee", "payment_channel", "payment_status",
		"payment_proof", "opd_slip", "is_new_patient", "new_patient_age", "new_patient_gender"], order_by="start_time asc")
	failed = {r.reference_name for r in frappe.get_all("Message Log", filters={"reference_doctype": "Appointment", "status": "Failed",
		"reference_name": ["in", [r.name for r in rows] or [""]]}, fields=["reference_name"])}
	for r in rows:
		r["message_failed"] = r.name in failed
	stats = frappe.db.sql("""select source_channel, status, count(*) n from tabAppointment where appointment_date=%s and branch=%s
		group by source_channel, status""", (filters["appointment_date"], filters["branch"]), as_dict=True)
	return {"rows": rows, "stats": stats}


@frappe.whitelist()
def slots(doctor, date, branch=None):
	return svc.available_slots(doctor, date, branch)


@frappe.whitelist()
def dates(doctor, branch=None):
	return svc.available_dates(doctor, branch)


@frappe.whitelist(methods=["POST"])
def book(data):
	require_roles(*STAFF)
	d = frappe.parse_json(data)
	appt = svc.book(doctor=d["doctor"], slot=d.get("slot"), date=d.get("date"), start_time=d.get("start_time"), branch=d.get("branch"),
		patient=d.get("patient"), patient_name=d.get("patient_name"), phone=d.get("phone"), source_channel="Reception",
		payment_channel=d.get("payment_channel") or "At Clinic")
	return appt.as_dict()


@frappe.whitelist(methods=["POST"])
def set_status(name, status, reason=None):
	require_roles(*STAFF)
	return svc.set_status(name, status, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def reschedule(name, slot):
	require_roles(*STAFF)
	return svc.reschedule(name, slot).as_dict()


@frappe.whitelist(methods=["POST"])
def mark_paid(name):
	require_roles(*STAFF)
	frappe.db.set_value("Appointment", name, "payment_status", "Paid")
	return True


@frappe.whitelist(methods=["POST"])
def link_patient(name, patient):
	"""Booking made for a new patient: link it to the patient registered at the desk."""
	require_roles(*STAFF)
	frappe.db.set_value("Appointment", name, {"patient": patient, "is_new_patient": 0})
	return True


@frappe.whitelist(methods=["POST"])
def regenerate_slots(days=None):
	require_roles(R.ADMIN, R.RECEPTIONIST)
	return svc.generate_slots(days)


# ------------------------------------------------------------------ public portal
def _require_web_booking():
	if not (cint(setting("enable_appointments")) and cint(setting("enable_web_booking"))):
		frappe.throw(_("Online booking is not available."))


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=600)
def public_options():
	_require_web_booking()
	s = settings()
	doctors = frappe.get_all("Doctor", filters={"is_active": 1, "doctor_type": ["!=", "External Referring"]}, fields=PUBLIC_FIELDS,
		order_by="doctor_name")
	specs = sorted({d.specialization for d in doctors if d.specialization})
	spec_ur = {x.name: x.specialization_ur for x in frappe.get_all("Specialization", fields=["name", "specialization_ur"])}
	branches = frappe.get_all("Branch", fields=["name", "hv_address as address", "hv_phone as phone"], order_by="name")
	return {"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "logo": s.logo, "phone": s.phone},
		"branches": branches, "specializations": [{"name": x, "name_ur": spec_ur.get(x)} for x in specs], "doctors": doctors,
		"payment_channels": [c.strip() for c in (s.web_payment_channels or "At Clinic").split("\n") if c.strip()],
		"hold_minutes": cint(s.slot_hold_minutes) or 10}


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=200, seconds=600)
def public_dates(doctor, branch=None):
	_require_web_booking()
	return [{"date": str(r.slot_date), "free": r.n} for r in svc.available_dates(doctor, branch)]


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=200, seconds=600)
def public_slots(doctor, date, branch=None):
	_require_web_booking()
	return [{"name": s.name, "time": str(s.start_time)[:5]} for s in svc.available_slots(doctor, date, branch)]


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=600)
def public_hold(slot, hold_key):
	_require_web_booking()
	if not hold_key or len(hold_key) < 16:
		frappe.throw(_("Invalid request"))
	expires = svc.hold_slot(slot, f"web:{hold_key}")
	return {"expires_at": str(expires)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=600)
def public_release(slot, hold_key):
	svc.release_hold(slot, f"web:{hold_key}")
	return True


def _otp_key(phone):
	return f"hv_otp:{normalize_phone(phone)}"


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=900)
def request_otp(phone):
	"""Existing patients' numbers must be verified before their household is shown."""
	_require_web_booking()
	phone = normalize_phone(phone)
	from hospital_vvs.messaging.whatsapp_bot import household

	members = household(phone)
	if not members:
		return {"existing": False}
	code = f"{random.SystemRandom().randint(0, 999999):06d}"
	frappe.cache.set_value(_otp_key(phone), {"code": code, "tries": 0}, expires_in_sec=60 * (cint(setting("otp_minutes")) or 5))
	messaging.send("otp_code", phone=phone, patient=members[0].name, context={"code": code})
	out = {"existing": True, "sent": True}
	if messaging.settings().message_mode != "Live" and cint(frappe.conf.developer_mode):
		out["test_code"] = code  # developer site in test mode: no provider, so the code is shown on screen
	return out


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=900)
def verify_otp(phone, code):
	phone = normalize_phone(phone)
	data = frappe.cache.get_value(_otp_key(phone))
	if not data:
		frappe.throw(_("The code has expired. Ask for a new one."))
	if data["tries"] >= 5:
		frappe.throw(_("Too many attempts. Ask for a new code."))
	if str(code).strip() != data["code"]:
		data["tries"] += 1
		frappe.cache.set_value(_otp_key(phone), data, expires_in_sec=300)
		frappe.throw(_("Wrong code."))
	frappe.cache.delete_value(_otp_key(phone))
	token = frappe.generate_hash(length=32)
	frappe.cache.set_value(f"hv_otp_ok:{token}", phone, expires_in_sec=1800)
	from hospital_vvs.messaging.whatsapp_bot import household

	return {"verified_token": token, "patients": [{"name": m.name, "patient_name": m.patient_name} for m in household(phone)]}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=600)
def public_book(data):
	_require_web_booking()
	d = frappe.parse_json(data)
	phone = normalize_phone(d.get("phone"))
	patient = d.get("patient")
	from hospital_vvs.messaging.whatsapp_bot import household

	members = household(phone)
	if members or patient:
		verified = frappe.cache.get_value(f"hv_otp_ok:{d.get('verified_token')}") if d.get("verified_token") else None
		if verified != phone:
			frappe.throw(_("Please verify your phone number first."))
		if patient and patient not in {m.name for m in members}:
			frappe.throw(_("Choose a patient registered on this phone."))
	channel = d.get("payment_channel") or "At Clinic"
	allowed = [c.strip() for c in (setting("web_payment_channels") or "At Clinic").split("\n") if c.strip()]
	if channel not in allowed:
		frappe.throw(_("This payment option is not available."))
	if channel == "Payment Proof" and not d.get("payment_proof"):
		frappe.throw(_("Attach the payment proof."))
	appt = svc.book(doctor=d["doctor"], slot=d["slot"], patient=patient, patient_name=d.get("patient_name"), phone=phone,
		source_channel="Web", payment_channel=channel, hold_key=f"web:{d.get('hold_key')}", payment_proof=d.get("payment_proof"),
		age=d.get("age"), gender=d.get("gender"))
	return {"booking_ref": appt.booking_ref, "status": appt.status, "manage_token": appt.manage_token, "date": str(appt.appointment_date),
		"time": str(appt.start_time)[:5], "doctor": appt.doctor_name, "fee": flt(appt.fee)}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=600)
def upload_proof(filename, filedata):
	"""Payment proof image from the public portal (private file, ≤ 5 MB)."""
	_require_web_booking()
	import base64

	content = base64.b64decode(filedata.split(",")[-1])
	if len(content) > 5 * 1024 * 1024:
		frappe.throw(_("File is too large (max 5 MB)."))
	if not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".pdf")):
		frappe.throw(_("Upload an image or PDF."))
	f = frappe.get_doc({"doctype": "File", "file_name": filename, "content": content, "is_private": 1}).insert(ignore_permissions=True)
	return f.file_url


def _by_token(token):
	name = frappe.db.get_value("Appointment", {"manage_token": token}) if token and len(token) >= 24 else None
	if not name:
		frappe.throw(_("Booking not found."), frappe.DoesNotExistError)
	return frappe.get_doc("Appointment", name)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def manage_get(token):
	a = _by_token(token)
	branch = frappe.db.get_value("Branch", a.branch, ["hv_address", "hv_phone"], as_dict=True) or {}
	return {"booking_ref": a.booking_ref, "patient_name": a.patient_name, "doctor": a.doctor, "doctor_name": a.doctor_name,
		"date": str(a.appointment_date), "time": str(a.start_time or "")[:5], "status": a.status, "fee": flt(a.fee),
		"payment_status": a.payment_status, "branch": a.branch, "address": branch.get("hv_address"), "phone": branch.get("hv_phone"),
		"can_change": a.status in ("Pending", "Confirmed") and getdate(a.appointment_date) >= getdate(today()),
		"clinic": settings().clinic_name}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=600)
def manage_reschedule(token, slot):
	a = _by_token(token)
	svc.reschedule(a.name, slot, by_patient=True)
	return manage_get(token)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=600)
def manage_cancel(token):
	a = _by_token(token)
	svc.cancel(a.name, by_patient=True)
	return manage_get(token)
