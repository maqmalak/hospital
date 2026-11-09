"""Shared helpers: settings with branch overrides, role checks, branch scope, access log, realtime."""

import frappe
from frappe import _

from hospital_vvs import roles as R


def settings():
	return frappe.get_cached_doc("Clinic Settings")


def setting(fieldname, branch=None, default=None):
	"""Clinic Settings value, overridden by a Branch Settings Override row for `branch` when there is one."""
	s = settings()
	if branch:
		for row in s.branch_overrides or []:
			if row.branch == branch and row.setting == fieldname:
				return row.value
	value = s.get(fieldname)
	return default if value in (None, "") else value


def module_enabled(switch):
	return bool(frappe.utils.cint(settings().get(switch))) if switch else True


def user_roles(user=None):
	return set(frappe.get_roles(user or frappe.session.user))


def is_admin(user=None):
	user = user or frappe.session.user
	return user == "Administrator" or bool(user_roles(user) & {R.ADMIN, "System Manager"})


def has_any_role(*role_list, user=None):
	return is_admin(user) or bool(user_roles(user) & set(role_list))


def require_roles(*role_list):
	"""Server-side role check for whitelisted methods (DocType permissions are checked too)."""
	if not has_any_role(*role_list):
		frappe.throw(_("You are not permitted to do this."), frappe.PermissionError)


def can_see_clinical(user=None):
	return has_any_role(*R.CLINICAL, R.RECEPTIONIST, user=user)


def user_branches(user=None):
	"""Branches the user may work in: User Permissions on Branch. Without any: every branch, unless
	Clinic Settings → Strict Branch Access is on (then none). Admins always see every branch."""
	user = user or frappe.session.user
	if is_admin(user) or user == "Guest":
		return frappe.get_all("Branch", pluck="name", order_by="name")
	allowed = frappe.get_all("User Permission", filters={"user": user, "allow": "Branch"}, pluck="for_value")
	if allowed:
		return allowed
	if frappe.utils.cint(settings().get("strict_branch_access")):
		return []
	return frappe.get_all("Branch", pluck="name", order_by="name")


def default_branch(user=None):
	user = user or frappe.session.user
	d = frappe.db.get_value("User Permission", {"user": user, "allow": "Branch", "is_default": 1}, "for_value")
	d = d or settings().default_branch
	branches = user_branches(user)
	if d in branches:
		return d
	return branches[0] if branches else None


def check_branch(branch):
	if not branch and not user_branches():
		frappe.throw(_("No branch is assigned to you. Ask the admin to give you a branch."), frappe.PermissionError)
	if branch and branch not in user_branches():
		frappe.throw(_("You do not have access to branch {0}.").format(branch), frappe.PermissionError)


def branch_company(branch):
	return frappe.db.get_value("Branch", branch, "hv_company") or settings().company or frappe.defaults.get_global_default("company")


def log_access(action, patient=None, reference_doctype=None, reference_name=None, details=None, branch=None):
	"""Append-only Clinical Access Log row for reads of sensitive data (09-security-ops.md)."""
	ip = getattr(frappe.local, "request_ip", None)
	frappe.get_doc({
		"doctype": "Clinical Access Log", "user": frappe.session.user, "action": action, "patient": patient,
		"reference_doctype": reference_doctype, "reference_name": reference_name, "details": details,
		"accessed_on": frappe.utils.now_datetime(), "ip_address": ip, "branch": branch,
	}).insert(ignore_permissions=True)


def publish(event, message, branch=None):
	"""Branch-scoped realtime event (rooms are per site; the branch is in the event name)."""
	frappe.publish_realtime(f"hv:{event}:{branch}" if branch else f"hv:{event}", message, after_commit=True)


def first_name(full_name):
	return (full_name or "").strip().split(" ")[0] if full_name else ""


def hhmm(t):
	"""Time / timedelta / "9:00:00" → "09:00" (str(timedelta)[:5] drops the leading zero)."""
	if not t:
		return ""
	parts = str(t).split(" ")[-1].split(":")
	return f"{int(parts[0]):02d}:{parts[1][:2]}" if len(parts) > 1 else str(t)


TOKEN_METHODS = ("hospital_vvs.api.online_visit.status", "hospital_vvs.api.online_visit.verify", "hospital_vvs.api.online_visit.pay",
	"hospital_vvs.api.online_visit.cancel_request", "hospital_vvs.api.lab.report_open", "hospital_vvs.api.lab.report_verify",
	"hospital_vvs.api.lab.report_pdf")


def no_store(response=None, request=None):
	"""after_request hook: token portals (lab report, online visit) must never be cached by browsers or proxies (09-security-ops.md)."""
	try:
		path = (request or frappe.local.request).path or ""
	except Exception:
		return
	if response is not None and any(path.endswith(m) for m in TOKEN_METHODS):
		response.headers["Cache-Control"] = "no-store, max-age=0"
		response.headers["Pragma"] = "no-cache"
