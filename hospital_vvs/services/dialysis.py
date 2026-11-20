"""Nephrology & Dialysis (D-99).

Reuses the hospital's own records: Patient (MR), Doctor, Lab Result (trends, monthly panel, viral screening), Counter Receipt (billing,
packages), Consent Form (haemodialysis / catheter consent), Prescription (CKD clinic fields), ERPNext Stock (consumables via
buying.issue_consumables), Blocked Date (holidays) and messaging (SMS / WhatsApp). New doctypes live in the `dialysis` module.

Server-side rules (cannot be bypassed from the UI):
  * infection-control zones — a patient's zone (Negative / HBV / HCV / HIV) must match the station's zone;
  * viral screening must be on file and not overdue to schedule or check in, unless a nephrologist records an override with a reason;
  * package sessions are deducted here, once per session;
  * URR and single-pool Kt/V (Daugirdas II) are computed here from pre / post urea.
All clinical thresholds, intervals and prices below are placeholders for LMC's nephrology team and accounts to confirm ([confirm]).
"""

import hashlib
import hmac
import json
import math
import random
import re
import secrets

import frappe
from frappe import _
from frappe.utils import add_days, cint, escape_html as esc, flt, get_datetime, getdate, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.hospital_vvs.doctype.patient.patient import normalize_phone
from hospital_vvs.services import messaging
from hospital_vvs.utils import default_branch, has_any_role, publish

# ------------------------------------------------------------------ settings [confirm]
SHIFTS = {"Morning": ("07:00", "11:00"), "Afternoon": ("11:30", "15:30"), "Evening": ("16:00", "20:00"), "Night": ("20:30", "00:30")}
ACTIVE_SHIFTS = ["Morning", "Afternoon", "Evening"]          # the unit runs 3 shifts; Night is for emergencies
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
SCREEN_INTERVAL_DAYS = 90       # HBsAg / Anti-HCV / HIV every 3 months for negative patients
SCREEN_DUE_SOON_DAYS = 14
HORIZON_DAYS = 28               # sessions generated four weeks ahead
WEIGHT_GAIN_ALERT_KG = 3.0      # inter-dialytic weight gain
WEIGHT_GAIN_ALERT_PCT = 4.0     # … or % of dry weight
SBP_LOW, SBP_HIGH = 90, 180
TEMP_HIGH = 37.8
MONTHLY_LAB_DAYS = 35
URR_TARGET, KTV_TARGET = 65.0, 1.2
PACKAGE_VALID_DAYS = 45
WAREHOUSE = "Dialysis Store"
PORTAL_PATH = "/hms/site/my-dialysis"

STAFF = (R.NEPHROLOGIST, R.DIALYSIS_INCHARGE, R.DIALYSIS_NURSE, R.DIALYSIS_TECH)
CLIN = (R.NEPHROLOGIST, R.DIALYSIS_INCHARGE, R.DIALYSIS_NURSE)
LEAD = (R.NEPHROLOGIST, R.DIALYSIS_INCHARGE)

# Service & Rate master items (item group "Dialysis / Nephrology" under Medical Services) — prices [confirm]
ITEMS = [
	("DIA-HD-SESSION", "Haemodialysis session", 6000), ("DIA-HD-EMERGENCY", "Emergency haemodialysis session", 9000),
	("DIA-HD-ICU", "ICU bedside dialysis", 12000), ("DIA-UF", "Isolated ultrafiltration", 5000),
	("DIA-CATH-TEMP", "Temporary dialysis catheter insertion", 15000), ("DIA-CATH-PERM", "Permanent (tunnelled) catheter insertion", 45000),
	("DIA-NEEDLE-SET", "Fistula needle set", 800), ("DIA-DIALYSER", "Dialyser", 3500), ("DIA-EPO", "EPO injection (4000 IU)", 2500),
	("DIA-IRON", "Iron sucrose injection (100 mg)", 1800), ("DIA-BIOPSY", "Kidney biopsy", 25000), ("DIA-NEPH-CONSULT", "Nephrology consultation", 2500),
	("DIA-PKG-8", "Dialysis package — 8 sessions", 44000), ("DIA-PKG-12", "Dialysis package — 12 sessions", 64000), ("DIA-PKG-13", "Dialysis package — 13 sessions", 68000),
]
PACKAGES = {"DIA-PKG-8": 8, "DIA-PKG-12": 12, "DIA-PKG-13": 13}
SESSION_ITEM = {"Regular": "DIA-HD-SESSION", "Extra": "DIA-HD-SESSION", "Guest": "DIA-HD-SESSION", "Emergency": "DIA-HD-EMERGENCY", "ICU bedside": "DIA-HD-ICU"}
# consumables deducted per completed session from the Dialysis Store [confirm]
CONSUMABLES = [("DIA-C-DIALYSER", "Dialyser (high-flux)", 1, "Nos"), ("DIA-C-BLOODLINE", "Blood line set", 1, "Nos"), ("DIA-C-NEEDLE", "AV fistula needle (pair)", 1, "Nos"),
	("DIA-C-ACID", "Acid concentrate (5 L)", 1, "Nos"), ("DIA-C-BICARB", "Bicarbonate cartridge", 1, "Nos"), ("DIA-C-HEPARIN", "Heparin 5000 IU vial", 1, "Nos"),
	("DIA-C-SALINE", "Normal saline 1 L", 2, "Nos"), ("DIA-C-CATH", "Temporary dialysis catheter kit", 0, "Nos"), ("DIA-C-EPO", "Erythropoietin 4000 IU", 0, "Nos")]
LOW_STOCK = 20

LAB_KEYS = [("creatinine", "Creatinine", r"creatinine"), ("egfr", "eGFR", r"egfr"), ("urea", "Urea", r"^urea(?!.*post)|blood urea|bun|pre.?dialysis urea"),
	("potassium", "Potassium", r"potassium|^k\b"), ("sodium", "Sodium", r"sodium|^na\b"), ("hb", "Haemoglobin", r"ha?emoglobin|^hb\b"),
	("calcium", "Calcium", r"calcium"), ("phosphate", "Phosphate", r"phosph"), ("pth", "PTH", r"\bpth\b|parathyroid"), ("albumin", "Albumin", r"albumin"),
	("protein", "Urine protein", r"urine protein|proteinuria|acr|pcr")]


def _now():
	return now_datetime()


def require(*roles):
	if not has_any_role(*roles):
		frappe.throw(_("Not permitted."), frappe.PermissionError)


def _dp(name):
	return frappe.get_doc("Dialysis Patient", name)


def audit(doc, action, note=None):
	"""Every important change is also written as a timeline comment (track_changes keeps field-level versions)."""
	doc.add_comment("Info", f"{action}{(' — ' + note) if note else ''}")


# ------------------------------------------------------------------ infection control
def zone_of(hbsag, anti_hcv, hiv):
	"""HBV takes priority (strictest isolation), then HCV, then HIV."""
	if hbsag == "Positive":
		return "HBV"
	if anti_hcv == "Positive":
		return "HCV"
	if hiv == "Positive":
		return "HIV"
	return "Negative"


def refresh_viral(dp):
	"""Copy the latest screening row onto the profile and recompute zone and next-due date."""
	rows = sorted([r for r in dp.screenings if r.tested_on], key=lambda r: getdate(r.tested_on))
	if rows:
		last = rows[-1]
		for k in ("hbsag", "anti_hcv", "hiv"):
			if last.get(k) and last.get(k) != "Unknown":
				dp.set(k, last.get(k))
		dp.viral_tested_on = last.tested_on
		dp.viral_next_due = add_days(last.tested_on, SCREEN_INTERVAL_DAYS)
	dp.zone = zone_of(dp.hbsag, dp.anti_hcv, dp.hiv)


def screening_state(dp, on=None):
	"""'ok' | 'due' (within 14 days) | 'overdue' | 'missing' — plus whether a nephrologist override covers the date."""
	on = getdate(on or today())
	override = bool(dp.override_until and getdate(dp.override_until) >= on)
	if not dp.viral_tested_on or "Unknown" in (dp.hbsag, dp.anti_hcv, dp.hiv):
		return {"state": "missing", "override": override}
	due = getdate(dp.viral_next_due)
	if due < on:
		return {"state": "overdue", "override": override, "due": str(due)}
	return {"state": "due" if (due - on).days <= SCREEN_DUE_SOON_DAYS else "ok", "override": override, "due": str(due)}


def check_screening(dp, on=None):
	s = screening_state(dp, on)
	if s["state"] in ("missing", "overdue") and not s["override"]:
		frappe.throw(_("Viral screening (HBsAg / Anti-HCV / HIV) is {0} for {1}. Record a current result, or a nephrologist must record an override with a reason.")
			.format(_(s["state"]), dp.patient_name), title=_("Screening required"))


def check_station(dp, station):
	if not station:
		return
	st = frappe.db.get_value("Dialysis Station", station, ["zone", "status", "station_no"], as_dict=True)
	if not st:
		frappe.throw(_("Unknown station {0}.").format(station))
	if st.status != "Active":
		frappe.throw(_("Station {0} is {1}.").format(st.station_no, st.status))
	if st.zone != (dp.zone or "Negative"):
		frappe.throw(_("Infection control: {0} is {1} and cannot be placed on station {2} ({3} zone). Choose a {1}-zone station.")
			.format(dp.patient_name, _zone_label(dp.zone), st.station_no, _zone_label(st.zone)), title=_("Wrong infection zone"))


def _zone_label(z):
	return {"Negative": "virus-negative", "HBV": "HBsAg-positive", "HCV": "HCV-positive", "HIV": "HIV-positive"}.get(z or "Negative", z)


def slot_taken(station, date, shift, exclude=None):
	return frappe.db.get_value("Dialysis Session", {"station": station, "session_date": getdate(date), "shift": shift,
		"status": ["not in", ["Cancelled", "Missed"]], "name": ["!=", exclude or ""]}, ["name", "patient_name"], as_dict=True)


