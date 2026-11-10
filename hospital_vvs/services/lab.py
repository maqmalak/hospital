"""Laboratory (03-lab.md): orders, samples, results, critical values, verification, release, report links, outsourcing."""

import hashlib
import io
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
PRIORITIES = ("Normal", "Priority", "Urgent")  # QA 2026-11-10: three levels, Urgent first


def create_order(patient, tests, branch, referring_doctor=None, prescription=None, opd_slip=None, priority="Normal", external_referrer=None):
	if not tests:
		frappe.throw(_("Choose at least one test."))
	priority = {"Routine": "Normal"}.get(priority, priority) if priority in (*PRIORITIES, "Routine") else "Normal"
	ti = frappe.get_doc({"doctype": "Test Invoice", "patient": patient, "branch": branch, "posting_date": today(), "referring_doctor": referring_doctor,
		"external_referrer": external_referrer, "prescription": prescription, "opd_slip": opd_slip, "priority": priority, "status": "Ordered",
		"items": [{"template": t} for t in tests]})
	ti.insert(ignore_permissions=True)
	return ti


def pay(name, payment_mode="Cash", discount_amount=0, discount_reason=None, discount_authorization=None, cash_tendered=None, payments=None):
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
				discount_amount=flt(ti.discount_amount) * fraction, payment_mode=payment_mode, payments=payments)
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
	if s.status in ("Rejected", "Cancelled"):
		frappe.throw(_("Sample {0} is {1}.").format(s.name, s.status))
	verified = [t.test_code for t in s.tests if frappe.db.get_value("Test Invoice Item", t.invoice_item, "status") in ("Verified", "Released")]
	if verified:
		frappe.throw(_("{0} already verified on this sample — amend the result instead of rejecting the sample.").format(", ".join(verified)))
	new = frappe.copy_doc(s)
	new.update({"status": "Pending", "collected_by": None, "collected_at": None, "received_by": None, "received_at": None, "rejection_reason": None,
		"rejection_note": None, "recollect_of": s.name, "recollect_sample": None})
	new.insert(ignore_permissions=True)
	s.update({"status": "Rejected", "rejection_reason": reason, "rejection_note": note, "recollect_sample": new.name})
	s.save(ignore_permissions=True)
	for t in new.tests:
		# QA defect 1: a draft result of the rejected sample must not stay waiting for verification
		draft = frappe.db.get_value("Lab Result", {"invoice_item": t.invoice_item, "docstatus": 0, "status": ["in", ["Result Entered", "Sent Back", "Draft"]]}, "name")
		if draft:
			frappe.db.set_value("Lab Result", draft, {"status": "Cancelled", "send_back_reason": f"Sample {s.name} rejected: {reason}"})
		frappe.db.set_value("Test Invoice Item", t.invoice_item, {"sample": new.name, "status": "Ordered", "result": None})
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


