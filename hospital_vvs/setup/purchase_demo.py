"""Demo buying data (D-59) through real ERPNext documents:

1. Pakistani pharmaceutical suppliers → medicine purchase orders → receipts by batch / expiry → purchase invoices → payments
   (contract pharmacy company, Pharmacy Store).
2. Hospital machinery, lab analysers, furniture, electrical & mechanical plant, building works and IT → fixed assets with
   monthly straight-line depreciation (VVS Hospital).
3. Hospital consumables (gloves, syringes, cannulas, gauze, IV sets, lab tubes and reagents) → Main Store.
4. Consumption: consumables issued to OPD, Laboratory, IPD, Operation Theatre and Emergency cost centres.

bench --site hospital execute hospital_vvs.setup.purchase_demo.run      (each part runs once; safe to call again)
"""

import random

import frappe
from frappe.utils import add_days, flt, getdate, today

from hospital_vvs.services import assets as A
from hospital_vvs.services import buying as B

PH, HO = "VVS Pharmacy (Contract)", "VVS Hospital"
PH_STORE = "Pharmacy Store LHR - VVSP"
MAIN = "Main Store LHR - VVSH"

# Pakistani pharmaceutical companies (manufacturers / their distributors) and the brands bought from each
PHARMA = {
	"GlaxoSmithKline Pakistan Ltd": ["PANADOL-500MG", "AUGMENTIN-625MG", "AMOXIL-500MG", "CALPOL-SYRUP-120MG-5ML", "SEPTRAN-DS", "VENTOLIN-INHALER"],
	"Getz Pharma (Pvt) Ltd": ["RISEK-20MG", "RIGIX-10MG", "NEXUM-40MG", "LIPIGET-20MG", "LEFLOX-500MG"],
	"Abbott Laboratories (Pakistan) Ltd": ["BRUFEN-400MG", "KLARICID-500MG", "SOFTIN-10MG"],
	"Pfizer Pakistan Ltd": ["DELTACORTRIL-5MG", "ZESTRIL-10MG", "COUMADIN-5MG"],
	"Sanofi-aventis Pakistan Ltd": ["PLAVIX-75MG", "AMARYL-2MG", "ROCEPHIN-1G"],
	"Martin Dow Ltd": ["GLUCOPHAGE-500MG", "CONCOR-5MG", "MAXOLON-10MG"],
	"The Searle Company Ltd": ["TRAMAL-50MG", "CEFSPAN-400MG", "ONSET-4MG"],
	"Highnoon Laboratories Ltd": ["ROSUVAS-10MG", "LOPRIN-75MG", "RENITEC-10MG"],
	"Ferozsons Laboratories Ltd": ["CIPROXIN-500MG", "AZOMAX-500MG", "VOREN-50MG"],
	"Sami Pharmaceuticals (Pvt) Ltd": ["NAPROSYN-500MG", "FOLIC-ACID-5MG", "CAL-D-500MG", "DISPRIN-300MG"],
	"Muller & Phipps Pakistan": [],  # national distributor (already set up)
}
NTN = lambda: f"{random.randint(1000000, 9999999)}-{random.randint(0, 9)}"  # noqa: E731

