"""Radiology & Imaging (D-91): X-ray, ultrasound and Doppler — booking, worklist, reporting, signed reports, patient portal.

One Imaging Study = one scan, from booking to delivery:
  Booked → Registered (arrival, token) → In Progress (scan) → Scanned (image quality checked) → Reporting (draft /
  preliminary) → Verified (final report, digitally signed) → Delivered (downloaded, printed or handed over).
Final reports are signed with an HMAC over the report text and version; the QR on the print opens the public check page.
Addenda after sign-off bump the version, re-sign and keep the earlier text in the timeline (audit).
Messages never carry findings: only the booking ID, time, preparation and the portal link.
"""

import hashlib
import hmac
import json
import random
import secrets
import string

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, getdate, now_datetime, today, escape_html as esc

from hospital_vvs import roles as R
from hospital_vvs.hospital_vvs.doctype.patient.patient import normalize_phone
from hospital_vvs.services import billing, messaging
from hospital_vvs.utils import default_branch, has_any_role, log_access, publish

ITEM_GROUP = "Imaging Services"
BILLING_TYPE = "General"
OPEN_STATUSES = ("Booked", "Registered", "In Progress", "Scanned", "Reporting")
DONE_STATUSES = ("Verified", "Delivered")
PORTAL_PATH = "/hms/site/radiology/reports"

# Department hours and capacity per modality [confirm with the department]. X-ray is 24/7 and takes walk-ins.
HOURS = {
	"X-Ray": {"open": "00:00", "close": "24:00", "slot": 15, "capacity": 3, "days": "Mon Tue Wed Thu Fri Sat Sun", "walk_in": 1},
	"Ultrasound": {"open": "09:00", "close": "21:00", "slot": 20, "capacity": 2, "days": "Mon Tue Wed Thu Fri Sat", "walk_in": 0},
	"Doppler": {"open": "10:00", "close": "18:00", "slot": 30, "capacity": 1, "days": "Mon Tue Wed Thu Fri Sat", "walk_in": 0},
}
TOKEN_PREFIX = {"X-Ray": "X", "Ultrasound": "U", "Doppler": "D"}
PREP = {
	"None": "No special preparation. Bring your CNIC, the doctor's slip and any earlier reports.",
	"Fasting": "Do not eat for 6-8 hours before the scan. Plain water and your usual medicines are fine.",
	"Full Bladder": "Drink 4-6 glasses of water 1 hour before the scan and do not pass urine until it is done.",
	"Fasting + Full Bladder": "Do not eat for 6-8 hours, then drink 4-6 glasses of water 1 hour before and do not pass urine.",
	"Metal Removal": "Remove jewellery and metal objects. Tell the radiographer if you are or might be pregnant.",
	"Contrast": "Follow the fasting time you were given, and tell us about any allergy, asthma or kidney problem.",
	"Pregnancy": "No special preparation. Bring your earlier pregnancy scans and antenatal card.",
}


# ------------------------------------------------------------------ helpers
def _now():
	return now_datetime()


def event(doc, status, note=None):
	doc.append("events", {"status": status, "note": (note or "")[:500], "by_user": frappe.session.user, "at": _now()})


def doctor_of(user=None):
	return frappe.db.get_value("Doctor", {"user": user or frappe.session.user}, "name")


def proc(name):
	if not name or not frappe.db.exists("Imaging Procedure", name):
		frappe.throw(_("Choose a scan from the list."))
	return frappe.get_cached_doc("Imaging Procedure", name)


def prep_text(p):
	return (p.preparation or PREP.get(p.prep_group or "None") or PREP["None"]).strip()


def ensure_item(p):
	"""Each procedure is billed through a non-stock Item (created on first use, priced from the catalogue)."""
	if not frappe.db.exists("Item Group", ITEM_GROUP):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": ITEM_GROUP, "parent_item_group": "All Item Groups"}).insert(ignore_permissions=True)
	code = f"IMG-{(p.code or p.name)}".upper().replace(" ", "-")[:140]
	if not frappe.db.exists("Item", code):
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": p.procedure_name[:140], "item_group": ITEM_GROUP, "stock_uom": "Nos",
			"is_stock_item": 0, "include_item_in_manufacturing": 0}).insert(ignore_permissions=True)
	if p.item != code:
		frappe.db.set_value("Imaging Procedure", p.name, "item", code, update_modified=False)
	return code


def _booking_ref():
	alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	for _i in range(20):
		ref = "IMG-" + "".join(random.SystemRandom().choice(alphabet) for _ in range(6))
		if not frappe.db.exists("Imaging Study", {"booking_ref": ref}):
			return ref
	frappe.throw(_("Could not create a booking ID. Try again."))


def _hhmm(t):
	s = str(t or "")
	return s[:5] if len(s) >= 5 and s[1] != ":" else ("0" + s[:4] if s else "")


def _mins(hhmm):
	h, m = hhmm.split(":")[:2]
	return int(h) * 60 + int(m)


# ------------------------------------------------------------------ availability
def slots(procedure, date):
	"""Free slots for a procedure on a date: [{time, free}] (capacity per modality minus live bookings)."""
	p = proc(procedure)
	h = HOURS[p.modality]
	d = getdate(date)
	if d < getdate(today()) or (d - getdate(today())).days > 60:
		return {"slots": [], "walk_in": h["walk_in"], "closed": True}
	if d.strftime("%a") not in h["days"].split():
		return {"slots": [], "walk_in": h["walk_in"], "closed": True}
	booked = {}
	for r in frappe.db.sql("""select slot_time, count(*) n from `tabImaging Study` where scheduled_date=%s and modality=%s and walk_in=0
		and status not in ('Cancelled','No Show') and slot_time is not null group by slot_time""", (d, p.modality), as_dict=True):
		booked[_hhmm(r.slot_time)] = r.n
	start, end, step = _mins(h["open"]), _mins(h["close"]), h["slot"]
	if p.modality == "X-Ray":
		start, end = max(start, 8 * 60), min(end, 22 * 60)  # booked X-ray slots by day; nights are walk-in / emergency
	now = _now()
	out = []
	for m in range(start, end - max(step, cint(p.duration_min) or step) + 1, step):
		t = f"{m // 60:02d}:{m % 60:02d}"
		if d == now.date() and m <= now.hour * 60 + now.minute + 30:
			continue
		out.append({"time": t, "free": max(0, h["capacity"] - booked.get(t, 0))})
	return {"slots": out, "walk_in": h["walk_in"], "closed": False, "hours": f"{h['open']}-{h['close']}"}


def dates(procedure, days=21):
	p = proc(procedure)
	out = []
	for i in range(days):
		d = add_to_date(getdate(today()), days=i)
		s = slots(p.name, d)
		out.append({"date": str(d), "free": sum(x["free"] for x in s["slots"]), "closed": s["closed"]})
	return out


# ------------------------------------------------------------------ booking (public + staff)
def _match_patient(mr, phone):
	"""Link the record only when the MR number and the mobile agree (no record is ever exposed on a guess)."""
	if not mr:
		return None
	row = frappe.db.get_value("Patient", {"name": mr.strip().upper(), "disabled": 0}, ["name", "phone"], as_dict=True) \
		or frappe.db.get_value("Patient", {"legacy_mr_no": mr.strip(), "disabled": 0}, ["name", "phone"], as_dict=True)
	if row and phone and normalize_phone(row.phone or "")[-10:] == normalize_phone(phone)[-10:]:
		return row.name
	return None


