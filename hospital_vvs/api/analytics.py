"""Per-app charts for the Dashboard's *App analytics* and each app home (D-68).

app_charts(app, branch, days) returns chart specs the React AnimatedChart draws:
	{"id", "title", "sub", "kind": area | line | bar | stack | hbar, "x": key, "unit": count | rs,
	 "series": [{"key", "label"}], "data": [{x: ..., <series keys>: number}], "total"?: number}
A person gets an app's charts only when they may open at least one of its screens (Page Access Rules), and only for their branch.
A failing chart is logged; the charts built before it still show.
"""

import frappe
from frappe import _
from frappe.utils import add_days, add_months, cint, flt, get_first_day, getdate, today

from hospital_vvs.utils import check_branch, default_branch

# the screens of each app (mirror of frontend lib/apps.ts) — used only for the access check
APP_ROUTES = {
	"opd": ["/registration", "/counter", "/opd_slip", "/appointments", "/appointments/inbox", "/patients"],
	"clinic": ["/opd/vitals", "/physician-queue", "/pw-prescription", "/pw-history", "/masters"],
	"lab": ["/lab/orders", "/lab/samples", "/tests", "/lab/verify", "/lab/outsourced", "/lab/templates"],
	"ipd": ["/er", "/ward", "/ipd", "/ipd/mar", "/ns", "/ipd_slip", "/ipd/kitchen", "/ipd/pre-auth", "/roster", "/ipd_report", "/display/ward"],
	"pharmacy": ["/medicine_invoice", "/pharmacy/pick", "/pharmacy/review", "/pharmacy/dispense", "/pharmacy/tickets", "/pharmacy/items"],
	"store": ["/store/receive", "/store/transfers", "/store/cycle-count", "/store/returns"],
	"cash": ["/cash/shift", "/cash/close", "/cash/approvals", "/cash/reports"],
	"finance": ["/finance", "/panels", "/claims", "/online-payments", "/fbr", "/welfare", "/expenses"],
	"accounting": ["/accounting"],
	"buying": ["/buying", "/purchase", "/assets", "/consumption"],
	"billing": ["/doctor-share", "/my-share", "/billing/discount-approvals", "/messages"],
	"insights": ["/reports", "/feedback"],
	"online": ["/ov-staff", "/ov-staff/report"],
}


def _allowed(app):
	from hospital_vvs.api.session import allowed_routes

	if "System Manager" in frappe.get_roles() or "PW Admin" in frappe.get_roles():
		return True
	mine = {r["route"] if isinstance(r, dict) else r for r in allowed_routes()}
	return bool(mine & set(APP_ROUTES.get(app, [])))


def _days(start, n, rows, keys, date_key="d"):
	"""Fill a day series (zeros where nothing happened) so lines never skip days."""
	by = {str(r[date_key]): r for r in rows}
	out = []
	for i in range(n):
		d = str(add_days(start, i))
		r = by.get(d) or {}
		out.append({"date": d, **{k: flt(r.get(k)) for k in keys}})
	return out


def _months(n=6):
	first = get_first_day(today())
	return [str(add_months(first, -i))[:7] for i in range(n - 1, -1, -1)]


def _spec(id, title, sub, kind, x, series, data, unit="count", **kw):
	return {"id": id, "title": title, "sub": sub, "kind": kind, "x": x, "series": [{"key": k, "label": l} for k, l in series], "data": data, "unit": unit, **kw}


def _ex():
	return frappe.db.get_single_value("Clinic Settings", "pharmacy_company") or "-"


