"""Online Visit (telemedicine) — 08-online-visit-comms.md.

Patients use a public form and a token link (no login). Staff verify the fee, accept and assign an OV doctor, share a video
link; the doctor signs a normal Prescription linked to the visit and completes it. Fees are collected by reception inside their
cashier shift (Cash / Bank Transfer / JazzCash / Easypaisa) as a POS Sales Invoice (DECISIONS D-38).
"""

import hashlib
import hmac
import secrets

import frappe
from frappe import _
from frappe.utils import add_days, add_to_date, cint, flt, get_datetime, now_datetime, today

from hospital_vvs.services import billing, messaging
from hospital_vvs.utils import branch_company, publish, setting, settings

MODE_FOR = {"Payment Proof": "Bank Transfer", "JazzCash": "JazzCash", "Easypaisa": "Easypaisa", "Bank Transfer": "Bank Transfer", "Card (online)": "Card"}


def _hash(token):
	return hashlib.sha256((token or "").encode()).hexdigest()


def branch():
	return setting("ov_branch") or setting("default_branch")


def fee_item():
	code = setting("ov_item") or "OV-CONSULT"
	if not frappe.db.exists("Item", code):
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": "Online Consultation", "item_group": "Medical Services", "stock_uom": "Nos",
			"is_stock_item": 0, "include_item_in_manufacturing": 0, "hv_billing_type": "Fee", "standard_rate": flt(setting("ov_fee"))}).insert(ignore_permissions=True)
	return code


def methods():
	return [m.strip() for m in (setting("ov_payment_methods") or "Payment Proof").split("\n") if m.strip()]


def link(token):
	return f"{frappe.utils.get_url()}/hms/online-visit/{token}"


def _notify(ov, event, **ctx):
	if not ov.messages_allowed:
		return
	messaging.send(event, phone=ov.phone, patient=ov.patient, language=ov.language, consent=True, reference_doctype="Online Visit Request",
		reference_name=ov.name, context={"first_name": (ov.patient_name or "").split(" ")[0], "ref": ov.name, **ctx})


def _log(ov, what):
	line = f"{now_datetime():%Y-%m-%d %H:%M} {what}"
	ov.db_set("access_log", ((ov.access_log or "") + "\n" + line).strip()[-4000:], update_modified=False)


# ------------------------------------------------------------------ public
def create(d, verified_phone=None):
	"""The 4-step form. A phone with registered patients must be verified (OTP) before linking one of them."""
	from hospital_vvs.hospital_vvs.doctype.patient.patient import normalize_phone

	phone = normalize_phone(d.get("phone"))
	if not phone or len(phone) < 10:
		frappe.throw(_("Enter a valid mobile number."))
	if not (d.get("complaint") or "").strip():
		frappe.throw(_("Describe the problem."))
	patient = d.get("patient")
	if patient:
		if verified_phone != phone:
			frappe.throw(_("Please verify your phone number first."))
		from hospital_vvs.messaging.whatsapp_bot import household

		if patient not in {m.name for m in household(phone)}:
			frappe.throw(_("Choose a patient registered on this phone."))
	elif not (d.get("patient_name") or "").strip():
		frappe.throw(_("Enter the patient's name."))
	method = d.get("payment_method") or methods()[0]
	if method not in methods():
		frappe.throw(_("This payment option is not available."))
	if d.get("client_ref"):
		existing = frappe.db.get_value("Online Visit Request", {"client_ref": d["client_ref"]}, "name")
		if existing:
			frappe.throw(_("This request was already sent ({0}).").format(existing))
	token = secrets.token_urlsafe(24)
	pname = frappe.db.get_value("Patient", patient, "patient_name") if patient else d.get("patient_name").strip()
	ov = frappe.get_doc({
		"doctype": "Online Visit Request", "patient": patient, "patient_name": pname, "phone": phone, "gender": d.get("gender"),
		"age": cint(d.get("age")) or None, "language": d.get("language") if d.get("language") in ("en", "ur", "ar") else "ur", "city": d.get("city"),
		"branch": branch(), "phone_verified": 1 if patient else 0, "messages_allowed": cint(d.get("messages_allowed", 1)),
		"complaint": d.get("complaint"), "symptoms": ", ".join(d.get("symptoms") or []) if isinstance(d.get("symptoms"), list) else d.get("symptoms"),
		"duration": d.get("duration"), "conditions": d.get("conditions"), "current_meds": d.get("current_meds"), "allergies_text": d.get("allergies"),
		"specialization": d.get("specialization") or None,
		"photos": [{"file_url": u} for u in (d.get("photos") or [])[:5]],
		"fee": flt(setting("ov_fee")), "payment_method": method, "payment_proof": d.get("payment_proof"), "payment_reference": d.get("payment_reference"),
		"fee_status": "Proof Submitted" if (d.get("payment_proof") or d.get("payment_reference")) else "Unpaid", "status": "Pending",
		"token_hash": _hash(token), "token_expires": add_days(now_datetime(), cint(setting("ov_link_days")) or 30), "client_ref": d.get("client_ref"),
	})
	ov.insert(ignore_permissions=True)
	attach_files(ov, [r.file_url for r in ov.photos] + [ov.payment_proof])
	_notify(ov, "ov_received", link=link(token))
	publish("ov", {"action": "new", "name": ov.name}, ov.branch)
	return ov, token


