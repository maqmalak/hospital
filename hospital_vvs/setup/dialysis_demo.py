"""Nephrology & Dialysis demo data (D-99). DEMO DATA — not clinical records.

	bench --site hospital execute hospital_vvs.setup.dialysis_demo.run

2 nephrologists + in-charge / nurse / technician users, ~30 dialysis patients on recurring schedules across 12 stations (HBV / HCV patients on their
own zone), one month of charted sessions (weights, BP, hourly observations, occasional complications, EPO / iron), monthly lab panels in the Lab
module, packages, unit logs (water + disinfection), opening stock in the Dialysis Store, today's board, one website request, and the three samples:
  1. regular CKD 5 (diabetic) on an AV fistula, Mon/Thu morning, HCV-negative;
  2. HCV-positive patient on a dedicated HCV-zone station with a permanent catheter;
  3. emergency AKI patient from the ICU (bedside dialysis today).
Demo sessions are marked paid without a counter receipt (no cashier shift); the real flow pays at the Reception counter.
Demo patients have SMS / WhatsApp consent off, so a live messaging gateway never texts their (made-up) numbers.
"""

import json
import random
from datetime import timedelta

import frappe
from frappe.utils import add_days, add_to_date, flt, get_datetime, getdate, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.services import dialysis as dz
from hospital_vvs.setup.demo import _user

NEPHS = [("Dr. Ahsan Mehmood", "ڈاکٹر احسن محمود", "MBBS, FCPS (Nephrology)", "PMDC-51877-P", "dr.ahsan", "Mon Tue Wed Thu Fri Sat", "09:00", "15:00"),
	("Dr. Nadia Kanwal", "ڈاکٹر نادیہ کنول", "MBBS, MRCP (UK), FCPS (Nephrology)", "PMDC-60214-P", "dr.nadia", "Mon Wed Fri Sat", "15:00", "21:00")]
DAY = {"Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday", "Fri": "Friday", "Sat": "Saturday", "Sun": "Sunday"}
PATTERNS = ["Mon, Thu", "Tue, Fri", "Wed, Sat", "Mon, Wed, Fri", "Tue, Thu, Sat"]
CAUSES = ["Diabetic"] * 5 + ["Hypertensive"] * 3 + ["Glomerulonephritis", "Obstructive", "Polycystic", "Unknown"]


def staff():
	branch = frappe.db.get_value("Branch", {}, "name")
	out = []
	for name, ur, qual, reg, login, days, a, b in NEPHS:
		doc = frappe.db.get_value("Doctor", {"doctor_name": name}, "name")
		if not doc:
			if not frappe.db.exists("Specialization", "Nephrologist"):
				frappe.get_doc({"doctype": "Specialization", "specialization": "Nephrologist", "department": "Nephrology & Dialysis"}).insert(ignore_permissions=True)
			d = frappe.get_doc({"doctype": "Doctor", "doctor_name": name, "doctor_name_ur": ur, "specialization": "Nephrologist", "department": "Nephrology & Dialysis",
				"qualification": qual, "registration_no": reg, "show_license": 1, "branch": branch, "default_fee": 2500, "is_active": 1, "doctor_type": "Internal",
				"consultation_room": "Nephrology clinic, 1st floor", "color": "#0284c7",
				"schedule": [{"day": DAY[x], "start_time": a + ":00", "end_time": b + ":00", "branch": branch} for x in days.split()]})
			d.flags.ignore_mandatory = True
			d.insert(ignore_permissions=True)
			doc = d.name
		email = _user(login, name, [R.NEPHROLOGIST, R.DOCTOR])
		frappe.db.set_value("Doctor", doc, "user", email)
		out.append(doc)
	_user("dialysis.incharge", "Shazia Dialysis In-charge", [R.DIALYSIS_INCHARGE])
	_user("dialysis.nurse", "Farhan Dialysis Nurse", [R.DIALYSIS_NURSE])
	_user("dialysis.tech", "Imran Dialysis Technician", [R.DIALYSIS_TECH])
	return out


