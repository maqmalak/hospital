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
	# contract pharmacy sales are the contractor's money (D-38): hospital figures exclude its company
	ex = frappe.db.get_single_value("Clinic Settings", "pharmacy_company") or "-"

	visits = frappe.db.sql("""select count(*) total, sum(purpose='Follow-up') follow_up, sum(is_free_follow_up) free_follow_up,
		coalesce(sum(net_total),0) billed, coalesce(sum(discount_amount),0) discount from `tabOPD Slip`
		where docstatus=1 and branch=%s and posting_date=%s""", a, as_dict=True)[0]
	new_patients = _scalar("select count(*) from tabPatient where branch=%s and date(creation)=%s", a)

	revenue_type = frappe.db.sql("""select coalesce(hv_billing_type,'Other') label, sum(grand_total) value from `tabSales Invoice`
		where docstatus=1 and is_return=0 and branch=%s and posting_date=%s and company!=%s group by hv_billing_type order by value desc""", a + (ex,), as_dict=True)
	revenue_mode = frappe.db.sql("""select p.mode_of_payment label, sum(p.amount) value from `tabSales Invoice Payment` p
		join `tabSales Invoice` si on si.name=p.parent where si.docstatus=1 and si.branch=%s and si.posting_date=%s and si.company!=%s
		group by p.mode_of_payment order by value desc""", a + (ex,), as_dict=True)
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


# ------------------------------------------------------------------ Desktop (/pw-home), realestate-style home
def _routes():
	from hospital_vvs.api.session import allowed_routes

	return {r["route"] for r in allowed_routes()}