def override_screening(name, until, reason):
	require(R.NEPHROLOGIST)
	if len((reason or "").strip()) < 5:
		frappe.throw(_("Write the reason for the override."))
	dp = _dp(name)
	until = getdate(until)
	if (until - getdate(today())).days > 30:
		frappe.throw(_("An override can cover at most 30 days."))
	dp.override_until, dp.override_by, dp.override_reason = until, frappe.session.user, reason.strip()
	dp.save(ignore_permissions=True)
	audit(dp, "Screening override", f"until {until}: {reason.strip()}")
	return dp


# ------------------------------------------------------------------ profile
PROFILE_FIELDS = ("patient", "patient_name", "gender", "age", "phone", "cnic", "whatsapp_opt_in", "nephrologist", "diagnosis", "ckd_cause", "ckd_stage",
	"dialysis_start", "dry_weight", "comorbidities", "allergies_note", "access_type", "access_site", "access_created", "access_status", "rx_duration_hrs",
	"rx_per_week", "dialyser", "blood_flow", "dialysate_flow", "dialysate", "heparin", "uf_guidance", "epo", "iron", "other_meds", "payer", "panel",
	"panel_ref", "ec_name", "ec_relation", "ec_phone", "request_type", "referring_doctor", "external_referrer", "current_hospital", "branch")
RX_FIELDS = {"dry_weight", "rx_duration_hrs", "rx_per_week", "dialyser", "blood_flow", "dialysate_flow", "dialysate", "heparin", "uf_guidance", "epo", "iron", "other_meds"}


def save_profile(name, data):
	require(*CLIN, R.RECEPTIONIST)
	dp = _dp(name) if name else frappe.new_doc("Dialysis Patient")
	changed_rx = []
	for k in PROFILE_FIELDS:
		if k in data:
			if k in RX_FIELDS and str(dp.get(k) or "") != str(data[k] or ""):
				changed_rx.append(k)
			dp.set(k, data[k])
	if changed_rx and not has_any_role(R.NEPHROLOGIST, R.DIALYSIS_INCHARGE):
		frappe.throw(_("Only a nephrologist or the dialysis in-charge can change the dialysis prescription."))
	if dp.patient and not dp.patient_name:
		dp.patient_name = frappe.db.get_value("Patient", dp.patient, "patient_name")
	if dp.is_new():
		dp.status = "Active" if dp.patient else "Requested"
		dp.branch = dp.branch or default_branch()
	refresh_viral(dp)
	dp.save(ignore_permissions=True)
	if changed_rx:
		audit(dp, "Prescription changed", ", ".join(changed_rx))
	return dp


def add_screening(name, row):
	require(*CLIN)
	dp = _dp(name)
	if not row.get("tested_on"):
		frappe.throw(_("Enter the test date."))
	if getdate(row["tested_on"]) > getdate(today()):
		frappe.throw(_("The test date cannot be in the future."))
	old_zone = dp.zone
	dp.append("screenings", {k: row.get(k) for k in ("tested_on", "hbsag", "anti_hcv", "hiv", "lab_result", "source", "notes")})
	refresh_viral(dp)
	dp.save(ignore_permissions=True)
	audit(dp, "Viral screening", f"{row.get('tested_on')}: HBsAg {row.get('hbsag')}, Anti-HCV {row.get('anti_hcv')}, HIV {row.get('hiv')}")
	if dp.zone != old_zone:
		_zone_changed(dp, old_zone)
	return dp


def _zone_changed(dp, old_zone):
	"""A zone change (e.g. sero-conversion) releases future sessions from wrong-zone stations; the in-charge must re-assign."""
	moved = 0
	for s in frappe.get_all("Dialysis Session", filters={"dialysis_patient": dp.name, "session_date": [">=", today()], "status": "Scheduled"}, fields=["name", "station"]):
		if s.station and frappe.db.get_value("Dialysis Station", s.station, "zone") != dp.zone:
			frappe.db.set_value("Dialysis Session", s.name, {"station": None, "zone": dp.zone})
			moved += 1
	if dp.station and frappe.db.get_value("Dialysis Station", dp.station, "zone") != dp.zone:
		frappe.db.set_value("Dialysis Patient", dp.name, "station", None)
	audit(dp, "Infection zone changed", f"{old_zone} → {dp.zone}; {moved} future session(s) need a {dp.zone}-zone station")
	publish("dialysis", {"action": "zone", "name": dp.name}, dp.branch)


def add_access(name, row):
	require(*CLIN)
	dp = _dp(name)
	for r in dp.accesses:
		if r.status in ("Working", "Maturing") and row.get("status") in ("Working", "Maturing") and row.get("replaces_current"):
			r.status, r.removed_on = "Removed", today()
	dp.append("accesses", {k: row.get(k) for k in ("access_type", "site", "created_on", "status", "notes")})
	if row.get("status") in ("Working", "Maturing", None):
		dp.access_type, dp.access_site, dp.access_created, dp.access_status = row.get("access_type"), row.get("site"), row.get("created_on"), row.get("status") or "Working"
	dp.save(ignore_permissions=True)
	audit(dp, "Vascular access", f"{row.get('access_type')} {row.get('site') or ''}")
	return dp


def set_status(name, status, reason=None):
	"""No deletes: patients are paused / discharged / transferred with a reason; future scheduled sessions are cancelled."""
	require(*LEAD)
	if status not in ("Active", "Paused", "Transferred out", "Discharged", "Deceased"):
		frappe.throw(_("Invalid status."))
	dp = _dp(name)
	if status != "Active" and len((reason or "").strip()) < 3:
		frappe.throw(_("Give a reason."))
	dp.status = status
	if status != "Active":
		dp.schedule_active = 0
		for s in frappe.get_all("Dialysis Session", filters={"dialysis_patient": name, "session_date": [">=", today()], "status": "Scheduled"}, pluck="name"):
			frappe.db.set_value("Dialysis Session", s, {"status": "Cancelled", "missed_reason": f"Patient {status.lower()}: {reason}"})
	dp.save(ignore_permissions=True)
	audit(dp, f"Status → {status}", reason)
	return dp


def start_from_opd(patient, prescription=None, nephrologist=None):
	"""'Start dialysis' from the CKD clinic: a dialysis profile pre-filled from the patient and the nephrology prescription."""
	require(R.NEPHROLOGIST, R.DOCTOR, R.DIALYSIS_INCHARGE)
	ex = frappe.db.get_value("Dialysis Patient", {"patient": patient, "status": ["in", ["Active", "Paused", "Requested"]]}, "name")
	if ex:
		return _dp(ex)
	p = frappe.db.get_value("Patient", patient, ["patient_name", "gender", "dob", "phone", "cnic"], as_dict=True)
	if not p:
		frappe.throw(_("Unknown patient."))
	rx = frappe.db.get_value("Prescription", prescription, ["ckd_stage", "ckd_cause", "neph_comorbidities", "neph_weight", "doctor"], as_dict=True) if prescription else None
	dp = frappe.get_doc({"doctype": "Dialysis Patient", "status": "Active", "request_type": "New", "patient": patient, "patient_name": p.patient_name,
		"gender": p.gender, "age": _age(p.dob), "phone": p.phone, "cnic": p.cnic, "branch": default_branch(),
		"nephrologist": nephrologist or (rx or {}).get("doctor") or frappe.db.get_value("Doctor", {"user": frappe.session.user}, "name"),
		"ckd_stage": "5D" if not rx else ((rx.ckd_stage if rx.ckd_stage in ("5", "5D", "AKI") else "5D")), "ckd_cause": (rx or {}).get("ckd_cause"),
		"comorbidities": (rx or {}).get("neph_comorbidities"), "dry_weight": (rx or {}).get("neph_weight"), "dialysis_start": today(),
		"rx_duration_hrs": 4, "rx_per_week": 2, "whatsapp_opt_in": 1})
	refresh_viral(dp)
	dp.insert(ignore_permissions=True)
	audit(dp, "Started from nephrology OPD", prescription)
	return dp


def _age(dob):
	if not dob:
		return None
	d = getdate(dob)
	t = getdate(today())
	return t.year - d.year - ((t.month, t.day) < (d.month, d.day))


# ------------------------------------------------------------------ recurring schedules
def parse_days(days):
	out = []
	for d in re.split(r"[,\s/]+", days or ""):
		d = d.strip()[:3].title()
		if d in DAYS and d not in out:
			out.append(d)
	return out


def set_schedule(name, days, shift, station, start=None):
	"""Fixed days + shift + station; validates zone and screening, then generates sessions four weeks ahead."""
	require(*LEAD)
	dp = _dp(name)
	if dp.status != "Active":
		frappe.throw(_("Only active dialysis patients can be scheduled."))
	dl = parse_days(days)
	if not dl:
		frappe.throw(_("Choose the dialysis days (e.g. Mon, Thu)."))
	if shift not in SHIFTS:
		frappe.throw(_("Choose a shift."))
	check_station(dp, station)
	check_screening(dp, start)
	# the station must be free on those days / shift for this patient's recurring slot
	for other in frappe.get_all("Dialysis Patient", filters={"station": station, "sched_shift": shift, "schedule_active": 1, "name": ["!=", name], "status": "Active"},
			fields=["name", "patient_name", "sched_days"]):
		clash = set(parse_days(other.sched_days)) & set(dl)
		if clash:
			frappe.throw(_("Station {0} is already used on {1} ({2}) by {3}.").format(station, ", ".join(sorted(clash, key=DAYS.index)), shift, other.patient_name))
	dp.sched_days, dp.sched_shift, dp.station, dp.schedule_active = ", ".join(dl), shift, station, 1
	dp.schedule_from = getdate(start or today())
	dp.rx_per_week = len(dl)
	# future scheduled sessions from the old rule are re-generated
	for s in frappe.get_all("Dialysis Session", filters={"dialysis_patient": name, "session_date": [">=", dp.schedule_from], "status": "Scheduled", "source": "Schedule",
			"payment_status": "Unpaid"}, pluck="name"):
		frappe.db.set_value("Dialysis Session", s, {"status": "Cancelled", "missed_reason": "Schedule changed"})
	dp.schedule_until = None
	dp.save(ignore_permissions=True)
	audit(dp, "Schedule set", f"{dp.sched_days} · {shift} · station {station} from {dp.schedule_from}")
	n = generate(dp)
	return {"profile": dp.as_dict(), "generated": n}


