import frappe
from frappe import _

from hospital_vvs.report_utils import bar, branch_sql, dates


def execute(filters=None):
	f, frm, to = dates(filters)
	bsql, args = branch_sql(f)
	rows = frappe.db.sql(f"""select source_channel channel, count(*) total, sum(status in ('Confirmed','Arrived','Completed')) confirmed,
		sum(status in ('Arrived','Completed')) came, sum(status='No-show') no_show, sum(status='Cancelled') cancelled,
		sum(status='Rejected') rejected, sum(status='Pending') pending
		from tabAppointment where appointment_date between %(frm)s and %(to)s {bsql} group by source_channel""",
		dict(args, frm=frm, to=to), as_dict=True)
	for r in rows:
		due = (r.came or 0) + (r.no_show or 0)
		r["no_show_rate"] = round((r.no_show or 0) * 100 / due, 1) if due else 0
	cols = [{"fieldname": "channel", "label": _("Channel"), "width": 120}] + [
		{"fieldname": k, "label": l, "fieldtype": "Int", "width": 100} for k, l in (("total", _("Total")), ("confirmed", _("Confirmed")),
			("came", _("Came")), ("no_show", _("No-show")), ("cancelled", _("Cancelled")), ("rejected", _("Rejected")), ("pending", _("Pending")))
	] + [{"fieldname": "no_show_rate", "label": _("No-show %"), "fieldtype": "Percent", "width": 100}]
	chart = bar([r.channel for r in rows], [{"name": _("Bookings"), "values": [r.total for r in rows]}], "pie")
	return cols, rows, None, chart
