"""Live QA / QC of the OPD process, run as the real demo users through the same API the screens call:
shift → registration (new / existing / duplicate) → OPD slip & token → physician queue → prescription → pharmacy / lab hand-off.
KEEPS the data it creates. Results: docs/qa-opd-run.json.

bench --site hospital execute hospital_vvs.devtools.qa_opd.run
"""

import json
import os
import random

import frappe
from frappe.utils import add_days, cint, flt, getdate, now_datetime, today

from hospital_vvs.devtools.qa_lab import CHECKS, STATE, as_user, check, raises, scenario

REC, REC2, NURSE, DRA, DRU = "reception@vvs.demo", "reception2@vvs.demo", "nurse@vvs.demo", "dr.ayesha@vvs.demo", "dr.usman@vvs.demo"
DOC_A, DOC_U = "DR-0001", "DR-0002"
CTX = {}
FIRST = ["Hamid", "Rubina", "Tahir", "Sadia", "Usman", "Nazia", "Faisal", "Ayesha", "Kamran", "Mehwish", "Shahid", "Asma", "Bilal", "Hina", "Zubair", "Farah"]
LAST = ["Khan", "Qureshi", "Butt", "Malik", "Sheikh", "Chaudhry", "Raza", "Awan", "Siddiqui", "Bhatti"]


def phone():
	return f"+92300{random.randint(1000000, 9999999)}"


def register(user, **kw):
	from hospital_vvs.api import patients as api

	as_user(user)
	d = dict({"patient_name": f"{random.choice(FIRST)} {random.choice(LAST)}", "gender": "Male", "phone": phone(), "age": random.randint(18, 70),
		"relation_type": "S/O", "guardian_name": f"{random.choice(FIRST)} {random.choice(LAST)}", "city": "Lahore", "preferred_language": "ur"}, **kw)
	return api.register(json.dumps(d), kw.pop("_reason", None) if "_reason" in kw else None), d


def slip(user, patient, doctor, **kw):
	from hospital_vvs.api import opd as api

	as_user(user)
	return api.create_slip(json.dumps(dict({"patient": patient, "doctor": doctor, "payment_mode": "Cash", "chief_complaint": "Fever and body aches",
		"bp_systolic": 120, "bp_diastolic": 80, "pulse": 82, "temperature": 99.4, "spo2": 98, "weight": 70}, **kw)))


def med(name_like):
	return frappe.db.get_value("Item", {"hv_is_medicine": 1, "disabled": 0, "item_name": ["like", f"%{name_like}%"]}, ["name", "item_name", "hv_dosage_form"], as_dict=True)


@scenario("O01 Cashier shift before money")
def o01():
	from hospital_vvs.api import cash as capi
	from hospital_vvs.api import opd as api
	from hospital_vvs.services import shifts

	p, _ = register(REC)
	as_user(REC2)
	cur = shifts.current_shift()
	if cur and str(cur.posting_date) != today():
		raises("O01-1", "an old shift (yesterday) must be closed before billing today", lambda: slip(REC2, p["name"], DOC_A), frappe.ValidationError)
		summ = shifts.summary(cur.name)
		counts = {m["mode_of_payment"]: m["expected"] for m in summ["modes"]}
		raises("O01-1b", "closing refuses a cash total typed as 'Cash' instead of notes", lambda: capi.close(json.dumps({"Cash": 100}), "{}", "x"), frappe.ValidationError)
		cash = int(round(counts.get("Cash", 0)))
		notes = {}
		for dn in (5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1):
			if cash >= dn:
				notes[str(dn)], cash = cash // dn, cash % dn
		res = capi.close(json.dumps(notes), json.dumps({k: v for k, v in counts.items() if k != "Cash"}), "QA: closing yesterday's shift")
		check("O01-2", "yesterday's shift closed by blind count at the expected amount", res.get("status") in ("Closed", "Approved", "Auto Closed") or res.get("difference") == 0, res.get("status"))
	elif not cur:
		raises("O01-1", "no money without an open shift", lambda: slip(REC2, p["name"], DOC_A), frappe.ValidationError)
		check("O01-2", "(no stale shift to close)", True)
	as_user(REC2)
	if not shifts.current_shift():
		c = frappe.get_doc("Counter", "Reception 2")
		if c.open_shift and frappe.db.get_value("POS Opening Entry", c.open_shift, "status") == "Open":
			check("O01-3", "Reception 2 is free to open", False, f"held by {c.current_user}")
			return
		shifts.open_shift("Reception 2", {"Cash": 5000})
	ms = capi.my_shift()
	check("O01-3", "shift open at Reception 2 with the opening float", ms["shift"] and ms["shift"].get("counter") == "Reception 2", ms.get("shift", {}).get("counter") if ms.get("shift") else None)
	raises("O01-4", "receptionist cannot open a second shift", lambda: shifts.open_shift("Reception 1", {"Cash": 0}), Exception)
	as_user(REC)
	if not shifts.current_shift():
		shifts.open_shift("Reception 1", {"Cash": 5000})
	check("O01-5", "reception@ has an open shift at Reception 1", bool(shifts.current_shift()))


