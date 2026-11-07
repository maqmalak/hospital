"""Store keeper screens: stock by batch, receiving, transfers, expiry & returns, cycle counts, pharmacy reports."""

import frappe
from frappe import _
from frappe.utils import add_days, cint, date_diff, flt, nowdate, today

from hospital_vvs import roles as R
from hospital_vvs.services import pharmacy
from hospital_vvs.setup.company import ABBR
from hospital_vvs.utils import default_branch, require_roles, setting

STORE = (R.STORE_KEEPER, R.REVIEWER)


def warehouses(branch=None):
	branch = branch or default_branch()
	code = frappe.db.get_value("Branch", branch, "hv_branch_code") or "LHR"
	return {k: f"{k} {code} - {ABBR}" for k in ("Main Store", "Pharmacy Retail", "IPD Dispensing", "Lab Store", "General Store", "Quarantine")}


@frappe.whitelist()
def context(branch=None):
	require_roles(*STORE, R.PHARMACY_CASHIER)
	return {"warehouses": warehouses(branch), "suppliers": frappe.get_all("Supplier", pluck="name"),
		"near_expiry_days": cint(setting("near_expiry_days")) or 90, "categories": frappe.get_all("Medicine Category", pluck="name")}


@frappe.whitelist()
def stock(warehouse, q=None, only_flags=0):
	"""Batch-wise stock in packs / strips / units with expiry flags."""
	require_roles(*STORE, R.PHARMACY_CASHIER)
	filters = {"hv_is_medicine": 1}
	or_f = {"item_name": ["like", f"%{q}%"], "hv_generic": ["like", f"%{q}%"]} if q else None
	out = []
	for it in frappe.get_all("Item", filters=filters, or_filters=or_f, fields=["name", "item_name", "hv_generic", "hv_strength", "hv_dosage_form", "hv_rack_location",
		"hv_controlled_drug"], order_by="item_name", limit=300):
		p = pharmacy.pack(it.name)
		bs = pharmacy.batches(it.name, warehouse, include_expired=True)
		units = sum(b["qty"] for b in bs)
		row = dict(it, upp=p.upp, stock=pharmacy.split_stock(p, units), batches=[dict(b, split=pharmacy.split_stock(p, b["qty"])) for b in bs],
			expired=any(b["expired"] for b in bs), near_expiry=any(b["near_expiry"] for b in bs),
			reorder=flt(frappe.db.get_value("Item Reorder", {"parent": it.name, "warehouse": warehouse}, "warehouse_reorder_level")))
		if cint(only_flags) and not (row["expired"] or row["near_expiry"] or units == 0):
			continue
		out.append(row)
	return out


@frappe.whitelist(methods=["POST"])
def receive(supplier, warehouse, lines, bill_no=None, branch=None):
	require_roles(R.STORE_KEEPER)
	return pharmacy.receive_stock(supplier, warehouse, frappe.parse_json(lines), bill_no, branch or default_branch())


@frappe.whitelist()
def requests(branch=None):
	require_roles(*STORE, R.NURSE, R.LAB_USER)
	w = warehouses(branch)
	rows = frappe.get_all("Material Request", filters={"material_request_type": "Material Transfer", "docstatus": 1, "status": ["not in", ["Transferred", "Stopped", "Cancelled"]],
		"set_warehouse": ["in", list(w.values())]}, fields=["name", "transaction_date", "set_warehouse", "set_from_warehouse", "status", "per_ordered", "owner"],
		order_by="creation desc")
	for r in rows:
		r["items"] = frappe.get_all("Material Request Item", filters={"parent": r.name}, fields=["item_code", "item_name", "qty", "ordered_qty", "uom"])
	return rows


