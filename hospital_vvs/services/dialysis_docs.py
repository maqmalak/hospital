"""Dialysis documents (D-99): A4 on the LMC letterhead, English with Urdu labels, QR verification (HMAC, /hms/site/my-dialysis/verify/…).
Kinds: session (session sheet), monthly (monthly summary), card (schedule card), transfer (transfer / guest letter), consent (Consent Form name),
ckd (CKD follow-up summary for a patient MR). Rendered with wkhtmltopdf like the imaging report; Urdu runs use FreeSerif (_urdu_runs)."""

import json

import frappe
from frappe import _
from frappe.utils import cint, escape_html as esc, flt, formatdate, getdate, now_datetime

from hospital_vvs.services import dialysis as dz
from hospital_vvs.services.nursery import _urdu_runs

CONSENT_TEXT = {
	"Haemodialysis": ("I agree to haemodialysis treatment at the LMC dialysis unit as prescribed by the nephrologist. The procedure, its benefits, risks "
		"(low blood pressure, cramps, bleeding, infection, clotting, allergic reaction, rarely heart rhythm problems) and alternatives (peritoneal dialysis, "
		"conservative care, transplant) were explained in a language I understand. I agree to viral screening every three months and to the unit's "
		"infection-control rules, including a dedicated station if I test positive. I may withdraw consent at any time.",
		"میں نیفرالوجسٹ کی تجویز کے مطابق ایل ایم سی ڈائیلاسز یونٹ میں ہیموڈائیلاسز علاج کی رضامندی دیتا/دیتی ہوں۔ طریقہ کار، فوائد، خطرات (بلڈ پریشر کم ہونا، "
		"پٹھوں میں کھچاؤ، خون بہنا، انفیکشن، جمنا، الرجی) اور متبادل مجھے میری زبان میں سمجھائے گئے۔ میں ہر تین ماہ وائرل اسکریننگ اور یونٹ کے انفیکشن کنٹرول "
		"اصولوں کی پابندی کروں گا/گی۔"),
	"Catheter Insertion": ("I agree to insertion of a dialysis catheter (temporary or tunnelled) in the neck / groin by the nephrologist, under local anaesthesia "
		"and aseptic technique, with ultrasound guidance where available. Risks explained: bleeding, haematoma, infection, arterial puncture, pneumothorax "
		"(neck), catheter malfunction and rarely air embolism. I will keep the site dry and covered and report fever or redness at once.",
		"میں نیفرالوجسٹ کے ذریعے گردن / ران میں ڈائیلاسز کیتھیٹر لگانے کی رضامندی دیتا/دیتی ہوں۔ خطرات سمجھائے گئے: خون بہنا، انفیکشن، شریان میں سوئی لگنا، "
		"پھیپھڑے کی جھلی میں ہوا اور کیتھیٹر کا کام نہ کرنا۔ میں جگہ کو خشک اور ڈھکا رکھوں گا/گی اور بخار یا سرخی پر فوراً بتاؤں گا/گی۔"),
}


def _row(cells):
	return "<tr>" + "".join(f"<td class='k'>{esc(k)}<span class='ur'>{esc(u)}</span></td><td class='v'>{esc(str(v if v not in (None, '') else '—'))}</td>" for k, u, v in cells) + "</tr>"


def _f(v, unit=""):
	return f"{flt(v):g}{unit}" if v not in (None, "") and flt(v) else "—"


