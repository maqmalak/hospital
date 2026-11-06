"""One booking service for reception, the web portal and WhatsApp (01-appointments-messaging.md)."""

import frappe
from frappe import _
from frappe.utils import (add_days, add_to_date, cint, flt, get_datetime, getdate, now_datetime, nowdate, time_diff_in_hours,
	today)

from hospital_vvs.services import messaging
from hospital_vvs.utils import setting, settings, hhmm

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
ACTIVE = ("Pending", "Confirmed", "Arrived")


def _time_add(t, minutes):
	return (get_datetime(f"2000-01-01 {t}") + frappe.utils.datetime.timedelta(minutes=minutes)).time()


def doctor_unavailable(doctor, date, branch):
	if frappe.db.exists("Doctor Leave", {"doctor": doctor, "from_date": ["<=", date], "to_date": [">=", date]}):
		return True
	return bool(frappe.db.sql("""select name from `tabBlocked Date` where blocked_date=%s and (ifnull(branch,'')='' or branch=%s)
		limit 1""", (date, branch)))


def generate_slots(days=None, doctor=None):
	"""Create Time Slots for the booking window from each doctor's schedule. Safe to re-run."""
	days = cint(days) or cint(setting("slot_window_days")) or 14
	default_minutes = cint(setting("slot_minutes")) or 15
	filters = {"is_active": 1, "doctor_type": ["!=", "External Referring"]}
	if doctor:
		filters["name"] = doctor
	created = 0
	for d in frappe.get_all("Doctor", filters=filters, fields=["name", "slot_minutes", "branch"]):
		rows = frappe.get_all("Doctor Schedule", filters={"parent": d.name, "parenttype": "Doctor"},
			fields=["day", "start_time", "end_time", "branch"])
		for offset in range(days + 1):
			date = getdate(add_days(today(), offset))
			for row in rows:
				if row.day != DAYS[date.weekday()]:
					continue
				branch = row.branch or d.branch or settings().default_branch
				blocked = doctor_unavailable(d.name, date, branch)
				minutes = cint(d.slot_minutes) or default_minutes
				t = get_datetime(f"2000-01-01 {row.start_time}").time()
				end = get_datetime(f"2000-01-01 {row.end_time}").time()
				while t < end:
					if not frappe.db.exists("Time Slot", {"doctor": d.name, "slot_date": date, "start_time": t}):
						frappe.get_doc({"doctype": "Time Slot", "doctor": d.name, "branch": branch, "slot_date": date,
							"start_time": t, "end_time": _time_add(t, minutes), "status": "Blocked" if blocked else "Available"
						}).insert(ignore_permissions=True)
						created += 1
					t = _time_add(t, minutes)
	return created


def refresh_blocked(doctor=None, date=None):
	"""After a leave / blocked date is added: block free slots on those days (booked ones stay for staff to move)."""
	filters = {"status": ["in", ["Available", "Blocked"]], "slot_date": [">=", today()]}
	if doctor:
		filters["doctor"] = doctor
	if date:
		filters["slot_date"] = date
	for s in frappe.get_all("Time Slot", filters=filters, fields=["name", "doctor", "slot_date", "branch", "status"]):
		want = "Blocked" if doctor_unavailable(s.doctor, s.slot_date, s.branch) else "Available"
		if want != s.status:
			frappe.db.set_value("Time Slot", s.name, "status", want)


def available_slots(doctor, date, branch=None):
	date = getdate(date)
	if date < getdate(today()) or doctor_unavailable(doctor, date, branch):
		return []
	filters = {"doctor": doctor, "slot_date": date, "status": "Available"}
	if branch:
		filters["branch"] = branch
	slots = frappe.get_all("Time Slot", filters=filters, fields=["name", "start_time", "end_time", "branch"], order_by="start_time")
	if date == getdate(today()):
		now = now_datetime().time()
		slots = [s for s in slots if get_datetime(f"2000-01-01 {s.start_time}").time() > now]
	return slots


def available_dates(doctor, branch=None, days=None):
	days = cint(days) or cint(setting("slot_window_days")) or 14
	rows = frappe.db.sql("""select slot_date, count(*) n from `tabTime Slot` where doctor=%s and status='Available'
		and slot_date between %s and %s {b} group by slot_date order by slot_date""".format(b="and branch=%s" if branch else ""),
		[doctor, today(), add_days(today(), days)] + ([branch] if branch else []), as_dict=True)
	return [r for r in rows if not doctor_unavailable(doctor, r.slot_date, branch) and (
		getdate(r.slot_date) > getdate(today()) or available_slots(doctor, r.slot_date, branch))]


