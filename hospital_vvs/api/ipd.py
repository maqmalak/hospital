"""IPD API (06-ipd.md, routes /ipd, /ipd/:name, /ipd/mar, /ipd_slip, /ipd_report). Rules live in services/ipd.py."""

import frappe
from frappe import _
from frappe.utils import add_days, cint, date_diff, flt, get_datetime, getdate, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.services import discounts, ipd
from hospital_vvs.utils import can_see_clinical, check_branch, default_branch, has_any_role, log_access, require_roles, setting, settings

CLINICAL = (R.DOCTOR, R.NURSE)
DESK = (R.RECEPTIONIST,)
BILL = (R.RECEPTIONIST, R.ACCOUNTANT, R.CASH_SUPERVISOR)


def _d(data):
	return frappe.parse_json(data) if isinstance(data, str) else (data or {})


def _target(d):
	"""(admission, er_visit) from a payload; the admission wins when both are given."""
	return d.get("bed_allotment") or None, (None if d.get("bed_allotment") else d.get("er_visit"))


# ------------------------------------------------------------------ context / lists
@frappe.whitelist()
def context(branch=None):
	branch = branch or default_branch()
	check_branch(branch)
	payers = frappe.get_all("Customer", filters={"customer_group": ["in", ["Panels", "Insurance Providers", "Welfare Funds"]], "disabled": 0},
		fields=["name", "customer_group", "hv_coverage_percent"], order_by="name")
	beds = frappe.get_all("Hospital Bed", filters={"branch": branch, "is_active": 1, "status": ["in", ["Available", "Reserved"]]},
		fields=["name", "bed_no", "ward", "status", "daily_rate", "bed_type"], order_by="ward, bed_no")
	wards = {w.name: w for w in frappe.get_all("Ward", filters={"branch": branch}, fields=["name", "ward_type", "bed_charge_per_day",
		"nursing_charge_per_shift", "icu_surcharge_per_day", "color"])}
	for b in beds:
		w = wards.get(b.ward) or {}
		b["rate"] = flt(b.daily_rate) or flt(w.get("bed_charge_per_day"))
		b["ward_type"] = w.get("ward_type")
	s = settings()
	return {"branch": branch,
		"doctors": frappe.get_all("Doctor", filters={"is_active": 1, "doctor_type": ["!=", "External Referring"]}, fields=["name", "doctor_name",
			"specialization", "branch"], order_by="doctor_name"),
		"payers": payers, "beds": beds, "wards": list(wards.values()),
		"packages": frappe.get_all("Service Package", filters={"is_active": 1}, fields=["name", "price", "days", "procedure_type"], order_by="name"),
		"diet_types": frappe.get_all("Diet Type", filters={"is_active": 1}, fields=["name", "diet_name_ur", "per_meal_rate", "per_day_rate"], order_by="name"),
		"procedure_types": frappe.get_all("Procedure Type", filters={"is_active": 1}, fields=["name", "category", "price", "theatre_charge",
			"anesthesia_charge", "requires_consent", "requires_preauth"], order_by="name"),
		"lab_templates": frappe.get_all("Lab Test Template", filters={"is_active": 1}, fields=["name", "test_code", "department", "price"], order_by="name"),
		"charge_items": frappe.get_all("Item", filters={"item_group": "Medical Services", "disabled": 0}, fields=["name", "item_name", "standard_rate"],
			order_by="item_name"),
		"flags": {"mar_gate": cint(s.mar_approval_gate), "mar_billing": s.mar_billing_trigger, "stock": s.stock_deduction_timing,
			"diet_mode": s.diet_billing_mode, "procedure_trigger": s.procedure_invoice_trigger, "hold": cint(s.discharge_clearance_hold),
			"consent": cint(s.enable_consent), "packages": cint(s.enable_packages), "diet": cint(s.enable_diet), "mar": cint(s.enable_mar),
			"procedures": cint(s.enable_procedures), "preauth": cint(s.require_preauth_for_insurance), "oxygen_rate": flt(s.oxygen_rate_per_hour),
			"pharmacy_bills": int(ipd.pharmacy_bills())}}