def _shell(kind, title, ref, body, branch=None, signer_user=None, signed=True, verify_name=None):
	from hospital_vvs.letterhead import RED, TEAL, clinic_block, footer_html, header_html
	from hospital_vvs.services.lab import _image_uri, qr_data_uri
	from hospital_vvs.services.radiology import _watermark

	en, ur = title
	doc = frappe.db.get_value("Doctor", {"user": signer_user}, ["doctor_name", "qualification", "registration_no", "signature"], as_dict=True) if signer_user else None
	sig = _image_uri(doc.signature) if doc and doc.signature else None
	signer_name = doc.doctor_name if doc else (frappe.db.get_value("User", signer_user, "full_name") if signer_user else None)
	qr = qr_data_uri(dz.verify_url(kind, verify_name or ref))
	return _urdu_runs(f"""<!doctype html><html><head><meta charset='utf-8'><style>
	@page {{ size:A4; margin:10mm 11mm 14mm }}
	.u {{ font-family:'FreeSerif','Noto Naskh Arabic',serif; font-weight:normal }}
	body {{ font-family: Helvetica, Arial, 'Liberation Sans', 'DejaVu Sans', 'FreeSerif', sans-serif; color:#0f2830; font-size:10.5px; line-height:1.42; margin:0 }}
	.wm {{ position:fixed; top:30%; left:24%; width:52%; z-index:-1 }}
	.dept {{ text-align:center; letter-spacing:.22em; font-size:9.5px; font-weight:700; color:{TEAL}; margin:-1mm 0 2mm }}
	h1 {{ text-align:center; font-family:Georgia,serif; font-size:16px; letter-spacing:.06em; margin:2mm 0 0; color:#0c2431 }}
	.h1ur {{ text-align:center; font-family:'Noto Nastaliq Urdu','Noto Naskh Arabic','FreeSerif',serif; direction:rtl; font-size:13px; color:{TEAL}; margin:0 0 1mm }}
	.rule {{ width:60px; height:3px; background:#0284c7; margin:0 auto 3mm; border-radius:2px }}
	table.g {{ width:100%; border-collapse:collapse; border:1px solid #d5e3e6; background:#f6fafb; margin-bottom:2.5mm }}
	table.g td {{ padding:3px 7px; border-bottom:1px solid #e4eef0; vertical-align:top }} td.k {{ color:#5b7079; width:18% }} td.v {{ font-weight:700; width:32% }}
	.ur {{ display:block; font-family:'Noto Nastaliq Urdu','Noto Naskh Arabic','FreeSerif',serif; direction:rtl; text-align:left; font-size:8.5px; color:#8aa0a7 }}
	h3 {{ font-size:10px; text-transform:uppercase; letter-spacing:.14em; color:#0369a1; margin:3mm 0 1.2mm; border-bottom:1px solid #e1eaeb; padding-bottom:.8mm }}
	table.t {{ width:100%; border-collapse:collapse }} table.t th {{ background:#0c4a6e; color:#fff; text-align:left; padding:3px 5px; font-size:9px }}
	table.t td {{ padding:2.5px 5px; border-bottom:1px solid #e4eef0; font-size:9.5px }} .ok {{ color:#047857; font-weight:700 }} .flag {{ color:#b91c1c; font-weight:700 }}
	.box {{ border:1.5px solid #0284c7; border-left:6px solid #0284c7; background:#f0f9ff; border-radius:6px; padding:2.5mm 4mm; margin-top:3mm }}
	.pill {{ display:inline-block; border-radius:10px; padding:0 6px; font-size:9px; font-weight:700; background:#ede9fe; color:#5b21b6 }}
	table.sign {{ width:100%; margin-top:4mm; border-top:1px solid #d5e3e6; padding-top:2mm }} table.sign td {{ vertical-align:bottom }}
	.stamp {{ display:inline-block; border:2px solid {TEAL}; color:{TEAL}; border-radius:8px; padding:1.5mm 3.5mm; font-weight:800; letter-spacing:.08em; font-size:9.5px }}
	.stamp.draft {{ border-color:#b45309; color:#b45309 }} .disc {{ margin-top:2.5mm; font-size:8.2px; color:#5b7079; text-align:center; font-style:italic }}
	.spark {{ vertical-align:middle }}
	</style></head><body><img class='wm' src='{_watermark()}'>
	{header_html(clinic_block(branch))}
	<div class='dept'>DEPARTMENT OF NEPHROLOGY · DIALYSIS UNIT</div>
	<h1>{esc(en.upper())}</h1><div class='h1ur'>{esc(ur)}</div><div class='rule'></div>
	{body}
	<table class='sign'><tr><td style='width:44%'>{f"<img src='{sig}' style='height:11mm'>" if sig else "<div style='width:46mm;border-bottom:1px solid #94a3b8;height:9mm'></div>"}
		<div style='font-weight:700;font-size:11.5px;margin-top:1mm'>{esc(signer_name or 'Nephrologist / Dialysis in-charge')}</div><div style='color:#5b7079'>{esc((doc.qualification if doc else '') or '')}</div>
		<div style='color:#5b7079'>{esc((doc.registration_no if doc else '') or '')}</div></td>
		<td style='text-align:center'><span class='stamp {"" if signed else "draft"}'>{"ELECTRONICALLY VERIFIED" if signed else "DRAFT — NOT SIGNED"}<br><small style='font-weight:600;letter-spacing:0'>{esc(ref)} · {now_datetime():%d %b %Y}</small></span></td>
		<td style='width:22%;text-align:right'><img src='{qr}' style='width:20mm;height:20mm'><div style='font-size:7.5px;color:#5b7079'>Scan to verify · تصدیق کے لیے اسکین کریں</div></td></tr></table>
	<div class='disc'>Clinical thresholds and targets follow LMC nephrology protocols. Bring this document to every visit.</div>
	<div style='margin-top:2.5mm'>{footer_html(clinic_block(branch), right='Nephrology &amp; Dialysis')}</div></body></html>""")


