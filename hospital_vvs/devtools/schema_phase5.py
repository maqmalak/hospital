"""Phase 5 — patient comms (bedside ↔ nursing station) and feedback (08-online-visit-comms.md, 01 feedback, D-44)."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb, tab
from hospital_vvs.roles import ACCOUNTANT, ADMIN, DOCTOR, NURSE, RECEPTIONIST

PC = "Patient Comms"
KINDS = ["Message", "Nurse", "Water", "Pain", "Bathroom", "Other"]

DOCTYPES = [
	doctype("Nursing Station", PC, [
		f("station_name", "Data", reqd=1, unique=1, list=1), f("branch", "Link", "Branch", reqd=1, list=1, filter=1), cb("n1"),
		f("extension", "Data", label="Phone / extension"), f("is_active", "Check", default="1", list=1),
		f("quick_replies", "Small Text", default="Coming now\nNurse is on the way\nPlease wait a few minutes\nDoctor informed",
			description="One per line — shown as one-tap replies at the station"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(NURSE, "r"), p(DOCTOR, "r"), p(RECEPTIONIST, "r")],
		autoname="field:station_name", track_changes=1),

	doctype("Comms Message", PC, [
		f("profile", "Link", "Patient Comms Profile", list=1, filter=1), f("patient", "Link", "Patient", list=1),
		f("station", "Link", "Nursing Station", list=1, filter=1), f("bed", "Link", "Hospital Bed"), cb("m1"),
		f("direction", "Select", ["From patient", "To patient", "Broadcast"], reqd=1, list=1, filter=1),
		f("kind", "Select", KINDS, default="Message", list=1, filter=1), f("urgency", "Select", ["Normal", "High", "Urgent"], default="Normal", list=1, filter=1),
		sb("m2", "Message"), f("text", "Small Text"), f("voice", "Check", label="Voice to text"), f("language", "Data"),
		cb("m3"), f("sender", "Link", "User", ro=1), f("read", "Check", list=1, filter=1), f("read_by", "Link", "User", ro=1), f("read_at", "Datetime", ro=1),
		f("answered_at", "Datetime", ro=1, description="First staff reply after this patient message"), f("response_seconds", "Int", ro=1),
		f("broadcast", "Link", "Station Broadcast", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rR"), p(NURSE, "r"), p(DOCTOR, "r")],
		autoname="CMS-.YYYY.-.#######", in_create=1, sort_field="creation", sort_order="DESC"),

	doctype("Station Broadcast", PC, [
		f("station", "Link", "Nursing Station", reqd=1, list=1, filter=1), f("text", "Small Text", reqd=1, list=1), cb("b1"),
		f("sent_by", "Link", "User", ro=1, list=1), f("recipients", "Int", ro=1, list=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rR"), p(NURSE, "r")], autoname="BRD-.YYYY.-.#####", in_create=1),

	doctype("Patient Feedback", PC, [
		f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
		f("source", "Select", ["OPD", "IPD", "Pharmacy"], list=1, filter=1), f("status", "Select", ["Requested", "Received", "Expired", "Skipped"], default="Requested", list=1, filter=1),
		cb("f1"), f("doctor", "Link", "Doctor", list=1, filter=1), f("department", "Link", "Medical Department", filter=1), f("branch", "Link", "Branch", filter=1),
		f("reference_doctype", "Link", "DocType"), f("reference_name", "Dynamic Link", "reference_doctype"),
		sb("f2", "Answer"), f("rating", "Rating", list=1, options="5"), f("rating_value", "Int", list=1, filter=1, label="Rating (1-5)"), f("comment", "Small Text"),
		cb("f3"), f("channel", "Select", ["", "Web", "WhatsApp", "Reception"]), f("requested_at", "Datetime", ro=1), f("received_at", "Datetime", ro=1),
		f("message_log", "Link", "Message Log", ro=1), f("token_hash", "Data", hidden=1, search_index=1),
		sb("f4", "Follow-up"), f("follow_up", "Select", ["", "Open", "Done"], list=1, filter=1), f("follow_up_note", "Small Text"),
		cb("f5"), f("followed_up_by", "Link", "User", ro=1), f("followed_up_at", "Datetime", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwR"), p(ACCOUNTANT, "r"), p(DOCTOR, "r")],
		autoname="FB-.YYYY.-.#####", track_changes=1, title_field="patient_name", sort_field="creation", sort_order="DESC"),
]

SETTINGS_FIELDS = [
	tab("comms_tab", "Patient Comms & Feedback"),
	f("comms_urgent_kinds", "Small Text", default="Pain\nNurse", description="Quick buttons treated as urgent at the station (one per line)"),
	f("comms_answer_target_min", "Int", default="5", label="Answer Target (minutes)", description="Patient messages unanswered longer than this turn red"),
	cb("pcf1"),
	f("feedback_opd", "Check", default="1", label="Feedback After OPD Visit"), f("feedback_opd_hours", "Float", default="2", label="OPD Delay (hours)"),
	f("feedback_ipd", "Check", default="1", label="Feedback After Discharge"), f("feedback_ipd_hours", "Float", default="24", label="Discharge Delay (hours)"),
	f("feedback_pharmacy", "Check", default="0", label="Feedback After Pharmacy Handover"), f("feedback_pharmacy_hours", "Float", default="2", label="Pharmacy Delay (hours)"),
	cb("pcf2"),
	f("feedback_gap_days", "Int", default="30", label="At Most One Request per Patient Every (days)"),
	f("feedback_low_rating", "Int", default="2", label="Alert Admin at Rating ≤"), f("feedback_link_days", "Int", default="7", label="Feedback Link Valid (days)"),
]


def all_doctypes():
	return DOCTYPES
