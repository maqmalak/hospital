"""Patient comms (bedside ↔ nursing station) and patient feedback — 08-online-visit-comms.md, 01 feedback, D-44.

Bedside: the room portal holds a random token (only its SHA-256 is on the Patient Comms Profile, made at admission and
switched off at discharge). Messages go to the profile's Nursing Station; the station sees unread counts, urgency from the
quick button, replies and broadcasts. Response time = first staff reply after the patient's message.

Feedback: a scheduler job asks for a 1-5 rating N hours after an OPD visit is done, a discharge or a pharmacy handover
(each switchable), at most once per patient every N days, through the `visit_feedback` template with a token link
(also a 1-5 WhatsApp reply). Ratings at or below the alert level open a follow-up for the admin.
"""

import hashlib
import secrets

import frappe
from frappe import _
from frappe.utils import add_days, add_to_date, cint, flt, get_datetime, get_url, getdate, now_datetime, time_diff_in_seconds, today

from hospital_vvs.utils import publish, setting

QUICK = {"Nurse": "Please send a nurse", "Water": "I need water", "Pain": "I am in pain", "Bathroom": "I need help to the bathroom", "Other": "I need help"}
QUICK_UR = {"Nurse": "نرس کو بھیجیں", "Water": "مجھے پانی چاہیے", "Pain": "مجھے درد ہو رہا ہے", "Bathroom": "باتھ روم جانے میں مدد چاہیے", "Other": "مجھے مدد چاہیے"}


def _hash(token):
	return hashlib.sha256((token or "").encode()).hexdigest()


# ------------------------------------------------------------------ stations
def ensure_stations():
	"""Every ward's station text becomes a Nursing Station of the ward's branch (a code used in two branches is split)."""
	main = setting("default_branch")
	wards = sorted(frappe.get_all("Ward", fields=["name", "ward_name", "branch", "nursing_station"]), key=lambda w: (w.branch != main, w.branch, w.name))
	for w in wards:  # the main branch keeps the plain station codes
		code = w.nursing_station or f"NS-{w.ward_name}"
		branch = frappe.db.get_value("Nursing Station", code, "branch") if frappe.db.exists("Nursing Station", code) else None
		if branch and branch != w.branch:
			code = f"{code} ({frappe.db.get_value('Branch', w.branch, 'hv_branch_code') or w.branch})"
		if not frappe.db.exists("Nursing Station", code):
			frappe.get_doc({"doctype": "Nursing Station", "station_name": code, "branch": w.branch}).insert(ignore_permissions=True)
		if w.nursing_station != code:
			frappe.db.set_value("Ward", w.name, "nursing_station", code, update_modified=False)
			for prof in frappe.get_all("Patient Comms Profile", filters={"bed_allotment": ["in", frappe.get_all("Bed Allotment", filters={"ward": w.name}, pluck="name") or [""]]}, pluck="name"):
				frappe.db.set_value("Patient Comms Profile", prof, "station", code, update_modified=False)


# ------------------------------------------------------------------ bedside (token)
def profile_by_token(token):
	if not token or len(token) < 16:
		frappe.throw(_("Invalid link."), frappe.PermissionError)
	name = frappe.db.get_value("Patient Comms Profile", {"token_hash": _hash(token), "active": 1}, "name")
	if not name:
		frappe.throw(_("This bedside link is no longer active."), frappe.PermissionError)
	return frappe.get_doc("Patient Comms Profile", name)


def portal_state(token, since=None):
	prof = profile_by_token(token)
	pat = frappe.db.get_value("Patient", prof.patient, ["patient_name", "preferred_language"], as_dict=True) or {}
	bed = frappe.db.get_value("Hospital Bed", prof.bed, ["bed_no", "ward"], as_dict=True) if prof.bed else None
	f = {"profile": prof.name}
	msgs = frappe.get_all("Comms Message", filters=f, fields=["name", "direction", "kind", "text", "voice", "creation", "read", "sender"], order_by="creation desc", limit=60)
	b = frappe.get_all("Comms Message", filters={"station": prof.station, "direction": "Broadcast", "profile": ["is", "not set"], "creation": [">=", prof.activated_on or today()]},
		fields=["name", "direction", "kind", "text", "voice", "creation", "read", "sender"], order_by="creation desc", limit=10)
	names = {u.name: u.full_name for u in frappe.get_all("User", filters={"name": ["in", list({m.sender for m in msgs + b if m.sender}) or [""]]}, fields=["name", "full_name"])}
	rows = sorted(msgs + b, key=lambda m: m.creation)
	for m in rows:
		m["sender_name"] = names.get(m.sender) if m.direction != "From patient" else None
		m["sender"] = None
	return {"first_name": (pat.get("patient_name") or "").split(" ")[0], "language": pat.get("preferred_language") or "en", "station": prof.station,
		"bed": bed.bed_no if bed else None, "ward": bed.ward if bed else None, "messages": rows,
		"quick": [{"kind": k, "en": v, "ur": QUICK_UR[k]} for k, v in QUICK.items()]}


