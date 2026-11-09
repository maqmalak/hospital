"""Branch and counter access for the demo staff (D-41).

bench --site hospital execute hospital_vvs.setup.access.run
Every non-admin user gets a Branch user permission (Lahore Main unless listed), and each counter's POS Profile
lists the staff allowed to open a shift on it (Applicable for Users). Safe to run again."""

import frappe

from hospital_vvs.utils import is_admin

BRANCH = {"reception.isb@vvs.demo": ["Islamabad"]}
DEFAULT_BRANCH = "Lahore Main"
STAFF = {
	"Pharmacy 1": ["cashier@vvs.demo"],
	"Pharmacy 2": ["cashier2@vvs.demo"],
	"Handover 3": ["dispenser@vvs.demo"],
	"Reception 1": ["reception@vvs.demo"],
	"Reception 2": ["reception2@vvs.demo"],
	"IPD Desk": ["reception@vvs.demo", "reception2@vvs.demo"],
	"Lab Counter": ["lab@vvs.demo"],
	"Reception ISB": ["reception.isb@vvs.demo"],
	"Lab ISB": [],
	"Pharmacy ISB": [],
}


def set_branches(user, branches):
	"""Replace the user's Branch permissions with these; the first is the default."""
	for name in frappe.get_all("User Permission", filters={"user": user, "allow": "Branch", "for_value": ["not in", branches]}, pluck="name"):
		frappe.delete_doc("User Permission", name, ignore_permissions=True)
	for i, b in enumerate(branches):
		ex = frappe.db.get_value("User Permission", {"user": user, "allow": "Branch", "for_value": b}, "name")
		if ex:
			frappe.db.set_value("User Permission", ex, "is_default", 1 if i == 0 else 0)
		else:
			frappe.get_doc({"doctype": "User Permission", "user": user, "allow": "Branch", "for_value": b, "is_default": 1 if i == 0 else 0,
				"apply_to_all_doctypes": 1}).insert(ignore_permissions=True)


def set_staff(counter, users):
	"""Counter staff live on the counter's POS Profile → Applicable for Users (default ticked on the user's first profile)."""
	from hospital_vvs.services.shifts import ensure_counter_profile

	prof = frappe.get_doc("POS Profile", ensure_counter_profile(counter))
	prof.set("applicable_for_users", [])
	for u in users:
		if not frappe.db.exists("User", u):
			continue
		has_default = frappe.db.sql("""select 1 from `tabPOS Profile User` pu join `tabPOS Profile` p on p.name=pu.parent
			where pu.user=%s and pu.default=1 and p.name!=%s and p.company=%s and p.disabled=0""", (u, prof.name, prof.company))
		prof.append("applicable_for_users", {"user": u, "default": 0 if has_default else 1})
	prof.save(ignore_permissions=True)


def run():
	users = frappe.get_all("User", filters={"user_type": "System User", "enabled": 1, "name": ["not in", ["Administrator", "Guest"]]}, pluck="name")
	for u in users:
		if is_admin(u):
			continue
		set_branches(u, BRANCH.get(u, [DEFAULT_BRANCH]))
	for counter, staff in STAFF.items():
		if frappe.db.exists("Counter", counter):
			set_staff(counter, staff)
	frappe.db.set_single_value("Clinic Settings", {"counter_staff_only": 1, "strict_branch_access": 1})
	frappe.db.commit()
	print("branches set for", len([u for u in users if not is_admin(u)]), "users; staff set on", len(STAFF), "counters")
