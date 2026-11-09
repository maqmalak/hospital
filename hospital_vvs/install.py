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
		{"fieldname": "hv_col2", "fieldtype": "Column Break", "insert_after": "hv_prescription_required"},
		{"fieldname": "hv_units_per_strip", "fieldtype": "Int", "label": "Units per Strip", "insert_after": "hv_col2", "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_strips_per_pack", "fieldtype": "Int", "label": "Strips per Pack", "insert_after": "hv_units_per_strip", "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_units_per_pack", "fieldtype": "Int", "label": "Units per Pack", "insert_after": "hv_strips_per_pack", "read_only": 1,
			"depends_on": "hv_is_medicine"},
		{"fieldname": "hv_allow_loose_sale", "fieldtype": "Check", "label": "Allow Loose (Unit) Sale", "insert_after": "hv_units_per_pack", "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_allow_strip_sale", "fieldtype": "Check", "label": "Allow Strip Sale", "insert_after": "hv_allow_loose_sale", "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_col3", "fieldtype": "Column Break", "insert_after": "hv_allow_strip_sale"},
		{"fieldname": "hv_route", "fieldtype": "Select", "label": "Route", "insert_after": "hv_col3", "depends_on": "hv_is_medicine",
			"options": "\nOral\nIV\nIM\nSC\nTopical\nInhalation\nRectal\nOphthalmic\nOtic\nNasal"},
		{"fieldname": "hv_manufacturer", "fieldtype": "Link", "options": "Pharma Company", "label": "Manufacturer", "insert_after": "hv_route", "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_medicine_category", "fieldtype": "Link", "options": "Medicine Category", "label": "Medicine Category", "insert_after": "hv_manufacturer",
			"depends_on": "hv_is_medicine"},
		{"fieldname": "hv_controlled_drug", "fieldtype": "Check", "label": "Controlled Drug", "insert_after": "hv_medicine_category", "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_rack_location", "fieldtype": "Data", "label": "Rack Location", "insert_after": "hv_controlled_drug", "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_storage", "fieldtype": "Select", "label": "Storage", "insert_after": "hv_rack_location", "depends_on": "hv_is_medicine",
			"options": "\nRoom temperature\nRefrigerated 2-8 °C\nFrozen\nProtect from light"},
		{"fieldname": "hv_drap_reg_no", "fieldtype": "Data", "label": "DRAP Reg. No.", "insert_after": "hv_storage", "depends_on": "hv_is_medicine"},
		{"fieldname": "hv_near_expiry_days", "fieldtype": "Int", "label": "Near-expiry Window (days)", "insert_after": "hv_drap_reg_no", "depends_on": "hv_is_medicine"},
	],
	"Batch": [
		{"fieldname": "hv_mrp_per_pack", "fieldtype": "Currency", "label": "MRP per Pack", "insert_after": "expiry_date"},
		{"fieldname": "hv_purchase_rate_per_pack", "fieldtype": "Currency", "label": "Purchase Rate per Pack", "insert_after": "hv_mrp_per_pack"},
		{"fieldname": "hv_units_per_strip", "fieldtype": "Int", "label": "Units per Strip", "insert_after": "hv_purchase_rate_per_pack"},
		{"fieldname": "hv_strips_per_pack", "fieldtype": "Int", "label": "Strips per Pack", "insert_after": "hv_units_per_strip"},
	],
	"Sales Invoice Item": [
		{"fieldname": "hv_original_item", "fieldtype": "Link", "options": "Item", "label": "Substitute for", "insert_after": "item_name", "read_only": 1},
		{"fieldname": "hv_substitute_approved_by", "fieldtype": "Link", "options": "User", "label": "Substitution Approved by",
			"insert_after": "hv_original_item", "read_only": 1},
		{"fieldname": "hv_doctor", "fieldtype": "Link", "options": "Doctor", "label": "Doctor (commission)", "insert_after": "hv_substitute_approved_by",
			"description": "Doctor who earns commission on this line; filled from the OPD slip, referral, procedure or admission"},
	],
	"POS Opening Entry": [
		{"fieldname": "hv_counter", "fieldtype": "Link", "options": "Counter", "label": "Counter", "insert_after": "pos_profile", "read_only": 1},
		{"fieldname": "hv_branch", "fieldtype": "Link", "options": "Branch", "label": "Branch", "insert_after": "hv_counter", "read_only": 1},
	],
	"Payment Entry": [
		{"fieldname": "hv_shift", "fieldtype": "Link", "options": "POS Opening Entry", "label": "Cashier Shift", "insert_after": "mode_of_payment", "read_only": 1},
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
		{"fieldname": "hv_pharmacy_credit", "fieldtype": "Check", "label": "Pharmacy Credit Customer", "insert_after": "hv_coverage_percent",
			"description": "May buy medicines on account at the contract pharmacy (credit limit per company applies)"},
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
		{"fieldname": "hv_prescription", "fieldtype": "Link", "options": "Prescription", "label": "Prescription", "insert_after": "hv_is_payer_share"},
		{"fieldname": "hv_paper_rx", "fieldtype": "Check", "label": "Paper / Outside Prescription", "insert_after": "hv_prescription", "read_only": 1},
		{"fieldname": "hv_paper_rx_doctor", "fieldtype": "Data", "label": "Prescribing Doctor (paper)", "insert_after": "hv_paper_rx", "read_only": 1,
			"depends_on": "hv_paper_rx"},
		{"fieldname": "hv_paper_rx_reg", "fieldtype": "Data", "label": "Doctor Reg. No. (PMDC)", "insert_after": "hv_paper_rx_doctor", "read_only": 1,
			"depends_on": "hv_paper_rx"},
		{"fieldname": "hv_paper_rx_date", "fieldtype": "Date", "label": "Prescription Date (paper)", "insert_after": "hv_paper_rx_reg", "read_only": 1,
			"depends_on": "hv_paper_rx"},
		{"fieldname": "hv_paper_rx_patient", "fieldtype": "Data", "label": "Patient Name on Prescription", "insert_after": "hv_paper_rx_date", "read_only": 1,
			"depends_on": "hv_paper_rx"},
		{"fieldname": "hv_paper_rx_image", "fieldtype": "Attach", "label": "Prescription Photo", "insert_after": "hv_paper_rx_patient", "read_only": 1,
			"depends_on": "hv_paper_rx"},
		{"fieldname": "hv_counter", "fieldtype": "Link", "options": "Counter", "label": "Counter", "insert_after": "hv_prescription", "read_only": 1},
		{"fieldname": "hv_token", "fieldtype": "Data", "label": "Pharmacy Token", "insert_after": "hv_counter", "read_only": 1},
		{"fieldname": "hv_dispense_ticket", "fieldtype": "Link", "options": "Dispense Ticket", "label": "Dispense Ticket", "insert_after": "hv_token",
			"read_only": 1},
	],
	"Payment Entry": [
		{"fieldname": "hv_section", "fieldtype": "Section Break", "label": "VVSDesk", "insert_after": "remarks", "collapsible": 1},
		{"fieldname": "hv_patient", "fieldtype": "Link", "options": "Patient", "label": "Patient", "insert_after": "hv_section", "read_only": 1},
		{"fieldname": "hv_bed_allotment", "fieldtype": "Link", "options": "Bed Allotment", "label": "Admission", "insert_after": "hv_patient",
			"read_only": 1, "search_index": 1},
		{"fieldname": "hv_er_visit", "fieldtype": "Link", "options": "ER Visit", "label": "ER Visit", "insert_after": "hv_bed_allotment", "read_only": 1},
		{"fieldname": "hv_col", "fieldtype": "Column Break", "insert_after": "hv_er_visit"},
		{"fieldname": "hv_shift", "fieldtype": "Link", "options": "POS Opening Entry", "label": "Cashier Shift", "insert_after": "hv_col",
			"read_only": 1, "search_index": 1},
		{"fieldname": "hv_counter", "fieldtype": "Link", "options": "Counter", "label": "Counter", "insert_after": "hv_shift", "read_only": 1},
		{"fieldname": "hv_purpose", "fieldtype": "Select", "options": "\nAdvance\nSettlement\nRefund", "label": "VVSDesk Purpose",
			"insert_after": "hv_counter", "read_only": 1},
	],
	"Shift Assignment": [
		{"fieldname": "hv_ward", "fieldtype": "Link", "options": "Ward", "label": "Ward", "insert_after": "shift_type"},
		{"fieldname": "hv_is_head_nurse", "fieldtype": "Check", "label": "In Charge", "insert_after": "hv_ward"},
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


READ_FOR_MONEY = ["Account", "Cost Center", "Customer", "Customer Group", "Territory", "Item", "Item Group", "Item Price", "Price List",
	"Mode of Payment", "POS Profile", "Warehouse", "Company", "Branch", "Batch", "UOM", "Currency", "Sales Taxes and Charges Template",
	"Serial and Batch Bundle", "Bin", "Supplier"]
# doctype: {role: rights}; created through Custom DocPerm (core DocPerms untouched)
EXTRA_PERMS = {
	"POS Opening Entry": {r: ["read", "create", "write", "submit"] for r in roles.MONEY + [roles.ADMIN, roles.CASH_SUPERVISOR]},
	"POS Closing Entry": {r: ["read", "create", "write", "submit"] for r in roles.MONEY + [roles.ADMIN, roles.CASH_SUPERVISOR]},
	"Journal Entry": {roles.CASH_SUPERVISOR: ["read"], roles.ACCOUNTANT: ["read"]},
	"Serial and Batch Bundle": {r: ["read", "create", "write", "submit"] for r in roles.MONEY + [roles.ADMIN, roles.STORE_KEEPER, roles.REVIEWER,
		roles.NURSE, roles.LAB_USER, roles.CASH_SUPERVISOR]},
	"Stock Entry": {r: ["read", "create", "write", "submit"] for r in (roles.STORE_KEEPER, roles.ADMIN, roles.LAB_USER, roles.NURSE)},
	"Material Request": {r: ["read", "create", "write", "submit"] for r in (roles.STORE_KEEPER, roles.ADMIN, roles.REVIEWER, roles.NURSE, roles.LAB_USER)},
	"Purchase Receipt": {r: ["read", "create", "write", "submit"] for r in (roles.STORE_KEEPER, roles.ADMIN)},
	"Purchase Invoice": {r: ["read", "create", "write", "submit"] for r in (roles.STORE_KEEPER, roles.ADMIN, roles.ACCOUNTANT)},
	"Stock Reconciliation": {r: ["read", "create", "write", "submit"] for r in (roles.STORE_KEEPER, roles.ADMIN)},
	# Phase 3: IPD / ER advances and settlements at the admission desk
	"Payment Entry": {r: ["read", "create", "write", "submit", "print"] for r in (roles.RECEPTIONIST, roles.CASH_SUPERVISOR, roles.ACCOUNTANT, roles.ADMIN,
		roles.OV_STAFF)},
	"Sales Invoice": {r: ["read", "create", "write", "submit", "print"] for r in roles.MONEY + [roles.ADMIN, roles.OV_STAFF]},
	"Shift Assignment": {r: ["read", "create", "write", "submit", "cancel"] for r in (roles.NURSE, roles.ADMIN)},
	"Shift Type": {r: ["read"] for r in (roles.NURSE, roles.DOCTOR, roles.ADMIN, roles.RECEPTIONIST)},
	"Employee": {r: ["read"] for r in (roles.NURSE, roles.ADMIN)},
}


def ensure_erpnext_permissions():
	from frappe.permissions import add_permission, update_permission_property

	readers = set(roles.MONEY + [roles.ADMIN, roles.OV_STAFF, roles.FINDER, roles.REVIEWER, roles.STORE_KEEPER, roles.DOCTOR, roles.NURSE, roles.PATHOLOGIST, roles.DEO])
	for dt in READ_FOR_MONEY:
		if not frappe.db.exists("DocType", dt):
			continue
		for role in readers:
			if not frappe.db.exists("Custom DocPerm", {"parent": dt, "role": role, "permlevel": 0}):
				add_permission(dt, role, 0)
	for dt, by_role in EXTRA_PERMS.items():
		if not frappe.db.exists("DocType", dt):
			continue
		for role, rights in by_role.items():
			if not frappe.db.exists("Custom DocPerm", {"parent": dt, "role": role, "permlevel": 0}):
				add_permission(dt, role, 0)
			for right in rights:
				update_permission_property(dt, role, 0, right, 1, validate=False)


def fill_settings_defaults():
	"""New Clinic Settings fields get their default on existing sites (single DocTypes don't do this by themselves)."""
	meta = frappe.get_meta("Clinic Settings")
	for f in meta.fields:
		if f.default is None or f.fieldtype in ("Table", "Section Break", "Column Break", "Tab Break"):
			continue
		stored = frappe.db.sql("select value from tabSingles where doctype='Clinic Settings' and field=%s", f.fieldname)
		if not stored or stored[0][0] in (None, ""):
			frappe.db.set_single_value("Clinic Settings", f.fieldname, f.default)
	frappe.clear_document_cache("Clinic Settings")


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
	ensure_erpnext_permissions()
	fill_settings_defaults()
	fields = {k: v for k, v in CUSTOM_FIELDS.items() if frappe.db.exists("DocType", k)}
	create_custom_fields(fields, update=True)
	ensure_page_access()
	from hospital_vvs.messaging.templates import ensure_templates

	ensure_templates()
	from hospital_vvs.services.doctor_share import ensure_accounts

	ensure_accounts()
	from hospital_vvs.services.patient_comms import ensure_stations

	ensure_stations()
