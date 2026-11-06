"""Discount authorization (07-billing-finance.md): per-role limits, approval requests above the limit."""

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

from hospital_vvs import roles as R
from hospital_vvs.utils import is_admin, publish, settings, user_roles

DEFAULT_APPROVERS = [R.ADMIN, R.CASH_SUPERVISOR]


def limits_for(user, billing_type):
	"""(max %, max amount) across the user's roles. Admin: no limit. No matching rule: 0 (every discount needs approval)."""
	if is_admin(user):
		return 100.0, None
	roles = user_roles(user)
	pct, amt = 0.0, 0.0
	for rule in settings().discount_rules or []:
		if rule.role in roles and (not rule.billing_type or rule.billing_type == billing_type):
			pct = max(pct, flt(rule.max_percent))
			amt = max(amt, flt(rule.max_amount))
	return pct, amt


def approver_roles():
	rows = [r.role for r in settings().discount_approvers or []]
	return rows or DEFAULT_APPROVERS


def request(*, billing_type, gross, discount_amount, reason, branch=None, patient=None, reference_doctype=None,
	reference_name=None, user=None):
	user = user or frappe.session.user
	gross, discount_amount = flt(gross), flt(discount_amount)
	if discount_amount <= 0:
		frappe.throw(_("Discount amount must be more than zero."))
	if discount_amount > gross:
		frappe.throw(_("Discount cannot be more than the bill."))
	if not (reason or "").strip():
		frappe.throw(_("A reason is required for every discount."))
	percent = discount_amount * 100 / gross if gross else 0
	max_pct, max_amt = limits_for(user, billing_type)
	within = percent <= max_pct + 1e-9 and (not max_amt or discount_amount <= max_amt)
	doc = frappe.get_doc({
		"doctype": "Discount Authorization", "billing_type": billing_type, "branch": branch, "patient": patient,
		"reference_doctype": reference_doctype, "reference_name": reference_name, "gross_amount": gross,
		"discount_percent": percent, "discount_amount": discount_amount, "reason": reason, "requested_by": user,
		"requester_role": ", ".join(sorted(user_roles(user) & set(R.ALL))),
		"status": "Within Limit" if within else "Pending",
	})
	if within:
		doc.decided_on = now_datetime()
	doc.insert(ignore_permissions=True)
	if not within:
		publish("discount_request", {"name": doc.name, "amount": discount_amount, "percent": round(percent, 1),
			"user": user, "billing_type": billing_type}, branch)
	return doc


def decide(name, approve, note=None, approver=None):
	approver = approver or frappe.session.user
	if not (is_admin(approver) or user_roles(approver) & set(approver_roles())):
		frappe.throw(_("You cannot approve discounts."), frappe.PermissionError)
	doc = frappe.get_doc("Discount Authorization", name)
	if doc.status != "Pending":
		frappe.throw(_("This request is already {0}.").format(doc.status))
	if doc.requested_by == approver and not is_admin(approver):
		frappe.throw(_("You cannot approve your own discount request."))
	doc.status = "Approved" if approve else "Rejected"
	doc.approved_by = approver
	doc.decided_on = now_datetime()
	doc.decision_note = note
	doc.save(ignore_permissions=True)
	publish("discount_decided", {"name": doc.name, "status": doc.status, "requested_by": doc.requested_by}, doc.branch)
	return doc


def assert_usable(name, discount_amount, user=None):
	"""Called when the bill is submitted: the authorization must be approved (or within limit) for this amount."""
	if not name:
		frappe.throw(_("Discount needs an authorization."))
	doc = frappe.get_doc("Discount Authorization", name)
	if doc.status not in ("Within Limit", "Approved"):
		frappe.throw(_("Discount {0} is {1}.").format(name, doc.status))
	if abs(flt(doc.discount_amount) - flt(discount_amount)) > 0.01:
		frappe.throw(_("The discount changed after it was authorized. Request it again."))
	return doc


def mark_used(name, reference_doctype, reference_name):
	frappe.db.set_value("Discount Authorization", name, {"status": "Used", "reference_doctype": reference_doctype,
		"reference_name": reference_name})
