"""Pharmacy (04-pharmacy.md): pack/strip/unit pricing, FEFO batches, React POS checkout, dispense pipeline, displays, store ops.

Decision D-21: the counter is a React POS (Restaurant OS style) instead of ERPNext's /app/point-of-sale; it still creates a native
POS Sales Invoice (update_stock, batch per line) inside the cashier's shift, so stock, accounts and POS closing are standard.
Stock unit = the item's stock UOM (tablet / unit); Strip and Pack are UOM conversions built from the pack fields.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, date_diff, flt, getdate, now_datetime, nowdate, today

from hospital_vvs import roles as R
from hospital_vvs.services import billing, discounts, safety
from hospital_vvs.utils import branch_company, has_any_role, publish, setting

WALK_IN = "Walk-in Pharmacy"
PACK, STRIP = "Pack", "Strip"


# ------------------------------------------------------------------ item / pack units
def ensure_uoms():
	for u in (PACK, STRIP, "Unit"):
		if not frappe.db.exists("UOM", u):
			frappe.get_doc({"doctype": "UOM", "uom_name": u, "must_be_whole_number": 1}).insert(ignore_permissions=True)


def item_validate(doc, method=None):
	"""Item hook: units per pack and the Strip / Pack UOM conversions follow the pack fields."""
	if not doc.get("hv_is_medicine"):
		return
	ups, spp = cint(doc.hv_units_per_strip) or 1, cint(doc.hv_strips_per_pack) or 1
	doc.hv_units_per_pack = ups * spp
	ensure_uoms()
	keep = [r for r in doc.uoms if r.uom not in (PACK, STRIP) and r.uom != doc.stock_uom]
	rows = [{"uom": doc.stock_uom, "conversion_factor": 1}]
	if spp > 1 or ups > 1:
		if ups > 1:
			rows.append({"uom": STRIP, "conversion_factor": ups})
		rows.append({"uom": PACK, "conversion_factor": ups * spp})
	doc.set("uoms", rows + [r.as_dict() for r in keep])
	if doc.has_batch_no:
		doc.has_expiry_date = 1


def pack(item_code):
	i = frappe.get_cached_value("Item", item_code, ["item_name", "stock_uom", "hv_units_per_strip", "hv_strips_per_pack", "hv_allow_loose_sale",
		"hv_allow_strip_sale", "hv_generic", "hv_strength", "hv_dosage_form", "hv_rack_location", "hv_prescription_required", "hv_controlled_drug",
		"hv_near_expiry_days", "hv_drug_class", "has_batch_no"], as_dict=True)
	if not i:
		frappe.throw(_("Item {0} not found.").format(item_code))
	ups, spp = cint(i.hv_units_per_strip) or 1, cint(i.hv_strips_per_pack) or 1
	i.update(ups=ups, spp=spp, upp=ups * spp)
	return i


def allowed_uoms(p):
	out = [PACK]
	if p.ups > 1 and p.spp > 1 and p.hv_allow_strip_sale:
		out.append(STRIP)
	if p.upp > 1 and p.hv_allow_loose_sale:
		out.append(p.stock_uom)
	if p.upp == 1:
		out = [PACK]
	return out


def factor(p, uom):
	return p.upp if uom == PACK else p.ups if uom == STRIP else 1


def round_price(v):
	mode = setting("loose_rounding") or "Nearest 1"
	return round(v / 5) * 5 if mode == "Nearest 5" else round(v) if mode == "Nearest 1" else round(v, 2)


def pack_price(item_code, batch=None):
	"""MRP per pack: the batch's MRP, else the Standard Selling price (per pack)."""
	if batch:
		mrp = flt(frappe.db.get_value("Batch", batch, "hv_mrp_per_pack"))
		if mrp:
			return mrp
	return flt(frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": "Standard Selling", "selling": 1}, "price_list_rate"))


def uom_price(p, item_code, uom, batch=None):
	mrp = pack_price(item_code, batch)
	if uom == PACK:
		return mrp
	return round_price(mrp / (p.spp if uom == STRIP else p.upp))


# ------------------------------------------------------------------ batches (FEFO)
def reserved(item_code, warehouse):
	"""Units held by draft medicine invoices (pay-at-handover) per batch — they are not free to sell (D-23)."""
	rows = frappe.db.sql("""select sii.batch_no, sum(sii.stock_qty) q from `tabSales Invoice Item` sii join `tabSales Invoice` si on si.name=sii.parent
		where si.docstatus=0 and si.hv_billing_type='Medicine' and ifnull(si.hv_dispense_ticket,'')!='' and sii.item_code=%s and sii.warehouse=%s
		group by sii.batch_no""", (item_code, warehouse), as_dict=True)
	return {r.batch_no: flt(r.q) for r in rows if r.batch_no}


def batches(item_code, warehouse, include_expired=False, exclude_invoice=None):
	from erpnext.stock.doctype.batch.batch import get_batch_qty

	p = pack(item_code)
	window = cint(p.hv_near_expiry_days) or cint(setting("near_expiry_days")) or 90
	res = reserved(item_code, warehouse)
	if exclude_invoice:
		for r in frappe.get_all("Sales Invoice Item", filters={"parent": exclude_invoice, "item_code": item_code}, fields=["batch_no", "stock_qty"]):
			res[r.batch_no] = res.get(r.batch_no, 0) - flt(r.stock_qty)
	out = []
	for b in get_batch_qty(warehouse=warehouse, item_code=item_code, for_stock_levels=include_expired) or []:
		qty = flt(b.get("qty")) - flt(res.get(b.get("batch_no")))
		if qty <= 0:
			continue
		info = frappe.db.get_value("Batch", b["batch_no"], ["expiry_date", "hv_mrp_per_pack", "disabled"], as_dict=True) or {}
		if info.get("disabled"):
			continue
		days = date_diff(info.expiry_date, nowdate()) if info.get("expiry_date") else 9999
		expired = days < 0
		if expired and not include_expired:
			continue
		out.append({"batch_no": b["batch_no"], "qty": qty, "expiry": str(info.get("expiry_date") or ""), "days_left": days, "expired": expired,
			"near_expiry": 0 <= days <= window, "mrp": flt(info.get("hv_mrp_per_pack")) or pack_price(item_code)})
	out.sort(key=lambda x: (x["expiry"] or "9999-12-31", x["batch_no"]))
	return out


def stock_units(item_code, warehouse):
	return sum(b["qty"] for b in batches(item_code, warehouse))


def split_stock(p, units):
	"""Units → packs / strips / loose units for display."""
	units = int(round(units))
	packs, rest = divmod(units, p.upp) if p.upp > 1 else (units, 0)
	strips, loose = divmod(rest, p.ups) if p.ups > 1 else (0, rest)
	return {"units": units, "packs": packs, "strips": strips, "loose": loose}


# ------------------------------------------------------------------ catalogue
def counter_warehouse(counter):
	prof = frappe.db.get_value("Counter", counter, "pos_profile")
	return frappe.db.get_value("POS Profile", prof, "warehouse") if prof else None


def search(q, warehouse, limit=24, category=None, in_stock=False):
	like = f"%{(q or '').strip()}%"
	cat = "and i.hv_medicine_category=%(c)s" if category else ""
	items = frappe.db.sql(f"""select i.name item_code, i.item_name, i.hv_generic generic, i.hv_strength strength, i.hv_dosage_form form,
		i.hv_rack_location rack, i.hv_prescription_required rx, i.hv_controlled_drug controlled, i.image, i.hv_medicine_category category
		from tabItem i left join `tabItem Barcode` bc on bc.parent=i.name
		where i.disabled=0 and i.hv_is_medicine=1 {cat} and (i.item_name like %(l)s or i.hv_generic like %(l)s or i.name like %(l)s or bc.barcode=%(q)s)
		group by i.name order by (i.item_name like %(s)s) desc, i.item_name limit %(n)s""",
		{"l": like, "q": (q or "").strip(), "s": f"{(q or '').strip()}%", "n": cint(limit) or 24, "c": category}, as_dict=True)
	for it in items:
		p = pack(it.item_code)
		bs = batches(it.item_code, warehouse)
		units = sum(b["qty"] for b in bs)
		it.update(stock=split_stock(p, units), upp=p.upp, ups=p.ups, spp=p.spp, uoms=allowed_uoms(p), stock_uom=p.stock_uom,
			prices={u: uom_price(p, it.item_code, u, bs[0]["batch_no"] if bs else None) for u in allowed_uoms(p)},
			next_expiry=bs[0]["expiry"] if bs else None, near_expiry=bool(bs and bs[0]["near_expiry"]),
			batch=bs[0]["batch_no"] if bs else None)
	return [it for it in items if it.stock.get("units")] if in_stock else items


def substitutes(item_code, warehouse):
	"""Same generic + strength + dosage form, in stock here."""
	p = pack(item_code)
	if not p.hv_generic:
		return []
	alts = frappe.get_all("Item", filters={"hv_generic": p.hv_generic, "hv_strength": p.hv_strength, "hv_dosage_form": p.hv_dosage_form,
		"name": ["!=", item_code], "disabled": 0}, pluck="name")
	out = []
	for a in alts:
		units = stock_units(a, warehouse)
		if units > 0:
			ap = pack(a)
			out.append({"item_code": a, "item_name": ap.item_name, "stock": split_stock(ap, units), "price": uom_price(ap, a, PACK), "rx": ap.hv_prescription_required})
	return out


# ------------------------------------------------------------------ quote (server-side pricing)
def quote(lines, warehouse, prescription=None, exclude_invoice=None):
	"""lines: [{item_code, uom, qty, original_item?}]. Allocates FEFO batches (a line may split across batches) and prices them."""
	out, errors, warnings = [], [], []
	block_near = cint(setting("block_near_expiry"))
	used = {}
	for ln in lines:
		item = ln["item_code"]
		p = pack(item)
		uom = ln.get("uom") or PACK
		if uom not in allowed_uoms(p):
			errors.append(_("{0}: selling by {1} is not allowed.").format(p.item_name, uom))
			continue
		f = factor(p, uom)
		need = flt(ln.get("qty")) * f
		if need <= 0:
			continue
		bs = [b for b in batches(item, warehouse, exclude_invoice=exclude_invoice) if not (block_near and b["near_expiry"])]
		for b in bs:
			b["qty"] -= used.get((item, b["batch_no"]), 0)
		remaining = need
		for b in bs:
			if remaining <= 0:
				break
			take = min(b["qty"], remaining)
			if take <= 0:
				continue
			# keep the customer's unit where it divides cleanly; else sell the part in stock units
			if take % f == 0:
				q, u, cf = take / f, uom, f
			else:
				q, u, cf = take, p.stock_uom, 1
			rate = uom_price(p, item, u, b["batch_no"])
			out.append({"item_code": item, "item_name": p.item_name, "generic": p.hv_generic, "strength": p.hv_strength, "uom": u, "qty": q,
				"conversion_factor": cf, "stock_qty": take, "batch_no": b["batch_no"], "expiry": b["expiry"], "near_expiry": b["near_expiry"],
				"days_left": b["days_left"], "rate": rate, "amount": rate * q, "rack": p.hv_rack_location, "rx": p.hv_prescription_required,
				"controlled": p.hv_controlled_drug, "original_item": ln.get("original_item")})
			if b["near_expiry"]:
				warnings.append(_("{0} batch {1} expires {2}.").format(p.item_name, b["batch_no"], b["expiry"]))
			used[(item, b["batch_no"])] = used.get((item, b["batch_no"]), 0) + take
			remaining -= take
		if remaining > 0:
			errors.append(_("{0}: only {1} {2} in stock.").format(p.item_name, int(need - remaining), p.stock_uom))
	rx_missing = [l["item_name"] for l in out if (l["rx"] or l["controlled"]) and not prescription]
	total = sum(l["amount"] for l in out)
	return {"lines": out, "errors": errors, "warnings": sorted(set(warnings)), "rx_missing": sorted(set(rx_missing)), "total": total}


# ------------------------------------------------------------------ checkout
def walk_in_customer():
	if not frappe.db.exists("Customer", WALK_IN):
		frappe.get_doc({"doctype": "Customer", "customer_name": WALK_IN, "customer_group": "Patients", "territory": "Pakistan",
			"customer_type": "Individual"}).insert(ignore_permissions=True)
	return WALK_IN


def next_token(branch, date=None):
	rows = frappe.db.sql("select max(token_no) from `tabDispense Ticket` where branch=%s and ticket_date=%s for update", (branch, date or today()))
	n = cint(rows[0][0] if rows else 0) + 1
	return n, f"{setting('token_prefix') or 'P'}-{n:03d}"


def apply_tenders(si, payments=None, payment_mode="Cash", cash_tendered=None, reference_no=None):
	"""Split tender on a POS invoice: card / wallet / bank need a transaction ID, change only from cash. Returns (paid, change)."""
	si.calculate_taxes_and_totals()
	total = flt(si.rounded_total or si.grand_total)
	rows = [p for p in (payments or []) if flt(p.get("amount")) > 0] or [{"mode_of_payment": payment_mode, "amount": flt(cash_tendered) or total, "reference_no": reference_no}]
	paid = sum(flt(p["amount"]) for p in rows)
	if paid + 0.5 < total:
		frappe.throw(_("Paid {0} is less than the bill {1}.").format(frappe.format_value(paid, "Currency"), frappe.format_value(total, "Currency")))
	change = round(paid - total, 2)
	if change > sum(flt(p["amount"]) for p in rows if p["mode_of_payment"] == "Cash") + 0.01:
		frappe.throw(_("Only cash can be given back as change."))
	allowed = {m.mode_of_payment for m in frappe.get_cached_doc("POS Profile", si.pos_profile).payments}
	refs, out, left = [], [], change
	for p in rows:
		if p["mode_of_payment"] not in allowed:
			frappe.throw(_("{0} is not set up on this counter.").format(p["mode_of_payment"]))
		if p["mode_of_payment"] != "Cash" and not (p.get("reference_no") or "").strip():
			frappe.throw(_("Enter the transaction ID for {0}.").format(p["mode_of_payment"]))
		if p.get("reference_no"):
			refs.append(f"{p['mode_of_payment']} {p['reference_no']}")
		amt = flt(p["amount"])
		if p["mode_of_payment"] == "Cash" and left:
			take = min(amt, left)
			amt -= take
			left -= take
		if amt > 0.004:
			out.append({"mode_of_payment": p["mode_of_payment"], "amount": amt})
	si.set("payments", out)
	if refs:
		si.remarks = ((si.remarks or "") + " · " + ", ".join(refs)).strip(" ·")
	si.calculate_taxes_and_totals()
	return paid, change


def pay_mode_for(pay_at=None, credit=False):
	"""True = pay at handover. Setting: billing counter / handover counter / cashier chooses per sale."""
	if credit or not cint(setting("enable_pharmacy_pipeline")):
		return False
	mode = setting("collect_payment_at") or "Billing counter"
	if mode == "Handover counter":
		return True
	if mode.startswith("Cashier chooses"):
		return pay_at == "handover"
	return False


def checkout(counter, lines, patient=None, prescription=None, payment_mode="Cash", cash_tendered=None, discount_amount=0,
	discount_authorization=None, rx_override_reason=None, priority="Normal", client_ref=None, customer=None, pay_at=None, payments=None):
	"""payment_mode "On account" = credit sale to a pharmacy credit customer (no money now). pay_at: "now" / "handover" (setting permitting)."""
	if not counter:
		frappe.throw(_("You are not on the staff of any pharmacy counter. Ask the admin to add you."), frappe.PermissionError)
	from hospital_vvs.services.shifts import check_counter

	check_counter(counter)
	c = frappe.get_doc("Counter", counter)
	if client_ref:
		done = frappe.db.get_value("Sales Invoice", {"remarks": ["like", f"%[{client_ref}]%"], "docstatus": ["<", 2]}, "name")
		if done:
			return receipt(done)
	warehouse = counter_warehouse(counter)
	credit = payment_mode == "On account"
	if credit:
		if not customer or not cint(frappe.db.get_value("Customer", customer, "hv_pharmacy_credit")):
			frappe.throw(_("Only a pharmacy credit customer can buy on account."))
	pay_later = pay_mode_for(pay_at, credit)
	q = quote(lines, warehouse, prescription)
	if q["errors"]:
		frappe.throw("<br>".join(q["errors"]), title=_("Cannot bill"))
	if q["rx_missing"]:
		if not (rx_override_reason and cint(setting("allow_rx_override")) and has_any_role(R.ADMIN)):
			frappe.throw(_("Prescription required for: {0}").format(", ".join(q["rx_missing"])), title=_("Prescription required"))
	shift = None
	from hospital_vvs.services.shifts import billing_shift

	if not pay_later and not credit:
		shift = billing_shift(c.branch)
	customer = customer or (frappe.db.get_value("Patient", patient, "customer") if patient else walk_in_customer())
	base_profile = frappe.get_cached_doc("POS Profile", billing.pos_profile_for("Medicine", c.branch))
	profile_name = shift.pos_profile if shift else c.pos_profile
	si = frappe.new_doc("Sales Invoice")
	si.update({"customer": customer, "company": base_profile.company or branch_company(c.branch), "posting_date": today(), "branch": c.branch,
		"is_pos": 0 if credit else 1, "pos_profile": profile_name, "update_stock": 1, "set_warehouse": warehouse, "selling_price_list": base_profile.selling_price_list,
		"hv_patient": patient, "hv_billing_type": "Medicine", "hv_prescription": prescription, "hv_counter": c.name, "apply_discount_on": "Net Total",
		"ignore_pricing_rule": 1, "cost_center": base_profile.cost_center,
		"remarks": f"Pharmacy {c.counter_name}" + (f" [{client_ref}]" if client_ref else "") + (f" · Rx override: {rx_override_reason}" if rx_override_reason and q["rx_missing"] else "")})
	if shift:
		si.is_created_using_pos = 1
	for l in q["lines"]:
		si.append("items", {"item_code": l["item_code"], "qty": l["qty"], "uom": l["uom"], "conversion_factor": l["conversion_factor"],
			"rate": l["rate"], "price_list_rate": l["rate"], "batch_no": l["batch_no"], "use_serial_batch_fields": 1, "warehouse": warehouse,
			"income_account": base_profile.income_account, "cost_center": base_profile.cost_center, "hv_original_item": l.get("original_item")})
	si.set_missing_values()
	for item, l in zip(si.items, q["lines"]):
		item.rate = item.price_list_rate = l["rate"]
		item.uom, item.conversion_factor, item.batch_no = l["uom"], l["conversion_factor"], l["batch_no"]
		item.income_account = base_profile.income_account
		item.discount_percentage = 0
	if flt(discount_amount):
		discounts.assert_usable(discount_authorization, discount_amount)
		si.discount_amount = flt(discount_amount)
	si.calculate_taxes_and_totals()
	total = flt(si.rounded_total or si.grand_total)
	change = 0
	if credit:
		si.remarks = (si.remarks or "") + " · On account"
		si.set("payments", [])
	elif not pay_later:
		paid, change = apply_tenders(si, payments, payment_mode, cash_tendered)
	si.flags.ignore_permissions = True
	si.flags.hv_rx_override = bool(rx_override_reason)
	si.insert()
	ticket = make_ticket(si, c, patient, prescription, priority, amount_due=total if pay_later else 0)
	if not pay_later:
		si.reload()
		si.flags.ignore_permissions = True
		si.flags.hv_rx_override = bool(rx_override_reason)
		si.submit()
	if discount_authorization:
		discounts.mark_used(discount_authorization, "Sales Invoice", si.name)
	# a draft made from the prescription is replaced by this bill
	for d in frappe.get_all("Sales Invoice", filters={"hv_prescription": prescription, "docstatus": 0, "name": ["!=", si.name],
		"hv_dispense_ticket": ["is", "not set"]}, pluck="name") if prescription else []:
		frappe.delete_doc("Sales Invoice", d, ignore_permissions=True, force=True)
	push_display(c.name, {"state": "done", "token": ticket.token if ticket else None, "total": total, "change": change})
	return receipt(si.name, cash_tendered=(total + change) if change else cash_tendered)


def make_ticket(si, counter, patient, prescription, priority="Normal", amount_due=0):
	if not cint(setting("enable_pharmacy_pipeline")):
		n, token = next_token(counter.branch)
		frappe.db.set_value("Sales Invoice", si.name, "hv_token", token)
		return frappe._dict(token=token)
	n, token = next_token(counter.branch)
	t = frappe.get_doc({"doctype": "Dispense Ticket", "token": token, "token_no": n, "ticket_date": today(), "branch": counter.branch,
		"sales_invoice": si.name, "invoice_status": "Draft" if amount_due else "Paid", "patient": patient,
		"patient_name": frappe.db.get_value("Patient", patient, "patient_name") if patient else WALK_IN, "customer": si.customer,
		"status": "Queued", "priority": priority, "billing_counter": counter.name, "prescription": prescription, "amount_due": amount_due,
		"queued_at": now_datetime(), "items": [{"item_code": i.item_code, "item_name": i.item_name, "uom": i.uom, "qty": i.qty, "stock_qty": i.stock_qty,
			"batch_no": i.batch_no, "expiry": frappe.db.get_value("Batch", i.batch_no, "expiry_date") if i.batch_no else None,
			"rack": frappe.get_cached_value("Item", i.item_code, "hv_rack_location"), "invoice_item": i.name, "line_status": "Pending"} for i in si.items],
		"log": json.dumps([{"at": str(now_datetime()), "by": frappe.session.user, "status": "Queued"}])}).insert(ignore_permissions=True)
	frappe.db.set_value("Sales Invoice", si.name, {"hv_token": token, "hv_dispense_ticket": t.name})
	publish("pharmacy", {"action": "queued", "ticket": t.name, "token": token}, counter.branch)
	return t


def receipt(si_name, cash_tendered=None):
	si = frappe.get_doc("Sales Invoice", si_name)
	s = frappe.get_cached_doc("Clinic Settings")
	branch = frappe.db.get_value("Branch", si.branch, ["hv_address", "hv_phone"], as_dict=True) or {}
	paid = sum(flt(p.amount) for p in si.payments)
	return {"name": si.name, "docstatus": si.docstatus, "token": si.hv_token, "ticket": si.hv_dispense_ticket, "posting_date": str(si.posting_date),
		"posting_time": str(si.posting_time)[:5], "customer": si.customer_name, "patient": si.hv_patient, "prescription": si.hv_prescription,
		"counter": si.hv_counter, "cashier": frappe.db.get_value("User", si.owner, "full_name"),
		"is_return": si.is_return, "return_against": si.return_against, "company": si.company,
		"items": [{"item_code": i.item_code, "item_name": i.item_name, "generic": frappe.get_cached_value("Item", i.item_code, "hv_generic"), "qty": i.qty, "uom": i.uom,
			"rate": i.rate, "amount": i.amount, "batch_no": i.batch_no, "expiry": str(frappe.db.get_value("Batch", i.batch_no, "expiry_date") or "") if i.batch_no else "",
			"substitute_for": frappe.get_cached_value("Item", i.hv_original_item, "item_name") if i.hv_original_item else None} for i in si.items],
		"total": si.total, "discount": si.discount_amount, "grand_total": flt(si.rounded_total or si.grand_total), "paid": paid,
		"tendered": flt(cash_tendered) or paid, "change": max(flt(cash_tendered) - flt(si.rounded_total or si.grand_total), 0) if cash_tendered else 0,
		"mode": "Pay at handover" if si.docstatus == 0 else (" + ".join(p.mode_of_payment for p in si.payments) or ("On account" if not si.is_pos else "")),
		# the contract pharmacy prints its own name (D-38); the hospital's address stays as the location
		"clinic": {"name": si.company if si.company == s.get("pharmacy_company") else s.clinic_name,
			"name_ur": None if si.company == s.get("pharmacy_company") else s.clinic_name_ur, "address": branch.get("hv_address") or s.address,
			"phone": branch.get("hv_phone") or s.phone}}


# ------------------------------------------------------------------ invoice hooks
def validate_invoice(doc, method=None):
	"""Medicine sales: never an expired batch; near-expiry only if allowed; prescription-required / controlled items need a prescription."""
	if doc.get("hv_billing_type") != "Medicine" or doc.is_return:
		return
	block_near = cint(setting("block_near_expiry"))
	window = cint(setting("near_expiry_days")) or 90
	for i in doc.items:
		if not i.batch_no:
			continue
		exp = frappe.db.get_value("Batch", i.batch_no, "expiry_date")
		if exp and getdate(exp) < getdate(doc.posting_date or today()):
			frappe.throw(_("Row {0}: batch {1} of {2} expired on {3}.").format(i.idx, i.batch_no, i.item_name, exp), title=_("Expired batch"))
		if exp and block_near and date_diff(exp, doc.posting_date or today()) <= window:
			frappe.throw(_("Row {0}: batch {1} is inside the near-expiry window.").format(i.idx, i.batch_no))
	if not doc.get("hv_prescription") and not doc.flags.hv_rx_override:
		need = [i.item_name for i in doc.items if frappe.get_cached_value("Item", i.item_code, "hv_prescription_required")
			or frappe.get_cached_value("Item", i.item_code, "hv_controlled_drug")]
		if need:
			frappe.throw(_("Prescription required for: {0}").format(", ".join(sorted(set(need)))), title=_("Prescription required"))


def on_invoice_submit(doc, method=None):
	if doc.get("hv_billing_type") != "Medicine":
		return
	from erpnext.stock.doctype.batch.batch import get_batch_qty

	rx = frappe.db.get_value("Prescription", doc.hv_prescription, ["doctor"], as_dict=True) if doc.hv_prescription else None
	for i in doc.items:
		if not frappe.get_cached_value("Item", i.item_code, "hv_controlled_drug"):
			continue
		balance = sum(flt(b.get("qty")) for b in (get_batch_qty(warehouse=i.warehouse, item_code=i.item_code) or []))
		frappe.get_doc({"doctype": "Controlled Drug Register", "posting_date": doc.posting_date, "patient": doc.hv_patient, "prescription": doc.hv_prescription,
			"prescriber": rx.doctor if rx else None, "item_code": i.item_code, "batch_no": i.batch_no, "qty": (-1 if doc.is_return else 1) * abs(flt(i.stock_qty)),
			"balance": balance, "sales_invoice": doc.name, "branch": doc.branch, "dispensed_by": frappe.session.user}).insert(ignore_permissions=True)


# ------------------------------------------------------------------ prescription → draft medicine invoice
def on_prescription_signed(rx):
	if not cint(setting("auto_medicine_invoice")) or not rx.medicines or not cint(setting("enable_medicine")):
		return
	if rx.amended_from:
		old = frappe.get_all("Sales Invoice", filters={"hv_prescription": rx.amended_from, "docstatus": ["<", 2]}, fields=["name", "docstatus"])
		for o in old:
			if o.docstatus == 0:
				frappe.delete_doc("Sales Invoice", o.name, ignore_permissions=True, force=True)
			else:
				frappe.db.set_value("Prescription", rx.name, "pharmacy_review_flag", 1)
				publish("pharmacy", {"action": "rx_amended_after_sale", "prescription": rx.name, "invoice": o.name}, rx.branch)
				return
	if frappe.db.exists("Sales Invoice", {"hv_prescription": rx.name, "docstatus": ["<", 2]}):
		return
	prof = billing.pos_profile_for("Medicine", rx.branch)
	p = frappe.get_cached_doc("POS Profile", prof)
	customer = frappe.db.get_value("Patient", rx.patient, "customer")
	si = frappe.get_doc({"doctype": "Sales Invoice", "customer": customer, "company": p.company, "posting_date": today(), "branch": rx.branch,
		"is_pos": 1, "pos_profile": prof, "update_stock": 0, "set_warehouse": p.warehouse, "hv_patient": rx.patient, "hv_billing_type": "Medicine",
		"hv_prescription": rx.name, "remarks": f"Draft from prescription {rx.name}",
		"items": [{"item_code": m.item, "qty": max(cint(m.qty) or 1, 1), "uom": frappe.get_cached_value("Item", m.item, "stock_uom"),
			"conversion_factor": 1, "warehouse": p.warehouse} for m in rx.medicines]})
	si.flags.ignore_permissions = True
	si.flags.ignore_mandatory = True
	si.set_missing_values()
	si.insert()
	publish("pharmacy", {"action": "prescription", "prescription": rx.name, "patient": rx.patient}, rx.branch)


def prescription_lines(rx_name):
	rx = frappe.get_doc("Prescription", rx_name)
	if rx.docstatus != 1:
		frappe.throw(_("Only a signed prescription can be dispensed."))
	out = []
	for m in rx.medicines:
		p = pack(m.item)
		units = cint(m.qty) or 1
		uom = PACK if units >= p.upp and units % p.upp == 0 else (STRIP if STRIP in allowed_uoms(p) and units % p.ups == 0 else
			(p.stock_uom if p.stock_uom in allowed_uoms(p) else PACK))
		qty = units / factor(p, uom) if uom != PACK or units >= p.upp else 1
		out.append({"item_code": m.item, "item_name": p.item_name, "uom": uom, "qty": max(qty, 1), "no_substitution": m.no_substitution,
			"dose": m.dose, "frequency": m.frequency, "duration": m.duration, "instructions": m.instructions,
			"alert": m.alert_message, "override": m.override_reason})
	return {"prescription": rx.name, "patient": rx.patient, "patient_name": rx.patient_name, "doctor": rx.doctor_name, "lines": out}


# ------------------------------------------------------------------ pipeline
def _log(t, status, note=None):
	log = json.loads(t.log or "[]")
	log.append({"at": str(now_datetime()), "by": frappe.session.user, "status": status, "note": note})
	t.log = json.dumps(log)


def _lock(name):
	frappe.db.sql("select name from `tabDispense Ticket` where name=%s for update", name)
	return frappe.get_doc("Dispense Ticket", name)


def _move(t, status, **values):
	t.update(values)
	t.status = status
	_log(t, status, values.get("exception_reason"))
	t.flags.ignore_permissions = True
	t.save()
	publish("pharmacy", {"action": status, "ticket": t.name, "token": t.token}, t.branch)
	return t


def start_pick(name):
	t = _lock(name)
	if t.status != "Queued":
		frappe.throw(_("{0} is already {1}{2}.").format(t.token, t.status, f" by {t.finder}" if t.finder else ""), title=_("Taken"))
	return _move(t, "Picking", finder=frappe.session.user, pick_started_at=now_datetime())


def scan(name, code, qty=None, line=None):
	"""Finder scans an item barcode / code or a batch number. Wrong item or batch is rejected."""
	t = _lock(name)
	if t.status != "Picking" or t.finder != frappe.session.user:
		frappe.throw(_("Start picking this ticket first."))
	code = (code or "").strip()
	item = frappe.db.get_value("Item Barcode", {"barcode": code}, "parent") or (code if frappe.db.exists("Item", code) else None)
	batch_item = frappe.db.get_value("Batch", code, "item") if not item else None
	target = None
	for r in t.items:
		if line and r.name != line:
			continue
		if r.line_status in ("Found",):
			continue
		if (item and r.item_code == item) or (batch_item and r.item_code == batch_item and r.batch_no == code):
			target = r
			break
	if not target:
		if batch_item and any(r.item_code == batch_item for r in t.items):
			frappe.throw(_("Wrong batch: {0}. Pick batch {1}.").format(code, next(r.batch_no for r in t.items if r.item_code == batch_item)), title=_("Wrong batch"))
		frappe.throw(_("{0} is not on this ticket.").format(code), title=_("Wrong item"))
	target.found_qty = flt(qty) if qty else target.qty
	target.line_status = "Found" if target.found_qty >= target.qty else "Short"
	target.found_by, target.found_at = frappe.session.user, now_datetime()
	t.flags.ignore_permissions = True
	t.save()
	return t


def not_found(name, line, reason, short_qty=None):
	t = _lock(name)
	r = next((x for x in t.items if x.name == line), None)
	if not r:
		frappe.throw(_("Line not found."))
	r.line_status = "Short" if short_qty else "Not Found"
	r.found_qty = flt(short_qty)
	r.note = reason
	return _move(t, "Exception", exception_reason=f"{r.item_name}: {reason}")


def complete_pick(name):
	t = _lock(name)
	if t.status != "Picking":
		frappe.throw(_("Ticket is {0}.").format(t.status))
	if any(r.line_status != "Found" for r in t.items):
		frappe.throw(_("Every line must be found (or reported as not found)."))
	nxt = "Ready" if cint(setting("skip_review_otc")) and not any(frappe.get_cached_value("Item", r.item_code, "hv_prescription_required")
		or frappe.get_cached_value("Item", r.item_code, "hv_controlled_drug") for r in t.items) else "Picked"
	return _move(t, nxt, picked_at=now_datetime(), **({"ready_at": now_datetime()} if nxt == "Ready" else {}))


def review_data(name):
	t = frappe.get_doc("Dispense Ticket", name)
	rx = frappe.get_doc("Prescription", t.prescription) if t.prescription else None
	overrides = [{"item": m.item_name, "alert": m.alert_message, "reason": m.override_reason, "by": m.override_by} for m in (rx.medicines if rx else []) if m.override_reason]
	alerts = []
	if t.patient and not rx:
		res = safety.check(t.patient, [{"item": r.item_code} for r in t.items])
		alerts = [{"item": r.item_name, "alerts": a["alerts"], "blocking": a["blocking"]} for r, a in zip(t.items, res) if a["alerts"]]
	return {"ticket": t.as_dict(), "prescription": rx.as_dict() if rx else None, "overrides": overrides, "otc_alerts": alerts}


def start_review(name):
	t = _lock(name)
	if t.status != "Picked":
		frappe.throw(_("Ticket is {0}.").format(t.status))
	return _move(t, "Reviewing", reviewer=frappe.session.user, review_started_at=now_datetime())


def approve(name, counts=None):
	"""counts: {line: counted_qty}. The batch billed must be the batch handed over (checked line by line)."""
	t = _lock(name)
	if t.status not in ("Reviewing", "Picked"):
		frappe.throw(_("Ticket is {0}.").format(t.status))
	counts = counts or {}
	for r in t.items:
		r.counted_qty = flt(counts.get(r.name, r.qty))
		if abs(r.counted_qty - flt(r.qty)) > 0.001:
			frappe.throw(_("{0}: counted {1}, billed {2}. Send back or correct the bill.").format(r.item_name, r.counted_qty, r.qty))
		r.reviewed = 1
	return _move(t, "Ready", reviewer=t.reviewer or frappe.session.user, ready_at=now_datetime())


def send_back(name, reason):
	t = _lock(name)
	for r in t.items:
		r.line_status, r.found_qty = "Pending", 0
	return _move(t, "Picking", exception_reason=reason)


def swap_line(name, line, new_item):
	"""Reviewer substitution (same generic/strength/form). Draft invoices are re-priced; paid bills go back to the counter."""
	if not has_any_role(R.REVIEWER):
		frappe.throw(_("Only the pharmacist approves substitutions."), frappe.PermissionError)
	t = _lock(name)
	r = next((x for x in t.items if x.name == line), None)
	if not r:
		frappe.throw(_("Line not found."))
	if t.prescription and frappe.db.get_value("Prescription Medicine", {"parent": t.prescription, "item": r.item_code}, "no_substitution"):
		frappe.throw(_("The doctor marked {0} as 'no substitution'.").format(r.item_name))
	old, new = pack(r.item_code), pack(new_item)
	if (old.hv_generic, old.hv_strength, old.hv_dosage_form) != (new.hv_generic, new.hv_strength, new.hv_dosage_form):
		frappe.throw(_("A substitute must have the same generic, strength and form."))
	si = frappe.get_doc("Sales Invoice", t.sales_invoice)
	if si.docstatus == 1:
		return _move(t, "Exception", exception_reason=f"Substitute {new.item_name} for {old.item_name} approved by {frappe.session.user}: refund the line and bill the substitute at the counter")
	warehouse = si.items[0].warehouse
	q = quote([{"item_code": new_item, "uom": r.uom, "qty": r.qty, "original_item": r.item_code}], warehouse, si.hv_prescription, exclude_invoice=si.name)
	if q["errors"]:
		frappe.throw("<br>".join(q["errors"]))
	si.items = [i for i in si.items if i.name != r.invoice_item]
	for l in q["lines"]:
		si.append("items", {"item_code": l["item_code"], "qty": l["qty"], "uom": l["uom"], "conversion_factor": l["conversion_factor"], "rate": l["rate"],
			"price_list_rate": l["rate"], "batch_no": l["batch_no"], "use_serial_batch_fields": 1, "warehouse": warehouse,
			"hv_original_item": r.item_code, "hv_substitute_approved_by": frappe.session.user})
	si.set_missing_values()
	si.calculate_taxes_and_totals()
	si.flags.ignore_permissions = True
	si.save()
	t.items = [x for x in t.items if x.name != line]
	for i in si.items:
		if i.hv_original_item == r.item_code and i.item_code == new_item:
			t.append("items", {"item_code": i.item_code, "item_name": i.item_name, "uom": i.uom, "qty": i.qty, "stock_qty": i.stock_qty, "batch_no": i.batch_no,
				"rack": new.hv_rack_location, "invoice_item": i.name, "line_status": "Found", "found_qty": i.qty, "note": f"Substitute for {old.item_name}"})
	t.amount_due = flt(si.rounded_total or si.grand_total)
	return _move(t, "Reviewing" if t.status == "Exception" else t.status)


def drop_line(name, line, reason):
	"""Partial supply: the pharmacist removes a line that cannot be supplied from an unpaid (pay-at-handover) bill."""
	if not has_any_role(R.REVIEWER):
		frappe.throw(_("Only the pharmacist removes a line."), frappe.PermissionError)
	if not (reason or "").strip():
		frappe.throw(_("Enter the reason."))
	t = _lock(name)
	r = next((x for x in t.items if x.name == line), None)
	if not r:
		frappe.throw(_("Line not found."))
	si = frappe.get_doc("Sales Invoice", t.sales_invoice)
	if si.docstatus == 1:
		return _move(t, "Exception", exception_reason=f"{r.item_name} not supplied ({reason}): refund that line at the counter")
	si.items = [i for i in si.items if i.name != r.invoice_item]
	t.items = [x for x in t.items if x.name != line]
	if not t.items:
		frappe.delete_doc("Sales Invoice", si.name, ignore_permissions=True, force=True)
		t.sales_invoice, t.amount_due = None, 0
		return _move(t, "Cancelled", exception_reason=f"Nothing could be supplied: {reason}")
	si.set_missing_values()
	si.calculate_taxes_and_totals()
	si.flags.ignore_permissions = True
	si.save()
	t.amount_due = flt(si.rounded_total or si.grand_total)
	t.notes = ((t.notes or "") + f"\nNot supplied: {r.item_name} — {reason}").strip()
	return _move(t, "Reviewing" if t.status == "Exception" else t.status)


def call(name, counter=None):
	t = _lock(name)
	if t.status not in ("Ready", "Called", "Not Collected"):
		frappe.throw(_("Ticket is {0}.").format(t.status))
	recall = t.status == "Called"
	limit = cint(setting("recall_limit")) or 3
	if recall and cint(t.recalls) + 1 >= limit:
		return _move(t, "Not Collected", recalls=cint(t.recalls) + 1)
	return _move(t, "Called", handover_counter=counter or t.handover_counter, dispenser=frappe.session.user, called_at=now_datetime(),
		recalls=cint(t.recalls) + (1 if recall else 0))


def collect_payment(name, payment_mode="Cash", cash_tendered=None, payments=None, reference_no=None):
	"""Pay at handover: the draft becomes a paid POS invoice in the dispenser's shift (stock deducted now).
	payments: optional split [{mode_of_payment, amount, reference_no}] — change only from cash; card / wallet / bank need a transaction ID."""
	from hospital_vvs.services.shifts import billing_shift

	t = _lock(name)
	si = frappe.get_doc("Sales Invoice", t.sales_invoice)
	if si.docstatus == 1:
		return receipt(si.name)
	shift = billing_shift(t.branch)
	if shift:
		si.pos_profile, si.is_created_using_pos, si.hv_counter = shift.pos_profile, 1, shift.hv_counter
	si.calculate_taxes_and_totals()
	total = flt(si.rounded_total or si.grand_total)
	paid, change = apply_tenders(si, payments, payment_mode, cash_tendered, reference_no)
	out = si.payments
	si.flags.ignore_permissions = True
	si.save()
	si.submit()
	if shift and si.owner != shift.user:
		# ERPNext counts a POS invoice in the shift of the user who owns it: the draft was made at the billing counter, the money was
		# taken here, so the invoice becomes the collector's (otherwise the dispenser's expected cash and POS closing miss it)
		frappe.db.set_value("Sales Invoice", si.name, "owner", shift.user, update_modified=False)
	t.reload()
	t.invoice_status, t.amount_due = "Paid", 0
	_log(t, t.status, f"Paid {total} by {' + '.join(p.mode_of_payment for p in out)}")
	t.save(ignore_permissions=True)
	return receipt(si.name, cash_tendered=paid if change else cash_tendered)


def handover(name, code=None):
	t = _lock(name)
	if t.status not in ("Called", "Ready"):
		frappe.throw(_("Ticket is {0}.").format(t.status))
	if code and code.strip() not in (t.token, t.sales_invoice, t.name):
		frappe.throw(_("Receipt {0} does not match ticket {1}.").format(code, t.token))
	if t.invoice_status != "Paid" or frappe.db.get_value("Sales Invoice", t.sales_invoice, "docstatus") != 1:
		frappe.throw(_("Collect the payment first."), title=_("Payment due"))
	return _move(t, "Handed Over", dispenser=t.dispenser or frappe.session.user, handed_over_at=now_datetime())


# ------------------------------------------------------------------ displays
def push_display(counter, state):
	frappe.cache.set_value(f"hv_disp:{counter}", dict(state, at=str(now_datetime())), expires_in_sec=600)


def device(key):
	name = frappe.db.get_value("Display Device", {"device_key": key, "is_active": 1}, "name") if key and len(key) >= 16 else None
	if not name:
		frappe.throw(_("Unknown display."), frappe.PermissionError)
	frappe.db.set_value("Display Device", name, "last_seen", now_datetime(), update_modified=False)
	return frappe.get_cached_doc("Display Device", name)


def queue_state(branch):
	rows = frappe.get_all("Dispense Ticket", filters={"branch": branch, "ticket_date": today(), "status": ["in", ["Queued", "Picking", "Picked", "Reviewing", "Ready", "Called"]]},
		fields=["token", "status", "handover_counter", "called_at", "priority"], order_by="token_no")
	nums = {c.name: c.number for c in frappe.get_all("Counter", fields=["name", "number"])}
	return {"preparing": [{"token": r.token, "status": r.status} for r in rows if r.status not in ("Called",)],
		"ready": sorted([{"token": r.token, "counter": nums.get(r.handover_counter) or r.handover_counter, "called_at": str(r.called_at or "")}
			for r in rows if r.status == "Called"], key=lambda x: x["called_at"], reverse=True)}


# ------------------------------------------------------------------ store operations
def receive_stock(supplier, warehouse, lines, bill_no=None, branch=None):
	"""Purchase Receipt by batch: lines [{item_code, batch_no, expiry, mrp_per_pack, rate_per_pack, packs, free_packs}]. Expired stock is rejected."""
	ensure_uoms()
	company = frappe.db.get_value("Warehouse", warehouse, "company")
	window = cint(setting("near_expiry_days")) or 90
	pr = frappe.new_doc("Purchase Receipt")
	pr.update({"supplier": supplier, "company": company, "posting_date": today(), "set_warehouse": warehouse, "supplier_delivery_note": bill_no})
	warnings = []
	for l in lines:
		p = pack(l["item_code"])
		exp = getdate(l["expiry"])
		if exp < getdate(today()):
			frappe.throw(_("{0} batch {1} is already expired ({2}).").format(p.item_name, l["batch_no"], exp))
		if date_diff(exp, today()) <= window:
			warnings.append(_("{0} batch {1} expires within {2} days.").format(p.item_name, l["batch_no"], window))
		if not frappe.db.exists("Batch", l["batch_no"]):
			frappe.get_doc({"doctype": "Batch", "batch_id": l["batch_no"], "item": l["item_code"], "expiry_date": exp, "supplier": supplier,
				"hv_mrp_per_pack": flt(l.get("mrp_per_pack")), "hv_purchase_rate_per_pack": flt(l.get("rate_per_pack")),
				"hv_units_per_strip": p.ups, "hv_strips_per_pack": p.spp}).insert(ignore_permissions=True)
		packs = flt(l.get("packs")) + flt(l.get("free_packs"))
		paid = flt(l.get("packs"))
		rate_unit = (flt(l.get("rate_per_pack")) * paid / packs / p.upp) if packs else 0
		pr.append("items", {"item_code": l["item_code"], "qty": packs * p.upp, "uom": p.stock_uom, "stock_uom": p.stock_uom, "conversion_factor": 1,
			"rate": rate_unit, "batch_no": l["batch_no"], "use_serial_batch_fields": 1, "warehouse": warehouse})
	if pr.meta.has_field("branch") and branch:
		pr.branch = branch
	pr.flags.ignore_permissions = True
	pr.insert()
	pr.submit()
	return {"purchase_receipt": pr.name, "warnings": warnings}


def fefo_transfer(source, target, items, purpose="Material Transfer", material_request=None, remarks=None):
	"""Stock Entry by batch, earliest expiry first. items: [{item_code, qty (units)}]."""
	company = frappe.db.get_value("Warehouse", source, "company")
	se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": purpose, "purpose": purpose, "company": company, "from_warehouse": source,
		"to_warehouse": target if purpose != "Material Issue" else None, "remarks": remarks})
	for it in items:
		need = flt(it["qty"])
		for b in batches(it["item_code"], source, include_expired=purpose != "Material Transfer" or it.get("include_expired")):
			if need <= 0:
				break
			if it.get("batch_no") and b["batch_no"] != it["batch_no"]:
				continue
			take = min(b["qty"], need)
			se.append("items", {"item_code": it["item_code"], "qty": take, "uom": frappe.get_cached_value("Item", it["item_code"], "stock_uom"),
				"conversion_factor": 1, "batch_no": b["batch_no"], "use_serial_batch_fields": 1, "s_warehouse": source,
				"t_warehouse": target if purpose != "Material Issue" else None, "material_request": material_request,
				"material_request_item": it.get("material_request_item")})
			need -= take
		if need > 0:
			frappe.throw(_("{0}: not enough stock in {1}.").format(it["item_code"], source))
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	return se.name


