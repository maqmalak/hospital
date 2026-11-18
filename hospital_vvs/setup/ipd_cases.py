"""Full IPD demo cases (owner request 2026-11-18): five new inpatients, each with a different illness and a complete chart.

    bench --site hospital execute hospital_vvs.setup.ipd_cases.run
    CASES=5 scripts/ipd_demo.sh            (after the daily IPD steps)
    ADMIT=0 DISCHARGE=0 ER=0 CASES=5 scripts/ipd_demo.sh   (cases only)

Each case runs as the staff member who does it, through the same APIs as the screens:
reception admits with an advance → the stay is dated back 1–4 days → the doctor orders medicines (MAR schedule), labs and a
procedure → the lab collects, receives, enters, verifies and releases results → consent is signed and the procedure completed
(charged to the bill) → nurses chart every due dose, vitals every 6 hours and a nursing note every shift → the doctor does a
daily ward round (visit charge) → diet, oxygen where needed, a further advance. Patients stay admitted, so the full medicine
chart, vitals, procedures, tests, notes, advances and the running bill can be opened on /ipd. Errors are printed and skipped.
"""

import json
import random

import frappe
from frappe.utils import add_to_date, now_datetime

from hospital_vvs.setup.ipd_demo import BRANCH, NURSE, _step
from hospital_vvs.setup.opd_demo import REC, REC2, _as, _new_patient, _shifts

J = json.dumps
DR = {"ayesha": "dr.ayesha@vvs.demo", "imran": "dr.imran@vvs.demo", "usman": "dr.usman@vvs.demo", "sana": "dr.sana@vvs.demo"}
VISIT_FEE = 2000  # consultant visit per round, posted by reception