def _ident(dp):
	return "<table class='g'>" + _row([("Patient", "مریض", dp.patient_name), ("MR No.", "ایم آر", dp.patient)]) \
		+ _row([("Age / gender", "عمر / جنس", f"{dp.age or '—'} / {dp.gender or '—'}"), ("Dialysis no.", "ڈائیلاسز نمبر", dp.name)]) \
		+ _row([("Diagnosis", "تشخیص", (dp.diagnosis or "") + (f" · CKD {dp.ckd_stage}" if dp.ckd_stage else "") + (f" ({dp.ckd_cause})" if dp.ckd_cause else "")),
			("Dry weight", "خشک وزن", _f(dp.dry_weight, " kg"))]) \
		+ _row([("Vascular access", "رسائی", f"{dp.access_type or '—'} {dp.access_site or ''}"), ("Viral status", "وائرل", f"HBsAg {dp.hbsag} · HCV {dp.anti_hcv} · HIV {dp.hiv}")]) + "</table>"


def _spark(vals, w=120, h=24, color="#0284c7"):
	vals = [flt(v) for v in vals if v not in (None, "")]
	if len(vals) < 2:
		return ""
	lo, hi = min(vals), max(vals)
	rng = (hi - lo) or 1
	pts = " ".join(f"{i * w / (len(vals) - 1):.1f},{h - 2 - (v - lo) / rng * (h - 4):.1f}" for i, v in enumerate(vals))
	return f"<svg class='spark' width='{w}' height='{h}' viewBox='0 0 {w} {h}'><polyline fill='none' stroke='{color}' stroke-width='1.6' points='{pts}'/></svg>"