def _holidays(branch, start, end):
	return {getdate(d) for d in frappe.get_all("Blocked Date", filters={"blocked_date": ["between", [start, end]], "branch": ["in", [branch, None, ""]]}, pluck="blocked_date")}


def generate(dp, horizon=HORIZON_DAYS):
	"""Create Scheduled sessions on the patient's days up to `horizon` days ahead (idempotent). Holidays (Blocked Date) are skipped and
	flagged for the in-charge to re-book; a station already taken leaves the session without a station (shown as 'needs station')."""
	if not (dp.schedule_active and dp.sched_days and dp.sched_shift) or dp.status != "Active":
		return 0
	start = max(getdate(dp.schedule_from or today()), getdate(today()))
	if dp.schedule_until and getdate(dp.schedule_until) >= start:
		start = add_days(dp.schedule_until, 1)
	end = add_days(today(), horizon)
	if getdate(start) > getdate(end):
		return 0
	days = {DAYS.index(d) for d in parse_days(dp.sched_days)}
	holidays = _holidays(dp.branch, start, end)
	rate = session_rate("Regular")
	n, d = 0, getdate(start)
	while d <= getdate(end):
		if d.weekday() in days and not frappe.db.exists("Dialysis Session", {"dialysis_patient": dp.name, "session_date": d, "status": ["!=", "Cancelled"]}):
			station = dp.station if dp.station and not slot_taken(dp.station, d, dp.sched_shift) else None
			alerts = []
			if d in holidays:
				alerts.append("Holiday — re-book")
			if not station:
				alerts.append("Needs station")
			frappe.get_doc({"doctype": "Dialysis Session", "dialysis_patient": dp.name, "patient": dp.patient, "patient_name": dp.patient_name, "branch": dp.branch,
				"session_date": d, "shift": dp.sched_shift, "station": station, "zone": dp.zone, "status": "Scheduled", "session_type": "Regular", "source": "Schedule",
				"amount": rate, "payment_status": "Panel credit" if dp.payer in ("Panel", "Sehat Card") and dp.panel_ref else "Unpaid",
				"alerts": json.dumps(alerts) if alerts else None, **_rx_defaults(dp)}).insert(ignore_permissions=True)
			n += 1
		d = add_days(d, 1)
	frappe.db.set_value("Dialysis Patient", dp.name, "schedule_until", end, update_modified=False)
	return n


def _rx_defaults(dp):
	return {"dialyser_type": dp.dialyser, "blood_flow": dp.blood_flow, "dialysate_flow": dp.dialysate_flow, "heparin": dp.heparin, "duration_hrs": dp.rx_duration_hrs or 4,
		"machine_serial": frappe.db.get_value("Dialysis Station", dp.station, "machine_serial") if dp.station else None}


def extra_session(name, date, shift, station=None, session_type="Extra", ward_location=None):
	"""An extra / emergency / ICU-bedside session outside the recurring schedule."""
	require(*LEAD, R.DIALYSIS_NURSE, R.RECEPTIONIST)
	dp = _dp(name)
	if dp.status not in ("Active", "Requested") and session_type != "Emergency":
		frappe.throw(_("The dialysis patient is {0}.").format(dp.status))
	if session_type not in SESSION_ITEM:
		frappe.throw(_("Invalid session type."))
	if session_type != "ICU bedside":
		check_station(dp, station)
	if session_type not in ("Emergency", "ICU bedside"):
		check_screening(dp, date)
	if station:
		t = slot_taken(station, date, shift)
		if t:
			frappe.throw(_("Station {0} is booked for {1} in that shift.").format(station, t.patient_name))
	s = frappe.get_doc({"doctype": "Dialysis Session", "dialysis_patient": dp.name, "patient": dp.patient, "patient_name": dp.patient_name, "branch": dp.branch or default_branch(),
		"session_date": getdate(date), "shift": shift, "station": station, "zone": dp.zone, "status": "Scheduled", "session_type": session_type, "source": "Manual",
		"ward_location": ward_location, "amount": session_rate(session_type), **_rx_defaults(dp)})
	if session_type in ("Emergency", "ICU bedside") and screening_state(dp, date)["state"] in ("missing", "overdue"):
		s.alerts = json.dumps(["Screening not on file — treat as positive / isolate until results"])
	s.insert(ignore_permissions=True)
	audit(dp, f"{session_type} session", f"{date} {shift} {station or ward_location or ''}")
	publish("dialysis", {"action": "session", "name": s.name}, s.branch)
	return s


def session_rate(session_type):
	code = SESSION_ITEM.get(session_type, "DIA-HD-SESSION")
	return flt(frappe.db.get_value("Item Price", {"item_code": code, "selling": 1}, "price_list_rate")) or flt(dict((c, r) for c, _n, r in ITEMS).get(code))


def move_session(name, date, shift, station=None, reason=None, approve_swap=False):
	"""Swap / reschedule (in-charge). Same zone and slot rules as a new booking."""
	require(*LEAD)
	s = frappe.get_doc("Dialysis Session", name)
	if s.status not in ("Scheduled",):
		frappe.throw(_("Only scheduled sessions can be moved."))
	dp = _dp(s.dialysis_patient)
	station = station or s.station
	check_station(dp, station)
	if station:
		t = slot_taken(station, date, shift, exclude=name)
		if t:
			frappe.throw(_("Station {0} is booked for {1} in that shift.").format(station, t.patient_name))
	old = f"{s.session_date} {s.shift} {s.station or ''}"
	s.session_date, s.shift, s.station, s.zone = getdate(date), shift, station, dp.zone
	if approve_swap:
		s.swap_status = "Approved"
	s.save(ignore_permissions=True)
	audit(dp, "Session moved", f"{name}: {old} → {date} {shift} {station or ''}{(' — ' + reason) if reason else ''}")
	if approve_swap and dp.phone:
		messaging.send("dialysis_swap", phone=dp.phone, patient=dp.patient, consent=bool(dp.whatsapp_opt_in), reference_doctype="Dialysis Session", reference_name=name,
			context={"first_name": (dp.patient_name or "").split()[0], "date": frappe.utils.formatdate(date, "dd MMM"), "shift": shift, "status": "approved"})
	return s


def reject_swap(name, reason):
	require(*LEAD)
	s = frappe.get_doc("Dialysis Session", name)
	s.swap_status = "Rejected"
	s.save(ignore_permissions=True)
	dp = _dp(s.dialysis_patient)
	audit(dp, "Swap rejected", reason)
	if dp.phone:
		messaging.send("dialysis_swap", phone=dp.phone, patient=dp.patient, consent=bool(dp.whatsapp_opt_in), reference_doctype="Dialysis Session", reference_name=name,
			context={"first_name": (dp.patient_name or "").split()[0], "date": frappe.utils.formatdate(s.session_date, "dd MMM"), "shift": s.shift, "status": "not possible — please call the unit"})
	return s


def cancel_session(name, reason, missed=False):
	require(*LEAD, R.DIALYSIS_NURSE, R.RECEPTIONIST)
	if len((reason or "").strip()) < 3:
		frappe.throw(_("Give a reason."))
	s = frappe.get_doc("Dialysis Session", name)
	if s.status in ("Completed", "In Session"):
		frappe.throw(_("A session that started cannot be cancelled."))
	if s.payment_status == "Package" and s.package_receipt:
		_return_package_session(s)
	s.status, s.missed_reason = ("Missed" if missed else "Cancelled"), reason.strip()
	s.save(ignore_permissions=True)
	audit(_dp(s.dialysis_patient), "Session missed" if missed else "Session cancelled", f"{name}: {reason}")
	return s


# ------------------------------------------------------------------ packages & payment (called from the counter)
def package_balance(dp):
	act = [p for p in dp.packages if p.status == "Active" and (not p.valid_until or getdate(p.valid_until) >= getdate(today()))]
	tot = sum(cint(p.sessions) for p in act)
	used = sum(cint(p.used) for p in act)
	return {"remaining": tot - used, "total": tot, "rows": [{"receipt": p.counter_receipt, "name": p.package_name, "sessions": p.sessions, "used": p.used,
		"valid_until": str(p.valid_until or "")} for p in act]}


def sell_package(dialysis_patient, item_code, receipt, amount):
	if item_code not in PACKAGES:
		frappe.throw(_("{0} is not a dialysis package.").format(item_code))
	dp = _dp(dialysis_patient)
	dp.append("packages", {"purchased_on": today(), "package_name": frappe.db.get_value("Item", item_code, "item_name"), "item_code": item_code, "sessions": PACKAGES[item_code],
		"used": 0, "amount": amount, "counter_receipt": receipt, "valid_until": add_days(today(), PACKAGE_VALID_DAYS), "status": "Active"})
	dp.save(ignore_permissions=True)
	audit(dp, "Package sold", f"{PACKAGES[item_code]} sessions · {receipt}")
	return package_balance(dp)


