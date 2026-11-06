"""Demo seeder (CLAUDE.md §9): enough data to demo every Phase 0/1 workflow. Also resets the training site.

bench --site hospital execute hospital_vvs.setup.demo.seed
Staff logins: <role>@vvs.demo, password from site_config `hv_demo_password` (default "Demo@1234").
Drug interactions created here are flagged is_demo=1 and are NOT a clinical list (DECISIONS D-08).
"""

import random

import frappe
from frappe.utils import add_days, add_to_date, get_datetime, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.setup.company import ABBR

DEPARTMENTS = [("General Medicine", "جنرل میڈیسن", "#0d9488"), ("Paediatrics", "بچوں کا شعبہ", "#f59e0b"),
	("Gynaecology & Obstetrics", "گائنی", "#db2777"), ("Cardiology", "امراض قلب", "#dc2626"), ("Orthopaedics", "ہڈیوں کا شعبہ", "#2563eb"),
	("ENT", "ناک کان گلا", "#7c3aed"), ("Dermatology", "جلد", "#ea580c"), ("Emergency", "ایمرجنسی", "#b91c1c")]
SPECS = [("General Physician", "جنرل فزیشن", "General Medicine"), ("Paediatrician", "ماہر امراض اطفال", "Paediatrics"),
	("Gynaecologist", "ماہر امراض نسواں", "Gynaecology & Obstetrics"), ("Cardiologist", "ماہر امراض قلب", "Cardiology"),
	("Orthopaedic Surgeon", "ماہر ہڈی و جوڑ", "Orthopaedics"), ("ENT Specialist", "ماہر ناک کان گلا", "ENT"),
	("Dermatologist", "ماہر امراض جلد", "Dermatology")]
DOCTORS = [
	# name, urdu, spec, fee, follow-up fee, room, color, branch, days, start, end, user
	("Dr. Ayesha Siddiqui", "ڈاکٹر عائشہ صدیقی", "General Physician", 1500, 800, "OPD-1", "#0d9488", "Lahore Main", "Mon Tue Wed Thu Fri Sat", "09:00", "14:00", "dr.ayesha"),
	("Dr. Usman Tariq", "ڈاکٹر عثمان طارق", "Cardiologist", 3000, 1500, "OPD-2", "#dc2626", "Lahore Main", "Mon Wed Fri", "16:00", "20:00", "dr.usman"),
	("Dr. Sana Malik", "ڈاکٹر ثناء ملک", "Paediatrician", 2000, 1000, "OPD-3", "#f59e0b", "Lahore Main", "Mon Tue Wed Thu Fri Sat", "10:00", "15:00", "dr.sana"),
	("Dr. Farah Naz", "ڈاکٹر فرح ناز", "Gynaecologist", 2500, 1200, "OPD-4", "#db2777", "Lahore Main", "Tue Thu Sat", "11:00", "17:00", "dr.farah"),
	("Dr. Bilal Ahmed", "ڈاکٹر بلال احمد", "Orthopaedic Surgeon", 2500, 1200, "OPD-5", "#2563eb", "Lahore Main", "Mon Wed Sat", "15:00", "19:00", None),
	("Dr. Hina Raza", "ڈاکٹر حنا رضا", "ENT Specialist", 2000, 1000, "OPD-6", "#7c3aed", "Lahore Main", "Tue Thu", "17:00", "21:00", None),
	("Dr. Kamran Shah", "ڈاکٹر کامران شاہ", "Dermatologist", 2200, 1100, "OPD-7", "#ea580c", "Lahore Main", "Mon Thu Sat", "12:00", "16:00", None),
	("Dr. Imran Qureshi", "ڈاکٹر عمران قریشی", "General Physician", 1200, 600, "ISB-1", "#0891b2", "Islamabad", "Mon Tue Wed Thu Fri", "09:00", "13:00", "dr.imran"),
]
DAY = {"Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday", "Fri": "Friday", "Sat": "Saturday", "Sun": "Sunday"}
CLASSES = [("Penicillins", 1), ("Cephalosporins", 1), ("Macrolides", 1), ("Fluoroquinolones", 1), ("NSAIDs", 1), ("Analgesics", 0),
	("Proton Pump Inhibitors", 1), ("Antihistamines", 0), ("Anticoagulants", 1), ("Antiplatelets", 0), ("Statins", 1), ("ACE Inhibitors", 1),
	("Beta Blockers", 1), ("Biguanides", 0), ("Sulfonylureas", 1), ("Sulfonamides", 0), ("Corticosteroids", 0), ("Bronchodilators", 0),
	("Antiemetics", 0), ("Vitamins & Supplements", 0)]