# ------------------------------------------------------------------ builders: (branch, start, end, n) -> [spec]
def opd(b, s, e, n):
	rows = frappe.db.sql("""select posting_date d, count(*) visits, sum(purpose='Follow-up') follow_up from `tabOPD Slip`
		where docstatus=1 and branch=%s and posting_date between %s and %s group by posting_date""", (b, s, e), as_dict=True)
	yield _spec("opd-visits", "OPD visits per day", "New and follow-up visits", "stack", "date", [("new", "New"), ("follow_up", "Follow-up")],
		[{**r, "new": r["visits"] - r["follow_up"]} for r in _days(s, n, rows, ["visits", "follow_up"])])
	rows = frappe.db.sql("""select doctor_name label, count(*) value from `tabOPD Slip` where docstatus=1 and branch=%s and posting_date between %s and %s
		group by doctor order by value desc limit 8""", (b, s, e), as_dict=True)
	yield _spec("opd-doctors", "Visits by doctor", "Busiest doctors in the period", "hbar", "label", [("value", "Visits")], rows)
	rows = frappe.db.sql("""select coalesce(source_channel,'Other') label, sum(status not in ('No-show','Cancelled','Rejected')) kept, sum(status='No-show') no_show
		from tabAppointment where branch=%s and appointment_date between %s and %s group by source_channel order by kept desc""", (b, s, e), as_dict=True)
	yield _spec("opd-appts", "Appointments by channel", "Kept and no-show bookings", "stack", "label", [("kept", "Kept"), ("no_show", "No-show")], rows)


def clinic(b, s, e, n):
	rows = frappe.db.sql("""select prescription_date d, count(*) rx from tabPrescription where docstatus=1 and branch=%s
		and prescription_date between %s and %s group by prescription_date""", (b, s, e), as_dict=True)
	yield _spec("clinic-rx", "Prescriptions signed per day", "Signed prescriptions", "area", "date", [("rx", "Prescriptions")], _days(s, n, rows, ["rx"]))
	rows = frappe.db.sql("""select d.diagnosis_name label, count(*) value from `tabPrescription Diagnosis` d join tabPrescription p on p.name=d.parent
		where p.docstatus=1 and p.branch=%s and p.prescription_date between %s and %s group by d.diagnosis order by value desc limit 8""", (b, s, e), as_dict=True)
	yield _spec("clinic-dx", "Top diagnoses", "Most frequent diagnoses", "hbar", "label", [("value", "Patients")], rows)
	rows = frappe.db.sql("""select queue_date d, avg(timestampdiff(minute, creation, coalesce(called_at, started_at))) wait,
		avg(timestampdiff(minute, started_at, completed_at)) consult from `tabQueue Entry` where branch=%s and queue_date between %s and %s group by queue_date""",
		(b, s, e), as_dict=True)
	yield _spec("clinic-wait", "Average minutes per day", "Waiting for the doctor and time with the doctor", "line", "date",
		[("wait", "Waiting"), ("consult", "With the doctor")], _days(s, n, rows, ["wait", "consult"]), unit="min")


def lab(b, s, e, n):
	rows = frappe.db.sql("""select date(creation) d, count(*) orders, sum(status in ('Released','Verified','Partially Released')) released from `tabTest Invoice`
		where docstatus<2 and branch=%s and date(creation) between %s and %s group by date(creation)""", (b, s, e), as_dict=True)
	yield _spec("lab-orders", "Lab orders per day", "Ordered and released", "line", "date", [("orders", "Ordered"), ("released", "Released")],
		_days(s, n, rows, ["orders", "released"]))
	rows = frappe.db.sql("""select coalesce(t.department,'Other') label, count(*) value from `tabTest Invoice Item` i join `tabTest Invoice` ti on ti.name=i.parent
		left join `tabLab Test Template` t on t.name=i.template where ti.docstatus<2 and ti.branch=%s and date(ti.creation) between %s and %s
		group by label order by value desc limit 8""", (b, s, e), as_dict=True)
	yield _spec("lab-dept", "Tests by department", "Tests ordered in the period", "hbar", "label", [("value", "Tests")], rows)
	rows = frappe.db.sql("""select status label, count(*) value from `tabTest Invoice` where docstatus<2 and branch=%s and date(creation) between %s and %s
		group by status order by value desc""", (b, s, e), as_dict=True)
	yield _spec("lab-status", "Orders by stage", "Where the period's orders are now", "bar", "label", [("value", "Orders")], rows)


