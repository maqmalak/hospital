"""Phase 3 demo data (re-run safe): ward rates, diets, procedures, packages, pre-auth, IPD stock, nurses + roster, live admissions
and ER visits.   bench --site hospital execute hospital_vvs.setup.demo_phase3.seed
"""

import random

import frappe
from frappe.utils import add_days, add_to_date, getdate, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.setup.company import ABBR
from hospital_vvs.setup.demo import _user

WARD_RATES = {"General Ward (Male)": (500, 0), "General Ward (Female)": (500, 0), "Private Rooms": (900, 0), "ICU": (1500, 8000),
	"Children Ward": (500, 0), "Emergency Bay": (600, 0), "General Ward ISB": (450, 0)}
DIETS = [("Normal", "عام", 250, 700), ("Diabetic", "شوگر", 300, 850), ("Soft", "نرم", 220, 600), ("Liquid", "مائع", 180, 500),
	("High Protein", "زیادہ پروٹین", 350, 1000), ("NPO (nil by mouth)", "کچھ نہیں", 0, 0)]
PROCEDURES = [  # name, category, fee, theatre, anesthesia, consent, preauth
	("Appendectomy", "Major", 45000, 15000, 10000, 1, 1), ("Caesarean Section", "Major", 60000, 18000, 12000, 1, 1),
	("Normal Delivery", "Delivery", 25000, 5000, 0, 1, 0), ("Wound Debridement", "Minor", 8000, 3000, 0, 1, 0),
	("Fracture Reduction & Cast", "Minor", 15000, 4000, 3000, 1, 0), ("Central Line Insertion", "Bedside", 6000, 0, 0, 1, 0),
	("Upper GI Endoscopy", "Diagnostic", 12000, 3000, 2500, 1, 0), ("Blood Transfusion", "Bedside", 3000, 0, 0, 1, 0)]
PACKAGES = [("Appendectomy Package", "Appendectomy", 120000, 3, [("Bed", 0), ("Nursing", 0), ("Procedure", 0), ("Medicine", 15000), ("Lab", 8000), ("Diet", 0)]),
	("Normal Delivery Package", "Normal Delivery", 55000, 2, [("Bed", 0), ("Nursing", 0), ("Procedure", 0), ("Medicine", 6000), ("Diet", 0)])]
NURSES = [("nurse", "Nargis Nurse"), ("nurse2", "Shazia Nurse"), ("nurse3", "Rubina Nurse"), ("headnurse", "Farhat Head Nurse")]


def seed():
	frappe.set_user("Administrator")
	frappe.flags.hv_sync_messages = True
	frappe.flags.hv_no_shift = True  # demo money is posted without a cashier shift
	masters()
	ipd_stock()
	nurses()
	frappe.db.commit()
	activity()
	frappe.db.commit()
	frappe.flags.hv_no_shift = False
	print("phase 3 demo seeded")


def masters():
	for ward, (nursing, icu) in WARD_RATES.items():
		if frappe.db.exists("Ward", ward):
			frappe.db.set_value("Ward", ward, {"nursing_charge_per_shift": nursing, "icu_surcharge_per_day": icu})
	for name, ur, meal, day in DIETS:
		if not frappe.db.exists("Diet Type", name):
			frappe.get_doc({"doctype": "Diet Type", "diet_name": name, "diet_name_ur": ur, "per_meal_rate": meal, "per_day_rate": day}).insert(ignore_permissions=True)
	from hospital_vvs.services import ipd

	for name, cat, fee, theatre, anes, consent, pa in PROCEDURES:
		if not frappe.db.exists("Procedure Type", name):
			frappe.get_doc({"doctype": "Procedure Type", "procedure_name": name, "category": cat, "price": fee, "theatre_charge": theatre,
				"anesthesia_charge": anes, "requires_consent": consent, "requires_preauth": pa}).insert(ignore_permissions=True)
		ipd.procedure_item(name)
	for name, proc, price, days, inc in PACKAGES:
		if not frappe.db.exists("Service Package", name):
			frappe.get_doc({"doctype": "Service Package", "package_name": name, "procedure_type": proc, "price": price, "days": days,
				"inclusions": [{"charge_type": c, "limit_amount": lim} for c, lim in inc]}).insert(ignore_permissions=True)
		ipd.package_item(frappe.get_doc("Service Package", name))
	er_ward = frappe.db.get_value("Ward", {"ward_type": "Emergency", "branch": "Lahore Main"})
	if er_ward and not frappe.db.get_single_value("Clinic Settings", "er_ward"):
		frappe.db.set_single_value("Clinic Settings", "er_ward", er_ward)
	frappe.clear_document_cache("Clinic Settings")