GENERICS = [("Amoxicillin", "Penicillins"), ("Co-amoxiclav", "Penicillins"), ("Cefixime", "Cephalosporins"), ("Ceftriaxone", "Cephalosporins"),
	("Azithromycin", "Macrolides"), ("Clarithromycin", "Macrolides"), ("Ciprofloxacin", "Fluoroquinolones"), ("Levofloxacin", "Fluoroquinolones"),
	("Ibuprofen", "NSAIDs"), ("Diclofenac", "NSAIDs"), ("Naproxen", "NSAIDs"), ("Paracetamol", "Analgesics"), ("Tramadol", "Analgesics"),
	("Omeprazole", "Proton Pump Inhibitors"), ("Esomeprazole", "Proton Pump Inhibitors"), ("Cetirizine", "Antihistamines"),
	("Loratadine", "Antihistamines"), ("Warfarin", "Anticoagulants"), ("Aspirin", "Antiplatelets"), ("Clopidogrel", "Antiplatelets"),
	("Atorvastatin", "Statins"), ("Rosuvastatin", "Statins"), ("Lisinopril", "ACE Inhibitors"), ("Enalapril", "ACE Inhibitors"),
	("Bisoprolol", "Beta Blockers"), ("Metformin", "Biguanides"), ("Glimepiride", "Sulfonylureas"), ("Co-trimoxazole", "Sulfonamides"),
	("Prednisolone", "Corticosteroids"), ("Salbutamol", "Bronchodilators"), ("Ondansetron", "Antiemetics"), ("Metoclopramide", "Antiemetics"),
	("Calcium + Vitamin D", "Vitamins & Supplements"), ("Folic Acid", "Vitamins & Supplements")]
# brand, generic, strength, form, max daily units, rx required
MEDICINES = [("Augmentin 625mg", "Co-amoxiclav", "625 mg", "Tablet", 3, 1), ("Amoxil 500mg", "Amoxicillin", "500 mg", "Capsule", 4, 1),
	("Cefspan 400mg", "Cefixime", "400 mg", "Capsule", 2, 1), ("Rocephin 1g", "Ceftriaxone", "1 g", "Injection", 4, 1),
	("Azomax 500mg", "Azithromycin", "500 mg", "Tablet", 1, 1), ("Klaricid 500mg", "Clarithromycin", "500 mg", "Tablet", 2, 1),
	("Ciproxin 500mg", "Ciprofloxacin", "500 mg", "Tablet", 2, 1), ("Leflox 500mg", "Levofloxacin", "500 mg", "Tablet", 1, 1),
	("Brufen 400mg", "Ibuprofen", "400 mg", "Tablet", 6, 0), ("Voren 50mg", "Diclofenac", "50 mg", "Tablet", 3, 0),
	("Naprosyn 500mg", "Naproxen", "500 mg", "Tablet", 2, 0), ("Panadol 500mg", "Paracetamol", "500 mg", "Tablet", 8, 0),
	("Calpol Syrup 120mg/5ml", "Paracetamol", "120 mg/5 ml", "Syrup", 4, 0), ("Tramal 50mg", "Tramadol", "50 mg", "Capsule", 8, 1),
	("Risek 20mg", "Omeprazole", "20 mg", "Capsule", 2, 0), ("Nexum 40mg", "Esomeprazole", "40 mg", "Tablet", 2, 0),
	("Rigix 10mg", "Cetirizine", "10 mg", "Tablet", 1, 0), ("Softin 10mg", "Loratadine", "10 mg", "Tablet", 1, 0),
	("Coumadin 5mg", "Warfarin", "5 mg", "Tablet", 2, 1), ("Disprin 300mg", "Aspirin", "300 mg", "Tablet", 4, 0),
	("Loprin 75mg", "Aspirin", "75 mg", "Tablet", 1, 0), ("Plavix 75mg", "Clopidogrel", "75 mg", "Tablet", 1, 1),
	("Lipiget 20mg", "Atorvastatin", "20 mg", "Tablet", 1, 1), ("Rosuvas 10mg", "Rosuvastatin", "10 mg", "Tablet", 1, 1),
	("Zestril 10mg", "Lisinopril", "10 mg", "Tablet", 1, 1), ("Renitec 10mg", "Enalapril", "10 mg", "Tablet", 2, 1),
	("Concor 5mg", "Bisoprolol", "5 mg", "Tablet", 1, 1), ("Glucophage 500mg", "Metformin", "500 mg", "Tablet", 4, 1),
	("Amaryl 2mg", "Glimepiride", "2 mg", "Tablet", 2, 1), ("Septran DS", "Co-trimoxazole", "960 mg", "Tablet", 2, 1),
	("Deltacortril 5mg", "Prednisolone", "5 mg", "Tablet", 8, 1), ("Ventolin Inhaler", "Salbutamol", "100 mcg", "Inhaler", 8, 0),
	("Onset 4mg", "Ondansetron", "4 mg", "Tablet", 3, 1), ("Maxolon 10mg", "Metoclopramide", "10 mg", "Tablet", 3, 0),
	("Cal-D 500mg", "Calcium + Vitamin D", "500 mg", "Tablet", 2, 0), ("Folic Acid 5mg", "Folic Acid", "5 mg", "Tablet", 1, 0)]
