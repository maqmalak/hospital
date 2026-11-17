"""Public endpoints for the VVSDesk marketing page (/hms/vvsdesk, D-69)."""

import re

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit


def _clean(v, n=140):
	return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=3600)
def book_demo(name=None, hospital=None, city=None, beds=None, whatsapp=None, language=None):
	"""The landing page's demo form → an ERPNext Lead (sales follows up on WhatsApp). Five per hour per IP."""
	name, hospital, city, beds = _clean(name, 80), _clean(hospital), _clean(city, 60), _clean(beds, 40)
	phone = re.sub(r"[^\d+]", "", str(whatsapp or ""))[:16]
	if not (name and hospital and city and beds and len(re.sub(r"\D", "", phone)) >= 10):
		frappe.throw(_("Please fill in every field with a valid WhatsApp number."))
	lead = frappe.get_doc({"doctype": "Lead", "first_name": name, "company_name": hospital, "city": city, "country": "Pakistan",
		"mobile_no": phone, "whatsapp_no": phone, "request_type": "Product Enquiry", "status": "Lead"})
	lead.flags.ignore_permissions = True
	lead.flags.ignore_mandatory = True
	lead.insert()
	lead.add_comment("Comment", f"VVSDesk demo request · beds: {beds} · page language: {_clean(language, 4) or 'en'}")
	return {"ok": True}


# ------------------------------------------------------------------ hospital website v2 (/hms/site, D-80)
@frappe.whitelist(allow_guest=True)
def site_info():
	"""Live facts for the public website: departments, wards with day rates, active packages, bed and doctor counts.
	Only public, non-personal data. Cached for ten minutes."""
	key = "hv:site_info"
	cached = frappe.cache.get_value(key)
	if cached:
		return cached
	s = frappe.get_cached_doc("Clinic Settings")
	wards = frappe.get_all("Ward", filters={"is_active": 1}, fields=["name", "ward_name", "ward_name_ur", "ward_type", "gender", "floor",
		"bed_charge_per_day", "nursing_charge_per_shift", "icu_surcharge_per_day"], order_by="sort_order, ward_name")
	beds = {}
	for b in frappe.get_all("Hospital Bed", fields=["ward"]):
		beds[b.ward] = beds.get(b.ward, 0) + 1
	for w in wards:
		w["beds"] = beds.pop(w.pop("name"), 0)
	packages = []
	for p in frappe.get_all("Service Package", filters={"is_active": 1}, fields=["name", "package_name", "price", "days", "description", "ward_type"], order_by="price"):
		inc = frappe.get_all("Package Inclusion", filters={"parent": p.name, "parenttype": "Service Package"}, pluck="charge_type", order_by="idx")
		packages.append({**{k: v for k, v in p.items() if k != "name"}, "inclusions": [i for i in inc if i]})
	depts = frappe.get_all("Medical Department", filters={"is_active": 1}, fields=["department_name", "department_name_ur"], order_by="department_name")
	out = {"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "phone": s.phone, "address": s.address},
		"departments": depts, "wards": wards, "packages": packages,
		"beds": frappe.db.count("Hospital Bed"), "doctors": frappe.db.count("Doctor", {"is_active": 1, "doctor_type": ["!=", "External Referring"]})}
	frappe.cache.set_value(key, out, expires_in_sec=600)
	return out


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=3600)
def site_enquiry(kind=None, name=None, phone=None, email=None, message=None, extra=None, file_name=None, file_data=None):
	"""Website forms (contact, pharmacy enquiry, careers) → a received Communication staff see in the desk. Five per hour per IP.
	Pharmacy and Careers may carry one file (a prescription photo or a CV) as base64; it is attached privately to the Communication."""
	kind = _clean(kind, 30) or "Contact"
	if kind not in ("Contact", "Pharmacy", "Careers"):
		kind = "Contact"
	name, email, message, extra = _clean(name, 80), _clean(email, 120), _clean(message, 2000), _clean(extra, 300)
	phone = re.sub(r"[^\d+]", "", str(phone or ""))[:16]
	if not name or len(re.sub(r"\D", "", phone)) < 10 or not message:
		frappe.throw(_("Please give your name, a valid phone number and a message."))
	if email:
		frappe.utils.validate_email_address(email, throw=True)
	body = f"<p><b>{frappe.utils.escape_html(name)}</b> · {frappe.utils.escape_html(phone)}{(' · ' + frappe.utils.escape_html(email)) if email else ''}</p>"
	if extra:
		body += f"<p>{frappe.utils.escape_html(extra)}</p>"
	body += f"<p>{frappe.utils.escape_html(message)}</p>"
	c = frappe.get_doc({"doctype": "Communication", "communication_type": "Communication", "communication_medium": "Other",
		"sent_or_received": "Received", "subject": f"[Website · {kind}] {name}", "content": body, "sender_full_name": name,
		"sender": email or None, "phone_no": phone, "status": "Open"})
	upload = _upload(kind, file_name, file_data)
	c.flags.ignore_permissions = True
	c.insert()
	if upload:
		f = frappe.get_doc({"doctype": "File", "file_name": upload[0], "content": upload[1], "is_private": 1,
			"attached_to_doctype": "Communication", "attached_to_name": c.name})
		f.flags.ignore_permissions = True
		f.insert()
	return {"ok": True}


_UPLOAD_EXT = {"Pharmacy": {"jpg", "jpeg", "png", "webp", "pdf"}, "Careers": {"pdf", "doc", "docx"}}
_UPLOAD_MAX = 5 * 1024 * 1024


def _upload(kind, file_name, file_data):
	"""Validate an optional website upload → (safe file name, bytes) or None."""
	if not file_data:
		return None
	import base64

	allowed = _UPLOAD_EXT.get(kind)
	name = re.sub(r"[^\w.\- ]", "", str(file_name or "")).strip()[-80:] or "upload"
	ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
	if not allowed or ext not in allowed:
		frappe.throw(_("That file type can't be sent here."))
	data = str(file_data)
	if data.startswith("data:"):
		data = data.split(",", 1)[-1]
	if len(data) > _UPLOAD_MAX * 4 // 3 + 8:
		frappe.throw(_("The file is larger than 5 MB."))
	try:
		raw = base64.b64decode(data, validate=True)
	except Exception:
		frappe.throw(_("The file could not be read."))
	if not raw or len(raw) > _UPLOAD_MAX:
		frappe.throw(_("The file is larger than 5 MB."))
	return f"website-{kind.lower()}-{name}", raw


NEWSLETTER_GROUP = "Website Health Tips"


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=3600)
def site_subscribe(email=None):
	"""Website footer → member of the Email Group "Website Health Tips" (desk: Email Group → newsletters). Five per hour per IP."""
	email = _clean(email, 120).lower()
	if not email:
		frappe.throw(_("Please give your email address."))
	frappe.utils.validate_email_address(email, throw=True)
	if not frappe.db.exists("Email Group", NEWSLETTER_GROUP):
		g = frappe.get_doc({"doctype": "Email Group", "title": NEWSLETTER_GROUP})
		g.flags.ignore_permissions = True
		g.insert()
	if not frappe.db.exists("Email Group Member", {"email_group": NEWSLETTER_GROUP, "email": email}):
		m = frappe.get_doc({"doctype": "Email Group Member", "email_group": NEWSLETTER_GROUP, "email": email})
		m.flags.ignore_permissions = True
		m.insert()
	return {"ok": True}
