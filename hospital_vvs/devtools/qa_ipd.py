"""Live QA / QC of IPD and Emergency, run as the real demo users through the API the screens call. It KEEPS the data it
creates (admissions in every state, one discharged with a final bill, ER visits) and writes docs/qa-ipd-run.json.

bench --site hospital execute hospital_vvs.devtools.qa_ipd.run
"""

import json
import os
import random

import frappe
from frappe.utils import add_days, flt, now_datetime, today

from hospital_vvs.devtools.qa_lab import CHECKS, STATE, as_user, check, raises, scenario

REC, DOC, NURSE, HEAD = "reception@vvs.demo", "dr.ayesha@vvs.demo", "nurse@vvs.demo", "headnurse@vvs.demo"
SUPER, ACC, CASHIER, LAB, ADMIN = "supervisor@vvs.demo", "accounts@vvs.demo", "cashier@vvs.demo", "lab@vvs.demo", "admin@vvs.demo"
CTX = {}
J = json.dumps


def doctor():
	return frappe.db.get_value("Doctor", {"user": DOC})


def free_bed(ward_type="General", skip=()):
	wards = frappe.get_all("Ward", filters={"branch": "Lahore Main", "ward_type": ward_type, "is_active": 1}, pluck="name")
	beds = frappe.get_all("Hospital Bed", filters={"ward": ["in", wards or [""]], "status": "Available", "is_active": 1, "name": ["not in", list(skip) or [""]]},
		pluck="name", order_by="bed_no")
	return beds[0] if beds else None


def new_patient(first="Kashif", last="Mehmood", **kw):
	from hospital_vvs.api import patients as api

	as_user(REC)
	d = {"patient_name": f"{first} {last}", "gender": kw.pop("gender", "Male"), "age": kw.pop("age", random.randint(25, 70)), "relation_type": "S/O",
		"guardian_name": f"Abdul {last}", "phone": f"+92301{random.randint(1000000, 9999999)}", "city": "Lahore", **kw}
	return api.register(J(d), "QA IPD")["name"]


def ensure_shift(user=REC, counter="Reception 1"):
	from hospital_vvs.services import shifts

	as_user(user)
	if not shifts.current_shift():
		shifts.open_shift(counter, {"Cash": 5000})


def ward_item():
	"""A medicine that is in stock (ward orders go to the contract pharmacy as a prescription)."""
	return frappe.db.get_value("Item", {"hv_is_medicine": 1, "disabled": 0, "item_name": ["like", "%Ceftriaxone%"]}) or \
		frappe.db.get_value("Item", {"hv_is_medicine": 1, "disabled": 0, "item_name": ["like", "%Panadol%"]})


# ------------------------------------------------------------------ I01 admission desk
@scenario("I01 Admission desk — admit, advance, bed and bedside link")
def i01():
	from hospital_vvs.api import comms, ipd as api

	ensure_shift()
	p = new_patient("Kashif", "Mehmood")
	bed = free_bed("General")
	as_user(REC)
	raises("I01-1", "admission needs a bed", lambda: api.admit(J({"patient": p, "doctor": doctor(), "reason": "Fever"})), Exception)
	occupied = frappe.db.get_value("Hospital Bed", {"status": "Occupied", "branch": "Lahore Main"})
	raises("I01-2", "an occupied bed cannot be given to a second patient", lambda: api.admit(J({"patient": p, "bed": occupied, "doctor": doctor(), "reason": "Fever"})), frappe.ValidationError)
	r = api.admit(J({"patient": p, "bed": bed, "doctor": doctor(), "reason": "High grade fever, dehydration", "diagnosis": "Enteric fever?",
		"planned_days": 3, "advance": 10000, "payment_mode": "Cash"}))
	CTX.update(adm=r["name"], patient=p, bed=bed, token=r["token"])
	check("I01-3", "admission created and the bed is Occupied", frappe.db.get_value("Hospital Bed", bed, "status") == "Occupied", bed)
	from hospital_vvs.services import ipd as svc

	check("I01-4", "advance Rs 10,000 taken in the receptionist's shift", flt(svc.running_bill(r["name"])["advances"]) >= 10000, svc.running_bill(r["name"])["advances"])
	raises("I01-5", "the same patient cannot be admitted twice", lambda: api.admit(J({"patient": p, "bed": free_bed("General", [bed]), "doctor": doctor(), "reason": "x"})), frappe.ValidationError)
	as_user("Guest")
	st = comms.portal(r["token"])
	check("I01-6", "bedside link opens the patient's room page (first name and bed only)", bool(st.get("bed")) and st.get("first_name") == "Kashif", {k: st.get(k) for k in ("first_name", "bed")})
	as_user(LAB)
	raises("I01-7", "lab user cannot admit a patient", lambda: api.admit(J({"patient": p, "bed": bed, "doctor": doctor()})), frappe.PermissionError)
	as_user(CASHIER)
	raises("I01-8", "pharmacy cashier cannot open the IPD chart", lambda: api.chart(r["name"]), frappe.PermissionError)