ALLERGIES = [("Penicillin", "Drug", [], ["Penicillins"]), ("Sulfa drugs", "Drug", [], ["Sulfonamides"]), ("NSAIDs", "Drug", [], ["NSAIDs"]),
	("Aspirin", "Drug", ["Aspirin"], []), ("Cephalosporins", "Drug", [], ["Cephalosporins"]), ("Peanuts", "Food", [], []),
	("Eggs", "Food", [], []), ("Latex", "Other", [], []), ("Dust", "Other", [], [])]
# Clearly marked demo pairs (D-08): replace with the pharmacist's chosen reference list before go-live.
DEMO_INTERACTIONS = [("Warfarin", "Aspirin", "Major", "Bleeding risk increases. Avoid unless specifically indicated."),
	("Warfarin", "Ibuprofen", "Major", "NSAIDs raise bleeding risk with warfarin."),
	("Clarithromycin", "Atorvastatin", "Major", "Raised statin levels; risk of myopathy."),
	("Ciprofloxacin", "Warfarin", "Moderate", "May raise INR; monitor."),
	("Lisinopril", "Ibuprofen", "Moderate", "NSAIDs may reduce the antihypertensive effect and affect kidney function."),
	("Clopidogrel", "Omeprazole", "Moderate", "Omeprazole may reduce clopidogrel effect; prefer another PPI."),
	("Tramadol", "Ondansetron", "Minor", "Possible reduced analgesic effect."),
	("Metformin", "Prednisolone", "Minor", "Steroids may raise blood glucose.")]
DIAGNOSES = [("J06.9", "Acute upper respiratory infection", "Respiratory"), ("J02.9", "Acute pharyngitis", "Respiratory"),
	("J03.9", "Acute tonsillitis", "Respiratory"), ("J18.9", "Pneumonia, unspecified", "Respiratory"), ("J45.9", "Asthma", "Respiratory"),
	("A09", "Gastroenteritis and colitis, infectious", "Infectious"), ("A01.0", "Typhoid fever", "Infectious"),
	("B54", "Malaria, unspecified", "Infectious"), ("A90", "Dengue fever", "Infectious"), ("B19.2", "Viral hepatitis C", "Infectious"),
	("E11.9", "Type 2 diabetes mellitus", "Endocrine"), ("E03.9", "Hypothyroidism", "Endocrine"), ("E55.9", "Vitamin D deficiency", "Endocrine"),
	("I10", "Essential hypertension", "Cardiovascular"), ("I20.9", "Angina pectoris", "Cardiovascular"), ("I25.1", "Coronary artery disease", "Cardiovascular"),
	("K21.9", "Gastro-oesophageal reflux disease", "Digestive"), ("K29.7", "Gastritis", "Digestive"), ("N39.0", "Urinary tract infection", "Genitourinary"),
	("M54.5", "Low back pain", "Musculoskeletal"), ("M17.9", "Osteoarthritis of knee", "Musculoskeletal"), ("M79.1", "Myalgia", "Musculoskeletal"),
	("L20.9", "Atopic dermatitis", "Skin"), ("L70.0", "Acne vulgaris", "Skin"), ("B35.4", "Tinea corporis", "Skin"),
	("H66.9", "Otitis media", "Ear"), ("J01.9", "Acute sinusitis", "Respiratory"), ("D50.9", "Iron deficiency anaemia", "Blood"),
	("O80", "Normal delivery", "Pregnancy"), ("Z34.9", "Supervision of normal pregnancy", "Pregnancy"), ("R50.9", "Fever, unspecified", "Symptoms"),
	("R51", "Headache", "Symptoms"), ("F41.1", "Generalized anxiety disorder", "Mental health")]
