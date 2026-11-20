import frappe, json
from frappe.utils import today, add_days
def run():
	from hospital_vvs.services import dialysis as dz, dialysis_docs as docs
	frappe.set_user("Administrator")
	out = []
	def chk(label, fn):
		try:
			r = fn(); out.append(("OK", label, str(r)[:120]))
		except Exception as e:
			out.append(("BLOCKED", label, str(e)[:160]))
	# 1. Mon/Thu sample
	s1 = frappe.get_value("Dialysis Patient", {"diagnosis": ["like", "%diabetic nephropathy%"]}, ["name", "sched_days", "sched_shift", "station", "zone"], as_dict=True)
	fut = frappe.get_all("Dialysis Session", filters={"dialysis_patient": s1.name, "session_date": [">=", today()]}, fields=["session_date", "shift", "station"], order_by="session_date", limit=4)
	out.append(("INFO", "sample1", f"{s1} next={[(str(f.session_date), f.station) for f in fut]}"))
	b = dz.board(add_days(today(), 0))
	out.append(("INFO", "board", f"stations={len(b['stations'])} shifts={b['shifts']} counts={b['counts']} unpaid={b['unpaid']} requests={b['requests']}"))
	# 2. HCV patient on negative station
	hcv = frappe.get_value("Dialysis Patient", {"zone": "HCV", "status": "Active"}, "name")
	chk("HCV patient -> negative station S-03", lambda: dz.set_schedule(hcv, "Mon, Thu", "Night", "S-03"))
	neg = s1.name
	chk("Negative patient -> HCV station C-02", lambda: dz.set_schedule(neg, "Tue, Fri", "Night", "C-02"))
	# 3. overdue screening
	od = [r.name for r in frappe.get_all("Dialysis Patient", filters={"status": "Active", "viral_next_due": ["<", today()]}, fields=["name"])]
	out.append(("INFO", "overdue patients", od))
	if od:
		chk("overdue -> extra session", lambda: dz.extra_session(od[0], add_days(today(), 2), "Night", "S-07"))
		frappe.set_user("dr.ahsan@vvs.demo")
		chk("nephrologist override", lambda: dz.override_screening(od[0], add_days(today(), 7), "Sample sent today, result awaited").override_until)
		chk("overdue + override -> extra session", lambda: dz.extra_session(od[0], add_days(today(), 2), "Night", "S-07").name)
		frappe.set_user("Administrator")
	# 4. alerts
	ses = frappe.get_all("Dialysis Session", filters={"session_date": today(), "status": "In Session", "station": ["is", "set"]}, pluck="name", limit=1)[0]
	v = dz.chart(ses, {"pre_weight": 90, "observations": [{"obs_time": "09:00:00", "bp_sys": 82, "bp_dia": 50, "pulse": 110, "uf_removed": 0.5}]})
	out.append(("INFO", "alerts", v["alerts_list"]))
	# 5. package: sell 12 and use one
	dp = frappe.get_value("Dialysis Patient", {"status": "Active", "zone": "Negative"}, "name")
	before = dz.package_balance(frappe.get_doc("Dialysis Patient", dp))
	dz.sell_package(dp, "DIA-PKG-12", None, 64000)
	nxt = frappe.get_all("Dialysis Session", filters={"dialysis_patient": dp, "status": "Scheduled", "payment_status": "Unpaid"}, pluck="name", limit=1)
	if nxt:
		dz.mark_paid(nxt[0], None, "Package")
	after = dz.package_balance(frappe.get_doc("Dialysis Patient", dp))
	out.append(("INFO", "package", f"before {before['remaining']}/{before['total']} after {after['remaining']}/{after['total']}; slip: {dz.slip_info(nxt[0]) if nxt else None}"))
	# 6. URR/Kt/V + monthly pdf
	rv = frappe.get_value("Dialysis Monthly Review", {"status": "Signed"}, "name")
	pdf = docs.pdf("monthly", rv)
	open("/tmp/claude-1000/-home-maqmalak-erpnext-react/d8ce5f15-0b5c-4ebd-bb42-979cbf94c2eb/scratchpad/monthly.pdf", "wb").write(pdf)
	urr = frappe.get_all("Dialysis Session", filters={"urr": [">", 0]}, fields=["urr", "ktv"], limit=3)
	out.append(("INFO", "urr/ktv", urr))
	for o in out: print(*o)
	frappe.db.rollback()
