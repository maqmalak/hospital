"""Phase 2 demo data (re-run safe): FEFO, medicine packs + batches + stock, lab templates, display devices, finder/dispenser,
open shifts and some live lab / pharmacy activity.   bench --site hospital execute hospital_vvs.setup.demo_phase2.seed
"""

import random

import frappe
from frappe.utils import add_days, add_months, cint, flt, today

from hospital_vvs import roles as R
from hospital_vvs.setup.company import ABBR
from hospital_vvs.setup.demo import _user

DISTRIBUTOR, REF_LAB = "Muller & Phipps Pakistan", "Chughtai Reference Lab"
MAKERS = ["GSK Pakistan", "Getz Pharma", "Searle Pakistan", "Abbott Laboratories", "Sami Pharmaceuticals", "Hilton Pharma", "Ferozsons", "Martin Dow"]
CATS = {"Penicillins": "Antibiotic", "Cephalosporins": "Antibiotic", "Macrolides": "Antibiotic", "Fluoroquinolones": "Antibiotic", "Sulfonamides": "Antibiotic",
	"NSAIDs": "Analgesic", "Analgesics": "Analgesic", "Proton Pump Inhibitors": "Gastro", "Antiemetics": "Gastro", "Antihistamines": "Allergy",
	"Anticoagulants": "Cardiac", "Antiplatelets": "Cardiac", "Statins": "Cardiac", "ACE Inhibitors": "Cardiac", "Beta Blockers": "Cardiac",
	"Biguanides": "Diabetes", "Sulfonylureas": "Diabetes", "Corticosteroids": "Steroid", "Bronchodilators": "Respiratory", "Vitamins & Supplements": "Supplement"}
# MRP per pack by form
MRP = {"Tablet": 320, "Capsule": 450, "Syrup": 180, "Suspension": 220, "Injection": 260, "Inhaler": 650}

