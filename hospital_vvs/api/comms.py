"""Patient comms + feedback API (08, 01 feedback, D-44). Token endpoints are public and rate-limited."""

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import add_days, today

from hospital_vvs import roles as R
from hospital_vvs.services import patient_comms as svc
from hospital_vvs.utils import require_roles, user_branches, scope_branch

STAFF = (R.NURSE, R.DOCTOR)


# ------------------------------------------------------------------ bedside portal (token)
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=400, seconds=600)
def portal(token):
	return svc.portal_state(token)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=300)
def portal_send(token, kind="Message", text=None, voice=0, language=None):
	return svc.patient_send(token, kind, text, voice, language)


# ------------------------------------------------------------------ nursing station
@frappe.whitelist()
def stations():
	require_roles(*STAFF, R.RECEPTIONIST)
	rows = frappe.get_all("Nursing Station", filters={"is_active": 1, "branch": ["in", user_branches() or [""]]}, fields=["name", "station_name", "branch", "extension"], order_by="branch, station_name")
	for r in rows:
		r["patients"] = frappe.db.count("Patient Comms Profile", {"station": r.name, "active": 1})
		r["unread"] = frappe.db.count("Comms Message", {"station": r.name, "direction": "From patient", "read": 0})
		r["wards"] = frappe.get_all("Ward", filters={"nursing_station": r.name}, pluck="ward_name")
	return rows


def _check_station(station):
	if frappe.db.get_value("Nursing Station", station, "branch") not in user_branches():
		frappe.throw("Not your branch.", frappe.PermissionError)


@frappe.whitelist()
def board(station):
	require_roles(*STAFF)
	_check_station(station)
	return svc.station_board(station)


@frappe.whitelist()
def thread(profile):
	require_roles(*STAFF)
	_check_station(frappe.db.get_value("Patient Comms Profile", profile, "station"))
	return svc.thread(profile)


@frappe.whitelist(methods=["POST"])
def reply(profile, text):
	require_roles(*STAFF)
	_check_station(frappe.db.get_value("Patient Comms Profile", profile, "station"))
	return svc.reply(profile, text)


@frappe.whitelist(methods=["POST"])
def broadcast(station, text):
	require_roles(R.NURSE)
	_check_station(station)
	return svc.broadcast(station, text)


@frappe.whitelist()
def assignments():
	require_roles(R.NURSE)
	profs = frappe.get_all("Patient Comms Profile", filters={"active": 1}, fields=["name", "patient", "patient_name", "station", "bed", "bed_allotment"], order_by="station, bed")
	branches = set(user_branches())
	st = {s.name: s.branch for s in frappe.get_all("Nursing Station", fields=["name", "branch"])}
	beds = {b.name: b for b in frappe.get_all("Hospital Bed", fields=["name", "bed_no", "ward"])}
	out = []
	for p in profs:
		if st.get(p.station) and st[p.station] not in branches:
			continue
		b = beds.get(p.bed)
		out.append({**p, "bed_no": b.bed_no if b else None, "ward": b.ward if b else None})
	return {"profiles": out, "stations": [s for s, br in st.items() if br in branches]}


@frappe.whitelist(methods=["POST"])
def set_station(profile, station):
	require_roles(R.NURSE)
	_check_station(station)
	return svc.set_station(profile, station)


@frappe.whitelist()
def response_report(from_date=None, to_date=None, station=None):
	require_roles(R.NURSE, R.DOCTOR)
	return svc.response_report(from_date or add_days(today(), -6), to_date or today(), station)


# ------------------------------------------------------------------ feedback
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def feedback_form(token):
	return svc.feedback_form(token)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=600)
def feedback_submit(token, rating, comment=None):
	return svc.submit_feedback(token, rating, comment)


@frappe.whitelist()
def feedback_list(status=None, follow_up=None, source=None, q=None, limit=100):
	require_roles(R.ADMIN)
	f = {"branch": ["in", user_branches() + [""]]} if user_branches() else {}
	if status:
		f["status"] = status
	if follow_up:
		f["follow_up"] = follow_up
	if source:
		f["source"] = source
	or_f = {"patient_name": ["like", f"%{q}%"], "patient": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("Patient Feedback", filters=f, or_filters=or_f, fields=["name", "patient", "patient_name", "source", "status", "doctor", "department", "rating_value",
		"comment", "channel", "requested_at", "received_at", "follow_up", "follow_up_note", "followed_up_by", "followed_up_at", "branch", "reference_doctype", "reference_name"],
		order_by="creation desc", limit=int(limit or 100))
	docs = {d.name: d.doctor_name for d in frappe.get_all("Doctor", fields=["name", "doctor_name"])}
	for r in rows:
		r["doctor_name"] = docs.get(r.doctor)
	return rows


@frappe.whitelist(methods=["POST"])
def feedback_follow_up(name, note, done=1):
	require_roles(R.ADMIN)
	return svc.follow_up(name, note, done)


@frappe.whitelist()
def feedback_report(from_date=None, to_date=None, branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(R.ADMIN, R.DOCTOR, R.ACCOUNTANT)
	return svc.feedback_report(from_date or add_days(today(), -89), to_date or today(), branch)


@frappe.whitelist(methods=["POST"])
def feedback_send_now():
	"""Admin: run the feedback request job now (normally every 15 minutes)."""
	require_roles(R.ADMIN)
	return {"requested": svc.queue_feedback_requests()}