def ipd_stock():
	"""Move a shelf of every medicine to the IPD dispensing store (ward medicines are issued from there)."""
	from hospital_vvs.services import pharmacy

	main, ipd_wh = f"Main Store LHR - {ABBR}", f"IPD Dispensing LHR - {ABBR}"
	items = frappe.get_all("Item", filters={"hv_is_medicine": 1}, fields=["name", "hv_units_per_strip", "hv_strips_per_pack"], order_by="name")
	moves = []
	for it in items:
		upp = (it.hv_units_per_strip or 1) * (it.hv_strips_per_pack or 1)
		if pharmacy.stock_units(it.name, ipd_wh) >= upp:
			continue
		if pharmacy.stock_units(it.name, main) >= 2 * upp:
			moves.append({"item_code": it.name, "qty": 2 * upp})
	if moves:
		pharmacy.fefo_transfer(main, ipd_wh, moves, remarks="IPD dispensing opening stock")


def nurses():
	from hospital_vvs.services import roster

	for login, name in NURSES:
		_user(login, name, [R.NURSE], "Lahore Main")
	types = [t[0] for t in roster.shift_types()]
	wards = frappe.get_all("Ward", filters={"branch": "Lahore Main", "ward_type": ["in", ["General", "ICU", "Private", "Emergency"]]}, pluck="name")
	start = getdate(add_days(today(), -1))
	plan = [("nurse", 0), ("nurse2", 1), ("nurse3", 2), ("headnurse", 0)]
	for d in range(8):
		day = add_days(start, d)
		for i, (login, shift_i) in enumerate(plan):
			user = f"{login}@vvs.demo"
			st = types[(shift_i + d) % len(types)] if login != "headnurse" else types[0]
			ward = wards[(i + d) % len(wards)] if login != "headnurse" else wards[0]
			emp = roster.ensure_employee(user, "Lahore Main")
			if frappe.db.exists("Shift Assignment", {"employee": emp, "start_date": day, "docstatus": 1}):
				continue
			roster.assign(user, ward, day, st, head=1 if login == "headnurse" else 0)