def ipd(b, s, e, n):
	adm = frappe.db.sql("""select date(admit_datetime) d, count(*) n from `tabBed Allotment` where branch=%s and date(admit_datetime) between %s and %s
		group by d""", (b, s, e), as_dict=True)
	dis = frappe.db.sql("""select date(release_datetime) d, count(*) n from `tabBed Allotment` where branch=%s and status='Discharged'
		and date(release_datetime) between %s and %s group by d""", (b, s, e), as_dict=True)
	a, d = {str(r.d): r.n for r in adm}, {str(r.d): r.n for r in dis}
	yield _spec("ipd-flow", "Admissions and discharges", "Patients in and out per day", "line", "date", [("admitted", "Admitted"), ("discharged", "Discharged")],
		[{"date": str(add_days(s, i)), "admitted": cint(a.get(str(add_days(s, i)))), "discharged": cint(d.get(str(add_days(s, i))))} for i in range(n)])
	rows = frappe.db.sql("""select w.ward_name label, sum(h.status='Occupied') occupied, sum(h.status!='Occupied') free from `tabHospital Bed` h join tabWard w on w.name=h.ward
		where h.branch=%s and h.is_active=1 group by h.ward order by occupied desc""", (b,), as_dict=True)
	yield _spec("ipd-beds", "Beds by ward (now)", "Occupied and other beds", "stack", "label", [("occupied", "Occupied"), ("free", "Free / cleaning")], rows)
	rows = frappe.db.sql("""select coalesce(triage_level,'Not triaged') label, count(*) value from `tabER Visit` where branch=%s and date(creation) between %s and %s
		group by label order by field(label,'Red','Yellow','Green')""", (b, s, e), as_dict=True)
	yield _spec("ipd-er", "Emergency arrivals by triage", "ER visits in the period", "bar", "label", [("value", "Visits")], rows)


def pharmacy(b, s, e, n):
	rows = frappe.db.sql("""select posting_date d, sum(grand_total) sales, count(*) bills from `tabSales Invoice` where docstatus=1 and is_return=0
		and hv_billing_type='Medicine' and posting_date between %s and %s group by posting_date""", (s, e), as_dict=True)
	yield _spec("ph-sales", "Pharmacy sales per day", "Medicine invoices", "area", "date", [("sales", "Sales")], _days(s, n, rows, ["sales"]), unit="rs")
	rows = frappe.db.sql("""select i.item_name label, sum(i.base_net_amount) value from `tabSales Invoice Item` i join `tabSales Invoice` si on si.name=i.parent
		where si.docstatus=1 and si.is_return=0 and si.hv_billing_type='Medicine' and si.posting_date between %s and %s group by i.item_code order by value desc limit 8""",
		(s, e), as_dict=True)
	yield _spec("ph-top", "Top medicines", "By sales value", "hbar", "label", [("value", "Sales")], rows, unit="rs")


def store(b, s, e, n):
	rows = frappe.db.sql("""select w.warehouse_name label, sum(bn.stock_value) value from tabBin bn join tabWarehouse w on w.name=bn.warehouse
		where bn.stock_value>0 group by bn.warehouse order by value desc limit 8""", as_dict=True)
	yield _spec("st-value", "Stock value by store (now)", "Valuation of what is on the shelves", "hbar", "label", [("value", "Stock value")], rows, unit="rs")
	rows = frappe.db.sql("""select posting_date d, sum(purpose='Material Receipt') receipt, sum(purpose='Material Transfer') transfer, sum(purpose='Material Issue') issue
		from `tabStock Entry` where docstatus=1 and posting_date between %s and %s group by posting_date""", (s, e), as_dict=True)
	yield _spec("st-moves", "Stock movements per day", "Receipts, transfers and issues", "stack", "date",
		[("receipt", "Receipts"), ("transfer", "Transfers"), ("issue", "Issues")], _days(s, n, rows, ["receipt", "transfer", "issue"]))


