"""Phase 0/1 acceptance tests (12-workflows.md: W1 OPD part, W2, W2a, W9, W10, W11 discount part).

Runs against the demo data (bench --site hospital execute hospital_vvs.setup.demo.seed).
bench --site hospital run-tests --app hospital_vvs
"""

import random

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, flt, today

from hospital_vvs import roles as R
from hospital_vvs.services import appointments as svc
from hospital_vvs.services import safety

DEMO = "Demo@1234"


def user(role):
	return frappe.db.get_value("Has Role", {"role": role, "parenttype": "User", "parent": ["like", "%@vvs.demo"]}, "parent")


def demo_doctor(name="Dr. Ayesha Siddiqui"):
	return frappe.db.get_value("Doctor", {"doctor_name": name})


def new_patient(**kw):
	d = {"doctype": "Patient", "patient_name": kw.pop("patient_name", "Test Patient " + frappe.generate_hash(length=5)), "gender": "Male",
		"dob": "1990-01-01", "phone": kw.pop("phone", f"+92333{random.randint(1000000, 9999999)}"), "branch": "Lahore Main", "duplicate_reason": "test"}
	d.update(kw)
	return frappe.get_doc(d).insert(ignore_permissions=True)


class TestIdentity(IntegrationTestCase):
	def test_patient_gets_mr_customer_and_masked_cnic(self):
		p = new_patient(cnic="35202-1234567-9")
		self.assertTrue(p.name.startswith("MR-LHR-"))
		self.assertTrue(frappe.db.get_value("Patient", p.name, "customer"))
		self.assertEqual(frappe.db.get_value("Patient", p.name, "cnic_masked"), "*****-*******-9")
		row = frappe.db.sql("select cnic from tabPatient where name=%s", p.name)[0][0]
		self.assertNotIn("1234567", row or "")

	def test_duplicate_detection_and_merge(self):
		from hospital_vvs.api import patients as api

		a = new_patient(patient_name="Kamran Yousaf", phone="+923219990001")
		dups = api.find_duplicates("Kamran Yusaf", "03219990001")
		self.assertIn(a.name, [d["name"] for d in dups])
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			api.register({"patient_name": "Kamran Yusaf", "phone": "03219990001", "gender": "Male", "age": 30, "branch": "Lahore Main"})
		b = api.register({"patient_name": "Kamran Yusaf", "phone": "03219990001", "gender": "Male", "age": 30, "branch": "Lahore Main"},
			duplicate_reason="Different person")["name"]
		slip = make_slip(b)
		api.merge(a.name, b, b)
		self.assertEqual(frappe.db.get_value("OPD Slip", slip.name, "patient"), a.name)
		self.assertEqual(frappe.db.get_value("Sales Invoice", slip.sales_invoice, "customer"), frappe.db.get_value("Patient", a.name, "customer"))
		self.assertEqual(frappe.db.get_value("Patient", b, "merged_into"), a.name)
		self.assertTrue(frappe.db.exists("Patient Merge Log", {"survivor": a.name, "duplicate": b}))

	def test_cnic_reveal_is_logged_and_cashier_blocked(self):
		from hospital_vvs.api import patients as api

		p = new_patient(cnic="35202-7654321-1")
		frappe.set_user(user(R.RECEPTIONIST))
		self.assertEqual(api.reveal_cnic(p.name), "35202-7654321-1")
		self.assertTrue(frappe.db.exists("Clinical Access Log", {"patient": p.name, "action": "CNIC reveal"}))
		frappe.set_user(user(R.PHARMACY_CASHIER))
		with self.assertRaises(frappe.PermissionError):
			api.reveal_cnic(p.name)
		frappe.set_user("Administrator")

	def test_cashier_cannot_see_clinical_fields(self):
		from hospital_vvs.api import patients as api

		p = new_patient(allergies=[{"allergy": "Penicillin"}])
		frappe.set_user(user(R.PHARMACY_CASHIER))
		data = api.get(p.name)
		self.assertNotIn("allergies", data)
		self.assertNotIn("cnic", data)
		frappe.set_user("Administrator")


def admin_shift():
	"""Billing needs an open cashier shift (Phase 2): Administrator works at a free reception counter."""
	from hospital_vvs.services import shifts

	from hospital_vvs.tests.test_phase2 import retire_stale_shift

	frappe.set_user("Administrator")
	if retire_stale_shift("Administrator"):
		return
	for c in frappe.get_all("Counter", filters={"counter_type": "Reception", "branch": "Lahore Main", "open_shift": ["is", "set"]}, pluck="current_user"):
		if c:
			retire_stale_shift(c)
	free = frappe.get_all("Counter", filters={"counter_type": "Reception", "branch": "Lahore Main", "open_shift": ["is", "not set"]}, pluck="name")
	shifts.open_shift(free[0], {"Cash": 0})


