"""Phase 3: IPD admission → discharge, Emergency, nurse roster (06-ipd.md)."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb, tab
from hospital_vvs.roles import ACCOUNTANT, ADMIN, CASH_SUPERVISOR, DEO, DOCTOR, NURSE, RECEPTIONIST, REVIEWER, STORE_KEEPER

IPD = "IPD"
ER = "Emergency"
CLIN = [DOCTOR, NURSE]
CHARGE_TYPES = ["Bed", "ICU", "Nursing", "Medicine", "Procedure", "Lab", "Consumable", "Diet", "Oxygen", "Ad-hoc", "ER", "Package"]
PAYER = ["Patient", "Panel", "Insurance", "Welfare"]
DISCHARGE_TYPES = ["Normal", "LAMA", "Referred", "Expired"]


def _ref(admission=True, er=True):
	"""Link fields every clinical record carries: the admission and/or the ER visit, patient, branch."""
	out = []
	if admission:
		out.append(f("bed_allotment", "Link", "Bed Allotment", list=1, filter=1, label="Admission"))
	if er:
		out.append(f("er_visit", "Link", "ER Visit", filter=1, label="ER Visit"))
	out += [f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
		f("branch", "Link", "Branch", filter=1)]
	return out


_clin_perm = [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(DOCTOR, "rwc"), p(NURSE, "rwc"), p(DEO, "rwc"), p(RECEPTIONIST, "r"), p(ACCOUNTANT, "r")]
_signed_perm = [p("System Manager", "rwcdsxa"), p(ADMIN, "rwcdsxaR"), p(DOCTOR, "rwcsxa"), p(NURSE, "rwcs"), p(DEO, "rwc"), p(RECEPTIONIST, "r")]
_master_perm = [p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(DOCTOR, "r"), p(NURSE, "r"), p(RECEPTIONIST, "r"), p(ACCOUNTANT, "r")]

MASTERS = [
	doctype("Diet Type", IPD, [
		f("diet_name", "Data", reqd=1, unique=1, list=1), f("diet_name_ur", "Data", label="Name (Urdu)"), cb("d1"),
		f("per_meal_rate", "Currency", list=1), f("per_day_rate", "Currency", list=1), f("is_active", "Check", default="1"),
	], _master_perm, autoname="field:diet_name", sort_field="diet_name", sort_order="ASC"),
	doctype("Procedure Type", IPD, [
		f("procedure_name", "Data", reqd=1, unique=1, list=1), f("department", "Link", "Medical Department", list=1, filter=1),
		f("category", "Select", ["Minor", "Major", "Bedside", "Diagnostic", "Delivery"], default="Minor", list=1), cb("pt1"),
		f("price", "Currency", list=1, description="Surgeon / procedure fee"), f("theatre_charge", "Currency"),
		f("anesthesia_charge", "Currency"), f("requires_consent", "Check", default="1"), f("requires_preauth", "Check", label="Insurance Pre-Auth Required"),
		f("item", "Link", "Item", ro=1, description="Created automatically"), f("is_active", "Check", default="1"),
	], _master_perm, autoname="field:procedure_name", track_changes=1, sort_field="procedure_name", sort_order="ASC"),
	doctype("Package Inclusion", IPD, [
		f("charge_type", "Select", CHARGE_TYPES[:-1], reqd=1, list=1, columns=4),
		f("limit_amount", "Currency", list=1, columns=3, description="0 = fully covered"),
	], istable=1),
	doctype("Service Package", IPD, [
		f("package_name", "Data", reqd=1, unique=1, list=1), f("procedure_type", "Link", "Procedure Type", list=1),
		f("ward_type", "Data", description="Empty = any ward"), cb("sp1"),
		f("price", "Currency", reqd=1, list=1), f("days", "Int", default="1", label="Days Included", list=1,
			description="Bed days beyond this are charged normally"),
		f("item", "Link", "Item", ro=1), f("is_active", "Check", default="1"),
		sb("sp2", "What the package covers"), f("inclusions", "Table", "Package Inclusion"), f("description", "Small Text"),
	], _master_perm + [p(ACCOUNTANT, "rw")], autoname="field:package_name", track_changes=1),
	doctype("Insurance Pre-Auth", IPD, [
		f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
		f("payer", "Link", "Customer", reqd=1, list=1, filter=1), f("policy_no", "Data"), cb("pa1"),
		f("bed_allotment", "Link", "Bed Allotment", label="Admission"), f("procedure_type", "Link", "Procedure Type"),
		f("status", "Select", ["Requested", "Approved", "Partially Approved", "Rejected", "Expired"], default="Requested", list=1, filter=1),
		sb("pa2", "Amounts"), f("requested_amount", "Currency", list=1), f("approved_amount", "Currency", list=1), cb("pa3"),
		f("approval_no", "Data"), f("valid_till", "Date"), f("decided_on", "Date"),
		sb("pa4", "Documents"), f("documents", "Attach"), f("notes", "Small Text"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(ACCOUNTANT, "rwcR"), p(RECEPTIONIST, "rwc"), p(DOCTOR, "r")],
		autoname="PA-.YYYY.-.#####", track_changes=1, title_field="patient_name"),
]

ADMISSION = [
	doctype("Bed Transfer Segment", IPD, [
		f("bed", "Link", "Hospital Bed", reqd=1, list=1, columns=2), f("ward", "Link", "Ward", list=1, columns=2), f("ward_type", "Data", ro=1),
		f("from_time", "Datetime", reqd=1, list=1, columns=2), f("to_time", "Datetime", list=1, columns=2),
		f("daily_rate", "Currency", list=1, columns=1), f("icu_surcharge", "Currency", columns=1), f("reason", "Data"),
	], istable=1),
	doctype("Admission Consultant", IPD, [f("doctor", "Link", "Doctor", reqd=1, list=1), f("doctor_name", "Data", fetch_from="doctor.doctor_name", ro=1, list=1)],
		istable=1),
	doctype("Bed Allotment", IPD, [
		tab("t_adm", "Admission"),
		f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1, global_search=1),
		f("gender", "Data", fetch_from="patient.gender", ro=1), f("branch", "Link", "Branch", reqd=1, filter=1), f("company", "Link", "Company", ro=1),
		cb("a1"),
		f("status", "Select", ["Admitted", "Discharge Pending", "Discharged", "Cancelled"], default="Admitted", list=1, filter=1),
		f("admit_datetime", "Datetime", reqd=1, list=1), f("expected_discharge", "Datetime"), f("planned_days", "Int", default="1"),
		f("release_datetime", "Datetime", ro=1, label="Actual Release"),
		cb("a2"),
		f("bed", "Link", "Hospital Bed", ro=1, list=1, label="Current Bed"), f("ward", "Link", "Ward", ro=1, filter=1),
		f("admitting_doctor", "Link", "Doctor", reqd=1, list=1), f("doctor_name", "Data", fetch_from="admitting_doctor.doctor_name", ro=1),
		sb("a3", "Why"),
		f("source", "Select", ["Direct", "OPD", "ER", "Transfer"], default="Direct", list=1, filter=1), f("er_visit", "Link", "ER Visit"),
		f("opd_slip", "Link", "OPD Slip"), f("readmission_of", "Link", "Bed Allotment"), cb("a4"),
		f("reason", "Small Text", label="Reason for Admission"), f("provisional_diagnosis", "Small Text", permlevel=1),
		f("consultants", "Table", "Admission Consultant"),
		tab("t_bill", "Billing"),
		f("payer_type", "Select", PAYER, default="Patient", list=1, label="Billing Mode"), f("payer", "Link", "Customer"),
		f("pre_auth", "Link", "Insurance Pre-Auth"), f("coverage_percent", "Percent", ro=1), cb("b1"),
		f("service_package", "Link", "Service Package"), f("daily_rate", "Currency", description="Agreed bed rate (empty = the bed's rate)"),
		f("nursing_charge_per_shift", "Currency", description="Empty = the ward's rate"),
		sb("b2", "Totals"), f("charges_total", "Currency", ro=1, label="Running Bill"), f("advance_total", "Currency", ro=1, label="Advances"),
		cb("b3"), f("final_invoice", "Link", "Sales Invoice", ro=1), f("payer_invoice", "Link", "Sales Invoice", ro=1),
		f("discount_amount", "Currency", ro=1), f("discount_authorization", "Link", "Discount Authorization", ro=1),
		tab("t_stay", "Stay"),
		f("segments", "Table", "Bed Transfer Segment", label="Bed History"),
		tab("t_dis", "Discharge"),
		f("discharge_type", "Select", [""] + DISCHARGE_TYPES), f("discharge_summary", "Link", "Discharge Summary", ro=1), cb("d1"),
		f("clearance_override", "Check", ro=1), f("clearance_override_reason", "Small Text", ro=1), f("clearance_override_by", "Link", "User", ro=1),
		f("comms_profile", "Link", "Patient Comms Profile", ro=1),
	], [p("System Manager", "rwcd"), p("System Manager", "rw", permlevel=1), p(ADMIN, "rwcdR"), p(ADMIN, "rw", permlevel=1),
		p(DOCTOR, "rwc"), p(DOCTOR, "rw", permlevel=1), p(NURSE, "rw"), p(NURSE, "r", permlevel=1), p(RECEPTIONIST, "rwc"),
		p(ACCOUNTANT, "rR"), p(CASH_SUPERVISOR, "r"), p(DEO, "r")],
		autoname="ADM-.YYYY.-.#####", track_changes=1, title_field="patient_name", search_fields="patient,bed"),
	doctype("IPD Charge", IPD, [
		*_ref(), cb("c1"),
		f("charge_type", "Select", CHARGE_TYPES, reqd=1, list=1, filter=1), f("item_code", "Link", "Item", reqd=1, list=1),
		f("description", "Data"), cb("c2"),
		f("qty", "Float", default="1", list=1), f("rate", "Currency", list=1), f("amount", "Currency", ro=1, list=1),
		sb("c3", "Source"), f("posted_at", "Datetime", list=1), f("posted_by", "Link", "User", ro=1),
		f("reference_doctype", "Link", "DocType"), f("reference_name", "Dynamic Link", "reference_doctype"), cb("c4"),
		f("status", "Select", ["Open", "Billed", "Cancelled"], default="Open", list=1, filter=1), f("sales_invoice", "Link", "Sales Invoice", ro=1),
		f("stock_entry", "Link", "Stock Entry", ro=1), f("warehouse", "Link", "Warehouse"), f("note", "Small Text"),
		f("cancel_reason", "Small Text", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(NURSE, "rc"), p(DOCTOR, "rc"), p(RECEPTIONIST, "rc"), p(ACCOUNTANT, "rR")],
		autoname="CHG-.YYYY.-.######", track_changes=1),
	doctype("IPD Note", IPD, [
		*_ref(), cb("n1"),
		f("note_type", "Select", ["Progress", "Nursing", "Consultant Visit", "Handover", "ER", "Procedure"], default="Progress", list=1, filter=1),
		f("recorded_at", "Datetime", list=1), f("doctor", "Link", "Doctor"), f("author", "Link", "User", ro=1),
		sb("n2"), f("note", "Text", reqd=1, permlevel=0), f("amendment_reason", "Small Text"),
	], _signed_perm, autoname="NOTE-.YYYY.-.######", is_submittable=1, track_changes=1, title_field="note_type"),
	doctype("Ward Round", IPD, [
		*_ref(er=False), cb("r1"),
		f("round_no", "Int", ro=1, list=1), f("doctor", "Link", "Doctor", reqd=1, list=1), f("round_at", "Datetime", list=1),
		sb("r2"), f("findings", "Text"), f("plan", "Text"), f("orders", "Small Text", description="New orders written on this round"),
	], _signed_perm, autoname="WR-.YYYY.-.######", is_submittable=1, track_changes=1),
	doctype("IPD Medication Order", IPD, [
		*_ref(), cb("m1"),
		f("item", "Link", "Item", reqd=1, list=1), f("item_name", "Data", fetch_from="item.item_name", ro=1, list=1),
		f("dose", "Data", reqd=1, list=1, description="As written: 1 tab, 500 mg, 5 ml"),
		f("units_per_dose", "Float", default="1", description="Stock units issued and billed per dose"),
		f("route", "Select", ["Oral", "IV", "IM", "SC", "Inhalation", "Topical", "PR", "SL", "NG", "Other"], default="Oral", list=1),
		cb("m2"),
		f("frequency", "Select", ["OD", "BD", "TDS", "QID", "Q4H", "Q6H", "Q8H", "HS", "STAT", "PRN"], default="BD", list=1),
		f("times", "Data", description="Comma-separated, e.g. 08:00,20:00 (empty = from the frequency)"),
		f("start_at", "Datetime"), f("days", "Int", default="3"),
		f("status", "Select", ["Active", "Stopped", "Completed"], default="Active", list=1, filter=1),
		sb("m3", "Doctor"), f("doctor", "Link", "Doctor"), f("ordered_by", "Link", "User", ro=1), cb("m4"),
		f("alert_type", "Data", ro=1), f("alert_message", "Small Text", ro=1), f("override_reason", "Small Text"),
		f("stop_reason", "Small Text"), f("stopped_by", "Link", "User", ro=1), f("prescription", "Link", "Prescription", ro=1, description="Ward order sent to the contract pharmacy"),
	], _clin_perm + [p(REVIEWER, "r")], autoname="MO-.YYYY.-.######", track_changes=1, title_field="item_name"),
	doctype("MAR Entry", IPD, [
		*_ref(), f("medication_order", "Link", "IPD Medication Order", reqd=1, filter=1), cb("e1"),
		f("item", "Link", "Item", list=1), f("item_name", "Data", ro=1, list=1), f("dose", "Data", list=1), f("route", "Data"),
		f("qty_units", "Float", default="1"), cb("e2"),
		f("scheduled_at", "Datetime", list=1),
		f("status", "Select", ["Scheduled", "Pending Approval", "Approved", "Administered", "Missed", "Refused", "Held", "Cancelled"],
			default="Scheduled", list=1, filter=1),
		f("administered_by", "Link", "User", ro=1), f("administered_at", "Datetime", ro=1), f("approved_by", "Link", "User", ro=1),
		sb("e3", "Stock & bill"), f("batch_no", "Data", ro=1), f("stock_entry", "Link", "Stock Entry", ro=1), cb("e4"),
		f("billed", "Check", ro=1), f("ipd_charge", "Link", "IPD Charge", ro=1), f("reason", "Small Text", label="Missed / Refused / Held Reason"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(NURSE, "rw"), p(DOCTOR, "rw"), p(DEO, "r"), p(REVIEWER, "r")],
		autoname="MAR-.YYYY.-.#######", track_changes=1, sort_field="scheduled_at", sort_order="ASC"),
	doctype("Diet Order", IPD, [
		*_ref(er=False), cb("do1"),
		f("diet_date", "Date", reqd=1, list=1), f("diet_type", "Link", "Diet Type", reqd=1, list=1),
		f("status", "Select", ["Ordered", "Served", "Cancelled"], default="Ordered", list=1, filter=1),
		sb("do2", "Meals"), f("breakfast", "Check", default="1"), f("lunch", "Check", default="1"), cb("do3"), f("dinner", "Check", default="1"),
		f("snacks", "Check"), sb("do4"), f("instructions", "Small Text"), cb("do5"), f("charge", "Currency", ro=1), f("ipd_charge", "Link", "IPD Charge", ro=1),
	], _clin_perm, autoname="DIET-.YYYY.-.######", track_changes=1),
	doctype("Procedure Team Member", IPD, [
		f("role", "Select", ["Surgeon", "Assistant", "Anesthetist", "Scrub Nurse", "Circulating Nurse", "Technician"], list=1, columns=3),
		f("doctor", "Link", "Doctor", list=1, columns=3), f("person_name", "Data", list=1, columns=4),
	], istable=1),
	doctype("IPD Procedure", IPD, [
		*_ref(), cb("pr1"),
		f("procedure_type", "Link", "Procedure Type", reqd=1, list=1), f("scheduled_at", "Datetime", list=1),
		f("theatre", "Select", ["Major OT", "Minor OT", "Procedure Room", "Bedside", "Labour Room", "Cath Lab"], default="Minor OT", list=1),
		f("anesthesia", "Select", ["None", "Local", "Regional", "Spinal", "General", "Sedation"], default="Local"),
		cb("pr2"),
		f("status", "Select", ["Scheduled", "In Progress", "Completed", "Cancelled"], default="Scheduled", list=1, filter=1),
		f("consent", "Link", "Consent Form", ro=1), f("pre_auth", "Link", "Insurance Pre-Auth"), f("completed_at", "Datetime", ro=1),
		sb("pr3", "Team"), f("team", "Table", "Procedure Team Member"),
		sb("pr4", "Charges"), f("procedure_fee", "Currency"), f("theatre_charge", "Currency"), cb("pr5"), f("anesthesia_charge", "Currency"),
		f("ipd_charge", "Link", "IPD Charge", ro=1),
		sb("pr6", "Notes"), f("notes", "Text", permlevel=0), f("cancel_reason", "Small Text"),
	], _clin_perm, autoname="PROC-.YYYY.-.#####", track_changes=1, title_field="procedure_type"),
	doctype("Vitals Chart", IPD, [
		*_ref(), cb("v1"), f("recorded_at", "Datetime", list=1), f("recorded_by", "Link", "User", ro=1),
		sb("v2", "Vitals"), f("bp_systolic", "Int", list=1), f("bp_diastolic", "Int", list=1), f("pulse", "Int", list=1), cb("v3"),
		f("temperature", "Float", list=1), f("spo2", "Int", list=1), f("resp_rate", "Int", label="Respiratory Rate"), cb("v4"),
		f("rbs", "Float"), f("pain_score", "Int", description="0–10"), f("gcs", "Int", label="GCS"),
		sb("v5", "Intake / output (ml)"), f("intake_ml", "Float"), cb("v6"), f("output_ml", "Float"), sb("v7"), f("note", "Small Text"),
	], _clin_perm, autoname="VIT-.YYYY.-.#######", track_changes=1, sort_field="recorded_at", sort_order="DESC"),
	doctype("Consent Form", IPD, [
		*_ref(), cb("cf1"),
		f("consent_type", "Select", ["Admission", "Procedure", "Anesthesia", "Blood Transfusion", "High Risk", "LAMA", "Other"], reqd=1, list=1),
		f("procedure", "Link", "IPD Procedure"), f("signed_at", "Datetime", list=1),
		sb("cf2", "Signed by"), f("signed_by", "Select", ["Patient", "Attendant"], default="Patient"), f("signer_name", "Data", reqd=1, list=1),
		f("relation", "Data"), cb("cf3"), f("witness_name", "Data", reqd=1), f("witness_2", "Data", label="Second Witness"),
		f("scanned_copy", "Attach"), sb("cf4"), f("details", "Small Text", label="What was explained"),
	], _signed_perm, autoname="CONS-.YYYY.-.#####", is_submittable=1, track_changes=1, title_field="consent_type"),
	doctype("Discharge Medicine", IPD, [
		f("item", "Link", "Item", list=1, columns=3), f("medicine", "Data", list=1, columns=2, description="Free text if not in the master"),
		f("dose", "Data", list=1, columns=1), f("frequency", "Data", list=1, columns=1), f("days", "Int", list=1, columns=1),
		f("instructions", "Data", list=1, columns=2),
	], istable=1),
	doctype("Discharge Summary", IPD, [
		f("bed_allotment", "Link", "Bed Allotment", reqd=1, list=1, label="Admission"), f("patient", "Link", "Patient", reqd=1, list=1),
		f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1), f("branch", "Link", "Branch"), cb("ds1"),
		f("discharge_type", "Select", DISCHARGE_TYPES, default="Normal", reqd=1, list=1, filter=1), f("doctor", "Link", "Doctor", reqd=1),
		f("signed_at", "Datetime", ro=1),
		sb("ds2", "Clinical"), f("final_diagnosis", "Small Text", reqd=1), f("treatment_summary", "Text"),
		f("procedures_done", "Small Text"), f("condition_at_discharge", "Select", ["Improved", "Stable", "Unchanged", "Deteriorated", "Expired"],
			default="Improved"),
		sb("ds3", "Discharge medicines"), f("medicines", "Table", "Discharge Medicine"),
		sb("ds4", "Follow-up"), f("follow_up_plan", "Small Text"), cb("ds5"), f("follow_up_date", "Date"), f("referred_to", "Data"),
		sb("ds6", "LAMA / death", collapsible=1), f("lama_form", "Attach", label="Signed LAMA Form"), f("death_datetime", "Datetime"),
		cb("ds7"), f("cause_of_death", "Small Text"), f("death_certificate_no", "Data"),
		f("amendment_reason", "Small Text"),
	], _signed_perm, autoname="DS-.YYYY.-.#####", is_submittable=1, track_changes=1, title_field="patient_name"),
	doctype("Patient Comms Profile", IPD, [
		f("patient", "Link", "Patient", reqd=1, list=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
		f("bed_allotment", "Link", "Bed Allotment", list=1), cb("pc1"), f("station", "Link", "Nursing Station", list=1, filter=1, description="Nursing station"),
		f("bed", "Link", "Hospital Bed"), f("active", "Check", default="1", list=1, filter=1),
		f("token_hash", "Data", hidden=1, search_index=1), f("activated_on", "Datetime", ro=1), f("deactivated_on", "Datetime", ro=1),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcd"), p(NURSE, "rw"), p(RECEPTIONIST, "r")], autoname="PCP-.#####"),
]

EMERGENCY = [
	doctype("ER Visit", ER, [
		tab("t_reg", "Arrival"),
		f("patient", "Link", "Patient", reqd=1, list=1, filter=1), f("patient_name", "Data", fetch_from="patient.patient_name", ro=1, list=1),
		f("is_unknown", "Check", ro=1, label="Unknown Patient"), f("branch", "Link", "Branch", reqd=1, filter=1), cb("r1"),
		f("arrival_at", "Datetime", reqd=1, list=1),
		f("arrival_mode", "Select", ["Walk-in", "Ambulance (1122)", "Private ambulance", "Private vehicle", "Police", "Referred"], default="Walk-in"),
		f("brought_by", "Data"), f("brought_by_phone", "Data"), cb("r2"),
		f("status", "Select", ["Waiting", "In Treatment", "Observation", "Disposed"], default="Waiting", list=1, filter=1),
		f("bay", "Link", "Hospital Bed", label="Bay / Bed"), f("assigned_doctor", "Link", "Doctor", list=1),
		f("medico_legal", "Check", label="Medico-legal Case"), f("mlc_no", "Data", label="MLC No.", depends_on="medico_legal"),
		f("police_station", "Data", depends_on="medico_legal"),
		tab("t_tri", "Triage"),
		f("triage_scale", "Data", ro=1), f("triage_level", "Data", list=1, filter=1), f("triage_rank", "Int", ro=1, description="1 = most urgent"),
		f("triage_color", "Data", ro=1), cb("t1"), f("triaged_by", "Link", "User", ro=1), f("triaged_at", "Datetime", ro=1),
		sb("t2", "Complaint & vitals"), f("chief_complaint", "Small Text", list=1), cb("t3"),
		f("bp_systolic", "Int"), f("bp_diastolic", "Int"), f("pulse", "Int"), cb("t4"), f("temperature", "Float"), f("spo2", "Int"),
		f("resp_rate", "Int"), f("gcs", "Int", label="GCS"),
		tab("t_out", "Disposition"),
		f("disposition", "Select", ["", "Discharged Home", "Admitted", "Referred Out", "LAMA", "Expired"], list=1, filter=1),
		f("disposition_at", "Datetime", ro=1), f("disposition_note", "Small Text"), cb("o1"),
		f("referred_to", "Data"), f("bed_allotment", "Link", "Bed Allotment", ro=1, label="Admission"),
		f("billing_mode", "Select", ["Running bill", "OPD-style slip"], default="Running bill"),
		f("sales_invoice", "Link", "Sales Invoice", ro=1), f("death_datetime", "Datetime", depends_on="eval:doc.disposition=='Expired'"),
		f("cause_of_death", "Small Text", depends_on="eval:doc.disposition=='Expired'"),
	], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(DOCTOR, "rwc"), p(NURSE, "rwc"), p(RECEPTIONIST, "rwc"), p(ACCOUNTANT, "r"), p(DEO, "r")],
		autoname="ER-.YYYY.-.#####", track_changes=1, title_field="patient_name", sort_field="arrival_at"),
]

SETTINGS_FIELDS = [
	tab("ipd2_tab", "Admissions"),
	f("mar_approval_gate", "Check", description="A charge nurse / doctor approves each dose before it is given"),
	f("require_preauth_for_insurance", "Check", default="1", label="Insurance Admission Needs an Approved Pre-Auth"),
	f("nursing_shift_starts", "Data", default="08:00,14:00,20:00", description="Nursing is charged per started shift"),
	f("oxygen_rate_per_hour", "Currency", default="300"), cb("ad1"),
	f("min_bed_days", "Int", default="1", description="Bed days = midnights in each bed; at least this many"),
	f("bed_charge_item", "Link", "Item"), f("icu_charge_item", "Link", "Item"), f("nursing_charge_item", "Link", "Item"),
	f("diet_charge_item", "Link", "Item"), f("oxygen_charge_item", "Link", "Item"), f("adhoc_charge_item", "Link", "Item"),
	tab("er_tab", "Emergency"),
	f("triage_scale", "Select", ["Red / Yellow / Green", "5-level (ESI)"], default="Red / Yellow / Green"),
	f("er_billing_mode", "Select", ["Running bill", "OPD-style slip"], default="Running bill"),
	cb("er1"), f("er_fee_item", "Link", "Item"), f("er_fee", "Currency", default="1500"),
	f("er_ward", "Link", "Ward", description="Bays for the ER board (default branch)"),
]


def all_doctypes():
	return MASTERS + ADMISSION + EMERGENCY