# ------------------------------------------------------------------ 1. session sheet
def session_html(name):
	s = frappe.get_doc("Dialysis Session", name)
	dp = frappe.get_doc("Dialysis Patient", s.dialysis_patient)
	body = _ident(dp) + "<table class='g'>" + _row([("Date / shift", "تاریخ / شفٹ", f"{formatdate(s.session_date, 'dd MMM yyyy')} · {s.shift}"), ("Station / machine", "اسٹیشن", f"{s.station or s.ward_location or '—'} · {s.machine_serial or ''}")]) \
		+ _row([("Type", "قسم", s.session_type), ("Times", "اوقات", f"{str(s.start_at or s.checkin_at or '')[11:16]} – {str(s.end_at or '')[11:16]}")]) + "</table>"
	body += "<h3>Pre-dialysis · ڈائیلاسز سے پہلے</h3><table class='g'>" + _row([("Weight", "وزن", _f(s.pre_weight, " kg")), ("Weight gain", "وزن میں اضافہ", _f(s.weight_gain, " kg"))]) \
		+ _row([("BP / pulse", "بلڈ پریشر / نبض", f"{s.pre_bp_sys or '—'}/{s.pre_bp_dia or '—'} · {s.pre_pulse or '—'}"), ("Temperature", "درجہ حرارت", _f(s.pre_temp, " °C"))]) \
		+ _row([("Access check", "رسائی", s.access_check), ("Symptoms", "علامات", s.pre_symptoms)]) + "</table>"
	body += "<h3>Prescription &amp; settings · سیٹنگز</h3><table class='g'>" + _row([("Dialyser", "ڈائیلائزر", f"{s.dialyser_type or '—'} ({s.dialyser_use}{(' #' + str(s.reuse_no)) if s.dialyser_use == 'Reuse' and s.reuse_no else ''})"),
		("Blood / dialysate flow", "بہاؤ", f"{s.blood_flow or '—'} / {s.dialysate_flow or '—'} mL/min")]) \
		+ _row([("UF goal", "یو ایف ہدف", _f(s.uf_goal, " L")), ("Heparin / duration", "ہیپرین / دورانیہ", f"{s.heparin or '—'} · {_f(s.duration_hrs, ' h')}")]) + "</table>"
	obs = "".join(f"<tr><td>{str(o.obs_time)[:5]}</td><td>{o.bp_sys or ''}/{o.bp_dia or ''}</td><td>{o.pulse or ''}</td><td>{o.venous_p or ''}</td><td>{o.arterial_p or ''}</td><td>{o.blood_flow or ''}</td><td>{_f(o.uf_removed)}</td><td>{esc(o.note or '')}</td></tr>" for o in s.observations)
	body += f"<h3>Intra-dialysis observations · دورانِ ڈائیلاسز</h3><table class='t'><tr><th>Time</th><th>BP</th><th>Pulse</th><th>VP</th><th>AP</th><th>QB</th><th>UF (L)</th><th>Note</th></tr>{obs or '<tr><td colspan=8>—</td></tr>'}</table>"
	if s.complications:
		body += "<h3>Complications · پیچیدگیاں</h3><table class='t'><tr><th>Time</th><th>Complication</th><th>Action</th></tr>" + "".join(
			f"<tr><td>{str(c.comp_time or '')[:5]}</td><td class='flag'>{esc(c.complication)}</td><td>{esc(c.action or '')}</td></tr>" for c in s.complications) + "</table>"
	if s.medicines:
		body += "<h3>Medicines given · دی گئی ادویات</h3><table class='t'><tr><th>Medicine</th><th>Dose</th><th>Route</th><th>Batch</th><th>Time</th></tr>" + "".join(
			f"<tr><td>{esc(m.medicine)}</td><td>{esc(m.dose or '')}</td><td>{esc(m.route or '')}</td><td>{esc(m.batch_no or '')}</td><td>{str(m.given_at or '')[:5]}</td></tr>" for m in s.medicines) + "</table>"
	body += "<h3>Post-dialysis · ڈائیلاسز کے بعد</h3><table class='g'>" + _row([("Weight", "وزن", _f(s.post_weight, " kg")), ("Total UF", "کل یو ایف", _f(s.total_uf, " L"))]) \
		+ _row([("BP / pulse", "بلڈ پریشر / نبض", f"{s.post_bp_sys or '—'}/{s.post_bp_dia or '—'} · {s.post_pulse or '—'}"), ("Haemostasis / condition", "حالت", f"{s.haemostasis or '—'} · {s.condition or '—'}")]) \
		+ (_row([("URR", "یو آر آر", _f(s.urr, " %")), ("Kt/V", "کے ٹی/وی", _f(s.ktv))]) if s.urr else "") + "</table>"
	al = json.loads(s.alerts or "[]")
	if al or s.doctor_note:
		body += f"<div class='box'>{('<b>Alerts:</b> ' + esc('; '.join(al)) + '<br>') if al else ''}{('<b>Doctor:</b> ' + esc(s.doctor_note)) if s.doctor_note else ''}</div>"
	nurse = frappe.db.get_value("User", s.nurse_signed_by, "full_name") if s.nurse_signed_by else None
	body += f"<p style='font-size:9px;color:#5b7079;margin-top:2mm'>Nurse: <b>{esc(nurse or '—')}</b> {str(s.nurse_signed_at or '')[:16]} · Doctor: {str(s.doctor_signed_at or '—')[:16]}</p>"
	return _shell("session", dz.KIND_TITLES["session"], s.name, body, dp.branch, s.doctor_signed_by or s.nurse_signed_by, bool(s.nurse_signed_by))