def make_slip(patient, doctor=None, **kw):
	admin_shift()
	frappe.set_user("Administrator")
	slip = frappe.get_doc(dict({"doctype": "OPD Slip", "patient": patient, "doctor": doctor or demo_doctor(), "branch": "Lahore Main",
		"posting_date": today(), "payment_mode": "Cash"}, **kw))
	slip.insert(ignore_permissions=True)
	slip.submit()
	return slip


class TestOPD(IntegrationTestCase):
	def test_slip_creates_pos_invoice_token_and_queue(self):
		p = new_patient()
		slip = make_slip(p.name)
		fee = frappe.db.get_value("Doctor", demo_doctor(), "default_fee")
		self.assertEqual(flt(slip.net_total), flt(fee))
		si = frappe.get_doc("Sales Invoice", slip.sales_invoice)
		self.assertEqual(si.docstatus, 1)
		self.assertEqual(si.is_pos, 1)
		self.assertEqual(si.is_created_using_pos, 1)  # collected inside the cashier's shift
		self.assertTrue(slip.pos_opening_entry)
		self.assertEqual(si.items[0].income_account, "OPD Income - VVSH")
		self.assertEqual(si.branch, "Lahore Main")
		self.assertTrue(slip.token_no >= 1)
		self.assertEqual(frappe.db.get_value("Queue Entry", slip.queue_entry, "status"), "Waiting")
		gl = frappe.db.sql("select sum(debit)-sum(credit) from `tabGL Entry` where voucher_no=%s and is_cancelled=0", si.name)[0][0]
		self.assertAlmostEqual(flt(gl), 0)

	def test_free_follow_up_skips_invoice(self):
		p = new_patient()
		make_slip(p.name)
		second = make_slip(p.name)
		self.assertTrue(second.is_free_follow_up)
		self.assertFalse(second.sales_invoice)
		self.assertEqual(flt(second.net_total), 0)

	def test_panel_split(self):
		p = new_patient(category="Panel", panel="Pakistan Telecom Panel", employee_id="X1")
		slip = make_slip(p.name)
		self.assertEqual(slip.payer_type, "Panel")
		self.assertAlmostEqual(flt(slip.payer_share), flt(slip.net_total) * 0.8, delta=1)
		payer = frappe.get_doc("Sales Invoice", slip.payer_invoice)
		self.assertEqual(payer.customer, "Pakistan Telecom Panel")
		self.assertEqual(payer.is_pos, 0)
		self.assertAlmostEqual(flt(payer.grand_total) + flt(frappe.db.get_value("Sales Invoice", slip.sales_invoice, "grand_total")), flt(slip.net_total), delta=1)

	def test_tax_on_price_before_discount(self):
		"""Invoice with a 5% tax template and a discount: tax is 5% of the undiscounted total."""
		from hospital_vvs.services import billing

		company = "VVS Hospital"
		acct = frappe.db.get_value("Account", {"company": company, "account_name": "Duties and Taxes", "is_group": 1})
		tax_acct = frappe.db.get_value("Account", {"account_name": "Test Service Tax", "company": company}) or frappe.get_doc({
			"doctype": "Account", "account_name": "Test Service Tax", "parent_account": acct, "company": company, "account_type": "Tax"}).insert().name
		tpl = frappe.db.get_value("Sales Taxes and Charges Template", {"title": "Test 5pc"}) or frappe.get_doc({"doctype": "Sales Taxes and Charges Template",
			"title": "Test 5pc", "company": company, "taxes": [{"charge_type": "On Net Total", "account_head": tax_acct, "rate": 5, "description": "Tax"}]}).insert().name
		frappe.db.set_value("POS Profile", "General - LHR", "taxes_and_charges", tpl)
		frappe.clear_document_cache("POS Profile", "General - LHR")
		admin_shift()
		try:
			p = new_patient()
			si = frappe.get_doc("Sales Invoice", billing.create_invoice(customer=p.customer or frappe.db.get_value("Patient", p.name, "customer"),
				patient=p.name, lines=[{"item_code": "PROC-ECG", "qty": 1, "rate": 1000}], billing_type="General", branch="Lahore Main",
				reference_doctype="Patient", reference_name=p.name, discount_amount=100))
			self.assertAlmostEqual(flt(si.total_taxes_and_charges), 50)
			self.assertAlmostEqual(flt(si.grand_total), 950)
		finally:
			frappe.db.set_value("POS Profile", "General - LHR", "taxes_and_charges", None)
			frappe.clear_document_cache("POS Profile", "General - LHR")