LAB = [
	# name, code, dept, sample, container, tat, price, params [(param, unit, gender, low, high, crit_low, crit_high, normal_text)], text, outsourced
	("Complete Blood Count", "CBC", "Hematology", "Blood (EDTA)", "Purple top (EDTA)", 4, 900, [
		("Hemoglobin", "g/dL", "Male", 13.5, 17.5, 7, 20, ""), ("Hemoglobin", "g/dL", "Female", 12.0, 15.5, 7, 20, ""),
		("WBC", "×10³/µL", "All", 4.0, 11.0, 2, 30, ""), ("Platelets", "×10³/µL", "All", 150, 450, 20, 1000, ""),
		("RBC", "×10⁶/µL", "Male", 4.5, 5.9, 0, 0, ""), ("RBC", "×10⁶/µL", "Female", 4.1, 5.1, 0, 0, ""),
		("Hematocrit", "%", "All", 36, 50, 20, 60, ""), ("MCV", "fL", "All", 80, 100, 0, 0, ""), ("Neutrophils", "%", "All", 40, 75, 0, 0, ""),
		("Lymphocytes", "%", "All", 20, 45, 0, 0, "")], "", 0),
	("Blood Sugar Fasting", "BSF", "Chemistry", "Plasma (Fluoride)", "Grey top (Fluoride)", 2, 250, [("Glucose (fasting)", "mg/dL", "All", 70, 100, 40, 400, "")], "", 0),
	("Blood Sugar Random", "BSR", "Chemistry", "Plasma (Fluoride)", "Grey top (Fluoride)", 2, 250, [("Glucose (random)", "mg/dL", "All", 70, 140, 40, 450, "")], "", 0),
	("HbA1c", "HBA1C", "Chemistry", "Blood (EDTA)", "Purple top (EDTA)", 24, 1500, [("HbA1c", "%", "All", 4.0, 5.6, 0, 0, "")], "", 0),
	("Liver Function Tests", "LFT", "Chemistry", "Serum", "Yellow/Red top (Serum)", 6, 1400, [
		("Bilirubin total", "mg/dL", "All", 0.1, 1.2, 0, 15, ""), ("ALT (SGPT)", "U/L", "All", 7, 56, 0, 1000, ""), ("AST (SGOT)", "U/L", "All", 10, 40, 0, 1000, ""),
		("Alkaline phosphatase", "U/L", "All", 44, 147, 0, 0, ""), ("Albumin", "g/dL", "All", 3.5, 5.0, 1.5, 0, "")], "", 0),
	("Renal Function Tests", "RFT", "Chemistry", "Serum", "Yellow/Red top (Serum)", 6, 1300, [
		("Urea", "mg/dL", "All", 15, 45, 0, 200, ""), ("Creatinine", "mg/dL", "Male", 0.7, 1.3, 0, 8, ""), ("Creatinine", "mg/dL", "Female", 0.6, 1.1, 0, 8, ""),
		("Sodium", "mmol/L", "All", 135, 145, 120, 160, ""), ("Potassium", "mmol/L", "All", 3.5, 5.1, 2.8, 6.2, "")], "", 0),
	("Lipid Profile", "LIPID", "Chemistry", "Serum", "Yellow/Red top (Serum)", 12, 1800, [
		("Total cholesterol", "mg/dL", "All", 0, 200, 0, 0, ""), ("Triglycerides", "mg/dL", "All", 0, 150, 0, 1000, ""), ("HDL", "mg/dL", "All", 40, 90, 0, 0, ""),
		("LDL", "mg/dL", "All", 0, 130, 0, 0, "")], "", 0),
	("Urine R/E", "URE", "Urine & Stool", "Urine", "Urine cup", 3, 400, [
		("Colour", "", "All", 0, 0, 0, 0, "Yellow"), ("Protein", "", "All", 0, 0, 0, 0, "Nil"), ("Glucose", "", "All", 0, 0, 0, 0, "Nil"),
		("Pus cells", "/HPF", "All", 0, 5, 0, 0, ""), ("RBCs", "/HPF", "All", 0, 2, 0, 0, "")], "", 0),
	("Typhidot", "TYPHI", "Serology", "Serum", "Yellow/Red top (Serum)", 4, 950, [("Typhidot IgM", "", "All", 0, 0, 0, 0, "Negative"), ("Typhidot IgG", "", "All", 0, 0, 0, 0, "Negative")], "", 0),
	("Dengue NS1", "NS1", "Serology", "Serum", "Yellow/Red top (Serum)", 4, 1800, [("Dengue NS1 antigen", "", "All", 0, 0, 0, 0, "Negative")], "", 0),
	("Malaria Parasite", "MP", "Hematology", "Blood (EDTA)", "Purple top (EDTA)", 2, 350, [("Malaria parasite (smear)", "", "All", 0, 0, 0, 0, "Not seen")], "", 0),
	("TSH", "TSH", "Hormones", "Serum", "Yellow/Red top (Serum)", 24, 1600, [("TSH", "µIU/mL", "All", 0.4, 4.0, 0.01, 50, "")], "", 0),
	("Vitamin D (25-OH)", "VITD", "Hormones", "Serum", "Yellow/Red top (Serum)", 72, 3800, [("Vitamin D 25-OH", "ng/mL", "All", 30, 100, 0, 0, "")], "", 1),
	("Histopathology", "HISTO", "Histopathology", "Other", "Sterile container", 120, 6500, [], "Gross:\n\nMicroscopy:\n\nDiagnosis:", 1),
]
# map prescription chip names to templates
ALIASES = {"CBC": "Complete Blood Count", "LFT": "Liver Function Tests", "RFT": "Renal Function Tests", "Blood sugar (fasting)": "Blood Sugar Fasting",
	"HbA1c": "HbA1c", "Lipid profile": "Lipid Profile", "Urine R/E": "Urine R/E", "Typhidot": "Typhidot", "Dengue NS1": "Dengue NS1", "Malaria parasite": "Malaria Parasite", "TSH": "TSH"}


def seed():
	frappe.set_user("Administrator")
	frappe.flags.hv_sync_messages = True
	frappe.db.set_single_value("Stock Settings", {"pick_serial_and_batch_based_on": "Expiry", "use_serial_batch_fields": 1, "enable_serial_and_batch_no_for_item": 1})
	masters()
	medicines()
	lab_templates()
	users()
	devices()
	stock()
	frappe.db.commit()
	activity()
	frappe.db.commit()
	print("phase 2 demo seeded")


def _ins(doctype, field, value, **kw):
	if not frappe.db.exists(doctype, value):
		frappe.get_doc(dict({"doctype": doctype, field: value}, **kw)).insert(ignore_permissions=True)


def masters():
	if not frappe.db.exists("Supplier Group", "Distributor"):
		frappe.get_doc({"doctype": "Supplier Group", "supplier_group_name": "Distributor", "parent_supplier_group": "All Supplier Groups"}).insert(ignore_permissions=True)
	for s in (DISTRIBUTOR, REF_LAB):
		_ins("Supplier", "supplier_name", s, supplier_group="Distributor", country="Pakistan")
	for m in MAKERS:
		_ins("Pharma Company", "company_name", m)
	for c in sorted(set(CATS.values())):
		_ins("Medicine Category", "category_name", c)


