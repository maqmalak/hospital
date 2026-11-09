"""Doctor share (commission) — 07-billing-finance.md, D-43.

Every billed line (OPD slip, referred lab test, online visit, ER, IPD bill) carries the doctor who earns on it
(Sales Invoice Item.hv_doctor, filled here on validate). The most specific active Doctor Share Rule gives the line's
share. The share is *earned as the bill is paid* (Clinic Settings → Doctor share basis = On payment): after every
invoice submit / cancel and every payment, `sync_invoice` brings the ledger to share × paid fraction, writing the
difference as a Doctor Share Ledger row plus a Journal Entry (Dr doctor-share expense, Cr the doctor's Supplier).
Refunds (credit notes) give negative shares. Payout runs pay the unpaid rows with a Payment Entry to the supplier.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate, today

from hospital_vvs.utils import setting

DOCTOR_FIELDS = ("doctor", "assigned_doctor", "referring_doctor", "admitting_doctor", "attending_doctor")


# ------------------------------------------------------------------ which doctor earns on a line
def _ref_doctor(doctype, name):
	if not (doctype and name) or not frappe.db.exists(doctype, name):
		return None
	meta = frappe.get_meta(doctype)
	for fn in DOCTOR_FIELDS:
		if meta.has_field(fn) and meta.get_field(fn).options == "Doctor":
			v = frappe.db.get_value(doctype, name, fn)
			if v:
				return v
	if doctype == "IPD Procedure":  # the surgeon of the team
		return frappe.db.get_value("Procedure Team Member", {"parent": name, "parenttype": doctype, "role": "Surgeon", "doctor": ["is", "set"]}, "doctor") or \
			frappe.db.get_value("Procedure Team Member", {"parent": name, "parenttype": doctype, "doctor": ["is", "set"]}, "doctor")
	return None


def fill_line_doctors(doc, method=None):
	"""Sales Invoice validate: set hv_doctor on each line from the bill's source (kept if already set)."""
	if doc.get("hv_billing_type") in (None, "", "Medicine"):
		return
	ref_dt, ref = doc.get("hv_reference_doctype"), doc.get("hv_reference_name")
	if doc.is_return and doc.return_against and not ref:
		ref_dt, ref = frappe.db.get_value("Sales Invoice", doc.return_against, ["hv_reference_doctype", "hv_reference_name"]) or (None, None)
	default = None if ref_dt == "Bed Allotment" else _ref_doctor(ref_dt, ref)
	for it in doc.items:
		if it.get("hv_doctor"):
			continue
		if ref_dt == "Bed Allotment":
			# IPD bill: the charge's own source (procedure → surgeon, round → doctor), else the admitting doctor
			ch = frappe.db.get_value("IPD Charge", {"bed_allotment": ref, "item_code": it.item_code, "status": ["!=", "Cancelled"]},
				["reference_doctype", "reference_name"], as_dict=True)
			it.hv_doctor = (_ref_doctor(ch.reference_doctype, ch.reference_name) if ch else None) or _ref_doctor("Bed Allotment", ref)
		else:
			it.hv_doctor = default


def backfill_doctors(name):
	"""Bills posted before commission existed have no line doctor: fill it (without touching the submitted bill otherwise)."""
	si = frappe.get_doc("Sales Invoice", name)
	if all(it.get("hv_doctor") for it in si.items):
		return
	fill_line_doctors(si)
	for it in si.items:
		if it.get("hv_doctor"):
			frappe.db.set_value("Sales Invoice Item", it.name, "hv_doctor", it.hv_doctor, update_modified=False)


# ------------------------------------------------------------------ rules
def find_rule(doctor, billing_type, item_code, item_group, posting_date, branch):
	rules = frappe.get_all("Doctor Share Rule", filters={"doctor": doctor, "is_active": 1},
		fields=["name", "billing_type", "item_group", "item_code", "share_type", "value", "basis", "from_date", "to_date", "branch"])
	best, score = None, -1
	d = getdate(posting_date)
	for r in rules:
		if r.from_date and getdate(r.from_date) > d or r.to_date and getdate(r.to_date) < d:
			continue
		if r.branch and r.branch != branch:
			continue
		if r.billing_type not in ("Any", billing_type) or (r.item_code and r.item_code != item_code) or (r.item_group and r.item_group != item_group):
			continue
		s = (4 if r.item_code else 0) + (2 if r.item_group else 0) + (1 if r.billing_type != "Any" else 0)
		if s > score:
			best, score = r, s
	return best


