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
