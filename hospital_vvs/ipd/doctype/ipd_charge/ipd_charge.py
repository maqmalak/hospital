import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class IPDCharge(Document):
	def validate(self):
		self.amount = flt(self.qty) * flt(self.rate)
		if self.status == "Billed" and self.has_value_changed("amount") and not self.is_new():
			frappe.throw(_("A billed charge cannot change."))

	def on_trash(self):
		if self.status != "Cancelled" or self.stock_entry:
			frappe.throw(_("Charges are cancelled with a reason, not deleted."))
