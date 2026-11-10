"""Live bed map (Restaurant OS table-map style). Occupying, moving and freeing a bed goes through the admission (services/ipd.py)."""

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, now_datetime

from hospital_vvs import roles as R
from hospital_vvs.utils import check_branch, default_branch, publish, require_roles, user_branches

STAFF = (R.NURSE, R.RECEPTIONIST, R.DOCTOR)
TRANSITIONS = {
	"Available": ("Reserved", "Maintenance", "Occupied"),
	"Reserved": ("Available", "Occupied"),
	"Occupied": ("Cleaning",),
	"Cleaning": ("Available", "Maintenance"),
	"Maintenance": ("Available",),
}


@frappe.whitelist()
def bed_map(branch=None):
	require_roles(R.DOCTOR, R.NURSE, R.RECEPTIONIST, R.DEO, R.ACCOUNTANT, R.CASH_SUPERVISOR)
	return _bed_map(branch)


def _bed_map(branch=None):
	branch = branch or default_branch()
	check_branch(branch)
	wards = frappe.get_all("Ward", filters={"branch": branch, "is_active": 1}, fields=["name", "ward_name", "ward_name_ur", "ward_type",
		"gender", "floor", "color", "bed_charge_per_day", "nursing_station"], order_by="sort_order, ward_name")
	beds = frappe.get_all("Hospital Bed", filters={"branch": branch, "is_active": 1}, fields=["name", "bed_no", "ward", "room", "bed_type",
		"status", "daily_rate", "has_oxygen", "has_monitor", "current_patient", "patient_name", "occupied_since", "attending_doctor",
		"reserved_until", "status_note", "pos_x", "pos_y", "expected_discharge", "agreed_rate", "admission_reason"], order_by="bed_no")
	pats = {p.name: p for p in frappe.get_all("Patient", filters={"name": ["in", [b.current_patient for b in beds if b.current_patient] or [""]]},
		fields=["name", "gender", "dob", "photo", "category"])}
	docs = {d.name: d.doctor_name for d in frappe.get_all("Doctor", fields=["name", "doctor_name"])}
	from hospital_vvs.api.patients import age_of

	adms = {a.bed: a for a in frappe.get_all("Bed Allotment", filters={"branch": branch, "status": ["in", ["Admitted", "Discharge Pending"]]},
		fields=["name", "bed", "status", "payer_type", "final_invoice"])}
	for b in beds:
		a = adms.get(b.name)
		b["admission"] = a.name if a else None
		b["admission_status"] = a.status if a else None
		b["payer_type"] = a.payer_type if a else None
		p = pats.get(b.current_patient)
		b["gender"] = p.gender if p else None
		b["age"] = age_of(p.dob) if p else None
		b["category"] = p.category if p else None
		b["doctor_name"] = docs.get(b.attending_doctor)
	totals = {s: sum(1 for b in beds if b.status == s) for s in TRANSITIONS}
	return {"branch": branch, "branches": user_branches(), "wards": wards, "beds": beds, "totals": totals, "now": str(now_datetime()),
		"occupancy": round(totals["Occupied"] * 100 / len(beds), 1) if beds else 0}


def _log(bed, old, new, patient=None, note=None):
	frappe.get_doc({"doctype": "Bed Status Log", "bed": bed.name, "ward": bed.ward, "from_status": old, "to_status": new, "patient": patient,
		"changed_by": frappe.session.user, "changed_on": now_datetime(), "note": note}).insert(ignore_permissions=True)


def _set(bed_name, status, note=None, **values):
	bed = frappe.get_doc("Hospital Bed", bed_name)
	check_branch(bed.branch)
	if status not in TRANSITIONS.get(bed.status, ()):
		frappe.throw(_("A bed that is {0} cannot be set to {1}.").format(bed.status, status))
	old = bed.status
	patient = values.get("current_patient") or bed.current_patient
	bed.update(values)
	bed.status = status
	bed.status_note = note
	if status in ("Available", "Cleaning", "Maintenance"):
		bed.update({"current_patient": None, "patient_name": None, "occupied_since": None, "attending_doctor": None, "reserved_until": None,
			"expected_discharge": None, "agreed_rate": None, "admission_reason": None})
	bed.flags.ignore_permissions = True
	bed.save()
	_log(bed, old, status, patient, note)
	publish("beds", {"bed": bed.name, "status": status}, bed.branch)
	return bed.as_dict()


