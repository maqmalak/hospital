"""Nursery & Newborn Care (D-95): baby registration against the mother's MR, cots (Hospital Beds in Rooming-in / Nursery / NICU wards,
admitted through IPD so cot charges reach the existing IPD bill), charting with alerts, infant security, discharge checklist, signed
papers (discharge summary, birth record slip, EPI card, NICU daily progress) and the parents' "My Baby" portal.

Clinical thresholds, the EPI schedule and prices are PLACEHOLDERS [confirm with LMC's paediatric team].
Chart entries are append-only: a wrong entry is struck through with a reason (cancelled + cancel_reason), never edited or deleted.
"""

import hashlib
import hmac
import random
import secrets

import frappe
from frappe import _
from frappe.utils import add_days, add_to_date, cint, escape_html as esc, flt, get_datetime, getdate, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.hospital_vvs.doctype.patient.patient import normalize_phone
from hospital_vvs.services import messaging
from hospital_vvs.utils import default_branch, has_any_role, log_access, publish

CLINICAL = (R.NURSERY_NURSE, R.NICU_NURSE, R.NEONATOLOGIST)
STAFF = (*CLINICAL, R.WARD_ADMIN)
UNIT_WARD_TYPE = {"Rooming-in": "Maternity", "Nursery": "Nursery", "NICU": "NICU"}
ROOMING_WARD = "Rooming-in Cradles"  # cradles beside the mother's bed (Maternity type), see setup/nursery.py

# [confirm] Alert limits for a term newborn; NICU uses the SpO2 target below.
LIMITS = {"temp_c": (36.5, 37.5, "Temperature"), "hr": (100, 180, "Heart rate"), "rr": (30, 60, "Respiratory rate")}
SPO2_MIN = {"NICU": 90, "default": 95}
FEED_GAP_HOURS = 3.5
WEIGHT_LOSS_ALERT = 10  # % below birth weight

# [verify against current EPI Punjab schedule] (age in days, vaccine)
EPI = [(0, "BCG"), (0, "OPV-0"), (0, "Hepatitis B (birth dose)"), (42, "OPV-1"), (42, "Pentavalent-1"), (42, "PCV-1"), (42, "Rotavirus-1"), (42, "IPV-1"),
	(70, "OPV-2"), (70, "Pentavalent-2"), (70, "PCV-2"), (70, "Rotavirus-2"), (98, "OPV-3"), (98, "Pentavalent-3"), (98, "PCV-3"), (98, "IPV-2"),
	(270, "Measles-Rubella 1"), (270, "Typhoid conjugate (TCV)"), (450, "Measles-Rubella 2")]
BIRTH_VACCINES = [v for d, v in EPI if d == 0]
SCREENINGS = ["Hearing (OAE)", "CCHD pulse oximetry"]
VISITING = {"Rooming-in": "11:00-13:00 and 17:00-19:00, two visitors at a time", "Nursery": "Parents any time; others 11:00-13:00 and 17:00-19:00",
	"NICU": "Parents 24/7 · grandparents 12:00-12:30 and 18:00-18:30 by arrangement"}


# ------------------------------------------------------------------ helpers
def _now():
	return now_datetime()


def _last(doctype, filters, field):
	"""Latest value of a datetime field (Frappe v16 rejects "max(x)" strings in get_value)."""
	r = frappe.get_all(doctype, filters=filters, fields=[field], order_by=f"{field} desc", limit=1)
	return r[0][field] if r else None


def age_hours(nb, at=None):
	return round((get_datetime(at or _now()) - get_datetime(nb.birth_datetime)).total_seconds() / 3600, 1)


def require_staff(write=True):
	from hospital_vvs.utils import require_roles

	require_roles(*(STAFF if write else (*STAFF, R.SECURITY)))


def phototherapy_threshold(hours, gestation_weeks=40):
	"""Rough phototherapy line in mg/dL by age in hours [PLACEHOLDER — the paediatric team must replace with their nomogram]."""
	base = 5 + min(max(hours, 0), 96) * 0.1  # ~5 at birth → ~14.6 at 4 days
	if (gestation_weeks or 40) < 37:
		base -= 3
	return round(min(base, 15 if (gestation_weeks or 40) >= 37 else 12), 1)


def _band():
	d = _now().strftime("%y%m%d")
	for _i in range(30):
		b = f"LMC-B{d}-{random.SystemRandom().randint(100, 999)}"
		if not frappe.db.exists("Newborn", {"band_no": b}):
			return b
	frappe.throw(_("Could not create an ID band number."))


def ward_for(unit, branch=None):
	wtype = UNIT_WARD_TYPE[unit]
	filters = {"ward_type": wtype, "is_active": 1}
	if unit == "Rooming-in":
		filters = {"name": ROOMING_WARD}
	return frappe.get_all("Ward", filters=filters, pluck="name")


def free_cot(unit, branch=None):
	wards = ward_for(unit, branch)
	return frappe.db.get_value("Hospital Bed", {"ward": ["in", wards or [""]], "status": "Available", "is_active": 1}, "name", order_by="bed_no")