def _lock_slot(slot_name):
	row = frappe.db.sql("select name, status, hold_expires_at, held_by, doctor, branch, slot_date, start_time from `tabTime Slot` "
		"where name=%s for update", slot_name, as_dict=True)
	if not row:
		frappe.throw(_("Slot not found."))
	return row[0]


def hold_slot(slot_name, hold_key):
	"""Hold a slot during checkout (row lock: two people racing for one slot → only one wins)."""
	s = _lock_slot(slot_name)
	expired = s.status == "Held" and s.hold_expires_at and get_datetime(s.hold_expires_at) < now_datetime()
	if s.status == "Held" and s.held_by == hold_key:
		pass
	elif s.status != "Available" and not expired:
		frappe.throw(_("This time was just taken. Please choose another slot."), title=_("Slot not available"))
	minutes = cint(setting("slot_hold_minutes")) or 10
	expires = add_to_date(now_datetime(), minutes=minutes)
	frappe.db.set_value("Time Slot", slot_name, {"status": "Held", "held_by": hold_key, "hold_expires_at": expires})
	return expires


def release_hold(slot_name, hold_key=None):
	s = frappe.db.get_value("Time Slot", slot_name, ["status", "held_by"], as_dict=True)
	if s and s.status == "Held" and (not hold_key or s.held_by == hold_key):
		frappe.db.set_value("Time Slot", slot_name, {"status": "Available", "held_by": None, "hold_expires_at": None})


def release_expired_holds():
	for name in frappe.get_all("Time Slot", filters={"status": "Held", "hold_expires_at": ["<", now_datetime()]}, pluck="name"):
		frappe.db.set_value("Time Slot", name, {"status": "Available", "held_by": None, "hold_expires_at": None})
	messaging.process_queue()


def doctor_fee(doctor):
	return flt(frappe.db.get_value("Doctor", doctor, "default_fee")) or flt(setting("default_fee"))


def book(*, doctor, slot=None, date=None, start_time=None, branch=None, patient=None, patient_name=None, phone=None,
	source_channel="Reception", payment_channel="At Clinic", hold_key=None, payment_proof=None, age=None, gender=None, notify_patient=True, messages_allowed=None, priority=None):
	"""Create an Appointment. With a slot, re-checks availability inside a row lock (hold by this key is fine)."""
	from hospital_vvs.hospital_vvs.doctype.patient.patient import normalize_phone

	phone = normalize_phone(phone) if phone else None
	if patient:
		p = frappe.db.get_value("Patient", patient, ["patient_name", "phone", "disabled"], as_dict=True)
		if not p or p.disabled:
			frappe.throw(_("Patient not found."))
		patient_name, phone = patient_name or p.patient_name, phone or p.phone
	if not (patient_name and phone):
		frappe.throw(_("Patient name and phone are required."))
	if slot:
		s = _lock_slot(slot)
		held_by_me = s.status == "Held" and hold_key and s.held_by == hold_key
		if s.status != "Available" and not held_by_me:
			frappe.throw(_("This time was just taken. Please choose another slot."), title=_("Slot not available"))
		if s.doctor != doctor:
			frappe.throw(_("Slot belongs to another doctor."))
		date, start_time, branch = s.slot_date, s.start_time, s.branch
		if doctor_unavailable(doctor, date, branch):
			frappe.throw(_("The doctor is not available on this date."))
	if not date:
		frappe.throw(_("Choose a date."))
	branch = branch or frappe.db.get_value("Doctor", doctor, "branch") or settings().default_branch
	if cint(setting("one_booking_per_doctor_per_day")) and patient and frappe.db.exists("Appointment", {
		"patient": patient, "doctor": doctor, "appointment_date": date, "status": ["in", ACTIVE]}):
		frappe.throw(_("This patient already has a booking with this doctor on this day."))
	if source_channel != "Reception":
		cap = cint(setting("max_unpaid_pending_per_phone")) or 3
		if frappe.db.count("Appointment", {"phone": phone, "status": "Pending", "payment_status": "Unpaid"}) >= cap:
			frappe.throw(_("Too many unpaid bookings on this number. Please contact the clinic."))
	auto = cint(setting("auto_confirm")) or source_channel == "Reception"
	appt = frappe.get_doc({
		"doctype": "Appointment", "patient": patient, "patient_name": patient_name, "phone": phone, "doctor": doctor,
		"branch": branch, "appointment_date": date, "start_time": start_time, "time_slot": slot,
		"status": "Confirmed" if auto and payment_channel != "Online" else "Pending", "source_channel": source_channel,
		"fee": doctor_fee(doctor), "payment_channel": payment_channel,
		"payment_status": "Proof Submitted" if payment_proof else "Unpaid", "payment_proof": payment_proof,
		"booking_ref": new_booking_ref(), "manage_token": frappe.generate_hash(length=32), "is_new_patient": 0 if patient else 1,
		"new_patient_age": age, "new_patient_gender": gender,
		"messages_allowed": 1 if (messages_allowed or source_channel == "WhatsApp") else 0,
		"priority": priority or ("Follow-up" if patient and is_follow_up(patient, doctor) else "Normal"),
	}).insert(ignore_permissions=True)
	if slot:
		frappe.db.set_value("Time Slot", slot, {"status": "Booked", "appointment": appt.name, "held_by": None, "hold_expires_at": None})
	if notify_patient:
		notify(appt, "appointment_confirmed" if appt.status == "Confirmed" else "appointment_requested")
	if appt.status == "Pending":
		frappe.publish_realtime("hv:appointment_request", {"name": appt.name, "patient_name": appt.patient_name, "phone": appt.phone,
			"doctor": appt.doctor_name, "date": str(appt.appointment_date), "time": hhmm(appt.start_time or ""),
			"source": appt.source_channel}, after_commit=True)
	return appt


