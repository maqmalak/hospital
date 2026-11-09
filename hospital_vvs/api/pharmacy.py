"""Pharmacy POS, dispense pipeline and display devices (04-pharmacy.md)."""

import frappe
from frappe import _
from frappe.utils import cint, flt, today

from hospital_vvs import roles as R
from hospital_vvs.services import billing, discounts, pharmacy, shifts
from hospital_vvs.utils import default_branch, require_roles, setting

POS_ROLES = (R.PHARMACY_CASHIER, R.DISPENSER)
PIPE = (R.PHARMACY_CASHIER, R.FINDER, R.REVIEWER, R.DISPENSER)


def _counter(counter=None):
	if counter:
		return counter
	shift = shifts.current_shift()
	if shift and shift.hv_counter:
		return shift.hv_counter
	return frappe.db.get_value("Counter", {"counter_type": "Pharmacy Billing", "branch": default_branch(), "is_active": 1}, "name")


@frappe.whitelist()
def pos_context(counter=None):
	require_roles(*POS_ROLES, R.REVIEWER)
	counter = _counter(counter)
	c = frappe.get_doc("Counter", counter) if counter else None
	shift = shifts.current_shift()
	branch = c.branch if c else default_branch()
	waiting = frappe.db.sql("""select si.name, si.hv_prescription prescription, si.hv_patient patient, si.customer_name, si.creation, rx.doctor_name
		from `tabSales Invoice` si left join tabPrescription rx on rx.name=si.hv_prescription where si.docstatus=0 and si.hv_billing_type='Medicine'
		and ifnull(si.hv_dispense_ticket,'')='' and si.branch=%s and ifnull(si.hv_prescription,'')!='' order by si.creation desc limit 30""", branch, as_dict=True)
	return {"counter": c.as_dict() if c else None, "shift": shift.name if shift else None, "shift_counter": shift.hv_counter if shift else None,
		"warehouse": pharmacy.counter_warehouse(counter) if counter else None, "collect_payment_at": setting("collect_payment_at"),
		"pipeline": cint(setting("enable_pharmacy_pipeline")), "near_expiry_days": cint(setting("near_expiry_days")),
		"display_key": frappe.db.get_value("Display Device", c.display_device, "device_key") if c and c.display_device else None,
		"counters": frappe.get_all("Counter", filters={"branch": branch, "counter_type": ["in", ["Pharmacy Billing", "Pharmacy Handover"]], "is_active": 1},
			fields=["name", "counter_type", "number", "current_user"]),
		"waiting_prescriptions": waiting, "modes": _modes(counter),
		"discount": dict(zip(("max_percent", "max_amount"), discounts.limits_for(frappe.session.user, "Medicine")), policy=setting("pharmacy_discount_over_limit") or "Ask the supervisor"),
		"categories": frappe.get_all("Medicine Category", pluck="name", order_by="name"), "pay_choice": setting("collect_payment_at") or "Billing counter",
		"credit_customers": frappe.db.count("Customer", {"hv_pharmacy_credit": 1, "disabled": 0}), "user": frappe.session.user}


def _modes(counter):
	prof = frappe.db.get_value("Counter", counter, "pos_profile") if counter else None
	return [p.mode_of_payment for p in frappe.get_cached_doc("POS Profile", prof).payments] if prof else ["Cash"]


@frappe.whitelist()
def search(q="", counter=None, category=None, limit=24, in_stock=0):
	require_roles(*POS_ROLES, R.REVIEWER, R.STORE_KEEPER)
	wh = pharmacy.counter_warehouse(_counter(counter))
	return pharmacy.search(q, wh, limit=min(cint(limit) or 24, 300), category=category or None, in_stock=cint(in_stock)) if wh else []


@frappe.whitelist(methods=["POST"])
def quote(lines, counter=None, prescription=None):
	require_roles(*POS_ROLES, R.REVIEWER)
	return pharmacy.quote(frappe.parse_json(lines), pharmacy.counter_warehouse(_counter(counter)), prescription)


@frappe.whitelist()
def substitutes(item_code, counter=None):
	require_roles(*POS_ROLES, R.REVIEWER)
	return pharmacy.substitutes(item_code, pharmacy.counter_warehouse(_counter(counter)))