class TestDiscounts(IntegrationTestCase):
	def test_within_limit_and_approval(self):
		from hospital_vvs.services import discounts

		reception, supervisor = user(R.RECEPTIONIST), user(R.CASH_SUPERVISOR)
		ok = discounts.request(billing_type="OPD Slip", gross=1500, discount_amount=150, reason="poor", user=reception)
		self.assertEqual(ok.status, "Within Limit")
		big = discounts.request(billing_type="OPD Slip", gross=1500, discount_amount=600, reason="staff family", user=reception)
		self.assertEqual(big.status, "Pending")
		with self.assertRaises(frappe.PermissionError):
			discounts.decide(big.name, True, approver=reception)
		discounts.decide(big.name, True, approver=supervisor)
		self.assertEqual(frappe.db.get_value("Discount Authorization", big.name, "status"), "Approved")
		with self.assertRaises(frappe.ValidationError):
			discounts.request(billing_type="OPD Slip", gross=1500, discount_amount=100, reason=" ", user=reception)

	def test_slip_requires_usable_authorization(self):
		from hospital_vvs.services import discounts

		p = new_patient()
		pending = discounts.request(billing_type="OPD Slip", gross=1500, discount_amount=700, reason="x", user=user(R.RECEPTIONIST))
		with self.assertRaises(frappe.ValidationError):
			make_slip(p.name, discount_amount=700, discount_reason="x", discount_authorization=pending.name)


class TestSafety(IntegrationTestCase):
	def test_allergy_interaction_override_and_amend(self):
		p = new_patient(allergies=[{"allergy": "Penicillin"}], long_term_medicines=[{"item": "COUMADIN-5MG", "generic": "Warfarin"}])
		res = safety.check(p.name, [{"item": "AMOXIL-500MG"}, {"item": "BRUFEN-400MG"}])
		self.assertTrue(res[0]["blocking"])
		self.assertEqual(res[0]["alerts"][0]["type"], "Allergy")
		self.assertTrue(res[1]["blocking"])  # warfarin + ibuprofen: Major
		frappe.set_user("Administrator")
		rx = frappe.get_doc({"doctype": "Prescription", "patient": p.name, "doctor": demo_doctor(), "branch": "Lahore Main",
			"medicines": [{"item": "AMOXIL-500MG", "dose": "1", "frequency": "1+0+1"}, {"item": "BRUFEN-400MG", "dose": "1", "frequency": "1+1+1"}]})
		rx.insert()
		with self.assertRaises(frappe.ValidationError):
			rx.submit()
		rx.reload()
		for m in rx.medicines:
			m.override_reason = "Benefit outweighs risk"
		rx.save()
		rx.submit()
		self.assertEqual(rx.status, "Signed")
		self.assertTrue(rx.has_overrides)
		self.assertEqual(rx.medicines[0].override_by, "Administrator")
		# signed records are immutable
		rx.advice = "changed"
		with self.assertRaises(frappe.ValidationError):
			rx.save()
		from hospital_vvs.api import prescription as api

		frappe.set_user(user(R.DOCTOR))
		new = api.amend(rx.name, "Dose correction")
		self.assertEqual(new["version_no"], 2)
		self.assertEqual(frappe.db.get_value("Prescription", rx.name, "status"), "Superseded")
		frappe.set_user("Administrator")

	def test_dose_parsing(self):
		self.assertEqual(safety.doses_per_day("1+0+1"), 2)
		self.assertEqual(safety.doses_per_day("TDS"), 3)
		self.assertEqual(safety.doses_per_day("6 hourly"), 4)