def activity():
	from hospital_vvs.services import er, ipd

	rnd = random.Random(33)
	ipd.adopt_occupied_beds()
	open_adms = frappe.get_all("Bed Allotment", filters={"status": "Admitted", "branch": "Lahore Main"}, fields=["name", "patient", "admitting_doctor", "ward"])
	meds = frappe.get_all("Item", filters={"hv_is_medicine": 1, "hv_prescription_required": 0}, pluck="name", limit=40)
	ipd_wh = f"IPD Dispensing LHR - {ABBR}"
	from hospital_vvs.services import pharmacy

	meds = [m for m in meds if pharmacy.stock_units(m, ipd_wh) > 20][:12]
	for adm in open_adms:
		if frappe.db.exists("IPD Medication Order", {"bed_allotment": adm.name}):
			continue
		doc = frappe.get_doc("Bed Allotment", adm.name)
		for item in rnd.sample(meds, min(2, len(meds))):
			try:
				mo, _a = ipd.order_medicine(patient=adm.patient, item=item, dose="1", frequency=rnd.choice(["BD", "TDS", "OD"]), days=3,
					start_at=add_to_date(now_datetime(), hours=-20), doctor=adm.admitting_doctor, adm=adm.name, override_reason="demo")
			except frappe.ValidationError:
				frappe.clear_last_message()
				continue
			for e in frappe.get_all("MAR Entry", filters={"medication_order": mo.name, "scheduled_at": ["<", add_to_date(now_datetime(), hours=-1)]},
				pluck="name"):
				try:
					ipd.chart_dose(e, "Administered")
				except frappe.ValidationError:
					frappe.clear_last_message()
		ipd.order_diet(adm.name, rnd.choice(["Normal", "Diabetic", "Soft"]))
		frappe.get_doc({"doctype": "Vitals Chart", "bed_allotment": adm.name, "patient": adm.patient, "branch": doc.branch,
			"recorded_at": add_to_date(now_datetime(), hours=-2), "bp_systolic": rnd.randint(105, 150), "bp_diastolic": rnd.randint(65, 95),
			"pulse": rnd.randint(64, 110), "temperature": round(rnd.uniform(97.6, 100.8), 1), "spo2": rnd.randint(93, 99)}).insert(ignore_permissions=True)
		n = frappe.get_doc({"doctype": "IPD Note", "bed_allotment": adm.name, "patient": adm.patient, "branch": doc.branch, "note_type": "Nursing",
			"note": rnd.choice(["Patient comfortable, slept well.", "Mild pain, analgesic given as charted.", "Vitals stable. Oral intake fair.",
			"Ambulating with support."])})
		n.insert(ignore_permissions=True)
		n.submit()
		if rnd.random() < 0.6:
			ipd.take_payment(rnd.choice([10000, 20000, 25000, 50000]), rnd.choice(["Cash", "Card"]), "Advance", adm=adm.name)
	# pre-auth for an insurance patient
	ins = frappe.db.get_value("Customer", {"customer_group": "Insurance Providers"})
	if ins and not frappe.db.exists("Insurance Pre-Auth", {"payer": ins}):
		pat = frappe.db.get_value("Patient", {"branch": "Lahore Main", "disabled": 0, "temporary_record": 0})
		frappe.get_doc({"doctype": "Insurance Pre-Auth", "patient": pat, "payer": ins, "policy_no": "SLIC-778812", "procedure_type": "Appendectomy",
			"requested_amount": 150000, "approved_amount": 120000, "approval_no": "SL-PA-2026-0441", "status": "Approved",
			"valid_till": add_days(today(), 20), "decided_on": today()}).insert(ignore_permissions=True)
	# ER: an unknown red, a yellow, a green
	if not frappe.db.exists("ER Visit", {"status": ["!=", "Disposed"]}):
		v = er.register(unknown={"gender": "Male", "approx_age": 40}, branch="Lahore Main", arrival_mode="Ambulance (1122)", brought_by="Rescue 1122",
			chief_complaint="Road traffic accident, head injury, unconscious", medico_legal=1, mlc_no="MLC-2026-118", police_station="Model Town")
		er.triage(v.name, "Red", {"bp_systolic": 90, "bp_diastolic": 60, "pulse": 124, "spo2": 89, "gcs": 9})
		pats = frappe.get_all("Patient", filters={"branch": "Lahore Main", "disabled": 0, "temporary_record": 0}, pluck="name", limit=40)
		pats = [p for p in pats if not ipd.open_admission(p)]
		v2 = er.register(patient=pats[3], branch="Lahore Main", chief_complaint="Chest pain for 2 hours")
		er.triage(v2.name, "Yellow", {"bp_systolic": 150, "bp_diastolic": 95, "pulse": 98, "spo2": 96})
		v3 = er.register(patient=pats[7], branch="Lahore Main", chief_complaint="Cut on left hand")
		er.triage(v3.name, "Green", {"bp_systolic": 120, "bp_diastolic": 80, "pulse": 82, "spo2": 99})
		doc = frappe.db.get_value("Doctor", {"is_active": 1, "doctor_type": ["!=", "External Referring"]})
		er.assign(v.name, doctor=doc)
		bays = frappe.get_all("Hospital Bed", filters={"ward": frappe.db.get_single_value("Clinic Settings", "er_ward"), "status": "Available"}, pluck="name")
		if bays:
			er.assign(v.name, bay=bays[0])
		if frappe.db.exists("Lab Test Template", "Complete Blood Count"):
			ipd.order_labs(["Complete Blood Count"], "Urgent", doc, er_visit=v.name)
