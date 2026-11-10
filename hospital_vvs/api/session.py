"""Boot data for the React app: who is signed in, their roles, branches, allowed routes and module switches."""

import frappe
from frappe import _
from frappe.utils import cint

from hospital_vvs import roles as R
from hospital_vvs.utils import fail_guard, fail_hit, fail_reset, default_branch, is_admin, settings, user_branches, user_roles

MODULE_SWITCHES = ["enable_lab", "enable_medicine", "enable_ward", "enable_mar", "enable_diet", "enable_procedures", "enable_icu",
	"enable_consent", "enable_packages", "enable_insurance", "enable_panels", "enable_emergency", "enable_shifts",
	"enable_pharmacy_pipeline", "enable_whatsapp", "enable_sms", "enable_online_visit", "enable_patient_comms", "enable_feedback",
	"enable_doctor_share", "enable_welfare", "enable_appointments"]


def allowed_routes(user=None):
	user = user or frappe.session.user
	s = settings()
	roles = user_roles(user)
	admin = is_admin(user)
	out = []
	for rule in s.page_access or []:
		if rule.module_switch and not cint(s.get(rule.module_switch)):
			continue
		need = {r.strip() for r in (rule.roles or "").split(",") if r.strip()}
		if admin or roles & need:
			out.append({"route": rule.route, "label": rule.label})
	return out


@frappe.whitelist()
def boot():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Not signed in"), frappe.AuthenticationError)
	s = settings()
	u = frappe.db.get_value("User", user, ["full_name", "user_image", "language"], as_dict=True)
	doctor = frappe.db.get_value("Doctor", {"user": user}, ["name", "doctor_name"], as_dict=True)
	return {
		"user": user, "full_name": u.full_name, "image": u.user_image, "language": u.language,
		"roles": sorted(user_roles(user) & set(R.ALL + ["System Manager"])), "is_admin": is_admin(user),
		"doctor": doctor, "branches": user_branches(user), "branch": default_branch(user),
		"routes": allowed_routes(user),
		"modules": {k: cint(s.get(k)) for k in MODULE_SWITCHES},
		"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "name_ar": s.clinic_name_ar, "logo": s.logo,
			"address": s.address, "phone": s.phone, "mode": s.clinic_mode, "currency": s.default_currency or "PKR"},
		"training": cint(s.training_mode) or cint(frappe.conf.get("hv_training_site")),
		"idle_lock_minutes": cint(s.idle_lock_minutes) or 15,
		"print": {"receipt": s.receipt_format, "prescription": s.prescription_format, "card": s.patient_card_format,
			"agent": cint(s.use_print_agent), "printers": [r.as_dict() for r in s.printer_map or []]},
		"show_first_name_on_display": cint(s.show_first_name_on_display),
		"message_mode": s.message_mode,
		"site": frappe.local.site,
		"shifts": {"day_start": str(s.day_shift_start or "07:00:00")[:8], "night_start": str(s.night_shift_start or "17:00:00")[:8]},
		"csrf_token": frappe.sessions.get_csrf_token(),
	}


@frappe.whitelist(methods=["POST"])
def unlock(password):
	"""Idle lock screen: re-check the signed-in user's password without a new login."""
	from frappe.utils.password import check_password

	fail_guard("unlock", frappe.session.user)
	try:
		check_password(frappe.session.user, password, delete_tracker_cache=False)
	except frappe.AuthenticationError:
		fail_hit("unlock", frappe.session.user)
		frappe.throw(_("Wrong password"), frappe.AuthenticationError)
	fail_reset("unlock", frappe.session.user)
	return True


@frappe.whitelist(methods=["POST"])
def set_language(language):
	if language not in ("en", "ur", "ar"):
		frappe.throw(_("Unsupported language"))
	frappe.db.set_value("User", frappe.session.user, "language", language)
	return language