# ------------------------------------------------------------------ registration (twins / triplets)
def register(d):
	"""One call registers 1-3 babies of the same delivery against the mother's MR. Each baby gets its own MR (Patient), ID band,
	security tag and a cot admission (IPD) in the chosen unit, so cot charges flow into the existing IPD billing."""
	mother = d.get("mother")
	m = frappe.db.get_value("Patient", mother, ["patient_name", "phone", "branch", "gender", "household"], as_dict=True) if mother else None
	if not m:
		frappe.throw(_("Find the mother's MR record first."))
	if m.gender == "Male":
		frappe.throw(_("{0} is registered as male — check the mother's MR.").format(m.patient_name))
	babies = d.get("babies") or []
	if not 1 <= len(babies) <= 3:
		frappe.throw(_("Register one, two (twins) or three (triplets) babies."))
	kind = {1: "Single", 2: "Twin", 3: "Triplet"}[len(babies)]
	group = frappe.generate_hash(length=8) if len(babies) > 1 else None
	branch = d.get("branch") or m.branch or default_branch()
	unit = d.get("unit") if d.get("unit") in UNIT_WARD_TYPE else "Rooming-in"
	mother_adm = frappe.db.get_value("Bed Allotment", {"patient": mother, "status": ["in", ["Admitted", "Discharge Pending"]]}, "name")
	made = []
	from hospital_vvs.services import ipd

	for i, b in enumerate(babies):
		letter = "ABC"[i] if len(babies) > 1 else ""
		label = f"Baby {letter} of {m.patient_name}".replace("Baby  of", "Baby of") if letter else f"Baby of {m.patient_name}"
		name = (b.get("baby_name") or "").strip() or label
		bdt = get_datetime(b.get("birth_datetime") or d.get("birth_datetime") or _now())
		pat = frappe.get_doc({"doctype": "Patient", "patient_name": name, "gender": {"Male": "Male", "Female": "Female"}.get(b.get("sex"), "Other"), "dob": bdt.date(),
			"phone": m.phone, "branch": branch, "guardian_name": m.patient_name, "relation_type": "C/O",
			"household": m.household, "duplicate_reason": _("Newborn of {0} ({1})").format(m.patient_name, mother)})
		pat.flags.ignore_mandatory = True
		pat.insert(ignore_permissions=True)
		nb = frappe.get_doc({
			"doctype": "Newborn", "status": "Stable" if unit != "NICU" else "Observation", "unit": unit, "branch": branch, "baby_patient": pat.name, "baby_name": name,
			"named": 1 if (b.get("baby_name") or "").strip() else 0, "sex": b.get("sex") or "Indeterminate", "blood_group": b.get("blood_group") or "Pending",
			"mother": mother, "mother_name": m.patient_name, "mother_phone": normalize_phone(d.get("mother_phone") or m.phone or ""), "father_name": d.get("father_name"),
			"mother_admission": mother_adm, "birth_datetime": bdt, "delivery_type": d.get("delivery_type") or "Normal vaginal", "place_of_birth": d.get("place_of_birth") or "This hospital",
			"multiple_birth": kind, "birth_order": i + 1, "multiple_group": group, "gestation_weeks": cint(d.get("gestation_weeks")) or None, "gestation_days": cint(d.get("gestation_days")),
			"birth_weight_g": cint(b.get("birth_weight_g")), "length_cm": flt(b.get("length_cm")) or None, "head_circ_cm": flt(b.get("head_circ_cm")) or None,
			"apgar_1": b.get("apgar_1"), "apgar_5": b.get("apgar_5"), "attending_doctor": d.get("attending_doctor"), "obstetrician": d.get("obstetrician"),
			"nicu_reason": b.get("nicu_reason") if unit == "NICU" else None, "band_no": _band(), "tag_no": (b.get("tag_no") or "").strip() or f"TAG-{random.SystemRandom().randint(1000, 9999)}",
			"tag_active": 1, "current_weight_g": cint(b.get("birth_weight_g")), "portal_photo_consent": cint(d.get("photo_consent")),
		})
		if not nb.birth_weight_g:
			frappe.throw(_("Enter the birth weight of baby {0}.").format(i + 1))
		nb.insert(ignore_permissions=True)
		cot = b.get("cot") or free_cot(unit, branch)
		if cot:
			doctor = d.get("attending_doctor") or frappe.db.get_value("Doctor", {"department": "Paediatrics", "is_active": 1}, "name")
			adm = ipd.admit(pat.name, cot, doctor, reason=_("Newborn care — {0}").format(unit), diagnosis=nb.nicu_reason or _("Healthy newborn"), source="Direct",
				admit_at=bdt if bdt < _now() else None)
			adm_name = adm[0].name  # ipd.admit → (Bed Allotment, comms token)
			nb.db_set({"cot": cot, "admission": adm_name})
		security_event(nb.name, "Tag applied", tag_no=nb.tag_no, note=_("At registration"), band_match=1)
		_entry(nb, "Weight", {"weight_g": nb.birth_weight_g, "note": _("Birth weight")}, at=bdt)
		made.append(nb.name)
	publish("nursery", {"action": "registered", "names": made}, branch)
	return made


# ------------------------------------------------------------------ charting
def _flags(nb, e):
	f = []
	if e.get("entry_type") == "Vitals":
		for k, (lo, hi, label) in LIMITS.items():
			v = e.get(k)
			if v not in (None, "") and (flt(v) < lo or flt(v) > hi):
				f.append(f"{label} {v} (expected {lo}-{hi})")
		if e.get("spo2") not in (None, "") and cint(e["spo2"]) < SPO2_MIN.get(nb.unit, SPO2_MIN["default"]):
			f.append(f"SpO2 {e['spo2']}% (target ≥ {SPO2_MIN.get(nb.unit, SPO2_MIN['default'])}%)")
	if e.get("entry_type") == "Weight" and e.get("weight_g") and nb.birth_weight_g:
		loss = (nb.birth_weight_g - cint(e["weight_g"])) / nb.birth_weight_g * 100
		if loss > WEIGHT_LOSS_ALERT:
			f.append(f"Weight {loss:.1f}% below birth weight")
	if e.get("entry_type") == "Bilirubin" and e.get("bilirubin"):
		th = phototherapy_threshold(age_hours(nb, e.get("recorded_at")), nb.gestation_weeks)
		if flt(e["bilirubin"]) >= th:
			f.append(f"Bilirubin {e['bilirubin']} ≥ phototherapy line {th} mg/dL")
	if e.get("entry_type") == "Screening" and e.get("result") in ("Refer", "Abnormal"):
		f.append(f"{e.get('screening')}: {e.get('result')}")
	return f


ENTRY_FIELDS = ("temp_c", "hr", "rr", "spo2", "feed_type", "feed_ml", "feed_min", "urine", "stool", "weight_g", "bilirubin", "bili_method", "photo_on", "item", "dose", "route",
	"batch_no", "screening", "result", "resp_support", "fio2", "peep", "pip", "vent_rate", "iv_fluid", "iv_rate", "incubator_temp", "note", "share_with_parents")


def _entry(nb, entry_type, data, at=None):
	e = {"doctype": "Newborn Chart Entry", "newborn": nb.name, "entry_type": entry_type, "recorded_at": get_datetime(at or data.get("recorded_at") or _now()),
		"recorded_by": frappe.session.user, **{k: data.get(k) for k in ENTRY_FIELDS if data.get(k) not in (None, "")}}
	e["age_hours"] = age_hours(nb, e["recorded_at"])
	fl = _flags(nb, e)
	e["alert_flags"] = "\n".join(fl) or None
	doc = frappe.get_doc(e).insert(ignore_permissions=True)
	# keep the "current" summary on the baby in step
	upd = {}
	if entry_type == "Vitals":
		upd["last_vitals_at"] = doc.recorded_at
	if entry_type == "Feed":
		upd["last_feed_at"] = doc.recorded_at
	if entry_type == "Weight" and doc.weight_g:
		upd["current_weight_g"] = doc.weight_g
	if entry_type == "Bilirubin" and doc.bilirubin:
		upd["last_bilirubin"] = doc.bilirubin
	if doc.photo_on:
		upd["phototherapy_on"] = 1 if doc.photo_on == "Started" else 0
		if doc.photo_on == "Started" and nb.status in ("Stable", "Observation"):
			upd["status"] = "Phototherapy"
		elif doc.photo_on == "Stopped" and nb.status == "Phototherapy":
			upd["status"] = "Observation"
	if entry_type == "NICU Support" and doc.resp_support:
		upd["resp_support"] = doc.resp_support
	if upd:
		frappe.db.set_value("Newborn", nb.name, upd)
	if fl:
		publish("nursery", {"action": "alert", "name": nb.name, "baby": nb.baby_name, "flags": fl}, nb.branch)
	return doc


def add_entry(name, entry_type, data):
	nb = frappe.get_doc("Newborn", name)
	if nb.status == "Discharged":
		frappe.throw(_("This baby has been discharged."))
	if entry_type == "NICU Support" and not has_any_role(R.NICU_NURSE, R.NEONATOLOGIST):
		frappe.throw(_("NICU support settings are charted by the NICU nurse or the doctor."))
	if entry_type == "Doctor Note" and not has_any_role(R.NEONATOLOGIST):
		frappe.throw(_("Doctor notes are written by the paediatrician."))
	if entry_type in ("Medication", "Vaccine") and data.get("item") and not data.get("batch_no") and entry_type == "Vaccine":
		frappe.throw(_("Enter the vaccine batch number."))
	return _entry(nb, entry_type, data)


