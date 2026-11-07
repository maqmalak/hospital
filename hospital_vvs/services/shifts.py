"""Cashier shifts on every money counter (05-cash.md), built on ERPNext's POS Opening / Closing Entry.

Counter = one POS Profile (ERPNext allows one open POS Opening Entry per profile and per user).
Expected per mode = opening + collections (sales − refunds, from ERPNext's own get_invoices) + pay ins − pay outs − cash drops.
Cash movements and differences post Journal Entries; the native POS Closing Entry is created when the count is final.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.utils import check_branch, has_any_role, publish, setting, settings

CASH = "Cash"


# ------------------------------------------------------------------ counters
def ensure_counter_profile(counter):
	"""Copy the branch's billing-type POS Profile into a profile owned by this counter."""
	c = frappe.get_doc("Counter", counter) if isinstance(counter, str) else counter
	if c.pos_profile and frappe.db.exists("POS Profile", c.pos_profile):
		return c.pos_profile
	from hospital_vvs.services.billing import pos_profile_for

	base = frappe.get_doc("POS Profile", pos_profile_for(c.billing_type or "General", c.branch))
	name = f"{c.counter_name} POS"
	if not frappe.db.exists("POS Profile", name):
		new = frappe.copy_doc(base)
		new.set("__newname", name)
		new.name = None
		new.applicable_for_users = []
		if c.counter_type in ("Pharmacy Billing", "Pharmacy Handover"):
			new.update_stock = 1
		new.insert(ignore_permissions=True)
		name = new.name
	frappe.db.set_value("Counter", c.name, "pos_profile", name)
	return name


def counters_for(user=None, branch=None):
	from hospital_vvs.utils import user_branches

	branches = [branch] if branch else user_branches(user)
	return frappe.get_all("Counter", filters={"is_active": 1, "branch": ["in", branches]},
		fields=["name", "counter_name", "branch", "counter_type", "billing_type", "pos_profile", "current_user", "open_shift", "number"],
		order_by="branch, counter_name")


# ------------------------------------------------------------------ shift lookup
def current_shift(user=None):
	user = user or frappe.session.user
	name = frappe.db.get_value("POS Opening Entry", {"user": user, "status": "Open", "docstatus": 1}, "name")
	return frappe.get_doc("POS Opening Entry", name) if name else None


def pending_closing(shift_name):
	return frappe.db.get_value("Shift Closing", {"opening_entry": shift_name, "status": ["in", ["Pending Approval", "Recount"]]}, "name")


def billing_shift(branch, posting_date=None, user=None):
	"""The shift an invoice must belong to. None = not required (setting off, back-dated entry, system jobs)."""
	if frappe.flags.hv_no_shift or not cint(setting("require_shift_for_billing")) or not cint(setting("enable_shifts")):
		return None
	if posting_date and getdate(posting_date) != getdate(today()):
		return None
	shift = current_shift(user)
	if not shift:
		frappe.throw(_("Open your cashier shift first (Cash → Open shift). No money is collected outside a shift."), title=_("No open shift"))
	if pending_closing(shift.name):
		frappe.throw(_("Your shift is being closed. Finish the count or ask the supervisor before billing."), title=_("Shift closing"))
	if getdate(shift.posting_date) != getdate(today()):
		frappe.throw(_("Your shift from {0} is still open. Close it and open today's shift.").format(shift.posting_date), title=_("Old shift"))
	if shift.hv_branch and branch and shift.hv_branch != branch:
		frappe.throw(_("Your shift is at branch {0}; this bill is for {1}.").format(shift.hv_branch, branch))
	return shift