def _save_upload(doc, file_name, file_data):
	import base64

	from frappe.utils.file_manager import save_file

	ext = (file_name or "").lower().rsplit(".", 1)[-1]
	if ext not in ("pdf", "jpg", "jpeg", "png", "webp"):
		frappe.throw(_("Upload the prescription as a photo (JPG / PNG) or a PDF."))
	raw = base64.b64decode((file_data or "").split(",", 1)[-1])
	if len(raw) > 5 * 1024 * 1024:
		frappe.throw(_("The file is larger than 5 MB."))
	f = save_file(f"rx-{doc.name}.{ext}", raw, "Imaging Study", doc.name, is_private=1)
	doc.db_set("prescription_file", f.file_url)


def book(d, source="Online", staff=False):
	"""Create a study from the booking form (or a staff order). Returns the study."""
	p = proc(d.get("procedure"))
	if not cint(p.is_active) or (not staff and not cint(p.show_on_website)):
		frappe.throw(_("This scan cannot be booked online. Please call radiology."))
	name = " ".join(str(d.get("patient_name") or "").split())[:140]
	phone = normalize_phone(d.get("phone") or "")
	if not staff and (len(name) < 3 or len(phone) < 12):
		frappe.throw(_("Enter the patient's name and a valid mobile number."))
	gender = d.get("gender") if d.get("gender") in ("Male", "Female", "Other") else None
	if cint(p.female_only) and gender == "Male":
		frappe.throw(_("{0} is for female patients.").format(p.procedure_name))
	walk_in = cint(d.get("walk_in"))
	if walk_in and not (HOURS[p.modality]["walk_in"] or staff):
		frappe.throw(_("{0} needs an appointment time.").format(p.modality))
	date = getdate(d.get("date") or today())
	t = _hhmm(d.get("time")) if not walk_in else None
	if not walk_in and not staff:
		free = {x["time"]: x["free"] for x in slots(p.name, date)["slots"]}
		if not free.get(t):
			frappe.throw(_("That time has just been taken. Please choose another slot."))
	patient = d.get("patient") if staff and d.get("patient") else _match_patient(d.get("mr"), phone)
	pay = d.get("payment_option") if d.get("payment_option") in ("Pay at counter", "Pay online", "Insurance / Panel") else "Pay at counter"
	doc = frappe.get_doc({
		"doctype": "Imaging Study", "status": "Booked", "priority": d.get("priority") if staff and d.get("priority") in ("Routine", "Urgent", "Emergency") else "Routine",
		"procedure": p.name, "branch": d.get("branch") or default_branch() or frappe.db.get_value("Branch", {}, "name"), "booking_source": source,
		"scheduled_date": date, "slot_time": t, "walk_in": walk_in, "booking_ref": _booking_ref(), "patient": patient, "patient_name": name or d.get("patient_name"),
		"gender": gender, "age": cint(d.get("age")) or None, "phone": phone, "cnic": (d.get("cnic") or "")[:20], "mr_given": (d.get("mr") or "")[:40],
		"pregnancy_status": d.get("pregnancy_status") or ("Not applicable" if gender != "Female" else ""),
		"lmp": d.get("lmp") or None, "referring_doctor": d.get("referring_doctor") if d.get("referring_doctor") and frappe.db.exists("Doctor", d.get("referring_doctor")) else None,
		"external_referrer": (d.get("external_referrer") or "")[:140], "clinical_notes": (d.get("clinical_notes") or "")[:1500],
		"payment_option": pay, "payment_status": "Panel Pending" if pay == "Insurance / Panel" else "Unpaid", "amount": flt(p.price),
		"policy_no": (d.get("policy_no") or "")[:60], "ward_location": (d.get("ward_location") or "")[:80], "whatsapp_opt_in": 1 if d.get("consent", 1) else 0,
		"report_status": "Not Started", "report_template": p.default_template,
	})
	if pay == "Insurance / Panel" and d.get("panel") and frappe.db.exists("Customer", d.get("panel")):
		doc.panel = d.get("panel")
	event(doc, "Booked", _("{0} booking").format(source))
	doc.insert(ignore_permissions=True)
	if d.get("file_data"):
		_save_upload(doc, d.get("file_name"), d.get("file_data"))
	if doc.whatsapp_opt_in and doc.phone:
		messaging.send("radiology_booked", phone=doc.phone, patient=doc.patient, consent=True, reference_doctype="Imaging Study", reference_name=doc.name,
			context={"first_name": (name.split() or [""])[0], "ref": doc.booking_ref, "date": frappe.utils.formatdate(date, "dd MMM yyyy"),
				"time": _("walk-in") if walk_in else frappe.utils.format_time(t, "hh:mm a"), "prep": prep_text(p)})
	publish("radiology", {"action": "booked", "name": doc.name}, doc.branch)
	return doc


def booking_summary(doc):
	p = proc(doc.procedure)
	return {"name": doc.name, "booking_ref": doc.booking_ref, "procedure": p.procedure_name, "modality": p.modality, "date": str(doc.scheduled_date),
		"time": _hhmm(doc.slot_time) if doc.slot_time else None, "walk_in": cint(doc.walk_in), "duration": cint(p.duration_min), "price": flt(p.price),
		"preparation": prep_text(p), "payment_option": doc.payment_option, "payment_status": doc.payment_status, "patient_name": doc.patient_name,
		"portal": frappe.utils.get_url(PORTAL_PATH), "location": "Radiology & Imaging, 2nd floor — follow the blue Radiology signs"}


# ------------------------------------------------------------------ patient record + billing
def ensure_patient(doc):
	if doc.patient:
		return doc.patient
	from hospital_vvs.hospital_vvs.doctype.patient.patient import dob_from_age

	existing = _match_patient(doc.mr_given, doc.phone)
	if existing:
		doc.db_set("patient", existing)
		return existing
	p = frappe.get_doc({"doctype": "Patient", "patient_name": doc.patient_name, "gender": doc.gender or "Other", "phone": doc.phone, "branch": doc.branch,
		"dob": dob_from_age(doc.age) if doc.age else None, "dob_estimated": 1 if doc.age else 0,
		"duplicate_reason": _("Registered from imaging booking {0}").format(doc.booking_ref)})
	p.insert(ignore_permissions=True)
	doc.db_set("patient", p.name)
	return p.name


def _token(doc):
	pre = TOKEN_PREFIX.get(doc.modality, "R")
	n = frappe.db.count("Imaging Study", {"scheduled_date": doc.scheduled_date, "modality": doc.modality, "token_no": ["is", "set"]}) + 1
	return f"{pre}-{n:03d}"


def register(name, patient=None):
	"""Arrival at the radiology reception: link / create the patient record and give a token."""
	doc = frappe.get_doc("Imaging Study", name)
	if doc.status not in ("Booked",):
		frappe.throw(_("This study is already {0}.").format(doc.status))
	if patient:
		doc.patient = patient
		doc.save(ignore_permissions=True)
	ensure_patient(doc)
	doc.reload()
	if getdate(doc.scheduled_date) != getdate(today()):
		doc.scheduled_date = today()
	doc.status, doc.registered_at, doc.token_no = "Registered", _now(), doc.token_no or _token(doc)
	event(doc, "Registered", _("Token {0}").format(doc.token_no))
	doc.save(ignore_permissions=True)
	publish("radiology", {"action": "registered", "name": doc.name}, doc.branch)
	return doc


