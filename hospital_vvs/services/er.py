"""Emergency module (06-ipd.md): quick / unknown registration, triage, board, disposition, ER billing."""

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, now_datetime, time_diff_in_seconds, today

from hospital_vvs.services import billing, ipd
from hospital_vvs.utils import check_branch, default_branch, publish, setting

RYG = [("Red", 1, "#dc2626"), ("Yellow", 2, "#f59e0b"), ("Green", 3, "#16a34a")]
ESI = [("1 Resuscitation", 1, "#dc2626"), ("2 Emergent", 2, "#ea580c"), ("3 Urgent", 3, "#f59e0b"), ("4 Less urgent", 4, "#16a34a"),
	("5 Non-urgent", 5, "#2563eb")]
DISPOSITIONS = ("Discharged Home", "Admitted", "Referred Out", "LAMA", "Expired")


def scale():
	name = setting("triage_scale") or "Red / Yellow / Green"
	return name, (ESI if name.startswith("5") else RYG)


def register(*, patient=None, unknown=None, branch=None, arrival_mode="Walk-in", brought_by=None, brought_by_phone=None, chief_complaint=None,
	medico_legal=0, mlc_no=None, police_station=None, arrival_at=None):
	"""Known patient, or an unknown one ({gender, approx_age, description}) on a temporary MR to be merged later."""
	branch = branch or default_branch()
	check_branch(branch)
	is_unknown = 0
	if not patient:
		u = unknown or {}
		gender = u.get("gender") or "Male"
		age = cint(u.get("approx_age")) or 30
		label = u.get("description") or _("Unknown {0} ~{1}").format(gender, age)
		from hospital_vvs.hospital_vvs.doctype.patient.patient import dob_from_age

		p = frappe.get_doc({"doctype": "Patient", "patient_name": label, "gender": gender, "dob": dob_from_age(age), "dob_estimated": 1, "branch": branch,
			"temporary_record": 1, "duplicate_reason": _("Unknown ER patient")})
		p.insert(ignore_permissions=True)
		patient, is_unknown = p.name, 1
	open_visit = frappe.db.get_value("ER Visit", {"patient": patient, "status": ["!=", "Disposed"]}, "name")
	if open_visit:
		frappe.throw(_("This patient already has an open ER visit ({0}).").format(open_visit))
	er = frappe.get_doc({"doctype": "ER Visit", "patient": patient, "is_unknown": is_unknown, "branch": branch, "arrival_at": arrival_at or now_datetime(),
		"arrival_mode": arrival_mode, "brought_by": brought_by, "brought_by_phone": brought_by_phone, "chief_complaint": chief_complaint,
		"medico_legal": cint(medico_legal), "mlc_no": mlc_no, "police_station": police_station, "status": "Waiting",
		"billing_mode": setting("er_billing_mode") or "Running bill", "triage_scale": scale()[0]}).insert(ignore_permissions=True)
	fee = flt(setting("er_fee"))
	if fee:
		ipd.add_charge(charge_type="ER", item_code=ipd.item_setting("er_fee_item", "ER-FEE"), rate=fee, description=_("Emergency registration & assessment"),
			er_visit=er.name, reference_doctype="ER Visit", reference_name=er.name)
	publish("er", {"action": "arrived", "visit": er.name}, branch)
	return er


def triage(name, level, vitals=None, chief_complaint=None):
	er = _open(name)
	scale_name, levels = scale()
	hit = next((lv for lv in levels if lv[0] == level), None)
	if not hit:
		frappe.throw(_("Triage level {0} is not on the {1} scale.").format(level, scale_name))
	er.update({"triage_scale": scale_name, "triage_level": hit[0], "triage_rank": hit[1], "triage_color": hit[2], "triaged_by": frappe.session.user,
		"triaged_at": now_datetime()})
	for k in ("bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2", "resp_rate", "gcs"):
		if (vitals or {}).get(k) not in (None, ""):
			er.set(k, vitals[k])
	if chief_complaint:
		er.chief_complaint = chief_complaint
	er.save(ignore_permissions=True)
	if vitals and any(vitals.get(k) not in (None, "") for k in ("bp_systolic", "pulse", "temperature", "spo2")):
		frappe.get_doc({"doctype": "Vitals Chart", "er_visit": er.name, "patient": er.patient, "branch": er.branch, "recorded_at": now_datetime(),
			"recorded_by": frappe.session.user, **{k: vitals.get(k) for k in ("bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2", "resp_rate",
			"gcs", "rbs") if vitals.get(k) not in (None, "")}}).insert(ignore_permissions=True)
	publish("er", {"action": "triaged", "visit": er.name}, er.branch)
	return er