def expired_stock(warehouses):
	out = []
	for wh in warehouses:
		for item in frappe.get_all("Item", filters={"hv_is_medicine": 1, "has_batch_no": 1}, pluck="name"):
			for b in batches(item, wh, include_expired=True):
				if b["expired"]:
					out.append(dict(b, item_code=item, item_name=frappe.get_cached_value("Item", item, "item_name"), warehouse=wh))
	return out


def quarantine_expired(warehouses, quarantine):
	moved = []
	for e in expired_stock(warehouses):
		moved.append(fefo_transfer(e["warehouse"], quarantine, [{"item_code": e["item_code"], "qty": e["qty"], "batch_no": e["batch_no"], "include_expired": 1}],
			remarks=f"Expired batch {e['batch_no']} to quarantine"))
	return moved


def supplier_return(batch_no, qty, warehouse, reason):
	"""Debit note: return against the Purchase Receipt that brought the batch in."""
	from erpnext.stock.doctype.purchase_receipt.purchase_receipt import make_purchase_return

	pr_name = frappe.db.sql("""select pri.parent from `tabPurchase Receipt Item` pri join `tabPurchase Receipt` pr on pr.name=pri.parent
		where pri.batch_no=%s and pr.docstatus=1 and pr.is_return=0 order by pr.posting_date desc limit 1""", batch_no)
	if not pr_name:
		frappe.throw(_("No purchase receipt found for batch {0}.").format(batch_no))
	ret = make_purchase_return(pr_name[0][0])
	ret.items = [i for i in ret.items if i.batch_no == batch_no]
	for i in ret.items:
		i.qty = -abs(flt(qty))
		i.received_qty = -abs(flt(qty))
		i.warehouse = warehouse
		i.use_serial_batch_fields = 1
	ret.set_warehouse = warehouse
	ret.remarks = reason
	ret.flags.ignore_permissions = True
	ret.insert()
	ret.submit()
	return ret.name


