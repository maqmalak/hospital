"""Radiology & Imaging API (D-91). Public: catalogue, slots, booking, report portal (booking ID / MR + mobile OTP), share links,
QR check. Staff: worklist, workflow actions, report editor, analytics, catalogue."""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import add_to_date, cint, getdate, today

from hospital_vvs import roles as R
from hospital_vvs.services import radiology as rad
from hospital_vvs.utils import log_access, require_roles, scope_branch

FRONT = (R.RECEPTIONIST, R.RADIOGRAPHER, R.SONOGRAPHER, R.RADIOLOGIST)
ROOM = (R.RADIOGRAPHER, R.SONOGRAPHER, R.RADIOLOGIST)
VIEW = (*FRONT, R.DOCTOR, R.NURSE)


# ------------------------------------------------------------------ public
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=600)
def catalogue():
	return rad.public_catalogue()


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=240, seconds=600)
def dates(procedure):
	return rad.dates(procedure)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=240, seconds=600)
def slots(procedure, date):
	return rad.slots(procedure, date)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=8, seconds=900)
def book(data):
	d = frappe.parse_json(data)
	source = d.get("source") if d.get("source") in ("Online", "WhatsApp") else "Online"
	doc = rad.book(d, source=source)
	out = rad.booking_summary(doc)
	if doc.payment_option == "Pay online":
		from hospital_vvs.services import gateway

		if gateway.enabled():
			try:
				out["pay"] = gateway.start("Imaging Study", doc.name, return_url=frappe.utils.get_url(f"/hms/site/radiology/book?done={doc.booking_ref}"))
			except Exception:
				frappe.log_error(title="Imaging online payment start")
		out.setdefault("pay", None)
	return out


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=6, seconds=900)
def portal_request(ident, phone):
	return rad.portal_request(ident, phone)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=12, seconds=900)
def portal_verify(ident, phone, code):
	return rad.portal_verify(ident, phone, code)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=600)
def portal_list(session):
	return rad.portal_list(session)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def portal_report(session, name):
	return rad.portal_report(session, name)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=30, seconds=600)
def portal_pdf(session, name):
	doc = rad._own(session, name)
	frappe.local.response.filename = f"{doc.booking_ref}-{doc.procedure_name}.pdf".replace("/", "-")
	frappe.local.response.filecontent = rad.report_pdf(doc.name)
	frappe.local.response.type = "pdf"


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=600)
def portal_image(session, name, index):
	data, fname = rad.key_image(session, name, index)
	frappe.local.response.filename = fname
	frappe.local.response.filecontent = data
	frappe.local.response.type = "download"
	frappe.local.response.display_content_as = "inline"


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=900)
def portal_share(session, name, hours=72, recipient=None):
	return rad.share(session, name, hours, recipient)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=900)
def portal_copy(session, name, kind="Printed copy", note=None):
	return rad.request_copy(session, name, kind, note)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def shared(token):
	return rad.shared_open(token)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def verify(name, sig):
	return rad.public_check(name, sig)


# ------------------------------------------------------------------ staff
@frappe.whitelist()
def context():
	require_roles(*VIEW)
	return {
		"procedures": frappe.get_all("Imaging Procedure", filters={"is_active": 1}, fields=["name", "procedure_name", "modality", "category", "price", "walk_in",
			"needs_consent", "female_only", "duration_min", "tat_hours"], order_by="modality, sort_order, procedure_name"),
		"radiologists": frappe.get_all("Doctor", filters={"is_active": 1, "department": "Radiology"}, fields=["name", "doctor_name"], order_by="doctor_name"),
		"doctors": frappe.get_all("Doctor", filters={"is_active": 1}, fields=["name", "doctor_name", "specialization"], order_by="doctor_name"),
		"panels": frappe.get_all("Customer", filters={"customer_group": ["in", ["Insurance Providers", "Panels"]], "disabled": 0}, pluck="name"),
		"me": rad.doctor_of(), "hours": rad.HOURS,
	}


