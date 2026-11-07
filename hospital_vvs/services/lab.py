"""Laboratory (03-lab.md): orders, samples, results, critical values, verification, release, report links, outsourcing."""

import hashlib
import hmac
import json
import secrets

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, getdate, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.services import billing, discounts, messaging
from hospital_vvs.utils import branch_company, has_any_role, publish, setting

LAB_ITEM_GROUP = "Laboratory Tests"


# ------------------------------------------------------------------ templates
def ensure_template_item(t):
	"""Each Lab Test Template is sold through a non-stock Item (billing type Lab) priced from the template."""
	if not frappe.db.exists("Item Group", LAB_ITEM_GROUP):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": LAB_ITEM_GROUP, "parent_item_group": "All Item Groups"}).insert(ignore_permissions=True)
	code = f"LAB-{t.test_code}".upper()
	if not frappe.db.exists("Item", code):
		frappe.get_doc({"doctype": "Item", "item_code": code, "item_name": t.test_name, "item_group": LAB_ITEM_GROUP, "stock_uom": "Nos",
			"is_stock_item": 0, "include_item_in_manufacturing": 0, "hv_billing_type": "Lab"}).insert(ignore_permissions=True)
	price = frappe.db.get_value("Item Price", {"item_code": code, "price_list": "Standard Selling"})
	if price:
		frappe.db.set_value("Item Price", price, "price_list_rate", flt(t.price))
	elif flt(t.price):
		frappe.get_doc({"doctype": "Item Price", "item_code": code, "price_list": "Standard Selling", "price_list_rate": flt(t.price)}).insert(ignore_permissions=True)
	return code


def match_template(name):
	n = (name or "").strip()
	return frappe.db.get_value("Lab Test Template", {"name": n}) or frappe.db.get_value("Lab Test Template", {"test_code": n.upper()}) \
		or frappe.db.get_value("Lab Test Template", {"test_name": ["like", n]})


# ------------------------------------------------------------------ orders
def create_order(patient, tests, branch, referring_doctor=None, prescription=None, opd_slip=None, priority="Routine", external_referrer=None):
	if not tests:
		frappe.throw(_("Choose at least one test."))
	ti = frappe.get_doc({"doctype": "Test Invoice", "patient": patient, "branch": branch, "posting_date": today(), "referring_doctor": referring_doctor,
		"external_referrer": external_referrer, "prescription": prescription, "opd_slip": opd_slip, "priority": priority, "status": "Ordered",
		"items": [{"template": t} for t in tests]})
	ti.insert(ignore_permissions=True)
	return ti


def pay(name, payment_mode="Cash", discount_amount=0, discount_reason=None, discount_authorization=None, cash_tendered=None):
	"""Bill the order on the Lab POS Profile (in the collector's shift), then create samples and send the thank-you."""
	ti = frappe.get_doc("Test Invoice", name)
	if ti.status not in ("Ordered", "Draft"):
		frappe.throw(_("This order is already {0}.").format(ti.status))
	ti.payment_mode, ti.cash_tendered = payment_mode, cash_tendered
	if flt(discount_amount):
		discounts.assert_usable(discount_authorization, discount_amount)
		ti.discount_amount, ti.discount_authorization = flt(discount_amount), discount_authorization
	ti.save(ignore_permissions=True)
	customer = frappe.db.get_value("Patient", ti.patient, "customer")
	lines = [{"item_code": frappe.db.get_value("Lab Test Template", r.template, "item") or ensure_template_item(frappe.get_doc("Lab Test Template", r.template)),
		"qty": 1, "rate": flt(r.price)} for r in ti.items]
	if flt(ti.net_total):
		fraction = flt(ti.patient_share) / flt(ti.net_total) if flt(ti.net_total) else 1
		if flt(ti.patient_share):
			si = billing.create_invoice(customer=customer, patient=ti.patient, lines=billing.split_lines(lines, fraction) if ti.payer_share else lines,
				billing_type="Lab", branch=ti.branch, reference_doctype="Test Invoice", reference_name=ti.name,
				discount_amount=flt(ti.discount_amount) * fraction, payment_mode=payment_mode)
			ti.db_set("sales_invoice", si)
			from hospital_vvs.opd.doctype.opd_slip.opd_slip import shift_of

			ti.db_set("pos_opening_entry", shift_of(si))
		if flt(ti.payer_share):
			ti.db_set("payer_invoice", billing.create_invoice(customer=ti.payer, patient=ti.patient, lines=billing.split_lines(lines, 1 - fraction),
				billing_type="Lab", branch=ti.branch, reference_doctype="Test Invoice", reference_name=ti.name, pos=False, payer=True,
				payer_share_of=ti.sales_invoice, discount_amount=flt(ti.discount_amount) * (1 - fraction),
				remarks=_("{0} share of lab order {1}").format(ti.payer_type, ti.name)))
	if discount_authorization:
		discounts.mark_used(discount_authorization, "Test Invoice", ti.name)
	ti.reload()
	ti.status = "Paid"
	ti.expected_at = expected_time(max((flt(r.tat_hours) for r in ti.items), default=24))
	ti.save(ignore_permissions=True)
	make_samples(ti)
	if cint(setting("lab_send_thank_you")) and ti.whatsapp_opt_in:
		messaging.send("lab_thank_you", patient=ti.patient, phone=ti.whatsapp_number, reference_doctype="Test Invoice", reference_name=ti.name,
			consent=True, context={"ref": ti.name, "tat": frappe.utils.format_datetime(ti.expected_at, "dd MMM, hh:mm a"), "tests": len(ti.items)})
	publish("lab", {"action": "paid", "test_invoice": ti.name}, ti.branch)
	return ti