# medicine: (item, dose, frequency, route, days)
CASES = [
	{"key": "Dengue", "age": (19, 45), "reason": "High fever 5 days, bleeding gums, platelets 38,000", "diagnosis": "Dengue haemorrhagic fever", "ward": "General",
		"doctor": "ayesha", "days": 3, "diet": "Soft", "advance": 20000, "extra": 10000, "oxygen": 0,
		"meds": [("PANADOL-500MG", "1", "TDS", "Oral", 5), ("ONSET-4MG", "1", "BD", "IV", 3), ("FOLIC-ACID-5MG", "1", "OD", "Oral", 5)],
		"labs": ["Complete Blood Count", "Dengue NS1", "Liver Function Tests"], "procedure": ("Blood Transfusion", 10, "Platelet concentrate 4 units, no reaction"),
		"vitals": {"temperature": (99.4, 102.6), "pulse": (92, 120), "bp_systolic": (92, 112), "bp_diastolic": (58, 72), "spo2": (95, 99)},
		"rounds": ["Febrile, petechiae on legs. Platelets low.", "Fever settling, no fresh bleeding.", "Afebrile, platelets rising."],
		"plan": ["Platelet transfusion, strict input/output, CBC 12-hourly", "Continue fluids, repeat CBC", "Plan discharge when platelets > 100,000"]},
	{"key": "Appendicitis", "age": (18, 35), "reason": "Right lower abdominal pain, vomiting, tenderness at McBurney's point", "diagnosis": "Acute appendicitis",
		"ward": "Private", "doctor": "imran", "days": 2, "diet": "Soft", "advance": 50000, "extra": 30000, "oxygen": 0,
		"meds": [("LEFLOX-500MG", "1", "BD", "IV", 5), ("TRAMAL-50MG", "1", "TDS", "IV", 3), ("ONSET-4MG", "1", "TDS", "IV", 2), ("PANADOL-500MG", "1", "TDS", "Oral", 5)],
		"labs": ["Complete Blood Count", "Urine R/E"], "procedure": ("Appendectomy", 4, "Laparoscopic appendectomy, inflamed appendix removed, no perforation"),
		"vitals": {"temperature": (98.8, 100.9), "pulse": (80, 108), "bp_systolic": (110, 132), "bp_diastolic": (70, 86), "spo2": (96, 99)},
		"rounds": ["Guarding in right iliac fossa, TLC raised. For surgery.", "Post-op day 1, wound clean, passing flatus."],
		"plan": ["NPO, IV antibiotics, appendectomy today", "Start soft diet, mobilise, continue antibiotics"]},
	{"key": "Diabetic foot", "age": (48, 70), "reason": "Infected ulcer on right foot, sugar uncontrolled", "diagnosis": "Diabetic foot ulcer with cellulitis",
		"ward": "General", "doctor": "ayesha", "days": 4, "diet": "Diabetic", "advance": 25000, "extra": 15000, "oxygen": 0,
		"meds": [("AUGMENTIN-625MG", "1", "TDS", "Oral", 7), ("GLUCOPHAGE-500MG", "1", "BD", "Oral", 7), ("AMARYL-2MG", "1", "OD", "Oral", 7),
			("PANADOL-500MG", "1", "TDS", "Oral", 3)],
		"labs": ["Blood Sugar Random", "HbA1c", "Renal Function Tests", "Complete Blood Count"],
		"procedure": ("Wound Debridement", 20, "Slough removed, healthy granulation base, dressing applied"),
		"vitals": {"temperature": (98.6, 100.6), "pulse": (76, 98), "bp_systolic": (128, 152), "bp_diastolic": (78, 94), "spo2": (95, 99), "rbs": (160, 290)},
		"rounds": ["Ulcer 3 x 2 cm with slough, cellulitis to ankle.", "Debridement done, sugar improving.", "Cellulitis receding.", "Wound granulating, RBS < 200."],
		"plan": ["IV/oral antibiotics, sugar control, debridement", "Daily dressing, sugar chart", "Continue, offloading footwear", "Plan discharge with dressing advice"]},
	{"key": "Upper GI bleed", "age": (40, 65), "reason": "Vomiting blood twice, black stools, dizziness", "diagnosis": "Upper GI bleed — bleeding duodenal ulcer",
		"ward": "ICU", "doctor": "usman", "days": 2, "diet": "Soft", "advance": 60000, "extra": 40000, "oxygen": 8,
		"meds": [("NEXUM-40MG", "1", "BD", "IV", 5), ("MAXOLON-10MG", "1", "TDS", "IV", 3), ("PANADOL-500MG", "1", "SOS", "Oral", 3)],
		"labs": ["Complete Blood Count", "Liver Function Tests", "Renal Function Tests"],
		"procedure": ("Upper GI Endoscopy", 6, "Bleeding duodenal ulcer, adrenaline injection and clips, haemostasis achieved"),
		"vitals": {"temperature": (97.8, 99.4), "pulse": (88, 124), "bp_systolic": (88, 118), "bp_diastolic": (54, 76), "spo2": (92, 98)},
		"rounds": ["Pale, tachycardic, Hb 7.8. Oxygen, IV PPI, urgent endoscopy.", "No re-bleed after endoscopy, haemodynamically stable."],
		"plan": ["Oxygen, IV pantoprazole, endoscopy, crossmatch 2 units", "Shift to ward if stable 24 h, start soft diet"]},
	{"key": "Fracture", "age": (25, 70), "reason": "Fall from stairs, painful swollen left forearm", "diagnosis": "Closed fracture distal radius, left",
		"ward": "General", "doctor": "imran", "days": 1, "diet": "Normal", "advance": 30000, "extra": 0, "oxygen": 0,
		"meds": [("BRUFEN-400MG", "1", "TDS", "Oral", 5), ("TRAMAL-50MG", "1", "BD", "Oral", 3), ("CAL-D-500MG", "1", "BD", "Oral", 10)],
		"labs": ["Complete Blood Count"], "procedure": ("Fracture Reduction & Cast", 3, "Closed reduction under sedation, below-elbow cast, good alignment"),
		"vitals": {"temperature": (98.2, 99.2), "pulse": (72, 96), "bp_systolic": (118, 138), "bp_diastolic": (74, 88), "spo2": (97, 99)},
		"rounds": ["Swelling and deformity left wrist, distal pulses good."], "plan": ["Reduction and cast today, limb elevation, check X-ray"]},
]
NOTES = ["Patient settled, IV line patent.", "Pain controlled with charted analgesia.", "Oral intake fair, encouraged fluids.",
	"Slept well, no complaints overnight.", "Attendant counselled about care.", "Vitals stable, drip running as charted."]


def _rnd_vitals(rnd, ranges, k):
	"""Values drift from the worst toward normal over the stay (k = 0 at admission → 1 now)."""
	out = {}
	for f, (lo, hi) in ranges.items():
		worst, best = (lo, hi) if f in ("bp_systolic", "bp_diastolic", "spo2") else (hi, lo)
		v = worst + (best - worst) * k * rnd.uniform(0.7, 1.0) + rnd.uniform(-1, 1) * (hi - lo) * 0.08
		out[f] = round(min(max(v, lo), hi), 1) if f == "temperature" else int(round(min(max(v, lo), hi)))
	return out


def _bed_for(ward_type, gender):
	"""A free bed in a ward of this type for an adult of this gender (Male / Female / Mixed wards; never the children's ward)."""
	wards = frappe.get_all("Ward", filters={"branch": BRANCH, "ward_type": ward_type, "is_active": 1, "gender": ["in", [gender, "Mixed", "", None]]},
		pluck="name")
	beds = frappe.get_all("Hospital Bed", filters={"ward": ["in", wards or [""]], "status": "Available", "is_active": 1}, pluck="name", order_by="bed_no")
	return beds[0] if beds else None


