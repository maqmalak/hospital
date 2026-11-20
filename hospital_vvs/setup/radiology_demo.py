"""Radiology demo data (D-91): radiologists and room staff, 30 days of studies and today's live worklist, plus the three
sample reports (normal chest X-ray; fatty liver + right renal calculus; obstetric 24 weeks). DEMO DATA — not clinical records.

	bench --site hospital execute hospital_vvs.setup.radiology_demo.run

Demo studies are marked paid without a Sales Invoice (no cashier shift); the real counter flow bills through the shift.
Key images are drawn here (labelled DEMO), not patient images.
"""

import io
import random
from datetime import timedelta

import frappe
from frappe.utils import add_to_date, get_datetime, getdate, now_datetime, today

from hospital_vvs import roles as R
from hospital_vvs.services import radiology as rad
from hospital_vvs.setup.demo import _user

RADS = [("Dr. Saima Javed", "ڈاکٹر صائمہ جاوید", "MBBS, FCPS (Radiology)", "PMDC-48213-P", "dr.saima", "Mon Tue Wed Thu Fri Sat", "09:00", "17:00"),
	("Dr. Hamza Rafiq", "ڈاکٹر حمزہ رفیق", "MBBS, FCPS (Diagnostic Radiology), CBU", "PMDC-55102-P", "dr.hamza", "Mon Wed Fri Sat Sun", "14:00", "22:00")]
DAY = {"Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday", "Fri": "Friday", "Sat": "Saturday", "Sun": "Sunday"}


def staff():
	if not frappe.db.exists("Specialization", "Radiologist"):
		frappe.get_doc({"doctype": "Specialization", "specialization": "Radiologist", "department": "Radiology"}).insert(ignore_permissions=True)
	branch = frappe.db.get_value("Branch", {}, "name")
	out = []
	for name, ur, qual, reg, login, days, a, b in RADS:
		doc = frappe.db.get_value("Doctor", {"doctor_name": name}, "name")
		if not doc:
			d = frappe.get_doc({"doctype": "Doctor", "doctor_name": name, "doctor_name_ur": ur, "specialization": "Radiologist", "department": "Radiology",
				"qualification": qual, "registration_no": reg, "show_license": 1, "branch": branch, "default_fee": 0, "is_active": 1, "doctor_type": "Internal",
				"consultation_room": "Radiology reporting room", "color": "#0E5E6F",
				"schedule": [{"day": DAY[x], "start_time": a + ":00", "end_time": b + ":00", "branch": branch} for x in days.split()]})
			d.flags.ignore_mandatory = True
			d.insert(ignore_permissions=True)
			doc = d.name
		email = _user(login, name, [R.RADIOLOGIST, R.DOCTOR])
		frappe.db.set_value("Doctor", doc, "user", email)
		out.append(doc)
	_user("radiographer", "Waqas Radiographer", [R.RADIOGRAPHER])
	_user("sonographer", "Mehwish Sonographer", [R.SONOGRAPHER])
	_user("mritech", "Usman MRI Technologist", [R.MRI_TECH])
	_user("cttech", "Rabia CT Technologist", [R.CT_TECH])
	return out