# ------------------------------------------------------------------ 2. monthly summary
def monthly_html(name):
	r = frappe.get_doc("Dialysis Monthly Review", name)
	dp = frappe.get_doc("Dialysis Patient", r.dialysis_patient)
	st = dz.month_stats(dp, r.month)
	done = [s for s in st["sessions"] if s.status == "Completed"]
	body = _ident(dp) + "<table class='g'>" + _row([("Month", "مہینہ", formatdate(r.month, "MMMM yyyy")), ("Schedule", "شیڈول", f"{dp.sched_days or '—'} · {dp.sched_shift or ''} · {dp.station or ''}")]) \
		+ _row([("Sessions done / missed", "سیشن", f"{st['done']} / {st['missed']}"), ("Avg weight gain", "اوسط وزن اضافہ", _f(st["avg_weight_gain"], " kg"))]) \
		+ _row([("URR (target ≥ 65%)", "یو آر آر", _f(st["urr"], " %")), ("Kt/V (target ≥ 1.2)", "کے ٹی/وی", _f(st["ktv"]))]) + "</table>"
	body += "<h3>Weights &amp; blood pressure · وزن اور بلڈ پریشر</h3>"
	body += (f"<p>Pre-weight {_spark([s.pre_weight for s in done])} &nbsp; Pre-SBP {_spark([s.pre_bp_sys for s in done], color='#7c3aed')} &nbsp; Weight gain {_spark([s.weight_gain for s in done], color='#b45309')}</p>" if len(done) > 1 else "")
	rows = "".join(f"<tr><td>{formatdate(s.session_date, 'dd MMM')}</td><td>{s.shift[:3] if s.shift else ''}</td><td class='{'flag' if s.status == 'Missed' else ''}'>{'Missed' if s.status == 'Missed' else ''}</td>"
		f"<td>{_f(s.pre_weight)}</td><td>{_f(s.post_weight)}</td><td>{_f(s.weight_gain)}</td><td>{s.pre_bp_sys or ''}/{s.pre_bp_dia or ''}</td><td>{s.post_bp_sys or ''}/{s.post_bp_dia or ''}</td>"
		f"<td>{_f(s.total_uf)}</td><td>{_f(s.urr)}</td><td>{_f(s.ktv)}</td></tr>" for s in st["sessions"])
	body += f"<table class='t'><tr><th>Date</th><th>Sh</th><th></th><th>Pre wt</th><th>Post wt</th><th>Gain</th><th>Pre BP</th><th>Post BP</th><th>UF</th><th>URR</th><th>Kt/V</th></tr>{rows or '<tr><td colspan=11>—</td></tr>'}</table>"
	labs = st["labs"]
	lab_rows = "".join(f"<tr><td>{esc(k['label'])}</td><td class='{'flag' if (labs.get(k['key']) or {}).get('flag') in ('H', 'L', 'HH', 'LL', 'High', 'Low') else ''}'>{_f((labs.get(k['key']) or {}).get('v'))} {esc((labs.get(k['key']) or {}).get('unit') or '')}</td><td>{(labs.get(k['key']) or {}).get('d') or ''}</td></tr>"
		for k in dz.LAB_KEYS_OUT() if labs.get(k["key"]))
	body += f"<h3>Laboratory · لیبارٹری</h3><table class='t'><tr><th>Test</th><th>Latest</th><th>Date</th></tr>{lab_rows or '<tr><td colspan=3>No results this month</td></tr>'}</table>"
	if st["medicines"]:
		body += "<h3>Medicines in sessions · سیشن کی ادویات</h3><p>" + esc("; ".join(f"{m.medicine} {m.dose or ''} × {m.n}" for m in st["medicines"])) + "</p>"
	if st["complications"]:
		body += "<p><b>Complications:</b> " + esc("; ".join(f"{c.complication} × {c.n}" for c in st["complications"])) + "</p>"
	body += f"<div class='box'><b>Nephrologist review · ڈاکٹر کا جائزہ:</b> {esc(r.review_note or '—')}{('<br><b>Prescription changes:</b> ' + esc(r.rx_changes)) if r.rx_changes else ''}</div>"
	return _shell("monthly", dz.KIND_TITLES["monthly"], r.name, body, dp.branch, r.signed_by, r.status == "Signed")