def stock():
	"""Opening stock in the Dialysis Store (Material Receipt) so sessions can deduct consumables."""
	wh = dz.warehouse()
	if not wh or frappe.db.exists("Stock Entry", {"remarks": "Dialysis demo opening stock", "docstatus": 1}):
		return
	from hospital_vvs.setup.dialysis import CONS_PRICE

	company = frappe.db.get_value("Warehouse", wh, "company")
	se = frappe.new_doc("Stock Entry")
	se.update({"stock_entry_type": "Material Receipt", "purpose": "Material Receipt", "company": company, "to_warehouse": wh, "remarks": "Dialysis demo opening stock"})
	qty = {"DIA-C-DIALYSER": 400, "DIA-C-BLOODLINE": 400, "DIA-C-NEEDLE": 350, "DIA-C-ACID": 400, "DIA-C-BICARB": 400, "DIA-C-HEPARIN": 400, "DIA-C-SALINE": 900,
		"DIA-C-CATH": 15, "DIA-C-EPO": 18}
	for code, q in qty.items():
		if frappe.db.exists("Item", code):
			se.append("items", {"item_code": code, "qty": q, "t_warehouse": wh, "basic_rate": CONS_PRICE.get(code, 100), "uom": "Nos", "stock_uom": "Nos", "conversion_factor": 1})
	se.insert(ignore_permissions=True)
	se.submit()


def _patients(n, rnd, adult=True):
	rows = frappe.get_all("Patient", filters={"disabled": 0, "temporary_record": 0}, fields=["name", "patient_name", "gender", "dob", "phone"], limit=600)
	used = set(frappe.get_all("Dialysis Patient", pluck="patient"))
	rows = [r for r in rows if r.name not in used and (not adult or not r.dob or dz._age(r.dob) is None or dz._age(r.dob) >= 18)]
	rnd.shuffle(rows)
	return rows[:n]


def _screen(dp, d, hbsag="Negative", hcv="Negative", hiv="Negative"):
	dp.append("screenings", {"tested_on": d, "hbsag": hbsag, "anti_hcv": hcv, "hiv": hiv, "source": "LMC laboratory"})


def _labs(patient, branch, when, rnd, hb=None, post=False):
	"""A verified Dialysis Monthly Panel in the Lab module (Test Invoice + Lab Result), dated `when`."""
	tpl = frappe.get_doc("Lab Test Template", "Dialysis Monthly Panel")
	ti = frappe.get_doc({"doctype": "Test Invoice", "patient": patient, "branch": branch, "posting_date": getdate(when), "status": "Released", "items": [{"template": tpl.name}]})
	ti.flags.ignore_mandatory = True
	ti.insert(ignore_permissions=True)
	pre = rnd.uniform(110, 175)
	vals = {"Urea (pre-dialysis)": pre, "Urea (post-dialysis)": pre * rnd.uniform(0.26, 0.37), "Creatinine": rnd.uniform(6.5, 11.5), "Potassium": rnd.uniform(4.2, 6.1),
		"Sodium": rnd.uniform(132, 142), "Calcium": rnd.uniform(7.9, 9.6), "Phosphate": rnd.uniform(4.0, 7.2), "Albumin": rnd.uniform(3.0, 4.2),
		"Haemoglobin": hb or rnd.uniform(8.6, 11.8), "Ferritin": rnd.uniform(180, 720), "PTH (intact)": rnd.uniform(160, 720)}
	rows = []
	for p in tpl.parameters:
		v = vals.get(p.parameter)
		if v is None:
			continue
		flag = "H" if p.normal_high and v > flt(p.normal_high) else ("L" if p.normal_low and v < flt(p.normal_low) else "")
		rows.append({"parameter": p.parameter, "value": f"{v:.1f}" if v < 100 else f"{v:.0f}", "unit": p.unit, "normal_low": p.normal_low, "normal_high": p.normal_high, "flag": flag})
	at = get_datetime(f"{getdate(when)} 13:30:00")
	r = frappe.get_doc({"doctype": "Lab Result", "test_invoice": ti.name, "template": tpl.name, "test_name": tpl.test_name, "department": tpl.department, "patient": patient,
		"patient_name": frappe.db.get_value("Patient", patient, "patient_name"), "branch": branch, "status": "Verified", "version_no": 1, "values": rows,
		"entered_at": at, "verified_at": add_to_date(at, minutes=40), "result_type": "Numeric"})
	r.flags.ignore_mandatory = True
	r.insert(ignore_permissions=True)
	r.db_set("docstatus", 1)
	return vals


