"""Hospital fixed assets (D-59): medical machinery, lab analysers, furniture, electrical & mechanical plant, building works,
IT. ERPNext Assets with straight-line monthly depreciation from the asset category; locations are hospital areas.
"""

import frappe
from frappe import _
from frappe.utils import add_months, cint, flt, getdate, today

# category: (fixed asset account name, useful life in months)
CATEGORIES = {
	"Medical Equipment": ("Capital Equipment", 120),
	"Laboratory Equipment": ("Electronic Equipment", 96),
	"Hospital Furniture": ("Furniture and Fixtures", 120),
	"Electrical & Mechanical Plant": ("Plants and Machineries", 180),
	"Building & Infrastructure": ("Buildings", 300),
	"IT Equipment": ("Office Equipment", 48),
}
LOCATIONS = ["Lahore Main", "Radiology", "Operation Theatre", "ICU", "Emergency", "General Ward", "Private Rooms", "Laboratory", "OPD", "Reception",
	"Pharmacy", "Plant Room", "Admin Block"]


def ensure_setup(company="VVS Hospital"):
	abbr = frappe.get_cached_value("Company", company, "abbr")
	for loc in LOCATIONS:
		if not frappe.db.exists("Location", loc):
			frappe.get_doc({"doctype": "Location", "location_name": loc, "parent_location": None if loc == "Lahore Main" else "Lahore Main",
				"is_group": 1 if loc == "Lahore Main" else 0}).insert(ignore_permissions=True)
	for cat, (acc, months) in CATEGORIES.items():
		if not frappe.db.exists("Asset Category", cat):
			frappe.get_doc({"doctype": "Asset Category", "asset_category_name": cat, "enable_cwip_accounting": 0,
				"accounts": [{"company_name": company, "fixed_asset_account": f"{acc} - {abbr}", "accumulated_depreciation_account": f"Accumulated Depreciation - {abbr}",
					"depreciation_expense_account": f"Depreciation - {abbr}"}],
				"finance_books": [{"depreciation_method": "Straight Line", "total_number_of_depreciations": months, "frequency_of_depreciation": 1}]}).insert(ignore_permissions=True)
	if not frappe.db.exists("Item Group", "Hospital Assets"):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": "Hospital Assets", "parent_item_group": "All Item Groups"}).insert(ignore_permissions=True)


def ensure_asset_item(code, name, category, rate=0):
	if not frappe.db.exists("Item", code):
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "item_group": "Hospital Assets", "stock_uom": "Nos", "is_stock_item": 0,
			"is_fixed_asset": 1, "asset_category": category, "auto_create_assets": 1, "asset_naming_series": "ACC-ASS-.YYYY.-", "valuation_rate": rate,
			"include_item_in_manufacturing": 0}).insert(ignore_permissions=True)
	return code


def activate(asset_name, available_for_use=None, custodian=None):
	"""Draft asset from a receipt → depreciation from its category, then submit."""
	a = frappe.get_doc("Asset", asset_name)
	if a.docstatus:
		return a
	a.available_for_use_date = available_for_use or a.purchase_date
	if custodian and a.meta.has_field("custodian"):
		a.custodian = custodian
	cat = frappe.get_cached_doc("Asset Category", a.asset_category)
	fb = cat.finance_books[0] if cat.finance_books else None
	if fb:
		a.calculate_depreciation = 1
		a.set("finance_books", [{"depreciation_method": fb.depreciation_method, "total_number_of_depreciations": fb.total_number_of_depreciations,
			"frequency_of_depreciation": fb.frequency_of_depreciation, "depreciation_start_date": add_months(getdate(a.available_for_use_date), 1)}])
	a.flags.ignore_permissions = True
	a.save()
	a.submit()
	return a


def move(asset_name, target_location, purpose="Transfer", reason=None):
	a = frappe.get_doc("Asset", asset_name)
	mv = frappe.get_doc({"doctype": "Asset Movement", "company": a.company, "purpose": purpose, "transaction_date": frappe.utils.now_datetime(),
		"reference_doctype": None, "assets": [{"asset": a.name, "source_location": a.location, "target_location": target_location}]})
	if mv.meta.has_field("remarks") and reason:
		mv.remarks = reason
	mv.flags.ignore_permissions = True
	mv.insert()
	mv.submit()
	return mv


def log_repair(asset_name, description, cost=0, failure_date=None, completed=True):
	a = frappe.get_doc("Asset", asset_name)
	r = frappe.get_doc({"doctype": "Asset Repair", "asset": a.name, "company": a.company, "failure_date": failure_date or frappe.utils.now_datetime(),
		"description": description, "repair_status": "Completed" if completed else "Pending", "repair_cost": flt(cost),
		"completion_date": frappe.utils.now_datetime() if completed else None})
	r.flags.ignore_permissions = True
	r.insert()
	if completed:
		r.submit()
	return r


def book_values(company="VVS Hospital"):
	rows = frappe.get_all("Asset", filters={"company": company, "docstatus": 1}, fields=["name", "asset_name", "asset_category", "location", "status",
		"net_purchase_amount", "value_after_depreciation", "purchase_date", "available_for_use_date", "supplier", "item_code"], order_by="purchase_date desc")
	for r in rows:
		gross = flt(r.get("net_purchase_amount"))
		r["gross"] = gross
		r["book_value"] = flt(r.value_after_depreciation) if r.value_after_depreciation is not None else gross
		r["accumulated"] = max(gross - r["book_value"], 0)
	return rows
