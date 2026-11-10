"""Online card payments (mock until the gateway is chosen) and FBR day-end reporting (D-47)."""

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import cint

from hospital_vvs import roles as R
from hospital_vvs.services import fbr, gateway
from hospital_vvs.utils import require_roles, setting


# ------------------------------------------------------------------ checkout page (public, token)
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=600)
def checkout(token):
	return gateway.checkout_state(token)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=600)
def mock_pay(token, success=1):
	op = gateway.mock_pay(token, success)
	return {"status": op.status, "provider_ref": op.provider_ref, "return_url": op.return_url}


# ------------------------------------------------------------------ staff
@frappe.whitelist(methods=["POST"])
def create_link(sales_invoice, send=0):
	"""Payment link for a bill's outstanding amount; optionally sent to the patient by WhatsApp / SMS."""
	require_roles(R.RECEPTIONIST, R.ACCOUNTANT, R.CASH_SUPERVISOR)
	r = gateway.start("Sales Invoice", sales_invoice)
	if cint(send):
		from hospital_vvs.services import messaging

		patient = frappe.db.get_value("Sales Invoice", sales_invoice, "hv_patient")
		if patient:
			messaging.send("payment_link", patient=patient, context={"amount": f"Rs {int(r['amount']):,}", "ref": sales_invoice, "link": r["url"]},
				reference_doctype="Online Payment", reference_name=r["name"])
	return r


@frappe.whitelist()
def online_payments(status=None):
	require_roles(R.ACCOUNTANT, R.CASH_SUPERVISOR, R.RECEPTIONIST)
	f = {"status": status} if status else {}
	return {"rows": frappe.get_all("Online Payment", filters=f, fields=["name", "reference_doctype", "reference_name", "patient", "description", "amount", "status", "provider",
		"gateway_mode", "provider_ref", "paid_at", "payment_entry", "creation", "expires_at"], order_by="creation desc", limit=200),
		"enabled": gateway.enabled(), "provider": gateway.provider(), "mock": gateway.is_mock()}


# ------------------------------------------------------------------ FBR
@frappe.whitelist()
def fbr_status(date=None, status=None):
	require_roles(R.ACCOUNTANT, R.CASH_SUPERVISOR)
	f = {}
	if date:
		f["posting_date"] = date
	if status:
		f["status"] = status
	rows = frappe.get_all("FBR Invoice", filters=f, fields=["name", "sales_invoice", "posting_date", "billing_type", "status", "fbr_invoice_no", "amount", "is_return",
		"attempts", "reported_at", "batch", "last_error"], order_by="creation desc", limit=300)
	return {"rows": rows, "days": fbr.summary(), "enabled": cint(setting("fbr_enabled")), "mode": setting("fbr_mode") or "Mock", "pos_id": setting("fbr_pos_id"),
		"run_time": str(setting("fbr_run_time") or "23:30:00"), "billing_types": setting("fbr_billing_types"), "last_run": frappe.db.get_default("hv_fbr_last_run")}


@frappe.whitelist(methods=["POST"])
def fbr_run(date=None):
	"""Day-end report now (also retries failures)."""
	require_roles(R.ACCOUNTANT, R.CASH_SUPERVISOR)
	r = fbr.day_end(date)
	frappe.db.set_default("hv_fbr_last_run", frappe.utils.today())
	return r


# ------------------------------------------------------------------ WhatsApp templates for Meta
@frappe.whitelist()
def meta_templates():
	require_roles(R.ADMIN)
	from hospital_vvs.messaging.meta import build

	return build()
