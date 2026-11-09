"""Contract pharmacy as its own company (DECISIONS D-38). Re-run safe.

The pharmacy is run by a contractor with independent accounts: its sales, stock, counters, cashier shifts and cash differences post
to "VVS Pharmacy (Contract)", never to VVS Hospital. Only patient data flows between them (prescriptions, ward orders).

bench --site hospital execute hospital_vvs.setup.pharmacy_company.run
"""

import frappe

from hospital_vvs.setup.company import BRANCHES, ensure_company

COMPANY = "VVS Pharmacy (Contract)"
ABBR = "VVSP"
WAREHOUSES = ["Pharmacy Store", "Pharmacy Retail", "Pharmacy Quarantine"]
WALLETS = ("JazzCash", "Easypaisa")


def acc(company, abbr, name, parent, **kw):
	full = f"{name} - {abbr}"
	if not frappe.db.exists("Account", full):
		frappe.get_doc(dict({"doctype": "Account", "account_name": name, "parent_account": parent, "company": company}, **kw)).insert(ignore_permissions=True)
	return full


def group(company, name):
	return frappe.db.get_value("Account", {"company": company, "account_name": name, "is_group": 1})


def ensure_modes(company, abbr, bank):
	"""Cash → the company's cash account; JazzCash / Easypaisa → their own wallet accounts; card / transfer → the bank."""
	bank_group = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 1}) or group(company, "Bank Accounts")
	wallets = {w: acc(company, abbr, f"{w} Wallet", bank_group, account_type="Bank") for w in WALLETS}
	cash = frappe.db.get_value("Account", {"company": company, "account_type": "Cash", "is_group": 0}) or f"Cash - {abbr}"
	for mode, account in (("Cash", cash), ("Card", bank), ("Bank Transfer", bank), *wallets.items()):
		if not frappe.db.exists("Mode of Payment", mode):
			continue
		mop = frappe.get_doc("Mode of Payment", mode)
		row = next((a for a in mop.accounts if a.company == company), None)
		if not row:
			mop.append("accounts", {"company": company, "default_account": account})
			mop.save(ignore_permissions=True)
		elif mode in WALLETS and row.default_account != account:
			row.default_account = account  # wallets used to share the bank account (D-38)
			mop.save(ignore_permissions=True)


def ensure_cash_accounts(company, abbr):
	"""Same account names as the hospital's, so shift closings find the right one per company (shifts.company_account)."""
	income, expense = group(company, "Indirect Income"), group(company, "Indirect Expenses")
	cash_group = group(company, "Cash In Hand") or frappe.db.get_value("Account", {"company": company, "account_type": "Cash", "is_group": 1})
	asset = group(company, "Loans and Advances (Assets)") or group(company, "Current Assets")
	acc(company, abbr, "Cash Over", income, root_type="Income", report_type="Profit and Loss")
	acc(company, abbr, "Cash Short", expense, root_type="Expense", report_type="Profit and Loss")
	acc(company, abbr, "Petty Expenses", expense, root_type="Expense", report_type="Profit and Loss")
	acc(company, abbr, "Cash Safe", cash_group, account_type="Cash")
	acc(company, abbr, "Cashier Shortage Receivable", asset)