def _open(name):
	er = frappe.get_doc("ER Visit", name)
	check_branch(er.branch)
	if er.status == "Disposed":
		frappe.throw(_("ER visit {0} is closed.").format(name))
	return er


def assign(name, doctor=None, bay=None, status=None):
	er = _open(name)
	from hospital_vvs.api.ward import _set

	if bay and bay != er.bay:
		b = frappe.db.get_value("Hospital Bed", bay, ["status", "current_patient", "bed_no"], as_dict=True)
		if b.status not in ("Available", "Reserved"):
			frappe.throw(_("Bay {0} is {1}.").format(b.bed_no, b.status))
		if er.bay:
			_release_bay(er)
		_set(bay, "Occupied", _("ER · {0}").format(er.name), current_patient=er.patient, patient_name=er.patient_name, occupied_since=now_datetime(),
			attending_doctor=doctor or er.assigned_doctor, admission_reason=er.chief_complaint)
		er.bay = bay
	if doctor:
		er.assigned_doctor = doctor
		if er.status == "Waiting":
			er.status = "In Treatment"
	if status in ("Waiting", "In Treatment", "Observation"):
		er.status = status
	er.save(ignore_permissions=True)
	publish("er", {"action": "assigned", "visit": er.name}, er.branch)
	return er


def _release_bay(er):
	from hospital_vvs.api.ward import _set

	b = frappe.db.get_value("Hospital Bed", er.bay, ["status", "current_patient"], as_dict=True)
	if b and b.status == "Occupied" and b.current_patient == er.patient:
		_set(er.bay, "Cleaning", _("ER visit {0} closed").format(er.name))