def _backdate(adm, start):
	"""Move the admission to `start` (bed, segment, expected discharge) so the bill and chart cover the whole stay."""
	doc = frappe.get_doc("Bed Allotment", adm)
	frappe.db.set_value("Bed Allotment", adm, {"admit_datetime": start, "expected_discharge": add_to_date(start, days=doc.planned_days or 3)},
		update_modified=False)
	for s in doc.get("segments") or []:
		frappe.db.set_value(s.doctype, s.name, "from_time", start, update_modified=False)
	if doc.bed:
		frappe.db.set_value("Hospital Bed", doc.bed, "occupied_since", start, update_modified=False)


def _at(doctype, name, when, field=None):
	vals = {"creation": when, "modified": when}
	if field:
		vals[field] = when
	frappe.db.set_value(doctype, name, vals, update_modified=False)


def _pathologist():
	u = frappe.db.sql("""select hr.parent from `tabHas Role` hr join tabUser u on u.name=hr.parent where hr.role='PW Pathologist'
		and hr.parenttype='User' and u.enabled=1 limit 1""")
	return u[0][0] if u else "Administrator"


def _labs(ti_name, rnd):
	"""Collect → receive → results → verify → release, as the lab staff do."""
	from hospital_vvs.services import lab
	from hospital_vvs.setup.demo_phase2 import demo_values

	_as("lab@vvs.demo" if frappe.db.exists("User", "lab@vvs.demo") else "Administrator")
	for s in frappe.get_all("Lab Sample", filters={"test_invoice": ti_name}, pluck="name"):
		_step(f"collect {s}", lab.collect, s)
		_step(f"receive {s}", lab.receive, s)
	for r in frappe.get_doc("Test Invoice", ti_name).items:
		if r.status == "Received":
			_step(f"result {r.template}", lab.enter_results, r.name, values=demo_values(r.template))
	_as(_pathologist())
	for res in frappe.get_all("Lab Result", filters={"test_invoice": ti_name, "status": "Result Entered"}, pluck="name"):
		_step(f"verify {res}", lab.verify, res, "Reviewed — correlate clinically", auto=True)
	_step(f"release {ti_name}", lab.release, ti_name, partial=True)


