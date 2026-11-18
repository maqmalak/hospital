"""Daily pharmacy demo data (scripts/pharmacy_demo.sh, D-86). Runs the real POS and dispense pipeline as the demo pharmacy staff:

1. Yesterday's loose ends: tickets left on the board are finished (paid ones handed over, unpaid ones cancelled as not collected).
2. Shelves: the counter warehouse is topped up from the pharmacy store (FEFO transfer); the store re-orders from the supplier when low.
3. Shifts: cashier → Pharmacy 1, cashier2 → Pharmacy 2, dispenser → Handover 3.
4. Sales: most of today's signed OPD prescriptions are bought (some only part of the course, some pay at handover, a few senior-citizen
   discounts), plus walk-in OTC sales and a few outside paper prescriptions. Cash, card and wallet payments.
5. Pipeline: finder picks (scans every line), pharmacist checks, dispenser calls and hands over. The last few tokens are left
   queued / picking / ready so the pharmacy board and queue display are alive. Stage times are spread over the day.
6. One or two refunds of a returned line.

bench --site hospital execute hospital_vvs.setup.pharmacy_demo.run --kwargs "{'walk_ins': 25}"
"""

import json
import random
from datetime import timedelta

import frappe
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, today

CASHIERS = (("cashier@vvs.demo", "Pharmacy 1"), ("cashier2@vvs.demo", "Pharmacy 2"))
DISPENSER, HANDOVER = "dispenser@vvs.demo", "Handover 3"
FINDER, PHARMACIST = "finder@vvs.demo", "pharmacist@vvs.demo"
RETAIL, STORE = "Pharmacy Retail FSD - VVSP", "Pharmacy Store FSD - VVSP"
PAR = 360  # units on the counter shelf after a top-up (syrups / inhalers / injections: PAR_SMALL)
PAR_SMALL, SMALL_UOMS = 30, ("Nos",)
REORDER_AT = 400  # store units that trigger a supplier order
OUTSIDE_DOCTORS = ["Dr. Khalid Mehmood (Allied Hospital)", "Dr. Nusrat Jabeen (private clinic)", "Dr. Shafqat Ali (DHQ Faisalabad)",
	"Dr. Rizwan Ahmad (Faisal Hospital)", "Dr. Samina Kausar (private clinic)"]
REFUND_REASONS = ["Patient returned an unopened strip", "Doctor changed the medicine", "Bought twice by mistake"]
WALLETS = ["JazzCash", "Easypaisa", "Card"]


def _as(u):
	frappe.set_user(u)


def _step(made, key, fn, *a, **kw):
	try:
		r = fn(*a, **kw)
		frappe.db.commit()
		made[key] = made.get(key, 0) + 1
		return r
	except Exception as e:
		frappe.db.rollback()
		made.setdefault("errors", []).append(f"{key}: {str(e)[:140]}")
		return None


# ------------------------------------------------------------------ 1. yesterday
def finish_old_tickets():
	"""Tickets from earlier days still on the board: paid → handed over, unpaid → cancelled (draft bill deleted)."""
	n = 0
	for t in frappe.get_all("Dispense Ticket", filters={"ticket_date": ["<", today()], "status": ["not in", ["Handed Over", "Cancelled"]]},
		fields=["name", "sales_invoice", "invoice_status", "ticket_date"]):
		paid = t.invoice_status == "Paid" and t.sales_invoice and frappe.db.get_value("Sales Invoice", t.sales_invoice, "docstatus") == 1
		at = get_datetime(f"{t.ticket_date} 21:00:00")
		if paid:
			frappe.db.set_value("Dispense Ticket", t.name, {"status": "Handed Over", "handed_over_at": at}, update_modified=False)
		else:
			if t.sales_invoice and frappe.db.get_value("Sales Invoice", t.sales_invoice, "docstatus") == 0:
				frappe.delete_doc("Sales Invoice", t.sales_invoice, ignore_permissions=True, force=True)
			frappe.db.set_value("Dispense Ticket", t.name, {"status": "Cancelled", "exception_reason": "Not collected (end of day)", "sales_invoice": None,
				"amount_due": 0}, update_modified=False)
		n += 1
	frappe.db.commit()
	return n


# ------------------------------------------------------------------ 2. stock
def _units(item, wh):
	return flt(frappe.db.get_value("Bin", {"item_code": item, "warehouse": wh}, "actual_qty"))