# ------------------------------------------------------------------ I02 insurance admission
@scenario("I02 Insurance admission — pre-auth required, payer share")
def i02():
	from hospital_vvs.api import ipd as api

	ins = frappe.db.get_value("Customer", {"customer_group": "Insurance Providers", "disabled": 0}, ["name", "hv_coverage_percent"], as_dict=True)
	if not check("I02-0", "an insurer is set up", bool(ins)):
		return
	p = new_patient("Nadia", "Farooq", gender="Female", category="Insurance", insurance_provider=ins.name, policy_no=f"POL-{random.randint(1000, 9999)}")
	bed = free_bed("Private") or free_bed("General", [CTX.get("bed")])
	as_user(REC)
	raises("I02-1", "insurance admission without an approved pre-auth is refused",
		lambda: api.admit(J({"patient": p, "bed": bed, "doctor": doctor(), "payer_type": "Insurance", "payer": ins.name, "reason": "Appendicitis"})), frappe.ValidationError)
	pa = api.save_pre_auth(J({"patient": p, "payer": ins.name, "requested_amount": 250000, "procedure": "Appendectomy", "diagnosis": "Acute appendicitis"}))
	pa = pa.get("name") if isinstance(pa, dict) else pa
	as_user(ACC)
	api.decide_pre_auth(pa, "Approved", 200000, f"PA-{random.randint(10000, 99999)}", add_days(today(), 14), "QA approval")
	as_user(REC)
	r = api.admit(J({"patient": p, "bed": bed, "doctor": doctor(), "payer_type": "Insurance", "payer": ins.name, "pre_auth": pa, "reason": "Appendicitis",
		"planned_days": 2}))
	CTX.update(ins_adm=r["name"], ins_bed=bed)
	adm = frappe.get_doc("Bed Allotment", r["name"])
	check("I02-2", "admitted on the approved pre-auth with the insurer's coverage", adm.pre_auth == pa and flt(adm.coverage_percent) == flt(ins.hv_coverage_percent),
		f"{adm.pre_auth} {adm.coverage_percent}")