# ------------------------------------------------------------------ demo key images (drawn, labelled DEMO)
def _png(kind, seed):
	import numpy as np
	from PIL import Image, ImageDraw, ImageFilter

	r = np.random.default_rng(seed)
	w, h = 640, 480
	if kind in ("mri", "ct"):
		img = Image.new("L", (w, h), 6)
		d = ImageDraw.Draw(img)
		if kind == "mri":  # sagittal lumbar spine look: vertebral bodies + discs
			for i in range(5):
				y = 60 + i * 78
				d.rounded_rectangle((250, y, 350, y + 58), 10, fill=120)
				d.ellipse((255, y + 58, 345, y + 78), fill=200 if i != 3 else 150)
			d.rectangle((365, 40, 395, 450), fill=210)  # CSF
			d.ellipse((345, 330, 372, 352), fill=170)  # L4-5 protrusion
		else:  # axial CT abdomen / KUB look
			d.ellipse((90, 70, 550, 420), fill=95)
			d.ellipse((140, 140, 250, 300), fill=125)
			d.ellipse((390, 140, 500, 300), fill=125)
			d.ellipse((300, 260, 340, 300), fill=235)  # vertebra
			d.ellipse((205, 320, 217, 332), fill=255)  # calculus
		img = img.filter(ImageFilter.GaussianBlur(3))
		arr = np.clip(np.asarray(img, dtype=float) + r.normal(0, 5, (h, w)), 0, 255).astype("uint8")
	elif kind == "xray":
		img = Image.new("L", (w, h), 18)
		d = ImageDraw.Draw(img)
		d.ellipse((150, 70, 300, 420), fill=70)
		d.ellipse((340, 70, 490, 420), fill=70)
		d.ellipse((250, 210, 400, 400), fill=165)  # heart shadow
		d.rectangle((305, 30, 335, 460), fill=150)  # spine / mediastinum
		for i in range(9):  # ribs
			y = 95 + i * 34
			d.arc((120, y - 40, 320, y + 40), 200, 340, fill=125, width=6)
			d.arc((320, y - 40, 520, y + 40), 200, 340, fill=125, width=6)
		img = img.filter(ImageFilter.GaussianBlur(5))
		arr = np.clip(np.asarray(img, dtype=float) + r.normal(0, 6, (h, w)), 0, 255).astype("uint8")
	else:
		yy, xx = np.mgrid[0:h, 0:w]
		ang = np.arctan2(xx - w / 2, yy + 40)
		dist = np.hypot(xx - w / 2, yy + 40)
		mask = (np.abs(ang) < 0.62) & (dist > 70) & (dist < 500)
		speck = r.rayleigh(38, (h, w))
		base = speck * mask
		cy, cx = (300, 300) if kind != "ob" else (260, 330)
		blob = np.exp(-(((xx - cx) / 120) ** 2 + ((yy - cy) / 75) ** 2))
		if kind == "ob":
			base = base * (1 - 0.85 * blob) + 140 * np.exp(-(((xx - cx) / 70) ** 2 + ((yy - cy) / 58) ** 2)) * mask * (r.random((h, w)) * 0.6 + 0.6)
		elif kind == "kidney":
			base = base * (1 - 0.4 * blob) + 200 * np.exp(-(((xx - 360) / 7) ** 2 + ((yy - 300) / 7) ** 2)) * mask
		else:
			base = base * (1 + 0.6 * blob)
		arr = np.clip(base, 0, 255).astype("uint8")
	img = Image.fromarray(arr).convert("RGB")
	d = ImageDraw.Draw(img)
	d.text((14, 12), "DEMO IMAGE - not a patient scan", fill=(255, 210, 90))
	d.text((14, h - 24), "Lyallpur Medical Complex - Radiology", fill=(160, 220, 215))
	buf = io.BytesIO()
	img.save(buf, "JPEG", quality=82)
	return buf.getvalue()


def _attach(study, kind, seed, caption):
	from frappe.utils.file_manager import save_file

	f = save_file(f"{study}-demo-{kind}-{seed}.jpg", _png(kind, seed), "Imaging Study", study, is_private=1)
	return {"image": f.file_url, "caption": caption}