def attach_files(ov, urls):
	"""Private uploads from the public form become attachments of the request, so staff who can read it can open them."""
	for url in [u for u in urls if u]:
		name = frappe.db.get_value("File", {"file_url": url, "attached_to_name": ["is", "not set"]}, "name")
		if name:
			frappe.db.set_value("File", name, {"attached_to_doctype": ov.doctype, "attached_to_name": ov.name})


def by_token(token):
	h = _hash(token)
	name = frappe.db.get_value("Online Visit Request", {"token_hash": h}, "name") if token and len(token) >= 24 else None
	if not name:
		frappe.throw(_("This link is not valid."), frappe.DoesNotExistError)
	ov = frappe.get_doc("Online Visit Request", name)
	if not hmac.compare_digest(ov.token_hash, h):
		frappe.throw(_("This link is not valid."), frappe.DoesNotExistError)
	if ov.token_expires and get_datetime(ov.token_expires) < now_datetime():
		frappe.throw(_("This link has expired. Please call the clinic."))
	return ov


def verified(ov):
	return bool(ov.verified_until and get_datetime(ov.verified_until) > now_datetime())


def verify(ov, answer):
	"""Last 4 digits of the phone unlock the prescription for an hour; 5 wrong tries lock for 15 minutes."""
	if ov.locked_until and get_datetime(ov.locked_until) > now_datetime():
		frappe.throw(_("Too many wrong tries. Try again after 15 minutes."))
	if hmac.compare_digest(str(answer or "").strip(), (ov.phone or "")[-4:]):
		ov.db_set({"verified_until": add_to_date(now_datetime(), hours=1), "failed_attempts": 0}, update_modified=False)
		_log(ov, "verified")
		return True
	n = cint(ov.failed_attempts) + 1
	ov.db_set({"failed_attempts": 0 if n >= 5 else n, "locked_until": add_to_date(now_datetime(), minutes=15) if n >= 5 else None}, update_modified=False)
	_log(ov, "wrong answer")
	frappe.db.commit()
	frappe.throw(_("That does not match our records."))


def public_view(ov):
	s = settings()
	doc = frappe.db.get_value("Doctor", ov.assigned_doctor, ["doctor_name", "doctor_name_ur", "specialization", "qualification", "photo"], as_dict=True) if ov.assigned_doctor else None
	out = {"name": ov.name, "status": ov.status, "patient_name": ov.patient_name, "created": str(ov.creation), "fee": ov.fee, "fee_status": ov.fee_status,
		"payment_method": ov.payment_method, "doctor": doc, "scheduled_at": str(ov.scheduled_at or ""), "language": ov.language,
		"video_link": ov.video_link if ov.status == "Accepted" else None, "rejection_reason": ov.rejection_reason if ov.status == "Rejected" else None,
		"cancel_reason": ov.cancel_reason if ov.status == "Cancelled" else None, "refund_amount": ov.refund_amount, "refund_reference": ov.refund_reference,
		"completed_at": str(ov.completed_at or ""), "follow_up": ov.follow_up, "follow_up_date": str(ov.follow_up_date or ""),
		"has_prescription": bool(ov.prescription), "verified": verified(ov), "payment_instructions": s.ov_payment_instructions,
		"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "phone": s.phone}, "can_cancel": ov.status == "Pending",
		"can_pay": ov.status in ("Pending", "Accepted") and ov.fee_status == "Unpaid", "methods": methods()}
	if ov.prescription and verified(ov):
		out["prescription"] = prescription_data(ov.prescription)
	return out


