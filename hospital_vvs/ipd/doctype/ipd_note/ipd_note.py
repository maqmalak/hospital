import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class IPDNote(Document):
	def before_insert(self):
		self.recorded_at = self.recorded_at or now_datetime()
		self.author = frappe.session.user