def expected_time(hours):
	"""Now + TAT, moved past lab closing time to the next opening (lab working hours from settings)."""
	t = add_to_date(now_datetime(), hours=flt(hours))
	open_t = str(setting("lab_open_time") or "08:00:00")
	close_t = str(setting("lab_close_time") or "22:00:00")
	day_close = get_datetime(f"{t.date()} {close_t}")
	day_open = get_datetime(f"{t.date()} {open_t}")
	if t > day_close:
		t = get_datetime(f"{add_to_date(t, days=1).date()} {open_t}") + (t - day_close)
	elif t < day_open:
		t = day_open + (t - get_datetime(f"{t.date()} 00:00:00"))
	return t


def make_samples(ti):
	"""One sample per sample type + container (outsourced tests get their own)."""
	groups = {}
	for r in ti.items:
		if r.sample:
			continue
		tpl = frappe.get_cached_doc("Lab Test Template", r.template)
		key = (tpl.sample_type, tpl.container, cint(tpl.outsourced))
		groups.setdefault(key, []).append((r, tpl))
	pat = frappe.db.get_value("Patient", ti.patient, "patient_name")
	for (stype, container, _o), rows in groups.items():
		s = frappe.get_doc({"doctype": "Lab Sample", "test_invoice": ti.name, "patient": ti.patient, "patient_name": pat, "branch": ti.branch,
			"sample_type": stype, "container": container, "status": "Pending",
			"tests": [{"template": r.template, "test_code": tpl.test_code, "invoice_item": r.name} for r, tpl in rows]}).insert(ignore_permissions=True)
		for r, _t in rows:
			frappe.db.set_value("Test Invoice Item", r.name, "sample", s.name)


def _set_items(sample, status):
	for t in sample.tests:
		cur = frappe.db.get_value("Test Invoice Item", t.invoice_item, "status")
		if cur not in ("Verified", "Released", "Cancelled"):
			frappe.db.set_value("Test Invoice Item", t.invoice_item, "status", status)


def _invoice_progress(ti_name):
	ti = frappe.get_doc("Test Invoice", ti_name)
	if ti.status in ("Paid",) and any(r.status not in ("Ordered",) for r in ti.items):
		ti.db_set("status", "In Progress")


def collect(sample_name):
	s = frappe.get_doc("Lab Sample", sample_name)
	if s.status not in ("Pending",):
		frappe.throw(_("Sample {0} is {1}.").format(s.name, s.status))
	s.update({"status": "Collected", "collected_by": frappe.session.user, "collected_at": now_datetime()})
	s.save(ignore_permissions=True)
	_set_items(s, "Collected")
	_invoice_progress(s.test_invoice)
	publish("lab", {"action": "collected", "sample": s.name}, s.branch)
	return s