class TestAppointments(IntegrationTestCase):
	def _slot(self):
		doctor = demo_doctor()
		svc.generate_slots(10, doctor)
		dates = [d for d in svc.available_dates(doctor) if str(d.slot_date) > today()]
		slots = svc.available_slots(doctor, dates[0].slot_date)
		return doctor, slots

	def test_hold_race_book_reschedule_cancel(self):
		doctor, slots = self._slot()
		s = slots[0].name
		svc.hold_slot(s, "web:aaaa")
		with self.assertRaises(frappe.ValidationError):
			svc.hold_slot(s, "web:bbbb")  # second user racing for the same slot
		p = new_patient()
		appt = svc.book(doctor=doctor, slot=s, patient=p.name, source_channel="Web", hold_key="web:aaaa")
		self.assertEqual(frappe.db.get_value("Time Slot", s, "status"), "Booked")
		self.assertTrue(frappe.db.exists("Message Log", {"reference_name": appt.name, "event": ["in", ["appointment_confirmed", "appointment_requested"]]}))
		if appt.status == "Pending":
			svc.set_status(appt.name, "Confirmed")
		svc.reschedule(appt.name, slots[1].name)
		self.assertEqual(frappe.db.get_value("Time Slot", s, "status"), "Available")
		svc.cancel(appt.name)
		self.assertEqual(frappe.db.get_value("Time Slot", slots[1].name, "status"), "Available")

	def test_leave_blocks_slots(self):
		doctor, slots = self._slot()
		date = frappe.db.get_value("Time Slot", slots[0].name, "slot_date")
		leave = frappe.get_doc({"doctype": "Doctor Leave", "doctor": doctor, "from_date": date, "to_date": date}).insert()
		self.assertEqual(svc.available_slots(doctor, date), [])
		leave.delete()
		self.assertTrue(svc.available_slots(doctor, date))

	def test_expired_hold_released(self):
		doctor, slots = self._slot()
		s = slots[0].name
		svc.hold_slot(s, "x")
		frappe.db.set_value("Time Slot", s, "hold_expires_at", add_days(frappe.utils.now_datetime(), -1))
		svc.release_expired_holds()
		self.assertEqual(frappe.db.get_value("Time Slot", s, "status"), "Available")


class TestWhatsAppBot(IntegrationTestCase):
	def test_urdu_booking_with_proof(self):
		from hospital_vvs.messaging.whatsapp_bot import handle_inbound

		phone = "+923459876543"
		frappe.db.delete("WhatsApp Conversation", {"phone": phone})
		svc.generate_slots(10, demo_doctor())

		def opts():
			return frappe.parse_json(frappe.db.get_value("WhatsApp Conversation", {"phone": phone}, "data")).get("options")

		handle_inbound(phone, text="سلام")
		handle_inbound(phone, reply_id="lang:ur")
		handle_inbound(phone, reply_id="menu:book")
		if frappe.db.get_value("WhatsApp Conversation", {"phone": phone}, "current_step") == "branch":
			handle_inbound(phone, reply_id="branch:Lahore Main")
		handle_inbound(phone, reply_id="spec:General Physician")
		doc = next(o[0] for o in opts() if demo_doctor() in o[0])
		handle_inbound(phone, reply_id=doc)
		handle_inbound(phone, text="1")  # first date by number
		handle_inbound(phone, text="1")  # first slot by number
		handle_inbound(phone, text="xyz")  # unknown → re-prompt, not a handoff yet
		self.assertEqual(frappe.db.get_value("WhatsApp Conversation", {"phone": phone}, "handed_off"), 0)
		handle_inbound(phone, reply_id="pat:new")
		handle_inbound(phone, text="Sajid Mehmood, 41, M")
		handle_inbound(phone, reply_id="sum:confirm")
		if frappe.db.get_value("WhatsApp Conversation", {"phone": phone}, "current_step") == "payment":
			handle_inbound(phone, reply_id="pay:Payment Proof")
		handle_inbound(phone, media="wa-media:proof.jpg")
		appt = frappe.get_all("Appointment", filters={"phone": phone, "source_channel": "WhatsApp"}, fields=["name", "payment_proof", "patient"])
		self.assertEqual(len(appt), 1)
		self.assertEqual(appt[0].payment_proof, "wa-media:proof.jpg")
		self.assertEqual(frappe.db.get_value("Patient", appt[0].patient, "patient_name"), "Sajid Mehmood")

	def test_reception_handoff(self):
		from hospital_vvs.messaging.whatsapp_bot import handle_inbound

		phone = "+923451112222"
		frappe.db.delete("WhatsApp Conversation", {"phone": phone})
		handle_inbound(phone, text="hi")
		handle_inbound(phone, text="reception")
		self.assertEqual(frappe.db.get_value("WhatsApp Conversation", {"phone": phone}, "handed_off"), 1)