# ------------------------------------------------------------------ open
def open_shift(counter, balances=None, user=None):
	user = user or frappe.session.user
	c = frappe.get_doc("Counter", counter)
	check_branch(c.branch)
	if not c.is_active:
		frappe.throw(_("Counter {0} is not active.").format(counter))
	if current_shift(user):
		frappe.throw(_("You already have an open shift. Close it first."))
	profile = ensure_counter_profile(c)
	other = frappe.db.get_value("POS Opening Entry", {"pos_profile": profile, "status": "Open", "docstatus": 1}, "user")
	if other:
		frappe.throw(_("{0} is already open by {1}.").format(c.counter_name, other))
	modes = [p.mode_of_payment for p in frappe.get_cached_doc("POS Profile", profile).payments]
	balances = balances or {}
	poe = frappe.get_doc({
		"doctype": "POS Opening Entry", "period_start_date": now_datetime(), "posting_date": today(), "company": frappe.db.get_value("POS Profile", profile, "company"),
		"pos_profile": profile, "user": user, "hv_counter": c.name, "hv_branch": c.branch,
		"balance_details": [{"mode_of_payment": m, "opening_amount": flt(balances.get(m))} for m in modes],
	})
	poe.insert(ignore_permissions=True)
	poe.submit()
	frappe.db.set_value("Counter", c.name, {"current_user": user, "open_shift": poe.name})
	publish("shift", {"counter": c.name, "action": "opened", "user": user}, c.branch)
	return poe


# ------------------------------------------------------------------ summary
def _movements(shift_name):
	rows = frappe.get_all("Cash Movement", filters={"shift": shift_name, "status": ["in", ["Posted", "Pending Confirmation", "Confirmed"]]},
		fields=["movement_type", "amount"])
	out = {"Pay In": 0.0, "Pay Out": 0.0, "Cash Drop": 0.0}
	for r in rows:
		out[r.movement_type] += flt(r.amount)
	return out


def summary(shift_name, until=None):
	"""Expected amounts per mode (what the drawer should hold now)."""
	from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import get_invoices

	poe = frappe.get_doc("POS Opening Entry", shift_name)
	data = get_invoices(poe.period_start_date, until or now_datetime(), poe.pos_profile, poe.user)
	coll = {p.mode_of_payment: flt(p.amount) for p in data.get("payments")}
	mv = _movements(shift_name)
	modes, total = [], 0.0
	names = [b.mode_of_payment for b in poe.balance_details] + [m for m in coll if m not in [b.mode_of_payment for b in poe.balance_details]]
	for m in names:
		opening = next((flt(b.opening_amount) for b in poe.balance_details if b.mode_of_payment == m), 0.0)
		is_cash = m == CASH
		row = {"mode_of_payment": m, "opening": opening, "collections": coll.get(m, 0.0),
			"pay_in": mv["Pay In"] if is_cash else 0.0, "pay_out": mv["Pay Out"] if is_cash else 0.0, "cash_drop": mv["Cash Drop"] if is_cash else 0.0}
		row["expected"] = row["opening"] + row["collections"] + row["pay_in"] - row["pay_out"] - row["cash_drop"]
		total += row["expected"]
		modes.append(row)
	invoices = data.get("invoices") or []
	return {"shift": poe.name, "counter": poe.hv_counter, "branch": poe.hv_branch, "user": poe.user, "pos_profile": poe.pos_profile,
		"opened_at": str(poe.period_start_date), "modes": modes, "total_expected": total, "movements": mv,
		"invoice_count": len([i for i in invoices if not i.is_return]), "refund_count": len([i for i in invoices if i.is_return]),
		"sales_total": sum(flt(i.grand_total) for i in invoices if not i.is_return), "refund_total": -sum(flt(i.grand_total) for i in invoices if i.is_return),
		"max_cash_in_drawer": flt(setting("max_cash_in_drawer"))}


# ------------------------------------------------------------------ journal entries
def _cost_center(shift):
	return frappe.db.get_value("POS Profile", shift.pos_profile, "cost_center")


def cash_account(company):
	return frappe.db.get_value("Mode of Payment Account", {"parent": CASH, "company": company}, "default_account")


def post_je(company, debit, credit, amount, cost_center, branch, remark, reference=None):
	amount = flt(amount)
	if amount <= 0:
		return None
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Cash Entry", "company": company, "posting_date": today(),
		"user_remark": remark, "cheque_no": reference, "cheque_date": today() if reference else None,
		"accounts": [{"account": debit, "debit_in_account_currency": amount, "cost_center": cost_center},
			{"account": credit, "credit_in_account_currency": amount, "cost_center": cost_center}]})
	for row in je.accounts:
		if row.meta.has_field("branch"):
			row.branch = branch
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name


