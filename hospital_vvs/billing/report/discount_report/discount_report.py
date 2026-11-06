import frappe
from frappe import _

from hospital_vvs.report_utils import bar, branch_sql, dates


def execute(filters=None):
	f, frm, to = dates(filters)
	bsql, args = branch_sql(f)
	rows = frappe.db.sql(f"""select requested_by, billing_type, reason, status, count(*) n, sum(discount_amount) amount,
		round(avg(discount_percent),1) avg_percent, group_concat(distinct approved_by) approvers
		from `tabDiscount Authorization` where date(creation) between %(frm)s and %(to)s {bsql}
		group by requested_by, billing_type, reason, status order by amount desc""", dict(args, frm=frm, to=to), as_dict=True)
	cols = [{"fieldname": "requested_by", "label": _("User"), "fieldtype": "Link", "options": "User", "width": 180},
		{"fieldname": "billing_type", "label": _("Billing type"), "width": 100}, {"fieldname": "reason", "label": _("Reason"), "width": 220},
		{"fieldname": "status", "label": _("Status"), "width": 100}, {"fieldname": "n", "label": _("Count"), "fieldtype": "Int", "width": 70},
		{"fieldname": "amount", "label": _("Amount"), "fieldtype": "Currency", "width": 110},
		{"fieldname": "avg_percent", "label": _("Avg %"), "fieldtype": "Percent", "width": 80},
		{"fieldname": "approvers", "label": _("Approved by"), "width": 180}]
	by_user = {}
	for r in rows:
		by_user[r.requested_by] = by_user.get(r.requested_by, 0) + (r.amount or 0)
	chart = bar(list(by_user), [{"name": _("Discount"), "values": list(by_user.values())}])
	return cols, rows, None, chart
