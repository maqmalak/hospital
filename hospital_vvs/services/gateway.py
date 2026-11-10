"""Online card payments (D-47). The provider is chosen later in Clinic Settings → Online Card Payments; until then the Mock
adapter simulates the gateway: a payment link opens /hms/pay/<token>, where "Pay" / "Fail" stand in for the card page.

Flow: start(reference) → Online Payment (Initiated, token hash only) → checkout URL → the gateway (or the mock page) confirms →
complete() → fulfil(): the money is posted to the gateway clearing account (not a cashier drawer):
  Online Visit Request → Fee invoice + Payment Entry, fee Verified;
  Sales Invoice → Payment Entry against the bill.
A real adapter only has to implement checkout_url() and verify the gateway's callback, then call complete().
"""

import hashlib
import secrets

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, get_url, now_datetime, nowdate

from hospital_vvs.utils import publish, setting

MODE = "Card (online)"


def _hash(t):
	return hashlib.sha256((t or "").encode()).hexdigest()


def enabled():
	return cint(setting("card_gateway_enabled"))


def provider():
	return setting("card_gateway_provider") or "Mock (testing)"


def is_mock():
	return provider().startswith("Mock") or (setting("card_gateway_mode") or "Mock") == "Mock"


class MockAdapter:
	name = "Mock"

	def checkout_url(self, op, token):
		return get_url(f"/hms/pay/{token}")


class NotConfigured:
	def __init__(self, name):
		self.name = name

	def checkout_url(self, op, token):
		frappe.throw(_("{0} is not connected yet. Set Clinic Settings → Online Card Payments → Gateway to Mock, or add the gateway keys.").format(self.name))


def adapter():
	return MockAdapter() if is_mock() else NotConfigured(provider())


# ------------------------------------------------------------------ start
def amount_for(reference_doctype, reference_name):
	if reference_doctype == "Online Visit Request":
		ov = frappe.get_doc(reference_doctype, reference_name)
		if ov.fee_status == "Verified":
			frappe.throw(_("The fee is already paid."))
		return flt(ov.fee), ov.patient, _("Online consultation {0}").format(ov.name)
	if reference_doctype == "Sales Invoice":
		si = frappe.get_doc(reference_doctype, reference_name)
		if si.docstatus != 1 or flt(si.outstanding_amount) <= 0:
			frappe.throw(_("This bill has nothing to pay."))
		return flt(si.outstanding_amount), si.get("hv_patient"), _("Bill {0}").format(si.name)
	frappe.throw(_("Online payment is not available for {0}.").format(reference_doctype))


def start(reference_doctype, reference_name, return_url=None):
	"""→ {name, url}. One open link per reference is reused."""
	if not enabled():
		frappe.throw(_("Online card payments are switched off (Clinic Settings → Online Card Payments)."))
	amount, patient, desc = amount_for(reference_doctype, reference_name)
	if amount <= 0:
		frappe.throw(_("Nothing to pay."))
	token = secrets.token_urlsafe(20)
	op = frappe.get_doc({"doctype": "Online Payment", "reference_doctype": reference_doctype, "reference_name": reference_name, "patient": patient, "amount": amount,
		"description": desc, "status": "Initiated", "provider": provider(), "gateway_mode": "Mock" if is_mock() else setting("card_gateway_mode"),
		"token_hash": _hash(token), "return_url": return_url, "expires_at": add_to_date(now_datetime(), hours=cint(setting("card_link_hours") or 48))}).insert(ignore_permissions=True)
	return {"name": op.name, "url": adapter().checkout_url(op, token), "amount": amount}


def by_token(token):
	if not token or len(token) < 16:
		frappe.throw(_("Invalid payment link."), frappe.PermissionError)
	name = frappe.db.get_value("Online Payment", {"token_hash": _hash(token)}, "name")
	if not name:
		frappe.throw(_("This payment link is not valid."), frappe.PermissionError)
	return frappe.get_doc("Online Payment", name)


def checkout_state(token):
	op = by_token(token)
	expired = op.status == "Initiated" and op.expires_at and get_datetime(op.expires_at) < now_datetime()
	return {"amount": op.amount, "description": op.description, "status": "Expired" if expired else op.status, "provider": op.provider, "mock": is_mock(),
		"clinic": setting("clinic_name"), "return_url": op.return_url, "reference": op.reference_name, "provider_ref": op.provider_ref}


# ------------------------------------------------------------------ complete
def complete(op, success, provider_ref=None, error=None):
	"""Gateway result (verified callback, or the mock page). Idempotent."""
	if op.status == "Paid":
		return op
	if op.status != "Initiated":
		frappe.throw(_("This payment is {0}.").format(op.status.lower()))
	if op.expires_at and get_datetime(op.expires_at) < now_datetime():
		frappe.throw(_("This payment link has expired. Ask the clinic for a new one."))
	if not success:
		op.db_set({"status": "Failed", "error": error or _("Declined")})
		return op
	op.db_set({"status": "Paid", "paid_at": now_datetime(), "provider_ref": provider_ref or f"MOCK-{secrets.token_hex(5).upper()}"})
	# the confirmation comes from the gateway (a guest request): post the invoice / payment as the system, after the money is verified
	user = frappe.session.user
	frappe.set_user("Administrator")
	try:
		fulfil(op)
	finally:
		frappe.set_user(user)
	return op


