"""Daily IPD / ER demo data for the hospital site (companion of opd_demo, D-61).

    bench --site hospital execute hospital_vvs.setup.ipd_demo.run
    scripts/ipd_demo.sh            (ADMIT=3 DISCHARGE=3 ER=3)

Each step runs as the staff member who does it in real life, through the same API the screens use:
housekeeping frees cleaned beds, yesterday's ER visits are closed (admit / discharge / refer), new ER arrivals are
triaged, the longest stays are discharged (summary → final bill → settlement or refund → bed to Cleaning),
today's OPD patients are admitted with an advance, and every inpatient gets vitals, a nursing note, today's diet,
due doses charted and sometimes a further advance. Errors are printed and skipped; each step commits on its own.
"""

import json
import random

import frappe
from frappe.utils import add_days, flt, getdate, now_datetime, today

from hospital_vvs.setup.opd_demo import REC, REC2, _as, _new_patient, _shifts

NURSE, HEAD, DOC_USER = "nurse@vvs.demo", "headnurse@vvs.demo", "dr.ayesha@vvs.demo"
BRANCH = "Faisalabad Main"
J = json.dumps

REASONS = [("High grade fever, vomiting", "Enteric fever"), ("Shortness of breath", "Community acquired pneumonia"),
	("Diarrhoea and dehydration", "Acute gastroenteritis"), ("Uncontrolled sugar", "Type 2 diabetes, hyperglycaemia"),
	("Chest pain", "Unstable angina?"), ("Abdominal pain, right lower side", "Acute appendicitis?"), ("Dengue fever, low platelets", "Dengue fever")]
ER_CASES = [("Road traffic accident, leg injury", "Yellow"), ("Chest pain for 2 hours", "Yellow"), ("High fever and fits", "Red"),
	("Cut on hand", "Green"), ("Burn on forearm", "Green"), ("Breathing difficulty", "Red"), ("Abdominal pain", "Yellow")]
NOTES = ["Patient comfortable, slept well.", "Mild pain, analgesic given as charted.", "Vitals stable. Oral intake fair.",
	"Ambulating with support.", "IV line patent, no swelling.", "Fever settled since morning."]


def _step(label, fn, *a, **kw):
	try:
		out = fn(*a, **kw)
		frappe.db.commit()
		return out
	except Exception as e:
		frappe.db.rollback()
		frappe.clear_last_message()
		print(f"  ! {label}: {str(e)[:160]}")
		return None


def _doctor_of(adm):
	"""Admitting doctor's user when they have one, else the demo physician."""
	u = frappe.db.get_value("Doctor", adm.admitting_doctor, "user") if adm.get("admitting_doctor") else None
	return u or DOC_USER


def _free_bed(ward_type="General"):
	wards = frappe.get_all("Ward", filters={"branch": BRANCH, "ward_type": ward_type, "is_active": 1}, pluck="name")
	beds = frappe.get_all("Hospital Bed", filters={"ward": ["in", wards or [""]], "status": "Available", "is_active": 1}, pluck="name", order_by="bed_no")
	return beds[0] if beds else None


def housekeeping():
	from hospital_vvs.api import ward

	_as(HEAD)
	n = 0
	for bed in frappe.get_all("Hospital Bed", filters={"status": "Cleaning", "is_active": 1}, pluck="name"):
		if _step(f"clean {bed}", ward.set_status, bed, "Available", "Demo: cleaned"):
			n += 1
	print(f"housekeeping: {n} beds cleaned")


