"""Phase 7 hardening audit (09-security-ops.md, W15, W17), run as the real demo users: who can reach what, which fields leak,
public endpoints, brute force, audit trail, branch lock, performance targets, backups and docs. Results: docs/qa-hardening-run.json.

bench --site hospital execute hospital_vvs.devtools.qa_hardening.run

Some checks go over HTTP to the running site (default http://hospital.localhost:8011, override with site_config hv_qa_base_url)
using sessions minted on the server — no passwords are used. Results marked WARN are owner decisions, not defects.
"""

import ast
import glob
import json
import os
import subprocess
import time

import frappe
from frappe.utils import add_to_date, cint, get_datetime, now_datetime

from hospital_vvs import roles as R
from hospital_vvs.devtools.qa_lab import CHECKS, STATE, as_user, check, raises, scenario

CASHIER, FINDER, ACC, DISP, NURSE = "cashier@vvs.demo", "finder@vvs.demo", "accounts@vvs.demo", "dispenser@vvs.demo", "nurse@vvs.demo"
DOC, REC, ADMIN, LAB, PATH, SUPER = "dr.ayesha@vvs.demo", "reception@vvs.demo", "admin@vvs.demo", "lab@vvs.demo", "pathologist@vvs.demo", "supervisor@vvs.demo"
NON_CLINICAL = (CASHIER, FINDER, ACC, DISP)
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(os.path.dirname(APP), "docs")
CTX = {}

# Public (Guest) endpoints, reviewed: each one checks a token / device key / OTP or only returns public clinic info, and is rate-limited.
PUBLIC = {
	"appointments": {"public_options", "public_dates", "public_slots", "public_hold", "public_release", "request_otp", "verify_otp", "public_book",
		"upload_proof", "manage_get", "manage_reschedule", "manage_cancel"},
	"comms": {"portal", "portal_send", "feedback_form", "feedback_submit"},
	"lab": {"report_open", "report_verify", "report_pdf", "report_file", "verify_report"},
	"messaging": {"whatsapp_webhook"},
	"online_visit": {"form_context", "request_otp", "verify_otp", "upload", "submit", "status", "verify", "pay", "pay_card", "cancel_request"},
	"payments": {"checkout", "mock_pay"},
	"pharmacy": {"display"},
}
# Logged-in endpoints without an explicit role check, reviewed: no patient / money data, or the check is inside the service.
OPEN_OK = {
	"appointments.slots": "free slot times only", "appointments.dates": "available dates only",
	"billing.discount_status": "only the requester or a supervisor", "billing.decide": "service checks approver role",
	"billing.approve_with_pin": "approver's password + role checked; failures limited", "cash.decide": "service: cash supervisor only",
	"cash.confirm_drop": "service: cash supervisor only", "doctor_share.my_statement": "own doctor only",
	"finance.expense_action": "service: current approver only", "lab.send_back": "service: pathologist only", "lab.amend": "service: pathologist only",
	"ipd.search_items": "item master only", "lab.verify": "service: pathologist only", "opd.display": "token and room only (waiting-room screen)", "patients.urdu_words": "spelling list",
	"roster.assign": "_head() check", "roster.unassign": "_head() check", "roster.copy_week": "_head() check",
	"session.boot": "own session", "session.unlock": "own password; failures limited", "session.set_language": "own preference",
	"session.allowed_routes": "own routes", "store.count_approve": "service: admin only", "ward.kiosk": "initials only (ward screen)",
	"opd.counter_context": "doctors, fees and counts; branch checked", "patients.search": "staff patient lookup, no clinical fields; branch-free by design (shared MR)",
}
GUARDS = ("require_roles", "has_any_role(*R.CNIC_REVEAL)", "check_permission", "has_permission", "only_for", "check_branch", "_head()", "can_see_clinical", "_require")
# Logs and read-only masters that do not need a version history.
NO_TRACK_OK = {"Clinical Access Log", "Patient Merge Log", "Bed Status Log", "Message Log", "Comms Message", "Station Broadcast",
	"WhatsApp Conversation", "Urdu Word", "Lab Report Access Token", "Time Slot"}


