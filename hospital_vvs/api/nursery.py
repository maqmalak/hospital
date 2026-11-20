"""Nursery & Newborn Care API (D-95). Staff calls are role-checked (no baby data for other roles); public: facts, portal, verification."""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import add_to_date, getdate, today

from hospital_vvs import roles as R
from hospital_vvs.services import nursery as nz
from hospital_vvs.utils import require_roles

CLIN = (R.NURSERY_NURSE, R.NICU_NURSE, R.NEONATOLOGIST)
STAFF = (*CLIN, R.WARD_ADMIN)
BOARD = (*STAFF, R.SECURITY)


# ------------------------------------------------------------------ public
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=600)
def public_facts():
	return nz.public_facts()


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def verify(kind, name, sig):
	return nz.public_check(kind, name, sig)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=6, seconds=900)
def portal_request(ident, phone):
	return nz.portal_request(ident, phone)


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=12, seconds=900)
def portal_verify(phone, code):
	return nz.portal_verify(phone, code)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=600)
def portal_home(session):
	return nz.portal_home(session)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=30, seconds=600)
def portal_pdf(session, name, kind):
	nb = nz._own(session, name)
	if kind not in nz.KINDS or (kind == "discharge" and nb.status != "Discharged"):
		frappe.throw(_("Not available yet."))
	frappe.local.response.filename = f"{nb.name}-{kind}.pdf"
	frappe.local.response.filecontent = nz.document_pdf(kind, nb.name)
	frappe.local.response.type = "pdf"


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=60, seconds=600)
def portal_photo(session, update):
	data, fname = nz.portal_photo(session, update)
	frappe.local.response.filename = fname
	frappe.local.response.filecontent = data
	frappe.local.response.type = "download"
	frappe.local.response.display_content_as = "inline"


# ------------------------------------------------------------------ staff
@frappe.whitelist()
def board(branch=None):
	require_roles(*BOARD)
	b = nz.board(branch)
	if not frappe.get_roles() or (R.SECURITY in frappe.get_roles() and not set(frappe.get_roles()) & set(STAFF) and R.ADMIN not in frappe.get_roles()):
		for u in b["units"].values():  # security sees cots, names and tags only — no clinical values
			for row in u:
				if row.get("baby"):
					row["baby"] = {k: row["baby"][k] for k in ("name", "baby_name", "status", "tag_active", "band_no", "mother_name", "unit")}
		b["alerts"] = [a for a in b["alerts"] if a["kind"] == "security"]
	return b


@frappe.whitelist()
def context():
	require_roles(*BOARD)
	return {"doctors": frappe.get_all("Doctor", filters={"is_active": 1, "department": ["in", ["Paediatrics", "Gynaecology & Obstetrics"]]}, fields=["name", "doctor_name", "department"]),
		"free": {u: frappe.get_all("Hospital Bed", filters={"ward": ["in", nz.ward_for(u) or [""]], "status": "Available", "is_active": 1}, fields=["name", "bed_no", "ward"], order_by="bed_no") for u in nz.UNIT_WARD_TYPE},
		"epi": nz.EPI, "birth_vaccines": nz.BIRTH_VACCINES, "screenings": nz.SCREENINGS, "limits": nz.LIMITS}


@frappe.whitelist()
def mother_info(mother):
	require_roles(*STAFF)
	p = frappe.db.get_value("Patient", mother, ["name", "patient_name", "phone", "gender", "dob"], as_dict=True)
	if not p:
		frappe.throw(_("Patient not found."))
	p["admission"] = frappe.db.get_value("Bed Allotment", {"patient": mother, "status": ["in", ["Admitted", "Discharge Pending"]]}, ["name", "ward", "bed"], as_dict=True)
	p["babies"] = frappe.get_all("Newborn", filters={"mother": mother}, fields=["name", "baby_name", "birth_datetime", "status"], order_by="birth_datetime desc")
	return p


@frappe.whitelist(methods=["POST"])
def register(data):
	require_roles(*STAFF)
	return nz.register(frappe.parse_json(data))


@frappe.whitelist()
def chart(name):
	require_roles(*STAFF)
	return nz.chart(name)


@frappe.whitelist(methods=["POST"])
def add_entry(name, entry_type, data):
	require_roles(*CLIN)
	return nz.add_entry(name, entry_type, frappe.parse_json(data)).as_dict()