def _chart(s, dp, rnd, prev_post, urea=None):
	"""Fill a completed session realistically."""
	dry = flt(dp.dry_weight)
	gain = round(rnd.uniform(1.0, 3.6) if rnd.random() > 0.12 else rnd.uniform(3.6, 4.6), 1)
	pre_w = round((prev_post or dry + 0.3) + gain, 1)
	post_w = round(dry + rnd.uniform(-0.2, 0.6), 1)
	sbp = rnd.randint(128, 172)
	s.update({"pre_weight": pre_w, "pre_bp_sys": sbp, "pre_bp_dia": rnd.randint(72, 96), "pre_pulse": rnd.randint(70, 96), "pre_temp": round(rnd.uniform(36.4, 37.2), 1),
		"access_check": "Good thrill / bruit" if "fistula" in (dp.access_type or "").lower() else "Catheter site clean", "dialyser_use": "New",
		"uf_goal": round(pre_w - dry, 1), "post_weight": post_w, "post_bp_sys": max(sbp - rnd.randint(8, 30), 96), "post_bp_dia": rnd.randint(66, 88), "post_pulse": rnd.randint(70, 92),
		"haemostasis": "Good" if "fistula" in (dp.access_type or "").lower() else "Catheter locked", "condition": "Stable"})
	start = get_datetime(f"{s.session_date} {dz.SHIFTS[s.shift][0]}:00") + timedelta(minutes=rnd.randint(5, 25))
	s.checkin_at, s.start_at, s.end_at = start - timedelta(minutes=15), start, start + timedelta(hours=4, minutes=rnd.randint(0, 10))
	uf_total = round(pre_w - post_w, 1)
	low = rnd.random() < 0.08
	for h in range(1, 5):
		bp = sbp - rnd.randint(0, 22) - (30 if low and h == 3 else 0)
		s.append("observations", {"obs_time": (start + timedelta(hours=h - 0.5)).strftime("%H:%M:%S"), "bp_sys": bp, "bp_dia": rnd.randint(64, 88), "pulse": rnd.randint(72, 100),
			"venous_p": rnd.randint(120, 190), "arterial_p": -rnd.randint(110, 180), "blood_flow": s.blood_flow or 300, "uf_removed": round(uf_total * h / 4, 1), "recorded_by": "dialysis.nurse@vvs.demo"})
	if low:
		s.append("complications", {"comp_time": (start + timedelta(hours=2.5)).strftime("%H:%M:%S"), "complication": "Hypotension", "action": "UF paused, 200 mL saline, legs raised — BP recovered", "recorded_by": "dialysis.nurse@vvs.demo"})
	elif rnd.random() < 0.06:
		s.append("complications", {"comp_time": (start + timedelta(hours=3)).strftime("%H:%M:%S"), "complication": "Cramps", "action": "UF reduced, stretching, saline bolus", "recorded_by": "dialysis.nurse@vvs.demo"})
	if getdate(s.session_date).weekday() in (0, 1):
		s.append("medicines", {"medicine": "Erythropoietin", "dose": "4000 IU", "route": "IV", "batch_no": f"EPO{rnd.randint(2400, 2499)}", "given_at": (start + timedelta(hours=3, minutes=45)).strftime("%H:%M:%S"), "given_by": "dialysis.nurse@vvs.demo"})
	if getdate(s.session_date).day <= 10 and getdate(s.session_date).weekday() in (2, 3, 4):
		s.append("medicines", {"medicine": "Iron sucrose", "dose": "100 mg", "route": "Via circuit", "batch_no": f"VEN{rnd.randint(810, 899)}", "given_at": (start + timedelta(hours=2)).strftime("%H:%M:%S"), "given_by": "dialysis.nurse@vvs.demo"})
	if urea:
		s.pre_urea, s.post_urea = round(urea[0]), round(urea[1])
	for code, nm, qty, _u in dz.CONSUMABLES:
		if qty:
			s.append("consumables", {"item_code": code, "item_name": nm, "qty": qty})
	s.status, s.nurse_signed_by = "Completed", "dialysis.nurse@vvs.demo"
	s.nurse_signed_at = s.end_at + timedelta(minutes=10)
	dz.compute(s)
	return post_w


