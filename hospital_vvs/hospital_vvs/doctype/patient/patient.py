import hashlib
import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import add_years, getdate, now_datetime, today

PATIENT_GROUP = "Patients"


def cnic_digits(value):
	return re.sub(r"\D", "", value or "")


def cnic_hash(digits):
	"""SHA-256 of the digits, peppered with the site's encryption key (exact-match search only)."""
	from frappe.utils.password import get_encryption_key

	return hashlib.sha256((digits + get_encryption_key()).encode()).hexdigest() if digits else None


def mask_cnic(digits):
	return f"*****-*******-{digits[-1]}" if digits else ""


class Patient(Document):
	def autoname(self):
		code = frappe.db.get_value("Branch", self.branch, "hv_branch_code") or "GEN"
		self.name = make_autoname(f"MR-{code}-.######", doc=self)

	def validate(self):
		self.patient_name = " ".join((self.patient_name or "").split())
		if self.patient_name.islower():
			self.patient_name = self.patient_name.title()
		if self.phone:
			self.phone = normalize_phone(self.phone)
		if self.alt_phone:
			self.alt_phone = normalize_phone(self.alt_phone)
		if self.dob and getdate(self.dob) > getdate(today()):
			frappe.throw(_("Date of birth cannot be in the future."))
		self._process_cnic()
		self._consent_flags()
		if self.category == "Panel" and not self.panel:
			frappe.throw(_("Select the panel for a Panel patient."))
		if self.category == "Insurance" and not self.insurance_provider:
			frappe.throw(_("Select the insurance provider for an Insurance patient."))
		if self.is_new() and not self.registered_by:
			self.registered_by = frappe.session.user

	def _process_cnic(self):
		value = self.cnic
		if not value or set(value) == {"*"}:
			return  # unchanged (Password fields come back masked)
		digits = cnic_digits(value)
		if len(digits) != 13:
			frappe.throw(_("CNIC / B-form must have 13 digits."))
		self.cnic_hash = cnic_hash(digits)
		self.cnic_last4 = digits[-4:]
		self.cnic_masked = mask_cnic(digits)
		dup = frappe.db.get_value("Patient", {"cnic_hash": self.cnic_hash, "name": ["!=", self.name or ""], "disabled": 0}, "name")
		if dup and not self.duplicate_reason:
			frappe.throw(_("This CNIC is already registered on {0}.").format(dup), title=_("Duplicate CNIC"))

	def _consent_flags(self):
		latest = {}
		for row in sorted(self.consents or [], key=lambda r: str(r.recorded_on or "")):
			if not row.recorded_on:
				row.recorded_on = now_datetime()
			if not row.recorded_by:
				row.recorded_by = frappe.session.user
			latest[row.consent_type] = row.status
		self.whatsapp_consent = int(latest.get("WhatsApp messages") == "Given")
		self.sms_consent = int(latest.get("SMS messages") == "Given")
		self.data_consent = int(latest.get("Data processing") == "Given")

	def on_trash(self):
		frappe.throw(_("Patients cannot be deleted. Disable or merge the record instead."))

	def after_insert(self):
		self.db_set("customer", ensure_customer(self), update_modified=False)

	def on_update(self):
		if self.customer and not self.flags.skip_customer_sync:
			frappe.db.set_value("Customer", self.customer, "customer_name", self.patient_name, update_modified=False)


def normalize_phone(phone):
	"""Pakistani numbers → +923XXXXXXXXX. Other formats are kept with spaces removed."""
	digits = re.sub(r"[^\d+]", "", phone or "")
	if digits.startswith("00"):
		digits = "+" + digits[2:]
	if digits.startswith("03") and len(digits) == 11:
		return "+92" + digits[1:]
	if digits.startswith("3") and len(digits) == 10:
		return "+92" + digits
	if digits.startswith("92") and len(digits) == 12:
		return "+" + digits
	return digits


def ensure_customer(patient):
	if patient.customer and frappe.db.exists("Customer", patient.customer):
		return patient.customer
	if not frappe.db.exists("Customer Group", PATIENT_GROUP):
		frappe.get_doc({"doctype": "Customer Group", "customer_group_name": PATIENT_GROUP,
			"parent_customer_group": "All Customer Groups"}).insert(ignore_permissions=True)
	cust = frappe.get_doc({
		"doctype": "Customer", "customer_name": patient.patient_name, "customer_type": "Individual",
		"customer_group": PATIENT_GROUP, "territory": frappe.db.get_value("Territory", "Pakistan") or "All Territories",
		"hv_patient": patient.name, "mobile_no": patient.phone,
	})
	cust.flags.ignore_mandatory = True
	cust.insert(ignore_permissions=True)
	return cust.name


def dob_from_age(age_years):
	return add_years(getdate(today()), -int(age_years))
