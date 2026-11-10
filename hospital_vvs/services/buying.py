"""Buying for both companies (D-59): VVS Hospital (consumables, machinery, infrastructure) and the contract pharmacy
(medicines by batch). Supplier → Purchase Order → Purchase Receipt (stock by batch / expiry, or fixed assets with a
location) → Purchase Invoice → Payment Entry. Material Requests from wards / lab feed purchase orders.

All documents are standard ERPNext documents; these helpers only fill them the hospital way.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate, today

from hospital_vvs.utils import setting


def company_of(warehouse):
	return frappe.db.get_value("Warehouse", warehouse, "company")


def ensure_supplier(name, group, **kw):
	if not frappe.db.exists("Supplier Group", group):
		frappe.get_doc({"doctype": "Supplier Group", "supplier_group_name": group, "parent_supplier_group": "All Supplier Groups"}).insert(ignore_permissions=True)
	if frappe.db.exists("Supplier", name):
		return name
	return frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_group": group, "supplier_type": "Company", "country": "Pakistan",
		**{k: v for k, v in kw.items() if v}}).insert(ignore_permissions=True).name


def _is_medicine(item_code):
	return cint(frappe.get_cached_value("Item", item_code, "hv_is_medicine"))


def make_po(supplier, company, lines, schedule_date=None, transaction_date=None, submit=True, cost_center=None, remarks=None, material_request=None):
	"""lines: [{item_code, qty (packs for medicines, else stock units), rate (per pack / per unit), warehouse}]."""
	from hospital_vvs.services.pharmacy import pack

	po = frappe.new_doc("Purchase Order")
	tdate = transaction_date or today()
	po.update({"supplier": supplier, "company": company, "transaction_date": tdate, "schedule_date": schedule_date or add_days(tdate, 7),
		"set_warehouse": lines[0].get("warehouse") if lines else None})
	if remarks and po.meta.has_field("remarks"):
		po.remarks = remarks
	for ln in lines:
		qty, rate, uom = flt(ln["qty"]), flt(ln["rate"]), frappe.get_cached_value("Item", ln["item_code"], "stock_uom")
		if _is_medicine(ln["item_code"]):
			p = pack(ln["item_code"])  # medicines are ordered in packs, stocked in units
			qty, rate = qty * p.upp, rate / p.upp
		row = {"item_code": ln["item_code"], "qty": qty, "rate": rate, "uom": uom, "stock_uom": uom, "conversion_factor": 1, "warehouse": ln.get("warehouse"),
			"schedule_date": schedule_date or add_days(tdate, 7)}
		if cost_center or ln.get("cost_center"):
			row["cost_center"] = ln.get("cost_center") or cost_center
		if material_request:
			row.update(material_request=material_request, material_request_item=ln.get("material_request_item"))
		po.append("items", row)
	po.flags.ignore_permissions = True
	po.insert()
	if submit:
		po.submit()
	return po


def receive_po(po_name, lines=None, posting_date=None, bill_no=None, asset_location=None):
	"""Purchase Receipt from a PO. Medicines: lines {po_detail: {batch_no, expiry, qty?}} (qty in units, default = what is still to receive).
	Fixed assets need a location (asset_location)."""
	from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_receipt

	pr = make_purchase_receipt(po_name)
	pr.posting_date = posting_date or today()
	pr.set_posting_time = 1
	pr.supplier_delivery_note = bill_no
	lines = lines or {}
	for row in pr.items:
		info = lines.get(row.purchase_order_item) or {}
		if info.get("qty") is not None:
			row.qty = row.received_qty = flt(info["qty"])
		if cint(frappe.get_cached_value("Item", row.item_code, "has_batch_no")):
			batch = info.get("batch_no") or f"{row.item_code[:6]}-{frappe.generate_hash(length=5).upper()}"
			if not frappe.db.exists("Batch", batch):
				bd = {"doctype": "Batch", "batch_id": batch, "item": row.item_code, "supplier": pr.supplier, "expiry_date": getdate(info.get("expiry") or add_days(today(), 540))}
				if _is_medicine(row.item_code):  # the POS prices a batch from its MRP and pack sizes
					from hospital_vvs.services.pharmacy import pack

					p = pack(row.item_code)
					last = frappe.db.get_value("Batch", {"item": row.item_code, "hv_mrp_per_pack": [">", 0]}, ["hv_mrp_per_pack", "hv_purchase_rate_per_pack"], as_dict=True,
						order_by="creation desc") or {}
					bd.update(hv_mrp_per_pack=flt(info.get("mrp_per_pack")) or flt(last.get("hv_mrp_per_pack")) or round(flt(row.rate) * p.upp * 1.18),
						hv_purchase_rate_per_pack=flt(row.rate) * p.upp, hv_units_per_strip=p.ups, hv_strips_per_pack=p.spp)
				frappe.get_doc(bd).insert(ignore_permissions=True)
			row.batch_no, row.use_serial_batch_fields = batch, 1
		if cint(frappe.get_cached_value("Item", row.item_code, "is_fixed_asset")):
			row.asset_location = info.get("location") or asset_location
	pr.items = [r for r in pr.items if flt(r.qty) > 0]
	pr.flags.ignore_permissions = True
	pr.insert()
	pr.submit()
	return pr


def bill(source_doctype, source_name, bill_no=None, bill_date=None, posting_date=None):
	"""Purchase Invoice from a receipt (or straight from a PO for services)."""
	if source_doctype == "Purchase Receipt":
		from erpnext.stock.doctype.purchase_receipt.purchase_receipt import make_purchase_invoice
	else:
		from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_invoice
	pi = make_purchase_invoice(source_name)
	pi.bill_no, pi.bill_date = bill_no, bill_date or posting_date or today()
	if posting_date:
		pi.posting_date, pi.set_posting_time = posting_date, 1
		pi.due_date = add_days(posting_date, cint(setting("supplier_credit_days") or 30) if frappe.get_meta("Clinic Settings").has_field("supplier_credit_days") else 30)
	pi.flags.ignore_permissions = True
	pi.insert()
	pi.submit()
	return pi


def pay(pi_name, amount=None, mode_of_payment="Bank Transfer", reference_no=None, posting_date=None):
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

	pi = frappe.get_doc("Purchase Invoice", pi_name)
	out = flt(pi.outstanding_amount)
	if out <= 0:
		frappe.throw(_("{0} is already paid.").format(pi_name))
	amount = min(flt(amount) or out, out)
	pe = get_payment_entry("Purchase Invoice", pi_name, party_amount=amount)
	if not frappe.db.exists("Mode of Payment", mode_of_payment):
		mode_of_payment = "Cash"
	acc = get_bank_cash_account(mode_of_payment, pi.company).get("account")
	pe.mode_of_payment, pe.paid_from = mode_of_payment, acc
	pe.paid_amount = pe.received_amount = amount
	for r in pe.references:
		r.allocated_amount = amount
	pe.reference_no = reference_no or f"PAY-{frappe.generate_hash(length=6).upper()}"
	pe.reference_date = posting_date or nowdate()
	if posting_date:
		pe.posting_date = posting_date
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	return pe


def make_material_request(company, warehouse, lines, purpose="Purchase", requested_by=None, schedule_date=None, submit=True, remarks=None):
	mr = frappe.new_doc("Material Request")
	mr.update({"material_request_type": purpose, "company": company, "transaction_date": today(), "schedule_date": schedule_date or add_days(today(), 5),
		"set_warehouse": warehouse})
	if mr.meta.has_field("hv_requested_by"):
		mr.hv_requested_by = requested_by or frappe.session.user
	for ln in lines:
		uom = frappe.get_cached_value("Item", ln["item_code"], "stock_uom")
		mr.append("items", {"item_code": ln["item_code"], "qty": flt(ln["qty"]), "uom": uom, "stock_uom": uom, "conversion_factor": 1, "warehouse": warehouse,
			"schedule_date": schedule_date or add_days(today(), 5)})
	if remarks and mr.meta.has_field("remarks"):
		mr.remarks = remarks
	mr.flags.ignore_permissions = True
	mr.insert()
	if submit:
		mr.submit()
	return mr


def po_from_material_request(mr_name, supplier, rates=None):
	from erpnext.stock.doctype.material_request.material_request import make_purchase_order

	po = make_purchase_order(mr_name)
	po.supplier = supplier
	for r in po.items:
		r.rate = flt((rates or {}).get(r.item_code)) or flt(frappe.db.get_value("Item Price", {"item_code": r.item_code, "buying": 1}, "price_list_rate")) or flt(
			frappe.get_cached_value("Item", r.item_code, "valuation_rate")) or 1
	po.flags.ignore_permissions = True
	po.insert()
	po.submit()
	return po


def issue_consumables(warehouse, lines, cost_center, posting_date=None, remarks=None, expense_account=None):
	"""Consumption: Material Issue to a department's cost centre. lines [{item_code, qty}] in stock units (batches FEFO)."""
	from hospital_vvs.services.pharmacy import batches

	company = company_of(warehouse)
	se = frappe.new_doc("Stock Entry")
	se.update({"stock_entry_type": "Material Issue", "purpose": "Material Issue", "company": company, "from_warehouse": warehouse, "remarks": remarks})
	if posting_date:
		se.posting_date, se.set_posting_time = posting_date, 1
	acc = expense_account or consumption_account(company)
	for ln in lines:
		need, code = flt(ln["qty"]), ln["item_code"]
		uom = frappe.get_cached_value("Item", code, "stock_uom")
		if cint(frappe.get_cached_value("Item", code, "has_batch_no")):
			for b in batches(code, warehouse):
				if need <= 0:
					break
				take = min(flt(b["qty"]), need)
				se.append("items", {"item_code": code, "qty": take, "uom": uom, "stock_uom": uom, "conversion_factor": 1, "s_warehouse": warehouse,
					"batch_no": b["batch_no"], "use_serial_batch_fields": 1, "cost_center": cost_center, "expense_account": acc})
				need -= take
			if need > 0.0001:
				frappe.throw(_("Not enough {0} in {1}.").format(code, warehouse))
		else:
			se.append("items", {"item_code": code, "qty": need, "uom": uom, "stock_uom": uom, "conversion_factor": 1, "s_warehouse": warehouse,
				"cost_center": cost_center, "expense_account": acc})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	return se


def consumption_account(company):
	abbr = frappe.get_cached_value("Company", company, "abbr")
	name = f"Medical Consumables Consumed - {abbr}"
	if not frappe.db.exists("Account", name):
		parent = frappe.db.get_value("Account", {"company": company, "account_name": "Stock Expenses", "is_group": 1}) or \
			frappe.db.get_value("Account", {"company": company, "root_type": "Expense", "is_group": 1})
		frappe.get_doc({"doctype": "Account", "account_name": "Medical Consumables Consumed", "company": company, "parent_account": parent,
			"root_type": "Expense", "report_type": "Profit and Loss", "account_type": "Expense Account"}).insert(ignore_permissions=True)
	return name