def use_package(session):
	"""Deduct one package session for this session (once). Oldest active package first."""
	s = frappe.get_doc("Dialysis Session", session) if isinstance(session, str) else session
	if s.package_receipt:
		return package_balance(_dp(s.dialysis_patient))
	dp = _dp(s.dialysis_patient)
	act = sorted([p for p in dp.packages if p.status == "Active" and cint(p.used) < cint(p.sessions)
		and (not p.valid_until or getdate(p.valid_until) >= getdate(today()))], key=lambda p: getdate(p.purchased_on))
	if not act:
		frappe.throw(_("{0} has no package sessions left.").format(dp.patient_name))
	p = act[0]
	p.used = cint(p.used) + 1
	if p.used >= cint(p.sessions):
		p.status = "Used up"
	dp.save(ignore_permissions=True)
	s.package_receipt, s.payment_status = p.counter_receipt, "Package"
	return package_balance(dp)


def _return_package_session(s):
	dp = _dp(s.dialysis_patient)
	for p in dp.packages:
		if p.counter_receipt == s.package_receipt and cint(p.used) > 0:
			p.used = cint(p.used) - 1
			if p.status == "Used up":
				p.status = "Active"
			break
	dp.save(ignore_permissions=True)
	s.package_receipt = None
	s.payment_status = "Unpaid"


def mark_paid(session, receipt, via="Paid", token=None):
	s = frappe.get_doc("Dialysis Session", session)
	if via == "Package":
		use_package(s)
	else:
		s.payment_status = via
	s.counter_receipt = receipt
	s.token_no = token or s.token_no or next_token(s)
	s.save(ignore_permissions=True)
	publish("dialysis", {"action": "paid", "name": s.name}, s.branch)
	return s


def next_token(s):
	n = frappe.db.count("Dialysis Session", {"session_date": s.session_date, "token_no": ["is", "set"], "branch": s.branch}) + 1
	return f"HD-{n:03d}"


def allow_unpaid(name, reason):
	require(*LEAD)
	if len((reason or "").strip()) < 5:
		frappe.throw(_("Give the reason for allowing an unpaid session."))
	s = frappe.get_doc("Dialysis Session", name)
	s.payment_status, s.allow_reason, s.allowed_by = "Allowed unpaid", reason.strip(), frappe.session.user
	s.token_no = s.token_no or next_token(s)
	s.save(ignore_permissions=True)
	audit(_dp(s.dialysis_patient), "Unpaid session allowed", f"{name}: {reason}")
	return s


def next_session(dialysis_patient, after=None):
	r = frappe.get_all("Dialysis Session", filters={"dialysis_patient": dialysis_patient, "status": "Scheduled", "session_date": [">", getdate(after or today())]},
		fields=["name", "session_date", "shift", "station"], order_by="session_date", limit=1)
	return r[0] if r else None


def slip_info(session):
	"""What the counter slip prints for a dialysis line."""
	s = frappe.db.get_value("Dialysis Session", session, ["name", "dialysis_patient", "session_date", "shift", "station", "token_no", "payment_status"], as_dict=True)
	if not s:
		return None
	dp = _dp(s.dialysis_patient)
	bal = package_balance(dp)
	nxt = next_session(s.dialysis_patient, s.session_date)
	return {"department": "Dialysis", "token": s.token_no, "where": f"Dialysis unit · station {s.station or '—'}", "report_at": None,
		"prep": f"{frappe.utils.formatdate(s.session_date, 'dd MMM')} · {s.shift} shift ({SHIFTS[s.shift][0]})"
			+ (f" · Sessions remaining: {bal['remaining']} of {bal['total']}" if bal["total"] else "")
			+ (f" · Next: {frappe.utils.formatdate(nxt.session_date, 'EEE dd MMM')} {nxt.shift}" if nxt else "")}


# ------------------------------------------------------------------ session workflow + charting
def _session(name):
	return frappe.get_doc("Dialysis Session", name)


PAID = ("Paid", "Package", "Panel credit", "Allowed unpaid")


def checkin(name):
	require(*CLIN, R.DIALYSIS_TECH, R.RECEPTIONIST)
	s = _session(name)
	if s.status != "Scheduled":
		frappe.throw(_("This session is {0}.").format(s.status))
	dp = _dp(s.dialysis_patient)
	if s.session_type not in ("Emergency", "ICU bedside"):
		check_screening(dp, s.session_date)
		if s.payment_status not in PAID:
			frappe.throw(_("Payment pending — pay at the Charges Counter, or the in-charge can allow the session with a reason."), title=_("Payment pending"))
	if s.station:
		check_station(dp, s.station)
	elif s.session_type != "ICU bedside":
		frappe.throw(_("Assign a station first."))
	s.status, s.checkin_at = "Checked-in", _now()
	s.token_no = s.token_no or next_token(s)
	s.save(ignore_permissions=True)
	publish("dialysis", {"action": "checkin", "name": name}, s.branch)
	return s


CHART_FIELDS = ("pre_weight", "pre_bp_sys", "pre_bp_dia", "pre_pulse", "pre_temp", "access_check", "pre_symptoms", "pre_notes", "machine_serial", "dialyser_type",
	"dialyser_use", "reuse_no", "blood_flow", "dialysate_flow", "uf_goal", "heparin", "duration_hrs", "post_weight", "post_bp_sys", "post_bp_dia", "post_pulse",
	"total_uf", "haemostasis", "condition", "pre_urea", "post_urea", "doctor_note")
CHILD = {"observations": ("obs_time", "bp_sys", "bp_dia", "pulse", "venous_p", "arterial_p", "blood_flow", "uf_removed", "note"),
	"complications": ("comp_time", "complication", "action"), "medicines": ("medicine", "item_code", "dose", "route", "batch_no", "given_at"),
	"consumables": ("item_code", "item_name", "qty")}


def chart(name, data):
	"""Save any part of the chart (tablet-friendly: the bedside screen saves section by section). Signed sessions are locked."""
	require(*CLIN, R.DIALYSIS_TECH)
	s = _session(name)
	if s.status in ("Cancelled", "Missed"):
		frappe.throw(_("This session is {0}.").format(s.status))
	if s.nurse_signed_by and not has_any_role(R.NEPHROLOGIST):
		frappe.throw(_("The session is signed. Ask the nephrologist to amend it."))
	for k in CHART_FIELDS:
		if k in data:
			if k == "doctor_note" and not has_any_role(R.NEPHROLOGIST):
				continue
			s.set(k, data[k])
	for t, cols in CHILD.items():
		if t in data:
			s.set(t, [])
			for row in data[t] or []:
				r = {c: row.get(c) for c in cols}
				r["recorded_by" if t != "medicines" else "given_by"] = row.get("recorded_by") or row.get("given_by") or frappe.session.user
				if t == "consumables":
					r.pop("recorded_by", None)
				s.append(t, r)
	if data.get("start") and s.status == "Checked-in":
		s.status, s.start_at = "In Session", _now()
	compute(s)
	s.save(ignore_permissions=True)
	publish("dialysis", {"action": "chart", "name": name}, s.branch)
	return session_view(s.name)


def compute(s):
	"""Weight gain, URR, Kt/V and alerts — always recomputed on the server."""
	dp = _dp(s.dialysis_patient)
	prev = frappe.get_all("Dialysis Session", filters={"dialysis_patient": s.dialysis_patient, "status": "Completed", "post_weight": [">", 0],
		"session_date": ["<=", s.session_date], "name": ["!=", s.name]}, fields=["post_weight"], order_by="session_date desc, end_at desc", limit=1)
	s.weight_gain = round(flt(s.pre_weight) - flt(prev[0].post_weight), 2) if s.pre_weight and prev else (round(flt(s.pre_weight) - flt(dp.dry_weight), 2) if s.pre_weight and dp.dry_weight else None)
	if flt(s.pre_urea) > 0 and flt(s.post_urea) > 0:
		ratio = flt(s.post_urea) / flt(s.pre_urea)
		s.urr = round((1 - ratio) * 100, 1)
		t = flt(s.duration_hrs) or (((get_datetime(s.end_at) - get_datetime(s.start_at)).total_seconds() / 3600) if s.end_at and s.start_at else 4)
		uf = flt(s.total_uf) or max(flt(s.pre_weight) - flt(s.post_weight), 0)
		w = flt(s.post_weight) or flt(dp.dry_weight) or 60
		try:
			s.ktv = round(-math.log(ratio - 0.008 * t) + (4 - 3.5 * ratio) * uf / w, 2)   # Daugirdas second-generation single-pool Kt/V
		except ValueError:
			s.ktv = None
	if s.post_weight and s.pre_weight and not flt(s.total_uf):
		s.total_uf = round(flt(s.pre_weight) - flt(s.post_weight), 2)
	s.alerts = json.dumps(alerts_for(s, dp)) or None


def alerts_for(s, dp):
	a = []
	if s.weight_gain is not None and (flt(s.weight_gain) > WEIGHT_GAIN_ALERT_KG or (dp.dry_weight and flt(s.weight_gain) / flt(dp.dry_weight) * 100 > WEIGHT_GAIN_ALERT_PCT)):
		a.append(f"High weight gain {flt(s.weight_gain):g} kg")
	bps = [("pre", s.pre_bp_sys), ("post", s.post_bp_sys)] + [(str(o.obs_time)[:5], o.bp_sys) for o in s.observations]
	for when, sbp in bps:
		if sbp and cint(sbp) < SBP_LOW:
			a.append(f"Low BP {sbp} ({when})")
		elif sbp and cint(sbp) > SBP_HIGH:
			a.append(f"High BP {sbp} ({when})")
	if flt(s.pre_temp) >= TEMP_HIGH:
		a.append(f"Fever {flt(s.pre_temp):g} °C")
	if s.access_check in ("No thrill", "Catheter site red / discharge", "Catheter flow poor"):
		a.append(f"Access: {s.access_check}")
	if s.urr and flt(s.urr) < URR_TARGET:
		a.append(f"URR {flt(s.urr):g}% below target")
	if s.ktv and flt(s.ktv) < KTV_TARGET:
		a.append(f"Kt/V {flt(s.ktv):g} below target")
	for c in s.complications:
		a.append(f"Complication: {c.complication}")
	sc = screening_state(dp, s.session_date)
	if sc["state"] in ("missing", "overdue"):
		a.append(f"Viral screening {sc['state']}" + (" (override)" if sc["override"] else ""))
	elif sc["state"] == "due":
		a.append(f"Viral screening due {sc.get('due')}")
	if labs_overdue(dp):
		a.append("Monthly labs overdue")
	missed = frappe.db.count("Dialysis Session", {"dialysis_patient": dp.name, "status": "Missed", "session_date": [">=", add_days(today(), -30)]})
	if missed:
		a.append(f"{missed} missed session(s) in 30 days")
	return a