def receive(sample_name):
	s = frappe.get_doc("Lab Sample", sample_name)
	if s.status == "Pending":
		collect(sample_name)
		s.reload()
	if s.status != "Collected":
		frappe.throw(_("Sample {0} is {1}.").format(s.name, s.status))
	s.update({"status": "Received", "received_by": frappe.session.user, "received_at": now_datetime()})
	s.save(ignore_permissions=True)
	_set_items(s, "Received")
	publish("lab", {"action": "received", "sample": s.name}, s.branch)
	return s


def reject(sample_name, reason, note=None):
	"""Rejected → a new sample for the same tests appears in the collection queue."""
	if not reason:
		frappe.throw(_("Choose the rejection reason."))
	s = frappe.get_doc("Lab Sample", sample_name)
	if s.status in ("Rejected",):
		frappe.throw(_("Already rejected."))
	new = frappe.copy_doc(s)
	new.update({"status": "Pending", "collected_by": None, "collected_at": None, "received_by": None, "received_at": None, "rejection_reason": None,
		"rejection_note": None, "recollect_of": s.name, "recollect_sample": None})
	new.insert(ignore_permissions=True)
	s.update({"status": "Rejected", "rejection_reason": reason, "rejection_note": note, "recollect_sample": new.name})
	s.save(ignore_permissions=True)
	for t in new.tests:
		frappe.db.set_value("Test Invoice Item", t.invoice_item, {"sample": new.name, "status": "Ordered"})
	publish("lab", {"action": "rejected", "sample": s.name, "recollect": new.name}, s.branch)
	return new


# ------------------------------------------------------------------ results
def _ranges(template, gender, age):
	"""First matching range row per parameter (gender + age), in template order."""
	out = {}
	for r in frappe.get_cached_doc("Lab Test Template", template).parameters:
		if r.parameter in out:
			continue
		if r.gender not in ("All", gender):
			continue
		if (r.age_from and age is not None and age < flt(r.age_from)) or (r.age_to and age is not None and age > flt(r.age_to)):
			continue
		out[r.parameter] = r
	# parameters with only non-matching rows still appear (no range)
	for r in frappe.get_cached_doc("Lab Test Template", template).parameters:
		out.setdefault(r.parameter, None)
	return out


def flag(value, rng):
	try:
		v = float(str(value).strip())
	except (TypeError, ValueError):
		if rng and rng.normal_text and str(value).strip() and str(value).strip().lower() != rng.normal_text.lower():
			return "Abnormal"
		return ""
	if rng is None:
		return ""
	if rng.critical_low and v < flt(rng.critical_low):
		return "Critical Low"
	if rng.critical_high and v > flt(rng.critical_high):
		return "Critical High"
	if (rng.normal_low or rng.normal_low == 0) and rng.normal_high and v < flt(rng.normal_low):
		return "Low"
	if rng.normal_high and v > flt(rng.normal_high):
		return "High"
	return ""


def previous_values(patient, template, exclude=None):
	name = frappe.db.get_value("Lab Result", {"patient": patient, "template": template, "docstatus": 1, "status": "Verified",
		"name": ["!=", exclude or ""]}, "name", order_by="verified_at desc")
	if not name:
		return {}, None
	d = frappe.get_doc("Lab Result", name)
	return {v.parameter: v.value for v in d.get("values")}, getdate(d.verified_at) if d.verified_at else None


def result_for(invoice_item):
	return frappe.db.get_value("Lab Result", {"invoice_item": invoice_item, "docstatus": ["<", 2]}, "name", order_by="creation desc")