def bill(name, payment_mode="Cash", payments=None):
	"""Counter payment (inside the cashier's shift) or a panel / insurer credit bill."""
	doc = frappe.get_doc("Imaging Study", name)
	if doc.payment_status in ("Paid", "Panel Approved", "Waived"):
		return doc
	patient = ensure_patient(doc)
	doc.reload()
	p = proc(doc.procedure)
	lines = [{"item_code": ensure_item(p), "qty": 1, "rate": flt(doc.amount or p.price), "description": p.procedure_name}]
	if doc.payment_option == "Insurance / Panel":
		if not doc.panel:
			frappe.throw(_("Choose the panel / insurer first."))
		si = billing.create_invoice(customer=doc.panel, patient=patient, lines=lines, billing_type=BILLING_TYPE, branch=doc.branch, reference_doctype="Imaging Study",
			reference_name=doc.name, pos=False, payer=True, remarks=_("Imaging {0} · {1} · policy {2}").format(doc.name, p.procedure_name, doc.policy_no or "-"))
		doc.payment_status = "Panel Approved"
	else:
		customer = frappe.db.get_value("Patient", patient, "customer")
		si = billing.create_invoice(customer=customer, patient=patient, lines=lines, billing_type=BILLING_TYPE, branch=doc.branch, reference_doctype="Imaging Study",
			reference_name=doc.name, payment_mode=payment_mode, payments=payments)
		doc.payment_status = "Paid"
	doc.sales_invoice = si
	event(doc, "Billed", f"{doc.payment_status} · {si}")
	doc.save(ignore_permissions=True)
	return doc


def set_panel(name, panel, policy_no=None):
	doc = frappe.get_doc("Imaging Study", name)
	doc.payment_option, doc.panel, doc.policy_no, doc.payment_status = "Insurance / Panel", panel, policy_no, "Panel Pending"
	doc.save(ignore_permissions=True)
	return doc


# ------------------------------------------------------------------ scan room
def start(name, consent=0, safety=0, pregnancy_status=None, override=None):
	doc = frappe.get_doc("Imaging Study", name)
	if doc.status == "Booked":
		register(name)
		doc.reload()
	if doc.status not in ("Registered", "In Progress"):
		frappe.throw(_("This study is {0}.").format(doc.status))
	if doc.payment_status in ("Unpaid", "Panel Pending") and doc.priority != "Emergency":
		frappe.throw(_("Bill the scan at the counter first (emergencies may be scanned first and billed after)."))
	p = proc(doc.procedure)
	if pregnancy_status:
		doc.pregnancy_status = pregnancy_status
	child_bearing = doc.gender == "Female" and (not doc.age or 12 <= cint(doc.age) <= 50)
	if p.modality == "X-Ray" and child_bearing:
		if not doc.pregnancy_status:
			frappe.throw(_("Ask about pregnancy before an X-ray (female, 12-50 years)."))
		if doc.pregnancy_status in ("Pregnant", "Possibly pregnant") and not (override or "").strip():
			frappe.throw(_("The patient is or may be pregnant: give the radiologist's go-ahead in the note, or cancel and offer ultrasound."))
	if cint(p.needs_consent) and not cint(consent or doc.consent_taken):
		frappe.throw(_("Take the patient's written consent first ({0}).").format(p.procedure_name))
	doc.consent_taken = 1 if cint(consent) else doc.consent_taken
	doc.safety_checked = 1 if cint(safety) else doc.safety_checked
	doc.status, doc.scan_started_at, doc.technologist = "In Progress", _now(), frappe.session.user
	event(doc, "In Progress", (override or "").strip() or None)
	doc.save(ignore_permissions=True)
	publish("radiology", {"action": "started", "name": doc.name}, doc.branch)
	return doc


def complete_scan(name, qc_passed=1, qc_note=None, films=None):
	doc = frappe.get_doc("Imaging Study", name)
	if doc.status != "In Progress":
		frappe.throw(_("Start the scan first."))
	if not cint(qc_passed):
		doc.qc_passed, doc.qc_note = 0, qc_note
		event(doc, "Repeat", qc_note or _("Image quality not acceptable — repeat"))
		doc.save(ignore_permissions=True)
		return doc
	p = proc(doc.procedure)
	doc.status, doc.scanned_at, doc.qc_passed, doc.qc_note, doc.films = "Scanned", _now(), 1, qc_note, films
	hours = flt(p.tat_hours) or 4
	if doc.priority == "Emergency":
		hours = min(hours, 1)
	elif doc.priority == "Urgent":
		hours = min(hours, 2)
	doc.expected_at = add_to_date(doc.scanned_at, hours=hours)
	event(doc, "Scanned", _("Image quality checked") + (f" · {films}" if films else ""))
	doc.save(ignore_permissions=True)
	publish("radiology", {"action": "scanned", "name": doc.name}, doc.branch)
	return doc


# ------------------------------------------------------------------ reporting
REPORT_FIELDS = ("report_title", "clinical_history", "technique", "findings", "impression", "recommendations", "report_template",
	"ob_ga", "ob_edd", "ob_fhr", "ob_presentation", "ob_bpd", "ob_hc", "ob_ac", "ob_fl", "ob_efw", "ob_placenta", "ob_afi", "ob_number")


def _apply(doc, data):
	for f in REPORT_FIELDS:
		if f in data:
			doc.set(f, data.get(f) or None)
	if "measurements" in data:
		doc.set("measurements", [])
		for m in data.get("measurements") or []:
			if (m.get("label") or "").strip():
				doc.append("measurements", {k: m.get(k) for k in ("label", "value", "unit", "reference")})
	if "key_images" in data:
		doc.set("key_images", [])
		for k in (data.get("key_images") or [])[:6]:
			if k.get("image"):
				doc.append("key_images", {"image": k["image"], "caption": (k.get("caption") or "")[:140]})


def apply_template(name, template):
	doc = frappe.get_doc("Imaging Study", name)
	t = frappe.get_doc("Imaging Report Template", template)
	return {"report_template": t.name, "report_title": t.report_title or doc.procedure_name.upper(), "technique": t.technique, "findings": t.findings,
		"impression": t.impression, "recommendations": t.recommendations,
		"measurements": [{"label": m.label, "value": m.value, "unit": m.unit, "reference": m.reference} for m in t.measurements]}


def save_report(name, data, stage="Draft"):
	doc = frappe.get_doc("Imaging Study", name)
	if doc.status in ("Booked", "Registered", "Cancelled", "No Show"):
		frappe.throw(_("The scan has not been done yet."))
	if doc.report_status == "Final":
		frappe.throw(_("The report is signed. Add an addendum instead."))
	if stage == "Preliminary" and not has_any_role(R.RADIOLOGIST):
		frappe.throw(_("Only a radiologist can issue a preliminary report."))
	was_critical = cint(doc.critical_finding)
	_apply(doc, data)
	if "critical_finding" in data:
		doc.critical_finding = cint(data.get("critical_finding"))
		doc.critical_note = data.get("critical_note")
	doc.report_status = "Preliminary" if stage == "Preliminary" else ("Draft" if doc.report_status in ("Not Started", "Draft") else doc.report_status)
	if doc.status in ("In Progress", "Scanned"):
		doc.status = "Reporting"
	if has_any_role(R.RADIOLOGIST) and not doc.radiologist:
		doc.radiologist = doctor_of()
	event(doc, f"Report {doc.report_status}")
	doc.save(ignore_permissions=True)
	if doc.critical_finding and not was_critical:
		notify_critical(doc)
	publish("radiology", {"action": "report", "name": doc.name}, doc.branch)
	return doc


def content_of(doc):
	parts = [doc.report_title, doc.clinical_history, doc.technique, doc.findings, doc.impression, doc.recommendations,
		*[f"{m.label}={m.value}{m.unit or ''}" for m in doc.measurements], *[doc.get(f) or "" for f in REPORT_FIELDS if f.startswith("ob_")],
		*[a.text for a in doc.addenda]]
	return hashlib.sha256("\n".join(str(p or "") for p in parts).encode()).hexdigest()


def sig_of(name, version, content_hash):
	key = (frappe.local.conf.get("encryption_key") or frappe.local.site).encode()
	return hmac.new(key, f"imaging:{name}:{version}:{content_hash}".encode(), hashlib.sha256).hexdigest()[:20]


def verify_url(doc):
	return frappe.utils.get_url(f"/hms/site/radiology/verify/{doc.name}/{doc.signature_hash}")