def labs_overdue(dp):
	if not dp.patient:
		return False
	last = frappe.db.sql("""select max(r.verified_at) from `tabLab Result` r where r.patient=%s and r.status='Verified'
		and (r.template like %s or r.template like %s)""", (dp.patient, "%Dialysis%", "%Renal%"))[0][0]
	return not last or (getdate(today()) - getdate(last)).days > MONTHLY_LAB_DAYS


def complete(name):
	"""Post-dialysis: needs the post weight and BP; deducts consumables from the Dialysis Store; station goes to 'Cleaning'."""
	require(*CLIN)
	s = _session(name)
	if s.status not in ("In Session", "Checked-in"):
		frappe.throw(_("Start the session first."))
	if not (s.post_weight and s.post_bp_sys):
		frappe.throw(_("Enter the post-dialysis weight and BP."))
	if not s.pre_weight:
		frappe.throw(_("Enter the pre-dialysis weight."))
	s.status, s.end_at = "Completed", _now()
	s.start_at = s.start_at or s.checkin_at
	if not s.consumables:
		for code, nm, qty, _u in CONSUMABLES:
			if qty and frappe.db.exists("Item", code):
				if code == "DIA-C-NEEDLE" and "catheter" in (frappe.db.get_value("Dialysis Patient", s.dialysis_patient, "access_type") or "").lower():
					continue
				s.append("consumables", {"item_code": code, "item_name": nm, "qty": qty})
	compute(s)
	s.save(ignore_permissions=True)
	_deduct(s)
	publish("dialysis", {"action": "completed", "name": name}, s.branch)
	return session_view(name)


def _deduct(s):
	wh = warehouse(s.branch)
	if not wh or s.stock_entry:
		return
	lines = [{"item_code": c.item_code, "qty": flt(c.qty)} for c in s.consumables if flt(c.qty) > 0 and frappe.db.exists("Item", c.item_code)
		and cint(frappe.db.get_value("Item", c.item_code, "is_stock_item"))]
	if not lines:
		return
	try:
		from hospital_vvs.services.buying import issue_consumables

		cc = frappe.db.get_value("Company", frappe.db.get_value("Warehouse", wh, "company"), "cost_center")
		se = issue_consumables(wh, lines, cc, remarks=f"Dialysis session {s.name}")
		frappe.db.set_value("Dialysis Session", s.name, "stock_entry", se.name if hasattr(se, "name") else se, update_modified=False)
	except Exception as e:  # stock short: the session stays completed; the in-charge sees it on the stock screen
		frappe.db.set_value("Dialysis Session", s.name, "alerts", json.dumps((json.loads(s.alerts or "[]")) + [f"Stock not deducted: {str(e)[:80]}"]), update_modified=False)
		frappe.log_error(title="Dialysis consumables")


def warehouse(branch=None):
	company = frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value("Company", {}, "name")
	abbr = frappe.db.get_value("Company", company, "abbr")
	name = f"{WAREHOUSE} - {abbr}"
	return name if frappe.db.exists("Warehouse", name) else None


def sign(name, as_doctor=False, note=None):
	s = _session(name)
	if as_doctor:
		require(R.NEPHROLOGIST)
		s.doctor_signed_by, s.doctor_signed_at = frappe.session.user, _now()
		if note:
			s.doctor_note = note
	else:
		require(*CLIN)
		if s.status != "Completed":
			frappe.throw(_("Complete the session first."))
		s.nurse_signed_by, s.nurse_signed_at = frappe.session.user, _now()
	s.signature_hash = doc_sig("session", s.name)
	s.save(ignore_permissions=True)
	audit(_dp(s.dialysis_patient), "Doctor signed" if as_doctor else "Nurse signed", s.name)
	return session_view(name)


def session_view(name):
	s = _session(name)
	dp = _dp(s.dialysis_patient)
	out = s.as_dict()
	out["alerts_list"] = json.loads(s.alerts or "[]")
	out["profile"] = {k: dp.get(k) for k in ("name", "patient", "patient_name", "gender", "age", "dry_weight", "zone", "access_type", "access_site", "allergies_note",
		"dialyser", "blood_flow", "dialysate_flow", "dialysate", "heparin", "uf_guidance", "rx_duration_hrs", "epo", "iron", "hbsag", "anti_hcv", "hiv", "phone")}
	out["screening"] = screening_state(dp, s.session_date)
	out["prev"] = frappe.get_all("Dialysis Session", filters={"dialysis_patient": s.dialysis_patient, "status": "Completed", "name": ["!=", name], "session_date": ["<=", s.session_date]},
		fields=["name", "session_date", "pre_weight", "post_weight", "pre_bp_sys", "pre_bp_dia", "post_bp_sys", "total_uf", "urr", "ktv"], order_by="session_date desc", limit=6)
	out["package"] = package_balance(dp)
	out["consumable_items"] = [{"item_code": c, "item_name": n} for c, n, _q, _u in CONSUMABLES if frappe.db.exists("Item", c)]
	return out


# ------------------------------------------------------------------ station & shift board
def board(date=None, branch=None):
	date = getdate(date or today())
	flt_st = {"status": ["!=", "Retired"]}
	if branch:
		flt_st["branch"] = ["in", [branch, None, ""]]
	stations = frappe.get_all("Dialysis Station", filters=flt_st, fields=["name", "station_no", "label", "zone", "status", "machine_serial", "out_of_service_reason"],
		order_by="sort_order, station_no")
	sess = frappe.get_all("Dialysis Session", filters={"session_date": date, "status": ["!=", "Cancelled"]}, fields=["name", "dialysis_patient", "patient_name",
		"station", "shift", "status", "payment_status", "token_no", "session_type", "zone", "alerts", "pre_weight", "weight_gain", "start_at", "ward_location", "nurse_signed_by"])
	disinf = {(r.station, r.session) for r in frappe.get_all("Dialysis Unit Log", filters={"log_type": "Disinfection", "log_at": [">=", f"{date} 00:00:00"]},
		fields=["station", "session"])}
	disinf_st = {st for st, _s in disinf}
	cells, unplaced = {}, []
	for x in sess:
		x["alerts"] = json.loads(x.alerts or "[]")
		x["screening"] = None
		if not x.station:
			unplaced.append(x)
			continue
		cells.setdefault(x.station, {})[x.shift] = x
	shifts = list(ACTIVE_SHIFTS) + (["Night"] if any(x.shift == "Night" for x in sess) else [])
	rows = []
	for st in stations:
		row = {**st, "cells": {}}
		for sh in shifts:
			c = cells.get(st.name, {}).get(sh)
			if st.status == "Out of service":
				state = "Out of service"
			elif not c:
				state = "Free"
			elif c.status == "Completed" and (st.name, c.name) not in disinf and st.name not in disinf_st:
				state = "Cleaning"
			elif c.status in ("In Session", "Checked-in"):
				state = "In session"
			elif c.status == "Completed":
				state = "Done"
			elif c.status == "Missed":
				state = "Missed"
			else:
				state = "Booked"
			row["cells"][sh] = {"state": state, "session": c}
		rows.append(row)
	counts = {k: sum(1 for x in sess if x.status == k) for k in ("Scheduled", "Checked-in", "In Session", "Completed", "Missed")}
	return {"date": str(date), "shifts": shifts, "shift_times": SHIFTS, "stations": rows, "unplaced": unplaced, "counts": counts,
		"unpaid": sum(1 for x in sess if x.payment_status == "Unpaid" and x.status == "Scheduled"),
		"swaps": frappe.get_all("Dialysis Session", filters={"swap_status": "Requested", "status": "Scheduled"}, fields=["name", "patient_name", "session_date", "shift",
			"swap_requested_date", "swap_requested_shift", "swap_reason"], order_by="session_date"),
		"requests": frappe.db.count("Dialysis Patient", {"status": "Requested"})}


def assign_station(name, station):
	require(*LEAD)
	s = _session(name)
	dp = _dp(s.dialysis_patient)
	check_station(dp, station)
	t = slot_taken(station, s.session_date, s.shift, exclude=name)
	if t:
		frappe.throw(_("Station {0} is booked for {1} in that shift.").format(station, t.patient_name))
	s.station, s.zone = station, dp.zone
	s.machine_serial = frappe.db.get_value("Dialysis Station", station, "machine_serial")
	s.alerts = json.dumps([a for a in json.loads(s.alerts or "[]") if a != "Needs station"]) or None
	s.save(ignore_permissions=True)
	return s


