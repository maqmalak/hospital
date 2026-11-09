"""Phase 6a — doctor share (commission): rules, ledger, payout runs (07-billing-finance.md, D-43)."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb, tab
from hospital_vvs.roles import ACCOUNTANT, ADMIN, CASH_SUPERVISOR, DOCTOR

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

SETTINGS_FIELDS = [
	tab("doctor_share_tab", "Doctor Share"),
	f("doctor_share_expense_account", "Link", "Account", label="Doctor Share Expense Account", description="Debited when commission is earned (the doctor's supplier account is credited)"),
	f("doctor_supplier_group", "Link", "Supplier Group", description="New doctor suppliers go into this group"),
	cb("dsh1"),
	f("doctor_share_on_payer_bills", "Check", default="1", label="Share on Panel / Insurance Bills", description="Commission also on the payer's part of a split bill (earned when the payer pays)"),
]


def all_doctypes():
	return DOCTYPES