def _sign(doc):
	doc.report_version = cint(doc.report_version) + 1
	doc.content_hash = content_of(doc)
	doc.signature_hash = sig_of(doc.name, doc.report_version, doc.content_hash)
	doc.signed_by = frappe.session.user


def finalize(name, data=None):
	if not has_any_role(R.RADIOLOGIST):
		frappe.throw(_("Only a radiologist can sign the final report."), frappe.PermissionError)
	doc = frappe.get_doc("Imaging Study", name)
	if doc.report_status == "Final":
		frappe.throw(_("Already signed."))
	if data:
		_apply(doc, data)
		if "critical_finding" in data:
			doc.critical_finding, doc.critical_note = cint(data.get("critical_finding")), data.get("critical_note")
	if not (doc.findings or "").strip() or not (doc.impression or "").strip():
		frappe.throw(_("Findings and impression are needed before signing."))
	if doc.critical_finding and not doc.critical_notified_at:
		notify_critical(doc, save=False)
	doc.radiologist = doc.radiologist or doctor_of()
	doc.report_status, doc.status, doc.verified_at = "Final", "Verified", _now()
	_sign(doc)
	event(doc, "Verified", _("Final report signed (v{0})").format(doc.report_version))
	doc.save(ignore_permissions=True)
	_report_ready(doc)
	publish("radiology", {"action": "verified", "name": doc.name}, doc.branch)
	return doc


def addendum(name, text):
	if not has_any_role(R.RADIOLOGIST):
		frappe.throw(_("Only a radiologist can add an addendum."), frappe.PermissionError)
	text = (text or "").strip()
	if len(text) < 5:
		frappe.throw(_("Write the addendum."))
	doc = frappe.get_doc("Imaging Study", name)
	if doc.report_status != "Final":
		frappe.throw(_("Addenda are for signed reports; edit the draft instead."))
	doc.append("addenda", {"text": text[:3000], "added_by": frappe.session.user, "added_at": _now()})
	_sign(doc)
	event(doc, "Addendum", _("v{0}: {1}").format(doc.report_version, text[:300]))
	doc.save(ignore_permissions=True)
	_report_ready(doc, updated=True)
	return doc


def notify_critical(doc, save=True):
	"""Critical finding: in-app alert to the referring doctor (and the radiology team), logged on the study."""
	users = set()
	if doc.referring_doctor:
		u = frappe.db.get_value("Doctor", doc.referring_doctor, "user")
		if u:
			users.add(u)
	for u in frappe.get_all("Has Role", filters={"role": R.RADIOLOGIST, "parenttype": "User"}, pluck="parent"):
		users.add(u)
	for u in users:
		if u in ("Administrator", "Guest"):
			continue
		frappe.get_doc({"doctype": "Notification Log", "for_user": u, "type": "Alert", "document_type": "Imaging Study", "document_name": doc.name,
			"subject": _("CRITICAL imaging finding: {0} — {1}").format(doc.patient_name, doc.procedure_name),
			"email_content": esc(doc.critical_note or "")}).insert(ignore_permissions=True)
	doc.critical_notified_at = _now()
	who = frappe.db.get_value("Doctor", doc.referring_doctor, "doctor_name") if doc.referring_doctor else (doc.external_referrer or _("radiology team"))
	event(doc, "Critical alert", _("Sent to {0}").format(who))
	frappe.publish_realtime("hv:critical_imaging", {"name": doc.name, "patient": doc.patient_name, "note": doc.critical_note}, after_commit=True)
	if save:
		doc.save(ignore_permissions=True)


def _report_ready(doc, updated=False):
	if not (doc.whatsapp_opt_in and doc.phone):
		return
	messaging.send("radiology_report_ready", phone=doc.phone, patient=doc.patient, consent=True, reference_doctype="Imaging Study", reference_name=doc.name,
		context={"first_name": (doc.patient_name.split() or [""])[0], "ref": doc.booking_ref, "link": frappe.utils.get_url(PORTAL_PATH)})


def deliver(name, via="Printed copy"):
	doc = frappe.get_doc("Imaging Study", name)
	if doc.status not in DONE_STATUSES:
		frappe.throw(_("The report is not signed yet."))
	if doc.status != "Delivered":
		doc.status, doc.delivered_at, doc.delivered_via = "Delivered", _now(), via
	event(doc, "Delivered", via)
	doc.save(ignore_permissions=True)
	return doc


def cancel(name, reason, no_show=False):
	doc = frappe.get_doc("Imaging Study", name)
	if doc.status not in ("Booked", "Registered"):
		frappe.throw(_("Only studies that have not started can be cancelled."))
	if doc.payment_status == "Paid" and not no_show:
		frappe.throw(_("This scan is paid: refund the bill at the counter first."))
	doc.status = "No Show" if no_show else "Cancelled"
	event(doc, doc.status, reason)
	doc.save(ignore_permissions=True)
	return doc


# ------------------------------------------------------------------ report data / print
def _fmt_dt(v):
	return frappe.utils.format_datetime(v, "dd MMM yyyy, hh:mm a") if v else ""


def report_data(name, staff=False):
	doc = frappe.get_doc("Imaging Study", name)
	if not staff and doc.report_status != "Final":
		frappe.throw(_("The report is not ready yet."))
	from hospital_vvs.letterhead import clinic_block

	p = proc(doc.procedure)
	rad = frappe.db.get_value("Doctor", doc.radiologist, ["doctor_name", "qualification", "registration_no", "signature"], as_dict=True) if doc.radiologist else None
	ref = frappe.db.get_value("Doctor", doc.referring_doctor, "doctor_name") if doc.referring_doctor else (doc.external_referrer or "Self")
	ob = {k[3:]: doc.get(k) for k in REPORT_FIELDS if k.startswith("ob_") and doc.get(k)}
	return {
		"name": doc.name, "booking_ref": doc.booking_ref, "status": doc.status, "report_status": doc.report_status, "version": cint(doc.report_version),
		"title": (doc.report_title or p.procedure_name).upper(), "modality": p.modality, "procedure": p.procedure_name, "report_kind": p.report_kind,
		"patient": {"name": doc.patient_name, "mr": doc.patient or doc.mr_given or "—", "age": doc.age, "gender": doc.gender},
		"referring": ref, "scan_at": _fmt_dt(doc.scanned_at or doc.scan_started_at), "report_at": _fmt_dt(doc.verified_at or doc.modified),
		"clinical_history": doc.clinical_history or doc.clinical_notes, "technique": doc.technique, "findings": doc.findings, "impression": doc.impression,
		"recommendations": doc.recommendations, "measurements": [m.as_dict() for m in doc.measurements], "ob": ob,
		"key_images": [{"image": k.image, "caption": k.caption} for k in doc.key_images],
		"addenda": [{"text": a.text, "by": frappe.db.get_value("User", a.added_by, "full_name"), "at": _fmt_dt(a.added_at)} for a in doc.addenda],
		"critical": cint(doc.critical_finding), "radiologist": {"name": rad.doctor_name if rad else "", "qualification": rad.qualification if rad else "",
			"pmdc": rad.registration_no if rad else "", "signature": rad.signature if rad else None},
		"signed": doc.report_status == "Final", "verify_url": verify_url(doc) if doc.signature_hash else "", "clinic": clinic_block(doc.branch),
	}


def _img_data(url):
	from hospital_vvs.services.lab import _image_uri

	return _image_uri(url) if url else None


def _para(t):
	return "".join(f"<p>{esc(x)}</p>" for x in (t or "").split("\n") if x.strip())


