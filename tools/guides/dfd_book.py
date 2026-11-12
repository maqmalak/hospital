"""VVS Hospital — Process flow & DFD (A4 landscape), in the MicroMax sugarcane guide style (D-64).

	python3 tools/guides/dfd_book.py   -> hospital_vvs/public/help/process-flow-dfd.pdf
	                                      hospital_vvs/public/help/dfd/NN.svg + index.json (the in-app viewer, /dfd)
"""

import json
import math as _m
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from diagram import Diagram, Flow  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "../.."))
OUT = os.path.join(APP, "hospital_vvs/public/help")
SYSTEM = "VVS Hospital\nERP"
pages = []


def page(title, sub, svg, caption, level):
	pages.append((title, sub, svg, caption, level))


Y1, YS, Y2, YL = 85, 205, 330, 455  # process row 1, stores, process row 2, ledger


def context(num, label, ents, gap=6):
	"""DFD level 0: the system as one process, the outside parties on an ellipse, paired flows."""
	d = Diagram()
	d.process("sys", 500, 255, num, label, r=88)
	n = len(ents)
	for i, (key, name, to, frm) in enumerate(ents):
		a = _m.radians(-90 + i * 360 / n)
		x, y = 500 + 385 * _m.cos(a), 255 + 205 * _m.sin(a)
		d.entity(key, round(x), round(y), name, w=150, h=44 if "\n" in name else 36)
	for key, name, to, frm in ents:
		if to and frm:
			d.pair(key, "sys", to, frm, gap=gap)
		elif to:
			d.flow(key, "sys", to, lside=-1)
		else:
			d.flow("sys", key, frm, lside=-1)
	return d


# ================================================================ 1. DFD level 0 — the whole hospital
d = context("0", SYSTEM, [
	("mgmt", "Management", "rates, approvals,\nsettings, access", "dashboards,\nreports, audit"),
	("doc", "Doctors", "prescriptions, orders,\nsummaries", "queue, history,\nresults, commission"),
	("nurse", "Nurses &\nward staff", "vitals, doses,\nnotes, diets", "vitals queue, due\ndoses, bed map"),
	("lab", "Lab &\npathologist", "samples, results,\nverification", "paid orders,\nworklist"),
	("pharm", "Contract\npharmacy", "sales, dispensing,\nreturns", "prescriptions,\ntickets"),
	("payer", "Panels &\ninsurers", "pre-auth,\nsettlements", "claims,\nstatements"),
	("bank", "Banks, card &\nwallets, FBR", "clearance,\ncard payments", "deposits,\ninvoices to FBR"),
	("sup", "Suppliers", "bills,\ngoods", "purchase orders,\npayments"),
	("desk", "Reception &\ncashiers", "registration, slips,\nreceipts, counts", "carts, queues,\nshift summary"),
	("pat", "Patient &\nfamily", "details, CNIC,\npayments, feedback", "token, slips, Rx,\nreports, bills"),
	("web", "Website /\nWhatsApp", "bookings,\nchats", "confirmations,\nreminders, reports"),
])
page("DFD level 0 — VVS Hospital ERP (context)", "Everyone outside the system and what passes between them", d.svg(),
	 "DFD level 0 — the whole hospital in context: patients and families, online booking, doctors, nurses, front desk, lab, pharmacy, payers, suppliers, banks and FBR, management.", 0)

# ================================================================ 2. DFD level 1 — the whole hospital
d = Diagram()
for k, x, n, l in [("p1", 110, "1.0", "Appointments &\nregistration"), ("p2", 300, "2.0", "OPD: slip,\nvitals, doctor"), ("p3", 500, "3.0", "Laboratory"),
				   ("p4", 700, "4.0", "Emergency &\nadmission"), ("p5", 895, "5.0", "Ward care &\ndischarge")]:
	d.process(k, x, Y1, n, l)
