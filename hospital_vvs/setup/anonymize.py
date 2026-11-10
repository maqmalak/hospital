"""Anonymize patient data on a STAGING or TRAINING copy (09-security-ops.md → Environments).

bench --site staging.hospital execute hospital_vvs.setup.anonymize.run

Refuses to run unless the site name starts with "staging" / "training" or site_config has hv_allow_anonymize = 1.
Names become "Patient 000123", phones / CNIC / address / guardian / photo are cleared or replaced, every copy of the
patient's name on other documents (slips, invoices, results, beds …) follows, messages lose their phone numbers.
Clinical content (diagnoses, results) stays so the copy can still be used for testing.
"""

import frappe
from frappe.utils import cint


def allowed():
	site = (frappe.local.site or "").lower()
	return site.startswith(("staging", "training")) or bool(cint(frappe.conf.get("hv_allow_anonymize")))


def _fake_phone(mr):
	digits = "".join(c for c in mr if c.isdigit())[-7:].rjust(7, "0")
	return f"+92300{digits}"


def run(commit=True, only=None):
	"""only = list of MR numbers (tests / a trial on a few records); default = every patient."""
	if not allowed():
		frappe.throw(f"Anonymize refused on site {frappe.local.site}: only staging / training copies (or set hv_allow_anonymize).", frappe.PermissionError)
	sql = frappe.db.sql
	only = frappe.parse_json(only) if isinstance(only, str) else only
	pats = frappe.get_all("Patient", filters={"name": ["in", only]} if only else {}, fields=["name", "customer"])
	scope = " and p.name in ({})".format(", ".join(frappe.db.escape(x) for x in only)) if only else ""
	for p in pats:
		label = "Patient " + ("".join(c for c in p.name if c.isdigit())[-6:] or p.name)
		sql("""update `tabPatient` set patient_name=%s, patient_name_ur=%s, patient_name_ar=%s, phone=%s, alt_phone=null, cnic=null, cnic_hash=null,
			cnic_masked=null, cnic_last4=null, address=null, guardian_name='Guardian', photo=null where name=%s""",
			(label, label, label, _fake_phone(p.name), p.name))
		if p.customer:
			sql("update `tabCustomer` set customer_name=%s, mobile_no=null, email_id=null where name=%s", (label, p.customer))
			sql("update `tabSales Invoice` set customer_name=%s where customer=%s", (label, p.customer))
	# every other document that copies the patient's name
	for dt in frappe.get_all("DocField", filters={"fieldname": "patient_name", "parent": ["!=", "Patient"]}, pluck="parent", distinct=True):
		meta = frappe.get_meta(dt)
		if meta.issingle or not meta.has_field("patient") or meta.get_field("patient").options != "Patient":
			continue
		sql(f"update `tab{dt}` t join `tabPatient` p on p.name=t.patient set t.patient_name=p.patient_name where 1=1{scope}")
	if only:  # trial run: the patient's own rows only
		if commit and not frappe.in_test:
			frappe.db.commit()
		return len(pats)
	for dt, fields in {"Appointment": ["phone"], "Online Visit Request": ["phone"], "Message Log": ["phone"], "WhatsApp Conversation": ["phone"],
			"Household": ["phone"], "Test Invoice": ["whatsapp_number"], "ER Visit": ["brought_by_phone"], "Emergency Contact": ["phone"]}.items():
		if frappe.db.table_exists(dt):
			sql(f"update `tab{dt}` set " + ", ".join(f"`{f}`=null" for f in fields))
	if frappe.db.table_exists("Emergency Contact"):
		sql("update `tabEmergency Contact` set contact_name='Contact'")
	sql("update `tabOnline Visit Request` set patient_name='Online patient'")
	sql("update `tabContact` set first_name='Contact', last_name=null, mobile_no=null, phone=null, email_id=null where name in (select parent from `tabDynamic Link` where link_doctype='Customer' and link_name in (select customer from `tabPatient` where customer is not null))")
	if commit and not frappe.in_test:
		frappe.db.commit()
	print(f"anonymized {len(pats)} patients on {frappe.local.site}")
	return len(pats)