@frappe.whitelist()
def prescription(code):
	"""Load a signed prescription by Rx number or patient MR (latest)."""
	require_roles(*POS_ROLES, R.REVIEWER)
	code = (code or "").strip()
	rx = code if frappe.db.exists("Prescription", code) else frappe.db.get_value("Prescription", {"patient": code, "docstatus": 1, "status": "Signed"},
		"name", order_by="creation desc")
	if not rx:
		frappe.throw(_("No signed prescription found for {0}.").format(code))
	return pharmacy.prescription_lines(rx)


@frappe.whitelist(methods=["POST"])
def request_discount(gross, amount, reason, counter=None):
	require_roles(*POS_ROLES)
	c = frappe.get_doc("Counter", _counter(counter))
	pct, amt = discounts.limits_for(frappe.session.user, "Medicine")
	over = flt(gross) and (flt(amount) * 100 / flt(gross) > pct + 0.001 or (amt and flt(amount) > amt))
	if over and (setting("pharmacy_discount_over_limit") or "") == "Not allowed":
		frappe.throw(_("Your discount limit is {0}% / Rs {1}.").format(pct, frappe.format_value(amt or 0, "Float")), title=_("Above your limit"))
	auth = discounts.request(billing_type="Medicine", gross=flt(gross), discount_amount=flt(amount), reason=reason, branch=c.branch)
	return {"name": auth.name, "status": auth.status}


@frappe.whitelist(methods=["POST"])
def checkout(data):
	require_roles(*POS_ROLES)
	return _checkout(frappe.parse_json(data))


@frappe.whitelist()
def receipt(name):
	return pharmacy.receipt(name)


@frappe.whitelist(methods=["POST"])
def display_push(state, counter=None):
	"""The POS mirrors its cart to the counter's customer display."""
	require_roles(*POS_ROLES)
	pharmacy.push_display(_counter(counter), frappe.parse_json(state))
	return True


@frappe.whitelist()
def recent(counter=None, limit=30):
	require_roles(*POS_ROLES, R.REVIEWER)
	return frappe.get_all("Sales Invoice", filters={"hv_counter": _counter(counter), "posting_date": today(), "docstatus": ["<", 2], "hv_billing_type": "Medicine"},
		fields=["name", "customer_name", "grand_total", "rounded_total", "docstatus", "is_return", "hv_token", "posting_time", "hv_prescription"],
		order_by="creation desc", limit=cint(limit))


@frappe.whitelist(methods=["POST"])
def refund(invoice, reason, items=None):
	require_roles(*POS_ROLES)
	return billing.refund_invoice(invoice, reason, items=frappe.parse_json(items) if items else None)


# ------------------------------------------------------------------ pipeline
STAGES = {"pick": ["Queued", "Picking"], "review": ["Picked", "Reviewing", "Exception"], "dispense": ["Ready", "Called", "Not Collected"],
	"board": ["Queued", "Picking", "Picked", "Reviewing", "Exception", "Ready", "Called", "Not Collected", "On Hold"]}


@frappe.whitelist()
def tickets(stage="board", branch=None):
	require_roles(*PIPE)
	rows = frappe.get_all("Dispense Ticket", filters={"branch": branch or default_branch(), "ticket_date": today(), "status": ["in", STAGES.get(stage, STAGES["board"])]},
		fields=["name", "token", "status", "priority", "patient_name", "patient", "sales_invoice", "invoice_status", "amount_due", "finder", "reviewer",
			"handover_counter", "queued_at", "pick_started_at", "picked_at", "ready_at", "called_at", "recalls", "exception_reason", "prescription"], order_by="token_no")
	order = {"Urgent": 0, "Elderly": 1, "Disabled": 1, "Elderly-Disabled": 1, "Normal": 2}
	rows.sort(key=lambda r: (order.get(r.priority, 2), str(r.queued_at)))
	for r in rows:
		r["items"] = frappe.get_all("Dispense Ticket Item", filters={"parent": r.name}, fields=["name", "item_code", "item_name", "uom", "qty", "batch_no", "expiry",
			"rack", "found_qty", "counted_qty", "line_status", "note"], order_by="rack, idx")
	return rows


@frappe.whitelist()
def ticket(name):
	require_roles(*PIPE)
	return pharmacy.review_data(name)