def prescription_data(name):
	rx = frappe.get_doc("Prescription", name)
	doc = frappe.db.get_value("Doctor", rx.doctor, ["doctor_name", "qualification", "registration_no", "show_license"], as_dict=True) or {}
	return {"name": rx.name, "date": str(rx.prescription_date or rx.creation)[:10], "status": rx.status, "doctor": doc.get("doctor_name"),
		"qualification": doc.get("qualification"), "registration_no": doc.get("registration_no") if doc.get("show_license") else None,
		"medicines": [{"item_name": m.item_name, "dose": m.dose, "frequency": m.frequency, "duration": m.duration, "route": m.get("route"),
			"instructions": m.get("instructions")} for m in rx.medicines],
		"diagnoses": [d.diagnosis_name or d.diagnosis for d in rx.diagnoses], "lab_tests": [t.test_name for t in rx.lab_tests], "advice": rx.advice,
		"follow_up_date": str(rx.follow_up_date or "")}


def patient_pay(ov, method, payment_reference=None, payment_proof=None):
	if ov.fee_status not in ("Unpaid",):
		frappe.throw(_("The fee is already {0}.").format(ov.fee_status.lower()))
	if method not in methods():
		frappe.throw(_("This payment option is not available."))
	if not (payment_reference or payment_proof):
		frappe.throw(_("Enter the transaction ID or attach the receipt."))
	ov.db_set({"payment_method": method, "payment_reference": payment_reference, "payment_proof": payment_proof, "fee_status": "Proof Submitted"})
	attach_files(ov, [payment_proof])
	publish("ov", {"action": "proof", "name": ov.name}, ov.branch)


def patient_cancel(ov, reason=None):
	if ov.status != "Pending":
		frappe.throw(_("Only a request that is still waiting can be cancelled here. Please call the clinic."))
	ov.db_set({"status": "Cancelled", "cancel_reason": reason or _("Cancelled by the patient")})
	_notify(ov, "ov_cancelled")
	publish("ov", {"action": "cancelled", "name": ov.name}, ov.branch)


# ------------------------------------------------------------------ staff
def get_open(name, states=("Pending", "Accepted")):
	ov = frappe.get_doc("Online Visit Request", name)
	if ov.status not in states:
		frappe.throw(_("Online visit {0} is {1}.").format(ov.name, ov.status))
	return ov


def ensure_patient(ov):
	"""Accepting needs a patient record: link the one verified on the form, or register a new one at the online branch."""
	if ov.patient:
		return ov.patient
	from hospital_vvs.hospital_vvs.doctype.patient.patient import dob_from_age

	p = frappe.get_doc({"doctype": "Patient", "patient_name": ov.patient_name, "gender": ov.gender or "Other", "phone": ov.phone, "branch": ov.branch,
		"dob": dob_from_age(ov.age) if ov.age else None, "dob_estimated": 1 if ov.age else 0, "city": ov.city, "preferred_language": ov.language,
		"duplicate_reason": _("Registered from online visit {0}").format(ov.name)})
	p.insert(ignore_permissions=True)
	ov.db_set("patient", p.name)
	return p.name


def fee_modes():
	return [m.strip() for m in (setting("ov_fee_modes") or "Cash\nBank Transfer\nJazzCash\nEasypaisa").split("\n") if m.strip()]