def strike(entry, reason):
	"""Audit-safe correction: the entry stays, struck through with who / why (track_changes keeps the history)."""
	if len((reason or "").strip()) < 4:
		frappe.throw(_("Give the reason for striking this entry."))
	e = frappe.get_doc("Newborn Chart Entry", entry)
	e.cancelled, e.cancel_reason = 1, f"{reason.strip()} — {frappe.session.user} {_now():%Y-%m-%d %H:%M}"
	e.save(ignore_permissions=True)
	return e


def set_status(name, status):
	if status == "Discharged":
		frappe.throw(_("Use the discharge checklist."))
	nb = frappe.get_doc("Newborn", name)
	nb.status = status
	nb.save(ignore_permissions=True)
	publish("nursery", {"action": "status", "name": name}, nb.branch)
	return nb


def move(name, unit, cot=None, reason=None):
	"""Rooming-in ↔ Nursery ↔ NICU: an IPD bed transfer, so the bill follows the cot rate of each unit."""
	nb = frappe.get_doc("Newborn", name)
	if unit not in UNIT_WARD_TYPE:
		frappe.throw(_("Choose a unit."))
	cot = cot or free_cot(unit, nb.branch)
	if not cot:
		frappe.throw(_("No free cot in {0}.").format(unit))
	from hospital_vvs.services import ipd

	if nb.admission and frappe.db.get_value("Bed Allotment", nb.admission, "status") == "Admitted":
		ipd.transfer(nb.admission, cot, reason=reason or _("Moved to {0}").format(unit))
	nb.unit, nb.cot = unit, cot
	if unit == "NICU" and nb.status == "Stable":
		nb.status = "Observation"
	if reason and unit == "NICU" and not nb.nicu_reason:
		nb.nicu_reason = reason if reason in frappe.get_meta("Newborn").get_field("nicu_reason").options.split("\n") else "Other"
	nb.save(ignore_permissions=True)
	_entry(nb, "Nursing Note", {"note": _("Moved to {0} · cot {1}{2}").format(unit, frappe.db.get_value("Hospital Bed", cot, "bed_no"), f" · {reason}" if reason else "")})
	publish("nursery", {"action": "moved", "name": name}, nb.branch)
	return nb


# ------------------------------------------------------------------ security
def security_event(name, event, tag_no=None, with_whom=None, band_match=0, staff_id=None, note=None):
	nb = frappe.get_doc("Newborn", name)
	ev = frappe.get_doc({"doctype": "Newborn Security Event", "newborn": name, "event": event, "at": _now(), "by_user": frappe.session.user, "staff_id": staff_id,
		"with_whom": with_whom, "band_match": cint(band_match), "tag_no": tag_no or nb.tag_no, "note": note}).insert(ignore_permissions=True)
	upd = {}
	if event == "Tag applied":
		upd.update(tag_active=1, tag_no=tag_no or nb.tag_no)
	elif event == "Tag removed":
		upd["tag_active"] = 0
	if event == "Band check at hand-over":
		if not cint(band_match):
			publish("nursery", {"action": "alarm", "name": name, "baby": nb.baby_name, "flags": [_("ID bands did NOT match at hand-over")]}, nb.branch)
		upd["last_band_check"] = ev.at
	if event == "Tag alarm":
		publish("nursery", {"action": "alarm", "name": name, "baby": nb.baby_name, "flags": [_("Security tag alarm")]}, nb.branch)
	if upd:
		frappe.db.set_value("Newborn", name, upd)
	return ev


# ------------------------------------------------------------------ board, chart, alerts
def board(branch=None):
	wards = {u: ward_for(u, branch) for u in UNIT_WARD_TYPE}
	beds = frappe.get_all("Hospital Bed", filters={"ward": ["in", sum(wards.values(), []) or [""]], "is_active": 1},
		fields=["name", "bed_no", "ward", "status", "bed_type", "current_patient"], order_by="ward, bed_no")
	babies = {b.cot: b for b in frappe.get_all("Newborn", filters={"status": ["!=", "Discharged"]}, fields=["name", "baby_name", "sex", "status", "unit", "cot", "birth_datetime",
		"birth_weight_g", "current_weight_g", "gestation_weeks", "last_bilirubin", "phototherapy_on", "resp_support", "tag_active", "mother_name", "last_vitals_at", "last_feed_at",
		"multiple_birth", "birth_order", "band_no"])}
	unplaced = [b for c, b in babies.items() if not c]
	unit_of = {w: u for u, ws in wards.items() for w in ws}
	out = {u: [] for u in UNIT_WARD_TYPE}
	for b in beds:
		nb = babies.get(b.name)
		row = {"cot": b.name, "bed_no": b.bed_no, "ward": b.ward, "bed_status": b.status}
		if nb:
			row["baby"] = {**nb, "age_hours": age_hours(nb), "birth_datetime": str(nb.birth_datetime)}
		out[unit_of[b.ward]].append(row)
	return {"units": out, "unplaced": unplaced, "alerts": alerts(branch)}


def alerts(branch=None):
	now = _now()
	out = []
	for nb in frappe.get_all("Newborn", filters={"status": ["!=", "Discharged"]}, fields=["name", "baby_name", "unit", "status", "birth_datetime", "last_vitals_at", "last_feed_at",
		"tag_active", "gestation_weeks"]):
		ah = age_hours(nb)
		for f in frappe.get_all("Newborn Chart Entry", filters={"newborn": nb.name, "cancelled": 0, "alert_flags": ["is", "set"], "recorded_at": [">=", add_to_date(now, hours=-12)]},
			fields=["alert_flags", "recorded_at", "entry_type"], order_by="recorded_at desc", limit=3):
			out.append({"kind": "abnormal", "severity": "red", "name": nb.name, "baby": nb.baby_name, "text": f.alert_flags.split("\n")[0], "at": str(f.recorded_at)[:16]})
		last_feed = _last("Newborn Chart Entry", {"newborn": nb.name, "entry_type": "Feed", "cancelled": 0}, "recorded_at")
		npo = _last("Newborn Chart Entry", {"newborn": nb.name, "entry_type": "Feed", "cancelled": 0, "feed_type": "Nil by mouth"}, "recorded_at")
		if ah > 1 and not (npo and last_feed and npo >= last_feed) and (not last_feed or (now - get_datetime(last_feed)).total_seconds() / 3600 > FEED_GAP_HOURS):
			out.append({"kind": "feed", "severity": "amber", "name": nb.name, "baby": nb.baby_name, "text": _("No feed charted for {0} h").format(round((now - get_datetime(last_feed or nb.birth_datetime)).total_seconds() / 3600, 1)), "at": str(last_feed or "")[:16]})
		given = set(frappe.get_all("Newborn Chart Entry", filters={"newborn": nb.name, "entry_type": "Vaccine", "cancelled": 0}, pluck="item"))
		due = [v for v in BIRTH_VACCINES if v not in given]
		if due and ah >= 12:
			out.append({"kind": "vaccine", "severity": "amber" if ah < 24 else "red", "name": nb.name, "baby": nb.baby_name, "text": _("Birth vaccines due: {0}").format(", ".join(due)), "at": ""})
		done = set(frappe.get_all("Newborn Chart Entry", filters={"newborn": nb.name, "entry_type": "Screening", "cancelled": 0}, pluck="screening"))
		sd = [s for s in SCREENINGS if s not in done]
		if sd and ah >= 24 and nb.unit != "NICU":
			out.append({"kind": "screening", "severity": "amber", "name": nb.name, "baby": nb.baby_name, "text": _("Screening due: {0}").format(", ".join(sd)), "at": ""})
		alarm = _last("Newborn Security Event", {"newborn": nb.name, "event": "Tag alarm", "at": [">=", add_to_date(now, hours=-6)]}, "at")
		resolved = _last("Newborn Security Event", {"newborn": nb.name, "event": "Alarm resolved"}, "at")
		if alarm and not (resolved and resolved >= alarm):
			out.append({"kind": "security", "severity": "red", "name": nb.name, "baby": nb.baby_name, "text": _("Security tag alarm — not resolved"), "at": str(alarm)[:16]})
		if not nb.tag_active:
			out.append({"kind": "security", "severity": "red", "name": nb.name, "baby": nb.baby_name, "text": _("No active security tag"), "at": ""})
		if nb.status == "Ready for discharge":
			out.append({"kind": "discharge", "severity": "blue", "name": nb.name, "baby": nb.baby_name, "text": _("Ready for discharge — checklist pending"), "at": ""})
	rank = {"red": 0, "amber": 1, "blue": 2}
	return sorted(out, key=lambda a: rank.get(a["severity"], 3))