@frappe.whitelist(methods=["POST"])
def strike(entry, reason):
	require_roles(*CLIN)
	return nz.strike(entry, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def amend_entry(entry, data, reason=None):
	require_roles(*CLIN)
	return nz.amend(entry, frappe.parse_json(data), reason).as_dict()


@frappe.whitelist(methods=["POST"])
def set_status(name, status):
	require_roles(*CLIN)
	return nz.set_status(name, status).as_dict()


@frappe.whitelist(methods=["POST"])
def move(name, unit, cot=None, reason=None):
	require_roles(*STAFF)
	return nz.move(name, unit, cot, reason).as_dict()


@frappe.whitelist(methods=["POST"])
def update_baby(name, data):
	"""Naming the baby, blood group, consent and parents' details (no clinical fields)."""
	require_roles(*STAFF)
	d = frappe.parse_json(data)
	nb = frappe.get_doc("Newborn", name)
	for k in ("baby_name", "blood_group", "father_name", "portal_photo_consent", "mother_phone", "attending_doctor"):
		if k in d:
			nb.set(k, d[k])
	if d.get("baby_name") and not d["baby_name"].lower().startswith("baby"):
		nb.named = 1
		frappe.db.set_value("Patient", nb.baby_patient, "patient_name", d["baby_name"])
	nb.save(ignore_permissions=True)
	return nb.as_dict()


@frappe.whitelist(methods=["POST"])
def security_event(name, event, tag_no=None, with_whom=None, band_match=0, staff_id=None, note=None):
	require_roles(R.NURSERY_NURSE, R.NICU_NURSE, R.SECURITY, R.WARD_ADMIN)
	return nz.security_event(name, event, tag_no, with_whom, band_match, staff_id, note).as_dict()


@frappe.whitelist()
def security_log(date=None, name=None):
	require_roles(R.NURSERY_NURSE, R.NICU_NURSE, R.SECURITY, R.WARD_ADMIN)
	f = {"newborn": name} if name else {"at": [">=", add_to_date(getdate(date or today()), days=-6)]}
	rows = frappe.get_all("Newborn Security Event", filters=f, fields=["name", "newborn", "event", "at", "by_user", "staff_id", "with_whom", "band_match", "tag_no", "note"], order_by="at desc", limit=500)
	names = {r.newborn for r in rows}
	babies = {b.name: b for b in frappe.get_all("Newborn", filters={"name": ["in", list(names) or [""]]}, fields=["name", "baby_name", "band_no", "unit"])}
	for r in rows:
		b = babies.get(r.newborn) or {}
		r.update({"baby_name": b.get("baby_name"), "band_no": b.get("band_no"), "unit": b.get("unit"), "by_name": frappe.db.get_value("User", r.by_user, "full_name"), "at": str(r.at)[:16]})
	return {"events": rows, "babies": frappe.get_all("Newborn", filters={"status": ["!=", "Discharged"]}, fields=["name", "baby_name", "band_no", "tag_no", "tag_active", "unit"], order_by="baby_name")}


@frappe.whitelist(methods=["POST"])
def discharge(name, data):
	require_roles(R.NEONATOLOGIST)
	return nz.discharge(name, frappe.parse_json(data)).as_dict()


@frappe.whitelist(methods=["POST"])
def post_update(name, text, photo=None, approve=0):
	require_roles(*CLIN)
	return nz.post_update(name, text, photo, int(approve or 0)).as_dict()


@frappe.whitelist(methods=["POST"])
def approve_update(update, status="Approved"):
	require_roles(*CLIN)
	u = frappe.get_doc("Newborn Parent Update", update)
	u.status, u.approved_by = status if status in ("Approved", "Hidden", "Draft") else "Approved", frappe.session.user
	u.save(ignore_permissions=True)
	return u.as_dict()


@frappe.whitelist(methods=["POST"])
def upload_photo(name, filename, filedata):
	require_roles(*CLIN)
	import base64

	from frappe.utils.file_manager import save_file

	nb = frappe.get_doc("Newborn", name)
	if not nb.portal_photo_consent:
		frappe.throw(_("The parents have not consented to photos."))
	ext = (filename or "").lower().rsplit(".", 1)[-1]
	if ext not in ("jpg", "jpeg", "png", "webp"):
		frappe.throw(_("Upload a JPG or PNG photo."))
	raw = base64.b64decode(filedata.split(",", 1)[-1])
	if len(raw) > 6 * 1024 * 1024:
		frappe.throw(_("The photo is larger than 6 MB."))
	return {"file_url": save_file(f"{name}-{frappe.generate_hash(length=6)}.{ext}", raw, "Newborn", name, is_private=1).file_url}


@frappe.whitelist()
def document(name, kind, day=None):
	require_roles(*STAFF)
	return {"html": nz.document_html(kind, name, day)}


@frappe.whitelist()
def document_pdf(name, kind, day=None):
	require_roles(*STAFF)
	frappe.local.response.filename = f"{name}-{kind}.pdf"
	frappe.local.response.filecontent = nz.document_pdf(kind, name, day)
	frappe.local.response.type = "pdf"


@frappe.whitelist()
def reports(from_date=None, to_date=None):
	require_roles(R.NEONATOLOGIST, R.WARD_ADMIN)
	return nz.reports(from_date or add_to_date(getdate(today()), days=-29), to_date or today())