# ------------------------------------------------------------------ public request ("Reserve a dialysis slot")
def public_request(d):
	name = " ".join(str(d.get("patient_name") or "").split())
	phone = normalize_phone(d.get("phone") or "")
	if len(name) < 3 or not re.match(r"^\+?92?3\d{9}$|^03\d{9}$|^\+923\d{9}$", phone.replace(" ", "")) and len(phone) < 10:
		frappe.throw(_("Enter the patient's name and a mobile number."))
	rtype = d.get("request_type") if d.get("request_type") in ("New", "Regular", "Guest", "Emergency", "Transfer in") else "New"
	patient = None
	if d.get("mr"):
		patient = frappe.db.get_value("Patient", {"name": d["mr"].strip().upper()}, "name")
	dp = frappe.get_doc({"doctype": "Dialysis Patient", "status": "Requested", "request_type": rtype, "patient": patient, "patient_name": name,
		"phone": phone, "gender": d.get("gender") if d.get("gender") in ("Male", "Female", "Other") else None, "age": cint(d.get("age")) or None,
		"cnic": (d.get("cnic") or "")[:20] or None, "referring_doctor": d.get("referring_doctor") if d.get("referring_doctor") and frappe.db.exists("Doctor", d.get("referring_doctor")) else None,
		"external_referrer": (d.get("external_referrer") or "")[:140] or None, "current_hospital": (d.get("current_hospital") or "")[:140] or None,
		"pref_days": ", ".join(parse_days(d.get("pref_days") or "")) or None, "pref_shift": d.get("pref_shift") if d.get("pref_shift") in SHIFTS else None,
		"access_type": d.get("access_type") if d.get("access_type") in ("AV fistula", "AV graft", "Permanent catheter (tunnelled)", "Temporary catheter") else None,
		"request_notes": (d.get("notes") or "")[:1000], "requested_at": _now(), "branch": default_branch(), "whatsapp_opt_in": 1 if d.get("consent", 1) else 0})
	dp.flags.ignore_permissions = True
	dp.insert(ignore_permissions=True)
	if d.get("file_data"):
		import base64

		from frappe.utils.file_manager import save_file

		data = d["file_data"].split(",", 1)[-1]
		raw = base64.b64decode(data)
		if len(raw) > 5 * 1024 * 1024:
			frappe.throw(_("The file is larger than 5 MB."))
		ext = (d.get("file_name") or "report.pdf").rsplit(".", 1)[-1].lower()
		if ext not in ("pdf", "jpg", "jpeg", "png", "webp"):
			frappe.throw(_("Upload a PDF or photo."))
		f = save_file(f"viral-screening-{dp.name}.{ext}", raw, "Dialysis Patient", dp.name, is_private=1)
		frappe.db.set_value("Dialysis Patient", dp.name, "request_file", f.file_url)
	publish("dialysis", {"action": "request", "name": dp.name}, dp.branch)
	return {"ref": dp.name, "status": "Requested", "message": "The dialysis in-charge will call you to confirm a slot."}


def approve_request(name, data):
	"""In-charge approves: links / registers the MR, sets the schedule (with zone + screening rules) and sends the confirmation."""
	require(*LEAD)
	dp = _dp(name)
	if dp.status != "Requested":
		frappe.throw(_("This request is already {0}.").format(dp.status))
	if not dp.patient:
		if data.get("patient"):
			dp.patient = data["patient"]
		else:
			from hospital_vvs.services import counter as counter_svc  # noqa: F401  (registration lives in the patient API)
			p = frappe.get_doc({"doctype": "Patient", "patient_name": dp.patient_name, "phone": dp.phone, "gender": dp.gender or "Other",
				"dob": add_days(today(), -365 * cint(dp.age)) if dp.age else None, "cnic": dp.cnic})
			p.flags.ignore_mandatory = True
			p.insert(ignore_permissions=True)
			dp.patient = p.name
	for k in ("nephrologist", "dry_weight", "diagnosis", "ckd_stage", "ckd_cause"):
		if data.get(k):
			dp.set(k, data[k])
	dp.status, dp.approved_by, dp.approved_at = "Active", frappe.session.user, _now()
	dp.dialysis_start = dp.dialysis_start or today()
	refresh_viral(dp)
	dp.save(ignore_permissions=True)
	audit(dp, "Request approved")
	out = {"profile": dp.as_dict(), "generated": 0}
	if data.get("sched_days") and data.get("sched_shift") and data.get("station"):
		out = set_schedule(dp.name, data["sched_days"], data["sched_shift"], data["station"], data.get("schedule_from"))
	elif data.get("first_date") and data.get("first_shift"):
		extra_session(dp.name, data["first_date"], data["first_shift"], data.get("station"), "Guest" if dp.request_type == "Guest" else ("Emergency" if dp.request_type == "Emergency" else "Extra"))
	dp.reload()
	nxt = next_session(dp.name, add_days(today(), -1))
	if dp.phone and nxt:
		messaging.send("dialysis_confirmed", phone=dp.phone, patient=dp.patient, consent=bool(dp.whatsapp_opt_in), reference_doctype="Dialysis Patient", reference_name=dp.name,
			context={"first_name": (dp.patient_name or "").split()[0], "days": dp.sched_days or frappe.utils.formatdate(nxt.session_date, "EEE dd MMM"), "shift": nxt.shift,
				"time": SHIFTS[nxt.shift][0], "station": nxt.station or "—", "link": frappe.utils.get_url(PORTAL_PATH)})
	return out


def reject_request(name, reason):
	require(*LEAD)
	dp = _dp(name)
	dp.status, dp.reject_reason = "Rejected", reason
	dp.save(ignore_permissions=True)
	audit(dp, "Request rejected", reason)
	return dp


# ------------------------------------------------------------------ lab trends (Lab module)
def ckd_epi(creat, age, gender):
	"""CKD-EPI 2021 (race-free) eGFR from serum creatinine mg/dL — used when the lab did not report eGFR."""
	if not (creat and age and gender in ("Male", "Female")):
		return None
	k, a = (0.7, -0.241) if gender == "Female" else (0.9, -0.302)
	e = 142 * min(creat / k, 1) ** a * max(creat / k, 1) ** -1.2 * 0.9938 ** age * (1.012 if gender == "Female" else 1)
	return round(e, 1)


def lab_trends(patient, months=12):
	if not patient:
		return {"series": {}, "keys": LAB_KEYS_OUT()}
	since = add_days(today(), -31 * months)
	rows = frappe.db.sql("""select r.name, r.template, coalesce(r.verified_at, r.entered_at, r.creation) at, v.parameter, v.value, v.unit, v.flag, v.normal_low, v.normal_high
		from `tabLab Result` r join `tabLab Result Value` v on v.parent=r.name and v.parenttype='Lab Result'
		where r.patient=%s and r.status in ('Verified','Result Entered') and coalesce(r.verified_at, r.entered_at, r.creation) >= %s order by at""", (patient, since), as_dict=True)
	series = {k: [] for k, _l, _p in LAB_KEYS}
	for r in rows:
		pname = (r.parameter or "").lower()
		for k, _l, pat in LAB_KEYS:
			if re.search(pat, pname) and "post" not in pname:
				try:
					val = float(re.sub(r"[^0-9.\-]", "", str(r.value)))
				except ValueError:
					break
				series[k].append({"d": str(r.at)[:10], "v": val, "unit": r.unit, "flag": r.flag, "lo": r.normal_low, "hi": r.normal_high, "result": r.name})
				break
	if not series["egfr"] and series["creatinine"]:
		p = frappe.db.get_value("Patient", patient, ["dob", "gender"], as_dict=True) or {}
		series["egfr"] = [{"d": x["d"], "v": ckd_epi(x["v"], _age(p.get("dob")) or 50, p.get("gender")), "unit": "mL/min/1.73m²", "flag": "calc", "lo": 60, "hi": None}
			for x in series["creatinine"] if ckd_epi(x["v"], _age(p.get("dob")) or 50, p.get("gender"))]
	return {"series": series, "keys": LAB_KEYS_OUT()}


def LAB_KEYS_OUT():  # noqa: N802
	return [{"key": k, "label": lbl} for k, lbl, _p in LAB_KEYS]


def order_monthly_labs(name):
	"""Monthly panel through the Lab module (ordered like any lab test; billed at the counter)."""
	require(*LEAD, R.DIALYSIS_NURSE)
	dp = _dp(name)
	if not dp.patient:
		frappe.throw(_("Link the patient's MR first."))
	from hospital_vvs.services import lab

	tests = [t for t in ("Dialysis Monthly Panel",) if frappe.db.exists("Lab Test Template", t)]
	if screening_state(dp)["state"] != "ok" and frappe.db.exists("Lab Test Template", "Viral Screening (HBsAg, Anti-HCV, HIV)"):
		tests.append("Viral Screening (HBsAg, Anti-HCV, HIV)")
	ti = lab.create_order(dp.patient, tests, dp.branch or default_branch(), referring_doctor=dp.nephrologist)
	audit(dp, "Monthly labs ordered", getattr(ti, "name", ti))
	return {"order": getattr(ti, "name", ti), "tests": tests}


# ------------------------------------------------------------------ monthly review
def month_stats(dp, month):
	m0 = getdate(month).replace(day=1)
	m1 = add_days(m0.replace(month=m0.month % 12 + 1, year=m0.year + (m0.month == 12)), -1)
	ss = frappe.get_all("Dialysis Session", filters={"dialysis_patient": dp.name, "session_date": ["between", [m0, m1]], "status": ["in", ["Completed", "Missed"]]},
		fields=["name", "session_date", "status", "pre_weight", "post_weight", "weight_gain", "pre_bp_sys", "pre_bp_dia", "post_bp_sys", "post_bp_dia", "total_uf", "urr", "ktv",
			"session_type", "shift", "station"], order_by="session_date")
	done = [s for s in ss if s.status == "Completed"]
	wg = [flt(s.weight_gain) for s in done if s.weight_gain is not None]
	adq = [s for s in done if s.urr]
	meds = frappe.db.sql("""select m.medicine, m.dose, count(*) n from `tabDialysis Session Medicine` m join `tabDialysis Session` s on s.name=m.parent
		where s.dialysis_patient=%s and s.session_date between %s and %s group by m.medicine, m.dose""", (dp.name, m0, m1), as_dict=True)
	comps = frappe.db.sql("""select c.complication, count(*) n from `tabDialysis Complication` c join `tabDialysis Session` s on s.name=c.parent
		where s.dialysis_patient=%s and s.session_date between %s and %s group by c.complication""", (dp.name, m0, m1), as_dict=True)
	tr = lab_trends(dp.patient, 3)["series"]
	labs = {k: next((x for x in reversed(v) if getdate(x["d"]) <= m1), None) for k, v in tr.items()}
	return {"from": str(m0), "to": str(m1), "sessions": ss, "done": len(done), "missed": len(ss) - len(done), "avg_weight_gain": round(sum(wg) / len(wg), 2) if wg else None,
		"urr": adq[-1].urr if adq else None, "ktv": adq[-1].ktv if adq else None, "labs": labs, "medicines": meds, "complications": comps,
		"hb": (labs.get("hb") or {}).get("v")}


