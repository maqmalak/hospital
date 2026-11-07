"""Phase 2 settings were saved as 0 / empty before their defaults existed: set the defaults once."""

import frappe


def execute():
	from hospital_vvs.devtools.schema_phase2 import SETTINGS_FIELDS

	for f in SETTINGS_FIELDS:
		if f.get("default") is not None and f["fieldtype"] not in ("Tab Break", "Column Break", "Section Break"):
			frappe.db.set_single_value("Clinic Settings", f["fieldname"], f["default"])
	frappe.clear_document_cache("Clinic Settings")
