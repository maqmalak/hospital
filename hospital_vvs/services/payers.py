"""Payers — panels, insurers and welfare / zakat funds (07-billing-finance.md, D-46).

`resolve()` is the one rule every bill uses (OPD slip, lab order, IPD admission): who pays which part. Panels and insurers are
Customers with a coverage %, covered billing types and a contract end date. A welfare patient needs an approved, valid
Welfare Approval; the scheme covers its % of covered services up to a cap per visit and per month, and the covered share is
invoiced to the scheme's fund Customer (donations are received on the same Customer, so its balance is the fund balance).
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_first_day, get_last_day, getdate, nowdate, today

from hospital_vvs.utils import setting

PANEL_GROUP, INSURANCE_GROUP, WELFARE_GROUP = "Panels", "Insurance Providers", "Welfare Funds"
GROUP_OF = {"Panel": PANEL_GROUP, "Insurance": INSURANCE_GROUP}


def _types(text):
	return [t.strip() for t in (text or "").splitlines() if t.strip()]


# ------------------------------------------------------------------ the rule
def resolve(patient, billing_type, net, posting_date=None, payer_type=None, payer=None):
	"""→ {payer_type, payer, share, note}. share 0 = the patient pays all."""
	none = {"payer_type": "Patient", "payer": None, "share": 0.0, "note": None}
	d = getdate(posting_date or today())
	pat = frappe.db.get_value("Patient", patient, ["category", "panel", "insurance_provider", "welfare_scheme"], as_dict=True) or {}
	if not payer_type or payer_type == "Patient":
		payer_type = pat.get("category") if pat.get("category") in ("Panel", "Insurance", "Welfare") else "Patient"
		payer = pat.get("panel") if payer_type == "Panel" else pat.get("insurance_provider") if payer_type == "Insurance" else None
	if payer_type == "Welfare":
		return welfare_share(patient, pat.get("welfare_scheme"), billing_type, net, d) or none
	if payer_type not in ("Panel", "Insurance") or not payer:
		return none
	c = frappe.db.get_value("Customer", payer, ["hv_coverage_percent", "hv_covered_billing_types", "hv_contract_valid_till", "disabled"], as_dict=True) or {}
	if c.get("disabled") or (c.get("hv_contract_valid_till") and getdate(c.hv_contract_valid_till) < d):
		return dict(none, note=_("{0} contract has ended").format(payer))
	types = _types(c.get("hv_covered_billing_types"))
	if types and billing_type not in types:
		return dict(none, note=_("{0} does not cover {1}").format(payer, billing_type))
	share = round(flt(net) * flt(c.get("hv_coverage_percent")) / 100)
	return {"payer_type": payer_type, "payer": payer, "share": flt(share), "note": None} if share > 0 else none


# ------------------------------------------------------------------ welfare / zakat
def fund_customer(scheme):
	s = frappe.get_doc("Welfare Scheme", scheme)
	if s.fund_customer and frappe.db.exists("Customer", s.fund_customer):
		return s.fund_customer
	group = setting("welfare_customer_group") or ensure_group(WELFARE_GROUP)
	name = f"{s.scheme_name} ({s.fund_type} fund)"
	cust = frappe.db.get_value("Customer", {"customer_name": name}) or frappe.get_doc({"doctype": "Customer", "customer_name": name, "customer_group": group,
		"customer_type": "Company", "hv_coverage_percent": s.coverage_percent}).insert(ignore_permissions=True).name
	frappe.db.set_value("Welfare Scheme", scheme, "fund_customer", cust)
	return cust


def ensure_group(name, parent=None):
	if not frappe.db.exists("Customer Group", name):
		frappe.get_doc({"doctype": "Customer Group", "customer_group_name": name, "parent_customer_group": parent or "All Customer Groups"}).insert(ignore_permissions=True)
	return name


def valid_approval(patient, scheme, on=None):
	d = getdate(on or today())
	for a in frappe.get_all("Welfare Approval", filters={"patient": patient, "scheme": scheme, "status": "Approved"}, fields=["name", "valid_from", "valid_till"], order_by="creation desc"):
		if (not a.valid_from or getdate(a.valid_from) <= d) and (not a.valid_till or getdate(a.valid_till) >= d):
			return a.name
	return None


def month_used(patient, fund, on):
	return flt(frappe.db.sql("""select sum(grand_total) from `tabSales Invoice` where customer=%s and hv_patient=%s and docstatus=1 and hv_is_payer_share=1
		and posting_date between %s and %s""", (fund, patient, get_first_day(on), get_last_day(on)))[0][0])


def welfare_share(patient, scheme, billing_type, net, on):
	if not scheme or not cint(setting("enable_welfare")):
		return None
	s = frappe.db.get_value("Welfare Scheme", scheme, ["name", "is_active", "approval_required", "coverage_percent", "covered_billing_types", "cap_per_visit", "cap_per_month"], as_dict=True)
	if not s or not s.is_active:
		return None
	types = _types(s.covered_billing_types)
	if types and billing_type not in types:
		return None
	if s.approval_required and not valid_approval(patient, scheme, on):
		return {"payer_type": "Patient", "payer": None, "share": 0.0, "note": _("No approved {0} welfare approval").format(scheme)}
	share = flt(net) * flt(s.coverage_percent) / 100
	if flt(s.cap_per_visit):
		share = min(share, flt(s.cap_per_visit))
	fund = fund_customer(scheme)
	if flt(s.cap_per_month):
		share = min(share, max(flt(s.cap_per_month) - month_used(patient, fund, on), 0))
	share = round(share)
	return {"payer_type": "Welfare", "payer": fund, "share": flt(share), "note": None} if share > 0 else None


def approve_welfare(name, approve=True, valid_till=None, notes=None):
	a = frappe.get_doc("Welfare Approval", name)
	a.status = "Approved" if approve else "Rejected"
	if valid_till:
		a.valid_till = valid_till
	elif approve and not a.valid_till:
		a.valid_till = add_days(today(), 365)
	if notes:
		a.notes = notes
	a.approved_by, a.approved_on = frappe.session.user, frappe.utils.now_datetime()
	a.save(ignore_permissions=True)
	return a


def donate(scheme, amount, mode_of_payment, donor=None, reference_no=None, company=None):
	"""Donation into a fund: Payment Entry received on the fund Customer (unallocated), so the fund balance goes up."""
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Enter the donation amount."))
	company = company or setting("company") or frappe.defaults.get_global_default("company")
	fund = fund_customer(scheme)
	pe = frappe.get_doc({"doctype": "Payment Entry", "payment_type": "Receive", "company": company, "posting_date": nowdate(), "mode_of_payment": mode_of_payment,
		"party_type": "Customer", "party": fund, "paid_amount": amount, "received_amount": amount,
		"paid_to": get_bank_cash_account(mode_of_payment, company).get("account"), "reference_no": reference_no or f"Donation {donor or ''}".strip(),
		"reference_date": nowdate(), "remarks": f"Donation to {scheme}" + (f" from {donor}" if donor else "")})
	pe.setup_party_account_field()
	pe.set_missing_values()
	pe.paid_to = get_bank_cash_account(mode_of_payment, company).get("account")
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	return pe.name


def party_balance(customer):
	"""Customer receivable balance (positive = owes us)."""
	return flt(frappe.db.sql("select sum(debit-credit) from `tabGL Entry` where party_type='Customer' and party=%s and is_cancelled=0", customer)[0][0])


def fund_report():
	out = []
	for s in frappe.get_all("Welfare Scheme", fields=["name", "fund_type", "coverage_percent", "is_active", "fund_customer", "cap_per_visit", "cap_per_month"], order_by="name"):
		fund = s.fund_customer
		donations = flt(frappe.db.sql("select sum(paid_amount) from `tabPayment Entry` where party=%s and payment_type='Receive' and docstatus=1", fund)[0][0]) if fund else 0
		used = flt(frappe.db.sql("select sum(grand_total) from `tabSales Invoice` where customer=%s and docstatus=1", fund)[0][0]) if fund else 0
		patients = frappe.db.sql("select count(distinct hv_patient) from `tabSales Invoice` where customer=%s and docstatus=1", fund)[0][0] if fund else 0
		out.append({**s, "donations": donations, "used": used, "balance": -party_balance(fund) if fund else 0, "patients": patients,
			"approved": frappe.db.count("Welfare Approval", {"scheme": s.name, "status": "Approved"}), "pending": frappe.db.count("Welfare Approval", {"scheme": s.name, "status": "Pending"})})
	return out


# ------------------------------------------------------------------ panels & insurers: statements, payments, ageing
def payer_invoices(payer, from_date=None, to_date=None, outstanding_only=False):
	f = {"customer": payer, "docstatus": 1, "is_return": 0}
	if from_date and to_date:
		f["posting_date"] = ["between", [from_date, to_date]]
	if outstanding_only:
		f["outstanding_amount"] = [">", 0]
	rows = frappe.get_all("Sales Invoice", filters=f, fields=["name", "posting_date", "hv_patient", "hv_billing_type", "grand_total", "outstanding_amount",
		"hv_payer_share_of", "hv_reference_doctype", "hv_reference_name"], order_by="posting_date, name")
	pats = {p.name: p for p in frappe.get_all("Patient", filters={"name": ["in", list({r.hv_patient for r in rows if r.hv_patient}) or [""]]}, fields=["name", "patient_name", "employee_id", "panel_relation", "policy_no"])}
	for r in rows:
		p = pats.get(r.hv_patient) or {}
		r.update(patient_name=p.get("patient_name"), employee_id=p.get("employee_id"), relation=p.get("panel_relation"), policy_no=p.get("policy_no"))
	return rows


def statement(payer, from_date, to_date):
	rows = payer_invoices(payer, from_date, to_date)
	c = frappe.db.get_value("Customer", payer, ["customer_name", "customer_group", "hv_coverage_percent", "hv_contract_valid_till"], as_dict=True)
	return {"payer": payer, **(c or {}), "from_date": from_date, "to_date": to_date, "rows": rows, "billed": sum(flt(r.grand_total) for r in rows),
		"outstanding": sum(flt(r.outstanding_amount) for r in rows), "balance": party_balance(payer), "ageing": ageing(payer)}


def ageing(payer=None, groups=(PANEL_GROUP, INSURANCE_GROUP, WELFARE_GROUP)):
	f = "si.customer=%(payer)s" if payer else "c.customer_group in %(groups)s"
	rows = frappe.db.sql(f"""select si.customer, c.customer_group, datediff(curdate(), si.posting_date) age, si.outstanding_amount amt
		from `tabSales Invoice` si join tabCustomer c on c.name=si.customer where si.docstatus=1 and si.outstanding_amount>0 and {f}""",
		{"payer": payer, "groups": list(groups)}, as_dict=True)
	out = {}
	for r in rows:
		b = out.setdefault(r.customer, {"customer": r.customer, "group": r.customer_group, "d0_30": 0.0, "d31_60": 0.0, "d61_90": 0.0, "d90": 0.0, "total": 0.0})
		key = "d0_30" if r.age <= 30 else "d31_60" if r.age <= 60 else "d61_90" if r.age <= 90 else "d90"
		b[key] += flt(r.amt)
		b["total"] += flt(r.amt)
	return sorted(out.values(), key=lambda x: -x["total"]) if not payer else (list(out.values()) or [{"d0_30": 0, "d31_60": 0, "d61_90": 0, "d90": 0, "total": 0}])[0]


def receive(payer, amount, mode_of_payment, deduction=0, deduction_reason=None, reference_no=None, invoices=None, company=None):
	"""Payer pays: one Payment Entry allocated to its oldest outstanding bills (or the given ones); a deduction (disallowed / tax)
	is written off to Clinic Settings → payer deduction account on the same entry."""
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

	amount, deduction = flt(amount), flt(deduction)
	if amount <= 0 and deduction <= 0:
		frappe.throw(_("Enter the amount received."))
	if deduction and not (deduction_reason or "").strip():
		frappe.throw(_("Give the reason for the deduction."))
	company = company or setting("company") or frappe.defaults.get_global_default("company")
	outstanding = payer_invoices(payer, outstanding_only=True)
	if invoices:
		want = set(frappe.parse_json(invoices) if isinstance(invoices, str) else invoices)
		outstanding = [r for r in outstanding if r.name in want]
	if not outstanding:
		frappe.throw(_("{0} has no unpaid bills.").format(payer))
	pot = amount + deduction
	refs = []
	for r in outstanding:
		if pot <= 0:
			break
		take = min(flt(r.outstanding_amount), pot)
		refs.append({"reference_doctype": "Sales Invoice", "reference_name": r.name, "allocated_amount": take})
		pot -= take
	if pot > 0.5:
		frappe.throw(_("Received {0} is more than the bills selected owe.").format(frappe.format_value(amount + deduction, "Currency")))
	acct = get_bank_cash_account(mode_of_payment, company).get("account")
	pe = frappe.get_doc({"doctype": "Payment Entry", "payment_type": "Receive", "company": company, "posting_date": nowdate(), "mode_of_payment": mode_of_payment,
		"party_type": "Customer", "party": payer, "paid_amount": amount, "received_amount": amount, "paid_to": acct,
		"reference_no": reference_no or "Payer payment", "reference_date": nowdate(), "references": refs,
		"remarks": f"{payer} payment" + (f" · deduction {deduction}: {deduction_reason}" if deduction else "")})
	pe.setup_party_account_field()
	pe.set_missing_values()
	pe.paid_to = acct
	if deduction:
		acc = setting("payer_deduction_account")
		if not acc:
			frappe.throw(_("Set Clinic Settings → Panels, Insurance & Welfare → deduction account."))
		from hospital_vvs.services.shifts import company_account

		pe.append("deductions", {"account": company_account(acc, company), "cost_center": frappe.get_cached_value("Company", company, "cost_center"), "amount": deduction,
			"description": deduction_reason})
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	return pe.name


# ------------------------------------------------------------------ insurance claims
def make_claim(source_doctype, source_name):
	"""Group the insurer's bills of an admission / visit into a Draft claim."""
	if source_doctype == "Bed Allotment":
		adm = frappe.db.get_value("Bed Allotment", source_name, ["patient", "payer", "payer_type", "pre_auth", "branch"], as_dict=True)
		insurer, patient, pre_auth, branch = adm.payer, adm.patient, adm.pre_auth, adm.branch
	else:
		src = frappe.get_doc(source_doctype, source_name)
		insurer, patient, pre_auth, branch = src.get("payer"), src.patient, None, src.get("branch")
	if not insurer:
		frappe.throw(_("{0} {1} has no insurer.").format(source_doctype, source_name))
	if frappe.db.exists("Insurance Claim", {"source_doctype": source_doctype, "source_name": source_name, "status": ["!=", "Rejected"]}):
		frappe.throw(_("A claim already exists for {0}.").format(source_name))
	invs = frappe.get_all("Sales Invoice", filters={"customer": insurer, "hv_patient": patient, "docstatus": 1, "hv_reference_doctype": source_doctype,
		"hv_reference_name": source_name, "is_return": 0}, fields=["name", "posting_date", "grand_total", "outstanding_amount", "hv_billing_type"])
	if not invs:
		frappe.throw(_("No insurer bill for {0} yet — post the final bill first.").format(source_name))
	c = frappe.get_doc({"doctype": "Insurance Claim", "insurer": insurer, "patient": patient, "pre_auth": pre_auth, "branch": branch, "source_doctype": source_doctype,
		"source_name": source_name, "status": "Draft", "policy_no": frappe.db.get_value("Patient", patient, "policy_no"),
		"invoices": [{"sales_invoice": i.name, "posting_date": i.posting_date, "amount": i.grand_total, "outstanding": i.outstanding_amount, "description": i.hv_billing_type} for i in invs]})
	c.claimed_amount = sum(flt(i.grand_total) for i in invs)
	c.insert(ignore_permissions=True)
	return c


