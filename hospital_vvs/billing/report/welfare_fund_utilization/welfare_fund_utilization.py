from frappe import _

from hospital_vvs.services.payers import fund_report


def execute(filters=None):
	"""Donations, use and balance per welfare / zakat fund (07, 10)."""
	rows = fund_report()
	cols = [{"fieldname": "name", "label": _("Scheme"), "fieldtype": "Link", "options": "Welfare Scheme", "width": 200}, {"fieldname": "fund_type", "label": _("Fund"), "width": 100},
		{"fieldname": "coverage_percent", "label": _("Covers %"), "fieldtype": "Percent", "width": 80}, {"fieldname": "donations", "label": _("Donations"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "used", "label": _("Used"), "fieldtype": "Currency", "width": 120}, {"fieldname": "balance", "label": _("Balance"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "patients", "label": _("Patients"), "fieldtype": "Int", "width": 80}, {"fieldname": "approved", "label": _("Approved"), "fieldtype": "Int", "width": 80},
		{"fieldname": "pending", "label": _("Pending"), "fieldtype": "Int", "width": 80}]
	chart = {"data": {"labels": [r["name"] for r in rows], "datasets": [{"name": _("Used"), "values": [r["used"] for r in rows]}, {"name": _("Balance"), "values": [r["balance"] for r in rows]}]}, "type": "bar"}
	return cols, rows, None, chart
