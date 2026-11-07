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
		pat = frappe.db.get_value("Patient", self.patient, ["category", "panel", "insurance_provider"], as_dict=True) or {}
		if self.payer_type == "Patient" and pat.get("category") in ("Panel", "Insurance"):
			self.payer_type = pat.category
			self.payer = pat.panel if pat.category == "Panel" else pat.insurance_provider
		cover = flt(frappe.db.get_value("Customer", self.payer, "hv_coverage_percent")) if self.payer and self.payer_type != "Patient" else 0
		self.payer_share = round(self.net_total * cover / 100)
		self.patient_share = self.net_total - self.payer_share

	def on_trash(self):
		if self.sales_invoice:
			frappe.throw(_("A paid lab order cannot be deleted. Cancel tests or refund instead."))