FLOW = {"submit": ("Draft", "Under Query"), "query": ("Submitted",), "decide": ("Submitted", "Under Query"), "settle": ("Approved", "Partially Approved", "Rejected")}


def claim_action(name, action, **kw):
	c = frappe.get_doc("Insurance Claim", name)
	if c.status not in FLOW.get(action, ()):
		frappe.throw(_("Claim {0} is {1}; cannot {2}.").format(name, c.status, action))
	if action == "submit":
		c.status, c.submitted_on = "Submitted", today()
		c.claim_no = kw.get("claim_no") or c.claim_no
	elif action == "query":
		c.status, c.query_note = "Under Query", kw.get("note") or c.query_note
	elif action == "decide":
		approved = flt(kw.get("approved_amount"))
		if approved < 0 or approved > flt(c.claimed_amount) + 0.5:
			frappe.throw(_("Approved amount must be between 0 and the claimed amount."))
		c.approved_amount, c.decided_on = approved, today()
		c.status = "Rejected" if approved <= 0 else "Approved" if approved >= flt(c.claimed_amount) - 0.5 else "Partially Approved"
		c.deduction_amount = flt(c.claimed_amount) - approved
		c.deduction_reason = kw.get("reason") or c.deduction_reason
		if c.deduction_amount and not (c.deduction_reason or "").strip():
			frappe.throw(_("Give the insurer's reason for the deduction."))
	elif action == "settle":
		settle_claim(c, flt(kw.get("received_amount", c.approved_amount)), kw.get("mode_of_payment") or "Bank Transfer", kw.get("reference_no"))
		return c
	c.save(ignore_permissions=True)
	return c