# ------------------------------------------------------------------ helpers
def base_url():
	return (frappe.conf.get("hv_qa_base_url") or "http://hospital.localhost:8011").rstrip("/")


def sid(user):
	"""Server-side session for HTTP checks (no password)."""
	if user in CTX.setdefault("sids", {}):
		return CTX["sids"][user]
	from frappe.sessions import Session
	from werkzeug.test import EnvironBuilder
	from werkzeug.wrappers import Request

	keep = frappe.session.user
	frappe.local.request = Request(EnvironBuilder(path="/", headers={"User-Agent": "hv-hardening-qa"}).get_environ())
	frappe.local.request_ip = "127.0.0.1"
	s = Session(user=user, resume=False, full_name=user, user_type="System User")
	frappe.db.commit()
	frappe.local.request = None
	frappe.set_user(keep)
	CTX["sids"][user] = s.sid
	return s.sid


def http(method, user=None, **data):
	import requests

	t = time.perf_counter()
	csrf = CTX.setdefault("csrf", {}).get(user)
	r = requests.post(f"{base_url()}/api/method/{method}", data=data, cookies={"sid": sid(user)} if user else None, timeout=30,
		headers={"X-Frappe-CSRF-Token": csrf} if csrf else None)
	if user and r.ok and method.endswith("session.boot"):
		CTX["csrf"][user] = ((r.json().get("message") or {}).get("csrf_token")) or csrf  # later POSTs of this session need it
	return r, (time.perf_counter() - t) * 1000


def timed(fn):
	t = time.perf_counter()
	out = fn()
	return out, (time.perf_counter() - t) * 1000


def endpoints():
	"""(module, function name, allow_guest, source) for every whitelisted function in hospital_vvs/api."""
	out = []
	for f in sorted(glob.glob(os.path.join(APP, "api", "*.py"))):
		mod = os.path.basename(f)[:-3]
		for n in ast.parse(open(f).read()).body:
			if isinstance(n, ast.FunctionDef):
				wl = [d for d in n.decorator_list if "whitelist" in ast.unparse(d)]
				if wl:
					out.append((mod, n.name, "allow_guest=True" in ast.unparse(wl[0]), ast.unparse(n)))
	return out


def subject():
	"""A patient with a signed prescription that has a diagnosis, and at least one allergy (added if missing)."""
	rows = frappe.db.sql("""select rx.name, rx.patient from `tabPrescription` rx where rx.docstatus=1 and rx.status='Signed'
		and exists (select 1 from `tabPrescription Diagnosis` d where d.parent=rx.name) and exists (select 1 from `tabPrescription Medicine` m where m.parent=rx.name)
		order by rx.creation desc limit 40""", as_dict=True)
	for r in rows:
		if frappe.db.count("Patient Allergy", {"parent": r.patient}) if frappe.db.table_exists("Patient Allergy") else 0:
			return r.name, r.patient
	rx, mr = rows[0].name, rows[0].patient
	p = frappe.get_doc("Patient", mr)
	allergy = frappe.db.get_value("Allergy", {}) or frappe.get_doc({"doctype": "Allergy", "allergy_name": "Penicillin"}).insert().name
	p.append("allergies", {"allergy": allergy})
	p.flags.ignore_permissions = True
	p.save()
	frappe.db.commit()
	return rx, mr


