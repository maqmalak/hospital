"""Nephrology & Dialysis set-up (D-99), insert-only and idempotent (runs in after_migrate):
rate-master items in Medical Services with codes DIA-* (the counter lists them under the category "Dialysis / Nephrology"), dialysis consumables
as stock items in the "Dialysis Store" warehouse, the monthly / viral lab templates, and 12 stations (8 negative, 2 HBV, 2 HCV)."""

import frappe

from hospital_vvs.services.dialysis import CONSUMABLES, ITEMS, WAREHOUSE

CATEGORY = "Dialysis / Nephrology"  # counter category for DIA-* items
CONS_GROUP = "Dialysis Consumables"
CONS_PRICE = {"DIA-C-DIALYSER": 2200, "DIA-C-BLOODLINE": 900, "DIA-C-NEEDLE": 350, "DIA-C-ACID": 700, "DIA-C-BICARB": 650, "DIA-C-HEPARIN": 450,
	"DIA-C-SALINE": 180, "DIA-C-CATH": 6500, "DIA-C-EPO": 1900}  # valuation [confirm]

# station no., zone, machine model, serial — models [confirm]
STATIONS = [(f"S-{i:02d}", "Negative", "Fresenius 4008S [confirm]", f"FMC-4008-{1100 + i}") for i in range(1, 9)] + [
	("B-01", "HBV", "Nipro Surdial X [confirm]", "NIP-SX-2201"), ("B-02", "HBV", "Nipro Surdial X [confirm]", "NIP-SX-2202"),
	("C-01", "HCV", "Fresenius 4008S [confirm]", "FMC-4008-1301"), ("C-02", "HCV", "Fresenius 4008S [confirm]", "FMC-4008-1302")]

LAB_TEMPLATES = [
	("Dialysis Monthly Panel", "DIA-MONTHLY", "Chemistry", "Serum", "Yellow/Red top (Serum)", 4500, "Numeric", [
		("Urea (pre-dialysis)", "mg/dL", 15, 45), ("Urea (post-dialysis)", "mg/dL", None, None), ("Creatinine", "mg/dL", 0.6, 1.2), ("Potassium", "mmol/L", 3.5, 5.1),
		("Sodium", "mmol/L", 135, 145), ("Calcium", "mg/dL", 8.5, 10.2), ("Phosphate", "mg/dL", 2.5, 4.5), ("Albumin", "g/dL", 3.5, 5.0),
		("Haemoglobin", "g/dL", 12, 16), ("Ferritin", "ng/mL", 100, 800), ("PTH (intact)", "pg/mL", 150, 600)]),
	("Viral Screening (HBsAg, Anti-HCV, HIV)", "DIA-VIRAL", "Serology", "Serum", "Yellow/Red top (Serum)", 3000, "Text", [
		("HBsAg", "", None, None), ("Anti-HCV", "", None, None), ("HIV 1/2 antibody", "", None, None)]),
]


def ensure_groups():
	if not frappe.db.exists("Item Group", CONS_GROUP) and frappe.db.exists("Item Group", "All Item Groups"):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": CONS_GROUP, "parent_item_group": "All Item Groups", "is_group": 0}).insert(ignore_permissions=True)


def ensure_items():
	ensure_groups()
	if not frappe.db.exists("Item Group", "Medical Services"):
		return
	for code, name, rate in ITEMS:
		if not frappe.db.exists("Item", code):
			frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "item_group": "Medical Services", "stock_uom": "Nos", "is_stock_item": 0,
				"include_item_in_manufacturing": 0, "hv_billing_type": "General", "standard_rate": rate}).insert(ignore_permissions=True)
		if not frappe.db.exists("Item Price", {"item_code": code, "price_list": "Standard Selling"}):
			frappe.get_doc({"doctype": "Item Price", "item_code": code, "price_list": "Standard Selling", "price_list_rate": rate}).insert(ignore_permissions=True)
	for code, name, _per, uom in CONSUMABLES:
		if not frappe.db.exists("Item", code):
			it = frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "item_group": CONS_GROUP, "stock_uom": uom, "is_stock_item": 1,
				"include_item_in_manufacturing": 0, "valuation_rate": CONS_PRICE.get(code, 100)})
			it.flags.ignore_mandatory = True
			it.insert(ignore_permissions=True)


def ensure_warehouse():
	company = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value("Company", {}, "name")
	if not company:
		return None
	abbr = frappe.db.get_value("Company", company, "abbr")
	full = f"{WAREHOUSE} - {abbr}"
	if not frappe.db.exists("Warehouse", full):
		parent = frappe.db.get_value("Warehouse", {"company": company, "is_group": 1, "parent_warehouse": ["in", ["", None]]})
		frappe.get_doc({"doctype": "Warehouse", "warehouse_name": WAREHOUSE, "company": company, "parent_warehouse": parent}).insert(ignore_permissions=True)
	return full


def ensure_lab_templates():
	for name, code, dept, sample, container, price, rtype, params in LAB_TEMPLATES:
		if frappe.db.exists("Lab Test Template", name):
			continue
		frappe.get_doc({"doctype": "Lab Test Template", "test_name": name, "test_code": code, "department": dept, "sample_type": sample, "container": container,
			"tat_hours": 24, "price": price, "is_active": 1, "result_type": rtype,
			"parameters": [{"parameter": p, "unit": u, "normal_low": lo, "normal_high": hi, **({"normal_text": "Non-reactive"} if rtype == "Text" else {})}
				for p, u, lo, hi in params]}).insert(ignore_permissions=True)


def ensure_stations():
	branch = frappe.db.get_value("Branch", {}, "name")
	for i, (no, zone, model, serial) in enumerate(STATIONS):
		if not frappe.db.exists("Dialysis Station", no):
			frappe.get_doc({"doctype": "Dialysis Station", "station_no": no, "label": f"Station {no}", "zone": zone, "status": "Active", "branch": branch,
				"sort_order": i + 1, "machine_model": model, "machine_serial": serial, "machine_installed": "2025-01-15",
				"last_service": "2026-10-01", "next_service": "2027-01-01"}).insert(ignore_permissions=True)


def ensure_dialysis():
	if not frappe.db.exists("DocType", "Dialysis Station"):
		return
	ensure_items()
	ensure_warehouse()
	ensure_lab_templates()
	ensure_stations()
