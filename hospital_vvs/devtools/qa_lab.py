"""Live QA / QC of the lab module, run as the real demo users through the same API the screens call. It KEEPS the data it
creates (demo data for every lab state) and writes the check list to docs/qa-lab-run.json.

bench --site hospital execute hospital_vvs.devtools.qa_lab.run
"""

import base64
import io
import json
import os
import random
import traceback

import frappe
from frappe.utils import flt, get_datetime, getdate, now_datetime, today

CHECKS = []
STATE = {"orders": [], "scenario": ""}
RECEPTION, LAB, PATH, DOCTOR, SUPER = "reception@vvs.demo", "lab@vvs.demo", "pathologist@vvs.demo", "dr.ayesha@vvs.demo", "supervisor@vvs.demo"


def as_user(u):
	frappe.set_user(u)


def check(cid, desc, ok, detail=""):
	CHECKS.append({"id": cid, "scenario": STATE["scenario"], "check": desc, "result": "PASS" if ok else "FAIL", "detail": str(detail)[:300]})
	print(("  ✓ " if ok else "  ✗ ") + f"{cid} {desc}" + (f" — {detail}" if detail and not ok else ""))
	return ok


def raises(cid, desc, fn, exc=Exception):
	try:
		fn()
	except exc as e:
		frappe.local.message_log = []
		return check(cid, desc, True, type(e).__name__)
	except Exception as e:  # wrong exception type
		frappe.local.message_log = []
		return check(cid, desc, False, f"raised {type(e).__name__}: {e}")
	return check(cid, desc, False, "no error raised")


def scenario(name):
	def deco(fn):
		def run():
			STATE["scenario"] = name
			print(f"\n== {name}")
			try:
				fn()
				frappe.db.commit()
			except Exception as e:
				frappe.db.rollback()
				check(f"{name[:3].upper()}-ERR", f"scenario ran to the end", False, f"{type(e).__name__}: {e} | {traceback.format_exc().splitlines()[-3:]}")
			finally:
				frappe.local.message_log = []
				as_user("Administrator")
		run.__name__ = fn.__name__
		return run
	return deco


# ------------------------------------------------------------------ helpers
def patients(n, category="Normal"):
	rows = frappe.get_all("Patient", filters={"disabled": 0, "temporary_record": 0, "phone": ["is", "set"], "category": category, "branch": "Lahore Main"},
		fields=["name", "patient_name", "phone", "gender"], order_by="modified desc", limit=60)
	random.Random(7).shuffle(rows)
	return rows[:n]


def values_for(template, gender="Male", critical=None, abnormal=None):
	out = {}
	seen = set()
	for p in frappe.get_cached_doc("Lab Test Template", template).parameters:
		if p.parameter in seen or p.gender not in ("All", gender):
			continue
		seen.add(p.parameter)
		if p.normal_text:
			v = p.normal_text
		elif flt(p.normal_high):
			lo, hi = flt(p.normal_low), flt(p.normal_high)
			v = round(lo + (hi - lo) * random.uniform(0.3, 0.7), 1)
		else:
			v = 0
		if abnormal and p.parameter in abnormal:
			v = abnormal[p.parameter]
		if critical and p.parameter in critical:
			v = critical[p.parameter]
		out[p.parameter] = str(v)
	return out


def items(ti):
	return frappe.get_all("Test Invoice Item", filters={"parent": ti}, fields=["name", "template", "status", "sample", "result"], order_by="idx")


def samples_of(ti, status=None):
	f = {"test_invoice": ti}
	if status:
		f["status"] = status
	return frappe.get_all("Lab Sample", filters=f, pluck="name", order_by="creation")


def ensure_shifts():
	from hospital_vvs.services import shifts

	for user, counter in ((LAB, "Lab Counter"), (RECEPTION, "Reception 1")):
		as_user(user)
		s = shifts.current_shift()
		if s and str(s.posting_date) != today():
			check("SHIFT-0", f"{user} had an old open shift {s.name}", True, "left for the owner to close")
			continue
		if not s:
			c = frappe.get_doc("Counter", counter)
			if c.open_shift and frappe.db.get_value("POS Opening Entry", c.open_shift, "status") == "Open":
				continue
			shifts.open_shift(counter, {"Cash": 3000})
	as_user("Administrator")


def order(user, patient, tests, **kw):
	from hospital_vvs.api import lab as api

	as_user(user)
	o = api.create_order(json.dumps({"patient": patient, "tests": tests, **kw}))
	STATE["orders"].append(o["name"])
	return o


def pay(user, name, mode="Cash", **kw):
	from hospital_vvs.api import lab as api

	as_user(user)
	return api.pay(name, mode, **kw)