def cash(b, s, e, n):
	ex = _ex()
	modes = [m for m, in frappe.db.sql("""select distinct p.mode_of_payment from `tabSales Invoice Payment` p join `tabSales Invoice` si on si.name=p.parent
		where si.docstatus=1 and si.branch=%s and si.posting_date between %s and %s and si.company!=%s order by p.mode_of_payment='Cash' desc limit 4""", (b, s, e, ex))]
	keys = [frappe.scrub(m) for m in modes]
	rows = frappe.db.sql("""select si.posting_date d, p.mode_of_payment m, sum(p.amount) v from `tabSales Invoice Payment` p join `tabSales Invoice` si on si.name=p.parent
		where si.docstatus=1 and si.branch=%s and si.posting_date between %s and %s and si.company!=%s group by d, m""", (b, s, e, ex), as_dict=True)
	flat = {}
	for r in rows:
		flat.setdefault(str(r.d), {"d": str(r.d)})[frappe.scrub(r.m)] = flt(r.v)
	yield _spec("cash-modes", "Collections by payment mode", "Cash, card and wallets per day", "stack", "date", list(zip(keys, modes)),
		_days(s, n, list(flat.values()), keys), unit="rs")
	rows = frappe.db.sql("""select date(period_end) d, sum(case when difference>0 then difference else 0 end) excess, sum(case when difference<0 then -difference else 0 end) short
		from `tabShift Closing` where branch=%s and date(period_end) between %s and %s group by d""", (b, s, e), as_dict=True)
	yield _spec("cash-diff", "Shift differences", "Excess and short at closing", "bar", "date", [("excess", "Excess"), ("short", "Short")],
		_days(s, n, rows, ["excess", "short"]), unit="rs")


def finance(b, s, e, n):
	rows = frappe.db.sql("""select coalesce(hv_billing_type,'Other') label, sum(grand_total) value from `tabSales Invoice` where docstatus=1 and is_return=0
		and branch=%s and posting_date between %s and %s and company!=%s group by label order by value desc""", (b, s, e, _ex()), as_dict=True)
	yield _spec("fin-rev", "Revenue by billing type", "Hospital invoices in the period", "hbar", "label", [("value", "Revenue")], rows, unit="rs")
	rows = frappe.db.sql("""select coalesce(category,'Other') label, sum(amount) value from tabExpense where status='Approved' and posting_date between %s and %s
		group by label order by value desc limit 8""", (s, e), as_dict=True)
	yield _spec("fin-exp", "Expenses by category", "Approved expenses in the period", "hbar", "label", [("value", "Expenses")], rows, unit="rs")


def accounting(b, s, e, n):
	from hospital_vvs.utils import branch_company

	co = branch_company(b)
	months = _months(6)
	rows = frappe.db.sql("""select left(g.posting_date,7) m, sum(case when a.root_type='Income' then g.credit-g.debit else 0 end) income,
		sum(case when a.root_type='Expense' then g.debit-g.credit else 0 end) expense from `tabGL Entry` g join tabAccount a on a.name=g.account
		where g.company=%s and g.is_cancelled=0 and g.posting_date>=%s group by m""", (co, months[0] + "-01"), as_dict=True)
	by = {r.m: r for r in rows}
	yield _spec("acc-pl", "Income and expense by month", "From the general ledger", "bar", "month", [("income", "Income"), ("expense", "Expense")],
		[{"month": m, "income": flt((by.get(m) or {}).get("income")), "expense": flt((by.get(m) or {}).get("expense"))} for m in months], unit="rs")
	rows = frappe.db.sql("""select a.account_name label, coalesce(sum(g.debit-g.credit),0) value from tabAccount a left join `tabGL Entry` g on g.account=a.name and g.is_cancelled=0
		where a.company=%s and a.account_type in ('Bank','Cash') and a.is_group=0 group by a.name having value!=0 order by value desc""", (co,), as_dict=True)
	yield _spec("acc-bank", "Bank and cash balances (now)", "Ledger balance per account", "hbar", "label", [("value", "Balance")], rows, unit="rs")


def buying(b, s, e, n):
	months = _months(6)
	rows = frappe.db.sql("""select left(transaction_date,7) m, sum(base_grand_total) v from `tabPurchase Order` where docstatus=1 and transaction_date>=%s group by m""",
		(months[0] + "-01",), as_dict=True)
	by = {r.m: flt(r.v) for r in rows}
	yield _spec("buy-po", "Purchase orders by month", "Value ordered from suppliers", "area", "month", [("value", "Ordered")], [{"month": m, "value": by.get(m, 0)} for m in months], unit="rs")
	rows = frappe.db.sql("""select supplier_name label, sum(base_grand_total) value from `tabPurchase Invoice` where docstatus=1 and posting_date>=%s
		group by supplier order by value desc limit 8""", (months[0] + "-01",), as_dict=True)
	yield _spec("buy-sup", "Top suppliers", "Supplier invoices, last 6 months", "hbar", "label", [("value", "Invoiced")], rows, unit="rs")