def history(patient, template, before=None, exclude=None, limit=5):
	"""Earlier verified results of the same test for this patient, newest first: [{date, result, values{param: (value, flag)}}]."""
	f = {"patient": patient, "template": template, "docstatus": 1, "status": "Verified"}
	if exclude:
		f["name"] = ["!=", exclude]
	if before:
		f["verified_at"] = ["<", before]
	out = []
	for n in frappe.get_all("Lab Result", filters=f, fields=["name", "verified_at", "test_invoice"], order_by="verified_at desc", limit=limit):
		vals = {v.parameter: (v.value, v.flag) for v in frappe.get_all("Lab Result Value", filters={"parent": n.name}, fields=["parameter", "value", "flag"]) if str(v.value or "").strip()}
		out.append({"date": str(n.verified_at or "")[:10], "result": n.name, "order": n.test_invoice, "values": vals})
	return out


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
	if not has_any_role(R.PATHOLOGIST):  # QA defect 2: only the pathologist reopens a verified result
		frappe.throw(_("Only the pathologist amends a verified result."), frappe.PermissionError)
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
			"attachment_kind": _kind(res.attachment) if res and res.attachment else None,
			"previous": (history(ti.patient, r.template, before=res.verified_at or res.creation, exclude=res.name, limit=1) or [None])[0] if res else None,
			"interpretation": res.interpretation if res else "", "verified_by": frappe.db.get_value("User", res.verified_by, "full_name") if res and res.verified_by else "",
			"verified_at": str(res.verified_at or "") if res else "", "version": res.version_no if res else 1, "amended": bool(res and res.amended_from)})
	branch = frappe.db.get_value("Branch", ti.branch, ["hv_address", "hv_phone"], as_dict=True) or {}
	return {"name": ti.name, "status": ti.status, "posting_date": str(ti.posting_date), "released_at": str(ti.released_at or ""), "version": ti.report_version,
		"patient": {"mr": ti.patient, "name": pat.patient_name, "name_ur": pat.patient_name_ur, "gender": pat.gender, "age": age_of(pat.dob)},
		"referring_doctor": frappe.db.get_value("Doctor", ti.referring_doctor, "doctor_name") if ti.referring_doctor else ti.external_referrer,
		"clinic": {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "address": branch.get("hv_address") or s.address, "phone": branch.get("hv_phone") or s.phone},
		"tests": tests, "priority": ti.priority or "Normal", "remarks": ti.get("report_remarks"), **print_extras(ti, tests)}


def _kind(url):
	u = (url or "").lower()
	return "pdf" if u.endswith(".pdf") else "image" if u.rsplit(".", 1)[-1] in ("jpg", "jpeg", "png", "webp", "gif") else "file"


def attachment_bytes(url):
	"""Content of a report file (private or public) by its URL."""
	name = frappe.db.get_value("File", {"file_url": url}, "name")
	if not name:
		frappe.throw(_("Report file not found."))
	f = frappe.get_doc("File", name)
	return f.get_content(), f.file_name


def _img_tag(url):
	import base64
	import mimetypes

	try:
		data, fname = attachment_bytes(url)
	except Exception:
		return ""
	mime = mimetypes.guess_type(fname)[0] or "image/jpeg"
	return f"<div style='margin-top:6px'><img src='data:{mime};base64,{base64.b64encode(data).decode()}' style='max-width:100%;max-height:900px;border:1px solid #e2e8f0'></div>"


def verify_sig(name):
	"""Short signature for the public report check (QR): HMAC of the order with the site's secret."""
	import hmac as _h

	key = (frappe.local.conf.get("encryption_key") or frappe.local.site).encode()
	return _h.new(key, f"lab-report:{name}".encode(), hashlib.sha256).hexdigest()[:20]


def verify_url(name):
	from frappe.utils import get_url

	return get_url(f"/hms/verify-report/{name}/{verify_sig(name)}")


def qr_data_uri(text):
	import base64

	import pyqrcode

	buf = io.BytesIO()
	pyqrcode.create(text, error="M").svg(buf, scale=4, quiet_zone=1, module_color="#0f172a")
	return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()


def _image_uri(url):
	import base64
	import mimetypes

	if not url:
		return None
	try:
		data, fname = attachment_bytes(url)
	except Exception:
		return None
	return f"data:{mimetypes.guess_type(fname)[0] or 'image/png'};base64,{base64.b64encode(data).decode()}"


