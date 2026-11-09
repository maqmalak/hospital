"""Doctor share (commission) API for /doctor-share (accountant) and /my-share (the doctor's own statement). D-43."""

import frappe
from frappe import _
from frappe.utils import flt

from hospital_vvs import roles as R
from hospital_vvs.services import doctor_share as svc
from hospital_vvs.utils import require_roles, settings

FIN = (R.ACCOUNTANT, R.CASH_SUPERVISOR)


def _company(company=None):
	return company or settings().company or frappe.defaults.get_global_default("company")


@frappe.whitelist()
def overview(company=None, branch=None):
	"""Every doctor with commission: earned, taken back, paid, unpaid (what we owe now)."""
	require_roles(*FIN)
	rows = svc.balances(_company(company), branch)
	return {"doctors": rows, "company": _company(company), "basis": settings().get("doctor_share_basis") or "On payment",
		"totals": {k: flt(sum(flt(r.get(k)) for r in rows)) for k in ("earned", "reversed", "paid", "unpaid")},
		"modes": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name"), "expense_account": settings().get("doctor_share_expense_account")}


@frappe.whitelist()
def statement(doctor, from_date=None, to_date=None, status=None):
	require_roles(*FIN)
	return svc.statement(doctor, from_date, to_date, status)


@frappe.whitelist()
def my_statement(from_date=None, to_date=None):
	"""The signed-in doctor's own commission statement (read-only)."""
	doctor = frappe.db.get_value("Doctor", {"user": frappe.session.user}, "name")
	if not doctor:
		frappe.throw(_("Your user is not linked to a doctor."), frappe.PermissionError)
	return svc.statement(doctor, from_date, to_date)


@frappe.whitelist()
def unpaid(doctor, company=None, from_date=None, to_date=None, branch=None):
	require_roles(*FIN)
	rows = svc.unpaid_rows(doctor, _company(company), from_date, to_date, branch)
	return {"rows": rows, "total": flt(sum(r.amount for r in rows), 2)}


@frappe.whitelist(methods=["POST"])
def pay(doctor, mode_of_payment, company=None, from_date=None, to_date=None, branch=None, reference_no=None, remarks=None):
	"""Payout run: all unpaid commission of the period → Doctor Share Payout (submitted) → Payment Entry to the doctor's supplier."""
	require_roles(R.ACCOUNTANT)
	p = svc.make_payout(doctor, _company(company), mode_of_payment, from_date, to_date, branch, reference_no, remarks)
	p.flags.ignore_permissions = True
	p.submit()
	return {"payout": p.name, "payment_entry": p.payment_entry, "total": p.total_amount}


@frappe.whitelist(methods=["POST"])
def cancel_payout(name):
	require_roles(R.ACCOUNTANT)
	p = frappe.get_doc("Doctor Share Payout", name)
	p.flags.ignore_permissions = True
	p.cancel()
	return {"ok": True}


@frappe.whitelist(methods=["POST"])
def save_rule(data):
	require_roles(R.ACCOUNTANT)
	d = frappe.parse_json(data)
	doc = frappe.get_doc("Doctor Share Rule", d["name"]) if d.get("name") else frappe.new_doc("Doctor Share Rule")
	for k in ("doctor", "billing_type", "item_group", "item_code", "share_type", "value", "basis", "from_date", "to_date", "branch", "is_active", "note"):
		if k in d:
			doc.set(k, d[k] or None if k not in ("value", "is_active") else d[k])
	if flt(doc.value) <= 0:
		frappe.throw(_("Enter the commission percent or amount."))
	if doc.share_type == "Percent" and flt(doc.value) > 100:
		frappe.throw(_("A percent cannot be more than 100."))
	doc.flags.ignore_permissions = True
	doc.save()
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def recompute(invoice):
	"""Re-check one bill's commission (after adding a rule for past bills)."""
	require_roles(R.ACCOUNTANT)
	svc.sync_invoice(invoice)
	return frappe.get_all("Doctor Share Ledger", filters={"sales_invoice": invoice}, fields=["name", "doctor", "amount", "entry_type"])


@frappe.whitelist(methods=["POST"])
def recompute_range(from_date, to_date):
	"""Apply new / changed rules to bills already posted in a period (adds only the difference)."""
	require_roles(R.ACCOUNTANT)
	names = frappe.get_all("Sales Invoice", filters={"posting_date": ["between", [from_date, to_date]], "docstatus": ["in", [1, 2]],
		"hv_billing_type": ["in", ["OPD Slip", "Fee", "Lab", "IPD Slip", "General"]]}, pluck="name")
	for n in names:
		svc.backfill_doctors(n)
		svc.sync_invoice(n)
	return {"bills": len(names)}


@frappe.whitelist()
def doctors():
	require_roles(*FIN)
	return frappe.get_all("Doctor", filters={"is_active": 1}, fields=["name", "doctor_name", "doctor_type", "specialization", "supplier"], order_by="doctor_name")