def line_shares(si):
	"""[(item row, doctor, rule, basis amount, full share)] for lines that earn commission."""
	out = []
	for it in si.items:
		if not it.get("hv_doctor"):
			continue
		r = find_rule(it.hv_doctor, si.hv_billing_type, it.item_code, it.item_group, si.posting_date, si.branch)
		if not r:
			continue
		base = flt(it.net_amount if r.basis == "Net of discount" else it.amount)
		share = base * flt(r.value) / 100 if r.share_type == "Percent" else flt(r.value) * flt(it.qty)
		out.append((it, it.hv_doctor, r, base, flt(share, 2)))
	return out


def paid_fraction(si):
	if si.docstatus != 1:
		return 0.0
	if si.is_return or (setting("doctor_share_basis") or "On payment") == "At invoice":
		return 1.0
	total = flt(si.rounded_total or si.grand_total)
	if total <= 0:
		return 1.0
	return min(max((total - max(flt(si.outstanding_amount), 0)) / total, 0.0), 1.0)


# ------------------------------------------------------------------ ledger sync (idempotent)
def sync_invoice(name):
	if not cint(setting("enable_doctor_share")):
		return
	si = frappe.get_doc("Sales Invoice", name)
	if si.get("hv_billing_type") in (None, "", "Medicine"):
		return
	frac = paid_fraction(si)
	if si.get("hv_is_payer_share") and not cint(setting("doctor_share_on_payer_bills")):
		frac = 0.0
	targets = {}  # invoice_item → (target, row, doctor, rule, base)
	for it, doctor, rule, base, share in line_shares(si) if si.docstatus == 1 else []:
		targets[it.name] = (flt(share * frac, 2), it, doctor, rule, base)
	done = {}
	for r in frappe.get_all("Doctor Share Ledger", filters={"sales_invoice": name}, fields=["invoice_item", "doctor", "amount"]):
		key = (r.invoice_item, r.doctor)
		done[key] = flt(done.get(key)) + flt(r.amount)
	rows = []
	for key, have in done.items():  # lines that no longer earn (cancelled bill, doctor changed, rule removed)
		if key[0] not in targets or targets[key[0]][2] != key[1]:
			if abs(have) >= 0.01:
				it = next((x for x in si.items if x.name == key[0]), None)
				rows.append(dict(doctor=key[1], amount=-have, it=it, rule=None, base=0))
	for item_row, (target, it, doctor, rule, base) in targets.items():
		delta = flt(target - flt(done.get((item_row, doctor))), 2)
		if abs(delta) >= 0.01:
			rows.append(dict(doctor=doctor, amount=delta, it=it, rule=rule.name, base=base))
	if rows:
		_post(si, rows, frac)


def _post(si, rows, frac):
	by_doctor = {}
	for r in rows:
		by_doctor.setdefault(r["doctor"], []).append(r)
	for doctor, items in by_doctor.items():
		supplier = ensure_supplier(doctor, si.company)
		total = flt(sum(r["amount"] for r in items), 2)
		je = _journal(si, supplier, total, doctor) if abs(total) >= 0.01 else None
		for r in items:
			it = r["it"]
			frappe.get_doc({"doctype": "Doctor Share Ledger", "posting_date": today(), "doctor": doctor, "supplier": supplier,
				"entry_type": "Earned" if r["amount"] > 0 else "Reversed", "amount": r["amount"], "status": "Unpaid",
				"sales_invoice": si.name, "invoice_item": it.name if it else None, "item_code": it.item_code if it else None, "item_name": it.item_name if it else None,
				"billing_type": si.hv_billing_type, "patient": si.get("hv_patient"), "branch": si.branch, "company": si.company,
				"line_amount": r["base"], "earned_fraction": flt(frac * 100, 2), "rule": r["rule"], "journal_entry": je}).insert(ignore_permissions=True)


