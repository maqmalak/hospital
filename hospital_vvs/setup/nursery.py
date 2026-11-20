"""Nursery wards + demo data (D-95).

ensure_wards(): Mother & Baby Rooms, Rooming-in Cradles, Well-Baby Nursery, NICU with their cots (Hospital Beds). Insert-only; rates and
cot counts are PLACEHOLDERS [confirm]. Runs after migrate.

run(): DEMO DATA (not clinical records) — nursery staff users, a healthy term baby (discharged, full papers), a preterm NICU baby with
jaundice on phototherapy + CPAP, twins in the nursery, a baby ready for discharge, one with a missed feed, and 60 days of history.
	bench --site hospital execute hospital_vvs.setup.nursery.run
"""

import random
from datetime import timedelta

import frappe
from frappe.utils import add_to_date, get_datetime, getdate, now_datetime, today

from hospital_vvs import roles as R

# name, urdu, type, floor, rate/day [confirm], cots, prefix, bed_type, colour
WARDS = [("Mother & Baby Rooms", "ماں اور بچے کے کمرے", "Maternity", "Second", 9000, 6, "MB", "Standard", "#e11d74"),
	("Rooming-in Cradles", "ماں کے ساتھ جھولے", "Maternity", "Second", 1500, 6, "RC", "Cradle", "#f472b6"),
	("Well-Baby Nursery", "نرسری", "Nursery", "Second", 4500, 10, "NB", "Cradle", "#0ea5e9"),
	("NICU", "این آئی سی یو", "NICU", "Second", 18000, 8, "NI", "ICU", "#7c3aed")]


