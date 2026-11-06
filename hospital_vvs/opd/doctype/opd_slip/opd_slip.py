import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, cint, flt, getdate

from hospital_vvs.services import billing, discounts
from hospital_vvs.utils import branch_company, publish, setting


class OPDSlip(Document):
	ignore_linked_doctypes = ("Sales Invoice", "Queue Entry", "Discount Authorization", "Appointment", "Prescription")

	def validate(self):
		if not self.company:
			self.company = branch_company(self.branch)
		self._default_items()
		self._free_follow_up()
		self._bmi()
		self._totals()

	def _default_items(self):
		if self.items:
			return
		doctor = frappe.db.get_value("Doctor", self.doctor, ["default_fee", "follow_up_fee"], as_dict=True) or {}
		follow = self.purpose == "Follow-up"
		item = setting("follow_up_item" if follow else "consultation_item") or setting("consultation_item")
		if not item:
			frappe.throw(_("Set the consultation service item in Clinic Settings → POS & Warehouses."))
		fee = flt(doctor.get("follow_up_fee") if follow and doctor.get("follow_up_fee") else doctor.get("default_fee")) \
			or flt(setting("default_fee"))
		self.append("items", {"item_code": item, "qty": 1, "rate": fee})

	def _free_follow_up(self):
		"""Free inside the follow-up window after a paid consultation with the same doctor."""
		days = cint(setting("follow_up_free_days", self.branch))
		self.is_free_follow_up = 0
		if not days or self.purpose == "Procedure":
			return
		last = frappe.db.get_value("OPD Slip", {"patient": self.patient, "doctor": self.doctor, "docstatus": 1,
			"is_free_follow_up": 0, "net_total": [">", 0], "name": ["!=", self.name or ""],
			"posting_date": ["between", [add_days(getdate(self.posting_date), -days), getdate(self.posting_date)]]}, "name")
		if last:
			self.is_free_follow_up = 1
			self.purpose = "Follow-up"
			cons = {setting("consultation_item"), setting("follow_up_item")}
			for row in self.items:
				if row.item_code in cons:
					row.rate = 0

	def _bmi(self):
		if flt(self.weight) and flt(self.height):
			self.bmi = round(flt(self.weight) / ((flt(self.height) / 100) ** 2), 1)

	def _totals(self):
		for row in self.items:
			row.amount = flt(row.qty) * flt(row.rate)
		self.gross_total = sum(flt(r.amount) for r in self.items)
		if flt(self.discount_percent) and not flt(self.discount_amount):
			self.discount_amount = round(self.gross_total * flt(self.discount_percent) / 100)
		self.discount_amount = min(flt(self.discount_amount), self.gross_total)
		self.discount_percent = self.discount_amount * 100 / self.gross_total if self.gross_total else 0
		self.net_total = self.gross_total - self.discount_amount
		self._payer()
		if self.payment_mode == "Cash" and flt(self.cash_tendered):
			self.change_amount = max(flt(self.cash_tendered) - flt(self.patient_share), 0)

	def _payer(self):
		pat = frappe.db.get_value("Patient", self.patient, ["category", "panel", "insurance_provider"], as_dict=True) or {}
		if self.payer_type == "Patient" and pat.get("category") in ("Panel", "Insurance"):
			self.payer_type = pat.category
			self.payer = pat.panel if pat.category == "Panel" else pat.insurance_provider
		if self.payer_type == "Patient" or not self.payer:
			self.payer_share, self.patient_share = 0, self.net_total
			return
		cover = flt(frappe.db.get_value("Customer", self.payer, "hv_coverage_percent"))
		self.payer_share = round(self.net_total * cover / 100)
		self.patient_share = self.net_total - self.payer_share

	def before_submit(self):
		if flt(self.discount_amount):
			discounts.assert_usable(self.discount_authorization, self.discount_amount)
		if self.payment_mode == "Cash" and flt(self.cash_tendered) and flt(self.cash_tendered) < flt(self.patient_share):
			frappe.throw(_("Cash tendered is less than the amount due."))
		self.token_no = next_token(self.doctor, self.branch, self.posting_date)

	def on_submit(self):
		self._invoices()
		self._queue()
		if self.discount_authorization:
			discounts.mark_used(self.discount_authorization, self.doctype, self.name)
		if self.appointment:
			frappe.db.set_value("Appointment", self.appointment, "opd_slip", self.name)

	def _invoices(self):
		if not flt(self.net_total):
			return  # zero fee / free follow-up: no invoice
		customer = frappe.db.get_value("Patient", self.patient, "customer")
		lines = [{"item_code": r.item_code, "qty": r.qty, "rate": r.rate} for r in self.items]
		fraction = flt(self.patient_share) / flt(self.net_total)
		gross_lines = billing.split_lines(lines, fraction) if self.payer_share else lines
		if flt(self.patient_share):
			si = billing.create_invoice(customer=customer, patient=self.patient, lines=gross_lines, billing_type="OPD Slip",
				branch=self.branch, reference_doctype=self.doctype, reference_name=self.name,
				discount_amount=flt(self.discount_amount) * fraction, payment_mode=self.payment_mode,
				posting_date=self.posting_date)
			self.db_set("sales_invoice", si)
		if flt(self.payer_share):
			payer_si = billing.create_invoice(customer=self.payer, patient=self.patient,
				lines=billing.split_lines(lines, 1 - fraction), billing_type="OPD Slip", branch=self.branch,
				reference_doctype=self.doctype, reference_name=self.name, discount_amount=flt(self.discount_amount) * (1 - fraction),
				pos=False, payer_share_of=self.sales_invoice, payer=True,
				remarks=_("{0} share of OPD slip {1} for {2}").format(self.payer_type, self.name, self.patient_name),
				posting_date=self.posting_date)
			self.db_set("payer_invoice", payer_si)

	def _queue(self):
		existing = frappe.db.get_value("Queue Entry", {"appointment": self.appointment}, "name") if self.appointment else None
		room = frappe.db.get_value("Doctor", self.doctor, "consultation_room")
		if existing:
			q = frappe.get_doc("Queue Entry", existing)
			q.update({"opd_slip": self.name, "token_no": self.token_no})
			q.save(ignore_permissions=True)
		else:
			q = frappe.get_doc({"doctype": "Queue Entry", "doctor": self.doctor, "patient": self.patient, "branch": self.branch,
				"queue_date": self.posting_date, "room": room, "token_no": self.token_no, "status": "Waiting",
				"is_follow_up": self.purpose == "Follow-up", "opd_slip": self.name, "appointment": self.appointment,
				"priority": appt_priority(self.appointment),
			}).insert(ignore_permissions=True)
		self.db_set("queue_entry", q.name)
		publish("queue", {"doctor": self.doctor, "action": "added", "token": self.token_no}, self.branch)

	def on_cancel(self):
		billing.cancel_invoice(self.payer_invoice)
		billing.cancel_invoice(self.sales_invoice)
		if self.queue_entry:
			frappe.db.set_value("Queue Entry", self.queue_entry, "status", "Skipped")
			publish("queue", {"doctor": self.doctor, "action": "removed"}, self.branch)


def next_token(doctor, branch, date):
	"""Per doctor, branch and day. Locks the doctor's rows so two counters don't hand out the same token."""
	rows = frappe.db.sql("""select max(token_no) from `tabQueue Entry` where doctor=%s and branch=%s and queue_date=%s for update""",
		(doctor, branch, date))
	return cint(rows[0][0] if rows else 0) + 1


def appt_priority(appointment):
	p = frappe.db.get_value("Appointment", appointment, "priority") if appointment else None
	return p if p in ("Urgent", "Elderly", "Disabled") else None