# ------------------------------------------------------------------ sample reports (C2)
SAMPLES = [
	{"procedure": "X-Ray Chest PA View", "template": "Normal Chest X-ray PA", "gender": "Male", "age": 34, "history": "Pre-employment medical. No cough or fever.",
	 "title": "X-RAY CHEST PA VIEW", "impression": "Normal chest radiograph. No active cardiopulmonary disease.", "rec": "", "images": [("xray", "PA view")]},
	{"procedure": "Ultrasound Abdomen & Pelvis", "gender": "Female", "age": 46, "history": "Right flank pain on and off for 2 weeks; dyspepsia. No fever.",
	 "title": "ULTRASOUND ABDOMEN & PELVIS",
	 "technique": "Real-time grey-scale ultrasound of the abdomen and pelvis using a 3.5-5 MHz curvilinear probe, after 8 hours' fasting and with a full bladder.",
	 "findings": "Liver: normal in size (15.1 cm) with diffusely increased echogenicity and mild attenuation of the beam; the diaphragm and portal vein walls remain well seen — grade I fatty infiltration. No focal lesion. Intrahepatic biliary radicles are not dilated.\n"
		"Gallbladder: well distended with a thin wall; no calculus, sludge or pericholecystic fluid.\nCBD: 4 mm, not dilated.\n"
		"Pancreas: head and body normal in size and echotexture; tail obscured by bowel gas.\nSpleen: normal in size (10.2 cm) and echotexture.\n"
		"Right kidney: normal in size (10.4 x 4.6 cm) with preserved corticomedullary differentiation. A 6 mm echogenic focus with posterior acoustic shadowing is seen in the lower pole calyx, consistent with a calculus. No hydronephrosis or hydroureter.\n"
		"Left kidney: normal in size (10.8 x 4.9 cm) and echotexture. No calculus or hydronephrosis.\n"
		"Urinary bladder: well distended with a smooth wall; no intravesical calculus.\nUterus: anteverted, normal in size (7.8 x 4.1 x 3.6 cm); endometrium 6 mm. Both ovaries normal.\nPelvis: no free fluid.",
	 "impression": "1. Grade I fatty liver.\n2. 6 mm non-obstructing right renal calculus (lower pole). No hydronephrosis.\n3. Rest of the abdomen and pelvis unremarkable.",
	 "rec": "Weight reduction, dietary advice and lipid profile / LFTs for the fatty liver. Plenty of oral fluids; urology review for the renal calculus. Follow-up KUB ultrasound in 3-6 months.",
	 "measurements": [("Liver span (MCL)", "15.1", "cm", "up to 15.5"), ("CBD diameter", "4", "mm", "up to 6"), ("Spleen length", "10.2", "cm", "up to 12"),
		("Right kidney", "10.4 x 4.6", "cm", "9-12 x 4-6"), ("Left kidney", "10.8 x 4.9", "cm", "9-12 x 4-6"), ("Right renal calculus", "6", "mm", "—"),
		("Endometrial thickness", "6", "mm", "phase-dependent")],
	 "images": [("liver", "Liver — increased echogenicity"), ("kidney", "Right kidney — 6 mm lower-pole calculus")]},
	{"procedure": "Anomaly Scan (18-22 weeks)", "gender": "Female", "age": 27, "history": "G2P1, LMP 07-06-2026. Routine second-trimester scan. No bleeding or pain.",
	 "title": "OBSTETRIC ULTRASOUND — 24 WEEKS", "technique": "Transabdominal obstetric ultrasound with fetal biometry, anatomy survey and placental localisation.",
	 "findings": "Uterus: gravid, single intrauterine gestation.\nFetus: single, live, with regular cardiac activity and active fetal movements.\nFetal heart: rate 148 bpm, regular; four-chamber and outflow-tract views normal.\n"
		"Presentation: cephalic at the time of the scan.\nPlacenta: posterior, upper segment, grade I maturity; lower edge well clear of the internal os.\nLiquor: adequate, AFI 14.2 cm.\n"
		"Anatomy: skull, brain (ventricles, cerebellum, cisterna magna), face and lips, spine, stomach, abdominal wall, kidneys, bladder, and all four limbs seen and normal for gestation.\n"
		"Cervix: closed, length 3.6 cm.\nUmbilical cord: three vessels.",
	 "impression": "Single live intrauterine pregnancy of 24 weeks 1 day by biometry, consistent with dates. Estimated fetal weight 640 g (50th centile). No structural anomaly seen. Placenta posterior, upper segment.",
	 "rec": "Routine antenatal follow-up. Growth scan at 32-34 weeks. Note: an ultrasound cannot exclude every anomaly.",
	 "ob": {"ga": "24 weeks 1 day", "edd": "2027-03-14", "fhr": "148", "presentation": "Cephalic", "bpd": "59 mm (24w 2d)", "hc": "218 mm (23w 6d)",
		"ac": "196 mm (24w 1d)", "fl": "44 mm (24w 2d)", "efw": "640 g ± 94 g", "placenta": "Posterior, upper segment, grade I", "afi": "14.2 cm", "number": "Single"},
	 "measurements": [("BPD", "59", "mm", "24w 2d"), ("HC", "218", "mm", "23w 6d"), ("AC", "196", "mm", "24w 1d"), ("FL", "44", "mm", "24w 2d"),
		("EFW", "640", "g", "50th centile"), ("AFI", "14.2", "cm", "5-25"), ("Cervical length", "3.6", "cm", "> 2.5")],
	 "images": [("ob", "Fetal head — BPD/HC plane"), ("ob", "Abdomen — AC plane")]},
]


