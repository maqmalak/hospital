"""Buying, assets and consumption screens (D-59), rebuilt in the hospital style after the real-estate Buying / Assets modules.

/buying (dashboard) · /suppliers · /purchase_order · /purchase_receipt · /purchase_invoice · /material_request · /assets · /consumption
Both companies: VVS Hospital (consumables, machinery, infrastructure) and the contract pharmacy (medicines by batch).
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_first_day, getdate, today

from hospital_vvs import roles as R
from hospital_vvs.services import assets as A
from hospital_vvs.services import buying as B
from hospital_vvs.utils import has_any_role, require_roles

BUY = (R.STORE_KEEPER, R.ACCOUNTANT)
SEE = (R.STORE_KEEPER, R.ACCOUNTANT, R.CASH_SUPERVISOR)


def _companies():
	ph = frappe.db.get_single_value("Clinic Settings", "pharmacy_company")
	return [c for c in frappe.get_all("Company", pluck="name", order_by="name")], ph


def _co(company):
	cos, _ph = _companies()
	if company and company not in cos:
		frappe.throw(_("Unknown company."))
	return company


# ------------------------------------------------------------------ dashboard
@frappe.whitelist()
def dashboard(company=None):
	require_roles(*SEE)
	_co(company)
	f = {"company": company} if company else {}
	month = get_first_day(today())
	po = {r.status: r for r in frappe.db.sql("""select status, count(*) n, sum(grand_total) amount from `tabPurchase Order` where docstatus=1 {0}
		group by status""".format("and company=%(c)s" if company else ""), {"c": company}, as_dict=True)}
	unpaid = frappe.db.sql("""select count(*) n, coalesce(sum(outstanding_amount),0) amount, coalesce(sum(case when due_date<%(d)s then outstanding_amount end),0) overdue
		from `tabPurchase Invoice` where docstatus=1 and outstanding_amount>0 {0}""".format("and company=%(c)s" if company else ""), {"c": company, "d": today()}, as_dict=True)[0]
	month_spend = frappe.db.sql("""select company, coalesce(sum(base_grand_total),0) amount from `tabPurchase Invoice` where docstatus=1 and posting_date>=%(m)s {0}
		group by company""".format("and company=%(c)s" if company else ""), {"c": company, "m": month}, as_dict=True)
	by_supplier = frappe.db.sql("""select supplier, company, sum(outstanding_amount) owed, count(*) bills from `tabPurchase Invoice` where docstatus=1 and outstanding_amount>0
		{0} group by supplier, company order by owed desc limit 8""".format("and company=%(c)s" if company else ""), {"c": company}, as_dict=True)
	by_group = frappe.db.sql("""select s.supplier_group grp, sum(pi.base_grand_total) amount from `tabPurchase Invoice` pi join tabSupplier s on s.name=pi.supplier
		where pi.docstatus=1 and pi.posting_date>=%(from)s {0} group by s.supplier_group order by amount desc""".format("and pi.company=%(c)s" if company else ""),
		{"c": company, "from": add_days(today(), -90)}, as_dict=True)
	recent = frappe.get_all("Purchase Order", filters={**f, "docstatus": ["<", 2]}, fields=["name", "supplier", "company", "transaction_date", "grand_total", "status", "per_received", "per_billed"],
		order_by="creation desc", limit=8)
	mr = frappe.db.count("Material Request", {**f, "docstatus": 1, "status": ["in", ["Pending", "Partially Ordered"]], "material_request_type": "Purchase"})
	return {"po": po, "unpaid": unpaid, "month": month_spend, "by_supplier": by_supplier, "by_group": by_group, "recent": recent, "mr_pending": mr,
		"companies": _companies()[0], "pharmacy_company": _companies()[1]}


# ------------------------------------------------------------------ suppliers
@frappe.whitelist()
def suppliers(q=None, group=None):
	require_roles(*SEE)
	f = {"disabled": 0, "supplier_group": ["!=", "Doctors"]}
	if group:
		f["supplier_group"] = group
	of = {"supplier_name": ["like", f"%{q}%"], "name": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("Supplier", filters=f, or_filters=of, fields=["name", "supplier_name", "supplier_group", "tax_id", "country", "mobile_no", "email_id", "creation"],
		order_by="supplier_name", limit=300)
	owed = {r.supplier: r for r in frappe.db.sql("""select supplier, sum(outstanding_amount) owed, sum(base_grand_total) billed, max(posting_date) last_bill
		from `tabPurchase Invoice` where docstatus=1 group by supplier""", as_dict=True)}
	open_po = {r.supplier: r.n for r in frappe.db.sql("""select supplier, count(*) n from `tabPurchase Order` where docstatus=1 and status in
		('To Receive and Bill','To Receive','To Bill') group by supplier""", as_dict=True)}
	for r in rows:
		o = owed.get(r.name) or {}
		r.update(owed=flt(o.get("owed")), billed=flt(o.get("billed")), last_bill=o.get("last_bill"), open_po=open_po.get(r.name, 0))
	groups = frappe.get_all("Supplier Group", filters={"is_group": 0, "name": ["!=", "Doctors"]}, pluck="name", order_by="name")
	return {"rows": rows, "groups": groups}


@frappe.whitelist()
def supplier(name):
	require_roles(*SEE)
	s = frappe.get_doc("Supplier", name)
	pos = frappe.get_all("Purchase Order", filters={"supplier": name, "docstatus": ["<", 2]}, fields=["name", "company", "transaction_date", "grand_total", "status", "per_received", "per_billed"],
		order_by="transaction_date desc", limit=30)
	pis = frappe.get_all("Purchase Invoice", filters={"supplier": name, "docstatus": 1}, fields=["name", "company", "posting_date", "bill_no", "grand_total", "outstanding_amount", "status", "due_date"],
		order_by="posting_date desc", limit=30)
	pays = frappe.get_all("Payment Entry", filters={"party_type": "Supplier", "party": name, "docstatus": 1}, fields=["name", "company", "posting_date", "paid_amount", "mode_of_payment", "reference_no"],
		order_by="posting_date desc", limit=30)
	return {"supplier": {k: s.get(k) for k in ("name", "supplier_name", "supplier_group", "tax_id", "country", "mobile_no", "email_id", "supplier_details")},
		"orders": pos, "invoices": pis, "payments": pays, "owed": sum(flt(p.outstanding_amount) for p in pis)}


@frappe.whitelist(methods=["POST"])
def save_supplier(data):
	require_roles(*BUY)
	d = frappe.parse_json(data)
	if d.get("name") and frappe.db.exists("Supplier", d["name"]):
		s = frappe.get_doc("Supplier", d["name"])
		for k in ("supplier_group", "tax_id", "mobile_no", "email_id", "supplier_details"):
			if k in d:
				s.set(k, d[k])
		s.flags.ignore_permissions = True
		s.save()
		return s.name
	if not (d.get("supplier_name") or "").strip():
		frappe.throw(_("Enter the supplier's name."))
	return B.ensure_supplier(d["supplier_name"].strip(), d.get("supplier_group") or "Hospital Supplies", tax_id=d.get("tax_id"), mobile_no=d.get("mobile_no"),
		email_id=d.get("email_id"))


# ------------------------------------------------------------------ items for order lines
@frappe.whitelist()
def items(company, q=""):
	require_roles(*SEE)
	_cos, ph = _companies()
	f = {"disabled": 0, "is_purchase_item": 1}
	if company == ph:
		f["hv_is_medicine"] = 1
	else:
		f["hv_is_medicine"] = 0
		f["item_group"] = ["in", ["Consumable", "Hospital Assets"]]
	of = {"item_name": ["like", f"%{q}%"], "item_code": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("Item", filters=f, or_filters=of, fields=["item_code", "item_name", "stock_uom", "is_fixed_asset", "is_stock_item", "has_batch_no",
		"asset_category", "valuation_rate", "hv_is_medicine"], limit=40, order_by="item_name")
	from hospital_vvs.services.pharmacy import pack

	for r in rows:
		last = frappe.db.sql("""select pii.rate from `tabPurchase Order Item` pii join `tabPurchase Order` po on po.name=pii.parent where pii.item_code=%s and po.docstatus=1
			order by po.transaction_date desc limit 1""", r.item_code)
		r["last_rate"] = flt(last[0][0]) if last else flt(r.valuation_rate)
		if r.hv_is_medicine:
			p = pack(r.item_code)
			r["units_per_pack"], r["last_rate"], r["uom"] = p.upp, r["last_rate"] * p.upp, "Pack"
		else:
			r["uom"] = r.stock_uom
	return rows


def _warehouses(company):
	return frappe.get_all("Warehouse", filters={"company": company, "is_group": 0, "name": ["not like", "%Transit%"]}, pluck="name", order_by="name")


@frappe.whitelist()
def form_context(company=None):
	require_roles(*SEE)
	cos, ph = _companies()
	company = company or cos[0]
	return {"companies": cos, "pharmacy_company": ph, "warehouses": {c: _warehouses(c) for c in cos},
		"suppliers": frappe.get_all("Supplier", filters={"disabled": 0, "supplier_group": ["!=", "Doctors"]}, fields=["name", "supplier_group"], order_by="name"),
		"locations": frappe.get_all("Location", filters={"is_group": 0}, pluck="name", order_by="name"),
		"cost_centers": {c: frappe.get_all("Cost Center", filters={"company": c, "is_group": 0}, pluck="name") for c in cos},
		"modes": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name")}


# ------------------------------------------------------------------ purchase orders
STATUS_FILTER = {"draft": {"docstatus": 0}, "receive": {"docstatus": 1, "status": ["in", ["To Receive and Bill", "To Receive"]]}, "bill": {"docstatus": 1, "status": "To Bill"},
	"done": {"docstatus": 1, "status": ["in", ["Completed", "Closed"]]}}


@frappe.whitelist()
def orders(company=None, status=None, q=None):
	require_roles(*SEE)
	f = {"docstatus": ["<", 2]}
	if company:
		f["company"] = _co(company)
	f.update(STATUS_FILTER.get(status) or {})
	of = {"name": ["like", f"%{q}%"], "supplier": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("Purchase Order", filters=f, or_filters=of, fields=["name", "supplier", "company", "transaction_date", "schedule_date", "grand_total", "status",
		"per_received", "per_billed", "docstatus", "owner"], order_by="creation desc", limit=200)
	counts = {k: frappe.db.count("Purchase Order", {**({"company": company} if company else {}), **v}) for k, v in STATUS_FILTER.items()}
	return {"rows": rows, "counts": counts}


@frappe.whitelist()
def order(name):
	require_roles(*SEE)
	po = frappe.get_doc("Purchase Order", name)
	from hospital_vvs.services.pharmacy import pack

	lines = []
	for r in po.items:
		med = cint(frappe.get_cached_value("Item", r.item_code, "hv_is_medicine"))
		upp = pack(r.item_code).upp if med else 1
		lines.append({"name": r.name, "item_code": r.item_code, "item_name": r.item_name, "qty": r.qty, "received_qty": r.received_qty, "billed_amt": r.billed_amt, "rate": r.rate,
			"amount": r.amount, "warehouse": r.warehouse, "uom": r.uom, "units_per_pack": upp, "is_medicine": med, "has_batch_no": cint(frappe.get_cached_value("Item", r.item_code, "has_batch_no")),
			"is_fixed_asset": cint(frappe.get_cached_value("Item", r.item_code, "is_fixed_asset"))})
	receipts = frappe.db.sql("""select distinct pr.name, pr.posting_date, pr.grand_total, pr.status from `tabPurchase Receipt` pr join `tabPurchase Receipt Item` pri on pri.parent=pr.name
		where pri.purchase_order=%s and pr.docstatus=1""", name, as_dict=True)
	invoices = frappe.db.sql("""select distinct pi.name, pi.posting_date, pi.grand_total, pi.outstanding_amount, pi.status from `tabPurchase Invoice` pi
		join `tabPurchase Invoice Item` pii on pii.parent=pi.name where (pii.purchase_order=%s or pii.purchase_receipt in (select parent from `tabPurchase Receipt Item` where purchase_order=%s))
		and pi.docstatus=1""", (name, name), as_dict=True)
	return {"order": {k: po.get(k) for k in ("name", "supplier", "company", "transaction_date", "schedule_date", "grand_total", "net_total", "total_taxes_and_charges",
		"status", "per_received", "per_billed", "docstatus", "owner")}, "lines": lines, "receipts": receipts, "invoices": invoices,
		"can_approve": has_any_role(R.ACCOUNTANT, R.ADMIN) and po.docstatus == 0}


@frappe.whitelist(methods=["POST"])
def save_order(data, submit=0):
	require_roles(*BUY)
	d = frappe.parse_json(data)
	_co(d.get("company"))
	if not d.get("supplier") or not d.get("lines"):
		frappe.throw(_("Choose the supplier and add at least one item."))
	lines = [{"item_code": ln["item_code"], "qty": flt(ln["qty"]), "rate": flt(ln["rate"]), "warehouse": ln.get("warehouse") or d.get("warehouse")} for ln in d["lines"] if flt(ln.get("qty")) > 0]
	# accountant / admin approval (submit) for orders above the store keeper's limit is the existing approve flow
	po = B.make_po(d["supplier"], d["company"], lines, schedule_date=d.get("schedule_date"), submit=cint(submit) and has_any_role(R.ACCOUNTANT, R.ADMIN))
	return {"name": po.name, "docstatus": po.docstatus}


@frappe.whitelist(methods=["POST"])
def approve_order(name):
	require_roles(R.ACCOUNTANT)
	po = frappe.get_doc("Purchase Order", name)
	if po.docstatus:
		frappe.throw(_("Already approved."))
	po.flags.ignore_permissions = True
	po.submit()
	return po.name


@frappe.whitelist(methods=["POST"])
def receive_order(name, lines=None, bill_no=None, location=None):
	"""lines: {po_item: {qty, batch_no, expiry, location}} — qty in stock units."""
	require_roles(R.STORE_KEEPER)
	pr = B.receive_po(name, frappe.parse_json(lines) if isinstance(lines, str) else lines, bill_no=bill_no, asset_location=location)
	activated = []
	for a in frappe.get_all("Asset", filters={"purchase_receipt": pr.name, "docstatus": 0}, pluck="name"):
		activated.append(A.activate(a).name)
	return {"purchase_receipt": pr.name, "assets": activated}


@frappe.whitelist(methods=["POST"])
def bill_order(source_doctype, source_name, bill_no=None, bill_date=None):
	require_roles(R.ACCOUNTANT, R.STORE_KEEPER)
	if source_doctype not in ("Purchase Receipt", "Purchase Order"):
		frappe.throw(_("Bill from a receipt or an order."))
	return B.bill(source_doctype, source_name, bill_no=bill_no, bill_date=bill_date).name


@frappe.whitelist(methods=["POST"])
def close_order(name, reason=None):
	require_roles(R.ACCOUNTANT)
	from erpnext.buying.doctype.purchase_order.purchase_order import update_status

	update_status("Closed", name)
	return name


# ------------------------------------------------------------------ receipts and invoices
@frappe.whitelist()
def receipts(company=None, q=None):
	require_roles(*SEE)
	f = {"docstatus": 1}
	if company:
		f["company"] = _co(company)
	of = {"name": ["like", f"%{q}%"], "supplier": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("Purchase Receipt", filters=f, or_filters=of, fields=["name", "supplier", "company", "posting_date", "grand_total", "status", "per_billed",
		"supplier_delivery_note", "set_warehouse"], order_by="posting_date desc, creation desc", limit=200)
	for r in rows:
		r["lines"] = frappe.get_all("Purchase Receipt Item", filters={"parent": r.name}, fields=["item_name", "qty", "uom", "batch_no", "asset_location", "amount"], limit=20)
	return rows


@frappe.whitelist()
def invoices(company=None, status=None, q=None):
	require_roles(*SEE)
	f = {"docstatus": 1}
	if company:
		f["company"] = _co(company)
	if status == "unpaid":
		f["outstanding_amount"] = [">", 0]
	elif status == "overdue":
		f.update(outstanding_amount=[">", 0], due_date=["<", today()])
	elif status == "paid":
		f["outstanding_amount"] = 0
	of = {"name": ["like", f"%{q}%"], "supplier": ["like", f"%{q}%"], "bill_no": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("Purchase Invoice", filters=f, or_filters=of, fields=["name", "supplier", "company", "posting_date", "due_date", "bill_no", "grand_total", "outstanding_amount",
		"status"], order_by="posting_date desc, creation desc", limit=200)
	base = {"company": company} if company else {}
	totals = {"unpaid": frappe.db.sql("select coalesce(sum(outstanding_amount),0) from `tabPurchase Invoice` where docstatus=1 and outstanding_amount>0 {0}".format(
		"and company=%(c)s" if company else ""), {"c": company})[0][0],
		"overdue": frappe.db.sql("select coalesce(sum(outstanding_amount),0) from `tabPurchase Invoice` where docstatus=1 and outstanding_amount>0 and due_date<%(d)s {0}".format(
		"and company=%(c)s" if company else ""), {"c": company, "d": today()})[0][0],
		"drafts": frappe.db.count("Purchase Invoice", {**base, "docstatus": 0})}
	return {"rows": rows, "totals": totals}


@frappe.whitelist(methods=["POST"])
def pay_invoice(name, amount=None, mode_of_payment="Bank Transfer", reference_no=None):
	require_roles(R.ACCOUNTANT)
	return B.pay(name, amount, mode_of_payment, reference_no).name


# ------------------------------------------------------------------ material requests
@frappe.whitelist()
def material_requests(company=None, status=None):
	require_roles(*SEE, R.NURSE, R.LAB_USER, R.REVIEWER)
	f = {"docstatus": ["<", 2], "material_request_type": "Purchase"}
	if company:
		f["company"] = _co(company)
	if status == "pending":
		f.update(docstatus=1, status=["in", ["Pending", "Partially Ordered"]])
	rows = frappe.get_all("Material Request", filters=f, fields=["name", "company", "transaction_date", "schedule_date", "status", "per_ordered", "set_warehouse", "owner", "docstatus"],
		order_by="creation desc", limit=150)
	for r in rows:
		r["lines"] = frappe.get_all("Material Request Item", filters={"parent": r.name}, fields=["item_code", "item_name", "qty", "uom", "ordered_qty"])
	return rows


@frappe.whitelist(methods=["POST"])
def create_material_request(company, warehouse, lines, remarks=None):
	require_roles(*BUY, R.NURSE, R.LAB_USER, R.REVIEWER)
	_co(company)
	return B.make_material_request(company, warehouse, frappe.parse_json(lines), remarks=remarks).name


@frappe.whitelist(methods=["POST"])
def order_from_request(name, supplier):
	require_roles(*BUY)
	po = B.po_from_material_request(name, supplier)
	return po.name


# ------------------------------------------------------------------ assets
@frappe.whitelist()
def assets(category=None, location=None, q=None):
	require_roles(R.ACCOUNTANT, R.STORE_KEEPER)
	rows = A.book_values("VVS Hospital")
	if category:
		rows = [r for r in rows if r.asset_category == category]
	if location:
		rows = [r for r in rows if r.location == location]
	if q:
		ql = q.lower()
		rows = [r for r in rows if ql in (r.asset_name or "").lower() or ql in r.name.lower() or ql in (r.supplier or "").lower()]
	allr = A.book_values("VVS Hospital")
	cats = {}
	for r in allr:
		c = cats.setdefault(r.asset_category, {"category": r.asset_category, "n": 0, "gross": 0, "book": 0})
		c["n"] += 1
		c["gross"] += r["gross"]
		c["book"] += r["book_value"]
	locs = {}
	for r in allr:
		locs[r.location] = locs.get(r.location, 0) + 1
	month_dep = frappe.db.sql("""select coalesce(sum(total_debit),0) from `tabJournal Entry` where voucher_type='Depreciation Entry' and docstatus=1 and company='VVS Hospital'
		and posting_date>=%s""", get_first_day(today()))[0][0]
	repairs = frappe.get_all("Asset Repair", filters={"docstatus": ["<", 2]}, fields=["name", "asset", "asset_name", "repair_status", "failure_date", "description"],
		order_by="creation desc", limit=10)
	return {"rows": rows, "categories": sorted(cats.values(), key=lambda c: -c["gross"]), "locations": locs, "gross": sum(c["gross"] for c in cats.values()),
		"book": sum(c["book"] for c in cats.values()), "month_depreciation": month_dep, "repairs": repairs,
		"all_locations": frappe.get_all("Location", filters={"is_group": 0}, pluck="name", order_by="name")}


@frappe.whitelist()
def asset(name):
	require_roles(R.ACCOUNTANT, R.STORE_KEEPER)
	a = frappe.get_doc("Asset", name)
	sched = []
	ads = frappe.get_all("Asset Depreciation Schedule", filters={"asset": name, "docstatus": 1}, pluck="name")
	if ads:
		sched = frappe.get_all("Depreciation Schedule", filters={"parent": ads[0]}, fields=["schedule_date", "depreciation_amount", "accumulated_depreciation_amount", "journal_entry"],
			order_by="schedule_date", limit=400)
	moves = frappe.db.sql("""select am.name, am.transaction_date, am.purpose, ami.source_location, ami.target_location from `tabAsset Movement` am
		join `tabAsset Movement Item` ami on ami.parent=am.name where ami.asset=%s and am.docstatus=1 order by am.transaction_date desc""", name, as_dict=True)
	repairs = frappe.get_all("Asset Repair", filters={"asset": name, "docstatus": ["<", 2]}, fields=["name", "repair_status", "failure_date", "completion_date", "description", "total_repair_cost"],
		order_by="failure_date desc")
	return {"asset": {k: a.get(k) for k in ("name", "asset_name", "item_code", "asset_category", "location", "status", "net_purchase_amount", "value_after_depreciation", "purchase_date",
		"available_for_use_date", "supplier", "purchase_receipt", "purchase_invoice", "custodian", "company")}, "schedule": sched, "movements": moves, "repairs": repairs,
		"posted": sum(flt(s.depreciation_amount) for s in sched if s.journal_entry), "next": next((s for s in sched if not s.journal_entry), None)}


@frappe.whitelist(methods=["POST"])
def move_asset(name, location, reason=None):
	require_roles(R.STORE_KEEPER, R.ACCOUNTANT)
	return A.move(name, location, reason=reason).name


@frappe.whitelist(methods=["POST"])
def repair_asset(name, description, completed=1):
	require_roles(R.STORE_KEEPER, R.ACCOUNTANT)
	if not (description or "").strip():
		frappe.throw(_("Describe the fault or service."))
	return A.log_repair(name, description, completed=cint(completed)).name


# ------------------------------------------------------------------ consumption
@frappe.whitelist()
def consumption(from_date=None, to_date=None):
	require_roles(R.STORE_KEEPER, R.ACCOUNTANT, R.NURSE)
	from_date, to_date = from_date or add_days(today(), -29), to_date or today()
	by_dept = frappe.db.sql("""select cost_center, round(sum(debit),2) amount from `tabGL Entry` where account like 'Medical Consumables Consumed%%' and is_cancelled=0
		and posting_date between %s and %s group by cost_center order by amount desc""", (from_date, to_date), as_dict=True)
	by_item = frappe.db.sql("""select sed.item_code, sed.item_name, sed.cost_center, sum(sed.qty) qty, sed.uom, round(sum(sed.amount),2) amount from `tabStock Entry Detail` sed
		join `tabStock Entry` se on se.name=sed.parent where se.docstatus=1 and se.purpose='Material Issue' and se.posting_date between %s and %s
		and sed.expense_account like 'Medical Consumables Consumed%%'
		group by sed.item_code, sed.cost_center order by amount desc limit 200""", (from_date, to_date), as_dict=True)
	# only consumables charged to a department (ward medicine doses are issued by the MAR, not here)
	issues = frappe.db.sql("""select se.name, se.posting_date, se.total_outgoing_value, se.remarks, se.owner, se.from_warehouse from `tabStock Entry` se
		where se.docstatus=1 and se.purpose='Material Issue' and se.company='VVS Hospital' and se.posting_date between %s and %s
		and exists (select 1 from `tabStock Entry Detail` d where d.parent=se.name and d.expense_account like 'Medical Consumables Consumed%%')
		order by se.posting_date desc, se.creation desc limit 60""", (from_date, to_date), as_dict=True)
	stock = frappe.db.sql("""select b.item_code, i.item_name, i.stock_uom uom, b.actual_qty, b.stock_value, b.warehouse from tabBin b join tabItem i on i.name=b.item_code
		where i.item_group='Consumable' and b.actual_qty>0 order by i.item_name""", as_dict=True)
	return {"by_dept": by_dept, "by_item": by_item, "issues": issues, "stock": stock, "from_date": str(from_date), "to_date": str(to_date),
		"cost_centers": frappe.get_all("Cost Center", filters={"company": "VVS Hospital", "is_group": 0}, pluck="name", order_by="name"),
		"warehouses": _warehouses("VVS Hospital")}


@frappe.whitelist(methods=["POST"])
def issue(warehouse, cost_center, lines, remarks=None):
	require_roles(R.STORE_KEEPER)
	return B.issue_consumables(warehouse, frappe.parse_json(lines), cost_center, remarks=remarks).name