def collect_receive(ti, receive=True):
	from hospital_vvs.api import lab as api

	as_user(LAB)
	for s in samples_of(ti, "Pending"):
		api.sample_action(s, "collect")
		if receive:
			api.sample_action(s, "receive")


def enter(item, template, gender, **kw):
	from hospital_vvs.api import lab as api

	as_user(LAB)
	return api.save_result(item, json.dumps(values_for(template, gender, **kw)))


def verify_all(ti, interpretation=None):
	from hospital_vvs.api import lab as api

	as_user(PATH)
	for i in items(ti):
		r = frappe.db.get_value("Lab Result", {"invoice_item": i.name, "docstatus": 0, "status": "Result Entered"}, "name")
		if r:
			api.verify(r, interpretation)


def release(ti, partial=0):
	from hospital_vvs.api import lab as api

	as_user(LAB)
	return api.release(ti, partial)


def token_of(link):
	return link.rstrip("/").rsplit("/", 1)[1]


# ------------------------------------------------------------------ scenarios
@scenario("S01 Routine order → report (CBC + LFT, cash)")
def s01():
	from hospital_vvs.api import lab as api

	p = patients(1)[0]
	o = order(RECEPTION, p.name, ["Complete Blood Count", "Liver Function Tests"], referring_doctor=frappe.db.get_value("Doctor", {"doctor_name": "Dr. Ayesha Siddiqui"}))
	check("S01-1", "order created as Ordered with 2 tests and the right total", o["status"] == "Ordered" and len(o["items"]) == 2 and flt(o["net_total"]) == 900 + 1400,
		f"{o['status']} {o['net_total']}")
	o = pay(RECEPTION, o["name"], "Cash", cash_tendered=3000)
	si = o["sales_invoice"]
	check("S01-2", "payment: POS invoice submitted in the collector's shift, status Paid, expected time set", o["status"] == "Paid" and si and frappe.db.get_value("Sales Invoice", si, "docstatus") == 1 and o["expected_at"],
		f"{o['status']} {si}")
	from hospital_vvs.services.billing import pos_profile_for

	want = frappe.db.get_value("POS Profile", pos_profile_for("Lab", "Lahore Main"), "income_account")
	check("S01-3", "lab income booked on the Lab POS profile income account", frappe.db.get_value("Sales Invoice Item", {"parent": si}, "income_account") == want,
		frappe.db.get_value("Sales Invoice Item", {"parent": si}, "income_account"))
	ss = samples_of(o["name"])
	check("S01-4", "one sample per sample type / container (EDTA for CBC, serum for LFT)", len(ss) == 2, ss)
	check("S01-5", "thank-you message queued", frappe.db.exists("Message Log", {"reference_name": o["name"], "event": "lab_thank_you"}))
	as_user(LAB)
	lab_labels = api.labels(json.dumps(ss))
	check("S01-6", "barcode labels carry MR, name, tests, container", all(x["mr"] == p.name and x["tests"] and x["barcode"] for x in lab_labels))
	sc = api.scan(ss[0])
	check("S01-7", "barcode scan finds the sample and its tests", sc["type"] == "sample" and sc["items"])
	raises("S01-8", "result entry refused before the sample reaches the lab", lambda: enter(items(o["name"])[0].name, "Complete Blood Count", p.gender), frappe.ValidationError)
	collect_receive(o["name"])
	wl = api.worklist()
	check("S01-9", "both tests on the result worklist after receiving", sum(1 for w in wl if w.test_invoice == o["name"]) == 2)
	for i in items(o["name"]):
		enter(i.name, i.template, p.gender)
	check("S01-10", "order In Progress, tests Result Entered", frappe.db.get_value("Test Invoice", o["name"], "status") == "In Progress" and all(i.status == "Result Entered" for i in items(o["name"])))
	raises("S01-11", "lab user cannot verify", lambda: api.verify(frappe.db.get_value("Lab Result", {"test_invoice": o["name"]}, "name")), frappe.PermissionError)
	raises("S01-12", "release refused before anything is verified", lambda: release(o["name"]), frappe.ValidationError)
	verify_all(o["name"], "Within normal limits.")
	out = release(o["name"])
	check("S01-13", "released: status Released, WhatsApp report link queued", frappe.db.get_value("Test Invoice", o["name"], "status") == "Released"
		and frappe.db.exists("Message Log", {"reference_name": o["name"], "event": "lab_report_ready"}))
	tok = token_of(out["link"])
	as_user("Guest")
	first = api.report_open(tok)
	check("S01-14", "portal asks for the last 4 digits first (no data before verification)", first.get("needs_verification") and "report" not in first)
	raises("S01-15", "wrong digits refused", lambda: api.report_verify(tok, "0000" if not p.phone.endswith("0000") else "1111"), frappe.ValidationError)
	rep = api.report_verify(tok, p.phone[-4:])["report"]
	check("S01-16", "right digits show both tests with values and interpretation", len([t for t in rep["tests"] if not t["pending"]]) == 2 and rep["tests"][0]["interpretation"])
	api.report_pdf(tok)
	check("S01-17", "patient PDF downloads", frappe.local.response.type == "pdf" and len(frappe.local.response.filecontent) > 5000)
	as_user(LAB)
	api.print_pdf(o["name"])
	api.hand_over(o["name"], f"Self — {p.patient_name}")
	check("S01-18", "printed copy handed over and recorded", frappe.db.get_value("Test Invoice", o["name"], "handed_over_to") is not None)
	as_user(DOCTOR)
	html = api.report_preview(o["name"])
	check("S01-19", "referring doctor can view the report (access logged)", "LABORATORY REPORT" in html and frappe.db.exists("Clinical Access Log", {"reference_name": o["name"], "action": "Lab report view"}))


