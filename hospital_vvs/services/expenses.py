"""Expenses with approval levels (07-billing-finance.md, W8, D-46).

Clinic Settings → Expenses → approval levels (level, role, from amount). An expense needs every level whose amount it reaches,
in order; the last approval posts a Journal Entry: Dr the category's expense account (and cost center), Cr the cash / bank
account of the payment mode. Petty cash out of a drawer stays a Cash Movement (05-cash.md).
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, nowdate, today

from hospital_vvs.utils import is_admin, setting, user_roles


def levels_for(amount):
	rows = frappe.get_all("Expense Approval Level", filters={"parent": "Clinic Settings", "parenttype": "Clinic Settings"}, fields=["level", "role", "min_amount"], order_by="level")
	need = [r for r in rows if flt(amount) >= flt(r.min_amount)]
	return need or [frappe._dict(level=1, role="PW Accountant", min_amount=0)]


def submit(name):
	e = frappe.get_doc("Expense", name)
	if e.status not in ("Draft", "Rejected"):
		frappe.throw(_("Expense {0} is already {1}.").format(name, e.status))
	if flt(e.amount) <= 0:
		frappe.throw(_("Enter the amount."))
	if not e.receipt:
		frappe.throw(_("Attach the receipt or bill."))
	e.set("approvals", [{"level": r.level, "role": r.role} for r in levels_for(e.amount)])
	e.status, e.current_level, e.requested_by = "Pending Approval", e.approvals[0].level, e.requested_by or frappe.session.user
	e.company = e.company or setting("company") or frappe.defaults.get_global_default("company")
	e.save(ignore_permissions=True)
	return e


def _current(e):
	return next((a for a in e.approvals if not a.action), None)


def can_act(e, user=None):
	user = user or frappe.session.user
	a = _current(e)
	if not a or e.status != "Pending Approval":
		return False
	if user == e.requested_by and not is_admin(user):
		return False  # nobody approves their own expense
	return is_admin(user) or a.role in user_roles(user)


def act(name, approve=True, note=None):
	e = frappe.get_doc("Expense", name)
	if not can_act(e):
		frappe.throw(_("This expense is not waiting for your approval."), frappe.PermissionError)
	a = _current(e)
	a.action, a.approver, a.acted_on, a.note = ("Approved" if approve else "Rejected"), frappe.session.user, now_datetime(), note
	if not approve:
		if not (note or "").strip():
			frappe.throw(_("Give the reason for rejecting."))
		e.status = "Rejected"
	else:
		nxt = _current(e)
		if nxt:
			e.current_level = nxt.level
		else:
			e.status, e.current_level = "Approved", 0
			e.journal_entry = post(e)
	e.save(ignore_permissions=True)
	return e


def post(e):
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

	cat = frappe.get_doc("Expense Category", e.category)
	company = e.company or setting("company") or frappe.defaults.get_global_default("company")
	from hospital_vvs.services.shifts import company_account

	exp_acc = company_account(cat.expense_account, company)
	pay_acc = get_bank_cash_account(e.mode_of_payment, company).get("account")
	if not pay_acc:
		frappe.throw(_("Mode of payment {0} has no account for {1}.").format(e.mode_of_payment, company))
	cc = cat.cost_center or frappe.get_cached_value("Company", company, "cost_center")
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": company, "posting_date": e.posting_date or nowdate(),
		"cheque_no": e.reference_no or e.name, "cheque_date": e.posting_date or nowdate(),
		"user_remark": f"Expense {e.name} · {e.category} · {e.payee}: {e.description}",
		"accounts": [{"account": exp_acc, "debit_in_account_currency": flt(e.amount), "cost_center": cc},
			{"account": pay_acc, "credit_in_account_currency": flt(e.amount), "cost_center": cc}]})
	if e.branch and frappe.get_meta("Journal Entry Account").has_field("branch"):
		for row in je.accounts:
			row.branch = e.branch
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name


def ensure_setup():
	"""Default categories and approval levels (idempotent)."""
	company = setting("company") or frappe.defaults.get_global_default("company")
	if not company:
		return
	for name, acc_name in (("Utilities", "Utility Expenses"), ("Repairs & Maintenance", "Office Maintenance Expenses"), ("Office Supplies", "Office Rent"),
		("Staff Welfare", "Miscellaneous Expenses"), ("Travel & Conveyance", "Travel Expenses"), ("Marketing", "Marketing Expenses"), ("Miscellaneous", "Miscellaneous Expenses")):
		if frappe.db.exists("Expense Category", name):
			continue
		acc = frappe.db.get_value("Account", {"company": company, "account_name": acc_name, "is_group": 0}) or \
			frappe.db.get_value("Account", {"company": company, "account_name": "Miscellaneous Expenses", "is_group": 0})
		if acc:
			frappe.get_doc({"doctype": "Expense Category", "category_name": name, "expense_account": acc,
				"cost_center": frappe.get_cached_value("Company", company, "cost_center")}).insert(ignore_permissions=True)
	s = frappe.get_single("Clinic Settings")
	if not s.get("expense_levels"):
		for lvl, role, amt in ((1, "PW Cash Supervisor", 0), (2, "PW Accountant", 10000), (3, "PW Admin", 50000)):
			s.append("expense_levels", {"level": lvl, "role": role, "min_amount": amt})
		s.flags.ignore_permissions = True
		s.save()


# ------------------------------------------------------------------ recurring expenses
STEP = {"Weekly": ("days", 7), "Monthly": ("months", 1), "Quarterly": ("months", 3), "Yearly": ("years", 1)}


def _advance(d, frequency):
	from frappe.utils import add_days, add_months, add_years

	unit, n = STEP.get(frequency, ("months", 1))
	return add_days(d, n) if unit == "days" else add_months(d, n) if unit == "months" else add_years(d, n)


def _period(d, frequency):
	d = getdate(d)
	return {"Weekly": f"week of {d.strftime('%d %b %Y')}", "Quarterly": f"Q{(d.month - 1) // 3 + 1} {d.year}", "Yearly": str(d.year)}.get(frequency, d.strftime("%B %Y"))


def run_recurring(on=None, template=None):
	"""Daily: draft every expense that has fallen due (one per missed period, at most 12 per template per run). Safe to re-run."""
	on = getdate(on or today())
	filters = {"is_active": 1, "next_date": ["<=", on]}
	if template:
		filters["name"] = template
	made = []
	for name in frappe.get_all("Recurring Expense", filters=filters, pluck="name"):
		t = frappe.get_doc("Recurring Expense", name)
		for _ in range(12):
			due = getdate(t.next_date)
			if due > on or (t.end_date and due > getdate(t.end_date)):
				break
			exists = frappe.db.get_value("Expense", {"recurring_expense": t.name, "posting_date": due}, "name")
			e = frappe.get_doc("Expense", exists) if exists else frappe.get_doc({"doctype": "Expense", "category": t.category, "amount": t.amount,
				"posting_date": due, "payee": t.payee, "mode_of_payment": t.mode_of_payment, "branch": t.branch, "receipt": t.receipt,
				"description": f"{t.description} — {_period(due, t.frequency)}", "requested_by": t.requested_by or t.owner, "recurring_expense": t.name,
				"status": "Draft"}).insert(ignore_permissions=True)
			if not exists:
				made.append(e.name)
				if cint(t.auto_submit) and t.receipt:
					submit(e.name)
				_tell(t, e)
			t.db_set({"next_date": _advance(due, t.frequency), "last_expense": e.name, "last_run": on})
			t.reload()
		if t.end_date and getdate(t.next_date) > getdate(t.end_date):
			t.db_set("is_active", 0)
	if made and not frappe.in_test:
		frappe.db.commit()
	return made


def _tell(t, e):
	user = t.requested_by or t.owner
	if not user or user == "Administrator":
		return
	waiting = e.status == "Draft"
	frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "document_type": "Expense", "document_name": e.name,
		"subject": f"{t.title}: {e.name} {'is waiting for its bill' if waiting else 'was sent for approval'} ({e.amount:,.0f})"}).insert(ignore_permissions=True)


def scheduled():
	run_recurring()
