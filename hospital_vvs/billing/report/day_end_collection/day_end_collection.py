"""Day-end collection by counter (POS Profile), cashier and payment mode."""

import frappe
from frappe import _

from hospital_vvs.report_utils import bar, branch_sql, dates


def execute(filters=None):
	f, frm, to = dates(filters)
	if not (filters or {}).get("from_date"):
		frm = to
	bsql, args = branch_sql(f, "si.")
	rows = frappe.db.sql(f"""select si.pos_profile counter, si.owner cashier, p.mode_of_payment mode, count(distinct si.name) invoices,
		sum(case when si.is_return=0 then p.amount else 0 end) collected, sum(case when si.is_return=1 then -p.amount else 0 end) refunded,
		sum(p.amount) net from `tabSales Invoice Payment` p join `tabSales Invoice` si on si.name=p.parent
		where si.docstatus=1 and si.is_pos=1 and si.posting_date between %(frm)s and %(to)s {bsql}
		group by si.pos_profile, si.owner, p.mode_of_payment order by counter, cashier""", dict(args, frm=frm, to=to), as_dict=True)
	cols = [{"fieldname": "counter", "label": _("Counter"), "fieldtype": "Link", "options": "POS Profile", "width": 150},
		{"fieldname": "cashier", "label": _("Cashier"), "fieldtype": "Link", "options": "User", "width": 190},
		{"fieldname": "mode", "label": _("Mode"), "width": 120}, {"fieldname": "invoices", "label": _("Invoices"), "fieldtype": "Int", "width": 80},
		{"fieldname": "collected", "label": _("Collected"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "refunded", "label": _("Refunded"), "fieldtype": "Currency", "width": 110},
		{"fieldname": "net", "label": _("Net"), "fieldtype": "Currency", "width": 120}]
	modes = {}
	for r in rows:
		modes[r.mode] = modes.get(r.mode, 0) + (r.net or 0)
	return cols, rows, None, bar(list(modes), [{"name": _("Net"), "values": list(modes.values())}], "pie")
