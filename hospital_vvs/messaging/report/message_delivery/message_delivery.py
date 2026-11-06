import frappe
from frappe import _

from hospital_vvs.report_utils import bar, dates


def execute(filters=None):
	f, frm, to = dates(filters)
	rows = frappe.db.sql("""select ifnull(event,'(free text)') event, channel, count(*) total,
		sum(status in ('Sent','Delivered','Read')) sent, sum(status in ('Delivered','Read')) delivered, sum(status='Read') read_count,
		sum(status='Failed') failed, sum(status='Skipped') skipped
		from `tabMessage Log` where direction='Out' and date(creation) between %s and %s group by event, channel order by total desc""",
		(frm, to), as_dict=True)
	for r in rows:
		tried = (r.total or 0) - (r.skipped or 0)
		r["success_rate"] = round((r.sent or 0) * 100 / tried, 1) if tried else 0
	cols = [{"fieldname": "event", "label": _("Event"), "width": 190}, {"fieldname": "channel", "label": _("Channel"), "width": 100}] + [
		{"fieldname": k, "label": l, "fieldtype": "Int", "width": 90} for k, l in (("total", _("Total")), ("sent", _("Sent")),
			("delivered", _("Delivered")), ("read_count", _("Read")), ("failed", _("Failed")), ("skipped", _("Skipped")))] + [
		{"fieldname": "success_rate", "label": _("Success %"), "fieldtype": "Percent", "width": 90}]
	chart = bar([f"{r.event} ({r.channel})" for r in rows[:8]], [{"name": _("Sent"), "values": [r.sent for r in rows[:8]]},
		{"name": _("Failed"), "values": [r.failed for r in rows[:8]]}])
	return cols, rows, None, chart