def _profile(p, rnd, branch, neph, **kw):
	dry = kw.pop("dry", round(rnd.uniform(48, 82), 1))
	dp = frappe.get_doc({"doctype": "Dialysis Patient", "status": "Active", "request_type": "Regular", "patient": p.name, "patient_name": p.patient_name, "gender": p.gender,
		"age": dz._age(p.dob) or rnd.randint(32, 70), "phone": p.phone, "branch": branch, "nephrologist": neph, "ckd_stage": "5D", "ckd_cause": rnd.choice(CAUSES),
		"dialysis_start": add_days(today(), -rnd.randint(120, 1400)), "dry_weight": dry, "comorbidities": rnd.choice(["Hypertension", "Type 2 diabetes, hypertension", "IHD, hypertension", "Hypertension, gout"]),
		"access_type": "AV fistula", "access_site": rnd.choice(["Left radio-cephalic", "Left brachio-cephalic", "Right radio-cephalic"]), "access_status": "Working",
		"rx_duration_hrs": 4, "dialyser": rnd.choice(["F8 HPS", "FX 80", "Elisio 17H"]), "blood_flow": rnd.choice([250, 280, 300, 320]), "dialysate_flow": 500,
		"dialysate": "K 2.0 · Ca 1.5 · HCO3 35", "heparin": "2000 IU bolus + 1000 IU/h", "uf_guidance": "To dry weight; max 4% body weight per session",
		"epo": "4000 IU IV weekly", "iron": "Iron sucrose 100 mg monthly x 4", "other_meds": "Calcium carbonate, vitamin B complex, amlodipine", "whatsapp_opt_in": 0,
		"ec_name": "Attendant", "ec_relation": rnd.choice(["Son", "Wife", "Husband", "Brother", "Daughter"]), "ec_phone": "0300-0000000", "payer": "Self"})
	dp.update(kw)
	dp.append("accesses", {"access_type": dp.access_type, "site": dp.access_site, "created_on": add_days(dp.dialysis_start, -40), "status": "Working"})
	return dp