@frappe.whitelist(methods=["POST"])
def create_request(target, items, source=None):
	"""Pharmacy / IPD / lab ask the store for stock. items: [{item_code, qty (units)}]."""
	require_roles(*STORE, R.NURSE, R.LAB_USER, R.PHARMACY_CASHIER)
	branch = default_branch()
	source = source or warehouses(branch)["Main Store"]
	company = frappe.db.get_value("Warehouse", target, "company")
	cost_center = frappe.get_cached_value("Company", company, "cost_center")
	mr = frappe.get_doc({"doctype": "Material Request", "material_request_type": "Material Transfer", "company": company, "transaction_date": today(),
		"cost_center": cost_center,
		"schedule_date": today(), "set_warehouse": target, "set_from_warehouse": source,
		"items": [{"item_code": i["item_code"], "qty": flt(i["qty"]), "warehouse": target, "from_warehouse": source, "schedule_date": today(),
			"uom": frappe.get_cached_value("Item", i["item_code"], "stock_uom"), "conversion_factor": 1, "cost_center": cost_center}
			for i in frappe.parse_json(items)]})
	mr.flags.ignore_permissions = True
	mr.insert()
	mr.submit()
	return mr.name


@frappe.whitelist(methods=["POST"])
def transfer(material_request):
	"""Issue a request from the store by batch, earliest expiry first."""
	require_roles(R.STORE_KEEPER)
	mr = frappe.get_doc("Material Request", material_request)
	items = [{"item_code": i.item_code, "qty": flt(i.qty) - flt(i.ordered_qty), "material_request_item": i.name} for i in mr.items if flt(i.qty) > flt(i.ordered_qty)]
	return pharmacy.fefo_transfer(mr.set_from_warehouse, mr.set_warehouse, items, material_request=mr.name, remarks=f"Against {mr.name}")


@frappe.whitelist()
def expiry(branch=None, window=None):
	require_roles(*STORE)
	w = warehouses(branch)
	window = cint(window) or cint(setting("near_expiry_days")) or 90
	rows = []
	for key in ("Main Store", "Pharmacy Retail", "IPD Dispensing", "Quarantine"):
		for it in frappe.get_all("Item", filters={"hv_is_medicine": 1, "has_batch_no": 1}, fields=["name", "item_name"]):
			for b in pharmacy.batches(it.name, w[key], include_expired=True):
				if b["expired"] or b["days_left"] <= window:
					rows.append(dict(b, item_code=it.name, item_name=it.item_name, warehouse=w[key], location=key,
						value=b["qty"] * flt(frappe.db.get_value("Bin", {"item_code": it.name, "warehouse": w[key]}, "valuation_rate"))))
	rows.sort(key=lambda r: r["expiry"])
	return {"rows": rows, "window": window, "quarantine": w["Quarantine"]}


@frappe.whitelist(methods=["POST"])
def quarantine(branch=None):
	require_roles(R.STORE_KEEPER)
	w = warehouses(branch)
	return pharmacy.quarantine_expired([w["Main Store"], w["Pharmacy Retail"], w["IPD Dispensing"]], w["Quarantine"])


@frappe.whitelist(methods=["POST"])
def supplier_return(batch_no, qty, warehouse, reason):
	require_roles(R.STORE_KEEPER)
	return pharmacy.supplier_return(batch_no, qty, warehouse, reason)


@frappe.whitelist(methods=["POST"])
def write_off(batch_no, qty, warehouse, reason):
	"""Expired / damaged stock written off (Material Issue) — Admin approval."""
	require_roles(R.ADMIN)
	item = frappe.db.get_value("Batch", batch_no, "item")
	return pharmacy.fefo_transfer(warehouse, None, [{"item_code": item, "qty": flt(qty), "batch_no": batch_no, "include_expired": 1}], purpose="Material Issue",
		remarks=f"Write-off: {reason}")


@frappe.whitelist()
def counts(branch=None):
	require_roles(R.STORE_KEEPER, R.ADMIN)
	rows = frappe.get_all("Cycle Count", filters={"branch": branch or default_branch()}, fields=["name", "warehouse", "count_date", "scope", "status",
		"total_variance_value", "counted_by", "approved_by", "stock_reconciliation"], order_by="creation desc", limit=50)
	return rows