# Hospital assets: (supplier, [(code, name, category, qty, unit price PKR, location)])
ASSETS = [
	("Siemens Healthineers Pakistan", [("AST-XRAY-DR", "Digital X-Ray System (DR)", "Medical Equipment", 1, 6500000, "Radiology"),
		("AST-USG-DOPPLER", "Colour Doppler Ultrasound", "Medical Equipment", 1, 3800000, "Radiology")]),
	("Mindray Medical Pakistan", [("AST-VENT-ICU", "ICU Ventilator", "Medical Equipment", 2, 3200000, "ICU"),
		("AST-MONITOR-MP", "Multipara Patient Monitor", "Medical Equipment", 6, 380000, "ICU"),
		("AST-INFUSION", "Infusion Pump", "Medical Equipment", 6, 165000, "ICU"),
		("AST-DEFIB", "Defibrillator with AED", "Medical Equipment", 2, 650000, "Emergency"),
		("AST-HAEM-5P", "Haematology Analyzer (5-part)", "Laboratory Equipment", 1, 2400000, "Laboratory"),
		("AST-CHEM-AUTO", "Clinical Chemistry Analyzer", "Laboratory Equipment", 1, 2900000, "Laboratory")]),
	("Philips Healthcare Pakistan", [("AST-ANAES-WS", "Anaesthesia Workstation", "Medical Equipment", 1, 4200000, "Operation Theatre"),
		("AST-ECG-12L", "12-Lead ECG Machine", "Medical Equipment", 2, 280000, "OPD")]),
	("Medequips Surgical (Pvt) Ltd", [("AST-OT-TABLE", "Hydraulic Operation Table", "Medical Equipment", 1, 1400000, "Operation Theatre"),
		("AST-OT-LIGHT", "OT LED Shadowless Light", "Medical Equipment", 1, 1100000, "Operation Theatre"),
		("AST-ESU", "Electrosurgical Unit (Diathermy)", "Medical Equipment", 1, 900000, "Operation Theatre"),
		("AST-AUTOCLAVE", "Autoclave 100 L", "Medical Equipment", 1, 950000, "Operation Theatre"),
		("AST-CENTRIFUGE", "Laboratory Centrifuge", "Laboratory Equipment", 2, 120000, "Laboratory"),
		("AST-MICROSCOPE", "Binocular Microscope", "Laboratory Equipment", 3, 95000, "Laboratory"),
		("AST-LAB-FRIDGE", "Laboratory Refrigerator", "Laboratory Equipment", 1, 180000, "Laboratory")]),
	("Paramount Hospital Furniture", [("AST-BED-ICU", "ICU Electric Bed", "Hospital Furniture", 6, 420000, "ICU"),
		("AST-BED-WARD", "Ward Bed (manual, 2-crank)", "Hospital Furniture", 12, 85000, "General Ward"),
		("AST-STRETCHER", "Patient Stretcher Trolley", "Hospital Furniture", 4, 95000, "Emergency"),
		("AST-CHAIRS-3S", "Waiting Area Chairs (3-seater)", "Hospital Furniture", 8, 38000, "OPD")]),
	("PowerGen Engineering (Pvt) Ltd", [("AST-GENSET-250", "Diesel Generator 250 kVA", "Electrical & Mechanical Plant", 1, 7800000, "Plant Room"),
		("AST-UPS-20K", "Online UPS 20 kVA", "Electrical & Mechanical Plant", 2, 1150000, "Plant Room"),
		("AST-SOLAR-50", "Solar Power System 50 kW (net metering)", "Electrical & Mechanical Plant", 1, 8500000, "Plant Room")]),
	("OxyCare Gas Systems", [("AST-O2-PSA", "Medical Oxygen PSA Plant with pipeline", "Electrical & Mechanical Plant", 1, 9500000, "Plant Room")]),
	("Cool-Tech HVAC Engineering", [("AST-HVAC-OT", "HEPA-filtered HVAC Package Unit (OT / ICU)", "Electrical & Mechanical Plant", 2, 2600000, "Plant Room")]),
	("Al-Rehman Builders & Contractors", [("AST-OT-MODULAR", "Modular Operation Theatre Construction", "Building & Infrastructure", 1, 12500000, "Operation Theatre"),
		("AST-LAB-FITOUT", "Laboratory Fit-out and Benches", "Building & Infrastructure", 1, 4200000, "Laboratory")]),
	("TechZone Computers Lahore", [("AST-PC-DESKTOP", "Desktop Computer", "IT Equipment", 10, 110000, "Reception"),
		("AST-PRINTER-THERMAL", "Thermal Receipt Printer", "IT Equipment", 6, 28000, "Reception"),
		("AST-SERVER-RACK", "Server and Network Rack", "IT Equipment", 1, 650000, "Admin Block")]),
]

