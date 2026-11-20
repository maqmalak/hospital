"""Radiology catalogue + report templates (D-91). Idempotent: inserts what is missing, never overwrites edits.
Prices are Faisalabad 2026 defaults [confirm with the department]; edit them in the app (Radiology → Catalogue)."""

import frappe

# name, code, modality, category, region, price, minutes, tat_h, prep_group, walk_in, consent, female, kind, description, preparation(optional)
XR, US, DP = "X-Ray", "Ultrasound", "Doppler"
P = [
	("X-Ray Chest PA View", "XR-CXR-PA", XR, "X-Ray", "Chest", 1200, 10, 3, "Metal Removal", 1, 0, 0, "General", "Heart, lungs and ribs — the most requested X-ray."),
	("X-Ray Chest AP View", "XR-CXR-AP", XR, "X-Ray", "Chest", 1200, 10, 3, "Metal Removal", 1, 0, 0, "General", "For patients who cannot stand; taken lying or sitting."),
	("X-Ray Chest Lateral View", "XR-CXR-LAT", XR, "X-Ray", "Chest", 1200, 10, 3, "Metal Removal", 1, 0, 0, "General", "Side view to locate a finding seen on the PA film."),
	("X-Ray Skull AP & Lateral", "XR-SKULL", XR, "X-Ray", "Head", 1500, 10, 3, "Metal Removal", 1, 0, 0, "General", "Skull bones after injury or for sinus and bone conditions."),
	("X-Ray Cervical Spine AP & Lateral", "XR-CSPINE", XR, "X-Ray", "Spine", 1600, 10, 3, "Metal Removal", 1, 0, 0, "General", "Neck pain, stiffness or injury."),
	("X-Ray Dorsal Spine AP & Lateral", "XR-DSPINE", XR, "X-Ray", "Spine", 1600, 10, 3, "Metal Removal", 1, 0, 0, "General", "Upper and mid back."),
	("X-Ray Lumbar Spine AP & Lateral", "XR-LSPINE", XR, "X-Ray", "Spine", 1800, 10, 3, "Metal Removal", 1, 0, 0, "General", "Lower back pain and sciatica work-up."),
	("X-Ray Pelvis / Hip", "XR-PELVIS", XR, "X-Ray", "Pelvis", 1500, 10, 3, "Metal Removal", 1, 0, 0, "General", "Hip joints and pelvic bones after a fall or for arthritis."),
	("X-Ray Knee AP & Lateral", "XR-KNEE", XR, "X-Ray", "Joints", 1400, 10, 3, "Metal Removal", 1, 0, 0, "General", "Knee pain, arthritis and injury."),
	("X-Ray Shoulder", "XR-SHOULDER", XR, "X-Ray", "Joints", 1400, 10, 3, "Metal Removal", 1, 0, 0, "General", "Shoulder pain, dislocation and fracture."),
	("X-Ray Hand / Wrist", "XR-HAND", XR, "X-Ray", "Joints", 1200, 10, 3, "Metal Removal", 1, 0, 0, "General", "Fractures, bone age and arthritis."),
	("X-Ray Foot / Ankle", "XR-FOOT", XR, "X-Ray", "Joints", 1200, 10, 3, "Metal Removal", 1, 0, 0, "General", "Sprains, fractures and heel pain."),
	("X-Ray Abdomen KUB", "XR-KUB", XR, "X-Ray", "Abdomen", 1400, 10, 3, "Metal Removal", 1, 0, 0, "General", "Kidney, ureter and bladder stones."),
	("X-Ray Abdomen Erect", "XR-ABD-ERECT", XR, "X-Ray", "Abdomen", 1400, 10, 2, "Metal Removal", 1, 0, 0, "General", "Bowel obstruction and free air — often urgent."),
	("X-Ray PNS / Sinuses (Water's view)", "XR-PNS", XR, "X-Ray", "Head", 1300, 10, 3, "Metal Removal", 1, 0, 0, "General", "Sinusitis and nasal blockage."),
	("Dental OPG", "XR-OPG", XR, "X-Ray", "Dental", 2000, 10, 4, "Metal Removal", 1, 0, 0, "General", "All teeth and both jaws in one panoramic image."),
	("Portable / Bedside X-Ray (Ward & ICU)", "XR-PORTABLE", XR, "X-Ray", "Any", 2500, 20, 2, "None", 1, 0, 0, "General", "Taken at the bedside for patients who cannot be moved.",
		"No preparation — the radiographer comes to the ward with the portable unit."),
	("Barium Swallow", "XR-BA-SWALLOW", XR, "Contrast Study", "Oesophagus", 6000, 30, 24, "Contrast", 0, 1, 0, "General", "Swallowing difficulty, reflux and oesophageal narrowing.",
		"Nothing to eat or drink for 6 hours before. Tell us about any allergy. Expect white stools for a day — drink plenty of water."),
	("Barium Meal", "XR-BA-MEAL", XR, "Contrast Study", "Stomach", 7500, 45, 24, "Contrast", 0, 1, 0, "General", "Stomach and duodenum outline with barium.",
		"Nothing to eat, drink or smoke from midnight before the test. Bring earlier reports. Drink plenty of water afterwards."),
	("IVP (Intravenous Pyelogram)", "XR-IVP", XR, "Contrast Study", "Kidneys", 9000, 60, 24, "Contrast", 0, 1, 0, "General", "Kidneys and urinary tract with iodine contrast.",
		"Light dinner, then a laxative as advised and nothing to eat after midnight. Bring your serum creatinine report. Tell us about asthma, allergy or diabetes medicine (metformin)."),
	("HSG (Hysterosalpingography)", "XR-HSG", XR, "Contrast Study", "Uterus & tubes", 12000, 45, 24, "Contrast", 0, 1, 1, "General", "Fallopian tube patency for fertility work-up.",
		"Book between day 7 and 11 of your cycle (after bleeding stops, before ovulation). Avoid intercourse from the start of the period until the test. A painkiller 1 hour before helps. Written consent is taken."),
	("Ultrasound Abdomen & Pelvis", "US-ABD-PELVIS", US, "Ultrasound", "Abdomen", 3000, 20, 4, "Fasting + Full Bladder", 0, 0, 0, "Abdomen", "Liver, gallbladder, pancreas, spleen, kidneys, bladder and pelvic organs."),
	("Ultrasound Abdomen (Upper)", "US-ABD", US, "Ultrasound", "Abdomen", 2500, 20, 4, "Fasting", 0, 0, 0, "Abdomen", "Liver, gallbladder, pancreas, spleen and kidneys."),
	("Ultrasound KUB", "US-KUB", US, "Ultrasound", "Kidneys", 2200, 15, 4, "Full Bladder", 0, 0, 0, "Abdomen", "Kidneys, ureters, bladder and prostate / post-void volume."),
	("Ultrasound Pelvis (Transabdominal)", "US-PELVIS", US, "Ultrasound", "Pelvis", 2500, 15, 4, "Full Bladder", 0, 0, 1, "General", "Uterus and ovaries through the abdomen."),
	("Ultrasound TVS (Transvaginal)", "US-TVS", US, "Ultrasound", "Pelvis", 3500, 20, 4, "None", 0, 1, 1, "General", "Close, detailed view of the uterus and ovaries; female sonographer or chaperone.",
		"Empty your bladder just before the scan. A female sonographer or chaperone is present and verbal consent is taken."),
	("Early Pregnancy Scan (Dating / Viability)", "US-OB-EARLY", US, "Pregnancy", "Pregnancy", 2500, 15, 2, "Full Bladder", 0, 0, 1, "Obstetric", "Confirms the pregnancy, heartbeat and due date (6-13 weeks)."),
	("NT Scan (11-14 weeks)", "US-OB-NT", US, "Pregnancy", "Pregnancy", 4000, 30, 2, "Pregnancy", 0, 0, 1, "Obstetric", "Nuchal translucency and early anatomy screening."),
	("Anomaly Scan (18-22 weeks)", "US-OB-ANOMALY", US, "Pregnancy", "Pregnancy", 6000, 40, 2, "Pregnancy", 0, 0, 1, "Obstetric", "Detailed check of the baby's organs, placenta and liquor."),
	("Growth Scan (Third Trimester)", "US-OB-GROWTH", US, "Pregnancy", "Pregnancy", 3500, 20, 2, "Pregnancy", 0, 0, 1, "Obstetric", "Baby's growth, weight, position, liquor and placenta."),
	("3D / 4D Pregnancy Scan", "US-OB-4D", US, "Pregnancy", "Pregnancy", 8000, 40, 2, "Pregnancy", 0, 0, 1, "Obstetric", "Live 3D images of your baby (best at 26-32 weeks), with prints.",
		"Drink 2 extra glasses of water daily for 3 days before. Eat something light an hour before — babies move more after a meal."),
	("Ultrasound Thyroid & Neck", "US-THYROID", US, "Ultrasound", "Neck", 3000, 15, 4, "None", 0, 0, 0, "General", "Thyroid nodules, swellings and neck lymph nodes."),
	("Ultrasound Breast (Both)", "US-BREAST", US, "Ultrasound", "Breast", 3500, 20, 4, "None", 0, 0, 0, "General", "Breast lumps and follow-up; female sonographer on request.",
		"No preparation. Wear a two-piece outfit; avoid talc or deodorant on the day. A female sonographer is available on request."),
	("Ultrasound Scrotum / Testes", "US-SCROTAL", US, "Ultrasound", "Scrotum", 3000, 15, 4, "None", 0, 0, 0, "General", "Testicular pain, swelling and varicocele."),
	("Ultrasound Musculoskeletal (Joint / Tendon)", "US-MSK", US, "Ultrasound", "Joints", 3500, 20, 4, "None", 0, 0, 0, "General", "Shoulder, knee, tendon and muscle injuries."),
	("Ultrasound Soft Tissue / Swelling", "US-SOFT", US, "Ultrasound", "Soft tissue", 2500, 15, 4, "None", 0, 0, 0, "General", "Lumps, abscesses, hernias and lymph nodes."),
	("Carotid Doppler", "DP-CAROTID", DP, "Doppler", "Neck vessels", 5000, 30, 4, "None", 0, 0, 0, "General", "Narrowing of the neck arteries (stroke risk)."),
	("Arterial Doppler (Lower Limb)", "DP-ARTERIAL", DP, "Doppler", "Leg arteries", 6000, 40, 4, "None", 0, 0, 0, "General", "Leg pain on walking, poor circulation, diabetic foot."),
	("Venous Doppler (DVT / Varicose)", "DP-VENOUS", DP, "Doppler", "Leg veins", 5500, 40, 4, "None", 0, 0, 0, "General", "Clots (DVT) and varicose veins."),
	("Obstetric Doppler", "DP-OB", DP, "Doppler", "Pregnancy", 4500, 30, 2, "Pregnancy", 0, 0, 1, "Obstetric", "Blood flow to the baby (umbilical, MCA, uterine arteries)."),
	("Renal Doppler", "DP-RENAL", DP, "Doppler", "Kidney vessels", 5000, 40, 4, "Fasting", 0, 0, 0, "General", "Kidney artery narrowing in high blood pressure.",
		"Do not eat for 6 hours before; plain water is fine."),
	("Ultrasound-guided FNAC", "US-FNAC", US, "Guided Procedure", "Any", 6000, 30, 72, "None", 0, 1, 0, "General", "Fine-needle sample from a lump (thyroid, breast, node) for the lab.",
		"Bring your PT/INR and CBC reports and tell us if you take blood thinners (aspirin, clopidogrel, warfarin). Written consent is taken."),
	("Ultrasound-guided Biopsy", "US-BIOPSY", US, "Guided Procedure", "Any", 12000, 45, 96, "Fasting", 0, 1, 0, "General", "Core tissue sample (liver, kidney, breast) under ultrasound.",
		"Fast 6 hours. Bring PT/INR, CBC and earlier scans; stop blood thinners only as your doctor advises. Plan to stay 2-4 hours. Written consent is taken."),
	("Ultrasound-guided Aspiration / Drainage", "US-ASPIRATION", US, "Guided Procedure", "Any", 8000, 40, 24, "None", 0, 1, 0, "General", "Draining fluid (pleural, ascites, abscess, cyst) under ultrasound.",
		"Bring PT/INR and CBC reports and tell us about blood thinners. Written consent is taken."),
]