def build(rnd):
	if frappe.db.count("Dialysis Patient", {"status": "Active"}) >= 20:
		return 0
	branch = frappe.db.get_value("Branch", {}, "name")
	nephs = staff()
	stock()
	t0 = getdate(today())
	month_ago = add_days(t0, -30)
	plan = []  # (dp, station, shift, days)
	neg = [f"S-{i:02d}" for i in range(1, 9)]
	slots = [(st, sh, pat) for st in neg for sh in dz.ACTIVE_SHIFTS for pat in ("Mon, Thu", "Tue, Fri", "Wed, Sat")]
	rnd.shuffle(slots)
	people = _patients(32, rnd)
	if len(people) < 30:
		return 0
	# sample 1 — regular CKD 5 diabetic, AV fistula, Mon/Thu morning, HCV-negative
	p1 = people.pop()
	dp1 = _profile(p1, rnd, branch, nephs[0], ckd_cause="Diabetic", diagnosis="End-stage kidney disease due to diabetic nephropathy", dry=64.5,
		comorbidities="Type 2 diabetes (insulin), hypertension, retinopathy", access_site="Left radio-cephalic AV fistula")
	_screen(dp1, add_days(t0, -40))
	plan.append((dp1, "S-01", "Morning", "Mon, Thu"))
	slots = [s for s in slots if not (s[0] == "S-01" and s[1] == "Morning" and s[2] == "Mon, Thu")]
	# sample 2 — HCV-positive, dedicated HCV station, permanent catheter
	p2 = people.pop()
	dp2 = _profile(p2, rnd, branch, nephs[1], ckd_cause="Hypertensive", diagnosis="ESKD — hypertensive nephrosclerosis; chronic hepatitis C", dry=58.0,
		access_type="Permanent catheter (tunnelled)", access_site="Right internal jugular tunnelled catheter", heparin="Catheter lock heparin 5000 IU/mL", other_meds="Sofosbuvir-velpatasvir (hepatology), calcium carbonate")
	_screen(dp2, add_days(t0, -50), hcv="Positive")
	plan.append((dp2, "C-01", "Afternoon", "Tue, Fri"))
	# HBV / HCV zone patients
	zone_people = [(people.pop(), "B-01", "Morning", "Mon, Thu", dict(hbsag="Positive")), (people.pop(), "B-02", "Evening", "Wed, Sat", dict(hbsag="Positive")),
		(people.pop(), "C-02", "Morning", "Mon, Wed, Fri", dict(hcv="Positive")), (people.pop(), "C-01", "Morning", "Wed, Sat", dict(hcv="Positive"))]
	for p, st, sh, days, v in zone_people:
		dp = _profile(p, rnd, branch, rnd.choice(nephs))
		_screen(dp, add_days(t0, -rnd.randint(20, 70)), hbsag=v.get("hbsag", "Negative"), hcv=v.get("hcv", "Negative"))
		plan.append((dp, st, sh, days))
	# negative-zone regulars
	for i in range(23):
		p = people.pop()
		dp = _profile(p, rnd, branch, rnd.choice(nephs))
		if i % 7 == 3:
			dp.access_type, dp.access_site, dp.access_status = "Temporary catheter", "Right femoral (temporary)", "Working"
		days_ago = rnd.randint(10, 85) if i != 5 else 97   # one patient overdue for screening → blocked without override
		_screen(dp, add_days(t0, -days_ago))
		st, sh, pat = slots.pop()
		plan.append((dp, st, sh, pat))
	made = 0
	for dp, st, sh, days in plan:
		dz.refresh_viral(dp)
		dp.sched_days, dp.sched_shift, dp.station, dp.schedule_active, dp.schedule_from = days, sh, st, 1, month_ago
		dp.rx_per_week = len(dz.parse_days(days))
		if rnd.random() < 0.35:
			dp.append("packages", {"purchased_on": add_days(t0, -18), "package_name": "Dialysis package — 12 sessions", "item_code": "DIA-PKG-12", "sessions": 12, "used": 0,
				"amount": 64000, "valid_until": add_days(t0, -18 + dz.PACKAGE_VALID_DAYS), "status": "Active"})
		if rnd.random() < 0.15:
			dp.payer, dp.panel, dp.panel_ref = "Sehat Card", frappe.db.get_value("Customer", {"customer_group": "Insurance Providers"}, "name"), f"SSP-{rnd.randint(100000, 999999)}"
		dp.insert(ignore_permissions=True)
		_history(dp, rnd, month_ago, t0)
		dp.reload()
		dp.schedule_until = None
		dp.save(ignore_permissions=True)
		dz.generate(dp)
		made += 1
	# labs: two monthly panels for every patient (≈ 30 and ≈ 2 days ago)
	for dp, *_x in plan:
		_labs(dp.patient, branch, add_days(t0, -31), rnd)
		_labs(dp.patient, branch, add_days(t0, -3), rnd)
	# sample 3 — emergency AKI from ICU, bedside today
	p3 = people.pop()
	dp3 = frappe.get_doc({"doctype": "Dialysis Patient", "status": "Active", "request_type": "Emergency", "patient": p3.name, "patient_name": p3.patient_name, "gender": p3.gender,
		"age": dz._age(p3.dob) or 47, "phone": p3.phone, "branch": branch, "nephrologist": nephs[0], "ckd_stage": "AKI", "ckd_cause": "AKI",
		"diagnosis": "Acute kidney injury (sepsis, rhabdomyolysis) — oliguric, K 6.8, urea 240", "dialysis_start": t0, "dry_weight": 72,
		"access_type": "Temporary catheter", "access_site": "Right internal jugular (ICU)", "access_status": "Working", "rx_duration_hrs": 3, "blood_flow": 200, "dialysate_flow": 500,
		"dialysate": "K 2.0 · Ca 1.5", "heparin": "Heparin-free (bleeding risk) — saline flushes", "uf_guidance": "Net UF 1–1.5 L as BP allows", "whatsapp_opt_in": 0})
	dz.refresh_viral(dp3)
	dp3.insert(ignore_permissions=True)
	icu = dz.extra_session(dp3.name, t0, "Morning", None, "ICU bedside", "ICU · Bed I-02")
	icu.reload()
	icu.update({"status": "In Session", "payment_status": "Allowed unpaid", "allow_reason": "ICU emergency — billed to the admission", "allowed_by": "dialysis.incharge@vvs.demo",
		"checkin_at": now_datetime() - timedelta(hours=1), "start_at": now_datetime() - timedelta(minutes=50), "pre_weight": 74.2, "pre_bp_sys": 104, "pre_bp_dia": 62, "pre_pulse": 108,
		"pre_temp": 38.1, "access_check": "Catheter site clean", "uf_goal": 1.2, "machine_serial": "FMC-4008-PORTABLE", "token_no": "HD-ICU"})
	icu.append("observations", {"obs_time": (now_datetime() - timedelta(minutes=20)).strftime("%H:%M:%S"), "bp_sys": 88, "bp_dia": 54, "pulse": 112, "venous_p": 140, "arterial_p": -120,
		"blood_flow": 200, "uf_removed": 0.3, "note": "UF paused", "recorded_by": "dialysis.nurse@vvs.demo"})
	icu.append("complications", {"comp_time": (now_datetime() - timedelta(minutes=20)).strftime("%H:%M:%S"), "complication": "Hypotension", "action": "UF stopped, 250 mL saline, ICU registrar informed"})
	dz.compute(icu)
	icu.save(ignore_permissions=True)
	_today(rnd)
	_samples_extra(dp1, dp2, nephs, rnd)
	_unit_logs(rnd, month_ago, t0)
	# one pending website request
	dz.public_request({"patient_name": "Muhammad Aslam (demo request)", "phone": "03001112233", "gender": "Male", "age": 58, "request_type": "Transfer in",
		"current_hospital": "Allied Hospital, Faisalabad", "pref_days": "Mon, Thu", "pref_shift": "Morning", "access_type": "AV fistula", "notes": "Shifting home to Peoples Colony; HBsAg / HCV negative last month.", "consent": 0})
	return made