# ------------------------------------------------------------------ 3. consent
def consent_html(name):
	cf = frappe.get_doc("Consent Form", name)
	dp = frappe.get_doc("Dialysis Patient", cf.dialysis_patient) if cf.dialysis_patient else None
	en, ur = CONSENT_TEXT.get(cf.consent_type, (cf.details or "", ""))
	kind = "consent_hd" if cf.consent_type == "Haemodialysis" else "consent_cath"
	from hospital_vvs.services.lab import _image_uri

	sig = _image_uri(cf.signature) if cf.get("signature") else None
	body = (_ident(dp) if dp else "") + f"<h3>Statement · بیان</h3><p>{esc(en)}</p><p style='direction:rtl;text-align:right;font-size:11px'>{esc(ur)}</p>"
	body += "<table class='g' style='margin-top:3mm'>" + _row([("Signed by", "دستخط کنندہ", f"{cf.signer_name} ({cf.signed_by}{(' · ' + cf.relation) if cf.relation else ''})"), ("Date / time", "تاریخ", str(cf.signed_at)[:16])]) \
		+ _row([("Witness", "گواہ", cf.witness_name), ("Explained by", "وضاحت", frappe.db.get_value("User", cf.owner, "full_name"))]) + "</table>"
	body += f"<p>Signature · دستخط: {f'<img src={chr(39)}{sig}{chr(39)} style={chr(39)}height:16mm;vertical-align:middle{chr(39)}>' if sig else '<span style=\"display:inline-block;width:60mm;border-bottom:1px solid #94a3b8;height:10mm\"></span>'}</p>"
	return _shell("consent", dz.KIND_TITLES[kind], cf.name, body, cf.branch, cf.owner, cf.docstatus == 1, verify_name=cf.name)


# ------------------------------------------------------------------ 4. schedule card
def card_html(name):
	dp = frappe.get_doc("Dialysis Patient", name)
	s = frappe.get_cached_doc("Clinic Settings")
	t = dz.SHIFTS.get(dp.sched_shift or "", ("", ""))
	up = frappe.get_all("Dialysis Session", filters={"dialysis_patient": name, "session_date": [">=", frappe.utils.today()], "status": "Scheduled"}, fields=["session_date", "shift", "station"],
		order_by="session_date", limit=8)
	body = _ident(dp) + f"""<div class='box' style='text-align:center;font-size:14px'><b>{esc(dp.sched_days or '—')}</b> · {esc(dp.sched_shift or '')} shift <b>{t[0]}–{t[1]}</b> · Station <b>{esc(dp.station or '—')}</b>
	<div style='font-size:10px;margin-top:1mm'>Dialysis unit phone · ڈائیلاسز یونٹ فون: <b>{esc(s.phone or '')}</b></div></div>"""
	body += "<h3>Next sessions · اگلے سیشن</h3><table class='t'><tr><th>Date</th><th>Shift</th><th>Station</th></tr>" + "".join(
		f"<tr><td>{formatdate(x.session_date, 'ddd dd MMM yyyy')}</td><td>{x.shift}</td><td>{x.station or '—'}</td></tr>" for x in up) + "</table>"
	body += """<h3>Remember · یاد رکھیں</h3><ul style='margin:0;padding-left:5mm'><li>Arrive 20 minutes early; pay at the Charges Counter first. · 20 منٹ پہلے آئیں؛ پہلے چارجز کاؤنٹر پر ادائیگی کریں۔</li>
	<li>Keep weight gain between sessions under 2–2.5 kg; limit fluids and salt. · سیشنوں کے درمیان وزن 2 سے 2.5 کلو سے زیادہ نہ بڑھنے دیں۔</li>
	<li>Do not let anyone take BP or blood from the fistula arm. · فسٹولا والے بازو سے بلڈ پریشر یا خون نہ لیں۔</li>
	<li class='flag'>Come to Emergency at once for breathlessness, chest pain, fever, bleeding from the access or very low urine. · سانس پھولنے، سینے میں درد، بخار یا رسائی سے خون پر فوراً ایمرجنسی آئیں۔</li></ul>"""
	return _shell("card", dz.KIND_TITLES["card"], dp.name, body, dp.branch, None, True)


