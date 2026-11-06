"""Hospital setup (re-run safe): company, branches, Branch accounting dimension, accounts, cost centers, warehouses,
modes of payment, service items, the six POS Profiles per branch, Clinic Settings defaults.

bench --site hospital execute hospital_vvs.setup.company.run
"""

import frappe
from frappe.utils import add_days, add_months, getdate, nowdate

from hospital_vvs import roles as R

COMPANY = "VVS Hospital"
ABBR = "VVSH"
BRANCHES = [("Lahore Main", "LHR", "12-B Main Boulevard, Gulberg III, Lahore", "+92 42 3500 0000"),
	("Islamabad", "ISB", "Plot 5, Blue Area, Islamabad", "+92 51 2800 000")]
BILLING_TYPES = {
	# billing type: (income account, cost center, warehouse key)
	"Fee": ("Consultation Fee Income", "OPD", "General Store"),
	"OPD Slip": ("OPD Income", "OPD", "General Store"),
	"Lab": ("Laboratory Income", "Laboratory", "Lab Store"),
	"Medicine": ("Pharmacy Sales", "Pharmacy", "Pharmacy Retail"),
	"General": ("General Service Income", "Administration", "General Store"),
	"IPD Slip": ("IPD Income", "IPD", "IPD Dispensing"),
}
WAREHOUSES = ["Main Store", "Pharmacy Retail", "IPD Dispensing", "Lab Store", "General Store", "Quarantine"]
MODES = [("Cash", "Cash", "Cash - {abbr}"), ("Card", "Bank", "{bank}"), ("Bank Transfer", "Bank", "{bank}"),
	("JazzCash", "Bank", "{bank}"), ("Easypaisa", "Bank", "{bank}")]
SERVICE_ITEMS = [
	("OPD-CONSULT", "OPD Consultation", "Fee"), ("OPD-FOLLOWUP", "Follow-up Consultation", "Fee"),
	("REG-FEE", "Registration Fee", "General"), ("PROC-DRESSING", "Dressing", "General"),
	("PROC-INJECTION", "Injection Administration", "General"), ("PROC-NEBULIZE", "Nebulization", "General"),
	("PROC-ECG", "ECG", "General"),
]
DISCOUNT_RULES = [(R.RECEPTIONIST, 10, 1000), (R.LAB_USER, 10, 1000), (R.PHARMACY_CASHIER, 5, 500),
	(R.DISPENSER, 5, 500), (R.CASH_SUPERVISOR, 50, 20000), (R.ACCOUNTANT, 50, 50000)]
CUSTOMER_GROUPS = ["Patients", "Panels", "Insurance Providers", "Welfare Funds"]


def run():
	company = ensure_company()
	ensure_branches(company)
	ensure_branch_dimension()
	ensure_groups()
	bank = ensure_accounts(company)
	ensure_modes(company, bank)
	ensure_items()
	profiles = {}
	for branch, code, *_ in BRANCHES:
		whs = ensure_warehouses(company, branch, code)
		for bt, (income, cc, wh_key) in BILLING_TYPES.items():
			profiles[(bt, branch)] = ensure_pos_profile(company, branch, code, bt, f"{income} - {ABBR}", f"{cc} - {ABBR}", whs[wh_key])
	fill_settings(company, profiles)
	frappe.db.commit()
	print("Hospital setup done:", company, len(profiles), "POS profiles")


def ensure_company(company=COMPANY, abbr=ABBR):
	if not frappe.db.exists("Company", company):
		if frappe.db.get_single_value("System Settings", "setup_complete"):
			frappe.get_doc({"doctype": "Company", "company_name": company, "abbr": abbr, "country": "Pakistan",
				"default_currency": "PKR", "chart_of_accounts": "Standard"}).insert(ignore_permissions=True)
		else:
			from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

			today = getdate(nowdate())
			fy_start = f"{today.year if today.month >= 7 else today.year - 1}-07-01"
			setup_complete({
				"language": "English", "country": "Pakistan", "timezone": "Asia/Karachi", "currency": "PKR",
				"company_name": company, "company_abbr": abbr, "chart_of_accounts": "Standard",
				"fy_start_date": fy_start, "fy_end_date": str(add_days(add_months(fy_start, 12), -1)),
				"full_name": "Administrator", "email": "admin@vvs-hospital.example", "password": None, "setup_demo": 0,
			})
		frappe.db.commit()
	return company