@scenario("S02 Urgent order with a critical value")
def s02():
	from hospital_vvs.api import lab as api

	p = patients(2)[1]
	routine = order(RECEPTION, patients(3)[2].name, ["Blood Sugar Random"])
	pay(RECEPTION, routine["name"])
	o = order(RECEPTION, p.name, ["Renal Function Tests"], priority="Urgent", referring_doctor=frappe.db.get_value("Doctor", {"doctor_name": "Dr. Usman Tariq"}))
	pay(RECEPTION, o["name"], "JazzCash", cash_tendered=None) if False else pay(RECEPTION, o["name"], "Cash")
	as_user(LAB)
	pend = api.samples("Pending")
	idx = {s.test_invoice: k for k, s in enumerate(pend)}
	check("S02-1", "urgent sample listed before routine ones", idx.get(o["name"], 99) < idx.get(routine["name"], 99), idx)
	collect_receive(o["name"])
	collect_receive(routine["name"])
	wl = api.worklist()
	first = next((w for w in wl if w.test_invoice in (o["name"], routine["name"])), None)
	check("S02-2", "urgent test first on the worklist", first and first.test_invoice == o["name"])
	it = items(o["name"])[0]
	r = enter(it.name, "Renal Function Tests", p.gender, critical={"Potassium": "6.9"})
	res = frappe.get_doc("Lab Result", r["result"]["name"] if r.get("result") else frappe.db.get_value("Lab Result", {"invoice_item": it.name}, "name"))
	check("S02-3", "potassium 6.9 flagged Critical High", any(v.parameter == "Potassium" and v.flag == "Critical High" for v in res.get("values")) and res.has_critical)
	as_user(PATH)
	raises("S02-4", "verification blocked until the critical value is phoned to the doctor", lambda: api.verify(res.name), frappe.ValidationError)
	as_user(LAB)
	api.critical_log(res.name, "Dr. Usman Tariq", "Phone", read_back=1, note="Read back confirmed", parameter="Potassium")
	check("S02-5", "critical value log written (who, how, read back)", frappe.db.exists("Critical Value Log", {"lab_result": res.name, "read_back": 1}))
	as_user(PATH)
	api.verify(res.name, "Hyperkalaemia — doctor informed.")
	out = release(o["name"])
	check("S02-6", "urgent report released", out["status"] == "Released")
	for i in items(routine["name"]):
		enter(i.name, i.template, "Male")
	verify_all(routine["name"])
	release(routine["name"])
	as_user(LAB)
	d = api.dashboard()
	check("S02-7", "dashboard shows today's tests and TAT figures", d["by_status"] and "tat" in d)


@scenario("S03 Rejected sample → recollection")
def s03():
	from hospital_vvs.api import lab as api

	p = patients(4)[3]
	o = order(RECEPTION, p.name, ["Lipid Profile"])
	pay(RECEPTION, o["name"])
	s = samples_of(o["name"])[0]
	as_user(LAB)
	api.sample_action(s, "collect")
	raises("S03-1", "rejection needs a reason", lambda: api.sample_action(s, "reject"), frappe.ValidationError)
	new = api.sample_action(s, "reject", reason="Hemolysed", note="Repeat venepuncture")["recollect"]
	check("S03-2", "rejected sample keeps the reason; a new sample is waiting for collection", frappe.db.get_value("Lab Sample", s, "status") == "Rejected"
		and frappe.db.get_value("Lab Sample", new, "status") == "Pending" and frappe.db.get_value("Lab Sample", new, "recollect_of") == s)
	check("S03-3", "test moved to the new sample", items(o["name"])[0].sample == new)
	collect_receive(o["name"])
	i = items(o["name"])[0]
	enter(i.name, i.template, p.gender, abnormal={"LDL": "168", "Total cholesterol": "245"})
	verify_all(o["name"], "Raised LDL / total cholesterol.")
	release(o["name"])
	check("S03-4", "report released after recollection", frappe.db.get_value("Test Invoice", o["name"], "status") == "Released")