def er_close_old(rnd):
	"""ER visits left open from an earlier day: admit a few, send the rest home (billed in the receptionist's shift)."""
	from hospital_vvs.api import er

	old = frappe.get_all("ER Visit", filters={"status": ["!=", "Disposed"], "branch": BRANCH, "creation": ["<", today()]},
		fields=["name", "patient", "assigned_doctor"])
	doc = frappe.db.get_value("Doctor", {"user": DOC_USER})
	out = []
	for v in old:
		if not v.assigned_doctor:
			_as(REC)
			_step(f"assign {v.name}", er.assign, v.name, doctor=doc)
		roll = rnd.random()
		bed = _free_bed()
		if roll < 0.35 and bed:
			_as(REC)
			r = _step(f"admit from ER {v.name}", er.dispose, v.name, "Admitted", "Demo: needs ward care", admit=J({"bed": bed, "doctor": doc}))
		elif roll < 0.9:
			_as(DOC_USER)
			r = _step(f"discharge ER {v.name}", er.dispose, v.name, "Discharged Home", "Demo: treated and sent home", payment_mode=rnd.choice(["Cash", "Cash", "Card"]))
		else:
			_as(DOC_USER)
			r = _step(f"refer ER {v.name}", er.dispose, v.name, "Referred Out", "Demo: specialist care", referred_to="Mayo Hospital Lahore")
		if r:
			out.append(v.name)
	print(f"ER closed: {len(out)} of {len(old)}")


def er_arrivals(rnd, n):
	from hospital_vvs.api import er

	pats = frappe.get_all("Patient", filters={"branch": BRANCH, "disabled": 0, "temporary_record": 0}, pluck="name", order_by="creation desc", limit=200)
	busy = set(frappe.get_all("ER Visit", filters={"status": ["!=", "Disposed"]}, pluck="patient")) | \
		set(frappe.get_all("Bed Allotment", filters={"status": ["in", ["Admitted", "Discharge Pending"]]}, pluck="patient"))
	pats = [p for p in pats if p not in busy]
	made = 0
	for complaint, level in rnd.sample(ER_CASES, min(n, len(ER_CASES))):
		vit = {"bp_systolic": rnd.randint(95, 160), "bp_diastolic": rnd.randint(60, 100), "pulse": rnd.randint(70, 125), "spo2": rnd.randint(90, 99)}
		data = {"patient": pats.pop(rnd.randrange(len(pats))) if pats else None, "branch": BRANCH, "chief_complaint": complaint,
			"arrival_mode": "Ambulance (1122)" if level == "Red" else "Walk-in", "triage_level": level, "vitals": vit}
		if not data["patient"]:
			data["unknown"] = {"gender": rnd.choice(["Male", "Female"]), "approx_age": rnd.randint(20, 60)}
		_as(NURSE)
		if _step(f"ER arrival {complaint}", er.register, J(data)):
			made += 1
	print(f"ER arrivals: {made}")