def verify_fee(name, ok=True, note=None, payment_reference=None, payment_mode=None, payments=None):
	"""Reception confirms the transfer (or takes the fee at the desk) inside their cashier shift: a POS Sales Invoice (Fee) paid by
	Cash / Bank Transfer / JazzCash / Easypaisa, counted in the shift like OPD and IPD money (DECISIONS D-38, replaces D-35)."""
	ov = get_open(name, ("Pending", "Accepted", "Completed"))
	if ov.fee_status == "Verified":
		return ov
	if not cint(ok):
		ov.db_set({"fee_status": "Unpaid", "payment_proof": None})
		frappe.get_doc({"doctype": "Comment", "comment_type": "Comment", "reference_doctype": ov.doctype, "reference_name": ov.name,
			"content": _("Payment not found: {0}").format(note or "")}).insert(ignore_permissions=True)
		return ov
	mode = payment_mode or MODE_FOR.get(ov.payment_method, "Bank Transfer")
	if mode not in fee_modes():
		frappe.throw(_("Choose one of: {0}").format(", ".join(fee_modes())))
	if payment_reference:
		ov.payment_reference = payment_reference
	if mode != "Cash" and not ov.payment_reference:
		frappe.throw(_("Enter the transaction ID."))
	patient = ensure_patient(ov)
	customer = frappe.db.get_value("Patient", patient, "customer")
	from hospital_vvs.services.shifts import billing_shift

	shift = billing_shift(ov.branch)
	si = billing.create_invoice(customer=customer, patient=patient, lines=[{"item_code": fee_item(), "qty": 1, "rate": flt(ov.fee)}], billing_type="Fee",
		branch=ov.branch, reference_doctype="Online Visit Request", reference_name=ov.name, pos=True, payment_mode=mode, payments=payments,
		remarks=_("Online visit {0}{1}").format(ov.name, f" · ref {ov.payment_reference}" if ov.payment_reference else ""))
	ov.update({"fee_status": "Verified", "fee_verified_by": frappe.session.user, "fee_verified_at": now_datetime(), "sales_invoice": si,
		"payment_entry": None, "payment_method": ov.payment_method if mode != "Cash" else ov.payment_method})
	ov.save(ignore_permissions=True)
	publish("ov", {"action": "fee", "name": ov.name, "shift": shift.name if shift else None}, ov.branch)
	return ov


def video_link():
	if (setting("ov_video_provider") or "").startswith("Jitsi"):
		base = (setting("ov_video_base") or "https://meet.jit.si/").rstrip("/") + "/"
		return f"{base}VVS-{secrets.token_hex(6)}"
	return None


def accept(name, doctor, scheduled_at=None, link_url=None):
	ov = get_open(name, ("Pending",))
	if not frappe.db.get_value("Doctor", doctor, "is_active"):
		frappe.throw(_("Choose an active doctor."))
	patient = ensure_patient(ov)
	ov.update({"patient": patient, "status": "Accepted", "assigned_doctor": doctor, "scheduled_at": scheduled_at or add_to_date(now_datetime(), minutes=30),
		"video_link": link_url or ov.video_link or video_link(), "accepted_by": frappe.session.user, "accepted_at": now_datetime()})
	ov.save(ignore_permissions=True)
	dname = frappe.db.get_value("Doctor", doctor, "doctor_name")
	_notify(ov, "ov_accepted", doctor=dname, date=frappe.utils.format_datetime(ov.scheduled_at, "dd MMM"),
		time=frappe.utils.format_datetime(ov.scheduled_at, "hh:mm a"), link=ov.video_link or "")
	publish("ov", {"action": "accepted", "name": ov.name, "doctor": doctor}, ov.branch)
	return ov


def update_visit(name, scheduled_at=None, link_url=None, doctor=None):
	ov = get_open(name, ("Accepted",))
	if scheduled_at:
		ov.scheduled_at = scheduled_at
	if link_url:
		ov.video_link = link_url
	if doctor:
		ov.assigned_doctor = doctor
	ov.save(ignore_permissions=True)
	_notify(ov, "ov_accepted", doctor=frappe.db.get_value("Doctor", ov.assigned_doctor, "doctor_name"),
		date=frappe.utils.format_datetime(ov.scheduled_at, "dd MMM"), time=frappe.utils.format_datetime(ov.scheduled_at, "hh:mm a"), link=ov.video_link or "")
	publish("ov", {"action": "updated", "name": ov.name}, ov.branch)
	return ov