def create_review(name, month=None):
	require(*LEAD)
	dp = _dp(name)
	month = getdate(month or today()).replace(day=1)
	ex = frappe.db.get_value("Dialysis Monthly Review", {"dialysis_patient": name, "month": month}, "name")
	st = month_stats(dp, month)
	doc = frappe.get_doc("Dialysis Monthly Review", ex) if ex else frappe.new_doc("Dialysis Monthly Review")
	if doc.status == "Signed":
		return doc
	doc.update({"dialysis_patient": name, "patient": dp.patient, "patient_name": dp.patient_name, "month": month, "nephrologist": dp.nephrologist,
		"sessions_done": st["done"], "sessions_missed": st["missed"], "avg_weight_gain": st["avg_weight_gain"], "urr": st["urr"], "ktv": st["ktv"], "hb": st["hb"],
		"labs_json": json.dumps(st["labs"], default=str)})
	doc.save(ignore_permissions=True)
	return doc


def sign_review(name, review_note, rx_changes=None):
	require(R.NEPHROLOGIST)
	doc = frappe.get_doc("Dialysis Monthly Review", name)
	doc.review_note, doc.rx_changes = review_note, rx_changes
	doc.status, doc.signed_by, doc.signed_at = "Signed", frappe.session.user, _now()
	doc.signature_hash = doc_sig("monthly", doc.name)
	doc.save(ignore_permissions=True)
	audit(_dp(doc.dialysis_patient), "Monthly review signed", doc.name)
	return doc


# ------------------------------------------------------------------ unit: machines, water, stock
def add_log(data):
	require(*STAFF)
	lt = data.get("log_type")
	if lt not in ("Disinfection", "Water daily check", "Water culture", "Water chemical", "Machine service", "Breakdown", "Back in service"):
		frappe.throw(_("Choose the log type."))
	doc = frappe.get_doc({"doctype": "Dialysis Unit Log", "log_type": lt, "log_at": data.get("log_at") or _now(), "station": data.get("station"), "session": data.get("session"),
		"method": data.get("method"), "result": data.get("result") or ("Pass" if lt in ("Disinfection", "Machine service", "Back in service") else None),
		"readings": data.get("readings"), "notes": data.get("notes"), "recorded_by": frappe.session.user, "branch": data.get("branch") or default_branch()})
	doc.insert(ignore_permissions=True)
	if data.get("station") and lt == "Breakdown":
		frappe.db.set_value("Dialysis Station", data["station"], {"status": "Out of service", "out_of_service_reason": data.get("notes") or "Breakdown"})
	if data.get("station") and lt == "Back in service":
		frappe.db.set_value("Dialysis Station", data["station"], {"status": "Active", "out_of_service_reason": None})
	if data.get("station") and lt == "Machine service":
		frappe.db.set_value("Dialysis Station", data["station"], {"last_service": getdate(doc.log_at), "next_service": add_days(getdate(doc.log_at), 90)})
	publish("dialysis", {"action": "log", "name": doc.name}, doc.branch)
	return doc


def unit(branch=None):
	stations = frappe.get_all("Dialysis Station", fields=["name", "station_no", "zone", "status", "machine_serial", "machine_model", "machine_installed", "last_service",
		"next_service", "out_of_service_reason"], order_by="sort_order, station_no")
	logs = frappe.get_all("Dialysis Unit Log", fields=["name", "log_type", "log_at", "station", "session", "method", "result", "readings", "notes", "recorded_by"],
		order_by="log_at desc", limit=200)
	last_water = {lt: next((x for x in logs if x.log_type == lt), None) for lt in ("Water daily check", "Water culture", "Water chemical")}
	wh = warehouse(branch)
	stock = []
	for code, nm, per, _u in CONSUMABLES:
		if not frappe.db.exists("Item", code):
			continue
		qty = flt(frappe.db.get_value("Bin", {"item_code": code, "warehouse": wh}, "actual_qty")) if wh else 0
		used30 = flt(frappe.db.sql("""select sum(c.qty) from `tabDialysis Consumable Use` c join `tabDialysis Session` s on s.name=c.parent
			where c.item_code=%s and s.session_date >= %s""", (code, add_days(today(), -30)))[0][0])
		stock.append({"item_code": code, "item_name": nm, "qty": qty, "per_session": per, "used_30d": used30, "low": qty < LOW_STOCK,
			"days_left": round(qty / (used30 / 30), 1) if used30 else None})
	today_sessions = frappe.get_all("Dialysis Session", filters={"session_date": today(), "status": "Completed"}, fields=["name", "station", "patient_name", "shift"])
	done_dis = {r.session for r in logs if r.log_type == "Disinfection" and r.session}
	return {"stations": stations, "logs": logs, "water": last_water, "stock": stock, "warehouse": wh,
		"pending_disinfection": [s for s in today_sessions if s.name not in done_dis]}


# ------------------------------------------------------------------ reports
def report(from_date=None, to_date=None, branch=None):
	f, t = getdate(from_date or add_days(today(), -29)), getdate(to_date or today())
	ss = frappe.get_all("Dialysis Session", filters={"session_date": ["between", [f, t]], "status": ["!=", "Cancelled"]}, fields=["name", "session_date", "shift", "station",
		"status", "payment_status", "amount", "session_type", "dialysis_patient", "patient_name", "counter_receipt", "urr", "ktv"])
	by_day, by_shift, by_station, pay = {}, {}, {}, {}
	for s in ss:
		if s.status == "Completed":
			by_day[str(s.session_date)] = by_day.get(str(s.session_date), 0) + 1
			by_shift[s.shift] = by_shift.get(s.shift, 0) + 1
			by_station[s.station or "ICU / no station"] = by_station.get(s.station or "ICU / no station", 0) + 1
			pay[s.payment_status] = pay.get(s.payment_status, 0) + 1
	lines = frappe.db.sql("""select l.kind, l.label, l.amount, l.refunded, r.posted_at from `tabCounter Receipt Line` l join `tabCounter Receipt` r on r.name=l.parent
		where l.kind in ('Dialysis','Dialysis Package') and date(r.posted_at) between %s and %s""", (f, t), as_dict=True)
	rev = {"sessions": sum(flt(x.amount) for x in lines if x.kind == "Dialysis" and not x.refunded),
		"packages": sum(flt(x.amount) for x in lines if x.kind == "Dialysis Package" and not x.refunded)}
	pk = frappe.db.sql("""select p.package_name, count(*) n, sum(p.sessions) sessions, sum(p.used) used from `tabDialysis Package Purchase` p
		where p.purchased_on between %s and %s group by p.package_name""", (add_days(f, -PACKAGE_VALID_DAYS), t), as_dict=True)
	panel = [s for s in ss if s.payment_status == "Panel credit" and s.status == "Completed"]
	dues = [s for s in ss if s.payment_status in ("Unpaid", "Allowed unpaid") and s.status == "Completed"]
	missed = [s for s in ss if s.status == "Missed"]
	adq = [s for s in ss if s.urr]
	return {"from": str(f), "to": str(t), "completed": sum(by_day.values()), "missed": len(missed), "by_day": [{"d": k, "value": v} for k, v in sorted(by_day.items())],
		"by_shift": [{"label": k, "value": by_shift.get(k, 0)} for k in SHIFTS if by_shift.get(k)], "by_station": [{"label": k, "value": v} for k, v in sorted(by_station.items())],
		"payment": [{"label": k, "value": v} for k, v in pay.items()], "revenue": rev, "packages": pk,
		"panel": [{"session": s.name, "date": str(s.session_date), "patient": s.patient_name, "amount": flt(s.amount)} for s in panel],
		"dues": [{"session": s.name, "date": str(s.session_date), "patient": s.patient_name, "amount": flt(s.amount), "status": s.payment_status} for s in dues],
		"adequacy": {"n": len(adq), "urr_ok": sum(1 for s in adq if flt(s.urr) >= URR_TARGET), "ktv_ok": sum(1 for s in adq if flt(s.ktv) >= KTV_TARGET)},
		"patients": frappe.db.count("Dialysis Patient", {"status": "Active"})}


# ------------------------------------------------------------------ public facts
def public_facts():
	st = frappe.get_all("Dialysis Station", filters={"status": ["!=", "Retired"]}, fields=["zone"])
	month = frappe.db.count("Dialysis Session", {"status": "Completed", "session_date": [">=", add_days(today(), -30)]})
	docs = frappe.get_all("Doctor", filters={"is_active": 1, "department": "Nephrology & Dialysis"}, pluck="name")
	return {"stations": len(st), "isolation": sum(1 for s in st if s.zone != "Negative"), "sessions_month": month, "shifts": len(ACTIVE_SHIFTS),
		"nephrologists": len(docs), "shift_times": {k: SHIFTS[k] for k in ACTIVE_SHIFTS}, "prices": {c: session_rate_item(c) for c, _n, _r in ITEMS}}


def session_rate_item(code):
	return flt(frappe.db.get_value("Item Price", {"item_code": code, "selling": 1}, "price_list_rate")) or flt(dict((c, r) for c, _n, r in ITEMS).get(code))


# ------------------------------------------------------------------ signatures / verification
def doc_sig(kind, name):
	key = (frappe.local.conf.get("encryption_key") or frappe.local.site).encode()
	return hmac.new(key, f"dialysis:{kind}:{name}".encode(), hashlib.sha256).hexdigest()[:20]


