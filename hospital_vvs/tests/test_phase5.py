"""Phase 5 acceptance: W6 nursing comms, W16 feedback (D-44)."""
import secrets
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime

from hospital_vvs.api import comms as api
from hospital_vvs.services import patient_comms as svc
from hospital_vvs.tests.test_phase1 import demo_doctor, make_slip, new_patient


def bedside(station="NS-General"):
	token = secrets.token_urlsafe(18)
	p = new_patient()
	bed = frappe.db.get_value("Hospital Bed", {"ward": ["in", frappe.get_all("Ward", filters={"nursing_station": station}, pluck="name")]})
	prof = frappe.get_doc({"doctype": "Patient Comms Profile", "patient": p.name, "station": station, "bed": bed, "active": 1,
		"token_hash": svc._hash(token), "activated_on": add_to_date(now_datetime(), minutes=-5)}).insert(ignore_permissions=True)
	return token, prof


class TestNursingComms(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(frappe.set_user, "Administrator")

	def test_w6_patient_to_station_and_back(self):
		token, prof = bedside()
		frappe.set_user("Guest")
		svc.patient_send(token, "Pain")
		svc.patient_send(token, "Message", "پانی چاہیے please", voice=1, language="ur")
		frappe.set_user("nurse@vvs.demo")
		row = next(r for r in api.board("NS-General")["patients"] if r["name"] == prof.name)
		self.assertEqual((row["unread"], row["urgency"]), (2, "Urgent"))  # pain is urgent
		self.assertEqual(api.board("NS-General")["patients"][0]["urgency"], "Urgent")  # urgent first
		t = api.thread(prof.name)
		self.assertTrue(any(m.voice for m in t["messages"]))
		self.assertEqual(next(r for r in api.board("NS-General")["patients"] if r["name"] == prof.name)["unread"], 0)  # opened = read
		api.reply(prof.name, "Coming now")
		ans = frappe.get_all("Comms Message", filters={"profile": prof.name, "direction": "From patient"}, fields=["answered_at", "response_seconds"])
		self.assertTrue(all(a.answered_at is not None for a in ans))
		frappe.set_user("Guest")
		st = svc.portal_state(token)
		self.assertEqual(st["messages"][-1]["text"], "Coming now")
		self.assertTrue(st["messages"][-1]["sender_name"])
		frappe.set_user("nurse@vvs.demo")
		other, _p2 = bedside()
		r = api.broadcast("NS-General", "Visiting hours end at 8 pm")
		self.assertGreaterEqual(r["recipients"], 2)
		frappe.set_user("Guest")
		self.assertIn("Visiting hours end at 8 pm", [m["text"] for m in svc.portal_state(other)["messages"]])
		frappe.set_user("nurse@vvs.demo")
		rep = api.response_report(station="NS-General")
		self.assertTrue(rep and rep[0]["answered"] >= 2)

	def test_bad_or_discharged_token_refused(self):
		token, prof = bedside()
		with self.assertRaises(frappe.PermissionError):
			svc.portal_state("x" * 24)
		frappe.db.set_value("Patient Comms Profile", prof.name, "active", 0)
		with self.assertRaises(frappe.PermissionError):
			svc.patient_send(token, "Water")

	def test_other_branch_station_hidden(self):
		frappe.set_user("nurse@vvs.demo")  # Lahore Main only (D-41)
		self.assertNotIn("NS-General (ISB)", [s.name for s in api.stations()])
		with self.assertRaises(frappe.PermissionError):
			api.board("NS-General (ISB)")


class TestFeedback(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		frappe.db.set_single_value("Clinic Settings", {"enable_feedback": 1, "feedback_opd": 1, "feedback_opd_hours": 2, "feedback_gap_days": 30, "feedback_low_rating": 2})
		frappe.clear_document_cache("Clinic Settings")

	def done_visit(self, hours_ago=3):
		slip = make_slip(new_patient().name, demo_doctor())
		frappe.db.set_value("Queue Entry", slip.queue_entry, {"status": "Done", "completed_at": add_to_date(now_datetime(), hours=-hours_ago)})
		return slip

	def test_w16_request_low_rating_follow_up_report(self):
		slip = self.done_visit(3)
		early = self.done_visit(0.5)
		svc.queue_feedback_requests()
		fb = frappe.get_doc("Patient Feedback", {"reference_name": slip.queue_entry})
		self.assertEqual((fb.status, fb.source, fb.doctor), ("Requested", "OPD", slip.doctor))
		self.assertTrue(fb.message_log)
		self.assertFalse(frappe.db.exists("Patient Feedback", {"reference_name": early.queue_entry}))  # not yet N hours
		token = secrets.token_urlsafe(18)
		fb.db_set("token_hash", svc._hash(token))
		frappe.set_user("Guest")
		self.assertEqual(api.feedback_form(token)["status"], "Requested")
		r = api.feedback_submit(token, 2, "Long wait")
		self.assertTrue(r["low"])
		frappe.set_user("Administrator")
		fb.reload()
		self.assertEqual((fb.rating_value, fb.follow_up, fb.channel), (2, "Open", "Web"))
		api.feedback_follow_up(fb.name, "Called the patient, apologised; queue SMS fixed")
		self.assertEqual(frappe.db.get_value("Patient Feedback", fb.name, "follow_up"), "Done")
		rep = api.feedback_report()
		self.assertIn(slip.doctor, [d.doctor for d in rep["by_doctor"]])

	def test_one_request_per_gap_and_whatsapp_reply(self):
		slip = self.done_visit(3)
		svc.queue_feedback_requests()
		pat = frappe.db.get_value("Queue Entry", slip.queue_entry, "patient")
		self.assertIsNone(svc.request_feedback(pat, "Pharmacy", "Dispense Ticket", "DT-X", None, "Lahore Main"))  # within the gap
		phone = frappe.db.get_value("Patient", pat, "phone")
		self.assertTrue(svc.whatsapp_rating(phone, "4"))
		self.assertEqual(frappe.db.get_value("Patient Feedback", {"patient": pat}, "rating_value"), 4)
		self.assertFalse(svc.whatsapp_rating(phone, "hello"))