def enter_results(invoice_item, values=None, text_result=None, attachment=None):
	"""Create / update the result of one ordered test. values: {parameter: value}. Flags are computed here."""
	row = frappe.get_doc("Test Invoice Item", invoice_item)
	ti = frappe.get_doc("Test Invoice", row.parent)
	tpl = frappe.get_cached_doc("Lab Test Template", row.template)
	if row.status in ("Ordered", "Collected") and not tpl.outsourced:
		frappe.throw(_("The sample for {0} has not been received in the lab yet.").format(tpl.test_name))
	pat = frappe.db.get_value("Patient", ti.patient, ["gender", "dob"], as_dict=True)
	from hospital_vvs.api.patients import age_of

	age = age_of(pat.dob)
	name = result_for(invoice_item)
	res = frappe.get_doc("Lab Result", name) if name else frappe.new_doc("Lab Result")
	if res.docstatus == 1:
		frappe.throw(_("This result is verified. Amend it to change values."))
	prev, prev_date = previous_values(ti.patient, row.template, exclude=res.name)
	rngs = _ranges(row.template, pat.gender, age)
	values = values or {}
	res.update({"test_invoice": ti.name, "invoice_item": row.name, "template": row.template, "test_name": tpl.test_name, "department": tpl.department,
		"patient": ti.patient, "patient_name": ti.patient_name, "gender": pat.gender, "age": age, "sample": row.sample, "branch": ti.branch,
		"result_type": tpl.result_type, "text_result": text_result if text_result is not None else (res.text_result or tpl.text_template),
		"attachment": attachment or res.attachment, "status": "Result Entered", "entered_by": frappe.session.user, "entered_at": now_datetime()})
	res.set("values", [])
	critical = False
	for param, rng in rngs.items():
		val = values.get(param, "")
		fl = flag(val, rng) if str(val).strip() != "" else ""
		critical = critical or fl.startswith("Critical")
		rtxt = ""
		if rng:
			rtxt = rng.normal_text or (f"{flt(rng.normal_low):g} – {flt(rng.normal_high):g}" if rng.normal_high else "")
		res.append("values", {"parameter": param, "value": val, "unit": rng.unit if rng else "", "normal_range": rtxt, "flag": fl,
			"normal_low": rng.normal_low if rng else None, "normal_high": rng.normal_high if rng else None, "critical_low": rng.critical_low if rng else None,
			"critical_high": rng.critical_high if rng else None, "normal_text": rng.normal_text if rng else None,
			"previous_value": prev.get(param), "previous_date": prev_date})
	was_critical_logged = res.critical_logged
	res.has_critical = int(critical)
	res.critical_logged = int(critical and was_critical_logged)
	res.flags.ignore_permissions = True
	res.save()
	frappe.db.set_value("Test Invoice Item", row.name, {"result": res.name, "status": "Result Entered"})
	_invoice_progress(ti.name)
	if critical:
		alert_critical(res, ti)
	elif tpl.auto_verify and cint(setting("lab_auto_verify")) and all(not v.flag for v in res.get("values")) and res.get("values"):
		verify(res.name, interpretation=_("Auto-verified: all values within range"), auto=True)
	publish("lab", {"action": "result", "result": res.name, "critical": critical}, ti.branch)
	return res


def alert_critical(res, ti):
	doctor = ti.referring_doctor
	user = frappe.db.get_value("Doctor", doctor, "user") if doctor else None
	crit = [f"{v.parameter} {v.value} {v.unit or ''} ({v.flag})" for v in res.get("values") if (v.flag or "").startswith("Critical")]
	payload = {"result": res.name, "patient": res.patient_name, "mr": res.patient, "test": res.test_name, "values": crit, "doctor": doctor}
	frappe.publish_realtime("hv:critical_value", payload, user=user, after_commit=True) if user else None
	publish("critical_value", payload, ti.branch)
	if user:
		frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "document_type": "Lab Result", "document_name": res.name,
			"subject": f"CRITICAL: {res.patient_name} ({res.patient}) — {res.test_name}: {'; '.join(crit)}"}).insert(ignore_permissions=True)


def log_critical(result, notified_person, method, read_back=0, note=None, parameter=None, doctor=None):
	res = frappe.get_doc("Lab Result", result)
	if not res.has_critical:
		frappe.throw(_("This result has no critical value."))
	crit = [v for v in res.get("values") if (v.flag or "").startswith("Critical")]
	v = next((x for x in crit if x.parameter == parameter), crit[0] if crit else None)
	log = frappe.get_doc({"doctype": "Critical Value Log", "lab_result": res.name, "patient": res.patient, "parameter": v.parameter if v else parameter,
		"value": v.value if v else None, "flag": v.flag if v else None, "doctor": doctor or frappe.db.get_value("Test Invoice", res.test_invoice, "referring_doctor"),
		"notified_person": notified_person, "method": method, "read_back": cint(read_back), "notified_by": frappe.session.user,
		"notified_at": now_datetime(), "note": note}).insert(ignore_permissions=True)
	frappe.db.set_value("Lab Result", res.name, "critical_logged", 1)
	return log