# Consumables: (supplier, [(code, name, uom, batch?, unit rate, qty)])
CONSUMABLES = [
	("Medisure Surgical Supplies", [("CON-GLOVES-EX", "Examination Gloves (box of 100)", "Box", 0, 950, 120), ("CON-GLOVES-ST", "Sterile Surgical Gloves 7.5 (pair)", "Pair", 0, 85, 600),
		("CON-SYRINGE-5", "Disposable Syringe 5 ml", "Nos", 0, 14, 3000), ("CON-CANNULA-20", "IV Cannula 20G", "Nos", 0, 55, 1200),
		("CON-IVSET", "IV Infusion Set", "Nos", 0, 45, 1200), ("CON-MASK-3P", "Surgical Mask 3-ply (box of 50)", "Box", 0, 450, 80)]),
	("Shifa Surgical Traders", [("CON-GAUZE", "Gauze Swabs 10x10 (pack of 100)", "Pack", 0, 520, 150), ("CON-COTTON", "Absorbent Cotton Roll 500 g", "Nos", 0, 380, 120),
		("CON-URINE-BAG", "Urine Collection Bag", "Nos", 0, 60, 400), ("CON-SPIRIT-SWAB", "Alcohol Prep Pads (box of 100)", "Box", 0, 300, 100)]),
	("Al-Shifa Diagnostics", [("CON-TUBE-EDTA", "EDTA Vacutainer Tube", "Nos", 0, 18, 3000), ("CON-TUBE-GEL", "Gel / Clot Activator Tube", "Nos", 0, 22, 2500),
		("CON-REAGENT-CBC", "Haematology Reagent Pack (5-part)", "Pack", 1, 38000, 6), ("CON-REAGENT-CHEM", "Chemistry Reagent Kit (glucose / urea / creatinine)", "Pack", 1, 24000, 8)]),
]
# monthly use per department (qty per issue) — issued weekly
USE = {
	"OPD - VVSH": [("CON-GLOVES-EX", 3), ("CON-SYRINGE-5", 120), ("CON-SPIRIT-SWAB", 3), ("CON-MASK-3P", 2), ("CON-GAUZE", 3)],
	"Laboratory - VVSH": [("CON-TUBE-EDTA", 280), ("CON-TUBE-GEL", 220), ("CON-GLOVES-EX", 4), ("CON-SPIRIT-SWAB", 4), ("CON-REAGENT-CBC", 1), ("CON-REAGENT-CHEM", 1)],
	"IPD - VVSH": [("CON-CANNULA-20", 90), ("CON-IVSET", 110), ("CON-SYRINGE-5", 260), ("CON-URINE-BAG", 30), ("CON-COTTON", 8), ("CON-GLOVES-EX", 6)],
	"Operation Theatre - VVSH": [("CON-GLOVES-ST", 60), ("CON-GAUZE", 10), ("CON-MASK-3P", 4), ("CON-CANNULA-20", 20), ("CON-IVSET", 20)],
	"Emergency - VVSH": [("CON-CANNULA-20", 40), ("CON-IVSET", 35), ("CON-SYRINGE-5", 140), ("CON-GLOVES-EX", 4), ("CON-GAUZE", 4)],
}


def _cost_center(name, company=HO):
	if not frappe.db.exists("Cost Center", name):
		parent = frappe.db.get_value("Cost Center", {"company": company, "is_group": 1})
		frappe.get_doc({"doctype": "Cost Center", "cost_center_name": name.rsplit(" - ", 1)[0], "company": company, "parent_cost_center": parent}).insert(ignore_permissions=True)
	return name


def _rate_per_pack(item):
	return flt(frappe.db.get_value("Batch", {"item": item, "hv_purchase_rate_per_pack": [">", 0]}, "hv_purchase_rate_per_pack", order_by="creation desc")) or 300