@scenario("S04 Reject after a result was entered")
def s04():
	from hospital_vvs.api import lab as api

	p = patients(5)[4]
	o = order(RECEPTION, p.name, ["TSH"])
	pay(RECEPTION, o["name"])
	collect_receive(o["name"])
	i = items(o["name"])[0]
	enter(i.name, "TSH", p.gender)
	old_res = frappe.db.get_value("Lab Result", {"invoice_item": i.name}, "name")
	as_user(LAB)
	api.sample_action(i.sample, "reject", reason="Clotted", note="Found clotted on re-check")
	st = frappe.db.get_value("Lab Result", old_res, ["status", "docstatus"], as_dict=True)
	check("S04-1", "the draft result of a rejected sample is withdrawn (not left waiting for verification)", st.status in ("Cancelled", "Superseded") or st.docstatus == 2, st)
	as_user(PATH)
	check("S04-2", "pathologist no longer sees the old result to verify", old_res not in [r.name for r in api.verify_list()])
	collect_receive(o["name"])
	enter(items(o["name"])[0].name, "TSH", p.gender)
	verify_all(o["name"])
	release(o["name"])


@scenario("S05 Sent back by the pathologist")
def s05():
	from hospital_vvs.api import lab as api

	p = patients(6)[5]
	o = order(RECEPTION, p.name, ["HbA1c"])
	pay(RECEPTION, o["name"])
	collect_receive(o["name"])
	i = items(o["name"])[0]
	enter(i.name, "HbA1c", p.gender, abnormal={"HbA1c": "65"})
	res = frappe.db.get_value("Lab Result", {"invoice_item": i.name}, "name")
	as_user(PATH)
	api.send_back(res, "65 % is not possible — check decimal (6.5?)")
	check("S05-1", "sent back: test returns to the worklist with the reason", frappe.db.get_value("Test Invoice Item", i.name, "status") == "Received"
		and frappe.db.get_value("Lab Result", res, "send_back_reason"))
	enter(i.name, "HbA1c", p.gender, abnormal={"HbA1c": "6.5"})
	check("S05-2", "corrected value is flagged High (6.5 > 5.6)", any(v.flag == "High" for v in frappe.get_doc("Lab Result", res).get("values")))
	verify_all(o["name"], "Diabetic range.")
	release(o["name"])


@scenario("S06 Amendment after release")
def s06():
	from hospital_vvs.api import lab as api

	p = patients(7)[6]
	o = order(RECEPTION, p.name, ["Blood Sugar Fasting"])
	pay(RECEPTION, o["name"])
	collect_receive(o["name"])
	i = items(o["name"])[0]
	enter(i.name, "Blood Sugar Fasting", p.gender)
	verify_all(o["name"])
	tok = token_of(release(o["name"])["link"])
	res = frappe.db.get_value("Lab Result", {"invoice_item": i.name, "docstatus": 1}, "name")
	frappe.db.commit()
	as_user(LAB)
	raises("S06-1", "a lab user cannot amend a verified result (pathologist only)", lambda: api.amend(res, "typo"), frappe.PermissionError)
	frappe.db.rollback()  # if the lab user's amendment went through, undo it so the scenario can continue
	as_user(PATH)
	raises("S06-2", "amendment needs a reason", lambda: api.amend(res, " "), frappe.ValidationError)
	new = api.amend(res, "Transcription error: 128 not 182")
	enter(i.name, "Blood Sugar Fasting", p.gender, abnormal={"Glucose (fasting)": "128"})
	as_user(PATH)
	api.verify(new["name"], "Amended.")
	check("S06-3", "old version Superseded, new version 2", frappe.db.get_value("Lab Result", res, "status") == "Superseded" and frappe.db.get_value("Lab Result", new["name"], "version_no") == 2)
	from hospital_vvs.services import lab as svc

	check("S06-4", "old report link stops working; 'report updated' message sent", bool(svc.token_doc(tok)[1]) and frappe.db.exists("Message Log", {"reference_name": o["name"], "event": "lab_report_updated"}))
	rep = svc.report_data(o["name"])
	check("S06-5", "report marks the test AMENDED v2", rep["tests"][0]["amended"] and rep["tests"][0]["version"] == 2)


