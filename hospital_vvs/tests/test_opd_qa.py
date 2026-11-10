"""OPD QA 2026-11-10 (docs/QA-OPD.md): prescription quantity, shift-closing denominations, Urdu corrections."""
import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from hospital_vvs.services.rx_qty import calc


class TestRxQty(IntegrationTestCase):
	def test_rules(self):
		cases = [(("1", "1+1+1", "5 days"), 15), (("1", "1+0+1", "7 days"), 14), (("2", "1+0+1", "5 days"), 20), (("1/2", "1+0+1", "10 days"), 10),
			(("1", "½+0+½", "10 days"), 10), (("1", "2+0+2", "5 days"), 20), (("1", "BD", "2 weeks"), 28), (("1", "OD", "1 month"), 30), (("1", "q8h", "3 days"), 9),
			(("1", "weekly", "4 weeks"), 4), (("5 ml", "1+1+1", "5 days", None, "Syrup"), 1), (("10 ml", "TDS", "7 days", None, "Suspension"), 2),
			(("1", "BD", "5 days", None, "Cream"), 1), (("1", "1+1+1", ""), None)]
		for args, want in cases:
			self.assertEqual(calc(*args), want, args)


class TestOpdQA(IntegrationTestCase):
	def setUp(self):
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(frappe.set_user, "Administrator")

	def test_blank_qty_filled_and_reaches_pharmacy(self):
		from hospital_vvs.tests.test_phase1 import demo_doctor, make_slip, new_patient

		slip = make_slip(new_patient().name, demo_doctor())
		item = frappe.db.get_value("Item", {"hv_is_medicine": 1, "disabled": 0, "item_name": ["like", "%Panadol%"]})
		rx = frappe.get_doc({"doctype": "Prescription", "patient": slip.patient, "doctor": slip.doctor, "branch": "Lahore Main", "queue_entry": slip.queue_entry,
			"medicines": [{"item": item, "dose": "1", "frequency": "1+1+1", "duration": "5 days", "override_reason": "test"}]})
		rx.insert(ignore_permissions=True)
		self.assertEqual(rx.medicines[0].qty, 15)
		rx.medicines[0].qty = 9  # a typed quantity is kept
		rx.save(ignore_permissions=True)
		self.assertEqual(rx.medicines[0].qty, 9)

	def test_closing_rejects_non_denominations(self):
		from hospital_vvs.services import shifts

		with patch.object(shifts, "current_shift", return_value=frappe._dict(name="X")), patch.object(shifts, "summary", return_value={"modes": []}):
			with self.assertRaises(frappe.ValidationError):
				shifts.close_shift({"Cash": 5500})

	def test_urdu_correction_learned(self):
		from hospital_vvs.api import patients as api

		frappe.set_user("reception@vvs.demo")
		api.learn_urdu(json.dumps([["zzqatest", "زیڈ ٹیسٹ"], ["ok", "not urdu"]]))
		self.assertEqual(api.urdu_words().get("zzqatest"), "زیڈ ٹیسٹ")
		self.assertNotIn("ok", api.urdu_words())  # only real Urdu is learned