for k, x, n, l in [("p10", 110, "10.0", "Reports &\nadmin"), ("p9", 300, "9.0", "Buying, store\n& assets"), ("p8", 500, "8.0", "Finance &\naccounts"),
				   ("p7", 700, "7.0", "Cash counters\n& shifts"), ("p6", 895, "6.0", "Pharmacy")]:
	d.process(k, x, Y2, n, l)
d.store("d1", 120, YS, "D1", "Patients & bookings", w=170)
d.store("d2", 310, YS, "D2", "Visits & prescriptions", w=180)
d.store("d3", 500, YS, "D3", "Lab orders & results", w=170)
d.store("d4", 800, YS, "D4", "Admissions, charts, beds", w=210)
d.store("d5", 520, YL, "D5", "General ledger (invoices, payments, journals, stock)", w=800)
d.hflow("p1", "p2", "MR, token")
d.vflow("p1", "d1", "patients, bookings", x=110, lside=1)
d.vflow("p2", "d2", "vitals, Rx", x=300, lside=1)
d.hflow("p2", "p3", "lab orders")
d.vflow("p3", "d3", "samples, results", x=500, lside=1)
d.route("p2", "p4", [(300, 22), (700, 22)], "admit / refer to ER", seg=1, lside=-1)
d.hflow("p4", "p5", "admission")
d.vflow("p4", "d4", "", x=690)
d.vflow("p5", "d4", "vitals, doses,\nsummary", x=880, lside=1)
d.route("d2", "p6", [(330, 262), (850, 262)], "prescriptions & ward medicines", seg=1, lside=1)
d.hflow("p6", "p7", "pharmacy\nreceipts")
d.hflow("p7", "p8", "shift closings")
d.hflow("p9", "p8", "bills,\ndepreciation")
for k, x, lab in (("p6", 895, "sales invoices"), ("p7", 700, "POS closings,\ncash JVs"), ("p8", 500, "journals,\npayments"), ("p9", 300, "POs, stock,\nassets")):
	d.vflow(k, "d5", lab, x=x, lside=1)
d.vflow("d5", "p10", "ledger & all stores", x=110, lside=1)
page("DFD level 1 — VVS Hospital ERP", "1–5 the patient's path · 6–10 pharmacy, money, buying and reports", d.svg(),
	 "DFD level 1 — the whole hospital: appointments → OPD → lab → emergency and admission → ward care and discharge, then pharmacy, cash counters, finance, buying and reports.", 1)

# ================================================================ 3. Process flow — the patient journey
f = Flow()
f.lane(40, 150, "Front desk", "#eff6ff")
f.lane(150, 270, "Clinic & lab", "#f0fdf4")
f.lane(270, 390, "Ward", "#fefce8")
f.lane(390, 500, "Money", "#fdf2f8")
f.box("a1", 165, 95, "Online / phone\nappointment", "ext")
f.box("a2", 320, 95, "Arrived →\nregistration (MR)", "staff")
f.box("a3", 475, 95, "OPD slip, fee,\ntoken", "erp")
f.box("a4", 630, 95, "Lab order paid at\nreception counter", "erp")
f.box("a5", 800, 95, "Receipt;\nlab sees Paid", "doc")
f.box("b1", 165, 210, "Nurse vitals →\nwaiting for doctor", "role")
f.box("b2", 320, 210, "Doctor: Rx, diagnosis,\nlab tests, sign", "role")
f.diamond("b3", 475, 210, "Admit?", w=100, h=56)
f.box("b4", 630, 210, "Sample → result\n→ verification", "erp")
f.box("b5", 800, 210, "Report: QR, print,\nWhatsApp", "end")
f.box("c1", 165, 330, "Pharmacy: load Rx,\npay, hand over", "erp")
f.box("c2", 475, 330, "Admit: bed, doctor,\nadvance", "staff")
f.box("c3", 630, 330, "Ward care: vitals,\nMAR, diet, labs", "role")
f.box("c4", 800, 330, "Discharge summary\nsigned", "role")
f.box("m1", 165, 445, "Shift: collections\nby mode", "erp")
f.box("m2", 360, 445, "Close shift: notes;\ncard / wallets auto", "erp")
f.box("m3", 560, 445, "Final bill →\nsettle / refund", "erp")
f.box("m4", 760, 445, "Discharged;\nbed to cleaning", "end")
for a, b in (("a1", "a2"), ("a2", "a3"), ("a4", "a5"), ("b1", "b2"), ("b2", "b3"), ("b4", "b5"), ("c2", "c3"), ("c3", "c4"), ("m1", "m2"), ("m3", "m4")):
	f.arrow(a, b)
