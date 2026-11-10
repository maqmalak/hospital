"""Script Report definitions → <module>/report/<name>/<name>.json (bench execute hospital_vvs.devtools.reports.run)."""

import json
import os

import frappe

from hospital_vvs import roles as R
from hospital_vvs.devtools.dt import APP_DIR, STAMP

REPORTS = [
	("OPD Visits by Doctor", "OPD", [R.ADMIN, R.DOCTOR, R.ACCOUNTANT]),
	("Appointments by Channel", "Appointments", [R.ADMIN, R.RECEPTIONIST, R.ACCOUNTANT]),
	("Disease Statistics", "OPD", [R.ADMIN, R.DOCTOR]),
	("Discount Report", "Billing", [R.ADMIN, R.ACCOUNTANT, R.CASH_SUPERVISOR]),
	("Message Delivery", "Messaging", [R.ADMIN, R.RECEPTIONIST]),
	("Day End Collection", "Billing", [R.ADMIN, R.ACCOUNTANT, R.CASH_SUPERVISOR]),
	("Revenue Analysis", "Billing", [R.ADMIN, R.ACCOUNTANT]),
	("Payer Ageing", "Billing", [R.ADMIN, R.ACCOUNTANT, R.CASH_SUPERVISOR]),
	("Welfare Fund Utilization", "Billing", [R.ADMIN, R.ACCOUNTANT]),
	("Expenses by Category", "Billing", [R.ADMIN, R.ACCOUNTANT, R.CASH_SUPERVISOR]),
]


def run():
	for name, module, roles in REPORTS:
		folder = os.path.join(APP_DIR, frappe.scrub(module), "report", frappe.scrub(name))
		os.makedirs(folder, exist_ok=True)
		for init in (os.path.join(APP_DIR, frappe.scrub(module), "report", "__init__.py"), os.path.join(folder, "__init__.py")):
			if not os.path.exists(init):
				open(init, "w").close()
		d = {"add_total_row": 1, "columns": [], "creation": STAMP, "disabled": 0, "docstatus": 0, "doctype": "Report", "filters": [],
			"idx": 0, "is_standard": "Yes", "letterhead": None, "modified": STAMP, "modified_by": "Administrator", "module": module,
			"name": name, "owner": "Administrator", "prepared_report": 0, "ref_doctype": "OPD Slip" if module != "Messaging" else "Message Log",
			"report_name": name, "report_type": "Script Report", "roles": [{"role": r} for r in roles + ["System Manager"]]}
		if name == "Appointments by Channel":
			d["ref_doctype"] = "Appointment"
		if name == "Discount Report":
			d["ref_doctype"] = "Discount Authorization"
		if name in ("Day End Collection", "Revenue Analysis", "Payer Ageing"):
			d["ref_doctype"] = "Sales Invoice"
		if name == "Welfare Fund Utilization":
			d["ref_doctype"] = "Welfare Scheme"
		if name == "Expenses by Category":
			d["ref_doctype"] = "Expense"
		with open(os.path.join(folder, frappe.scrub(name) + ".json"), "w") as fh:
			fh.write(json.dumps(d, indent=1, sort_keys=True) + "\n")
	print("reports written")
