"""Online Visit API: public form + token page (guest, rate-limited, no-store) and the staff / doctor dashboard (/ov-staff)."""

import random

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.services import messaging
from hospital_vvs.services import online_visit as svc
from hospital_vvs.utils import has_any_role, log_access, module_enabled, require_roles, setting, settings

STAFF = (R.OV_STAFF,)
MONEY = (R.RECEPTIONIST, R.CASH_SUPERVISOR)
DOCS = (R.OV_DOCTOR,)


def _on():
	if not module_enabled("enable_online_visit"):
		frappe.throw(_("Online visits are not available right now. Please call the clinic."))


# ------------------------------------------------------------------ public
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def form_context():
	_on()
	s = settings()
	specs = frappe.get_all("Doctor", filters={"is_active": 1, "online_visits": 1}, pluck="specialization", distinct=True)
	return {"fee": s.ov_fee, "methods": svc.methods(), "instructions": s.ov_payment_instructions, "specializations": [x for x in specs if x],
		"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "name_ar": s.clinic_name_ar, "phone": s.phone, "logo": s.logo},
		"doctors": frappe.get_all("Doctor", filters={"is_active": 1, "online_visits": 1}, fields=["doctor_name", "doctor_name_ur", "specialization",
			"qualification", "photo"], order_by="doctor_name")}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=900)
def request_otp(phone):
	"""Phones with registered patients are verified before the household is shown (same code flow as web booking)."""
	_on()
	from hospital_vvs.api.appointments import _otp_key
	from hospital_vvs.hospital_vvs.doctype.patient.patient import normalize_phone
	from hospital_vvs.messaging.whatsapp_bot import household

	phone = normalize_phone(phone)
	members = household(phone)
	if not members:
		return {"existing": False}
	code = f"{random.SystemRandom().randint(0, 999999):06d}"
	frappe.cache.set_value(_otp_key(phone), {"code": code, "tries": 0}, expires_in_sec=60 * (cint(setting("otp_minutes")) or 5))
	messaging.send("otp_code", phone=phone, patient=members[0].name, context={"code": code})
	out = {"existing": True, "sent": True}
	if messaging.settings().message_mode != "Live" and cint(frappe.conf.developer_mode):
		out["test_code"] = code
	return out


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=900)
def verify_otp(phone, code):
	_on()
	from hospital_vvs.api.appointments import verify_otp as _verify

	return _verify(phone, code)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=600)
def upload(filename, filedata):
	"""Photo or payment receipt from the public form (private file, ≤ 5 MB, images / PDF)."""
	_on()
	import base64

	content = base64.b64decode(filedata.split(",")[-1])
	if len(content) > 5 * 1024 * 1024:
		frappe.throw(_("File is too large (max 5 MB)."))
	if not filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".pdf", ".heic")):
		frappe.throw(_("Upload an image or PDF."))
	f = frappe.get_doc({"doctype": "File", "file_name": filename, "content": content, "is_private": 1}).insert(ignore_permissions=True)
	return f.file_url


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=600)
def submit(data):
	_on()
	d = frappe.parse_json(data)
	verified = frappe.cache.get_value(f"hv_otp_ok:{d.get('verified_token')}") if d.get("verified_token") else None
	ov, token = svc.create(d, verified)
	return {"name": ov.name, "token": token}


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def status(token):
	ov = svc.by_token(token)
	return svc.public_view(ov)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=20, seconds=900)
def verify(token, answer):
	ov = svc.by_token(token)
	svc.verify(ov, answer)
	ov.reload()
	return svc.public_view(ov)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=600)
def pay(token, payment_method, payment_reference=None, payment_proof=None):
	ov = svc.by_token(token)
	svc.patient_pay(ov, payment_method, payment_reference, payment_proof)
	ov.reload()
	return svc.public_view(ov)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=600)
def pay_card(token):
	"""Card payment link for the online visit fee (gateway or mock page, D-47)."""
	from hospital_vvs.services import gateway

	ov = svc.by_token(token)
	return gateway.start("Online Visit Request", ov.name, return_url=frappe.utils.get_url(f"/hms/online-visit/{token}"))


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=600)
def cancel_request(token, reason=None):
	ov = svc.by_token(token)
	svc.patient_cancel(ov, reason)
	ov.reload()
	return svc.public_view(ov)


# ------------------------------------------------------------------ staff / doctor dashboard
def _my_doctor():
	return frappe.db.get_value("Doctor", {"user": frappe.session.user, "is_active": 1}, "name")


def _can_open(ov):
	if has_any_role(*STAFF, *MONEY):
		return
	if has_any_role(*DOCS) and ov.assigned_doctor and ov.assigned_doctor == _my_doctor():
		return
	frappe.throw(_("This online visit is assigned to another doctor."), frappe.PermissionError)