f.arrow("a3", "b1", "b", "t", via=[(475, 150), (165, 150)])
f.arrow("b2", "a4", "t", "b", label="lab tests", via=[(320, 160), (630, 160)], lx=8)
f.arrow("a5", "b4", "b", "t", via=[(800, 160), (690, 160), (690, 175), (630, 175)])
f.arrow("b3", "c2", "b", "t", label="yes")
f.arrow("b2", "c1", "b", "t", label="medicines", via=[(320, 280), (165, 280)])
f.arrow("c4", "m3", "b", "t", via=[(800, 395), (560, 395)])
f.arrow("c1", "m1", "b", "t")
f.legend([("ext", "Patient online"), ("staff", "Front desk"), ("role", "Doctor / nurse"), ("erp", "ERP step"), ("doc", "Document"), ("end", "Outcome")], y=520)
page("Process flow — the patient journey", "From an online booking to the report, the pharmacy and discharge", f.svg(),
	 "Process flow — the patient journey: appointment, registration, OPD slip, nurse vitals, doctor, lab paid at reception, sample to report, pharmacy, admission, ward care, discharge and the money.", 1)


def area(title, sub, caption, left, right, procs, stores, ledger):
	"""Area DFD level 1: an entity at each end of row 1, processes left → right, stores under them (slightly left),
	ledger flows leave each process on its right and run down beside its store to the ledger at the bottom."""
	d = Diagram()
	n = len(procs)
	step = 150 if n == 5 else 185
	x0 = 500 - step * (n - 1) / 2
	xs = [round(x0 + i * step) for i in range(n)]
	d.entity("L", 62, Y1, left[0], w=100, h=44)
	for i, (num, label, _flow) in enumerate(procs):
		d.process(f"q{i}", xs[i], Y1, num, label, r=44)
	d.entity("R", 938, Y1, right[0], w=100, h=44)
	d.hflow("L", "q0", left[1])
	for i in range(n - 1):
		d.hflow(f"q{i}", f"q{i + 1}", procs[i][2])
	d.hflow(f"q{n - 1}", "R", procs[-1][2])
	for j, (qi, code, label, flow_label, w) in enumerate(stores):
		x = xs[qi] - 12
		d.store(f"s{j}", x, YS + 40, code, label, w=min(w, 120))
		d.vflow(f"q{qi}", f"s{j}", flow_label, x=x, lside=-1)
	d.store("gl", 500, YL, ledger[0], ledger[1], w=860)
	for qi, label in ledger[2]:
		x = xs[qi] + 58
		d.route(f"q{qi}", "gl", [(x, Y1 + 50), (x, YL - 30)], label, seg=1, lside=1, ly=40)
	page(title, sub, d.svg(), caption, 1)


# ================================================================ 4. OPD
area("DFD level 1 — OPD", "Booking → registration → slip & token → nurse → doctor",
	 "DFD level 1 — OPD: appointments (counter, web, WhatsApp), registration with duplicate check, the OPD slip and token, nurse vitals, the doctor's prescription.",
	 ("Patient /\nwebsite", "book"), ("Pharmacy\n& lab", "Rx"),
	 [("2.1", "Appoint-\nments", "arrived"), ("2.2", "Registration", "MR"), ("2.3", "OPD slip\n& token", "token"), ("2.4", "Nurse\nvitals", "ready"), ("2.5", "Doctor &\nprescription", "Rx")],
	 [(0, "D1", "Bookings", "slots", 110), (1, "D2", "Patients", "MR, Urdu name", 120), (2, "D3", "Slips & queue", "token", 130), (4, "D4", "Prescriptions", "Rx, ICD-10", 130)],
	 ("D5", "Ledger — OPD fees (Sales Invoice in the reception shift), doctor share", [(2, "fee invoice")]))