def _svg_uri(svg):
	import base64

	return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def _monogram(name):
	letters = "".join(w[0] for w in (name or "Lab").split()[:2]).upper()
	return _svg_uri(f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#0369a1"/></linearGradient></defs>
		<rect width="64" height="64" rx="16" fill="url(#g)"/><path d="M28 14h8v12h12v8H36v12h-8V34H16v-8h12z" fill="#fff" opacity=".22"/>
		<text x="32" y="41" font-family="Helvetica,Arial" font-size="22" font-weight="700" text-anchor="middle" fill="#fff">{frappe.utils.escape_html(letters)}</text></svg>""")


def _stamp(clinic, date):
	c = frappe.utils.escape_html((clinic or "").upper())[:22]
	return _svg_uri(f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><g transform="rotate(-12 80 80)" font-family="Helvetica,Arial" fill="#1d4ed8" text-anchor="middle">
		<circle cx="80" cy="80" r="74" fill="none" stroke="#1d4ed8" stroke-width="4" opacity=".8"/><circle cx="80" cy="80" r="64" fill="none" stroke="#1d4ed8" stroke-width="1.5" opacity=".8"/>
		<text x="80" y="52" font-size="13" font-weight="700" opacity=".85">{c}</text>
		<rect x="18" y="64" width="124" height="30" rx="4" fill="none" stroke="#1d4ed8" stroke-width="2.5" opacity=".85"/>
		<text x="80" y="86" font-size="20" font-weight="800" letter-spacing="3" opacity=".9">VERIFIED</text>
		<text x="80" y="112" font-size="11" font-weight="700" opacity=".85">LABORATORY</text><text x="80" y="126" font-size="11" font-weight="700" opacity=".85">{frappe.utils.escape_html(date)}</text></g></svg>""")


def print_extras(ti, tests):
	"""Header / footer / signatory data for the printed report (D-50)."""
	s = frappe.get_cached_doc("Clinic Settings")
	samples = frappe.get_all("Lab Sample", filters={"test_invoice": ti.name, "status": ["!=", "Rejected"]}, fields=["collected_at", "received_at"])
	col = min((x.collected_at for x in samples if x.collected_at), default=None)
	rec = max((x.received_at for x in samples if x.received_at), default=None)
	verifiers = [frappe.db.get_value("Lab Result", r.result, "verified_by") for r in ti.items if r.result and r.status in ("Verified", "Released")]
	vuser = next((v for v in reversed(verifiers) if v and v != "Administrator"), None)
	doc = frappe.db.get_value("Doctor", {"user": vuser}, ["doctor_name", "qualification", "registration_no", "signature"], as_dict=True) if vuser else None
	name = (doc.doctor_name if doc else None) or s.get("lab_signatory_name") or (frappe.db.get_value("User", vuser, "full_name") if vuser else None) or "Pathologist"
	released = getdate(ti.released_at) if ti.released_at else getdate()
	return {"collected_at": str(col or "")[:16], "received_at": str(rec or "")[:16], "verify_url": verify_url(ti.name),
		"print": {"department": s.get("lab_report_department") or "Department of Pathology & Laboratory Medicine", "accreditation": s.get("lab_accreditation"),
			"footer": s.get("lab_report_footer"), "show_previous": cint(s.get("lab_show_previous") if s.get("lab_show_previous") is not None else 1),
			"logo": _image_uri(s.get("logo")) or _monogram(s.clinic_name), "signatory": name,
			"title": (doc.qualification if doc and doc.qualification else None) or s.get("lab_signatory_title") or "Consultant Pathologist",
			"reg": (doc.registration_no if doc else None) or s.get("lab_signatory_reg"),
			"signature": _image_uri(doc.signature if doc and doc.signature else s.get("lab_signature")),
			"stamp": _image_uri(s.get("lab_stamp")) or _stamp(s.clinic_name, released.strftime("%d-%m-%Y"))}}


def _dmy(d):
	return f"{d[8:10]}-{d[5:7]}-{d[:4]}" if d and len(d) >= 10 else (d or "")


def _prev_cell(pv, FLAG):
	if not pv:
		return "<td class='u'>—</td>"
	val, fl = pv
	c = FLAG.get(fl or "", ("#475569", "", ""))[0]
	return f"<td class='u' style='color:{c}'>{frappe.utils.escape_html(str(val))}{(' ' + FLAG[fl][2]) if fl in FLAG else ''}</td>"