def reject(name, reason):
	if not (reason or "").strip():
		frappe.throw(_("Enter the reason."))
	ov = get_open(name, ("Pending",))
	ov.update({"status": "Rejected", "rejection_reason": reason})
	ov.save(ignore_permissions=True)
	_notify(ov, "ov_rejected")
	publish("ov", {"action": "rejected", "name": ov.name}, ov.branch)
	return ov


def cancel(name, reason):
	if not (reason or "").strip():
		frappe.throw(_("Enter the reason."))
	ov = get_open(name, ("Pending", "Accepted"))
	ov.update({"status": "Cancelled", "cancel_reason": reason})
	ov.save(ignore_permissions=True)
	_notify(ov, "ov_cancelled")
	publish("ov", {"action": "cancelled", "name": ov.name}, ov.branch)
	return ov


def complete(name, doctor_notes=None, follow_up=None, follow_up_date=None):
	ov = get_open(name, ("Accepted",))
	if not ov.prescription and not (follow_up == "Visit the clinic" and (doctor_notes or "").strip()):
		frappe.throw(_("Sign the prescription for this visit first (or note why the patient must visit the clinic)."))
	if ov.prescription and frappe.db.get_value("Prescription", ov.prescription, "docstatus") != 1:
		frappe.throw(_("The prescription is not signed yet."))
	ov.update({"status": "Completed", "completed_at": now_datetime(), "doctor_notes": doctor_notes or ov.doctor_notes, "follow_up": follow_up,
		"follow_up_date": follow_up_date})
	ov.save(ignore_permissions=True)
	_notify(ov, "ov_completed")
	publish("ov", {"action": "completed", "name": ov.name}, ov.branch)
	return ov


def refund(name, amount=None, refund_reference=None, refund_notes=None, payment_mode=None):
	"""Cancelled / rejected visit: reception refunds the fee from their shift (credit note on the fee invoice), or just records it when
	the fee was never posted."""
	ov = frappe.get_doc("Online Visit Request", name)
	if ov.status not in ("Cancelled", "Rejected"):
		frappe.throw(_("Cancel or reject the visit before refunding."))
	if ov.fee_status == "Refunded":
		frappe.throw(_("Already refunded."))
	amount = flt(amount) or flt(ov.fee)
	if ov.fee_status == "Verified" and ov.sales_invoice:
		if amount > flt(ov.fee) + 0.01:
			frappe.throw(_("Refund cannot be more than the fee."))
		mode = payment_mode or frappe.db.get_value("Sales Invoice Payment", {"parent": ov.sales_invoice}, "mode_of_payment") or "Cash"
		if mode != "Cash" and not (refund_reference or "").strip():
			frappe.throw(_("Enter the refund transaction ID."))
		if amount < flt(ov.fee) - 0.01:
			frappe.throw(_("Part refunds of the online fee are not supported; refund the full fee."))
		ov.credit_note = billing.refund_invoice(ov.sales_invoice, refund_notes or _("Online visit {0} {1}").format(ov.name, ov.status.lower()),
			payment_mode=mode)
	elif ov.fee_status not in ("Proof Submitted", "Verified"):
		frappe.throw(_("No fee was paid for this visit."))
	ov.update({"fee_status": "Refunded", "refund_amount": amount, "refund_reference": refund_reference, "refund_notes": refund_notes})
	ov.save(ignore_permissions=True)
	_notify(ov, "ov_refunded", amount=frappe.format_value(amount, "Currency"))
	publish("ov", {"action": "refunded", "name": ov.name}, ov.branch)
	return ov


def on_prescription_signed(rx):
	"""hv_on_prescription_signed hook: link the signed prescription to its online visit."""
	if rx.get("online_visit"):
		frappe.db.set_value("Online Visit Request", rx.online_visit, "prescription", rx.name)
		publish("ov", {"action": "prescription", "name": rx.online_visit}, rx.branch)