def verify(result, interpretation=None, auto=False):
	if not auto and not has_any_role(R.PATHOLOGIST):
		frappe.throw(_("Only the pathologist verifies results."), frappe.PermissionError)
	res = frappe.get_doc("Lab Result", result)
	if res.status != "Result Entered":
		frappe.throw(_("Result is {0}.").format(res.status))
	if res.has_critical and not res.critical_logged:
		frappe.throw(_("Record who was told about the critical value (Critical Value Log) before verifying."), title=_("Critical value"))
	res.interpretation = interpretation or res.interpretation
	res.verified_by = "Administrator" if auto else frappe.session.user
	res.verified_at = now_datetime()
	res.status = "Verified"
	res.flags.ignore_permissions = True
	res.submit()
	frappe.db.set_value("Test Invoice Item", res.invoice_item, {"status": "Verified", "result": res.name})
	if res.amended_from:
		frappe.db.set_value("Lab Result", res.amended_from, "status", "Superseded")
		ti = frappe.get_doc("Test Invoice", res.test_invoice)
		if ti.status in ("Released", "Partially Released"):
			release(ti.name, updated=True, partial=ti.status == "Partially Released")
	return res


def send_back(result, reason):
	if not has_any_role(R.PATHOLOGIST):
		frappe.throw(_("Only the pathologist sends results back."), frappe.PermissionError)
	res = frappe.get_doc("Lab Result", result)
	if res.docstatus != 0:
		frappe.throw(_("Only an unverified result can be sent back."))
	res.status, res.send_back_reason = "Sent Back", reason
	res.save(ignore_permissions=True)
	frappe.db.set_value("Test Invoice Item", res.invoice_item, "status", "Received")
	return res


def amend(result, reason):
	if not has_any_role(R.PATHOLOGIST, R.LAB_USER):
		frappe.throw(_("Not permitted."), frappe.PermissionError)
	if not (reason or "").strip():
		frappe.throw(_("Enter the reason for the amendment."))
	old = frappe.get_doc("Lab Result", result)
	if old.docstatus != 1:
		frappe.throw(_("Only a verified result can be amended."))
	old.flags.ignore_permissions = True
	old.flags.ignore_links = True
	old.cancel()
	new = frappe.copy_doc(old)
	new.docstatus = 0
	new.amended_from = old.name
	new.amendment_reason = reason
	new.version_no = cint(old.version_no) + 1
	new.status = "Result Entered"
	new.verified_by = new.verified_at = None
	new.critical_logged = 0 if new.has_critical else new.critical_logged
	new.insert(ignore_permissions=True)
	frappe.db.set_value("Lab Result", old.name, "status", "Superseded")
	frappe.db.set_value("Test Invoice Item", new.invoice_item, {"status": "Result Entered", "result": new.name})
	return new


# ------------------------------------------------------------------ release + report link
def release(name, partial=False, updated=False):
	ti = frappe.get_doc("Test Invoice", name)
	verified = [r for r in ti.items if r.status in ("Verified", "Released")]
	active = [r for r in ti.items if r.status not in ("Cancelled", "Rejected")]
	if not verified:
		frappe.throw(_("No verified result to release."))
	is_partial = len(verified) < len(active)
	if is_partial and not (partial and cint(setting("lab_allow_partial_release"))):
		frappe.throw(_("{0} of {1} tests are verified. Partial release is off in Clinic Settings.").format(len(verified), len(active)))
	for r in verified:
		frappe.db.set_value("Test Invoice Item", r.name, "status", "Released")
	ti.reload()
	ti.status = "Partially Released" if is_partial else "Released"
	ti.released_at = now_datetime()
	ti.report_version = cint(ti.report_version) + 1
	ti.save(ignore_permissions=True)
	link = new_report_link(ti)
	if cint(setting("lab_send_report_ready")) and ti.whatsapp_opt_in:
		messaging.send("lab_report_updated" if updated else "lab_report_ready", patient=ti.patient, phone=ti.whatsapp_number, consent=True,
			reference_doctype="Test Invoice", reference_name=ti.name, context={"ref": ti.name, "link": link})
	publish("lab", {"action": "released", "test_invoice": ti.name}, ti.branch)
	return {"status": ti.status, "link": link}


def _hash(token):
	return hashlib.sha256(token.encode()).hexdigest()