WARDS = [("General Ward (Male)", "جنرل وارڈ (مرد)", "General", "Male", "Ground", 3500, 12, "Lahore Main", "#0d9488"),
	("General Ward (Female)", "جنرل وارڈ (خواتین)", "General", "Female", "Ground", 3500, 12, "Lahore Main", "#db2777"),
	("Private Rooms", "پرائیویٹ کمرے", "Private", "Mixed", "First", 12000, 8, "Lahore Main", "#7c3aed"),
	("ICU", "آئی سی یو", "ICU", "Mixed", "First", 25000, 6, "Lahore Main", "#dc2626"),
	("Children Ward", "بچوں کا وارڈ", "General", "Children", "Second", 4000, 10, "Lahore Main", "#f59e0b"),
	("Emergency Bay", "ایمرجنسی", "Emergency", "Mixed", "Ground", 5000, 8, "Lahore Main", "#b91c1c"),
	("General Ward ISB", "جنرل وارڈ", "General", "Mixed", "Ground", 3000, 10, "Islamabad", "#0891b2")]
FIRST_M = ["Muhammad", "Ali", "Ahmed", "Hassan", "Usman", "Bilal", "Hamza", "Imran", "Zubair", "Kashif", "Tariq", "Faisal", "Asad", "Shahid", "Naveed"]
FIRST_F = ["Ayesha", "Fatima", "Zainab", "Maryam", "Sana", "Hina", "Rabia", "Amna", "Nida", "Saima", "Sadia", "Iqra", "Mehwish", "Kiran", "Bushra"]
LAST = ["Khan", "Ahmed", "Malik", "Butt", "Chaudhry", "Sheikh", "Qureshi", "Raza", "Hussain", "Iqbal", "Mirza", "Javed", "Aslam", "Akhtar"]
UR = {"Muhammad": "محمد", "Ali": "علی", "Ahmed": "احمد", "Hassan": "حسن", "Usman": "عثمان", "Bilal": "بلال", "Hamza": "حمزہ", "Imran": "عمران",
	"Ayesha": "عائشہ", "Fatima": "فاطمہ", "Zainab": "زینب", "Maryam": "مریم", "Sana": "ثناء", "Hina": "حنا", "Khan": "خان", "Ahmed ": "احمد",
	"Malik": "ملک", "Butt": "بٹ", "Raza": "رضا", "Hussain": "حسین", "Iqbal": "اقبال"}
STAFF = [("admin", "Nadia Admin", [R.ADMIN]), ("reception", "Rizwan Reception", [R.RECEPTIONIST]), ("reception2", "Saba Front Desk", [R.RECEPTIONIST]),
	("nurse", "Nargis Nurse", [R.NURSE]), ("supervisor", "Shahzad Supervisor", [R.CASH_SUPERVISOR]), ("accounts", "Aamir Accountant", [R.ACCOUNTANT]),
	("lab", "Laiba Lab", [R.LAB_USER]), ("pathologist", "Dr. Pervaiz Pathologist", [R.PATHOLOGIST]), ("pharmacist", "Haris Pharmacist", [R.REVIEWER]),
	("cashier", "Kamal Cashier", [R.PHARMACY_CASHIER]), ("store", "Sohail Store", [R.STORE_KEEPER]), ("deo", "Danish Data Entry", [R.DEO]),
	("reception.isb", "Iram Reception ISB", [R.RECEPTIONIST])]


def password():
	return frappe.conf.get("hv_demo_password") or "Demo@1234"


def seed():
	frappe.flags.hv_sync_messages = True
	rnd = random.Random(42)
	masters()
	doctors()
	users()
	wards()
	panels()
	patients = make_patients(rnd)
	from hospital_vvs.services.appointments import generate_slots

	generate_slots(14)
	history(rnd, patients)
	today_activity(rnd, patients)
	frappe.db.commit()
	print("demo seeded:", len(patients), "patients")


def _ins(doctype, name_field, value, **kw):
	if not frappe.db.exists(doctype, value) and not frappe.db.exists(doctype, {name_field: value}):
		frappe.get_doc(dict({"doctype": doctype, name_field: value}, **kw)).insert(ignore_permissions=True)