def chart(name):
	nb = frappe.get_doc("Newborn", name)
	entries = frappe.get_all("Newborn Chart Entry", filters={"newborn": name}, fields=["*"], order_by="recorded_at desc", limit=500)
	for e in entries:
		e["by_name"] = frappe.db.get_value("User", e.recorded_by, "full_name") if e.recorded_by else ""
		e["recorded_at"] = str(e.recorded_at)[:16]
	sec = frappe.get_all("Newborn Security Event", filters={"newborn": name}, fields=["event", "at", "by_user", "staff_id", "with_whom", "band_match", "note"], order_by="at desc", limit=100)
	upd = frappe.get_all("Newborn Parent Update", filters={"newborn": name}, fields=["name", "status", "text", "photo", "posted_at", "posted_by"], order_by="posted_at desc", limit=50)
	out = nb.as_dict()
	out.update({"age_hours": age_hours(nb), "entries": entries, "security": sec, "updates": upd, "epi": epi_schedule(nb), "alerts": [a for a in alerts() if a["name"] == name],
		"threshold_now": phototherapy_threshold(age_hours(nb), nb.gestation_weeks), "doctor_name": frappe.db.get_value("Doctor", nb.attending_doctor, "doctor_name") if nb.attending_doctor else None,
		"cot_label": f"{frappe.db.get_value('Hospital Bed', nb.cot, 'ward')} · {frappe.db.get_value('Hospital Bed', nb.cot, 'bed_no')}" if nb.cot else None,
		"siblings": frappe.get_all("Newborn", filters={"multiple_group": nb.multiple_group, "name": ["!=", name]}, fields=["name", "baby_name"]) if nb.multiple_group else [],
		"bill": _bill(nb)})
	log_access("Newborn chart opened", patient=nb.baby_patient, reference_doctype="Newborn", reference_name=name)
	return out


def _bill(nb):
	if not nb.admission:
		return None
	try:
		from hospital_vvs.services import ipd

		b = ipd.running_bill(nb.admission)
		return {"admission": nb.admission, "gross": b.get("gross"), "net": b.get("net"), "paid": b.get("paid"), "due": b.get("due")}
	except Exception:
		return {"admission": nb.admission}


def epi_schedule(nb):
	given = {e.item: e for e in frappe.get_all("Newborn Chart Entry", filters={"newborn": nb.name, "entry_type": "Vaccine", "cancelled": 0}, fields=["item", "recorded_at", "batch_no", "recorded_by"])}
	bd = getdate(nb.birth_datetime)
	out = []
	for days, v in EPI:
		g = given.get(v)
		out.append({"vaccine": v, "due": str(add_days(bd, days)), "age": "Birth" if days == 0 else f"{days // 7} weeks" if days < 200 else f"{round(days / 30)} months",
			"given_at": str(g.recorded_at)[:10] if g else None, "batch": g.batch_no if g else None})
	return out


# ------------------------------------------------------------------ discharge
CHECKS = ("dc_feeding", "dc_weight", "dc_jaundice", "dc_screenings", "dc_vaccines", "dc_parent_taught", "dc_tag_removed", "dc_band_checked")


def doc_sig(kind, name, version):
	key = (frappe.local.conf.get("encryption_key") or frappe.local.site).encode()
	return hmac.new(key, f"newborn:{kind}:{name}:{version}".encode(), hashlib.sha256).hexdigest()[:20]


def discharge(name, data):
	if not has_any_role(R.NEONATOLOGIST):
		frappe.throw(_("The paediatrician completes the discharge."), frappe.PermissionError)
	nb = frappe.get_doc("Newborn", name)
	if nb.status == "Discharged":
		frappe.throw(_("Already discharged."))
	for k in (*CHECKS, "discharge_diagnosis", "discharge_advice", "discharge_meds", "follow_up_date"):
		if k in data:
			nb.set(k, data[k])
	missing = [frappe.get_meta("Newborn").get_label(k) for k in CHECKS if not cint(nb.get(k))]
	if missing:
		frappe.throw(_("Complete the checklist first: {0}").format(", ".join(missing)))
	if nb.tag_active:
		frappe.throw(_("Remove the security tag (security log) before discharge."))
	nb.status, nb.discharged_at, nb.discharged_by = "Discharged", _now(), frappe.session.user
	nb.discharge_weight_g = nb.current_weight_g
	nb.doc_version = cint(nb.doc_version) + 1
	nb.signature_hash = doc_sig("discharge", nb.name, nb.doc_version)
	nb.save(ignore_permissions=True)
	if nb.admission and frappe.db.get_value("Bed Allotment", nb.admission, "status") == "Admitted":
		frappe.db.set_value("Bed Allotment", nb.admission, {"status": "Discharge Pending", "discharge_type": "Normal"})  # billing desk settles the cot bill
	_entry(nb, "Doctor Note", {"note": _("Discharged — papers signed (v{0})").format(nb.doc_version), "share_with_parents": 1})
	if nb.mother_phone:
		messaging.send("newborn_discharged", phone=nb.mother_phone, patient=nb.mother, consent=True, reference_doctype="Newborn", reference_name=nb.name,
			context={"first_name": (nb.mother_name or "").split(" ")[0], "link": frappe.utils.get_url("/hms/site/my-baby")})
	publish("nursery", {"action": "discharged", "name": name}, nb.branch)
	return nb


# ------------------------------------------------------------------ documents (A4, bilingual labels, QR verification)
KINDS = {"discharge": ("Newborn Discharge Summary", "نومولود ڈسچارج خلاصہ"), "birth": ("Birth Record Slip", "پیدائشی ریکارڈ پرچی"),
	"epi": ("EPI Vaccination Card", "حفاظتی ٹیکوں کا کارڈ"), "nicu": ("NICU Daily Progress Report", "این آئی سی یو روزانہ رپورٹ")}


def verify_url(kind, nb, version=None):
	v = version if version is not None else cint(nb.doc_version)
	return frappe.utils.get_url(f"/hms/site/my-baby/verify/{kind}/{nb.name}/{doc_sig(kind, nb.name, v)}")