def report_html(d):
	esc = frappe.utils.escape_html
	P = d.get("print") or {}
	FLAG = {"Low": ("#b45309", "#fef3c7", "L"), "High": ("#b45309", "#fef3c7", "H"), "Critical Low": ("#b91c1c", "#fee2e2", "LL"),
		"Critical High": ("#b91c1c", "#fee2e2", "HH"), "Abnormal": ("#b45309", "#fef3c7", "A")}
	show_prev = P.get("show_previous", 1)
	groups = {}
	for t in d["tests"]:
		groups.setdefault(t.get("department") or "Results", []).append(t)
	parts = []
	for dept, tests in groups.items():
		parts.append(f"<div class='dept'>{esc(dept)}</div>")
		for t in tests:
			if t.get("pending"):
				parts.append(f"<div class='t'><div class='tn'>{esc(t['test_name'])}</div><div class='pend'>Result pending — {esc(t['status'])}</div></div>")
				continue
			prev = t.get("previous") or {}
			pvals = prev.get("values") or {}
			has_prev = show_prev and bool(pvals)
			rows = []
			for v in t["values"]:
				val = str(v.get("value") or "").strip()
				if not val:
					continue
				c, bg, tag = FLAG.get(v.get("flag") or "", ("#0f172a", "", ""))
				pill = f"<span class='flag' style='color:{c};background:{bg}'>{tag}</span>" if tag else ""
				rows.append(f"<tr><td>{esc(v['parameter'])}</td><td class='res' style='color:{c}'>{esc(val)} {pill}</td><td class='u'>{esc(v.get('unit') or '')}</td>"
					f"<td class='u'>{esc(v.get('normal_range') or '')}</td>" + (_prev_cell(pvals.get(v['parameter']), FLAG) if has_prev else "") + "</tr>")
			head = ("<tr><th>Investigation</th><th>Result</th><th>Unit</th><th>Reference interval</th>"
				+ (f"<th>Previous<br><span style='text-transform:none;font-weight:400'>{esc(_dmy(prev.get('date')))}</span></th>" if has_prev else "") + "</tr>")
			table = f"<table class='rt'>{head}{''.join(rows)}</table>" if rows else ""
			amend = f"<span class='amd'>AMENDED · v{t['version']}</span>" if t.get("amended") else ""
			txt = f"<div class='txt'>{esc(t.get('text_result') or '').replace(chr(10), '<br>')}</div>" if t.get("text_result") else ""
			img = _img_tag(t["attachment"]) if t.get("attachment_kind") == "image" else ""
			pdfnote = "<div class='note'>The reference / handwritten report is attached on the following page(s).</div>" if t.get("attachment_kind") == "pdf" else ""
			interp = f"<div class='interp'><b>Interpretation</b> {esc(t['interpretation'])}</div>" if t.get("interpretation") else ""
			parts.append(f"<div class='t'><div class='tn'>{esc(t['test_name'])} {amend}</div>{table}{txt}{img}{pdfnote}{interp}"
				f"<div class='vb'>Verified by {esc(t.get('verified_by') or '')} · {esc((t.get('verified_at') or '')[:16])}</div></div>")
	p, c = d["patient"], d["clinic"]
	pr = d.get("priority") or "Normal"
	pr_tag = f"<span class='pr pr-{esc(pr.lower())}'>{esc(pr)}</span>" if pr != "Normal" else ""
	remarks = f"<div class='remarks'><b>Remarks</b><br>{esc(d['remarks']).replace(chr(10), '<br>')}</div>" if d.get("remarks") else ""
	qr = qr_data_uri(d.get("verify_url") or d["name"])
	sig = f"<img class='sig' src='{P['signature']}'>" if P.get("signature") else "<div class='sigline'></div>"
	stamp = f"<img class='stamp' src='{P['stamp']}'>" if P.get("stamp") else ""
	info = [("Patient", f"<b>{esc(p['name'])}</b>"), ("MR No.", esc(p["mr"])),
		("Age / Sex", f"{p.get('age') if p.get('age') is not None else '-'} y / {esc(p.get('gender') or '-')}"), ("Referred by", esc(d.get("referring_doctor") or "Self")),
		("Order no.", f"{esc(d['name'])} {pr_tag}"), ("Registered", esc(d["posting_date"])), ("Collected", esc(d.get("collected_at") or "-")),
		("Received", esc(d.get("received_at") or "-")), ("Reported", esc((d.get("released_at") or "")[:16] or "-"))]
	grid = "".join(f"<div class='cell'><span>{k}</span>{v}</div>" for k, v in info)
	return f"""<!doctype html><html><head><meta charset="utf-8"><style>
	@page {{ size: A4; margin: 12mm 12mm 16mm 12mm; }}
	* {{ box-sizing: border-box; }}
	body {{ font-family: Helvetica, Arial, sans-serif; font-size: 10.5px; color: #0f172a; margin: 0; }}
	.hdr {{ display: table; width: 100%; border-bottom: 3px solid #0f766e; padding-bottom: 8px; }}
	.hdr > div {{ display: table-cell; vertical-align: middle; }}
	.logo {{ width: 62px; }} .logo img {{ width: 56px; height: 56px; border-radius: 12px; }}
	.cl {{ font-size: 21px; font-weight: 800; color: #0f766e; letter-spacing: .2px; }} .cl .ur {{ font-size: 16px; color: #0369a1; margin-left: 8px; font-weight: 600; }}
	.sub {{ font-size: 10px; color: #475569; margin-top: 1px; }} .dep {{ font-size: 11px; font-weight: 700; color: #0369a1; margin-top: 3px; text-transform: uppercase; letter-spacing: 1px; }}
	.acc {{ font-size: 9px; color: #64748b; }}
	.qr {{ width: 108px; text-align: center; }} .qr img {{ width: 84px; height: 84px; }} .qr div {{ font-size: 8px; color: #64748b; }}
	.title {{ margin: 8px 0 6px; text-align: center; }} .title span {{ display: inline-block; white-space: nowrap; background: #0f766e; color: #fff; font-weight: 800; letter-spacing: 2px; padding: 4px 22px; border-radius: 20px; font-size: 11px; }}
	.pt {{ border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; padding: 6px 8px; }}
	.cell {{ display: inline-block; width: 32.5%; padding: 3px 4px; vertical-align: top; }} .cell span {{ display: block; font-size: 8px; text-transform: uppercase; color: #64748b; letter-spacing: .6px; }}
	.ur {{ font-family: 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif; direction: rtl; }}
	.pr {{ font-size: 8px; font-weight: 800; padding: 1px 6px; border-radius: 10px; color: #fff; }} .pr-urgent {{ background: #dc2626; }} .pr-priority {{ background: #f59e0b; }}
	.dept {{ margin: 12px 0 4px; font-size: 11px; font-weight: 800; color: #fff; background: #0f766e; border-left: 6px solid #0369a1; padding: 4px 8px; border-radius: 6px; letter-spacing: 1px; text-transform: uppercase; }}
	.t {{ margin: 6px 0 10px; page-break-inside: avoid; }} .tn {{ font-size: 12.5px; font-weight: 800; color: #0f766e; margin-bottom: 3px; }}
	.rt {{ width: 100%; border-collapse: collapse; }} .rt th {{ text-align: left; font-size: 8.5px; text-transform: uppercase; color: #475569; border-bottom: 1.5px solid #0f766e; padding: 4px 6px; letter-spacing: .5px; }}
	.rt td {{ padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }} .rt tr:nth-child(even) td {{ background: #f8fafc; }}
	.res {{ font-weight: 800; }} .u {{ color: #475569; }} .flag {{ font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 4px; margin-left: 4px; }}
	.txt {{ padding: 6px 8px; background: #f8fafc; border-left: 3px solid #0f766e; margin-top: 4px; line-height: 1.5; }}
	.interp {{ margin-top: 5px; padding: 5px 8px; background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 6px; }} .interp b {{ color: #0e7490; margin-right: 6px; }}
	.note, .pend {{ color: #64748b; font-style: italic; margin-top: 3px; }} .vb {{ font-size: 8.5px; color: #64748b; margin-top: 3px; text-align: right; }}
	.amd {{ font-size: 8px; color: #fff; background: #dc2626; padding: 1px 6px; border-radius: 8px; margin-left: 6px; vertical-align: middle; }}
	.remarks {{ margin: 10px 0; padding: 7px 9px; border: 1px dashed #0369a1; border-radius: 8px; background: #f0f9ff; line-height: 1.5; }}
	.sign {{ display: table; width: 100%; margin-top: 18px; page-break-inside: avoid; }} .sign > div {{ display: table-cell; vertical-align: bottom; }}
	.sigbox {{ text-align: center; width: 260px; position: relative; }} .sig {{ max-height: 48px; max-width: 170px; }} .sigline {{ height: 40px; }}
	.stampc {{ width: 130px; text-align: center; }} .stamp {{ width: 112px; height: 112px; }}
	.sigbox .nm {{ border-top: 1px solid #0f172a; padding-top: 3px; font-weight: 800; font-size: 11px; }} .sigbox .tt {{ font-size: 9px; color: #475569; }}
	.legend {{ font-size: 8.5px; color: #64748b; }}
	.foot {{ margin-top: 14px; border-top: 2px solid #0f766e; padding-top: 5px; font-size: 8.5px; color: #475569; display: table; width: 100%; }} .foot > div {{ display: table-cell; vertical-align: top; }}
	.end {{ text-align: center; font-size: 9px; color: #94a3b8; letter-spacing: 3px; margin-top: 8px; }}
	</style></head><body>
	<div class="hdr"><div class="logo"><img src="{P.get('logo') or ''}"></div>
		<div><div class="cl">{esc(c['name'])}</div>
		<div class="sub">{esc(c.get('address') or '')}{(' · ' + esc(c['phone'])) if c.get('phone') else ''}</div>
		<div class="dep">{esc(P.get('department') or '')}</div>{('<div class="acc">' + esc(P['accreditation']) + '</div>') if P.get('accreditation') else ''}</div>
		<div class="qr"><img src="{qr}"><div>Scan to verify<br>{esc(d['name'])} · v{d.get('version') or 1}</div></div></div>
	<div class="title"><span>LABORATORY REPORT</span></div>
	<div class="pt">{grid}</div>
	{''.join(parts)}
	{remarks}
	<div class="sign"><div class="legend">Flags: <b style="color:#b45309">H</b> high · <b style="color:#b45309">L</b> low · <b style="color:#b91c1c">HH / LL</b> critical · <b style="color:#b45309">A</b> abnormal</div>
		<div class="stampc">{stamp}</div><div class="sigbox">{sig}<div class="nm">{esc(P.get('signatory') or '')}</div><div class="tt">{esc(P.get('title') or '')}{(' · PMDC ' + esc(P['reg'])) if P.get('reg') else ''}</div></div></div>
	<div class="foot"><div>{esc(P.get('footer') or '')}</div><div style="text-align:right;width:180px">Printed {frappe.utils.now_datetime().strftime('%d-%m-%Y %H:%M')}<br>{esc(c['name'])}</div></div>
	<div class="end">— END OF REPORT —</div>
	</body></html>"""