@frappe.whitelist()
def queue(status=None, date=None, mine=0):
	require_roles(*STAFF, *DOCS, *MONEY)
	filters = {}
	if status == "open":
		filters["status"] = ["in", ["Pending", "Accepted"]]
	elif status:
		filters["status"] = status
	if date:
		filters["creation"] = [">=", date]
	if cint(mine) or not has_any_role(*STAFF, *MONEY):
		filters["assigned_doctor"] = _my_doctor() or "-"
	rows = frappe.get_all("Online Visit Request", filters=filters, fields=["name", "patient", "patient_name", "phone", "gender", "age", "language", "city",
		"complaint", "status", "fee", "fee_status", "payment_method", "assigned_doctor", "scheduled_at", "video_link", "prescription", "creation",
		"accepted_at", "completed_at", "specialization"], order_by="creation desc", limit=300)
	docs = {d.name: d.doctor_name for d in frappe.get_all("Doctor", fields=["name", "doctor_name"])}
	for r in rows:
		r["doctor_name"] = docs.get(r.assigned_doctor)
	counts = {s: frappe.db.count("Online Visit Request", {"status": s}) for s in ("Pending", "Accepted")}
	counts["today_done"] = frappe.db.count("Online Visit Request", {"status": "Completed", "completed_at": [">=", today()]})
	counts["fee_to_check"] = frappe.db.count("Online Visit Request", {"fee_status": "Proof Submitted", "status": ["in", ["Pending", "Accepted", "Completed"]]})
	counts["refunds_due"] = frappe.db.count("Online Visit Request", {"status": ["in", ["Cancelled", "Rejected"]], "fee_status": ["in", ["Verified", "Proof Submitted"]]})
	return {"rows": rows, "counts": counts, "my_doctor": _my_doctor(), "is_staff": has_any_role(*STAFF), "is_cashier": has_any_role(*MONEY),
		"fee_modes": svc.fee_modes(),
		"doctors": frappe.get_all("Doctor", filters={"is_active": 1, "online_visits": 1}, fields=["name", "doctor_name", "specialization", "user"], order_by="doctor_name")}


@frappe.whitelist()
def get(name):
	require_roles(*STAFF, *DOCS, *MONEY)
	ov = frappe.get_doc("Online Visit Request", name)
	_can_open(ov)
	log_access("Online visit", patient=ov.patient, reference_doctype=ov.doctype, reference_name=ov.name, branch=ov.branch)
	out = ov.as_dict()
	for k in ("token_hash", "access_log"):
		out.pop(k, None)
	out["doctor_name"] = frappe.db.get_value("Doctor", ov.assigned_doctor, "doctor_name") if ov.assigned_doctor else None
	out["prescription_data"] = svc.prescription_data(ov.prescription) if ov.prescription else None
	out["draft_prescription"] = frappe.db.get_value("Prescription", {"online_visit": ov.name, "docstatus": 0}, "name")
	if ov.patient:
		out["history"] = frappe.get_all("Online Visit Request", filters={"patient": ov.patient, "name": ["!=", ov.name]}, fields=["name", "status",
			"complaint", "creation"], order_by="creation desc", limit=5)
		out["allergies"] = [a.allergy for a in frappe.get_all("Patient Allergy", filters={"parent": ov.patient, "parenttype": "Patient"}, fields=["allergy"])]
	return out


@frappe.whitelist(methods=["POST"])
def verify_fee(name, ok=1, note=None, payment_reference=None, payment_mode=None):
	"""Posting the fee is money: reception in their shift. The online desk may only mark a transfer as not found."""
	require_roles(*MONEY) if cint(ok) else require_roles(*MONEY, *STAFF)
	return svc.verify_fee(name, ok, note, payment_reference, payment_mode).status


@frappe.whitelist(methods=["POST"])
def accept(name, doctor, scheduled_at=None, video_link=None):
	require_roles(*STAFF)
	return svc.accept(name, doctor, scheduled_at, video_link).name


@frappe.whitelist(methods=["POST"])
def update_visit(name, scheduled_at=None, video_link=None, doctor=None):
	require_roles(*STAFF, *DOCS)
	ov = frappe.get_doc("Online Visit Request", name)
	_can_open(ov)
	if doctor and not has_any_role(*STAFF):
		doctor = None
	return svc.update_visit(name, scheduled_at, video_link, doctor).name


@frappe.whitelist(methods=["POST"])
def reject(name, reason):
	require_roles(*STAFF)
	return svc.reject(name, reason).name


@frappe.whitelist(methods=["POST"])
def cancel(name, reason):
	require_roles(*STAFF)
	return svc.cancel(name, reason).name


@frappe.whitelist(methods=["POST"])
def complete(name, doctor_notes=None, follow_up=None, follow_up_date=None):
	require_roles(*DOCS, *STAFF)
	ov = frappe.get_doc("Online Visit Request", name)
	_can_open(ov)
	return svc.complete(name, doctor_notes, follow_up, follow_up_date).name


@frappe.whitelist(methods=["POST"])
def refund(name, amount=None, refund_reference=None, refund_notes=None, payment_mode=None):
	require_roles(*MONEY)
	return svc.refund(name, amount, refund_reference, refund_notes, payment_mode).name


@frappe.whitelist()
def report(from_date=None, to_date=None):
	require_roles(*STAFF, *MONEY, R.ACCOUNTANT)
	to_date = to_date or today()
	from_date = from_date or frappe.utils.add_days(to_date, -29)
	rows = frappe.db.sql("""select status, count(*) n, sum(case when fee_status='Verified' then fee else 0 end) fees,
		sum(ifnull(refund_amount,0)) refunds, avg(timestampdiff(minute, creation, ifnull(accepted_at, now()))) wait
		from `tabOnline Visit Request` where date(creation) between %s and %s group by status""", (from_date, to_date), as_dict=True)
	by_doctor = frappe.db.sql("""select d.doctor_name, count(*) n, sum(o.status='Completed') done from `tabOnline Visit Request` o
		join tabDoctor d on d.name=o.assigned_doctor where date(o.creation) between %s and %s group by d.doctor_name order by n desc""",
		(from_date, to_date), as_dict=True)
	return {"from": str(from_date), "to": str(to_date), "by_status": rows, "by_doctor": by_doctor, "now": str(now_datetime())}
