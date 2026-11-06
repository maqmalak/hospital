import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class DoctorLeave(Document):
	def validate(self):
		if getdate(self.to_date) < getdate(self.from_date):
			frappe.throw(_("To date cannot be before from date."))

	def on_update(self):
		from hospital_vvs.services.appointments import refresh_blocked

		refresh_blocked(doctor=self.doctor)


	def after_delete(self):
		from hospital_vvs.services.appointments import refresh_blocked

		refresh_blocked(doctor=self.doctor)