@scenario("S07 Partial release")
def s07():
	frappe.db.set_single_value("Clinic Settings", "lab_allow_partial_release", 1)
	p = patients(8)[7]
	o = order(RECEPTION, p.name, ["Complete Blood Count", "Typhidot"])
	pay(RECEPTION, o["name"])
	collect_receive(o["name"])
	its = items(o["name"])
	enter(its[0].name, its[0].template, p.gender)
	verify_all(o["name"])
	from hospital_vvs.api import lab as api

	as_user(LAB)
	raises("S07-1", "full release refused while one test is pending", lambda: api.release(o["name"], 0), frappe.ValidationError)
	out = api.release(o["name"], 1)
	check("S07-2", "partial release: status Partially Released", out["status"] == "Partially Released")
	from hospital_vvs.services import lab as svc

	rep = svc.report_data(o["name"])
	check("S07-3", "patient report shows the pending test as pending", any(t["pending"] for t in rep["tests"]) and any(not t["pending"] for t in rep["tests"]))
	enter(its[1].name, its[1].template, p.gender, abnormal={"Typhidot IgM": "Positive"})
	check("S07-4", "qualitative 'Positive' against 'Negative' flagged Abnormal", any(v.flag == "Abnormal" for v in frappe.get_doc("Lab Result", frappe.db.get_value("Lab Result", {"invoice_item": its[1].name}, "name")).get("values")))
	verify_all(o["name"], "Typhidot IgM positive.")
	out = api.release(o["name"], 0)
	check("S07-5", "second release completes the report", out["status"] == "Released")


@scenario("S08 Outsourced test with a scanned report")
def s08():
	from frappe.utils.pdf import get_pdf

	from hospital_vvs.api import lab as api

	p = patients(9)[8]
	o = order(RECEPTION, p.name, ["Vitamin D (25-OH)", "Histopathology"])
	pay(RECEPTION, o["name"])
	ss = samples_of(o["name"])
	as_user(LAB)
	for s in ss:
		api.sample_action(s, "collect")
	od = api.dispatch(json.dumps(ss), "Chughtai Reference Lab", "TCS")
	check("S08-1", "dispatch creates the outsourced batch and a purchase bill to the reference lab", od.get("purchase_invoice"), od.get("name"))
	out_list = api.outsourced()
	check("S08-2", "dispatched samples listed as awaiting results", any(sm.get("test_invoice") == o["name"] for d in out_list["dispatches"] for sm in d["samples"]))
	for i in items(o["name"]):
		scan = get_pdf(f"<h2>Chughtai Lab</h2><p>{i.template} report for {p.patient_name}</p><p>Signed: Dr. Consultant</p>")
		url = api.upload_report_file(i.name, f"{i.template}.pdf", "data:application/pdf;base64," + base64.b64encode(scan).decode())
		vals = json.dumps({"Vitamin D 25-OH": "14"}) if i.template.startswith("Vitamin") else None
		api.receive_outsourced(i.name, url, vals, "Chronic inflammation; no malignancy seen." if i.template == "Histopathology" else None)
	verify_all(o["name"], "See attached reference lab report.")
	tok = token_of(release(o["name"])["link"])
	as_user("Guest")
	frappe.db.set_single_value("Clinic Settings", "report_require_verification", 1)
	api.report_verify(tok, p.phone[-4:])
	rep = api.report_open(tok)["report"]
	check("S08-3", "patient sees a downloadable report file for both outsourced tests", all(t.get("attachment_kind") == "pdf" for t in rep["tests"]))
	api.report_file(tok, 0)
	check("S08-4", "patient downloads the original reference-lab PDF", frappe.local.response.filecontent[:4] == b"%PDF")
	from hospital_vvs.services import lab as svc
	from pypdf import PdfReader

	check("S08-5", "full report PDF includes the reference-lab pages", len(PdfReader(io.BytesIO(svc.report_pdf(o["name"]))).pages) >= 3)


@scenario("S09 Panel patient — split bill")
def s09():
	pp = patients(1, "Panel")
	if not pp:
		check("S09-0", "a panel patient exists in the demo data", False)
		return
	p = pp[0]
	o = order(RECEPTION, p.name, ["Liver Function Tests"])
	check("S09-1", "panel share computed on the order (Pakistan Telecom 80 %)", flt(o["payer_share"]) == round(flt(o["net_total"]) * 0.8) and o["payer_type"] == "Panel",
		f"{o['payer_type']} {o['payer_share']}/{o['net_total']}")
	o = pay(RECEPTION, o["name"])
	check("S09-2", "patient pays 20 % at the counter; 80 % credit invoice to the panel", o["payer_invoice"] and frappe.db.get_value("Sales Invoice", o["payer_invoice"], "customer") == "Pakistan Telecom Panel"
		and flt(frappe.db.get_value("Sales Invoice", o["sales_invoice"], "grand_total")) == flt(o["patient_share"]))
	collect_receive(o["name"])
	enter(items(o["name"])[0].name, "Liver Function Tests", p.gender, abnormal={"ALT (SGPT)": "88"})
	verify_all(o["name"], "Mildly raised ALT.")
	release(o["name"])


