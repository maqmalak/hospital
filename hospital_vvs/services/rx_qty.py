"""Prescription quantity from dose × frequency × duration (QA 2026-11-10, D-51).

  1+0+1 / 1-0-1 / ½+0+½   pattern: doses per day (each number = how many taken at that time)
  OD BD TDS/TID QID HS     1 2 3 4 1 times a day · SOS/PRN as needed (once a day) · stat once · weekly · q8h / every 8 hours
  5 days · 1 week · 2 weeks · 1 month · 5d · x5 · "continue" (30 days)
Tablets / capsules / sachets / injections → units; syrups / suspensions → bottles (default bottle in Clinic Settings, 120 ml);
drops, creams, ointments, gels, inhalers, sprays → 1 pack. Returns None when nothing sensible can be worked out.
"""

import math
import re

import frappe
from frappe.utils import cint, flt

FREQ = {"od": 1, "qd": 1, "once": 1, "daily": 1, "hs": 1, "bd": 2, "bid": 2, "twice": 2, "tds": 3, "tid": 3, "thrice": 3, "qid": 4, "qds": 4,
	"sos": 1, "prn": 1, "stat": 1, "weekly": 1 / 7, "alternate": 0.5, "eod": 0.5}
LIQUID = ("syrup", "suspension", "elixir", "solution", "liquid", "mixture")
PACK = ("drop", "cream", "ointment", "gel", "inhaler", "spray", "lotion", "shampoo", "patch", "powder")


def _num(s):
	s = str(s or "").strip().replace("½", "0.5").replace("¼", "0.25").replace("¾", "0.75")
	m = re.match(r"^\s*(\d+)\s*/\s*(\d+)", s)
	if m:
		return flt(m.group(1)) / max(flt(m.group(2)), 1)
	m = re.match(r"^\s*(\d+(?:\.\d+)?)", s)
	return flt(m.group(1)) if m else None


def per_day(freq):
	"""→ (takes per day, amount pattern sum or None)."""
	f = str(freq or "").strip().lower()
	if not f:
		return None, None
	if re.match(r"^[\d.½¼¾/]+(\s*[+\-]\s*[\d.½¼¾/]+)+$", f):
		parts = [_num(x) or 0 for x in re.split(r"[+\-]", f)]
		return sum(1 for x in parts if x), sum(parts)
	m = re.search(r"(?:q|every)\s*(\d+)\s*(?:h|hr|hrs|hour|hours)", f)
	if m and cint(m.group(1)):
		return 24 / cint(m.group(1)), None
	m = re.search(r"(\d+)\s*(?:times|x)\s*(?:a|per)?\s*day", f)
	if m:
		return cint(m.group(1)), None
	for k, v in FREQ.items():
		if re.search(rf"\b{k}\b", f):
			return v, None
	return None, None


def days(duration):
	d = str(duration or "").strip().lower()
	if not d:
		return None
	if any(w in d for w in ("continue", "long term", "ongoing", "lifelong")):
		return 30
	n = _num(re.sub(r"^[x×]\s*", "", d))
	if n is None:
		return None
	if re.search(r"\bmonth|\bm\b|mo\b", d):
		return n * 30
	if re.search(r"week|\bw\b|wk", d):
		return n * 7
	return n


def calc(dose, frequency, duration, item=None, form=None, bottle_ml=None):
	form = (form or (frappe.get_cached_value("Item", item, "hv_dosage_form") if item else "") or "").lower()
	name = (frappe.get_cached_value("Item", item, "item_name") or "").lower() if item else ""
	takes, pattern_sum = per_day(frequency)
	n_days = days(duration)
	if any(w in form or w in name for w in PACK):
		return 1
	if not takes or not n_days:
		return None
	dose_txt = str(dose or "").lower()
	dose_n = _num(dose) or 1
	if any(w in form or w in name for w in LIQUID) or "ml" in dose_txt:
		ml_each = dose_n if "ml" in dose_txt else 5 * dose_n  # "1" spoon = 5 ml
		per = pattern_sum if pattern_sum is not None else takes
		total_ml = ml_each * per * n_days
		bottle = flt(bottle_ml or frappe.db.get_single_value("Clinic Settings", "default_bottle_ml") or 120)
		return max(math.ceil(total_ml / bottle), 1)
	if pattern_sum is not None:
		# a 0/1 pattern counts times a day, so the dose says how much each time ("½" with 1+0+1 = 1 tablet a day);
		# a pattern with other numbers (2+0+2, ½+0+½) already gives the amount each time
		per = takes * dose_n if pattern_sum == takes else pattern_sum
	else:
		per = takes * dose_n
	return max(math.ceil(per * n_days - 1e-9), 1)
