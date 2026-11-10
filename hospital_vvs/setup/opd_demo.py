"""Daily OPD demo data (scripts/opd_demo.sh). Runs the real flow as the demo users, so every document is what the screens make:
reception shifts → new + returning patients (with Urdu names) → OPD slips with vitals → nurse priorities → doctors call and prescribe
(quantities worked out, some lab tests) → a few patients left waiting so the queues and the doctors' pending lists are alive.

bench --site hospital execute hospital_vvs.setup.opd_demo.run --kwargs "{'new_patients': 12, 'visits': 30}"
"""

import json
import random

import frappe
from frappe.utils import cint, today

UR = {"Muhammad": "محمد", "Ali": "علی", "Ahmed": "احمد", "Hassan": "حسن", "Usman": "عثمان", "Bilal": "بلال", "Hamza": "حمزہ", "Imran": "عمران", "Faisal": "فیصل",
	"Kamran": "کامران", "Shahid": "شاہد", "Tariq": "طارق", "Zubair": "زبیر", "Asad": "اسد", "Naveed": "نوید", "Ayesha": "عائشہ", "Fatima": "فاطمہ", "Zainab": "زینب",
	"Maryam": "مریم", "Sana": "ثناء", "Hina": "حنا", "Rabia": "رابعہ", "Amna": "آمنہ", "Saima": "صائمہ", "Sadia": "سعدیہ", "Nazia": "نازیہ", "Shazia": "شازیہ",
	"Asma": "اسماء", "Farah": "فرح", "Mehwish": "مہوش", "Khan": "خان", "Butt": "بٹ", "Qureshi": "قریشی", "Malik": "ملک", "Sheikh": "شیخ", "Chaudhry": "چوہدری",
	"Raza": "رضا", "Awan": "اعوان", "Siddiqui": "صدیقی", "Bhatti": "بھٹی", "Iqbal": "اقبال", "Javed": "جاوید", "Hussain": "حسین", "Abbasi": "عباسی"}
MALE = ["Muhammad", "Ali", "Ahmed", "Hassan", "Usman", "Bilal", "Hamza", "Imran", "Faisal", "Kamran", "Shahid", "Tariq", "Zubair", "Asad", "Naveed"]
FEMALE = ["Ayesha", "Fatima", "Zainab", "Maryam", "Sana", "Hina", "Rabia", "Amna", "Saima", "Sadia", "Nazia", "Shazia", "Asma", "Farah", "Mehwish"]
LAST = ["Khan", "Butt", "Qureshi", "Malik", "Sheikh", "Chaudhry", "Raza", "Awan", "Siddiqui", "Bhatti", "Iqbal", "Javed", "Hussain", "Abbasi"]
CASES = [  # complaint, diagnosis keyword, medicines (name like, dose, frequency, duration), labs
	("Fever, body aches for 3 days", "fever", [("Panadol", "1", "1+1+1", "5 days")], ["Complete Blood Count"]),
	("Sore throat and cough", "pharyngitis", [("Amoxil", "1", "1+0+1", "7 days"), ("Panadol", "1", "1+0+1", "3 days")], []),
	("High blood pressure follow-up", "hypertension", [("Concor", "1", "1+0+0", "1 month")], []),
	("Sugar control review", "diabetes", [("Glucophage", "1", "1+0+1", "1 month")], ["HbA1c"]),
	("Burning urine", "urinary", [("Ciproxin", "1", "1+0+1", "5 days")], ["Urine R/E"]),
	("Acidity and heartburn", "gastritis", [("Risek", "1", "1+0+0", "14 days")], []),
	("Child with cough and fever", "respiratory", [("Calpol Syrup", "5 ml", "1+1+1", "5 days")], []),
	("Joint pains", "arthralgia", [("Brufen", "1", "1+0+1", "5 days")], ["Renal Function Tests"]),
	("Fever with chills", "malaria", [("Panadol", "1", "1+1+1", "3 days")], ["Malaria Parasite", "Complete Blood Count"]),
	("General weakness", "anaemia", [("Cal-D", "1", "0+0+1", "1 month")], ["Complete Blood Count"]),
]
REC, REC2, NURSE = "reception@vvs.demo", "reception2@vvs.demo", "nurse@vvs.demo"