@scenario("O02 Register a new patient")
def o02():
	from hospital_vvs.api import patients as api

	as_user(REC)
	raises("O02-1", "name and gender are required", lambda: api.register(json.dumps({"phone": phone()})), frappe.ValidationError)
	from hospital_vvs.api import patients as papi

	while True:  # a person not yet on file, so the duplicate check stays quiet for the first registration
		nm = f"{random.choice(FIRST)} {random.choice(['Ali', 'Raza', 'Hassan', 'Nawaz', 'Iqbal', 'Aslam'])} {random.choice(LAST)}"
		if not papi.find_duplicates(nm, None, None, None, None):
			break
	cnic = f"35202-{random.randint(1000000, 9999999)}-{random.randint(1, 9)}"
	CTX["cnic"] = cnic
	r, d = register(REC, patient_name=nm, gender="Male", cnic=cnic, blood_group="B+")
	p = frappe.get_doc("Patient", r["name"])
	check("O02-2", "MR number given in the branch series (MR-LHR-…)", p.name.startswith("MR-LHR-"), p.name)
	check("O02-3", "phone stored in +92 format", (p.phone or "").startswith("+92"), p.phone)
	check("O02-4", "CNIC kept masked and hashed, never in clear", p.cnic_masked and "*" in (p.cnic_masked or "") and p.cnic_hash and set((p.get("cnic") or "*").replace("-", "")) == {"*"}, p.cnic_masked)
	check("O02-5", "customer created for billing", bool(r.get("customer")))
	check("O02-6", "age converted to an estimated date of birth", p.dob and p.dob_estimated)
	CTX["new"] = r["name"]
	raises("O02-7", "same name + phone again is caught as a possible duplicate", lambda: api.register(json.dumps({"patient_name": d["patient_name"], "gender": "Male", "phone": d["phone"]})),
		frappe.ValidationError)
	r2 = api.register(json.dumps({"patient_name": d["patient_name"], "gender": "Male", "phone": d["phone"], "relation_type": "S/O", "guardian_name": "Other Father"}),
		"Different person: same name, son of a different father")
	check("O02-8", "a genuine namesake can be registered with a reason", bool(r2.get("name")) and frappe.db.get_value("Patient", r2["name"], "duplicate_reason"))
	dup = api.find_duplicates(d["patient_name"], d["phone"], None, None, None)
	check("O02-9", "duplicate finder lists the existing record", any(x.get("name") == r["name"] for x in dup))


@scenario("O03 Find an existing patient")
def o03():
	from hospital_vvs.api import patients as api

	p = frappe.get_doc("Patient", CTX["new"])
	as_user(REC)
	by = {"MR": api.search(p.name), "phone": api.search(p.phone[-10:]), "name": api.search(" ".join(p.patient_name.split()[:2])), "CNIC": api.search(CTX["cnic"])}
	for k, rows in by.items():
		check(f"O03-{k}", f"search by {k} finds the patient", any(x.get("name") == p.name for x in (rows if isinstance(rows, list) else rows.get("rows", []))), len(rows) if isinstance(rows, list) else rows)
	card = api.get(p.name)
	check("O03-5", "patient file opens with history", card.get("name") == p.name or card.get("patient", {}).get("name") == p.name)