def public_check(kind, name, sig):
	if kind not in KINDS or not frappe.db.exists("Newborn", name):
		return {"valid": False}
	nb = frappe.get_doc("Newborn", name)
	versions = range(0, cint(nb.doc_version) + 1)
	ok = any(hmac.compare_digest(str(sig), doc_sig(kind, name, v)) for v in versions)
	s = frappe.get_cached_doc("Clinic Settings")
	initials = " ".join(w[0] + "." for w in (nb.mother_name or "").split()[:3])
	return {"valid": ok, "document": KINDS[kind][0], "reference": nb.name, "mother": initials, "birth_date": str(nb.birth_datetime)[:10], "sex": nb.sex,
		"discharged": str(nb.discharged_at or "")[:10] if kind == "discharge" else None, "clinic": s.clinic_name, "phone": s.phone}


def _row(cells):
	return "<tr>" + "".join(f"<td class='k'>{esc(k)}<span class='ur'>{esc(u)}</span></td><td class='v'>{esc(str(v if v not in (None, '') else '—'))}</td>" for k, u, v in cells) + "</tr>"


import re

_URDU = re.compile(r"([\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF][\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\s\u200c\u200d/()،۔:-]*)")


def _urdu_runs(html):
	"""Wrap every run of Urdu text in <span class='u'> so wkhtmltopdf uses a font that has all Urdu letters (e.g. ہ, ے)."""
	head, sep, rest = html.partition("</style>")
	if not sep:
		return html
	return head + sep + re.sub(r">([^<]+)<", lambda m: ">" + _URDU.sub(r"<span class='u'>\1</span>", m.group(1)) + "<", rest)


def _shell(kind, nb, body, signer=None):
	from hospital_vvs.letterhead import RED, TEAL, clinic_block, footer_html, header_html
	from hospital_vvs.services.lab import _image_uri, qr_data_uri
	from hospital_vvs.services.radiology import _watermark

	en, ur = KINDS[kind]
	doc = frappe.db.get_value("Doctor", signer or nb.attending_doctor, ["doctor_name", "qualification", "registration_no", "signature"], as_dict=True) if (signer or nb.attending_doctor) else None
	sig = _image_uri(doc.signature) if doc and doc.signature else None
	qr = qr_data_uri(verify_url(kind, nb))
	signed = kind != "discharge" or nb.status == "Discharged"
	return _urdu_runs(f"""<!doctype html><html><head><meta charset='utf-8'><style>
	@page {{ size:A4; margin:10mm 11mm 14mm }}
	.u {{ font-family:'FreeSerif','Noto Naskh Arabic',serif; font-weight:normal }}
	body {{ font-family: Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', 'FreeSerif', sans-serif; color:#0f2830; font-size:10.8px; line-height:1.45; margin:0 }}
	.wm {{ position:fixed; top:30%; left:24%; width:52%; z-index:-1 }}
	.dept {{ text-align:center; letter-spacing:.22em; font-size:9.5px; font-weight:700; color:{TEAL}; margin:-1mm 0 2mm }}
	h1 {{ text-align:center; font-family:Georgia,serif; font-size:16px; letter-spacing:.06em; margin:2mm 0 0; color:#0c2431 }}
	.h1ur {{ text-align:center; font-family:'Noto Nastaliq Urdu','Noto Naskh Arabic','FreeSerif',serif; direction:rtl; font-size:13px; color:{TEAL}; margin:0 0 1mm }}
	.rule {{ width:60px; height:3px; background:{RED}; margin:0 auto 3mm; border-radius:2px }}
	table.g {{ width:100%; border-collapse:collapse; border:1px solid #d5e3e6; background:#f6fafb; margin-bottom:2.5mm }}
	table.g td {{ padding:3px 7px; border-bottom:1px solid #e4eef0; vertical-align:top }} td.k {{ color:#5b7079; width:18% }} td.v {{ font-weight:700; width:32% }}
	.ur {{ display:block; font-family:'Noto Nastaliq Urdu','Noto Naskh Arabic','FreeSerif',serif; direction:rtl; text-align:left; font-size:8.5px; color:#8aa0a7 }}
	h3 {{ font-size:10px; text-transform:uppercase; letter-spacing:.14em; color:{TEAL}; margin:3mm 0 1.2mm; border-bottom:1px solid #e1eaeb; padding-bottom:.8mm }}
	table.t {{ width:100%; border-collapse:collapse }} table.t th {{ background:#0e5e6f; color:#fff; text-align:left; padding:3px 6px; font-size:9.5px }}
	table.t td {{ padding:3px 6px; border-bottom:1px solid #e4eef0 }} .ok {{ color:#047857; font-weight:700 }} .due {{ color:#b45309 }}
	.box {{ border:1.5px solid {TEAL}; border-left:6px solid {TEAL}; background:#eef7f6; border-radius:6px; padding:2.5mm 4mm; margin-top:3mm }}
	.flag {{ color:#b91c1c; font-weight:700 }}
	table.sign {{ width:100%; margin-top:4mm; border-top:1px solid #d5e3e6; padding-top:2mm }} table.sign td {{ vertical-align:bottom }}
	.stamp {{ display:inline-block; border:2px solid {TEAL}; color:{TEAL}; border-radius:8px; padding:1.5mm 3.5mm; font-weight:800; letter-spacing:.08em; font-size:9.5px }}
	.stamp.draft {{ border-color:#b45309; color:#b45309 }} .disc {{ margin-top:2.5mm; font-size:8.3px; color:#5b7079; text-align:center; font-style:italic }}
	</style></head><body><img class='wm' src='{_watermark()}'>
	{header_html(clinic_block(nb.branch))}
	<div class='dept'>DEPARTMENT OF PAEDIATRICS · NURSERY &amp; NEWBORN CARE</div>
	<h1>{esc(en.upper())}</h1><div class='h1ur'>{esc(ur)}</div><div class='rule'></div>
	{body}
	<table class='sign'><tr><td style='width:44%'>{f"<img src='{sig}' style='height:11mm'>" if sig else "<div style='width:46mm;border-bottom:1px solid #94a3b8;height:9mm'></div>"}
		<div style='font-weight:700;font-size:11.5px;margin-top:1mm'>{esc(doc.doctor_name if doc else 'Paediatrician')}</div><div style='color:#5b7079'>{esc((doc.qualification if doc else '') or 'Consultant Paediatrician')}</div>
		<div style='color:#5b7079'>{esc((doc.registration_no if doc else '') or '')}</div></td>
		<td style='text-align:center'><span class='stamp {"" if signed else "draft"}'>{"ELECTRONICALLY VERIFIED" if signed else "DRAFT — NOT SIGNED"}<br><small style='font-weight:600;letter-spacing:0'>{esc(nb.name)} · v{cint(nb.doc_version)} · {_now():%d %b %Y}</small></span></td>
		<td style='width:22%;text-align:right'><img src='{qr}' style='width:20mm;height:20mm'><div style='font-size:7.5px;color:#5b7079'>Scan to verify · تصدیق کے لیے اسکین کریں</div></td></tr></table>
	<div class='disc'>Clinical values and the vaccination schedule follow LMC paediatric protocols and the national EPI programme. Keep this document safe.</div>
	<div style='margin-top:2.5mm'>{footer_html(clinic_block(nb.branch), right='Nursery &amp; Newborn Care')}</div></body></html>""")