def _history(dp, rnd, start, end):
	"""Past month of sessions on the patient's days (completed, ~5 % missed); monthly urea on the first session each month."""
	days = {dz.DAYS.index(d) for d in dz.parse_days(dp.sched_days)}
	d = getdate(start)
	prev_post, urea_done = None, set()
	pkg = next((p for p in dp.packages if p.status == "Active"), None)
	while d < getdate(end):
		if d.weekday() in days:
			s = frappe.get_doc({"doctype": "Dialysis Session", "dialysis_patient": dp.name, "patient": dp.patient, "patient_name": dp.patient_name, "branch": dp.branch,
				"session_date": d, "shift": dp.sched_shift, "station": dp.station, "zone": dp.zone, "status": "Scheduled", "session_type": "Regular", "source": "Schedule",
				"amount": dz.session_rate("Regular"), **dz._rx_defaults(dp)})
			s.token_no = f"HD-{rnd.randint(1, 40):03d}"
			if rnd.random() < 0.05:
				s.status, s.missed_reason = "Missed", rnd.choice(["Did not attend (auto)", "Patient unwell at home — called", "Travelling"])
			else:
				if pkg and getdate(pkg.purchased_on) <= d and pkg.used < pkg.sessions:
					s.payment_status = "Package"
					pkg.used += 1
				else:
					s.payment_status = "Panel credit" if dp.payer == "Sehat Card" else "Paid"
				key = (d.year, d.month)
				urea = None
				if key not in urea_done:
					pre = rnd.uniform(115, 170)
					urea = (pre, pre * rnd.uniform(0.25, 0.36))
					urea_done.add(key)
				prev_post = _chart(s, dp, rnd, prev_post, urea)
			s.insert(ignore_permissions=True)
		d = add_days(d, 1)
	if pkg:
		frappe.db.set_value("Dialysis Package Purchase", pkg.name, "used", pkg.used)