def patient_send(token, kind="Message", text=None, voice=0, language=None):
	prof = profile_by_token(token)
	kind = kind if kind in ("Message", *QUICK.keys()) else "Message"
	text = (text or "").strip()[:500] or (QUICK.get(kind) if kind != "Message" else "")
	if not text:
		frappe.throw(_("Type a message or press a button."))
	urgent = [k.strip() for k in (setting("comms_urgent_kinds") or "Pain\nNurse").splitlines() if k.strip()]
	m = frappe.get_doc({"doctype": "Comms Message", "profile": prof.name, "patient": prof.patient, "station": prof.station, "bed": prof.bed,
		"direction": "From patient", "kind": kind, "urgency": "Urgent" if kind in urgent else ("High" if kind != "Message" else "Normal"),
		"text": text, "voice": cint(voice), "language": language}).insert(ignore_permissions=True)
	publish("comms", {"station": prof.station, "profile": prof.name, "kind": kind, "urgency": m.urgency}, frappe.db.get_value("Nursing Station", prof.station, "branch"))
	return {"name": m.name}


# ------------------------------------------------------------------ station (staff)
def _bed_labels(beds):
	return {b.name: b for b in frappe.get_all("Hospital Bed", filters={"name": ["in", beds or [""]]}, fields=["name", "bed_no", "ward"])}


def station_board(station):
	profs = frappe.get_all("Patient Comms Profile", filters={"station": station, "active": 1}, fields=["name", "patient", "patient_name", "bed", "bed_allotment", "activated_on"])
	beds = _bed_labels([p.bed for p in profs if p.bed])
	target = cint(setting("comms_answer_target_min") or 5) * 60
	now = now_datetime()
	out = []
	for p in profs:
		unread = frappe.get_all("Comms Message", filters={"profile": p.name, "direction": "From patient", "read": 0}, fields=["kind", "urgency", "creation", "text"], order_by="creation")
		last = frappe.get_all("Comms Message", filters={"profile": p.name}, fields=["direction", "text", "creation", "kind"], order_by="creation desc", limit=1)
		waiting = frappe.db.get_value("Comms Message", {"profile": p.name, "direction": "From patient", "answered_at": ["is", "not set"]}, "creation", order_by="creation asc")
		wait_s = int(time_diff_in_seconds(now, waiting)) if waiting else 0
		urg = "Urgent" if any(u.urgency == "Urgent" for u in unread) else "High" if any(u.urgency == "High" for u in unread) else "Normal" if unread else ""
		b = beds.get(p.bed)
		out.append({**p, "bed_no": b.bed_no if b else None, "ward": b.ward if b else None, "unread": len(unread), "urgency": urg,
			"last": last[0] if last else None, "waiting_seconds": wait_s, "overdue": bool(waiting and wait_s > target),
			"kinds": sorted({u.kind for u in unread if u.kind != "Message"})})
	rank = {"Urgent": 0, "High": 1, "Normal": 2, "": 3}
	out.sort(key=lambda r: (rank[r["urgency"]], -r["waiting_seconds"], r["bed_no"] or ""))
	st = frappe.db.get_value("Nursing Station", station, ["station_name", "branch", "extension", "quick_replies"], as_dict=True) or {}
	return {"station": station, **st, "quick_replies": [x.strip() for x in (st.get("quick_replies") or "").splitlines() if x.strip()],
		"patients": out, "on_duty": on_duty(station), "target_minutes": target // 60,
		"broadcasts": frappe.get_all("Station Broadcast", filters={"station": station, "creation": [">=", add_days(today(), -1)]}, fields=["name", "text", "sent_by", "creation", "recipients"], order_by="creation desc", limit=5)}