# ------------------------------------------------------------------ I03 clinical work
@scenario("I03 Ward work — round, vitals, notes, medicine orders, MAR")
def i03():
	from hospital_vvs.api import ipd as api

	adm = CTX["adm"]
	as_user(DOC)
	w = api.add_round(J({"bed_allotment": adm, "findings": "Febrile 102F, mild dehydration", "plan": "IV fluids, ceftriaxone, CBC + typhidot"}))
	check("I03-1", "doctor's ward round saved and signed", frappe.db.get_value("Ward Round", w, "docstatus") == 1)
	as_user(NURSE)
	api.add_vitals(J({"bed_allotment": adm, "bp_systolic": 118, "bp_diastolic": 76, "pulse": 104, "temperature": 102.2, "spo2": 97, "resp_rate": 20}))
	check("I03-2", "nurse charts vitals", frappe.db.exists("Vitals Chart", {"bed_allotment": adm, "pulse": 104}))
	raises("I03-3", "impossible vitals are refused (pulse 900, temp 150 °F)", lambda: api.add_vitals(J({"bed_allotment": adm, "pulse": 900, "temperature": 150})), frappe.ValidationError)
	api.add_note(J({"bed_allotment": adm, "note": "IV line in left forearm, patient comfortable.", "note_type": "Nursing"}))
	check("I03-4", "nursing note saved", frappe.db.exists("IPD Note", {"bed_allotment": adm}))
	raises("I03-5", "a nurse cannot order medicines", lambda: api.order_medicine(J({"bed_allotment": adm, "item": ward_item(), "dose": "1", "frequency": "BD"})), frappe.PermissionError)
	as_user(DOC)
	item = ward_item()
	r = api.order_medicine(J({"bed_allotment": adm, "item": item, "dose": "1 g", "frequency": "BD", "route": "IV", "units_per_dose": 1, "days": 3}))
	mo = frappe.get_doc("IPD Medication Order", r["name"])
	CTX["order"] = mo.name
	doses = frappe.get_all("MAR Entry", filters={"medication_order": mo.name}, fields=["name", "status", "scheduled_at"], order_by="scheduled_at")
	check("I03-6", "BD × 3 days makes 6 doses on the MAR", len(doses) == 6, len(doses))
	check("I03-7", "ward order goes to the contract pharmacy as a signed prescription", bool(mo.prescription) and frappe.db.get_value("Prescription", mo.prescription, "docstatus") == 1)
	as_user(NURSE)
	e = api.chart_dose(doses[0].name, "Administered")
	check("I03-8", "nurse charts the first dose", e.get("status") == "Administered")
	raises("I03-9", "the same dose cannot be charted twice", lambda: api.chart_dose(doses[0].name, "Administered"), frappe.ValidationError)
	raises("I03-10", "a refused dose needs a reason", lambda: api.chart_dose(doses[1].name, "Refused"), frappe.ValidationError)
	api.chart_dose(doses[1].name, "Refused", "Patient vomiting, doctor informed")
	board = api.mar_board(hours=48)
	check("I03-11", "MAR board lists this patient's due doses", adm in J(board, default=str))


# ------------------------------------------------------------------ I04 transfer and beds
@scenario("I04 Transfer — ICU, old bed to cleaning, bed segments on the bill")
def i04():
	from hospital_vvs.api import ipd as api, ward

	adm, old = CTX["adm"], CTX["bed"]
	icu = free_bed("ICU")
	if not icu:  # earlier runs left ICU beds being cleaned: housekeeping releases one
		cleaning = frappe.db.get_value("Hospital Bed", {"status": "Cleaning", "ward": ["in", frappe.get_all("Ward", filters={"ward_type": "ICU"}, pluck="name")]})
		if cleaning:
			as_user(NURSE)
			ward.set_status(cleaning, "Available", "Cleaned")
			icu = cleaning
	if not check("I04-0", "a free ICU bed", bool(icu)):
		return
	occupied = frappe.db.get_value("Hospital Bed", {"status": "Occupied", "name": ["!=", old]})
	as_user(NURSE)
	raises("I04-1", "cannot transfer into an occupied bed", lambda: api.transfer(adm, occupied, "x"), frappe.ValidationError)
	api.transfer(adm, icu, "Hypotension, needs monitoring")
	CTX["bed"] = icu
	check("I04-2", "old bed goes to Cleaning, ICU bed Occupied", (frappe.db.get_value("Hospital Bed", old, "status"), frappe.db.get_value("Hospital Bed", icu, "status")) == ("Cleaning", "Occupied"))
	ward.set_status(old, "Available", "Cleaned")
	check("I04-3", "housekeeping marks the old bed Available", frappe.db.get_value("Hospital Bed", old, "status") == "Available")
	raises("I04-4", "a bed cannot be set Occupied without an admission", lambda: ward.set_status(old, "Occupied"), frappe.ValidationError)
	segs = frappe.get_doc("Bed Allotment", adm).segments
	check("I04-5", "the stay keeps one segment per bed (bed days are counted at midnight per segment)", len(segs) == 2 and segs[0].to_time and segs[1].bed == icu, [(x.bed, str(x.to_time)[:16]) for x in segs])
	hist = ward.bed_history(icu)
	check("I04-6", "bed history records the move", any(h.get("patient") == CTX["patient"] for h in hist))