def new_report_link(ti):
	"""Random URL-safe token (only its hash is stored); earlier links for this order are revoked."""
	for t in frappe.get_all("Lab Report Access Token", filters={"test_invoice": ti.name, "revoked": 0}, pluck="name"):
		frappe.db.set_value("Lab Report Access Token", t, "revoked", 1)
	token = secrets.token_urlsafe(32)
	frappe.get_doc({"doctype": "Lab Report Access Token", "test_invoice": ti.name, "patient": ti.patient, "token_hash": _hash(token),
		"version": ti.report_version, "expires_at": add_to_date(now_datetime(), hours=cint(setting("report_link_hours")) or 72),
		"max_downloads": cint(setting("report_max_downloads")) or 5, "created_by": frappe.session.user}).insert(ignore_permissions=True)
	return f"{frappe.utils.get_url()}/hms/lab-report/{token}"


def revoke_links(ti_name):
	for t in frappe.get_all("Lab Report Access Token", filters={"test_invoice": ti_name, "revoked": 0}, pluck="name"):
		frappe.db.set_value("Lab Report Access Token", t, "revoked", 1)


def token_doc(token):
	"""Look up by hash, constant-time compare, and check expiry / revoke / lock."""
	h = _hash(token or "")
	name = frappe.db.get_value("Lab Report Access Token", {"token_hash": h}, "name")
	if not name:
		return None, "This link is not valid."
	t = frappe.get_doc("Lab Report Access Token", name)
	if not hmac.compare_digest(t.token_hash, h):
		return None, "This link is not valid."
	if t.revoked:
		return None, "This link was replaced by a newer one or withdrawn by the lab."
	if get_datetime(t.expires_at) < now_datetime():
		return None, "This link has expired."
	if cint(t.download_count) >= cint(t.max_downloads):
		return None, "This link has reached its download limit."
	return t, None


def log_token_access(t, what):
	ip = getattr(frappe.local, "request_ip", "")
	t.last_accessed_at = now_datetime()
	t.last_ip = ip
	t.access_log = ((t.access_log or "") + f"\n{now_datetime():%Y-%m-%d %H:%M:%S} {ip} {what}")[-4000:]
	t.save(ignore_permissions=True)


def check_answer(t, answer):
	"""Patient verification: last 4 digits of the phone or year of birth; 5 wrong tries lock the link for 15 minutes."""
	if not cint(setting("report_require_verification")) or t.verified:
		return True
	if t.locked_until and get_datetime(t.locked_until) > now_datetime():
		frappe.throw(_("Too many wrong tries. Try again after 15 minutes."))
	pat = frappe.db.get_value("Patient", t.patient, ["phone", "dob"], as_dict=True)
	if setting("report_verification_method") == "Year of birth":
		expected = str(getdate(pat.dob).year) if pat.dob else ""
	else:
		expected = (pat.phone or "")[-4:]
	if expected and hmac.compare_digest(str(answer or "").strip(), expected):
		t.verified, t.failed_attempts = 1, 0
		log_token_access(t, "verified")
		return True
	t.failed_attempts = cint(t.failed_attempts) + 1
	if t.failed_attempts >= 5:
		t.locked_until = add_to_date(now_datetime(), minutes=15)
		t.failed_attempts = 0
	log_token_access(t, "wrong answer")
	frappe.db.commit()
	frappe.throw(_("That does not match our records."))


# ------------------------------------------------------------------ report data + PDF
def report_data(ti_name, include_all=False):
	ti = frappe.get_doc("Test Invoice", ti_name)
	s = frappe.get_cached_doc("Clinic Settings")
	pat = frappe.db.get_value("Patient", ti.patient, ["patient_name", "patient_name_ur", "gender", "dob", "phone"], as_dict=True)
	from hospital_vvs.api.patients import age_of

	tests = []
	for r in ti.items:
		if not include_all and r.status != "Released":
			tests.append({"test_name": frappe.db.get_value("Lab Test Template", r.template, "test_name"), "status": r.status, "pending": True})
			continue
		res = frappe.get_doc("Lab Result", r.result) if r.result else None
		tests.append({"test_name": res.test_name if res else r.template, "status": r.status, "pending": False, "department": res.department if res else "",
			"values": [v.as_dict() for v in res.get("values")] if res else [], "text_result": res.text_result if res else "", "attachment": res.attachment if res else None,
			"interpretation": res.interpretation if res else "", "verified_by": frappe.db.get_value("User", res.verified_by, "full_name") if res and res.verified_by else "",
			"verified_at": str(res.verified_at or "") if res else "", "version": res.version_no if res else 1, "amended": bool(res and res.amended_from)})
	branch = frappe.db.get_value("Branch", ti.branch, ["hv_address", "hv_phone"], as_dict=True) or {}
	return {"name": ti.name, "status": ti.status, "posting_date": str(ti.posting_date), "released_at": str(ti.released_at or ""), "version": ti.report_version,
		"patient": {"mr": ti.patient, "name": pat.patient_name, "name_ur": pat.patient_name_ur, "gender": pat.gender, "age": age_of(pat.dob)},
		"referring_doctor": frappe.db.get_value("Doctor", ti.referring_doctor, "doctor_name") if ti.referring_doctor else ti.external_referrer,
		"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "address": branch.get("hv_address") or s.address, "phone": branch.get("hv_phone") or s.phone},
		"tests": tests}