def _as(u):
	frappe.set_user(u)


def _close_at_expected(user, note="Demo: end of day"):
	"""Close the user's open shift with the drawer exactly as expected (demo only — real staff count blind)."""
	from hospital_vvs.services import shifts

	_as(user)
	cur = shifts.current_shift()
	if not cur:
		return None
	s = shifts.summary(cur.name)
	cash = int(round(next((m["expected"] for m in s["modes"] if m["mode_of_payment"] == "Cash"), 0)))
	notes = {}
	for dn in (5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1):
		if cash >= dn:
			notes[str(dn)], cash = cash // dn, cash % dn
	shifts.close_shift(notes, {m["mode_of_payment"]: m["expected"] for m in s["modes"] if m["mode_of_payment"] != "Cash"}, note)
	return cur.name


def close_stale_shifts():
	"""Every shift still open from an earlier day (any counter) — a new day cannot start on it."""
	closed = []
	for r in frappe.get_all("POS Opening Entry", filters={"status": "Open", "docstatus": 1, "posting_date": ["<", today()]}, fields=["name", "user"]):
		try:
			_close_at_expected(r.user)
			frappe.db.commit()
			closed.append(f"{r.name} ({r.user})")
		except Exception as e:
			frappe.db.rollback()
			print(f"could not close {r.name} ({r.user}): {e}")
	_as("Administrator")
	print("closed:", ", ".join(closed) or "none")
	return closed


def _shifts():
	from hospital_vvs.services import shifts

	close_stale_shifts()
	for user, counter in ((REC, "Reception 1"), (REC2, "Reception 2")):
		_as(user)
		if shifts.current_shift():
			continue
		c = frappe.get_doc("Counter", counter)
		if not (c.open_shift and frappe.db.get_value("POS Opening Entry", c.open_shift, "status") == "Open"):
			shifts.open_shift(counter, {"Cash": 5000})


def _new_patient(rnd):
	from hospital_vvs.api import patients as api

	female = rnd.random() < 0.5
	first, last = rnd.choice(FEMALE if female else MALE), rnd.choice(LAST)
	extra = rnd.choice(["", "", "Ali ", "Bibi "]) if not female else rnd.choice(["", "", "Bibi "])
	name = f"{first} {extra}{last}".replace("  ", " ")
	ur = " ".join(UR.get(w, w) for w in name.split()).replace("Bibi", "بی بی")
	d = {"patient_name": name, "patient_name_ur": ur, "gender": "Female" if female else "Male", "phone": f"+92300{rnd.randint(1000000, 9999999)}",
		"age": rnd.choice([rnd.randint(2, 12), rnd.randint(18, 45), rnd.randint(46, 80)]), "relation_type": "D/O" if female else "S/O",
		"guardian_name": f"{rnd.choice(MALE)} {last}", "city": "Lahore", "preferred_language": "ur" if rnd.random() < 0.7 else "en"}
	_as(rnd.choice([REC, REC2]))
	return api.register(json.dumps(d), "Demo data")["name"]


