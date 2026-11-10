"""Discount approvals (07-billing-finance.md)."""

import frappe
from frappe import _

from hospital_vvs import roles as R
from hospital_vvs.services import discounts
from hospital_vvs.utils import fail_guard, fail_hit, fail_reset, has_any_role, require_roles


@frappe.whitelist()
def discount_requests(status="Pending", limit=100):
	require_roles(R.CASH_SUPERVISOR, R.ACCOUNTANT, *discounts.approver_roles())
	filters = {"status": status} if status else {}
	return frappe.get_all("Discount Authorization", filters=filters, fields=["name", "billing_type", "branch", "patient", "gross_amount",
		"discount_percent", "discount_amount", "reason", "status", "requested_by", "approved_by", "decided_on", "creation",
		"reference_doctype", "reference_name", "decision_note"], order_by="creation desc", limit=int(limit))


@frappe.whitelist()
def discount_status(name):
	"""Counter polls / listens for the approver's decision."""
	d = frappe.db.get_value("Discount Authorization", name, ["name", "status", "approved_by", "decision_note", "requested_by",
		"discount_amount"], as_dict=True)
	if not d or (d.requested_by != frappe.session.user and not has_any_role(R.CASH_SUPERVISOR, R.ACCOUNTANT)):
		frappe.throw(_("Not found"), frappe.PermissionError)
	return d


@frappe.whitelist(methods=["POST"])
def decide(name, approve, note=None):
	return discounts.decide(name, frappe.utils.cint(approve), note).as_dict()


@frappe.whitelist(methods=["POST"])
def approve_with_pin(name, approver, password):
	"""Supervisor approves at the counter by entering their own login and password."""
	from frappe.utils.password import check_password

	fail_guard("pin", approver)
	try:
		check_password(approver, password, delete_tracker_cache=False)
	except frappe.AuthenticationError:
		fail_hit("pin", approver)
		frappe.throw(_("Wrong user or password."), frappe.AuthenticationError)
	fail_reset("pin", approver)
	return discounts.decide(name, True, _("Approved at the counter"), approver=approver).as_dict()