def _patients(gender, n=1, rnd=None):
	rows = frappe.get_all("Patient", filters={"disabled": 0, "gender": gender, "temporary_record": 0}, fields=["name", "patient_name", "phone", "dob", "gender"], limit=400)
	(rnd or random).shuffle(rows)
	return rows[:n]


def _age(dob):
	if not dob:
		return 30
	return max(1, getdate(today()).year - getdate(dob).year)


def _base(p, procedure, date, slot, rnd, status="Delivered", priority="Routine", source=None, rad_doctor=None):
	pr = rad.proc(procedure)
	ref = rnd.choice(frappe.get_all("Doctor", filters={"is_active": 1, "department": ["!=", "Radiology"]}, pluck="name") or [None])
	doc = frappe.get_doc({"doctype": "Imaging Study", "status": "Booked", "priority": priority, "procedure": pr.name, "branch": frappe.db.get_value("Branch", {}, "name"),
		"booking_source": source or rnd.choice(["Walk-in", "Walk-in", "Online", "Phone", "OPD", "WhatsApp"]), "scheduled_date": date, "slot_time": slot,
		"walk_in": 1 if pr.modality == "X-Ray" and rnd.random() < 0.6 else 0, "booking_ref": rad._booking_ref(), "patient": p.name, "patient_name": p.patient_name,
		"gender": p.gender, "age": _age(p.dob), "phone": p.phone, "referring_doctor": ref, "payment_option": "Pay at counter", "payment_status": "Unpaid",
		"amount": pr.price, "pregnancy_status": ("Not pregnant" if pr.report_kind != "Obstetric" else "Pregnant") if p.gender == "Female" else "Not applicable",
		"report_status": "Not Started", "report_template": pr.default_template, "radiologist": rad_doctor, "whatsapp_opt_in": 1,
		"clinical_notes": rnd.choice(["Pain for 1 week", "Follow-up", "Routine check", "Trauma — fall at home", "Fever and cough", "Abdominal pain", "Antenatal care"])})
	return doc, pr


def _ts(date, slot, minutes):
	return add_to_date(get_datetime(f"{date} {slot or '10:00'}"), minutes=minutes)


