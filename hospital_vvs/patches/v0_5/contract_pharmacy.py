import frappe


def execute():
	"""D-38: contract pharmacy company, wallet accounts, reception takes online fees (page access)."""
	from hospital_vvs.install import fill_settings_defaults
	from hospital_vvs.routes import DEFAULT_ROUTES
	from hospital_vvs.setup import pharmacy_company

	fill_settings_defaults()
	if not frappe.db.exists("Company", "VVS Hospital"):
		return  # fresh site: setup.company.run + setup.pharmacy_company.run do it
	pharmacy_company.run()
	roles = {r: ", ".join(rl) for r, _l, rl, _s in DEFAULT_ROUTES}
	s = frappe.get_single("Clinic Settings")
	for row in s.page_access:
		if row.route == "/ov-staff":
			row.roles = roles["/ov-staff"]
	s.flags.ignore_permissions = True
	s.save()