def ensure_branches(company):
	for name, code, address, phone in BRANCHES:
		if not frappe.db.exists("Branch", name):
			frappe.get_doc({"doctype": "Branch", "branch": name}).insert(ignore_permissions=True)
		frappe.db.set_value("Branch", name, {"hv_branch_code": code, "hv_company": company, "hv_address": address, "hv_phone": phone})


def ensure_branch_dimension():
	"""One Company with Branch as an accounting dimension (DECISIONS D-02)."""
	from erpnext.accounts.doctype.accounting_dimension.accounting_dimension import make_dimension_in_accounting_doctypes

	name = frappe.db.get_value("Accounting Dimension", {"document_type": "Branch"})
	if not name:
		doc = frappe.new_doc("Accounting Dimension")
		doc.document_type = "Branch"
		frappe.flags.in_test_backup, frappe.in_test = frappe.in_test, True  # build the fields now, not in a queued job
		try:
			doc.insert(ignore_permissions=True)
		finally:
			frappe.in_test = frappe.flags.in_test_backup
	elif not frappe.get_meta("Sales Invoice").has_field("branch"):
		make_dimension_in_accounting_doctypes(frappe.get_doc("Accounting Dimension", name))


def ensure_groups():
	for g in CUSTOMER_GROUPS:
		if not frappe.db.exists("Customer Group", g):
			frappe.get_doc({"doctype": "Customer Group", "customer_group_name": g, "parent_customer_group": "All Customer Groups"}).insert(
				ignore_permissions=True)
	if not frappe.db.exists("Territory", "Pakistan"):
		frappe.get_doc({"doctype": "Territory", "territory_name": "Pakistan", "parent_territory": "All Territories"}).insert(
			ignore_permissions=True)
	if not frappe.db.exists("Item Group", "Medical Services"):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": "Medical Services", "parent_item_group": "All Item Groups"}).insert(
			ignore_permissions=True)
	if not frappe.db.exists("Item Group", "Medicines"):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": "Medicines", "parent_item_group": "All Item Groups"}).insert(
			ignore_permissions=True)


def _account(company, name, parent, **kw):
	full = f"{name} - {ABBR}"
	if not frappe.db.exists("Account", full):
		frappe.get_doc(dict({"doctype": "Account", "account_name": name, "parent_account": parent, "company": company}, **kw)).insert(
			ignore_permissions=True)
	return full


def ensure_accounts(company):
	income_parent = frappe.db.get_value("Account", {"company": company, "account_name": "Direct Income", "is_group": 1})
	for income, *_ in BILLING_TYPES.values():
		_account(company, income, income_parent, root_type="Income", report_type="Profit and Loss")
	root_cc = frappe.db.get_value("Cost Center", {"company": company, "is_group": 1, "parent_cost_center": ["in", ["", None]]})
	for cc in {v[1] for v in BILLING_TYPES.values()}:
		if not frappe.db.exists("Cost Center", f"{cc} - {ABBR}"):
			frappe.get_doc({"doctype": "Cost Center", "cost_center_name": cc, "parent_cost_center": root_cc, "company": company}).insert(
				ignore_permissions=True)
	bank_parent = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 1}) or \
		frappe.db.get_value("Account", {"company": company, "account_name": "Bank Accounts", "is_group": 1})
	return _account(company, "Meezan Bank Current", bank_parent, account_type="Bank")