def run(new_patients=12, visits=30, seed=None):
	from hospital_vvs.api import opd as opd_api
	from hospital_vvs.api import prescription as rx_api

	rnd = random.Random(seed if seed is not None else int(today().replace("-", "")) + frappe.db.count("OPD Slip"))
	frappe.flags.mute_messages = True
	_shifts()
	docs = [d for d in frappe.get_all("Doctor", filters={"is_active": 1, "user": ["is", "set"], "doctor_type": "Internal"}, fields=["name", "user"])]
	existing = frappe.get_all("Patient", filters={"disabled": 0, "temporary_record": 0, "branch": "Lahore Main"}, pluck="name", order_by="modified desc", limit=200)
	made = {"patients": 0, "slips": 0, "prescriptions": 0, "waiting": 0, "lab_orders": 0}
	fresh = []
	for _ in range(cint(new_patients)):
		try:
			fresh.append(_new_patient(rnd))
			made["patients"] += 1
		except Exception:
			frappe.db.rollback()
	pool = fresh + rnd.sample(existing, min(len(existing), max(cint(visits) - len(fresh), 0)))
	slips = []
	for p in pool[: cint(visits)]:
		case = rnd.choice(CASES)
		doc = rnd.choice(docs)
		try:
			_as(rnd.choice([REC, REC2]))
			s = opd_api.create_slip(json.dumps({"patient": p, "doctor": doc.name, "payment_mode": rnd.choice(["Cash", "Cash", "Cash", "JazzCash", "Card"]),
				"chief_complaint": case[0]}))  # vitals are taken by the nurse
			slips.append((frappe.get_doc("OPD Slip", s["name"]), case, doc))
			made["slips"] += 1
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
	_as(NURSE)
	at_nurse = max(2, len(slips) // 8)  # the last few tokens are still waiting for vitals
	for k, (sl, _c, _d) in enumerate(slips):
		if frappe.db.get_value("Queue Entry", sl.queue_entry, "status") != "Vitals" or k >= len(slips) - at_nurse:
			continue
		age = frappe.db.get_value("Patient", sl.patient, "dob")
		elderly = age and (frappe.utils.getdate().year - frappe.utils.getdate(age).year) >= 65
		opd_api.record_vitals(sl.queue_entry, json.dumps({"bp_systolic": rnd.randint(105, 160), "bp_diastolic": rnd.randint(65, 100), "pulse": rnd.randint(64, 108),
			"temperature": round(rnd.uniform(97.6, 102.4), 1), "spo2": rnd.randint(94, 99), "weight": rnd.randint(12, 95), "height": rnd.randint(95, 185)}),
			"Elderly" if elderly else ("Urgent" if rnd.random() < 0.08 else ""))
	frappe.db.commit()
	slips = slips[: len(slips) - at_nurse]
	made["at_vitals"] = at_nurse
	keep_waiting = max(3, len(slips) // 5)
	for k, (sl, case, doc) in enumerate(slips):
		if k >= len(slips) - keep_waiting:
			made["waiting"] += 1
			continue
		try:
			_as(doc.user)
			opd_api.set_queue_status(sl.queue_entry, "Called")
			meds = []
			for like, dose, freq, dur in case[2]:
				item = frappe.db.get_value("Item", {"hv_is_medicine": 1, "disabled": 0, "item_name": ["like", f"%{like}%"]})
				if item:
					meds.append({"item": item, "dose": dose, "frequency": freq, "duration": dur, "route": "Oral", "instructions": "After meals"})
			dx = frappe.db.get_value("Diagnosis", {"diagnosis_name": ["like", f"%{case[1]}%"]}) or frappe.db.get_value("Diagnosis", {})
			labs = [{"test_name": t} for t in case[3] if rnd.random() < 0.7]
			rx_api.save(json.dumps({"queue_entry": sl.queue_entry, "medicines": meds, "diagnoses": [{"diagnosis": dx, "is_primary": 1}] if dx else [],
				"lab_tests": labs, "examination_notes": "Examined.", "advice": "Plenty of fluids, rest.", "follow_up_days": rnd.choice([3, 5, 7, 14])}), 1)
			made["prescriptions"] += 1
			made["lab_orders"] += bool(labs)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(frappe.get_traceback(), "OPD demo: prescription failed")
	_as("Administrator")
	frappe.db.commit()
	print(json.dumps(made))
	return made
