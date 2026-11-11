"""Lab charges collected at the reception counter (D-60).

A. Walk-in at the lab: lab registers the patient and orders → the lab cannot take money → the order waits at reception →
   reception collects (with discount) and prints the receipt → order Paid, samples created, the lab sees the receipt.
B. Walk-in at reception: reception orders the tests in the cart and collects at once (covered in test_counter; checked here with a % discount).
"""
import json
import random
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt

from hospital_vvs.api import counter as capi, lab as lapi, patients as papi
from hospital_vvs.services import counter
from hospital_vvs.tests.test_phase2 import as_user
from hospital_vvs.tests.test_phase3 import DESK, desk_shift


class TestLabAtReception(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(frappe.set_user, "Administrator")
		frappe.db.set_single_value("Clinic Settings", {"lab_payment_point": "Reception counter", "require_shift_for_billing": 1, "enable_shifts": 1})
		frappe.clear_document_cache("Clinic Settings")
		self.shift = desk_shift()

	def test_a_walkin_at_lab_pays_at_reception(self):
		as_user("lab@vvs.demo")
		r = papi.register(json.dumps({"patient_name": f"Lab Walkin {random.randint(100, 999)}", "gender": "Female", "age": 29,
			"phone": f"+92302{random.randint(1000000, 9999999)}"}), "Walk-in at the laboratory")
		mr = r["name"]
		order = lapi.create_order(json.dumps({"patient": mr, "tests": ["Complete Blood Count"]}))
		ti = order["name"]
		self.assertRaises(frappe.PermissionError, lapi.pay, ti)  # the lab does not take money
		pay_of = lambda: next(r["payment"] for r in lapi.orders(q=ti) if r["name"] == ti)  # noqa: E731
		self.assertEqual(pay_of(), "Unpaid")
		self.assertIn(ti, [o["name"] for o in lapi.awaiting_payment()])
		self.assertRaises(frappe.PermissionError, lapi.create_order, json.dumps({"patient": mr, "tests": ["Complete Blood Count"], "pay": 1}))
		as_user(DESK)
		self.assertIn(ti, [o["name"] for o in capi.pending_lab()])
		panel = counter.patient_panel(mr)
		self.assertEqual([o["name"] for o in panel["lab_orders"]], [ti])
		gross = flt(frappe.db.get_value("Test Invoice", ti, "gross_total"))
		disc = round(gross * 0.05)
		line = {"kind": "Lab Order", "target": ti, "discount": disc}
		priced = counter.price({"patient": mr, "lines": [line]})
		self.assertAlmostEqual(priced["total"], gross - disc, delta=1)
		auths = counter.request_discounts({"patient": mr, "branch": "Lahore Main", "lines": [line], "discount_reason": "Staff family"})
		a = auths[f"LabOrder:{ti}"]
		if a["status"] not in ("Within Limit", "Approved"):  # above the receptionist's limit → supervisor approves
			from hospital_vvs.services import discounts

			as_user("supervisor@vvs.demo")
			discounts.decide(a["name"], 1, "OK")
			as_user(DESK)
		rc = counter.checkout({"patient": mr, "branch": "Lahore Main", "lines": [line], "auths": {f"LabOrder:{ti}": a["name"]},
			"tenders": [{"mode_of_payment": "Cash", "amount": gross}]})
		self.assertAlmostEqual(flt(rc["patient_total"]), gross - disc, delta=1)
		self.assertAlmostEqual(flt(rc["change_amount"]), disc, delta=1)
		self.assertTrue(all(l["kind"] == "Lab" and l["reference_name"] == ti for l in rc["lines"]))
		t = frappe.get_doc("Test Invoice", ti)
		self.assertEqual(t.status, "Paid")
		self.assertAlmostEqual(flt(t.discount_amount), disc, delta=1)
		self.assertTrue(frappe.db.exists("Lab Sample", {"test_invoice": ti}))  # sample can now be collected
		self.assertNotIn(ti, [o["name"] for o in capi.pending_lab()])
		as_user("lab@vvs.demo")
		self.assertEqual(lapi.order(ti)["receipt"]["name"], rc["name"])  # the lab sees the payment receipt
		self.assertEqual(pay_of(), "Paid")
		smp = lapi.samples("Pending")
		self.assertTrue(any(x["test_invoice"] == ti and x["receipt"] == rc["name"] for x in smp))

	def test_b_walkin_at_reception_orders_and_pays(self):
		as_user(DESK)
		price = flt(frappe.db.get_value("Lab Test Template", "Complete Blood Count", "price"))
		new = {"patient_name": f"Desk Lab {random.randint(100, 999)}", "gender": "Male", "age": 41, "phone": f"+92303{random.randint(1000000, 9999999)}"}
		rc = counter.checkout({"branch": "Lahore Main", "new_patient": new, "lines": [{"kind": "Lab", "template": "Complete Blood Count"}],
			"tenders": [{"mode_of_payment": "Cash", "amount": price}]})
		ti = rc["lines"][0]["reference_name"]
		self.assertEqual(frappe.db.get_value("Test Invoice", ti, "status"), "Paid")
		self.assertTrue(frappe.db.exists("Lab Sample", {"test_invoice": ti}))

	def test_lab_counter_setting_lets_the_lab_collect(self):
		frappe.db.set_single_value("Clinic Settings", "lab_payment_point", "Lab counter")
		frappe.clear_document_cache("Clinic Settings")
		as_user("lab@vvs.demo")
		self.assertTrue(lapi.context()["can_collect"])