@frappe.whitelist()
def home(branch=None):
	"""Post-login Desktop: what needs the user's attention (only for screens they can open), live counts per app tile,
	approvals waiting, recent activity, the last 7 days of OPD visits and documents per module."""
	from frappe.utils import add_to_date, now_datetime

	from hospital_vvs.utils import has_any_role, is_admin, scope_branch

	require_roles(*R.ALL)
	branch = scope_branch(branch) or default_branch()
	can = _routes()
	admin = is_admin()
	ok = lambda route: admin or route in can  # noqa: E731
	d0, now = today(), now_datetime()
	ex = frappe.db.get_single_value("Clinic Settings", "pharmacy_company") or "-"
	cnt = lambda dt, f: frappe.db.count(dt, f)  # noqa: E731
	alerts = []

	def alert(key, route, label, meta, n, amount=None):
		if n and ok(route):
			alerts.append({"key": key, "to": route, "label": label, "meta": meta, "n": n, "amount": amount})

	b = {"branch": branch}
	alert("critical", "/lab/verify", "Critical lab values not logged", "Tell the doctor and log the read-back", cnt("Lab Result", {**b, "has_critical": 1, "critical_logged": 0, "status": ["!=", "Cancelled"]}))
	alert("stale_shifts", "/cash/approvals", "Shifts left open from an earlier day", "Close them before today's billing", cnt("POS Opening Entry", {"status": "Open", "docstatus": 1, "posting_date": ["<", d0]}))
	alert("discounts", "/billing/discount-approvals", "Discount requests waiting", "Above the cashier's limit", cnt("Discount Authorization", {"status": "Pending"}))
	alert("closings", "/cash/approvals", "Shift closings to approve", "Short or excess beyond tolerance", cnt("Shift Closing", {"status": "Pending Approval"}))
	alert("drops", "/cash/approvals", "Cash drops to confirm", "Cash handed to the safe", cnt("Cash Movement", {"status": "Pending Confirmation"}))
	alert("doses", "/ipd/mar", "Medicine doses overdue", "Scheduled more than 30 min ago, not charted",
		cnt("MAR Entry", {"status": ["in", ["Scheduled", "Approved"]], "scheduled_at": ["between", [add_to_date(now, hours=-24), add_to_date(now, minutes=-30)]]}))
	alert("er", "/er", "Emergency patients not triaged", "Waiting in ER", cnt("ER Visit", {**b, "status": "Waiting", "triage_level": ["in", ["", None]]}) if frappe.db.has_column("ER Visit", "triage_level") else 0)
	alert("vitals", "/opd/vitals", "Patients waiting for vitals", "Token issued, nurse next", cnt("Queue Entry", {**b, "queue_date": d0, "status": "Vitals"}))
	alert("waiting", "/physician-queue", "Patients waiting for a doctor", "Vitals done", cnt("Queue Entry", {**b, "queue_date": d0, "status": "Waiting"}))
	alert("verify", "/lab/verify", "Lab results to verify", "Entered, waiting for the pathologist", cnt("Lab Result", {**b, "status": "Result Entered"}))
	alert("samples", "/lab/samples", "Lab samples to collect", "Paid orders without a sample", cnt("Lab Sample", {**b, "status": "Pending"}))
	alert("discharge", "/ipd", "Discharges pending", "Bill, summary or dues open", cnt("Bed Allotment", {**b, "status": "Discharge Pending"}))
	alert("preauth", "/ipd/pre-auth", "Insurance pre-auths waiting", "Requested, no decision yet", cnt("Insurance Pre-Auth", {"status": "Requested"}))
	alert("expenses", "/expenses", "Expenses waiting for approval", "Bills with receipts", cnt("Expense", {"status": "Pending Approval"}))
	alert("pharmacy", "/pharmacy/tickets", "Pharmacy tickets in progress", "Pick → review → handover", cnt("Dispense Ticket", {**b, "status": ["in", ["Queued", "Picking", "Picked", "Reviewing", "Ready", "Exception"]]}) if frappe.db.has_column("Dispense Ticket", "branch") else 0)
	alert("ov", "/ov-staff", "Online visit requests", "Waiting to be accepted", cnt("Online Visit Request", {"status": "Pending"}))
	alert("feedback", "/feedback", "Low ratings to follow up", "Patients who rated 1–2", cnt("Patient Feedback", {"follow_up": "Open"}))

	# approvals the user can act on
	approvals = []
	if has_any_role(R.CASH_SUPERVISOR, R.ACCOUNTANT):
		for r in frappe.get_all("Discount Authorization", filters={"status": "Pending"}, fields=["name", "billing_type", "discount_amount", "reason", "requested_by", "creation"],
			order_by="creation desc", limit=6):
			approvals.append({"doctype": "Discount Authorization", "name": r.name, "title": f"{r.billing_type} · {r.reason or ''}", "amount": r.discount_amount,
				"state": "Discount", "since": str(r.creation), "can_approve": r.requested_by != frappe.session.user, "to": "/billing/discount-approvals"})
	if has_any_role(R.CASH_SUPERVISOR):
		for r in frappe.get_all("Shift Closing", filters={"status": "Pending Approval"}, fields=["name", "cashier", "difference", "creation"], order_by="creation desc", limit=4) \
				if frappe.db.has_column("Shift Closing", "cashier") else []:
			approvals.append({"doctype": "Shift Closing", "name": r.name, "title": r.cashier, "amount": abs(flt(r.difference)), "state": "Shift closing",
				"since": str(r.creation), "can_approve": False, "to": "/cash/approvals"})

	# recent activity (last 7 days), only the kinds of record the user works with
	since = add_days(d0, -6)
	feed_src = [
		("OPD Slip", "opd", "/opd_slip", "patient_name", "net_total", "doctor_name", {"docstatus": 1}),
		("Prescription", "opd", "/pw-prescription", "patient_name", None, "doctor_name", {"docstatus": 1}),
		("Test Invoice", "lab", "/lab/orders", "patient_name", "net_total", "status", {"docstatus": ["<", 2]}),
		("Bed Allotment", "ipd", "/ipd", "patient_name", None, "status", {}),
		("ER Visit", "ipd", "/er", "patient_name", None, "status", {}),
		("Expense", "finance", "/expenses", "payee", "amount", "status", {}),
	]
	activity = []
	for dt, cat, route, title, amount, status, extra in feed_src:
		if not ok(route) or not frappe.db.table_exists(dt):
			continue
		meta = frappe.get_meta(dt)
		fields = ["name", "owner", "creation", f"`{title}` as title"] + ([f"`{amount}` as amount"] if amount else []) + ([f"`{status}` as status"] if meta.has_field(status) else [])
		f = {"creation": [">=", since], **extra}
		if meta.has_field("branch"):
			f["branch"] = branch
		for r in frappe.get_all(dt, filters=f, fields=fields, order_by="creation desc", limit=12):
			to = {"Prescription": f"/pw-prescription?rx={r.name}", "Bed Allotment": f"/ipd/{r.name}"}.get(dt, route)
			activity.append({"doctype": dt, "name": r.name, "category": cat, "title": r.title, "amount": r.get("amount"), "status": r.get("status") or ("Submitted" if dt != "Bed Allotment" else ""),
				"owner": r.owner, "at": str(r.creation), "to": to})
	activity.sort(key=lambda a: a["at"], reverse=True)
	activity = activity[:40]
	names = {u.name: u.full_name for u in frappe.get_all("User", filters={"name": ["in", list({a["owner"] for a in activity}) or [""]]}, fields=["name", "full_name"])}
	for a in activity:
		a["owner_name"] = names.get(a["owner"], a["owner"])

	# last 7 days of OPD visits
	per_day = {str(r.d): r.n for r in frappe.db.sql("""select posting_date d, count(*) n from `tabOPD Slip` where docstatus=1 and branch=%s and posting_date>=%s
		group by posting_date""", (branch, since), as_dict=True)}
	days = [{"date": str(add_days(since, i)), "count": cint(per_day.get(str(add_days(since, i))))} for i in range(7)]

	# documents created per module
	MODS = {"OPD": [("OPD Slip", {"docstatus": 1}), ("Prescription", {"docstatus": 1})], "Lab": [("Test Invoice", {"docstatus": ["<", 2]})],
		"IPD": [("Bed Allotment", {}), ("IPD Charge", {})], "ER": [("ER Visit", {})], "Pharmacy": [("Sales Invoice", {"docstatus": 1, "company": ex})],
		"Finance": [("Expense", {}), ("Payment Entry", {"docstatus": 1})], "Appointments": [("Appointment", {})]}
	counts = {}
	for key, start in (("today", d0), ("week", since), ("month", add_days(d0, -29))):
		counts[key] = {m: sum(frappe.db.count(dt, {**f, "creation": [">=", start]}) for dt, f in src if frappe.db.table_exists(dt)) for m, src in MODS.items()}
		counts[key] = {m: n for m, n in counts[key].items() if n}

	visits_today = cnt("OPD Slip", {**b, "posting_date": d0, "docstatus": 1})
	in_hospital = cnt("Bed Allotment", {**b, "status": ["in", ["Admitted", "Discharge Pending"]]})
	money_role = has_any_role(R.ACCOUNTANT, R.CASH_SUPERVISOR, R.RECEPTIONIST)
	collected = _scalar("""select coalesce(sum(paid_amount),0) from `tabSales Invoice` where docstatus=1 and posting_date=%s and company!=%s and branch=%s""", (d0, ex, branch)) \
		if money_role else None
	stats = {"visits_today": visits_today, "in_hospital": in_hospital, "collected_today": collected,
		"lab_today": cnt("Test Invoice", {**b, "posting_date": d0, "docstatus": ["<", 2]}) if frappe.db.has_column("Test Invoice", "posting_date") else 0}

	tiles = {}

	def tile(route, value, label):
		if ok(route):
			tiles[route] = {"value": cint(value), "label": label}

	tile("/physician-queue", cnt("Queue Entry", {**b, "queue_date": d0, "status": ["in", ["Waiting", "Called", "In Consultation"]]}), "waiting")
	tile("/opd/vitals", cnt("Queue Entry", {**b, "queue_date": d0, "status": "Vitals"}), "at vitals")
	tile("/opd_slip", visits_today, "today")
	tile("/registration", cnt("Patient", {**b, "creation": [">=", d0]}), "new today")
	tile("/ipd", in_hospital, "in hospital")
	tile("/ward", cnt("Hospital Bed", {**b, "status": "Available", "is_active": 1}), "beds free")
	tile("/er", cnt("ER Visit", {**b, "status": ["!=", "Disposed"]}), "in ER")
	tile("/lab/orders", stats["lab_today"], "today")
	tile("/lab/verify", cnt("Lab Result", {**b, "status": "Result Entered"}), "to verify")
	tile("/lab/samples", cnt("Lab Sample", {**b, "status": "Pending"}), "to collect")
	tile("/appointments", cnt("Appointment", {"appointment_date": d0, "status": ["not in", ["Cancelled", "Rejected"]]}), "today")
	tile("/medicine_invoice", cnt("Sales Invoice", {"posting_date": d0, "docstatus": 1, "company": ex}), "sales today")
	tile("/billing/discount-approvals", cnt("Discount Authorization", {"status": "Pending"}), "pending")
	tile("/expenses", cnt("Expense", {"status": "Pending Approval"}), "to approve")
	tile("/cash/approvals", cnt("Shift Closing", {"status": "Pending Approval"}) + cnt("Cash Movement", {"status": "Pending Confirmation"}), "waiting")
	tile("/ov-staff", cnt("Online Visit Request", {"status": "Pending"}), "new")
	tile("/ipd/mar", cnt("MAR Entry", {"status": ["in", ["Scheduled", "Approved"]], "scheduled_at": ["between", [now, add_to_date(now, hours=1)]]}), "due in 1 h")

	todos = {"open": cnt("ToDo", {"allocated_to": frappe.session.user, "status": "Open"}),
		"overdue": cnt("ToDo", {"allocated_to": frappe.session.user, "status": "Open", "date": ["<", d0]})}
	return {"branch": branch, "alerts": alerts, "approvals": approvals, "activity": activity, "days": days, "module_mix": {"counts": counts},
		"stats": stats, "tiles": tiles, "todos": todos}