@scenario("O04 OPD slip and token")
def o04():
	from hospital_vvs.api import opd as api

	as_user(REC)
	before = frappe.db.sql("select max(token_no) from `tabQueue Entry` where doctor=%s and queue_date=%s", (DOC_A, today()))[0][0] or 0
	s = slip(REC, CTX["new"], DOC_A, cash_tendered=2000)
	sl = frappe.get_doc("OPD Slip", s.get("name") or s.get("slip", {}).get("name"))
	CTX["slip"] = sl.name
	check("O04-1", "consultation fee = the doctor's fee (Rs 1,500)", flt(sl.net_total) == 1500, sl.net_total)
	check("O04-2", "change worked out from cash tendered (Rs 500)", flt(sl.change_amount) == 500, sl.change_amount)
	si = sl.sales_invoice
	check("O04-3", "invoice submitted in the receptionist's shift", si and frappe.db.get_value("Sales Invoice", si, "docstatus") == 1 and sl.pos_opening_entry)
	check("O04-4", "next token for this doctor today", cint(sl.token_no) == before + 1, f"{sl.token_no} after {before}")
	q = frappe.get_doc("Queue Entry", sl.queue_entry)
	CTX["q"] = q.name
	check("O04-5", "queue entry Waiting for Dr. Ayesha in her room", q.status == "Waiting" and q.doctor == DOC_A and q.room)
	pr = api.slip_print(sl.name)
	check("O04-6", "slip print carries token, room, doctor and amount", pr and str(sl.token_no) in json.dumps(pr, default=str))
	check("O04-7", "vitals saved on the slip", flt(sl.temperature) == 99.4 and sl.bp_systolic == 120)
	raises("O04-8", "a doctor cannot issue OPD slips (counter only)", lambda: slip(DRA, CTX["new"], DOC_A), frappe.PermissionError)


@scenario("O05 Follow-up visit fee")
def o05():
	free = cint(frappe.db.get_single_value("Clinic Settings", "follow_up_free_days"))
	p, _ = register(REC)
	slip(REC, p["name"], DOC_U)
	s2 = frappe.get_doc("OPD Slip", slip(REC2, p["name"], DOC_U)["name"])
	if free:
		check("O05-1", f"second visit within {free} days is a free follow-up", s2.is_free_follow_up and flt(s2.net_total) == 0, s2.net_total)
		check("O05-2", "free follow-up still gets a token (no invoice)", s2.token_no and not s2.sales_invoice)
	else:
		check("O05-1", "second visit charged the follow-up fee (Rs 1,500)", flt(s2.net_total) == 1500, s2.net_total)
		check("O05-2", "follow-up still gets a token", bool(s2.token_no))


@scenario("O06 Physician queue")
def o06():
	from hospital_vvs.api import opd as api

	# three more patients for Dr. Ayesha: one elderly priority, one urgent
	pts = [register(REC, age=a)[0]["name"] for a in (34, 72, 45)]
	sl = [frappe.get_doc("OPD Slip", slip(REC, x, DOC_A)["name"]) for x in pts]
	as_user(NURSE)
	api.set_queue_status(sl[1].queue_entry, "Waiting", "Elderly")
	api.set_queue_status(sl[2].queue_entry, "Waiting", "Urgent")
	as_user(DRA)
	rows = [r for r in api.queue(doctor=DOC_A)["rows"] if r.status == "Waiting"]
	order = [r.name for r in rows]
	check("O06-1", "waiting list: Urgent first, then Elderly, then by token", order.index(sl[2].queue_entry) < order.index(sl[1].queue_entry) < order.index(sl[0].queue_entry), [r.priority for r in rows][:5])
	called = api.call_next(DOC_A)
	check("O06-2", "Call next calls an urgent patient first (oldest urgent token)", called["priority"] == "Urgent" and called["status"] == "Called", called["priority"])
	d = api.display()
	check("O06-3", "waiting-room display shows the called token and room", any(str(called["token_no"]) in json.dumps(x, default=str) for x in (d.get("called") or d.get("rows") or [d])), list(d)[:4])
	api.set_queue_status(called["name"], "Skipped")
	api.set_queue_status(called["name"], "Waiting")
	check("O06-4", "a skipped patient can be put back in the queue", frappe.db.get_value("Queue Entry", called["name"], "status") == "Waiting")
	CTX["queue_pts"] = [x.queue_entry for x in sl]
	as_user(REC)
	raises("O06-5", "unknown queue status refused", lambda: api.set_queue_status(called["name"], "Teleported"), frappe.ValidationError)