@frappe.whitelist()
def admissions(branch=None, status="open", ward=None, q=None, limit=200):
	require_roles(*CLINICAL, *DESK, *BILL, R.DEO)
	branch = branch or default_branch()
	check_branch(branch)
	filters = {"branch": branch}
	if status == "open":
		filters["status"] = ["in", ipd.OPEN_STATES]
	elif status:
		filters["status"] = status
	if ward:
		filters["ward"] = ward
	or_filters = None
	if q:
		or_filters = {"patient_name": ["like", f"%{q}%"], "patient": ["like", f"%{q}%"], "name": ["like", f"%{q}%"]}
	rows = frappe.get_all("Bed Allotment", filters=filters, or_filters=or_filters, fields=["name", "patient", "patient_name", "gender", "status", "bed",
		"ward", "admit_datetime", "expected_discharge", "release_datetime", "doctor_name", "payer_type", "payer", "charges_total", "advance_total",
		"service_package", "source", "discharge_type", "final_invoice"], order_by="admit_datetime desc", limit=cint(limit) or 200)
	beds = {b.name: b.bed_no for b in frappe.get_all("Hospital Bed", filters={"name": ["in", [r.bed for r in rows] or [""]]}, fields=["name", "bed_no"])}
	now = now_datetime()
	for r in rows:
		r["bed_no"] = beds.get(r.bed)
		r["days"] = ipd.midnights(r.admit_datetime, r.release_datetime or now)
		r["overdue"] = bool(r.expected_discharge and get_datetime(r.expected_discharge) < now and r.status != "Discharged")
		if r.status in ipd.OPEN_STATES:
			b = ipd.running_bill(r.name)
			r["charges_total"] = b["patient_share"] + b["payer_share"]
			r["balance"] = b["balance"]
	return rows


# ------------------------------------------------------------------ admit / move
@frappe.whitelist(methods=["POST"])
def admit(data):
	require_roles(*DESK, *CLINICAL)
	d = _d(data)
	adm, token = ipd.admit(d["patient"], d["bed"], d.get("doctor"), reason=d.get("reason"), diagnosis=d.get("diagnosis"),
		planned_days=d.get("planned_days") or 1, source=d.get("source") or "Direct", payer_type=d.get("payer_type"), payer=d.get("payer"),
		pre_auth=d.get("pre_auth"), package=d.get("package"), daily_rate=d.get("daily_rate"), opd_slip=d.get("opd_slip"),
		consultants=d.get("consultants"))
	if flt(d.get("advance")):
		ipd.take_payment(d["advance"], d.get("payment_mode") or "Cash", "Advance", adm=adm.name)
	return {"name": adm.name, "token": token, "bedside_url": f"/hms/patient/{token}"}


@frappe.whitelist(methods=["POST"])
def transfer(name, to_bed, reason=None):
	require_roles(*CLINICAL, *DESK)
	return ipd.transfer(name, to_bed, reason).name


@frappe.whitelist(methods=["POST"])
def extend(name, days=1):
	require_roles(*CLINICAL, *DESK)
	return ipd.extend(name, days).expected_discharge


@frappe.whitelist(methods=["POST"])
def new_comms_token(name):
	require_roles(*CLINICAL, *DESK)
	token = ipd.new_comms_token(name)
	return {"token": token, "bedside_url": f"/hms/patient/{token}"}


