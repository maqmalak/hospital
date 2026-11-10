"""Phase 7 hardening: W15 security (field level, access log, brute force), W17 branch isolation, staging anonymize (D-53)."""
import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from hospital_vvs import roles as R
from hospital_vvs.tests.test_phase1 import demo_doctor, new_patient


def signed_rx():
	return frappe.db.sql("""select rx.name, rx.patient from `tabPrescription` rx where rx.docstatus=1 and rx.status='Signed'
		and exists (select 1 from `tabPrescription Diagnosis` d where d.parent=rx.name) order by rx.creation desc limit 1""", as_dict=True)[0]


class Base(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(frappe.set_user, "Administrator")


class TestW15Security(Base):
	def test_money_roles_cannot_reach_clinical_endpoints(self):
		from hospital_vvs.api import ipd, patients, prescription

		rx = signed_rx()
		item = frappe.db.get_value("Prescription Medicine", {"parent": rx.name}, "item")
		for user in ("cashier@vvs.demo", "accounts@vvs.demo", "finder@vvs.demo"):
			frappe.set_user(user)
			for fn in (lambda: prescription.copy_previous(rx.patient), lambda: prescription.check(rx.patient, json.dumps([{"item": item}])),
					lambda: prescription.print_data(rx.name), lambda: patients.history(rx.patient), lambda: ipd.check_medicine(rx.patient, item)):
				self.assertRaises(frappe.PermissionError, fn)
		frappe.set_user("reception@vvs.demo")
		self.assertTrue(prescription.print_data(rx.name)["rx"])  # reception reprints for the patient

	def test_finder_reads_prescription_without_diagnoses(self):
		from frappe import client

		rx = signed_rx()
		frappe.set_user("finder@vvs.demo")
		d = client.get("Prescription", rx.name)
		self.assertTrue(d.get("medicines"))
		self.assertFalse(d.get("diagnoses"))
		self.assertFalse(d.get("examination_notes"))
		frappe.set_user("nurse@vvs.demo")
		self.assertTrue(client.get("Prescription", rx.name).get("diagnoses"))

	def test_pos_lines_hide_alert_text_from_cashier(self):
		from hospital_vvs.services import pharmacy

		rx = signed_rx()
		line = frappe.db.get_value("Prescription Medicine", {"parent": rx.name}, "name")
		frappe.db.set_value("Prescription Medicine", line, {"alert_message": "Allergy: penicillin", "override_reason": "QA"})
		frappe.set_user("cashier@vvs.demo")
		self.assertFalse(any(l["alert"] or l["override"] for l in pharmacy.prescription_lines(rx.name)["lines"]))
		frappe.set_user("pharmacist@vvs.demo")
		self.assertTrue(any(l["alert"] for l in pharmacy.prescription_lines(rx.name)["lines"]))

	def test_history_read_is_logged_and_log_is_append_only(self):
		from hospital_vvs.api import patients

		rx = signed_rx()
		frappe.set_user("nurse@vvs.demo")
		patients.history(rx.patient)
		frappe.set_user("Administrator")
		log = frappe.get_all("Clinical Access Log", filters={"user": "nurse@vvs.demo", "patient": rx.patient}, order_by="creation desc", limit=1, pluck="name")
		self.assertTrue(log)
		frappe.set_user("admin@vvs.demo")
		self.assertRaises(frappe.PermissionError, frappe.delete_doc, "Clinical Access Log", log[0])

	def test_wrong_passwords_are_limited(self):
		from hospital_vvs.api import session
		from hospital_vvs.utils import fail_reset

		frappe.set_user("nurse@vvs.demo")
		fail_reset("unlock", "nurse@vvs.demo")
		self.addCleanup(fail_reset, "unlock", "nurse@vvs.demo")
		for _ in range(5):
			self.assertRaises(frappe.AuthenticationError, session.unlock, "wrong")
		self.assertRaises(frappe.TooManyRequestsError, session.unlock, "wrong")

	def test_two_factor_roles_flagged(self):
		for role in R.TWO_FACTOR:
			self.assertEqual(frappe.db.get_value("Role", role, "two_factor_auth"), 1, role)


class TestW17BranchIsolation(Base):
	def setUp(self):
		super().setUp()
		if not frappe.db.exists("Branch", "QA Branch B"):
			frappe.get_doc({"doctype": "Branch", "branch": "QA Branch B"}).insert()
		self.counter = frappe.db.get_value("Counter", {"branch": "QA Branch B"}) or frappe.get_doc({"doctype": "Counter", "counter_name": "QA B Counter",
			"branch": "QA Branch B", "counter_type": "Reception", "is_active": 1}).insert(ignore_mandatory=True).name
		frappe.db.set_single_value("Clinic Settings", "strict_branch_access", 1)
		frappe.clear_document_cache("Clinic Settings")

	def test_branch_a_user_cannot_see_branch_b(self):
		from hospital_vvs.api import lab, opd
		from hospital_vvs.services import shifts
		from hospital_vvs.utils import check_branch

		frappe.set_user("reception@vvs.demo")
		self.assertRaises(frappe.PermissionError, check_branch, "QA Branch B")
		self.assertRaises(frappe.PermissionError, opd.queue, None, "QA Branch B")
		self.assertRaises(frappe.PermissionError, opd.recent_slips, "QA Branch B")
		self.assertNotIn(self.counter, [c.name for c in shifts.counters_for()])
		self.assertRaises(frappe.PermissionError, shifts.check_counter, self.counter)
		frappe.set_user("lab@vvs.demo")
		self.assertRaises(frappe.PermissionError, lab.orders, branch="QA Branch B")

	def test_patient_from_branch_a_found_at_branch_b_with_history(self):
		from hospital_vvs.api import patients

		p = new_patient()
		frappe.set_user("Administrator")
		frappe.get_doc({"doctype": "User Permission", "user": "nurse2@vvs.demo", "allow": "Branch", "for_value": "QA Branch B", "apply_to_all_doctypes": 1}).insert()
		frappe.db.delete("User Permission", {"user": "nurse2@vvs.demo", "allow": "Branch", "for_value": ["!=", "QA Branch B"]})
		frappe.clear_cache(user="nurse2@vvs.demo")
		frappe.set_user("nurse2@vvs.demo")
		self.assertIn(p.name, [r["name"] for r in patients.search(p.name)])
		self.assertEqual(patients.history(p.name)["patient"]["name"], p.name)


class TestStagingAnonymize(Base):
	def test_refused_on_live_site(self):
		from hospital_vvs.setup import anonymize

		self.assertRaises(frappe.PermissionError, anonymize.run, False)

	def test_anonymizes_names_phones_and_copies(self):
		from hospital_vvs.setup import anonymize

		p = new_patient()
		before = frappe.db.count("Patient", {"patient_name": ["like", "Patient %"]})
		with patch.dict(frappe.conf, {"hv_allow_anonymize": 1}):
			anonymize.run(commit=False, only=[p.name])
		row = frappe.db.get_value("Patient", p.name, ["patient_name", "phone", "cnic_hash", "address"], as_dict=True)
		self.assertTrue(row.patient_name.startswith("Patient "))
		self.assertTrue(row.phone.startswith("+92300"))
		self.assertFalse(row.cnic_hash or row.address)
		self.assertEqual(frappe.db.count("Patient", {"patient_name": ["like", "Patient %"]}), before + 1)  # only this patient changed
		frappe.db.rollback()