@frappe.whitelist(methods=["POST"])
def action(name, action, **kw):
	"""One endpoint for pipeline stage changes (row-locked in the service)."""
	roles = {"start_pick": (R.FINDER,), "scan": (R.FINDER,), "not_found": (R.FINDER, R.REVIEWER), "complete_pick": (R.FINDER,), "start_review": (R.REVIEWER,),
		"approve": (R.REVIEWER,), "send_back": (R.REVIEWER,), "swap_line": (R.REVIEWER,), "drop_line": (R.REVIEWER,), "call": (R.DISPENSER,), "collect_payment": (R.DISPENSER,),
		"handover": (R.DISPENSER,)}
	if action not in roles:
		frappe.throw(_("Unknown action"))
	require_roles(*roles[action])
	fn = getattr(pharmacy, action)
	kw.pop("cmd", None)
	for k in ("counts", "payments"):
		if isinstance(kw.get(k), str):
			kw[k] = frappe.parse_json(kw[k])
	res = fn(name, **kw)
	return res.as_dict() if hasattr(res, "as_dict") else res


@frappe.whitelist()
def dashboard(branch=None):
	require_roles(*PIPE, R.ADMIN)
	branch = branch or default_branch()
	stage = frappe.db.sql("""select status, count(*) n from `tabDispense Ticket` where branch=%s and ticket_date=%s group by status""", (branch, today()), as_dict=True)
	times = frappe.db.sql("""select avg(timestampdiff(minute, queued_at, pick_started_at)) wait_pick, avg(timestampdiff(minute, pick_started_at, picked_at)) picking,
		avg(timestampdiff(minute, picked_at, ready_at)) review, avg(timestampdiff(minute, ready_at, called_at)) to_call,
		avg(timestampdiff(minute, queued_at, handed_over_at)) total from `tabDispense Ticket` where branch=%s and ticket_date=%s""", (branch, today()), as_dict=True)[0]
	people = frappe.db.sql("""select finder, count(*) n from `tabDispense Ticket` where branch=%s and ticket_date=%s and ifnull(finder,'')!='' group by finder""",
		(branch, today()), as_dict=True)
	return {"stages": stage, "times": times, "finders": people,
		"sales": frappe.db.sql("""select count(*) n, coalesce(sum(grand_total),0) total from `tabSales Invoice` where docstatus=1 and hv_billing_type='Medicine'
			and branch=%s and posting_date=%s and is_return=0""", (branch, today()), as_dict=True)[0]}


# ------------------------------------------------------------------ public displays (device key only, read-only)
@frappe.whitelist(allow_guest=True)
def display(key):
	d = pharmacy.device(key)
	s = frappe.get_cached_doc("Clinic Settings")
	base = {"type": d.device_type, "name": d.device_name, "branch": d.branch, "clinic": s.clinic_name, "clinic_ur": s.clinic_name_ur}
	if d.device_type == "Customer Display":
		c = frappe.db.get_value("Counter", d.counter, ["counter_name", "number"], as_dict=True) or {}
		return base | {"counter": c, "state": frappe.cache.get_value(f"hv_disp:{d.counter}") or {"state": "idle"}}
	if d.device_type in ("Queue Display", "Kiosk"):
		return base | pharmacy.queue_state(d.branch)
	if d.device_type == "Waiting Display":
		from hospital_vvs.api.opd import display as opd_display

		return base | {"opd": _as_guest(opd_display, d.branch)}
	if d.device_type == "Ward Display":
		from hospital_vvs.api.ward import bed_map

		data = _as_guest(bed_map, d.branch)
		for b in data["beds"]:
			name = b.pop("patient_name", None) or ""
			b["label"] = "".join(w[0] for w in name.split()[:2]).upper() if name else None
			for k in ("current_patient", "admission_reason", "agreed_rate", "category", "doctor_name", "attending_doctor", "status_note"):
				b.pop(k, None)
		return base | {"ward": data}
	return base


def _as_guest(fn, branch):
	"""Run a staff read endpoint for a display device (as Administrator, branch fixed by the device)."""
	# frappe.set_user also overwrites the session id, form_dict and session data; put them back afterwards,
	# otherwise a signed-in browser that opens a display page gets logged out
	sess = frappe.local.session
	saved = {"user": sess.user, "sid": sess.sid, "data": sess.data}
	form_dict = frappe.local.form_dict
	frappe.set_user("Administrator")
	try:
		return fn(branch)
	finally:
		frappe.set_user(saved["user"])
		sess.sid, sess.data = saved["sid"], saved["data"]
		frappe.local.form_dict = form_dict


