"""Handwritten / scanned lab report: attached to the result, merged into the PDF, downloadable by the patient, printed and handed over."""
import base64
import io
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from hospital_vvs.api import lab as api
from hospital_vvs.services import lab
from hospital_vvs.tests.test_phase2 import a_patient, as_user, shift_for


class TestHandReport(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(as_user, "Administrator")
		frappe.db.set_single_value("Clinic Settings", {"report_require_verification": 0, "lab_send_report_ready": 1})
		frappe.clear_document_cache("Clinic Settings")

	def test_scanned_report_to_patient(self):
		from frappe.utils.pdf import get_pdf
		from pypdf import PdfReader

		pat = a_patient()
		shift_for("lab@vvs.demo", "Lab Counter")
		ti = lab.create_order(pat, ["Vitamin D (25-OH)"], "Lahore Main")
		lab.pay(ti.name, "Cash")
		s = frappe.get_all("Lab Sample", filters={"test_invoice": ti.name}, pluck="name")[0]
		lab.collect(s)
		lab.dispatch([s], "Chughtai Reference Lab", "TCS")
		item = frappe.get_all("Test Invoice Item", filters={"parent": ti.name}, pluck="name")[0]
		scan = get_pdf("<h1>Handwritten report</h1><p>Vitamin D 18 ng/mL</p>")
		url = api.upload_report_file(item, "vitd-scan.pdf", "data:application/pdf;base64," + base64.b64encode(scan).decode())
		self.assertTrue(url.startswith("/private/files/"))  # kept private
		res = lab.receive_outsourced(item, attachment=url)  # no typed values: the scan is the report
		as_user("pathologist@vvs.demo")
		lab.verify(res.name)
		as_user("lab@vvs.demo")
		out = lab.release(ti.name)
		self.assertTrue(frappe.db.exists("Message Log", {"reference_name": ti.name, "event": "lab_report_ready"}))  # WhatsApp link queued
		token = out["link"].rstrip("/").rsplit("/", 1)[1]
		pages = len(PdfReader(io.BytesIO(lab.report_pdf(ti.name))).pages)
		self.assertGreaterEqual(pages, 2)  # report page + the scanned pages
		frappe.set_user("Guest")
		data = api.report_open(token)["report"]
		self.assertEqual(data["tests"][0]["attachment_kind"], "pdf")
		api.report_file(token, 0)
		self.assertEqual(frappe.local.response.filecontent, scan)  # patient downloads the original scan
		with self.assertRaises(frappe.ValidationError):
			api.report_file(token, 5)
		as_user("lab@vvs.demo")
		api.print_pdf(ti.name)
		self.assertEqual(frappe.local.response.type, "pdf")
		api.hand_over(ti.name, "Son — Ahmed")
		self.assertEqual(frappe.db.get_value("Test Invoice", ti.name, "handed_over_to"), "Son — Ahmed")

	def test_upload_rejects_other_files(self):
		as_user("lab@vvs.demo")
		item = frappe.db.get_value("Test Invoice Item", {})
		with self.assertRaises(frappe.ValidationError):
			api.upload_report_file(item, "x.exe", "data:;base64,AAAA")