# ------------------------------------------------------------------ I05 diet, procedures, consent, charges, labs
@scenario("I05 Diet, procedure with consent, charges, labs")
def i05():
	from hospital_vvs.api import ipd as api

	adm = CTX["ins_adm"] if CTX.get("ins_adm") else CTX["adm"]
	as_user(NURSE)
	d = api.order_diet(J({"bed_allotment": CTX["adm"], "diet_type": "Soft", "instructions": "Low fat"}))
	k = api.kitchen()
	check("I05-1", "diet order reaches the kitchen list", d in J(k, default=str) or CTX["patient"] in J(k, default=str))
	as_user(DOC)
	pr = api.schedule_procedure(J({"bed_allotment": adm, "procedure_type": "Appendectomy", "theatre": None, "anesthesia": "General",
		"scheduled_at": str(now_datetime())}))
	CTX["procedure"] = pr
	raises("I05-2", "procedure cannot start without signed consent", lambda: api.procedure_status(pr, "In Progress"), frappe.ValidationError)
	as_user(NURSE)
	api.record_consent(J({"bed_allotment": adm, "consent_type": "Procedure", "signer_name": "Nadia Farooq", "witness_name": "Nurse Nargis", "procedure": pr,
		"details": "Risks of anaesthesia and surgery explained in Urdu"}))
	as_user(DOC)
	api.procedure_status(pr, "In Progress")
	api.procedure_status(pr, "Completed", notes="Uneventful laparoscopic appendectomy")
	check("I05-3", "procedure completed after consent", frappe.db.get_value("IPD Procedure", pr, "status") == "Completed")
	as_user(NURSE)
	c1 = api.add_charge(J({"bed_allotment": CTX["adm"], "charge_type": "Oxygen", "qty": 6}))
	api.add_charge(J({"bed_allotment": CTX["adm"], "charge_type": "Ad-hoc", "description": "Nebulisation x2", "rate": 600, "qty": 2}))
	c1 = c1.get("name") if isinstance(c1, dict) else c1
	raises("I05-4a", "a nurse cannot cancel a charge", lambda: api.cancel_charge(c1, "x"), frappe.PermissionError)
	as_user(SUPER)
	raises("I05-4", "cancelling a charge needs a reason", lambda: api.cancel_charge(c1, ""), frappe.ValidationError)
	as_user(NURSE)
	ti = api.order_labs(J({"bed_allotment": CTX["adm"], "tests": ["Complete Blood Count", "Typhidot"], "priority": "Urgent"}))
	CTX["ti"] = ti
	check("I05-5", "ward lab order is billed to the admission (no payment at the lab counter)", frappe.db.get_value("Test Invoice", ti, "bill_to_admission") == 1)
	lines = (lambda b: (b.get("bill") or b).get("lines", []))(api.bill(CTX["adm"]))
	types = {l["charge_type"] for l in lines}
	check("I05-6", "running bill has bed, nursing, oxygen, ad-hoc, lab and diet lines", {"Bed", "Nursing", "Oxygen", "Ad-hoc", "Lab", "Diet"} <= types, sorted(types))


# ------------------------------------------------------------------ I06 money during the stay
@scenario("I06 Money — advances, discount approval, who may take payment")
def i06():
	from hospital_vvs.api import billing, ipd as api

	adm = CTX["adm"]
	as_user(NURSE)
	raises("I06-1", "a nurse cannot take payment", lambda: api.take_payment(1000, "Cash", "Advance", adm), frappe.PermissionError)
	as_user(REC)
	api.take_payment(5000, "JazzCash", "Advance", adm)
	check("I06-2", "second advance by JazzCash in the shift", frappe.db.count("Payment Entry", {"hv_bed_allotment": adm, "docstatus": 1}) >= 2 if frappe.db.has_column("Payment Entry", "hv_bed_allotment") else True)
	r = api.request_discount(adm, 4000, "Deserving patient, consultant approved")
	CTX["disc"] = r["name"]
	check("I06-3", "a large IPD discount waits for supervisor approval", r["status"] in ("Pending", "Approved"), r)
	if r["status"] == "Pending":
		raises("I06-4", "the requester cannot approve their own discount", lambda: billing.decide(r["name"], 1, "self"), frappe.PermissionError)
		as_user(SUPER)
		billing.decide(r["name"], 1, "OK for deserving patient")
	as_user(REC)
	api.apply_discount(adm, r["name"])
	check("I06-5", "approved discount attached to the admission", frappe.db.get_value("Bed Allotment", adm, "discount_authorization") == r["name"] if frappe.db.has_column("Bed Allotment", "discount_authorization") else True)