def store_reorder(rnd):
	"""Supplier order + delivery for store items under REORDER_AT (same suppliers as purchase_demo)."""
	from hospital_vvs.services import buying as B
	from hospital_vvs.setup.purchase_demo import PH, PHARMA, _rate_per_pack

	by_sup = {}
	for sup, items in PHARMA.items():
		for it in items:
			if frappe.db.exists("Item", it) and _units(it, STORE) < REORDER_AT:
				by_sup.setdefault(sup, []).append(it)
	made = 0
	for sup, items in by_sup.items():
		if not frappe.db.exists("Supplier", sup):
			continue
		po = B.make_po(sup, PH, [{"item_code": it, "qty": rnd.choice([20, 30, 40]), "rate": _rate_per_pack(it), "warehouse": STORE} for it in items],
			transaction_date=add_days(today(), -2), schedule_date=today())
		batch = {r.name: {"batch_no": f"{r.item_code.split('-')[0][:5]}{getdate().strftime('%y%m')}{rnd.randint(10, 99)}",
			"expiry": add_days(today(), rnd.choice([420, 540, 720]))} for r in po.items}
		B.receive_po(po.name, batch, posting_date=today(), bill_no=f"DC-{rnd.randint(10000, 99999)}")
		frappe.db.commit()
		made += 1
	return made


def shelf_topup():
	"""Counter shelf back to PAR from the store, earliest expiry first (one Stock Entry)."""
	from hospital_vvs.services import pharmacy

	lines = []
	for it in frappe.get_all("Item", filters={"hv_is_medicine": 1, "disabled": 0}, fields=["name", "item_name"]):
		small = any(w in it.item_name for w in ("Syrup", "Inhaler", "Injection", "1g", "Suspension"))
		par = PAR_SMALL if small else PAR
		have = _units(it.name, RETAIL)
		if have >= par * 0.5:
			continue
		qty = min(par - have, sum(b["qty"] for b in pharmacy.batches(it.name, STORE)))
		if qty > 0:
			lines.append({"item_code": it.name, "qty": qty})
	if not lines:
		return None
	_as("store@vvs.demo")
	try:
		return pharmacy.fefo_transfer(STORE, RETAIL, lines, remarks="Daily counter top-up (demo)")
	finally:
		_as("Administrator")


# ------------------------------------------------------------------ 3. shifts
PH_COUNTERS = tuple(c for _u, c in CASHIERS) + (HANDOVER,)


def approve_stale_closings():
	"""A pharmacy shift from an earlier day whose count waits for the supervisor blocks the counter: the cash supervisor approves it."""
	from hospital_vvs.services import shifts

	done = []
	for sc in frappe.get_all("Shift Closing", filters={"status": "Pending Approval"}, fields=["name", "opening_entry"]):
		o = frappe.db.get_value("POS Opening Entry", sc.opening_entry, ["hv_counter", "posting_date"], as_dict=True)
		if not o or o.hv_counter not in PH_COUNTERS or getdate(o.posting_date) >= getdate(today()):
			continue
		try:
			shifts.decide(sc.name, "approve", note="Demo: approved next morning", approver="supervisor@vvs.demo")
			frappe.db.commit()
			done.append(sc.name)
		except Exception as e:
			frappe.db.rollback()
			print(f"could not approve {sc.name}: {e}")
	return done


def open_shifts():
	from hospital_vvs.services import shifts

	for user, counter in CASHIERS + ((DISPENSER, HANDOVER),):
		_as(user)
		if not shifts.current_shift():
			shifts.open_shift(counter, {"Cash": 5000})
	_as("Administrator")


