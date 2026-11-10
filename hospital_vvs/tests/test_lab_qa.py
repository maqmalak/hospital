"""Regression tests for the lab QA defects of 2026-11-10 (docs/QA-LAB.md)."""
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from hospital_vvs.api import lab as api
from hospital_vvs.services import billing, lab
from hospital_vvs.tests.test_phase2 import a_patient, as_user, shift_for


def received_order(tests, priority="Normal"):
	shift_for("lab@vvs.demo", "Lab Counter")
	ti = lab.create_order(a_patient(), tests, "Lahore Main", priority=priority)
	lab.pay(ti.name, "Cash")
	for s in frappe.get_all("Lab Sample", filters={"test_invoice": ti.name}, pluck="name"):
		lab.receive(s)
	return frappe.get_doc("Test Invoice", ti.name)


class TestLabQA(IntegrationTestCase):
	def setUp(self):
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(as_user, "Administrator")

	def test_reject_withdraws_draft_result(self):
		ti = received_order(["TSH"])
		it = ti.items[0]
		res = lab.enter_results(it.name, {"TSH": "2.1"})
		lab.reject(it.sample, "Clotted")
		self.assertEqual(frappe.db.get_value("Lab Result", res.name, "status"), "Cancelled")
		as_user("pathologist@vvs.demo")
		self.assertNotIn(res.name, [r.name for r in api.verify_list()])

	def test_reject_refused_after_verification(self):
		ti = received_order(["TSH"])
		it = ti.items[0]
		res = lab.enter_results(it.name, {"TSH": "2.1"})
		as_user("pathologist@vvs.demo")
		lab.verify(res.name)
		as_user("lab@vvs.demo")
		with self.assertRaises(frappe.ValidationError):
			lab.reject(it.sample, "Clotted")

	def test_only_pathologist_amends(self):
		ti = received_order(["TSH"])
		res = lab.enter_results(ti.items[0].name, {"TSH": "2.1"})
		as_user("pathologist@vvs.demo")
		lab.verify(res.name)
		as_user("lab@vvs.demo")
		with self.assertRaises(frappe.PermissionError):
			lab.amend(res.name, "typo")

	def test_refund_cancels_unverified_tests_and_samples(self):
		ti = received_order(["Complete Blood Count", "TSH"])
		cbc = next(i for i in ti.items if i.template == "Complete Blood Count")
		res = lab.enter_results(cbc.name, {"Hemoglobin": "14", "WBC": "7"})
		as_user("pathologist@vvs.demo")
		lab.verify(res.name)
		as_user("lab@vvs.demo")
		billing.refund_invoice(ti.sales_invoice, "Not needed")  # full refund
		ti.reload()
		st = {i.template: i.status for i in ti.items}
		self.assertEqual(st["TSH"], "Cancelled")
		self.assertEqual(st["Complete Blood Count"], "Verified")  # verified result kept
		tsh = next(i for i in ti.items if i.template == "TSH")
		if tsh.sample != cbc.sample:
			self.assertEqual(frappe.db.get_value("Lab Sample", tsh.sample, "status"), "Cancelled")

	def test_priority_order_and_filters(self):
		names = {}
		for p in ("Normal", "Priority", "Urgent"):
			shift_for("lab@vvs.demo", "Lab Counter")
			ti = lab.create_order(a_patient(), ["Blood Sugar Random"], "Lahore Main", priority=p)
			lab.pay(ti.name, "Cash")
			names[p] = ti.name
		self.assertEqual(lab.create_order(a_patient(), ["TSH"], "Lahore Main", priority="Routine").priority, "Normal")  # legacy value
		as_user("lab@vvs.demo")
		order = [s.test_invoice for s in api.samples("Pending") if s.test_invoice in names.values()]
		self.assertEqual(order, [names["Urgent"], names["Priority"], names["Normal"]])
		rows = api.orders(from_date=frappe.utils.today(), to_date=frappe.utils.today(), priority="Urgent")
		self.assertTrue(rows and all(r.priority == "Urgent" for r in rows))


class TestLabPrint(IntegrationTestCase):
	"""D-50: elegant print — QR verification, signatory / stamp, remarks, previous result with date."""

	def setUp(self):
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(as_user, "Administrator")

	def released(self, value):
		ti = received_order(["TSH"])
		res = lab.enter_results(ti.items[0].name, {"TSH": value})
		as_user("pathologist@vvs.demo")
		lab.verify(res.name, "Euthyroid.")
		as_user("lab@vvs.demo")
		lab.release(ti.name)
		return ti

	def test_print_qr_history_remarks(self):
		first = self.released("2.0")
		pat = first.patient
		shift_for("lab@vvs.demo", "Lab Counter")
		ti = lab.create_order(pat, ["TSH"], "Lahore Main")
		lab.pay(ti.name, "Cash")
		for s in frappe.get_all("Lab Sample", filters={"test_invoice": ti.name}, pluck="name"):
			lab.receive(s)
		ti.reload()
		self.assertTrue(api.result_form(ti.items[0].name)["history"])  # earlier TSH shown while entering
		res = lab.enter_results(ti.items[0].name, {"TSH": "6.2"})
		as_user("pathologist@vvs.demo")
		lab.verify(res.name)
		api.set_remarks(ti.name, "Repeat TSH after 6 weeks.")
		as_user("lab@vvs.demo")
		lab.release(ti.name)
		d = lab.report_data(ti.name)
		self.assertEqual(d["tests"][0]["previous"]["values"]["TSH"][0], "2.0")
		html = lab.report_html(d)
		for bit in ("Repeat TSH after 6 weeks.", "data:image/svg+xml;base64", "Previous", "LABORATORY REPORT", "Consultant Pathologist"):
			self.assertIn(bit, html)
		self.assertTrue(lab.report_pdf(ti.name).startswith(b"%PDF"))
		frappe.set_user("Guest")
		ok = api.verify_report(ti.name, lab.verify_sig(ti.name))
		self.assertTrue(ok["valid"] and ok["report"] == ti.name and "values" not in str(ok["tests"]))
		self.assertFalse(api.verify_report(ti.name, "0" * 20)["valid"])  # forged QR
