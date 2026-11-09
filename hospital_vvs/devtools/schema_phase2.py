"""Phase 2: Cash (counters, shifts, movements, closing), Lab, Pharmacy (tickets, displays, controlled drugs, cycle counts)."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb, tab
from hospital_vvs.roles import (
	ACCOUNTANT, ADMIN, CASH_SUPERVISOR, DEO, DISPENSER, DOCTOR, FINDER, LAB_USER, NURSE, PATHOLOGIST, PHARMACY_CASHIER, RECEPTIONIST,
	REVIEWER, STORE_KEEPER,
)

CASH = "Cash"
LAB = "Lab"
PH = "Pharmacy"
MONEY = [RECEPTIONIST, LAB_USER, PHARMACY_CASHIER, DISPENSER]
PAY_MODES = ["Cash", "Card", "Bank Transfer", "JazzCash", "Easypaisa"]

# ------------------------------------------------------------------ Cash
CASH_DT = [
	doctype("Counter", CASH, [
		f("counter_name", "Data", reqd=1, unique=1, list=1), f("branch", "Link", "Branch", reqd=1, list=1, filter=1),
		f("counter_type", "Select", ["Reception", "Lab", "Pharmacy Billing", "Pharmacy Handover", "IPD Desk", "General"], reqd=1, list=1, filter=1),
		f("billing_type", "Select", ["OPD Slip", "Fee", "Lab", "Medicine", "General", "IPD Slip"], description="Main billing type (income account of the counter's POS Profile)"),
		cb("c1"),
		f("pos_profile", "Link", "POS Profile", ro=1, description="Created automatically — one open shift per counter"),
		f("display_device", "Link", "Display Device"), f("number", "Int", description="Shown on queue displays: 'counter 3'"),
		f("is_active", "Check", default="1"), f("current_user", "Link", "User", ro=1), f("open_shift", "Link", "POS Opening Entry", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd")] + [p(r, "r") for r in MONEY + [CASH_SUPERVISOR, ACCOUNTANT, FINDER, REVIEWER]],
		autoname="field:counter_name", track_changes=1, sort_field="counter_name", sort_order="ASC"),
	doctype("Cash Movement", CASH, [
		f("shift", "Link", "POS Opening Entry", reqd=1, list=1, filter=1), f("counter", "Link", "Counter", list=1, filter=1),
		f("branch", "Link", "Branch", filter=1), f("user", "Link", "User", list=1),
		cb("m1"),
		f("movement_type", "Select", ["Pay In", "Pay Out", "Cash Drop"], reqd=1, list=1, filter=1), f("amount", "Currency", reqd=1, list=1),
		f("reason", "Small Text", reqd=1), f("receipt", "Attach"),
		cb("m2"),
		f("status", "Select", ["Posted", "Pending Confirmation", "Confirmed", "Rejected"], default="Posted", list=1, filter=1),
		f("account", "Link", "Account", description="Other side of the entry (expense, safe …)"), f("confirmed_by", "Link", "User", ro=1),
		f("confirmed_on", "Datetime", ro=1), f("journal_entry", "Link", "Journal Entry", ro=1), f("refund_invoice", "Link", "Sales Invoice"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(CASH_SUPERVISOR, "rwR"), p(ACCOUNTANT, "rR")] + [p(r, "rc") for r in MONEY],
		autoname="CM-.YYYY.-.#####", track_changes=1),
	doctype("Cash Denomination Count", CASH, [
		f("denomination", "Currency", list=1, columns=3), f("count", "Int", list=1, columns=3), f("amount", "Currency", ro=1, list=1, columns=4),
	], istable=1),
	doctype("Shift Closing Mode", CASH, [
		f("mode_of_payment", "Link", "Mode of Payment", list=1, columns=2), f("opening", "Currency", list=1, columns=1),
		f("collections", "Currency", list=1, columns=1), f("pay_in", "Currency", columns=1), f("pay_out", "Currency", columns=1),
		f("cash_drop", "Currency", columns=1), f("expected", "Currency", list=1, columns=1), f("counted", "Currency", list=1, columns=1),
		f("difference", "Currency", list=1, columns=1),
	], istable=1),
	doctype("Shift Closing", CASH, [
		f("opening_entry", "Link", "POS Opening Entry", reqd=1, list=1), f("counter", "Link", "Counter", list=1, filter=1),
		f("branch", "Link", "Branch", filter=1), f("user", "Link", "User", list=1, filter=1),
		cb("s1"),
		f("period_start", "Datetime"), f("period_end", "Datetime"),
		f("status", "Select", ["Draft", "Balanced", "Within Tolerance", "Pending Approval", "Recount", "Approved", "Liability Recorded"],
			default="Draft", list=1, filter=1),
		sb("s2", "Count"), f("denominations", "Table", "Cash Denomination Count"), f("modes", "Table", "Shift Closing Mode"),
		sb("s3", "Result"), f("total_expected", "Currency", ro=1), f("total_counted", "Currency", ro=1), cb("s4"),
		f("difference", "Currency", ro=1, list=1), f("explanation", "Small Text"),
		sb("s5", "Supervisor"), f("supervisor", "Link", "User", ro=1), f("decided_on", "Datetime", ro=1), cb("s6"),
		f("decision_note", "Small Text"), f("journal_entry", "Link", "Journal Entry", ro=1), f("pos_closing_entry", "Link", "POS Closing Entry", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(CASH_SUPERVISOR, "rwR"), p(ACCOUNTANT, "rR")] + [p(r, "rc") for r in MONEY],
		autoname="SC-.YYYY.-.#####", track_changes=1),
]

# ------------------------------------------------------------------ Lab
SAMPLE_TYPES = ["Blood (EDTA)", "Serum", "Plasma (Citrate)", "Plasma (Fluoride)", "Urine", "Stool", "Swab", "Sputum", "CSF", "Other"]
CONTAINERS = ["Purple top (EDTA)", "Yellow/Red top (Serum)", "Blue top (Citrate)", "Grey top (Fluoride)", "Urine cup", "Stool container", "Swab tube", "Sterile container", "Other"]
LAB_DEPTS = ["Hematology", "Chemistry", "Serology", "Immunology", "Hormones", "Microbiology", "Urine & Stool", "Histopathology", "Other"]
_lab_perm = [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(LAB_USER, "rwc"), p(PATHOLOGIST, "rw"), p(DOCTOR, "r"), p(RECEPTIONIST, "rc"), p(NURSE, "r"), p(DEO, "r")]

LAB_DT = [
	doctype("Lab Test Parameter", LAB, [
		f("parameter", "Data", reqd=1, list=1, columns=2), f("unit", "Data", list=1, columns=1),
		f("gender", "Select", ["All", "Male", "Female"], default="All", list=1, columns=1), f("age_from", "Float", columns=1), f("age_to", "Float", columns=1),
		f("normal_low", "Float", list=1, columns=1), f("normal_high", "Float", list=1, columns=1),
		f("critical_low", "Float", columns=1), f("critical_high", "Float", columns=1), f("normal_text", "Data", columns=1),
		f("decimals", "Int", default="1"), f("analyzer_code", "Data"),
	], istable=1),
	doctype("Lab Template Consumable", LAB, [f("item", "Link", "Item", reqd=1, list=1), f("qty", "Float", default="1", list=1)], istable=1),
	doctype("Lab Test Template", LAB, [
		f("test_name", "Data", reqd=1, unique=1, list=1), f("test_code", "Data", reqd=1, unique=1, list=1),
		f("department", "Select", LAB_DEPTS, list=1, filter=1), cb("t1"),
		f("sample_type", "Select", SAMPLE_TYPES, list=1, filter=1), f("container", "Select", CONTAINERS), f("volume", "Data"),
		cb("t2"), f("tat_hours", "Float", default="24", label="Turnaround (hours)", list=1), f("price", "Currency", list=1),
		f("item", "Link", "Item", ro=1, description="Created automatically from the code"), f("is_active", "Check", default="1"),
		sb("t3", "Result"), f("result_type", "Select", ["Numeric", "Text", "Both"], default="Numeric"), f("method", "Data"),
		f("parameters", "Table", "Lab Test Parameter"), f("text_template", "Text", description="Starting text for text reports"),
		sb("t4", "Outsourcing & automation", collapsible=1), f("outsourced", "Check"), f("reference_lab", "Link", "Supplier"),
		f("outsource_cost", "Currency"), cb("t5"), f("auto_verify", "Check", description="May auto-verify when every value is normal (setting)"),
		f("consumables", "Table", "Lab Template Consumable"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(PATHOLOGIST, "rwc"), p(LAB_USER, "r"), p(DOCTOR, "r"), p(RECEPTIONIST, "r")],
		autoname="field:test_name", track_changes=1, search_fields="test_code,department", sort_field="test_name", sort_order="ASC"),
	doctype("Test Invoice Item", LAB, [
		f("template", "Link", "Lab Test Template", reqd=1, list=1, columns=3), f("test_code", "Data", ro=1),
		f("sample_type", "Data", ro=1, list=1, columns=2), f("price", "Currency", list=1, columns=1),
		f("status", "Select", ["Ordered", "Collected", "Received", "Result Entered", "Verified", "Released", "Rejected", "Cancelled", "Dispatched",
			"Report Received"], default="Ordered", list=1, columns=2),
		f("sample", "Link", "Lab Sample", ro=1), f("result", "Link", "Lab Result", ro=1, list=1, columns=2), f("outsourced", "Check", ro=1),
		f("tat_hours", "Float", ro=1),
	], istable=1),
	doctype("Test Invoice", LAB, [
		f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
		f("branch", "Link", "Branch", reqd=1, filter=1), f("company", "Link", "Company", ro=1), cb("ti1"),
		f("posting_date", "Date", default="Today", list=1, filter=1), f("referring_doctor", "Link", "Doctor"), f("external_referrer", "Data"),
		f("priority", "Select", ["Routine", "Urgent"], default="Routine", list=1), cb("ti2"),
		f("status", "Select", ["Draft", "Ordered", "Paid", "In Progress", "Partially Released", "Released", "Cancelled"], default="Draft", list=1, filter=1),
		f("prescription", "Link", "Prescription"), f("opd_slip", "Link", "OPD Slip"), f("expected_at", "Datetime", ro=1),
		sb("ti3", "Tests"), f("items", "Table", "Test Invoice Item"),
		sb("ti4", "Bill"), f("gross_total", "Currency", ro=1), f("discount_amount", "Currency"), f("discount_authorization", "Link", "Discount Authorization", ro=1),
		f("net_total", "Currency", ro=1), cb("ti5"),
		f("payer_type", "Select", ["Patient", "Panel", "Insurance", "Welfare"], default="Patient"), f("payer", "Link", "Customer"),
		f("payer_share", "Currency", ro=1), f("patient_share", "Currency", ro=1), cb("ti6"),
		f("payment_mode", "Select", PAY_MODES, default="Cash"), f("cash_tendered", "Currency"),
		f("sales_invoice", "Link", "Sales Invoice", ro=1), f("payer_invoice", "Link", "Sales Invoice", ro=1), f("pos_opening_entry", "Link", "POS Opening Entry", ro=1, label="Cashier Shift"),
		sb("ti7", "Report", collapsible=1), f("whatsapp_opt_in", "Check", default="1"), f("whatsapp_number", "Data"), cb("ti8"),
		f("released_at", "Datetime", ro=1), f("report_version", "Int", ro=1), f("client_ref", "Data", hidden=1, unique=1, no_copy=1),
		sb("ti9", "Admission", collapsible=1), f("bed_allotment", "Link", "Bed Allotment", label="Admission"), cb("ti10"), f("er_visit", "Link", "ER Visit"),
		f("bill_to_admission", "Check", ro=1, description="Charged on the admission / ER running bill, not at the lab counter"),
	], _lab_perm + [p(CASH_SUPERVISOR, "r"), p(ACCOUNTANT, "rR")], autoname="LAB-.YYYY.-.#####", track_changes=1, title_field="patient_name"),
	doctype("Lab Sample Test", LAB, [
		f("template", "Link", "Lab Test Template", list=1, columns=4), f("test_code", "Data", list=1, columns=2), f("invoice_item", "Data", hidden=1),
	], istable=1),
	doctype("Lab Sample", LAB, [
		f("test_invoice", "Link", "Test Invoice", reqd=1, list=1, filter=1), f("patient", "Link", "Patient", list=1),
		f("patient_name", "Data", ro=1, list=1), f("branch", "Link", "Branch", filter=1), cb("ls1"),
		f("sample_type", "Data", list=1, filter=1), f("container", "Data"),
		f("status", "Select", ["Pending", "Collected", "Received", "Rejected", "Dispatched"], default="Pending", list=1, filter=1),
		f("tests", "Table", "Lab Sample Test"),
		sb("ls2", "Tracking"), f("collected_by", "Link", "User", ro=1), f("collected_at", "Datetime", ro=1), cb("ls3"),
		f("received_by", "Link", "User", ro=1), f("received_at", "Datetime", ro=1), f("location", "Data"),
		sb("ls4", "Rejection"), f("rejection_reason", "Select", ["", "Hemolysed", "Clotted", "Insufficient", "Wrong container", "Unlabeled", "Other"]),
		f("rejection_note", "Small Text"), cb("ls5"), f("recollect_of", "Link", "Lab Sample", ro=1), f("recollect_sample", "Link", "Lab Sample", ro=1),
		f("dispatch", "Link", "Outsourced Dispatch", ro=1),
	], _lab_perm, autoname="S.YY.MM.DD.####", track_changes=1, title_field="patient_name"),
	doctype("Lab Result Value", LAB, [
		f("parameter", "Data", list=1, columns=2), f("value", "Data", list=1, columns=1), f("unit", "Data", list=1, columns=1),
		f("normal_range", "Data", ro=1, list=1, columns=2), f("flag", "Data", ro=1, list=1, columns=1),
		f("normal_low", "Float", hidden=1), f("normal_high", "Float", hidden=1), f("critical_low", "Float", hidden=1), f("critical_high", "Float", hidden=1),
		f("normal_text", "Data", hidden=1), f("previous_value", "Data", ro=1, list=1, columns=1), f("previous_date", "Date", ro=1, columns=1),
	], istable=1),
	doctype("Lab Result", LAB, [
		f("test_invoice", "Link", "Test Invoice", reqd=1, list=1, filter=1), f("invoice_item", "Data", hidden=1),
		f("template", "Link", "Lab Test Template", reqd=1, list=1, filter=1), f("test_name", "Data", ro=1),
		f("department", "Data", ro=1, filter=1), cb("lr1"),
		f("patient", "Link", "Patient", reqd=1, list=1), f("patient_name", "Data", ro=1, list=1), f("gender", "Data", ro=1), f("age", "Float", ro=1),
		f("sample", "Link", "Lab Sample"), f("branch", "Link", "Branch", filter=1), cb("lr2"),
		f("status", "Select", ["Draft", "Result Entered", "Sent Back", "Verified", "Superseded", "Cancelled"], default="Draft", ro=1, list=1, filter=1),
		f("version_no", "Int", default="1", ro=1), f("has_critical", "Check", ro=1, list=1), f("critical_logged", "Check", ro=1),
		sb("lr3", "Result"), f("result_type", "Data", ro=1), f("values", "Table", "Lab Result Value"), f("text_result", "Text Editor"),
		f("attachment", "Attach", description="Outsourced report PDF"),
		sb("lr4", "Sign-off"), f("entered_by", "Link", "User", ro=1), f("entered_at", "Datetime", ro=1), cb("lr5"),
		f("verified_by", "Link", "User", ro=1), f("verified_at", "Datetime", ro=1), f("interpretation", "Small Text"),
		f("send_back_reason", "Small Text"), f("amendment_reason", "Small Text"),
	], [p("System Manager", "rwcdsxa"), p(ADMIN, "rwcdsxaR"), p(LAB_USER, "rwc"), p(PATHOLOGIST, "rwcsxa"), p(DOCTOR, "r"), p(NURSE, "r")],
		autoname="LR-.YYYY.-.######", is_submittable=1, track_changes=1, title_field="test_name"),
	doctype("Critical Value Log", LAB, [
		f("lab_result", "Link", "Lab Result", reqd=1, list=1), f("patient", "Link", "Patient", list=1), f("parameter", "Data", list=1),
		f("value", "Data", list=1), f("flag", "Data"), cb("cv1"),
		f("doctor", "Link", "Doctor"), f("notified_person", "Data", reqd=1), f("method", "Select", ["Phone", "In person", "Message"], reqd=1),
		f("read_back", "Check", label="Read-back confirmed"), f("notified_by", "Link", "User", ro=1), f("notified_at", "Datetime", ro=1), f("note", "Small Text"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rR"), p(LAB_USER, "rc"), p(PATHOLOGIST, "rc"), p(DOCTOR, "r")], autoname="CVL-.YYYY.-.#####", track_changes=1),
	doctype("Outsourced Dispatch Item", LAB, [
		f("sample", "Link", "Lab Sample", list=1, columns=2), f("test_invoice", "Link", "Test Invoice", list=1, columns=2),
		f("patient_name", "Data", list=1, columns=2), f("tests", "Data", list=1, columns=2), f("received", "Check", list=1, columns=1),
		f("result", "Link", "Lab Result", columns=1),
	], istable=1),
	doctype("Outsourced Dispatch", LAB, [
		f("reference_lab", "Link", "Supplier", reqd=1, list=1, filter=1), f("branch", "Link", "Branch", reqd=1),
		f("dispatch_date", "Date", default="Today", list=1), cb("od1"), f("courier", "Data"), f("expected_back", "Date"),
		f("status", "Select", ["Dispatched", "Partially Received", "Received"], default="Dispatched", list=1, filter=1),
		f("samples", "Table", "Outsourced Dispatch Item"), f("total_cost", "Currency", ro=1), f("purchase_invoice", "Link", "Purchase Invoice", ro=1),
	], _lab_perm, autoname="OD-.YYYY.-.####", track_changes=1),
	doctype("Lab Report Access Token", LAB, [
		f("test_invoice", "Link", "Test Invoice", reqd=1, list=1), f("patient", "Link", "Patient", list=1), f("token_hash", "Data", hidden=1, search_index=1),
		f("version", "Int"), cb("tk1"), f("expires_at", "Datetime", list=1), f("max_downloads", "Int"), f("download_count", "Int", list=1),
		f("failed_attempts", "Int"), f("locked_until", "Datetime"), cb("tk2"), f("verified", "Check"), f("revoked", "Check", list=1, filter=1),
		f("created_by", "Link", "User"), f("last_accessed_at", "Datetime"), f("last_ip", "Data"), f("access_log", "Small Text"),
	], [p("System Manager", "rwcd"), p(ADMIN, "r"), p(LAB_USER, "r")], autoname="hash", sort_field="creation"),
]

# ------------------------------------------------------------------ Pharmacy
_ph_staff = [PHARMACY_CASHIER, FINDER, REVIEWER, DISPENSER]
PH_DT = [
	doctype("Pharma Company", PH, [f("company_name", "Data", reqd=1, unique=1, list=1), f("country", "Data", default="Pakistan")],
		[p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(STORE_KEEPER, "rwc")] + [p(r, "r") for r in _ph_staff + [DOCTOR]], autoname="field:company_name"),
	doctype("Medicine Category", PH, [f("category_name", "Data", reqd=1, unique=1, list=1)],
		[p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(STORE_KEEPER, "rwc")] + [p(r, "r") for r in _ph_staff + [DOCTOR]], autoname="field:category_name"),
	doctype("Display Device", PH, [
		f("device_name", "Data", reqd=1, unique=1, list=1),
		f("device_type", "Select", ["Customer Display", "Queue Display", "Kiosk", "Ward Display", "Waiting Display"], reqd=1, list=1, filter=1),
		f("counter", "Link", "Counter", list=1), f("branch", "Link", "Branch", reqd=1, filter=1), cb("dd1"),
		f("device_key", "Data", ro=1, unique=1, description="Part of the display URL — treat like a password"), f("location", "Data"),
		f("last_seen", "Datetime", ro=1), f("is_active", "Check", default="1"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd")] + [p(r, "r") for r in _ph_staff], autoname="field:device_name"),
	doctype("Dispense Ticket Item", PH, [
		f("item_code", "Link", "Item", list=1, columns=2), f("item_name", "Data", ro=1), f("uom", "Data", list=1, columns=1),
		f("qty", "Float", list=1, columns=1), f("stock_qty", "Float", ro=1), f("batch_no", "Data", list=1, columns=2), f("expiry", "Date", ro=1),
		f("rack", "Data", list=1, columns=1), f("found_qty", "Float", columns=1), f("found_by", "Link", "User", ro=1), f("found_at", "Datetime", ro=1),
		f("counted_qty", "Float", columns=1), f("reviewed", "Check"),
		f("line_status", "Select", ["Pending", "Found", "Not Found", "Short", "Substituted"], default="Pending", list=1, columns=1),
		f("invoice_item", "Data", hidden=1), f("note", "Data"),
	], istable=1),
	doctype("Dispense Ticket", PH, [
		f("token", "Data", ro=1, list=1, bold=1), f("token_no", "Int", ro=1), f("ticket_date", "Date", default="Today", list=1, filter=1),
		f("branch", "Link", "Branch", reqd=1, filter=1), cb("dt1"),
		f("sales_invoice", "Link", "Sales Invoice", list=1), f("invoice_status", "Select", ["Paid", "Draft"], default="Paid", list=1),
		f("patient", "Link", "Patient"), f("patient_name", "Data", list=1), f("customer", "Link", "Customer"), cb("dt2"),
		f("status", "Select", ["Queued", "Picking", "Picked", "Reviewing", "Ready", "Called", "Handed Over", "Exception", "On Hold", "Not Collected", "Cancelled"],
			default="Queued", list=1, filter=1),
		f("priority", "Select", ["Normal", "Urgent", "Elderly-Disabled"], default="Normal", list=1),
		f("billing_counter", "Link", "Counter"), f("handover_counter", "Link", "Counter"), f("prescription", "Link", "Prescription"),
		sb("dt3", "Items"), f("items", "Table", "Dispense Ticket Item"),
		sb("dt4", "People & times"), f("finder", "Link", "User", ro=1), f("reviewer", "Link", "User", ro=1), f("dispenser", "Link", "User", ro=1),
		f("amount_due", "Currency", ro=1), cb("dt5"), f("queued_at", "Datetime", ro=1), f("pick_started_at", "Datetime", ro=1), f("picked_at", "Datetime", ro=1),
		f("review_started_at", "Datetime", ro=1), cb("dt6"), f("ready_at", "Datetime", ro=1), f("called_at", "Datetime", ro=1),
		f("handed_over_at", "Datetime", ro=1), f("recalls", "Int", ro=1),
		sb("dt7", "Notes"), f("exception_reason", "Small Text"), f("notes", "Small Text"), f("log", "Code", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(CASH_SUPERVISOR, "r")] + [p(r, "rw") for r in _ph_staff],
		autoname="hash", track_changes=1, title_field="token", sort_field="creation"),
	doctype("Controlled Drug Register", PH, [
		f("posting_date", "Date", list=1, filter=1), f("patient", "Link", "Patient", list=1), f("prescription", "Link", "Prescription"),
		f("prescriber", "Link", "Doctor", list=1), cb("cd1"), f("item_code", "Link", "Item", list=1, filter=1), f("batch_no", "Data", list=1),
		f("qty", "Float", list=1, label="Qty (units)"), f("balance", "Float", list=1, label="Balance after (units)"), cb("cd2"),
		f("sales_invoice", "Link", "Sales Invoice"), f("branch", "Link", "Branch", filter=1), f("dispensed_by", "Link", "User"),
	], [p("System Manager", "r"), p(ADMIN, "rR"), p(REVIEWER, "rR"), p(STORE_KEEPER, "r")], autoname="CDR-.YYYY.-.#####", in_create=1),
	doctype("Cycle Count Item", PH, [
		f("item_code", "Link", "Item", list=1, columns=2), f("item_name", "Data", ro=1, list=1, columns=2), f("batch_no", "Data", list=1, columns=2),
		f("rack", "Data", columns=1), f("system_qty", "Float", ro=1, columns=1), f("counted_qty", "Float", list=1, columns=1),
		f("variance", "Float", ro=1, list=1, columns=1), f("variance_value", "Currency", ro=1, columns=1), f("valuation_rate", "Currency", hidden=1),
	], istable=1),
	doctype("Cycle Count", PH, [
		f("branch", "Link", "Branch", reqd=1, list=1), f("warehouse", "Link", "Warehouse", reqd=1, list=1), f("count_date", "Date", default="Today", list=1),
		cb("cc1"), f("scope", "Select", ["All", "Rack", "Category", "High value"], default="All"), f("rack", "Data"), f("category", "Link", "Medicine Category"),
		cb("cc2"), f("status", "Select", ["Draft", "Pending Approval", "Approved", "Posted", "Rejected"], default="Draft", list=1, filter=1),
		f("counted_by", "Link", "User", ro=1), f("approved_by", "Link", "User", ro=1),
		sb("cc3", "Items"), f("items", "Table", "Cycle Count Item"),
		sb("cc4", "Result"), f("total_variance_value", "Currency", ro=1, list=1), f("stock_reconciliation", "Link", "Stock Reconciliation", ro=1), f("note", "Small Text"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(STORE_KEEPER, "rwc")], autoname="CC-.YYYY.-.####", track_changes=1),
]

SETTINGS_FIELDS = [
	tab("lab_tab", "Lab"),
	f("lab_send_thank_you", "Check", default="1"), f("lab_send_report_ready", "Check", default="1"),
	f("report_link_hours", "Int", default="72", label="Report Link Expiry (hours)"), f("report_max_downloads", "Int", default="5"),
	cb("lb1"), f("report_require_verification", "Check", default="1"),
	f("report_verification_method", "Select", ["Last 4 digits of phone", "Year of birth"], default="Last 4 digits of phone"),
	f("lab_auto_verify", "Check"), f("lab_allow_partial_release", "Check"), cb("lb2"),
	f("critical_notify_message", "Check", label="Critical Values: Also Message the Doctor"),
	f("lab_open_time", "Time", default="08:00:00"), f("lab_close_time", "Time", default="22:00:00"), f("label_size", "Data", default="50x25 mm"),
	tab("pharmacy_tab", "Pharmacy"),
	f("near_expiry_days", "Int", default="90"), f("block_near_expiry", "Check"),
	f("loose_rounding", "Select", ["None", "Nearest 1", "Nearest 5"], default="Nearest 1", label="Loose / Strip Price Rounding"),
	f("allow_rx_override", "Check", default="1", label="Admin May Override Prescription Requirement"), cb("ph1"),
	f("token_prefix", "Data", default="P"), f("skip_review_otc", "Check", label="Skip Review for OTC-only Tickets"), f("recall_limit", "Int", default="3"),
	f("collect_payment_at", "Select", ["Billing counter", "Handover counter"], default="Billing counter"), cb("ph2"),
	f("carry_over_drafts", "Check"), f("cycle_variance_threshold", "Currency", default="1000"),
	f("auto_medicine_invoice", "Check", default="1", label="Signed Prescription Creates a Draft Medicine Invoice"),
	f("auto_lab_order", "Check", default="1", label="Signed Prescription Creates a Lab Order"),
	tab("cash_tab", "Cash"),
	f("require_shift_for_billing", "Check", default="1", description="No money without an open cashier shift"),
	f("denominations", "Data", default="5000,1000,500,100,50,20,10,5,2,1"), f("blind_count", "Check", default="1"),
	f("cash_tolerance", "Currency", default="50"), cb("cs1"), f("max_cash_in_drawer", "Currency", default="50000"),
	f("cash_over_account", "Link", "Account"), f("cash_short_account", "Link", "Account"), cb("cs2"),
	f("staff_receivable_account", "Link", "Account"), f("safe_account", "Link", "Account"), f("petty_expense_account", "Link", "Account"),
	f("float_source_account", "Link", "Account", description="Pay In comes from here (default: the safe)"),
]


def all_doctypes():
	return CASH_DT + LAB_DT + PH_DT
