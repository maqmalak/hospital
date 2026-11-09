"""Cashier shifts (05-cash.md): /cash/shift, /cash/close, /cash/approvals, /cash/reports."""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, today

from hospital_vvs import roles as R
from hospital_vvs.services import billing, shifts
from hospital_vvs.utils import check_branch, default_branch, has_any_role, require_roles, setting

CASH_ROLES = (R.RECEPTIONIST, R.LAB_USER, R.PHARMACY_CASHIER, R.DISPENSER, R.CASH_SUPERVISOR)


@frappe.whitelist()
def my_shift():
	require_roles(*CASH_ROLES)
	shift = shifts.current_shift()
	counters = shifts.counters_for()
	# counters a user may open: pharmacy counters belong to the contract pharmacy staff (D-38), lab counters to the lab
	from hospital_vvs.utils import has_any_role

	allowed = {"Reception": (R.RECEPTIONIST,), "IPD Desk": (R.RECEPTIONIST,), "General": (R.RECEPTIONIST,), "Lab": (R.LAB_USER,),
		"Pharmacy Billing": (R.PHARMACY_CASHIER,), "Pharmacy Handover": (R.DISPENSER,)}
	counters = [c for c in counters if has_any_role(*allowed.get(c.counter_type, (R.RECEPTIONIST,)), R.CASH_SUPERVISOR)]
	out = {"counters": counters, "shift": None, "denominations": shifts.denominations(), "blind": cint(setting("blind_count")),
		"tolerance": flt(setting("cash_tolerance")), "modes": ["Cash", "Card", "Bank Transfer", "JazzCash", "Easypaisa"]}
	if shift:
		summ = shifts.summary(shift.name)
		closing = frappe.db.get_value("Shift Closing", {"opening_entry": shift.name, "status": ["in", ["Pending Approval", "Recount"]]},
			["name", "status", "decision_note"], as_dict=True)
		movements = frappe.get_all("Cash Movement", filters={"shift": shift.name}, fields=["name", "movement_type", "amount", "reason", "status", "creation", "journal_entry"],
			order_by="creation desc")
		invoices = frappe.get_all("Sales Invoice", filters={"owner": shift.user, "pos_profile": shift.pos_profile, "docstatus": 1, "is_created_using_pos": 1,
			"posting_date": shift.posting_date}, fields=["name", "customer_name", "grand_total", "is_return", "hv_billing_type", "posting_time", "hv_patient"],
			order_by="creation desc", limit=50)
		for i in invoices:
			i["mode"] = frappe.db.get_value("Sales Invoice Payment", {"parent": i.name}, "mode_of_payment")
		out.update(shift=summ, closing=closing, movements=movements, invoices=invoices)
	return out


@frappe.whitelist(methods=["POST"])
def open_shift(counter, balances=None):
	require_roles(*CASH_ROLES)
	poe = shifts.open_shift(counter, frappe.parse_json(balances) if balances else {})
	return {"name": poe.name}


@frappe.whitelist(methods=["POST"])
def movement(movement_type, amount, reason, account=None):
	require_roles(*CASH_ROLES)
	mv = shifts.add_movement(movement_type, amount, reason, account)
	return mv.as_dict()


@frappe.whitelist(methods=["POST"])
def refund(invoice, reason, payment_mode=None):
	"""Full refund of a counter bill from the current shift (credit note against the original)."""
	require_roles(R.RECEPTIONIST, R.LAB_USER, R.PHARMACY_CASHIER, R.DISPENSER)
	return billing.refund_invoice(invoice, reason, payment_mode=payment_mode)


@frappe.whitelist(methods=["POST"])
def close(counts, other_modes=None, explanation=None):
	require_roles(*CASH_ROLES)
	sc = shifts.close_shift(frappe.parse_json(counts), frappe.parse_json(other_modes) if other_modes else {}, explanation)
	return closing_view(sc.name)


@frappe.whitelist()
def closing_view(name):
	sc = frappe.get_doc("Shift Closing", name)
	if sc.user != frappe.session.user:
		require_roles(R.CASH_SUPERVISOR, R.ACCOUNTANT)
	out = sc.as_dict()
	out["movements"] = shifts._movements(sc.opening_entry)
	out["tolerance"] = flt(setting("cash_tolerance"))
	out["user_name"] = frappe.db.get_value("User", sc.user, "full_name")
	return out