def medicines():
	rnd = random.Random(7)
	rack_no = 0
	for item in frappe.get_all("Item", filters={"hv_is_medicine": 1}, fields=["name", "hv_dosage_form", "hv_drug_class", "item_name"], order_by="item_name"):
		d = frappe.get_doc("Item", item.name)
		form = d.hv_dosage_form or "Tablet"
		rack_no += 1
		ups, spp = {"Tablet": (10, 3), "Capsule": (10, 2)}.get(form, (1, 1))
		d.update({"hv_units_per_strip": ups, "hv_strips_per_pack": spp, "hv_allow_loose_sale": 1 if ups > 1 else 0, "hv_allow_strip_sale": 1 if ups > 1 else 0,
			"hv_rack_location": f"{'ABCDEF'[rack_no % 6]}{1 + rack_no // 6}-{rack_no % 10:02d}", "hv_manufacturer": MAKERS[rack_no % len(MAKERS)],
			"hv_medicine_category": CATS.get(d.hv_drug_class), "hv_route": {"Injection": "IV", "Inhaler": "Inhalation"}.get(form, "Oral"),
			"hv_storage": "Refrigerated 2-8 °C" if form == "Injection" else "Room temperature", "hv_drap_reg_no": f"0{rnd.randint(10000, 99999)}",
			"create_new_batch": 0, "has_batch_no": 1, "has_expiry_date": 1, "hv_controlled_drug": 1 if d.hv_generic == "Tramadol" else 0})
		d.flags.ignore_permissions = True
		d.save()
		mrp = MRP.get(form, 300) + rnd.randint(-6, 12) * 10
		if not frappe.db.exists("Item Price", {"item_code": d.name, "price_list": "Standard Selling"}):
			frappe.get_doc({"doctype": "Item Price", "item_code": d.name, "price_list": "Standard Selling", "price_list_rate": mrp}).insert(ignore_permissions=True)


def lab_templates():
	for (name, code, dept, sample, container, tat, price, params, text, outsourced) in LAB:
		if frappe.db.exists("Lab Test Template", name):
			continue
		frappe.get_doc({"doctype": "Lab Test Template", "test_name": name, "test_code": code, "department": dept, "sample_type": sample, "container": container,
			"tat_hours": tat, "price": price, "result_type": "Text" if not params else "Numeric", "text_template": text, "outsourced": outsourced,
			"reference_lab": REF_LAB if outsourced else None, "outsource_cost": round(price * 0.55) if outsourced else 0, "auto_verify": 1 if code in ("BSF", "BSR") else 0,
			"parameters": [{"parameter": p, "unit": u, "gender": g, "normal_low": lo or None, "normal_high": hi or None, "critical_low": cl or None,
				"critical_high": ch or None, "normal_text": nt or None} for p, u, g, lo, hi, cl, ch, nt in params]}).insert(ignore_permissions=True)


def users():
	_user("finder", "Faraz Finder", [R.FINDER])
	_user("dispenser", "Dania Dispenser", [R.DISPENSER])
	_user("cashier2", "Kiran Cashier", [R.PHARMACY_CASHIER])


def devices():
	for name, dtype, counter, branch in (("Pharmacy 1 display", "Customer Display", "Pharmacy 1", "Lahore Main"), ("Pharmacy 2 display", "Customer Display", "Pharmacy 2", "Lahore Main"),
		("Pharmacy queue TV", "Queue Display", None, "Lahore Main"), ("OPD waiting TV", "Waiting Display", None, "Lahore Main"), ("Ward kiosk 1", "Ward Display", None, "Lahore Main")):
		if not frappe.db.exists("Display Device", name):
			frappe.get_doc({"doctype": "Display Device", "device_name": name, "device_type": dtype, "counter": counter, "branch": branch,
				"device_key": frappe.generate_hash(length=24), "is_active": 1}).insert(ignore_permissions=True)
		if counter:
			frappe.db.set_value("Counter", counter, "display_device", name)