# ------------------------------------------------------------------ chart
@frappe.whitelist()
def chart(name):
	require_roles(*CLINICAL, *DESK, R.DEO)
	adm = frappe.get_doc("Bed Allotment", name)
	check_branch(adm.branch)
	clinical = can_see_clinical()
	log_access("IPD chart", patient=adm.patient, reference_doctype="Bed Allotment", reference_name=adm.name, branch=adm.branch)
	pat = frappe.db.get_value("Patient", adm.patient, ["name", "patient_name", "patient_name_ur", "gender", "dob", "phone", "photo", "category",
		"blood_group", "temporary_record"], as_dict=True)
	from hospital_vvs.api.patients import age_of

	pat["age"] = age_of(pat.dob)
	pat["allergies"] = frappe.get_all("Patient Allergy", filters={"parent": adm.patient, "parenttype": "Patient"}, fields=["allergy", "severity",
		"reaction"]) if clinical else []
	beds = {b.name: b for b in frappe.get_all("Hospital Bed", filters={"name": ["in", [s.bed for s in adm.segments] or [""]]},
		fields=["name", "bed_no", "ward"])}
	out = adm.as_dict()
	out["segments"] = [dict(s.as_dict(), bed_no=beds.get(s.bed, {}).get("bed_no")) for s in adm.segments]
	out["bed_no"] = beds.get(adm.bed, {}).get("bed_no")
	out["patient_info"] = pat
	out["days"] = ipd.midnights(adm.admit_datetime, adm.release_datetime or now_datetime())
	scope = {"bed_allotment": adm.name}
	if not clinical:
		out.pop("provisional_diagnosis", None)
	out["notes"] = frappe.get_all("IPD Note", filters=dict(scope, docstatus=1), fields=["name", "note_type", "note", "recorded_at", "author", "doctor"],
		order_by="recorded_at desc", limit=200) if clinical else []
	out["rounds"] = frappe.get_all("Ward Round", filters=dict(scope, docstatus=1), fields=["name", "round_no", "doctor", "round_at", "findings", "plan",
		"orders"], order_by="round_at desc") if clinical else []
	out["orders"] = frappe.get_all("IPD Medication Order", filters=scope, fields=["name", "item", "item_name", "dose", "route", "frequency", "times",
		"days", "start_at", "status", "doctor", "alert_type", "alert_message", "override_reason", "stop_reason", "units_per_dose"], order_by="creation desc")
	out["mar"] = frappe.get_all("MAR Entry", filters=dict(scope, scheduled_at=[">=", add_days(now_datetime(), -3)]), fields=["name",
		"medication_order", "item_name", "dose", "route", "scheduled_at", "status", "administered_by", "administered_at", "reason", "approved_by",
		"batch_no"], order_by="scheduled_at", limit=600)
	out["vitals"] = frappe.get_all("Vitals Chart", filters=scope, fields=["name", "recorded_at", "bp_systolic", "bp_diastolic", "pulse", "temperature",
		"spo2", "resp_rate", "rbs", "pain_score", "gcs", "intake_ml", "output_ml", "note", "recorded_by"], order_by="recorded_at desc", limit=200)
	out["diet"] = frappe.get_all("Diet Order", filters=scope, fields=["name", "diet_date", "diet_type", "breakfast", "lunch", "dinner", "snacks", "status",
		"charge", "instructions"], order_by="diet_date desc")
	out["procedures"] = frappe.get_all("IPD Procedure", filters=scope, fields=["name", "procedure_type", "scheduled_at", "theatre", "anesthesia", "status",
		"consent", "completed_at", "procedure_fee", "theatre_charge", "anesthesia_charge", "notes", "cancel_reason"], order_by="scheduled_at desc")
	for p in out["procedures"]:
		p["team"] = frappe.get_all("Procedure Team Member", filters={"parent": p.name}, fields=["role", "doctor", "person_name"])
	out["consents"] = frappe.get_all("Consent Form", filters=dict(scope, docstatus=1), fields=["name", "consent_type", "procedure", "signer_name",
		"signed_by", "relation", "witness_name", "signed_at", "scanned_copy"], order_by="signed_at desc")
	labs = frappe.get_all("Test Invoice", filters=scope, fields=["name", "status", "posting_date", "priority", "expected_at"], order_by="creation desc")
	for t in labs:
		t["items"] = frappe.get_all("Test Invoice Item", filters={"parent": t.name}, fields=["template", "status", "price", "result"])
	out["labs"] = labs
	out["summary"] = frappe.get_doc("Discharge Summary", adm.discharge_summary).as_dict() if adm.discharge_summary and clinical else None
	out["comms_active"] = cint(frappe.db.get_value("Patient Comms Profile", adm.comms_profile, "active")) if adm.comms_profile else 0
	from hospital_vvs.services.roster import on_duty

	out["on_duty"] = on_duty(adm.ward)
	return out


# ------------------------------------------------------------------ clinical records
@frappe.whitelist(methods=["POST"])
def add_note(data):
	require_roles(*CLINICAL, R.DEO)
	d = _d(data)
	adm, er = _target(d)
	src = frappe.get_doc("Bed Allotment" if adm else "ER Visit", adm or er)
	check_branch(src.branch)
	n = frappe.get_doc({"doctype": "IPD Note", "bed_allotment": adm, "er_visit": er or (src.get("er_visit") if adm else None), "patient": src.patient,
		"branch": src.branch, "note_type": d.get("note_type") or ("ER" if er else "Progress"), "note": d.get("note"), "doctor": d.get("doctor")})
	n.insert(ignore_permissions=True)
	n.submit()
	return n.name


@frappe.whitelist(methods=["POST"])
def add_round(data):
	require_roles(R.DOCTOR)
	d = _d(data)
	adm = ipd.get_open(d["bed_allotment"])
	w = frappe.get_doc({"doctype": "Ward Round", "bed_allotment": adm.name, "patient": adm.patient, "branch": adm.branch,
		"doctor": d.get("doctor") or frappe.db.get_value("Doctor", {"user": frappe.session.user}) or adm.admitting_doctor,
		"findings": d.get("findings"), "plan": d.get("plan"), "orders": d.get("orders")})
	w.insert(ignore_permissions=True)
	w.submit()
	return w.name


