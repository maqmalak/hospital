"""Clinical safety alerts on prescription lines (02-opd.md): allergy, drug interactions, duplicate therapy, dose.

`check(patient, lines)` returns one result per line: {"alerts": [...], "blocking": bool}. Each alert is
{"type", "severity", "message"}. Blocking alerts (allergy, Major/Contraindicated interaction) need an override
reason before the prescription can be signed. The pharmacy review screen runs the same check.
"""

import re

import frappe
from frappe.utils import add_days, cint, flt, today

from hospital_vvs.utils import setting

BLOCKING_INTERACTIONS = ("Major", "Contraindicated")
SEVERITY_ORDER = {"Info": 0, "Minor": 1, "Moderate": 2, "Warning": 2, "Major": 3, "Contraindicated": 4, "Allergy": 5}


def item_drug_info(item_code):
	row = frappe.db.get_value("Item", item_code, ["item_name", "hv_generic", "hv_drug_class", "hv_max_daily_dose"], as_dict=True)
	return row or frappe._dict()


def patient_allergy_targets(patient):
	"""{generic: allergy name}, {drug class: allergy name} from the patient's allergies."""
	generics, classes = {}, {}
	for a in frappe.get_all("Patient Allergy", filters={"parent": patient, "parenttype": "Patient"}, pluck="allergy"):
		for g in frappe.get_all("Allergy Generic", filters={"parent": a}, pluck="generic"):
			generics[g] = a
		for c in frappe.get_all("Allergy Drug Class", filters={"parent": a}, pluck="drug_class"):
			classes[c] = a
	return generics, classes


def active_generics(patient, exclude_prescription=None):
	"""Generics the patient is already taking: long-term medicines and signed prescriptions in the last N days."""
	out = {}
	for row in frappe.get_all("Patient Long Term Medicine", filters={"parent": patient, "parenttype": "Patient"},
		fields=["item", "generic"]):
		g = row.generic or item_drug_info(row.item).hv_generic
		if g:
			out[g] = "long-term medicine"
	days = cint(setting("interaction_lookback_days")) or 30
	rx = frappe.get_all("Prescription", filters={"patient": patient, "docstatus": 1, "status": "Signed",
		"prescription_date": [">=", add_days(today(), -days)], "name": ["!=", exclude_prescription or ""]}, pluck="name")
	if rx:
		for row in frappe.get_all("Prescription Medicine", filters={"parent": ["in", rx]}, fields=["generic", "parent"]):
			if row.generic:
				out.setdefault(row.generic, f"prescription {row.parent}")
	return out


def interaction(g1, g2):
	if not g1 or not g2 or g1 == g2:
		return None
	return frappe.db.get_value("Drug Interaction", {"generic_a": g1, "generic_b": g2}, ["severity", "clinical_note"], as_dict=True) \
		or frappe.db.get_value("Drug Interaction", {"generic_a": g2, "generic_b": g1}, ["severity", "clinical_note"], as_dict=True)


def doses_per_day(frequency):
	"""'1+0+1' → 2, 'TDS' → 3, 'BD' → 2, 'OD' → 1, 'QID' → 4, '6 hourly' → 4."""
	f = (frequency or "").strip().upper()
	if re.fullmatch(r"[\d.]+(\s*\+\s*[\d.]+)+", f):
		return sum(flt(x) for x in f.split("+"))
	words = {"OD": 1, "HS": 1, "STAT": 1, "BD": 2, "BID": 2, "TDS": 3, "TID": 3, "QID": 4, "QDS": 4}
	if f in words:
		return words[f]
	m = re.match(r"(\d+)\s*(HOURLY|H)", f)
	if m and cint(m.group(1)):
		return 24 / cint(m.group(1))
	return None


def check(patient, lines, exclude_prescription=None):
	"""lines: list of dicts with item (and optionally dose, frequency). Returns a list aligned with lines."""
	allergy_generics, allergy_classes = patient_allergy_targets(patient) if patient else ({}, {})
	current = active_generics(patient, exclude_prescription) if patient else {}
	infos = [item_drug_info(l.get("item")) for l in lines]
	results = []
	for i, (line, info) in enumerate(zip(lines, infos)):
		alerts = []
		g, c = info.get("hv_generic"), info.get("hv_drug_class")
		if g and g in allergy_generics:
			alerts.append({"type": "Allergy", "severity": "Allergy",
				"message": f"Patient is allergic to {allergy_generics[g]} ({g})."})
		elif c and c in allergy_classes:
			alerts.append({"type": "Allergy", "severity": "Allergy",
				"message": f"Patient is allergic to {allergy_classes[c]} (drug class {c})."})
		for j, other in enumerate(infos):
			if j == i:
				continue
			og = other.get("hv_generic")
			hit = interaction(g, og)
			if hit:
				alerts.append({"type": "Interaction", "severity": hit.severity,
					"message": f"{g} + {og}: {hit.severity} interaction. {hit.clinical_note or ''}".strip()})
			if g and og == g and j < i:
				alerts.append({"type": "Duplicate therapy", "severity": "Warning", "message": f"{g} is prescribed twice."})
			elif c and other.get("hv_drug_class") == c and j < i and frappe.db.get_value("Drug Class", c, "duplicate_therapy"):
				alerts.append({"type": "Duplicate therapy", "severity": "Warning",
					"message": f"Two {c} drugs in one prescription."})
		for og, where in current.items():
			hit = interaction(g, og)
			if hit:
				alerts.append({"type": "Interaction", "severity": hit.severity,
					"message": f"{g} + {og} ({where}): {hit.severity} interaction. {hit.clinical_note or ''}".strip()})
		max_dose = flt(info.get("hv_max_daily_dose"))
		per_day = doses_per_day(line.get("frequency"))
		m = re.match(r"\d+(\.\d+)?", str(line.get("dose") or ""))
		dose = flt(m.group(0)) if m else 1
		if max_dose and per_day and dose * per_day > max_dose:
			alerts.append({"type": "Dose", "severity": "Warning",
				"message": f"{dose:g} × {per_day:g}/day exceeds the maximum daily dose ({max_dose:g})."})
		blocking = any(a["type"] == "Allergy" or a["severity"] in BLOCKING_INTERACTIONS for a in alerts)
		results.append({"alerts": alerts, "blocking": blocking})
	return results


def summarize(alerts):
	"""Highest-severity alert type/severity and the joined message, for the line's stored alert fields."""
	if not alerts:
		return None, None, None
	top = max(alerts, key=lambda a: SEVERITY_ORDER.get(a["severity"], 0))
	return top["type"], top["severity"], "\n".join(a["message"] for a in alerts)