def expense_account(company):
	from hospital_vvs.services.shifts import company_account

	acc = setting("doctor_share_expense_account")
	return company_account(acc, company) if acc else None


def _journal(si, supplier, amount, doctor):
	exp = expense_account(si.company)
	payable = frappe.get_cached_value("Company", si.company, "default_payable_account")
	if not (exp and payable):
		frappe.log_error(f"Doctor share for {si.name}: set Clinic Settings → Doctor Share → expense account", "Doctor share not posted")
		return None
	amt = abs(amount)
	cc = si.cost_center or frappe.get_cached_value("Company", si.company, "cost_center")
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": si.company, "posting_date": nowdate(),
		"user_remark": f"Doctor share · {frappe.db.get_value('Doctor', doctor, 'doctor_name')} · {si.name}" + ("" if amount > 0 else " (reversal)"),
		"accounts": [
			{"account": exp, "debit_in_account_currency": amt if amount > 0 else 0, "credit_in_account_currency": 0 if amount > 0 else amt, "cost_center": cc},
			{"account": payable, "party_type": "Supplier", "party": supplier, "credit_in_account_currency": amt if amount > 0 else 0,
				"debit_in_account_currency": 0 if amount > 0 else amt, "cost_center": cc},
		]})
	if si.get("branch") and frappe.get_meta("Journal Entry Account").has_field("branch"):
		for a in je.accounts:
			a.branch = si.branch
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name


def ensure_supplier(doctor, company=None):
	sup = frappe.db.get_value("Doctor", doctor, "supplier")
	if sup and frappe.db.exists("Supplier", sup):
		return sup
	name = frappe.db.get_value("Doctor", doctor, "doctor_name") or doctor
	group = setting("doctor_supplier_group") or frappe.db.get_value("Supplier Group", {"is_group": 0}) or "All Supplier Groups"
	s = frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_group": group, "supplier_type": "Individual"})
	s.insert(ignore_permissions=True)
	frappe.db.set_value("Doctor", doctor, "supplier", s.name, update_modified=False)
	return s.name


# ------------------------------------------------------------------ hooks (never block billing)
def _safe(name):
	frappe.db.savepoint("hv_doctor_share")
	try:
		sync_invoice(name)
	except Exception:
		frappe.db.rollback(save_point="hv_doctor_share")
		frappe.log_error(frappe.get_traceback(), f"Doctor share sync failed for {name}")
	else:
		frappe.db.release_savepoint("hv_doctor_share")


def on_invoice_change(doc, method=None):
	if doc.get("hv_billing_type") in (None, "", "Medicine"):
		return
	_safe(doc.name)
	if doc.is_return and doc.return_against:
		_safe(doc.return_against)  # a credit note changes what was paid on the original


def on_payment_change(doc, method=None):
	for r in doc.get("references") or []:
		if r.reference_doctype == "Sales Invoice":
			_safe(r.reference_name)


# ------------------------------------------------------------------ payouts
def unpaid_rows(doctor, company=None, from_date=None, to_date=None, branch=None):
	f = {"doctor": doctor, "status": "Unpaid", "payout": ["is", "not set"]}
	if company:
		f["company"] = company
	if branch:
		f["branch"] = branch
	if from_date and to_date:
		f["posting_date"] = ["between", [from_date, to_date]]
	elif to_date:
		f["posting_date"] = ["<=", to_date]
	return frappe.get_all("Doctor Share Ledger", filters=f, fields=["name", "posting_date", "sales_invoice", "patient", "item_name", "amount"], order_by="posting_date, creation")


