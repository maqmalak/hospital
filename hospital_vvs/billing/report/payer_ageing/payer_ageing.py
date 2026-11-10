import frappe
from frappe import _

from hospital_vvs.services.payers import ageing


def execute(filters=None):
	"""Panel / insurance / welfare fund receivables by age (07, 10)."""
	rows = ageing()
	cols = [{"fieldname": "customer", "label": _("Payer"), "fieldtype": "Link", "options": "Customer", "width": 220}, {"fieldname": "group", "label": _("Type"), "width": 110},
		{"fieldname": "d0_30", "label": _("0-30 days"), "fieldtype": "Currency", "width": 110}, {"fieldname": "d31_60", "label": _("31-60"), "fieldtype": "Currency", "width": 110},
		{"fieldname": "d61_90", "label": _("61-90"), "fieldtype": "Currency", "width": 110}, {"fieldname": "d90", "label": _("Over 90"), "fieldtype": "Currency", "width": 110},
		{"fieldname": "total", "label": _("Total"), "fieldtype": "Currency", "width": 120}]
	chart = {"data": {"labels": [_("0-30"), _("31-60"), _("61-90"), _("90+")], "datasets": [{"name": _("Outstanding"), "values": [sum(r[k] for r in rows) for k in ("d0_30", "d31_60", "d61_90", "d90")]}]}, "type": "bar"}
	return cols, rows, None, chart
