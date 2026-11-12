"""Finance API: welfare / zakat, panels & insurers, insurance claims, expenses, purchasing (07-billing-finance.md, D-46)."""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_first_day, today

from hospital_vvs import roles as R
from hospital_vvs.services import expenses as exp
from hospital_vvs.services import payers
from hospital_vvs.utils import has_any_role, require_roles, scope_branch, settings, user_branches

FIN = (R.ACCOUNTANT,)


# ------------------------------------------------------------------ welfare
@frappe.whitelist()
def welfare():
	require_roles(R.ACCOUNTANT, R.RECEPTIONIST, R.CASH_SUPERVISOR)
	return {"funds": payers.fund_report(), "approvals": frappe.get_all("Welfare Approval", fields=["name", "patient", "patient_name", "scheme", "status", "valid_from",
		"valid_till", "notes", "requested_by", "approved_by", "approved_on", "creation"], order_by="field(status,'Pending') desc, creation desc", limit=200),
		"modes": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name"), "can_approve": has_any_role(R.ADMIN, R.ACCOUNTANT)}


@frappe.whitelist(methods=["POST"])
def save_scheme(data):
	require_roles(R.ADMIN, R.ACCOUNTANT)
	d = frappe.parse_json(data)
	doc = frappe.get_doc("Welfare Scheme", d["name"]) if d.get("name") and frappe.db.exists("Welfare Scheme", d["name"]) else frappe.new_doc("Welfare Scheme")
	for k in ("scheme_name", "fund_type", "coverage_percent", "covered_billing_types", "cap_per_visit", "cap_per_month", "approval_required", "is_active", "description"):
		if k in d and not (k == "scheme_name" and not doc.is_new()):
			doc.set(k, d[k])
	doc.flags.ignore_permissions = True
	doc.save()
	payers.fund_customer(doc.name)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def request_welfare(patient, scheme, notes=None, documents=None):
	require_roles(R.RECEPTIONIST, R.ACCOUNTANT)
	if frappe.db.exists("Welfare Approval", {"patient": patient, "scheme": scheme, "status": "Pending"}):
		frappe.throw(_("A request is already waiting for approval."))
	a = frappe.get_doc({"doctype": "Welfare Approval", "patient": patient, "scheme": scheme, "notes": notes, "documents": documents, "status": "Pending",
		"requested_by": frappe.session.user}).insert(ignore_permissions=True)
	frappe.db.set_value("Patient", patient, {"category": "Welfare", "welfare_scheme": scheme})
	return a.name


@frappe.whitelist(methods=["POST"])
def decide_welfare(name, approve=1, valid_till=None, notes=None):
	require_roles(R.ADMIN, R.ACCOUNTANT)
	return payers.approve_welfare(name, cint(approve), valid_till, notes).as_dict()


@frappe.whitelist(methods=["POST"])
def donate(scheme, amount, mode_of_payment, donor=None, reference_no=None):
	require_roles(R.ACCOUNTANT, R.CASH_SUPERVISOR)
	return {"payment_entry": payers.donate(scheme, amount, mode_of_payment, donor, reference_no)}


@frappe.whitelist()
def payer_preview(patient, billing_type="OPD Slip", amount=1000):
	"""What a payer would cover on a bill of this amount (shown at the counter)."""
	require_roles(*R.FRONT_DESK, *R.MONEY)
	return payers.resolve(patient, billing_type, flt(amount))


# ------------------------------------------------------------------ panels & insurers
@frappe.whitelist()
def payer_list():
	require_roles(R.ACCOUNTANT, R.RECEPTIONIST, R.CASH_SUPERVISOR)
	rows = frappe.get_all("Customer", filters={"customer_group": ["in", [payers.PANEL_GROUP, payers.INSURANCE_GROUP]]}, fields=["name", "customer_name", "customer_group", "hv_coverage_percent",
		"hv_covered_billing_types", "hv_contract_valid_till", "disabled"], order_by="customer_group, customer_name")
	age = {a["customer"]: a for a in payers.ageing()}
	for r in rows:
		r["credit_limit"] = flt(frappe.db.get_value("Customer Credit Limit", {"parent": r.name}, "credit_limit"))
		r["kind"] = "Panel" if r.customer_group == payers.PANEL_GROUP else "Insurance"
		r["members"] = frappe.db.count("Patient", {"panel" if r["kind"] == "Panel" else "insurance_provider": r.name})
		r["outstanding"] = age.get(r.name, {}).get("total", 0)
		r["ageing"] = age.get(r.name)
	return {"payers": rows, "ageing": payers.ageing(), "modes": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name")}


@frappe.whitelist(methods=["POST"])
def save_payer(data):
	require_roles(R.ADMIN, R.ACCOUNTANT)
	d = frappe.parse_json(data)
	payers.ensure_setup()
	if d.get("name") and frappe.db.exists("Customer", d["name"]):
		c = frappe.get_doc("Customer", d["name"])
	else:
		c = frappe.new_doc("Customer")
		c.customer_name, c.customer_type = d["customer_name"], "Company"
		c.customer_group = payers.GROUP_OF.get(d.get("customer_group") or "Panel", payers.PANEL_GROUP)
	for k in ("hv_coverage_percent", "hv_covered_billing_types", "hv_contract_valid_till", "disabled"):
		if k in d:
			c.set(k, d[k])
	if "credit_limit" in d:
		company = settings().company or frappe.defaults.get_global_default("company")
		row = next((x for x in c.get("credit_limits") or [] if x.company == company), None)
		if row:
			row.credit_limit = flt(d["credit_limit"])
		elif flt(d["credit_limit"]):
			c.append("credit_limits", {"company": company, "credit_limit": flt(d["credit_limit"])})
	c.flags.ignore_permissions = True
	c.save()
	return c.name


@frappe.whitelist()
def payer_statement(payer, from_date=None, to_date=None):
	require_roles(*FIN, R.CASH_SUPERVISOR)
	return payers.statement(payer, from_date or str(get_first_day(today())), to_date or today())


@frappe.whitelist(methods=["POST"])
def payer_receive(payer, amount, mode_of_payment, deduction=0, deduction_reason=None, reference_no=None, invoices=None):
	require_roles(*FIN)
	return {"payment_entry": payers.receive(payer, amount, mode_of_payment, deduction, deduction_reason, reference_no, invoices)}


# ------------------------------------------------------------------ insurance claims
@frappe.whitelist()
def claims(status=None):
	require_roles(*FIN, R.RECEPTIONIST)
	f = {"status": status} if status else {}
	rows = frappe.get_all("Insurance Claim", filters=f, fields=["name", "insurer", "patient", "patient_name", "status", "claim_no", "claimed_amount", "approved_amount",
		"received_amount", "deduction_amount", "submitted_on", "settled_on", "source_doctype", "source_name", "pre_auth", "creation", "rejected_to_patient"], order_by="creation desc", limit=200)
	for r in rows:
		r["age_days"] = (frappe.utils.getdate(today()) - frappe.utils.getdate(r.submitted_on or r.creation)).days
	# admissions with an insurer bill but no claim yet
	ready = frappe.db.sql("""select ba.name, ba.patient, ba.patient_name, ba.payer, ba.payer_invoice, si.grand_total from `tabBed Allotment` ba join `tabSales Invoice` si on si.name=ba.payer_invoice
		where ba.payer_type='Insurance' and si.docstatus=1 and not exists (select 1 from `tabInsurance Claim` c where c.source_name=ba.name and c.status!='Rejected')""", as_dict=True)
	return {"claims": rows, "ready": ready, "modes": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name"), "bill_rejected_to_patient": cint(settings().get("bill_rejected_to_patient"))}


@frappe.whitelist()
def claim(name):
	require_roles(*FIN, R.RECEPTIONIST)
	return frappe.get_doc("Insurance Claim", name).as_dict()


@frappe.whitelist(methods=["POST"])
def make_claim(source_doctype, source_name):
	require_roles(*FIN)
	return payers.make_claim(source_doctype, source_name).name


@frappe.whitelist(methods=["POST"])
def claim_action(name, action, claim_no=None, note=None, approved_amount=None, reason=None, received_amount=None, mode_of_payment=None, reference_no=None, documents=None):
	require_roles(*FIN)
	if documents is not None:
		frappe.db.set_value("Insurance Claim", name, "documents", documents)
	kw = {k: v for k, v in dict(claim_no=claim_no, note=note, approved_amount=approved_amount, reason=reason, received_amount=received_amount,
		mode_of_payment=mode_of_payment, reference_no=reference_no).items() if v is not None}
	return payers.claim_action(name, action, **kw).as_dict()


# ------------------------------------------------------------------ expenses
@frappe.whitelist()
def expenses(status=None, mine=0):
	require_roles(R.ACCOUNTANT, R.CASH_SUPERVISOR, R.STORE_KEEPER, R.RECEPTIONIST)
	f = {}
	if status:
		f["status"] = status
	if cint(mine):
		f["requested_by"] = frappe.session.user
	rows = frappe.get_all("Expense", filters=f, fields=["name", "category", "amount", "posting_date", "payee", "mode_of_payment", "reference_no", "status", "current_level",
		"description", "receipt", "requested_by", "journal_entry", "branch"], order_by="creation desc", limit=200)
	for r in rows:
		e = frappe.get_doc("Expense", r.name)
		r["approvals"] = [a.as_dict() for a in e.approvals]
		r["can_act"] = exp.can_act(e)
	month = get_first_day(today())
	by_cat = frappe.db.sql("select category, sum(amount) amount, count(*) n from tabExpense where status='Approved' and posting_date>=%s group by category order by amount desc", month, as_dict=True)
	return {"rows": rows, "categories": frappe.get_all("Expense Category", filters={"is_active": 1}, fields=["name", "expense_account", "cost_center"]),
		"modes": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name"), "month": by_cat,
		"levels": frappe.get_all("Expense Approval Level", filters={"parent": "Clinic Settings"}, fields=["level", "role", "min_amount"], order_by="level")}


@frappe.whitelist(methods=["POST"])
def save_expense(data, submit=0):
	require_roles(R.ACCOUNTANT, R.CASH_SUPERVISOR, R.STORE_KEEPER, R.RECEPTIONIST)
	d = frappe.parse_json(data)
	e = frappe.get_doc("Expense", d["name"]) if d.get("name") else frappe.new_doc("Expense")
	if not e.is_new() and e.status not in ("Draft", "Rejected"):
		frappe.throw(_("Only a draft or rejected expense can be changed."))
	for k in ("category", "amount", "posting_date", "payee", "mode_of_payment", "reference_no", "description", "receipt", "branch"):
		if k in d:
			e.set(k, d[k])
	e.branch = e.branch or (user_branches() or [None])[0]
	e.requested_by = e.requested_by or frappe.session.user
	e.flags.ignore_permissions = True
	e.save()
	if cint(submit):
		exp.submit(e.name)
	return e.name


@frappe.whitelist(methods=["POST"])
def expense_action(name, approve=1, note=None):
	return exp.act(name, cint(approve), note).as_dict()


@frappe.whitelist()
def recurring_expenses():
	require_roles(R.ACCOUNTANT, R.CASH_SUPERVISOR)
	return frappe.get_all("Recurring Expense", fields=["name", "title", "category", "amount", "payee", "mode_of_payment", "branch", "frequency", "next_date",
		"end_date", "is_active", "description", "receipt", "auto_submit", "requested_by", "last_expense", "last_run"], order_by="is_active desc, next_date asc")


@frappe.whitelist(methods=["POST"])
def save_recurring_expense(data):
	require_roles(R.ACCOUNTANT)
	d = frappe.parse_json(data)
	t = frappe.get_doc("Recurring Expense", d["name"]) if d.get("name") else frappe.new_doc("Recurring Expense")
	for k in ("title", "category", "amount", "payee", "mode_of_payment", "branch", "frequency", "next_date", "end_date", "is_active", "description", "receipt",
			"auto_submit", "requested_by"):
		if k in d:
			t.set(k, d[k] or None if k in ("end_date", "receipt", "branch", "requested_by") else d[k])
	if t.branch:
		scope_branch(t.branch)
	t.branch = t.branch or (user_branches() or [None])[0]
	t.requested_by = t.requested_by or frappe.session.user
	if cint(t.auto_submit) and not t.receipt:
		frappe.throw(_("Attach the standing bill to send expenses for approval automatically."))
	t.flags.ignore_permissions = True
	t.save()
	return t.name


@frappe.whitelist(methods=["POST"])
def run_recurring_now(name=None):
	"""Draft whatever has fallen due now (the daily job does the same)."""
	require_roles(R.ACCOUNTANT)
	return exp.run_recurring(template=name)


# ------------------------------------------------------------------ purchasing (ERPNext documents)
@frappe.whitelist()
def purchasing(doctype="Purchase Order", status=None):
	require_roles(R.STORE_KEEPER, R.ACCOUNTANT, R.ADMIN)
	if doctype not in ("Purchase Order", "Purchase Invoice", "Purchase Receipt"):
		frappe.throw(_("Unknown document."))
	f = {"docstatus": ["<", 2]}
	if status == "draft":
		f["docstatus"] = 0
	elif status == "unpaid" and doctype == "Purchase Invoice":
		f.update(docstatus=1, outstanding_amount=[">", 0])
	fields = ["name", "supplier", "supplier_name", "posting_date" if doctype != "Purchase Order" else "transaction_date", "grand_total", "status", "docstatus", "company", "owner"]
	if doctype == "Purchase Invoice":
		fields += ["outstanding_amount", "bill_no", "due_date"]
	if doctype == "Purchase Order":
		fields += ["per_received", "per_billed", "schedule_date"]
	rows = frappe.get_all(doctype, filters=f, fields=fields, order_by="creation desc", limit=150)
	for r in rows:
		r["items"] = frappe.get_all(f"{doctype} Item", filters={"parent": r.name}, fields=["item_code", "item_name", "qty", "uom", "rate", "amount"], order_by="idx", limit=50)
	return {"rows": rows, "can_approve": has_any_role(R.ACCOUNTANT, R.ADMIN)}


@frappe.whitelist(methods=["POST"])
def approve_purchase(doctype, name):
	"""Approve = submit a draft purchase document (accountant / admin)."""
	require_roles(R.ACCOUNTANT, R.ADMIN)
	if doctype not in ("Purchase Order", "Purchase Invoice"):
		frappe.throw(_("Unknown document."))
	d = frappe.get_doc(doctype, name)
	if d.docstatus != 0:
		frappe.throw(_("{0} is already submitted.").format(name))
	d.flags.ignore_permissions = True
	d.submit()
	return {"name": d.name, "status": d.status}


# ------------------------------------------------------------------ financial overview (MIS)
@frappe.whitelist()
def overview(from_date=None, to_date=None):
	require_roles(R.ACCOUNTANT, R.ADMIN, R.CASH_SUPERVISOR)
	frm, to = from_date or str(get_first_day(today())), to_date or today()
	a = {"frm": frm, "to": to}
	rev_type = frappe.db.sql("""select hv_billing_type k, sum(base_net_total) v, count(*) n from `tabSales Invoice` where docstatus=1 and posting_date between %(frm)s and %(to)s
		and ifnull(hv_billing_type,'')!='' group by hv_billing_type order by v desc""", a, as_dict=True)
	rev_doctor = frappe.db.sql("""select d.doctor_name k, sum(sii.base_net_amount) v from `tabSales Invoice Item` sii join `tabSales Invoice` si on si.name=sii.parent
		join tabDoctor d on d.name=sii.hv_doctor where si.docstatus=1 and si.posting_date between %(frm)s and %(to)s group by d.doctor_name order by v desc limit 15""", a, as_dict=True)
	rev_service = frappe.db.sql("""select sii.item_name k, sum(sii.base_net_amount) v, sum(sii.qty) n from `tabSales Invoice Item` sii join `tabSales Invoice` si on si.name=sii.parent
		where si.docstatus=1 and si.posting_date between %(frm)s and %(to)s and si.hv_billing_type!='Medicine' group by sii.item_name order by v desc limit 15""", a, as_dict=True)
	refunds = frappe.db.sql("""select hv_billing_type k, -sum(grand_total) v, count(*) n from `tabSales Invoice` where docstatus=1 and is_return=1 and posting_date between %(frm)s and %(to)s group by k""", a, as_dict=True)
	discounts = frappe.db.sql("""select hv_billing_type k, sum(discount_amount) v from `tabSales Invoice` where docstatus=1 and posting_date between %(frm)s and %(to)s and discount_amount>0 group by k""", a, as_dict=True)
	expenses_cat = frappe.db.sql("""select category k, sum(amount) v, count(*) n from tabExpense where status='Approved' and posting_date between %(frm)s and %(to)s group by category order by v desc""", a, as_dict=True)
	share = frappe.db.sql("""select sum(case when amount>0 then amount else 0 end) earned, sum(case when status='Paid' then amount else 0 end) paid, sum(case when status='Unpaid' then amount else 0 end) unpaid
		from `tabDoctor Share Ledger`""", as_dict=True)[0]
	return {"from_date": frm, "to_date": to, "revenue_by_type": rev_type, "revenue_by_doctor": rev_doctor, "revenue_by_service": rev_service, "refunds": refunds,
		"discounts": discounts, "expenses": expenses_cat, "doctor_share": {k: flt(v) for k, v in share.items()}, "payer_ageing": payers.ageing(), "funds": payers.fund_report(),
		"claims": frappe.db.sql("select status k, count(*) n, sum(claimed_amount) v from `tabInsurance Claim` group by status", as_dict=True)}


# ------------------------------------------------------------------ accounts dashboard (sugarcane finance page style, D-64)
def _voucher_code(doctype, row):
	"""BPV / BRV / CPV / CRV for payments, JV for journals (Bank / Cash entries take the bank / cash code)."""
	if doctype == "Payment Entry":
		cash = (row.get("account_type") or "") == "Cash"
		return ("C" if cash else "B") + ("PV" if row.get("payment_type") == "Pay" else "RV")
	vt = row.get("voucher_type") or ""
	return {"Bank Entry": "BPV", "Cash Entry": "CPV"}.get(vt, "JV")


def _fy_start(d):
	d = frappe.utils.getdate(d)
	return frappe.utils.getdate(f"{d.year if d.month >= 7 else d.year - 1}-07-01")  # Pakistan: July to June


@frappe.whitelist()
def accounts():
	require_roles(R.ACCOUNTANT, R.ADMIN, R.CASH_SUPERVISOR)
	from hospital_vvs.utils import branch_company

	company = branch_company("Lahore Main")
	t = today()
	fy = _fy_start(t)
	month = get_first_day(t)

	def balances(kind):
		return frappe.db.sql("""select a.name account, a.account_name, coalesce(sum(g.debit - g.credit), 0) balance from tabAccount a
			left join `tabGL Entry` g on g.account = a.name and g.is_cancelled = 0
			where a.company = %s and a.account_type = %s and a.is_group = 0 group by a.name order by balance desc""", (company, kind), as_dict=True)

	pl = {r.root_type: flt(r.v) for r in frappe.db.sql("""select a.root_type, sum(g.credit - g.debit) v from `tabGL Entry` g join tabAccount a on a.name = g.account
		where g.company = %s and g.is_cancelled = 0 and g.posting_date between %s and %s and a.root_type in ('Income', 'Expense') group by a.root_type""",
		(company, fy, t), as_dict=True)}
	income, expense = pl.get("Income", 0.0), -pl.get("Expense", 0.0)
	trend = frappe.db.sql("""select left(g.posting_date, 7) m, sum(case when a.root_type = 'Income' then g.credit - g.debit else 0 end) income,
		sum(case when a.root_type = 'Expense' then g.debit - g.credit else 0 end) expense from `tabGL Entry` g join tabAccount a on a.name = g.account
		where g.company = %s and g.is_cancelled = 0 and g.posting_date >= %s group by m order by m""", (company, frappe.utils.add_months(month, -5)), as_dict=True)
	drafts = []
	for r in frappe.db.sql("""select name, voucher_type, posting_date, total_debit amount, user_remark remark, owner from `tabJournal Entry`
		where docstatus = 0 and company = %s order by posting_date, name limit 100""", company, as_dict=True):
		drafts.append({"doctype": "Journal Entry", "code": _voucher_code("Journal Entry", r), **r})
	for r in frappe.db.sql("""select pe.name, pe.payment_type, pe.posting_date, pe.paid_amount amount, coalesce(pe.remarks, pe.party_name) remark, pe.owner,
		(select account_type from tabAccount where name = if(pe.payment_type = 'Pay', pe.paid_from, pe.paid_to)) account_type from `tabPayment Entry` pe
		where pe.docstatus = 0 and pe.company = %s order by pe.posting_date, pe.name limit 100""", company, as_dict=True):
		drafts.append({"doctype": "Payment Entry", "code": _voucher_code("Payment Entry", r), **r})
	recent = []
	for r in frappe.db.sql("""select 'Journal Entry' doctype, name, voucher_type, null payment_type, null account_type, posting_date, total_debit amount, user_remark remark
		from `tabJournal Entry` where docstatus = 1 and company = %s
		union all select 'Payment Entry', pe.name, null, pe.payment_type, (select account_type from tabAccount where name = if(pe.payment_type = 'Pay', pe.paid_from, pe.paid_to)),
		pe.posting_date, pe.paid_amount, coalesce(pe.remarks, pe.party_name) from `tabPayment Entry` pe where pe.docstatus = 1 and pe.company = %s
		order by posting_date desc, name desc limit 15""", (company, company), as_dict=True):
		recent.append({**r, "code": _voucher_code(r.doctype, r)})
	codes = {}
	for r in frappe.db.sql("""select 'Journal Entry' doctype, voucher_type, null payment_type, null account_type, total_debit amount from `tabJournal Entry`
		where docstatus = 1 and company = %s and posting_date >= %s
		union all select 'Payment Entry', null, pe.payment_type, (select account_type from tabAccount where name = if(pe.payment_type = 'Pay', pe.paid_from, pe.paid_to)), pe.paid_amount
		from `tabPayment Entry` pe where pe.docstatus = 1 and pe.company = %s and pe.posting_date >= %s""", (company, month, company, month), as_dict=True):
		c = codes.setdefault(_voucher_code(r.doctype, r), {"code": _voucher_code(r.doctype, r), "n": 0, "amount": 0.0})
		c["n"] += 1
		c["amount"] += flt(r.amount)
	pdc = frappe.db.sql("""select count(*) n, coalesce(sum(case when payment_type = 'Pay' then paid_amount end), 0) issued,
		coalesce(sum(case when payment_type = 'Receive' then paid_amount end), 0) received from `tabPayment Entry`
		where docstatus < 2 and company = %s and reference_date > posting_date and clearance_date is null""", company, as_dict=True)[0]
	one = lambda q, *a: flt(frappe.db.sql(q, a)[0][0])  # noqa: E731
	return {"company": company, "fy_start": str(fy), "month": str(month)[:7],
		"banks": [b for b in balances("Bank") if b.balance], "cash": [b for b in balances("Cash") if b.balance],
		"payable": one("select coalesce(sum(outstanding_amount), 0) from `tabPurchase Invoice` where docstatus = 1 and company = %s", company),
		"receivable": one("select coalesce(sum(outstanding_amount), 0) from `tabSales Invoice` where docstatus = 1 and company = %s and outstanding_amount > 0", company),
		"profit": {"income": income, "expense": expense, "profit": income - expense, "margin": round(100 * (income - expense) / income, 1) if income else 0},
		"trend": [{"month": r.m, "income": flt(r.income), "expense": flt(r.expense)} for r in trend],
		"drafts": drafts, "recent": recent, "codes": sorted(codes.values(), key=lambda c: c["code"]), "pdc": pdc,
		"assets": frappe.db.sql("""select count(*) n, coalesce(sum(net_purchase_amount), 0) cost, coalesce(sum(value_after_depreciation), 0) book
			from tabAsset where docstatus = 1 and company = %s""", company, as_dict=True)[0]}


def _refs(refs):
	refs = frappe.parse_json(refs) if isinstance(refs, str) else refs
	out = []
	for r in refs or []:
		dt, _sep, name = str(r).partition("::")
		if dt not in ("Journal Entry", "Payment Entry") or not name:
			frappe.throw(_("Not a voucher: {0}").format(r))
		out.append((dt, name))
	if not out:
		frappe.throw(_("Choose the vouchers"))
	return out


@frappe.whitelist(methods=["POST"])
def post_vouchers(refs):
	"""Submit draft vouchers together; each is checked on its own (one failure does not stop the rest)."""
	require_roles(R.ACCOUNTANT)
	posted, failed = [], []
	for dt, name in _refs(refs):
		try:
			doc = frappe.get_doc(dt, name)
			if doc.docstatus != 0:
				raise frappe.ValidationError(_("already posted"))
			doc.flags.ignore_permissions = True
			doc.submit()
			frappe.db.commit()
			posted.append(name)
		except Exception as e:
			frappe.db.rollback()
			frappe.clear_last_message()
			failed.append({"name": name, "error": str(e)[:200]})
	return {"posted": posted, "failed": failed}


@frappe.whitelist(methods=["POST"])
def print_vouchers(refs):
	"""One PDF, a voucher per page (the ERPNext print format), as a download."""
	require_roles(R.ACCOUNTANT, R.ADMIN, R.CASH_SUPERVISOR)
	import io

	from pypdf import PdfReader, PdfWriter

	w = PdfWriter()
	for dt, name in _refs(refs):
		pdf = frappe.get_print(dt, name, as_pdf=True, no_letterhead=0)
		for p in PdfReader(io.BytesIO(pdf)).pages:
			w.add_page(p)
	buf = io.BytesIO()
	w.write(buf)
	frappe.local.response.filename = "vouchers.pdf"
	frappe.local.response.filecontent = buf.getvalue()
	frappe.local.response.type = "pdf"
