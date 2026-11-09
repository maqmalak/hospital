"""Pharmacy QA / acceptance (contract pharmacy, pay at handover): cart → pick by rack → pharmacist review → handover with billing.

Every step runs as the real demo user through the whitelisted API (role checks included):
cashier@ (Pharmacy 1) · finder@ · pharmacist@ (PW Reviewer) · dispenser@ (Handover 3, cashier shift).
"""

import random
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_months, flt, today

from hospital_vvs.api import pharmacy as api
from hospital_vvs.services import pharmacy, shifts
from hospital_vvs.tests.test_phase2 import as_user, retire_stale_shift

RETAIL = "Pharmacy Retail LHR - VVSP"
CASHIER, FINDER, PHARMACIST, DISPENSER = "cashier@vvs.demo", "finder@vvs.demo", "pharmacist@vvs.demo", "dispenser@vvs.demo"
VVSP = "VVS Pharmacy (Contract)"


def make_item(code, generic="QA Paracetamol", rx=0, controlled=0, rack="A1-01", strength="500 mg"):
	if not frappe.db.exists("Generic Name", generic):
		frappe.get_doc({"doctype": "Generic Name", "generic_name": generic}).insert()
	if not frappe.db.exists("Item", code):
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": code.replace("-", " ").title(), "item_group": "Medicines", "stock_uom": "Nos",
			"is_stock_item": 1, "hv_is_medicine": 1, "hv_generic": generic, "hv_strength": strength, "hv_dosage_form": "Tablet", "hv_units_per_strip": 10,
			"hv_strips_per_pack": 2, "hv_allow_loose_sale": 1, "hv_allow_strip_sale": 1, "hv_prescription_required": rx, "hv_controlled_drug": controlled,
			"has_batch_no": 1, "has_expiry_date": 1, "create_new_batch": 0, "hv_rack_location": rack}).insert()
	return code


def stock(code, near_months=2, far_months=24, packs=5):
	tag = frappe.generate_hash(length=4).upper()
	a, b = f"{code[-5:]}-N{tag}", f"{code[-5:]}-F{tag}"
	pharmacy.receive_stock("Muller & Phipps Pakistan", RETAIL, [
		{"item_code": code, "batch_no": a, "expiry": add_months(today(), near_months), "mrp_per_pack": 200, "rate_per_pack": 150, "packs": packs},
		{"item_code": code, "batch_no": b, "expiry": add_months(today(), far_months), "mrp_per_pack": 240, "rate_per_pack": 170, "packs": packs}], branch="Lahore Main")
	return a, b


def patient():
	return frappe.get_all("Patient", filters={"disabled": 0, "temporary_record": 0, "branch": "Lahore Main", "phone": ["is", "set"]}, pluck="name", limit=1)[0]


def open_shift(user, counter):
	as_user(user)
	retire_stale_shift(user)
	cur = shifts.current_shift()
	if cur:
		return cur
	c = frappe.get_doc("Counter", counter)
	if c.open_shift and c.current_user:
		retire_stale_shift(c.current_user)
		frappe.db.set_value("POS Opening Entry", c.open_shift, "status", "Closed")
		frappe.db.set_value("Counter", counter, {"open_shift": None, "current_user": None})
	return shifts.open_shift(counter, {"Cash": 2000})