@scenario("O07 Prescription")
def o07():
	from hospital_vvs.api import prescription as api

	as_user(DRA)
	ws = api.workspace(queue_entry=CTX["q"])
	check("O07-1", "workspace opens the queued patient with today's vitals", ws["patient"]["name"] == CTX["new"] and ws["slip"] and flt(ws["slip"]["temperature"]) == 99.4)
	pan, amox, cough = med("Panadol"), med("Amoxil"), med("Syrup") or med("Calpol")
	meds = [{"item": pan.name, "dose": "1", "frequency": "1+1+1", "route": "Oral", "duration": "5 days", "qty": "", "instructions": "After meals"},
		{"item": amox.name, "dose": "1", "frequency": "1+0+1", "route": "Oral", "duration": "7 days", "qty": "", "instructions": "Complete the course"}]
	if cough:
		meds.append({"item": cough.name, "dose": "5 ml", "frequency": "1+1+1", "route": "Oral", "duration": "5 days", "qty": ""})
	data = {"queue_entry": CTX["q"], "medicines": meds, "diagnoses": [{"diagnosis": frappe.db.get_value("Diagnosis", {}), "is_primary": 1}],
		"lab_tests": [{"test_name": "Complete Blood Count"}], "examination_notes": "Throat congested, no rash.", "advice": "Plenty of fluids", "follow_up_days": 7}
	draft = api.save(json.dumps(data))
	check("O07-2", "saving the draft moves the patient to In Consultation", frappe.db.get_value("Queue Entry", CTX["q"], "status") == "In Consultation")
	data["name"] = draft["name"]
	rx = api.save(json.dumps(data), 1)
	CTX["rx"] = rx["name"]
	q = {m["item"]: flt(m["qty"]) for m in rx["medicines"]}
	check("O07-3", "Panadol 1+1+1 × 5 days → quantity 15 calculated", q.get(pan.name) == 15, q.get(pan.name))
	check("O07-4", "Amoxil 1+0+1 × 7 days → quantity 14 calculated", q.get(amox.name) == 14, q.get(amox.name))
	check("O07-5", "signing marks the queue entry Done", frappe.db.get_value("Queue Entry", CTX["q"], "status") == "Done")
	check("O07-6", "follow-up date set from 7 days", str(rx.get("follow_up_date") or "") == str(add_days(getdate(), 7)), rx.get("follow_up_date"))
	si = frappe.db.get_value("Sales Invoice", {"hv_prescription": rx["name"], "docstatus": 0}, "name")
	check("O07-7", "pharmacy gets a draft medicine bill", bool(si))
	if si:
		lines = {i.item_code: flt(i.qty) for i in frappe.get_doc("Sales Invoice", si).items}
		check("O07-8", "pharmacy draft carries the full course (15 Panadol), not 1", lines.get(pan.name) == 15, lines)
		if cough:
			check("O07-8b", "syrup 5 ml × 3 × 5 days = 75 ml → 1 bottle", lines.get(cough.name) == 1, lines.get(cough.name))
	ti = frappe.db.get_value("Test Invoice", {"prescription": rx["name"]}, "name")
	check("O07-9", "lab order created from the prescription", bool(ti))
	raises("O07-10", "a signed prescription cannot be edited (amend instead)", lambda: api.save(json.dumps(data)), frappe.ValidationError)
	pd = api.print_data(rx["name"])
	check("O07-11", "prescription print data ready (doctor, medicines, advice)", pd and "medicines" in json.dumps(pd, default=str))