@frappe.whitelist(methods=["POST"])
def set_status(bed, status, note=None, hours=None):
	require_roles(*STAFF)
	if status == "Occupied":
		frappe.throw(_("Admit the patient to occupy a bed."))
	values = {}
	if status == "Reserved":
		values["reserved_until"] = add_to_date(now_datetime(), hours=cint(hours) or 4)
	return _set(bed, status, note, **values)


def bed_rate(bed_name):
	b = frappe.db.get_value("Hospital Bed", bed_name, ["daily_rate", "ward"], as_dict=True)
	return flt(b.daily_rate) or flt(frappe.db.get_value("Ward", b.ward, "bed_charge_per_day"))


@frappe.whitelist(methods=["POST"])
def assign(bed, patient, doctor=None, note=None, days=1, rate=None, reason=None):
	"""Allot a bed = admit the patient (kept for the bed map's quick allot)."""
	require_roles(*STAFF)
	from hospital_vvs.services import ipd

	if not doctor:
		frappe.throw(_("Choose the attending doctor."))
	adm, _token = ipd.admit(patient, bed, doctor, reason=reason, planned_days=days, daily_rate=rate)
	return frappe.get_doc("Hospital Bed", bed).as_dict() | {"admission": adm.name}


@frappe.whitelist(methods=["POST"])
def extend(bed, days=1):
	require_roles(*STAFF)
	from hospital_vvs.services import ipd

	adm = frappe.db.get_value("Bed Allotment", {"bed": bed, "status": ["in", ipd.OPEN_STATES]}, "name")
	if not adm:
		frappe.throw(_("No admission on this bed."))
	ipd.extend(adm, days)
	return frappe.get_doc("Hospital Bed", bed).as_dict()


@frappe.whitelist()
def kiosk(branch=None):
	"""Ward kiosk display: per-ward counts and beds; initials only unless first names are allowed on displays."""
	data = _bed_map(branch)
	show = cint(frappe.db.get_single_value("Clinic Settings", "show_first_name_on_display"))
	for b in data["beds"]:
		name = b.pop("patient_name", None) or ""
		b["label"] = (name.split(" ")[0] if show else "".join(w[0] for w in name.split()[:2]).upper()) if name else None
		for k in ("admission", "admission_status", "payer_type", "current_patient", "admission_reason", "agreed_rate", "category", "doctor_name", "attending_doctor", "status_note"):
			b.pop(k, None)
	return data


@frappe.whitelist(methods=["POST"])
def transfer(bed, to_bed, note=None):
	require_roles(R.NURSE, R.DOCTOR, R.RECEPTIONIST)
	from hospital_vvs.services import ipd

	adm = frappe.db.get_value("Bed Allotment", {"bed": bed, "status": ["in", ipd.OPEN_STATES]}, "name")
	if not adm:
		frappe.throw(_("No admission on this bed."))
	ipd.transfer(adm, to_bed, note)
	return frappe.get_doc("Hospital Bed", to_bed).as_dict()


@frappe.whitelist(methods=["POST"])
def release(bed, note=None):
	"""Free a bed that has no admission (e.g. an ER bay). Admitted patients leave through discharge."""
	require_roles(*STAFF)
	from hospital_vvs.services import ipd

	adm = frappe.db.get_value("Bed Allotment", {"bed": bed, "status": ["in", ipd.OPEN_STATES]}, "name")
	if adm:
		frappe.throw(_("{0} is admitted on this bed. Use Discharge on the admission.").format(adm))
	return _set(bed, "Cleaning", note or _("Patient left the bed"))


@frappe.whitelist()
def bed_history(bed):
	require_roles(R.DOCTOR, R.NURSE, R.RECEPTIONIST, R.DEO, R.ACCOUNTANT, R.CASH_SUPERVISOR)
	return frappe.get_all("Bed Status Log", filters={"bed": bed}, fields=["from_status", "to_status", "patient", "changed_by", "changed_on",
		"note"], order_by="changed_on desc", limit=30)
