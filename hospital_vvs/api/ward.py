"""Live bed map (user request; Restaurant OS table-map style). Admission/discharge workflow arrives in Phase 3."""

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

	for b in beds:
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
	values = {}
	if status == "Reserved":
		values["reserved_until"] = add_to_date(now_datetime(), hours=cint(hours) or 4)
	return _set(bed, status, note, **values)


def bed_rate(bed_name):
	b = frappe.db.get_value("Hospital Bed", bed_name, ["daily_rate", "ward"], as_dict=True)
	return flt(b.daily_rate) or flt(frappe.db.get_value("Ward", b.ward, "bed_charge_per_day"))


@frappe.whitelist(methods=["POST"])
def assign(bed, patient, doctor=None, note=None, days=1, rate=None, reason=None):
	"""Allot a bed (interim until Phase 3's Bed Allotment drives this): expected stay, agreed daily rate, reason."""
	require_roles(*STAFF)
	if frappe.db.exists("Hospital Bed", {"current_patient": patient, "status": "Occupied"}):
		frappe.throw(_("This patient already has a bed."))
	now = now_datetime()
	return _set(bed, "Occupied", note, current_patient=patient, patient_name=frappe.db.get_value("Patient", patient, "patient_name"),
		occupied_since=now, attending_doctor=doctor, expected_discharge=add_to_date(now, days=max(cint(days), 1)),
		agreed_rate=flt(rate) or bed_rate(bed), admission_reason=reason)


@frappe.whitelist(methods=["POST"])
def extend(bed, days=1):
	require_roles(*STAFF)
	b = frappe.get_doc("Hospital Bed", bed)
	if b.status != "Occupied":
		frappe.throw(_("Only an occupied bed can be extended."))
	base = max(b.expected_discharge or now_datetime(), now_datetime())
	b.expected_discharge = add_to_date(base, days=max(cint(days), 1))
	b.flags.ignore_permissions = True
	b.save()
	_log(b, "Occupied", "Occupied", b.current_patient, _("Stay extended by {0} day(s)").format(cint(days) or 1))
	publish("beds", {"bed": b.name, "status": "Occupied"}, b.branch)
	return b.as_dict()


@frappe.whitelist()
def kiosk(branch=None):
	"""Ward kiosk display: per-ward counts and beds; initials only unless first names are allowed on displays."""
	data = bed_map(branch)
	show = cint(frappe.db.get_single_value("Clinic Settings", "show_first_name_on_display"))
	for b in data["beds"]:
		name = b.pop("patient_name", None) or ""
		b["label"] = (name.split(" ")[0] if show else "".join(w[0] for w in name.split()[:2]).upper()) if name else None
		for k in ("current_patient", "admission_reason", "agreed_rate", "category", "doctor_name", "attending_doctor", "status_note"):
			b.pop(k, None)
	return data


@frappe.whitelist(methods=["POST"])
def transfer(bed, to_bed, note=None):
	require_roles(R.NURSE, R.DOCTOR)
	src = frappe.get_doc("Hospital Bed", bed)
	if src.status != "Occupied":
		frappe.throw(_("Only an occupied bed can be transferred."))
	patient, doctor, reason, until = src.current_patient, src.attending_doctor, src.admission_reason, src.expected_discharge
	since = src.occupied_since
	_set(bed, "Cleaning", note or _("Transferred to {0}").format(to_bed))
	out = assign(to_bed, patient, doctor, note or _("Transferred from {0}").format(bed), reason=reason)
	frappe.db.set_value("Hospital Bed", to_bed, {"occupied_since": since, "expected_discharge": until})
	return out


@frappe.whitelist(methods=["POST"])
def release(bed, note=None):
	require_roles(*STAFF)
	return _set(bed, "Cleaning", note or _("Patient left the bed"))


@frappe.whitelist()
def bed_history(bed):
	return frappe.get_all("Bed Status Log", filters={"bed": bed}, fields=["from_status", "to_status", "patient", "changed_by", "changed_on",
		"note"], order_by="changed_on desc", limit=30)
