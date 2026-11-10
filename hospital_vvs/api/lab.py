"""Laboratory screens: /lab/orders, /lab/samples, /tests, /lab/verify, /lab/outsourced and the public /lab-report/:token."""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, flt, today

from hospital_vvs import roles as R
from hospital_vvs.services import discounts, lab
from hospital_vvs.utils import check_branch, default_branch, log_access, require_roles, scope_branch

LAB_STAFF = (R.LAB_USER, R.PATHOLOGIST)
ORDERING = (R.LAB_USER, R.RECEPTIONIST, R.DOCTOR)


@frappe.whitelist()
def context():
	require_roles(*ORDERING, R.PATHOLOGIST)
	return {"templates": frappe.get_all("Lab Test Template", filters={"is_active": 1}, fields=["name", "test_code", "department", "price", "sample_type",
		"container", "tat_hours", "outsourced"], order_by="department, test_name"),
		"doctors": frappe.get_all("Doctor", filters={"is_active": 1}, fields=["name", "doctor_name", "doctor_type"], order_by="doctor_name"),
		"reference_labs": frappe.get_all("Supplier", filters={"supplier_group": "Distributor"}, pluck="name")}


@frappe.whitelist(methods=["POST"])
def create_order(data):
	require_roles(*ORDERING)
	d = frappe.parse_json(data)
	branch = d.get("branch") or default_branch()
	check_branch(branch)
	if d.get("client_ref"):
		done = frappe.db.get_value("Test Invoice", {"client_ref": d["client_ref"]})
		if done:
			return order(done)
	ti = lab.create_order(d["patient"], d["tests"], branch, referring_doctor=d.get("referring_doctor"), priority=d.get("priority") or "Normal",
		external_referrer=d.get("external_referrer"))
	if d.get("client_ref"):
		ti.db_set("client_ref", d["client_ref"])
	if cint(d.get("pay")):
		lab.pay(ti.name, d.get("payment_mode") or "Cash", flt(d.get("discount_amount")), d.get("discount_reason"), d.get("discount_authorization"),
			d.get("cash_tendered"))
	return order(ti.name)


@frappe.whitelist(methods=["POST"])
def pay(name, payment_mode="Cash", cash_tendered=None, discount_amount=0, discount_authorization=None):
	require_roles(R.LAB_USER, R.RECEPTIONIST)
	lab.pay(name, payment_mode, flt(discount_amount), None, discount_authorization, cash_tendered)
	return order(name)


@frappe.whitelist(methods=["POST"])
def request_discount(name, amount, reason):
	require_roles(R.LAB_USER, R.RECEPTIONIST)
	ti = frappe.get_doc("Test Invoice", name)
	auth = discounts.request(billing_type="Lab", gross=ti.gross_total, discount_amount=flt(amount), reason=reason, branch=ti.branch, patient=ti.patient,
		reference_doctype="Test Invoice", reference_name=ti.name)
	return {"name": auth.name, "status": auth.status}