def _findings(t):
	"""'Liver: normal …' lines become organ rows; free text stays paragraphs."""
	rows, out = [], []
	for line in (t or "").split("\n"):
		line = line.strip()
		if not line:
			continue
		head, sep, rest = line.partition(":")
		if sep and 0 < len(head) <= 28 and rest.strip():
			rows.append(f"<tr><th>{esc(head.strip())}</th><td>{esc(rest.strip())}</td></tr>")
		else:
			if rows:
				out.append(f"<table class='org'>{''.join(rows)}</table>")
				rows = []
			out.append(f"<p>{esc(line)}</p>")
	if rows:
		out.append(f"<table class='org'>{''.join(rows)}</table>")
	return "".join(out)


OB_LABELS = [("ga", "Gestational age"), ("edd", "EDD"), ("fhr", "Fetal heart rate"), ("presentation", "Presentation"), ("number", "Fetal number"),
	("bpd", "BPD"), ("hc", "HC"), ("ac", "AC"), ("fl", "FL"), ("efw", "EFW"), ("placenta", "Placenta"), ("afi", "Liquor (AFI)")]


import functools


@functools.lru_cache(maxsize=1)
def _watermark():
	"""The logo mark faded to ~5% on white: wkhtmltopdf ignores CSS opacity on images."""
	import base64
	import io
	import os

	from PIL import Image

	path = os.path.join(frappe.get_app_path("hospital_vvs"), "public", "images", "lyallpur-mark.png")
	im = Image.open(path).convert("RGBA")
	bg = Image.new("RGBA", im.size, (255, 255, 255, 0))
	alpha = im.getchannel("A").point(lambda a: int(a * 0.06))
	im.putalpha(alpha)
	out = Image.alpha_composite(bg, im)
	buf = io.BytesIO()
	out.save(buf, "PNG")
	return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def report_html(d, for_pdf=True):
	"""A4 report: letterhead, patient grid, title, sections, measurements, impression box, key images, signature block with QR."""
	from hospital_vvs.letterhead import RED, TEAL, footer_html, header_html
	from hospital_vvs.services.lab import qr_data_uri

	P = d["patient"]
	ag = " / ".join(x for x in [f"{P['age']} y" if P.get("age") else "", P.get("gender") or ""] if x)
	grid = [("Patient name", P["name"]), ("Age / Gender", ag or "—"), ("MR No.", P["mr"]), ("Accession / Booking", f"{d['name']} · {d['booking_ref']}"),
		("Referring doctor", d["referring"]), ("Modality", d["modality"]), ("Scan date & time", d["scan_at"] or "—"), ("Report date & time", d["report_at"] or "—")]
	cells = "".join(f"<td class='k'>{esc(k)}</td><td class='v'>{esc(str(v or '—'))}</td>" + ("</tr><tr>" if i % 2 else "") for i, (k, v) in enumerate(grid))
	sec = []
	if d.get("clinical_history"):
		sec.append(f"<h3>Clinical history / indication</h3>{_para(d['clinical_history'])}")
	if d.get("technique"):
		sec.append(f"<h3>Technique</h3>{_para(d['technique'])}")
	if d.get("ob"):
		ob = d["ob"]
		rows = "".join(f"<tr><th>{esc(lbl)}</th><td>{esc(str(ob[k]))}</td></tr>" for k, lbl in OB_LABELS if ob.get(k))
		sec.append(f"<h3>Obstetric summary</h3><table class='org'>{rows}</table>")
	sec.append(f"<h3>Findings</h3>{_findings(d.get('findings'))}")
	if d.get("measurements"):
		rows = "".join(f"<tr><td>{esc(m.get('label') or '')}</td><td class='num'>{esc(m.get('value') or '')} {esc(m.get('unit') or '')}</td><td class='mut'>{esc(m.get('reference') or '')}</td></tr>"
			for m in d["measurements"])
		sec.append(f"<h3>Measurements</h3><table class='ms'><thead><tr><th>Parameter</th><th>Measured</th><th>Normal / reference</th></tr></thead><tbody>{rows}</tbody></table>")
	crit = "<div class='crit'>CRITICAL FINDING — communicated to the referring doctor</div>" if d.get("critical") else ""
	sec.append(f"<div class='imp'><div class='imp-h'>Impression</div>{crit}{_para(d.get('impression'))}</div>")
	if d.get("recommendations"):
		sec.append(f"<h3>Recommendations</h3>{_para(d['recommendations'])}")
	for a in d.get("addenda") or []:
		sec.append(f"<div class='add'><b>Addendum</b> · {esc(a['at'])} · {esc(a.get('by') or '')}{_para(a['text'])}</div>")
	imgs = [(_img_data(k["image"]) if for_pdf else k["image"], k.get("caption")) for k in (d.get("key_images") or [])[:4]]
	imgs = [x for x in imgs if x[0]]
	if imgs:
		tds = "".join(f"<td><img src='{u}'><div class='cap'>{esc(c or '')}</div></td>" for u, c in imgs) + "<td></td>" * (4 - len(imgs))
		sec.append(f"<h3>Key images</h3><table class='ki'><tr>{tds}</tr></table>")
	R_ = d["radiologist"]
	sig = _img_data(R_.get("signature")) if (for_pdf and R_.get("signature")) else (R_.get("signature") or "")
	qr = qr_data_uri(d["verify_url"]) if d.get("verify_url") else ""
	stamp = (f"<div class='stamp'><div>ELECTRONICALLY VERIFIED</div><small>v{d['version']} · {esc(d['report_at'])}</small></div>" if d.get("signed")
		else f"<div class='stamp draft'><div>{esc(d['report_status'].upper())} — NOT SIGNED</div><small>for internal review only</small></div>")
	sign = f"""<table class='sign'><tr>
		<td style='width:42%'>{f"<img class='sigimg' src='{sig}'>" if sig else "<div class='sigline'></div>"}
			<div class='rn'>{esc(R_.get('name') or 'Radiologist')}</div><div class='mut'>{esc(R_.get('qualification') or 'Consultant Radiologist')}</div>
			<div class='mut'>{(esc(R_['pmdc']) if R_['pmdc'].upper().startswith('PMDC') else 'PMDC No. ' + esc(R_['pmdc'])) if R_.get('pmdc') else ''}</div></td>
		<td style='text-align:center'>{stamp}</td>
		<td style='width:24%;text-align:right'>{f"<img class='qr' src='{qr}'><div class='mut' style='font-size:8px'>Scan to verify this report</div>" if qr else ''}</td></tr></table>"""
	mark = _watermark()
	return f"""<!doctype html><html><head><meta charset='utf-8'><style>
	@page {{ size: A4; margin: 12mm 12mm 16mm }}
	body {{ font-family: Helvetica, Arial, sans-serif; color:#0f2830; font-size:11.2px; line-height:1.5; margin:0 }}
	.wm {{ position:fixed; top:30%; left:24%; width:52%; z-index:-1 }}
	.dept {{ text-align:center; letter-spacing:.22em; font-size:10px; font-weight:700; color:{TEAL}; margin:-1mm 0 3mm }}
	table.pt {{ width:100%; border-collapse:collapse; border:1px solid #d5e3e6; border-radius:6px; background:#f6fafb }}
	table.pt td {{ padding:4px 8px; border-bottom:1px solid #e4eef0; font-size:10.5px }} table.pt td.k {{ color:#5b7079; width:17% }} table.pt td.v {{ font-weight:700; width:33% }}
	h1 {{ text-align:center; font-family: Georgia, 'Times New Roman', serif; font-size:17px; letter-spacing:.08em; color:#0c2431; margin:5mm 0 1mm }}
	.rule {{ width:60px; height:3px; background:{RED}; margin:0 auto 4mm; border-radius:2px }}
	h3 {{ font-size:10.5px; text-transform:uppercase; letter-spacing:.14em; color:{TEAL}; margin:4.5mm 0 1.5mm; border-bottom:1px solid #e1eaeb; padding-bottom:1mm }}
	p {{ margin:0 0 1.6mm }}
	table.org {{ width:100%; border-collapse:collapse }} table.org th {{ text-align:left; vertical-align:top; width:24%; padding:2px 8px 2px 0; color:#0c2431 }}
	table.org td {{ padding:2px 0 }}
	table.ms {{ width:100%; border-collapse:collapse }} table.ms th {{ background:#0e5e6f; color:#fff; text-align:left; padding:4px 8px; font-size:10px }}
	table.ms td {{ padding:4px 8px; border-bottom:1px solid #e4eef0 }} .num {{ font-weight:700 }} .mut {{ color:#5b7079 }}
	.imp, table.sign, table.ki, table.ms tr, table.org tr, .add {{ page-break-inside:avoid }}
	.imp {{ margin-top:5mm; border:1.5px solid {TEAL}; border-left:6px solid {TEAL}; background:#eef7f6; border-radius:6px; padding:3mm 4mm; font-weight:700; font-size:12px }}
	.imp-h {{ font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:{TEAL}; margin-bottom:1.5mm }}
	.crit {{ background:{RED}; color:#fff; font-size:9.5px; letter-spacing:.08em; padding:1.5mm 3mm; border-radius:4px; margin-bottom:2mm; display:inline-block }}
	.add {{ margin-top:3mm; border:1px dashed #c9a24d; background:#fffaf0; padding:2.5mm 3.5mm; border-radius:6px }}
	table.ki {{ width:100%; border-collapse:separate; border-spacing:4px; table-layout:fixed }} table.ki td {{ width:25%; vertical-align:top; text-align:center }}
	table.ki img {{ width:100%; max-height:42mm; object-fit:cover; border-radius:4px; background:#000 }} .cap {{ font-size:8.5px; color:#5b7079 }}
	table.sign {{ width:100%; margin-top:7mm; border-top:1px solid #d5e3e6; padding-top:3mm }} table.sign td {{ vertical-align:bottom }}
	.sigimg {{ height:13mm }} .sigline {{ width:46mm; border-bottom:1px solid #94a3b8; height:11mm }} .rn {{ font-weight:700; font-size:12px; margin-top:1mm }}
	.stamp {{ display:inline-block; border:2px solid {TEAL}; color:{TEAL}; border-radius:8px; padding:2mm 4mm; font-weight:800; letter-spacing:.1em; font-size:10px;
		transform:rotate(-4deg) }} .stamp small {{ display:block; font-weight:600; letter-spacing:0; font-size:8.5px }}
	.stamp.draft {{ border-color:#b45309; color:#b45309 }}
	.qr {{ width:24mm; height:24mm }}
	.disc {{ margin-top:4mm; font-size:8.8px; color:#5b7079; text-align:center; font-style:italic }}
	</style></head><body>
	<img class='wm' src='{mark}'>
	{header_html(d['clinic'])}
	<div class='dept'>DEPARTMENT OF RADIOLOGY &amp; IMAGING</div>
	<table class='pt'><tr>{cells}</tr></table>
	<h1>{esc(d['title'])}</h1><div class='rule'></div>
	{''.join(sec)}
	{sign}
	<div class='disc'>This report should be correlated clinically. It is based on the images obtained at the time of the examination.
	Verify authenticity by scanning the QR code or at {esc(frappe.utils.get_url('/hms/site/radiology'))}.</div>
	<div style='margin-top:4mm'>{footer_html(d['clinic'], right='Radiology &amp; Imaging')}</div>
	</body></html>"""


