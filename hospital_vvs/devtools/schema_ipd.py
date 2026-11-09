"""IPD masters pulled forward (user request 2026-11-06): wards, beds and the live bed map.
Admission → discharge (Bed Allotment, MAR, billing) is Phase 3."""

from hospital_vvs.devtools.dt import cb, doctype, f, p, sb
from hospital_vvs.roles import ACCOUNTANT, ADMIN, DEO, DOCTOR, NURSE, RECEPTIONIST

IPD = "IPD"
BED_STATUS = ["Available", "Occupied", "Reserved", "Cleaning", "Maintenance"]

WARD = doctype("Ward", IPD, [
	f("ward_name", "Data", reqd=1, list=1), f("ward_name_ur", "Data", label="Name (Urdu)"),
	f("ward_type", "Select", ["General", "Semi-Private", "Private", "ICU", "CCU", "NICU", "HDU", "Emergency", "Maternity", "Day Care"],
		default="General", list=1, filter=1),
	f("gender", "Select", ["Mixed", "Male", "Female", "Children"], default="Mixed", list=1), cb("w1"),
	f("branch", "Link", "Branch", reqd=1, list=1, filter=1), f("floor", "Data", list=1), f("nursing_station", "Link", "Nursing Station"),
	f("color", "Color"), f("sort_order", "Int"), f("is_active", "Check", default="1"),
	sb("w2", "Charges"), f("bed_charge_per_day", "Currency"), cb("w3"), f("nursing_charge_per_shift", "Currency"),
	f("icu_surcharge_per_day", "Currency", label="ICU Surcharge per Day", description="Added to the bed charge for every day in this ward"),
	f("bed_charge_item", "Link", "Item"),
], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(NURSE, "r"), p(DOCTOR, "r"), p(RECEPTIONIST, "r"), p(ACCOUNTANT, "r"), p(DEO, "r")],
	autoname="field:ward_name", track_changes=1)

BED = doctype("Hospital Bed", IPD, [
	f("bed_no", "Data", reqd=1, list=1), f("ward", "Link", "Ward", reqd=1, list=1, filter=1),
	f("branch", "Link", "Branch", fetch_from="ward.branch", ro=1, filter=1), f("room", "Data", list=1),
	cb("b1"),
	f("bed_type", "Select", ["Standard", "Electric", "ICU", "Ventilator", "Cradle", "Couch", "Trolley"], default="Standard", list=1),
	f("status", "Select", BED_STATUS, default="Available", list=1, filter=1, ro=1),
	f("daily_rate", "Currency", description="Empty = the ward's bed charge"), f("has_oxygen", "Check"), f("has_monitor", "Check"),
	sb("b2", "Current"), f("current_patient", "Link", "Patient", ro=1), f("patient_name", "Data", ro=1), cb("b3"),
	f("occupied_since", "Datetime", ro=1), f("expected_discharge", "Datetime", ro=1), f("agreed_rate", "Currency", ro=1),
	f("attending_doctor", "Link", "Doctor", ro=1), f("reserved_until", "Datetime", ro=1), f("admission_reason", "Small Text", ro=1),
	f("status_note", "Small Text", ro=1),
	sb("b4", "Map position", collapsible=1), f("pos_x", "Int", description="0–100 across the ward plan"), cb("b5"),
	f("pos_y", "Int", description="0–100 down the ward plan"), f("is_active", "Check", default="1"),
], [p("System Manager", "rwcd"), p(ADMIN, "rwcdR"), p(NURSE, "rw"), p(DOCTOR, "r"), p(RECEPTIONIST, "rw"), p(ACCOUNTANT, "r"), p(DEO, "r")],
	autoname="format:{ward}-{bed_no}", title_field="bed_no", track_changes=1, sort_field="bed_no", sort_order="ASC")

BED_LOG = doctype("Bed Status Log", IPD, [
	f("bed", "Link", "Hospital Bed", reqd=1, list=1, filter=1), f("ward", "Link", "Ward", list=1, filter=1),
	f("from_status", "Data", list=1), f("to_status", "Data", list=1), cb("l1"),
	f("patient", "Link", "Patient", list=1), f("changed_by", "Link", "User"), f("changed_on", "Datetime", list=1), f("note", "Small Text"),
], [p(ADMIN, "rR"), p(NURSE, "r"), p("System Manager", "r")], autoname="hash", in_create=1)


def all_doctypes():
	return [WARD, BED, BED_LOG]