@frappe.whitelist()
def count_sheet(name):
	"""Blind sheet: system quantities are hidden until the count is submitted."""
	require_roles(R.STORE_KEEPER, R.ADMIN)
	cc = frappe.get_doc("Cycle Count", name)
	out = cc.as_dict()
	if cc.status == "Draft":
		for r in out["items"]:
			r.pop("system_qty", None)
			r.pop("variance", None)
			r.pop("variance_value", None)
	return out


@frappe.whitelist(methods=["POST"])
def count_create(warehouse, scope="All", rack=None, category=None, branch=None):
	require_roles(R.STORE_KEEPER)
	return pharmacy.cycle_count_create(warehouse, branch or default_branch(), scope, rack, category).name


@frappe.whitelist(methods=["POST"])
def count_submit(name, counts):
	require_roles(R.STORE_KEEPER)
	return pharmacy.cycle_count_submit(name, frappe.parse_json(counts)).as_dict()


@frappe.whitelist(methods=["POST"])
def count_approve(name, approve=1, note=None):
	return pharmacy.cycle_count_approve(name, cint(approve), note).as_dict()


@frappe.whitelist()
def reports(kind, branch=None, from_date=None, to_date=None):
	"""Pharmacy reports: controlled register, substitutions, sales & margin, slow-moving, reorder, returns."""
	require_roles(R.STORE_KEEPER, R.REVIEWER, R.ADMIN, R.ACCOUNTANT)
	branch = branch or default_branch()
	to_date = to_date or today()
	from_date = from_date or add_days(to_date, -29)
	a = (branch, from_date, to_date)
	if kind == "controlled":
		return frappe.db.sql("""select posting_date, item_code, batch_no, qty, balance, patient, prescription, prescriber, sales_invoice, dispensed_by
			from `tabControlled Drug Register` where branch=%s and posting_date between %s and %s order by creation desc""", a, as_dict=True)
	if kind == "substitutions":
		return frappe.db.sql("""select si.posting_date, si.name invoice, sii.hv_original_item original, sii.item_code substitute, sii.qty, sii.uom,
			sii.hv_substitute_approved_by approved_by from `tabSales Invoice Item` sii join `tabSales Invoice` si on si.name=sii.parent
			where si.branch=%s and si.posting_date between %s and %s and ifnull(sii.hv_original_item,'')!='' and si.docstatus=1""", a, as_dict=True)
	if kind == "margin":
		return frappe.db.sql("""select sii.item_code, sii.item_name, sum(sii.stock_qty) units, sum(sii.base_net_amount) sales,
			sum(sii.stock_qty * sii.incoming_rate) cost, sum(sii.base_net_amount) - sum(sii.stock_qty * sii.incoming_rate) margin
			from `tabSales Invoice Item` sii join `tabSales Invoice` si on si.name=sii.parent where si.docstatus=1 and si.hv_billing_type='Medicine'
			and si.branch=%s and si.posting_date between %s and %s group by sii.item_code order by sales desc""", a, as_dict=True)
	if kind == "slow":
		w = warehouses(branch)["Pharmacy Retail"]
		sold = {r.item_code: flt(r.u) for r in frappe.db.sql("""select sii.item_code, sum(sii.stock_qty) u from `tabSales Invoice Item` sii
			join `tabSales Invoice` si on si.name=sii.parent where si.docstatus=1 and si.hv_billing_type='Medicine' and si.branch=%s
			and si.posting_date between %s and %s group by sii.item_code""", a, as_dict=True)}
		out = []
		for it in frappe.get_all("Item", filters={"hv_is_medicine": 1}, fields=["name", "item_name"]):
			units = pharmacy.stock_units(it.name, w)
			if units and sold.get(it.name, 0) <= units * 0.05:
				out.append({"item_code": it.name, "item_name": it.item_name, "stock_units": units, "sold_units": sold.get(it.name, 0)})
		return out
	if kind == "returns":
		return frappe.db.sql("""select posting_date, name, supplier, grand_total, remarks from `tabPurchase Receipt` where is_return=1 and docstatus=1
			and posting_date between %s and %s order by posting_date desc""", (from_date, to_date), as_dict=True)
	frappe.throw(_("Unknown report"))
