"""All patient invoices created by VVSDesk (07-billing-finance.md). The pharmacy uses native POS instead.

ERPNext v16 flow (verified in apps/erpnext, see DECISIONS.md D-03): counters create a submitted **Sales Invoice
in POS mode** (is_pos=1, pos_profile). `is_created_using_pos` stays 0 until cashier shifts (Phase 2) attach the
invoice to the collector's POS Opening Entry.

Tax is on the original price before discount (verified by test: ERPNext's own "Grand Total" discount still lowers the
tax base): percentage taxes are frozen as Actual amounts on the undiscounted total, then the discount is applied.
"""

import frappe
from frappe import _
from frappe.utils import flt, today

from hospital_vvs.utils import branch_company, settings


def pos_profile_for(billing_type, branch):
	for row in settings().pos_profiles or []:
		if row.billing_type == billing_type and row.branch == branch:
			return row.pos_profile
	frappe.throw(_("No POS Profile is set for billing type {0} at branch {1} (Clinic Settings → POS & Warehouses).")
		.format(billing_type, branch))


def existing_invoice(reference_doctype, reference_name, payer=False):
	filters = {"hv_reference_doctype": reference_doctype, "hv_reference_name": reference_name, "docstatus": ["<", 2],
		"is_return": 0}
	filters["hv_is_payer_share"] = 1 if payer else 0
	return frappe.db.get_value("Sales Invoice", filters, "name")


def split_lines(lines, fraction):
	"""Scale each line's rate by `fraction` (payer split keeps revenue per item correct on both invoices)."""
	return [dict(l, rate=flt(l["rate"]) * fraction) for l in lines if flt(l["rate"]) * fraction or not flt(l["rate"])]


def create_invoice(*, customer, patient, lines, billing_type, branch, reference_doctype, reference_name,
	discount_amount=0, payment_mode="Cash", pos=True, payer_share_of=None, remarks=None, posting_date=None, payer=False):
	"""Create and submit a Sales Invoice. Idempotent per (reference, payer/patient side). Returns its name."""
	existing = existing_invoice(reference_doctype, reference_name, payer=payer)
	if existing:
		return existing
	profile_name = pos_profile_for(billing_type, branch)
	profile = frappe.get_cached_doc("POS Profile", profile_name)  # income account / cost center of the billing type
	shift = None
	if pos:
		from hospital_vvs.services.shifts import billing_shift

		shift = billing_shift(branch, posting_date)
	si = frappe.new_doc("Sales Invoice")
	si.update({
		"customer": customer, "company": profile.company or branch_company(branch), "posting_date": posting_date or frappe.utils.today(),
		"set_posting_time": 1 if posting_date and str(posting_date) != frappe.utils.today() else 0, "branch": branch, "cost_center": profile.cost_center, "selling_price_list": profile.selling_price_list,
		"hv_patient": patient, "hv_billing_type": billing_type, "hv_reference_doctype": reference_doctype,
		"hv_reference_name": reference_name, "hv_payer_share_of": payer_share_of, "hv_is_payer_share": int(payer), "remarks": remarks,
		"apply_discount_on": "Net Total", "update_stock": 0, "ignore_pricing_rule": 1,
	})
	if profile.taxes_and_charges:
		si.taxes_and_charges = profile.taxes_and_charges
	if pos:
		si.is_pos = 1
		si.pos_profile = shift.pos_profile if shift else profile_name
		if shift:
			si.is_created_using_pos = 1  # joins the collector's shift → their POS Closing Entry
			si.hv_counter = shift.hv_counter
	for l in lines:
		si.append("items", {
			"item_code": l["item_code"], "qty": flt(l.get("qty") or 1), "rate": flt(l["rate"]),
			"price_list_rate": flt(l["rate"]), "income_account": profile.income_account, "cost_center": profile.cost_center,
			"description": l.get("description"),
		})
	si.set_missing_values()
	for item, l in zip(si.items, lines):
		item.rate = item.price_list_rate = flt(l["rate"])
		item.discount_percentage = 0
		item.income_account = profile.income_account or item.income_account
		item.cost_center = profile.cost_center or item.cost_center
	# the billing type's tax template wins over whatever the counter's POS Profile brought in
	si.taxes_and_charges = profile.taxes_and_charges
	si.set("taxes", [])
	if si.taxes_and_charges:
		si.set_taxes()
	si.calculate_taxes_and_totals()
	if flt(discount_amount):
		# Tax on the original price before discount (DECISIONS D-04): freeze each percentage tax at its amount on the
		# undiscounted total, then take the discount off the net total.
		for tax in si.taxes:
			if tax.charge_type == "On Net Total":
				tax.tax_amount = flt(si.net_total) * flt(tax.rate) / 100
				tax.charge_type = "Actual"
		si.apply_discount_on = "Net Total"
		si.discount_amount = flt(discount_amount)
		si.calculate_taxes_and_totals()
	if pos:
		si.set("payments", [])
		pay_profile = frappe.get_cached_doc("POS Profile", si.pos_profile)
		mop = next((p for p in pay_profile.payments if p.mode_of_payment == payment_mode), None) or next(
			(p for p in pay_profile.payments if p.default), None) or (pay_profile.payments[0] if pay_profile.payments else None)
		if not mop:
			frappe.throw(_("POS Profile {0} has no payment methods.").format(profile_name))
		amount = flt(si.rounded_total or si.grand_total)
		si.append("payments", {"mode_of_payment": mop.mode_of_payment, "amount": amount})
		si.calculate_taxes_and_totals()
	si.flags.ignore_permissions = True
	si.insert()
	if flt(si.grand_total) or not pos:
		si.submit()
	return si.name


