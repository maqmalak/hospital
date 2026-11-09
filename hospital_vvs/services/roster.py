"""Nurse duty roster on HRMS Shift Type + Shift Assignment (06-ipd.md; DECISIONS D-33).

Each nursing shift starts at a time in Clinic Settings → nursing_shift_starts and runs until the next one starts. A nurse is a
user with the PW Nurse role; the roster creates the Employee record for them on first use. Shift Assignment carries the ward
(custom field hv_ward) and an "in charge" flag.
"""

from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.utils import add_days, cint, get_datetime, getdate, now_datetime

from hospital_vvs import roles as R
from hospital_vvs.utils import branch_company, check_branch, default_branch, setting

SHIFT_NAMES = ["Morning", "Evening", "Night"]


def shift_types():
	"""Nursing shift types from the settings' start times (created / updated on demand). Returns [(name, start, end)]."""
	from hospital_vvs.services.ipd import shift_starts

	starts = shift_starts()
	out = []
	for i, (h, m) in enumerate(starts):
		nh, nm = starts[(i + 1) % len(starts)]
		label = SHIFT_NAMES[i] if i < len(SHIFT_NAMES) else f"Shift {i + 1}"
		name = f"Nursing {label}"
		start, end = f"{h:02d}:{m:02d}:00", f"{nh:02d}:{nm:02d}:00"
		if not frappe.db.exists("Shift Type", name):
			frappe.get_doc({"doctype": "Shift Type", "__newname": name, "name": name, "start_time": start, "end_time": end,
				"enable_auto_attendance": 0}).insert(ignore_permissions=True, set_name=name)
		else:
			frappe.db.set_value("Shift Type", name, {"start_time": start, "end_time": end})
		out.append((name, start, end))
	return out


def nurse_users(branch=None):
	users = frappe.get_all("Has Role", filters={"role": R.NURSE, "parenttype": "User"}, pluck="parent")
	rows = frappe.get_all("User", filters={"name": ["in", users or [""]], "enabled": 1}, fields=["name", "full_name"], order_by="full_name")
	if branch:
		allowed = {r.user for r in frappe.get_all("User Permission", filters={"allow": "Branch"}, fields=["user", "for_value"]) if r.for_value != branch}
		only = {r.user for r in frappe.get_all("User Permission", filters={"allow": "Branch", "for_value": branch}, fields=["user"])}
		rows = [r for r in rows if r.name in only or r.name not in allowed]
	return rows


def ensure_employee(user, branch=None):
	emp = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
	if emp:
		return emp
	full = frappe.db.get_value("User", user, ["first_name", "last_name", "full_name", "gender"], as_dict=True)
	company = branch_company(branch or default_branch(user))
	doc = frappe.get_doc({"doctype": "Employee", "first_name": full.first_name or full.full_name, "last_name": full.last_name, "user_id": user,
		"company": company, "gender": full.gender if full.gender in ("Male", "Female") else "Female", "date_of_birth": "1990-01-01",
		"date_of_joining": getdate("2024-01-01"), "status": "Active", "designation": None})
	doc.flags.ignore_mandatory = True
	doc.insert(ignore_permissions=True)
	return doc.name


def week(branch=None, start=None, days=7):
	branch = branch or default_branch()
	check_branch(branch)
	start = getdate(start) if start else getdate()
	end = add_days(start, days - 1)
	types = shift_types()
	wards = frappe.get_all("Ward", filters={"branch": branch, "is_active": 1}, fields=["name", "ward_name", "ward_type", "color", "nursing_station"],
		order_by="sort_order, ward_name")
	rows = frappe.db.sql("""select sa.name, sa.employee, sa.employee_name, sa.shift_type, sa.start_date, sa.end_date, sa.hv_ward, sa.hv_is_head_nurse,
		e.user_id from `tabShift Assignment` sa join tabEmployee e on e.name=sa.employee
		where sa.docstatus=1 and sa.status='Active' and sa.start_date <= %s and ifnull(sa.end_date, sa.start_date) >= %s
		and ifnull(sa.hv_ward,'') in %s""", (end, start, [w.name for w in wards] + [""]), as_dict=True)
	return {"branch": branch, "start": str(start), "days": [str(add_days(start, i)) for i in range(days)],
		"shifts": [{"name": n, "start": s[:5], "end": e[:5]} for n, s, e in types], "wards": wards, "assignments": rows,
		"nurses": nurse_users(branch)}


def assign(user, ward, date, shift_type, head=0):
	check_branch(frappe.db.get_value("Ward", ward, "branch"))
	emp = ensure_employee(user, frappe.db.get_value("Ward", ward, "branch"))
	if frappe.db.exists("Shift Assignment", {"employee": emp, "shift_type": shift_type, "start_date": date, "docstatus": 1, "status": "Active"}):
		frappe.throw(_("{0} is already on the {1} shift that day.").format(user, shift_type))
	sa = frappe.get_doc({"doctype": "Shift Assignment", "employee": emp, "shift_type": shift_type, "start_date": date, "end_date": date,
		"company": frappe.db.get_value("Employee", emp, "company"), "status": "Active", "hv_ward": ward, "hv_is_head_nurse": cint(head)})
	sa.flags.ignore_permissions = True
	sa.insert()
	sa.submit()
	return sa


def unassign(name):
	sa = frappe.get_doc("Shift Assignment", name)
	if sa.hv_ward:
		check_branch(frappe.db.get_value("Ward", sa.hv_ward, "branch"))
	sa.flags.ignore_permissions = True
	sa.cancel()
	return sa.name


def current_shift_type(at=None):
	at = get_datetime(at) if at else now_datetime()
	types = shift_types()
	best = None
	for name, start, _end in types:
		h, m = int(start[:2]), int(start[3:5])
		for back in (0, 1):
			d = at.date() - timedelta(days=back)
			began = datetime(d.year, d.month, d.day, h, m)
			if began <= at and (best is None or began > best[1]):
				best = (name, began)
	return best


def on_duty(ward=None, at=None, branch=None):
	"""Nurses on duty now (for the nursing station, nursing charges and MAR suggestions)."""
	cur = current_shift_type(at)
	if not cur:
		return []
	name, began = cur
	filters = {"docstatus": 1, "status": "Active", "shift_type": name, "start_date": began.date()}
	if ward:
		filters["hv_ward"] = ward
	rows = frappe.get_all("Shift Assignment", filters=filters, fields=["employee", "employee_name", "hv_ward", "hv_is_head_nurse"])
	users = {e.name: e.user_id for e in frappe.get_all("Employee", filters={"name": ["in", [r.employee for r in rows] or [""]]}, fields=["name", "user_id"])}
	for r in rows:
		r["user"] = users.get(r.employee)
		r["shift"] = name
	if branch and not ward:
		wards = set(frappe.get_all("Ward", filters={"branch": branch}, pluck="name"))
		rows = [r for r in rows if r.hv_ward in wards]
	return rows
