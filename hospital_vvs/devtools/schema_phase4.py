"""Phase 4: Online Visit (telemedicine) — 08-online-visit-comms.md, first half."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb, tab
from hospital_vvs.roles import ACCOUNTANT, ADMIN, CASH_SUPERVISOR, DOCTOR, OV_DOCTOR, OV_STAFF

OV = "Online Visit"
PAY = ["Payment Proof", "JazzCash", "Easypaisa", "Bank Transfer", "Card (online)"]

DOCTYPES = [
	doctype("Online Visit Photo", OV, [f("file_url", "Attach", list=1, columns=6), f("caption", "Data", list=1, columns=4)], istable=1),
	doctype("Online Visit Request", OV, [
		tab("t_pat", "Patient"),
		f("patient", "Link", "Patient", list=1, filter=1), f("patient_name", "Data", reqd=1, list=1, global_search=1),
		f("phone", "Data", reqd=1, list=1, search_index=1), f("gender", "Select", ["Male", "Female", "Other"]), f("age", "Int"),
		cb("p1"),
		f("language", "Select", ["en", "ur", "ar"], default="ur"), f("city", "Data", label="Location / City"), f("branch", "Link", "Branch", filter=1),
		f("phone_verified", "Check", ro=1, description="Existing patient linked after a one-time code"),
		f("messages_allowed", "Check", default="1", label="Patient agreed to messages about this visit"),
		tab("t_comp", "Complaint"),
		f("complaint", "Small Text", reqd=1, list=1), f("symptoms", "Small Text", description="Comma separated"),
		f("duration", "Data", label="How long"), cb("c1"), f("conditions", "Small Text", label="Known conditions"),
		f("current_meds", "Small Text", label="Current medicines"), f("allergies_text", "Small Text", label="Allergies (patient-reported)"),
		sb("c2", "Photos"), f("photos", "Table", "Online Visit Photo"),
		f("specialization", "Link", "Specialization", label="Preferred speciality"),
		tab("t_fee", "Fee"),
		f("fee", "Currency", ro=1, list=1), f("payment_method", "Select", PAY, default="Payment Proof"),
		f("payment_proof", "Attach"), f("payment_reference", "Data", label="Transaction ID"), cb("f1"),
		f("fee_status", "Select", ["Unpaid", "Proof Submitted", "Verified", "Refunded", "Waived"], default="Unpaid", list=1, filter=1),
		f("fee_verified_by", "Link", "User", ro=1), f("fee_verified_at", "Datetime", ro=1),
		f("sales_invoice", "Link", "Sales Invoice", ro=1), f("payment_entry", "Link", "Payment Entry", ro=1),
		sb("f2", "Refund"), f("refund_amount", "Currency", ro=1), f("refund_reference", "Data"), cb("f3"), f("refund_notes", "Small Text"),
		f("refund_entry", "Link", "Payment Entry", ro=1), f("credit_note", "Link", "Sales Invoice", ro=1),
		tab("t_visit", "Visit"),
		f("status", "Select", ["Pending", "Accepted", "Rejected", "Completed", "Cancelled"], default="Pending", list=1, filter=1),
		f("assigned_doctor", "Link", "Doctor", list=1, filter=1), f("scheduled_at", "Datetime", list=1), f("video_link", "Data", options="URL"),
		cb("v1"),
		f("accepted_by", "Link", "User", ro=1), f("accepted_at", "Datetime", ro=1), f("completed_at", "Datetime", ro=1),
		f("rejection_reason", "Small Text"), f("cancel_reason", "Small Text"),
		sb("v2", "Consultation"), f("prescription", "Link", "Prescription", ro=1), f("doctor_notes", "Text", permlevel=1), cb("v3"),
		f("follow_up", "Select", ["", "Not needed", "Online", "Visit the clinic"]), f("follow_up_date", "Date"),
		sb("v4", "Access", collapsible=1), f("token_hash", "Data", hidden=1, search_index=1), f("token_expires", "Datetime", ro=1),
		f("verified_until", "Datetime", ro=1), f("failed_attempts", "Int", ro=1), f("locked_until", "Datetime", ro=1),
		f("access_log", "Small Text", ro=1), f("client_ref", "Data", hidden=1, unique=1, no_copy=1),
	], [p("System Manager", "rwcd"), p("System Manager", "rw", permlevel=1), p(ADMIN, "rwcdR"), p(ADMIN, "rw", permlevel=1),
		p(OV_STAFF, "rwR"), p(OV_DOCTOR, "rw"), p(OV_DOCTOR, "rw", permlevel=1), p(DOCTOR, "r"), p(DOCTOR, "r", permlevel=1),
		p(ACCOUNTANT, "rR"), p(CASH_SUPERVISOR, "r")],
		autoname="OV-.YYYY.-.#####", track_changes=1, title_field="patient_name", search_fields="phone,patient"),
]

SETTINGS_FIELDS = [
	tab("ov_tab", "Online Visit"),
	f("ov_fee", "Currency", default="1500", label="Online Visit Fee"), f("ov_item", "Link", "Item", label="Fee Item"),
	f("ov_payment_methods", "Small Text", default="Payment Proof\nJazzCash\nEasypaisa\nBank Transfer", description="One per line, shown on the form"),
	f("ov_payment_instructions", "Small Text", default="JazzCash / Easypaisa: 0300-0000000 (VVS Hospital)\nBank: Meezan Bank, A/C 0000-0000000000",
		description="Shown to the patient on the payment step"),
	cb("ov1"),
	f("ov_video_provider", "Select", ["Jitsi Meet (auto link)", "Manual link"], default="Jitsi Meet (auto link)"),
	f("ov_video_base", "Data", default="https://meet.jit.si/", description="Auto links are this address + a random room name"),
	f("ov_link_days", "Int", default="30", label="Status Link Valid (days)"), f("ov_branch", "Link", "Branch", description="Branch whose books get online fees"),
	f("ov_bank_account", "Link", "Account", description="Not used since D-38: online fees are collected by the receptionist in a shift"),
	tab("contract_tab", "Contract Pharmacy"),
	f("pharmacy_company", "Link", "Company", description="The contractor's own company: pharmacy sales, stock and pharmacy shifts post here, never to the hospital"),
	f("ipd_medicine_billing", "Select", ["Pharmacy bills patient", "Hospital IPD bill"], default="Pharmacy bills patient",
		description="Pharmacy bills patient: ward medicine orders become pharmacy invoices for the attendant to pay; the IPD bill has no medicines"),
	cb("cp1"),
	f("ov_fee_modes", "Small Text", default="Cash\nBank Transfer\nJazzCash\nEasypaisa", label="Online Fee Modes (reception)"),
]


def all_doctypes():
	return DOCTYPES
