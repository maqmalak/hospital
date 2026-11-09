import frappe
from frappe import _
from frappe.model.document import Document


class DischargeSummary(Document):
	"""Signed record: submitted = signed and immutable. Corrections are an amendment with a reason (02-opd.md)."""

	def validate(self):
		if self.amended_from and not (self.get("amendment_reason") or "").strip() and self.meta.has_field("amendment_reason"):
			frappe.throw(_("Enter the amendment reason."))

	def on_trash(self):
		if self.docstatus:
			frappe.throw(_("Signed records cannot be deleted."))