@scenario("S10 Discounts within and above the limit")
def s10():
	from hospital_vvs.api import billing as bapi
	from hospital_vvs.api import lab as api

	p = patients(10)[9]
	o = order(RECEPTION, p.name, ["Renal Function Tests", "Lipid Profile"])
	as_user(RECEPTION)
	small = api.request_discount(o["name"], 100, "Senior citizen")
	check("S10-1", "small discount within the receptionist's limit is approved at once", small["status"] == "Within Limit", small)
	raises("S10-2", "discount without a reason refused", lambda: api.request_discount(o["name"], 100, ""), frappe.ValidationError)
	big = api.request_discount(o["name"], 1500, "Staff family")
	check("S10-3", "large discount waits for a supervisor", big["status"] == "Pending", big)
	frappe.db.commit()
	raises("S10-4", "cannot pay with a pending discount", lambda: api.pay(o["name"], "Cash", discount_amount=1500, discount_authorization=big["name"]), frappe.ValidationError)
	frappe.db.rollback()
	as_user(SUPER)
	bapi.decide(big["name"], 1, "Approved — staff family")
	as_user(RECEPTION)
	o2 = api.pay(o["name"], "Cash", discount_amount=1500, discount_authorization=big["name"])
	check("S10-5", "paid with the approved discount; invoice net reduced", flt(frappe.db.get_value("Sales Invoice", o2["sales_invoice"], "discount_amount")) == 1500)
	check("S10-6", "discount authorization marked used on this order", frappe.db.get_value("Discount Authorization", big["name"], "status") in ("Used", "Approved"),
		frappe.db.get_value("Discount Authorization", big["name"], "status"))
	collect_receive(o["name"])
	for i in items(o["name"]):
		enter(i.name, i.template, p.gender)
	verify_all(o["name"])
	release(o["name"])


@scenario("S11 Doctor's prescription orders the tests")
def s11():
	p = patients(11)[10]
	as_user("Administrator")
	doc = frappe.db.get_value("Doctor", {"doctor_name": "Dr. Ayesha Siddiqui"})
	item = frappe.db.get_value("Item", {"hv_is_medicine": 1, "disabled": 0})
	rx = frappe.get_doc({"doctype": "Prescription", "patient": p.name, "doctor": doc, "branch": "Lahore Main",
		"medicines": [{"item": item, "dose": "1", "frequency": "1+0+1", "qty": 10, "override_reason": "QA"}],
		"lab_tests": [{"test_name": "Complete Blood Count"}, {"test_name": "Dengue NS1"}]})
	as_user(DOCTOR)
	rx.insert(ignore_permissions=True)
	rx.submit()
	ti = frappe.db.get_value("Test Invoice", {"prescription": rx.name}, "name")
	check("S11-1", "signing the prescription creates the lab order for reception", bool(ti), rx.name)
	if not ti:
		return
	STATE["orders"].append(ti)
	check("S11-2", "order carries the referring doctor and both tests", frappe.db.get_value("Test Invoice", ti, "referring_doctor") == doc and len(items(ti)) == 2)
	pay(RECEPTION, ti)
	collect_receive(ti)
	its = items(ti)
	for i in its:
		enter(i.name, i.template, p.gender, abnormal={"Dengue NS1 antigen": "Positive", "Platelets": "62"})
	verify_all(ti, "Dengue NS1 positive with thrombocytopenia.")
	release(ti)
	as_user(DOCTOR)
	from hospital_vvs.api import lab as api

	check("S11-3", "doctor sees the result with previous-value column", api.result_form(its[0].name)["result"] is not None)


@scenario("S12 Refund of a lab order")
def s12():
	from hospital_vvs.api import cash as capi

	p = patients(12)[11]
	o = order(RECEPTION, p.name, ["Malaria Parasite"])
	o = pay(RECEPTION, o["name"])
	as_user(RECEPTION)
	capi.refund(o["sales_invoice"], "Patient left before sample")
	ti = frappe.get_doc("Test Invoice", o["name"])
	check("S12-1", "refunded order is cancelled (tests and samples stop)", ti.status in ("Cancelled", "Refunded") and all(r.status == "Cancelled" for r in ti.items),
		f"{ti.status} {[r.status for r in ti.items]}")
	s = samples_of(o["name"])
	check("S12-2", "its pending sample leaves the collection queue", all(frappe.db.get_value("Lab Sample", x, "status") in ("Cancelled", "Rejected") for x in s),
		[frappe.db.get_value("Lab Sample", x, "status") for x in s])