def mock_pay(token, success=1):
	if not is_mock():
		frappe.throw(_("The test payment page is only available in Mock mode."), frappe.PermissionError)
	op = by_token(token)
	return complete(op, cint(success), error=None if cint(success) else _("Test card declined"))


def _company(branch=None):
	from hospital_vvs.utils import branch_company

	return branch_company(branch or setting("card_gateway_branch") or setting("default_branch"))


def _payment_entry(company, customer, amount, reference_no, invoice=None, remarks=None):
	ensure_mode(company)
	acct = clearing_account(company)
	pe = frappe.get_doc({"doctype": "Payment Entry", "payment_type": "Receive", "company": company, "posting_date": nowdate(), "mode_of_payment": MODE,
		"party_type": "Customer", "party": customer, "paid_amount": amount, "received_amount": amount, "paid_to": acct, "reference_no": reference_no,
		"reference_date": nowdate(), "remarks": remarks,
		"references": [{"reference_doctype": "Sales Invoice", "reference_name": invoice, "allocated_amount": amount}] if invoice else []})
	pe.setup_party_account_field()
	pe.set_missing_values()
	pe.paid_to = acct
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	return pe.name


def fulfil(op):
	if op.reference_doctype == "Online Visit Request":
		from hospital_vvs.services import billing, online_visit as ovs

		ov = frappe.get_doc("Online Visit Request", op.reference_name)
		patient = ovs.ensure_patient(ov)
		customer = frappe.db.get_value("Patient", patient, "customer")
		frappe.flags.hv_no_shift = True  # card money is in the gateway, not a drawer
		try:
			si = billing.create_invoice(customer=customer, patient=patient, lines=[{"item_code": ovs.fee_item(), "qty": 1, "rate": flt(op.amount)}], billing_type="Fee",
				branch=ov.branch, reference_doctype="Online Visit Request", reference_name=ov.name, pos=False, remarks=_("Online visit {0} · card {1}").format(ov.name, op.provider_ref))
		finally:
			frappe.flags.hv_no_shift = False
		company = frappe.db.get_value("Sales Invoice", si, "company")
		pe = _payment_entry(company, customer, flt(op.amount), op.provider_ref, si, f"Card payment {op.name}")
		ov.db_set({"fee_status": "Verified", "payment_method": "Card (online)", "payment_reference": op.provider_ref, "sales_invoice": si, "payment_entry": pe,
			"fee_verified_at": now_datetime()})
		op.db_set({"sales_invoice": si, "payment_entry": pe})
		publish("ov", {"action": "fee", "name": ov.name}, ov.branch)
	elif op.reference_doctype == "Sales Invoice":
		si = frappe.get_doc("Sales Invoice", op.reference_name)
		amt = min(flt(op.amount), flt(si.outstanding_amount))
		pe = _payment_entry(si.company, si.customer, amt, op.provider_ref, si.name, f"Card payment {op.name}")
		op.db_set({"sales_invoice": si.name, "payment_entry": pe})


# ------------------------------------------------------------------ setup
def clearing_account(company):
	from hospital_vvs.services.shifts import company_account

	acc = setting("card_gateway_account")
	return company_account(acc, company) if acc else ensure_account(company)


def ensure_account(company):
	acc = frappe.db.get_value("Account", {"company": company, "account_name": "Card Gateway Clearing", "is_group": 0})
	if acc:
		return acc
	parent = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 1}) or \
		frappe.db.get_value("Account", {"company": company, "account_name": "Bank Accounts", "is_group": 1}) or \
		frappe.db.get_value("Account", {"company": company, "account_name": "Current Assets", "is_group": 1})
	return frappe.get_doc({"doctype": "Account", "account_name": "Card Gateway Clearing", "parent_account": parent, "company": company, "account_type": "Bank",
		"root_type": "Asset"}).insert(ignore_permissions=True).name


def ensure_mode(company):
	if not frappe.db.exists("Mode of Payment", MODE):
		frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": MODE, "type": "Bank", "enabled": 1}).insert(ignore_permissions=True)
	m = frappe.get_doc("Mode of Payment", MODE)
	if not any(a.company == company for a in m.accounts):
		m.append("accounts", {"company": company, "default_account": clearing_account(company)})
		m.save(ignore_permissions=True)


def ensure_setup():
	company = setting("company") or frappe.defaults.get_global_default("company")
	if not company:
		return
	acc = ensure_account(company)
	if not setting("card_gateway_account"):
		frappe.db.set_single_value("Clinic Settings", "card_gateway_account", acc)
	ensure_mode(company)