# ------------------------------------------------------------------ POS (Restaurant OS style): customers, prescriptions, invoices, shift, offline
def _checkout(d):
	return pharmacy.checkout(_counter(d.get("counter")), d["lines"], patient=d.get("patient"), prescription=d.get("prescription"),
		payment_mode=d.get("payment_mode") or "Cash", cash_tendered=d.get("cash_tendered"), discount_amount=flt(d.get("discount_amount")),
		discount_authorization=d.get("discount_authorization"), rx_override_reason=d.get("rx_override_reason"), priority=d.get("priority") or "Normal",
		client_ref=d.get("client_ref"), customer=d.get("customer"), pay_at=d.get("pay_at"), payments=d.get("payments"))


@frappe.whitelist()
def customers(q=""):
	"""Cart customer: patients by name / MR / mobile / CNIC, and pharmacy credit customers (balance and limit)."""
	require_roles(*POS_ROLES, R.REVIEWER)
	from hospital_vvs.api.patients import age_of
	from hospital_vvs.hospital_vvs.doctype.patient.patient import cnic_digits, cnic_hash, normalize_phone

	q = (q or "").strip()
	if len(q) < 2:
		return {"patients": [], "credit": _credit_customers("")}
	digits = cnic_digits(q)
	args = {"l": f"%{q}%", "q": q}
	ors = ["p.patient_name like %(l)s", "p.name like %(l)s", "p.patient_name_ur like %(l)s"]
	if len(digits) >= 7:
		args["ph"] = f"%{normalize_phone(q)[-10:]}%"
		ors.append("p.phone like %(ph)s")
	if len(digits) == 13:
		args["h"] = cnic_hash(digits)
		ors.append("p.cnic_hash=%(h)s")
	rows = frappe.db.sql(f"""select p.name, p.patient_name, p.patient_name_ur, p.phone, p.gender, p.dob, p.category, p.customer, p.cnic_masked
		from tabPatient p where p.disabled=0 and ({' or '.join(ors)}) order by (p.name=%(q)s) desc, p.modified desc limit 12""", args, as_dict=True)
	for r in rows:
		r["age"] = age_of(r.pop("dob"))
		r["credit"] = cint(frappe.db.get_value("Customer", r.customer, "hv_pharmacy_credit")) if r.customer else 0
	return {"patients": rows, "credit": _credit_customers(q)}


def _credit_customers(q):
	company = frappe.db.get_single_value("Clinic Settings", "pharmacy_company")
	filters = {"hv_pharmacy_credit": 1, "disabled": 0}
	if q:
		filters["customer_name"] = ["like", f"%{q}%"]
	out = frappe.get_all("Customer", filters=filters, fields=["name", "customer_name", "mobile_no", "hv_patient"], limit=12, order_by="customer_name")
	for c in out:
		c["balance"] = flt(frappe.db.sql("""select sum(debit-credit) from `tabGL Entry` where party_type='Customer' and party=%s and company=%s and is_cancelled=0""",
			(c.name, company))[0][0]) if company else 0
		c["credit_limit"] = flt(frappe.db.get_value("Customer Credit Limit", {"parent": c.name, "company": company}, "credit_limit")) if company else 0
	return out


@frappe.whitelist()
def find_prescriptions(q="", limit=15):
	"""Load prescription by Rx no., patient name, MR, mobile or CNIC; shows whether it was already billed."""
	require_roles(*POS_ROLES, R.REVIEWER)
	q = (q or "").strip()
	filters = {"docstatus": 1, "status": "Signed"}
	if q.upper().startswith("RX-"):
		filters["name"] = q
	elif q:
		pats = [p["name"] for p in customers(q)["patients"]]
		if not pats:
			return []
		filters["patient"] = ["in", pats]
	rows = frappe.get_all("Prescription", filters=filters, fields=["name", "patient", "patient_name", "doctor_name", "prescription_date", "source", "creation"],
		order_by="creation desc", limit=cint(limit) or 15)
	for r in rows:
		r["medicines"] = frappe.db.count("Prescription Medicine", {"parent": r.name})
		r["billed"] = frappe.db.get_value("Sales Invoice", {"hv_prescription": r.name, "docstatus": 1, "is_return": 0}, "name")
		r["draft"] = frappe.db.get_value("Sales Invoice", {"hv_prescription": r.name, "docstatus": 0}, "name")
	return rows


