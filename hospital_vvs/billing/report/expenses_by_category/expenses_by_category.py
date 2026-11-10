import frappe
from frappe import _

from hospital_vvs.report_utils import bar, branch_sql, dates


def execute(filters=None):
	"""Approved expenses by category and month (07, 10)."""
	f, frm, to = dates(filters)
	bsql, args = branch_sql(f)
	rows = frappe.db.sql(f"""select category, date_format(posting_date, '%%Y-%%m') month, count(*) n, sum(amount) amount
		from tabExpense where status='Approved' and posting_date between %(frm)s and %(to)s {bsql} group by category, month order by month, amount desc""",
		dict(args, frm=frm, to=to), as_dict=True)
	cols = [{"fieldname": "category", "label": _("Category"), "fieldtype": "Link", "options": "Expense Category", "width": 200}, {"fieldname": "month", "label": _("Month"), "width": 90},
		{"fieldname": "n", "label": _("Bills"), "fieldtype": "Int", "width": 70}, {"fieldname": "amount", "label": _("Amount"), "fieldtype": "Currency", "width": 130}]
	by = {}
	for r in rows:
		by[r.category] = by.get(r.category, 0) + (r.amount or 0)
	return cols, rows, None, bar(list(by), [{"name": _("Expenses"), "values": list(by.values())}])