# ------------------------------------------------------------------ movements
def add_movement(movement_type, amount, reason, account=None, refund_invoice=None, user=None):
	user = user or frappe.session.user
	shift = current_shift(user)
	if not shift:
		frappe.throw(_("Open your shift first."))
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Amount must be more than zero."))
	if not (reason or "").strip():
		frappe.throw(_("A reason is required."))
	if movement_type in ("Pay Out", "Cash Drop"):
		cash_now = next((m["expected"] for m in summary(shift.name)["modes"] if m["mode_of_payment"] == CASH), 0)
		if amount > cash_now + 0.001:
			frappe.throw(_("Only {0} cash should be in the drawer.").format(frappe.format_value(cash_now, "Currency")))
	s = settings()
	default_account = {"Pay In": s.float_source_account or s.safe_account, "Pay Out": s.petty_expense_account, "Cash Drop": s.safe_account}[movement_type]
	account = account or default_account
	if not account:
		frappe.throw(_("Set the {0} account in Clinic Settings → Cash.").format(movement_type))
	mv = frappe.get_doc({"doctype": "Cash Movement", "shift": shift.name, "counter": shift.hv_counter, "branch": shift.hv_branch, "user": user,
		"movement_type": movement_type, "amount": amount, "reason": reason, "account": account, "refund_invoice": refund_invoice,
		"status": "Pending Confirmation" if movement_type == "Cash Drop" else "Posted"}).insert(ignore_permissions=True)
	if movement_type != "Cash Drop":
		cash = cash_account(shift.company)
		debit, credit = (cash, account) if movement_type == "Pay In" else (account, cash)
		mv.db_set("journal_entry", post_je(shift.company, debit, credit, amount, _cost_center(shift), shift.hv_branch,
			f"{movement_type} · {shift.hv_counter} · {reason}", mv.name))
	else:
		publish("cash_drop", {"name": mv.name, "amount": amount, "counter": shift.hv_counter, "user": user}, shift.hv_branch)
	return mv


def confirm_drop(name, accept=True, note=None, approver=None):
	approver = approver or frappe.session.user
	if not has_any_role(R.CASH_SUPERVISOR, user=approver):
		frappe.throw(_("Only the cash supervisor confirms cash drops."), frappe.PermissionError)
	mv = frappe.get_doc("Cash Movement", name)
	if mv.status != "Pending Confirmation":
		frappe.throw(_("Already {0}.").format(mv.status))
	mv.status = "Confirmed" if accept else "Rejected"
	mv.confirmed_by, mv.confirmed_on = approver, now_datetime()
	if note:
		mv.reason = f"{mv.reason}\n{note}"
	if accept:
		shift = frappe.get_doc("POS Opening Entry", mv.shift)
		mv.journal_entry = post_je(shift.company, mv.account, cash_account(shift.company), mv.amount, _cost_center(shift), shift.hv_branch,
			f"Cash drop · {mv.counter} · received by {approver}", mv.name)
	mv.save(ignore_permissions=True)
	return mv


# ------------------------------------------------------------------ close
def denominations():
	return [flt(x) for x in (setting("denominations") or "5000,1000,500,100,50,20,10,5,2,1").split(",") if flt(x) > 0]