PRIORITY_RANK = {"Urgent": 0, "Elderly": 1, "Disabled": 1, "Follow-up": 2, "Normal": 3}


def is_follow_up(patient, doctor):
	days = cint(setting("follow_up_free_days")) or 7
	return bool(frappe.db.exists("OPD Slip", {"patient": patient, "doctor": doctor, "docstatus": 1, "posting_date": [">=", add_days(today(), -days)]}))


def first_available(specialization=None, date=None, branch=None, doctor_type=None):
	"""Assign by shift: among doctors of this speciality who work that day (or soonest), the earliest free slot wins;
	a tie goes to the doctor with fewer bookings that day."""
	filters = {"is_active": 1, "doctor_type": ["!=", "External Referring"]}
	if specialization:
		filters["specialization"] = specialization
	docs = frappe.get_all("Doctor", filters=filters, pluck="name")
	if not docs:
		return None
	date_cond = "slot_date = %(date)s" if date else "slot_date >= curdate()"
	rows = frappe.db.sql(f"""select ts.name slot, ts.doctor, ts.slot_date, ts.start_time, ts.branch,
		(select count(*) from tabAppointment a where a.doctor=ts.doctor and a.appointment_date=ts.slot_date and a.status in ('Pending','Confirmed','Arrived')) load_
		from `tabTime Slot` ts where ts.status='Available' and ts.doctor in %(docs)s and {date_cond}
		and (ts.slot_date > curdate() or ts.start_time > curtime()) {"and ts.branch=%(branch)s" if branch else ""}
		order by ts.slot_date, ts.start_time, load_ limit 1""", {"docs": docs, "date": date, "branch": branch}, as_dict=True)
	if not rows:
		return None
	r = rows[0]
	if doctor_unavailable(r.doctor, r.slot_date, r.branch):
		return None
	d = frappe.db.get_value("Doctor", r.doctor, ["doctor_name", "default_fee", "slot_minutes", "consultation_room"], as_dict=True)
	return {"slot": r.slot, "doctor": r.doctor, "doctor_name": d.doctor_name, "date": str(r.slot_date), "time": hhmm(r.start_time), "branch": r.branch,
		"fee": flt(d.default_fee) or flt(setting("default_fee")), "minutes": cint(d.slot_minutes) or cint(setting("slot_minutes")) or 15,
		"room": d.consultation_room, "load": r.load_}


def new_booking_ref():
	while True:
		ref = "B" + frappe.generate_hash(length=6).upper()
		if not frappe.db.exists("Appointment", {"booking_ref": ref}):
			return ref


def manage_link(appt):
	return f"{frappe.utils.get_url()}/hms/my-appointment/{appt.manage_token}"


def notify(appt, event):
	branch_phone = frappe.db.get_value("Branch", appt.branch, "hv_phone") or setting("phone") or ""
	return messaging.send(event, patient=appt.patient, phone=appt.phone, reference_doctype="Appointment", reference_name=appt.name,
		consent=bool(appt.get("messages_allowed")),
		context={"clinic_phone": branch_phone, "first_name": (appt.patient_name or "").split(" ")[0], "ref": appt.booking_ref, "doctor": appt.doctor_name
			or frappe.db.get_value("Doctor", appt.doctor, "doctor_name"), "date": frappe.utils.formatdate(appt.appointment_date),
			"time": hhmm(appt.start_time or ""), "link": manage_link(appt)})