def report_pdf(ti_name):
	"""Report PDF; scanned images are inside it, attached PDFs (handwritten / outside lab) are appended after it."""
	import io

	from frappe.utils.pdf import get_pdf

	d = report_data(ti_name)
	main = get_pdf(report_html(d), {"margin-top": "10mm", "margin-bottom": "14mm", "margin-left": "10mm", "margin-right": "10mm",
		"footer-center": f"{d['name']} · Page [page] of [topage]", "footer-font-size": "7", "footer-spacing": "4"})
	extra = [t["attachment"] for t in d["tests"] if t.get("attachment_kind") == "pdf"]
	if not extra:
		return main
	from pypdf import PdfReader, PdfWriter

	w = PdfWriter()
	for src in [main] + [attachment_bytes(u)[0] for u in extra]:
		for page in PdfReader(io.BytesIO(src)).pages:
			w.add_page(page)
	out = io.BytesIO()
	w.write(out)
	return out.getvalue()


def public_check(name, sig):
	"""What the QR verification page shows: proves the report is genuine without showing results."""
	import hmac as _h

	if not name or not sig or not _h.compare_digest(str(sig), verify_sig(name)) or not frappe.db.exists("Test Invoice", name):
		return {"valid": False}
	ti = frappe.get_doc("Test Invoice", name)
	pat = frappe.db.get_value("Patient", ti.patient, ["patient_name", "gender", "dob"], as_dict=True) or {}
	initials = " ".join((w[0] + "." for w in (pat.get("patient_name") or "").split()[:3]))
	s = frappe.get_cached_doc("Clinic Settings")
	tests = [{"test": frappe.db.get_value("Lab Test Template", r.template, "test_name"), "status": r.status,
		"verified_at": str(frappe.db.get_value("Lab Result", r.result, "verified_at") or "")[:16] if r.result else ""} for r in ti.items if r.status != "Cancelled"]
	return {"valid": ti.status in ("Released", "Partially Released"), "status": ti.status, "report": ti.name, "version": ti.report_version,
		"patient": initials, "mr": (ti.patient[:-4] + "••••") if ti.patient and len(ti.patient) > 4 else ti.patient, "gender": pat.get("gender"),
		"registered": str(ti.posting_date), "released_at": str(ti.released_at or "")[:16], "tests": tests, "clinic": s.clinic_name, "phone": s.phone}


