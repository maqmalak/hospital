import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from hospital_vvs.utils import branch_company


class TestInvoice(Document):
	def validate(self):
		if not self.company:
			self.company = branch_company(self.branch)
		if not self.whatsapp_number:
			self.whatsapp_number = frappe.db.get_value("Patient", self.patient, "phone")
		seen = set()
		for r in self.items:
			if r.template in seen:
				frappe.throw(_("{0} is ordered twice.").format(r.template))
			seen.add(r.template)
			t = frappe.get_cached_doc("Lab Test Template", r.template)
			r.test_code, r.sample_type, r.outsourced, r.tat_hours = t.test_code, t.sample_type, t.outsourced, t.tat_hours
			if not r.price and self.status in ("Draft", "Ordered"):
				r.price = t.price
		self.gross_total = sum(flt(r.price) for r in self.items if r.status != "Cancelled")
		self.discount_amount = min(flt(self.discount_amount), self.gross_total)
		self.net_total = self.gross_total - flt(self.discount_amount)
		from hospital_vvs.services.payers import resolve  # one payer rule (D-46)

		r = resolve(self.patient, "Lab", self.net_total, self.get("posting_date"), self.payer_type, self.payer)
		self.payer_type, self.payer, self.payer_share = r["payer_type"], r["payer"], r["share"]
		self.patient_share = self.net_total - self.payer_share

	def on_trash(self):
		if self.sales_invoice:
			frappe.throw(_("A paid lab order cannot be deleted. Cancel tests or refund instead."))