def _ident(nb):
	ga = f"{nb.gestation_weeks}+{cint(nb.gestation_days)} weeks" if nb.gestation_weeks else None
	return "<table class='g'>" + _row([("Baby", "بچہ", nb.baby_name), ("Baby MR", "ایم آر", nb.baby_patient)]) + _row([("Mother", "والدہ", nb.mother_name), ("Mother MR", "والدہ ایم آر", nb.mother)]) \
		+ _row([("Date & time of birth", "تاریخِ پیدائش", frappe.utils.format_datetime(nb.birth_datetime, "dd MMM yyyy, hh:mm a")), ("Sex", "جنس", nb.sex)]) \
		+ _row([("Gestation", "مدتِ حمل", ga), ("Birth weight", "پیدائشی وزن", f"{nb.birth_weight_g} g")]) + "</table>"


def discharge_html(nb):
	ents = frappe.get_all("Newborn Chart Entry", filters={"newborn": nb.name, "cancelled": 0}, fields=["entry_type", "recorded_at", "item", "batch_no", "screening", "result", "bilirubin", "photo_on"], order_by="recorded_at")
	vacc = "".join(f"<tr><td>{esc(e.item)}</td><td>{str(e.recorded_at)[:16]}</td><td>{esc(e.batch_no or '')}</td></tr>" for e in ents if e.entry_type == "Vaccine")
	scr = "".join(f"<tr><td>{esc(e.screening)}</td><td class='{'ok' if e.result in ('Pass', 'Normal') else 'flag'}'>{esc(e.result)}</td><td>{str(e.recorded_at)[:16]}</td></tr>" for e in ents if e.entry_type == "Screening")
	bili = [e for e in ents if e.entry_type == "Bilirubin"]
	photo = any(e.photo_on == "Started" for e in ents)
	stay = round((get_datetime(nb.discharged_at or _now()) - get_datetime(nb.birth_datetime)).total_seconds() / 86400, 1)
	body = _ident(nb) + "<table class='g'>" + _row([("Delivery", "زچگی", nb.delivery_type), ("Apgar 1 / 5 min", "اپگار", f"{nb.apgar_1 or '—'} / {nb.apgar_5 or '—'}")]) \
		+ _row([("Length / head", "لمبائی / سر", f"{nb.length_cm or '—'} cm / {nb.head_circ_cm or '—'} cm"), ("Blood group", "بلڈ گروپ", nb.blood_group)]) \
		+ _row([("Care unit", "یونٹ", nb.unit + (f" · {nb.nicu_reason}" if nb.nicu_reason else "")), ("Length of stay", "قیام", f"{stay} days")]) \
		+ _row([("Discharge weight", "ڈسچارج وزن", f"{nb.discharge_weight_g or nb.current_weight_g} g"), ("Discharged", "ڈسچارج", frappe.utils.format_datetime(nb.discharged_at, "dd MMM yyyy, hh:mm a") if nb.discharged_at else "—")]) + "</table>"
	body += f"<h3>Diagnosis · تشخیص</h3><p>{esc(nb.discharge_diagnosis or 'Healthy term newborn')}</p>"
	if bili:
		body += f"<h3>Jaundice · یرقان</h3><p>Peak bilirubin {max(flt(b.bilirubin) for b in bili)} mg/dL; last {flt(bili[-1].bilirubin)} mg/dL. Phototherapy: {'given' if photo else 'not needed'}.</p>"
	body += f"<h3>Vaccines given · لگائی گئی ویکسین</h3><table class='t'><tr><th>Vaccine</th><th>Given</th><th>Batch</th></tr>{vacc or '<tr><td colspan=3>—</td></tr>'}</table>"
	body += f"<h3>Screening · اسکریننگ</h3><table class='t'><tr><th>Test</th><th>Result</th><th>Date</th></tr>{scr or '<tr><td colspan=3>—</td></tr>'}</table>"
	if nb.discharge_meds:
		body += f"<h3>Medicines · ادویات</h3><p>{esc(nb.discharge_meds)}</p>"
	body += f"<div class='box'><b>Advice · ہدایات:</b> {esc(nb.discharge_advice or 'Exclusive breastfeeding on demand; cord care; safe sleep on the back.')}<br><b>Follow-up · فالو اپ:</b> {frappe.utils.formatdate(nb.follow_up_date, 'dd MMM yyyy') if nb.follow_up_date else 'Paediatric clinic in 1 week'}"
	body += "<br><span class='flag'>Return immediately if: fever, poor feeding, yellow skin spreading, fast breathing, very sleepy or fits.</span></div>"
	return _shell("discharge", nb, body, signer=frappe.db.get_value("Doctor", {"user": nb.discharged_by}, "name") if nb.discharged_by else None)


def birth_html(nb):
	body = _ident(nb) + "<table class='g'>" + _row([("Father / husband", "والد / شوہر", nb.father_name), ("Place of birth", "جائے پیدائش", f"{nb.place_of_birth} — Lyallpur Medical Complex, Faisalabad")]) \
		+ _row([("Delivery", "زچگی", nb.delivery_type), ("Multiple birth", "جڑواں", f"{nb.multiple_birth}" + (f" (baby {nb.birth_order})" if nb.multiple_birth != "Single" else ""))]) \
		+ _row([("Attended by", "زچگی کرائی", frappe.db.get_value("Doctor", nb.obstetrician, "doctor_name") if nb.obstetrician else "—"), ("ID band no.", "شناختی بینڈ", nb.band_no)]) + "</table>"
	body += ("<div class='box'>This slip records a birth at this hospital for registration with the Union Council / NADRA (CRMS). Parents should register the birth "
		"and obtain the child's birth certificate (B-form) from the Union Council. <br><span style=\"font-family:'Noto Nastaliq Urdu','Noto Naskh Arabic','FreeSerif',serif\">یہ پرچی یونین کونسل / نادرا میں پیدائش کے اندراج کے لیے ہے۔</span></div>")
	return _shell("birth", nb, body, signer=nb.obstetrician)


def epi_html(nb):
	rows = "".join(f"<tr><td>{esc(r['age'])}</td><td>{esc(r['vaccine'])}</td><td>{frappe.utils.formatdate(r['due'], 'dd MMM yyyy')}</td>"
		f"<td class='{'ok' if r['given_at'] else 'due'}'>{frappe.utils.formatdate(r['given_at'], 'dd MMM yyyy') if r['given_at'] else 'Due'}</td><td>{esc(r['batch'] or '')}</td></tr>" for r in epi_schedule(nb))
	body = _ident(nb) + f"<table class='t'><tr><th>Age · عمر</th><th>Vaccine · ویکسین</th><th>Due date · تاریخ</th><th>Given · لگی</th><th>Batch</th></tr>{rows}</table>"
	body += "<div class='box'>Bring this card to every vaccination. Schedule as per Pakistan EPI [verify against the current EPI Punjab schedule]. Reminders are sent by SMS / WhatsApp before each due date.</div>"
	return _shell("epi", nb, body)


