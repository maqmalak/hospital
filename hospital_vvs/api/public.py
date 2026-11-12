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
