"""D-96: move nursery vitals, notes and medicines into the IPD tables (one source of truth).

Vitals → Vitals Chart (°C → °F), Doctor / Nursing notes → IPD Note (submitted; struck ones cancelled), Medication / Vaccine → STAT
IPD Medication Order + administered MAR Entry (history only: no new pharmacy bill). The moved Newborn Chart Entry rows are deleted.
Idempotent: only rows still in Newborn Chart Entry are moved.
"""

import frappe
from frappe.utils import get_datetime

from hospital_vvs.services import nursery as nz


def _code(item):
	n = (item or "").lower()
	if "vitamin k" in n or "phytomenadione" in n:
		return "NB-VITK1"
	if "caffeine" in n:
		return "NB-CAFF"
	return nz.EPI_TO_ITEM.get(item or "") or next((c for c, name, *_r in nz.NEWBORN_ITEMS if name == item), None)


def execute():
	if not frappe.db.exists("DocType", "Newborn Chart Entry"):
		return
	frappe.reload_doc("ipd", "doctype", "vitals_chart")
	from hospital_vvs.setup.nursery import ensure_items

	ensure_items()
	rows = frappe.get_all("Newborn Chart Entry", filters={"entry_type": ["in", ["Vitals", "Doctor Note", "Nursing Note", "Medication", "Vaccine"]]}, fields=["*"],
		order_by="recorded_at")
	moved = 0
	for e in rows:
		nb = frappe.get_cached_doc("Newborn", e.newborn)
		if not nb.admission or not nb.baby_patient:
			continue
		user = e.recorded_by or "Administrator"
		if e.entry_type == "Vitals":
			v = frappe.get_doc({"doctype": "Vitals Chart", "bed_allotment": nb.admission, "patient": nb.baby_patient, "branch": nb.branch, "recorded_at": e.recorded_at,
				"recorded_by": user, "temperature": nz.c2f(e.temp_c), "pulse": e.hr, "resp_rate": e.rr, "spo2": e.spo2, "note": e.note, "source": "Nursery",
				"cancelled": e.cancelled, "cancel_reason": e.cancel_reason})
			v.flags.ignore_validate = True
			v.insert(ignore_permissions=True)
		elif e.entry_type in ("Doctor Note", "Nursing Note"):
			n = frappe.get_doc({"doctype": "IPD Note", "bed_allotment": nb.admission, "patient": nb.baby_patient, "branch": nb.branch, "note_type": nz.NOTE_TYPE[e.entry_type],
				"note": e.note or "—", "recorded_at": e.recorded_at, "doctor": frappe.db.get_value("Doctor", {"user": user}, "name") if e.entry_type == "Doctor Note" else None})
			n.insert(ignore_permissions=True)
			n.submit()
			frappe.db.set_value("IPD Note", n.name, {"author": user, "recorded_at": e.recorded_at}, update_modified=False)
			if e.cancelled:
				n.reload()
				n.cancel()
				frappe.db.set_value("IPD Note", n.name, "amendment_reason", e.cancel_reason, update_modified=False)
		else:
			code = _code(e.item)
			if not code:
				continue
			doctor = frappe.db.get_value("Doctor", {"user": user}, "name") or nb.attending_doctor
			name = frappe.db.get_value("Item", code, "item_name")
			mo = frappe.get_doc({"doctype": "IPD Medication Order", "bed_allotment": nb.admission, "patient": nb.baby_patient, "branch": nb.branch, "item": code,
				"dose": e.dose or "1 dose", "units_per_dose": 1, "route": e.route or "IM", "frequency": "STAT", "days": 1, "start_at": e.recorded_at, "status": "Completed"
				if frappe.get_meta("IPD Medication Order").get_field("status").options and "Completed" in frappe.get_meta("IPD Medication Order").get_field("status").options else "Active",
				"doctor": doctor, "ordered_by": user, "override_reason": "Newborn standing order (moved from nursery chart)"}).insert(ignore_permissions=True)
			frappe.get_doc({"doctype": "MAR Entry", "medication_order": mo.name, "bed_allotment": nb.admission, "patient": nb.baby_patient, "branch": nb.branch, "item": code,
				"item_name": name, "dose": e.dose, "route": e.route, "qty_units": 1, "scheduled_at": e.recorded_at, "status": "Administered", "administered_by": user,
				"administered_at": get_datetime(e.recorded_at), "batch_no": e.batch_no}).insert(ignore_permissions=True)
		frappe.delete_doc("Newborn Chart Entry", e.name, ignore_permissions=True, force=True)
		moved += 1
	frappe.db.commit()
	print(f"centralize_newborn_records: moved {moved} entries")