def discharge(rnd, n):
	from hospital_vvs.api import ipd as api
	from hospital_vvs.services import ipd as svc

	rows = frappe.get_all("Bed Allotment", filters={"status": "Admitted", "branch": BRANCH, "payer_type": ["in", ["Patient", "", None]],
		"admit_datetime": ["<", add_days(now_datetime(), -2)]}, fields=["name", "patient", "admitting_doctor"], order_by="admit_datetime", limit=n) if n > 0 else []
	done = 0
	for adm in rows:
		doc_user = _doctor_of(adm)
		diag = rnd.choice(REASONS)[1].rstrip("?")
		# labs still pending are released by the lab in real life; demo: close them out
		frappe.db.sql("""update `tabTest Invoice Item` tii join `tabTest Invoice` ti on ti.name=tii.parent set tii.status='Released'
			where ti.bed_allotment=%s and tii.status not in ('Released','Verified','Cancelled','Rejected','Report Received')""", adm.name)
		_as(NURSE)
		for e in frappe.get_all("MAR Entry", filters={"bed_allotment": adm.name, "status": ["in", ["Scheduled", "Approved"]], "scheduled_at": ["<", now_datetime()]}, pluck="name"):
			_step(f"chart {e}", api.chart_dose, e, "Administered")
		_step(f"start discharge {adm.name}", api.start_discharge, adm.name, "Normal")
		_as(doc_user)
		if not _step(f"summary {adm.name}", api.sign_summary, adm.name, J({"final_diagnosis": diag, "treatment_summary": "Treated as per protocol, improved",
				"discharge_type": "Normal", "condition_at_discharge": "Improved", "follow_up_days": 7,
				"medicines": [{"medicine": "Paracetamol 500 mg", "dose": "1", "frequency": "TDS", "days": 5}]})):
			continue
		_as(rnd.choice([REC, REC2]))
		_step(f"final bill {adm.name}", api.final_bill, adm.name)
	for name in frappe.get_all("Bed Allotment", filters={"status": "Discharge Pending", "branch": BRANCH, "final_invoice": ["is", "not set"]}, pluck="name"):
		if svc.clearance(name)["ready_for_bill"]:  # summary signed etc. but not billed yet (left half-way earlier)
			_as(rnd.choice([REC, REC2]))
			_step(f"final bill {name}", api.final_bill, name)
	# settle and release every admission that has its final bill (today's and any left half-way)
	for name in frappe.get_all("Bed Allotment", filters={"status": "Discharge Pending", "branch": BRANCH, "final_invoice": ["is", "set"]}, pluck="name"):
		_as(rnd.choice([REC, REC2]))
		rb = svc.running_bill(name)
		if rb["balance"] > 0.5:
			_step(f"settle {name}", api.take_payment, round(rb["balance"]), rnd.choice(["Cash", "Cash", "Card", "JazzCash"]), "Settlement", name)
		elif rb["credit"] > 0.5:
			_step(f"refund {name}", api.take_payment, round(rb["credit"], 2), "Cash", "Refund", name)
		if _step(f"discharge {name}", api.complete_discharge, name):
			done += 1
	print(f"discharged: {done} (started today: {len(rows)})")


def admit(rnd, n):
	from hospital_vvs.api import ipd as api

	busy = set(frappe.get_all("Bed Allotment", filters={"status": ["in", ["Admitted", "Discharge Pending"]]}, pluck="patient"))
	slips = frappe.get_all("OPD Slip", filters={"branch": BRANCH, "creation": [">=", today()], "docstatus": ["<", 2]}, fields=["name", "patient", "doctor"],
		order_by="creation desc", limit=100)
	cands = [s for s in slips if s.patient not in busy]
	rnd.shuffle(cands)
	made = 0
	for i in range(n):
		ward_type = "Private" if rnd.random() < 0.25 else "General"
		bed = _free_bed(ward_type) or _free_bed()
		if not bed:
			print("  ! no free bed")
			break
		if cands:
			s = cands.pop()
			pat, doctor, slip = s.patient, s.doctor, s.name
		else:
			pat, doctor, slip = _new_patient(rnd), frappe.db.get_value("Doctor", {"user": DOC_USER}), None
		reason, diag = rnd.choice(REASONS)
		_as(rnd.choice([REC, REC2]))
		r = _step(f"admit {pat}", api.admit, J({"patient": pat, "bed": bed, "doctor": doctor or frappe.db.get_value("Doctor", {"user": DOC_USER}),
			"reason": reason, "diagnosis": diag, "planned_days": rnd.randint(2, 5), "source": "OPD" if slip else "Direct", "opd_slip": slip,
			"advance": rnd.choice([10000, 15000, 20000, 25000]), "payment_mode": rnd.choice(["Cash", "Cash", "Card", "JazzCash"])}))
		if r:
			made += 1
	print(f"admitted: {made}")