def pharmacy(rnd):
	if frappe.db.exists("Purchase Order", {"supplier": "Getz Pharma (Pvt) Ltd"}):
		print("pharmacy: already done")
		return
	for s in PHARMA:
		B.ensure_supplier(s, "Pharmaceutical" if s != "Muller & Phipps Pakistan" else "Distributor", tax_id=NTN())
	made = {"po": 0, "received": 0, "billed": 0, "paid": 0}
	suppliers = [s for s, items in PHARMA.items() if items]
	for k, sup in enumerate(suppliers):
		day = add_days(today(), -40 + k * 4)  # spread over the last 40 days
		lines = [{"item_code": it, "qty": rnd.choice([20, 30, 40, 50, 60]), "rate": _rate_per_pack(it), "warehouse": PH_STORE} for it in PHARMA[sup]]
		po = B.make_po(sup, PH, lines, transaction_date=day, schedule_date=add_days(day, 3))
		made["po"] += 1
		if k == len(suppliers) - 1:
			continue  # latest order still to be delivered
		batch = {r.name: {"batch_no": f"{r.item_code.split('-')[0][:5]}{getdate(day).strftime('%y%m')}{rnd.randint(10, 99)}", "expiry": add_days(day, rnd.choice([420, 540, 720, 900]))}
			for r in po.items}
		if k == len(suppliers) - 2:  # partly delivered
			for r in po.items:
				batch[r.name]["qty"] = r.qty // 2
		pr = B.receive_po(po.name, batch, posting_date=add_days(day, 2), bill_no=f"DC-{rnd.randint(10000, 99999)}")
		made["received"] += 1
		if k >= len(suppliers) - 3:
			continue  # received, invoice not booked yet
		pi = B.bill("Purchase Receipt", pr.name, bill_no=f"INV-{rnd.randint(100000, 999999)}", posting_date=add_days(day, 2))
		made["billed"] += 1
		if k < len(suppliers) - 5:
			B.pay(pi.name, None if k % 3 else flt(pi.grand_total) * 0.5, "Bank Transfer", posting_date=add_days(day, 15))
			made["paid"] += 1
		frappe.db.commit()
	frappe.db.commit()
	print("pharmacy:", made)


def hospital_assets(rnd):
	if frappe.db.exists("Asset", {"company": HO}):
		print("assets: already done")
		return
	A.ensure_setup(HO)
	made = {"po": 0, "assets": 0, "paid": 0}
	for k, (sup, items) in enumerate(ASSETS):
		B.ensure_supplier(sup, "Contractors" if "Builders" in sup else "Medical Equipment", tax_id=NTN())
		day = add_days(today(), -120 + k * 9)  # last four months
		for code, name, cat, _q, price, _loc in items:
			A.ensure_asset_item(code, name, cat, price)
		po = B.make_po(sup, HO, [{"item_code": c, "qty": q, "rate": p, "warehouse": None, "cost_center": "Main - VVSH"} for c, _n, _c, q, p, _l in items],
			transaction_date=day, schedule_date=add_days(day, 10))
		made["po"] += 1
		loc = {r.name: {"location": next(l for c, _n, _c, _q, _p, l in items if c == r.item_code)} for r in po.items}
		pr = B.receive_po(po.name, loc, posting_date=add_days(day, 10))
		for a in frappe.get_all("Asset", filters={"purchase_receipt": pr.name, "docstatus": 0}, pluck="name"):
			A.activate(a, available_for_use=add_days(day, 12))
			made["assets"] += 1
		pi = B.bill("Purchase Receipt", pr.name, bill_no=f"SI-{rnd.randint(1000, 9999)}", posting_date=add_days(day, 10))
		if k % 4 != 3:  # most suppliers paid, some on credit
			B.pay(pi.name, None if k % 2 else flt(pi.grand_total) * 0.6, "Bank Transfer", posting_date=add_days(day, 30))
			made["paid"] += 1
		frappe.db.commit()
	try:  # book the depreciation that has fallen due
		from erpnext.assets.doctype.asset.depreciation import post_depreciation_entries

		post_depreciation_entries(today())
	except Exception:
		frappe.log_error(frappe.get_traceback(), "purchase_demo: depreciation")
	# a move and a repair, so the register has history
	vent = frappe.db.get_value("Asset", {"item_code": "AST-MONITOR-MP", "docstatus": 1})
	if vent:
		try:
			A.move(vent, "Emergency", reason="Extra monitor for ER bays")
		except Exception:
			frappe.log_error(frappe.get_traceback(), "purchase_demo: move")
	gen = frappe.db.get_value("Asset", {"item_code": "AST-GENSET-250", "docstatus": 1})
	if gen:
		try:
			A.log_repair(gen, "250-hour service: oil, fuel and air filters replaced", cost=0)
		except Exception:
			frappe.log_error(frappe.get_traceback(), "purchase_demo: repair")
	frappe.db.commit()
	print("assets:", made)


