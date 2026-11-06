from frappe.model.document import Document


class BlockedDate(Document):
	def on_update(self):
		from hospital_vvs.services.appointments import refresh_blocked

		refresh_blocked(date=self.blocked_date)

	def after_delete(self):
		from hospital_vvs.services.appointments import refresh_blocked

		refresh_blocked(date=self.blocked_date)