def nicu_html(nb, day=None):
	day = getdate(day or today())
	ents = frappe.get_all("Newborn Chart Entry", filters={"newborn": nb.name, "cancelled": 0, "recorded_at": ["between", [f"{day} 00:00:00", f"{day} 23:59:59"]]}, fields=["*"], order_by="recorded_at")
	v = [e for e in ents if e.entry_type == "Vitals"]
	rng = lambda k: (f"{min(flt(e[k]) for e in v if e[k] not in (None, 0))}–{max(flt(e[k]) for e in v if e[k] not in (None, 0))}" if any(e[k] for e in v) else "—")
	feeds = [e for e in ents if e.entry_type == "Feed"]
	w = [e for e in ents if e.entry_type == "Weight" and e.weight_g]
	sup = [e for e in ents if e.entry_type == "NICU Support"]
	bili = [e for e in ents if e.entry_type == "Bilirubin"]
	notes = [e for e in ents if e.entry_type in ("Doctor Note", "Nursing Note") and e.note]
	ga_now = None
	if nb.gestation_weeks:
		days = (day - getdate(nb.birth_datetime)).days + cint(nb.gestation_days)
		ga_now = f"{nb.gestation_weeks + days // 7}+{days % 7}"
	body = _ident(nb) + "<table class='g'>" + _row([("Report date", "تاریخ", frappe.utils.formatdate(day, "dd MMM yyyy")), ("Day of life", "عمر (دن)", (day - getdate(nb.birth_datetime)).days + 1)]) \
		+ _row([("Corrected GA", "تصحیح شدہ عمر", ga_now), ("Admission reason", "وجہ", nb.nicu_reason)]) + "</table>"
	body += "<h3>Vital signs (range) · اہم علامات</h3><table class='t'><tr><th>Temp °C</th><th>HR</th><th>RR</th><th>SpO₂ %</th><th>Charted</th></tr>"
	body += f"<tr><td>{rng('temp_c')}</td><td>{rng('hr')}</td><td>{rng('rr')}</td><td>{rng('spo2')}</td><td>{len(v)}×</td></tr></table>"
	body += "<h3>Respiratory & fluids · سانس اور مائعات</h3><table class='t'><tr><th>Time</th><th>Support</th><th>FiO₂</th><th>PEEP</th><th>IV fluid / rate</th><th>Incubator °C</th></tr>"
	body += "".join(f"<tr><td>{str(e.recorded_at)[11:16]}</td><td>{esc(e.resp_support or '')}</td><td>{e.fio2 or ''}</td><td>{e.peep or ''}</td><td>{esc(e.iv_fluid or '')} {e.iv_rate or ''}</td><td>{e.incubator_temp or ''}</td></tr>" for e in sup) or "<tr><td colspan=6>—</td></tr>"
	body += "</table>"
	body += f"<h3>Nutrition & growth · غذا اور وزن</h3><p>Feeds: {len(feeds)} · total {sum(flt(e.feed_ml) for e in feeds):.0f} ml ({', '.join(sorted({e.feed_type for e in feeds if e.feed_type})) or '—'}). "
	body += f"Weight today: {w[-1].weight_g if w else nb.current_weight_g} g (birth {nb.birth_weight_g} g).</p>"
	if bili:
		body += "<p>Bilirubin: " + ", ".join(f"{str(e.recorded_at)[11:16]} {e.bilirubin} mg/dL{' (photo ' + e.photo_on.lower() + ')' if e.photo_on else ''}" for e in bili) + f" · phototherapy line now {phototherapy_threshold(age_hours(nb), nb.gestation_weeks)} mg/dL.</p>"
	body += "<h3>Notes · نوٹس</h3>" + ("".join(f"<p><b>{str(e.recorded_at)[11:16]}</b> {esc(e.note)}</p>" for e in notes) or "<p>—</p>")
	flags = [f for e in ents if e.alert_flags for f in e.alert_flags.split("\n")]
	if flags:
		body += "<div class='box'><b class='flag'>Alerts today:</b> " + esc("; ".join(flags[:8])) + "</div>"
	return _shell("nicu", nb, body)


def document_html(kind, name, day=None):
	nb = frappe.get_doc("Newborn", name)
	if kind == "discharge":
		return discharge_html(nb)
	if kind == "birth":
		return birth_html(nb)
	if kind == "epi":
		return epi_html(nb)
	if kind == "nicu":
		return nicu_html(nb, day)
	frappe.throw(_("Unknown document."))


def document_pdf(kind, name, day=None):
	"""A4, fitted to one page where possible (same approach as the imaging report, D-94)."""
	import io

	from frappe.utils.pdf import get_pdf
	from pypdf import PdfReader

	html = document_html(kind, name, day)
	opts = {"margin-top": "8mm", "margin-bottom": "12mm", "margin-left": "10mm", "margin-right": "10mm",
		"footer-center": f"{name} · {KINDS[kind][0]} · Page [page] of [topage]", "footer-font-size": "7", "footer-spacing": "3"}
	for zoom in ("1", "0.94", "0.88", "0.83"):
		pdf = get_pdf(html, {**opts, "zoom": zoom})
		if len(PdfReader(io.BytesIO(pdf)).pages) == 1:
			return pdf
	return get_pdf(html, opts)


# ------------------------------------------------------------------ parents' portal ("My Baby")
def _mother_of(ident, phone):
	ident = (ident or "").strip().upper()
	p10 = normalize_phone(phone)[-10:]
	if len(ident) < 5 or len(p10) < 10:
		return None
	pat = frappe.db.get_value("Patient", ident, ["name", "phone"], as_dict=True)
	if not pat:
		return None
	mother = frappe.db.get_value("Newborn", {"baby_patient": ident}, "mother") or (ident if frappe.db.exists("Newborn", {"mother": ident}) else None)
	if not mother:
		return None
	phones = {normalize_phone(frappe.db.get_value("Patient", mother, "phone") or "")[-10:]} | {normalize_phone(x or "")[-10:] for x in frappe.get_all("Newborn", filters={"mother": mother}, pluck="mother_phone")}
	return mother if p10 in phones else None


def portal_request(ident, phone):
	mother = _mother_of(ident, phone)
	if not mother:
		frappe.throw(_("We could not find a baby linked to that MR number and mobile number."))
	code = f"{random.SystemRandom().randint(0, 999999):06d}"
	frappe.cache.set_value(f"hv_nb_otp:{normalize_phone(phone)}", {"code": code, "tries": 0, "mother": mother}, expires_in_sec=300)
	messaging.send("otp_code", phone=normalize_phone(phone), patient=mother, consent=True, context={"code": code})
	out = {"sent": True, "masked": normalize_phone(phone)[:-7] + "•••" + normalize_phone(phone)[-4:]}
	if messaging.settings().message_mode != "Live" and cint(frappe.conf.developer_mode):
		out["test_code"] = code
	return out


def portal_verify(phone, code):
	key = f"hv_nb_otp:{normalize_phone(phone)}"
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
	s = secrets.token_urlsafe(24)
	frappe.cache.set_value(f"hv_nb_portal:{s}", data["mother"], expires_in_sec=1800)
	return {"session": s}


def _session(s):
	mother = frappe.cache.get_value(f"hv_nb_portal:{s}") if s and len(s) > 20 else None
	if not mother:
		frappe.throw(_("Your session has ended. Please sign in again."), frappe.PermissionError)
	return mother


def _own(s, name):
	mother = _session(s)
	if frappe.db.get_value("Newborn", name, "mother") != mother:
		frappe.throw(_("Not found."), frappe.PermissionError)
	return frappe.get_doc("Newborn", name)


