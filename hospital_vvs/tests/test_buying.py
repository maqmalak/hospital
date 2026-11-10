"""Buying, assets and consumption (D-59): order → receive by batch → bill → pay; asset receipt registers depreciating assets; issues charge departments."""
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, flt, today

from hospital_vvs.api import buying as api
from hospital_vvs.services import assets as A
from hospital_vvs.services import buying as B


class TestBuying(IntegrationTestCase):
	def setUp(self):
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(frappe.set_user, "Administrator")
		frappe.set_user("Administrator")

	def test_medicine_order_receive_bill_pay(self):
		ph = frappe.db.get_single_value("Clinic Settings", "pharmacy_company")
		sup = B.ensure_supplier("QA Pharma Test", "Pharmaceutical")
		frappe.set_user("store@vvs.demo")
		r = api.save_order(frappe.as_json({"company": ph, "supplier": sup, "warehouse": "Pharmacy Store LHR - VVSP", "lines": [{"item_code": "PANADOL-500MG", "qty": 10, "rate": 250}]}), 1)
		self.assertEqual(r["docstatus"], 0)  # store keeper drafts; the accountant approves
		frappe.set_user("accounts@vvs.demo")
		api.approve_order(r["name"])
		self.assertRaises(frappe.PermissionError, api.receive_order, r["name"])  # receiving is the store's job
		frappe.set_user("store@vvs.demo")
		po_item = frappe.db.get_value("Purchase Order Item", {"parent": r["name"]}, ["name", "qty"], as_dict=True)
		from hospital_vvs.services.pharmacy import pack

		self.assertEqual(po_item.qty, 10 * pack("PANADOL-500MG").upp)  # ordered in packs, stocked in units
		res = api.receive_order(r["name"], frappe.as_json({po_item.name: {"batch_no": "QATEST-B1", "expiry": add_days(today(), 400)}}), bill_no="DC-1")
		self.assertEqual(frappe.db.get_value("Batch", "QATEST-B1", "item"), "PANADOL-500MG")
		self.assertGreater(flt(frappe.db.get_value("Batch", "QATEST-B1", "hv_mrp_per_pack")), 0)  # the POS can price it
		frappe.set_user("accounts@vvs.demo")
		pi = api.bill_order("Purchase Receipt", res["purchase_receipt"], bill_no="INV-QA-1")
		api.pay_invoice(pi, None, "Bank Transfer", "IBFT-QA")
		self.assertEqual(flt(frappe.db.get_value("Purchase Invoice", pi, "outstanding_amount")), 0)

	def test_asset_receipt_registers_depreciating_asset(self):
		A.ensure_setup()
		code = A.ensure_asset_item("QA-AST-ECG", "QA ECG Machine", "Medical Equipment", 300000)
		sup = B.ensure_supplier("QA Equipment Vendor", "Medical Equipment")
		po = B.make_po(sup, "VVS Hospital", [{"item_code": code, "qty": 2, "rate": 300000, "cost_center": "Main - VVSH"}])
		frappe.set_user("store@vvs.demo")
		res = api.receive_order(po.name, frappe.as_json({po.items[0].name: {"location": "OPD"}}))
		self.assertEqual(len(res["assets"]), 2)
		a = frappe.get_doc("Asset", res["assets"][0])
		self.assertEqual((a.docstatus, a.location, a.calculate_depreciation), (1, "OPD", 1))
		frappe.set_user("accounts@vvs.demo")
		self.assertTrue(api.asset(a.name)["schedule"])

	def test_issue_charges_the_department(self):
		item = frappe.db.get_value("Item", {"item_group": "Consumable", "has_batch_no": 0})
		if not item or not frappe.db.get_value("Bin", {"item_code": item, "warehouse": "Main Store LHR - VVSH", "actual_qty": [">", 5]}):
			self.skipTest("run setup.purchase_demo first")
		frappe.set_user("store@vvs.demo")
		se = api.issue("Main Store LHR - VVSH", "OPD - VVSH", frappe.as_json([{"item_code": item, "qty": 2}]), "QA issue")
		gl = frappe.db.get_value("GL Entry", {"voucher_no": se, "account": ["like", "Medical Consumables Consumed%"]}, ["cost_center", "debit"], as_dict=True)
		self.assertEqual(gl.cost_center, "OPD - VVSH")
		self.assertGreater(gl.debit, 0)
		frappe.set_user("cashier@vvs.demo")
		self.assertRaises(frappe.PermissionError, api.orders)