def ward_care(rnd):
	from hospital_vvs.api import ipd as api
	from hospital_vvs.services import ipd as svc

	rows = frappe.get_all("Bed Allotment", filters={"status": "Admitted", "branch": BRANCH}, fields=["name", "patient", "admitting_doctor"])
	_as(DOC_USER)
	gate = [d["name"] for d in svc.due_doses(BRANCH, None, 0) if d.get("status") == "Pending Approval"] if hasattr(svc, "due_doses") else []
	if gate:
		_step("approve doses", api.approve_dose, J(gate))
	charted = 0
	for adm in rows:
		_as(NURSE)
		_step(f"vitals {adm.name}", api.add_vitals, J({"bed_allotment": adm.name, "bp_systolic": rnd.randint(105, 150), "bp_diastolic": rnd.randint(65, 95),
			"pulse": rnd.randint(64, 110), "temperature": round(rnd.uniform(97.6, 100.8), 1), "spo2": rnd.randint(93, 99)}))
		_step(f"note {adm.name}", api.add_note, J({"bed_allotment": adm.name, "note_type": "Nursing", "note": rnd.choice(NOTES)}))
		for e in frappe.get_all("MAR Entry", filters={"bed_allotment": adm.name, "status": ["in", ["Scheduled", "Approved"]], "scheduled_at": ["<", now_datetime()]},
				pluck="name"):
			if _step(f"chart {e}", api.chart_dose, e, "Administered"):
				charted += 1
		if not frappe.db.exists("Diet Order", {"bed_allotment": adm.name, "diet_date": today(), "docstatus": ["<", 2]}):
			_as(_doctor_of(adm))
			_step(f"diet {adm.name}", api.order_diet, J({"bed_allotment": adm.name, "diet_type": rnd.choice(["Normal", "Normal", "Diabetic", "Soft"])}))
		if rnd.random() < 0.25:
			_as(rnd.choice([REC, REC2]))
			_step(f"advance {adm.name}", api.take_payment, rnd.choice([5000, 10000, 20000]), rnd.choice(["Cash", "Card", "JazzCash"]), "Advance", adm.name)
	print(f"ward care: {len(rows)} inpatients, {charted} doses charted")


# doctor's starter plan for an inpatient with no active medicine order: diagnosis keyword → (item, dose, frequency, route, days)
PLANS = [("enteric", [("CIPROXIN-500MG", "1", "BD", "Oral", 7), ("PANADOL-500MG", "1", "TDS", "Oral", 5)]),
	("typhoid", [("CIPROXIN-500MG", "1", "BD", "Oral", 7), ("PANADOL-500MG", "1", "TDS", "Oral", 5)]),
	("pneumonia", [("AUGMENTIN-625MG", "1", "TDS", "Oral", 7), ("AZOMAX-500MG", "1", "OD", "Oral", 3), ("PANADOL-500MG", "1", "TDS", "Oral", 5)]),
	("gastro", [("ONSET-4MG", "1", "BD", "IV", 3), ("RISEK-20MG", "1", "OD", "Oral", 5)]),
	("diabet", [("GLUCOPHAGE-500MG", "1", "BD", "Oral", 7), ("AMARYL-2MG", "1", "OD", "Oral", 7)]),
	("sugar", [("GLUCOPHAGE-500MG", "1", "BD", "Oral", 7), ("AMARYL-2MG", "1", "OD", "Oral", 7)]),
	("angina", [("LOPRIN-75MG", "1", "OD", "Oral", 7), ("CONCOR-5MG", "1", "OD", "Oral", 7), ("ROSUVAS-10MG", "1", "OD", "Oral", 7)]),
	("chest", [("LOPRIN-75MG", "1", "OD", "Oral", 7), ("CONCOR-5MG", "1", "OD", "Oral", 7), ("ROSUVAS-10MG", "1", "OD", "Oral", 7)]),
	("append", [("LEFLOX-500MG", "1", "BD", "IV", 5), ("TRAMAL-50MG", "1", "BD", "Oral", 3)]),
	("dengue", [("PANADOL-500MG", "1", "TDS", "Oral", 5), ("FOLIC-ACID-5MG", "1", "OD", "Oral", 5)])]
DEFAULT_PLAN = [("PANADOL-500MG", "1", "TDS", "Oral", 5), ("RISEK-20MG", "1", "OD", "Oral", 5)]