def _progress(doc, pr, target, rnd, report=None, signer=None):
	"""Walk a demo study to `target` with realistic timestamps (TAT spread includes some late reports)."""
	order = ["Booked", "Registered", "In Progress", "Scanned", "Reporting", "Verified", "Delivered"]
	reach = order.index(target)
	t0 = _ts(doc.scheduled_date, doc.slot_time, 0)
	ev = [("Booked", t0 - timedelta(days=1 if doc.booking_source == "Online" else 0, minutes=30), "Demo booking")]
	if reach >= 1:
		doc.registered_at, doc.token_no, doc.payment_status = t0, f"{rad.TOKEN_PREFIX[pr.modality]}-{rnd.randint(1, 60):03d}", "Paid"
		if rnd.random() < 0.12:
			doc.payment_option, doc.payment_status, doc.panel = "Insurance / Panel", "Panel Approved", frappe.db.get_value("Customer", {"customer_group": "Insurance Providers"}, "name")
		ev.append(("Registered", t0, f"Token {doc.token_no}"))
	if reach >= 2:
		doc.scan_started_at = _ts(doc.scheduled_date, doc.slot_time, rnd.randint(5, 25))
		doc.technologist = {"X-Ray": "radiographer@vvs.demo", "MRI": "mritech@vvs.demo", "CT": "cttech@vvs.demo"}.get(pr.modality, "sonographer@vvs.demo")
		ev.append(("In Progress", doc.scan_started_at, None))
	if reach >= 3:
		doc.scanned_at = add_to_date(doc.scan_started_at, minutes=max(5, (pr.duration_min or 15) + rnd.randint(-3, 8)))
		doc.qc_passed = 1
		doc.expected_at = add_to_date(doc.scanned_at, hours=pr.tat_hours or 4)
		ev.append(("Scanned", doc.scanned_at, "Image quality checked"))
	if reach >= 4:
		r = report if report else (_tpl(pr.default_template) if pr.default_template else {})
		for k, v in (r or {}).items():
			if k == "measurements":
				doc.set("measurements", [m if isinstance(m, dict) else {"label": m[0], "value": m[1], "unit": m[2], "reference": m[3]} for m in v])
			elif k == "key_images":
				doc.set("key_images", v)
			else:
				doc.set(k, v)
		doc.report_status = "Draft"
		ev.append(("Report Draft", add_to_date(doc.scanned_at, minutes=rnd.randint(10, 60)), None))
	if reach >= 5:
		late = rnd.random() < 0.12
		span = (pr.tat_hours or 4) * 60
		doc.verified_at = add_to_date(doc.scanned_at, minutes=int(span * (rnd.uniform(1.05, 1.6) if late else rnd.uniform(0.2, 0.85))))
		doc.report_status, doc.signed_by = "Final", signer
		doc.report_version = 1
		ev.append(("Verified", doc.verified_at, "Final report signed (v1)"))
	if reach >= 6:
		doc.delivered_at = add_to_date(doc.verified_at, minutes=rnd.randint(20, 600))
		doc.delivered_via = rnd.choice(["Patient portal", "Printed copy", "Printed copy + films", "WhatsApp link"])
		ev.append(("Delivered", doc.delivered_at, doc.delivered_via))
	doc.status = target
	doc.set("events", [{"status": s, "at": at, "note": n, "by_user": "Administrator"} for s, at, n in ev])
	doc.insert(ignore_permissions=True)
	if doc.report_status == "Final":
		doc.content_hash = rad.content_of(doc)
		doc.signature_hash = rad.sig_of(doc.name, doc.report_version, doc.content_hash)
		doc.db_set({"content_hash": doc.content_hash, "signature_hash": doc.signature_hash}, update_modified=False)
	return doc


def _tpl(name):
	if not name or not frappe.db.exists("Imaging Report Template", name):
		return {}
	t = frappe.get_doc("Imaging Report Template", name)
	return {"report_title": t.report_title, "technique": t.technique, "findings": t.findings, "impression": t.impression, "recommendations": t.recommendations,
		"measurements": [{"label": m.label, "value": m.value, "unit": m.unit, "reference": m.reference} for m in t.measurements]}



def samples(rads, rnd):
	made = []
	signer = frappe.db.get_value("Doctor", rads[0], "user")
	for i, s in enumerate(SAMPLES):
		if frappe.db.exists("Imaging Study", {"report_title": s["title"], "clinical_history": s["history"]}):
			continue
		p = _patients(s["gender"], 1, rnd)[0]
		date = add_to_date(getdate(today()), days=-(1 + i))
		doc, pr = _base(p, s["procedure"], date, "10:20", rnd, priority="Routine", source="OPD", rad_doctor=rads[0])
		doc.age = s["age"]
		doc.pregnancy_status = "Pregnant" if "OBSTETRIC" in s["title"] else ("Not pregnant" if s["gender"] == "Female" else "Not applicable")
		base = _tpl(s.get("template")) if s.get("template") else {}
		report = {**base, "report_title": s["title"], "clinical_history": s["history"], "impression": s["impression"], "recommendations": s.get("rec") or base.get("recommendations")}
		if s.get("technique"):
			report["technique"] = s["technique"]
		if s.get("findings"):
			report["findings"] = s["findings"]
		if s.get("measurements"):
			report["measurements"] = [{"label": a, "value": b, "unit": c, "reference": d} for a, b, c, d in s["measurements"]]
		for k, v in (s.get("ob") or {}).items():
			report[f"ob_{k}"] = v
		doc = _progress(doc, pr, "Delivered", rnd, report=report, signer=signer)
		doc.reload()
		for j, (kind, cap) in enumerate(s["images"]):
			doc.append("key_images", _attach(doc.name, kind, 100 + i * 10 + j, cap))
		doc.save(ignore_permissions=True)
		doc.content_hash = rad.content_of(doc)
		doc.signature_hash = rad.sig_of(doc.name, doc.report_version, doc.content_hash)
		doc.db_set({"content_hash": doc.content_hash, "signature_hash": doc.signature_hash}, update_modified=False)
		made.append(doc.name)
	return made