@frappe.whitelist()
def orders(date=None, status=None, q=None, branch=None, from_date=None, to_date=None, priority=None):
	"""Lab orders by day / week / month / custom range (from_date..to_date), status, priority, or search (any date)."""
	branch = scope_branch(branch, required=False)
	require_roles(*ORDERING, R.PATHOLOGIST, R.NURSE)
	filters = {"branch": branch or default_branch()}
	if from_date and to_date:
		filters["posting_date"] = ["between", [from_date, to_date]]
	elif date:
		filters["posting_date"] = date
	if priority:
		filters["priority"] = priority
	if q:
		filters.pop("posting_date", None)
	if status:
		filters["status"] = status
	or_filters = {"patient_name": ["like", f"%{q}%"], "patient": ["like", f"%{q}%"], "name": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("Test Invoice", filters=filters, or_filters=or_filters, fields=["name", "patient", "patient_name", "status", "net_total", "patient_share",
		"priority", "posting_date", "expected_at", "referring_doctor", "released_at", "sales_invoice", "creation", "handed_over_to"], order_by="creation desc", limit=500)
	names = [r.name for r in rows] or [""]
	items = frappe.get_all("Test Invoice Item", filters={"parent": ["in", names]}, fields=["parent", "template", "status"])
	for r in rows:
		its = [i for i in items if i.parent == r.name]
		r["tests"] = [i.template for i in its]
		r["progress"] = {s: sum(1 for i in its if i.status == s) for s in {i.status for i in its}}
	return rows


@frappe.whitelist()
def order(name):
	ti = frappe.get_doc("Test Invoice", name)
	ti.check_permission("read")
	out = ti.as_dict()
	out["samples"] = frappe.get_all("Lab Sample", filters={"test_invoice": name}, fields=["name", "sample_type", "container", "status", "collected_at",
		"received_at", "rejection_reason", "recollect_of"], order_by="creation")
	out["links"] = frappe.get_all("Lab Report Access Token", filters={"test_invoice": name}, fields=["name", "expires_at", "download_count", "max_downloads",
		"revoked", "version", "last_accessed_at", "creation"], order_by="creation desc")
	out["messages"] = frappe.get_all("Message Log", filters={"reference_doctype": "Test Invoice", "reference_name": name}, fields=["name", "event", "status",
		"channel", "creation"], order_by="creation desc")
	return out


# ------------------------------------------------------------------ samples
@frappe.whitelist()
def samples(status="Pending", branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(*LAB_STAFF, R.NURSE)
	branch = branch or default_branch()
	statuses = {"Pending": ["Pending"], "Collected": ["Collected"], "Received": ["Received"], "Rejected": ["Rejected"]}.get(status, [status])
	rows = frappe.get_all("Lab Sample", filters={"branch": branch, "status": ["in", statuses]}, fields=["name", "test_invoice", "patient", "patient_name",
		"sample_type", "container", "status", "collected_at", "received_at", "rejection_reason", "recollect_of", "creation"], order_by="creation", limit=300)
	pri = {t.name: t.priority for t in frappe.get_all("Test Invoice", filters={"name": ["in", [r.test_invoice for r in rows] or [""]]}, fields=["name", "priority"])}
	for r in rows:
		r["tests"] = frappe.get_all("Lab Sample Test", filters={"parent": r.name}, pluck="test_code")
		r["priority"] = pri.get(r.test_invoice)
	rank = {"Urgent": 0, "Priority": 1}
	rows.sort(key=lambda r: (rank.get(r["priority"], 2), str(r["creation"])))
	return rows


@frappe.whitelist(methods=["POST"])
def sample_action(name, action, reason=None, note=None):
	require_roles(*LAB_STAFF, R.NURSE)
	fn = {"collect": lab.collect, "receive": lab.receive}.get(action)
	if action == "reject":
		s = lab.reject(name, reason, note)
		return {"recollect": s.name}
	if not fn:
		frappe.throw(_("Unknown action"))
	return fn(name).as_dict()


@frappe.whitelist()
def scan(code):
	"""Barcode scan anywhere in the lab: sample, order or patient MR."""
	require_roles(*LAB_STAFF)
	code = (code or "").strip()
	if frappe.db.exists("Lab Sample", code):
		s = frappe.get_doc("Lab Sample", code)
		return {"type": "sample", "sample": s.as_dict(), "items": frappe.get_all("Test Invoice Item", filters={"sample": s.name},
			fields=["name", "template", "status", "result"])}
	if frappe.db.exists("Test Invoice", code):
		return {"type": "order", "order": order(code)}
	return {"type": None}


@frappe.whitelist()
def labels(samples):
	require_roles(*LAB_STAFF, R.NURSE)
	out = []
	for s in frappe.parse_json(samples):
		d = frappe.get_doc("Lab Sample", s)
		out.append({"barcode": d.name, "mr": d.patient, "name": d.patient_name, "tests": [t.test_code for t in d.tests], "sample_type": d.sample_type,
			"container": d.container, "time": str(d.collected_at or frappe.utils.now_datetime())[:16]})
	return out


# ------------------------------------------------------------------ results
@frappe.whitelist()
def worklist(status=None, department=None, branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(*LAB_STAFF)
	branch = branch or default_branch()
	statuses = [status] if status else ["Received", "Result Entered", "Report Received", "Dispatched"]
	rows = frappe.db.sql("""select tii.name, tii.parent test_invoice, tii.template, tii.status, tii.sample, tii.result, tii.outsourced, ti.patient, ti.patient_name,
		ti.priority, ti.expected_at, t.department, t.test_code, r.has_critical, r.critical_logged, r.status result_status, r.send_back_reason
		from `tabTest Invoice Item` tii join `tabTest Invoice` ti on ti.name=tii.parent join `tabLab Test Template` t on t.name=tii.template
		left join `tabLab Result` r on r.name=tii.result
		where ti.branch=%(b)s and tii.status in %(s)s {dept} order by field(ti.priority, 'Urgent', 'Priority') = 0, field(ti.priority, 'Urgent', 'Priority'), ti.creation""".format(dept="and t.department=%(d)s" if department else ""),
		{"b": branch, "s": statuses, "d": department}, as_dict=True)
	return rows


@frappe.whitelist()
def result_form(invoice_item):
	require_roles(*LAB_STAFF, R.DOCTOR)
	row = frappe.get_doc("Test Invoice Item", invoice_item)
	ti = frappe.get_doc("Test Invoice", row.parent)
	pat = frappe.db.get_value("Patient", ti.patient, ["gender", "dob", "patient_name"], as_dict=True)
	from hospital_vvs.api.patients import age_of

	age = age_of(pat.dob)
	rngs = lab._ranges(row.template, pat.gender, age)
	prev, prev_date = lab.previous_values(ti.patient, row.template, exclude=row.result)
	existing = frappe.get_doc("Lab Result", row.result).as_dict() if row.result else None
	tpl = frappe.get_cached_doc("Lab Test Template", row.template)
	log_access("Lab result open", patient=ti.patient, reference_doctype="Test Invoice", reference_name=ti.name)
	return {"item": row.as_dict(), "order": {"name": ti.name, "patient": ti.patient, "patient_name": pat.patient_name, "gender": pat.gender, "age": age,
		"referring_doctor": ti.referring_doctor, "priority": ti.priority},
		"template": {"name": tpl.name, "test_code": tpl.test_code, "department": tpl.department, "result_type": tpl.result_type, "text_template": tpl.text_template,
			"outsourced": tpl.outsourced, "method": tpl.method},
		"parameters": [{"parameter": p, "unit": r.unit if r else "", "normal_low": r.normal_low if r else None, "normal_high": r.normal_high if r else None,
			"critical_low": r.critical_low if r else None, "critical_high": r.critical_high if r else None, "normal_text": r.normal_text if r else None,
			"previous": prev.get(p)} for p, r in rngs.items()], "previous_date": str(prev_date or ""), "result": existing,
		"critical_logs": frappe.get_all("Critical Value Log", filters={"lab_result": row.result}, fields=["parameter", "notified_person", "method", "notified_at"]) if row.result else [],
		"history": lab.history(ti.patient, row.template, exclude=row.result, limit=5)}


@frappe.whitelist(methods=["POST"])
def save_result(invoice_item, values=None, text_result=None, attachment=None):  # attachment = report file URL (scan / outside lab)
	require_roles(*LAB_STAFF)
	res = lab.enter_results(invoice_item, frappe.parse_json(values) if values else {}, text_result, attachment)
	return result_form(invoice_item) | {"saved": res.name, "has_critical": res.has_critical}


@frappe.whitelist(methods=["POST"])
def critical_log(result, notified_person, method, read_back=0, note=None, parameter=None):
	require_roles(*LAB_STAFF)
	return lab.log_critical(result, notified_person, method, read_back, note, parameter).as_dict()


@frappe.whitelist()
def verify_list(branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(R.PATHOLOGIST)
	rows = frappe.get_all("Lab Result", filters={"status": "Result Entered", "docstatus": 0, "branch": branch or default_branch()},
		fields=["name", "test_invoice", "test_name", "department", "patient", "patient_name", "gender", "age", "has_critical", "critical_logged", "entered_by",
			"entered_at", "version_no", "amendment_reason"], order_by="has_critical desc, entered_at")
	for r in rows:
		r["values"] = frappe.get_all("Lab Result Value", filters={"parent": r.name}, fields=["parameter", "value", "unit", "normal_range", "flag", "previous_value"],
			order_by="idx")
		r["text_result"] = frappe.db.get_value("Lab Result", r.name, "text_result")
		r["attachment"] = frappe.db.get_value("Lab Result", r.name, "attachment")
		r["priority"] = frappe.db.get_value("Test Invoice", r.test_invoice, "priority") or "Normal"
	rank = {"Urgent": 0, "Priority": 1}
	rows.sort(key=lambda r: (not r.has_critical, rank.get(r["priority"], 2), str(r.entered_at)))
	return rows


@frappe.whitelist(methods=["POST"])
def verify(result, interpretation=None):
	return lab.verify(result, interpretation).as_dict()


@frappe.whitelist(methods=["POST"])
def send_back(result, reason):
	return lab.send_back(result, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def amend(result, reason):
	return lab.amend(result, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def release(name, partial=0):
	require_roles(*LAB_STAFF)
	return lab.release(name, partial=cint(partial))


@frappe.whitelist(methods=["POST"])
def resend_link(name):
	require_roles(*LAB_STAFF)
	ti = frappe.get_doc("Test Invoice", name)
	if ti.status not in ("Released", "Partially Released"):
		frappe.throw(_("The report is not released yet."))
	from hospital_vvs.services import messaging

	link = lab.new_report_link(ti)
	messaging.send("lab_report_ready", patient=ti.patient, phone=ti.whatsapp_number, consent=True, reference_doctype="Test Invoice", reference_name=ti.name,
		context={"ref": ti.name, "link": link})
	return {"link": link}


@frappe.whitelist(methods=["POST"])
def revoke(name):
	require_roles(*LAB_STAFF)
	lab.revoke_links(name)
	return True


@frappe.whitelist()
def report_preview(name):
	"""Staff view of the full report (HTML), logged."""
	require_roles(*LAB_STAFF, R.DOCTOR, R.NURSE)
	ti = frappe.get_doc("Test Invoice", name)
	log_access("Lab report view", patient=ti.patient, reference_doctype="Test Invoice", reference_name=name)
	return lab.report_html(lab.report_data(name, include_all=False))


# ------------------------------------------------------------------ outsourced
@frappe.whitelist()
def outsourced(branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(*LAB_STAFF)
	branch = branch or default_branch()
	ready = frappe.db.sql("""select distinct s.name, s.patient_name, s.test_invoice, s.status, s.sample_type, s.creation from `tabLab Sample` s
		join `tabLab Sample Test` st on st.parent=s.name join `tabLab Test Template` t on t.name=st.template
		where s.branch=%s and t.outsourced=1 and s.status in ('Collected','Received') order by s.creation""", branch, as_dict=True)
	for r in ready:
		r["tests"] = frappe.get_all("Lab Sample Test", filters={"parent": r.name}, pluck="test_code")
	dispatches = frappe.get_all("Outsourced Dispatch", filters={"branch": branch}, fields=["name", "reference_lab", "dispatch_date", "courier", "expected_back",
		"status", "total_cost", "purchase_invoice"], order_by="creation desc", limit=50)
	for d in dispatches:
		d["samples"] = frappe.get_all("Outsourced Dispatch Item", filters={"parent": d.name}, fields=["sample", "test_invoice", "patient_name", "tests", "received", "result"])
		for s in d["samples"]:
			s["items"] = frappe.get_all("Test Invoice Item", filters={"sample": s.sample}, fields=["name", "template", "status"])
	return {"ready": ready, "dispatches": dispatches}


@frappe.whitelist(methods=["POST"])
def dispatch(samples, reference_lab, courier=None, expected_back=None):
	require_roles(*LAB_STAFF)
	return lab.dispatch(frappe.parse_json(samples), reference_lab, courier, expected_back).as_dict()


@frappe.whitelist(methods=["POST"])
def receive_outsourced(invoice_item, attachment=None, values=None, text_result=None):
	require_roles(*LAB_STAFF)
	return lab.receive_outsourced(invoice_item, attachment, frappe.parse_json(values) if values else None, text_result).as_dict()


@frappe.whitelist()
def dashboard(branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(*LAB_STAFF)
	branch = branch or default_branch()
	t = today()
	by_status = frappe.db.sql("""select tii.status, count(*) n from `tabTest Invoice Item` tii join `tabTest Invoice` ti on ti.name=tii.parent
		where ti.branch=%s and ti.posting_date=%s group by tii.status""", (branch, t), as_dict=True)
	tat = frappe.db.sql("""select count(*) n, sum(ti.released_at <= ti.expected_at) on_time from `tabTest Invoice` ti
		where ti.branch=%s and ti.posting_date >= curdate() - interval 30 day and ti.released_at is not null""", (branch,), as_dict=True)[0]
	overdue = frappe.db.count("Test Invoice", {"branch": branch, "expected_at": ["<", frappe.utils.now_datetime()], "status": ["in", ["Paid", "In Progress", "Partially Released"]]})
	rejected = frappe.db.sql("""select rejection_reason label, count(*) value from `tabLab Sample` where branch=%s and status='Rejected'
		and creation >= curdate() - interval 30 day group by rejection_reason""", (branch,), as_dict=True)
	critical = frappe.db.count("Lab Result", {"has_critical": 1, "critical_logged": 0, "docstatus": 0})
	return {"by_status": by_status, "tat": tat, "overdue": overdue, "rejected": rejected, "critical_open": critical,
		"to_verify": frappe.db.count("Lab Result", {"status": "Result Entered", "docstatus": 0})}


# ------------------------------------------------------------------ public report portal
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=30, seconds=600)
def report_open(token):
	t, err = lab.token_doc(token)
	if err:
		s = frappe.get_cached_doc("Clinic Settings")
		return {"error": err, "clinic": s.clinic_name, "phone": s.phone}
	lab.log_token_access(t, "opened")
	need = cint(frappe.db.get_single_value("Clinic Settings", "report_require_verification")) and not t.verified
	s = frappe.get_cached_doc("Clinic Settings")
	out = {"needs_verification": bool(need), "method": s.report_verification_method, "clinic": s.clinic_name, "phone": s.phone,
		"downloads_left": cint(t.max_downloads) - cint(t.download_count), "expires_at": str(t.expires_at)}
	if not need:
		out["report"] = lab.report_data(t.test_invoice)
	return out


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=20, seconds=900)
def report_verify(token, answer):
	t, err = lab.token_doc(token)
	if err:
		frappe.throw(_(err))
	lab.check_answer(t, answer)
	return {"report": lab.report_data(t.test_invoice), "downloads_left": cint(t.max_downloads) - cint(t.download_count)}


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=20, seconds=600)
def report_pdf(token):
	t, err = lab.token_doc(token)
	if err:
		frappe.throw(_(err))
	if cint(frappe.db.get_single_value("Clinic Settings", "report_require_verification")) and not t.verified:
		frappe.throw(_("Verify first."), frappe.PermissionError)
	t.download_count = cint(t.download_count) + 1
	lab.log_token_access(t, "download")
	frappe.local.response.filename = f"{t.test_invoice}.pdf"
	frappe.local.response.filecontent = lab.report_pdf(t.test_invoice)
	frappe.local.response.type = "pdf"


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=20, seconds=600)
def report_file(token, index):
	"""The scanned / outside-lab report file of one test, for the patient (same link + verification rules as the PDF)."""
	t, err = lab.token_doc(token)
	if err:
		frappe.throw(_(err))
	if cint(frappe.db.get_single_value("Clinic Settings", "report_require_verification")) and not t.verified:
		frappe.throw(_("Verify first."), frappe.PermissionError)
	tests = lab.report_data(t.test_invoice)["tests"]
	i = cint(index)
	if i < 0 or i >= len(tests) or not tests[i].get("attachment"):
		frappe.throw(_("No report file for this test."))
	data, fname = lab.attachment_bytes(tests[i]["attachment"])
	lab.log_token_access(t, "file")
	frappe.local.response.filename = fname
	frappe.local.response.filecontent = data
	frappe.local.response.type = "download"


@frappe.whitelist()
def print_pdf(name):
	"""Staff copy of the released report as PDF (scanned pages included) for printing and handing to the patient."""
	require_roles(R.LAB_USER, R.RECEPTIONIST, R.PATHOLOGIST)
	ti = frappe.get_doc("Test Invoice", name)
	if ti.status not in ("Released", "Partially Released"):
		frappe.throw(_("Release the report first."))
	log_access("Lab report printed", patient=ti.patient, reference_doctype="Test Invoice", reference_name=ti.name)
	frappe.local.response.filename = f"{ti.name}.pdf"
	frappe.local.response.filecontent = lab.report_pdf(ti.name)
	frappe.local.response.type = "pdf"


@frappe.whitelist(methods=["POST"])
def set_remarks(name, remarks=None):
	"""Pathologist's remarks printed on the report."""
	require_roles(R.PATHOLOGIST, R.LAB_USER)
	return {"remarks": lab.set_remarks(name, remarks).report_remarks}


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def verify_report(name, sig):
	"""Public QR check: is this report genuine (no results shown)."""
	return lab.public_check(name, sig)


@frappe.whitelist(methods=["POST"])
def hand_over(name, to):
	"""Printed report handed over at the counter (to the patient or an attendant)."""
	require_roles(R.LAB_USER, R.RECEPTIONIST)
	return lab.hand_over(name, to).as_dict()


@frappe.whitelist(methods=["POST"])
def upload_report_file(invoice_item, filename, filedata):
	"""Scan / photo of a handwritten report (or an outside lab's PDF) for one ordered test: private file on the result."""
	require_roles(R.LAB_USER, R.PATHOLOGIST)
	import base64

	from frappe.utils.file_manager import save_file

	ext = (filename or "").lower().rsplit(".", 1)[-1]
	if ext not in ("pdf", "jpg", "jpeg", "png", "webp"):
		frappe.throw(_("Upload a PDF or a photo (JPG / PNG)."))
	raw = base64.b64decode(filedata.split(",", 1)[-1])
	if len(raw) > 10 * 1024 * 1024:
		frappe.throw(_("The file is larger than 10 MB."))
	ti = frappe.db.get_value("Test Invoice Item", invoice_item, "parent")
	f = save_file(filename, raw, "Test Invoice", ti, is_private=1)
	return f.file_url


# ------------------------------------------------------------------ test templates (/lab/templates)
TPL_FIELDS = ("test_name", "test_code", "department", "sample_type", "container", "volume", "tat_hours", "price", "is_active", "result_type", "method",
	"text_template", "outsourced", "reference_lab", "outsource_cost", "auto_verify")
PARAM_FIELDS = ("parameter", "unit", "gender", "age_from", "age_to", "normal_low", "normal_high", "critical_low", "critical_high", "normal_text", "decimals", "analyzer_code")


@frappe.whitelist()
def templates(q=None, department=None):
	require_roles(R.PATHOLOGIST, R.LAB_USER)
	f = {"department": department} if department else {}
	or_f = {"test_name": ["like", f"%{q}%"], "test_code": ["like", f"%{q}%"]} if q else None
	rows = frappe.get_all("Lab Test Template", filters=f, or_filters=or_f, fields=["name", "test_name", "test_code", "department", "sample_type", "price", "tat_hours",
		"is_active", "outsourced", "result_type"], order_by="department, test_name", limit=500)
	counts = {r.parent: r.n for r in frappe.db.sql("select parent, count(*) n from `tabLab Test Parameter` where parenttype='Lab Test Template' group by parent", as_dict=True)}
	for r in rows:
		r["parameters"] = counts.get(r.name, 0)
	meta = frappe.get_meta("Lab Test Template")
	return {"rows": rows, "departments": (meta.get_field("department").options or "").split("\n"), "sample_types": (meta.get_field("sample_type").options or "").split("\n"),
		"containers": (meta.get_field("container").options or "").split("\n"), "labs": frappe.get_all("Supplier", fields=["name", "supplier_name"], limit=200)}


@frappe.whitelist()
def template(name):
	require_roles(R.PATHOLOGIST, R.LAB_USER)
	return frappe.get_doc("Lab Test Template", name).as_dict()


@frappe.whitelist(methods=["POST"])
def save_template(data):
	"""Create / update a test template with its parameters (pathologist). Price changes apply to new orders only."""
	require_roles(R.PATHOLOGIST)
	d = frappe.parse_json(data)
	doc = frappe.get_doc("Lab Test Template", d["name"]) if d.get("name") and frappe.db.exists("Lab Test Template", d["name"]) else frappe.new_doc("Lab Test Template")
	for k in TPL_FIELDS:
		if k in d and not (k == "test_name" and not doc.is_new()):
			doc.set(k, d[k])
	if "parameters" in d:
		doc.set("parameters", [{k: p.get(k) for k in PARAM_FIELDS} for p in d["parameters"] if (p.get("parameter") or "").strip()])
	for p in doc.parameters:
		if p.normal_low is not None and p.normal_high is not None and flt(p.normal_high) and flt(p.normal_low) > flt(p.normal_high):
			frappe.throw(_("{0}: normal low is above normal high.").format(p.parameter))
	doc.flags.ignore_permissions = True
	doc.save()
	return doc.as_dict()