# ------------------------------------------------------------------ H01 role guards on clinical / money endpoints
@scenario("H01 role guards — cashiers, finders and accounts cannot reach clinical data")
def h01():
	from hospital_vvs.api import ipd, opd, patients, pharmacy, prescription, ward, finance

	rx, mr = CTX["rx"], CTX["mr"]
	item = frappe.db.get_value("Prescription Medicine", {"parent": rx}, "item")
	bed = frappe.db.get_value("Hospital Bed", {})
	for u in NON_CLINICAL:
		as_user(u)
		short = u.split("@")[0]
		raises(f"H01-{short}-1", f"{short}: copy previous prescription (diagnoses) is refused", lambda: prescription.copy_previous(mr), frappe.PermissionError)
		raises(f"H01-{short}-2", f"{short}: live allergy / interaction check is refused", lambda: prescription.check(mr, json.dumps([{"item": item}])), frappe.PermissionError)
		raises(f"H01-{short}-3", f"{short}: prescription print data is refused", lambda: prescription.print_data(rx), frappe.PermissionError)
		raises(f"H01-{short}-4", f"{short}: patient history is refused", lambda: patients.history(mr), frappe.PermissionError)
		raises(f"H01-{short}-5", f"{short}: IPD medicine safety check is refused", lambda: ipd.check_medicine(mr, item), frappe.PermissionError)
		raises(f"H01-{short}-6", f"{short}: diagnosis suggestions are refused", lambda: prescription.common_diagnoses(), frappe.PermissionError)
	for u in (CASHIER, FINDER):
		as_user(u)
		short = u.split("@")[0]
		raises(f"H01-{short}-7", f"{short}: bed map (admission reasons) is refused", lambda: ward.bed_map(), frappe.PermissionError)
		if bed:
			raises(f"H01-{short}-8", f"{short}: bed history is refused", lambda: ward.bed_history(bed), frappe.PermissionError)
		raises(f"H01-{short}-9", f"{short}: today's OPD slips list is refused", lambda: opd.recent_slips(), frappe.PermissionError)
	as_user(FINDER)
	raises("H01-finder-10", "finder: payer preview (panel / insurance of a patient) is refused", lambda: finance.payer_preview(mr), frappe.PermissionError)
	si = frappe.db.get_value("Sales Invoice", {"docstatus": 1, "hv_prescription": ["is", "set"]}) or frappe.db.get_value("Sales Invoice", {"docstatus": 1})
	as_user(NURSE)
	raises("H01-nurse-11", "nurse: pharmacy receipt (money) is refused", lambda: pharmacy.receipt(si), frappe.PermissionError)
	# the people who need them still get them
	as_user(DOC)
	check("H01-12", "doctor copies the previous prescription", bool(prescription.copy_previous(mr).get("medicines") is not None))
	as_user(REC)
	check("H01-13", "receptionist can reprint a prescription for the patient", bool(prescription.print_data(rx).get("rx")))
	as_user(NURSE)
	check("H01-14", "nurse opens patient history", bool(patients.history(mr).get("patient")))
	as_user(CASHIER)
	check("H01-15", "cashier opens a pharmacy receipt", bool(pharmacy.receipt(si).get("name")))
	check("H01-16", "cashier loads the signed prescription into the POS", bool(pharmacy.prescription(rx).get("lines")))