def history(rads, rnd, days=30):
	procs = frappe.get_all("Imaging Procedure", filters={"is_active": 1}, fields=["name", "modality", "female_only", "category", "report_kind"])
	weights = {"X-Ray": 6, "Ultrasound": 4, "Doppler": 1, "MRI": 1, "CT": 1}
	pool = [p for p in procs if p.category != "Guided Procedure" or p.modality != "CT" for _ in range(weights.get(p.modality, 0) * (3 if p.category in ("X-Ray", "Ultrasound") else 1))]
	if frappe.db.count("Imaging Study", {"scheduled_date": ["<", today()]}) > 80:
		return 0
	n = 0
	for back in range(days, 0, -1):
		date = add_to_date(getdate(today()), days=-back)
		for _ in range(rnd.randint(9, 18)):
			pr = rnd.choice(pool)
			p = _patients("Female" if pr.female_only or rnd.random() < 0.5 else "Male", 1, rnd)
			if not p:
				continue
			slot = f"{rnd.randint(8, 20):02d}:{rnd.choice(['00', '15', '20', '30', '40', '45'])}"
			r_doc = rnd.choice(rads)
			doc, prd = _base(p[0], pr.name, date, slot, rnd, priority=rnd.choices(["Routine", "Urgent", "Emergency"], [85, 11, 4])[0], rad_doctor=r_doc)
			if rnd.random() < 0.04:
				doc.status = "No Show" if rnd.random() < 0.6 else "Cancelled"
				doc.insert(ignore_permissions=True)
				continue
			if rnd.random() < 0.03:
				doc.critical_finding, doc.critical_note = 1, rnd.choice(["Large right pneumothorax", "Free intraperitoneal air", "Ectopic pregnancy with haemoperitoneum",
					"Acute DVT left femoral vein"])
				doc.critical_notified_at = _ts(date, slot, 50)
			_progress(doc, prd, "Delivered" if rnd.random() < 0.9 else "Verified", rnd, signer=frappe.db.get_value("Doctor", r_doc, "user"))
			n += 1
	return n


def today_list(rads, rnd):
	"""Today's live worklist: every stage represented, a few urgent / emergency, one overdue, a portable ICU film."""
	if frappe.db.count("Imaging Study", {"scheduled_date": today()}) >= 12:
		return 0
	now = now_datetime()
	plan = [("X-Ray Chest PA View", "Delivered"), ("X-Ray Knee AP & Lateral", "Verified"), ("Ultrasound Abdomen & Pelvis", "Verified"), ("X-Ray Lumbar Spine AP & Lateral", "Reporting"),
		("Ultrasound KUB", "Reporting"), ("Growth Scan (Third Trimester)", "Scanned"), ("X-Ray Abdomen Erect", "Scanned"), ("Venous Doppler (DVT / Varicose)", "In Progress"),
		("X-Ray Shoulder", "In Progress"), ("Ultrasound Thyroid & Neck", "Registered"), ("X-Ray Chest PA View", "Registered"), ("Early Pregnancy Scan (Dating / Viability)", "Booked"),
		("Ultrasound Abdomen (Upper)", "Booked"), ("Anomaly Scan (18-22 weeks)", "Booked"), ("Carotid Doppler", "Booked"), ("Portable / Bedside X-Ray (Ward & ICU)", "Scanned"),
		("Ultrasound Pelvis (Transabdominal)", "Booked"), ("X-Ray PNS / Sinuses (Water's view)", "Booked")]
	n = 0
	for i, (procedure, status) in enumerate(plan):
		pr = rad.proc(procedure)
		p = _patients("Female" if pr.female_only or i % 2 else "Male", 1, rnd)[0]
		mins = -260 + i * 25 if status != "Booked" else 30 + i * 20
		at = add_to_date(now, minutes=mins)
		slot = f"{at.hour:02d}:{(at.minute // 5) * 5:02d}"
		pri = "Emergency" if procedure.startswith("X-Ray Abdomen Erect") else "Urgent" if i in (4, 7) else "Routine"
		doc, prd = _base(p, procedure, getdate(today()) if at.date() == now.date() else at.date(), slot, rnd, priority=pri, rad_doctor=rads[i % 2] if status in ("Reporting", "Verified", "Delivered") else None,
			source="Ward / ICU" if "Portable" in procedure else None)
		if "Portable" in procedure:
			doc.ward_location, doc.walk_in = "ICU · Bed I-03", 1
		if status == "Booked":
			doc.booking_source, doc.walk_in = "Online", 0
			doc.insert(ignore_permissions=True)
			n += 1
			continue
		d = _progress(doc, prd, status, rnd, signer=frappe.db.get_value("Doctor", rads[i % 2], "user"))
		if i == 3:  # overdue report
			d.db_set("expected_at", add_to_date(now, minutes=-40), update_modified=False)
		if i == 4:
			d.db_set({"critical_finding": 0}, update_modified=False)
		n += 1
	return n


