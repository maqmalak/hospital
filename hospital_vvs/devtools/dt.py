"""Compact DocType definitions → standard DocType JSON files.

Developer tool only. Each schema module lists DocTypes with `doctype(...)` and fields with `f(...)`;
`hospital_vvs.devtools.generate.run` writes <module>/doctype/<name>/<name>.json (and an empty controller if
there is none yet). `bench migrate` then syncs them like any hand-written DocType.
"""

import json
import os

import frappe

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAMP = "2026-11-06 10:00:00.000000"

# Permission letters: r read, w write, c create, d delete, s submit, x cancel, a amend, e export, p print,
# m email, R report, i import, S share
_PERM_KEYS = {
	"r": "read", "w": "write", "c": "create", "d": "delete", "s": "submit", "x": "cancel", "a": "amend",
	"e": "export", "p": "print", "m": "email", "R": "report", "i": "import", "S": "share",
}


_WORDS = {"mr": "MR", "cnic": "CNIC", "bmi": "BMI", "spo2": "SpO2", "rbs": "RBS", "bp": "BP", "icd": "ICD",
	"opd": "OPD", "ipd": "IPD", "er": "ER", "url": "URL", "id": "ID", "otp": "OTP", "ur": "(Urdu)", "ar": "(Arabic)",
	"en": "(English)", "pos": "POS", "sms": "SMS", "wa": "WhatsApp", "no": "No.", "qr": "QR", "tat": "TAT", "pin": "PIN"}


def f(fieldname, fieldtype="Data", options=None, label=None, **kw):
	"""One field. Shorthands: list=1 (in_list_view), filter=1 (in_standard_filter), ro=1 (read_only)."""
	d = {"fieldname": fieldname, "fieldtype": fieldtype}
	if label is None and fieldtype != "Column Break":
		label = " ".join(_WORDS.get(w, w.title()) for w in fieldname.split("_") if w)
	if label:
		d["label"] = label
	if options is not None:
		d["options"] = "\n".join(options) if isinstance(options, (list, tuple)) else options
	alias = {"list": "in_list_view", "filter": "in_standard_filter", "ro": "read_only", "global": "in_global_search"}
	for k, v in kw.items():
		d[alias.get(k, k)] = v
	return d


def sb(name, label=None, **kw):
	return f(name, "Section Break", label=label or "", **kw)


def cb(name):
	return {"fieldname": name, "fieldtype": "Column Break"}


def tab(name, label):
	return {"fieldname": name, "fieldtype": "Tab Break", "label": label}


def p(role, letters="rwcd", permlevel=0, **kw):
	d = {"role": role}
	for ch in letters:
		d[_PERM_KEYS[ch]] = 1
	if permlevel:
		d["permlevel"] = permlevel
	d.update(kw)
	return d


# Append-only logs and token rows: their rows are never edited, so no version history.
NO_TRACK = {"Clinical Access Log", "Patient Merge Log", "Bed Status Log", "Message Log", "Comms Message", "Station Broadcast",
	"WhatsApp Conversation", "Urdu Word", "Lab Report Access Token", "Time Slot"}


def doctype(name, module, fields, perms=None, **kw):
	"""kw: autoname, naming_rule, istable, issingle, is_submittable, track_changes, title_field, search_fields,
	sort_field, sort_order, description, quick_entry, allow_rename, image_field, show_title_field_in_link."""
	d = {
		"actions": [],
		"creation": STAMP,
		"doctype": "DocType",
		"engine": "InnoDB",
		"field_order": [x["fieldname"] for x in fields],
		"fields": fields,
		"index_web_pages_for_search": 0,
		"links": [],
		"modified": STAMP,
		"modified_by": "Administrator",
		"module": module,
		"name": name,
		"owner": "Administrator",
		"permissions": [] if kw.get("istable") else (perms or [p("System Manager")]),
		"row_format": "Dynamic",
		"sort_field": kw.pop("sort_field", "creation"),
		"sort_order": kw.pop("sort_order", "DESC"),
		"states": [],
	}
	if kw.get("istable"):
		d["editable_grid"] = 1
	elif not kw.get("issingle") and name not in NO_TRACK:
		kw.setdefault("track_changes", 1)  # Phase 7: every document keeps a version history, except append-only logs
	if kw.get("is_submittable"):
		names = {x["fieldname"] for x in fields}
		if "amended_from" not in names:
			fields.append(f("amended_from", "Link", name, "Amended From", no_copy=1, print_hide=1, ro=1, search_index=1))
			d["field_order"].append("amended_from")
	if "autoname" in kw and "naming_rule" not in kw:
		an = kw["autoname"]
		kw["naming_rule"] = (
			"Expression (old style)" if "." in an and not an.startswith(("field:", "hash", "format:"))
			else "By fieldname" if an.startswith("field:")
			else "Random" if an == "hash"
			else "Expression" if an.startswith("format:")
			else "Set by user" if an == "Prompt"
			else "By script"
		)
	d.update(kw)
	return d


def write(defn):
	module_folder = frappe.scrub(defn["module"])
	scrubbed = frappe.scrub(defn["name"])
	folder = os.path.join(APP_DIR, module_folder, "doctype", scrubbed)
	os.makedirs(folder, exist_ok=True)
	for init in (os.path.join(APP_DIR, module_folder, "__init__.py"),
		os.path.join(APP_DIR, module_folder, "doctype", "__init__.py"), os.path.join(folder, "__init__.py")):
		if not os.path.exists(init):
			open(init, "w").close()
	path = os.path.join(folder, scrubbed + ".json")
	old = {}
	if os.path.exists(path):
		with open(path) as fh:
			old = json.load(fh)
	# keep the modified stamp when nothing changed, so `bench migrate` skips unchanged DocTypes
	if old:
		probe = dict(defn, modified=old.get("modified", STAMP), creation=old.get("creation", STAMP))
		if probe == old:
			return False
		defn["creation"] = old.get("creation", STAMP)
		defn["modified"] = frappe.utils.now()
	with open(path, "w") as fh:
		fh.write(json.dumps(defn, indent=1, sort_keys=True, ensure_ascii=False) + "\n")
	ctrl = os.path.join(folder, scrubbed + ".py")
	if not os.path.exists(ctrl):
		cls = defn["name"].replace(" ", "").replace("-", "")
		with open(ctrl, "w") as fh:
			fh.write("from frappe.model.document import Document\n\n\nclass %s(Document):\n\tpass\n" % cls)
	return True