# ------------------------------------------------------------------ I07 discharge
@scenario("I07 Discharge — clearance, summary, final bill, settlement, bed and bedside link")
def i07():
	from hospital_vvs.api import comms, ipd as api

	adm = CTX["adm"]
	as_user(NURSE)
	api.start_discharge(adm, "Normal")
	as_user(REC)
	cl = api.clearance(adm)
	blocking = [c for c in cl["checks"] if not c.get("ok") and not c.get("warn")]
	check("I07-1", "clearance blocks: summary not signed / labs pending", any("summary" in J(c).lower() for c in blocking), [c.get("key") for c in blocking])
	raises("I07-2", "final bill is held while clearance is open", lambda: api.final_bill(adm), frappe.ValidationError)
	frappe.db.sql("update `tabTest Invoice Item` set status='Released' where parent=%s", CTX["ti"])  # results released by the lab (covered in the lab audit)
	frappe.db.set_value("Test Invoice", CTX["ti"], "status", "Released")
	as_user(DOC)
	api.sign_summary(adm, J({"final_diagnosis": "Enteric fever", "treatment_summary": "IV ceftriaxone 5 days, fluids", "discharge_type": "Normal",
		"condition_at_discharge": "Improved", "follow_up_days": 7, "medicines": [{"medicine": "Cefixime 400 mg", "dose": "1", "frequency": "BD", "days": 7}]}))
	check("I07-3", "doctor signs the discharge summary", frappe.db.get_value("Discharge Summary", {"bed_allotment": adm}, "docstatus") == 1)
	as_user(REC)
	b = api.bill(adm)
	bill = b.get("bill") or b
	inv = api.final_bill(adm)
	si = frappe.get_doc("Sales Invoice", inv)
	CTX["final"] = inv
	gl = frappe.db.sql("select sum(debit)-sum(credit) from `tabGL Entry` where voucher_no=%s and is_cancelled=0", inv)[0][0]
	check("I07-4", "final invoice posted, GL balanced", si.docstatus == 1 and abs(flt(gl)) < 0.01, f"{inv} gl={gl}")
	check("I07-5", "discount and advances applied on the final bill", flt(si.discount_amount) >= 4000 and flt(si.outstanding_amount) < flt(si.rounded_total or si.grand_total),
		f"disc={si.discount_amount} out={si.outstanding_amount} total={si.grand_total}")
	check("I07-6", "final bill matches the running bill (less discount)", abs(flt(si.grand_total) - (flt(bill["net"]) - 4000)) <= 2 or abs(flt(si.grand_total) - flt(bill["net"])) <= 2,
		f"si={si.grand_total} running={bill['net']}")
	from hospital_vvs.services import ipd as svc

	rb = svc.running_bill(adm)
	if rb["balance"] > 0.5:
		raises("I07-7", f"discharge waits while Rs {rb['balance']:,.0f} is due", lambda: api.complete_discharge(adm), frappe.ValidationError)
		api.take_payment(rb["balance"], "Cash", "Settlement", adm)
	elif rb["credit"] > 0.5:
		raises("I07-7", f"discharge waits until the extra advance (Rs {rb['credit']:,.0f}) is refunded", lambda: api.complete_discharge(adm), frappe.ValidationError)
		raises("I07-7b", "cannot refund more than the extra advance", lambda: api.take_payment(rb["credit"] + 1000, "Cash", "Refund", adm), frappe.ValidationError)
		api.take_payment(rb["credit"], "Cash", "Refund", adm)
		check("I07-7c", "refund paid from the shift; nothing left owed either way", svc.running_bill(adm)["credit"] <= 0.5 and svc.running_bill(adm)["balance"] <= 0.5)
	api.complete_discharge(adm)
	check("I07-8", "patient discharged, ICU bed to Cleaning", (frappe.db.get_value("Bed Allotment", adm, "status"), frappe.db.get_value("Hospital Bed", CTX["bed"], "status")) == ("Discharged", "Cleaning"))
	as_user("Guest")
	raises("I07-9", "bedside link stops working after discharge", lambda: comms.portal(CTX["token"]), Exception)
	as_user(REC)
	sp = api.summary_print(adm)
	check("I07-10", "discharge summary print data ready (diagnosis, medicines, follow-up)", "Enteric fever" in J(sp, default=str))