def close_shift(counts, other_modes=None, explanation=None, user=None):
	"""Blind count. counts: {denomination: number of notes}; other_modes: {mode: amount from the terminal slip}."""
	user = user or frappe.session.user
	shift = current_shift(user)
	if not shift:
		frappe.throw(_("You have no open shift."))
	existing = frappe.db.get_value("Shift Closing", {"opening_entry": shift.name, "status": ["in", ["Pending Approval", "Recount", "Draft"]]}, "name")
	sc = frappe.get_doc("Shift Closing", existing) if existing else frappe.new_doc("Shift Closing")
	if existing and sc.status == "Pending Approval":
		frappe.throw(_("The count is waiting for the supervisor."))
	summ = summary(shift.name)
	cash_counted = sum(flt(d) * cint(n) for d, n in (counts or {}).items())
	other_modes = other_modes or {}
	sc.update({"opening_entry": shift.name, "counter": shift.hv_counter, "branch": shift.hv_branch, "user": user,
		"period_start": shift.period_start_date, "period_end": now_datetime(), "explanation": explanation})
	sc.set("denominations", [{"denomination": flt(d), "count": cint(n), "amount": flt(d) * cint(n)} for d, n in (counts or {}).items() if cint(n)])
	sc.set("modes", [])
	for m in summ["modes"]:
		counted = cash_counted if m["mode_of_payment"] == CASH else flt(other_modes.get(m["mode_of_payment"], m["expected"] if not other_modes else 0))
		sc.append("modes", dict(m, counted=counted, difference=counted - m["expected"]))
	sc.total_expected = sum(flt(r.expected) for r in sc.modes)
	sc.total_counted = sum(flt(r.counted) for r in sc.modes)
	sc.difference = sc.total_counted - sc.total_expected
	tol = flt(setting("cash_tolerance"))
	diff = round(flt(sc.difference), 2)
	sc.status = "Balanced" if abs(diff) < 0.01 else "Within Tolerance" if abs(diff) <= tol else "Pending Approval"
	sc.save(ignore_permissions=True)
	if sc.status in ("Balanced", "Within Tolerance"):
		finalize(sc)
	else:
		publish("shift_closing", {"name": sc.name, "counter": sc.counter, "difference": diff, "user": user}, sc.branch)
	return sc


def finalize(sc, liability=False):
	"""Post the difference, create and submit the native POS Closing Entry, free the counter."""
	from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import make_closing_entry_from_opening

	shift = frappe.get_doc("POS Opening Entry", sc.opening_entry)
	diff = round(flt(sc.difference), 2)
	s = settings()
	if abs(diff) >= 0.01:
		cash = cash_account(shift.company)
		cc = _cost_center(shift)
		if diff > 0:
			sc.journal_entry = post_je(shift.company, cash, s.cash_over_account, diff, cc, shift.hv_branch, f"Cash excess · {sc.counter} · {sc.name}", sc.name)
		else:
			debit = s.staff_receivable_account if liability else s.cash_short_account
			sc.journal_entry = post_je(shift.company, debit, cash, -diff, cc, shift.hv_branch,
				f"Cash {'shortage (cashier liability)' if liability else 'short'} · {sc.counter} · {sc.user} · {sc.name}", sc.name)
	pce = make_closing_entry_from_opening(shift)
	by_mode = {r.mode_of_payment: r for r in sc.modes}
	existing = {r.mode_of_payment for r in pce.payment_reconciliation}
	for m, r in by_mode.items():
		if m not in existing:
			pce.append("payment_reconciliation", {"mode_of_payment": m, "opening_amount": 0, "expected_amount": 0})
	for row in pce.payment_reconciliation:
		r = by_mode.get(row.mode_of_payment)
		if r:
			row.opening_amount = flt(r.opening)
			row.expected_amount = flt(r.expected)
			row.closing_amount = flt(r.counted)
			row.difference = flt(r.counted) - flt(r.expected)
	pce.flags.ignore_permissions = True
	pce.insert()
	pce.submit()
	sc.pos_closing_entry = pce.name
	sc.period_end = now_datetime()
	sc.save(ignore_permissions=True)
	if sc.counter:
		frappe.db.set_value("Counter", sc.counter, {"current_user": None, "open_shift": None})
	publish("shift", {"counter": sc.counter, "action": "closed", "user": sc.user}, sc.branch)
	return sc


def decide(name, action, note=None, approver=None):
	approver = approver or frappe.session.user
	if not has_any_role(R.CASH_SUPERVISOR, user=approver):
		frappe.throw(_("Only the cash supervisor decides shift closings."), frappe.PermissionError)
	sc = frappe.get_doc("Shift Closing", name)
	if sc.status != "Pending Approval":
		frappe.throw(_("This closing is {0}.").format(sc.status))
	if sc.user == approver and approver != "Administrator":
		frappe.throw(_("You cannot approve your own shift."))
	sc.supervisor, sc.decided_on, sc.decision_note = approver, now_datetime(), note
	if action == "recount":
		sc.status = "Recount"
		sc.save(ignore_permissions=True)
		return sc
	sc.status = "Liability Recorded" if action == "liability" else "Approved"
	sc.save(ignore_permissions=True)
	return finalize(sc, liability=action == "liability")


def counts_json(sc):
	return json.dumps({str(int(d.denomination)): d.count for d in sc.denominations})