def start_missing_orders(rnd):
	"""Doctor's round before the drug round: every open admission without an active medicine order gets a plan for its diagnosis."""
	from hospital_vvs.api import ipd as api

	have = set(frappe.get_all("IPD Medication Order", filters={"status": "Active", "bed_allotment": ["is", "set"]}, pluck="bed_allotment"))
	fields = ["name", "admitting_doctor"] + [f for f in ("diagnosis", "provisional_diagnosis", "admission_reason", "reason") if frappe.get_meta("Bed Allotment").has_field(f)]
	started = 0
	for adm in frappe.get_all("Bed Allotment", filters={"status": "Admitted", "branch": BRANCH}, fields=fields):
		if adm.name in have:
			continue
		text = " ".join(str(adm.get(f) or "") for f in fields[2:]).lower()
		plan = next((p for k, p in PLANS if k in text), DEFAULT_PLAN)
		_as(_doctor_of(adm))
		for item, dose, freq, route, days in plan:
			if _step(f"order {item} · {adm.name}", api.order_medicine, J({"bed_allotment": adm.name, "item": item, "dose": dose, "frequency": freq,
					"route": route, "days": days, "override_reason": "Demo: reviewed by consultant"})):
				started += 1
	return started


HOLD = [("Held", "Patient NPO for procedure"), ("Held", "BP low, doctor informed"), ("Refused", "Patient refused, counselled"),
	("Held", "Patient asleep, will give on waking")]


def drug_round(slot=None, seed=None, ahead_hours=0):
	"""Nurses' drug round (scripts/drug_round.sh, 3× a day): the doctor clears doses waiting at the approval gate, then the nurse on
	duty charts every dose due up to now for every open admission — mostly given, now and then held or refused with a reason."""
	from hospital_vvs.api import ipd as api
	from hospital_vvs.services import ipd as svc
	from hospital_vvs.services.roster import on_duty

	rnd = random.Random(seed if seed is not None else int(now_datetime().strftime("%Y%m%d%H")))
	slot = slot or ("Morning" if now_datetime().hour < 12 else "Afternoon" if now_datetime().hour < 18 else "Night")
	started = start_missing_orders(rnd)
	due = [d for d in svc.due_doses(BRANCH, None, ahead_hours) if d.get("bed_allotment")]
	gate = [d["name"] for d in due if d.get("status") == "Pending Approval"]
	if gate:
		_as(DOC_USER)
		_step("approve doses", api.approve_dose, J(gate))
	nurses = [r.user for r in on_duty(branch=BRANCH) if r.get("user")] or [NURSE]
	given = held = failed = 0
	for d in due:
		_as(rnd.choice(nurses))
		status, reason = ("Administered", None) if rnd.random() > 0.06 else rnd.choice(HOLD)
		if _step(f"{d['name']} {d.get('item_name') or d['item']} · {d.get('patient_name')}", api.chart_dose, d["name"], status, reason):
			if status == "Administered":
				given += 1
			else:
				held += 1
		else:
			failed += 1
	_as("Administrator")
	pts = len({d["bed_allotment"] for d in due})
	print(f"[{now_datetime():%F %T}] drug round ({slot}): {started} new orders, {pts} patients, {given} given, {held} held/refused, {failed} not charted")
	return {"patients": pts, "given": given, "held": held, "failed": failed}


def run(admit_n=3, discharge_n=3, er_n=3, seed=None):
	rnd = random.Random(seed if seed is not None else int(getdate(today()).strftime("%Y%m%d")) + 61)
	print(f"[{now_datetime():%F %T}] IPD demo: admit {admit_n}, discharge {discharge_n}, ER {er_n}")
	_shifts()  # closes earlier days' shifts, opens today's reception shifts
	frappe.db.commit()
	housekeeping()
	er_close_old(rnd)
	er_arrivals(rnd, er_n)
	discharge(rnd, discharge_n)
	admit(rnd, admit_n)
	ward_care(rnd)
	_as("Administrator")
	n = frappe.db.count("Bed Allotment", {"status": "Admitted"})
	print(f"done: {n} inpatients, {frappe.db.count('Hospital Bed', {'status': 'Available'})} beds free")
