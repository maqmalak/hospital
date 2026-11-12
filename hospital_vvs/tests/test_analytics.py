"""App analytics (D-68): every app's charts build, and a person only gets the apps they may open."""
import frappe
from frappe.tests import IntegrationTestCase

from hospital_vvs.api import analytics
from hospital_vvs.tests.test_phase2 import as_user


class TestAnalytics(IntegrationTestCase):
	def tearDown(self):
		as_user("Administrator")

	def test_every_app_builds(self):
		as_user("admin@vvs.demo")
		for app in analytics.BUILDERS:
			r = analytics.app_charts(app, days=7)
			self.assertTrue(r["charts"], app)
			for c in r["charts"]:
				self.assertIn(c["kind"], ("area", "line", "bar", "stack", "hbar"))
				self.assertTrue(c["series"], c["id"])
				self.assertLessEqual(len(c["series"]), 4, c["id"])  # validated palette: at most 4 series per chart

	def test_apps_follow_page_access(self):
		as_user("lab@vvs.demo")
		apps = analytics.apps()
		self.assertIn("lab", apps)
		self.assertNotIn("accounting", apps)
		with self.assertRaises(frappe.PermissionError):
			analytics.app_charts("accounting")
		as_user("accounts@vvs.demo")
		self.assertIn("accounting", analytics.apps())
