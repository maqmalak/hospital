"""Prescription: safety alerts on every line, signing = submit, corrections = amend with a reason (02-opd.md)."""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, cint, now_datetime

from hospital_vvs.services import safety
from hospital_vvs.utils import publish


class Prescription(Document):
	ignore_linked_doctypes = ("Queue Entry", "OPD Slip")

	def validate(self):
		if self.amended_from and not (self.amendment_reason or "").strip():
			frappe.throw(_("Enter the reason for amending this prescription."))
		if self.amended_from:
			self.version_no = cint(frappe.db.get_value("Prescription", self.amended_from, "version_no")) + 1
		for row in self.medicines:
			info = safety.item_drug_info(row.item)
			row.generic, row.drug_class = info.get("hv_generic"), info.get("hv_drug_class")
		self.run_safety()
		if self.follow_up_days and not self.follow_up_date:
			self.follow_up_date = add_days(self.prescription_date, cint(self.follow_up_days))
		if self.docstatus == 0:
			self.status = "Draft"

	def run_safety(self):
		results = safety.check(self.patient, [r.as_dict() for r in self.medicines], exclude_prescription=self.name)
		self.has_overrides = 0
		for row, res in zip(self.medicines, results):
			row.alert_type, row.alert_severity, row.alert_message = safety.summarize(res["alerts"])
			row.flags.blocking = res["blocking"]
			if row.override_reason and not row.override_by:
				row.override_by, row.override_at = frappe.session.user, now_datetime()
			if not row.alert_type:
				row.override_reason = row.override_by = row.override_at = None
			if row.override_reason:
				self.has_overrides = 1
		return results

	def before_submit(self):
		if not self.medicines and not self.diagnoses and not self.lab_tests and not self.advice:
			frappe.throw(_("The prescription is empty."))
		missing = [f"{r.idx}. {r.item_name or r.item}" for r in self.medicines if r.flags.blocking and not (r.override_reason or "").strip()]
		if missing:
			frappe.throw(_("These medicines have blocking safety alerts. Enter an override reason or remove them:<br>{0}")
				.format("<br>".join(missing)), title=_("Safety alert"))
		self.signed_by = frappe.session.user
		self.signed_at = now_datetime()
		self.status = "Signed"

	def on_submit(self):
		if self.queue_entry:
			frappe.db.set_value("Queue Entry", self.queue_entry, {"status": "Done", "completed_at": now_datetime()})
			publish("queue", {"doctor": self.doctor, "action": "done"}, self.branch)
		if self.amended_from:
			frappe.db.set_value("Prescription", self.amended_from, "status", "Superseded")
		for fn in frappe.get_hooks("hv_on_prescription_signed"):
			frappe.get_attr(fn)(self)

	def on_cancel(self):
		# Cancelled to be amended → Superseded (set by the new version on submit); a plain cancel → Cancelled.
		self.db_set("status", "Cancelled")

	def on_trash(self):
		if self.docstatus:
			frappe.throw(_("Signed prescriptions cannot be deleted."))
