import frappe
from frappe.model.document import Document


class ClinicSettings(Document):
	def on_update(self):
		# keep the Frappe Letter Head (ERPNext document prints) in step with the name, address and phone (D-79)
		from hospital_vvs.letterhead import ensure_letter_head

		try:
			ensure_letter_head()
		except Exception:
			frappe.log_error(title="Letter head refresh failed")