def make_payout(doctor, company, mode_of_payment, from_date=None, to_date=None, branch=None, reference_no=None, remarks=None):
	rows = unpaid_rows(doctor, company, from_date, to_date, branch)
	total = flt(sum(r.amount for r in rows), 2)
	if total <= 0:
		frappe.throw(_("Nothing to pay: the doctor has no unpaid commission in this period."))
	p = frappe.get_doc({"doctype": "Doctor Share Payout", "doctor": doctor, "supplier": ensure_supplier(doctor, company), "company": company,
		"from_date": from_date, "to_date": to_date or today(), "branch": branch, "mode_of_payment": mode_of_payment, "reference_no": reference_no,
		"remarks": remarks, "payment_date": today(), "total_amount": total,
		"items": [{"ledger": r.name, "posting_date": r.posting_date, "sales_invoice": r.sales_invoice, "patient": r.patient, "item_name": r.item_name, "amount": r.amount} for r in rows]})
	p.insert(ignore_permissions=True)
	return p


def payout_validate(doc, method=None):
	doc.total_amount = flt(sum(flt(i.amount) for i in doc.items), 2)
	if not doc.supplier:
		doc.supplier = ensure_supplier(doc.doctor, doc.company)


def payout_submit(doc, method=None):
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

	if flt(doc.total_amount) <= 0:
		frappe.throw(_("The payout total must be more than zero."))
	for i in doc.items:
		st, po = frappe.db.get_value("Doctor Share Ledger", i.ledger, ["status", "payout"])
		if st == "Paid" or (po and po != doc.name):
			frappe.throw(_("Row {0}: {1} is already paid.").format(i.idx, i.ledger))
	if doc.mode_of_payment != "Cash" and not doc.reference_no:
		frappe.throw(_("Enter the cheque / transaction number."))
	account = get_bank_cash_account(doc.mode_of_payment, doc.company).get("account")
	payable = frappe.get_cached_value("Company", doc.company, "default_payable_account")
	pe = frappe.get_doc({"doctype": "Payment Entry", "payment_type": "Pay", "company": doc.company, "posting_date": doc.payment_date or today(),
		"mode_of_payment": doc.mode_of_payment, "party_type": "Supplier", "party": doc.supplier, "paid_from": account, "paid_to": payable,
		"paid_amount": doc.total_amount, "received_amount": doc.total_amount, "reference_no": doc.reference_no or doc.name,
		"reference_date": doc.payment_date or today(), "remarks": f"Doctor share payout {doc.name} · {doc.doctor_name}"})
	pe.setup_party_account_field()
	pe.set_missing_values()
	pe.paid_from, pe.paid_to = account, payable
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	frappe.db.set_value("Doctor Share Ledger", {"name": ["in", [i.ledger for i in doc.items]]}, {"status": "Paid", "payout": doc.name}, update_modified=False)
	doc.db_set({"payment_entry": pe.name, "status": "Paid", "approved_by": frappe.session.user})


def payout_cancel(doc, method=None):
	if doc.payment_entry and frappe.db.get_value("Payment Entry", doc.payment_entry, "docstatus") == 1:
		pe = frappe.get_doc("Payment Entry", doc.payment_entry)
		pe.flags.ignore_permissions = True
		pe.cancel()
	frappe.db.set_value("Doctor Share Ledger", {"payout": doc.name}, {"status": "Unpaid", "payout": None}, update_modified=False)
	doc.db_set("status", "Cancelled")


# ------------------------------------------------------------------ statements
def balances(company=None, branch=None):
	cond, args = "", []
	if company:
		cond += " and l.company=%s"
		args.append(company)
	if branch:
		cond += " and l.branch=%s"
		args.append(branch)
	rows = frappe.db.sql(f"""select l.doctor, d.doctor_name, d.doctor_type, d.supplier,
		sum(case when l.amount>0 then l.amount else 0 end) earned, sum(case when l.amount<0 then -l.amount else 0 end) reversed,
		sum(case when l.status='Paid' then l.amount else 0 end) paid, sum(case when l.status='Unpaid' then l.amount else 0 end) unpaid,
		count(distinct l.sales_invoice) bills, max(l.posting_date) last_date
		from `tabDoctor Share Ledger` l join tabDoctor d on d.name=l.doctor where 1=1 {cond} group by l.doctor order by unpaid desc""", args, as_dict=True)
	have = {r.doctor for r in rows}
	for d in frappe.get_all("Doctor Share Rule", filters={"is_active": 1}, fields=["doctor"], distinct=True):
		if d.doctor not in have:
			dd = frappe.db.get_value("Doctor", d.doctor, ["doctor_name", "doctor_type", "supplier"], as_dict=True)
			rows.append(frappe._dict(doctor=d.doctor, earned=0, reversed=0, paid=0, unpaid=0, bills=0, last_date=None, **dd))
			have.add(d.doctor)
	for r in rows:
		r["rules"] = frappe.db.count("Doctor Share Rule", {"doctor": r.doctor, "is_active": 1})
	return rows