def _today(rnd):
	"""Today's board: morning shift arrived / in session, the rest booked; a few unpaid ('Payment pending')."""
	t0 = today()
	for s in frappe.get_all("Dialysis Session", filters={"session_date": t0, "status": "Scheduled", "session_type": "Regular"}, fields=["name", "shift", "dialysis_patient"]):
		doc = frappe.get_doc("Dialysis Session", s.name)
		dp = frappe.get_doc("Dialysis Patient", s.dialysis_patient)
		r = rnd.random()
		if doc.payment_status == "Unpaid":
			if r < 0.7:
				if dz.package_balance(dp)["remaining"] > 0:
					dz.use_package(doc)
				else:
					doc.payment_status = "Paid"
				doc.token_no = dz.next_token(doc)
		if s.shift == "Morning" and doc.payment_status != "Unpaid" and doc.station != "S-08":
			doc.status, doc.checkin_at = "In Session", now_datetime() - timedelta(minutes=rnd.randint(40, 120))
			doc.start_at = doc.checkin_at + timedelta(minutes=10)
			doc.pre_weight = round(flt(dp.dry_weight) + rnd.uniform(1.2, 3.9), 1)
			doc.pre_bp_sys, doc.pre_bp_dia, doc.pre_pulse, doc.pre_temp = rnd.randint(126, 176), rnd.randint(72, 94), rnd.randint(72, 94), 36.8
			doc.access_check = "Good thrill / bruit" if "fistula" in (dp.access_type or "").lower() else "Catheter site clean"
			doc.uf_goal = round(doc.pre_weight - flt(dp.dry_weight), 1)
			doc.append("observations", {"obs_time": (doc.start_at + timedelta(minutes=30)).strftime("%H:%M:%S"), "bp_sys": doc.pre_bp_sys - 6, "bp_dia": 80, "pulse": 84,
				"venous_p": 150, "arterial_p": -140, "blood_flow": doc.blood_flow or 300, "uf_removed": 0.4, "recorded_by": "dialysis.nurse@vvs.demo"})
			dz.compute(doc)
		doc.save(ignore_permissions=True)