# ------------------------------------------------------------------ H02 field-level: hidden in API responses, not just the UI
@scenario("H02 field-level — hidden fields are missing from API responses")
def h02():
	from frappe import client
	from hospital_vvs.api import patients, pharmacy

	rx, mr = CTX["rx"], CTX["mr"]
	as_user(FINDER)
	d = client.get("Prescription", rx)
	check("H02-1", "finder reads a prescription without diagnoses", not d.get("diagnoses"), f"{len(d.get('diagnoses') or [])} diagnoses returned")
	check("H02-2", "finder reads a prescription without examination notes", not d.get("examination_notes"))
	check("H02-3", "finder still sees the medicines to pick", bool(d.get("medicines")))
	as_user(NURSE)
	check("H02-4", "nurse (clinical) sees the diagnoses", bool(client.get("Prescription", rx).get("diagnoses")))
	as_user(CASHIER)
	p = client.get("Patient", mr)
	check("H02-5", "cashier reads the patient without allergies / chronic conditions / blood group",
		not (p.get("allergies") or p.get("chronic_conditions") or p.get("blood_group") or p.get("long_term_medicines")))
	lines = pharmacy.prescription(rx)["lines"]
	check("H02-6", "POS prescription lines carry no allergy / interaction alert text for the cashier", not any(l.get("alert") or l.get("override") for l in lines),
		[l.get("alert") for l in lines if l.get("alert")][:2])
	found = patients.search(mr)
	check("H02-7", "patient search returns no clinical fields", not any(k in json.dumps(found, default=str) for k in ("allerg", "diagnos", "chronic")))
	raises("H02-8", "cashier cannot read a lab result", lambda: client.get("Lab Result", frappe.db.get_value("Lab Result", {}) or "x"), frappe.PermissionError)
	slip = frappe.db.get_value("OPD Slip", {"docstatus": 1, "bp_systolic": [">", 0]})
	if slip:
		as_user(ACC)
		s = client.get("OPD Slip", slip)
		check("H02-9", "accountant reads an OPD slip without vitals or complaint", not (s.get("bp_systolic") or s.get("chief_complaint") or s.get("temperature")))
	r, _ms = http("frappe.client.get", FINDER, doctype="Prescription", name=rx)
	check("H02-10", "over HTTP too: finder's prescription has no diagnoses", r.ok and not (r.json().get("message") or {}).get("diagnoses"), r.status_code)


# ------------------------------------------------------------------ H03 public endpoints over HTTP
@scenario("H03 public surface — Guest reaches only the reviewed public endpoints")
def h03():
	eps = endpoints()
	guest = {(m, n) for m, n, g, _ in eps if g}
	allowed = {(m, n) for m, ns in PUBLIC.items() for n in ns}
	check("H03-1", "no new public (Guest) endpoint outside the reviewed list", not (guest - allowed), sorted(f"{m}.{n}" for m, n in guest - allowed))
	unlimited = [f"{m}.{n}" for m, n, g, src in eps if g and "rate_limit" not in src and f"{m}.{n}" != "messaging.whatsapp_webhook"]  # webhook: Meta HMAC signature
	check("H03-2", "every public endpoint is rate-limited", not unlimited, unlimited)
	leaked = []
	for m, n, g, _src in eps:
		if g:
			continue
		r, _ms = http(f"hospital_vvs.api.{m}.{n}")
		if r.status_code == 200:
			leaked.append(f"{m}.{n}")
	check("H03-3", f"all {sum(1 for e in eps if not e[2])} staff endpoints refuse a Guest over HTTP", not leaked, leaked[:10])
	bad = []
	for m, n, arg in (("appointments", "manage_get", "token"), ("comms", "portal", "token"), ("comms", "feedback_form", "token"), ("lab", "report_open", "token"),
			("online_visit", "status", "token"), ("payments", "checkout", "token"), ("pharmacy", "display", "key")):
		r, _ms = http(f"hospital_vvs.api.{m}.{n}", **{arg: "x" * 32})
		msg = r.json().get("message") if r.status_code == 200 else None
		if r.status_code == 200 and not (isinstance(msg, dict) and msg.get("error") and not msg.get("report")):  # an error page with the clinic phone is fine
			bad.append(f"{m}.{n}")
	check("H03-4", "token links with a made-up token return nothing", not bad, bad)
	r, _ms = http("hospital_vvs.api.payments.mock_pay", token="x" * 27)
	check("H03-5", "the mock card page rejects an unknown payment", r.status_code != 200, r.status_code)


# ------------------------------------------------------------------ H04 every staff endpoint has a server-side check
@scenario("H04 endpoint audit — every staff endpoint checks role, permission or branch")
def h04():
	missing = []
	for m, n, g, src in endpoints():
		if g or f"{m}.{n}" in OPEN_OK:
			continue
		if not any(k in src for k in GUARDS):
			missing.append(f"{m}.{n}")
	check("H04-1", "no staff endpoint without a server-side check (or a reviewed reason)", not missing, missing)
	src = open(os.path.join(APP, "api", "appointments.py")).read()
	check("H04-2", "internal SQL helper shift_cond is not callable from outside", "@frappe.whitelist()\ndef shift_cond" not in src)