def on_duty(station):
	"""Nurses rostered today on the station's wards (HRMS Shift Assignment, D-33)."""
	wards = frappe.get_all("Ward", filters={"nursing_station": station}, pluck="name")
	if not wards or not frappe.db.exists("DocType", "Shift Assignment") or not frappe.get_meta("Shift Assignment").has_field("hv_ward"):
		return []
	rows = frappe.get_all("Shift Assignment", filters={"hv_ward": ["in", wards], "start_date": ["<=", today()], "docstatus": 1, "status": "Active"},
		or_filters={"end_date": [">=", today()]}, fields=["employee_name", "shift_type", "hv_ward", "hv_is_head_nurse"], order_by="hv_is_head_nurse desc, shift_type")
	seen, out = set(), []
	for r in rows:
		key = (r.employee_name, r.shift_type)
		if key not in seen:
			seen.add(key)
			out.append(r)
	return out


def thread(profile):
	prof = frappe.get_doc("Patient Comms Profile", profile)
	msgs = frappe.get_all("Comms Message", filters={"profile": profile}, fields=["name", "direction", "kind", "urgency", "text", "voice", "creation", "read", "sender", "answered_at", "response_seconds"],
		order_by="creation asc", limit=200)
	names = {u.name: u.full_name for u in frappe.get_all("User", filters={"name": ["in", list({m.sender for m in msgs if m.sender}) or [""]]}, fields=["name", "full_name"])}
	for m in msgs:
		m["sender_name"] = names.get(m.sender)
	unread = [m.name for m in msgs if m.direction == "From patient" and not m.read]
	if unread:
		frappe.db.set_value("Comms Message", {"name": ["in", unread]}, {"read": 1, "read_by": frappe.session.user, "read_at": now_datetime()}, update_modified=False)
	b = frappe.db.get_value("Hospital Bed", prof.bed, ["bed_no", "ward"], as_dict=True) if prof.bed else {}
	return {"profile": profile, "patient": prof.patient, "patient_name": prof.patient_name, "bed_no": (b or {}).get("bed_no"), "ward": (b or {}).get("ward"),
		"admission": prof.bed_allotment, "station": prof.station, "messages": msgs}


def reply(profile, text):
	text = (text or "").strip()[:500]
	if not text:
		frappe.throw(_("Type a reply."))
	prof = frappe.get_doc("Patient Comms Profile", profile)
	if not prof.active:
		frappe.throw(_("This patient has been discharged."))
	now = now_datetime()
	for m in frappe.get_all("Comms Message", filters={"profile": profile, "direction": "From patient", "answered_at": ["is", "not set"]}, fields=["name", "creation"]):
		frappe.db.set_value("Comms Message", m.name, {"answered_at": now, "response_seconds": int(time_diff_in_seconds(now, m.creation)), "read": 1,
			"read_by": frappe.session.user, "read_at": now}, update_modified=False)
	m = frappe.get_doc({"doctype": "Comms Message", "profile": profile, "patient": prof.patient, "station": prof.station, "bed": prof.bed,
		"direction": "To patient", "text": text, "sender": frappe.session.user}).insert(ignore_permissions=True)
	return {"name": m.name}


def broadcast(station, text):
	text = (text or "").strip()[:500]
	if not text:
		frappe.throw(_("Type the message for all patients."))
	n = frappe.db.count("Patient Comms Profile", {"station": station, "active": 1})
	b = frappe.get_doc({"doctype": "Station Broadcast", "station": station, "text": text, "sent_by": frappe.session.user, "recipients": n}).insert(ignore_permissions=True)
	frappe.get_doc({"doctype": "Comms Message", "station": station, "direction": "Broadcast", "text": text, "sender": frappe.session.user, "broadcast": b.name}).insert(ignore_permissions=True)
	return {"name": b.name, "recipients": n}


def set_station(profile, station):
	if not frappe.db.exists("Nursing Station", station):
		frappe.throw(_("Unknown nursing station."))
	frappe.db.set_value("Patient Comms Profile", profile, "station", station)
	return {"ok": True}