def run():
	company = ensure_company(COMPANY, ABBR)
	income = acc(company, ABBR, "Pharmacy Sales", group(company, "Direct Income"), root_type="Income", report_type="Profit and Loss")
	root_cc = frappe.db.get_value("Cost Center", {"company": company, "is_group": 1, "parent_cost_center": ["in", ["", None]]})
	cc = f"Pharmacy - {ABBR}"
	if not frappe.db.exists("Cost Center", cc):
		frappe.get_doc({"doctype": "Cost Center", "cost_center_name": "Pharmacy", "parent_cost_center": root_cc, "company": company}).insert(ignore_permissions=True)
	bank_group = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 1}) or group(company, "Bank Accounts")
	bank = acc(company, ABBR, "Pharmacy Bank", bank_group, account_type="Bank")
	ensure_modes(company, ABBR, bank)
	ensure_cash_accounts(company, ABBR)
	# hospital wallets get their own accounts too (reception takes JazzCash / Easypaisa)
	from hospital_vvs.setup.company import ABBR as H_ABBR, COMPANY as H_COMPANY

	h_bank = frappe.db.get_value("Mode of Payment Account", {"parent": "Bank Transfer", "company": H_COMPANY}, "default_account")
	ensure_modes(H_COMPANY, H_ABBR, h_bank)

	parent_wh = frappe.db.get_value("Warehouse", {"company": company, "is_group": 1, "parent_warehouse": ["in", ["", None]]})
	s = frappe.get_single("Clinic Settings")
	s.pharmacy_company = company
	for branch, code, *_ in BRANCHES:
		whs = {}
		for w in WAREHOUSES:
			full = f"{w} {code} - {ABBR}"
			if not frappe.db.exists("Warehouse", full):
				frappe.get_doc({"doctype": "Warehouse", "warehouse_name": f"{w} {code}", "company": company, "parent_warehouse": parent_wh}).insert(ignore_permissions=True)
			whs[w] = full
		name = f"Contract Pharmacy - {code}"
		if not frappe.db.exists("POS Profile", name):
			doc = frappe.get_doc({"doctype": "POS Profile", "__newname": name, "company": company, "currency": "PKR", "warehouse": whs["Pharmacy Retail"],
				"selling_price_list": "Standard Selling", "income_account": income, "cost_center": cc,
				"write_off_account": frappe.db.get_value("Company", company, "write_off_account") or f"Write Off - {ABBR}", "write_off_cost_center": cc,
				"write_off_limit": 1, "update_stock": 1, "allow_partial_payment": 0,
				"payments": [{"mode_of_payment": m, "default": 1 if m == "Cash" else 0} for m in ("Cash", "Card", "Bank Transfer", "JazzCash", "Easypaisa")
					if frappe.db.exists("Mode of Payment", m)]})
			if doc.meta.has_field("branch"):
				doc.branch = branch
			doc.insert(ignore_permissions=True)
		row = next((r for r in s.pos_profiles if r.billing_type == "Medicine" and r.branch == branch), None)
		if row:
			row.pos_profile = name
		else:
			s.append("pos_profiles", {"billing_type": "Medicine", "branch": branch, "pos_profile": name})
		if branch == (s.default_branch or BRANCHES[0][0]):
			s.main_store, s.pharmacy_retail_warehouse, s.quarantine_warehouse = whs["Pharmacy Store"], whs["Pharmacy Retail"], whs["Pharmacy Quarantine"]
	s.flags.ignore_permissions = True
	s.save()
	frappe.clear_document_cache("Clinic Settings")
	# pharmacy counters move to the contractor's company when their current shift is closed (shifts.ensure_counter_profile)
	from hospital_vvs.services.shifts import ensure_counter_profile

	moved, waiting = [], []
	for c in frappe.get_all("Counter", filters={"counter_type": ["in", ["Pharmacy Billing", "Pharmacy Handover"]]}, fields=["name", "open_shift"]):
		if c.open_shift and frappe.db.get_value("POS Opening Entry", c.open_shift, "status") == "Open":
			waiting.append(c.name)
		else:
			ensure_counter_profile(c.name)
			moved.append(c.name)
	frappe.db.commit()
	print("contract pharmacy:", company, "counters moved:", moved, "waiting for their open shift to close:", waiting)
	return {"moved": moved, "waiting": waiting}


def move_demo_stock():
	"""Demo site only: medicine stock bought under the hospital moves to the contractor (issue out of the hospital store / shelf,
	receipt into the pharmacy store / shelf at the same batch and rate). A real go-live starts with the contractor's own opening stock."""
	from hospital_vvs.services import pharmacy
	from hospital_vvs.setup.company import ABBR as H

	moved = 0
	for code in [b[1] for b in BRANCHES]:
		for src, dst in ((f"Main Store {code} - {H}", f"Pharmacy Store {code} - {ABBR}"), (f"Pharmacy Retail {code} - {H}", f"Pharmacy Retail {code} - {ABBR}"),
			(f"Quarantine {code} - {H}", f"Pharmacy Quarantine {code} - {ABBR}")):
			if not frappe.db.exists("Warehouse", src):
				continue
			rows = frappe.db.sql("""select sle.item_code, sbe.batch_no, sum(sbe.qty) qty, avg(sle.valuation_rate) rate from `tabStock Ledger Entry` sle
				join `tabSerial and Batch Entry` sbe on sbe.parent=sle.serial_and_batch_bundle join tabItem i on i.name=sle.item_code
				join tabBatch b on b.name=sbe.batch_no
				where sle.warehouse=%s and sle.is_cancelled=0 and i.hv_is_medicine=1 and (b.expiry_date is null or b.expiry_date >= curdate())
				group by sle.item_code, sbe.batch_no having qty>0""", src, as_dict=True)  # expired batches stay with the hospital for write-off
			if not rows:
				continue
			out = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Issue", "purpose": "Material Issue",
				"company": frappe.db.get_value("Warehouse", src, "company"), "remarks": "Medicine stock handed to the contract pharmacy",
				"items": [{"item_code": r.item_code, "qty": r.qty, "s_warehouse": src, "batch_no": r.batch_no, "use_serial_batch_fields": 1,
					"uom": frappe.get_cached_value("Item", r.item_code, "stock_uom"), "conversion_factor": 1} for r in rows]})
			out.flags.ignore_permissions = True
			out.insert()
			out.submit()
			inn = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "purpose": "Material Receipt", "company": COMPANY,
				"remarks": "Opening stock taken over from the hospital", "items": [{"item_code": r.item_code, "qty": r.qty, "t_warehouse": dst,
					"batch_no": r.batch_no, "use_serial_batch_fields": 1, "basic_rate": r.rate, "uom": frappe.get_cached_value("Item", r.item_code, "stock_uom"),
					"conversion_factor": 1} for r in rows]})
			inn.flags.ignore_permissions = True
			inn.insert()
			inn.submit()
			moved += len(rows)
	frappe.db.commit()
	pharmacy.ensure_uoms()
	print("batches moved:", moved)
