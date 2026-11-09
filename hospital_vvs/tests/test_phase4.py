"""Phase 4 acceptance test (12-workflows.md W5) plus token, OTP-link and refund rules. Needs the demo seeders."""

import random
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt

from hospital_vvs.services import online_visit as svc
from hospital_vvs.tests.test_phase2 import as_user
from hospital_vvs.tests.test_phase3 import DESK, desk_shift


def _phone():
	return f"+92345{random.randint(1000000, 9999999)}"


def ov_doctor():
	return frappe.db.get_value("Doctor", {"online_visits": 1, "is_active": 1}) or frappe.db.get_value("Doctor", {"is_active": 1})


class TestW5OnlineVisit(IntegrationTestCase):
	def setUp(self):
		# wrong-PIN attempts commit (to keep the lock); never let a test commit its data
		patcher = patch.object(frappe.db, "commit", lambda *a, **k: None)
		patcher.start()
		self.addCleanup(patcher.stop)
		frappe.set_user("Administrator")
		frappe.db.set_single_value("Clinic Settings", {"enable_online_visit": 1, "ov_fee": 1500, "ov_video_provider": "Jitsi Meet (auto link)",
			"quiet_hours_start": None, "quiet_hours_end": None})
		frappe.clear_document_cache("Clinic Settings")

	def test_w5_request_to_completed(self):
		phone = _phone()
		ov, token = svc.create({"patient_name": "شازیہ پروین", "phone": phone, "gender": "Female", "age": 41, "language": "ur",
			"complaint": "تین دن سے بخار اور کھانسی", "symptoms": ["Fever", "Cough"], "duration": "3 days", "payment_method": "JazzCash",
			"payment_reference": "JC-778899"})
		self.assertEqual(ov.status, "Pending")
		self.assertEqual(ov.fee_status, "Proof Submitted")
		self.assertNotEqual(ov.token_hash, token)  # only the hash is stored
		self.assertTrue(frappe.db.exists("Message Log", {"reference_name": ov.name, "event": "ov_received"}))
		view = svc.public_view(svc.by_token(token))
		self.assertEqual(view["status"], "Pending")
		self.assertIsNone(view["video_link"])
		with self.assertRaises(frappe.DoesNotExistError):
			svc.by_token(token[:-2] + "xx")

		# reception: fee taken in their cashier shift (JazzCash) → POS invoice in the shift; accept → patient registered, doctor, video link
		shift = desk_shift()
		with self.assertRaises(frappe.PermissionError):
			from hospital_vvs.api.online_visit import verify_fee as api_verify

			as_user("ovstaff@vvs.demo")
			api_verify(ov.name, 1)  # the online desk cannot post money
		as_user(DESK)
		svc.verify_fee(ov.name, payment_mode="JazzCash")
		as_user("Administrator")
		ov.reload()
		self.assertEqual(ov.fee_status, "Verified")
		si = frappe.get_doc("Sales Invoice", ov.sales_invoice)
		self.assertEqual(flt(si.grand_total), 1500)
		self.assertEqual((si.is_pos, si.is_created_using_pos), (1, 1))
		self.assertEqual(si.payments[0].mode_of_payment, "JazzCash")
		from hospital_vvs.services import shifts

		self.assertEqual(next(m for m in shifts.summary(shift.name)["modes"] if m["mode_of_payment"] == "JazzCash")["collections"], 1500)
		doctor = ov_doctor()
		svc.accept(ov.name, doctor)
		ov.reload()
		self.assertEqual(ov.status, "Accepted")
		self.assertTrue(ov.patient)
		self.assertTrue(ov.video_link.startswith("https://meet.jit.si/VVS-"))
		view = svc.public_view(svc.by_token(token))
		self.assertEqual(view["video_link"], ov.video_link)

		# cannot complete before a signed prescription
		with self.assertRaises(frappe.ValidationError):
			svc.complete(ov.name)
		from hospital_vvs.api.prescription import save

		item = frappe.db.get_value("Item", {"hv_is_medicine": 1, "hv_prescription_required": 0})
		rx = save({"online_visit": ov.name, "medicines": [{"item": item, "dose": "1", "frequency": "1+0+1", "duration": "5 days", "qty": 10,
			"override_reason": "test"}], "advice": "Drink plenty of water"}, sign=1)
		ov.reload()
		self.assertEqual(ov.prescription, rx["name"])
		self.assertEqual(frappe.db.get_value("Prescription", rx["name"], "source"), "Online Visit")
		svc.complete(ov.name, "Viral fever, reviewed on video", "Not needed")
		t = svc.by_token(token)
		view = svc.public_view(t)
		self.assertEqual(view["status"], "Completed")
		self.assertTrue(view["has_prescription"])
		self.assertNotIn("prescription", view)  # hidden until the patient verifies
		with self.assertRaises(frappe.ValidationError):
			svc.verify(t, "0000")
		svc.verify(svc.by_token(token), phone[-4:])
		view = svc.public_view(svc.by_token(token))
		self.assertEqual(view["prescription"]["name"], rx["name"])
		self.assertEqual(len(view["prescription"]["medicines"]), 1)

	def test_cancel_and_refund(self):
		ov, token = svc.create({"patient_name": "Refund Test", "phone": _phone(), "gender": "Male", "age": 30, "complaint": "Back pain",
			"payment_method": "Easypaisa", "payment_reference": "EP-1"})
		desk_shift()
		as_user(DESK)
		svc.verify_fee(ov.name, payment_mode="Easypaisa")
		with self.assertRaises(frappe.ValidationError):
			svc.refund(ov.name, refund_reference="R-1")  # still open
		as_user("Administrator")
		svc.cancel(ov.name, "Doctor unavailable")
		as_user(DESK)
		svc.refund(ov.name, refund_reference="EP-REF-1", refund_notes="Sent back to the wallet")
		as_user("Administrator")
		ov.reload()
		self.assertEqual(ov.fee_status, "Refunded")
		self.assertEqual(flt(ov.refund_amount), 1500)
		cn = frappe.get_doc("Sales Invoice", ov.credit_note)
		self.assertEqual(cn.is_return, 1)
		self.assertEqual(cn.payments[0].mode_of_payment, "Easypaisa")  # paid back from the shift
		self.assertEqual(svc.public_view(svc.by_token(token))["refund_reference"], "EP-REF-1")
		# a patient can cancel only while pending
		ov2, token2 = svc.create({"patient_name": "Self Cancel", "phone": _phone(), "complaint": "Headache"})
		svc.patient_cancel(svc.by_token(token2), "Feeling better")
		self.assertEqual(frappe.db.get_value("Online Visit Request", ov2.name, "status"), "Cancelled")

	def test_existing_patient_needs_verified_phone(self):
		p = frappe.get_all("Patient", filters={"disabled": 0, "temporary_record": 0, "phone": ["is", "set"]}, fields=["name", "phone"], limit=1)[0]
		with self.assertRaises(frappe.ValidationError):
			svc.create({"patient": p.name, "phone": p.phone, "complaint": "Cough"})
		ov, _t = svc.create({"patient": p.name, "phone": p.phone, "complaint": "Cough"}, verified_phone=p.phone)
		self.assertEqual(ov.patient, p.name)
		self.assertEqual(ov.phone_verified, 1)

	def test_no_store_header(self):
		from hospital_vvs.utils import no_store

		class R:
			headers = {}

		class Q:
			path = "/api/method/hospital_vvs.api.online_visit.status"

		resp = R()
		no_store(resp, Q())
		self.assertIn("no-store", resp.headers["Cache-Control"])