# ------------------------------------------------------------------ H05 brute force on password prompts
@scenario("H05 brute force — wrong passwords are limited on the lock screen and counter approval")
def h05():
	from hospital_vvs.api import billing, session
	from hospital_vvs.utils import fail_reset

	as_user(NURSE)
	fail_reset("unlock", NURSE)
	errs = []
	for _ in range(6):
		try:
			session.unlock("wrong-password-qa")
		except Exception as e:
			errs.append(type(e).__name__)
		frappe.local.message_log = []
	check("H05-1", "lock screen: the 6th wrong password in 10 min is blocked", errs[-1:] == ["TooManyRequestsError"], errs)
	fail_reset("unlock", NURSE)
	da = frappe.db.get_value("Discount Authorization", {"status": "Pending"})
	as_user(CASHIER)
	fail_reset("pin", "qa-nobody@vvs.demo")
	errs = []
	for _ in range(6):
		try:
			billing.approve_with_pin(da or "x", "qa-nobody@vvs.demo", "wrong")
		except Exception as e:
			errs.append(type(e).__name__)
		frappe.local.message_log = []
	check("H05-2", "counter approval: the 6th wrong supervisor password in 10 min is blocked", errs[-1:] == ["TooManyRequestsError"], errs)
	fail_reset("pin", "qa-nobody@vvs.demo")
	ss = frappe.get_single("System Settings")
	check("H05-3", "login lockout after repeated failures is on", cint(ss.allow_consecutive_login_attempts) > 0 and cint(ss.allow_login_after_fail) > 0,
		f"attempts={ss.allow_consecutive_login_attempts}, wait={ss.allow_login_after_fail}s")


# ------------------------------------------------------------------ H06 W15: 2FA, idle lock, access log, audit screen
@scenario("H06 W15 security — 2FA, idle lock, access log and audit screen")
def h06():
	from hospital_vvs.api import admin, patients, session

	ss = frappe.get_single("System Settings")
	s = frappe.get_single("Clinic Settings")
	two = all(cint(frappe.db.get_value("Role", r, "two_factor_auth")) for r in R.TWO_FACTOR)
	check("H06-1", "2FA flag set on Admin, Accountant, Cash Supervisor, Pathologist roles", two)
	on = cint(ss.enable_two_factor_auth) and cint(s.enforce_two_factor)
	CHECKS.append({"id": "H06-2", "scenario": STATE["scenario"], "check": "2FA switched on for the site", "result": "PASS" if on else "WARN",
		"detail": "" if on else "off on this demo site — turn on before go-live (Clinic Settings → Enforce two-factor; System Settings → Enable 2FA)"})
	print(("  ✓ " if on else "  ! ") + "H06-2 2FA switched on for the site")
	r, _ms = http("hospital_vvs.api.session.boot", NURSE)
	b = r.json().get("message") if r.ok else {}
	check("H06-3", "idle lock minutes reach the browser (lock screen)", "idle" in json.dumps(b, default=str) and cint(s.idle_lock_minutes) > 0, f"{r.status_code} {s.idle_lock_minutes} min")
	pol = cint(ss.enable_password_policy)
	CHECKS.append({"id": "H06-4", "scenario": STATE["scenario"], "check": "password strength policy", "result": "PASS" if pol else "WARN",
		"detail": "" if pol else "off (demo passwords) — turn on with minimum score 3 and reset passwords before go-live"})
	print(("  ✓ " if pol else "  ! ") + "H06-4 password strength policy")
	mr = CTX["mr"]
	t0 = now_datetime()
	as_user(DOC)
	patients.history(mr)
	frappe.db.commit()
	log = frappe.db.get_value("Clinical Access Log", {"user": DOC, "patient": mr, "accessed_on": [">=", add_to_date(t0, seconds=-2)]}, ["name", "action"], as_dict=True)
	check("H06-5", "opening a patient's history writes the access log (who, what, when)", bool(log), log)
	as_user(ADMIN)
	rows = admin.audit(patient=mr, limit=20)
	rows = rows.get("rows", rows) if isinstance(rows, dict) else rows
	check("H06-6", "admin audit screen shows who viewed the history", any(r.get("user") == DOC for r in rows))
	if log:
		raises("H06-7", "access log cannot be deleted (even by an admin)", lambda: frappe.delete_doc("Clinical Access Log", log.name), frappe.PermissionError)
		raises("H06-8", "access log cannot be edited", lambda: frappe.get_doc("Clinical Access Log", log.name).save(), (frappe.PermissionError, frappe.ValidationError))
	as_user(DOC)
	raises("H06-9", "a doctor cannot open the audit screen", lambda: admin.audit(patient=mr), frappe.PermissionError)
	as_user(CASHIER)
	from hospital_vvs.api import patients as P
	raises("H06-10", "cashier cannot reveal a full CNIC (and the try is logged)", lambda: P.reveal_cnic(mr), frappe.PermissionError)
	check("H06-11", "denied CNIC reveal is in the access log", bool(frappe.db.exists("Clinical Access Log", {"user": CASHIER, "action": "CNIC reveal denied", "patient": mr})))