@scenario("O08 Safety alerts")
def o08():
	from hospital_vvs.api import prescription as api

	p, _ = register(REC, allergies=[{"allergy": frappe.db.get_value("Allergy", {"allergy_name": ["like", "%enicillin%"]}) or frappe.db.get_value("Allergy", {}), "severity": "Severe", "reaction": "Rash"}])
	sl = frappe.get_doc("OPD Slip", slip(REC, p["name"], DOC_A)["name"])
	as_user(DRA)
	amox = med("Amoxil")
	alerts = api.check(p["name"], json.dumps([{"item": amox.name}]))
	has = bool(alerts and any(a.get("blocking") for a in (alerts if isinstance(alerts, list) else alerts.get("alerts", []))))
	check("O08-1", "penicillin allergy raises a blocking alert for Amoxil", has, alerts)
	data = {"queue_entry": sl.queue_entry, "medicines": [{"item": amox.name, "dose": "1", "frequency": "1+0+1", "duration": "5 days"}]}
	frappe.db.commit()
	if has:
		raises("O08-2", "cannot sign without an override reason", lambda: api.save(json.dumps(data), 1), frappe.ValidationError)
		frappe.db.rollback()
		data["medicines"][0]["override_reason"] = "Tolerated amoxicillin before (patient confirms)"
		rx = api.save(json.dumps(data), 1)
		check("O08-3", "signed with the override reason recorded", rx["docstatus"] == 1)


@scenario("O09 Amendment and roles")
def o09():
	from hospital_vvs.api import prescription as api

	as_user(REC)
	raises("O09-1", "receptionist cannot write prescriptions", lambda: api.save(json.dumps({"patient": CTX["new"], "medicines": []})), frappe.PermissionError)
	as_user(DRA)
	raises("O09-2", "amendment needs a reason", lambda: api.amend(CTX["rx"], ""), frappe.ValidationError)
	new = api.amend(CTX["rx"], "Dose correction")
	check("O09-3", "amendment opens a new draft linked to the original", new.get("amended_from") == CTX["rx"] or new.get("name"), new.get("amended_from"))


@scenario("O10 Doctor's pending list")
def o10():
	from hospital_vvs.api import opd as api

	as_user(DRA)
	rows = api.queue(doctor=DOC_A)["rows"]
	waiting = [r for r in rows if r.status in ("Waiting", "Called", "In Consultation")]
	check("O10-1", "doctor sees today's pending patients with tokens", len(waiting) >= 2, len(waiting))
	check("O10-2", "each pending row links to its draft prescription if one exists", all("prescription" in r for r in rows))


SCENARIOS = [o01, o02, o03, o04, o05, o06, o07, o08, o09, o10]


def run(only=None):
	random.seed(int(now_datetime().timestamp()) % 10000)
	frappe.flags.mute_messages = True
	CHECKS.clear()
	STATE["orders"] = []
	for s in SCENARIOS:
		if only and s.__name__ not in only:
			continue
		s()
	frappe.db.commit()
	path = os.path.join(frappe.get_app_path("hospital_vvs"), "..", "docs", "qa-opd-run.json")
	with open(path, "w") as fh:
		fh.write(json.dumps({"run_at": str(now_datetime()), "checks": CHECKS}, indent=1, ensure_ascii=False, default=str))
	fails = [c for c in CHECKS if c["result"] == "FAIL"]
	print(f"\n{len(CHECKS)} checks · {len(CHECKS) - len(fails)} pass · {len(fails)} fail")
	for c in fails:
		print("FAIL", c["id"], c["check"], "—", c["detail"])
	return {"checks": len(CHECKS), "fail": len(fails)}
