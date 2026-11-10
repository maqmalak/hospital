"""Doctors board: every doctor with weekly schedule, today's queue, leave and upcoming bookings (one call, no N+1)."""

import frappe
from frappe.utils import add_days, getdate, today

from hospital_vvs import roles as R
from hospital_vvs.utils import require_roles, scope_branch

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@frappe.whitelist()
def board(branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(R.RECEPTIONIST, R.DOCTOR, R.NURSE, R.DEO)
	docs = frappe.get_all("Doctor", fields=["name", "doctor_name", "doctor_name_ur", "specialization", "department", "doctor_type", "branch",
		"default_fee", "follow_up_fee", "consultation_room", "color", "photo", "is_active", "qualification", "registration_no", "user",
		"revisit_days"], order_by="is_active desc, doctor_name")
	names = [d.name for d in docs] or [""]
	t = today()
	sched = frappe.get_all("Doctor Schedule", filters={"parent": ["in", names], "parenttype": "Doctor"},
		fields=["parent", "day", "start_time", "end_time", "branch"], order_by="idx")
	queue = {r.doctor: r for r in frappe.db.sql("""select doctor, count(*) total, sum(status='Waiting') waiting,
		sum(status in ('Called','In Consultation')) with_doctor, sum(status='Done') done from `tabQueue Entry`
		where queue_date=%s group by doctor""", t, as_dict=True)}
	appts = {r.doctor: r.n for r in frappe.db.sql("""select doctor, count(*) n from tabAppointment
		where appointment_date between %s and %s and status in ('Pending','Confirmed') group by doctor""", (t, add_days(t, 7)), as_dict=True)}
	leave = {}
	for l in frappe.get_all("Doctor Leave", filters={"to_date": [">=", t]}, fields=["doctor", "from_date", "to_date", "reason"], order_by="from_date"):
		leave.setdefault(l.doctor, l)
	dept_color = {d.name: d.color for d in frappe.get_all("Medical Department", fields=["name", "color"])}
	month = frappe.db.sql("""select doctor, count(*) visits, sum(net_total) revenue from `tabOPD Slip` where docstatus=1
		and posting_date >= %s group by doctor""", add_days(t, -29), as_dict=True)
	month = {r.doctor: r for r in month}
	weekday = DAYS[getdate(t).weekday()]
	for d in docs:
		d["schedule"] = [s for s in sched if s.parent == d.name]
		q = queue.get(d.name) or {}
		d["today"] = {k: int(q.get(k) or 0) for k in ("total", "waiting", "with_doctor", "done")}
		d["upcoming"] = appts.get(d.name, 0)
		l = leave.get(d.name)
		d["leave"] = {"from": str(l.from_date), "to": str(l.to_date), "reason": l.reason} if l else None
		d["on_leave"] = bool(l and str(l.from_date) <= t)
		d["works_today"] = any(s.day == weekday for s in d["schedule"])
		d["dept_color"] = dept_color.get(d.department)
		m = month.get(d.name) or {}
		d["month_visits"] = int(m.get("visits") or 0)
		d["month_revenue"] = float(m.get("revenue") or 0)
	if branch:
		docs = [d for d in docs if not d.branch or d.branch == branch]
	return docs