def report_html(d):
	esc = frappe.utils.escape_html
	flag_color = {"Low": "#b45309", "High": "#b45309", "Critical Low": "#b91c1c", "Critical High": "#b91c1c", "Abnormal": "#b45309"}
	parts = []
	for t in d["tests"]:
		if t.get("pending"):
			parts.append(f"<div class='t'><h3>{esc(t['test_name'])}</h3><p class='muted'>Result pending ({esc(t['status'])})</p></div>")
			continue
		rows = "".join(
			f"<tr><td>{esc(v['parameter'])}</td><td style='font-weight:700;color:{flag_color.get(v.get('flag') or '', '#0f172a')}'>{esc(v.get('value') or '')}"
			f"{' ▲' if 'High' in (v.get('flag') or '') else ' ▼' if 'Low' in (v.get('flag') or '') else ''}</td><td>{esc(v.get('unit') or '')}</td>"
			f"<td class='muted'>{esc(v.get('normal_range') or '')}</td><td class='muted'>{esc(v.get('previous_value') or '')}</td></tr>" for v in t["values"] if str(v.get("value") or "").strip())
		table = f"<table><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference range</th><th>Previous</th></tr>{rows}</table>" if rows else ""
		parts.append(f"<div class='t'><h3>{esc(t['test_name'])} <span class='muted'>{esc(t.get('department') or '')}</span>"
			f"{' · <b style=\"color:#b91c1c\">AMENDED v' + str(t['version']) + '</b>' if t.get('amended') else ''}</h3>{table}"
			f"{('<div class=\"txt\">' + (t.get('text_result') or '') + '</div>') if t.get('text_result') else ''}"
			f"{('<p><b>Interpretation:</b> ' + esc(t['interpretation']) + '</p>') if t.get('interpretation') else ''}"
			f"<p class='muted'>Verified by {esc(t.get('verified_by') or '')} · {esc(t.get('verified_at')[:16])}</p></div>")
	p, c = d["patient"], d["clinic"]
	return f"""<!doctype html><html><head><meta charset="utf-8"><style>
	body{{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#0f172a;margin:24px}} .head{{display:flex;justify-content:space-between;border-bottom:3px solid #0f766e;padding-bottom:8px}}
	.cl{{font-size:20px;font-weight:800;color:#0f766e}} .muted{{color:#64748b}} .pt{{background:#f0fdfa;padding:8px;margin:10px 0;border-radius:6px}}
	table{{width:100%;border-collapse:collapse;margin-top:4px}} th,td{{text-align:left;padding:4px 6px;border-bottom:1px solid #e2e8f0}} th{{font-size:9px;text-transform:uppercase;color:#64748b}}
	.t{{margin:12px 0;page-break-inside:avoid}} h3{{margin:0 0 4px;font-size:13px;color:#0f766e}} .foot{{margin-top:24px;font-size:9px;color:#64748b;border-top:1px solid #cbd5e1;padding-top:6px}}
	</style></head><body><div class="head"><div><div class="cl">{esc(c['name'])}</div><div class="muted">{esc(c.get('address') or '')} · {esc(c.get('phone') or '')}</div></div>
	<div style="text-align:right"><b>LABORATORY REPORT</b><div class="muted">{esc(d['name'])} · v{d.get('version') or 1}</div></div></div>
	<div class="pt"><b>{esc(p['name'])}</b> · MR {esc(p['mr'])} · {esc(p.get('gender') or '')} · {p.get('age') or '-'} y · Ref: {esc(d.get('referring_doctor') or 'Self')}
	· Ordered {esc(d['posting_date'])} · Released {esc(d.get('released_at', '')[:16])}</div>{''.join(parts)}
	<div class="foot">Results relate only to the sample tested. This report was released electronically and is valid without a signature.</div></body></html>"""


