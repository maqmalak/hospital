"""Nurse duty roster (/roster) on HRMS shifts."""

import frappe

from hospital_vvs import roles as R
from hospital_vvs.services import roster
from hospital_vvs.utils import require_roles


def _head():
	"""Admin, or a nurse marked in charge on any shift (06-ipd.md: Admin, head nurse)."""
	if frappe.session.user == "Administrator" or R.ADMIN in frappe.get_roles():
		return
	emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "name")
	if not (emp and frappe.db.exists("Shift Assignment", {"employee": emp, "hv_is_head_nurse": 1, "docstatus": 1})):
		frappe.throw(frappe._("Only the administrator or a nurse in charge can change the roster."), frappe.PermissionError)


@frappe.whitelist()
def week(branch=None, start=None, days=7):
	require_roles(R.NURSE, R.DOCTOR)
	return roster.week(branch, start, int(days or 7))


@frappe.whitelist(methods=["POST"])
def assign(user, ward, date, shift_type, head=0):
	_head()
	return roster.assign(user, ward, date, shift_type, head).name


@frappe.whitelist(methods=["POST"])
def unassign(name):
	_head()
	return roster.unassign(name)


@frappe.whitelist(methods=["POST"])
def copy_week(branch, start, to_start):
	"""Repeat one week's roster a week later (skips shifts already planned)."""
	_head()
	from frappe.utils import add_days, date_diff

	src = roster.week(branch, start)
	shift = date_diff(to_start, start)
	made = 0
	for a in src["assignments"]:
		try:
			roster.assign(a.user_id, a.hv_ward, add_days(a.start_date, shift), a.shift_type, a.hv_is_head_nurse)
			made += 1
		except frappe.ValidationError:
			frappe.clear_last_message()
	return made


@frappe.whitelist()
def on_duty(ward=None, branch=None):
	require_roles(R.NURSE, R.DOCTOR, R.RECEPTIONIST)
	return roster.on_duty(ward, branch=branch)