def masters():
	for name, ur, color in DEPARTMENTS:
		_ins("Medical Department", "department_name", name, department_name_ur=ur, color=color)
	for name, ur, dept in SPECS:
		_ins("Specialization", "specialization", name, specialization_ur=ur, department=dept)
	for name, dup in CLASSES:
		_ins("Drug Class", "class_name", name, duplicate_therapy=dup)
	for g, c in GENERICS:
		_ins("Generic Name", "generic_name", g, drug_class=c)
	for brand, g, strength, form, max_dose, rx in MEDICINES:
		code = brand.upper().replace(" ", "-").replace("/", "-")[:40]
		if not frappe.db.exists("Item", code):
			frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": brand, "item_group": "Medicines", "stock_uom": "Nos",
				"is_stock_item": 1, "hv_is_medicine": 1, "hv_generic": g, "hv_drug_class": dict(GENERICS)[g], "hv_strength": strength,
				"hv_dosage_form": form, "hv_max_daily_dose": max_dose, "hv_prescription_required": rx, "hv_billing_type": "Medicine",
				"has_batch_no": 1, "create_new_batch": 1, "has_expiry_date": 1, "shelf_life_in_days": 730}).insert(ignore_permissions=True)
	for name, kind, gens, classes in ALLERGIES:
		_ins("Allergy", "allergy_name", name, allergy_type=kind, generics=[{"generic": g} for g in gens],
			drug_classes=[{"drug_class": c} for c in classes])
	for code, name, cat in DIAGNOSES:
		_ins("Diagnosis", "icd_code", code, diagnosis_name=name, category=cat)
	for a, b, sev, note in DEMO_INTERACTIONS:
		if not frappe.db.exists("Drug Interaction", {"generic_a": a, "generic_b": b}):
			frappe.get_doc({"doctype": "Drug Interaction", "generic_a": a, "generic_b": b, "severity": sev, "clinical_note": note,
				"source": "DEMO DATA — not a clinical reference", "is_demo": 1}).insert(ignore_permissions=True)
	for code, fee in (("OPD-CONSULT", 1500), ("OPD-FOLLOWUP", 800), ("REG-FEE", 200), ("PROC-DRESSING", 500), ("PROC-INJECTION", 300),
		("PROC-NEBULIZE", 400), ("PROC-ECG", 1200)):
		if not frappe.db.exists("Item Price", {"item_code": code, "price_list": "Standard Selling"}):
			frappe.get_doc({"doctype": "Item Price", "item_code": code, "price_list": "Standard Selling", "price_list_rate": fee}).insert(
				ignore_permissions=True)


def doctors():
	for (name, ur, spec, fee, ffee, room, color, branch, days, start, end, user) in DOCTORS:
		if frappe.db.exists("Doctor", {"doctor_name": name}):
			continue
		dept = frappe.db.get_value("Specialization", spec, "department")
		frappe.get_doc({"doctype": "Doctor", "doctor_name": name, "doctor_name_ur": ur, "specialization": spec, "department": dept,
			"default_fee": fee, "follow_up_fee": ffee, "consultation_room": room, "color": color, "branch": branch, "revisit_days": 7,
			"registration_no": f"PMDC-{random.Random(name).randint(10000, 99999)}-P", "qualification": "MBBS, FCPS", "show_license": 1,
			"schedule": [{"day": DAY[d], "start_time": start + ":00", "end_time": end + ":00", "branch": branch} for d in days.split()],
		}).insert(ignore_permissions=True)


def _user(login, full_name, roles, branch=None):
	email = f"{login}@vvs.demo"
	if not frappe.db.exists("User", email):
		u = frappe.get_doc({"doctype": "User", "email": email, "first_name": full_name.split(" ")[0] if not full_name.startswith("Dr.") else
			" ".join(full_name.split(" ")[:2]), "last_name": " ".join(full_name.split(" ")[1 if not full_name.startswith("Dr.") else 2:]),
			"send_welcome_email": 0, "user_type": "System User", "new_password": password(), "language": "en"})
		u.insert(ignore_permissions=True)
	u = frappe.get_doc("User", email)
	u.add_roles(*roles)
	if branch and not frappe.db.exists("User Permission", {"user": email, "allow": "Branch", "for_value": branch}):
		frappe.get_doc({"doctype": "User Permission", "user": email, "allow": "Branch", "for_value": branch, "is_default": 1,
			"apply_to_all_doctypes": 0, "applicable_for": "Branch"}).insert(ignore_permissions=True)
	return email