class TestPharmacyQA(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		frappe.db.set_single_value("Clinic Settings", {"collect_payment_at": "Handover counter", "enable_pharmacy_pipeline": 1, "skip_review_otc": 0,
			"near_expiry_days": 90, "block_near_expiry": 0, "recall_limit": 3, "enable_medicine": 1})
		frappe.clear_document_cache("Clinic Settings")
		self.code = make_item(f"QA-PCM-{random.randint(1000, 9999)}", rack="B2-07")
		self.near, self.far = stock(self.code)
		self.pat = patient()

	def sell(self, lines, **kw):
		as_user(CASHIER)
		return api.checkout(frappe.as_json({"counter": "Pharmacy 1", "lines": lines, "patient": self.pat, **kw}))

	def act(self, user, name, action, **kw):
		as_user(user)
		return api.action(name, action, **kw)

	# ------------------------------------------------------------------ cart
	def test_01_cart_units_fefo_expiry_and_contract_books(self):
		as_user(CASHIER)
		q = api.quote(frappe.as_json([{"item_code": self.code, "uom": "Pack", "qty": 1}, {"item_code": self.code, "uom": "Strip", "qty": 1},
			{"item_code": self.code, "uom": "Nos", "qty": 3}]), "Pharmacy 1")
		self.assertFalse(q["errors"])
		lines = q["lines"]
		self.assertTrue(all(l["batch_no"] == self.near for l in lines))  # FEFO: the short-dated batch first
		self.assertEqual([round(l["rate"]) for l in lines], [200, 100, 10])  # pack MRP, strip = pack/2, unit = pack/20
		self.assertTrue(any(w for w in q.get("warnings", []) if "expir" in str(w).lower()) or any(l.get("near_expiry") for l in lines))
		r = self.sell([{"item_code": self.code, "uom": "Pack", "qty": 1}, {"item_code": self.code, "uom": "Nos", "qty": 3}], priority="Elderly")
		si = frappe.get_doc("Sales Invoice", r["name"])
		self.assertEqual(si.company, VVSP)  # contractor's books, not the hospital's
		self.assertEqual(si.docstatus, 0)  # pay at handover: draft, no money yet
		self.assertFalse(frappe.db.exists("Stock Ledger Entry", {"voucher_no": si.name}))
		t = frappe.get_doc("Dispense Ticket", si.hv_dispense_ticket)
		self.assertEqual((t.status, t.invoice_status, t.priority), ("Queued", "Draft", "Elderly"))
		self.assertEqual(flt(t.amount_due), flt(si.rounded_total or si.grand_total))
		self.assertEqual(t.items[0].rack, "B2-07")
		self.assertTrue(t.items[0].expiry)
		# the reserved units are not sold twice
		free_before = pharmacy.stock_units(self.code, RETAIL)
		self.assertEqual(free_before, 200 - 23)

	def test_02_rx_required_and_insufficient_stock(self):
		rx_item = make_item(f"QA-AMX-{random.randint(1000, 9999)}", generic="QA Amoxicillin", rx=1, rack="C3-02")
		stock(rx_item)
		with self.assertRaises(frappe.ValidationError):
			self.sell([{"item_code": rx_item, "uom": "Strip", "qty": 1}])
		with self.assertRaises(frappe.ValidationError):
			self.sell([{"item_code": self.code, "uom": "Pack", "qty": 50}])  # more than in stock

	def test_03_discount_needs_authorization_above_limit(self):
		as_user(CASHIER)
		q = api.quote(frappe.as_json([{"item_code": self.code, "uom": "Pack", "qty": 2}]), "Pharmacy 1")
		gross = sum(l["amount"] for l in q["lines"])
		small = api.request_discount(gross, round(gross * 0.04), "Regular customer", "Pharmacy 1")
		self.assertEqual(small["status"], "Within Limit")
		big = api.request_discount(gross, round(gross * 0.3), "Staff family", "Pharmacy 1")
		self.assertEqual(big["status"], "Pending")
		with self.assertRaises(frappe.ValidationError):
			self.sell([{"item_code": self.code, "uom": "Pack", "qty": 2}], discount_amount=round(gross * 0.3), discount_authorization=big["name"])
		r = self.sell([{"item_code": self.code, "uom": "Pack", "qty": 2}], discount_amount=round(gross * 0.04), discount_authorization=small["name"])
		self.assertAlmostEqual(flt(frappe.db.get_value("Sales Invoice", r["name"], "discount_amount")), round(gross * 0.04))

	# ------------------------------------------------------------------ the full journey
	def test_04_pick_review_handover_with_billing(self):
		r = self.sell([{"item_code": self.code, "uom": "Pack", "qty": 1}, {"item_code": self.code, "uom": "Strip", "qty": 1}], priority="Urgent")
		t = frappe.db.get_value("Sales Invoice", r["name"], "hv_dispense_ticket")
		as_user(FINDER)
		self.assertIn(t, [x.name for x in api.tickets("pick")])
		self.act(FINDER, t, "start_pick")
		with self.assertRaises(frappe.ValidationError):  # a second finder cannot take it
			self.act("finder@vvs.demo", t, "start_pick")
		with self.assertRaises(frappe.ValidationError):
			self.act(FINDER, t, "scan", code=self.far)  # wrong batch refused
		with self.assertRaises(frappe.ValidationError):
			self.act(FINDER, t, "scan", code="NOT-ON-TICKET")
		with self.assertRaises(frappe.PermissionError):
			self.act(CASHIER, t, "approve")  # cashier cannot review
		for _ in range(2):
			self.act(FINDER, t, "scan", code=self.near)
		self.act(FINDER, t, "complete_pick")
		self.assertEqual(frappe.db.get_value("Dispense Ticket", t, "status"), "Picked")
		self.act(PHARMACIST, t, "start_review")
		doc = frappe.get_doc("Dispense Ticket", t)
		with self.assertRaises(frappe.ValidationError):  # count mismatch blocks
			self.act(PHARMACIST, t, "approve", counts=frappe.as_json({doc.items[0].name: 0}))
		self.act(PHARMACIST, t, "approve")
		self.assertEqual(frappe.db.get_value("Dispense Ticket", t, "status"), "Ready")
		# handover counter: dispenser's own shift, call, bill (split), hand over
		shift = open_shift(DISPENSER, "Handover 3")
		self.assertEqual(frappe.db.get_value("POS Profile", shift.pos_profile, "company"), VVSP)
		self.act(DISPENSER, t, "call", counter="Handover 3")
		with self.assertRaises(frappe.ValidationError):
			self.act(DISPENSER, t, "handover")  # not paid yet
		due = flt(frappe.db.get_value("Dispense Ticket", t, "amount_due"))
		with self.assertRaises(frappe.ValidationError):  # wallet without transaction id
			self.act(DISPENSER, t, "collect_payment", payments=frappe.as_json([{"mode_of_payment": "JazzCash", "amount": due}]))
		with self.assertRaises(frappe.ValidationError):  # change from a wallet
			self.act(DISPENSER, t, "collect_payment", payments=frappe.as_json([{"mode_of_payment": "JazzCash", "amount": due + 100, "reference_no": "J1"}]))
		rc = self.act(DISPENSER, t, "collect_payment", payments=frappe.as_json([{"mode_of_payment": "Cash", "amount": 500},
			{"mode_of_payment": "JazzCash", "amount": due - 200, "reference_no": "JC-QA-1"}]))
		si = frappe.get_doc("Sales Invoice", r["name"])
		self.assertEqual((si.docstatus, si.company, si.is_created_using_pos), (1, VVSP, 1))
		self.assertEqual(sorted((p.mode_of_payment, p.amount) for p in si.payments), sorted([("Cash", 200.0), ("JazzCash", due - 200)]))
		self.assertAlmostEqual(flt(rc.get("change") or 0), 300, delta=1)
		self.assertIn("JC-QA-1", si.remarks)
		sle = frappe.get_all("Stock Ledger Entry", filters={"voucher_no": si.name, "is_cancelled": 0}, fields=["warehouse", "actual_qty", "company"])
		self.assertEqual({x.warehouse for x in sle}, {RETAIL})
		self.assertEqual(-sum(x.actual_qty for x in sle), 30)
		gl = frappe.get_all("GL Entry", filters={"voucher_no": si.name, "is_cancelled": 0}, fields=["company"], distinct=True, pluck="company")
		self.assertEqual(gl, [VVSP])
		modes = {m["mode_of_payment"]: m["collections"] for m in shifts.summary(shift.name)["modes"]}
		self.assertGreaterEqual(modes.get("JazzCash", 0), due - 200)
		self.act(DISPENSER, t, "handover", code=frappe.db.get_value("Dispense Ticket", t, "token"))
		self.assertEqual(frappe.db.get_value("Dispense Ticket", t, "status"), "Handed Over")

	def test_05_not_found_substitute_and_partial_supply(self):
		sub = make_item(f"QA-PCM2-{random.randint(1000, 9999)}", rack="B2-08")  # same generic / strength / form
		stock(sub)
		other = make_item(f"QA-ORS-{random.randint(1000, 9999)}", generic="QA ORS", rack="D1-01", strength="1 sachet")
		stock(other)
		r = self.sell([{"item_code": self.code, "uom": "Strip", "qty": 1}, {"item_code": other, "uom": "Nos", "qty": 2}])
		t = frappe.db.get_value("Sales Invoice", r["name"], "hv_dispense_ticket")
		self.act(FINDER, t, "start_pick")
		doc = frappe.get_doc("Dispense Ticket", t)
		pcm = next(x for x in doc.items if x.item_code == self.code)
		ors = next(x for x in doc.items if x.item_code == other)
		self.act(FINDER, t, "not_found", line=pcm.name, reason="Shelf empty")
		self.assertEqual(frappe.db.get_value("Dispense Ticket", t, "status"), "Exception")
		with self.assertRaises(frappe.ValidationError):  # substitute must match generic / strength / form
			self.act(PHARMACIST, t, "swap_line", line=pcm.name, new_item=other)
		self.act(PHARMACIST, t, "swap_line", line=pcm.name, new_item=sub)
		si = frappe.get_doc("Sales Invoice", r["name"])
		self.assertIn(sub, [i.item_code for i in si.items])
		self.assertNotIn(self.code, [i.item_code for i in si.items])
		# ORS cannot be supplied either: partial supply drops it from the unpaid bill
		before = flt(frappe.db.get_value("Dispense Ticket", t, "amount_due"))
		self.act(PHARMACIST, t, "drop_line", line=ors.name, reason="Out of stock")
		self.assertLess(flt(frappe.db.get_value("Dispense Ticket", t, "amount_due")), before)
		self.assertNotIn(other, [i.item_code for i in frappe.get_doc("Sales Invoice", r["name"]).items])
		self.act(PHARMACIST, t, "approve")
		self.assertEqual(frappe.db.get_value("Dispense Ticket", t, "status"), "Ready")

	def test_06_recall_limit_and_not_collected(self):
		r = self.sell([{"item_code": self.code, "uom": "Nos", "qty": 5}])
		t = frappe.db.get_value("Sales Invoice", r["name"], "hv_dispense_ticket")
		self.act(FINDER, t, "start_pick")
		self.act(FINDER, t, "scan", code=self.near)
		self.act(FINDER, t, "complete_pick")
		self.act(PHARMACIST, t, "approve")
		open_shift(DISPENSER, "Handover 3")
		for _ in range(4):  # first call + recalls up to the limit (3) → not collected
			self.act(DISPENSER, t, "call", counter="Handover 3")
		self.assertEqual(frappe.db.get_value("Dispense Ticket", t, "status"), "Not Collected")
		self.assertEqual(frappe.db.get_value("Sales Invoice", r["name"], "docstatus"), 0)  # no money, no stock moved

	def test_07_controlled_drug_register_and_refund_same_batch(self):
		ctl = make_item(f"QA-TRM-{random.randint(1000, 9999)}", generic="QA Tramadol", controlled=1, rx=0, rack="Z9-01")
		a, _b = stock(ctl)
		with self.assertRaises(frappe.ValidationError):  # controlled: no sale without a prescription
			self.sell([{"item_code": ctl, "uom": "Strip", "qty": 1}])
		as_user("Administrator")
		rx = frappe.get_doc({"doctype": "Prescription", "patient": self.pat, "doctor": frappe.db.get_value("Doctor", {"is_active": 1}), "branch": "Lahore Main",
			"medicines": [{"item": ctl, "dose": "1", "frequency": "1+0+1", "qty": 10, "override_reason": "QA"}]})
		rx.insert()
		rx.submit()
		r = self.sell([{"item_code": ctl, "uom": "Strip", "qty": 1}], prescription=rx.name)
		t = frappe.db.get_value("Sales Invoice", r["name"], "hv_dispense_ticket")
		self.act(FINDER, t, "start_pick")
		self.act(FINDER, t, "scan", code=a)
		self.act(FINDER, t, "complete_pick")
		self.assertEqual(frappe.db.get_value("Dispense Ticket", t, "status"), "Picked")  # controlled: never skips review
		self.act(PHARMACIST, t, "approve")
		open_shift(DISPENSER, "Handover 3")
		due = flt(frappe.db.get_value("Dispense Ticket", t, "amount_due"))
		self.act(DISPENSER, t, "collect_payment", payment_mode="Cash", cash_tendered=due)
		self.assertTrue(frappe.db.exists("Controlled Drug Register", {"sales_invoice": r["name"], "item_code": ctl}))
		before = pharmacy.stock_units(ctl, RETAIL)
		as_user(DISPENSER)
		ret = api.refund(r["name"], "Patient returned unopened strip")
		self.assertEqual(pharmacy.stock_units(ctl, RETAIL), before + 10)
		self.assertEqual(frappe.db.get_value("Sales Invoice Item", {"parent": ret}, "batch_no"), a)