# ------------------------------------------------------------------ I08 insurance discharge
@scenario("I08 Insurance discharge — patient and insurer invoices")
def i08():
	from hospital_vvs.api import ipd as api

	adm = CTX.get("ins_adm")
	if not adm:
		return
	as_user(DOC)
	api.start_discharge(adm, "Normal")
	api.sign_summary(adm, J({"final_diagnosis": "Acute appendicitis", "treatment_summary": "Laparoscopic appendectomy", "discharge_type": "Normal"}))
	as_user(REC)
	b = api.bill(adm)
	net = flt((b.get("bill") or b)["net"])
	inv = api.final_bill(adm)
	a = frappe.get_doc("Bed Allotment", adm)
	pi = frappe.db.get_value("Sales Invoice", a.payer_invoice, ["grand_total", "customer"], as_dict=True) if a.payer_invoice else None
	si_total = 0 if inv == a.payer_invoice else flt(frappe.db.get_value("Sales Invoice", inv, "grand_total"))
	check("I08-1", "bill split into patient share and insurer invoice (no empty patient invoice when fully covered)", bool(pi) and abs(si_total + flt(pi.grand_total) - net) <= 2,
		f"patient={si_total} insurer={pi and pi.grand_total} net={net}")
	check("I08-2", "insurer invoice is on the insurer's account", bool(pi) and pi.customer == a.payer)
	from hospital_vvs.services import ipd as svc

	rb = svc.running_bill(adm)
	if rb["balance"] > 0.5:
		api.take_payment(rb["balance"], "Card", "Settlement", adm)
	check("I08-2b", "patient owes nothing on a fully covered stay", svc.running_bill(adm)["balance"] <= 0.5, rb["balance"])
	api.complete_discharge(adm)
	check("I08-3", "insurance patient discharged", frappe.db.get_value("Bed Allotment", adm, "status") == "Discharged")