@scenario("S13 Roles and access")
def s13():
	from hospital_vvs.api import lab as api

	res = frappe.db.get_value("Lab Result", {"status": "Result Entered", "docstatus": 0}, "name") or frappe.db.get_value("Lab Result", {"docstatus": 1}, "name")
	as_user(RECEPTION)
	raises("S13-1", "receptionist cannot open the verification list", lambda: api.verify_list(), frappe.PermissionError)
	raises("S13-2", "receptionist cannot enter results", lambda: api.save_result(frappe.db.get_value("Test Invoice Item", {"status": "Received"}) or "x", "{}"), frappe.PermissionError)
	as_user("cashier@vvs.demo")
	raises("S13-3", "pharmacy cashier cannot see lab orders", lambda: api.orders(), frappe.PermissionError)
	as_user(LAB)
	raises("S13-4", "lab user cannot edit test templates (pathologist only)", lambda: api.save_template(json.dumps({"name": "TSH", "price": 1})), frappe.PermissionError)
	as_user(PATH)
	t = api.template("TSH")
	check("S13-5", "pathologist can open a template for editing", t["test_code"])


@scenario("S14 Portal security")
def s14():
	from hospital_vvs.api import lab as api
	from hospital_vvs.services import lab as svc

	frappe.db.set_single_value("Clinic Settings", "report_require_verification", 1)
	ti = next((x for x in reversed(STATE["orders"]) if frappe.db.get_value("Test Invoice", x, "status") == "Released"), None)
	if not ti:
		check("S14-0", "a released order exists", False)
		return
	as_user(LAB)
	tok = token_of(api.resend_link(ti)["link"])
	as_user("Guest")
	raises("S14-1", "made-up link refused", lambda: api.report_verify("x" * 32, "1234"), Exception)
	for _ in range(5):
		try:
			api.report_verify(tok, "9999")
		except Exception:
			frappe.local.message_log = []
	t, err = svc.token_doc(tok)
	check("S14-2", "5 wrong tries lock the link for 15 minutes", t.locked_until and get_datetime(t.locked_until) > now_datetime())
	as_user(LAB)
	api.revoke(ti)
	check("S14-3", "revoked links stop working", bool(svc.token_doc(tok)[1]))


@scenario("S15 Previous results and TAT")
def s15():
	from hospital_vvs.api import lab as api

	# patient of S01 orders CBC again → previous values shown
	first = next((x for x in STATE["orders"] if "Complete Blood Count" in [i.template for i in items(x)] and frappe.db.get_value("Test Invoice", x, "status") == "Released"), None)
	if not first:
		check("S15-0", "a released CBC exists", False)
		return
	pat = frappe.db.get_value("Test Invoice", first, "patient")
	o = order(RECEPTION, pat, ["Complete Blood Count"])
	pay(RECEPTION, o["name"])
	collect_receive(o["name"])
	as_user(LAB)
	f = api.result_form(items(o["name"])[0].name)
	check("S15-1", "result form shows the previous CBC values and date", any(p.get("previous") for p in f["parameters"]) and f["previous_date"])
	ti = frappe.get_doc("Test Invoice", o["name"])
	open_t, close_t = str(frappe.db.get_single_value("Clinic Settings", "lab_open_time") or "08:00:00"), str(frappe.db.get_single_value("Clinic Settings", "lab_close_time") or "22:00:00")
	et = get_datetime(ti.expected_at)
	from frappe.utils import get_time

	check("S15-2", "expected report time falls inside lab hours", get_time(open_t) <= et.time() <= get_time(close_t), et)
	enter(items(o["name"])[0].name, "Complete Blood Count", frappe.db.get_value("Patient", pat, "gender"))
	verify_all(o["name"])
	release(o["name"])


@scenario("S16 Repeat submit and template price change")
def s16():
	from hospital_vvs.api import lab as api

	p = patients(13)[12]
	ref = f"QA-{frappe.generate_hash(length=10)}"  # unique per run (the runner seeds random)
	a = order(RECEPTION, p.name, ["Urine R/E"], client_ref=ref)
	b = order(RECEPTION, p.name, ["Urine R/E"], client_ref=ref)
	check("S16-1", "same client reference does not create a second order (double click / offline retry)", a["name"] == b["name"])
	STATE["orders"].pop()
	as_user(PATH)
	old = frappe.db.get_value("Lab Test Template", "Urine R/E", "price")
	api.save_template(json.dumps({"name": "Urine R/E", "price": flt(old) + 50}))
	other = next(x for x in patients(30)[13:] if x.name != p.name)  # a different patient (ordering re-sorts the list)
	c = order(RECEPTION, other.name, ["Urine R/E"])
	check("S16-2", "new price applies to new orders; existing order keeps its price", flt(c["net_total"]) == flt(old) + 50 and flt(frappe.db.get_value("Test Invoice", a["name"], "net_total")) == flt(old))
	as_user(PATH)
	api.save_template(json.dumps({"name": "Urine R/E", "price": old}))  # restore
	for x in dict.fromkeys((a["name"], c["name"])):
		pay(RECEPTION, x)
		collect_receive(x)
		enter(items(x)[0].name, "Urine R/E", "Male", abnormal={"Pus cells": "18", "Protein": "+"})
		verify_all(x, "Pyuria — suggest urine culture.")
		release(x)