class TestMessaging(IntegrationTestCase):
	def test_consent_and_sms_fallback(self):
		from hospital_vvs.services import messaging

		frappe.db.set_single_value("Clinic Settings", {"quiet_hours_start": None, "quiet_hours_end": None})
		frappe.clear_document_cache("Clinic Settings")

		no_consent = new_patient()
		name = messaging.send("appointment_reminder", patient=no_consent.name, context={"ref": "B1"})
		self.assertEqual(frappe.db.get_value("Message Log", name, "status"), "Skipped")
		p = new_patient(consents=[{"consent_type": "WhatsApp messages", "status": "Given"}, {"consent_type": "SMS messages", "status": "Given"}])
		orig = messaging.TestAdapter.send_template

		def boom(*a, **k):
			raise Exception("WhatsApp down")

		messaging.TestAdapter.send_template = boom
		try:
			frappe.db.set_single_value("Clinic Settings", {"max_send_attempts": 1, "quiet_hours_start": None, "quiet_hours_end": None})
			frappe.clear_document_cache("Clinic Settings")
			name = messaging.send("appointment_reminder", patient=p.name, context={"ref": "B2"})
		finally:
			messaging.TestAdapter.send_template = orig
			frappe.db.set_single_value("Clinic Settings", {"max_send_attempts": 3, "quiet_hours_start": "22:00:00", "quiet_hours_end": "08:00:00"})
			frappe.clear_document_cache("Clinic Settings")
		self.assertEqual(frappe.db.get_value("Message Log", name, "status"), "Failed")
		self.assertTrue(frappe.db.exists("Message Log", {"phone": p.phone, "channel": "SMS", "status": "Sent", "event": "appointment_reminder"}))


class TestRoutes(IntegrationTestCase):
	def test_role_filtered_routes(self):
		from hospital_vvs.api.session import allowed_routes

		cashier = {r["route"] for r in allowed_routes(user(R.PHARMACY_CASHIER))}
		self.assertNotIn("/pw-prescription", cashier)
		self.assertNotIn("/settings", cashier)
		doctor = {r["route"] for r in allowed_routes(user(R.DOCTOR))}
		self.assertIn("/pw-prescription", doctor)


class TestBookingMessages(IntegrationTestCase):
	def test_web_request_then_reception_confirm(self):
		frappe.db.set_single_value("Clinic Settings", {"auto_confirm": 0, "quiet_hours_start": None, "quiet_hours_end": None})
		frappe.clear_document_cache("Clinic Settings")
		doctor = demo_doctor()
		svc.generate_slots(10, doctor)
		date = [d for d in svc.available_dates(doctor) if str(d.slot_date) > today()][0].slot_date
		slot = svc.available_slots(doctor, date)[0].name
		appt = svc.book(doctor=doctor, slot=slot, patient_name="New Web Patient", phone="03211234500", source_channel="Web", messages_allowed=1)
		self.assertEqual(appt.status, "Pending")
		req = frappe.get_all("Message Log", filters={"reference_name": appt.name, "event": "appointment_requested"}, fields=["status", "phone", "body"])
		self.assertEqual(req[0].status, "Sent")  # no patient record yet: the booking's own consent allows it
		self.assertEqual(req[0].phone, "+923211234500")
		self.assertIn(appt.booking_ref, req[0].body)
		svc.set_status(appt.name, "Confirmed")
		self.assertTrue(frappe.db.exists("Message Log", {"reference_name": appt.name, "event": "appointment_confirmed", "status": "Sent"}))
		frappe.db.set_single_value("Clinic Settings", {"auto_confirm": 1})
		frappe.clear_document_cache("Clinic Settings")

	def test_no_consent_no_message(self):
		doctor = demo_doctor()
		svc.generate_slots(10, doctor)
		date = [d for d in svc.available_dates(doctor) if str(d.slot_date) > today()][0].slot_date
		slot = svc.available_slots(doctor, date)[0].name
		appt = svc.book(doctor=doctor, slot=slot, patient_name="Quiet Patient", phone="03211234501", source_channel="Web", messages_allowed=0)
		logs = frappe.get_all("Message Log", filters={"reference_name": appt.name}, pluck="status")
		self.assertTrue(all(s == "Skipped" for s in logs))

	def test_first_available_and_priority(self):
		svc.generate_slots(10)
		s = svc.first_available("General Physician", branch="Lahore Main")
		self.assertTrue(s and s["doctor"])
		p = new_patient()
		appt = svc.book(doctor=s["doctor"], slot=s["slot"], patient=p.name, priority="Urgent")
		self.assertEqual(appt.priority, "Urgent")
		self.assertEqual(appt.status, "Confirmed")