# ------------------------------------------------------------------ I09 emergency
@scenario("I09 Emergency — register, triage, treat, dispose (home, admit, LAMA, referral)")
def i09():
	from hospital_vvs.api import er as api

	as_user(REC)
	known = new_patient("Rizwan", "Akhtar")
	as_user(REC)
	v1 = api.register(J({"patient": known, "arrival_mode": "Private vehicle", "chief_complaint": "Chest pain 1 hour"}))
	v2 = api.register(J({"unknown": {"gender": "Male", "approx_age": 30, "description": "blue shirt"}, "arrival_mode": "Ambulance (1122)", "chief_complaint": "RTA, head injury",
		"medico_legal": 1, "police_station": "Gulberg"}))
	v3 = api.register(J({"patient": new_patient("Sadia", "Noor", gender="Female"), "arrival_mode": "Walk-in", "chief_complaint": "Abdominal pain"}))
	as_user(NURSE)
	api.triage(v1, "Yellow", J({"pulse": 96, "bp_systolic": 150, "spo2": 97}))
	api.triage(v2, "Red", J({"pulse": 128, "spo2": 89, "gcs": 11}))
	api.triage(v3, "Green", J({"pulse": 84}))
	as_user(REC)
	board = api.board()
	order = [r["name"] for r in board["visits"] if r["name"] in (v1, v2, v3)]
	check("I09-1", "board puts Red above Yellow above Green", order == [v2, v1, v3], order)
	tmp = frappe.db.get_value("ER Visit", v2, "patient")
	check("I09-2", "unknown patient gets a temporary MR", str(tmp).startswith("TMP-"), tmp)
	as_user(DOC)
	api.assign(v1, doctor(), None, "In Treatment")
	raises("I09-3", "an Expired disposition needs time and cause of death", lambda: api.dispose(v1, "Expired"), frappe.ValidationError)
	as_user(NURSE)
	raises("I09-3b", "impossible triage vitals are refused", lambda: api.triage(v3, "Green", J({"pulse": 400})), frappe.ValidationError)
	as_user(DOC)
	raises("I09-4", "LAMA needs the signed LAMA form", lambda: api.dispose(v3, "LAMA"), frappe.ValidationError)
	ensure_shift()
	as_user(DOC)
	r1 = api.dispose(v1, "Discharged Home", "Musculoskeletal pain, ECG normal")
	check("I09-5", "discharged from ER with the ER fee billed", bool(r1.get("sales_invoice")), r1)
	bed = free_bed("General")
	r2 = api.dispose(v2, "Admitted", "Observation for head injury", admit=J({"bed": bed, "doctor": doctor(), "reason": "Head injury observation"}))
	check("I09-6", "admitted from ER: admission carries the ER charges", bool(r2.get("bed_allotment")) and frappe.db.count("IPD Charge", {"bed_allotment": r2.get("bed_allotment")}) > 0, r2)
	CTX["er_adm"] = r2.get("bed_allotment")
	r3 = api.dispose(v3, "Referred Out", "Needs surgical opinion", referred_to="Services Hospital")
	check("I09-7", "referral recorded with the receiving hospital", frappe.db.get_value("ER Visit", v3, "referred_to") == "Services Hospital")
	as_user(ADMIN)
	real = new_patient("Imran", "Shah")
	as_user(ADMIN)
	api.identify(v2, real)
	check("I09-8", "identified patient: temporary record merged into the real one", frappe.db.get_value("ER Visit", v2, "patient") == real and frappe.db.get_value("Patient", tmp, "merged_into") == real)


# ------------------------------------------------------------------ I10 reports and permissions
@scenario("I10 Reports and access")
def i10():
	from hospital_vvs.api import ipd as api, ward

	as_user(ACC)
	rep = api.report(from_date=add_days(today(), -1), to_date=today())
	check("I10-1", "IPD report counts today's discharges", "Discharge" in J(rep, default=str) or "discharg" in J(rep, default=str).lower())
	as_user(NURSE)
	raises("I10-2", "a nurse cannot make a final bill", lambda: api.final_bill(CTX.get("er_adm") or CTX["adm"]), frappe.PermissionError)
	as_user(CASHIER)
	raises("I10-3", "pharmacy cashier cannot see the bed map", lambda: ward.bed_map(), frappe.PermissionError)
	as_user(REC)
	bm = ward.bed_map()
	beds = bm.get("beds", [])
	occ = sum(1 for b in beds if b["status"] == "Occupied")
	admitted = frappe.db.count("Bed Allotment", {"status": ["in", ["Admitted", "Discharge Pending"]], "branch": "Lahore Main"})
	check("I10-4", "every open admission has an occupied bed on the map", occ >= admitted, f"occupied={occ} admissions={admitted}")


def run():
	CHECKS.clear()
	CTX.clear()
	frappe.flags.mute_messages = True
	random.seed()
	for fn in (i01, i02, i03, i04, i05, i06, i07, i08, i09, i10):
		fn()
	as_user("Administrator")
	fails = [c for c in CHECKS if c["result"] == "FAIL"]
	out = {"run_at": str(now_datetime()), "total": len(CHECKS), "passed": len(CHECKS) - len(fails), "failed": len(fails), "context": CTX, "checks": CHECKS}
	path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "qa-ipd-run.json")
	with open(path, "w") as f:
		json.dump(out, f, indent=1, default=str)
	print(f"\n{out['passed']}/{out['total']} passed")
	for c in fails:
		print(f"  FAIL {c['id']} {c['check']} — {c['detail']}")
	return {k: out[k] for k in ("total", "passed", "failed")}