def cycle_count_create(warehouse, branch, scope="All", rack=None, category=None):
	filters = {"hv_is_medicine": 1}
	if scope == "Rack" and rack:
		filters["hv_rack_location"] = rack
	if scope == "Category" and category:
		filters["hv_medicine_category"] = category
	cc = frappe.get_doc({"doctype": "Cycle Count", "warehouse": warehouse, "branch": branch, "scope": scope, "rack": rack, "category": category, "status": "Draft"})
	for item in frappe.get_all("Item", filters=filters, fields=["name", "item_name", "hv_rack_location", "valuation_rate"], order_by="hv_rack_location, item_name"):
		for b in batches(item.name, warehouse, include_expired=True):
			cc.append("items", {"item_code": item.name, "item_name": item.item_name, "batch_no": b["batch_no"], "rack": item.hv_rack_location,
				"system_qty": b["qty"], "valuation_rate": flt(item.valuation_rate) or flt(frappe.db.get_value("Bin", {"item_code": item.name, "warehouse": warehouse}, "valuation_rate"))})
	if scope == "High value":
		cc.items = sorted(cc.items, key=lambda r: -flt(r.system_qty) * flt(r.valuation_rate))[:20]
	cc.insert(ignore_permissions=True)
	return cc


def cycle_count_submit(name, counts):
	cc = frappe.get_doc("Cycle Count", name)
	for r in cc.items:
		if r.name in counts:
			r.counted_qty = flt(counts[r.name])
		r.variance = flt(r.counted_qty) - flt(r.system_qty)
		r.variance_value = r.variance * flt(r.valuation_rate)
	cc.total_variance_value = sum(abs(flt(r.variance_value)) for r in cc.items)
	cc.counted_by = frappe.session.user
	cc.status = "Pending Approval" if cc.total_variance_value > flt(setting("cycle_variance_threshold")) else "Approved"
	cc.save(ignore_permissions=True)
	if cc.status == "Approved":
		post_count(cc)
	return cc


