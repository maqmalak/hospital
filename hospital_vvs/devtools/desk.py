"""Frappe Desk entry for VVS Hospital: launcher icon, workspace and workspace sidebar (Frappe v16).

Writes standard JSON files that `bench migrate` imports:
  hospital_vvs/desktop_icon/vvs_hospital.json        – the app tile on /desk (desk workspace)
  hospital_vvs/desktop_icon/vvsdesk.json             – the VVSDesk tile (opens the React app at /hms)
  hospital_vvs/workspace_sidebar/vvs_hospital.json   – the left menu inside the app
  hospital_vvs/hospital_vvs/workspace/vvs_hospital/  – the home page (shortcuts to the React screens + DocType cards)

bench --site hospital execute hospital_vvs.devtools.desk.run   (writes the files and loads them into the site)
"""

import json
import os

import frappe

NAME = "VVS Hospital"
STAMP = "2026-11-10 01:00:00.000000"
LOGO = "/assets/hospital_vvs/images/logo.svg"
LOGO_APP = "/assets/hospital_vvs/images/vvsdesk.svg"

# React screens (served at /hms), shown first
APPS = [
	("Control board", "/hms/pw-home", "home", "Blue"),
	("Reception counter", "/hms/counter", "monitor", "Green"),
	("Pharmacy POS", "/hms/medicine_invoice", "shopping-cart", "Cyan"),
	("Physician queue", "/hms/physician-queue", "users", "Purple"),
	("Lab orders", "/hms/lab/orders", "activity", "Orange"),
	("Admissions (IPD)", "/hms/ipd", "bed", "Pink"),
	("Emergency", "/hms/er", "alert-triangle", "Red"),
	("Cashier shift", "/hms/cash/shift", "wallet", "Yellow"),
	("Online visits", "/hms/ov-staff", "video", "Blue"),
	("Doctor share", "/hms/doctor-share", "wallet", "Green"),
	("Nursing stations", "/hms/ns", "bell", "Cyan"),
	("Patient feedback", "/hms/feedback", "star", "Pink"),
	("Reports", "/hms/reports", "bar-chart", "Grey"),
]

# Desk lists, by area
SECTIONS = [
	("Patients & OPD", "user", ["Patient", "Appointment", "OPD Slip", "Prescription", "Queue Entry", "Doctor", "Doctor Schedule", "Household"]),
	("Pharmacy", "package", ["POS Profile", "POS Settings", "Dispense Ticket", "Sales Invoice", "Item", "Batch", "Controlled Drug Register", "Cycle Count", "Medicine Category", "Pharma Company",
		"Display Device"]),
	("Laboratory", "activity", ["Lab Sample", "Lab Result", "Test Invoice", "Lab Test Template", "Outsourced Dispatch", "Critical Value Log"]),
	("IPD & Emergency", "bed", ["Bed Allotment", "Hospital Bed", "Ward", "IPD Charge", "IPD Medication Order", "MAR Entry", "Discharge Summary", "ER Visit",
		"Insurance Pre Auth", "Service Package"]),
	("Cash & Counters", "wallet", ["Counter", "POS Profile", "POS Opening Entry", "Shift Closing", "Cash Movement", "Counter Receipt", "Discount Authorization",
		"Payment Entry"]),
	("Accounts & Doctor Share", "book-open", ["Doctor Share Rule", "Doctor Share Ledger", "Doctor Share Payout", "Supplier", "Journal Entry", "Payment Entry",
		"Discount Authorization"]),
	("Patient Comms & Feedback", "message-circle", ["Nursing Station", "Patient Comms Profile", "Comms Message", "Station Broadcast", "Patient Feedback"]),
	("Online & Messages", "message-circle", ["Online Visit Request", "Message Log", "Message Template", "WhatsApp Conversation"]),
	("Setup", "settings", ["Clinic Settings", "Branch", "User Permission", "Medical Department", "Specialization", "Generic Name", "Drug Class", "Drug Interaction",
		"Discount Rule", "Diet Type", "Procedure Type", "Clinical Access Log"]),
]


def _write(path, doc):
	os.makedirs(os.path.dirname(path), exist_ok=True)
	with open(path, "w") as f:
		f.write(json.dumps(doc, indent=1, sort_keys=True, ensure_ascii=False) + "\n")


def _base(doctype, **kw):
	# "modified" = now, so bench migrate re-imports the files after every change
	return {"doctype": doctype, "name": NAME, "creation": STAMP, "modified": str(frappe.utils.now_datetime()), "modified_by": "Administrator", "owner": "Administrator", "docstatus": 0, "idx": 0, **kw}