def report_pdf(name, staff=False):
	from frappe.utils.pdf import get_pdf

	d = report_data(name, staff=staff)
	return get_pdf(report_html(d), {"margin-top": "10mm", "margin-bottom": "14mm", "margin-left": "11mm", "margin-right": "11mm",
		"footer-center": f"{d['name']} · {d['title']} · Page [page] of [topage]", "footer-font-size": "7", "footer-spacing": "4"})


def public_check(name, sig):
	"""QR page: proves the printed report is genuine and current, without showing any findings."""
	if not name or not sig or not frappe.db.exists("Imaging Study", name):
		return {"valid": False}
	doc = frappe.get_doc("Imaging Study", name)
	ok = bool(doc.signature_hash) and doc.report_status == "Final" and hmac.compare_digest(str(sig), sig_of(doc.name, doc.report_version, content_of(doc)))
	initials = " ".join(w[0] + "." for w in (doc.patient_name or "").split()[:3])
	superseded = not ok and bool(doc.signature_hash) and doc.report_status == "Final" and not hmac.compare_digest(str(sig), doc.signature_hash)
	rad = frappe.db.get_value("Doctor", doc.radiologist, ["doctor_name", "registration_no"], as_dict=True) if doc.radiologist else {}
	s = frappe.get_cached_doc("Clinic Settings")
	return {"valid": ok, "superseded": superseded, "report": doc.name, "procedure": doc.procedure_name, "modality": doc.modality, "patient": initials,
		"gender": doc.gender, "scan_date": str(doc.scanned_at or "")[:10], "signed_at": str(doc.verified_at or "")[:16], "version": cint(doc.report_version),
		"radiologist": (rad or {}).get("doctor_name"), "pmdc": (rad or {}).get("registration_no"), "clinic": s.clinic_name, "phone": s.phone}


# ------------------------------------------------------------------ patient portal (booking ID / MR + mobile → OTP)
def _portal_studies(ident, phone):
	ident = (ident or "").strip().upper()
	phone10 = normalize_phone(phone)[-10:]
	if len(ident) < 5 or len(phone10) < 10:
		return None, []
	row = frappe.db.get_value("Imaging Study", {"booking_ref": ident}, ["name", "patient", "phone"], as_dict=True)
	if row:
		if normalize_phone(row.phone or "")[-10:] != phone10:
			pphone = frappe.db.get_value("Patient", row.patient, "phone") if row.patient else ""
			if normalize_phone(pphone or "")[-10:] != phone10:
				return None, []
		return row.patient, [row.name]
	pat = frappe.db.get_value("Patient", {"name": ident}, ["name", "phone"], as_dict=True)
	if pat and normalize_phone(pat.phone or "")[-10:] == phone10:
		return pat.name, frappe.get_all("Imaging Study", filters={"patient": pat.name}, pluck="name")
	return None, []


def portal_request(ident, phone):
	patient, names = _portal_studies(ident, phone)
	if not names:
		frappe.throw(_("We could not find a scan for that booking ID / MR number and mobile number."))
	code = f"{random.SystemRandom().randint(0, 999999):06d}"
	key = f"hv_rad_otp:{normalize_phone(phone)}:{ident.strip().upper()}"
	frappe.cache.set_value(key, {"code": code, "tries": 0}, expires_in_sec=300)
	messaging.send("otp_code", phone=normalize_phone(phone), patient=patient, consent=True, context={"code": code})
	out = {"sent": True, "masked": normalize_phone(phone)[:-7] + "•••" + normalize_phone(phone)[-4:]}
	if messaging.settings().message_mode != "Live" and cint(frappe.conf.developer_mode):
		out["test_code"] = code
	return out


def portal_verify(ident, phone, code):
	key = f"hv_rad_otp:{normalize_phone(phone)}:{ident.strip().upper()}"
	data = frappe.cache.get_value(key)
	if not data:
		frappe.throw(_("The code has expired. Ask for a new one."))
	if data["tries"] >= 5:
		frappe.throw(_("Too many attempts. Ask for a new code."))
	if str(code).strip() != data["code"]:
		data["tries"] += 1
		frappe.cache.set_value(key, data, expires_in_sec=300)
		frappe.throw(_("Wrong code."))
	frappe.cache.delete_value(key)
	patient, names = _portal_studies(ident, phone)
	session = secrets.token_urlsafe(24)
	frappe.cache.set_value(f"hv_rad_portal:{session}", {"patient": patient, "names": names}, expires_in_sec=1800)
	return {"session": session}