def verify_url(kind, name):
	return frappe.utils.get_url(f"{PORTAL_PATH}/verify/{kind}/{name}/{doc_sig(kind, name)}")


def public_check(kind, name, sig):
	ok = hmac.compare_digest(str(sig), doc_sig(kind, name))
	doctype = {"session": "Dialysis Session", "monthly": "Dialysis Monthly Review", "card": "Dialysis Patient", "transfer": "Dialysis Patient", "consent": "Consent Form", "ckd": "Patient"}.get(kind)
	if not ok or not doctype or not frappe.db.exists(doctype, name):
		return {"valid": False}
	pn = frappe.db.get_value(doctype, name, "patient_name") or ""
	s = frappe.get_cached_doc("Clinic Settings")
	return {"valid": True, "document": KIND_TITLES.get(kind, ("Document",))[0], "reference": name, "patient": " ".join(w[0] + "." for w in pn.split()[:3]),
		"clinic": s.clinic_name, "phone": s.phone}


KIND_TITLES = {"session": ("Dialysis Session Sheet", "ڈائیلاسز سیشن شیٹ"), "monthly": ("Monthly Dialysis Summary", "ماہانہ ڈائیلاسز خلاصہ"),
	"card": ("Dialysis Schedule Card", "ڈائیلاسز شیڈول کارڈ"), "transfer": ("Transfer / Guest Dialysis Letter", "منتقلی / مہمان ڈائیلاسز خط"),
	"consent_hd": ("Haemodialysis Consent", "ہیموڈائیلاسز رضامندی"), "consent_cath": ("Catheter Insertion Consent", "کیتھیٹر لگانے کی رضامندی"),
	"ckd": ("CKD Follow-up Summary", "گردوں کی بیماری فالو اپ خلاصہ")}


# ------------------------------------------------------------------ patient portal ("My Dialysis")
def _portal_find(ident, phone):
	ident = (ident or "").strip().upper()
	p10 = normalize_phone(phone)[-10:]
	if not ident or len(p10) < 10:
		return None
	rows = frappe.get_all("Dialysis Patient", filters={"status": ["in", ["Active", "Paused", "Requested"]]}, or_filters={"name": ident, "patient": ident},
		fields=["name", "patient", "phone"])
	for r in rows:
		ph = normalize_phone(r.phone or frappe.db.get_value("Patient", r.patient, "phone") or "")[-10:]
		if ph and ph == p10:
			return r
	return None


def portal_request(ident, phone):
	r = _portal_find(ident, phone)
	if not r:
		frappe.throw(_("We could not find a dialysis patient with that MR / dialysis number and mobile number."))
	code = f"{random.SystemRandom().randint(0, 999999):06d}"
	key = f"hv_dia_otp:{normalize_phone(phone)}:{(ident or '').strip().upper()}"
	frappe.cache.set_value(key, {"code": code, "tries": 0}, expires_in_sec=300)
	messaging.send("otp_code", phone=normalize_phone(phone), patient=r.patient, consent=True, context={"code": code})
	out = {"sent": True, "masked": normalize_phone(phone)[:-7] + "•••" + normalize_phone(phone)[-4:]}
	if messaging.settings().message_mode != "Live" and cint(frappe.conf.developer_mode):
		out["test_code"] = code
	return out


def portal_verify(ident, phone, code):
	key = f"hv_dia_otp:{normalize_phone(phone)}:{(ident or '').strip().upper()}"
	data = frappe.cache.get_value(key)
	if not data:
		frappe.throw(_("The code has expired. Ask for a new one."))
	if data["tries"] >= 5:
		frappe.throw(_("Too many attempts. Ask for a new code."))
	if str(code).strip() != data["code"]:
		data["tries"] += 1
		frappe.cache.set_value(key, data, expires_in_sec=300)
		frappe.throw(_("Wrong code."))
	frappe.cache.delete_value(key)
	r = _portal_find(ident, phone)
	session = secrets.token_urlsafe(24)
	frappe.cache.set_value(f"hv_dia_portal:{session}", {"dp": r.name}, expires_in_sec=1800)
	return {"session": session}


def portal_dp(session):
	data = frappe.cache.get_value(f"hv_dia_portal:{session}") if session else None
	if not data:
		frappe.throw(_("Your session has expired. Sign in again."), frappe.AuthenticationError)
	frappe.cache.set_value(f"hv_dia_portal:{session}", data, expires_in_sec=1800)
	return _dp(data["dp"])


def portal_home(session):
	dp = portal_dp(session)
	up = frappe.get_all("Dialysis Session", filters={"dialysis_patient": dp.name, "session_date": [">=", today()], "status": ["in", ["Scheduled", "Checked-in", "In Session"]]},
		fields=["name", "session_date", "shift", "station", "status", "payment_status", "swap_status", "swap_requested_date", "swap_requested_shift"], order_by="session_date", limit=12)
	hist = frappe.get_all("Dialysis Session", filters={"dialysis_patient": dp.name, "status": ["in", ["Completed", "Missed"]]}, fields=["name", "session_date", "shift", "status",
		"pre_weight", "post_weight", "weight_gain", "pre_bp_sys", "pre_bp_dia", "post_bp_sys", "post_bp_dia", "total_uf", "urr", "ktv"], order_by="session_date desc", limit=30)
	receipts = frappe.db.sql("""select r.name, r.posted_at, r.patient_total, group_concat(l.label separator ', ') items from `tabCounter Receipt` r
		join `tabCounter Receipt Line` l on l.parent=r.name where r.patient=%s and l.kind in ('Dialysis','Dialysis Package') group by r.name order by r.posted_at desc limit 20""",
		(dp.patient,), as_dict=True) if dp.patient else []
	reviews = frappe.get_all("Dialysis Monthly Review", filters={"dialysis_patient": dp.name}, fields=["name", "month", "status"], order_by="month desc", limit=12)
	tr = lab_trends(dp.patient, 12)
	s = frappe.get_cached_doc("Clinic Settings")
	return {"profile": {"name": dp.name, "patient_name": dp.patient_name, "mr": dp.patient, "days": dp.sched_days, "shift": dp.sched_shift, "station": dp.station,
		"shift_time": SHIFTS.get(dp.sched_shift or "", ("", "")), "dry_weight": dp.dry_weight, "zone_isolated": dp.zone != "Negative", "status": dp.status,
		"screening": screening_state(dp)}, "upcoming": up, "history": hist, "receipts": receipts, "package": package_balance(dp), "reviews": reviews,
		"labs": {k: v for k, v in tr["series"].items() if k in ("hb", "potassium", "phosphate", "albumin", "creatinine", "urea")}, "keys": tr["keys"],
		"unit_phone": s.phone, "shifts": {k: SHIFTS[k] for k in ACTIVE_SHIFTS}}


def portal_swap(session, name, date, shift, reason):
	dp = portal_dp(session)
	s = frappe.get_doc("Dialysis Session", name)
	if s.dialysis_patient != dp.name or s.status != "Scheduled":
		frappe.throw(_("This session cannot be changed."))
	if getdate(date) < getdate(today()) or shift not in ACTIVE_SHIFTS:
		frappe.throw(_("Choose a future date and a shift."))
	if len((reason or "").strip()) < 3:
		frappe.throw(_("Tell us the reason."))
	s.swap_requested_date, s.swap_requested_shift, s.swap_reason, s.swap_status = getdate(date), shift, reason.strip()[:300], "Requested"
	s.save(ignore_permissions=True)
	audit(dp, "Swap requested (portal)", f"{s.session_date} {s.shift} → {date} {shift}: {reason}")
	publish("dialysis", {"action": "swap", "name": s.name}, s.branch)
	return {"ok": True}


# ------------------------------------------------------------------ reminders (daily cron)
def daily():
	"""Extend schedules, mark yesterday's no-shows as missed, send reminders (session tomorrow, labs due, screening due)."""
	for name in frappe.get_all("Dialysis Patient", filters={"status": "Active", "schedule_active": 1}, pluck="name"):
		try:
			generate(_dp(name))
		except Exception:
			frappe.log_error(title=f"Dialysis schedule {name}")
	for s in frappe.get_all("Dialysis Session", filters={"session_date": ["<", today()], "status": "Scheduled"}, pluck="name"):
		frappe.db.set_value("Dialysis Session", s, {"status": "Missed", "missed_reason": "Did not attend (auto)"})
	tomorrow = add_days(today(), 1)
	for s in frappe.get_all("Dialysis Session", filters={"session_date": tomorrow, "status": "Scheduled"}, fields=["name", "dialysis_patient", "shift", "station"]):
		dp = _dp(s.dialysis_patient)
		if dp.phone and dp.whatsapp_opt_in:
			messaging.send("dialysis_reminder", phone=dp.phone, patient=dp.patient, consent=True, reference_doctype="Dialysis Session", reference_name=s.name,
				context={"first_name": (dp.patient_name or "").split()[0], "shift": s.shift, "time": SHIFTS[s.shift][0], "station": s.station or "—"})
	for name in frappe.get_all("Dialysis Patient", filters={"status": "Active"}, pluck="name"):
		dp = _dp(name)
		sc = screening_state(dp)
		if dp.phone and dp.whatsapp_opt_in and sc["state"] == "due" and sc.get("due") == str(add_days(today(), SCREEN_DUE_SOON_DAYS)):
			messaging.send("dialysis_labs_due", phone=dp.phone, patient=dp.patient, consent=True, reference_doctype="Dialysis Patient", reference_name=name,
				context={"first_name": (dp.patient_name or "").split()[0], "what": "viral screening (HBsAg, Anti-HCV, HIV)", "due": frappe.utils.formatdate(sc["due"], "dd MMM")})
	frappe.db.commit()