def statement(doctor, from_date=None, to_date=None, status=None):
	f = {"doctor": doctor}
	if from_date and to_date:
		f["posting_date"] = ["between", [from_date, to_date]]
	if status:
		f["status"] = status
	rows = frappe.get_all("Doctor Share Ledger", filters=f, fields=["name", "posting_date", "entry_type", "amount", "status", "payout", "sales_invoice",
		"item_name", "billing_type", "patient", "line_amount", "earned_fraction", "branch"], order_by="posting_date desc, creation desc", limit=500)
	pats = {p.name: p.patient_name for p in frappe.get_all("Patient", filters={"name": ["in", list({r.patient for r in rows if r.patient}) or [""]]}, fields=["name", "patient_name"])}
	for r in rows:
		r["patient_name"] = pats.get(r.patient)
	tot = frappe.db.sql("""select sum(case when amount>0 then amount else 0 end) earned, sum(case when amount<0 then -amount else 0 end) reversed,
		sum(case when status='Paid' then amount else 0 end) paid, sum(case when status='Unpaid' then amount else 0 end) unpaid
		from `tabDoctor Share Ledger` where doctor=%s""", doctor, as_dict=True)[0]
	payouts = frappe.get_all("Doctor Share Payout", filters={"doctor": doctor, "docstatus": ["<", 2]}, fields=["name", "payment_date", "total_amount", "mode_of_payment",
		"reference_no", "payment_entry", "status", "docstatus"], order_by="creation desc", limit=50)
	d = frappe.db.get_value("Doctor", doctor, ["doctor_name", "doctor_type", "specialization", "supplier"], as_dict=True)
	return {"doctor": doctor, **(d or {}), "totals": {k: flt(v) for k, v in tot.items()}, "rows": rows, "payouts": payouts,
		"rules": frappe.get_all("Doctor Share Rule", filters={"doctor": doctor}, fields=["name", "billing_type", "item_group", "item_code", "share_type", "value", "basis",
			"from_date", "to_date", "branch", "is_active"], order_by="is_active desc, creation desc")}


# ------------------------------------------------------------------ setup
def ensure_accounts():
	"""Expense account per company + a Doctors supplier group (idempotent)."""
	s = frappe.get_single("Clinic Settings")
	company = s.company or frappe.defaults.get_global_default("company")
	if not company:
		return
	if not frappe.db.exists("Supplier Group", "Doctors"):
		parent = frappe.db.get_value("Supplier Group", {"is_group": 1}, "name") or "All Supplier Groups"
		frappe.get_doc({"doctype": "Supplier Group", "supplier_group_name": "Doctors", "parent_supplier_group": parent}).insert(ignore_permissions=True)
	abbr = frappe.get_cached_value("Company", company, "abbr")
	acc = frappe.db.get_value("Account", {"company": company, "account_name": "Doctor Share Expense", "is_group": 0})
	if not acc:
		parent = frappe.db.get_value("Account", {"company": company, "account_name": "Indirect Expenses", "is_group": 1}) or \
			frappe.db.get_value("Account", {"company": company, "root_type": "Expense", "is_group": 1}, "name", order_by="lft")
		acc = frappe.get_doc({"doctype": "Account", "account_name": "Doctor Share Expense", "parent_account": parent, "company": company,
			"account_type": "Expense Account", "root_type": "Expense"}).insert(ignore_permissions=True).name
	if not s.get("doctor_share_expense_account"):
		frappe.db.set_single_value("Clinic Settings", "doctor_share_expense_account", acc)
	if not s.get("doctor_supplier_group"):
		frappe.db.set_single_value("Clinic Settings", "doctor_supplier_group", "Doctors")
	return acc, abbr