def post_count(cc):
	rows = [r for r in cc.items if abs(flt(r.variance)) > 0.0001]
	if rows:
		sr = frappe.get_doc({"doctype": "Stock Reconciliation", "company": frappe.db.get_value("Warehouse", cc.warehouse, "company"), "purpose": "Stock Reconciliation",
			"items": [{"item_code": r.item_code, "warehouse": cc.warehouse, "batch_no": r.batch_no, "qty": flt(r.counted_qty), "use_serial_batch_fields": 1,
				"valuation_rate": flt(r.valuation_rate) or None} for r in rows]})
		sr.flags.ignore_permissions = True
		sr.insert()
		sr.submit()
		cc.stock_reconciliation = sr.name
	cc.status = "Posted"
	cc.save(ignore_permissions=True)
	return cc


def cycle_count_approve(name, approve=True, note=None):
	if not has_any_role(R.ADMIN):
		frappe.throw(_("Only the administrator approves count variances."), frappe.PermissionError)
	cc = frappe.get_doc("Cycle Count", name)
	if cc.status != "Pending Approval":
		frappe.throw(_("Count is {0}.").format(cc.status))
	cc.approved_by, cc.note = frappe.session.user, note
	if not approve:
		cc.status = "Rejected"
		cc.save(ignore_permissions=True)
		return cc
	return post_count(cc)