def cancel_invoice(name):
	if not name:
		return
	si = frappe.get_doc("Sales Invoice", name)
	if si.docstatus == 1:
		si.flags.hv_cancel = True
		si.flags.ignore_permissions = True
		si.cancel()
	elif si.docstatus == 0:
		frappe.delete_doc("Sales Invoice", name, ignore_permissions=True)


def on_invoice_cancel(doc, method=None):
	"""Invoices made by VVSDesk are cancelled through their source document (OPD Slip …), never on their own."""
	if doc.get("hv_reference_doctype") and not doc.flags.hv_cancel:
		src = frappe.db.get_value(doc.hv_reference_doctype, doc.hv_reference_name, "docstatus")
		if src == 1:
			frappe.throw(_("This invoice belongs to {0} {1}. Cancel it from there, or issue a refund.")
				.format(doc.hv_reference_doctype, doc.hv_reference_name))


def refund_invoice(name, reason, items=None, payment_mode=None):
	"""Return invoice (credit note) against a counter invoice, paid back from the current shift.
	items: optional {item_code: qty} for a partial refund; default = everything."""
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return
	from hospital_vvs.services.shifts import billing_shift

	src = frappe.get_doc("Sales Invoice", name)
	if src.docstatus != 1 or src.is_return:
		frappe.throw(_("Only a submitted sale can be refunded."))
	if not (reason or "").strip():
		frappe.throw(_("Enter the refund reason."))
	shift = billing_shift(src.branch, today())
	ret = make_sales_return(src.name)
	if items:
		ret.items = [i for i in ret.items if i.item_code in items]
		for i in ret.items:
			i.qty = -abs(flt(items[i.item_code]))
	if shift:
		ret.pos_profile = shift.pos_profile
		ret.is_created_using_pos = 1
		ret.hv_counter = shift.hv_counter
	ret.posting_date = today()
	ret.set_posting_time = 0
	ret.remarks = f"Refund: {reason}"
	ret.calculate_taxes_and_totals()
	if ret.is_pos:
		mode = payment_mode or (src.payments[0].mode_of_payment if src.payments else "Cash")
		ret.set("payments", [{"mode_of_payment": mode, "amount": flt(ret.rounded_total or ret.grand_total)}])
		ret.calculate_taxes_and_totals()
	ret.flags.ignore_permissions = True
	ret.insert()
	ret.submit()
	return ret.name