@frappe.whitelist()
def approvals(branch=None):
	require_roles(R.CASH_SUPERVISOR)
	filters = {"status": "Pending Approval"}
	if branch:
		filters["branch"] = branch
	closings = frappe.get_all("Shift Closing", filters=filters, fields=["name", "counter", "branch", "user", "difference", "total_expected", "total_counted",
		"explanation", "creation", "period_start"], order_by="creation")
	for c in closings:
		c["user_name"] = frappe.db.get_value("User", c.user, "full_name")
	drops = frappe.get_all("Cash Movement", filters={"status": "Pending Confirmation", **({"branch": branch} if branch else {})},
		fields=["name", "counter", "branch", "user", "amount", "reason", "creation"], order_by="creation")
	for d in drops:
		d["user_name"] = frappe.db.get_value("User", d.user, "full_name")
	return {"closings": closings, "drops": drops}


@frappe.whitelist(methods=["POST"])
def decide(name, action, note=None):
	sc = shifts.decide(name, action, note)
	return {"name": sc.name, "status": sc.status}


@frappe.whitelist(methods=["POST"])
def confirm_drop(name, accept=1, note=None):
	mv = shifts.confirm_drop(name, cint(accept), note)
	return {"name": mv.name, "status": mv.status}


@frappe.whitelist()
def report(from_date=None, to_date=None, branch=None):
	"""Shift history, day-end position per counter and mode, excess/short per cashier, open shifts, pending drops."""
	require_roles(R.CASH_SUPERVISOR, R.ACCOUNTANT)
	to_date = to_date or today()
	from_date = from_date or add_days(to_date, -6)
	branch = branch or default_branch()
	check_branch(branch)
	closings = frappe.db.sql("""select name, counter, user, status, total_expected, total_counted, difference, period_start, period_end, supervisor
		from `tabShift Closing` where branch=%s and date(period_start) between %s and %s and status not in ('Draft') order by period_start desc""",
		(branch, from_date, to_date), as_dict=True)
	for c in closings:
		c["user_name"] = frappe.db.get_value("User", c.user, "full_name")
	by_mode = frappe.db.sql("""select si.hv_counter counter, sip.mode_of_payment mode, sum(sip.amount) amount, count(distinct si.name) invoices
		from `tabSales Invoice Payment` sip join `tabSales Invoice` si on si.name=sip.parent
		where si.docstatus=1 and si.is_pos=1 and si.branch=%s and si.posting_date between %s and %s group by si.hv_counter, sip.mode_of_payment""",
		(branch, from_date, to_date), as_dict=True)
	cashiers = frappe.db.sql("""select user, count(*) shifts, sum(difference) net, sum(case when difference<0 then difference else 0 end) short,
		sum(case when difference>0 then difference else 0 end) excess from `tabShift Closing` where branch=%s and date(period_start) between %s and %s
		and status not in ('Draft','Pending Approval','Recount') group by user""", (branch, from_date, to_date), as_dict=True)
	for c in cashiers:
		c["user_name"] = frappe.db.get_value("User", c.user, "full_name")
	open_shifts = frappe.get_all("POS Opening Entry", filters={"status": "Open", "docstatus": 1, "hv_branch": branch},
		fields=["name", "hv_counter", "user", "period_start_date", "posting_date"])
	for o in open_shifts:
		o["stale"] = getdate(o.posting_date) < getdate(today())
		o["user_name"] = frappe.db.get_value("User", o.user, "full_name")
	drafts = frappe.get_all("Sales Invoice", filters={"docstatus": 0, "branch": branch, "hv_billing_type": "Medicine"},
		fields=["name", "customer_name", "grand_total", "creation", "hv_token"], limit=50)
	return {"from_date": str(from_date), "to_date": str(to_date), "closings": closings, "by_mode": by_mode, "cashiers": cashiers, "open_shifts": open_shifts,
		"pending_drops": frappe.db.count("Cash Movement", {"status": "Pending Confirmation", "branch": branch}), "uncollected_drafts": drafts}