# ------------------------------------------------------------------ H07 track changes
@scenario("H07 audit trail — clinical and financial documents keep a version history")
def h07():
	rows = frappe.db.sql("""select name from tabDocType where module in (select name from `tabModule Def` where app_name='hospital_vvs')
		and istable=0 and issingle=0 and track_changes=0""", pluck=True)
	missing = sorted(set(rows) - NO_TRACK_OK)
	check("H07-1", "every app document (except append-only logs) tracks changes", not missing, missing)
	core = ["Sales Invoice", "Payment Entry", "Journal Entry", "POS Opening Entry", "POS Closing Entry", "Stock Entry", "Purchase Invoice"]
	off = [d for d in core if not cint(frappe.db.get_value("DocType", d, "track_changes")) and not frappe.db.get_value("Property Setter", {"doc_type": d, "property": "track_changes", "value": "1"})]
	check("H07-2", "ERPNext money documents track changes", not off, off)


# ------------------------------------------------------------------ H08 branch lock (single branch live; two-branch W17 is a unit test)
@scenario("H08 branch lock — users stay inside their branch")
def h08():
	from hospital_vvs.api import lab, opd
	from hospital_vvs.utils import check_branch

	check("H08-1", "strict branch access is on", cint(frappe.db.get_single_value("Clinic Settings", "strict_branch_access")) == 1)
	users = frappe.db.sql("""select distinct u.name from tabUser u join `tabHas Role` r on r.parent=u.name where u.enabled=1 and r.role like 'PW %%'
		and r.role != 'PW Admin' and u.name not in (select parent from `tabHas Role` where role='PW Admin')""", pluck=True)
	nobranch = [u for u in users if not frappe.db.exists("User Permission", {"user": u, "allow": "Branch"})]
	check("H08-2", f"all {len(users)} staff users are tied to a branch", not nobranch, nobranch)
	for u, fn, label in ((REC, lambda: opd.queue(branch="QA Nowhere"), "reception: another branch's OPD queue"),
			(REC, lambda: opd.recent_slips(branch="QA Nowhere"), "reception: another branch's OPD slips"),
			(LAB, lambda: lab.orders(branch="QA Nowhere"), "lab: another branch's orders"),
			(CASHIER, lambda: check_branch("QA Nowhere"), "cashier: any other branch")):
		as_user(u)
		raises(f"H08-{label[:10]}", f"{label} is refused", fn, frappe.PermissionError)
	from hospital_vvs.services import shifts

	as_user(CASHIER)
	mine = [c.name for c in shifts.counters_for()]
	allc = frappe.get_all("Counter", filters={"is_active": 1}, pluck="name")
	check("H08-6", "cashier is offered only counters whose POS profile lists them", bool(mine) and all(CASHIER in shifts.counter_staff(c) for c in mine), f"{mine} of {len(allc)}")
	other = next((c for c in allc if c not in mine), None)
	if other:
		raises("H08-7", f"cashier cannot open a shift on another counter ({other})", lambda: shifts.check_counter(other), frappe.PermissionError)