def report_pdf(ti_name):
	from frappe.utils.pdf import get_pdf

	return get_pdf(report_html(report_data(ti_name)))


# ------------------------------------------------------------------ outsourcing
def dispatch(samples, reference_lab, courier=None, expected_back=None):
	rows, total, branch = [], 0.0, None
	for sname in samples:
		s = frappe.get_doc("Lab Sample", sname)
		if s.status not in ("Collected", "Received"):
			frappe.throw(_("Sample {0} is {1}.").format(s.name, s.status))
		branch = s.branch
		cost = sum(flt(frappe.db.get_value("Lab Test Template", t.template, "outsource_cost")) for t in s.tests)
		total += cost
		rows.append({"sample": s.name, "test_invoice": s.test_invoice, "patient_name": s.patient_name, "tests": ", ".join(t.test_code for t in s.tests)})
	od = frappe.get_doc({"doctype": "Outsourced Dispatch", "reference_lab": reference_lab, "branch": branch, "courier": courier, "expected_back": expected_back,
		"samples": rows, "total_cost": total}).insert(ignore_permissions=True)
	for sname in samples:
		frappe.db.set_value("Lab Sample", sname, {"status": "Dispatched", "dispatch": od.name})
		for t in frappe.get_doc("Lab Sample", sname).tests:
			frappe.db.set_value("Test Invoice Item", t.invoice_item, "status", "Dispatched")
	if total:
		od.db_set("purchase_invoice", outsourced_purchase_invoice(reference_lab, total, branch, od.name))
	return od


def outsourced_purchase_invoice(supplier, amount, branch, ref):
	company = branch_company(branch)
	item = "LAB-OUTSOURCED"
	if not frappe.db.exists("Item", item):
		frappe.get_doc({"doctype": "Item", "item_code": item, "item_name": "Outsourced laboratory tests", "item_group": LAB_ITEM_GROUP, "stock_uom": "Nos",
			"is_stock_item": 0, "is_purchase_item": 1}).insert(ignore_permissions=True)
	pi = frappe.get_doc({"doctype": "Purchase Invoice", "supplier": supplier, "company": company, "posting_date": today(), "bill_no": ref, "bill_date": today(),
		"items": [{"item_code": item, "qty": 1, "rate": flt(amount)}], "remarks": f"Outsourced dispatch {ref}"})
	if pi.meta.has_field("branch"):
		pi.branch = branch
	pi.flags.ignore_permissions = True
	pi.insert()
	pi.submit()
	return pi.name


def receive_outsourced(invoice_item, attachment=None, values=None, text_result=None):
	frappe.db.set_value("Test Invoice Item", invoice_item, "status", "Report Received")
	res = enter_results(invoice_item, values=values, text_result=text_result, attachment=attachment)
	od = frappe.db.get_value("Lab Sample", res.sample, "dispatch")
	if od:
		d = frappe.get_doc("Outsourced Dispatch", od)
		for r in d.samples:
			if r.sample == res.sample:
				r.received, r.result = 1, res.name
		d.status = "Received" if all(r.received for r in d.samples) else "Partially Received"
		d.save(ignore_permissions=True)
	return res


# ------------------------------------------------------------------ prescription hook
def on_prescription_signed(rx):
	if not cint(setting("auto_lab_order")) or not rx.lab_tests or not cint(setting("enable_lab")):
		return
	if frappe.db.exists("Test Invoice", {"prescription": rx.name, "status": ["!=", "Cancelled"]}):
		return
	tests = [t for t in (match_template(x.test_name) for x in rx.lab_tests) if t]
	if tests:
		create_order(rx.patient, tests, rx.branch, referring_doctor=rx.doctor, prescription=rx.name, opd_slip=rx.opd_slip,
			priority="Urgent" if any(x.urgent for x in rx.lab_tests) else "Routine")
