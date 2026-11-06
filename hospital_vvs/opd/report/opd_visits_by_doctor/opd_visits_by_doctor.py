import frappe
from frappe import _

from hospital_vvs.report_utils import bar, branch_sql, dates


def execute(filters=None):
	f, frm, to = dates(filters)
	bsql, args = branch_sql(f, "s.")
	rows = frappe.db.sql(f"""select s.doctor, s.doctor_name, d.department, count(*) visits, sum(s.purpose!='Follow-up') new_visits,
		sum(s.purpose='Follow-up') follow_up, sum(s.is_free_follow_up) free_follow_up,
		round(avg(timestampdiff(minute, q.creation, coalesce(q.called_at, q.started_at))),1) avg_wait,
		round(avg(timestampdiff(minute, q.started_at, q.completed_at)),1) avg_consult,
		sum(s.net_total) revenue, sum(s.discount_amount) discount
		from `tabOPD Slip` s left join tabDoctor d on d.name=s.doctor left join `tabQueue Entry` q on q.name=s.queue_entry
		where s.docstatus=1 and s.posting_date between %(frm)s and %(to)s {bsql}
		group by s.doctor order by visits desc""", dict(args, frm=frm, to=to), as_dict=True)
	cols = [
		{"fieldname": "doctor", "label": _("Doctor"), "fieldtype": "Link", "options": "Doctor", "width": 110},
		{"fieldname": "doctor_name", "label": _("Name"), "width": 170},
		{"fieldname": "department", "label": _("Department"), "fieldtype": "Link", "options": "Medical Department", "width": 140},
		{"fieldname": "visits", "label": _("Visits"), "fieldtype": "Int", "width": 80},
		{"fieldname": "new_visits", "label": _("New"), "fieldtype": "Int", "width": 70},
		{"fieldname": "follow_up", "label": _("Follow-up"), "fieldtype": "Int", "width": 90},
		{"fieldname": "free_follow_up", "label": _("Free"), "fieldtype": "Int", "width": 70},
		{"fieldname": "avg_wait", "label": _("Avg wait (min)"), "fieldtype": "Float", "width": 110},
		{"fieldname": "avg_consult", "label": _("Avg consult (min)"), "fieldtype": "Float", "width": 120},
		{"fieldname": "revenue", "label": _("Revenue"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "discount", "label": _("Discount"), "fieldtype": "Currency", "width": 110},
	]
	chart = bar([r.doctor_name for r in rows], [{"name": _("New"), "values": [r.new_visits for r in rows]},
		{"name": _("Follow-up"), "values": [r.follow_up for r in rows]}])
	return cols, rows, None, chart