# ------------------------------------------------------------------ H09 performance targets (clinic LAN)
@scenario("H09 performance — 09-security-ops.md targets")
def h09():
	from hospital_vvs.api import lab, opd, patients, pharmacy, session

	mr = CTX["mr"]
	name = frappe.db.get_value("Patient", mr, "patient_name").split()[0]
	phone = frappe.db.get_value("Patient", mr, "phone") or "0300"
	as_user(REC)
	for cid, label, fn, target in (("H09-1", "patient search by MR", lambda: patients.search(mr), 500), ("H09-2", "patient search by name", lambda: patients.search(name), 500),
			("H09-3", "patient search by phone", lambda: patients.search(phone[-7:]), 500), ("H09-4", "OPD queue (whole branch)", lambda: opd.queue(), 1000)):
		timed(fn)  # warm cache
		_, ms = timed(fn)
		check(cid, f"{label} under {target} ms", ms < target, f"{ms:.0f} ms")
	as_user(NURSE)
	_, ms = timed(lambda: patients.history(mr))
	check("H09-6", "patient history under 2000 ms", ms < 2000, f"{ms:.0f} ms")
	as_user(CASHIER)
	item = frappe.db.get_value("Item", {"hv_is_medicine": 1, "disabled": 0}, ["name", "item_name"], as_dict=True)
	counter = None
	try:
		counter = pharmacy._counter()
	except Exception:
		pass
	if counter:
		timed(lambda: pharmacy.search(item.item_name[:4]))
		_, ms = timed(lambda: pharmacy.search(item.item_name[:4]))
		check("H09-7", "POS item search under 300 ms", ms < 300, f"{ms:.0f} ms")
		_, ms = timed(lambda: pharmacy.quote(json.dumps([{"item_code": item.name, "qty": 1, "uom": frappe.db.get_value("Item", item.name, "stock_uom")}])))
		check("H09-8", "POS item add (price + stock) under 300 ms", ms < 300, f"{ms:.0f} ms")
	rep = frappe.db.get_value("Test Invoice", {"status": "Released"}) or frappe.db.get_value("Test Invoice", {"status": "Partially Released"})
	if rep:
		as_user(PATH)
		_, ms = timed(lambda: lab.print_pdf(rep))
		check("H09-9", "lab report PDF under 3000 ms", ms < 3000, f"{ms:.0f} ms")
	import requests

	t = time.perf_counter()
	r = requests.get(f"{base_url()}/hms", cookies={"sid": sid(REC)}, timeout=30)
	ms = (time.perf_counter() - t) * 1000
	check("H09-10", "React app page load (/hms) under 2000 ms", r.ok and ms < 2000, f"{r.status_code} {ms:.0f} ms")
	http("hospital_vvs.api.session.boot", NURSE)
	r, ms = http("hospital_vvs.api.session.boot", NURSE)
	check("H09-5", "session boot over HTTP under 1000 ms", r.ok and ms < 1000, f"{r.status_code} {ms:.0f} ms")
	r, ms = http("hospital_vvs.api.opd.queue", REC)
	check("H09-11", "OPD queue over HTTP under 1000 ms", r.ok and ms < 1000, f"{r.status_code} {ms:.0f} ms")


