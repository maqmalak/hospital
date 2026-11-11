"""Lookups the help videos need between steps (tools/videos, D-63). Read-only except `prepare`, which opens the demo
shifts the videos collect money in. bench --site hospital execute hospital_vvs.devtools.video.info --kwargs '{"what": "free_bed"}'"""

import json

import frappe
from frappe.utils import today


def _out(v):
	print(json.dumps(v, default=str))
	return v


def info(what, **kw):
	if what == "prepare":
		from hospital_vvs.services import shifts

		for user, counter in (("reception@vvs.demo", "Reception 1"), ("cashier@vvs.demo", None)):
			frappe.set_user(user)
			if not shifts.current_shift() and counter:
				shifts.open_shift(counter, {"Cash": 5000})
		frappe.set_user("Administrator")
		frappe.db.commit()
		return _out({"ok": True})
	if what == "free_bed":
		wards = frappe.get_all("Ward", filters={"branch": "Lahore Main", "ward_type": kw.get("ward_type") or "General", "is_active": 1}, pluck="name")
		bed = frappe.get_all("Hospital Bed", filters={"ward": ["in", wards or [""]], "status": "Available", "is_active": 1}, fields=["name", "bed_no", "ward"],
			order_by="bed_no", limit=1)
		return _out(bed[0] if bed else None)
	if what == "lab":
		ti = frappe.db.get_value("Test Invoice", {"patient": kw["patient"], "docstatus": ["<", 2]}, ["name", "status"], as_dict=True, order_by="creation desc")
		if not ti:
			return _out(None)
		items = frappe.get_all("Test Invoice Item", filters={"parent": ti.name}, fields=["name", "template", "status", "sample", "result"])
		samples = frappe.get_all("Lab Sample", filters={"test_invoice": ti.name}, fields=["name", "status"])
		return _out({**ti, "items": items, "samples": samples})
	if what == "admission":
		a = frappe.db.get_value("Bed Allotment", {"patient": kw["patient"]}, ["name", "status", "bed", "final_invoice"], as_dict=True, order_by="creation desc")
		return _out(a)
	if what == "rx":
		rx = frappe.db.get_value("Prescription", {"patient": kw["patient"], "docstatus": 1}, "name", order_by="creation desc")
		return _out({"name": rx})
	if what == "appointment":
		a = frappe.db.get_value("Appointment", {"phone": ["like", f"%{kw['phone'][-7:]}"], "appointment_date": today()}, ["name", "status", "patient", "booking_ref"],
			as_dict=True, order_by="creation desc")
		return _out(a)
	if what == "doctor":
		return _out(frappe.db.get_value("Doctor", {"user": kw.get("user") or "dr.ayesha@vvs.demo"}, ["name", "doctor_name"], as_dict=True))
	return _out(None)