# ------------------------------------------------------------------ MRI & CT (D-98)
MRCT_SAMPLES = [
	{"procedure": "MRI Lumbar Spine", "template": "MRI Lumbar Spine - disc bulge", "gender": "Male", "age": 42, "history": "Low back pain radiating to the right leg for 6 weeks; numbness over the right foot.",
	 "title": "MRI LUMBAR SPINE", "machine": "MRI-1", "protocol": "Sag T1, T2, STIR; Ax T2 L1-S1", "images": [("mri", "Sagittal T2 — L4-L5 disc")]},
	{"procedure": "CT Brain (plain)", "template": "Normal CT Brain (plain)", "gender": "Female", "age": 58, "history": "Headache and dizziness for 3 days. No trauma. BP 150/95.",
	 "title": "CT BRAIN (PLAIN)", "machine": "CT-1", "protocol": "Non-contrast axial 5 mm, bone and brain windows", "ctdi": 48.2, "dlp": 812, "images": [("ct", "Axial — brain window")]},
	{"procedure": "CT KUB (stone protocol)", "template": "CT KUB - ureteric calculus", "gender": "Male", "age": 36, "history": "Acute right loin-to-groin pain since last night; haematuria. Creatinine 1.0.",
	 "title": "CT KUB (STONE PROTOCOL)", "machine": "CT-1", "protocol": "Low-dose non-contrast KUB, 3 mm axial + coronal MPR", "ctdi": 6.1, "dlp": 285, "priority": "Urgent", "images": [("ct", "Axial — right lower ureteric calculus")]},
]


def _safety_ok(doc, pr):
	for q, _b in rad.questions_for(pr):
		doc.append("safety_answers", {"question": q, "answer": "No"})
	if (pr.contrast or "No") != "No":
		doc.creatinine, doc.egfr, doc.creatinine_date = 0.9, 92, today()
	doc.consent_signer, doc.consent_taken = doc.patient_name, 1
	doc.safety_status = rad.evaluate_safety(doc, pr)


def mrct_samples(rads, rnd):
	made = []
	signer = frappe.db.get_value("Doctor", rads[1], "user")
	for i, s in enumerate(MRCT_SAMPLES):
		if frappe.db.exists("Imaging Study", {"report_title": s["title"], "clinical_history": s["history"]}):
			continue
		p = _patients(s["gender"], 1, rnd)[0]
		date = add_to_date(getdate(today()), days=-(1 + i))
		doc, pr = _base(p, s["procedure"], date, "11:30", rnd, priority=s.get("priority", "Routine"), source="OPD", rad_doctor=rads[1])
		doc.age, doc.walk_in = s["age"], 0
		doc.pregnancy_status = "Not pregnant" if s["gender"] == "Female" else "Not applicable"
		doc.machine, doc.protocol, doc.ctdi, doc.dlp, doc.image_count = s["machine"], s["protocol"], s.get("ctdi"), s.get("dlp"), rnd.randint(180, 420)
		_safety_ok(doc, pr)
		report = {**_tpl(s["template"]), "report_title": s["title"], "clinical_history": s["history"]}
		doc = _progress(doc, pr, "Delivered", rnd, report=report, signer=signer)
		doc.reload()
		for j, (kind, cap) in enumerate(s["images"]):
			doc.append("key_images", _attach(doc.name, kind, 300 + i * 10 + j, cap))
		doc.save(ignore_permissions=True)
		doc.content_hash = rad.content_of(doc)
		doc.signature_hash = rad.sig_of(doc.name, doc.report_version, doc.content_hash)
		doc.db_set({"content_hash": doc.content_hash, "signature_hash": doc.signature_hash}, update_modified=False)
		made.append(doc.name)
	return made


