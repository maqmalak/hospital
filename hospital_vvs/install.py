"""Install / migrate: roles, custom fields on ERPNext DocTypes, 2FA role flags, default page access."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from hospital_vvs import roles

CUSTOM_FIELDS = {
	"Item": [
		{"fieldname": "hv_pharmacy_section", "fieldtype": "Section Break", "label": "Pharmacy (VVSDesk)", "insert_after": "description",
			"collapsible": 1},
		{"fieldname": "hv_is_medicine", "fieldtype": "Check", "label": "Is Medicine", "insert_after": "hv_pharmacy_section"},
		{"fieldname": "hv_generic", "fieldtype": "Link", "options": "Generic Name", "label": "Generic", "insert_after": "hv_is_medicine",
			"depends_on": "hv_is_medicine"},
		{"fieldname": "hv_drug_class", "fieldtype": "Link", "options": "Drug Class", "label": "Drug Class", "insert_after": "hv_generic",
			"fetch_from": "hv_generic.drug_class", "fetch_if_empty": 1, "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_col1", "fieldtype": "Column Break", "insert_after": "hv_drug_class"},
		{"fieldname": "hv_strength", "fieldtype": "Data", "label": "Strength", "insert_after": "hv_col1", "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_dosage_form", "fieldtype": "Select", "label": "Dosage Form", "insert_after": "hv_strength",
			"options": "\nTablet\nCapsule\nSyrup\nSuspension\nInjection\nInfusion\nCream\nOintment\nDrops\nInhaler\nSachet\nSuppository\nOther",
			"depends_on": "hv_is_medicine"},
		{"fieldname": "hv_max_daily_dose", "fieldtype": "Float", "label": "Max Daily Dose (units)", "insert_after": "hv_dosage_form",
			"depends_on": "hv_is_medicine"},
		{"fieldname": "hv_prescription_required", "fieldtype": "Check", "label": "Prescription Required", "insert_after": "hv_max_daily_dose",
			"depends_on": "hv_is_medicine"},
		{"fieldname": "hv_billing_type", "fieldtype": "Select", "label": "Billing Type",
			"options": "\nFee\nMedicine\nLab\nGeneral\nOPD Slip\nIPD Slip", "insert_after": "item_group"},
	],
	"Branch": [
		{"fieldname": "hv_branch_code", "fieldtype": "Data", "label": "Branch Code", "insert_after": "branch",
			"description": "Short code used in MR numbers, e.g. LHR"},
		{"fieldname": "hv_company", "fieldtype": "Link", "options": "Company", "label": "Company", "insert_after": "hv_branch_code"},
		{"fieldname": "hv_address", "fieldtype": "Small Text", "label": "Address", "insert_after": "hv_company"},
		{"fieldname": "hv_phone", "fieldtype": "Data", "label": "Phone", "insert_after": "hv_address"},
	],
	"Customer": [
		{"fieldname": "hv_patient", "fieldtype": "Link", "options": "Patient", "label": "Patient", "insert_after": "customer_name",
			"read_only": 1},
		{"fieldname": "hv_coverage_percent", "fieldtype": "Percent", "label": "Payer Coverage %", "insert_after": "customer_group",
			"description": "Panel / insurance / welfare fund: share of the bill the payer covers", "depends_on": "eval:!doc.hv_patient"},
	],
	"Sales Invoice": [
		{"fieldname": "hv_patient", "fieldtype": "Link", "options": "Patient", "label": "Patient", "insert_after": "customer_name",
			"read_only": 1, "search_index": 1},
		{"fieldname": "hv_billing_type", "fieldtype": "Data", "label": "Billing Type", "insert_after": "hv_patient", "read_only": 1},
		{"fieldname": "hv_reference_doctype", "fieldtype": "Link", "options": "DocType", "label": "VVSDesk Source",
			"insert_after": "hv_billing_type", "read_only": 1},
		{"fieldname": "hv_reference_name", "fieldtype": "Dynamic Link", "options": "hv_reference_doctype", "label": "VVSDesk Source No.",
			"insert_after": "hv_reference_doctype", "read_only": 1, "search_index": 1},
		{"fieldname": "hv_payer_share_of", "fieldtype": "Link", "options": "Sales Invoice", "label": "Payer Share of Invoice",
			"insert_after": "hv_reference_name", "read_only": 1},
		{"fieldname": "hv_is_payer_share", "fieldtype": "Check", "label": "Is Payer Share", "insert_after": "hv_payer_share_of",
			"read_only": 1},
	],
}


def ensure_roles():
	for role in roles.ALL:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1}).insert(ignore_permissions=True)
		frappe.db.set_value("Role", role, "two_factor_auth", 1 if role in roles.TWO_FACTOR else 0, update_modified=False)


def ensure_page_access():
	from hospital_vvs.routes import DEFAULT_ROUTES

	settings = frappe.get_single("Clinic Settings")
	have = {r.route for r in settings.page_access}
	added = False
	for route, label, role_list, switch in DEFAULT_ROUTES:
		if route not in have:
			settings.append("page_access", {"route": route, "label": label, "roles": ", ".join(role_list), "module_switch": switch})
			added = True
	if added:
		settings.flags.ignore_permissions = True
		settings.save()


def before_migrate():
	ensure_roles()


def after_install():
	ensure_roles()
	after_migrate()


def ensure_mm_core_compat():
	"""mm_core's CRM mail notifier writes CRM Notification type "Email"; other sites carry a Property Setter for it."""
	if not frappe.db.exists("DocType", "CRM Notification"):
		return
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	options = frappe.get_meta("CRM Notification").get_field("type").options or ""
	if "Email" not in options.split("\n"):
		make_property_setter("CRM Notification", "type", "options", options + "\nEmail", "Text", validate_fields_for_doctype=False)


def after_migrate():
	ensure_roles()
	ensure_mm_core_compat()
	create_custom_fields(CUSTOM_FIELDS, update=True)
	ensure_page_access()
	from hospital_vvs.messaging.templates import ensure_templates

	ensure_templates()