def settle_claim(c, received, mode, reference_no=None):
	invs = [i.sales_invoice for i in c.invoices]
	left = flt(sum(flt(frappe.db.get_value("Sales Invoice", i, "outstanding_amount")) for i in invs))
	deduction = max(left - received, 0)
	to_patient = deduction > 0 and cint(setting("bill_rejected_to_patient"))
	pe = None
	if received > 0 or (deduction and not to_patient):
		pe = receive(c.insurer, received, mode, 0 if to_patient else deduction, c.deduction_reason or "Claim deduction", reference_no or c.claim_no, invs)
	je = None
	if to_patient:
		je = move_to_patient(c, deduction)
	c.received_amount, c.settled_on, c.status = received, today(), "Settled"
	c.payment_entry, c.journal_entry, c.rejected_to_patient = pe, je, 1 if to_patient else 0
	c.save(ignore_permissions=True)


def move_to_patient(c, amount):
	"""Disallowed claim amount: Dr the patient's account, Cr the insurer's (against the insurer bills), so the patient now owes it."""
	company = frappe.db.get_value("Sales Invoice", c.invoices[0].sales_invoice, "company")
	recv = frappe.get_cached_value("Company", company, "default_receivable_account")
	patient_customer = frappe.db.get_value("Patient", c.patient, "customer")
	accounts = [{"account": recv, "party_type": "Customer", "party": patient_customer, "debit_in_account_currency": amount}]
	left = amount
	for i in c.invoices:
		out = flt(frappe.db.get_value("Sales Invoice", i.sales_invoice, "outstanding_amount"))
		take = min(out, left)
		if take <= 0:
			continue
		accounts.append({"account": recv, "party_type": "Customer", "party": c.insurer, "credit_in_account_currency": take,
			"reference_type": "Sales Invoice", "reference_name": i.sales_invoice})
		left -= take
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": company, "posting_date": nowdate(),
		"user_remark": f"Claim {c.name}: disallowed {amount} billed to the patient ({c.deduction_reason or ''})", "accounts": accounts})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name


def ensure_setup():
	"""Customer groups for payers + a deduction account (idempotent)."""
	for g in (PANEL_GROUP, INSURANCE_GROUP, WELFARE_GROUP):
		ensure_group(g)
	s = frappe.get_single("Clinic Settings")
	company = s.company or frappe.defaults.get_global_default("company")
	if not company:
		return
	if not s.get("welfare_customer_group"):
		frappe.db.set_single_value("Clinic Settings", "welfare_customer_group", WELFARE_GROUP)
	if not s.get("payer_deduction_account"):
		acc = frappe.db.get_value("Account", {"company": company, "account_name": "Panel / Insurance Deductions", "is_group": 0})
		if not acc:
			parent = frappe.db.get_value("Account", {"company": company, "account_name": "Indirect Expenses", "is_group": 1})
			acc = frappe.get_doc({"doctype": "Account", "account_name": "Panel / Insurance Deductions", "parent_account": parent, "company": company,
				"account_type": "Expense Account", "root_type": "Expense"}).insert(ignore_permissions=True).name
		frappe.db.set_single_value("Clinic Settings", "payer_deduction_account", acc)