def set_status(name, status, reason=None):
	appt = frappe.get_doc("Appointment", name)
	allowed = {"Pending": ("Confirmed", "Rejected", "Cancelled"), "Confirmed": ("Arrived", "Cancelled", "No-show"),
		"Arrived": ("Completed", "Cancelled"), "Completed": (), "Rejected": (), "Cancelled": (), "No-show": ()}
	if status not in allowed.get(appt.status, ()):
		frappe.throw(_("Cannot change an appointment from {0} to {1}.").format(appt.status, status))
	appt.status = status
	if reason:
		appt.cancel_reason = reason
	if status == "Arrived":
		appt.arrived_at = now_datetime()
	appt.save(ignore_permissions=True)
	if status in ("Cancelled", "Rejected", "No-show") and appt.time_slot:
		frappe.db.set_value("Time Slot", appt.time_slot, {"status": "Available", "appointment": None})
	event = {"Confirmed": "appointment_confirmed", "Cancelled": "appointment_cancelled", "Rejected": "appointment_rejected"}.get(status)
	if event:
		notify(appt, event)
	return appt


def check_cutoff(appt, hours_field):
	start = get_datetime(f"{appt.appointment_date} {appt.start_time or '00:00:00'}")
	if time_diff_in_hours(start, now_datetime()) < cint(setting(hours_field)):
		frappe.throw(_("It is too late to change this booking online. Please call the clinic."))


def reschedule(name, new_slot, by_patient=False):
	appt = frappe.get_doc("Appointment", name)
	if appt.status not in ("Pending", "Confirmed"):
		frappe.throw(_("Only pending or confirmed bookings can be moved."))
	if by_patient:
		check_cutoff(appt, "reschedule_cutoff_hours")
	s = _lock_slot(new_slot)
	if s.status != "Available":
		frappe.throw(_("This time was just taken. Please choose another slot."))
	if s.doctor != appt.doctor:
		frappe.throw(_("Choose a slot with the same doctor."))
	old = appt.time_slot
	appt.update({"time_slot": new_slot, "appointment_date": s.slot_date, "start_time": s.start_time, "branch": s.branch,
		"reminder_evening_sent": 0, "reminder_hours_sent": 0})
	appt.save(ignore_permissions=True)
	frappe.db.set_value("Time Slot", new_slot, {"status": "Booked", "appointment": appt.name})
	if old:
		frappe.db.set_value("Time Slot", old, {"status": "Available", "appointment": None})
	notify(appt, "appointment_rescheduled")
	return appt


def cancel(name, reason=None, by_patient=False):
	appt = frappe.get_doc("Appointment", name)
	if by_patient:
		check_cutoff(appt, "cancel_cutoff_hours")
	return set_status(name, "Cancelled", reason or ("Cancelled by patient" if by_patient else None))


def send_reminders():
	"""Evening-before and N-hours-before reminders (scheduler every 5 minutes)."""
	s = settings()
	now = now_datetime()
	if cint(s.reminder_evening_before) and s.reminder_evening_time and now.time() >= get_datetime(f"2000-01-01 {s.reminder_evening_time}").time():
		for a in frappe.get_all("Appointment", filters={"status": "Confirmed", "appointment_date": add_days(nowdate(), 1),
			"reminder_evening_sent": 0}, pluck="name"):
			appt = frappe.get_doc("Appointment", a)
			notify(appt, "appointment_reminder")
			appt.db_set("reminder_evening_sent", 1)
	hours = cint(s.reminder_hours_before)
	if hours:
		for a in frappe.get_all("Appointment", filters={"status": "Confirmed", "appointment_date": nowdate(),
			"reminder_hours_sent": 0}, fields=["name", "start_time"]):
			start = get_datetime(f"{nowdate()} {a.start_time or '00:00:00'}")
			if 0 <= time_diff_in_hours(start, now) <= hours:
				appt = frappe.get_doc("Appointment", a.name)
				notify(appt, "appointment_reminder")
				appt.db_set("reminder_hours_sent", 1)


def mark_no_shows():
	minutes = cint(setting("no_show_release_minutes")) or 30
	now = now_datetime()
	for a in frappe.get_all("Appointment", filters={"status": "Confirmed", "appointment_date": ["<=", nowdate()]},
		fields=["name", "appointment_date", "start_time"]):
		start = get_datetime(f"{a.appointment_date} {a.start_time or '23:59:00'}")
		if add_to_date(start, minutes=minutes) < now:
			set_status(a.name, "No-show")


def arrive(name):
	"""Patient arrived: mark Arrived. Reception then makes the OPD slip, which puts the patient in the queue."""
	return set_status(name, "Arrived")
