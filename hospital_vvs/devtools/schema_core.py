"""Core module (Hospital VVS): Clinic Settings, patients, doctors, clinical masters, audit."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb, tab
from hospital_vvs.devtools.schema_phase2 import SETTINGS_FIELDS as PHASE2_SETTINGS
from hospital_vvs.devtools.schema_phase3 import SETTINGS_FIELDS as PHASE3_SETTINGS
from hospital_vvs.devtools.schema_phase4 import SETTINGS_FIELDS as PHASE4_SETTINGS
from hospital_vvs.roles import (
	ACCOUNTANT, ADMIN, CASH_SUPERVISOR, CLINICAL, DEO, DISPENSER, DOCTOR, FINDER, LAB_USER, NURSE, OV_DOCTOR, OV_STAFF,
	PATHOLOGIST, PHARMACY_CASHIER, RECEPTIONIST, REVIEWER, STORE_KEEPER,
)

M = "Hospital VVS"
LANG = ["en", "ur", "ar"]
ALL_STAFF_READ = [p(r, "r") for r in (DOCTOR, RECEPTIONIST, LAB_USER, PATHOLOGIST, PHARMACY_CASHIER, REVIEWER,
	DISPENSER, STORE_KEEPER, CASH_SUPERVISOR, ACCOUNTANT, NURSE, DEO, OV_STAFF, OV_DOCTOR)]


def master_perms(*writers):
	return [p("System Manager", "rwcde"), p(ADMIN, "rwcdeR")] + [p(r, "rwc") for r in writers] + [
		x for x in ALL_STAFF_READ if x["role"] not in writers]


def names3(prefix="name"):
	return [f(prefix + "_ur", "Data", label="Name (Urdu)"), f(prefix + "_ar", "Data", label="Name (Arabic)")]


# ---------------------------------------------------------------- settings children
CHILDREN = [
	doctype("Page Access Rule", M, [
		f("route", "Data", reqd=1, list=1, columns=3),
		f("label", "Data", list=1, columns=3),
		f("roles", "Small Text", list=1, columns=4, description="Comma separated role names"),
		f("module_switch", "Data", list=1, columns=2, description="Clinic Settings module switch that hides this route"),
	], istable=1),
	doctype("Branch Settings Override", M, [
		f("branch", "Link", "Branch", reqd=1, list=1, columns=3),
		f("setting", "Data", reqd=1, list=1, columns=3, description="Clinic Settings fieldname"),
		f("value", "Small Text", list=1, columns=4),
	], istable=1),
	doctype("Printer Map", M, [
		f("branch", "Link", "Branch", list=1, columns=2),
		f("device", "Data", reqd=1, list=1, columns=2, description="Counter or PC name"),
		f("receipt_printer", "Data", list=1, columns=2),
		f("label_printer", "Data", list=1, columns=2),
		f("a4_printer", "Data", list=1, columns=2),
	], istable=1),
	doctype("Billing Type POS Profile", M, [
		f("billing_type", "Select", ["Fee", "Medicine", "Lab", "General", "OPD Slip", "IPD Slip"], reqd=1, list=1, columns=3),
		f("branch", "Link", "Branch", reqd=1, list=1, columns=3),
		f("pos_profile", "Link", "POS Profile", reqd=1, list=1, columns=4),
	], istable=1),
	doctype("Discount Rule", M, [
		f("role", "Link", "Role", reqd=1, list=1, columns=3),
		f("billing_type", "Select", ["", "Fee", "Medicine", "Lab", "General", "OPD Slip", "IPD Slip"], list=1, columns=2,
			description="Empty = all billing types"),
		f("max_percent", "Percent", list=1, columns=2),
		f("max_amount", "Currency", list=1, columns=2),
	], istable=1),
	doctype("Discount Approver", M, [f("role", "Link", "Role", reqd=1, list=1)], istable=1),
]

SETTINGS = doctype("Clinic Settings", M, [
	tab("general_tab", "General"),
	f("clinic_name", "Data", default="VVS Hospital"), f("clinic_name_ur", "Data", label="Clinic Name (Urdu)"),
	f("clinic_name_ar", "Data", label="Clinic Name (Arabic)"), f("logo", "Attach Image"),
	cb("g1"),
	f("company", "Link", "Company"), f("default_branch", "Link", "Branch"),
	f("address", "Small Text"), f("phone", "Data"),
	f("clinic_mode", "Select", ["OPD only", "OPD+IPD", "Full Hospital"], default="Full Hospital"),
	f("default_currency", "Link", "Currency", default="PKR"),
	sb("g2", "Consultation"),
	f("default_fee", "Currency", default="1000"), f("follow_up_free_days", "Int", default="7", label="Follow-up Free Window (days)"),
	f("vitals_history_count", "Int", default="5"), cb("g3"),
	f("avg_consultation_minutes", "Int", default="10"), f("voice_control", "Check"),
	f("training_mode", "Check", description="Shows a red TRAINING banner. Use only on the training site."),
	f("branch_overrides", "Table", "Branch Settings Override"),

	tab("modules_tab", "Modules"),
	*[f("enable_" + m, "Check", default="1") for m in ("lab", "medicine", "ward", "mar", "diet", "procedures")],
	cb("m1"),
	*[f("enable_" + m, "Check", default="1") for m in ("icu", "consent", "packages", "insurance", "panels", "emergency")],
	cb("m2"),
	*[f("enable_" + m, "Check", default="1") for m in ("shifts", "pharmacy_pipeline", "whatsapp", "sms", "online_visit")],
	cb("m3"),
	*[f("enable_" + m, "Check", default="1") for m in ("patient_comms", "feedback", "doctor_share", "welfare", "appointments")],

	tab("printing_tab", "Printing"),
	f("receipt_format", "Select", ["Thermal 80 mm", "A4"], default="Thermal 80 mm", label="OPD Slip / Receipt"),
	f("prescription_format", "Select", ["A4", "A5", "Thermal 80 mm"], default="A4"),
	f("patient_card_format", "Select", ["CR80 Card", "Thermal 80 mm"], default="Thermal 80 mm"),
	cb("pr1"), f("use_print_agent", "Check", default="1", description="QZ Tray on counter PCs; browser print otherwise"),
	f("printer_map", "Table", "Printer Map"),

	tab("pos_tab", "POS & Warehouses"),
	f("pos_profiles", "Table", "Billing Type POS Profile"),
	sb("w1", "Warehouses (default branch)"),
	f("main_store", "Link", "Warehouse"), f("pharmacy_retail_warehouse", "Link", "Warehouse"),
	f("ipd_dispensing_warehouse", "Link", "Warehouse"), cb("w2"),
	f("lab_store", "Link", "Warehouse"), f("general_store", "Link", "Warehouse"), f("quarantine_warehouse", "Link", "Warehouse"),
	sb("w3", "Service items"),
	f("consultation_item", "Link", "Item"), f("follow_up_item", "Link", "Item"), cb("w4"),
	f("registration_item", "Link", "Item"), f("registration_fee", "Currency"),

	tab("ipd_tab", "IPD"),
	f("mar_billing_trigger", "Select", ["On administration", "At discharge"], default="On administration"),
	f("stock_deduction_timing", "Select", ["Immediately", "At discharge"], default="Immediately"),
	f("allow_negative_stock", "Check"), cb("i1"),
	f("diet_billing_mode", "Select", ["Per meal", "Per day", "Included in bed charge"], default="Per day"),
	f("procedure_invoice_trigger", "Select", ["On completion", "At discharge"], default="At discharge"),
	f("discharge_clearance_hold", "Check", default="1"),

	tab("appointments_tab", "Appointments"),
	f("enable_web_booking", "Check", default="1"), f("enable_whatsapp_booking", "Check", default="1"),
	f("walk_in_mode", "Select", ["Token", "Slot"], default="Token"),
	f("slot_window_days", "Int", default="14"), f("slot_minutes", "Int", default="15"),
	f("slot_hold_minutes", "Int", default="10"), f("no_show_release_minutes", "Int", default="30"), cb("a1"),
	f("auto_confirm", "Check", default="1", description="Off: staff confirm each booking"),
	f("web_payment_channels", "Small Text", default="At Clinic\nPayment Proof", description="One per line: Online, Payment Proof, At Clinic"),
	f("whatsapp_payment_channels", "Small Text", default="At Clinic\nPayment Proof"),
	f("reschedule_cutoff_hours", "Int", default="3"), f("cancel_cutoff_hours", "Int", default="2"), cb("a2"),
	f("reminder_evening_before", "Check", default="1"), f("reminder_evening_time", "Time", default="19:00:00"),
	f("reminder_hours_before", "Int", default="3"),
	f("one_booking_per_doctor_per_day", "Check", default="1"),
	f("max_unpaid_pending_per_phone", "Int", default="3"),
	f("day_shift_start", "Time", default="07:00:00", description="Day / night filter on the appointments screen"),
	f("night_shift_start", "Time", default="17:00:00"), f("otp_minutes", "Int", default="5", label="OTP Validity (minutes)"),

	tab("messaging_tab", "Messaging"),
	f("message_mode", "Select", ["Test (no provider)", "Live"], default="Test (no provider)",
		description="Test mode logs messages as Sent without calling any provider. Live reads credentials from site_config.json."),
	f("default_country_code", "Data", default="+92"), f("sender_name", "Data", default="VVS Hospital"), cb("ms1"),
	f("quiet_hours_start", "Time", default="22:00:00"), f("quiet_hours_end", "Time", default="08:00:00"),
	f("max_send_attempts", "Int", default="3"),

	tab("billing_tab", "Billing"),
	f("discount_rules", "Table", "Discount Rule"), f("discount_approvers", "Table", "Discount Approver"),
	cb("b1"), f("doctor_share_basis", "Select", ["At invoice", "On payment"], default="At invoice"),

	*PHASE2_SETTINGS,
	*PHASE3_SETTINGS,
	*PHASE4_SETTINGS,

	tab("security_tab", "Security"),
	f("enforce_two_factor", "Check", description="Two-factor login for PW Admin, Accountant, Cash Supervisor and Pathologist"),
	f("idle_lock_minutes", "Int", default="15"), cb("s1"),
	f("interaction_lookback_days", "Int", default="30", label="Interaction Check: Prescriptions in Last N Days"),
	f("show_first_name_on_display", "Check", label="Show First Name on Waiting Display"),

	tab("access_tab", "Page Access"),
	f("page_access", "Table", "Page Access Rule"),
], [p("System Manager", "rwc"), p(ADMIN, "rwc")] + ALL_STAFF_READ, issingle=1, track_changes=1)

# ---------------------------------------------------------------- masters
MASTERS = [
	doctype("Medical Department", M, [
		f("department_name", "Data", reqd=1, unique=1, list=1), *names3("department_name"),
		f("color", "Color"), f("is_active", "Check", default="1"),
	], master_perms(), autoname="field:department_name", track_changes=1),
	doctype("Specialization", M, [
		f("specialization", "Data", reqd=1, unique=1, list=1), *names3("specialization"),
		f("department", "Link", "Medical Department", list=1),
	], master_perms(), autoname="field:specialization"),
	doctype("Doctor Schedule", M, [
		f("day", "Select", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], reqd=1, list=1, columns=2),
		f("start_time", "Time", reqd=1, list=1, columns=2), f("end_time", "Time", reqd=1, list=1, columns=2),
		f("branch", "Link", "Branch", list=1, columns=2), f("max_patients", "Int", list=1, columns=2),
	], istable=1),
	doctype("Doctor", M, [
		f("doctor_name", "Data", reqd=1, list=1, global_search=1), *names3("doctor_name"),
		f("doctor_type", "Select", ["Internal", "Visiting", "External Referring"], default="Internal", list=1, filter=1),
		f("specialization", "Link", "Specialization", list=1, filter=1),
		f("department", "Link", "Medical Department", filter=1),
		cb("d1"),
		f("user", "Link", "User"), f("branch", "Link", "Branch", filter=1),
		f("consultation_room", "Data"), f("color", "Color"), f("is_active", "Check", default="1"),
		f("photo", "Attach Image"),
		sb("d2", "Fees"), f("default_fee", "Currency"), f("follow_up_fee", "Currency"), cb("d3"),
		f("revisit_days", "Int", default="7", description="Prescription follow-up date default"),
		f("online_visits", "Check", description="Takes online (video) consultations"),
		f("slot_minutes", "Int", description="Overrides Clinic Settings"),
		sb("d4", "Registration (shown on prints)"),
		f("registration_no", "Data", label="PMDC Registration No."), f("qualification", "Data"), cb("d5"),
		f("show_license", "Check", default="1"), f("signature", "Attach Image"),
		sb("d6", "Availability"), f("schedule", "Table", "Doctor Schedule"),
	], master_perms(), autoname="DR-.####", title_field="doctor_name", search_fields="doctor_name,specialization",
		show_title_field_in_link=1, image_field="photo", track_changes=1),
	doctype("Doctor Leave", M, [
		f("doctor", "Link", "Doctor", reqd=1, list=1), f("doctor_name", "Data", fetch_from="doctor.doctor_name", ro=1),
		f("from_date", "Date", reqd=1, list=1), f("to_date", "Date", reqd=1, list=1), cb("l1"),
		f("branch", "Link", "Branch"), f("reason", "Small Text"),
	], master_perms(RECEPTIONIST), autoname="DL-.YYYY.-.####", track_changes=1),
	doctype("Blocked Date", M, [
		f("blocked_date", "Date", reqd=1, list=1), f("branch", "Link", "Branch", list=1, description="Empty = all branches"),
		f("reason", "Data", list=1),
	], master_perms(), autoname="BD-.YYYY.-.####"),
	doctype("Generic Name", M, [
		f("generic_name", "Data", reqd=1, unique=1, list=1), f("drug_class", "Link", "Drug Class", list=1),
	], master_perms(REVIEWER, STORE_KEEPER), autoname="field:generic_name"),
	doctype("Drug Class", M, [
		f("class_name", "Data", reqd=1, unique=1, list=1),
		f("duplicate_therapy", "Check", description="Warn when two drugs of this class are prescribed together"),
	], master_perms(REVIEWER), autoname="field:class_name"),
	doctype("Allergy Generic", M, [f("generic", "Link", "Generic Name", reqd=1, list=1)], istable=1),
	doctype("Allergy Drug Class", M, [f("drug_class", "Link", "Drug Class", reqd=1, list=1)], istable=1),
	doctype("Allergy", M, [
		f("allergy_name", "Data", reqd=1, unique=1, list=1), f("allergy_type", "Select", ["Drug", "Food", "Other"], default="Drug", list=1, filter=1),
		f("generics", "Table", "Allergy Generic"), f("drug_classes", "Table", "Allergy Drug Class"),
	], master_perms(DOCTOR, REVIEWER), autoname="field:allergy_name"),
	doctype("Diagnosis", M, [
		f("icd_code", "Data", reqd=1, unique=1, list=1, label="ICD-10 Code"), f("diagnosis_name", "Data", reqd=1, list=1, global_search=1),
		f("category", "Data", list=1, filter=1),
	], master_perms(DOCTOR), autoname="field:icd_code", title_field="diagnosis_name", search_fields="diagnosis_name",
		show_title_field_in_link=1),
	doctype("Drug Interaction", M, [
		f("generic_a", "Link", "Generic Name", reqd=1, list=1), f("generic_b", "Link", "Generic Name", reqd=1, list=1),
		f("severity", "Select", ["Minor", "Moderate", "Major", "Contraindicated"], reqd=1, list=1, filter=1),
		f("clinical_note", "Small Text"), f("source", "Data", description="Reference list the pharmacist chose"),
		f("is_demo", "Check", ro=1),
	], master_perms(REVIEWER), autoname="hash", track_changes=1),
]

# ---------------------------------------------------------------- patients
PATIENT_CHILDREN = [
	doctype("Patient Allergy", M, [
		f("allergy", "Link", "Allergy", reqd=1, list=1, columns=3),
		f("severity", "Select", ["Mild", "Moderate", "Severe"], list=1, columns=2), f("reaction", "Data", list=1, columns=4),
	], istable=1),
	doctype("Patient Condition", M, [
		f("diagnosis", "Link", "Diagnosis", reqd=1, list=1, columns=4),
		f("diagnosis_name", "Data", fetch_from="diagnosis.diagnosis_name", ro=1, list=1, columns=4),
		f("since", "Date", list=1, columns=2),
	], istable=1),
	doctype("Patient Long Term Medicine", M, [
		f("item", "Link", "Item", reqd=1, list=1, columns=3), f("generic", "Link", "Generic Name", list=1, columns=3),
		f("dose", "Data", list=1, columns=2), f("since", "Date", list=1, columns=2),
	], istable=1),
	doctype("Emergency Contact", M, [
		f("contact_name", "Data", reqd=1, list=1, columns=3), f("relation", "Data", list=1, columns=2),
		f("phone", "Data", list=1, columns=3),
	], istable=1),
	doctype("Patient Consent", M, [
		f("consent_type", "Select", ["WhatsApp messages", "SMS messages", "Data processing"], reqd=1, list=1, columns=3),
		f("status", "Select", ["Given", "Withdrawn"], reqd=1, list=1, columns=2),
		f("recorded_on", "Datetime", list=1, columns=3), f("recorded_by", "Link", "User", list=1, columns=2),
	], istable=1),
	doctype("Household Member", M, [
		f("patient", "Link", "Patient", reqd=1, list=1, columns=3),
		f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1, columns=4),
		f("relation", "Select", ["Head", "Spouse", "Son", "Daughter", "Father", "Mother", "Brother", "Sister", "Other"], list=1, columns=2),
	], istable=1),
]

_patient_readers = [p(r, "r") for r in (PHARMACY_CASHIER, DISPENSER, LAB_USER, PATHOLOGIST, REVIEWER, FINDER,
	ACCOUNTANT, CASH_SUPERVISOR, NURSE, DEO, OV_STAFF, OV_DOCTOR, DOCTOR)]
PATIENT = doctype("Patient", M, [
	f("patient_name", "Data", reqd=1, list=1, global_search=1, bold=1),
	f("patient_name_ur", "Data", label="Name (Urdu)"), f("patient_name_ar", "Data", label="Name (Arabic)"),
	f("relation_type", "Select", ["", "S/O", "D/O", "W/O", "C/O"]), f("guardian_name", "Data", label="Father / Husband Name"),
	cb("p1"),
	f("gender", "Select", ["Male", "Female", "Other"], reqd=1, list=1, filter=1),
	f("dob", "Date", label="Date of Birth"), f("dob_estimated", "Check", label="DOB Estimated from Age"),
	f("phone", "Data", options="Phone", list=1, filter=1, global_search=1, search_index=1),
	f("alt_phone", "Data", options="Phone", label="Alternate Phone"),
	f("preferred_language", "Select", ["en", "ur", "ar"], default="ur"),
	cb("p2"),
	f("branch", "Link", "Branch", reqd=1, filter=1, label="Registered at Branch"),
	f("category", "Select", ["Normal", "Panel", "Insurance", "Staff", "Welfare"], default="Normal", list=1, filter=1),
	f("photo", "Attach Image"), f("blood_group", "Select", ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"], permlevel=1),
	sb("p3", "Address"), f("address", "Small Text"), cb("p4"), f("city", "Data", default="Lahore", filter=1),
	sb("id_sec", "Identity"),
	f("cnic", "Password", label="CNIC / B-form", description="Stored encrypted"),
	f("cnic_masked", "Data", ro=1, label="CNIC"), cb("p5"),
	f("cnic_hash", "Data", hidden=1, ro=1, search_index=1), f("cnic_last4", "Data", hidden=1, ro=1),
	f("legacy_mr_no", "Data", label="Legacy MR No.", search_index=1),
	sb("payer_sec", "Payer", depends_on="eval:doc.category!='Normal'"),
	f("panel", "Link", "Customer", depends_on="eval:doc.category=='Panel'"), f("employee_id", "Data", depends_on="eval:doc.category=='Panel'"),
	f("panel_relation", "Select", ["", "Self", "Dependent"], depends_on="eval:doc.category=='Panel'"), cb("p6"),
	f("insurance_provider", "Link", "Customer", depends_on="eval:doc.category=='Insurance'"),
	f("policy_no", "Data", depends_on="eval:doc.category=='Insurance'"),
	f("policy_valid_till", "Date", depends_on="eval:doc.category=='Insurance'"),
	f("welfare_scheme", "Data", depends_on="eval:doc.category=='Welfare'"),
	tab("clinical_tab", "Clinical"),
	f("allergies", "Table", "Patient Allergy", permlevel=1), f("chronic_conditions", "Table", "Patient Condition", permlevel=1),
	f("long_term_medicines", "Table", "Patient Long Term Medicine", permlevel=1),
	tab("contacts_tab", "Contacts & Consent"),
	f("emergency_contacts", "Table", "Emergency Contact"), f("consents", "Table", "Patient Consent"),
	cb("c1"),
	f("whatsapp_consent", "Check", ro=1), f("sms_consent", "Check", ro=1), f("data_consent", "Check", ro=1),
	tab("links_tab", "Links"),
	f("customer", "Link", "Customer", ro=1), f("household", "Link", "Household", ro=1), cb("l1"),
	f("disabled", "Check", filter=1), f("merged_into", "Link", "Patient", ro=1),
	f("temporary_record", "Check", ro=1, filter=1, description="Unknown ER patient on a temporary MR; merge into the real record once identified"),
	f("duplicate_reason", "Small Text", ro=1, description="Why the user created a new record despite a possible duplicate"),
	f("registered_by", "Link", "User", ro=1),
], [
	p("System Manager", "rwcd"), p("System Manager", "rw", permlevel=1),
	p(ADMIN, "rwcdeR"), p(ADMIN, "rw", permlevel=1),
	p(RECEPTIONIST, "rwcR"), p(RECEPTIONIST, "rw", permlevel=1),
	p(DOCTOR, "rw"), p(DOCTOR, "rw", permlevel=1), p(NURSE, "r", permlevel=1), p(DEO, "rwc"), p(DEO, "rw", permlevel=1),
	p(REVIEWER, "r", permlevel=1), p(PATHOLOGIST, "r", permlevel=1), p(OV_DOCTOR, "r", permlevel=1),
] + [x for x in _patient_readers if x["role"] not in (DOCTOR, DEO)],
	title_field="patient_name", search_fields="patient_name,phone,legacy_mr_no", show_title_field_in_link=1,
	image_field="photo", track_changes=1, sort_field="creation")

HOUSEHOLD = doctype("Household", M, [
	f("household_name", "Data", reqd=1, list=1), f("phone", "Data", reqd=1, list=1, search_index=1),
	f("head", "Link", "Patient", list=1), f("members", "Table", "Household Member"),
], [p(ADMIN, "rwcd"), p(RECEPTIONIST, "rwc"), p(DEO, "rwc")] + [p(r, "r") for r in (DOCTOR, NURSE, ACCOUNTANT)],
	autoname="HH-.#####", track_changes=1)

AUDIT = [
	doctype("Patient Merge Log", M, [
		f("survivor", "Link", "Patient", reqd=1, list=1), f("duplicate", "Link", "Patient", reqd=1, list=1),
		f("merged_by", "Link", "User", list=1), f("merged_on", "Datetime", list=1), f("moved", "Code", options="JSON", label="Moved Records"),
	], [p(ADMIN, "r"), p("System Manager", "r")], autoname="PML-.#####", in_create=1),
	doctype("Clinical Access Log", M, [
		f("user", "Link", "User", list=1, filter=1), f("action", "Data", list=1, filter=1),
		f("patient", "Link", "Patient", list=1, filter=1),
		f("reference_doctype", "Link", "DocType", filter=1), f("reference_name", "Dynamic Link", "reference_doctype"),
		cb("a1"), f("accessed_on", "Datetime", list=1), f("ip_address", "Data"), f("branch", "Link", "Branch"),
		f("details", "Small Text"),
	], [p(ADMIN, "rR"), p("System Manager", "r")], autoname="hash", in_create=1, sort_field="creation"),
]


def all_doctypes():
	return CHILDREN + [SETTINGS] + MASTERS + PATIENT_CHILDREN + [PATIENT, HOUSEHOLD] + AUDIT