def mrct_today(rads, rnd):
	"""Today's MRI-1 / CT-1 worklist: a pacemaker patient blocked for clearance, contrast awaiting creatinine, cleared and in-progress scans."""
	if frappe.db.count("Imaging Study", {"scheduled_date": today(), "modality": ["in", ["MRI", "CT"]]}) >= 6:
		return 0
	now = now_datetime()
	plan = [("MRI Brain", "Booked", "pacemaker"), ("MRI Knee", "Registered", "ok"), ("MRI Cervical Spine", "In Progress", "ok"), ("MRI Abdomen", "Booked", "pending"),
		("CT Brain (plain)", "Scanned", "ok"), ("CT Abdomen & Pelvis (triphasic)", "Registered", "pending"), ("CT Chest", "Reporting", "ok"), ("CT KUB (stone protocol)", "Booked", "ok"),
		("CT Pulmonary Angiography", "Registered", "low_egfr")]
	n = 0
	for i, (procedure, status, safety) in enumerate(plan):
		pr = rad.proc(procedure)
		p = _patients("Female" if i % 2 else "Male", 1, rnd)[0]
		at = add_to_date(now, minutes=(-200 + i * 30) if status != "Booked" else 40 + i * 25)
		slot = f"{at.hour:02d}:{(at.minute // 5) * 5:02d}"
		doc, prd = _base(p, procedure, getdate(today()) if at.date() == now.date() else at.date(), slot, rnd, priority="Urgent" if "Pulmonary" in procedure else "Routine",
			rad_doctor=rads[1] if status == "Reporting" else None)
		doc.walk_in, doc.machine = 0, rad.HOURS[pr.modality]["machines"][0]
		doc.pregnancy_status = "Not pregnant" if p.gender == "Female" else "Not applicable"
		if safety != "pending":
			_safety_ok(doc, prd)
		if safety == "pacemaker":
			for a in doc.safety_answers:
				if a.question.startswith("Cardiac pacemaker"):
					a.answer, a.detail = "Yes", "Dual-chamber pacemaker 2019 — card not brought"
		if safety == "low_egfr":
			doc.creatinine, doc.egfr = 2.4, 26
		if safety == "pending":
			doc.safety_status = "Pending"
		else:
			doc.safety_status = rad.evaluate_safety(doc, prd)
		if (prd.contrast or "No") == "Yes":
			doc.contrast_charge, doc.amount = prd.contrast_surcharge, (prd.price or 0) + (prd.contrast_surcharge or 0)
		if status == "Booked":
			doc.booking_source = "Online"
			doc.insert(ignore_permissions=True)
		else:
			_progress(doc, prd, status, rnd, signer=frappe.db.get_value("Doctor", rads[1], "user"))
		n += 1
	return n


def run_mrct(seed=11):
	frappe.flags.hv_sync_messages = True
	rnd = random.Random(seed)
	frappe.set_user("Administrator")
	rads = staff()
	made = mrct_samples(rads, rnd)
	t = mrct_today(rads, rnd)
	frappe.db.commit()
	print(f"MRI/CT samples {made} · today {t}")
	return made


def run(seed=7):
	frappe.flags.hv_sync_messages = True
	rnd = random.Random(seed)
	frappe.set_user("Administrator")
	rads = staff()
	made = samples(rads, rnd)
	h = history(rads, rnd)
	t = today_list(rads, rnd)
	run_mrct()
	frappe.db.commit()
	print(f"radiologists {rads} · samples {made} · history {h} · today {t}")
	return made