# ------------------------------------------------------------------ 5. CKD follow-up summary (+ OPD prescription stays the existing prescription print)
def ckd_html(patient):
	p = frappe.get_doc("Patient", patient)
	visits = frappe.get_all("Prescription", filters={"patient": patient, "docstatus": ["!=", 2], "ckd_stage": ["is", "set"]}, fields=["name", "prescription_date", "doctor", "doctor_name",
		"ckd_stage", "ckd_cause", "neph_bp", "neph_weight", "neph_oedema", "neph_urine_output", "advice", "follow_up_date"], order_by="prescription_date desc", limit=8)
	tr = dz.lab_trends(patient, 24)["series"]
	last = visits[0] if visits else frappe._dict()
	body = "<table class='g'>" + _row([("Patient", "مریض", p.patient_name), ("MR No.", "ایم آر", p.name)]) + _row([("CKD stage", "مرحلہ", last.ckd_stage), ("Cause", "وجہ", last.ckd_cause)]) \
		+ _row([("Last BP / weight", "بلڈ پریشر / وزن", f"{last.neph_bp or '—'} · {_f(last.neph_weight, ' kg')}"), ("Oedema / urine", "سوجن / پیشاب", f"{last.neph_oedema or '—'} · {last.neph_urine_output or '—'}")]) + "</table>"
	rows = ""
	for k in dz.LAB_KEYS_OUT():
		ser = tr.get(k["key"]) or []
		if ser:
			rows += f"<tr><td>{esc(k['label'])}</td><td>{_f(ser[-1]['v'])} {esc(ser[-1].get('unit') or '')}</td><td>{ser[-1]['d']}</td><td>{_spark([x['v'] for x in ser[-10:]])}</td></tr>"
	body += f"<h3>Kidney function trend · گردوں کے ٹیسٹ</h3><table class='t'><tr><th>Test</th><th>Latest</th><th>Date</th><th>Trend</th></tr>{rows or '<tr><td colspan=4>—</td></tr>'}</table>"
	body += "<h3>Clinic visits · کلینک وزٹ</h3><table class='t'><tr><th>Date</th><th>Doctor</th><th>Stage</th><th>BP</th><th>Plan</th></tr>" + "".join(
		f"<tr><td>{formatdate(v.prescription_date, 'dd MMM yy')}</td><td>{esc(v.doctor_name or '')}</td><td>{esc(v.ckd_stage or '')}</td><td>{esc(v.neph_bp or '')}</td><td>{esc((v.advice or '')[:120])}</td></tr>" for v in visits) + "</table>"
	body += f"<div class='box'><b>Next follow-up · اگلا فالو اپ:</b> {formatdate(last.follow_up_date, 'dd MMM yyyy') if last.follow_up_date else 'as advised'}</div>"
	signer = frappe.db.get_value("Doctor", last.doctor, "user") if last.get("doctor") else None
	return _shell("ckd", dz.KIND_TITLES["ckd"], p.name, body, None, signer, bool(visits), verify_name=p.name)


