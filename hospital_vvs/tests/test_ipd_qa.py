"""Regression tests for the IPD / ER live audit (D-56, docs/QA-IPD.md)."""
import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, flt, today

from hospital_vvs.services import er, ipd
from hospital_vvs.tests.test_phase3 import DESK, desk_shift, doctor, free_bed, new_patient


def setUpModule():
	global _p
	_p = patch.object(frappe.db, "commit", lambda *a, **k: None)
	_p.start()


def tearDownModule():
	_p.stop()


def _close(adm, bed):
	from hospital_vvs.api.ward import _set

	frappe.db.set_value("Bed Allotment", adm, "status", "Cancelled")
	_set(bed, "Cleaning")
	_set(bed, "Available")


class TestIpdQa(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("Clinic Settings", {"discharge_clearance_hold": 1, "require_preauth_for_insurance": 1, "require_shift_for_billing": 1,
			"enable_shifts": 1, "mar_approval_gate": 0})
		frappe.clear_document_cache("Clinic Settings")

	def test_impossible_vitals_refused_on_chart_and_triage(self):
		from hospital_vvs.api import ipd as api

		p = new_patient("Vitals Check")
		bed = free_bed("General")
		adm, _t = ipd.admit(p.name, bed, doctor(), reason="Test")
		self.assertRaises(frappe.ValidationError, api.add_vitals, json.dumps({"bed_allotment": adm.name, "pulse": 900}))
		self.assertRaises(frappe.ValidationError, api.add_vitals, json.dumps({"bed_allotment": adm.name, "temperature": 150}))
		api.add_vitals(json.dumps({"bed_allotment": adm.name, "pulse": 88, "temperature": 99.1}))
		v = er.register(patient=p.name, branch="Lahore Main", chief_complaint="Test")
		self.assertRaises(frappe.ValidationError, er.triage, v.name, "Green", {"pulse": 400})
		_close(adm.name, bed)

	def test_extra_advance_must_be_refunded_before_discharge(self):
		p = new_patient("Refund Check")
		bed = free_bed("General")
		adm, _t = ipd.admit(p.name, bed, doctor(), reason="Short stay")
		desk_shift()
		frappe.set_user(DESK)
		ipd.take_payment(500000, "Cash", "Advance", adm=adm.name)  # far above any one-day bill
		frappe.set_user("Administrator")
		ipd.sign_summary(adm.name, {"final_diagnosis": "Observation", "treatment_summary": "Observed", "discharge_type": "Normal"})
		ipd.make_final_bill(adm.name)
		bill = ipd.running_bill(adm.name)
		self.assertGreater(bill["credit"], 0)
		self.assertFalse(next(c for c in ipd.clearance(adm.name)["checks"] if c["key"] == "refund")["ok"])
		self.assertRaises(frappe.ValidationError, ipd.complete_discharge, adm.name)
		frappe.set_user(DESK)
		self.assertRaises(frappe.ValidationError, ipd.take_payment, bill["credit"] + 1000, "Cash", "Refund", adm=adm.name)
		ipd.take_payment(bill["credit"], "Cash", "Refund", adm=adm.name)
		frappe.set_user("Administrator")
		ipd.complete_discharge(adm.name)
		self.assertEqual(frappe.db.get_value("Bed Allotment", adm.name, "status"), "Discharged")

	def test_fully_covered_stay_bills_only_the_insurer(self):
		ins = "QA Full Cover " + frappe.generate_hash(length=4)
		frappe.get_doc({"doctype": "Customer", "customer_name": ins, "customer_group": "Insurance Providers", "territory": "Pakistan", "customer_type": "Company",
			"hv_coverage_percent": 100}).insert()
		p = new_patient("Full Cover", category="Insurance", insurance_provider=ins, policy_no="FC-1")
		pa = frappe.get_doc({"doctype": "Insurance Pre-Auth", "patient": p.name, "payer": ins, "requested_amount": 100000, "approved_amount": 100000,
			"approval_no": "FC-PA", "status": "Approved", "valid_till": add_days(today(), 5)}).insert()
		bed = free_bed("General")
		adm, _t = ipd.admit(p.name, bed, doctor(), reason="Covered", payer_type="Insurance", payer=ins, pre_auth=pa.name)
		ipd.sign_summary(adm.name, {"final_diagnosis": "Covered", "treatment_summary": "x", "discharge_type": "Normal"})
		inv = ipd.make_final_bill(adm.name)
		adm.reload()
		self.assertEqual(inv, adm.payer_invoice)  # no empty patient invoice
		self.assertEqual(frappe.db.get_value("Sales Invoice", inv, "customer"), ins)
		bill = ipd.running_bill(adm.name)
		self.assertEqual(bill["balance"], 0)
		self.assertEqual(bill["final_invoice"], inv)
		ipd.complete_discharge(adm.name)
		self.assertEqual(frappe.db.get_value("Bed Allotment", adm.name, "status"), "Discharged")

	def test_admin_identifies_unknown_er_patient(self):
		from hospital_vvs.api import er as er_api

		v = er.register(unknown={"gender": "Female", "approx_age": 25}, branch="Lahore Main", chief_complaint="Unconscious")
		tmp = frappe.db.get_value("ER Visit", v.name, "patient")
		real = new_patient("Identified Lady", gender="Female")
		frappe.set_user("admin@vvs.demo")  # PW Admin, not System Manager
		er_api.identify(v.name, real.name)
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("ER Visit", v.name, "patient"), real.name)
		self.assertEqual(frappe.db.get_value("Patient", tmp, "merged_into"), real.name)