ABD_MEAS = [("Liver span (MCL)", "", "cm", "up to 15.5"), ("CBD diameter", "", "mm", "up to 6"), ("Spleen length", "", "cm", "up to 12"),
	("Right kidney", "", "cm", "9-12 x 4-6"), ("Left kidney", "", "cm", "9-12 x 4-6"), ("Urinary bladder", "", "", "normal wall < 4 mm")]
OB_MEAS = [("BPD", "", "mm", ""), ("HC", "", "mm", ""), ("AC", "", "mm", ""), ("FL", "", "mm", ""), ("EFW", "", "g", ""), ("AFI", "", "cm", "5-25")]

T = [
	("Normal Chest X-ray PA", XR, "X-Ray Chest PA View", "X-RAY CHEST PA VIEW", "Single frontal (PA) erect radiograph of the chest, adequate inspiration and penetration.",
		"Lungs: both lung fields are clear. No consolidation, collapse, mass or nodule.\nPleura: costophrenic angles are sharp; no effusion or pneumothorax.\n"
		"Heart: cardiac size is within normal limits (CTR < 0.5). Mediastinum is central and not widened.\nHila: normal in size and position.\n"
		"Diaphragm: both domes are well defined and normally placed.\nBones and soft tissues: visualised bony thorax and soft tissues are unremarkable.",
		"Normal chest radiograph.", "", []),
	("Normal Abdomen & Pelvis US", US, "Ultrasound Abdomen & Pelvis", "ULTRASOUND ABDOMEN & PELVIS", "Real-time grey-scale ultrasound of the abdomen and pelvis using a 3.5-5 MHz curvilinear probe.",
		"Liver: normal in size and echotexture. No focal lesion. Intrahepatic biliary radicles are not dilated. Portal vein normal.\n"
		"Gallbladder: well distended, thin wall, no calculus or sludge.\nCBD: not dilated.\nPancreas: visualised parts normal in size and echogenicity.\n"
		"Spleen: normal in size and echotexture.\nRight kidney: normal in size, position and corticomedullary differentiation. No calculus or hydronephrosis.\n"
		"Left kidney: normal in size, position and corticomedullary differentiation. No calculus or hydronephrosis.\n"
		"Urinary bladder: well distended with a smooth wall; no calculus or mass.\nPelvis: no free fluid or pelvic mass.",
		"Normal ultrasound of the abdomen and pelvis.", "", ABD_MEAS),
	("Normal Abdomen US (Upper)", US, "Ultrasound Abdomen (Upper)", "ULTRASOUND ABDOMEN", "Real-time grey-scale ultrasound of the upper abdomen after fasting.",
		"Liver: normal in size and echotexture, no focal lesion.\nGallbladder: normal, no calculus.\nCBD: not dilated.\nPancreas: normal.\nSpleen: normal.\n"
		"Kidneys: both normal in size and echotexture, no calculus or hydronephrosis.\nAorta / IVC: normal calibre.", "Normal upper abdominal ultrasound.", "", ABD_MEAS[:5]),
	("Normal KUB US", US, "Ultrasound KUB", "ULTRASOUND KUB", "Grey-scale ultrasound of the kidneys, ureters and bladder with a full bladder; post-void volume measured.",
		"Right kidney: normal size and echotexture; no calculus, mass or hydronephrosis.\nLeft kidney: normal size and echotexture; no calculus, mass or hydronephrosis.\n"
		"Ureters: not dilated.\nUrinary bladder: well distended, smooth wall, no calculus.\nProstate (male): normal in size and echotexture.\nPost-void residual: insignificant.",
		"Normal KUB ultrasound.", "", [("Right kidney", "", "cm", "9-12"), ("Left kidney", "", "cm", "9-12"), ("Post-void residual", "", "ml", "< 50")]),
	("Obstetric US - 2nd trimester", US, "Anomaly Scan (18-22 weeks)", "OBSTETRIC ULTRASOUND — SECOND TRIMESTER", "Transabdominal obstetric ultrasound with fetal biometry.",
		"Uterus: gravid, single intrauterine gestation.\nFetus: single, live, with regular cardiac activity and active movements.\nPresentation: \nPlacenta: \nLiquor: adequate.\n"
		"Anatomy: head, face, spine, heart (four-chamber and outflow views), abdomen, kidneys, bladder and limbs seen and appear normal for gestation.\nCervix: closed, adequate length.",
		"Single live intrauterine pregnancy of ... weeks ... days by biometry, consistent with dates. No obvious structural anomaly.",
		"Routine antenatal follow-up. Growth scan at 32-34 weeks.", OB_MEAS),
	("Early pregnancy - viable", US, "Early Pregnancy Scan (Dating / Viability)", "EARLY PREGNANCY ULTRASOUND", "Transabdominal ultrasound with full bladder (transvaginal if needed, with consent).",
		"Uterus: gravid.\nGestational sac: single, intrauterine, well formed.\nYolk sac: present.\nEmbryo: single, with cardiac activity.\nAdnexa: no mass.\nPouch of Douglas: no free fluid.",
		"Single live intrauterine pregnancy of ... weeks ... days by CRL.", "Repeat scan at 11-14 weeks for NT.", [("CRL", "", "mm", ""), ("FHR", "", "bpm", "110-180")]),
	("Normal Pelvis US (female)", US, "Ultrasound Pelvis (Transabdominal)", "ULTRASOUND PELVIS", "Transabdominal ultrasound of the pelvis with a full bladder.",
		"Uterus: anteverted, normal in size and outline; myometrium homogeneous.\nEndometrium: normal thickness for the phase of the cycle.\nRight ovary: normal.\nLeft ovary: normal.\n"
		"Adnexa: no mass.\nPouch of Douglas: no free fluid.", "Normal pelvic ultrasound.", "", [("Uterus", "", "cm", ""), ("Endometrium", "", "mm", ""), ("Right ovary", "", "ml", ""), ("Left ovary", "", "ml", "")]),
	("Normal Thyroid US", US, "Ultrasound Thyroid & Neck", "ULTRASOUND THYROID & NECK", "High-frequency linear probe ultrasound of the thyroid and neck.",
		"Right lobe: normal size and echotexture, no nodule.\nLeft lobe: normal size and echotexture, no nodule.\nIsthmus: normal thickness.\nVascularity: normal.\nNeck nodes: no pathological lymph nodes.",
		"Normal thyroid ultrasound.", "", [("Right lobe", "", "cm", ""), ("Left lobe", "", "cm", ""), ("Isthmus", "", "mm", "< 5")]),
	("Normal X-ray (bones / joints)", XR, None, "", "Standard projections of the region requested.",
		"Bones: normal bone density and alignment. No fracture or dislocation.\nJoint spaces: preserved.\nSoft tissues: unremarkable.", "No bony abnormality.", "", []),
	("Normal lower-limb venous Doppler", DP, "Venous Doppler (DVT / Varicose)", "VENOUS DOPPLER — LOWER LIMB", "Grey-scale, colour and spectral Doppler of the deep and superficial veins.",
		"Common femoral vein: compressible, normal phasic flow.\nFemoral vein: compressible, no thrombus.\nPopliteal vein: compressible, no thrombus.\nCalf veins: patent.\n"
		"Saphenofemoral junction: competent.\nGreat saphenous vein: no reflux.", "No evidence of deep vein thrombosis.", "", []),
]