# ------------------------------------------------------------------ 6. transfer / guest letter
def transfer_html(name):
	dp = frappe.get_doc("Dialysis Patient", name)
	last = frappe.get_all("Dialysis Session", filters={"dialysis_patient": name, "status": "Completed"}, fields=["session_date", "pre_weight", "post_weight", "pre_bp_sys", "pre_bp_dia",
		"total_uf", "urr", "ktv", "heparin", "dialyser_type", "blood_flow"], order_by="session_date desc", limit=3)
	tr = dz.lab_trends(dp.patient, 3)["series"]
	labs = "; ".join(f"{k['label']} {tr[k['key']][-1]['v']:g} ({tr[k['key']][-1]['d']})" for k in dz.LAB_KEYS_OUT() if tr.get(k["key"]))
	body = "<p>To the Nephrologist / Dialysis In-charge,</p><p>We refer the patient below for <b>" + ("guest (holiday) dialysis" if dp.request_type == "Guest" else "continuation of maintenance haemodialysis") + "</b>. Summary:</p>"
	body += _ident(dp) + "<table class='g'>" + _row([("On dialysis since", "ڈائیلاسز آغاز", formatdate(dp.dialysis_start, "dd MMM yyyy") if dp.dialysis_start else "—"), ("Schedule", "شیڈول", f"{dp.sched_days or '—'} · {dp.rx_duration_hrs or 4} h")]) \
		+ _row([("Dialyser / QB / QD", "سیٹنگ", f"{dp.dialyser or '—'} · {dp.blood_flow or '—'} · {dp.dialysate_flow or '—'}"), ("Dialysate / heparin", "ڈائیلیسیٹ / ہیپرین", f"{dp.dialysate or '—'} · {dp.heparin or '—'}")]) \
		+ _row([("Last viral screen", "آخری وائرل ٹیسٹ", formatdate(dp.viral_tested_on, "dd MMM yyyy") if dp.viral_tested_on else "—"), ("EPO / iron", "ای پی او / آئرن", f"{dp.epo or '—'} · {dp.iron or '—'}")]) + "</table>"
	body += "<h3>Last sessions · آخری سیشن</h3><table class='t'><tr><th>Date</th><th>Pre / post wt</th><th>Pre BP</th><th>UF</th><th>URR / Kt/V</th></tr>" + "".join(
		f"<tr><td>{formatdate(x.session_date, 'dd MMM')}</td><td>{_f(x.pre_weight)} / {_f(x.post_weight)}</td><td>{x.pre_bp_sys or ''}/{x.pre_bp_dia or ''}</td><td>{_f(x.total_uf)}</td><td>{_f(x.urr)} / {_f(x.ktv)}</td></tr>" for x in last) + "</table>"
	body += f"<p><b>Recent labs:</b> {esc(labs or '—')}</p><p><b>Allergies:</b> {esc(dp.allergies_note or 'None known')}</p><p>Please contact our unit for any further information.</p>"
	return _shell("transfer", dz.KIND_TITLES["transfer"], dp.name, body, dp.branch, frappe.db.get_value("Doctor", dp.nephrologist, "user") if dp.nephrologist else None, True)


HTML = {"session": session_html, "monthly": monthly_html, "consent": consent_html, "card": card_html, "ckd": ckd_html, "transfer": transfer_html}


def html(kind, name):
	if kind not in HTML:
		frappe.throw(_("Unknown document."))
	return HTML[kind](name)


def pdf(kind, name):
	import io

	from frappe.utils.pdf import get_pdf
	from pypdf import PdfReader

	h = html(kind, name)
	opts = {"margin-top": "8mm", "margin-bottom": "12mm", "margin-left": "10mm", "margin-right": "10mm",
		"footer-center": f"{name} · Page [page] of [topage]", "footer-font-size": "7", "footer-spacing": "3"}
	for zoom in ("1", "0.94", "0.88", "0.83"):
		out = get_pdf(h, {**opts, "zoom": zoom})
		if len(PdfReader(io.BytesIO(out)).pages) == 1:
			return out
	return get_pdf(h, opts)