def _samples_extra(dp1, dp2, nephs, rnd):
	"""Consents, monthly reviews (signed) and doctor sign-offs for the sample patients."""
	frappe.set_user("dr.ahsan@vvs.demo")
	for dp, signer in ((dp1, "dr.ahsan@vvs.demo"), (dp2, "dr.nadia@vvs.demo")):
		for ct in ("Haemodialysis",) + (("Catheter Insertion",) if "catheter" in (dp.access_type or "").lower() else ()):
			cf = frappe.get_doc({"doctype": "Consent Form", "patient": dp.patient, "patient_name": dp.patient_name, "branch": dp.branch, "dialysis_patient": dp.name, "consent_type": ct,
				"signed_at": add_days(dp.dialysis_start, 0), "signed_by": "Patient", "signer_name": dp.patient_name, "witness_name": "Farhan (dialysis nurse)",
				"details": "Explained in Urdu by the nephrologist; questions answered."})
			cf.insert(ignore_permissions=True)
			cf.submit()
		last_month = getdate(add_days(getdate(today()).replace(day=1), -1)).replace(day=1)
		frappe.set_user(signer)
		rv = dz.create_review(dp.name, last_month)
		dz.sign_review(rv.name, "Adequate dialysis. Hb below target — EPO increased. Interdialytic weight gain mostly within limits; reinforced fluid restriction (1 L/day + urine output). Phosphate high — diet counselling, binder with meals.",
			"EPO 4000 IU → 6000 IU weekly; continue iron sucrose; calcium carbonate 500 mg TDS with meals.")
		for s in frappe.get_all("Dialysis Session", filters={"dialysis_patient": dp.name, "status": "Completed"}, order_by="session_date desc", limit=2, pluck="name"):
			dz.sign(s, as_doctor=True, note="Reviewed. Tolerated well.")
	frappe.set_user("Administrator")


def _unit_logs(rnd, start, end):
	d = getdate(start)
	while d <= getdate(end):
		frappe.get_doc({"doctype": "Dialysis Unit Log", "log_type": "Water daily check", "log_at": f"{d} 06:30:00", "method": "Morning RO check", "result": "Pass",
			"readings": f"Total chlorine {rnd.choice(['0.02', '0.03', '<0.1'])} mg/L · hardness 0 · conductivity {rnd.randint(4, 9)} µS/cm · TDS {rnd.randint(3, 8)} ppm",
			"recorded_by": "dialysis.tech@vvs.demo"}).insert(ignore_permissions=True)
		if d.weekday() == 0 and d.day <= 7 or d == getdate(start):
			frappe.get_doc({"doctype": "Dialysis Unit Log", "log_type": "Water culture", "log_at": f"{d} 07:00:00", "method": "RO outlet + loop", "result": "Pass",
				"readings": f"CFU {rnd.randint(3, 40)}/mL (action level 50) · endotoxin {rnd.choice(['0.05', '0.08', '0.1'])} EU/mL", "recorded_by": "dialysis.tech@vvs.demo"}).insert(ignore_permissions=True)
		d = add_days(d, 1)
	for s in frappe.get_all("Dialysis Session", filters={"status": "Completed", "session_date": ["<", today()], "station": ["is", "set"]}, fields=["name", "station", "end_at"]):
		frappe.get_doc({"doctype": "Dialysis Unit Log", "log_type": "Disinfection", "log_at": add_to_date(s.end_at, minutes=15), "station": s.station, "session": s.name,
			"method": "Heat disinfection + surface wipe (1000 ppm chlorine)", "result": "Pass", "recorded_by": "dialysis.tech@vvs.demo"}).insert(ignore_permissions=True)
	frappe.get_doc({"doctype": "Dialysis Unit Log", "log_type": "Breakdown", "log_at": f"{add_days(end, -1)} 14:20:00", "station": "S-08", "result": "Fail",
		"notes": "Conductivity alarm, blood pump noise — engineer called", "recorded_by": "dialysis.tech@vvs.demo"}).insert(ignore_permissions=True)
	frappe.db.set_value("Dialysis Station", "S-08", {"status": "Out of service", "out_of_service_reason": "Conductivity alarm — awaiting engineer"})


def run(seed=21):
	frappe.flags.hv_sync_messages = True
	frappe.set_user("Administrator")
	rnd = random.Random(seed)
	n = build(rnd)
	frappe.db.commit()
	print(f"dialysis patients {n} · sessions {frappe.db.count('Dialysis Session')} · stations {frappe.db.count('Dialysis Station')}")
	return n
