import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class VitalsChart(Document):
	def before_insert(self):
		self.recorded_at = self.recorded_at or now_datetime()
		self.recorded_by = frappe.session.user