def consumables(rnd):
	if frappe.db.exists("Purchase Order", {"supplier": "Medisure Surgical Supplies"}):
		print("consumables: already done")
		return
	if not frappe.db.exists("Item Group", "Consumable"):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": "Consumable", "parent_item_group": "All Item Groups"}).insert(ignore_permissions=True)
	for uom in ("Box", "Pair", "Pack"):
		if not frappe.db.exists("UOM", uom):
			frappe.get_doc({"doctype": "UOM", "uom_name": uom}).insert(ignore_permissions=True)
	for cc in ("Operation Theatre - VVSH", "Emergency - VVSH"):
		_cost_center(cc)
	B.consumption_account(HO)
	for k, (sup, items) in enumerate(CONSUMABLES):
		B.ensure_supplier(sup, "Hospital Supplies", tax_id=NTN())
		for code, name, uom, batch, rate, _q in items:
			if not frappe.db.exists("Item", code):
				frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": name, "item_group": "Consumable", "stock_uom": uom, "is_stock_item": 1,
					"has_batch_no": batch, "has_expiry_date": batch, "create_new_batch": 0, "valuation_rate": rate, "include_item_in_manufacturing": 0,
					"item_defaults": [{"company": HO, "default_warehouse": MAIN}]}).insert(ignore_permissions=True)
		day = add_days(today(), -35 + k * 2)
		po = B.make_po(sup, HO, [{"item_code": c, "qty": q, "rate": r, "warehouse": MAIN} for c, _n, _u, _b, r, q in items], transaction_date=day,
			schedule_date=add_days(day, 2))
		pr = B.receive_po(po.name, {r.name: {"expiry": add_days(day, 365)} for r in po.items}, posting_date=add_days(day, 2), bill_no=f"DC-{rnd.randint(1000, 9999)}")
		pi = B.bill("Purchase Receipt", pr.name, bill_no=f"INV-{rnd.randint(10000, 99999)}", posting_date=add_days(day, 2))
		if k != 2:
			B.pay(pi.name, None, "Bank Transfer", posting_date=add_days(day, 20))
		frappe.db.commit()
	# weekly issues over the last four weeks
	issues = 0
	for week in range(4):
		day = add_days(today(), -27 + week * 7)
		for cc, lines in USE.items():
			use = [{"item_code": c, "qty": q if week % 2 == 0 or c.startswith("CON-REAGENT") is False else 0} for c, q in lines]
			use = [u for u in use if u["qty"] > 0 and not (u["item_code"].startswith("CON-REAGENT") and week % 2)]
			if use:
				B.issue_consumables(MAIN, use, cc, posting_date=day, remarks=f"Weekly issue to {cc.rsplit(' - ', 1)[0]}")
				issues += 1
		frappe.db.commit()
	print("consumables: 3 suppliers, issues", issues)


def run(seed=59):
	rnd = random.Random(seed)
	frappe.flags.mute_messages = True
	pharmacy(rnd)
	hospital_assets(rnd)
	consumables(rnd)
	frappe.db.commit()