@frappe.whitelist(methods=["POST"])
def sync(sales):
	"""Offline sales (paid at the counter), posted once each by client_ref; one failure does not stop the rest."""
	require_roles(*POS_ROLES)
	out = []
	for d in frappe.parse_json(sales):
		frappe.db.savepoint("hv_ph_sync")
		try:
			r = _checkout(dict(d, pay_at="now"))
			out.append({"client_ref": d.get("client_ref"), "ok": 1, "name": r["name"], "receipt": r})
		except Exception as e:
			frappe.db.rollback(save_point="hv_ph_sync")
			frappe.clear_last_message()
			out.append({"client_ref": d.get("client_ref"), "ok": 0, "error": frappe.utils.strip_html(str(e)) or e.__class__.__name__})
	return out


@frappe.whitelist()
def offline_bundle(counter=None):
	"""Catalogue in stock, credit customers and recent patients, for selling while the server is unreachable."""
	require_roles(*POS_ROLES)
	counter = _counter(counter)
	wh = pharmacy.counter_warehouse(counter)
	from hospital_vvs.api.patients import age_of

	pats = frappe.db.sql("""select name, patient_name, phone, gender, dob, customer from tabPatient where disabled=0 order by modified desc limit 1500""", as_dict=True)
	for p in pats:
		p["age"] = age_of(p.pop("dob"))
	return {"items": pharmacy.search("", wh, limit=2000, in_stock=True) if wh else [], "patients": pats, "credit": _credit_customers(""),
		"categories": frappe.get_all("Medicine Category", pluck="name", order_by="name"), "modes": _modes(counter), "counter": counter,
		"generated_at": str(frappe.utils.now_datetime())}


@frappe.whitelist()
def invoices(scope="shift", q=None, limit=80):
	"""Invoice management: this shift / today / waiting at handover / on account / returns; search by invoice, token, customer, MR."""
	require_roles(*POS_ROLES, R.REVIEWER)
	filters = {"hv_billing_type": "Medicine"}
	shift = shifts.current_shift()
	if scope == "drafts":
		filters.update(docstatus=0, hv_dispense_ticket=["is", "set"])
	elif scope == "returns":
		filters.update(docstatus=1, is_return=1, posting_date=today())
	elif scope == "credit":
		filters.update(docstatus=1, is_pos=0, is_return=0)
	elif scope == "shift" and shift:
		filters.update(docstatus=1, pos_profile=shift.pos_profile, owner=shift.user, posting_date=shift.posting_date)
	else:
		filters.update(docstatus=["<", 2], posting_date=today())
	or_filters = {"name": ["like", f"%{q}%"], "customer_name": ["like", f"%{q}%"], "hv_token": ["like", f"%{q}%"], "hv_patient": ["like", f"%{q}%"]} if q else None
	if q:
		filters.pop("posting_date", None)
	rows = frappe.get_all("Sales Invoice", filters=filters, or_filters=or_filters, fields=["name", "customer", "customer_name", "hv_patient", "grand_total",
		"rounded_total", "outstanding_amount", "docstatus", "is_return", "is_pos", "hv_token", "posting_date", "posting_time", "hv_prescription", "return_against",
		"hv_dispense_ticket", "status", "owner"], order_by="creation desc", limit=cint(limit) or 80)
	for r in rows:
		r["modes"] = " + ".join(frappe.get_all("Sales Invoice Payment", filters={"parent": r.name}, pluck="mode_of_payment")) or (
			"On account" if not r.is_pos and r.docstatus == 1 else "Pay at handover" if r.docstatus == 0 else "")
		r["returned"] = flt(frappe.db.sql("select -sum(grand_total) from `tabSales Invoice` where return_against=%s and docstatus=1", r.name)[0][0])
	return rows


@frappe.whitelist()
def shift_summary():
	require_roles(*POS_ROLES)
	shift = shifts.current_shift()
	if not shift:
		return None
	s = shifts.summary(shift.name)
	s["credit_sales"] = flt(frappe.db.sql("""select sum(grand_total) from `tabSales Invoice` where docstatus=1 and is_pos=0 and is_return=0 and hv_billing_type='Medicine'
		and owner=%s and posting_date=%s""", (shift.user, shift.posting_date))[0][0])
	s["handover_pending"] = frappe.db.count("Sales Invoice", {"docstatus": 0, "hv_billing_type": "Medicine", "hv_dispense_ticket": ["is", "set"]})
	return s