def users():
	for login, name, roles in STAFF:
		_user(login, name, roles, "Islamabad" if login.endswith(".isb") else None)
	for (name, *_rest, user) in DOCTORS:
		if user:
			email = _user(user, name, [R.DOCTOR])
			frappe.db.set_value("Doctor", {"doctor_name": name}, "user", email)


def wards():
	for (name, ur, wtype, gender, floor, charge, beds, branch, color) in WARDS:
		_ins("Ward", "ward_name", name, ward_name_ur=ur, ward_type=wtype, gender=gender, floor=floor, bed_charge_per_day=charge,
			branch=branch, color=color, nursing_station=f"NS-{name.split(' ')[0]}")
		prefix = {"General": "G", "Private": "P", "ICU": "I", "Emergency": "E"}.get(wtype, "B")
		if "Female" in name:
			prefix = "F"
		if "Children" in name:
			prefix = "C"
		per_row = 4 if wtype in ("ICU", "Private") else 6
		for i in range(beds):
			bed_no = f"{prefix}-{i + 1:02d}"
			if frappe.db.exists("Hospital Bed", f"{name}-{bed_no}"):
				continue
			row, col = divmod(i, per_row)
			frappe.get_doc({"doctype": "Hospital Bed", "bed_no": bed_no, "ward": name, "room": f"Room {row + 1}" if wtype == "Private" else None,
				"bed_type": "ICU" if wtype == "ICU" else "Couch" if wtype == "Emergency" else "Cradle" if "Children" in name and i < 3 else "Standard",
				"has_oxygen": 1 if wtype in ("ICU", "Emergency") or i % 3 == 0 else 0, "has_monitor": 1 if wtype == "ICU" else 0,
				"pos_x": 4 + col * (92 // per_row), "pos_y": 8 + row * 30}).insert(ignore_permissions=True)


def panels():
	for name, cover in (("Pakistan Telecom Panel", 80), ("State Life Insurance", 100), ("Zakat Welfare Fund", 100)):
		if not frappe.db.exists("Customer", name):
			group = "Insurance Providers" if "Insurance" in name else "Welfare Funds" if "Zakat" in name else "Panels"
			frappe.get_doc({"doctype": "Customer", "customer_name": name, "customer_group": group, "territory": "Pakistan",
				"customer_type": "Company", "hv_coverage_percent": cover}).insert(ignore_permissions=True)


def make_patients(rnd, n=60):
	existing = frappe.get_all("Patient", filters={"disabled": 0}, pluck="name")
	if len(existing) >= n:
		return existing
	out = list(existing)
	frappe.set_user("Administrator")
	for i in range(n - len(existing)):
		female = rnd.random() < 0.5
		first = rnd.choice(FIRST_F if female else FIRST_M)
		last = rnd.choice(LAST)
		age = rnd.choice([rnd.randint(1, 12), rnd.randint(18, 40), rnd.randint(30, 60), rnd.randint(55, 80)])
		phone = f"+92300{rnd.randint(1000000, 9999999)}" if i % 7 else (frappe.db.get_value("Patient", out[-1], "phone") if out else "+923001234567")
		category = "Panel" if i % 11 == 3 else "Insurance" if i % 17 == 5 else "Normal"
		allergies = [{"allergy": "Penicillin", "severity": "Severe", "reaction": "Rash, swelling"}] if i % 9 == 2 else (
			[{"allergy": "NSAIDs", "severity": "Moderate"}] if i % 13 == 4 else [])
		p = frappe.get_doc({"doctype": "Patient", "patient_name": f"{first} {last}", "patient_name_ur": f"{UR.get(first, '')} {UR.get(last, '')}".strip() or None,
			"gender": "Female" if female else "Male", "dob": add_days(today(), -int(age * 365.25) - rnd.randint(0, 300)), "phone": phone,
			"relation_type": "D/O" if female else "S/O", "guardian_name": f"{rnd.choice(FIRST_M)} {last}", "city": "Islamabad" if i % 8 == 0 else "Lahore",
			"branch": "Islamabad" if i % 8 == 0 else "Lahore Main", "category": category, "preferred_language": "ur" if i % 3 else "en",
			"panel": "Pakistan Telecom Panel" if category == "Panel" else None, "employee_id": f"PTCL-{1000 + i}" if category == "Panel" else None,
			"panel_relation": "Self" if category == "Panel" else None, "insurance_provider": "State Life Insurance" if category == "Insurance" else None,
			"policy_no": f"SLIC-{50000 + i}" if category == "Insurance" else None, "blood_group": rnd.choice(["A+", "B+", "O+", "AB+", "O-", "B-"]),
			"allergies": allergies, "chronic_conditions": [{"diagnosis": "I10"}] if age > 50 and i % 2 else ([{"diagnosis": "E11.9"}] if age > 45 and i % 3 == 0 else []),
			"long_term_medicines": [{"item": "COUMADIN-5MG", "generic": "Warfarin", "dose": "5 mg OD"}] if i == 10 else [],
			"cnic": f"35202{rnd.randint(1000000, 9999999)}{1 if not female else 2}" if age >= 18 and i % 4 else None,
			"consents": [{"consent_type": "WhatsApp messages", "status": "Given"}, {"consent_type": "Data processing", "status": "Given"}]
				+ ([{"consent_type": "SMS messages", "status": "Given"}] if i % 2 else []),
			"duplicate_reason": "Demo data",
		})
		p.insert(ignore_permissions=True)
		if i % 7 == 0 and out:
			from hospital_vvs.api.patients import link_household

			link_household(p.name, "Spouse" if female else "Son")
		out.append(p.name)
	return out


def _slip(patient, doctor, date, rnd, branch="Lahore Main", time=None, submit=True):
	d = frappe.get_doc("Doctor", doctor)
	slip = frappe.get_doc({"doctype": "OPD Slip", "patient": patient, "doctor": doctor, "branch": branch, "posting_date": date,
		"posting_time": time or f"{rnd.randint(9, 19):02d}:{rnd.randint(0, 59):02d}:00", "purpose": "Consultation",
		"chief_complaint": rnd.choice(["Fever and cough for 3 days", "Headache", "Abdominal pain", "Back pain", "Follow-up of BP",
			"Sore throat", "Skin rash", "Joint pain", "Burning micturition", "Shortness of breath"]),
		"bp_systolic": rnd.randint(105, 160), "bp_diastolic": rnd.randint(65, 100), "pulse": rnd.randint(66, 108),
		"temperature": round(rnd.uniform(97.6, 102.4), 1), "spo2": rnd.randint(93, 99), "weight": rnd.randint(14, 95), "height": rnd.randint(100, 182),
		"payment_mode": rnd.choice(["Cash", "Cash", "Cash", "Card", "JazzCash", "Easypaisa"]),
		"items": [{"item_code": "OPD-CONSULT", "qty": 1, "rate": d.default_fee}] + ([{"item_code": "PROC-ECG", "qty": 1, "rate": 1200}]
			if d.specialization == "Cardiologist" and rnd.random() < 0.4 else [])})
	slip.insert(ignore_permissions=True)
	if submit:
		slip.submit()
	return slip


def _rx(slip, rnd, sign=True):
	pool = ["PANADOL-500MG", "AUGMENTIN-625MG", "RISEK-20MG", "RIGIX-10MG", "BRUFEN-400MG", "AZOMAX-500MG", "CAL-D-500MG",
		"GLUCOPHAGE-500MG", "CONCOR-5MG", "CEFSPAN-400MG", "MAXOLON-10MG", "LIPIGET-20MG"]
	allergy = {a for a in frappe.get_all("Patient Allergy", filters={"parent": slip.patient}, pluck="allergy")}
	picks = [m for m in rnd.sample(pool, rnd.randint(1, 3)) if not (allergy and m in ("AUGMENTIN-625MG", "BRUFEN-400MG"))]
	rx = frappe.get_doc({"doctype": "Prescription", "patient": slip.patient, "doctor": slip.doctor, "branch": slip.branch,
		"opd_slip": slip.name, "queue_entry": slip.queue_entry, "prescription_date": slip.posting_date,
		"medicines": [{"item": m, "dose": "1", "frequency": rnd.choice(["1+0+1", "1+1+1", "0+0+1", "1+0+0"]), "duration": f"{rnd.choice([3, 5, 7, 14])} days",
			"qty": 10} for m in picks],
		"diagnoses": [{"diagnosis": rnd.choice([d[0] for d in DIAGNOSES[:28]]), "is_primary": 1}],
		"advice": rnd.choice(["Plenty of fluids, rest.", "Low salt diet. Walk 30 minutes daily.", "Avoid oily food.", "Steam inhalation twice daily."]),
		"follow_up_days": 7})
	from hospital_vvs.services import safety

	for line, res in zip(rx.medicines, safety.check(rx.patient, [m.as_dict() for m in rx.medicines])):
		if res["blocking"]:
			line.override_reason = "Benefit outweighs risk; patient counselled (demo)"
	rx.insert(ignore_permissions=True)
	if sign:
		rx.submit()
	return rx


def _times(q, date, rnd):
	created = get_datetime(f"{date} {rnd.randint(9, 17):02d}:{rnd.randint(0, 59):02d}:00")
	called = add_to_date(created, minutes=rnd.randint(5, 45))
	done = add_to_date(called, minutes=rnd.randint(4, 18))
	frappe.db.set_value("Queue Entry", q, {"creation": created, "called_at": called, "started_at": called, "completed_at": done,
		"status": "Done"}, update_modified=False)


def history(rnd, patients, days=30):
	if frappe.db.count("OPD Slip", {"posting_date": ["<", today()]}) > 50:
		return
	lhr = [d for d in frappe.get_all("Doctor", filters={"branch": "Lahore Main"}, pluck="name")]
	isb = frappe.get_all("Doctor", filters={"branch": "Islamabad"}, pluck="name")
	for back in range(days, 0, -1):
		date = add_days(today(), -back)
		for _ in range(rnd.randint(8, 20)):
			p = rnd.choice(patients)
			branch = frappe.db.get_value("Patient", p, "branch")
			doc = rnd.choice(isb if branch == "Islamabad" and isb else lhr)
			slip = _slip(p, doc, date, rnd, branch=branch)
			if rnd.random() < 0.85:
				_rx(slip, rnd)
			if slip.queue_entry:
				_times(slip.queue_entry, date, rnd)
		frappe.db.commit()


def today_activity(rnd, patients):
	if frappe.db.count("OPD Slip", {"posting_date": today()}) >= 8:
		return
	lhr = frappe.get_all("Doctor", filters={"branch": "Lahore Main", "user": ["is", "set"]}, pluck="name")
	lhr_patients = [p for p in patients if frappe.db.get_value("Patient", p, "branch") == "Lahore Main"]
	for i in range(14):
		slip = _slip(lhr_patients[i], lhr[i % len(lhr)], today(), rnd, time=f"{9 + i // 3:02d}:{(i * 13) % 60:02d}:00")
		if i < 5:
			_rx(slip, rnd)
			_times(slip.queue_entry, today(), rnd)
		elif i < 7:
			frappe.db.set_value("Queue Entry", slip.queue_entry, {"status": "In Consultation" if i == 5 else "Called",
				"called_at": now_datetime(), "started_at": now_datetime() if i == 5 else None})
	# appointments from every channel
	from hospital_vvs.services import appointments as svc

	for i, channel in enumerate(["Reception", "Web", "WhatsApp", "Web", "Reception", "WhatsApp", "Web"]):
		doc = lhr[i % len(lhr)]
		dates = svc.available_dates(doc)
		if not dates:
			continue
		slot = svc.available_slots(doc, dates[min(i, len(dates) - 1)].slot_date)
		if slot:
			svc.book(doctor=doc, slot=slot[0].name, patient=lhr_patients[20 + i], source_channel=channel,
				payment_channel="Payment Proof" if channel == "WhatsApp" else "At Clinic")
	# beds: some occupied, reserved, cleaning
	beds = frappe.get_all("Hospital Bed", filters={"branch": "Lahore Main", "status": "Available"}, fields=["name", "ward"], order_by="name")
	from hospital_vvs.api import ward as wapi

	frappe.set_user("Administrator")
	for i, b in enumerate(beds):
		if i % 3 == 0 and i < 50:
			wapi.assign(b.name, lhr_patients[30 + (i // 3) % 25], lhr[i % len(lhr)])
			frappe.db.set_value("Hospital Bed", b.name, "occupied_since", add_to_date(now_datetime(), hours=-rnd.randint(2, 96)))
		elif i % 7 == 1:
			wapi.set_status(b.name, "Reserved", "Planned admission")
		elif i % 11 == 2:
			wapi.set_status(b.name, "Maintenance", "Bed rail repair")
	for b in frappe.get_all("Hospital Bed", filters={"status": "Occupied"}, pluck="name", limit=3):
		wapi.release(b)