@frappe.whitelist()
def worklist(date=None, to_date=None, modality=None, status=None, radiologist=None, q=None, branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(*VIEW)
	return rad.worklist(date, to_date, modality, status, radiologist, q, branch)


@frappe.whitelist()
def study(name):
	require_roles(*VIEW)
	return rad.study(name)


@frappe.whitelist(methods=["POST"])
def create(data):
	require_roles(*FRONT, R.DOCTOR, R.NURSE)
	d = frappe.parse_json(data)
	if d.get("patient"):
		p = frappe.db.get_value("Patient", d["patient"], ["patient_name", "gender", "phone", "dob"], as_dict=True)
		if not p:
			frappe.throw(_("Patient not found."))
		from hospital_vvs.api.patients import age_of

		d.setdefault("patient_name", p.patient_name)
		d.setdefault("gender", p.gender)
		d.setdefault("phone", p.phone)
		d.setdefault("age", age_of(p.dob))
	if not d.get("patient_name"):
		frappe.throw(_("Choose the patient."))
	source = d.get("source") if d.get("source") in ("Walk-in", "Phone", "WhatsApp", "Ward / ICU", "OPD") else "Walk-in"
	doc = rad.book(d, source=source, staff=True)
	return {"name": doc.name, "booking_ref": doc.booking_ref}


def _act(fn, *args, roles=FRONT, **kw):
	require_roles(*roles)
	return fn(*args, **kw).as_dict()


@frappe.whitelist(methods=["POST"])
def register(name, patient=None):
	return _act(rad.register, name, patient, roles=(*FRONT,))


@frappe.whitelist(methods=["POST"])
def bill(name, payment_mode="Cash", payments=None):
	return _act(rad.bill, name, payment_mode, frappe.parse_json(payments) if payments else None, roles=(R.RECEPTIONIST,))


@frappe.whitelist(methods=["POST"])
def set_panel(name, panel, policy_no=None):
	return _act(rad.set_panel, name, panel, policy_no, roles=(R.RECEPTIONIST,))


@frappe.whitelist(methods=["POST"])
def start(name, consent=0, safety=0, pregnancy_status=None, override=None):
	return _act(rad.start, name, consent, safety, pregnancy_status, override, roles=ROOM)


@frappe.whitelist(methods=["POST"])
def complete_scan(name, qc_passed=1, qc_note=None, films=None):
	return _act(rad.complete_scan, name, qc_passed, qc_note, films, roles=ROOM)


@frappe.whitelist()
def apply_template(name, template):
	require_roles(*ROOM)
	return rad.apply_template(name, template)


@frappe.whitelist(methods=["POST"])
def save_report(name, data, stage="Draft"):
	return _act(rad.save_report, name, frappe.parse_json(data), stage, roles=ROOM)


@frappe.whitelist(methods=["POST"])
def finalize(name, data=None):
	return _act(rad.finalize, name, frappe.parse_json(data) if data else None, roles=(R.RADIOLOGIST,))


@frappe.whitelist(methods=["POST"])
def addendum(name, text):
	return _act(rad.addendum, name, text, roles=(R.RADIOLOGIST,))


@frappe.whitelist(methods=["POST"])
def critical(name, note):
	require_roles(*ROOM)
	doc = frappe.get_doc("Imaging Study", name)
	doc.critical_finding, doc.critical_note = 1, note
	rad.notify_critical(doc)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def deliver(name, via="Printed copy"):
	return _act(rad.deliver, name, via, roles=FRONT)


@frappe.whitelist(methods=["POST"])
def cancel(name, reason, no_show=0):
	return _act(rad.cancel, name, reason, cint(no_show), roles=(R.RECEPTIONIST, R.RADIOLOGIST))


@frappe.whitelist(methods=["POST"])
def upload_image(name, filename, filedata):
	"""Key image (JPEG / PNG export from the modality or PACS) → private file on the study."""
	require_roles(*ROOM)
	import base64

	from frappe.utils.file_manager import save_file

	ext = (filename or "").lower().rsplit(".", 1)[-1]
	if ext not in ("jpg", "jpeg", "png", "webp"):
		frappe.throw(_("Upload a JPG or PNG image."))
	raw = base64.b64decode(filedata.split(",", 1)[-1])
	if len(raw) > 8 * 1024 * 1024:
		frappe.throw(_("The image is larger than 8 MB."))
	f = save_file(f"{name}-{frappe.generate_hash(length=6)}.{ext}", raw, "Imaging Study", name, is_private=1)
	return {"file_url": f.file_url}


@frappe.whitelist()
def preview(name):
	"""Report as HTML for the editor's print preview (drafts show a NOT SIGNED stamp)."""
	require_roles(*VIEW)
	d = rad.report_data(name, staff=True)
	return {"html": rad.report_html(d), "data": d}


@frappe.whitelist()
def print_pdf(name):
	require_roles(*VIEW)
	doc = frappe.get_doc("Imaging Study", name)
	log_access("Imaging report printed", patient=doc.patient, reference_doctype="Imaging Study", reference_name=doc.name)
	frappe.local.response.filename = f"{doc.name}.pdf"
	frappe.local.response.filecontent = rad.report_pdf(doc.name, staff=True)
	frappe.local.response.type = "pdf"


@frappe.whitelist()
def analytics(from_date=None, to_date=None, branch=None):
	branch = scope_branch(branch, required=False)
	require_roles(R.RADIOLOGIST, R.ACCOUNTANT)
	return rad.analytics(from_date or add_to_date(getdate(today()), days=-29), to_date or today(), branch)


@frappe.whitelist()
def catalogue_admin():
	require_roles(R.RADIOLOGIST)
	return {"procedures": frappe.get_all("Imaging Procedure", fields=["*"], order_by="modality, sort_order, procedure_name"),
		"templates": frappe.get_all("Imaging Report Template", fields=["name", "modality", "procedure", "report_title", "is_active", "technique", "findings",
			"impression", "recommendations"], order_by="modality, name")}


PROC_EDIT = ("price", "duration_min", "tat_hours", "is_active", "show_on_website", "walk_in", "needs_consent", "description", "preparation", "prep_group",
	"default_template", "sort_order")
TPL_EDIT = ("report_title", "technique", "findings", "impression", "recommendations", "is_active", "procedure")


@frappe.whitelist(methods=["POST"])
def save_procedure(name, data):
	require_roles(R.RADIOLOGIST)
	d = frappe.parse_json(data)
	doc = frappe.get_doc("Imaging Procedure", name)
	doc.update({k: d[k] for k in PROC_EDIT if k in d})
	doc.save(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def create_procedure(data):
	"""New scan in the catalogue (name, modality, category required); billing item is created on first bill."""
	require_roles(R.RADIOLOGIST)
	d = frappe.parse_json(data)
	name = " ".join(str(d.get("procedure_name") or "").split())
	if len(name) < 3:
		frappe.throw(_("Name the procedure."))
	if frappe.db.exists("Imaging Procedure", name):
		frappe.throw(_("{0} is already in the catalogue.").format(name))
	if d.get("modality") not in ("X-Ray", "Ultrasound", "Doppler"):
		frappe.throw(_("Choose the modality."))
	cats = ("X-Ray", "Contrast Study", "Ultrasound", "Pregnancy", "Doppler", "Guided Procedure")
	doc = frappe.get_doc({"doctype": "Imaging Procedure", "procedure_name": name, "modality": d["modality"],
		"category": d.get("category") if d.get("category") in cats else {"X-Ray": "X-Ray", "Ultrasound": "Ultrasound", "Doppler": "Doppler"}[d["modality"]],
		"code": (d.get("code") or "").strip().upper() or None, "body_region": d.get("body_region"),
		"report_kind": d.get("report_kind") if d.get("report_kind") in ("General", "Obstetric", "Abdomen") else "General",
		"female_only": cint(d.get("female_only")), **{k: d[k] for k in PROC_EDIT if k in d}})
	doc.insert(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def save_template(data):
	require_roles(R.RADIOLOGIST)
	d = frappe.parse_json(data)
	name = (d.get("name") or d.get("template_name") or "").strip()
	if not name:
		frappe.throw(_("Name the template."))
	doc = frappe.get_doc("Imaging Report Template", name) if frappe.db.exists("Imaging Report Template", name) else frappe.get_doc(
		{"doctype": "Imaging Report Template", "template_name": name, "modality": d.get("modality") or "X-Ray"})
	doc.update({k: d[k] for k in TPL_EDIT if k in d})
	doc.save(ignore_permissions=True)
	return doc.as_dict()
