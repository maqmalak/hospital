"""Finance page (D-64): the accounts dashboard, batch posting and voucher printing."""
import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from hospital_vvs.api import finance
from hospital_vvs.tests.test_phase2 import as_user
from hospital_vvs.utils import branch_company


class TestFinancePage(IntegrationTestCase):
	def setUp(self):
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(as_user, "Administrator")

	def _draft_jv(self):
		company = branch_company("Lahore Main")
		cash = frappe.db.get_value("Account", {"company": company, "account_type": "Cash", "is_group": 0})
		exp = frappe.db.get_value("Account", {"company": company, "root_type": "Expense", "is_group": 0})
		cc = frappe.db.get_value("Company", company, "cost_center")
		je = frappe.get_doc({"doctype": "Journal Entry", "company": company, "posting_date": frappe.utils.today(), "voucher_type": "Cash Entry",
			"user_remark": "Test petty cash", "accounts": [{"account": exp, "debit_in_account_currency": 500, "cost_center": cc},
			{"account": cash, "credit_in_account_currency": 500, "cost_center": cc}]}).insert(ignore_permissions=True)
		return je.name

	def test_dashboard_post_and_print(self):
		jv = self._draft_jv()
		as_user("accounts@vvs.demo")
		d = finance.accounts()
		for k in ("banks", "cash", "payable", "receivable", "profit", "drafts", "recent", "codes", "pdc", "assets", "trend"):
			self.assertIn(k, d)
		draft = next(r for r in d["drafts"] if r["name"] == jv)
		self.assertEqual(draft["code"], "CPV")
		with patch("hospital_vvs.api.finance.frappe.db.rollback"):
			r = finance.post_vouchers(json.dumps([f"Journal Entry::{jv}"]))
		self.assertEqual(r["posted"], [jv])
		self.assertEqual(frappe.db.get_value("Journal Entry", jv, "docstatus"), 1)
		r2 = finance.post_vouchers(json.dumps([f"Journal Entry::{jv}"]))  # already posted: reported, not raised
		self.assertEqual(r2["posted"], [])
		self.assertEqual(r2["failed"][0]["name"], jv)
		with self.assertRaises(frappe.ValidationError):
			finance.post_vouchers(json.dumps(["Sales Invoice::X"]))  # only vouchers

	def test_only_accounts_post(self):
		as_user("reception@vvs.demo")
		with self.assertRaises(frappe.PermissionError):
			finance.accounts()
		as_user("supervisor@vvs.demo")
		finance.accounts()  # the supervisor may look
		with self.assertRaises(frappe.PermissionError):
			finance.post_vouchers(json.dumps(["Journal Entry::X"]))