def portal_session(session):
	data = frappe.cache.get_value(f"hv_rad_portal:{session}") if session and len(session) > 20 else None
	if not data:
		frappe.throw(_("Your session has ended. Please sign in again."), frappe.PermissionError)
	names = data["names"]
	if data.get("patient"):
		names = sorted(set(names) | set(frappe.get_all("Imaging Study", filters={"patient": data["patient"]}, pluck="name")))
	return data.get("patient"), names


def _own(session, name):
	_p, names = portal_session(session)
	if name not in names:
		frappe.throw(_("Not found."), frappe.PermissionError)
	return frappe.get_doc("Imaging Study", name)


def portal_list(session):
	patient, names = portal_session(session)
	rows = frappe.get_all("Imaging Study", filters={"name": ["in", names or [""]]}, order_by="scheduled_date desc, creation desc",
		fields=["name", "booking_ref", "procedure_name", "modality", "scheduled_date", "slot_time", "status", "report_status", "verified_at", "patient_name",
			"copy_requested", "expected_at", "report_version"])
	out = []
	for r in rows:
		ready = r.report_status == "Final"
		imgs = [k.image for k in frappe.get_all("Imaging Key Image", filters={"parent": r.name, "parenttype": "Imaging Study"}, fields=["image", "caption"],
			order_by="idx")] if ready else []
		out.append({**r, "slot_time": _hhmm(r.slot_time), "ready": ready, "state": "Ready" if ready else ("Cancelled" if r.status in ("Cancelled", "No Show") else "Pending"),
			"images": len(imgs), "expected_at": str(r.expected_at or "")[:16], "verified_at": str(r.verified_at or "")[:16]})
	name = rows[0].patient_name if rows else ""
	return {"patient": name, "mr": patient, "studies": out}


def portal_report(session, name):
	doc = _own(session, name)
	d = report_data(doc.name)
	if doc.status == "Verified":
		doc.status, doc.delivered_at, doc.delivered_via = "Delivered", _now(), "Patient portal"
		event(doc, "Delivered", "Opened in the patient portal")
		doc.save(ignore_permissions=True)
	return {"data": d, "html": report_html(d, for_pdf=True)}


def key_image(session, name, index):
	"""One key image for the portal viewer (private file, streamed only to the verified patient)."""
	doc = _own(session, name)
	if doc.report_status != "Final":
		frappe.throw(_("Not ready."))
	i = cint(index)
	if i < 0 or i >= len(doc.key_images):
		frappe.throw(_("Not found."))
	from hospital_vvs.services.lab import attachment_bytes

	return attachment_bytes(doc.key_images[i].image)


def share(session, name, hours=72, recipient=None):
	doc = _own(session, name)
	if doc.report_status != "Final":
		frappe.throw(_("You can share the report once it is ready."))
	hours = min(max(cint(hours) or 72, 1), 24 * 14)
	token = secrets.token_urlsafe(24)
	frappe.get_doc({"doctype": "Imaging Report Link", "study": doc.name, "patient": doc.patient, "purpose": "Share", "recipient": (recipient or "")[:140],
		"token_hash": hashlib.sha256(token.encode()).hexdigest(), "expires_at": add_to_date(_now(), hours=hours), "created_by_patient": 1}).insert(ignore_permissions=True)
	event(doc, "Shared", _("Link for {0} hours{1}").format(hours, f" · {recipient}" if recipient else ""))
	doc.save(ignore_permissions=True)
	return {"url": frappe.utils.get_url(f"/hms/site/radiology/shared/{token}"), "expires_at": str(add_to_date(_now(), hours=hours))[:16]}


def shared_open(token):
	h = hashlib.sha256((token or "").encode()).hexdigest()
	name = frappe.db.get_value("Imaging Report Link", {"token_hash": h}, "name")
	if not name:
		return {"error": _("This link is not valid.")}
	link = frappe.get_doc("Imaging Report Link", name)
	if link.revoked:
		return {"error": _("The patient has withdrawn this link.")}
	if get_datetime(link.expires_at) < _now():
		return {"error": _("This link has expired. Ask the patient for a new one.")}
	link.opens = cint(link.opens) + 1
	link.last_opened_at, link.last_ip = _now(), getattr(frappe.local, "request_ip", "")
	link.save(ignore_permissions=True)
	d = report_data(link.study)
	return {"data": d, "html": report_html(d), "expires_at": str(link.expires_at)[:16]}


def request_copy(session, name, kind="Printed copy", note=None):
	doc = _own(session, name)
	kind = kind if kind in ("Printed copy", "Printed copy + films", "CD with images") else "Printed copy"
	doc.copy_requested, doc.copy_note = 1, f"{kind}: {(note or '').strip()[:400]}"
	event(doc, "Copy requested", doc.copy_note)
	doc.save(ignore_permissions=True)
	publish("radiology", {"action": "copy", "name": doc.name}, doc.branch)
	return {"ok": True}


# ------------------------------------------------------------------ reminders (every 15 min)
def send_reminders():
	now = _now()
	rows = frappe.db.sql("""select name, scheduled_date, slot_time, reminder_24_sent, reminder_2_sent from `tabImaging Study`
		where status='Booked' and walk_in=0 and whatsapp_opt_in=1 and slot_time is not null and scheduled_date between %s and %s""",
		(getdate(today()), add_to_date(getdate(today()), days=2)), as_dict=True)
	for r in rows:
		at = get_datetime(f"{r.scheduled_date} {r.slot_time}")
		hours = (at - now).total_seconds() / 3600
		kind = "reminder_2_sent" if 0 < hours <= 2.25 and not r.reminder_2_sent else "reminder_24_sent" if 2.25 < hours <= 24.25 and not r.reminder_24_sent else None
		if not kind:
			continue
		doc = frappe.get_doc("Imaging Study", r.name)
		p = proc(doc.procedure)
		when = (_("today at {0}") if at.date() == now.date() else _("tomorrow at {0}")).format(frappe.utils.format_time(doc.slot_time, "hh:mm a"))
		messaging.send("radiology_reminder", phone=doc.phone, patient=doc.patient, consent=True, reference_doctype="Imaging Study", reference_name=doc.name,
			context={"first_name": (doc.patient_name.split() or [""])[0], "ref": doc.booking_ref, "when": when, "prep": prep_text(p)})
		doc.db_set(kind, 1, update_modified=False)
		if kind == "reminder_2_sent":
			doc.db_set("reminder_24_sent", 1, update_modified=False)


# ------------------------------------------------------------------ staff views
def tat_state(r):
	"""green / amber / red for the worklist: due time vs now (or vs sign-off when done)."""
	if r.get("status") in ("Booked", "Registered", "Cancelled", "No Show") or not r.get("expected_at"):
		return None
	end = get_datetime(r.get("verified_at")) if r.get("verified_at") else _now()
	due = get_datetime(r["expected_at"])
	start = get_datetime(r.get("scanned_at") or r["expected_at"])
	if end > due:
		return "red"
	span = max((due - start).total_seconds(), 1)
	return "amber" if (due - end).total_seconds() < span * 0.25 else "green"


