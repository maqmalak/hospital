import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from hospital_vvs.utils import branch_company


class BedAllotment(Document):
	def validate(self):
		if not self.company:
			self.company = branch_company(self.branch)
		if self.payer_type == "Patient":
			self.payer = None
			self.coverage_percent = 0
		elif not self.payer:
			frappe.throw(_("Choose the {0} that pays.").format(self.payer_type.lower()))
		else:
			self.coverage_percent = flt(frappe.db.get_value("Customer", self.payer, "hv_coverage_percent"))
		for s in self.segments:
			if s.to_time and s.to_time < s.from_time:
				frappe.throw(_("Bed history row {0} ends before it starts.").format(s.idx))

	def on_trash(self):
		frappe.throw(_("Admissions cannot be deleted. Cancel the admission instead."))
