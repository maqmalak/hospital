import frappe


def execute():
	"""Online visit settings defaults, fee item and message templates on existing sites."""
	from hospital_vvs.install import fill_settings_defaults
	from hospital_vvs.messaging.templates import ensure_templates
	from hospital_vvs.services import online_visit

	fill_settings_defaults()
	code = online_visit.fee_item()
	if not frappe.db.get_single_value("Clinic Settings", "ov_item"):
		frappe.db.set_single_value("Clinic Settings", "ov_item", code)
	ensure_templates()
