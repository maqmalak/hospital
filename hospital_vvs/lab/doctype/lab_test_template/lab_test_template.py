import frappe
from frappe import _
from frappe.model.document import Document


class LabTestTemplate(Document):
	def validate(self):
		self.test_code = (self.test_code or "").strip().upper()
		if self.outsourced and not self.reference_lab:
			frappe.throw(_("Choose the reference lab for an outsourced test."))
		seen = set()
		for r in self.parameters:
			key = (r.parameter, r.gender, r.age_from, r.age_to)
			if key in seen:
				frappe.throw(_("Parameter {0} has the same range row twice.").format(r.parameter))
			seen.add(key)

	def on_update(self):
		from hospital_vvs.services.lab import ensure_template_item

		code = ensure_template_item(self)
		if self.item != code:
			self.db_set("item", code)
