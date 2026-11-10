"""Phase 1 modules: OPD (slip, queue, prescription), Appointments, Messaging, Billing (discount authorization)."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb, tab
from hospital_vvs.roles import (
	ACCOUNTANT, ADMIN, CASH_SUPERVISOR, DEO, DISPENSER, DOCTOR, FINDER, LAB_USER, NURSE, OV_DOCTOR, OV_STAFF,
	PATHOLOGIST, PHARMACY_CASHIER, RECEPTIONIST, REVIEWER,
)

OPD = "OPD"
APT = "Appointments"
MSG = "Messaging"
BIL = "Billing"
PAY_MODES = ["Cash", "Card", "Bank Transfer", "JazzCash", "Easypaisa"]

# ------------------------------------------------------------------ OPD
VITALS = [
	sb("vitals_sec", "Vitals", permlevel=1),
	f("bp_systolic", "Int", permlevel=1, label="BP Systolic"), f("bp_diastolic", "Int", permlevel=1, label="BP Diastolic"),
	f("pulse", "Int", permlevel=1), cb("v1"),
	f("temperature", "Float", permlevel=1, label="Temperature (°F)"), f("spo2", "Int", permlevel=1, label="SpO2 (%)"),
	f("rbs", "Float", permlevel=1, label="RBS (mg/dL)"), cb("v2"),
	f("weight", "Float", permlevel=1, label="Weight (kg)"), f("height", "Float", permlevel=1, label="Height (cm)"),
	f("bmi", "Float", permlevel=1, ro=1, label="BMI"),
]

OPD_SLIP = doctype("OPD Slip", OPD, [
	f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
	f("doctor", "Link", "Doctor", reqd=1, list=1, filter=1), f("doctor_name", "Data", fetch_from="doctor.doctor_name", ro=1),
	cb("o1"),
	f("branch", "Link", "Branch", reqd=1, filter=1), f("company", "Link", "Company", ro=1),
	f("posting_date", "Date", reqd=1, default="Today", list=1, filter=1), f("posting_time", "Time", default="Now"),
	cb("o2"),
	f("purpose", "Select", ["Consultation", "Follow-up", "Procedure"], default="Consultation", list=1, filter=1),
	f("token_no", "Int", ro=1, list=1), f("appointment", "Link", "Appointment", ro=1),
	sb("cc_sec", "Complaint", permlevel=1), f("chief_complaint", "Small Text", permlevel=1), cb("o3"), f("notes", "Small Text", permlevel=1),
	*VITALS,
	sb("bill_sec", "Bill"),
	f("items", "Table", "OPD Slip Item"),
	f("gross_total", "Currency", ro=1), f("discount_percent", "Percent"), f("discount_amount", "Currency"),
	f("discount_reason", "Small Text"), f("discount_authorization", "Link", "Discount Authorization", ro=1),
	cb("o4"),
	f("net_total", "Currency", ro=1, bold=1), f("payer_type", "Select", ["Patient", "Panel", "Insurance", "Welfare"], default="Patient"),
	f("payer", "Link", "Customer", description="Panel / insurance / welfare fund customer"),
	f("payer_share", "Currency", ro=1), f("patient_share", "Currency", ro=1, bold=1),
	cb("o5"),
	f("payment_mode", "Select", PAY_MODES, default="Cash"), f("cash_tendered", "Currency"), f("change_amount", "Currency", ro=1),
	f("is_free_follow_up", "Check", ro=1, label="Free Follow-up"),
	sb("links_sec", "Links", collapsible=1),
	f("sales_invoice", "Link", "Sales Invoice", ro=1), f("payer_invoice", "Link", "Sales Invoice", ro=1), cb("o6"),
	f("queue_entry", "Link", "Queue Entry", ro=1), f("pos_opening_entry", "Link", "POS Opening Entry", ro=1, label="Cashier Shift"),
	f("client_ref", "Data", hidden=1, unique=1, no_copy=1, description="Idempotency key from the counter"),
], [
	p("System Manager", "rwcdsxa"), p("System Manager", "rw", permlevel=1),
	p(ADMIN, "rwcdsxaeR"), p(ADMIN, "rw", permlevel=1),
	p(RECEPTIONIST, "rwcsp"), p(RECEPTIONIST, "rw", permlevel=1),
	p(DOCTOR, "r"), p(DOCTOR, "rw", permlevel=1), p(NURSE, "rw"), p(NURSE, "rw", permlevel=1),
	p(DEO, "rw"), p(DEO, "rw", permlevel=1), p(ACCOUNTANT, "reR"), p(CASH_SUPERVISOR, "rR"),
], autoname="OPD-.YYYY.-.######", is_submittable=1, track_changes=1, title_field="patient_name")

OPD_CHILDREN = [
	doctype("OPD Slip Item", OPD, [
		f("item_code", "Link", "Item", reqd=1, list=1, columns=3), f("item_name", "Data", fetch_from="item_code.item_name", ro=1, list=1, columns=3),
		f("qty", "Float", default="1", list=1, columns=1), f("rate", "Currency", list=1, columns=1), f("amount", "Currency", ro=1, list=1, columns=2),
	], istable=1),
	doctype("Prescription Medicine", OPD, [
		f("item", "Link", "Item", reqd=1, list=1, columns=2, label="Medicine"), f("item_name", "Data", fetch_from="item.item_name", ro=1),
		f("generic", "Link", "Generic Name", ro=1), f("drug_class", "Link", "Drug Class", ro=1),
		f("dose", "Data", list=1, columns=1), f("frequency", "Data", list=1, columns=1, description="e.g. 1+0+1, TDS"),
		f("route", "Select", ["Oral", "IV", "IM", "SC", "Topical", "Inhalation", "Eye", "Ear", "Nasal", "Rectal", "Sublingual"], default="Oral", list=1, columns=1),
		f("duration", "Data", list=1, columns=1, description="e.g. 5 days"), f("qty", "Float", list=1, columns=1),
		f("instructions", "Data", list=1, columns=2), f("no_substitution", "Check"),
		sb("alert_sec", "Safety alert"),
		f("alert_type", "Data", ro=1), f("alert_severity", "Data", ro=1), f("alert_message", "Small Text", ro=1),
		f("override_reason", "Small Text"), f("override_by", "Link", "User", ro=1), f("override_at", "Datetime", ro=1),
	], istable=1),
	doctype("Prescription Diagnosis", OPD, [
		f("diagnosis", "Link", "Diagnosis", reqd=1, list=1, columns=3),
		f("diagnosis_name", "Data", fetch_from="diagnosis.diagnosis_name", ro=1, list=1, columns=5),
		f("is_primary", "Check", list=1, columns=1),
	], istable=1),
	doctype("Prescription Lab Test", OPD, [
		f("test_name", "Data", reqd=1, list=1, columns=4), f("lab_test_template", "Data", hidden=1, description="Linked in Phase 2"),
		f("urgent", "Check", list=1, columns=1), f("notes", "Data", list=1, columns=4),
	], istable=1),
]

_rx_perm = [
	p("System Manager", "rwcdsxa"), p(ADMIN, "rwcdsxaeR"), p(DOCTOR, "rwcsxap"), p(OV_DOCTOR, "rwcsxap"),
	p(NURSE, "r"), p(DEO, "rwc"), p(REVIEWER, "r"), p(FINDER, "r"),
	# permlevel 1 = diagnoses, tests and examination notes: clinical roles only (the finder picks medicines, 09-security-ops.md)
	p("System Manager", "rw", permlevel=1), p(ADMIN, "rw", permlevel=1), p(DOCTOR, "rw", permlevel=1), p(OV_DOCTOR, "rw", permlevel=1),
	p(NURSE, "r", permlevel=1), p(DEO, "rw", permlevel=1), p(REVIEWER, "r", permlevel=1),
]
PRESCRIPTION = doctype("Prescription", OPD, [
	f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
	f("doctor", "Link", "Doctor", reqd=1, list=1, filter=1), f("doctor_name", "Data", fetch_from="doctor.doctor_name", ro=1),
	cb("r1"),
	f("branch", "Link", "Branch", reqd=1, filter=1), f("prescription_date", "Date", default="Today", list=1),
	f("opd_slip", "Link", "OPD Slip"), f("queue_entry", "Link", "Queue Entry", ro=1),
	cb("r2"),
	f("source", "Select", ["OPD", "IPD", "ER", "Online Visit"], default="OPD"), f("online_visit", "Link", "Online Visit Request", ro=1), f("round_no", "Int", label="Round No. (IPD)"),
	f("version_no", "Int", default="1", ro=1), f("status", "Select", ["Draft", "Signed", "Superseded", "Cancelled"], default="Draft", ro=1, list=1, filter=1),
	sb("med_sec", "Medicines"), f("medicines", "Table", "Prescription Medicine"),
	sb("dx_sec", "Diagnosis & tests", permlevel=1), f("diagnoses", "Table", "Prescription Diagnosis", permlevel=1), cb("r3"),
	f("lab_tests", "Table", "Prescription Lab Test", permlevel=1),
	sb("notes_sec", "Notes"), f("examination_notes", "Text", permlevel=1), cb("r4"), f("advice", "Text"),
	f("follow_up_days", "Int"), f("follow_up_date", "Date"),
	sb("sign_sec", "Signature"), f("signed_by", "Link", "User", ro=1), f("signed_at", "Datetime", ro=1), cb("r5"),
	f("amendment_reason", "Small Text", description="Required when amending a signed prescription"),
	f("has_overrides", "Check", ro=1), f("pharmacy_review_flag", "Check", ro=1, description="Amended after the medicine invoice was paid"),
], _rx_perm, autoname="RX-.YYYY.-.######", is_submittable=1, track_changes=1, title_field="patient_name")

PRESCRIPTION_TEMPLATE = doctype("Prescription Template", OPD, [
	f("template_name", "Data", reqd=1, list=1), f("doctor", "Link", "Doctor", list=1, filter=1, description="Empty = shared"),
	f("medicines", "Table", "Prescription Medicine"), f("diagnoses", "Table", "Prescription Diagnosis"), f("advice", "Text"),
], [p(ADMIN, "rwcd"), p(DOCTOR, "rwcd"), p(OV_DOCTOR, "rwcd")], autoname="hash", title_field="template_name")

QUEUE = doctype("Queue Entry", OPD, [
	f("doctor", "Link", "Doctor", reqd=1, list=1, filter=1), f("doctor_name", "Data", fetch_from="doctor.doctor_name", ro=1),
	f("patient", "Link", "Patient", reqd=1, list=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
	cb("q1"),
	f("branch", "Link", "Branch", reqd=1, filter=1), f("queue_date", "Date", default="Today", list=1, filter=1),
	f("room", "Data"), f("token_no", "Int", list=1),
	cb("q2"),
	f("status", "Select", ["Vitals", "Waiting", "Called", "In Consultation", "Done", "Skipped"], default="Waiting", list=1, filter=1,
		description="Vitals = with the nurse · Waiting = ready for the doctor · Called / In Consultation = with the doctor · Done"),
	f("priority", "Select", ["", "Urgent", "Elderly", "Disabled"]), f("is_follow_up", "Check"),
	sb("q3", "Times"), f("opd_slip", "Link", "OPD Slip"), f("appointment", "Link", "Appointment"), cb("q4"),
	f("vitals_at", "Datetime", label="Vitals taken at"), f("vitals_by", "Link", "User", ro=1),
	f("called_at", "Datetime"), f("started_at", "Datetime"), f("completed_at", "Datetime"),
], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(RECEPTIONIST, "rwc"), p(DOCTOR, "rw"), p(NURSE, "rw"), p(DEO, "rw")]
	+ [p(r, "r") for r in (LAB_USER, PATHOLOGIST, PHARMACY_CASHIER, REVIEWER, DISPENSER, ACCOUNTANT)],
	autoname="QE-.YYYY.-.######", track_changes=1, title_field="patient_name")

# ------------------------------------------------------------------ Appointments
_apt_perm = [p("System Manager", "rwcd"), p(ADMIN, "rwcdeR"), p(RECEPTIONIST, "rwcR"), p(DOCTOR, "r"), p(NURSE, "r"),
	p(ACCOUNTANT, "r"), p(DEO, "rwc")]
APPOINTMENTS = [
	doctype("Time Slot", APT, [
		f("doctor", "Link", "Doctor", reqd=1, list=1, filter=1), f("branch", "Link", "Branch", reqd=1, filter=1),
		f("slot_date", "Date", reqd=1, list=1, filter=1, search_index=1), cb("t1"),
		f("start_time", "Time", reqd=1, list=1), f("end_time", "Time", reqd=1),
		f("status", "Select", ["Available", "Held", "Booked", "Blocked"], default="Available", list=1, filter=1),
		f("hold_expires_at", "Datetime"), f("held_by", "Data", description="Hold key (session / phone)"),
		f("appointment", "Link", "Appointment"),
	], _apt_perm, autoname="hash", sort_field="slot_date", sort_order="ASC"),
	doctype("Appointment", APT, [
		f("patient", "Link", "Patient", list=1, filter=1), f("patient_name", "Data", reqd=1, list=1), f("phone", "Data", reqd=1, search_index=1),
		f("doctor", "Link", "Doctor", reqd=1, list=1, filter=1), f("doctor_name", "Data", fetch_from="doctor.doctor_name", ro=1),
		cb("ap1"),
		f("branch", "Link", "Branch", reqd=1, filter=1), f("appointment_date", "Date", reqd=1, list=1, filter=1),
		f("start_time", "Time", list=1), f("time_slot", "Link", "Time Slot", ro=1),
		cb("ap2"),
		f("status", "Select", ["Pending", "Confirmed", "Arrived", "Completed", "Rejected", "Cancelled", "No-show"], default="Pending", list=1, filter=1),
		f("source_channel", "Select", ["Reception", "Web", "WhatsApp"], default="Reception", list=1, filter=1),
		f("priority", "Select", ["Normal", "Urgent", "Elderly", "Disabled", "Follow-up"], default="Normal", list=1, filter=1),
		f("booking_ref", "Data", ro=1, unique=1, search_index=1),
		sb("pay_sec", "Fee & payment"),
		f("fee", "Currency", ro=1), f("payment_channel", "Select", ["At Clinic", "Payment Proof", "Online"], default="At Clinic"),
		f("payment_status", "Select", ["Unpaid", "Proof Submitted", "Paid", "Refunded"], default="Unpaid", filter=1), cb("ap3"),
		f("payment_proof", "Attach"), f("refund_amount", "Currency"), f("refund_reference", "Data"),
		sb("misc_sec", "Tracking", collapsible=1),
		f("manage_token", "Data", hidden=1, ro=1, search_index=1), f("reminder_evening_sent", "Check", ro=1),
		f("messages_allowed", "Check", label="Patient Agreed to Booking Messages", description="Ticked on the booking form / implied by a WhatsApp chat"),
		f("reminder_hours_sent", "Check", ro=1), f("arrived_at", "Datetime", ro=1), cb("ap4"),
		f("opd_slip", "Link", "OPD Slip", ro=1), f("cancel_reason", "Small Text"), f("is_new_patient", "Check", ro=1),
		f("new_patient_age", "Int"), f("new_patient_gender", "Select", ["", "Male", "Female", "Other"]),
	], _apt_perm, autoname="APT-.YYYY.-.######", track_changes=1, title_field="patient_name"),
]

# ------------------------------------------------------------------ Messaging
_msg_perm = [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(RECEPTIONIST, "r"), p(LAB_USER, "r")]
MESSAGING = [
	doctype("Message Template", MSG, [
		f("event", "Data", reqd=1, unique=1, list=1), f("enabled", "Check", default="1", list=1),
		f("fallback_to_sms", "Check", default="1"), f("urgent", "Check", description="Ignores quiet hours"),
		f("marketing", "Check", description="Needs WhatsApp/SMS consent (all business messages here do)", default="1"),
		cb("mt1"),
		f("wa_template_en", "Data", label="WhatsApp Template (English)"), f("wa_template_ur", "Data", label="WhatsApp Template (Urdu)"),
		f("wa_params", "Data", label="Template Parameters", description="Comma separated context keys, in template order"),
		sb("mt2", "SMS text"), f("sms_text_en", "Small Text", label="SMS (English)"), cb("mt3"), f("sms_text_ur", "Small Text", label="SMS (Urdu)"),
	], _msg_perm, autoname="field:event"),
	doctype("Message Log", MSG, [
		f("direction", "Select", ["Out", "In"], default="Out", list=1, filter=1),
		f("patient", "Link", "Patient", list=1, filter=1), f("phone", "Data", list=1, search_index=1),
		f("channel", "Select", ["WhatsApp", "SMS"], list=1, filter=1), f("event", "Data", filter=1), f("language", "Data"),
		cb("ml1"),
		f("status", "Select", ["Queued", "Sent", "Delivered", "Read", "Failed", "Skipped", "Received"], default="Queued", list=1, filter=1),
		f("provider_message_id", "Data", search_index=1), f("retry_count", "Int"), f("next_attempt_at", "Datetime"), f("error", "Small Text"),
		cb("ml2"),
		f("reference_doctype", "Link", "DocType"), f("reference_name", "Dynamic Link", "reference_doctype"),
		f("sent_at", "Datetime"), f("delivered_at", "Datetime"), f("read_at", "Datetime"),
		sb("ml3", "Content"), f("body", "Small Text", description="Rendered text (no medical data)"), f("context", "Code", options="JSON"),
		f("media_url", "Data"), f("conversation", "Link", "WhatsApp Conversation"), f("sent_by", "Link", "User"),
	], _msg_perm, autoname="hash", sort_field="creation"),
	doctype("WhatsApp Conversation", MSG, [
		f("phone", "Data", reqd=1, unique=1, list=1), f("language", "Select", ["en", "ur"], default="ur", list=1),
		f("current_step", "Data", list=1), f("handed_off", "Check", list=1, filter=1),
		cb("wc1"), f("last_inbound_at", "Datetime", list=1), f("expires_at", "Datetime"), f("failed_attempts", "Int"),
		f("held_slot", "Link", "Time Slot"), f("unread", "Int"), f("assigned_to", "Link", "User"),
		sb("wc2", "Data"), f("patients", "Small Text", description="Patients on this phone"), f("data", "Code", options="JSON"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(RECEPTIONIST, "rw")], autoname="hash", sort_field="modified"),
]

# ------------------------------------------------------------------ Billing
BILLING = [
	doctype("Discount Authorization", BIL, [
		f("reference_doctype", "Link", "DocType", list=1), f("reference_name", "Dynamic Link", "reference_doctype", list=1),
		f("patient", "Link", "Patient"), f("billing_type", "Data", list=1, filter=1), f("branch", "Link", "Branch", filter=1),
		cb("da1"),
		f("gross_amount", "Currency"), f("discount_percent", "Percent", list=1), f("discount_amount", "Currency", list=1),
		f("reason", "Small Text", reqd=1),
		cb("da2"),
		f("status", "Select", ["Within Limit", "Pending", "Approved", "Rejected", "Used"], default="Pending", list=1, filter=1),
		f("requested_by", "Link", "User", list=1, filter=1), f("requester_role", "Data"),
		f("approved_by", "Link", "User"), f("decided_on", "Datetime"), f("decision_note", "Small Text"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(CASH_SUPERVISOR, "rwR"), p(ACCOUNTANT, "rwR"),
		p(RECEPTIONIST, "rc"), p(LAB_USER, "rc"), p(PHARMACY_CASHIER, "rc"), p(DISPENSER, "rc")],
		autoname="DA-.YYYY.-.#####", track_changes=1),
]


def all_doctypes():
	return OPD_CHILDREN + [OPD_SLIP, PRESCRIPTION, PRESCRIPTION_TEMPLATE, QUEUE] + APPOINTMENTS + MESSAGING + BILLING