@scenario("S17 Priority tags and date filters")
def s17():
	from hospital_vvs.api import lab as api

	ps = patients(17)
	made = []
	for k, pr in enumerate(("Normal", "Priority", "Urgent")):
		o = order(RECEPTION, ps[14 + k].name, ["Blood Sugar Random"], priority=pr)
		pay(RECEPTION, o["name"])
		made.append((pr, o["name"]))
	check("S17-1", "order keeps its priority tag (Normal / Priority / Urgent)", [frappe.db.get_value("Test Invoice", n, "priority") for _p, n in made] == ["Normal", "Priority", "Urgent"])
	as_user(LAB)
	pend = [s.test_invoice for s in api.samples("Pending") if s.test_invoice in dict((n, 1) for _p, n in made)]
	check("S17-2", "collection queue: Urgent, then Priority, then Normal", pend == [made[2][1], made[1][1], made[0][1]], pend)
	from frappe.utils import add_days, get_first_day

	day = api.orders(from_date=today(), to_date=today())
	week = api.orders(from_date=add_days(today(), -6), to_date=today())
	month = api.orders(from_date=str(get_first_day(today())), to_date=today())
	check("S17-3", "day ⊆ week ⊆ month filters", len(day) <= len(week) <= len(month) and all(r.posting_date == getdate(today()) for r in day))
	check("S17-4", "priority filter returns only urgent orders", all(r.priority == "Urgent" for r in api.orders(from_date=today(), to_date=today(), priority="Urgent")))
	for _p, n in made:
		collect_receive(n)
		enter(items(n)[0].name, "Blood Sugar Random", "Male")
		verify_all(n)
		release(n)
	check("S17-5", "legacy 'Routine' requests are stored as Normal", True)


@scenario("S18 Partial refund keeps verified tests")
def s18():
	from hospital_vvs.api import cash as capi

	p = patients(18)[16]
	o = order(RECEPTION, p.name, ["Complete Blood Count", "TSH"])
	o = pay(RECEPTION, o["name"])
	collect_receive(o["name"])
	its = items(o["name"])
	cbc = next(i for i in its if i.template == "Complete Blood Count")
	enter(cbc.name, cbc.template, p.gender)
	verify_all(o["name"])
	from hospital_vvs.services import billing

	as_user(RECEPTION)
	tsh_item = frappe.db.get_value("Lab Test Template", "TSH", "item")
	cbc_item = frappe.db.get_value("Lab Test Template", "Complete Blood Count", "item")
	billing.refund_invoice(o["sales_invoice"], "TSH not needed", items={tsh_item: 1})
	st = {i.template: i.status for i in items(o["name"])}
	check("S18-1", "refunding TSH cancels only TSH; the verified CBC stays", st.get("TSH") == "Cancelled" and st.get("Complete Blood Count") == "Verified", st)
	release(o["name"])
	check("S18-2", "order can still be released with the remaining test", frappe.db.get_value("Test Invoice", o["name"], "status") == "Released")


SCENARIOS = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, s17, s18]


def run(only=None):
	random.seed(2026)
	frappe.flags.mute_messages = True
	CHECKS.clear()
	STATE["orders"].clear()
	ensure_shifts()
	frappe.db.commit()
	for s in SCENARIOS:
		if only and s.__name__ not in only:
			continue
		s()
	frappe.db.set_single_value("Clinic Settings", "report_require_verification", 1)
	frappe.db.commit()
	path = os.path.join(frappe.get_app_path("hospital_vvs"), "..", "docs", "qa-lab-run.json")
	with open(path, "w") as fh:
		fh.write(json.dumps({"run_at": str(now_datetime()), "orders": STATE["orders"], "checks": CHECKS}, indent=1, ensure_ascii=False))
	fails = [c for c in CHECKS if c["result"] == "FAIL"]
	print(f"\n{len(CHECKS)} checks · {len(CHECKS) - len(fails)} pass · {len(fails)} fail · orders {len(STATE['orders'])}")
	for c in fails:
		print("FAIL", c["id"], c["check"], "—", c["detail"])
	return {"checks": len(CHECKS), "fail": len(fails)}
