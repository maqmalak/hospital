"""Sessions for the Playwright E2E tests (frontend/e2e): one server-side session per demo user, so tests need no passwords.

bench --site hospital execute hospital_vvs.devtools.e2e.sessions --kwargs "{'users': ['reception@vvs.demo']}"
Prints {"user": "sid", ...} on the last line.
"""

import json

import frappe


def sessions(users):
	from hospital_vvs.devtools.qa_hardening import CTX, sid

	CTX.clear()
	users = frappe.parse_json(users) if isinstance(users, str) else users
	out = {u: sid(u) for u in users}
	print(json.dumps(out))
	return out


def state(**kw):
	"""Small helpers the tests call for setup / checks that are not UI."""
	what = kw.get("what")
	if what == "open_shift":
		from hospital_vvs.services import shifts

		frappe.set_user(kw["user"])
		if not shifts.current_shift():
			shifts.open_shift(kw["counter"], {"Cash": 5000})
		frappe.db.commit()
		print(json.dumps({"ok": True}))
		return True
	if what == "subject":
		from hospital_vvs.devtools.qa_hardening import subject

		rx, mr = subject()
		print(json.dumps({"rx": rx, "mr": mr}))
		return {"rx": rx, "mr": mr}
	if what == "last_rx":
		rx = frappe.db.get_value("Prescription", {"patient": kw["patient"], "docstatus": 1}, "name", order_by="creation desc")
		out = {"name": rx, "meds": frappe.db.count("Prescription Medicine", {"parent": rx}) if rx else 0}
		print(json.dumps(out))
		return out
	if what == "doctor":
		d = frappe.db.get_value("Doctor", {"user": kw["user"]}, ["name", "doctor_name"], as_dict=True)
		print(json.dumps(d))
		return d
	if what == "queue_status":
		q = frappe.db.get_value("Queue Entry", {"patient": kw["patient"], "queue_date": frappe.utils.today()}, ["name", "status", "token_no"], as_dict=True, order_by="creation desc")
		print(json.dumps(q, default=str))
		return q
	if what == "patient_by_phone":
		from hospital_vvs.hospital_vvs.doctype.patient.patient import normalize_phone

		n = frappe.db.get_value("Patient", {"phone": normalize_phone(kw["phone"])}, "name")
		print(json.dumps({"name": n}))
		return n