@frappe.whitelist(methods=["POST"])
def add_vitals(data):
	require_roles(*CLINICAL, R.DEO)
	d = _d(data)
	adm, er = _target(d)
	src = frappe.get_doc("Bed Allotment" if adm else "ER Visit", adm or er)
	check_branch(src.branch)
	keys = ("bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2", "resp_rate", "rbs", "pain_score", "gcs", "intake_ml", "output_ml", "note")
	from hospital_vvs.utils import check_vitals

	check_vitals(d)  # QA 2026-11-11: pulse 900 / 150 °F were accepted on the IPD chart
	v = frappe.get_doc({"doctype": "Vitals Chart", "bed_allotment": adm, "er_visit": er, "patient": src.patient, "branch": src.branch,
		**{k: d.get(k) for k in keys if d.get(k) not in (None, "")}})
	v.insert(ignore_permissions=True)
	return v.name


@frappe.whitelist()
def check_medicine(patient, item, dose=None, frequency=None, bed_allotment=None, er_visit=None):
	require_roles(*R.CLINICAL)
	from hospital_vvs.services import safety

	active = frappe.get_all("IPD Medication Order", filters=dict(ipd._scope(bed_allotment, er_visit), status="Active"), fields=["item", "dose",
		"frequency"]) if (bed_allotment or er_visit) else []
	return safety.check(patient, [{"item": item, "dose": dose, "frequency": frequency}] + [dict(a) for a in active])[0]


@frappe.whitelist(methods=["POST"])
def order_medicine(data):
	require_roles(R.DOCTOR)
	d = _d(data)
	adm, er = _target(d)
	patient = frappe.db.get_value("Bed Allotment" if adm else "ER Visit", adm or er, "patient")
	mo, alerts = ipd.order_medicine(patient=patient, item=d["item"], dose=d.get("dose") or "1", frequency=d.get("frequency") or "BD",
		route=d.get("route") or "Oral", units_per_dose=d.get("units_per_dose") or 1, times=d.get("times"), days=d.get("days") or 3,
		start_at=d.get("start_at"), doctor=d.get("doctor") or frappe.db.get_value("Doctor", {"user": frappe.session.user}),
		override_reason=d.get("override_reason"), adm=adm, er_visit=er, prn=cint(d.get("prn")))
	return {"name": mo.name, "alerts": alerts}


@frappe.whitelist(methods=["POST"])
def stop_order(name, reason):
	require_roles(R.DOCTOR)
	if not (reason or "").strip():
		frappe.throw(_("Enter the reason."))
	return ipd.stop_order(name, reason).name