# ================================================================ 5. Lab
area("DFD level 1 — laboratory", "Order → paid at reception → sample → result → verification → report",
	 "DFD level 1 — laboratory: orders from the doctor or a walk-in, payment at the reception counter, samples, results with ranges and flags, the pathologist's verification and the report.",
	 ("Doctor /\nwalk-in", "tests"), ("Patient", "report"),
	 [("3.1", "Lab order", "Unpaid"), ("3.2", "Paid at\nreception", "Paid"), ("3.3", "Sample\ncollect", "received"), ("3.4", "Result\nentry", "entered"), ("3.5", "Verify &\nreport", "report")],
	 [(0, "D1", "Lab orders", "order", 110), (2, "D2", "Samples", "barcode", 110), (3, "D3", "Results", "values", 110), (4, "D4", "Report links", "token", 120)],
	 ("D5", "Ledger — lab invoices in the receptionist's shift, discounts with authorisation", [(1, "invoice")]))

# ================================================================ 6. Wards & emergency
area("DFD level 1 — wards & emergency", "Arrival → triage → admission → ward care → final bill → discharge",
	 "DFD level 1 — wards & emergency: ER arrival and triage, admission with an advance, ward care (vitals, MAR, diet, labs, procedures), the discharge summary, the final bill and discharge.",
	 ("ER / OPD\ndoctor", "patient"), ("Patient &\nfamily", "bill"),
	 [("4.1", "ER triage &\ntreatment", "admit"), ("4.2", "Admission\n& advance", "in bed"), ("5.1", "Ward care\n& MAR", "fit to go"), ("5.2", "Summary &\nclearance", "cleared"), ("5.3", "Final bill &\ndischarge", "home")],
	 [(0, "D1", "ER visits", "triage", 110), (1, "D2", "Admissions", "bed", 120), (2, "D3", "Charts", "doses", 100), (4, "D4", "Bills", "final", 90)],
	 ("D5", "Ledger — advances (Payment Entries), IPD charges, final Sales Invoice, refunds", [(1, "advance"), (4, "final invoice")]))

# ================================================================ 7. Pharmacy
area("DFD level 1 — pharmacy & store", "Prescription → POS → pick → review → handover; stock in and out",
	 "DFD level 1 — pharmacy and store: the POS (prescription, walk-in, credit), the pick → review → handover pipeline, receiving, transfers, cycle counts and returns.",
	 ("Doctor's\nprescription", "Rx"), ("Patient", "medicines"),
	 [("6.1", "POS sale", "ticket"), ("6.2", "Pick", "picked"), ("6.3", "Review", "checked"), ("6.4", "Handover", "handed over")],
	 [(0, "D1", "Invoices", "sale", 110), (1, "D2", "Stock by batch", "FEFO", 128), (3, "D3", "Controlled drugs", "log", 128)],
	 ("D5", "Ledger — pharmacy company: sales, cost of goods, stock (receipts from suppliers)", [(0, "sales invoice")]))

# ================================================================ 8. Cash & finance
area("DFD level 1 — cash & finance", "Shift → collections → close → approval → ledger → reports",
	 "DFD level 1 — cash and finance: shifts per counter, collections by mode, the close (notes counted, card and wallets from the system), supervisor approval, vouchers posted in batches, finance reports.",
	 ("Cashiers", "float"), ("Management\n& FBR", "reports"),
	 [("7.1", "Open\nshift", "collect"), ("7.2", "Close &\ncount", "difference"), ("7.3", "Supervisor\napproval", "approved"), ("8.1", "Vouchers &\nposting", "posted")],
	 [(0, "D1", "Shifts", "by mode", 100), (1, "D2", "Closings", "counts", 110), (3, "D3", "Vouchers", "JV, BPV…", 110)],
	 ("D5", "Ledger — POS closings, cash short / excess, expenses, supplier payments, depreciation", [(2, "short / excess JV"), (3, "journals")]))


