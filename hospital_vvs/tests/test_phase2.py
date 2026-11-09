"""Phase 2 acceptance tests (12-workflows.md: W1 full, W3, W6a, W6b, W6c, W7, W14). Needs both demo seeders."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, add_months, flt, getdate, today

from hospital_vvs import roles as R
from hospital_vvs.services import lab, pharmacy, shifts
from hospital_vvs.setup.company import ABBR

# contract pharmacy (D-38): medicine stock lives in the contractor's company
RETAIL = "Pharmacy Retail LHR - VVSP"
MAIN = "Pharmacy Store LHR - VVSP"
QUAR = "Pharmacy Quarantine LHR - VVSP"
DIST = "Muller & Phipps Pakistan"


def as_user(user):
	frappe.set_user(user)


def retire_stale_shift(user):
	"""A demo shift left open on an earlier day (or stuck in closing) would block billing today. Tests roll back, so it is simply
	marked closed for the duration of the test."""
	s = shifts.current_shift(user)
	if s and (str(s.posting_date) != today() or shifts.pending_closing(s.name)):
		frappe.db.set_value("POS Opening Entry", s.name, "status", "Closed")
		if s.hv_counter:
			frappe.db.set_value("Counter", s.hv_counter, {"open_shift": None, "current_user": None})
		return None
	return s


def shift_for(user, counter, float_=0):
	as_user(user)
	s = retire_stale_shift(user)
	if s:
		return s
	# the counter might be held by someone in the demo data: use a free counter of the same type
	c = frappe.get_doc("Counter", counter)
	if c.open_shift and c.current_user:
		retire_stale_shift(c.current_user)
		c.reload()
	if c.open_shift and frappe.db.get_value("POS Opening Entry", c.open_shift, "status") == "Open":
		free = frappe.get_all("Counter", filters={"counter_type": c.counter_type, "branch": c.branch, "open_shift": ["is", "not set"]}, pluck="name")
		if not free:
			frappe.throw(f"no free {c.counter_type} counter for tests")
		counter = free[0]
	return shifts.open_shift(counter, {"Cash": float_})


def test_item(code="TEST-AMOX-500", rx=1, controlled=0):
	if not frappe.db.exists("Generic Name", "Amoxicillin"):
		frappe.get_doc({"doctype": "Generic Name", "generic_name": "Amoxicillin"}).insert()
	if not frappe.db.exists("Item", code):
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": code.title(), "item_group": "Medicines", "stock_uom": "Nos", "is_stock_item": 1,
			"hv_is_medicine": 1, "hv_generic": "Amoxicillin", "hv_strength": "500 mg", "hv_dosage_form": "Capsule", "hv_units_per_strip": 10, "hv_strips_per_pack": 3,
			"hv_allow_loose_sale": 1, "hv_allow_strip_sale": 1, "hv_prescription_required": rx, "hv_controlled_drug": controlled, "has_batch_no": 1,
			"has_expiry_date": 1, "create_new_batch": 0, "hv_rack_location": "Z9-99"}).insert()
	return code


def receive(code, warehouse=RETAIL, near_months=6):
	as_user("Administrator")
	tag = frappe.generate_hash(length=4).upper()
	a, b = f"{code[-6:]}-A{tag}", f"{code[-6:]}-B{tag}"
	pharmacy.receive_stock(DIST, warehouse, [
		{"item_code": code, "batch_no": a, "expiry": add_months(today(), near_months), "mrp_per_pack": 300, "rate_per_pack": 220, "packs": 10},
		{"item_code": code, "batch_no": b, "expiry": add_months(today(), 24), "mrp_per_pack": 330, "rate_per_pack": 240, "packs": 10}], branch="Lahore Main")
	return a, b


def a_patient():
	return frappe.get_all("Patient", filters={"branch": "Lahore Main", "disabled": 0, "temporary_record": 0, "phone": ["is", "set"]}, pluck="name",
		limit=1)[0]


def signed_rx(patient, item, qty=30, lab_tests=()):
	as_user("Administrator")
	doc = frappe.db.get_value("Doctor", {"doctor_name": "Dr. Ayesha Siddiqui"})
	rx = frappe.get_doc({"doctype": "Prescription", "patient": patient, "doctor": doc, "branch": "Lahore Main",
		"medicines": [{"item": item, "dose": "1", "frequency": "1+0+1", "qty": qty, "override_reason": "test"}], "lab_tests": [{"test_name": t} for t in lab_tests]})
	rx.insert()
	rx.submit()
	return rx


class TestPharmacy(IntegrationTestCase):
	def setUp(self):
		frappe.db.set_single_value("Clinic Settings", {"collect_payment_at": "Billing counter", "enable_pharmacy_pipeline": 1, "near_expiry_days": 90})
		frappe.clear_document_cache("Clinic Settings")

	def test_w6a_packs_fefo_expiry_rx_return(self):
		code = test_item()
		a, b = receive(code)
		self.assertEqual(pharmacy.stock_units(code, RETAIL), 600)
		pat = a_patient()
		rx = signed_rx(pat, code)
		shift_for("cashier@vvs.demo", "Pharmacy 1")
		lines = [{"item_code": code, "uom": "Pack", "qty": 1}, {"item_code": code, "uom": "Strip", "qty": 2}, {"item_code": code, "uom": "Nos", "qty": 5}]
		q = pharmacy.quote(lines, RETAIL, rx.name)
		self.assertFalse(q["errors"])
		self.assertTrue(all(l["batch_no"] == a for l in q["lines"]))  # FEFO: the batch expiring first
		self.assertEqual(sum(l["stock_qty"] for l in q["lines"]), 55)
		self.assertEqual([l["rate"] for l in q["lines"]], [300, 100, 10])  # pack MRP, ÷3 strips, ÷30 units
		with self.assertRaises(frappe.ValidationError):  # prescription-required item without a prescription
			pharmacy.checkout("Pharmacy 1", lines)
		r = pharmacy.checkout("Pharmacy 1", lines, patient=pat, prescription=rx.name, payment_mode="Cash", cash_tendered=1000)
		self.assertEqual(flt(r["grand_total"]), 550)
		self.assertEqual(pharmacy.stock_units(code, RETAIL), 545)
		self.assertTrue(r["token"].startswith("P-"))
		# expired batch is never sold
		frappe.db.set_value("Batch", a, "expiry_date", add_days(today(), -1))
		q2 = pharmacy.quote([{"item_code": code, "uom": "Pack", "qty": 1}], RETAIL, rx.name)
		self.assertTrue(all(l["batch_no"] == b for l in q2["lines"]))
		frappe.db.set_value("Batch", a, "expiry_date", add_months(today(), 2))
		q3 = pharmacy.quote([{"item_code": code, "uom": "Pack", "qty": 1}], RETAIL, rx.name)
		self.assertTrue(q3["warnings"])  # near-expiry warning
		# return restores the same batch
		from hospital_vvs.services import billing

		before = {x["batch_no"]: x["qty"] for x in pharmacy.batches(code, RETAIL)}
		billing.refund_invoice(r["name"], "patient returned")
		after = {x["batch_no"]: x["qty"] for x in pharmacy.batches(code, RETAIL)}
		self.assertEqual(after[a] - before[a], 55)
		as_user("Administrator")

	def test_w6b_pipeline_race_wrong_batch(self):
		code = test_item("TEST-PARA-500", rx=0)
		a, b = receive(code)
		shift_for("cashier@vvs.demo", "Pharmacy 1")
		r = pharmacy.checkout("Pharmacy 1", [{"item_code": code, "uom": "Strip", "qty": 1}])
		t = r["ticket"]
		as_user("finder@vvs.demo")
		pharmacy.start_pick(t)
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):  # second finder cannot take the same ticket
			pharmacy.start_pick(t)
		as_user("finder@vvs.demo")
		with self.assertRaises(frappe.ValidationError):  # wrong batch
			pharmacy.scan(t, b)
		pharmacy.scan(t, a)
		pharmacy.complete_pick(t)
		as_user("pharmacist@vvs.demo")
		pharmacy.start_review(t)
		pharmacy.approve(t)
		as_user("dispenser@vvs.demo")
		pharmacy.call(t, "Handover 3")
		self.assertEqual(pharmacy.queue_state("Lahore Main")["ready"][0]["token"], r["token"])
		pharmacy.handover(t, r["token"])
		self.assertEqual(frappe.db.get_value("Dispense Ticket", t, "status"), "Handed Over")
		as_user("Administrator")

	def test_w6c_pay_at_handover(self):
		frappe.db.set_single_value("Clinic Settings", "collect_payment_at", "Handover counter")
		frappe.clear_document_cache("Clinic Settings")
		code = test_item("TEST-CETI-10", rx=0)
		receive(code)
		as_user("cashier@vvs.demo")
		r = pharmacy.checkout("Pharmacy 1", [{"item_code": code, "uom": "Nos", "qty": 300}, {"item_code": code, "uom": "Strip", "qty": 30}])  # all 600 units
		self.assertEqual(r["docstatus"], 0)
		self.assertEqual(frappe.db.count("Stock Ledger Entry", {"voucher_no": r["name"]}), 0)  # nothing moved yet
		self.assertTrue(pharmacy.quote([{"item_code": code, "uom": "Nos", "qty": 1}], RETAIL)["errors"])  # the draft holds all the stock
		t = r["ticket"]
		as_user("finder@vvs.demo")
		pharmacy.start_pick(t)
		tk = frappe.get_doc("Dispense Ticket", t)
		for line in tk.items:
			pharmacy.scan(t, line.batch_no, line=line.name)
		pharmacy.complete_pick(t)
		as_user("pharmacist@vvs.demo")
		pharmacy.approve(t)
		shift_for("dispenser@vvs.demo", "Handover 3")
		pharmacy.call(t, "Handover 3")
		with self.assertRaises(frappe.ValidationError):
			pharmacy.handover(t)
		paid = pharmacy.collect_payment(t, "Cash", cash_tendered=flt(r["grand_total"]) + 130)
		self.assertEqual(paid["change"], 130)
		self.assertTrue(frappe.db.count("Stock Ledger Entry", {"voucher_no": r["name"]}) > 0)
		pharmacy.handover(t)
		as_user("Administrator")

	def test_controlled_drug_register(self):
		code = test_item("TEST-TRAM-50", rx=1, controlled=1)
		receive(code)
		pat = a_patient()
		rx = signed_rx(pat, code, qty=10)
		shift_for("cashier@vvs.demo", "Pharmacy 1")
		r = pharmacy.checkout("Pharmacy 1", [{"item_code": code, "uom": "Nos", "qty": 10}], patient=pat, prescription=rx.name)
		row = frappe.get_all("Controlled Drug Register", filters={"sales_invoice": r["name"]}, fields=["qty", "balance", "prescriber"])
		self.assertEqual(row[0].qty, 10)
		self.assertEqual(row[0].balance, 590)
		as_user("Administrator")


class TestStore(IntegrationTestCase):
	def test_w14_transfer_count_quarantine_return(self):
		from hospital_vvs.api import store

		code = test_item("TEST-ORS-01", rx=0)
		a, b = receive(code, warehouse=MAIN)
		as_user("store@vvs.demo")
		mr = store.create_request(RETAIL, [{"item_code": code, "qty": 60}], source=MAIN)
		se = store.transfer(mr)
		self.assertEqual(frappe.db.get_value("Stock Entry Detail", {"parent": se}, "batch_no"), a)  # FEFO from the store
		cc = pharmacy.cycle_count_create(RETAIL, "Lahore Main", "Rack", rack="Z9-99")
		counts = {r.name: (r.system_qty - 25 if r.item_code == code else r.system_qty) for r in cc.items}
		cc = pharmacy.cycle_count_submit(cc.name, counts)
		frappe.db.set_single_value("Clinic Settings", "cycle_variance_threshold", 0)
		frappe.clear_document_cache("Clinic Settings")
		cc2 = pharmacy.cycle_count_create(RETAIL, "Lahore Main", "Rack", rack="Z9-99")
		cc2 = pharmacy.cycle_count_submit(cc2.name, {r.name: r.system_qty - 1 for r in cc2.items})
		self.assertEqual(cc2.status, "Pending Approval")
		as_user("admin@vvs.demo")
		cc2 = pharmacy.cycle_count_approve(cc2.name, True)
		self.assertTrue(cc2.stock_reconciliation)
		as_user("Administrator")
		frappe.db.set_value("Batch", a, "expiry_date", add_days(today(), -2))
		moved = pharmacy.quarantine_expired([MAIN, RETAIL], QUAR)
		self.assertTrue(moved)
		self.assertTrue(pharmacy.batches(code, QUAR, include_expired=True))
		as_user("store@vvs.demo")
		ret = pharmacy.supplier_return(b, 30, MAIN, "damaged cartons")
		self.assertEqual(frappe.db.get_value("Purchase Receipt", ret, "is_return"), 1)
		as_user("Administrator")


class TestLab(IntegrationTestCase):
	def setUp(self):
		patcher = patch.object(frappe.db, "commit", lambda *a, **k: None)  # wrong-answer path commits; keep test data out
		patcher.start()
		self.addCleanup(patcher.stop)
		frappe.db.set_single_value("Clinic Settings", {"quiet_hours_start": None, "quiet_hours_end": None, "lab_auto_verify": 0, "report_require_verification": 1,
			"report_verification_method": "Last 4 digits of phone"})
		frappe.clear_document_cache("Clinic Settings")

	def test_w3_flow(self):
		pat = frappe.get_doc("Patient", a_patient())
		shift_for("lab@vvs.demo", "Lab Counter")
		ti = lab.create_order(pat.name, ["Complete Blood Count", "Renal Function Tests"], "Lahore Main")
		lab.pay(ti.name, "Cash")
		ti.reload()
		self.assertEqual(ti.status, "Paid")
		self.assertTrue(frappe.db.exists("Message Log", {"reference_name": ti.name, "event": "lab_thank_you"}))
		samples = frappe.get_all("Lab Sample", filters={"test_invoice": ti.name}, pluck="name")
		self.assertEqual(len(samples), 2)  # EDTA + serum
		for s in samples:
			lab.collect(s)
		rej = samples[1]
		new = lab.reject(rej, "Hemolysed")
		lab.collect(new.name)
		lab.receive(new.name)
		lab.receive(samples[0])
		ti.reload()
		cbc = next(r for r in ti.items if r.template == "Complete Blood Count")
		rft = next(r for r in ti.items if r.template == "Renal Function Tests")
		res = lab.enter_results(cbc.name, {"Hemoglobin": "6.1", "WBC": "7", "Platelets": "250"})
		self.assertTrue(res.has_critical)
		self.assertEqual(next(v.flag for v in res.get("values") if v.parameter == "Hemoglobin"), "Critical Low")
		as_user("pathologist@vvs.demo")
		with self.assertRaises(frappe.ValidationError):  # critical value not logged yet
			lab.verify(res.name)
		as_user("lab@vvs.demo")
		lab.log_critical(res.name, "Dr. Ayesha (phone)", "Phone", 1)
		r2 = lab.enter_results(rft.name, {"Urea": "30", "Creatinine": "1.0", "Sodium": "140", "Potassium": "4.2"})
		as_user("pathologist@vvs.demo")
		lab.verify(res.name, "Severe anaemia — clinical correlation")
		lab.verify(r2.name)
		as_user("lab@vvs.demo")
		out = lab.release(ti.name)
		self.assertEqual(out["status"], "Released")
		self.assertTrue(frappe.db.exists("Message Log", {"reference_name": ti.name, "event": "lab_report_ready"}))
		token = out["link"].rsplit("/", 1)[1]
		t, err = lab.token_doc(token)
		self.assertIsNone(err)
		with self.assertRaises(frappe.ValidationError):
			lab.check_answer(t, "0000")
		t.reload()
		self.assertTrue(lab.check_answer(t, (pat.phone or "")[-4:]))
		data = lab.report_data(ti.name)
		self.assertEqual(len([x for x in data["tests"] if not x["pending"]]), 2)
		# amend a verified result: old link revoked, update message sent
		as_user("pathologist@vvs.demo")
		new_res = lab.amend(r2.name, "Potassium re-run")
		as_user("lab@vvs.demo")
		lab.enter_results(rft.name, {"Urea": "30", "Creatinine": "1.0", "Sodium": "140", "Potassium": "4.8"})
		as_user("pathologist@vvs.demo")
		lab.verify(new_res.name)
		self.assertTrue(lab.token_doc(token)[1])  # old link no longer works
		self.assertTrue(frappe.db.exists("Message Log", {"reference_name": ti.name, "event": "lab_report_updated"}))
		self.assertEqual(frappe.db.get_value("Lab Result", r2.name, "status"), "Superseded")
		as_user("Administrator")

	def test_outsourced(self):
		pat = a_patient()
		shift_for("lab@vvs.demo", "Lab Counter")
		ti = lab.create_order(pat, ["Vitamin D (25-OH)"], "Lahore Main")
		lab.pay(ti.name, "Cash")
		s = frappe.get_all("Lab Sample", filters={"test_invoice": ti.name}, pluck="name")[0]
		lab.collect(s)
		od = lab.dispatch([s], "Chughtai Reference Lab", "TCS")
		self.assertTrue(od.purchase_invoice)
		item = frappe.get_all("Test Invoice Item", filters={"parent": ti.name}, pluck="name")[0]
		res = lab.receive_outsourced(item, values={"Vitamin D 25-OH": "18"}, attachment="/files/vitd.pdf")
		self.assertEqual(next(v.flag for v in res.get("values")), "Low")
		as_user("pathologist@vvs.demo")
		lab.verify(res.name)
		as_user("lab@vvs.demo")
		self.assertEqual(lab.release(ti.name)["status"], "Released")
		as_user("Administrator")


class TestCash(IntegrationTestCase):
	def test_w7_short_needs_supervisor_and_excess_auto(self):
		from hospital_vvs.services import billing

		as_user("reception2@vvs.demo")
		sh = shifts.open_shift("Reception 2", {"Cash": 5000})
		pat = frappe.get_all("Patient", filters={"branch": "Lahore Main"}, pluck="name", limit=5)
		cust = frappe.db.get_value("Patient", pat[0], "customer")
		billing.create_invoice(customer=cust, patient=pat[0], lines=[{"item_code": "PROC-ECG", "qty": 35, "rate": 1200}], billing_type="General",
			branch="Lahore Main", reference_doctype="Patient", reference_name=pat[0], payment_mode="Cash")
		billing.create_invoice(customer=cust, patient=pat[1], lines=[{"item_code": "PROC-ECG", "qty": 1, "rate": 8000}], billing_type="General",
			branch="Lahore Main", reference_doctype="Patient", reference_name=pat[1], payment_mode="Card")
		r = billing.create_invoice(customer=cust, patient=pat[2], lines=[{"item_code": "PROC-DRESSING", "qty": 1, "rate": 500}], billing_type="General",
			branch="Lahore Main", reference_doctype="Patient", reference_name=pat[2], payment_mode="Cash")
		billing.refund_invoice(r, "wrong patient")
		shifts.add_movement("Pay Out", 1200, "printer paper")
		d = shifts.add_movement("Cash Drop", 30000, "to safe")
		as_user("supervisor@vvs.demo")
		shifts.confirm_drop(d.name)
		as_user("reception2@vvs.demo")
		expected = next(m["expected"] for m in shifts.summary(sh.name)["modes"] if m["mode_of_payment"] == "Cash")
		self.assertEqual(expected, 5000 + 42000 + 500 - 500 - 1200 - 30000)  # = 15,800 (the 500 sale was refunded)
		sc = shifts.close_shift({"5000": 3, "500": 1}, {"Card": 8000})  # counted 15,500 → short 300
		self.assertEqual(sc.status, "Pending Approval")
		with self.assertRaises(frappe.ValidationError):
			billing.create_invoice(customer=cust, patient=pat[0], lines=[{"item_code": "PROC-ECG", "qty": 1, "rate": 10}], billing_type="General",
				branch="Lahore Main", reference_doctype="Patient", reference_name=pat[3], payment_mode="Cash")
		as_user("supervisor@vvs.demo")
		sc = shifts.decide(sc.name, "approve", "counted twice")
		self.assertEqual(sc.status, "Approved")
		self.assertEqual(frappe.db.get_value("Journal Entry Account", {"parent": sc.journal_entry, "debit": [">", 0]}, "account"), f"Cash Short - {ABBR}")
		pce = frappe.get_doc("POS Closing Entry", sc.pos_closing_entry)
		cash = next(x for x in pce.payment_reconciliation if x.mode_of_payment == "Cash")
		self.assertEqual((cash.expected_amount, cash.closing_amount), (15800, 15500))
		self.assertEqual(frappe.db.get_value("POS Opening Entry", sh.name, "status"), "Closed")
		# second shift: excess 30 within tolerance closes by itself
		as_user("reception2@vvs.demo")
		sh2 = shifts.open_shift("Reception 2", {"Cash": 1000})
		sc2 = shifts.close_shift({"1000": 1, "10": 3})
		self.assertEqual(sc2.status, "Within Tolerance")
		self.assertTrue(sc2.pos_closing_entry)
		as_user("Administrator")


class TestW1Full(IntegrationTestCase):
	def test_prescription_creates_lab_order_and_draft_medicine_invoice(self):
		pat = a_patient()
		rx = signed_rx(pat, "PANADOL-500MG", qty=20, lab_tests=("CBC", "Lipid profile"))
		ti = frappe.get_all("Test Invoice", filters={"prescription": rx.name}, fields=["name", "status"])
		self.assertEqual(ti[0].status, "Ordered")
		self.assertEqual(frappe.db.count("Test Invoice Item", {"parent": ti[0].name}), 2)
		self.assertTrue(frappe.db.exists("Sales Invoice", {"hv_prescription": rx.name, "docstatus": 0}))
		lines = pharmacy.prescription_lines(rx.name)["lines"]
		self.assertEqual((lines[0]["uom"], lines[0]["qty"]), ("Strip", 2))


class TestDisplays(IntegrationTestCase):
	def test_display_keeps_session(self):
		"""Opening a public display from a signed-in browser must not replace the session id."""
		from hospital_vvs.api.pharmacy import display

		key = frappe.db.get_value("Display Device", {"device_type": "Ward Display", "is_active": 1}, "device_key")
		if not key:
			self.skipTest("no ward display")
		frappe.local.session.sid = "test-sid-123"
		frappe.local.form_dict = frappe._dict(key=key)
		out = display(key)
		self.assertIn("ward", out)
		self.assertEqual(frappe.local.session.sid, "test-sid-123")
		self.assertEqual(frappe.local.form_dict.get("key"), key)
		for b in out["ward"]["beds"]:
			self.assertNotIn("current_patient", b)
