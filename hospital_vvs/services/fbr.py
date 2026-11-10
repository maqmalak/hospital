"""FBR invoice reporting on a day-end basis (owner, 2026-11-10; D-47).

Every submitted invoice in scope (Clinic Settings → FBR: billing types, companies) gets one FBR Invoice log row. The day-end job
(scheduler, at the configured time, plus "Report now" on /fbr) sends the day's pending and earlier failed rows; FBR's invoice number
is saved on the Sales Invoice (hv_fbr_invoice_no) and printed with a QR code on reprints. Mock mode returns test numbers; Sandbox /
Production post the PRAL POS payload with fbr_token from site_config.json. Whether FBR applies, and to which counters, is for the
owner's tax advisor (spec 07) — the switch stays off until then.
"""

import json

import frappe
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, nowtime, today

from hospital_vvs.utils import setting

URLS = {"Sandbox": "https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData", "Production": "https://gw.fbr.gov.pk/imsp/v1/api/Live/PostData"}


def _lines(text):
	return [x.strip() for x in (text or "").splitlines() if x.strip()]


def in_scope(si):
	types, companies = _lines(setting("fbr_billing_types")), _lines(setting("fbr_companies"))
	return (not types or si.get("hv_billing_type") in types) and (not companies or si.company in companies)


def on_invoice_submit(doc, method=None):
	"""Queue the invoice for the day-end report (no network call at the counter)."""
	if not cint(setting("fbr_enabled")) or not in_scope(doc) or frappe.db.exists("FBR Invoice", {"sales_invoice": doc.name}):
		return
	frappe.get_doc({"doctype": "FBR Invoice", "sales_invoice": doc.name, "company": doc.company, "posting_date": doc.posting_date, "billing_type": doc.get("hv_billing_type"),
		"status": "Pending", "is_return": doc.is_return, "amount": flt(doc.rounded_total or doc.grand_total), "tax": flt(doc.total_taxes_and_charges)}).insert(ignore_permissions=True)


def payload(si):
	items = [{"ItemCode": i.item_code, "ItemName": i.item_name, "Quantity": abs(flt(i.qty)), "PCTCode": "00000000", "TaxRate": 0, "SaleValue": abs(flt(i.net_amount)),
		"TotalAmount": abs(flt(i.amount)), "TaxCharged": 0, "Discount": abs(flt(i.amount) - flt(i.net_amount)), "FurtherTax": 0, "InvoiceType": 3 if si.is_return else 1,
		"RefUSIN": si.return_against or ""} for i in si.items]
	modes = [p.mode_of_payment for p in si.get("payments") or []]
	return {"InvoiceNumber": "", "POSID": cint(setting("fbr_pos_id") or 0), "USIN": si.name, "DateTime": f"{si.posting_date} {str(si.posting_time)[:8]}",
		"BuyerNTN": "", "BuyerCNIC": "", "BuyerName": si.customer_name, "BuyerPhoneNumber": "", "TotalSaleValue": abs(flt(si.net_total)), "TotalQuantity": sum(abs(flt(i.qty)) for i in si.items),
		"TotalBillAmount": abs(flt(si.rounded_total or si.grand_total)), "TotalTaxCharged": abs(flt(si.total_taxes_and_charges)), "Discount": abs(flt(si.discount_amount)),
		"FurtherTax": 0, "PaymentMode": 2 if modes and all(m != "Cash" for m in modes) else 1, "RefUSIN": si.return_against or "", "InvoiceType": 3 if si.is_return else 1, "Items": items}


def send(data):
	"""→ (fbr_invoice_no, response dict). Raises on failure."""
	mode = setting("fbr_mode") or "Mock"
	if mode == "Mock":
		seq = frappe.db.count("FBR Invoice", {"status": "Reported"}) + 1
		no = f"{setting('fbr_pos_id') or '000000'}{getdate(today()).strftime('%d%m%y')}{seq:06d}"
		return no, {"InvoiceNumber": no, "Code": "100", "Response": "Invoice received successfully (mock)"}
	import requests

	token = frappe.conf.get("fbr_token")
	if not token:
		raise Exception("fbr_token missing in site_config.json")
	r = requests.post(URLS[mode], json=data, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, timeout=30)
	r.raise_for_status()
	res = r.json()
	if str(res.get("Code")) != "100" or not res.get("InvoiceNumber"):
		raise Exception(res.get("Response") or json.dumps(res))
	return res["InvoiceNumber"], res


def day_end(date=None, batch=None):
	"""Report the day's pending invoices and retry earlier failures. Returns counts."""
	if not cint(setting("fbr_enabled")):
		return {"reported": 0, "failed": 0, "skipped": "FBR is switched off"}
	date = getdate(date or today())
	backfill(date)
	batch = batch or f"{date} {now_datetime().strftime('%H:%M')}"
	rows = frappe.get_all("FBR Invoice", filters={"status": ["in", ["Pending", "Failed"]], "posting_date": ["<=", date]}, fields=["name", "sales_invoice"], order_by="posting_date, creation", limit=5000)
	ok = bad = 0
	for r in rows:
		log = frappe.get_doc("FBR Invoice", r.name)
		si = frappe.get_doc("Sales Invoice", r.sales_invoice)
		if si.docstatus != 1:
			log.db_set({"status": "Skipped", "last_error": "Invoice cancelled before the day-end report"})
			continue
		data = payload(si)
		try:
			no, res = send(data)
			log.db_set({"status": "Reported", "fbr_invoice_no": no, "reported_at": now_datetime(), "attempts": cint(log.attempts) + 1, "batch": batch,
				"request": json.dumps(data, indent=1, default=str), "response": json.dumps(res, indent=1), "gateway_mode": setting("fbr_mode") or "Mock", "last_error": None})
			frappe.db.set_value("Sales Invoice", si.name, "hv_fbr_invoice_no", no, update_modified=False)
			ok += 1
		except Exception as e:
			log.db_set({"status": "Failed", "attempts": cint(log.attempts) + 1, "last_error": str(e)[:500], "batch": batch, "request": json.dumps(data, indent=1, default=str)})
			bad += 1
	frappe.db.commit()
	return {"reported": ok, "failed": bad, "batch": batch}


def backfill(date):
	"""Invoices submitted before FBR was switched on (or missed) for the day: queue them."""
	for name in frappe.get_all("Sales Invoice", filters={"docstatus": 1, "posting_date": date}, pluck="name"):
		if not frappe.db.exists("FBR Invoice", {"sales_invoice": name}):
			si = frappe.get_doc("Sales Invoice", name)
			if in_scope(si):
				on_invoice_submit(si)


def scheduled():
	"""Every 15 minutes: run once a day, after the configured time (last run date kept in the site defaults)."""
	if not cint(setting("fbr_enabled")):
		return
	from frappe.utils import get_time

	if get_time(nowtime()) < get_time(setting("fbr_run_time") or "23:30:00") or frappe.db.get_default("hv_fbr_last_run") == today():
		return
	day_end()
	frappe.db.set_default("hv_fbr_last_run", today())


def summary(days=14):
	rows = frappe.db.sql("""select posting_date d, status, count(*) n, sum(amount) amt from `tabFBR Invoice` where posting_date>=%s group by posting_date, status order by posting_date desc""",
		add_days(today(), -days), as_dict=True)
	out = {}
	for r in rows:
		x = out.setdefault(str(r.d), {"date": str(r.d), "Pending": 0, "Reported": 0, "Failed": 0, "Skipped": 0, "amount": 0.0})
		x[r.status] = r.n
		x["amount"] += flt(r.amt)
	return list(out.values())