def portal_home(s):
	mother = _session(s)
	out = []
	for nb in frappe.get_all("Newborn", filters={"mother": mother}, fields=["name"], order_by="birth_datetime desc"):
		d = frappe.get_doc("Newborn", nb.name)
		ups = frappe.get_all("Newborn Parent Update", filters={"newborn": d.name, "status": "Approved"}, fields=["name", "text", "photo", "posted_at"], order_by="posted_at desc", limit=10)
		for u in ups:
			u["has_photo"] = bool(u.pop("photo")) and cint(d.portal_photo_consent)
			u["posted_at"] = str(u.posted_at)[:16]
		notes = frappe.get_all("Newborn Chart Entry", filters={"newborn": d.name, "share_with_parents": 1, "cancelled": 0}, fields=["note", "recorded_at"], order_by="recorded_at desc", limit=10)
		epi = epi_schedule(d)
		nxt = next((r for r in epi if not r["given_at"]), None)
		docs = [k for k in ("birth", "epi") if True] + (["discharge"] if d.status == "Discharged" else []) + (["nicu"] if d.unit == "NICU" and d.status != "Discharged" else [])
		out.append({"name": d.name, "baby_name": d.baby_name, "sex": d.sex, "birth_datetime": str(d.birth_datetime)[:16], "birth_weight_g": d.birth_weight_g, "current_weight_g": d.current_weight_g,
			"unit": d.unit, "status": "Discharged" if d.status == "Discharged" else ("In care" if d.status != "Ready for discharge" else "Getting ready to go home"),
			"location": f"{d.unit} · 2nd floor, maternity wing" if d.status != "Discharged" else "At home", "visiting": VISITING.get(d.unit) if d.status != "Discharged" else None,
			"updates": ups, "notes": [{"text": n.note, "at": str(n.recorded_at)[:16]} for n in notes], "epi": epi, "next_vaccine": nxt, "documents": docs,
			"photo_consent": cint(d.portal_photo_consent), "follow_up_date": str(d.follow_up_date or "") or None})
	return {"mother": frappe.db.get_value("Patient", mother, "patient_name"), "babies": out}


def portal_photo(s, update):
	u = frappe.get_doc("Newborn Parent Update", update)
	nb = _own(s, u.newborn)
	if u.status != "Approved" or not u.photo or not cint(nb.portal_photo_consent):
		frappe.throw(_("Not available."))
	from hospital_vvs.services.lab import attachment_bytes

	return attachment_bytes(u.photo)


def post_update(name, text, photo=None, approve=False):
	nb = frappe.get_doc("Newborn", name)
	if photo and not cint(nb.portal_photo_consent):
		frappe.throw(_("The parents have not consented to photos in the portal."))
	status = "Approved" if approve and has_any_role(R.NEONATOLOGIST, R.NICU_NURSE, R.NURSERY_NURSE) else "Draft"
	u = frappe.get_doc({"doctype": "Newborn Parent Update", "newborn": name, "text": text, "photo": photo, "status": status, "posted_by": frappe.session.user, "posted_at": _now(),
		"approved_by": frappe.session.user if status == "Approved" else None}).insert(ignore_permissions=True)
	return u


# ------------------------------------------------------------------ reminders (daily)
def vaccine_reminders():
	"""Next-day vaccine reminders to mothers of discharged babies (SMS / WhatsApp through the existing messaging layer)."""
	tomorrow = add_days(getdate(today()), 1)
	for nb in frappe.get_all("Newborn", filters={"birth_datetime": [">=", add_days(getdate(today()), -470)]}, fields=["name"]):
		d = frappe.get_doc("Newborn", nb.name)
		due = [r["vaccine"] for r in epi_schedule(d) if not r["given_at"] and getdate(r["due"]) == tomorrow]
		if due and d.mother_phone:
			messaging.send("newborn_vaccine_due", phone=d.mother_phone, patient=d.mother, consent=True, reference_doctype="Newborn", reference_name=d.name,
				context={"first_name": (d.mother_name or "").split(" ")[0], "baby": d.baby_name.split(" ")[0] if d.named else _("your baby"), "date": frappe.utils.formatdate(tomorrow, "dd MMM")})


# ------------------------------------------------------------------ reports & public facts
def reports(from_date, to_date):
	a = {"f": getdate(from_date), "t": getdate(to_date)}
	births = frappe.db.sql("""select date(birth_datetime) d, count(*) n from tabNewborn where date(birth_datetime) between %(f)s and %(t)s group by date(birth_datetime) order by d""", a, as_dict=True)
	monthly = frappe.db.sql("""select date_format(birth_datetime,'%%Y-%%m') m, count(*) n from tabNewborn where birth_datetime >= %(f)s - interval 11 month group by m order by m""", a, as_dict=True)
	reasons = frappe.db.sql("""select coalesce(nicu_reason,'Other') label, count(*) value from tabNewborn where unit='NICU' and date(birth_datetime) between %(f)s and %(t)s group by label order by value desc""", a, as_dict=True)
	stay = frappe.db.sql("""select unit, round(avg(timestampdiff(hour, birth_datetime, discharged_at))/24,1) days, count(*) n from tabNewborn where discharged_at is not null and date(birth_datetime) between %(f)s and %(t)s group by unit""", a, as_dict=True)
	delivery = frappe.db.sql("""select delivery_type label, count(*) value from tabNewborn where date(birth_datetime) between %(f)s and %(t)s group by delivery_type""", a, as_dict=True)
	occ = []
	for unit in UNIT_WARD_TYPE:
		ws = ward_for(unit)
		tot = frappe.db.count("Hospital Bed", {"ward": ["in", ws or [""]], "is_active": 1})
		occd = frappe.db.count("Newborn", {"cot": ["in", frappe.get_all("Hospital Bed", filters={"ward": ["in", ws or [""]]}, pluck="name") or [""]], "status": ["!=", "Discharged"]})
		occ.append({"unit": unit, "cots": tot, "occupied": occd})
	for r in births:
		r["d"] = str(r["d"])
	return {"births": births, "monthly": monthly, "reasons": reasons, "stay": stay, "delivery": delivery, "occupancy": occ,
		"totals": {"births": sum(r.n for r in births), "nicu": sum(r.value for r in reasons), "lbw": frappe.db.count("Newborn", {"birth_weight_g": ["<", 2500], "birth_datetime": ["between", [a["f"], f"{a['t']} 23:59:59"]]}),
			"in_care": frappe.db.count("Newborn", {"status": ["!=", "Discharged"]})}}


def public_facts():
	cnt = {u: frappe.db.count("Hospital Bed", {"ward": ["in", ward_for(u) or [""]], "is_active": 1}) for u in UNIT_WARD_TYPE}
	rate = lambda u: flt(frappe.db.get_value("Ward", (ward_for(u) or [None])[0], "bed_charge_per_day")) if ward_for(u) else None
	mb = frappe.db.get_value("Ward", {"ward_type": "Maternity", "name": ["!=", ROOMING_WARD], "is_active": 1}, "bed_charge_per_day")
	staff = len(set(frappe.get_all("Has Role", filters={"role": ["in", [R.NURSERY_NURSE, R.NICU_NURSE, R.NEONATOLOGIST]], "parenttype": "User"}, pluck="parent")))
	staff += frappe.db.count("Doctor", {"is_active": 1, "department": "Paediatrics", "user": ["is", "not set"]})
	return {"units": {"nicu": cnt["NICU"], "nursery": cnt["Nursery"], "rooming": cnt["Rooming-in"]}, "staff": staff,
		"rates": {"nicu": rate("NICU"), "nursery": rate("Nursery"), "rooming": flt(mb) or rate("Rooming-in")}}
