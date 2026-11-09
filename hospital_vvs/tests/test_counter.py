"""Reception counter (Restaurant OS-style POS): one cart → OPD slip, lab order, services, IPD advance, dues; split tender; offline sync;
refunds. Needs the demo seeders."""

import random
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt

from hospital_vvs.services import counter, ipd, shifts
from hospital_vvs.tests.test_phase2 import as_user
from hospital_vvs.tests.test_phase3 import DESK, desk_shift, doctor, free_bed, new_patient


def tenders(*pairs):
	return [{"mode_of_payment": m, "amount": a, "reference_no": r} for m, a, r in pairs]


class TestCounter(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		patcher = patch.object(frappe.db, "commit", lambda *a, **k: None)
		patcher.start()
		self.addCleanup(patcher.stop)
		frappe.db.set_single_value("Clinic Settings", {"require_shift_for_billing": 1, "enable_shifts": 1, "follow_up_free_days": 7})
		frappe.clear_document_cache("Clinic Settings")
		self.shift = desk_shift()

	def cart(self, patient=None, **kw):
		return {"branch": "Lahore Main", "patient": patient, "lines": [{"kind": "Consultation", "doctor": doctor()}, {"kind": "Lab", "template": "Complete Blood Count"},
			{"kind": "Service", "item_code": "PROC-ECG", "qty": 1}], **kw}

	def test_one_cart_split_tender(self):
		as_user(DESK)
		new = {"patient_name": f"Counter Walkin {random.randint(100, 999)}", "gender": "Male", "age": 33, "phone": f"+92301{random.randint(1000000, 9999999)}"}
		d = self.cart(new_patient=new)
		total = counter.price(dict(d, patient=None))["total"]
		self.assertGreater(total, 0)
		with self.assertRaises(frappe.ValidationError):  # change only out of cash
			counter.checkout(dict(d, tenders=tenders(("JazzCash", total + 500, "JC-1"))))
		before = {m["mode_of_payment"]: m["collections"] for m in shifts.summary(self.shift.name)["modes"]}
		d["lines"][0]["priority"] = "Elderly"
		r = counter.checkout(dict(d, client_ref="t-split-1", tenders=tenders(("Cash", 2000, None), ("JazzCash", total - 1000, "JC-77"))))
		self.assertEqual(flt(r["change_amount"]), 1000)
		kinds = {ln["kind"]: ln for ln in r["lines"]}
		self.assertEqual(set(kinds), {"Consultation", "Lab", "Service"})
		self.assertTrue(r["tokens"][0]["token"])
		slip = frappe.get_doc("OPD Slip", kinds["Consultation"]["reference_name"])
		self.assertEqual(slip.docstatus, 1)
		self.assertEqual(frappe.db.get_value("Queue Entry", {"opd_slip": slip.name}, "priority"), "Elderly")
		self.assertEqual(frappe.db.get_value("Test Invoice", kinds["Lab"]["reference_name"], "status"), "Paid")
		svc_si = frappe.get_doc("Sales Invoice", kinds["Service"]["reference_name"])
		self.assertEqual((svc_si.hv_billing_type, svc_si.is_created_using_pos), ("General", 1))
		after = {m["mode_of_payment"]: m["collections"] for m in shifts.summary(self.shift.name)["modes"]}
		got = {k: after.get(k, 0) - before.get(k, 0) for k in ("Cash", "JazzCash")}
		self.assertAlmostEqual(got["Cash"] + got["JazzCash"], total, delta=1)
		self.assertAlmostEqual(got["JazzCash"], total - 1000, delta=1)
		# same client_ref again (dropped response, offline retry) → same receipt, nothing posted twice
		again = counter.checkout(dict(d, client_ref="t-split-1", tenders=tenders(("Cash", total, None))))
		self.assertEqual(again["name"], r["name"])
		# refund the service line only
		out = counter.refund(r["name"], [kinds["Service"]["idx"]], "Wrong test ticked")
		self.assertEqual(out["status"], "Partly Refunded")
		ret = next(ln for ln in out["lines"] if ln["kind"] == "Service")["refund_document"]
		self.assertEqual(frappe.db.get_value("Sales Invoice", ret, "is_return"), 1)
		as_user("Administrator")

	def test_ipd_advance_and_dues(self):
		pat = new_patient("Counter Ipd")
		bed = free_bed("General")
		adm, _t = ipd.admit(pat.name, bed, doctor(), reason="Test")
		as_user(DESK)
		panel = counter.patient_panel(pat.name)
		self.assertEqual(panel["admission"]["name"], adm.name)
		r = counter.checkout({"branch": "Lahore Main", "patient": pat.name, "lines": [{"kind": "IPD Advance", "target": adm.name, "amount": 15000, "label": "Advance"}],
			"tenders": tenders(("Cash", 5000, None), ("Easypaisa", 10000, "EP-9"))})
		pes = frappe.get_all("Payment Entry", filters={"hv_bed_allotment": adm.name, "docstatus": 1}, fields=["paid_amount", "mode_of_payment", "hv_shift"])
		self.assertEqual(sorted(p.paid_amount for p in pes), [5000, 10000])
		self.assertTrue(all(p.hv_shift == self.shift.name for p in pes))
		self.assertEqual(ipd.running_bill(adm.name)["advances"], 15000)
		# refund the advance the same day → payment entries cancelled
		counter.refund(r["name"], None, "Patient went elsewhere")
		self.assertEqual(ipd.running_bill(adm.name)["advances"], 0)
		as_user("Administrator")
		frappe.db.set_value("Bed Allotment", adm.name, "status", "Cancelled")
		from hospital_vvs.api.ward import _set

		_set(bed, "Cleaning")
		_set(bed, "Available")

	def test_offline_sync(self):
		as_user(DESK)
		pat = frappe.get_all("Patient", filters={"disabled": 0, "temporary_record": 0, "branch": "Lahore Main"}, pluck="name", limit=1)[0]
		good = {"branch": "Lahore Main", "patient": pat, "client_ref": "off-good-1", "offline": 1, "offline_created": "2026-11-09 10:00:00",
			"lines": [{"kind": "Service", "item_code": "PROC-ECG", "qty": 1}], "tenders": tenders(("Cash", 5000, None))}
		bad = {"branch": "Lahore Main", "patient": pat, "client_ref": "off-bad-1", "lines": [{"kind": "Service", "item_code": "PROC-ECG", "qty": 1}],
			"tenders": tenders(("Cash", 1, None))}
		res = {r["client_ref"]: r for r in counter.sync([good, bad])}
		self.assertEqual(res["off-good-1"]["ok"], 1)
		self.assertEqual(res["off-bad-1"]["ok"], 0)
		self.assertIn("less than", res["off-bad-1"]["error"])
		self.assertEqual(frappe.db.get_value("Counter Receipt", res["off-good-1"]["name"], "offline"), 1)
		self.assertEqual(counter.sync([good])[0]["name"], res["off-good-1"]["name"])  # posted once
		as_user("Administrator")