def ensure_catalogue():
	for t in T:
		name, modality, proc, title, technique, findings, impression, rec, meas = t
		if frappe.db.exists("Imaging Report Template", name):
			continue
		frappe.get_doc({"doctype": "Imaging Report Template", "template_name": name, "modality": modality, "report_title": title, "technique": technique,
			"findings": findings, "impression": impression, "recommendations": rec, "is_active": 1,
			"measurements": [{"label": a, "value": b, "unit": c, "reference": d} for a, b, c, d in meas]}).insert(ignore_permissions=True)
	for i, row in enumerate(P):
		name, code, modality, cat, region, price, mins, tat, prep, walk, consent, female, kind, desc = row[:14]
		if frappe.db.exists("Imaging Procedure", name):
			continue
		frappe.get_doc({"doctype": "Imaging Procedure", "procedure_name": name, "code": code, "modality": modality, "category": cat, "body_region": region, "price": price,
			"duration_min": mins, "tat_hours": tat, "prep_group": prep, "walk_in": walk, "needs_consent": consent, "female_only": female, "report_kind": kind,
			"description": desc, "preparation": row[14] if len(row) > 14 else None, "sort_order": (i + 1) * 10, "is_active": 1, "show_on_website": 1}).insert(ignore_permissions=True)
	# templates ↔ procedures
	for t in T:
		if t[2] and frappe.db.exists("Imaging Procedure", t[2]):
			frappe.db.set_value("Imaging Report Template", t[0], "procedure", t[2], update_modified=False)
			if not frappe.db.get_value("Imaging Procedure", t[2], "default_template"):
				frappe.db.set_value("Imaging Procedure", t[2], "default_template", t[0], update_modified=False)
	generic = {XR: "Normal X-ray (bones / joints)", US: None, DP: None}
	for p in frappe.get_all("Imaging Procedure", filters={"default_template": ["is", "not set"], "modality": XR, "category": "X-Ray"}, pluck="name"):
		frappe.db.set_value("Imaging Procedure", p, "default_template", generic[XR], update_modified=False)
	for p in frappe.get_all("Imaging Procedure", filters={"default_template": ["is", "not set"], "report_kind": "Obstetric"}, pluck="name"):
		frappe.db.set_value("Imaging Procedure", p, "default_template", "Obstetric US - 2nd trimester", update_modified=False)