def response_report(from_date, to_date, station=None):
	f = {"direction": "From patient", "creation": ["between", [f"{from_date} 00:00:00", f"{to_date} 23:59:59"]]}
	if station:
		f["station"] = station
	rows = frappe.get_all("Comms Message", filters=f, fields=["station", "kind", "response_seconds", "answered_at"])
	out = {}
	for r in rows:
		s = out.setdefault(r.station or "—", {"station": r.station or "—", "messages": 0, "answered": 0, "unanswered": 0, "secs": [], "kinds": {}})
		s["messages"] += 1
		s["kinds"][r.kind] = s["kinds"].get(r.kind, 0) + 1
		if r.answered_at:
			s["answered"] += 1
			s["secs"].append(cint(r.response_seconds))
		else:
			s["unanswered"] += 1
	res = []
	for s in out.values():
		secs = sorted(s.pop("secs"))
		s["avg_minutes"] = round(sum(secs) / len(secs) / 60, 1) if secs else None
		s["median_minutes"] = round(secs[len(secs) // 2] / 60, 1) if secs else None
		s["within_target"] = round(100 * len([x for x in secs if x <= cint(setting("comms_answer_target_min") or 5) * 60]) / len(secs)) if secs else None
		res.append(s)
	return sorted(res, key=lambda x: x["station"])


# ------------------------------------------------------------------ feedback
def _recent_request(patient):
	gap = cint(setting("feedback_gap_days") or 30)
	return frappe.db.exists("Patient Feedback", {"patient": patient, "creation": [">=", add_days(today(), -gap)], "status": ["!=", "Skipped"]})


def request_feedback(patient, source, reference_doctype, reference_name, doctor=None, branch=None):
	"""One Patient Feedback (Requested) + the visit_feedback message. Returns (name, token) or None when skipped."""
	if frappe.db.exists("Patient Feedback", {"reference_doctype": reference_doctype, "reference_name": reference_name}):
		return None
	if _recent_request(patient):
		return None
	token = secrets.token_urlsafe(18)
	dept = frappe.db.get_value("Doctor", doctor, "department") if doctor else None
	fb = frappe.get_doc({"doctype": "Patient Feedback", "patient": patient, "source": source, "status": "Requested", "doctor": doctor, "department": dept,
		"branch": branch, "reference_doctype": reference_doctype, "reference_name": reference_name, "requested_at": now_datetime(), "token_hash": _hash(token)}).insert(ignore_permissions=True)
	from hospital_vvs.services import messaging

	log = messaging.send("visit_feedback", patient=patient, context={"link": get_url(f"/hms/feedback/{token}")}, reference_doctype="Patient Feedback", reference_name=fb.name)
	fb.db_set("message_log", log)
	return fb.name, token


def queue_feedback_requests():
	"""Scheduler (every 15 min): OPD visits done, discharges and pharmacy handovers older than their delay."""
	if not cint(setting("enable_feedback")):
		return 0
	n = 0
	now = now_datetime()
	since = add_days(now, -3)
	if cint(setting("feedback_opd")):
		until = add_to_date(now, hours=-flt(setting("feedback_opd_hours") or 2))
		for q in frappe.get_all("Queue Entry", filters={"status": "Done", "completed_at": ["between", [since, until]]}, fields=["name", "patient", "doctor", "branch"], limit=300):
			n += bool(request_feedback(q.patient, "OPD", "Queue Entry", q.name, q.doctor, q.branch))
	if cint(setting("feedback_ipd")):
		until = add_to_date(now, hours=-flt(setting("feedback_ipd_hours") or 24))
		for a in frappe.get_all("Bed Allotment", filters={"status": "Discharged", "release_datetime": ["between", [since, until]]}, fields=["name", "patient", "admitting_doctor", "branch"], limit=300):
			n += bool(request_feedback(a.patient, "IPD", "Bed Allotment", a.name, a.admitting_doctor, a.branch))
	if cint(setting("feedback_pharmacy")):
		until = add_to_date(now, hours=-flt(setting("feedback_pharmacy_hours") or 2))
		for t in frappe.get_all("Dispense Ticket", filters={"handed_over_at": ["between", [since, until]], "patient": ["is", "set"]}, fields=["name", "patient", "branch"], limit=300):
			n += bool(request_feedback(t.patient, "Pharmacy", "Dispense Ticket", t.name, None, t.branch))
	expire = add_days(today(), -cint(setting("feedback_link_days") or 7))
	frappe.db.sql("update `tabPatient Feedback` set status='Expired' where status='Requested' and requested_at < %s", expire)
	return n


def feedback_by_token(token):
	if not token or len(token) < 16:
		frappe.throw(_("Invalid link."), frappe.PermissionError)
	name = frappe.db.get_value("Patient Feedback", {"token_hash": _hash(token)}, "name")
	if not name:
		frappe.throw(_("This feedback link is not valid."), frappe.PermissionError)
	return frappe.get_doc("Patient Feedback", name)


def feedback_form(token):
	fb = feedback_by_token(token)
	doctor = frappe.db.get_value("Doctor", fb.doctor, "doctor_name") if fb.doctor else None
	return {"first_name": (fb.patient_name or "").split(" ")[0], "source": fb.source, "doctor": doctor, "status": fb.status, "rating": fb.rating_value,
		"clinic": setting("clinic_name"), "clinic_ur": setting("clinic_name_ur")}


def record_rating(fb, rating, comment=None, channel="Web"):
	rating = cint(rating)
	if rating < 1 or rating > 5:
		frappe.throw(_("Choose 1 to 5 stars."))
	if fb.status == "Expired":
		frappe.throw(_("This feedback link has expired."))
	low = rating <= cint(setting("feedback_low_rating") or 2)
	fb.db_set({"rating_value": rating, "rating": rating / 5, "comment": (comment or fb.comment or "")[:1000] or None, "channel": channel, "status": "Received",
		"received_at": now_datetime(), "follow_up": "Open" if low else (fb.follow_up or "")})
	if low:
		publish("feedback_low", {"name": fb.name, "patient": fb.patient_name, "rating": rating, "source": fb.source}, fb.branch)
	return {"ok": True, "low": low}


def submit_feedback(token, rating, comment=None):
	return record_rating(feedback_by_token(token), rating, comment, "Web")


def whatsapp_rating(phone, text):
	"""A '1'..'5' WhatsApp reply answers the patient's open feedback request. Returns True when handled."""
	t = (text or "").strip()
	if t not in ("1", "2", "3", "4", "5"):
		return False
	pats = frappe.get_all("Patient", filters={"phone": phone}, pluck="name")
	if not pats:
		return False
	fb = frappe.get_all("Patient Feedback", filters={"patient": ["in", pats], "status": "Requested"}, pluck="name", order_by="creation desc", limit=1)
	if not fb:
		return False
	record_rating(frappe.get_doc("Patient Feedback", fb[0]), t, channel="WhatsApp")
	return True


def follow_up(name, note, done=1):
	if not (note or "").strip():
		frappe.throw(_("Write what was done."))
	frappe.db.set_value("Patient Feedback", name, {"follow_up_note": note.strip(), "follow_up": "Done" if cint(done) else "Open",
		"followed_up_by": frappe.session.user, "followed_up_at": now_datetime()})
	return {"ok": True}


def feedback_report(from_date, to_date, branch=None):
	cond, args = "", [from_date, to_date]
	if branch:
		cond = " and f.branch=%s"
		args.append(branch)
	base = f"from `tabPatient Feedback` f where f.status='Received' and date(f.received_at) between %s and %s {cond}"
	by_doctor = frappe.db.sql(f"select f.doctor, d.doctor_name, count(*) n, avg(f.rating_value) avg {base.replace('from `tabPatient Feedback` f', 'from `tabPatient Feedback` f left join tabDoctor d on d.name=f.doctor')} group by f.doctor order by avg", args, as_dict=True)
	by_dept = frappe.db.sql(f"select ifnull(f.department, f.source) department, count(*) n, avg(f.rating_value) avg {base} group by ifnull(f.department, f.source) order by avg", args, as_dict=True)
	by_month = frappe.db.sql(f"select date_format(f.received_at, '%%Y-%%m') month, count(*) n, avg(f.rating_value) avg {base} group by month order by month", args, as_dict=True)
	by_source = frappe.db.sql(f"select f.source, count(*) n, avg(f.rating_value) avg {base} group by f.source", args, as_dict=True)
	dist = {r.rating_value: r.n for r in frappe.db.sql(f"select f.rating_value, count(*) n {base} group by f.rating_value", args, as_dict=True)}
	sent = frappe.db.count("Patient Feedback", {"requested_at": ["between", [f"{from_date} 00:00:00", f"{to_date} 23:59:59"]]})
	tot = frappe.db.sql(f"select count(*) n, avg(f.rating_value) avg {base}", args, as_dict=True)[0]
	return {"by_doctor": by_doctor, "by_department": by_dept, "by_month": by_month, "by_source": by_source, "distribution": [dist.get(i, 0) for i in range(1, 6)],
		"received": tot.n, "average": round(flt(tot.avg), 2) if tot.avg else None, "requested": sent,
		"open_follow_ups": frappe.db.count("Patient Feedback", {"follow_up": "Open"})}