def set_remarks(name, remarks):
	ti = frappe.get_doc("Test Invoice", name)
	ti.db_set("report_remarks", (remarks or "").strip()[:2000] or None)
	return ti


def on_refund(doc, method=None):
	"""QA defect 3: a credit note against a lab bill cancels the refunded tests that have no verified result yet, and their samples."""
	if not doc.is_return or not doc.return_against:
		return
	ref = frappe.db.get_value("Sales Invoice", doc.return_against, ["hv_reference_doctype", "hv_reference_name", "hv_is_payer_share"], as_dict=True)
	if not ref or ref.hv_reference_doctype != "Test Invoice" or ref.hv_is_payer_share:
		return
	ti = frappe.get_doc("Test Invoice", ref.hv_reference_name)
	refunded = {i.item_code for i in doc.items}
	kept = []
	for r in ti.items:
		item = frappe.db.get_value("Lab Test Template", r.template, "item")
		if item not in refunded or r.status == "Cancelled":
			continue
		if r.status in ("Verified", "Released"):
			kept.append(r.template)
			continue
		frappe.db.set_value("Test Invoice Item", r.name, "status", "Cancelled")
		draft = frappe.db.get_value("Lab Result", {"invoice_item": r.name, "docstatus": 0}, "name")
		if draft:
			frappe.db.set_value("Lab Result", draft, "status", "Cancelled")
	ti.reload()
	for sname in {r.sample for r in ti.items if r.sample}:
		live = [t for t in frappe.get_all("Lab Sample Test", filters={"parent": sname}, pluck="invoice_item") if frappe.db.get_value("Test Invoice Item", t, "status") != "Cancelled"]
		if not live and frappe.db.get_value("Lab Sample", sname, "status") in ("Pending", "Collected", "Received"):
			frappe.db.set_value("Lab Sample", sname, "status", "Cancelled")
	if all(r.status == "Cancelled" for r in ti.items):
		ti.db_set("status", "Cancelled")
	if kept:
		frappe.msgprint(_("Already verified, kept on the report: {0}").format(", ".join(kept)))
	publish("lab", {"action": "refunded", "test_invoice": ti.name}, ti.branch)


def hand_over(name, to):
	if not (to or "").strip():
		frappe.throw(_("Who received the printed report?"))
	ti = frappe.get_doc("Test Invoice", name)
	if ti.status not in ("Released", "Partially Released"):
		frappe.throw(_("Release the report first."))
	ti.db_set({"handed_over_to": to.strip(), "handed_over_at": now_datetime(), "handed_over_by": frappe.session.user})
	return ti


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
