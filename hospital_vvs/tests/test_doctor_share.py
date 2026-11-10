"""D-43 doctor share: rules, earned as paid, refunds, payout to the doctor's supplier."""
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt, today

from hospital_vvs.api import doctor_share as api
from hospital_vvs.services import doctor_share as svc
from hospital_vvs.tests.test_phase1 import demo_doctor, make_slip, new_patient


def ledger(si):
	return flt(frappe.db.sql("select sum(amount) from `tabDoctor Share Ledger` where sales_invoice=%s", si)[0][0])


def rule(doctor, billing_type="OPD Slip", value=30, share_type="Percent", **kw):
	frappe.db.delete("Doctor Share Rule", {"doctor": doctor})
	return frappe.get_doc(dict({"doctype": "Doctor Share Rule", "doctor": doctor, "billing_type": billing_type, "share_type": share_type, "value": value}, **kw)).insert()


def credit_bill(patient, doctor, rate=1000):
	item = frappe.db.get_value("Item", {"item_group": ["like", "%Service%"], "is_stock_item": 0, "disabled": 0}) or frappe.db.get_value("Item", {"is_stock_item": 0, "disabled": 0, "is_fixed_asset": 0, "is_sales_item": 1})
	si = frappe.get_doc({"doctype": "Sales Invoice", "customer": frappe.db.get_value("Patient", patient, "customer"), "company": "VVS Hospital", "branch": "Lahore Main",
		"hv_patient": patient, "hv_billing_type": "OPD Slip", "posting_date": today(), "due_date": today(),
		"items": [{"item_code": item, "qty": 1, "rate": rate, "price_list_rate": rate, "hv_doctor": doctor}]})
	si.insert(ignore_permissions=True)
	si.submit()
	return si


def pay(si, amount):
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	pe = get_payment_entry("Sales Invoice", si.name, party_amount=amount)
	pe.mode_of_payment = "Cash"
	pe.reference_no = pe.reference_no or "T"
	pe.reference_date = today()
	pe.insert(ignore_permissions=True)
	pe.submit()
	return pe


class TestDoctorShare(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		frappe.db.set_single_value("Clinic Settings", {"enable_doctor_share": 1, "doctor_share_basis": "On payment", "doctor_share_on_payer_bills": 1})
		frappe.clear_document_cache("Clinic Settings")
		svc.ensure_accounts()
		self.doctor = demo_doctor()

	def test_opd_slip_line_gets_doctor_and_share(self):
		rule(self.doctor, value=40)
		slip = make_slip(new_patient().name, self.doctor)
		si = frappe.get_doc("Sales Invoice", slip.sales_invoice)
		self.assertEqual(si.items[0].hv_doctor, self.doctor)  # filled from the OPD slip
		self.assertAlmostEqual(ledger(si.name), flt(si.items[0].net_amount) * 0.4, places=2)  # paid at the counter → earned now
		row = frappe.get_all("Doctor Share Ledger", filters={"sales_invoice": si.name}, fields=["journal_entry", "supplier"])[0]
		self.assertTrue(row.supplier)
		gl = frappe.db.sql("select sum(credit-debit) from `tabGL Entry` where voucher_no=%s and party=%s and is_cancelled=0", (row.journal_entry, row.supplier))[0][0]
		self.assertAlmostEqual(flt(gl), ledger(si.name), places=2)  # owed to the doctor's supplier

	def test_earned_as_paid_then_refund_takes_back(self):
		rule(self.doctor, value=30)
		si = credit_bill(new_patient().name, self.doctor, 1000)
		self.assertEqual(ledger(si.name), 0)  # unpaid credit bill: nothing earned yet
		pay(si, 400)
		self.assertAlmostEqual(ledger(si.name), 120)
		pay(frappe.get_doc("Sales Invoice", si.name), 600)
		self.assertAlmostEqual(ledger(si.name), 300)
		from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return

		ret = make_sales_return(si.name)
		ret.insert(ignore_permissions=True)
		ret.submit()
		self.assertAlmostEqual(ledger(ret.name), -300)  # credit note takes the commission back
		self.assertEqual(frappe.db.get_value("Doctor Share Ledger", {"sales_invoice": ret.name}, "entry_type"), "Reversed")

	def test_most_specific_rule_and_fixed(self):
		rule(self.doctor, billing_type="Any", value=10)
		si = credit_bill(new_patient().name, self.doctor, 1000)
		item = si.items[0].item_code
		frappe.get_doc({"doctype": "Doctor Share Rule", "doctor": self.doctor, "billing_type": "OPD Slip", "item_code": item, "share_type": "Fixed per unit", "value": 250}).insert()
		pay(si, 1000)
		self.assertAlmostEqual(ledger(si.name), 250)  # item rule beats the general 10 %

	def test_payout_pays_unpaid_to_supplier(self):
		rule(self.doctor, value=50)
		frappe.db.set_value("Doctor Share Ledger", {"doctor": self.doctor, "status": "Unpaid"}, "status", "Paid")  # isolate this test's rows
		si = credit_bill(new_patient().name, self.doctor, 800)
		pay(si, 800)
		due = api.unpaid(self.doctor)["total"]
		self.assertAlmostEqual(due, 400)
		r = api.pay(self.doctor, "Cash")
		self.assertAlmostEqual(r["total"], 400)
		pe = frappe.get_doc("Payment Entry", r["payment_entry"])
		self.assertEqual((pe.docstatus, pe.payment_type, pe.party_type), (1, "Pay", "Supplier"))
		self.assertEqual(pe.party, frappe.db.get_value("Doctor", self.doctor, "supplier"))
		self.assertEqual(api.unpaid(self.doctor)["total"], 0)
		st = api.statement(self.doctor)
		self.assertGreaterEqual(st["totals"]["paid"], 400)
		api.cancel_payout(r["payout"])  # undo → unpaid again
		self.assertAlmostEqual(api.unpaid(self.doctor)["total"], 400)

	def test_cancelled_bill_reverses(self):
		rule(self.doctor, value=20)
		si = credit_bill(new_patient().name, self.doctor, 500)
		pe = pay(si, 500)
		self.assertAlmostEqual(ledger(si.name), 100)
		pe.cancel()
		self.assertAlmostEqual(ledger(si.name), 0)  # payment cancelled → commission taken back