def billing(b, s, e, n):
	rows = frappe.db.sql("""select doctor_name label, sum(case when amount>0 then amount else 0 end) value from `tabDoctor Share Ledger`
		where posting_date between %s and %s group by doctor order by value desc limit 8""", (s, e), as_dict=True)
	yield _spec("bill-share", "Doctor share earned", "By doctor in the period", "hbar", "label", [("value", "Share")], rows, unit="rs")
	rows = frappe.db.sql("""select coalesce(hv_billing_type,'Other') label, sum(discount_amount) value from `tabSales Invoice` where docstatus=1 and branch=%s
		and posting_date between %s and %s and discount_amount>0 group by label order by value desc""", (b, s, e), as_dict=True)
	yield _spec("bill-disc", "Discounts given", "By billing type in the period", "bar", "label", [("value", "Discount")], rows, unit="rs")


def insights(b, s, e, n):
	rows = frappe.db.sql("""select concat(rating, ' ★') label, count(*) value from `tabPatient Feedback` where branch=%s and date(creation) between %s and %s
		and rating is not null group by rating order by rating desc""", (b, add_days(e, -89), e), as_dict=True)
	yield _spec("ins-rating", "Patient ratings", "Feedback in the last 90 days", "bar", "label", [("value", "Patients")], rows)
	rows = frappe.db.sql("""select coalesce(source,'Other') label, count(*) value from `tabPatient Feedback` where branch=%s and date(creation) between %s and %s
		group by label order by value desc""", (b, add_days(e, -89), e), as_dict=True)
	yield _spec("ins-source", "Feedback by touchpoint", "Where patients rated us", "hbar", "label", [("value", "Responses")], rows)


def online(b, s, e, n):
	rows = frappe.db.sql("""select date(creation) d, count(*) requests, coalesce(sum(fee),0) fees from `tabOnline Visit Request` where date(creation) between %s and %s
		group by d""", (s, e), as_dict=True)
	yield _spec("ov-req", "Online visit requests per day", "Video consultation requests", "area", "date", [("requests", "Requests")], _days(s, n, rows, ["requests"]))
	rows = frappe.db.sql("""select status label, count(*) value from `tabOnline Visit Request` where date(creation) between %s and %s group by status order by value desc""",
		(s, e), as_dict=True)
	yield _spec("ov-status", "Requests by status", "Where the period's requests are", "bar", "label", [("value", "Requests")], rows)


BUILDERS = {"opd": opd, "clinic": clinic, "lab": lab, "ipd": ipd, "pharmacy": pharmacy, "store": store, "cash": cash, "finance": finance,
	"accounting": accounting, "buying": buying, "billing": billing, "insights": insights, "online": online}


@frappe.whitelist()
def apps():
	"""The apps whose charts the signed-in person may see (Dashboard tabs)."""
	return [a for a in BUILDERS if _allowed(a)]


@frappe.whitelist()
def app_charts(app, branch=None, days=14):
	if app not in BUILDERS:
		frappe.throw(_("Unknown app"))
	if not _allowed(app):
		frappe.throw(_("You cannot see this app's charts."), frappe.PermissionError)
	branch = branch or default_branch()
	check_branch(branch)
	n = max(7, min(cint(days) or 14, 90))
	end = getdate(today())
	start = add_days(end, -(n - 1))
	out = []
	gen = BUILDERS[app](branch, start, end, n)
	while True:
		try:
			spec = next(gen)
		except StopIteration:
			break
		except Exception as e:  # a broken chart stops this app's later charts but keeps the ones already built
			frappe.log_error(title=f"App chart {app}", message=str(e))
			break
		for row in spec["data"]:
			for k, v in list(row.items()):
				if hasattr(v, "isoformat"):
					row[k] = str(v)
		out.append(spec)
	return {"app": app, "branch": branch, "days": n, "from": str(start), "to": str(end), "charts": out}