def one_case(c, rnd):
	from hospital_vvs.api import ipd as api

	doc_user = DR[c["doctor"]]
	doctor = frappe.db.get_value("Doctor", {"user": doc_user})
	pat = _new_patient(rnd)
	lo, hi = c["age"]
	frappe.db.set_value("Patient", pat, "dob", add_to_date(now_datetime(), years=-rnd.randint(lo, hi), days=-rnd.randint(0, 300)).date())
	gender = frappe.db.get_value("Patient", pat, "gender")
	bed = _bed_for(c["ward"], gender) or _bed_for("General", gender)
	frappe.db.commit()
	if not bed:
		print(f"  ! {c['key']}: no free bed for {gender}")
		return None
	_as(rnd.choice([REC, REC2]))
	r = _step(f"admit {c['key']}", api.admit, J({"patient": pat, "bed": bed, "doctor": doctor, "reason": c["reason"], "diagnosis": c["diagnosis"],
		"planned_days": c["days"] + 2, "source": "Direct", "advance": c["advance"], "payment_mode": rnd.choice(["Cash", "Card", "JazzCash"])}))
	adm = (r or {}).get("name") if isinstance(r, dict) else r
	if not adm:
		adm = frappe.db.get_value("Bed Allotment", {"patient": pat, "status": "Admitted"})
	if not adm:
		return None
	now = now_datetime()
	start = add_to_date(now, days=-c["days"], hours=-rnd.randint(1, 5))
	_backdate(adm, start)
	frappe.db.commit()
	hours = int((now - start).total_seconds() // 3600)

	# doctor: medicines (MAR schedule from admission), labs, procedure
	_as(doc_user)
	for item, dose, freq, route, days in c["meds"]:
		_step(f"order {item}", api.order_medicine, J({"bed_allotment": adm, "item": item, "dose": dose, "frequency": freq, "route": route,
			"days": days, "start_at": str(add_to_date(start, hours=1)), "prn": 1 if freq == "SOS" else 0,
			"override_reason": "Demo: reviewed by consultant"}))
	ti = _step(f"labs {c['key']}", api.order_labs, J({"bed_allotment": adm, "tests": c["labs"], "priority": "Urgent" if c["ward"] == "ICU" else "Routine"}))
	if ti:
		_at("Test Invoice", ti, add_to_date(start, hours=1))
		_labs(ti, rnd)
	name, after_h, notes = c["procedure"]
	when = add_to_date(start, hours=min(after_h, max(hours - 1, 1)))
	_as(doc_user)
	pr = _step(f"schedule {name}", api.schedule_procedure, J({"bed_allotment": adm, "procedure_type": name, "scheduled_at": str(when),
		"notes": notes}))
	if pr:
		_as(NURSE)
		_step(f"consent {name}", api.record_consent, J({"bed_allotment": adm, "procedure": pr, "consent_type": "Procedure", "signed_by": "Attendant",
			"relation": "Son", "signer_name": "Attendant", "witness_name": "Staff Nurse", "details": f"{name}: risks, benefits and alternatives explained"}))
		_as(doc_user)
		if _step(f"complete {name}", api.procedure_status, pr, "Completed", None, notes):
			frappe.db.set_value("IPD Procedure", pr, "completed_at", add_to_date(when, hours=1), update_modified=False)

	# nurses: every due dose, vitals 6-hourly, a note every shift; doctor: daily round (+ visit charge)
	_as(NURSE)
	charted = 0
	for e in frappe.get_all("MAR Entry", filters={"bed_allotment": adm, "status": ["in", ["Scheduled", "Approved", "Pending Approval"]],
			"scheduled_at": ["<", now]}, fields=["name", "scheduled_at"], order_by="scheduled_at"):
		if _step(f"chart {e.name}", api.chart_dose, e.name, "Administered"):
			frappe.db.set_value("MAR Entry", e.name, "administered_at", add_to_date(e.scheduled_at, minutes=rnd.randint(5, 25)), update_modified=False)
			charted += 1
	steps = max(hours // 6, 1)
	for i in range(steps + 1):
		t = add_to_date(start, hours=i * 6 + 1)
		if t > now:
			break
		v = _step("vitals", api.add_vitals, J({"bed_allotment": adm, **_rnd_vitals(rnd, c["vitals"], i / max(steps, 1))}))
		if v:
			_at("Vitals Chart", v, t)
		if i % 2 == 0:
			n = _step("note", api.add_note, J({"bed_allotment": adm, "note_type": "Nursing", "note": rnd.choice(NOTES)}))
			if n:
				_at("IPD Note", n, add_to_date(t, minutes=20))
	for d, (findings, plan) in enumerate(zip(c["rounds"], c["plan"])):
		t = add_to_date(start, days=d, hours=3)
		if t > now:
			break
		_as(doc_user)
		w = _step("round", api.add_round, J({"bed_allotment": adm, "findings": findings, "plan": plan}))
		if w:
			_at("Ward Round", w, t, "round_at")
		_as(rnd.choice([REC, REC2]))
		_step("visit charge", api.add_charge, J({"bed_allotment": adm, "charge_type": "Ad-hoc", "rate": VISIT_FEE, "qty": 1,
			"description": f"Consultant visit · {frappe.db.get_value('Doctor', doctor, 'doctor_name')} · day {d + 1}"}))

	# diet, oxygen, further advance
	_as(doc_user)
	_step("diet", api.order_diet, J({"bed_allotment": adm, "diet_type": c["diet"]}))
	if c["oxygen"]:
		_as(NURSE)
		_step("oxygen", api.add_charge, J({"bed_allotment": adm, "charge_type": "Oxygen", "qty": c["oxygen"], "description": f"Oxygen · {c['oxygen']} h via face mask"}))
	if c["extra"]:
		_as(rnd.choice([REC, REC2]))
		_step("advance", api.take_payment, c["extra"], rnd.choice(["Cash", "Card", "JazzCash"]), "Advance", adm)
	frappe.db.commit()
	from hospital_vvs.services import ipd as svc

	rb = svc.running_bill(adm)
	print(f"  {c['key']:<15} {adm} {frappe.db.get_value('Bed Allotment', adm, 'patient_name'):<26} bed {bed:<10} {c['days']}d · "
		f"{len(c['meds'])} meds, {charted} doses · {len(c['labs'])} tests · {name} · bill Rs {round(rb.get('net', 0)):,} · "
		f"advances Rs {round(rb.get('advances', 0)):,} · balance Rs {round(rb.get('balance', 0)):,}")
	return adm


def run(n=5, seed=None):
	rnd = random.Random(seed if seed is not None else int(now_datetime().strftime("%Y%m%d%H%M")))
	print(f"[{now_datetime():%F %T}] IPD full cases: {n}")
	_shifts()  # reception shifts open, so advances post to a drawer
	frappe.db.commit()
	made = [a for a in (one_case(c, rnd) for c in CASES[:n]) if a]
	_as("Administrator")
	print(f"done: {len(made)} full cases admitted — {', '.join(made)}")
	return made