@frappe.whitelist(methods=["POST"])
def chart_dose(name, status="Administered", reason=None):
	require_roles(R.NURSE, R.DOCTOR)
	return ipd.chart_dose(name, status, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def approve_dose(names):
	"""MAR gate: a doctor, or the nurse in charge of the shift, approves doses."""
	if not has_any_role(R.DOCTOR):
		from hospital_vvs.services.roster import on_duty

		heads = {r.user for r in on_duty() if r.hv_is_head_nurse}
		if frappe.session.user not in heads:
			require_roles(R.DOCTOR)
	names = frappe.parse_json(names) if isinstance(names, str) and names.startswith("[") else [names]
	return [ipd.approve_dose(n).name for n in names]


@frappe.whitelist(methods=["POST"])
def prn_dose(order, note=None):
	require_roles(R.NURSE, R.DOCTOR)
	return ipd.prn_dose(order, note).name


@frappe.whitelist()
def mar_board(branch=None, ward=None, hours=2):
	require_roles(R.NURSE, R.DOCTOR)
	branch = branch or default_branch()
	check_branch(branch)
	from hospital_vvs.services.roster import on_duty

	wards = frappe.get_all("Ward", filters={"branch": branch, "is_active": 1}, fields=["name", "ward_name", "color"], order_by="sort_order, ward_name")
	return {"doses": ipd.due_doses(branch, ward, cint(hours) or 2), "wards": wards, "gate": cint(setting("mar_approval_gate")),
		"on_duty": on_duty(ward, branch=branch)}


@frappe.whitelist(methods=["POST"])
def order_diet(data):
	require_roles(*CLINICAL)
	d = _d(data)
	return ipd.order_diet(d["bed_allotment"], d["diet_type"], d.get("diet_date"), d.get("meals"), d.get("instructions")).name


@frappe.whitelist(methods=["POST"])
def cancel_diet(name, reason):
	require_roles(*CLINICAL)
	return ipd.cancel_diet(name, reason).name


@frappe.whitelist()
def kitchen(branch=None, date=None):
	"""Diet list for the kitchen: today's orders by ward and bed."""
	require_roles(*CLINICAL, *DESK)
	branch = branch or default_branch()
	check_branch(branch)
	rows = frappe.db.sql("""select d.name, d.diet_type, d.breakfast, d.lunch, d.dinner, d.snacks, d.instructions, d.status, a.patient_name, a.ward, b.bed_no
		from `tabDiet Order` d join `tabBed Allotment` a on a.name=d.bed_allotment left join `tabHospital Bed` b on b.name=a.bed
		where d.branch=%s and d.diet_date=%s and d.status!='Cancelled' order by a.ward, b.bed_no""", (branch, date or today()), as_dict=True)
	return rows


@frappe.whitelist(methods=["POST"])
def schedule_procedure(data):
	require_roles(*CLINICAL)
	d = _d(data)
	adm, er = _target(d)
	pr = ipd.schedule_procedure(procedure_type=d["procedure_type"], scheduled_at=d.get("scheduled_at"), theatre=d.get("theatre"),
		anesthesia=d.get("anesthesia"), team=d.get("team"), pre_auth=d.get("pre_auth"), notes=d.get("notes"), adm=adm, er_visit=er)
	return pr.name


@frappe.whitelist(methods=["POST"])
def procedure_status(name, status, reason=None, notes=None):
	require_roles(*CLINICAL)
	return ipd.procedure_status(name, status, reason, notes).name


@frappe.whitelist(methods=["POST"])
def record_consent(data):
	require_roles(*CLINICAL, *DESK)
	d = _d(data)
	adm, er = _target(d)
	patient = frappe.db.get_value("Bed Allotment" if adm else "ER Visit", adm or er, "patient")
	cf = ipd.record_consent(patient=patient, consent_type=d.get("consent_type") or "Procedure", signer_name=d.get("signer_name"),
		witness_name=d.get("witness_name"), signed_by=d.get("signed_by") or "Patient", relation=d.get("relation"), witness_2=d.get("witness_2"),
		details=d.get("details"), scanned_copy=d.get("scanned_copy"), procedure=d.get("procedure"), adm=adm, er_visit=er)
	return cf.name


@frappe.whitelist(methods=["POST"])
def order_labs(data):
	require_roles(R.DOCTOR, R.NURSE, R.RECEPTIONIST)
	d = _d(data)
	adm, er = _target(d)
	tests = d.get("tests") or []
	return ipd.order_labs(tests, d.get("priority") or "Routine", d.get("doctor"), adm=adm, er_visit=er).name


@frappe.whitelist(methods=["POST"])
def add_charge(data):
	require_roles(*CLINICAL, *DESK)
	d = _d(data)
	adm, er = _target(d)
	ct = d.get("charge_type") or "Ad-hoc"
	if ct == "Oxygen":
		item, qty, rate = ipd.item_setting("oxygen_charge_item", "IPD-OXYGEN"), flt(d.get("qty")) or 1, flt(d.get("rate")) or flt(setting("oxygen_rate_per_hour"))
		desc = d.get("description") or _("Oxygen · {0} h").format(qty)
	else:
		item, qty, rate, desc = d.get("item_code") or ipd.item_setting("adhoc_charge_item", "IPD-ADHOC"), flt(d.get("qty")) or 1, d.get("rate"), d.get("description")
	if ct == "Consumable" and not frappe.get_cached_value("Item", item, "is_stock_item"):
		frappe.throw(_("Pick a stock item for a consumable."))
	if rate is not None and rate != "" and not has_any_role(R.RECEPTIONIST, R.ACCOUNTANT) and ct not in ("Oxygen",):
		rate = None  # clinical staff post at the price list rate
	ch = ipd.add_charge(charge_type=ct, item_code=item, qty=qty, rate=None if rate in (None, "") else flt(rate), description=desc, adm=adm, er_visit=er,
		stock=ct == "Consumable", note=d.get("note"))
	return ch.name


@frappe.whitelist(methods=["POST"])
def cancel_charge(name, reason):
	require_roles(R.RECEPTIONIST, R.ACCOUNTANT, R.CASH_SUPERVISOR)
	return ipd.cancel_charge(name, reason).name


@frappe.whitelist()
def search_items(q="", stock_only=0, limit=20):
	filters = {"disabled": 0}
	if cint(stock_only):
		filters["is_stock_item"] = 1
	return frappe.get_all("Item", filters=filters, or_filters={"item_name": ["like", f"%{q}%"], "name": ["like", f"%{q}%"]},
		fields=["name", "item_name", "stock_uom", "is_stock_item", "standard_rate", "hv_is_medicine", "hv_strength", "hv_dosage_form"], limit=cint(limit))


# ------------------------------------------------------------------ bill
def _print_header(adm):
	s = settings()
	branch = frappe.db.get_value("Branch", adm.branch, ["hv_address", "hv_phone"], as_dict=True) or {}
	return {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "address": branch.get("hv_address") or s.address, "phone": branch.get("hv_phone") or s.phone,
		"logo": s.logo}


@frappe.whitelist()
def bill(name=None, er_visit=None):
	require_roles(*BILL, *CLINICAL)
	if name:
		adm = frappe.get_doc("Bed Allotment", name)
		check_branch(adm.branch)
		b = ipd.running_bill(name)
		pat = frappe.db.get_value("Patient", adm.patient, ["name", "patient_name", "gender", "dob", "phone", "category"], as_dict=True)
		b.update({"admission": {k: adm.get(k) for k in ("name", "status", "admit_datetime", "release_datetime", "ward", "doctor_name", "payer_type", "payer",
			"pre_auth", "service_package", "discount_amount", "discount_authorization", "final_invoice", "payer_invoice", "discharge_type",
			"expected_discharge", "branch")}, "patient": pat, "bed_no": frappe.db.get_value("Hospital Bed", adm.bed, "bed_no"), "clinic": _print_header(adm),
			"days": ipd.midnights(adm.admit_datetime, adm.release_datetime or now_datetime()), "coverage_percent": adm.coverage_percent,
			"pre_auth_amount": flt(frappe.db.get_value("Insurance Pre-Auth", adm.pre_auth, "approved_amount")) if adm.pre_auth else 0})
		return b
	er = frappe.get_doc("ER Visit", er_visit)
	check_branch(er.branch)
	b = ipd.running_bill(er_visit=er_visit)
	b.update({"er": {k: er.get(k) for k in ("name", "status", "arrival_at", "disposition", "billing_mode", "sales_invoice")},
		"patient": frappe.db.get_value("Patient", er.patient, ["name", "patient_name", "gender", "phone"], as_dict=True), "clinic": _print_header(er)})
	return b


@frappe.whitelist(methods=["POST"])
def request_discount(name, amount, reason):
	require_roles(*BILL)
	adm = ipd.get_open(name)
	b = ipd.running_bill(name)
	auth = discounts.request(billing_type="IPD Slip", gross=b["net"], discount_amount=flt(amount), reason=reason, branch=adm.branch, patient=adm.patient,
		reference_doctype="Bed Allotment", reference_name=adm.name)
	return {"name": auth.name, "status": auth.status, "percent": auth.discount_percent}


@frappe.whitelist(methods=["POST"])
def apply_discount(name, discount_authorization):
	"""Attach an approved discount to the admission; it is taken off when the final bill is made."""
	require_roles(*BILL)
	adm = ipd.get_open(name)
	if adm.final_invoice:
		frappe.throw(_("The final bill is already made."))
	auth = frappe.db.get_value("Discount Authorization", discount_authorization, ["discount_amount", "reference_name", "patient"], as_dict=True)
	if not auth or (auth.reference_name and auth.reference_name != adm.name) or (auth.patient and auth.patient != adm.patient):
		frappe.throw(_("This discount belongs to another bill."))
	discounts.assert_usable(discount_authorization, auth.discount_amount)
	adm.db_set({"discount_amount": flt(auth.discount_amount), "discount_authorization": discount_authorization})
	return adm.name


@frappe.whitelist(methods=["POST"])
def take_payment(amount, payment_mode="Cash", purpose="Advance", name=None, er_visit=None, cash_tendered=None):
	require_roles(R.RECEPTIONIST, R.CASH_SUPERVISOR)
	return ipd.take_payment(amount, payment_mode, purpose, adm=name, er_visit=er_visit if not name else None, cash_tendered=cash_tendered)


# ------------------------------------------------------------------ discharge
@frappe.whitelist(methods=["POST"])
def start_discharge(name, discharge_type="Normal"):
	require_roles(R.DOCTOR, R.NURSE)
	return ipd.start_discharge(name, discharge_type).name


@frappe.whitelist(methods=["POST"])
def sign_summary(name, data):
	require_roles(R.DOCTOR)
	return ipd.sign_summary(name, _d(data)).name


@frappe.whitelist()
def clearance(name):
	require_roles(*CLINICAL, *BILL)
	adm = frappe.get_doc("Bed Allotment", name)
	check_branch(adm.branch)
	out = ipd.clearance(name)
	out.pop("bill", None)
	return out


@frappe.whitelist(methods=["POST"])
def final_bill(name, discount_amount=0, discount_authorization=None, override_reason=None):
	require_roles(*BILL)
	if (override_reason or "").strip():
		require_roles(R.DOCTOR, R.CASH_SUPERVISOR, R.ACCOUNTANT)
	return ipd.make_final_bill(name, discount_amount, discount_authorization, override_reason)


@frappe.whitelist(methods=["POST"])
def cancel_final_bill(name, reason):
	require_roles(R.ACCOUNTANT, R.CASH_SUPERVISOR)
	return ipd.cancel_final_bill(name, reason).name


@frappe.whitelist(methods=["POST"])
def complete_discharge(name, override_reason=None):
	require_roles(R.RECEPTIONIST, R.NURSE, R.DOCTOR)
	if (override_reason or "").strip():
		require_roles(R.DOCTOR, R.CASH_SUPERVISOR)
	return ipd.complete_discharge(name, override_reason).name


@frappe.whitelist()
def summary_print(name):
	require_roles(*CLINICAL, R.RECEPTIONIST)
	adm = frappe.get_doc("Bed Allotment", name)
	check_branch(adm.branch)
	if not adm.discharge_summary:
		frappe.throw(_("No discharge summary yet."))
	ds = frappe.get_doc("Discharge Summary", adm.discharge_summary)
	log_access("Discharge summary", patient=adm.patient, reference_doctype="Discharge Summary", reference_name=ds.name, branch=adm.branch)
	doc = frappe.db.get_value("Doctor", ds.doctor, ["doctor_name", "qualification", "registration_no", "specialization"], as_dict=True)
	pat = frappe.db.get_value("Patient", adm.patient, ["name", "patient_name", "gender", "dob", "phone", "guardian_name", "relation_type"], as_dict=True)
	from hospital_vvs.api.patients import age_of

	pat["age"] = age_of(pat.dob)
	procs = frappe.get_all("IPD Procedure", filters={"bed_allotment": adm.name, "status": "Completed"}, fields=["procedure_type", "completed_at"])
	return {"summary": ds.as_dict(), "doctor": doc, "patient": pat, "clinic": _print_header(adm), "admission": {"name": adm.name,
		"admit_datetime": adm.admit_datetime, "release_datetime": adm.release_datetime, "ward": adm.ward, "bed_no": frappe.db.get_value("Hospital Bed",
		adm.bed, "bed_no"), "days": ipd.midnights(adm.admit_datetime, adm.release_datetime or now_datetime())}, "procedures": procs}


# ------------------------------------------------------------------ pre-auth (minimal for admissions; claims are Phase 6)
@frappe.whitelist()
def pre_auths(patient=None, status=None):
	require_roles(*DESK, R.ACCOUNTANT, R.DOCTOR)
	filters = {}
	if patient:
		filters["patient"] = patient
	if status:
		filters["status"] = status
	return frappe.get_all("Insurance Pre-Auth", filters=filters, fields=["name", "patient", "patient_name", "payer", "status", "requested_amount",
		"approved_amount", "approval_no", "valid_till", "bed_allotment", "procedure_type", "creation"], order_by="creation desc", limit=100)


@frappe.whitelist(methods=["POST"])
def save_pre_auth(data):
	require_roles(*DESK, R.ACCOUNTANT)
	d = _d(data)
	pa = frappe.get_doc({"doctype": "Insurance Pre-Auth", "patient": d["patient"], "payer": d["payer"], "policy_no": d.get("policy_no"),
		"procedure_type": d.get("procedure_type"), "requested_amount": flt(d.get("requested_amount")), "notes": d.get("notes"),
		"documents": d.get("documents"), "status": "Requested"})
	pa.insert(ignore_permissions=True)
	return pa.name


@frappe.whitelist(methods=["POST"])
def decide_pre_auth(name, status, approved_amount=0, approval_no=None, valid_till=None, notes=None):
	require_roles(R.ACCOUNTANT)
	if status not in ("Approved", "Partially Approved", "Rejected", "Expired"):
		frappe.throw(_("Unknown status."))
	if status in ("Approved", "Partially Approved") and (not flt(approved_amount) or not approval_no):
		frappe.throw(_("Enter the approved amount and the approval number."))
	frappe.db.set_value("Insurance Pre-Auth", name, {"status": status, "approved_amount": flt(approved_amount), "approval_no": approval_no,
		"valid_till": valid_till, "decided_on": today(), "notes": notes})
	return name


# ------------------------------------------------------------------ reports (/ipd_report)
@frappe.whitelist()
def report(branch=None, from_date=None, to_date=None):
	require_roles(R.ADMIN, R.DOCTOR, R.RECEPTIONIST, R.ACCOUNTANT)
	branch = branch or default_branch()
	check_branch(branch)
	to_date = getdate(to_date or today())
	from_date = getdate(from_date or add_days(to_date, -29))
	args = {"b": branch, "f": from_date, "t": to_date}
	beds = frappe.db.count("Hospital Bed", {"branch": branch, "is_active": 1})
	census = frappe.db.sql("""select w.name ward, w.ward_type, count(b.name) beds, sum(b.status='Occupied') occupied from tabWard w
		left join `tabHospital Bed` b on b.ward=w.name and b.is_active=1 where w.branch=%(b)s group by w.name order by w.sort_order, w.name""", args, as_dict=True)
	adm = frappe.db.sql("""select date(admit_datetime) d, count(*) n from `tabBed Allotment` where branch=%(b)s and status!='Cancelled'
		and date(admit_datetime) between %(f)s and %(t)s group by d order by d""", args, as_dict=True)
	dis = frappe.db.sql("""select date(release_datetime) d, count(*) n from `tabBed Allotment` where branch=%(b)s and status='Discharged'
		and date(release_datetime) between %(f)s and %(t)s group by d order by d""", args, as_dict=True)
	stays = frappe.db.sql("""select admit_datetime, release_datetime, discharge_type, source, payer_type, admitting_doctor, doctor_name
		from `tabBed Allotment` where branch=%(b)s and status='Discharged' and date(release_datetime) between %(f)s and %(t)s""", args, as_dict=True)
	alos = round(sum(max(ipd.midnights(s.admit_datetime, s.release_datetime), 1) for s in stays) / len(stays), 1) if stays else 0
	revenue = frappe.db.sql("""select c.charge_type, sum(c.amount) amount from `tabIPD Charge` c where c.branch=%(b)s and c.status='Billed'
		and date(c.posted_at) between %(f)s and %(t)s group by c.charge_type order by amount desc""", args, as_dict=True)
	outstanding = frappe.db.sql("""select a.name, a.patient, a.patient_name, a.payer_type, a.payer, si.outstanding_amount patient_due,
		ifnull(pi.outstanding_amount,0) payer_due, a.release_datetime from `tabBed Allotment` a join `tabSales Invoice` si on si.name=a.final_invoice
		left join `tabSales Invoice` pi on pi.name=a.payer_invoice where a.branch=%(b)s and (si.outstanding_amount>0 or ifnull(pi.outstanding_amount,0)>0)
		order by a.release_datetime desc limit 100""", args, as_dict=True)
	by_type = {}
	for s in stays:
		by_type[s.discharge_type or "Normal"] = by_type.get(s.discharge_type or "Normal", 0) + 1
	doctors = {}
	for s in stays:
		doctors[s.doctor_name or "-"] = doctors.get(s.doctor_name or "-", 0) + 1
	er = frappe.db.sql("""select ifnull(triage_level,'Not triaged') level, ifnull(disposition,'Open') disposition, count(*) n,
		avg(timestampdiff(minute, arrival_at, ifnull(disposition_at, now()))) minutes from `tabER Visit` where branch=%(b)s
		and date(arrival_at) between %(f)s and %(t)s group by level, disposition""", args, as_dict=True)
	occupied = sum(cint(c.occupied) for c in census)
	return {"branch": branch, "from": str(from_date), "to": str(to_date), "beds": beds, "occupied": occupied,
		"occupancy": round(occupied * 100 / beds, 1) if beds else 0, "census": census, "admissions": adm, "discharges": dis, "alos": alos,
		"discharged": len(stays), "revenue": revenue, "outstanding": outstanding, "discharge_types": by_type,
		"doctors": sorted(({"doctor": k, "n": v} for k, v in doctors.items()), key=lambda x: -x["n"]), "er": er,
		"days": date_diff(to_date, from_date) + 1}