def ensure_wards():
	branch = frappe.db.get_value("Branch", {}, "name")
	if not branch:
		return
	for name, ur, wtype, floor, rate, cots, pre, btype, color in WARDS:
		if not frappe.db.exists("Ward", name):
			frappe.get_doc({"doctype": "Ward", "ward_name": name, "ward_name_ur": ur, "ward_type": wtype, "gender": "Children" if wtype != "Maternity" or pre == "RC" else "Female",
				"branch": branch, "floor": floor, "color": color, "is_active": 1, "bed_charge_per_day": rate, "sort_order": 50}).insert(ignore_permissions=True)
		per = 4 if wtype == "NICU" else 6
		for i in range(cots):
			bed = f"{pre}-{i + 1:02d}"
			if frappe.db.exists("Hospital Bed", {"ward": name, "bed_no": bed}):
				continue
			row, col = divmod(i, per)
			frappe.get_doc({"doctype": "Hospital Bed", "bed_no": bed, "ward": name, "branch": branch, "bed_type": btype, "status": "Available", "is_active": 1,
				"room": f"Room {i + 1}" if pre == "MB" else None, "has_oxygen": 1 if wtype in ("NICU", "Nursery") else 0, "has_monitor": 1 if wtype == "NICU" else 0,
				"pos_x": 4 + col * (92 // per), "pos_y": 8 + row * 30}).insert(ignore_permissions=True)


# ------------------------------------------------------------------ demo
def staff():
	from hospital_vvs.setup.demo import _user

	br = frappe.db.get_value("Branch", {}, "name")
	_user("nursery", "Shazia Nursery Nurse", [R.NURSERY_NURSE], br)
	_user("nicu", "Rukhsana NICU Nurse", [R.NICU_NURSE], br)
	_user("wardadmin", "Tahira Ward Admin", [R.WARD_ADMIN], br)
	_user("security", "Akram Security", [R.SECURITY], br)
	sana = frappe.db.get_value("Doctor", {"doctor_name": "Dr. Sana Malik"}, "user")
	if sana:
		frappe.get_doc("User", sana).add_roles(R.NEONATOLOGIST)
	farah = frappe.db.get_value("Doctor", {"doctor_name": "Dr. Farah Naz"}, "user")
	return frappe.db.get_value("Doctor", {"doctor_name": "Dr. Sana Malik"}, "name"), frappe.db.get_value("Doctor", {"doctor_name": "Dr. Farah Naz"}, "name"), sana, farah


def _as(user, fn, *a, **kw):
	prev = frappe.session.user
	frappe.set_user(user)
	try:
		return fn(*a, **kw)
	finally:
		frappe.set_user(prev)


def _mothers(n, rnd):
	used = set(frappe.get_all("Newborn", pluck="mother"))
	rows = [p for p in frappe.get_all("Patient", filters={"gender": "Female", "disabled": 0, "temporary_record": 0, "dob": ["<", "2006-01-01"], "panel": ["is", "not set"], "insurance_provider": ["is", "not set"]}, fields=["name", "patient_name", "dob", "phone"], limit=500)
		if p.name not in used and not p.patient_name.startswith("Baby")]
	rnd.shuffle(rows)
	return rows[:n]


def _admit_mother(m, doctor, at):
	from hospital_vvs.services import ipd, nursery as nz

	if frappe.db.exists("Bed Allotment", {"patient": m.name, "status": ["in", ["Admitted", "Discharge Pending"]]}):
		return
	bed = frappe.db.get_value("Hospital Bed", {"ward": "Mother & Baby Rooms", "status": "Available"}, "name")
	if bed:
		try:
			ipd.admit(m.name, bed, doctor, reason="Delivery", diagnosis="Term pregnancy — delivery", admit_at=at)
		except frappe.ValidationError:
			frappe.clear_messages()  # demo only: a mother on a panel without pre-auth simply is not admitted


def _chart(nb_name, user, hours, rnd, *, nicu=False, start_weight=None, bili=None, photo_at=None, missed_feed=False):
	"""Chart `hours` of care: vitals q4-6h, feeds q3h, outputs, daily weights, bilirubin curve."""
	from hospital_vvs.services import nursery as nz

	nb = frappe.get_doc("Newborn", nb_name)
	t0 = get_datetime(nb.birth_datetime)
	w = start_weight or nb.birth_weight_g
	h = 1
	while h <= hours:
		at = add_to_date(t0, hours=h)
		if at > now_datetime():
			break
		if h % (3 if nicu else 5) == 1:
			v = {"temp_c": round(rnd.uniform(36.6, 37.3), 1), "hr": rnd.randint(125, 158), "rr": rnd.randint(38, 56), "spo2": rnd.randint(93 if nicu else 96, 99)}
			if nicu and h < 30 and rnd.random() < 0.35:
				v["rr"] = rnd.randint(62, 72)  # tachypnoea early on (respiratory distress)
			_as(user, nz._entry, nb, "Vitals", v, at=at)
		if h % 3 == 0 and not (missed_feed and h > hours - 6):
			if nicu:
				f = {"feed_type": "Nil by mouth"} if h < 18 else {"feed_type": "NG / OG tube", "feed_ml": round(min(2 + h * 0.35, 24), 1), "note": "Expressed breast milk"}
			else:
				f = {"feed_type": rnd.choice(["Breastfeed", "Breastfeed", "Breastfeed", "Expressed breast milk"]), "feed_min": rnd.randint(10, 25)}
			_as(user, nz._entry, nb, "Feed", f, at=at)
		if h % 6 == 0:
			_as(user, nz._entry, nb, "Output", {"urine": rnd.randint(1, 3), "stool": "Meconium" if h < 48 else rnd.choice(["Transitional", "Yellow"])}, at=at)
		if h % 24 == 0:
			day = h // 24
			w = int(nb.birth_weight_g * (1 - min(day, 3) * (0.025 if not nicu else 0.03)) + (max(day - 3, 0) * 25))
			_as(user, nz._entry, nb, "Weight", {"weight_g": w}, at=at)
		if bili and h in bili:
			e = {"bilirubin": bili[h], "bili_method": "Serum" if nicu else "Transcutaneous"}
			if photo_at and h == photo_at:
				e["photo_on"] = "Started"
			_as(user, nz._entry, nb, "Bilirubin", e, at=at)
		h += 1


def run(seed=11):
	from hospital_vvs.services import nursery as nz

	frappe.flags.hv_sync_messages = True
	frappe.set_user("Administrator")
	rnd = random.Random(seed)
	ensure_wards()
	sana_doc, farah_doc, sana, farah = staff()
	if frappe.db.count("Newborn", {"status": ["!=", "Discharged"]}) >= 4:
		print("demo babies already present")
		return
	now = now_datetime()
	nurse, nicu_nurse = "nursery@vvs.demo", "nicu@vvs.demo"
	ms = _mothers(8, rnd)
	made = {}

	def reg(m, hours_ago, unit, babies, **kw):
		at = add_to_date(now, hours=-hours_ago)
		_admit_mother(m, farah_doc, add_to_date(at, hours=-6))
		data = {"mother": m.name, "unit": unit, "birth_datetime": str(at), "attending_doctor": sana_doc, "obstetrician": farah_doc, "photo_consent": 1,
			"father_name": kw.pop("father", "Muhammad " + rnd.choice(["Imran", "Asif", "Kashif", "Tariq", "Naveed"])), "babies": babies, **kw}
		return _as(nurse if unit != "NICU" else nicu_nurse, nz.register, data)

	# 1 · healthy term baby — full stay, discharged today with papers (sample A)
	a = reg(ms[0], 54, "Rooming-in", [{"sex": "Female", "birth_weight_g": 3250, "length_cm": 50, "head_circ_cm": 34.5, "apgar_1": 8, "apgar_5": 9, "blood_group": "O+"}],
		gestation_weeks=39, gestation_days=2, delivery_type="Normal vaginal")[0]
	_chart(a, nurse, 52, rnd, bili={30: 6.2, 48: 8.1})
	nb = frappe.get_doc("Newborn", a)
	for i, (v, batch) in enumerate((("BCG", "BCG-2611-07"), ("OPV-0", "OPV-2610-21"), ("Hepatitis B (birth dose)", "HBV-2609-14"))):
		_as(nurse, nz._entry, nb, "Vaccine", {"item": v, "batch_no": batch, "route": "Intradermal" if v == "BCG" else "Oral" if "OPV" in v else "IM", "dose": "0.05 ml" if v == "BCG" else "2 drops" if "OPV" in v else "0.5 ml"}, at=add_to_date(nb.birth_datetime, hours=6 + i))
	_as(nurse, nz._entry, nb, "Medication", {"item": "Vitamin K1 (phytomenadione)", "dose": "1 mg", "route": "IM", "batch_no": "VK-2610-03"}, at=add_to_date(nb.birth_datetime, hours=1))
	for s, h in (("Hearing (OAE)", 30), ("CCHD pulse oximetry", 26)):
		_as(nurse, nz._entry, nb, "Screening", {"screening": s, "result": "Pass"}, at=add_to_date(nb.birth_datetime, hours=h))
	_as(sana, nz._entry, nb, "Doctor Note", {"note": "Examination normal. Feeding well, passing urine and meconium. Mild physiological jaundice, below phototherapy line.", "share_with_parents": 1}, at=add_to_date(nb.birth_datetime, hours=26))
	_as(nurse, nz.security_event, a, "Band check at hand-over", with_whom="Mother (verified)", band_match=1)
	_as(nurse, nz.security_event, a, "Tag removed", note="Discharge")
	_as(nurse, nz.post_update, a, "Feeding well and sleeping peacefully next to mum. Ready to go home today!", None, True)
	frappe.db.set_value("Newborn", a, "baby_name", "Hoorain " + ms[0].patient_name.split(" ")[-1])
	frappe.db.set_value("Newborn", a, "named", 1)
	_as(sana, nz.discharge, a, {**{k: 1 for k in nz.CHECKS}, "discharge_diagnosis": "Healthy term female newborn. Physiological jaundice — resolving.",
		"discharge_advice": "Exclusive breastfeeding on demand (8-12 times a day). Keep cord clean and dry. Sleep on the back.", "discharge_meds": "None",
		"follow_up_date": str(getdate(today()) + timedelta(days=7))})
	made["term"] = a

	# 2 · preterm NICU baby with jaundice on phototherapy + CPAP (sample B)
	b = reg(ms[1], 64, "NICU", [{"sex": "Male", "birth_weight_g": 1650, "length_cm": 41, "head_circ_cm": 29.5, "apgar_1": 6, "apgar_5": 8, "nicu_reason": "Prematurity", "blood_group": "B+"}],
		gestation_weeks=32, gestation_days=3, delivery_type="C-section (emergency)")[0]
	_chart(b, nicu_nurse, 63, rnd, nicu=True, bili={24: 5.4, 40: 7.6, 56: 9.8, 62: 9.1}, photo_at=56)
	nb = frappe.get_doc("Newborn", b)
	for h, sup in ((1, {"resp_support": "CPAP", "fio2": 35, "peep": 6, "iv_fluid": "10% dextrose", "iv_rate": 5.5, "incubator_temp": 34.5}),
			(20, {"resp_support": "CPAP", "fio2": 28, "peep": 5, "iv_fluid": "10% dextrose", "iv_rate": 5.0, "incubator_temp": 34.0}),
			(44, {"resp_support": "Nasal oxygen", "fio2": 25, "iv_fluid": "10% dextrose + Na/K", "iv_rate": 3.5, "incubator_temp": 33.5})):
		_as(nicu_nurse, nz._entry, nb, "NICU Support", sup, at=add_to_date(nb.birth_datetime, hours=h))
	_as(nicu_nurse, nz._entry, nb, "Medication", {"item": "Vitamin K1 (phytomenadione)", "dose": "0.5 mg", "route": "IM", "batch_no": "VK-2610-03"}, at=add_to_date(nb.birth_datetime, hours=1))
	_as(nicu_nurse, nz._entry, nb, "Medication", {"item": "Caffeine citrate", "dose": "20 mg/kg loading", "route": "IV", "batch_no": "CAF-2608-11"}, at=add_to_date(nb.birth_datetime, hours=3))
	_as(sana, nz._entry, nb, "Doctor Note", {"note": "32+3 week preterm, RDS on CPAP, weaned to nasal O2 at 44 h. Serum bilirubin 9.8 mg/dL at 56 h — above preterm line, phototherapy started. Plan: continue NG EBM, advance feeds, repeat bilirubin in 12 h."}, at=add_to_date(nb.birth_datetime, hours=57))
	_as(nicu_nurse, nz.post_update, b, "Your son is breathing more comfortably today — off CPAP and on a little oxygen. He is under the blue light for jaundice, which is very common in early babies. Mum's milk is going down his tube well.", None, True)
	frappe.db.set_value("Newborn", b, "status", "Phototherapy")
	made["preterm"] = b

	# 3 · twins in the nursery (36+5)
	t = reg(ms[2], 26, "Nursery", [{"sex": "Male", "birth_weight_g": 2350, "length_cm": 46, "head_circ_cm": 32, "apgar_1": 8, "apgar_5": 9},
		{"sex": "Female", "birth_weight_g": 2180, "length_cm": 45, "head_circ_cm": 31.5, "apgar_1": 7, "apgar_5": 9}], gestation_weeks=36, gestation_days=5, delivery_type="C-section (elective)")
	for x in t:
		_chart(x, nurse, 25, rnd)
		frappe.db.set_value("Newborn", x, "status", "Observation")
	made["twins"] = t

	# 4 · ready for discharge (rooming-in) · 5 · missed feed in the nursery
	r = reg(ms[3], 40, "Rooming-in", [{"sex": "Male", "birth_weight_g": 3420, "apgar_1": 9, "apgar_5": 10}], gestation_weeks=40, gestation_days=0)[0]
	_chart(r, nurse, 39, rnd, bili={30: 7.0})
	frappe.db.set_value("Newborn", r, "status", "Ready for discharge")
	mf = reg(ms[4], 14, "Nursery", [{"sex": "Female", "birth_weight_g": 2900, "apgar_1": 8, "apgar_5": 9}], gestation_weeks=38, gestation_days=1)[0]
	_chart(mf, nurse, 13, rnd, missed_feed=True)
	made.update({"ready": r, "missed_feed": mf})
	history(rnd)
	frappe.db.commit()
	print(made)
	return made


def history(rnd, days=60):
	"""Discharged babies for the reports (no cots, light charting)."""
	if frappe.db.count("Newborn", {"status": "Discharged"}) > 20:
		return
	moms = _mothers(80, rnd)
	reasons = ["Prematurity", "Respiratory distress", "Neonatal jaundice", "Suspected sepsis", "Low birth weight", "Hypoglycaemia", "Birth asphyxia"]
	for i, m in enumerate(moms[: rnd.randint(55, 70)]):
		born = add_to_date(now_datetime(), days=-rnd.randint(4, days), hours=-rnd.randint(0, 23))
		nicu = rnd.random() < 0.14
		unit = "NICU" if nicu else rnd.choice(["Rooming-in", "Rooming-in", "Rooming-in", "Nursery"])
		ga = rnd.randint(30, 35) if nicu else rnd.randint(37, 41)
		wt = rnd.randint(1300, 2300) if nicu else rnd.randint(2500, 3900)
		pat = frappe.get_doc({"doctype": "Patient", "patient_name": f"Baby of {m.patient_name}", "gender": rnd.choice(["Male", "Female"]), "dob": born.date(), "phone": m.phone,
			"guardian_name": m.patient_name, "relation_type": "C/O", "branch": frappe.db.get_value("Branch", {}, "name"), "duplicate_reason": "Demo newborn"})
		pat.flags.ignore_mandatory = True
		pat.insert(ignore_permissions=True)
		stay = rnd.uniform(6, 12) if nicu else rnd.uniform(1.2, 3.5)
		frappe.get_doc({"doctype": "Newborn", "status": "Discharged", "unit": unit, "baby_patient": pat.name, "baby_name": pat.patient_name, "sex": pat.gender, "mother": m.name,
			"mother_name": m.patient_name, "mother_phone": m.phone, "birth_datetime": born, "delivery_type": rnd.choice(["Normal vaginal", "Normal vaginal", "C-section (elective)", "C-section (emergency)"]),
			"gestation_weeks": ga, "birth_weight_g": wt, "current_weight_g": wt, "apgar_1": rnd.randint(6, 9), "apgar_5": rnd.randint(8, 10), "nicu_reason": rnd.choice(reasons) if nicu else None,
			"band_no": f"LMC-H{i:04d}-{rnd.randint(100, 999)}", "discharged_at": add_to_date(born, hours=int(stay * 24)), "tag_active": 0,
			"branch": frappe.db.get_value("Branch", {}, "name")}).insert(ignore_permissions=True)