# ------------------------------------------------------------------ H10 operations: backups, health, anonymize, docs, seeder
@scenario("H10 operations — backups, health, staging anonymize, docs, demo seeder")
def h10():
	from hospital_vvs.api import ops
	from hospital_vvs.setup import anonymize

	bench = os.path.dirname(os.path.dirname(os.path.dirname(APP)))
	script = os.path.join(os.path.dirname(APP), "scripts", "verify_backup.sh")
	try:
		r = subprocess.run([script], cwd=bench, capture_output=True, text=True, timeout=300)
		ok, detail = r.returncode == 0, (r.stdout or r.stderr).strip().splitlines()[-1:] if (r.stdout or r.stderr) else ""
	except Exception as e:
		ok, detail = False, str(e)
	check("H10-1", "newest database backup decrypts and contains the tables (restore quick check)", ok, detail)
	as_user(ADMIN)
	h = ops.health()
	lb = h.get("last_backup") or ""
	age = None
	try:
		age = (now_datetime() - get_datetime(f"{lb[:4]}-{lb[4:6]}-{lb[6:8]} {lb[9:11]}:{lb[11:13]}")).total_seconds() / 3600
	except Exception:
		pass
	check("H10-2", "a backup was taken in the last 26 hours", age is not None and age < 26, f"{lb} ({age and round(age, 1)} h)")
	check("H10-3", "scheduler is on and running", h.get("scheduler_enabled") and not h.get("scheduler_stale"), {k: h.get(k) for k in ("scheduler_enabled", "scheduler_last_run")})
	check("H10-4", "health check reports disk, DB size and queues", all(k in h for k in ("disk_free_gb", "db_size_mb", "queued_jobs", "failed_messages_24h")))
	as_user(REC)
	raises("H10-5", "receptionist cannot open the health check", lambda: ops.health(), frappe.PermissionError)
	as_user("Administrator")
	raises("H10-6", "anonymize refuses to run on this (non-staging) site", lambda: anonymize.run(commit=False), frappe.PermissionError)
	api_md = open(os.path.join(DOCS, "API.md")).read()
	listed, mod = set(), None
	for line in api_md.splitlines():
		if line.startswith("## "):
			mod = line[3:].strip()
		elif line.startswith("| `") and mod:
			listed.add(f"{mod}.{line.split('`')[1]}")
	undoc = [f"{m}.{n}" for m, n, _g, _s in endpoints() if f"{m}.{n}" not in listed]
	check("H10-7", "docs/API.md lists every whitelisted method", not undoc, undoc[:12])
	from hospital_vvs.setup import demo

	check("H10-8", "one-command demo seeder exists (setup.demo.seed_all)", callable(getattr(demo, "seed_all", None)))
	needed = ["OPS.md", "API.md", "DECISIONS.md", "PROGRESS.md", "QA-LAB.md", "QA-OPD.md", "QA-PHARMACY.md"]
	check("H10-9", "docs folder has ops, API, decisions, progress and QA reports", all(os.path.exists(os.path.join(DOCS, d)) for d in needed))


def run():
	CHECKS.clear()
	frappe.flags.mute_messages = True
	CTX.clear()
	CTX["rx"], CTX["mr"] = subject()
	print(f"subject: {CTX['mr']} / {CTX['rx']}")
	try:
		for fn in (h01, h02, h03, h04, h05, h06, h07, h08, h09, h10):
			fn()
	finally:  # sign out the HTTP sessions this audit minted, so staff signed in as these demo users stay signed in
		from hospital_vvs.devtools.e2e import end_sessions

		end_sessions(CTX.get("sids") or {})
	as_user("Administrator")
	fails = [c for c in CHECKS if c["result"] == "FAIL"]
	warns = [c for c in CHECKS if c["result"] == "WARN"]
	out = {"run_at": str(now_datetime()), "site": frappe.local.site, "total": len(CHECKS), "passed": len(CHECKS) - len(fails) - len(warns),
		"failed": len(fails), "warnings": len(warns), "checks": CHECKS}
	with open(os.path.join(DOCS, "qa-hardening-run.json"), "w") as f:
		json.dump(out, f, indent=1, default=str)
	print(f"\n{out['passed']}/{out['total']} passed, {len(fails)} failed, {len(warns)} warnings")
	for c in fails:
		print(f"  FAIL {c['id']} {c['check']} — {c['detail']}")
	return {k: out[k] for k in ("total", "passed", "failed", "warnings")}