def ensure_modes(company, bank):
	for mode, mtype, acct in MODES:
		account = acct.format(abbr=ABBR, bank=bank)
		if not frappe.db.exists("Mode of Payment", mode):
			frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": mode, "type": mtype, "enabled": 1}).insert(ignore_permissions=True)
		mop = frappe.get_doc("Mode of Payment", mode)
		if not any(a.company == company for a in mop.accounts):
			mop.append("accounts", {"company": company, "default_account": account})
			mop.save(ignore_permissions=True)


def ensure_items():
	for code, name, bt in SERVICE_ITEMS:
		if not frappe.db.exists("Item", code):
			frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "item_group": "Medical Services", "stock_uom": "Nos",
				"is_stock_item": 0, "include_item_in_manufacturing": 0, "hv_billing_type": bt}).insert(ignore_permissions=True)


def ensure_warehouses(company, branch, code):
	out = {}
	parent = frappe.db.get_value("Warehouse", {"company": company, "is_group": 1, "parent_warehouse": ["in", ["", None]]})
	for w in WAREHOUSES:
		wname = f"{w} {code}"
		full = f"{wname} - {ABBR}"
		if not frappe.db.exists("Warehouse", full):
			frappe.get_doc({"doctype": "Warehouse", "warehouse_name": wname, "company": company, "parent_warehouse": parent}).insert(
				ignore_permissions=True)
		out[w] = full
	return out


def ensure_pos_profile(company, branch, code, billing_type, income, cost_center, warehouse):
	name = f"{billing_type} - {code}"
	if frappe.db.exists("POS Profile", name):
		return name
	doc = frappe.get_doc({
		"doctype": "POS Profile", "__newname": name, "company": company, "currency": "PKR", "warehouse": warehouse,
		"selling_price_list": "Standard Selling", "income_account": income, "cost_center": cost_center,
		"write_off_account": frappe.db.get_value("Company", company, "write_off_account") or f"Write Off - {ABBR}",
		"write_off_cost_center": cost_center, "write_off_limit": 1, "update_stock": 1 if billing_type == "Medicine" else 0,
		"allow_partial_payment": 0, "payments": [{"mode_of_payment": m, "default": 1 if m == "Cash" else 0} for m, *_ in MODES],
	})
	if doc.meta.has_field("branch"):
		doc.branch = branch
	doc.insert(ignore_permissions=True)
	return doc.name


def fill_settings(company, profiles):
	s = frappe.get_single("Clinic Settings")
	s.company = company
	s.default_branch = s.default_branch or BRANCHES[0][0]
	s.clinic_name = s.clinic_name or COMPANY
	s.clinic_name_ur = s.clinic_name_ur or "وی وی ایس ہسپتال"
	s.clinic_name_ar = s.clinic_name_ar or "مستشفى في في إس"
	s.address = s.address or BRANCHES[0][2]
	s.phone = s.phone or BRANCHES[0][3]
	have = {(r.billing_type, r.branch) for r in s.pos_profiles}
	for (bt, branch), profile in profiles.items():
		if (bt, branch) not in have:
			s.append("pos_profiles", {"billing_type": bt, "branch": branch, "pos_profile": profile})
	code = BRANCHES[0][1]
	for field, w in (("main_store", "Main Store"), ("pharmacy_retail_warehouse", "Pharmacy Retail"), ("ipd_dispensing_warehouse",
		"IPD Dispensing"), ("lab_store", "Lab Store"), ("general_store", "General Store"), ("quarantine_warehouse", "Quarantine")):
		s.set(field, s.get(field) or f"{w} {code} - {ABBR}")
	s.consultation_item = s.consultation_item or "OPD-CONSULT"
	s.follow_up_item = s.follow_up_item or "OPD-FOLLOWUP"
	s.registration_item = s.registration_item or "REG-FEE"
	if not s.discount_rules:
		for role, pct, amt in DISCOUNT_RULES:
			s.append("discount_rules", {"role": role, "max_percent": pct, "max_amount": amt})
	if not s.discount_approvers:
		for role in (R.CASH_SUPERVISOR, R.ADMIN):
			s.append("discount_approvers", {"role": role})
	s.flags.ignore_permissions = True
	s.save()
