"""Phase 6 acceptance: W8 expenses, W11 welfare, W12 panel & insurance (D-46)."""
import random
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt

from hospital_vvs.api import finance as api
from hospital_vvs.services import payers
from hospital_vvs.tests.test_phase1 import demo_doctor, make_slip, new_patient


def payer(name, group, cover, types=None):
	payers.ensure_setup()
	n = frappe.db.get_value("Customer", {"customer_name": name})
	if n:
		frappe.db.set_value("Customer", n, {"hv_coverage_percent": cover, "hv_covered_billing_types": types, "hv_contract_valid_till": None})
		return n
	return frappe.get_doc({"doctype": "Customer", "customer_name": name, "customer_group": group, "customer_type": "Company", "hv_coverage_percent": cover,
		"hv_covered_billing_types": types}).insert().name


class Base(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(frappe.set_user, "Administrator")
		frappe.db.set_single_value("Clinic Settings", {"enable_welfare": 1, "enable_panels": 1, "enable_insurance": 1, "bill_rejected_to_patient": 0})
		frappe.clear_document_cache("Clinic Settings")


class TestWelfare(Base):
	def scheme(self, **kw):
		name = f"QA Zakat {random.randint(1000, 9999)}"
		return api.save_scheme(frappe.as_json(dict({"scheme_name": name, "fund_type": "Zakat", "coverage_percent": 80, "covered_billing_types": "OPD Slip\nLab",
			"approval_required": 1, "is_active": 1}, **kw)))["name"]

	def test_w11_welfare_80_percent_and_fund_balance(self):
		s = self.scheme()
		fund = frappe.db.get_value("Welfare Scheme", s, "fund_customer")
		api.donate(s, 10000, "Cash", donor="QA Donor")
		p = new_patient().name
		a = api.request_welfare(p, s, notes="Widow, no income")
		slip = make_slip(p, demo_doctor())
		self.assertEqual(flt(slip.payer_share), 0)  # not approved yet → patient pays all
		api.decide_welfare(a, 1)
		other = frappe.db.get_value("Doctor", {"is_active": 1, "name": ["!=", demo_doctor()], "default_fee": [">", 0]})  # same doctor again = free follow-up
		slip = make_slip(p, other)
		self.assertEqual(slip.payer_type, "Welfare")
		self.assertAlmostEqual(flt(slip.payer_share), round(flt(slip.net_total) * 0.8))
		self.assertAlmostEqual(flt(slip.patient_share), flt(slip.net_total) - flt(slip.payer_share))
		pinv = frappe.get_doc("Sales Invoice", slip.payer_invoice)
		self.assertEqual(pinv.customer, fund)  # covered share charged to the fund
		f = next(x for x in payers.fund_report() if x["name"] == s)
		self.assertAlmostEqual(f["balance"], 10000 - flt(slip.payer_share), places=0)  # fund balance reduced

	def test_caps_and_uncovered_type(self):
		s = self.scheme(cap_per_visit=500, approval_required=0)
		p = new_patient().name
		frappe.db.set_value("Patient", p, {"category": "Welfare", "welfare_scheme": s})
		r = payers.resolve(p, "OPD Slip", 3000)
		self.assertEqual(r["share"], 500)  # capped per visit
		self.assertEqual(payers.resolve(p, "IPD Slip", 3000)["share"], 0)  # IPD not covered by this scheme


class TestPanelInsurance(Base):
	def test_w12_panel_split_statement_payment_with_deduction(self):
		panel = payer("QA Panel Steel Mills", "Panels", 70)
		p = new_patient().name
		frappe.db.set_value("Patient", p, {"category": "Panel", "panel": panel, "employee_id": "EMP-77"})
		slip = make_slip(p, demo_doctor())
		self.assertEqual(slip.payer_type, "Panel")
		self.assertAlmostEqual(flt(slip.payer_share), round(flt(slip.net_total) * 0.7))
		st = api.payer_statement(panel)
		row = next(r for r in st["rows"] if r.name == slip.payer_invoice)
		self.assertEqual(row.employee_id, "EMP-77")
		due = flt(row.outstanding_amount)
		pe = api.payer_receive(panel, due - 100, "Cash", deduction=100, deduction_reason="Tax withheld")["payment_entry"]
		self.assertEqual(flt(frappe.db.get_value("Sales Invoice", slip.payer_invoice, "outstanding_amount")), 0)
		self.assertEqual(flt(frappe.get_doc("Payment Entry", pe).deductions[0].amount), 100)

	def test_contract_end_and_covered_types(self):
		panel = payer("QA Panel Lab Only", "Panels", 100, "Lab")
		p = new_patient().name
		frappe.db.set_value("Patient", p, {"category": "Panel", "panel": panel})
		self.assertEqual(payers.resolve(p, "OPD Slip", 1000)["share"], 0)
		self.assertEqual(payers.resolve(p, "Lab", 1000)["share"], 1000)
		frappe.db.set_value("Customer", panel, "hv_contract_valid_till", "2020-01-01")
		self.assertEqual(payers.resolve(p, "Lab", 1000)["share"], 0)

	def claim_for(self, cover=100):
		ins = payer("QA Insurer Jubilee", "Insurance Providers", cover)
		p = new_patient().name
		frappe.db.set_value("Patient", p, {"category": "Insurance", "insurance_provider": ins, "policy_no": "POL-1"})
		slip = make_slip(p, demo_doctor())
		return ins, p, slip, api.make_claim("OPD Slip", slip.name)

	def test_w12_claim_partial_deduction_settled(self):
		ins, p, slip, name = self.claim_for()
		c = frappe.get_doc("Insurance Claim", name)
		self.assertAlmostEqual(flt(c.claimed_amount), flt(slip.payer_share))
		api.claim_action(name, "submit", claim_no="JUB-998")
		api.claim_action(name, "query", note="Need prescription copy")
		approved = flt(c.claimed_amount) - 200
		c = api.claim_action(name, "decide", approved_amount=approved, reason="Non-formulary item")
		self.assertEqual(c["status"], "Partially Approved")
		c = api.claim_action(name, "settle", received_amount=approved, mode_of_payment="Cash", reference_no="CHQ-1")
		self.assertEqual(c["status"], "Settled")
		self.assertEqual(flt(frappe.db.get_value("Sales Invoice", slip.payer_invoice, "outstanding_amount")), 0)  # deduction written off
		self.assertTrue(c["payment_entry"])

	def test_rejected_part_billed_to_patient(self):
		frappe.db.set_single_value("Clinic Settings", "bill_rejected_to_patient", 1)
		frappe.clear_document_cache("Clinic Settings")
		ins, p, slip, name = self.claim_for()
		claimed = flt(frappe.db.get_value("Insurance Claim", name, "claimed_amount"))
		api.claim_action(name, "submit")
		api.claim_action(name, "decide", approved_amount=claimed - 300, reason="Excluded")
		c = api.claim_action(name, "settle", received_amount=claimed - 300, mode_of_payment="Cash")
		self.assertTrue(c["journal_entry"] and c["rejected_to_patient"])
		self.assertAlmostEqual(payers.party_balance(frappe.db.get_value("Patient", p, "customer")), 300, places=0)  # patient now owes it


class TestExpenses(Base):
	def test_w8_two_level_approval_posts_journal(self):
		from hospital_vvs.services import expenses as exp

		exp.ensure_setup()
		frappe.set_user("reception@vvs.demo")
		name = api.save_expense(frappe.as_json({"category": "Utilities", "amount": 20000, "payee": "LESCO", "mode_of_payment": "Cash",
			"description": "Electricity bill October", "receipt": "/files/lesco.jpg"}), submit=1)
		e = frappe.get_doc("Expense", name)
		self.assertEqual((e.status, [a.role for a in e.approvals]), ("Pending Approval", ["PW Cash Supervisor", "PW Accountant"]))
		with self.assertRaises(frappe.PermissionError):
			api.expense_action(name, 1)  # requester cannot approve
		frappe.set_user("accounts@vvs.demo")
		with self.assertRaises(frappe.PermissionError):
			api.expense_action(name, 1)  # level 1 is the cash supervisor
		frappe.set_user("supervisor@vvs.demo")
		api.expense_action(name, 1, "Checked bill")
		frappe.set_user("accounts@vvs.demo")
		e = frappe.get_doc("Expense", api.expense_action(name, 1)["name"])
		self.assertEqual(e.status, "Approved")
		je = frappe.get_doc("Journal Entry", e.journal_entry)
		acc = frappe.db.get_value("Expense Category", "Utilities", "expense_account")
		self.assertEqual(je.docstatus, 1)
		self.assertTrue(any(a.account == acc and flt(a.debit) == 20000 for a in je.accounts))

	def test_receipt_required_and_reject_needs_reason(self):
		frappe.set_user("reception@vvs.demo")
		with self.assertRaises(frappe.ValidationError):
			api.save_expense(frappe.as_json({"category": "Utilities", "amount": 500, "payee": "X", "mode_of_payment": "Cash", "description": "No bill"}), submit=1)
		name = api.save_expense(frappe.as_json({"category": "Utilities", "amount": 500, "payee": "X", "mode_of_payment": "Cash", "description": "Bill", "receipt": "/files/x.jpg"}), submit=1)
		frappe.set_user("supervisor@vvs.demo")
		with self.assertRaises(frappe.ValidationError):
			api.expense_action(name, 0)
		self.assertEqual(api.expense_action(name, 0, "Duplicate")["status"], "Rejected")


class TestRecurringExpense(Base):
	"""Recurring expense templates (D-54): drafted when due, one per period, into the normal approval flow."""

	def template(self, **kw):
		from hospital_vvs.services import expenses as exp

		exp.ensure_setup()
		cat = frappe.get_all("Expense Category", pluck="name", limit=1)[0]
		return frappe.get_doc(dict({"doctype": "Recurring Expense", "title": "QA rent", "category": cat, "amount": 50000, "payee": "QA Landlord",
			"mode_of_payment": "Cash", "branch": "Lahore Main", "frequency": "Monthly", "next_date": frappe.utils.add_months(frappe.utils.today(), -2),
			"description": "Building rent", "requested_by": "accounts@vvs.demo"}, **kw)).insert()

	def test_catches_up_missed_months_once(self):
		from hospital_vvs.services import expenses as exp

		t = self.template()
		made = exp.run_recurring(template=t.name)
		self.assertEqual(len(made), 3)  # two missed months + this month
		self.assertEqual(exp.run_recurring(template=t.name), [])  # re-run makes nothing
		rows = frappe.get_all("Expense", filters={"recurring_expense": t.name}, fields=["status", "amount", "description"])
		self.assertTrue(all(r.status == "Draft" and r.amount == 50000 and "Building rent — " in r.description for r in rows))
		self.assertGreater(frappe.utils.getdate(frappe.db.get_value("Recurring Expense", t.name, "next_date")), frappe.utils.getdate())

	def test_standing_bill_goes_to_approval_and_end_date_stops(self):
		from hospital_vvs.services import expenses as exp

		t = self.template(receipt="/private/files/qa-rent-agreement.pdf", auto_submit=1, frequency="Weekly", next_date=frappe.utils.add_days(frappe.utils.today(), -7),
			end_date=frappe.utils.add_days(frappe.utils.today(), -3))
		made = exp.run_recurring(template=t.name)
		self.assertEqual(len(made), 1)
		self.assertEqual(frappe.db.get_value("Expense", made[0], "status"), "Pending Approval")
		self.assertEqual(frappe.db.get_value("Recurring Expense", t.name, "is_active"), 0)

	def test_only_accountant_manages_templates(self):
		frappe.set_user("cashier@vvs.demo")
		self.assertRaises(frappe.PermissionError, api.save_recurring_expense, "{}")
		self.assertRaises(frappe.PermissionError, api.run_recurring_now)