# ------------------------------------------------------------------ 4. sales
def _pay(rnd, total):
	if rnd.random() < 0.72:
		step = 100 if total < 1000 else 500
		tendered = total if rnd.random() < 0.35 else (int(total // step) + 1) * step
		return {"payment_mode": "Cash", "cash_tendered": tendered}
	mode = rnd.choice(WALLETS)
	return {"payment_mode": "Cash", "payments": [{"mode_of_payment": mode, "amount": total, "reference_no": f"{mode[:2].upper()}{rnd.randint(10**8, 10**9 - 1)}"}]}


def _sell(rnd, cashier, counter, lines, patient=None, prescription=None, paper_rx=None, pay_at=None, discount=False, priority="Normal"):
	from hospital_vvs.services import discounts, pharmacy

	_as(cashier)
	q = pharmacy.quote(lines, RETAIL, prescription)
	if q["errors"]:
		raise frappe.ValidationError("; ".join(q["errors"]))
	total = flt(q["total"])
	d = {"counter": counter, "lines": lines, "patient": patient, "prescription": prescription, "paper_rx": paper_rx, "priority": priority,
		"client_ref": frappe.generate_hash(length=10)}
	if discount and total >= 400:
		amt = min(round(total * 0.05), 500)
		auth = discounts.request(billing_type="Medicine", gross=total, discount_amount=amt, reason="Senior citizen discount", branch="Faisalabad Main",
			patient=patient)
		d.update(discount_amount=amt, discount_authorization=auth.name)
		total -= amt
	if pay_at == "handover":
		d["pay_at"] = "handover"
	else:
		d.update(_pay(rnd, round(total)))
	from hospital_vvs.api.pharmacy import _checkout

	return _checkout(frappe._dict(d))


def _priority(patient):
	dob = frappe.db.get_value("Patient", patient, "dob") if patient else None
	return "Elderly" if dob and (getdate().year - getdate(dob).year) >= 65 else "Normal"


def sell_prescriptions(rnd, made, buy_rate=0.78):
	from hospital_vvs.services import pharmacy

	rxs = frappe.db.sql("""select rx.name, rx.patient from tabPrescription rx where rx.docstatus=1 and rx.status='Signed' and date(rx.creation)=%s
		and exists(select 1 from `tabPrescription Medicine` m where m.parent=rx.name)
		and not exists(select 1 from `tabSales Invoice` si where si.hv_prescription=rx.name and (si.docstatus=1 or ifnull(si.hv_dispense_ticket,'')!=''))
		order by rx.creation""", today(), as_dict=True)
	for k, rx in enumerate(rxs):
		if rnd.random() > buy_rate:
			continue  # buys outside / later
		_as(CASHIERS[k % 2][0])
		data = pharmacy.prescription_lines(rx.name)
		lines = [{"item_code": l["item_code"], "uom": l["uom"], "qty": l["qty"]} for l in data["lines"]]
		if len(lines) > 1 and rnd.random() < 0.15:
			lines = lines[:-1]  # already has one of them at home
		elif rnd.random() < 0.12:
			for l in lines:  # first part of a long course only
				l["qty"] = max(1, int(l["qty"] // 2))
		pri = _priority(rx.patient)
		_step(made, "rx_sales", _sell, rnd, *CASHIERS[k % 2], lines, patient=rx.patient, prescription=rx.name,
			pay_at="handover" if rnd.random() < 0.2 else None, discount=pri == "Elderly" and rnd.random() < 0.5, priority=pri)


def sell_walk_ins(rnd, made, n):
	otc = frappe.get_all("Item", filters={"hv_is_medicine": 1, "disabled": 0, "hv_prescription_required": 0, "hv_controlled_drug": 0}, pluck="name")
	rx_items = frappe.get_all("Item", filters={"hv_is_medicine": 1, "disabled": 0, "hv_prescription_required": 1, "hv_controlled_drug": 0}, pluck="name")
	from hospital_vvs.services.pharmacy import PACK, STRIP, allowed_uoms, pack

	def line(item):
		p = pack(item)
		ok = allowed_uoms(p)
		uom = STRIP if STRIP in ok else (p.stock_uom if p.stock_uom in ok else PACK)
		return {"item_code": item, "uom": uom, "qty": rnd.choice([1, 1, 1, 2, 2, 3]) if uom != PACK else 1}

	for k in range(cint(n)):
		cashier, counter = CASHIERS[k % 2]
		if rx_items and rnd.random() < 0.15:  # outside doctor's paper prescription
			lines = [line(i) for i in rnd.sample(rx_items, rnd.randint(1, 2))]
			paper = {"doctor": rnd.choice(OUTSIDE_DOCTORS), "rx_date": add_days(today(), -rnd.randint(0, 3))}
			_step(made, "paper_rx_sales", _sell, rnd, cashier, counter, lines, paper_rx=paper)
		else:
			lines = [line(i) for i in rnd.sample(otc, rnd.randint(1, 3))]
			_step(made, "walk_in_sales", _sell, rnd, cashier, counter, lines)


# ------------------------------------------------------------------ 5. pipeline
def _pick(name):
	from hospital_vvs.services import pharmacy

	_as(FINDER)
	t = pharmacy.start_pick(name)
	for r in t.items:
		pharmacy.scan(name, r.item_code, line=r.name)
	return pharmacy.complete_pick(name)


def _check(name):
	from hospital_vvs.services import pharmacy

	_as(PHARMACIST)
	if frappe.db.get_value("Dispense Ticket", name, "status") == "Picked":
		pharmacy.start_review(name)
		pharmacy.approve(name)


def _handover(rnd, name):
	from hospital_vvs.services import pharmacy

	_as(DISPENSER)
	t = pharmacy.call(name, counter=HANDOVER)
	if t.invoice_status != "Paid":
		due = round(flt(t.amount_due))
		pay = _pay(rnd, due)
		pharmacy.collect_payment(name, payment_mode=pay["payment_mode"], cash_tendered=pay.get("cash_tendered"), payments=pay.get("payments"))
	pharmacy.handover(name, code=t.token)


def run_pipeline(rnd, made, leave=(3, 2, 2)):
	"""All of today's queued tickets through pick → check → handover; the last `leave` = (queued, picking, ready) stay on the board."""
	from hospital_vvs.services import pharmacy

	rows = frappe.get_all("Dispense Ticket", filters={"ticket_date": today(), "status": "Queued", "branch": "Faisalabad Main"}, pluck="name", order_by="token_no")
	q, pk, rd = leave
	cut = max(len(rows) - (q + pk + rd), 0)
	for i, name in enumerate(rows):
		if i >= len(rows) - q:
			made["left_queued"] = made.get("left_queued", 0) + 1
			continue
		if i >= len(rows) - q - pk:
			_as(FINDER)
			_step(made, "left_picking", pharmacy.start_pick, name)
			continue
		if not _step(made, "picked", _pick, name):
			continue
		_step(made, "checked", _check, name)
		if i >= cut:
			_as(DISPENSER)
			if rnd.random() < 0.5:
				_step(made, "left_called", pharmacy.call, name, counter=HANDOVER)
			else:
				made["left_ready"] = made.get("left_ready", 0) + 1
			continue
		_step(made, "handed_over", _handover, rnd, name)
	_as("Administrator")


def spread_times(rnd):
	"""Stage times from the morning to now, so the board, the waiting times and the dashboard look like a real day."""
	rows = frappe.get_all("Dispense Ticket", filters={"ticket_date": today(), "branch": "Faisalabad Main"},
		fields=["name", "status", "queued_at", "pick_started_at", "picked_at", "review_started_at", "ready_at", "called_at", "handed_over_at"], order_by="token_no")
	if not rows:
		return
	now = now_datetime()
	start = max(get_datetime(f"{today()} 09:15:00"), now - timedelta(hours=10))
	if start >= now - timedelta(minutes=30):
		return  # too early in the day to spread
	span = (now - timedelta(minutes=12) - start).total_seconds()
	for i, r in enumerate(rows):
		t = start + timedelta(seconds=span * i / max(len(rows), 1) + rnd.randint(0, 120))
		vals = {"queued_at": t}
		for f, lo, hi in (("pick_started_at", 1, 9), ("picked_at", 2, 6), ("review_started_at", 1, 4), ("ready_at", 1, 3), ("called_at", 0, 4),
			("handed_over_at", 1, 3)):
			if r.get(f):
				t = min(t + timedelta(minutes=rnd.randint(lo, hi), seconds=rnd.randint(0, 59)), now)
				vals[f] = t
		frappe.db.set_value("Dispense Ticket", r.name, vals, update_modified=False)
	frappe.db.commit()


# ------------------------------------------------------------------ 6. refunds
def refunds(rnd, made, n):
	from hospital_vvs.services import billing

	done = frappe.get_all("Dispense Ticket", filters={"ticket_date": today(), "status": "Handed Over"}, pluck="sales_invoice")
	cands = [s for s in done if s and not frappe.db.exists("Sales Invoice", {"return_against": s, "docstatus": 1})]
	for si in rnd.sample(cands, min(len(cands), n)):
		doc = frappe.get_doc("Sales Invoice", si)
		if not doc.items or doc.discount_amount:
			continue
		owner = frappe.db.get_value("Counter", doc.hv_counter, "current_user") or CASHIERS[0][0]
		_as(owner if owner in dict(CASHIERS) else CASHIERS[0][0])
		it = rnd.choice(doc.items)
		_step(made, "refunds", billing.refund_invoice, si, rnd.choice(REFUND_REASONS), items={it.item_code: it.qty})
	_as("Administrator")


# ------------------------------------------------------------------ run
def run(walk_ins=25, refund=2, seed=None):
	from hospital_vvs.setup.opd_demo import close_stale_shifts

	rnd = random.Random(seed if seed is not None else int(today().replace("-", "")) + frappe.db.count("Dispense Ticket"))
	frappe.flags.mute_messages = True
	made = {"old_tickets_closed": finish_old_tickets()}
	made["closings_approved"] = approve_stale_closings()
	close_stale_shifts()
	made["closings_approved"] += [x for x in approve_stale_closings() if x not in made["closings_approved"]]  # closings the stale-shift close just sent to the supervisor
	made["store_orders"] = store_reorder(rnd)
	made["shelf_topup"] = _step(made, "topups", shelf_topup)
	open_shifts()
	frappe.db.commit()
	sell_prescriptions(rnd, made)
	sell_walk_ins(rnd, made, walk_ins)
	run_pipeline(rnd, made)
	refunds(rnd, made, cint(refund))
	spread_times(rnd)
	_as("Administrator")
	made["sales_today"] = frappe.db.sql("""select count(*) n, coalesce(sum(grand_total),0) total from `tabSales Invoice` where docstatus=1
		and hv_billing_type='Medicine' and is_return=0 and posting_date=%s""", today(), as_dict=True)[0]
	errs = made.pop("errors", [])
	print(json.dumps(made, default=str))
	for e in errs[:15]:
		print("  !", e)
	return made
