"""Users & roles screen (D-58): admin only, no lock-out, page access follows the grid."""
import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from hospital_vvs.api import users as api


class TestUsersRoles(IntegrationTestCase):
	def setUp(self):
		p = patch.object(frappe.db, "commit", lambda *a, **k: None)
		p.start()
		self.addCleanup(p.stop)
		self.addCleanup(frappe.set_user, "Administrator")
		frappe.set_user("admin@vvs.demo")

	def test_admin_creates_user_with_roles_and_branch(self):
		email = f"qa.{frappe.generate_hash(length=6)}@vvs.demo"
		r = api.save_user(json.dumps({"email": email, "full_name": "QA Nurse Test", "roles": ["PW Nurse", "System Manager"], "branches": ["Lahore Main"]}))
		self.assertTrue(r["created"])
		self.assertEqual(set(frappe.get_roles(email)) & {"PW Nurse", "System Manager"}, {"PW Nurse"})  # only hospital roles are managed here
		self.assertTrue(frappe.db.exists("User Permission", {"user": email, "allow": "Branch", "for_value": "Lahore Main"}))
		self.assertRaises(frappe.ValidationError, api.save_user, json.dumps({"email": email, "full_name": "QA", "roles": []}))

	def test_no_lock_out_and_admin_only(self):
		self.assertRaises(frappe.ValidationError, api.save_user, json.dumps({"email": "admin@vvs.demo", "full_name": "Nadia Admin", "roles": ["PW Nurse"], "branches": ["Lahore Main"]}))
		self.assertRaises(frappe.ValidationError, api.set_enabled, "admin@vvs.demo", 0)
		self.assertRaises(frappe.ValidationError, api.save_user, json.dumps({"email": "Administrator", "full_name": "x", "roles": ["PW Nurse"]}))
		frappe.set_user("reception@vvs.demo")
		for fn in (lambda: api.users(), lambda: api.roles(), lambda: api.save_screen_roles("/patients", "[]"), lambda: api.set_enabled("nurse@vvs.demo", 0)):
			self.assertRaises(frappe.PermissionError, fn)

	def test_page_access_grid_controls_routes(self):
		from hospital_vvs.api.session import allowed_routes

		before = next(r for r in api.roles()["screens"] if r["route"] == "/pw-dashboard")["roles"]
		api.save_screen_roles("/pw-dashboard", json.dumps(before + ["PW Nurse"]))
		self.assertIn("/pw-dashboard", {r["route"] for r in allowed_routes("nurse@vvs.demo")})
		api.save_screen_roles("/pw-dashboard", json.dumps([r for r in before if r != "PW Nurse"]))
		self.assertNotIn("/pw-dashboard", {r["route"] for r in allowed_routes("nurse@vvs.demo")})
		api.save_screen_roles("/users", json.dumps(["PW Nurse"]))  # user management stays admin-only
		self.assertEqual(next(r for r in api.roles()["screens"] if r["route"] == "/users")["roles"], [])