def stock():
	from hospital_vvs.services import pharmacy

	main, retail = f"Main Store LHR - {ABBR}", f"Pharmacy Retail LHR - {ABBR}"
	if frappe.db.count("Batch", {"hv_mrp_per_pack": [">", 0]}) > 20:
		return
	rnd = random.Random(11)
	items = frappe.get_all("Item", filters={"hv_is_medicine": 1}, fields=["name", "hv_units_per_strip", "hv_strips_per_pack"], order_by="name")
	lines = []
	for i, it in enumerate(items):
		mrp = flt(frappe.db.get_value("Item Price", {"item_code": it.name, "price_list": "Standard Selling"}, "price_list_rate"))
		short = add_months(today(), 2 if i % 4 == 0 else 5)  # every 4th item: batch A inside the 90-day window
		code = it.name.split("-")[0][:6]
		lines.append({"item_code": it.name, "batch_no": f"{code}-A{rnd.randint(100, 999)}", "expiry": short, "mrp_per_pack": mrp, "rate_per_pack": round(mrp * 0.78), "packs": 10, "free_packs": 0})
		lines.append({"item_code": it.name, "batch_no": f"{code}-B{rnd.randint(100, 999)}", "expiry": add_months(today(), 24), "mrp_per_pack": mrp + 20,
			"rate_per_pack": round((mrp + 20) * 0.78), "packs": 20, "free_packs": 2})
	pharmacy.receive_stock(DISTRIBUTOR, main, lines, bill_no="MP-INV-2026-1107", branch="Lahore Main")
	# move to the pharmacy shelf by FEFO: 6 packs of each item
	moves = [{"item_code": it.name, "qty": 6 * (cint(it.hv_units_per_strip) or 1) * (cint(it.hv_strips_per_pack) or 1)} for it in items]
	pharmacy.fefo_transfer(main, retail, moves, remarks="Opening shelf stock")
	# one expired batch on the shelf (received earlier, now past expiry) for the quarantine demo
	it = items[0]
	b = f"{it.name.split('-')[0][:6]}-X001"
	pharmacy.receive_stock(DISTRIBUTOR, retail, [{"item_code": it.name, "batch_no": b, "expiry": add_days(today(), 3), "mrp_per_pack": 300, "rate_per_pack": 230,
		"packs": 2, "free_packs": 0}], branch="Lahore Main")
	frappe.db.set_value("Batch", b, "expiry_date", add_days(today(), -10))


def activity():
	"""Open shifts for the demo cashiers and create today's lab and pharmacy work."""
	from hospital_vvs.services import lab, pharmacy, shifts

	for user, counter, float_ in (("cashier@vvs.demo", "Pharmacy 1", 5000), ("lab@vvs.demo", "Lab Counter", 3000), ("reception@vvs.demo", "Reception 1", 5000)):
		if not frappe.db.exists("POS Opening Entry", {"user": user, "status": "Open", "docstatus": 1}):
			frappe.set_user(user)
			shifts.open_shift(counter, {"Cash": float_})
	frappe.set_user("Administrator")
	if frappe.db.count("Test Invoice", {"posting_date": today()}) >= 4:
		return
	pats = frappe.get_all("Patient", filters={"branch": "Lahore Main", "disabled": 0}, pluck="name", limit=12)
	doctors = frappe.get_all("Doctor", filters={"branch": "Lahore Main"}, pluck="name")
	frappe.set_user("lab@vvs.demo")
	plans = [["Complete Blood Count", "Blood Sugar Random"], ["Liver Function Tests", "Renal Function Tests"], ["Lipid Profile"], ["Urine R/E", "Typhidot"],
		["Complete Blood Count"], ["Vitamin D (25-OH)"], ["Dengue NS1", "Complete Blood Count"]]
	for i, tests in enumerate(plans):
		ti = lab.create_order(pats[i], tests, "Lahore Main", referring_doctor=doctors[i % len(doctors)])
		lab.pay(ti.name, "Cash" if i % 2 == 0 else "Card")
		ti.reload()
		samples = frappe.get_all("Lab Sample", filters={"test_invoice": ti.name}, pluck="name")
		if i >= 1:
			for s in samples:
				lab.collect(s)
		if i >= 2:
			for s in samples:
				if frappe.db.get_value("Lab Sample", s, "container") != "Sterile container" and not tests[0].startswith("Vitamin"):
					lab.receive(s)
		if i in (2, 4, 6):
			ti.reload()
			for r in ti.items:
				if r.status == "Received":
					vals = demo_values(r.template, critical=(i == 4))
					lab.enter_results(r.name, values=vals)
	frappe.set_user("cashier@vvs.demo")
	carts = [[("PANADOL-500MG", "Strip", 2), ("RISEK-20MG", "Pack", 1)], [("CALPOL-SYRUP-120MG-5ML", "Pack", 1)], [("RIGIX-10MG", "Nos", 5), ("CAL-D-500MG", "Strip", 1)]]
	for cart in carts:
		frappe.db.savepoint("demo_sale")
		try:
			pharmacy.checkout("Pharmacy 1", [{"item_code": c, "uom": u, "qty": q} for c, u, q in cart], payment_mode="Cash")
		except Exception as e:
			frappe.db.rollback(save_point="demo_sale")  # never keep a half-submitted invoice
			print("demo sale skipped:", repr(e))
	frappe.set_user("Administrator")


def demo_values(template, critical=False):
	t = frappe.get_doc("Lab Test Template", template)
	out = {}
	for p in t.parameters:
		if p.parameter in out:
			continue
		if p.normal_text:
			out[p.parameter] = p.normal_text
		elif p.normal_high:
			lo, hi = flt(p.normal_low), flt(p.normal_high)
			out[p.parameter] = str(round(lo + (hi - lo) * 0.55, 1))
	if critical and t.test_code == "CBC":
		out["Hemoglobin"] = "6.2"
		out["Platelets"] = "18"
	return out
