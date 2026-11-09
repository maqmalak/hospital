"""Reception counter (Restaurant OS-style POS, owner request 2026-11-09): one receipt per sale, grouping the documents it creates."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb
from hospital_vvs.roles import ACCOUNTANT, ADMIN, CASH_SUPERVISOR, RECEPTIONIST

CASH = "Cash"
KINDS = ["Consultation", "Service", "Lab", "IPD Advance", "IPD Settlement", "Online Fee", "Dues"]

DOCTYPES = [
	doctype("Counter Receipt Line", CASH, [
		f("kind", "Select", KINDS, reqd=1, list=1, columns=2), f("label", "Data", list=1, columns=3), f("doctor", "Link", "Doctor"),
		f("item_code", "Link", "Item"), f("template", "Link", "Lab Test Template"), f("target", "Data", description="Admission / online visit / invoice"),
		f("qty", "Float", default="1", list=1, columns=1), f("rate", "Currency", columns=1), f("discount", "Currency", columns=1),
		f("amount", "Currency", list=1, columns=2), f("reference_doctype", "Link", "DocType"), f("reference_name", "Dynamic Link", "reference_doctype", list=1, columns=1),
		f("token_no", "Int"), f("refunded", "Check", ro=1), f("refund_document", "Data", ro=1),
	], istable=1),
	doctype("Counter Receipt Tender", CASH, [
		f("mode_of_payment", "Link", "Mode of Payment", reqd=1, list=1, columns=4), f("amount", "Currency", reqd=1, list=1, columns=3),
		f("reference_no", "Data", list=1, columns=3),
	], istable=1),
	doctype("Counter Receipt", CASH, [
		f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
		f("branch", "Link", "Branch", reqd=1, filter=1), f("counter", "Link", "Counter", list=1, filter=1), cb("r1"),
		f("shift", "Link", "POS Opening Entry", filter=1, label="Cashier Shift"), f("cashier", "Link", "User", ro=1, list=1),
		f("posted_at", "Datetime", list=1), f("status", "Select", ["Paid", "Partly Refunded", "Refunded"], default="Paid", list=1, filter=1),
		sb("r2", "Lines"), f("lines", "Table", "Counter Receipt Line"),
		sb("r3", "Payment"), f("gross_total", "Currency", ro=1), f("discount_total", "Currency", ro=1), f("net_total", "Currency", ro=1, list=1),
		f("payer_share", "Currency", ro=1), f("patient_total", "Currency", ro=1, label="Patient Pays"), cb("r4"),
		f("tenders", "Table", "Counter Receipt Tender"), f("tendered", "Currency", ro=1), f("change_amount", "Currency", ro=1),
		sb("r5", "Offline", collapsible=1), f("client_ref", "Data", unique=1, no_copy=1, ro=1), f("offline", "Check", ro=1),
		f("offline_created", "Datetime", ro=1), cb("r6"), f("refund_reason", "Small Text", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(RECEPTIONIST, "rc"), p(CASH_SUPERVISOR, "rR"), p(ACCOUNTANT, "rR")],
		autoname="RCPT-.YY.MM.-.#####", track_changes=1, title_field="patient_name", sort_field="posted_at"),
]


def all_doctypes():
	return DOCTYPES
