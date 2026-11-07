"""Admin tools: Clinic Settings editor, audit screen (access log + change history)."""

import json

import frappe
from frappe.utils import cint

from hospital_vvs import roles as R
from hospital_vvs.utils import require_roles

AUDITED = ["Patient", "OPD Slip", "Prescription", "Appointment", "Discount Authorization", "Doctor", "Clinic Settings", "Hospital Bed",
	"Drug Interaction", "Queue Entry", "Ward"]


@frappe.whitelist()
def get_settings():
	require_roles(R.ADMIN)
	s = frappe.get_single("Clinic Settings")
	meta = frappe.get_meta("Clinic Settings")
	sections, current = [], None
	for f in meta.fields:
		if f.fieldtype == "Tab Break":
			current = {"label": f.label, "fieldname": f.fieldname, "fields": []}
			sections.append(current)
		elif f.fieldtype not in ("Section Break", "Column Break") and current is not None:
			current["fields"].append({"fieldname": f.fieldname, "label": f.label, "fieldtype": f.fieldtype, "options": f.options,
				"description": f.description})
	return {"doc": s.as_dict(), "tabs": sections}


@frappe.whitelist(methods=["POST"])
def save_settings(data):
	require_roles(R.ADMIN)
	d = frappe.parse_json(data)
	s = frappe.get_single("Clinic Settings")
	meta = s.meta
	for k, v in d.items():
		f = meta.get_field(k)
		if not f or f.fieldtype in ("Section Break", "Column Break", "Tab Break"):
			continue
		if f.fieldtype == "Table":
			s.set(k, [{kk: vv for kk, vv in row.items() if not kk.startswith("__") and kk not in ("name", "parent", "parenttype",
				"parentfield", "idx", "doctype", "owner", "creation", "modified", "modified_by", "docstatus")} for row in v or []])
		else:
			s.set(k, v)
	s.save()
	frappe.clear_cache(doctype="Clinic Settings")
	return get_settings()


@frappe.whitelist()
def audit(user=None, patient=None, doctype=None, from_date=None, to_date=None, kind="access", limit=200, start=0):
	require_roles(R.ADMIN)
	limit, start = min(cint(limit) or 200, 500), cint(start)
	if kind == "access":
		filters = {}
		if user:
			filters["user"] = user
		if patient:
			filters["patient"] = patient
		if doctype:
			filters["reference_doctype"] = doctype
		if from_date and to_date:
			filters["accessed_on"] = ["between", [from_date, f"{to_date} 23:59:59"]]
		rows = frappe.get_all("Clinical Access Log", filters=filters, fields=["name", "user", "action", "patient", "reference_doctype",
			"reference_name", "accessed_on", "ip_address", "details"], order_by="accessed_on desc", limit=limit, start=start)
		top = frappe.db.sql("""select action, count(*) n from `tabClinical Access Log` where accessed_on >= now() - interval 7 day
			group by action order by n desc""", as_dict=True)
		return {"rows": rows, "summary": top}
	filters = {"ref_doctype": ["in", [doctype] if doctype else AUDITED]}
	if user:
		filters["owner"] = user
	if patient:
		filters["docname"] = patient
	if from_date and to_date:
		filters["creation"] = ["between", [from_date, f"{to_date} 23:59:59"]]
	rows = frappe.get_all("Version", filters=filters, fields=["name", "ref_doctype", "docname", "owner", "creation", "data"],
		order_by="creation desc", limit=limit, start=start)
	for r in rows:
		d = json.loads(r.pop("data") or "{}")
		r["changed"] = [c[0] for c in d.get("changed") or []][:8]
		r["values"] = [c for c in d.get("changed") or []][:8]
		r["added"] = len(d.get("added") or [])
		r["removed"] = len(d.get("removed") or [])
	return {"rows": rows, "summary": []}


# ------------------------------------------------------------------ display devices (/display/devices)
DEVICE_PATH = {"Customer Display": "/display/counter/", "Queue Display": "/display/pharmacy/", "Kiosk": "/display/pharmacy/",
	"Waiting Display": "/display/waiting/", "Ward Display": "/display/beds/"}


@frappe.whitelist()
def devices():
	require_roles(R.ADMIN)
	rows = frappe.get_all("Display Device", fields=["name", "device_name", "device_type", "counter", "branch", "device_key", "location", "last_seen", "is_active"],
		order_by="branch, device_type, device_name")
	for r in rows:
		r["path"] = f"/hms{DEVICE_PATH.get(r.device_type, '/display/pharmacy/')}{r.device_key}"
	return {"devices": rows, "types": list(DEVICE_PATH), "branches": frappe.get_all("Branch", pluck="name"),
		"counters": frappe.get_all("Counter", filters={"is_active": 1}, fields=["name", "branch", "counter_type"])}


@frappe.whitelist(methods=["POST"])
def save_device(data):
	require_roles(R.ADMIN)
	d = frappe.parse_json(data)
	doc = frappe.get_doc("Display Device", d["name"]) if d.get("name") else frappe.new_doc("Display Device")
	for k in ("device_name", "device_type", "counter", "branch", "location"):
		if k in d:
			doc.set(k, d[k] or None)
	doc.is_active = cint(d.get("is_active", 1))
	if not doc.device_key:
		doc.device_key = frappe.generate_hash(length=24)
	doc.save(ignore_permissions=True)
	if doc.counter and doc.device_type == "Customer Display":
		frappe.db.set_value("Counter", doc.counter, "display_device", doc.name)
	return doc.name


@frappe.whitelist(methods=["POST"])
def rotate_device_key(name):
	"""A lost or stolen screen: the old link stops working at once."""
	require_roles(R.ADMIN)
	key = frappe.generate_hash(length=24)
	frappe.db.set_value("Display Device", name, "device_key", key)
	return key
