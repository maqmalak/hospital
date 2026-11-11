"""Reception counter API (/counter). Rules in services/counter.py."""

import frappe
from frappe.utils import cint, today

from hospital_vvs import roles as R
from hospital_vvs.services import counter as svc
from hospital_vvs.services import shifts
from hospital_vvs.utils import check_branch, default_branch, require_roles, scope_branch

ROLES = (R.RECEPTIONIST, R.CASH_SUPERVISOR)


@frappe.whitelist()
def context(branch=None):
	require_roles(*ROLES)
	branch = branch or default_branch()
	check_branch(branch)
	shift = shifts.current_shift()
	counter = shift.hv_counter if shift else None
	out = {"branch": branch, "shift": None, "counter": counter, **svc.catalogue(branch),
		"counters": [c for c in shifts.counters_for(branch=branch) if c.counter_type in ("Reception", "IPD Desk", "General")]}
	if shift:
		s = shifts.summary(shift.name)
		out["shift"] = {"name": shift.name, "opened_at": str(shift.period_start_date), "posting_date": str(shift.posting_date), "counter": counter,
			"expected": s["total_expected"], "modes": s["modes"], "stale": str(shift.posting_date) != today(), "closing": bool(shifts.pending_closing(shift.name))}
		out["modes"] = svc.modes_for(counter)
	return out


@frappe.whitelist()
def patient(name):
	require_roles(*ROLES)
	return svc.patient_panel(name)


@frappe.whitelist()
def pending_lab(branch=None):
	"""Lab orders made in the lab and waiting for payment here (D-60)."""
	branch = scope_branch(branch, required=False)
	require_roles(*ROLES)
	return svc.unpaid_lab_orders(branch=branch or default_branch())


@frappe.whitelist()
def discount_limits():
	"""This cashier's discount limits per billing type (above them the supervisor approves)."""
	require_roles(*ROLES)
	from hospital_vvs.services import discounts

	return {bt: dict(zip(("percent", "amount"), discounts.limits_for(frappe.session.user, bt))) for bt in ("OPD Slip", "Lab", "General")}


@frappe.whitelist(methods=["POST"])
def price(data):
	require_roles(*ROLES)
	return svc.price(data)


@frappe.whitelist(methods=["POST"])
def request_discounts(data):
	require_roles(*ROLES)
	return svc.request_discounts(data)


@frappe.whitelist()
def discount_status(names):
	require_roles(*ROLES)
	names = frappe.parse_json(names) if isinstance(names, str) else names
	return {n: frappe.db.get_value("Discount Authorization", n, "status") for n in names or []}


@frappe.whitelist(methods=["POST"])
def checkout(data):
	require_roles(*ROLES)
	return svc.checkout(data)


@frappe.whitelist(methods=["POST"])
def sync(receipts):
	require_roles(*ROLES)
	return svc.sync(receipts)


@frappe.whitelist()
def receipts(shift=None, q=None, limit=60):
	require_roles(*ROLES)
	cur = shifts.current_shift()
	filters = {"shift": shift or (cur.name if cur else "-")}
	if q:
		filters = {"patient_name": ["like", f"%{q}%"]} if not q.upper().startswith(("RCPT", "MR-", "TMP-")) else {"name" if q.upper().startswith("RCPT") else "patient": q}
	rows = frappe.get_all("Counter Receipt", filters=filters, fields=["name", "patient", "patient_name", "posted_at", "patient_total", "change_amount", "status",
		"offline", "counter"], order_by="posted_at desc", limit=cint(limit) or 60)
	for r in rows:
		r["kinds"] = sorted(set(frappe.get_all("Counter Receipt Line", filters={"parent": r.name}, pluck="kind")))
		r["modes"] = sorted(set(frappe.get_all("Counter Receipt Tender", filters={"parent": r.name}, pluck="mode_of_payment")))
	return rows


@frappe.whitelist()
def receipt(name):
	require_roles(*ROLES)
	return svc.receipt_data(name)


@frappe.whitelist(methods=["POST"])
def refund(name, rows=None, reason=None):
	require_roles(*ROLES)
	return svc.refund(name, rows, reason)


@frappe.whitelist()
def offline_bundle(branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(*ROLES)
	branch = branch or default_branch()
	cur = shifts.current_shift()
	return svc.offline_bundle(branch, cur.hv_counter if cur else None)
