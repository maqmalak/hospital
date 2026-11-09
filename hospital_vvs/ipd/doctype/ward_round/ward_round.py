import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class WardRound(Document):
	def before_insert(self):
		self.round_at = self.round_at or now_datetime()
		self.round_no = frappe.db.count("Ward Round", {"bed_allotment": self.bed_allotment, "docstatus": ["<", 2]}) + 1