def worklist(date=None, to_date=None, modality=None, status=None, radiologist=None, q=None, branch=None, limit=300):
	cond, args = ["1=1"], {}
	if date:
		cond.append("s.scheduled_date >= %(d)s")
		args["d"] = getdate(date)
	cond.append("s.scheduled_date <= %(t)s")
	args["t"] = getdate(to_date or date or today())
	if branch:
		cond.append("s.branch = %(b)s")
		args["b"] = branch
	if modality:
		cond.append("s.modality = %(m)s")
		args["m"] = modality
	if status == "Open":
		cond.append("s.status in ('Booked','Registered','In Progress','Scanned','Reporting')")
	elif status:
		cond.append("s.status = %(s)s")
		args["s"] = status
	if radiologist:
		cond.append("s.radiologist = %(r)s")
		args["r"] = radiologist
	if q:
		cond.append("(s.patient_name like %(q)s or s.patient like %(q)s or s.booking_ref like %(q)s or s.name like %(q)s or s.phone like %(q)s)")
		args["q"] = f"%{q.strip()}%"
	rows = frappe.db.sql(f"""select s.name, s.booking_ref, s.patient, s.patient_name, s.gender, s.age, s.procedure, s.procedure_name, s.modality, s.priority,
		s.status, s.report_status, s.scheduled_date, s.slot_time, s.walk_in, s.token_no, s.booking_source, s.payment_status, s.payment_option, s.amount,
		s.expected_at, s.scanned_at, s.verified_at, s.radiologist, d.doctor_name radiologist_name, s.critical_finding, s.copy_requested, s.ward_location,
		s.referring_doctor, rd.doctor_name referring_name, s.external_referrer, s.qc_passed, s.registered_at
		from `tabImaging Study` s left join `tabDoctor` d on d.name=s.radiologist left join `tabDoctor` rd on rd.name=s.referring_doctor
		where {' and '.join(cond)}
		order by field(s.priority,'Emergency','Urgent','Routine'), s.scheduled_date desc, s.slot_time, s.creation limit {cint(limit)}""", args, as_dict=True)
	for r in rows:
		r["slot_time"] = _hhmm(r.slot_time) if r.slot_time else None
		r["tat"] = tat_state(r)
		for k in ("expected_at", "scanned_at", "verified_at", "registered_at"):
			r[k] = str(r[k])[:16] if r[k] else None
		r["scheduled_date"] = str(r.scheduled_date)
	return rows


def study(name):
	doc = frappe.get_doc("Imaging Study", name)
	p = proc(doc.procedure)
	out = doc.as_dict()
	out["slot_time"] = _hhmm(doc.slot_time) if doc.slot_time else None
	out["procedure_info"] = {"name": p.name, "modality": p.modality, "category": p.category, "report_kind": p.report_kind, "needs_consent": p.needs_consent,
		"preparation": prep_text(p), "duration_min": p.duration_min, "tat_hours": p.tat_hours}
	out["templates"] = frappe.get_all("Imaging Report Template", filters={"is_active": 1, "modality": p.modality}, fields=["name", "procedure"], order_by="name")
	out["radiologist_name"] = frappe.db.get_value("Doctor", doc.radiologist, "doctor_name") if doc.radiologist else None
	out["referring_name"] = frappe.db.get_value("Doctor", doc.referring_doctor, "doctor_name") if doc.referring_doctor else doc.external_referrer
	out["history"] = frappe.get_all("Imaging Study", filters={"patient": doc.patient, "name": ["!=", doc.name], "report_status": "Final"} if doc.patient else {"name": ""},
		fields=["name", "procedure_name", "modality", "scheduled_date", "impression"], order_by="scheduled_date desc", limit=8)
	out["verify_url"] = verify_url(doc) if doc.signature_hash else None
	for e in out.get("events") or []:
		e["by_name"] = frappe.db.get_value("User", e.get("by_user"), "full_name")
	log_access("Imaging study opened", patient=doc.patient, reference_doctype="Imaging Study", reference_name=doc.name)
	return out


def analytics(from_date, to_date, branch=None):
	args = {"f": getdate(from_date), "t": getdate(to_date), "b": branch}
	bcond = "and branch=%(b)s" if branch else ""
	daily = frappe.db.sql(f"""select scheduled_date d, modality, count(*) n from `tabImaging Study` where scheduled_date between %(f)s and %(t)s {bcond}
		and status not in ('Cancelled','No Show','Booked') group by scheduled_date, modality order by scheduled_date""", args, as_dict=True)
	split = frappe.db.sql(f"""select modality label, count(*) value from `tabImaging Study` where scheduled_date between %(f)s and %(t)s {bcond}
		and status not in ('Cancelled','No Show','Booked') group by modality""", args, as_dict=True)
	tat = frappe.db.sql(f"""select modality, round(avg(timestampdiff(minute, scanned_at, verified_at))) minutes, count(*) n,
		sum(verified_at <= expected_at) on_time from `tabImaging Study` where scheduled_date between %(f)s and %(t)s {bcond} and verified_at is not null
		and scanned_at is not null group by modality""", args, as_dict=True)
	revenue = frappe.db.sql(f"""select modality label, sum(amount) value from `tabImaging Study` where scheduled_date between %(f)s and %(t)s {bcond}
		and payment_status in ('Paid','Panel Approved') group by modality""", args, as_dict=True)
	workload = frappe.db.sql(f"""select coalesce(d.doctor_name,'Unassigned') label, count(*) value, sum(s.critical_finding) critical
		from `tabImaging Study` s left join `tabDoctor` d on d.name=s.radiologist where s.scheduled_date between %(f)s and %(t)s {bcond.replace('branch', 's.branch')}
		and s.report_status='Final' group by d.doctor_name order by value desc""", args, as_dict=True)
	top = frappe.db.sql(f"""select procedure_name label, count(*) value from `tabImaging Study` where scheduled_date between %(f)s and %(t)s {bcond}
		and status not in ('Cancelled','No Show') group by procedure_name order by value desc limit 8""", args, as_dict=True)
	sources = frappe.db.sql(f"""select booking_source label, count(*) value from `tabImaging Study` where scheduled_date between %(f)s and %(t)s {bcond}
		group by booking_source order by value desc""", args, as_dict=True)
	for r in daily:
		r["d"] = str(r["d"])
	return {"daily": daily, "split": split, "tat": tat, "revenue": revenue, "workload": workload, "top": top, "sources": sources,
		"totals": {"scans": sum(x.value for x in split), "revenue": sum(flt(x.value) for x in revenue),
			"critical": frappe.db.count("Imaging Study", {"critical_finding": 1, "scheduled_date": ["between", [args["f"], args["t"]]]}),
			"open": frappe.db.count("Imaging Study", {"status": ["in", list(OPEN_STATUSES)]})}}


def public_catalogue():
	rows = frappe.get_all("Imaging Procedure", filters={"is_active": 1, "show_on_website": 1},
		fields=["name", "procedure_name", "code", "modality", "category", "body_region", "description", "prep_group", "preparation", "duration_min", "tat_hours",
			"price", "walk_in", "female_only", "needs_consent", "sort_order"], order_by="sort_order, procedure_name")
	for r in rows:
		r["preparation"] = (r.preparation or PREP.get(r.prep_group or "None") or "").strip()
	rads = frappe.get_all("Doctor", filters={"is_active": 1, "department": "Radiology"}, fields=["name", "doctor_name", "qualification", "specialization", "photo",
		"registration_no", "show_license"], order_by="doctor_name")
	for d in rads:
		d["days"] = [{"day": s.day[:3], "from": _hhmm(s.start_time), "to": _hhmm(s.end_time)} for s in
			frappe.get_all("Doctor Schedule", filters={"parent": d.name, "parenttype": "Doctor"}, fields=["day", "start_time", "end_time"], order_by="idx")]
		if not cint(d.pop("show_license", 0)):
			d["registration_no"] = None
	year = frappe.db.count("Imaging Study", {"status": ["in", list(DONE_STATUSES)], "scheduled_date": [">=", add_to_date(getdate(today()), days=-365)]})
	return {"procedures": rows, "radiologists": rads, "hours": HOURS, "prep": PREP, "scans_year": year,
		"panels": frappe.get_all("Customer", filters={"customer_group": ["in", ["Insurance Providers", "Panels"]], "disabled": 0}, pluck="name")}
