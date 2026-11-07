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
		"waiting_prescriptions": waiting, "modes": ["Cash", "Card", "Bank Transfer", "JazzCash", "Easypaisa"]}


@frappe.whitelist()
def search(q="", counter=None):
	require_roles(*POS_ROLES, R.REVIEWER, R.STORE_KEEPER)
	wh = pharmacy.counter_warehouse(_counter(counter))
	return pharmacy.search(q, wh) if wh else []


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
	auth = discounts.request(billing_type="Medicine", gross=flt(gross), discount_amount=flt(amount), reason=reason, branch=c.branch)
	return {"name": auth.name, "status": auth.status}


@frappe.whitelist(methods=["POST"])
def checkout(data):
	require_roles(*POS_ROLES)
	d = frappe.parse_json(data)
	return pharmacy.checkout(_counter(d.get("counter")), d["lines"], patient=d.get("patient"), prescription=d.get("prescription"),
		payment_mode=d.get("payment_mode") or "Cash", cash_tendered=d.get("cash_tendered"), discount_amount=flt(d.get("discount_amount")),
		discount_authorization=d.get("discount_authorization"), rx_override_reason=d.get("rx_override_reason"), priority=d.get("priority") or "Normal",
		client_ref=d.get("client_ref"))


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
	order = {"Urgent": 0, "Elderly-Disabled": 1, "Normal": 2}
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
		"approve": (R.REVIEWER,), "send_back": (R.REVIEWER,), "swap_line": (R.REVIEWER,), "call": (R.DISPENSER,), "collect_payment": (R.DISPENSER,),
		"handover": (R.DISPENSER,)}
	if action not in roles:
		frappe.throw(_("Unknown action"))
	require_roles(*roles[action])
	fn = getattr(pharmacy, action)
	kw.pop("cmd", None)
	if "counts" in kw:
		kw["counts"] = frappe.parse_json(kw["counts"])
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
	user = frappe.session.user
	frappe.set_user("Administrator")
	try:
		return fn(branch)
	finally:
		frappe.set_user(user)