def _existing(doctypes):
	"""Only DocTypes that have their own desk page: child tables (edited inside their parent) have none."""
	return [d for d in doctypes if frappe.db.exists("DocType", d) and not frappe.db.get_value("DocType", d, "istable")]


def sidebar():
	items = [{"type": "Link", "label": "Home", "icon": "home", "link_type": "Workspace", "link_to": NAME},
		{"type": "Section Break", "label": "Open screens"}]
	items += [{"type": "Link", "label": label, "icon": icon, "link_type": "URL", "url": url} for label, url, icon, _c in APPS]
	for title, icon, dts in SECTIONS:
		items.append({"type": "Section Break", "label": title})
		items += [{"type": "Link", "label": d, "icon": icon, "link_type": "DocType", "link_to": d} for d in _existing(dts)]
	for i, it in enumerate(items, 1):
		it.update({"idx": i, "child": 0, "collapsible": 1, "indent": 0, "keep_closed": 0, "show_arrow": 0})
	return _base("Workspace Sidebar", app="hospital_vvs", title=NAME, header_icon="heart", items=items)


def workspace():
	content = [{"id": "vvs-h1", "type": "header", "data": {"text": f'<span class="h4"><b>{NAME}</b></span>', "col": 12}}]
	content += [{"id": f"vvs-s{i}", "type": "shortcut", "data": {"shortcut_name": label, "col": 3}} for i, (label, *_r) in enumerate(APPS)]
	content.append({"id": "vvs-sp", "type": "spacer", "data": {"col": 12}})
	content.append({"id": "vvs-h2", "type": "header", "data": {"text": '<span class="h4"><b>Records</b></span>', "col": 12}})
	links = []
	for i, (title, _icon, dts) in enumerate(SECTIONS):
		dts = _existing(dts)
		content.append({"id": f"vvs-c{i}", "type": "card", "data": {"card_name": title, "col": 4}})
		links.append({"type": "Card Break", "label": title, "link_count": len(dts), "hidden": 0, "is_query_report": 0, "onboard": 0})
		links += [{"type": "Link", "label": d, "link_to": d, "link_type": "DocType", "link_count": 0, "hidden": 0, "is_query_report": 0, "onboard": 0, "dependencies": ""} for d in dts]
	shortcuts = [{"label": label, "type": "URL", "url": url, "color": color, "doc_view": ""} for label, url, _i, color in APPS]
	return _base("Workspace", app="hospital_vvs", module="Hospital VVS", label=NAME, title=NAME, icon="heart", public=1, is_hidden=0, hide_custom=0, for_user="",
		parent_page="", sequence_id=25.0, type="Workspace", restrict_to_domain="", roles=[], charts=[], number_cards=[], quick_lists=[], custom_blocks=[],
		content=json.dumps(content), links=links, shortcuts=shortcuts)


def icon():
	return _base("Desktop Icon", app="hospital_vvs", label=NAME, icon_type="Link", link_type="Workspace Sidebar", link_to=NAME, sidebar=NAME, link=None,
		logo_url=LOGO, hidden=0, standard=1, roles=[], idx=15)


def react_icon():
	"""Second tile: opens the React app (VVSDesk, /hms) directly, like the Frappe CRM tile."""
	d = _base("Desktop Icon", app="hospital_vvs", label="VVSDesk", icon_type="App", link_type="External", link="/hms/pw-home", link_to=None, logo_url=LOGO_APP,
		hidden=0, standard=1, roles=[], idx=16)
	d["name"] = "VVSDesk"
	return d


def run():
	app = frappe.get_app_path("hospital_vvs")
	_write(os.path.join(app, "desktop_icon", "vvs_hospital.json"), icon())
	_write(os.path.join(app, "desktop_icon", "vvsdesk.json"), react_icon())
	_write(os.path.join(app, "workspace_sidebar", "vvs_hospital.json"), sidebar())
	_write(os.path.join(app, "hospital_vvs", "workspace", "vvs_hospital", "vvs_hospital.json"), workspace())
	# load them into this site now (migrate skips files it has already seen)
	from frappe.modules.import_file import import_file_by_path

	for rel in ("desktop_icon/vvs_hospital.json", "desktop_icon/vvsdesk.json", "workspace_sidebar/vvs_hospital.json", "hospital_vvs/workspace/vvs_hospital/vvs_hospital.json"):
		import_file_by_path(os.path.join(app, rel), force=True, ignore_version=True)
	frappe.db.commit()
	frappe.clear_cache()
	print("desk menu written and loaded")
