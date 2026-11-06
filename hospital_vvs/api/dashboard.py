"""Dashboard (/pw-dashboard, 10-reports.md): today's numbers plus trends, by branch."""

import frappe
from frappe.utils import add_days, cint, flt, getdate, today

from hospital_vvs import roles as R
from hospital_vvs.utils import check_branch, default_branch, require_roles


def _scalar(sql, args):
	return frappe.db.sql(sql, args)[0][0] or 0


@frappe.whitelist()
def summary(branch=None, date=None, days=14):
	require_roles(R.DOCTOR, R.ACCOUNTANT, R.CASH_SUPERVISOR)
	branch = branch or default_branch()
	check_branch(branch)
	date = getdate(date or today())
	start = add_days(date, -(cint(days) - 1))
	a = (branch, date)

	visits = frappe.db.sql("""select count(*) total, sum(purpose='Follow-up') follow_up, sum(is_free_follow_up) free_follow_up,
		coalesce(sum(net_total),0) billed, coalesce(sum(discount_amount),0) discount from `tabOPD Slip`
		where docstatus=1 and branch=%s and posting_date=%s""", a, as_dict=True)[0]
	new_patients = _scalar("select count(*) from tabPatient where branch=%s and date(creation)=%s", a)

	revenue_type = frappe.db.sql("""select coalesce(hv_billing_type,'Other') label, sum(grand_total) value from `tabSales Invoice`
		where docstatus=1 and is_return=0 and branch=%s and posting_date=%s group by hv_billing_type order by value desc""", a, as_dict=True)
	revenue_mode = frappe.db.sql("""select p.mode_of_payment label, sum(p.amount) value from `tabSales Invoice Payment` p
		join `tabSales Invoice` si on si.name=p.parent where si.docstatus=1 and si.branch=%s and si.posting_date=%s
		group by p.mode_of_payment order by value desc""", a, as_dict=True)
	credit = _scalar("""select coalesce(sum(grand_total),0) from `tabSales Invoice` where docstatus=1 and is_pos=0 and branch=%s
		and posting_date=%s and hv_is_payer_share=1""", a)

	appts = frappe.db.sql("""select source_channel label, count(*) value, sum(status='No-show') no_show, sum(status in ('Arrived','Completed')) came
		from tabAppointment where branch=%s and appointment_date=%s group by source_channel""", a, as_dict=True)

	queue = frappe.db.sql("""select status, count(*) n,
		avg(timestampdiff(minute, creation, coalesce(called_at, started_at))) wait,
		avg(timestampdiff(minute, started_at, completed_at)) consult
		from `tabQueue Entry` where branch=%s and queue_date=%s group by status""", a, as_dict=True)
	q_tot = {r.status: r.n for r in queue}
	wait = [r.wait for r in queue if r.wait is not None]
	consult = [r.consult for r in queue if r.consult is not None]

	beds = frappe.db.sql("""select status label, count(*) value from `tabHospital Bed` where branch=%s and is_active=1 group by status""",
		(branch,), as_dict=True)
	bed_total = sum(b.value for b in beds)
	occupied = sum(b.value for b in beds if b.label == "Occupied")

	by_doctor = frappe.db.sql("""select s.doctor_name label, count(*) visits, sum(s.purpose='Follow-up') follow_up,
		coalesce(sum(s.net_total),0) revenue,
		avg(timestampdiff(minute, q.started_at, q.completed_at)) consult
		from `tabOPD Slip` s left join `tabQueue Entry` q on q.name=s.queue_entry
		where s.docstatus=1 and s.branch=%s and s.posting_date=%s group by s.doctor order by visits desc""", a, as_dict=True)

	trend = frappe.db.sql("""select posting_date d, count(*) visits, coalesce(sum(net_total),0) revenue from `tabOPD Slip`
		where docstatus=1 and branch=%s and posting_date between %s and %s group by posting_date""", (branch, start, date), as_dict=True)
	tmap = {str(r.d): r for r in trend}
	trend_rows = []
	for i in range(cint(days)):
		d = str(add_days(start, i))
		r = tmap.get(d)
		trend_rows.append({"date": d, "visits": cint(r.visits) if r else 0, "revenue": flt(r.revenue) if r else 0})

	top_dx = frappe.db.sql("""select d.diagnosis_name label, d.diagnosis code, count(*) value from `tabPrescription Diagnosis` d
		join tabPrescription p on p.name=d.parent where p.docstatus=1 and p.branch=%s and p.prescription_date between %s and %s
		group by d.diagnosis order by value desc limit 8""", (branch, add_days(date, -29), date), as_dict=True)
	demo = frappe.db.sql("""select p.gender,
		case when timestampdiff(year,p.dob,curdate())<5 then '0-4' when timestampdiff(year,p.dob,curdate())<15 then '5-14'
		when timestampdiff(year,p.dob,curdate())<30 then '15-29' when timestampdiff(year,p.dob,curdate())<45 then '30-44'
		when timestampdiff(year,p.dob,curdate())<60 then '45-59' else '60+' end band, count(distinct s.patient) n
		from `tabOPD Slip` s join tabPatient p on p.name=s.patient where s.docstatus=1 and s.branch=%s and s.posting_date between %s and %s
		group by p.gender, band""", (branch, add_days(date, -29), date), as_dict=True)
	bands = ["0-4", "5-14", "15-29", "30-44", "45-59", "60+"]
	demographics = [{"band": b, "Male": sum(r.n for r in demo if r.band == b and r.gender == "Male"),
		"Female": sum(r.n for r in demo if r.band == b and r.gender == "Female")} for b in bands]

	pending_discounts = frappe.db.count("Discount Authorization", {"status": "Pending", "branch": branch})
	failed_msgs = frappe.db.count("Message Log", {"status": "Failed", "creation": [">=", add_days(date, -1)]})

	return {
		"branch": branch, "date": str(date),
		"kpi": {
			"visits": cint(visits.total), "new_visits": cint(visits.total) - cint(visits.follow_up), "follow_up": cint(visits.follow_up),
			"free_follow_up": cint(visits.free_follow_up), "new_patients": cint(new_patients), "billed": flt(visits.billed),
			"discount": flt(visits.discount), "collected": sum(flt(r.value) for r in revenue_mode), "payer_credit": flt(credit),
			"waiting": cint(q_tot.get("Waiting")), "with_doctor": cint(q_tot.get("Called")) + cint(q_tot.get("In Consultation")),
			"done": cint(q_tot.get("Done")), "avg_wait": round(sum(wait) / len(wait), 1) if wait else None,
			"avg_consult": round(sum(consult) / len(consult), 1) if consult else None,
			"appointments": sum(cint(r.value) for r in appts), "no_show": sum(cint(r.no_show) for r in appts),
			"beds": bed_total, "occupied": occupied, "occupancy": round(occupied * 100 / bed_total, 1) if bed_total else 0,
			"pending_discounts": pending_discounts, "failed_messages": failed_msgs,
		},
		"revenue_by_type": revenue_type, "revenue_by_mode": revenue_mode, "appointments_by_channel": appts, "beds": beds,
		"by_doctor": by_doctor, "trend": trend_rows, "top_diagnoses": top_dx, "demographics": demographics,
	}
