import frappe


def execute():
	"""Phase 3 service items and Clinic Settings item links on existing sites."""
	from hospital_vvs.install import fill_settings_defaults
	from hospital_vvs.setup import company

	fill_settings_defaults()
	company.ensure_items()
	s = frappe.get_single("Clinic Settings")
	for field, code in (("bed_charge_item", "IPD-BED"), ("icu_charge_item", "IPD-ICU"), ("nursing_charge_item", "IPD-NURSING"),
		("diet_charge_item", "IPD-DIET"), ("oxygen_charge_item", "IPD-OXYGEN"), ("adhoc_charge_item", "IPD-ADHOC"), ("er_fee_item", "ER-FEE")):
		if not s.get(field) and frappe.db.exists("Item", code):
			s.set(field, code)
	s.flags.ignore_permissions = True
	s.save()
