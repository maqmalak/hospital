"""Phase 6a — doctor share (commission): rules, ledger, payout runs (07-billing-finance.md, D-43)."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb, tab
from hospital_vvs.roles import ACCOUNTANT, ADMIN, CASH_SUPERVISOR, DOCTOR, RECEPTIONIST, STORE_KEEPER

B = "Billing"
BILLING_TYPES = ["Any", "OPD Slip", "Fee", "Lab", "IPD Slip", "General"]

DOCTYPES = [
	doctype("Doctor Share Rule", B, [
		f("doctor", "Link", "Doctor", reqd=1, list=1, filter=1), f("doctor_name", "Data", fetch_from="doctor.doctor_name", ro=1, list=1),
		f("is_active", "Check", default="1", list=1, filter=1), cb("r1"),
		f("billing_type", "Select", BILLING_TYPES, default="Any", reqd=1, list=1, filter=1, description="OPD Slip = consultations, Lab = tests the doctor referred, IPD Slip = admission bills"),
		f("item_group", "Link", "Item Group", description="Optional: only services in this group"),
		f("item_code", "Link", "Item", description="Optional: only this service (most specific rule wins)"),
		sb("r2", "Commission"),
		f("share_type", "Select", ["Percent", "Fixed per unit"], default="Percent", reqd=1, list=1),
		f("value", "Float", reqd=1, list=1, label="Percent / Rs per unit"),
		f("basis", "Select", ["Net of discount", "Gross"], default="Net of discount", description="Percent of the line after its share of the bill discount, or before"),
		cb("r3"), f("from_date", "Date"), f("to_date", "Date"), f("branch", "Link", "Branch", description="Empty = all branches"),
		f("note", "Small Text"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(ACCOUNTANT, "rwcd"), p(CASH_SUPERVISOR, "r")],
		autoname="DSR-.#####", track_changes=1, title_field="doctor_name", search_fields="doctor,billing_type"),

	doctype("Doctor Share Ledger", B, [
		f("posting_date", "Date", list=1, filter=1), f("doctor", "Link", "Doctor", reqd=1, list=1, filter=1),
		f("doctor_name", "Data", fetch_from="doctor.doctor_name", ro=1), f("supplier", "Link", "Supplier", ro=1),
		f("entry_type", "Select", ["Earned", "Reversed"], list=1, filter=1), cb("l1"),
		f("amount", "Currency", list=1, description="Positive = owed to the doctor; negative = taken back (refund / cancelled payment)"),
		f("status", "Select", ["Unpaid", "Paid"], default="Unpaid", list=1, filter=1), f("payout", "Link", "Doctor Share Payout", ro=1),
		sb("l2", "Source"),
		f("sales_invoice", "Link", "Sales Invoice", list=1), f("invoice_item", "Data", ro=1, description="Sales Invoice Item row"),
		f("item_code", "Link", "Item"), f("item_name", "Data"), f("billing_type", "Data", filter=1), cb("l3"),
		f("patient", "Link", "Patient"), f("branch", "Link", "Branch", filter=1), f("company", "Link", "Company"),
		f("line_amount", "Currency", label="Line amount (basis)"), f("earned_fraction", "Percent", description="Share of the bill paid when this entry was made"),
		f("rule", "Link", "Doctor Share Rule"), f("journal_entry", "Link", "Journal Entry", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "r"), p(ACCOUNTANT, "rR"), p(CASH_SUPERVISOR, "r")],
		autoname="DSL-.YYYY.-.######", in_create=1, sort_field="creation", sort_order="DESC"),

	doctype("Doctor Share Payout Item", B, [
		f("ledger", "Link", "Doctor Share Ledger", reqd=1, list=1, columns=2), f("posting_date", "Date", list=1, columns=1),
		f("sales_invoice", "Link", "Sales Invoice", list=1, columns=2), f("patient", "Link", "Patient", columns=1),
		f("item_name", "Data", list=1, columns=2), f("amount", "Currency", list=1, columns=2),
	], istable=1),
	doctype("Doctor Share Payout", B, [
		f("doctor", "Link", "Doctor", reqd=1, list=1, filter=1), f("doctor_name", "Data", fetch_from="doctor.doctor_name", ro=1, list=1),
		f("supplier", "Link", "Supplier", ro=1), f("company", "Link", "Company", reqd=1), cb("p1"),
		f("from_date", "Date", list=1), f("to_date", "Date", list=1), f("branch", "Link", "Branch", filter=1),
		sb("p2", "Payment"),
		f("total_amount", "Currency", ro=1, list=1), f("mode_of_payment", "Link", "Mode of Payment", reqd=1), f("reference_no", "Data", label="Cheque / transaction no."),
		cb("p3"), f("payment_date", "Date"), f("payment_entry", "Link", "Payment Entry", ro=1), f("approved_by", "Link", "User", ro=1),
		f("status", "Select", ["Draft", "Paid", "Cancelled"], default="Draft", ro=1, list=1, filter=1),
		sb("p4", "Entries"), f("items", "Table", "Doctor Share Payout Item"), f("remarks", "Small Text"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdsxR"), p(ACCOUNTANT, "rwcdsxR"), p(CASH_SUPERVISOR, "r")],
		autoname="DSP-.YYYY.-.#####", is_submittable=1, track_changes=1, title_field="doctor_name"),
]

# ------------------------------------------------------------------ welfare / zakat
DOCTYPES += [
	doctype("Welfare Scheme", B, [
		f("scheme_name", "Data", reqd=1, unique=1, list=1), f("fund_type", "Select", ["Welfare", "Zakat", "Donor-specific"], default="Welfare", reqd=1, list=1, filter=1),
		f("is_active", "Check", default="1", list=1), cb("w1"),
		f("fund_customer", "Link", "Customer", ro=1, description="The fund's account: covered shares are invoiced here, donations are received here"),
		f("approval_required", "Check", default="1", description="The patient needs an approved Welfare Approval before the scheme pays"),
		sb("w2", "Coverage"),
		f("coverage_percent", "Percent", reqd=1, default="100", list=1), f("covered_billing_types", "Small Text", default="OPD Slip\nLab\nIPD Slip",
			description="One per line: OPD Slip, Lab, IPD Slip, Fee, General. Empty = all"),
		cb("w3"), f("cap_per_visit", "Currency", description="Most the fund pays on one bill (0 = no cap)"),
		f("cap_per_month", "Currency", description="Most the fund pays for one patient in a calendar month (0 = no cap)"),
		f("description", "Small Text"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(ACCOUNTANT, "rwc"), p(RECEPTIONIST, "r"), p(CASH_SUPERVISOR, "r")],
		autoname="field:scheme_name", track_changes=1),
	doctype("Welfare Approval", B, [
		f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
		f("scheme", "Link", "Welfare Scheme", reqd=1, list=1, filter=1), cb("a1"),
		f("status", "Select", ["Pending", "Approved", "Rejected", "Expired"], default="Pending", list=1, filter=1),
		f("valid_from", "Date", default="Today"), f("valid_till", "Date", list=1),
		sb("a2", "Assessment"), f("notes", "Small Text", description="Why the patient qualifies (the clinic's own rules, D-46)"), f("documents", "Attach"),
		cb("a3"), f("requested_by", "Link", "User", ro=1), f("approved_by", "Link", "User", ro=1), f("approved_on", "Datetime", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(ACCOUNTANT, "rw"), p(RECEPTIONIST, "rc")],
		autoname="WA-.YYYY.-.#####", track_changes=1, title_field="patient_name"),

	# ------------------------------------------------------------------ insurance claims
	doctype("Insurance Claim Invoice", B, [
		f("sales_invoice", "Link", "Sales Invoice", reqd=1, list=1, columns=3), f("posting_date", "Date", list=1, columns=2),
		f("amount", "Currency", list=1, columns=2), f("outstanding", "Currency", list=1, columns=2), f("description", "Data", list=1, columns=1),
	], istable=1),
	doctype("Insurance Claim", B, [
		f("insurer", "Link", "Customer", reqd=1, list=1, filter=1), f("patient", "Link", "Patient", reqd=1, list=1, filter=1),
		f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1), cb("c1"),
		f("status", "Select", ["Draft", "Submitted", "Under Query", "Approved", "Partially Approved", "Rejected", "Settled"], default="Draft", list=1, filter=1),
		f("claim_no", "Data", label="Insurer claim no."), f("policy_no", "Data"), f("pre_auth", "Link", "Insurance Pre-Auth"),
		f("source_doctype", "Link", "DocType"), f("source_name", "Dynamic Link", "source_doctype", label="Admission / visit"), f("branch", "Link", "Branch", filter=1),
		sb("c2", "Amounts"),
		f("claimed_amount", "Currency", ro=1, list=1), f("approved_amount", "Currency", list=1), f("received_amount", "Currency", ro=1), cb("c3"),
		f("deduction_amount", "Currency", ro=1), f("deduction_reason", "Small Text"),
		f("rejected_to_patient", "Check", ro=1, description="The disallowed amount was moved to the patient's account"),
		sb("c4", "Progress"), f("submitted_on", "Date", ro=1), f("query_note", "Small Text"), f("decided_on", "Date", ro=1), f("settled_on", "Date", ro=1),
		f("payment_entry", "Link", "Payment Entry", ro=1), f("journal_entry", "Link", "Journal Entry", ro=1),
		sb("c5", "Bills and documents"), f("invoices", "Table", "Insurance Claim Invoice"), f("documents", "Small Text", description="File links: discharge summary, lab reports, bills"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(ACCOUNTANT, "rwcR"), p(RECEPTIONIST, "r")],
		autoname="CLM-.YYYY.-.#####", track_changes=1, title_field="patient_name"),

	# ------------------------------------------------------------------ expenses
	doctype("Expense Category", B, [
		f("category_name", "Data", reqd=1, unique=1, list=1), f("expense_account", "Link", "Account", reqd=1, list=1), f("cost_center", "Link", "Cost Center"),
		f("is_active", "Check", default="1", list=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(ACCOUNTANT, "rwcd"), p(CASH_SUPERVISOR, "r"), p(STORE_KEEPER, "r")],
		autoname="field:category_name"),
	doctype("Expense Approval", B, [
		f("level", "Int", list=1, columns=1), f("role", "Link", "Role", list=1, columns=2), f("approver", "Link", "User", list=1, columns=3),
		f("action", "Select", ["", "Approved", "Rejected"], list=1, columns=2), f("acted_on", "Datetime", list=1, columns=2), f("note", "Data", columns=2),
	], istable=1),
	doctype("Expense", B, [
		f("category", "Link", "Expense Category", reqd=1, list=1, filter=1), f("amount", "Currency", reqd=1, list=1), f("posting_date", "Date", default="Today", list=1),
		f("branch", "Link", "Branch", filter=1), cb("e1"),
		f("payee", "Data", reqd=1, list=1), f("mode_of_payment", "Link", "Mode of Payment", reqd=1), f("reference_no", "Data", label="Bill / transaction no."),
		f("status", "Select", ["Draft", "Pending Approval", "Approved", "Rejected"], default="Draft", list=1, filter=1), f("current_level", "Int", ro=1),
		sb("e2", "Details"), f("description", "Small Text", reqd=1), f("receipt", "Attach", label="Receipt / bill"), cb("e3"),
		f("requested_by", "Link", "User", ro=1), f("journal_entry", "Link", "Journal Entry", ro=1), f("company", "Link", "Company"),
		sb("e4", "Approvals"), f("approvals", "Table", "Expense Approval"),
		f("recurring_expense", "Link", "Recurring Expense", ro=1, filter=1, description="Drafted automatically from this template"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(ACCOUNTANT, "rwcR"), p(CASH_SUPERVISOR, "rwc"), p(STORE_KEEPER, "rc"), p(RECEPTIONIST, "rc")],
		autoname="EXP-.YYYY.-.#####", track_changes=1, sort_field="creation", sort_order="DESC"),
	doctype("Recurring Expense", B, [
		f("title", "Data", reqd=1, list=1), f("category", "Link", "Expense Category", reqd=1, list=1, filter=1), f("amount", "Currency", reqd=1, list=1),
		f("payee", "Data", reqd=1), f("mode_of_payment", "Link", "Mode of Payment", reqd=1), f("branch", "Link", "Branch", filter=1), cb("re1"),
		f("frequency", "Select", ["Monthly", "Weekly", "Quarterly", "Yearly"], default="Monthly", reqd=1, list=1),
		f("next_date", "Date", reqd=1, list=1, description="Date of the next expense; moves forward after each one is drafted"),
		f("end_date", "Date", description="Stop after this date (empty = no end)"), f("is_active", "Check", default="1", list=1, filter=1),
		sb("re2", "Bill"), f("description", "Small Text", reqd=1, description="Copied to every expense with the period added"),
		f("receipt", "Attach", label="Standing bill / agreement", description="Used as the receipt when the monthly bill does not change (e.g. rent agreement)"), cb("re3"),
		f("auto_submit", "Check", label="Send for approval automatically", description="Needs the standing bill; otherwise the expense waits as a draft for its bill"),
		f("requested_by", "Link", "User", description="Who the draft belongs to and who is told"), f("last_expense", "Link", "Expense", ro=1), f("last_run", "Date", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(ACCOUNTANT, "rwcd"), p(CASH_SUPERVISOR, "r")],
		autoname="REX-.#####", title_field="title"),
	doctype("Expense Approval Level", B, [
		f("level", "Int", reqd=1, list=1, columns=2), f("role", "Link", "Role", reqd=1, list=1, columns=4), f("min_amount", "Currency", list=1, columns=4,
			description="This level is needed when the expense is at least this amount"),
	], istable=1),
]

# ------------------------------------------------------------------ online card payments & FBR (D-47)
DOCTYPES += [
	doctype("Online Payment", B, [
		f("reference_doctype", "Link", "DocType", reqd=1, list=1, filter=1), f("reference_name", "Dynamic Link", "reference_doctype", reqd=1, list=1),
		f("patient", "Link", "Patient", list=1), f("description", "Data"), cb("o1"),
		f("amount", "Currency", reqd=1, list=1), f("status", "Select", ["Initiated", "Paid", "Failed", "Cancelled", "Refunded"], default="Initiated", list=1, filter=1),
		f("provider", "Data", ro=1, list=1), f("gateway_mode", "Data", ro=1, label="Mode"),
		sb("o2", "Gateway"), f("provider_ref", "Data", ro=1, label="Gateway transaction id"), f("paid_at", "Datetime", ro=1), f("error", "Small Text", ro=1),
		cb("o3"), f("sales_invoice", "Link", "Sales Invoice", ro=1), f("payment_entry", "Link", "Payment Entry", ro=1), f("return_url", "Data", ro=1),
		f("token_hash", "Data", hidden=1, search_index=1), f("expires_at", "Datetime", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rR"), p(ACCOUNTANT, "rR"), p(CASH_SUPERVISOR, "r"), p(RECEPTIONIST, "r")],
		autoname="OPAY-.YYYY.-.######", track_changes=1, sort_field="creation", sort_order="DESC"),
	doctype("FBR Invoice", B, [
		f("sales_invoice", "Link", "Sales Invoice", reqd=1, unique=1, list=1), f("company", "Link", "Company", filter=1), f("posting_date", "Date", list=1, filter=1),
		f("billing_type", "Data", filter=1), cb("fb1"),
		f("status", "Select", ["Pending", "Reported", "Failed", "Skipped"], default="Pending", list=1, filter=1), f("fbr_invoice_no", "Data", ro=1, list=1, label="FBR invoice no."),
		f("is_return", "Check", ro=1), f("amount", "Currency", ro=1, list=1), f("tax", "Currency", ro=1),
		sb("fb2", "Reporting"), f("attempts", "Int", ro=1), f("reported_at", "Datetime", ro=1), f("batch", "Data", ro=1, description="Day-end run"), f("gateway_mode", "Data", ro=1, label="Mode"),
		f("last_error", "Small Text", ro=1), f("request", "Code", ro=1, options="JSON"), f("response", "Code", ro=1, options="JSON"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rR"), p(ACCOUNTANT, "rR"), p(CASH_SUPERVISOR, "r")],
		autoname="FBR-.YYYY.-.######", in_create=1, sort_field="creation", sort_order="DESC"),
]

SETTINGS_FIELDS = [
	tab("doctor_share_tab", "Doctor Share"),
	f("doctor_share_expense_account", "Link", "Account", label="Doctor Share Expense Account", description="Debited when commission is earned (the doctor's supplier account is credited)"),
	f("doctor_supplier_group", "Link", "Supplier Group", description="New doctor suppliers go into this group"),
	cb("dsh1"),
	f("doctor_share_on_payer_bills", "Check", default="1", label="Share on Panel / Insurance Bills", description="Commission also on the payer's part of a split bill (earned when the payer pays)"),
	tab("payers_tab", "Panels, Insurance & Welfare"),
	f("payer_deduction_account", "Link", "Account", description="Panel / insurance deductions and write-offs are booked here"),
	f("bill_rejected_to_patient", "Check", label="Rejected Claim Amount Billed to Patient", description="On settling a claim, the disallowed part moves to the patient's account instead of being written off"),
	cb("pw1"), f("welfare_customer_group", "Link", "Customer Group", description="Group for welfare / zakat fund accounts"),
	tab("gateway_tab", "Online Card Payments"),
	f("card_gateway_enabled", "Check", label="Online Card Payments", description="Patients can pay online visit fees and bills by card through a payment link"),
	f("card_gateway_provider", "Select", ["Mock (testing)", "PayFast", "JazzCash Card", "Easypaisa Card", "HBL Pay", "Stripe", "Other"], default="Mock (testing)", label="Gateway",
		description="Owner decides later; until then Mock simulates payments. Keys for a real gateway go in site_config.json (card_gateway_key / card_gateway_secret / card_gateway_merchant_id)"),
	f("card_gateway_mode", "Select", ["Mock", "Sandbox", "Live"], default="Mock"), cb("cg1"),
	f("card_gateway_account", "Link", "Account", label="Gateway Clearing Account", description="Card money is received here until the gateway settles to the bank"),
	f("card_link_hours", "Int", default="48", label="Payment Link Valid (hours)"),
	f("card_gateway_branch", "Link", "Branch", description="Branch whose books get online card payments"),
	tab("fbr_tab", "FBR"),
	f("fbr_enabled", "Check", label="Report Invoices to FBR", description="Day-end batch: every submitted invoice in scope is sent to FBR once; the FBR number is printed on reprints"),
	f("fbr_mode", "Select", ["Mock", "Sandbox", "Production"], default="Mock", description="Mock gives test FBR numbers; Sandbox / Production need fbr_token in site_config.json"),
	f("fbr_pos_id", "Data", label="FBR POS ID"), f("fbr_ntn", "Data", label="Seller NTN"), cb("fbr1"),
	f("fbr_billing_types", "Small Text", default="Medicine", description="One per line (Medicine, OPD Slip, Lab, IPD Slip, Fee, General). Empty = all"),
	f("fbr_companies", "Small Text", description="One company per line; empty = all"),
	f("fbr_run_time", "Time", default="23:30:00", label="Day-end Run Time"),
	tab("expense_tab", "Expenses"),
	f("expense_levels", "Table", "Expense Approval Level", description="Approvals needed by amount; e.g. level 1 Cash Supervisor from 0, level 2 Accountant from 10,000, level 3 Admin from 50,000"),
]


def all_doctypes():
	return DOCTYPES
