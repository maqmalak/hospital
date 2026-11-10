"""Users & roles (/users, PW Admin, D-58): staff accounts, their PW roles and branch, and which screens each role opens.

Only the hospital roles (roles.ALL) are managed here; ERPNext / System Manager roles are left as they are. Administrator,
Guest and your own admin role cannot be changed from this screen (no lock-out).
"""

import frappe
from frappe import _
from frappe.utils import cint, validate_email_address

from hospital_vvs import roles as R
from hospital_vvs.utils import require_roles

PROTECTED = {"Administrator", "Guest"}


def _pw_roles(user):
	return [r for r in frappe.get_roles(user) if r in R.ALL]


@frappe.whitelist()
def users(q=None, role=None, status=None):
	require_roles(R.ADMIN)
	f = {"user_type": "System User", "name": ["not in", list(PROTECTED)]}
	if status in ("Active", "Disabled"):
		f["enabled"] = 1 if status == "Active" else 0
	or_f = {"full_name": ["like", f"%{q}%"], "name": ["like", f"%{q}%"], "mobile_no": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("User", filters=f, or_filters=or_f, fields=["name", "full_name", "enabled", "last_login", "last_active", "mobile_no", "user_image", "creation"],
		order_by="enabled desc, full_name asc", limit=500)
	names = [r.name for r in rows] or [""]
	roles = {}
	for h in frappe.get_all("Has Role", filters={"parent": ["in", names], "parenttype": "User", "role": ["in", R.ALL + ["System Manager"]]}, fields=["parent", "role"]):
		roles.setdefault(h.parent, []).append(h.role)
	branches = {}
	for p in frappe.get_all("User Permission", filters={"user": ["in", names], "allow": "Branch"}, fields=["user", "for_value", "is_default"], order_by="is_default desc"):
		branches.setdefault(p.user, []).append(p.for_value)
	counters = {}
	for c in frappe.db.sql("""select pu.user, c.name counter from `tabPOS Profile User` pu join `tabCounter` c on c.pos_profile=pu.parent
		where pu.user in %s""", (tuple(names),), as_dict=True):
		counters.setdefault(c.user, []).append(c.counter)
	doctors = {d.user: d.name for d in frappe.get_all("Doctor", filters={"user": ["in", names]}, fields=["name", "user"])}
	out = []
	for r in rows:
		rl = roles.get(r.name, [])
		if role and role not in rl:
			continue
		out.append({**r, "roles": [x for x in rl if x in R.ALL], "system_manager": "System Manager" in rl, "branches": branches.get(r.name, []),
			"counters": sorted(counters.get(r.name, [])), "doctor": doctors.get(r.name)})
	return {"users": out, "roles": roles_meta(), "branches": frappe.get_all("Branch", pluck="name", order_by="name"),
		"two_factor": cint(frappe.db.get_single_value("System Settings", "enable_two_factor_auth"))}


def roles_meta():
	counts = {r.role: r.n for r in frappe.db.sql("""select hr.role, count(*) n from `tabHas Role` hr join tabUser u on u.name=hr.parent
		where hr.parenttype='User' and u.enabled=1 and u.name not in ('Administrator','Guest') group by hr.role""", as_dict=True)}
	rules = frappe.get_all("Page Access Rule", filters={"parent": "Clinic Settings"}, fields=["route", "label", "roles", "module_switch"], order_by="idx")
	out = []
	for role in R.ALL:
		out.append({"role": role, "description": R.DESCRIPTIONS.get(role, ""), "users": counts.get(role, 0), "two_factor": role in R.TWO_FACTOR,
			"screens": [{"route": x.route, "label": x.label} for x in rules if role in [s.strip() for s in (x.roles or "").split(",")]]})
	return out


@frappe.whitelist()
def roles():
	require_roles(R.ADMIN)
	rules = frappe.get_all("Page Access Rule", filters={"parent": "Clinic Settings"}, fields=["route", "label", "roles", "module_switch"], order_by="idx")
	return {"roles": roles_meta(), "screens": [{"route": x.route, "label": x.label, "module_switch": x.module_switch,
		"roles": [s.strip() for s in (x.roles or "").split(",") if s.strip()]} for x in rules]}


@frappe.whitelist(methods=["POST"])
def save_user(data):
	"""Create or update a staff account: name, email, mobile, PW roles, branches, enabled; optional new password."""
	require_roles(R.ADMIN)
	d = frappe.parse_json(data)
	email = (d.get("email") or d.get("name") or "").strip().lower()
	if not email:
		frappe.throw(_("Enter the email (it is the login)."))
	if email in PROTECTED:
		frappe.throw(_("{0} cannot be changed here.").format(email))
	new = not frappe.db.exists("User", email)
	if new:
		validate_email_address(email, throw=True)
	if not (d.get("full_name") or "").strip():
		frappe.throw(_("Enter the person's name."))
	want = [r for r in (d.get("roles") or []) if r in R.ALL]
	if not want:
		frappe.throw(_("Give at least one role."))
	me = frappe.session.user
	if email == me and R.ADMIN not in want:
		frappe.throw(_("You cannot remove your own admin role."))
	if email == me and not cint(d.get("enabled", 1)):
		frappe.throw(_("You cannot disable your own account."))
	u = frappe.new_doc("User") if new else frappe.get_doc("User", email)
	if new:
		u.email = email
		u.send_welcome_email = 0
		u.user_type = "System User"
	first, _sp, last = (d["full_name"].strip()).partition(" ")
	u.first_name, u.last_name = first, last or None
	u.mobile_no = d.get("mobile_no") or None
	u.enabled = cint(d.get("enabled", 1))
	keep = [r.role for r in u.get("roles", []) if r.role not in R.ALL]  # ERPNext / System roles stay as they are
	u.set("roles", [{"role": r} for r in keep + want])
	if d.get("new_password"):
		u.new_password = d["new_password"]  # Frappe applies the password policy
	u.flags.ignore_permissions = True
	u.save()
	from hospital_vvs.setup.access import set_branches

	branches = [b for b in (d.get("branches") or []) if frappe.db.exists("Branch", b)]
	if branches and not ({R.ADMIN} & set(want)):
		set_branches(email, branches)
	elif not branches and not ({R.ADMIN} & set(want)):
		frappe.throw(_("Choose the branch this person works in."))
	frappe.clear_cache(user=email)
	return {"name": email, "created": new}


@frappe.whitelist(methods=["POST"])
def set_enabled(user, enabled):
	require_roles(R.ADMIN)
	if user in PROTECTED or user == frappe.session.user:
		frappe.throw(_("You cannot change this account here."))
	frappe.db.set_value("User", user, "enabled", cint(enabled))
	if not cint(enabled):
		from frappe.sessions import clear_sessions

		clear_sessions(user=user, force=True)  # signed out everywhere at once
	return {"name": user, "enabled": cint(enabled)}


@frappe.whitelist(methods=["POST"])
def send_reset_link(user):
	require_roles(R.ADMIN)
	if user in PROTECTED:
		frappe.throw(_("You cannot change this account here."))
	frappe.get_doc("User", user).reset_password(send_email=True)
	return {"name": user, "sent": True}


@frappe.whitelist(methods=["POST"])
def save_role_screens(role, routes):
	"""Which screens a role opens: rewrites that role in every Page Access Rule (PW Admin always opens everything)."""
	require_roles(R.ADMIN)
	if role not in R.ALL:
		frappe.throw(_("Unknown role."))
	if role == R.ADMIN:
		frappe.throw(_("The admin opens every screen; nothing to change."))
	routes = set(frappe.parse_json(routes) if isinstance(routes, str) else routes or [])
	s = frappe.get_single("Clinic Settings")
	for rule in s.page_access:
		have = [x.strip() for x in (rule.roles or "").split(",") if x.strip()]
		if rule.route in routes and role not in have:
			have.append(role)
		elif rule.route not in routes and role in have:
			have.remove(role)
		rule.roles = ", ".join(have)
	s.flags.ignore_permissions = True
	s.save()
	frappe.clear_cache()
	return {"role": role, "screens": sorted(routes)}


@frappe.whitelist(methods=["POST"])
def save_screen_roles(route, roles):
	"""Page access grid: the roles that open one screen (PW Admin opens everything anyway)."""
	require_roles(R.ADMIN)
	want = [r for r in (frappe.parse_json(roles) if isinstance(roles, str) else roles or []) if r in R.ALL and r != R.ADMIN]
	s = frappe.get_single("Clinic Settings")
	rule = next((x for x in s.page_access if x.route == route), None)
	if not rule:
		frappe.throw(_("Unknown screen {0}.").format(route))
	if route == "/users":
		want = []  # user management stays admin-only
	rule.roles = ", ".join(want)
	s.flags.ignore_permissions = True
	s.save()
	frappe.clear_cache()
	return {"route": route, "roles": want}
