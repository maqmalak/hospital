"""D-47: online card payments (mock gateway) and FBR day-end reporting."""
import random
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, flt, now_datetime

from hospital_vvs.api import payments as api
from hospital_vvs.services import fbr, gateway
from hospital_vvs.services import online_visit as ovs
from hospital_vvs.tests.test_phase1 import demo_doctor, make_slip, new_patient


class Base(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(frappe.set_user, "Administrator")
		gateway.ensure_setup()
		frappe.db.set_single_value("Clinic Settings", {"card_gateway_enabled": 1, "card_gateway_provider": "Mock (testing)", "card_gateway_mode": "Mock",
			"enable_online_visit": 1, "ov_fee": 1500, "fbr_enabled": 0})
		frappe.clear_document_cache("Clinic Settings")


class TestCardGateway(Base):
	def test_online_visit_fee_by_card(self):
		ov, token = ovs.create({"patient_name": "Card Patient", "phone": f"+92345{random.randint(1000000, 9999999)}", "gender": "Male", "age": 30, "language": "en",
			"complaint": "Fever", "payment_method": "Card (online)"})
		self.assertEqual(ov.fee_status, "Unpaid")
		from hospital_vvs.api.online_visit import pay_card

		frappe.set_user("Guest")
		r = pay_card(token)
		link = r["url"].rsplit("/", 1)[1]
		self.assertEqual(api.checkout(link)["status"], "Initiated")
		res = api.mock_pay(link, 1)
		self.assertEqual(res["status"], "Paid")
		frappe.set_user("Administrator")
		ov.reload()
		self.assertEqual(ov.fee_status, "Verified")
		pe = frappe.get_doc("Payment Entry", ov.payment_entry)
		self.assertEqual((pe.mode_of_payment, pe.paid_to), ("Card (online)", gateway.clearing_account(pe.company)))  # into the gateway clearing account
		self.assertEqual(flt(frappe.db.get_value("Sales Invoice", ov.sales_invoice, "outstanding_amount")), 0)
		self.assertEqual(api.mock_pay(link, 1)["status"], "Paid")  # idempotent

	def test_bill_link_declined_then_paid_and_expiry(self):
		from hospital_vvs.services import billing

		p = new_patient()
		cust = frappe.db.get_value("Patient", p.name, "customer")
		item = frappe.db.get_value("Item", {"is_stock_item": 0, "disabled": 0})
		si = billing.create_invoice(customer=cust, patient=p.name, lines=[{"item_code": item, "rate": 2500}], billing_type="General", branch="Lahore Main",
			reference_doctype="Patient", reference_name=p.name, pos=False)
		r = api.create_link(si)
		tok = r["url"].rsplit("/", 1)[1]
		self.assertEqual(api.mock_pay(tok, 0)["status"], "Failed")
		with self.assertRaises(frappe.ValidationError):
			api.mock_pay(tok, 1)  # a failed link is finished; make a new one
		tok2 = api.create_link(si)["url"].rsplit("/", 1)[1]
		api.mock_pay(tok2, 1)
		self.assertEqual(flt(frappe.db.get_value("Sales Invoice", si, "outstanding_amount")), 0)
		with self.assertRaises(frappe.ValidationError):
			api.create_link(si)  # nothing left to pay
		si2 = billing.create_invoice(customer=cust, patient=p.name, lines=[{"item_code": item, "rate": 900}], billing_type="General", branch="Lahore Main",
			reference_doctype="Patient", reference_name=new_patient().name, pos=False)
		tok3 = api.create_link(si2)["url"].rsplit("/", 1)[1]
		frappe.db.set_value("Online Payment", {"token_hash": gateway._hash(tok3)}, "expires_at", add_to_date(now_datetime(), hours=-1))
		self.assertEqual(api.checkout(tok3)["status"], "Expired")

	def test_live_gateway_not_connected(self):
		frappe.db.set_single_value("Clinic Settings", {"card_gateway_provider": "PayFast", "card_gateway_mode": "Live"})
		frappe.clear_document_cache("Clinic Settings")
		p = new_patient()
		from hospital_vvs.services import billing

		si = billing.create_invoice(customer=frappe.db.get_value("Patient", p.name, "customer"), patient=p.name, lines=[{"item_code": frappe.db.get_value("Item", {"is_stock_item": 0, "disabled": 0}), "rate": 100}],
			billing_type="General", branch="Lahore Main", reference_doctype="Patient", reference_name=p.name, pos=False)
		with self.assertRaises(frappe.ValidationError):
			api.create_link(si)


class TestFbr(Base):
	def setUp(self):
		super().setUp()
		frappe.db.set_single_value("Clinic Settings", {"fbr_enabled": 1, "fbr_mode": "Mock", "fbr_pos_id": "812345", "fbr_billing_types": "OPD Slip", "fbr_companies": None})
		frappe.clear_document_cache("Clinic Settings")

	def test_day_end_reports_in_scope_and_retries(self):
		slip = make_slip(new_patient().name, demo_doctor())
		log = frappe.db.get_value("FBR Invoice", {"sales_invoice": slip.sales_invoice}, ["status", "billing_type"], as_dict=True)
		self.assertEqual((log.status, log.billing_type), ("Pending", "OPD Slip"))  # queued, nothing sent at the counter
		frappe.db.set_single_value("Clinic Settings", "fbr_mode", "Production")  # no fbr_token → fails
		frappe.clear_document_cache("Clinic Settings")
		with patch.dict(frappe.conf, {"fbr_token": None}):
			r = fbr.day_end()
		self.assertGreaterEqual(r["failed"], 1)
		self.assertEqual(frappe.db.get_value("FBR Invoice", {"sales_invoice": slip.sales_invoice}, "status"), "Failed")
		frappe.db.set_single_value("Clinic Settings", "fbr_mode", "Mock")
		frappe.clear_document_cache("Clinic Settings")
		fbr.day_end()  # retry
		no = frappe.db.get_value("Sales Invoice", slip.sales_invoice, "hv_fbr_invoice_no")
		self.assertTrue(no and no.startswith("812345"))
		self.assertEqual(frappe.db.get_value("FBR Invoice", {"sales_invoice": slip.sales_invoice}, "status"), "Reported")

	def test_out_of_scope_not_queued(self):
		frappe.db.set_single_value("Clinic Settings", "fbr_billing_types", "Medicine")
		frappe.clear_document_cache("Clinic Settings")
		slip = make_slip(new_patient().name, demo_doctor())
		self.assertFalse(frappe.db.exists("FBR Invoice", {"sales_invoice": slip.sales_invoice}))