def board(branch=None):
	branch = branch or default_branch()
	check_branch(branch)
	rows = frappe.db.sql("""select name, patient, patient_name, is_unknown, arrival_at, arrival_mode, status, triage_level, triage_rank, triage_color,
		chief_complaint, assigned_doctor, bay, medico_legal, disposition, disposition_at, bed_allotment, pulse, spo2, bp_systolic, bp_diastolic, temperature
		from `tabER Visit` where branch=%s and (status!='Disposed' or disposition_at >= now() - interval 6 hour)""", branch, as_dict=True)
	now = now_datetime()
	docs = {d.name: d.doctor_name for d in frappe.get_all("Doctor", fields=["name", "doctor_name"])}
	beds = {b.name: b.bed_no for b in frappe.get_all("Hospital Bed", filters={"name": ["in", [r.bay for r in rows if r.bay] or [""]]}, fields=["name", "bed_no"])}
	ids = [r.name for r in rows] or [""]
	labs = {r.er_visit: r.n for r in frappe.db.sql("""select er_visit, count(*) n from `tabTest Invoice` where er_visit in %(ids)s
		and status not in ('Released','Cancelled') group by er_visit""", {"ids": ids}, as_dict=True)}
	doses = {r.er_visit: r.n for r in frappe.db.sql("""select er_visit, count(*) n from `tabMAR Entry` where er_visit in %(ids)s
		and status in ('Scheduled','Approved','Pending Approval') and scheduled_at <= now() group by er_visit""", {"ids": ids}, as_dict=True)}
	for r in rows:
		r["waiting_minutes"] = int(time_diff_in_seconds(r.disposition_at or now, r.arrival_at) // 60)
		r["doctor_name"] = docs.get(r.assigned_doctor)
		r["bay_no"] = beds.get(r.bay)
		r["pending_labs"] = labs.get(r.name, 0)
		r["due_doses"] = doses.get(r.name, 0)
	rows.sort(key=lambda r: (r.status == "Disposed", r.triage_rank or 99, get_datetime(r.arrival_at)))
	scale_name, levels = scale()
	er_ward = setting("er_ward")
	bays = frappe.get_all("Hospital Bed", filters={"branch": branch, "is_active": 1, **({"ward": er_ward} if er_ward else {"ward": ["in",
		frappe.get_all("Ward", filters={"branch": branch, "ward_type": "Emergency"}, pluck="name") or [""]]})},
		fields=["name", "bed_no", "status", "current_patient", "patient_name"], order_by="bed_no")
	return {"branch": branch, "visits": rows, "scale": scale_name, "levels": [{"level": l, "rank": r, "color": c} for l, r, c in levels], "bays": bays,
		"counts": {lv[0]: sum(1 for r in rows if r.triage_level == lv[0] and r.status != "Disposed") for lv in levels},
		"untriaged": sum(1 for r in rows if not r.triage_level and r.status != "Disposed")}


def dispose(name, disposition, note=None, referred_to=None, death_datetime=None, cause_of_death=None, admit=None, payment_mode="Cash",
	lama_form=None):
	"""Close the visit. Admit carries every charge onto the new admission; the other outcomes bill the ER visit."""
	er = _open(name)
	if disposition not in DISPOSITIONS:
		frappe.throw(_("Unknown disposition {0}.").format(disposition))
	if disposition == "Expired" and not death_datetime:
		frappe.throw(_("Enter the date and time of death."))
	if disposition == "LAMA" and not lama_form:
		frappe.throw(_("Attach the signed LAMA form."))
	if disposition == "Referred Out" and not referred_to:
		frappe.throw(_("Enter where the patient was referred."))
	adm_name = None
	if disposition == "Admitted":
		a = frappe.parse_json(admit) if isinstance(admit, str) else (admit or {})
		if not a.get("bed") or not (a.get("doctor") or er.assigned_doctor):
			frappe.throw(_("Choose the bed and the admitting doctor."))
		_release_bay(er)
		adm, _token = ipd.admit(er.patient, a["bed"], a.get("doctor") or er.assigned_doctor, reason=a.get("reason") or er.chief_complaint,
			diagnosis=a.get("diagnosis"), planned_days=a.get("planned_days") or 1, source="ER", er_visit=er.name, payer_type=a.get("payer_type"),
			payer=a.get("payer"), pre_auth=a.get("pre_auth"), package=a.get("package"))
		adm_name = adm.name
	else:
		_release_bay(er)
		er.reload()
		bill_visit(er, payment_mode)
	er.reload()
	er.update({"status": "Disposed", "disposition": disposition, "disposition_at": now_datetime(), "disposition_note": note, "referred_to": referred_to,
		"death_datetime": death_datetime, "cause_of_death": cause_of_death, "bed_allotment": adm_name or er.bed_allotment})
	er.save(ignore_permissions=True)
	frappe.db.sql("update `tabIPD Medication Order` set status='Completed' where er_visit=%s and ifnull(bed_allotment,'')='' and status='Active'", er.name)
	frappe.db.sql("""update `tabMAR Entry` set status='Cancelled', reason='ER visit closed' where er_visit=%s and ifnull(bed_allotment,'')=''
		and status in ('Scheduled','Pending Approval','Approved')""", er.name)
	publish("er", {"action": "disposed", "visit": er.name}, er.branch)
	return er


def bill_visit(er, payment_mode="Cash"):
	"""ER bill: one invoice for every open charge of the visit. OPD-style = paid at the counter now (POS); running bill = credit invoice,
	the balance is collected with a Payment Entry (advances already taken are allocated)."""
	if er.sales_invoice:
		return er.sales_invoice
	charges = frappe.get_all("IPD Charge", filters={"er_visit": er.name, "bed_allotment": ["is", "not set"], "status": "Open"},
		fields=["name", "item_code", "qty", "rate", "charge_type"])
	if not charges:
		return None
	customer = frappe.db.get_value("Patient", er.patient, "customer")
	lines = [{"item_code": c.item_code, "qty": c.qty, "rate": c.rate, "description": c.charge_type} for c in charges]
	pos = (er.billing_mode or setting("er_billing_mode")) == "OPD-style slip"

	def allocate(si):
		mine = set(frappe.get_all("Payment Entry", filters={"hv_er_visit": er.name, "docstatus": 1, "payment_type": "Receive", "hv_purpose": "Advance"},
			pluck="name"))
		si.allocate_advances_automatically = 0
		if mine and not pos:
			si.set_advances()
			si.set("advances", [a for a in si.advances if a.reference_name in mine])
			left = flt(si.rounded_total or si.grand_total)
			for a in si.advances:
				a.allocated_amount = min(flt(a.advance_amount), left)
				left -= a.allocated_amount
			si.calculate_taxes_and_totals()

	inv = billing.create_invoice(customer=customer, patient=er.patient, lines=lines, billing_type="IPD Slip", branch=er.branch, reference_doctype="ER Visit",
		reference_name=er.name, pos=pos, payment_mode=payment_mode, remarks=_("Emergency visit {0}").format(er.name), prepare=allocate)
	frappe.db.sql("update `tabIPD Charge` set status='Billed', sales_invoice=%s where er_visit=%s and ifnull(bed_allotment,'')='' and status='Open'",
		(inv, er.name))
	er.db_set("sales_invoice", inv)
	return inv