# ================================================================ render
CSS = """
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box} body{margin:0;font-family:'Noto Sans','Segoe UI',Arial,sans-serif;color:#14213d;background:#fff}
.pg{width:297mm;height:210mm;padding:9mm 9mm 6mm;page-break-after:always;display:flex;flex-direction:column}
.pg:last-child{page-break-after:auto}
.bar{background:#13213a;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 7mm;height:13mm;border-radius:1mm}
.bar h1{font-size:15pt;margin:0;font-weight:700} .bar span{font-size:9.5pt;color:#cbd5e1}
.body{flex:1;display:flex;align-items:center;justify-content:center;padding-top:3mm} .body svg{width:100%;height:auto;max-height:172mm}
.cap{text-align:center;font-size:8.6pt;color:#475569;margin-top:2mm}
.cover{justify-content:center;align-items:flex-start;padding:24mm 26mm;background:linear-gradient(135deg,#13213a,#0f4c5c);color:#fff}
.cover .eyebrow{font-size:10pt;letter-spacing:.18em;text-transform:uppercase;color:#99f6e4;font-weight:700}
.cover h1{font-size:34pt;margin:5mm 0 4mm;line-height:1.1} .cover p{font-size:12pt;color:#ccfbf1;max-width:190mm;margin:0 0 3mm}
.cover ol{columns:2;font-size:10.5pt;color:#e2e8f0;margin-top:8mm;padding-left:5mm;line-height:1.75}
"""


def build():
	os.makedirs(os.path.join(OUT, "dfd"), exist_ok=True)
	index = []
	for i, (t, s, svg, c, lvl) in enumerate(pages, 1):
		fn = f"{i:02d}.svg"
		with open(os.path.join(OUT, "dfd", fn), "w") as fh:
			fh.write(svg)
		index.append({"n": i, "title": t, "sub": s, "caption": c, "level": lvl, "file": fn})
	with open(os.path.join(OUT, "dfd", "index.json"), "w") as fh:
		json.dump(index, fh, indent=1)
	toc = "".join(f"<li>{t}</li>" for t, *_r in pages)
	cover = f"""<section class="pg cover"><div class="eyebrow">VVS Hospital · Hospital ERP · guide</div><h1>Process flow &amp; DFD</h1>
	<p>The whole hospital as data flow diagrams (level 0 and level 1), the patient journey as a process flow, and a level 1 diagram for every area:
	OPD, laboratory, wards and emergency, pharmacy and store, cash and finance.</p>
	<p style="color:#99f6e4;font-size:10pt">Circles are processes, light-blue boxes are people or systems outside the ERP, green open boxes are data stores (D1–D5), arrows are data flows.</p>
	<ol>{toc}</ol></section>"""
	body = "".join(f"""<section class="pg"><div class="bar"><h1>{t}</h1><span>{s}</span></div><div class="body">{svg}</div>
	<div class="cap">{i} · {c}</div></section>""" for i, (t, s, svg, c, _l) in enumerate(pages, 1))
	src = os.path.join(HERE, "out", "_dfd.html")
	os.makedirs(os.path.dirname(src), exist_ok=True)
	with open(src, "w") as fh:
		fh.write(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{cover}{body}</body></html>')
	pdf = os.path.join(OUT, "process-flow-dfd.pdf")
	subprocess.run(["node", os.path.join(HERE, "print.mjs"), src, pdf, "landscape"], check=True)
	print("wrote", pdf, len(pages) + 1, "pages")


if __name__ == "__main__":
	build()
