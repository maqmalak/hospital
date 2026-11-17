"""Hospital letterhead for server-rendered prints (D-79).

The same design as the app's printed pages (`frontend/src/lib/letterhead.ts`): horizontal logo top-left, address and
landline top-right, teal → red rule, teal wave footer with a red accent. Table-based so wkhtmltopdf renders it.
Used by the lab report PDF and by the Frappe "Letter Head" record that ERPNext documents (invoices, purchase orders,
payment entries, desk prints) print with.
"""

import base64
import functools
import os

import frappe
from frappe.utils import escape_html as esc

LETTER_HEAD = "Lyallpur Medical Complex"
TEAL, RED, NAVY = "#2B6E85", "#E5322F", "#0C2431"


@functools.lru_cache(maxsize=4)
def _img_uri(fname):
	path = os.path.join(frappe.get_app_path("hospital_vvs"), "public", "images", fname)
	with open(path, "rb") as f:
		return "data:image/png;base64," + base64.b64encode(f.read()).decode()


def logo_uri():
	return _img_uri("lyallpur-lockup.png")


def mark_uri():
	return _img_uri("lyallpur-mark.png")


def clinic_block(branch=None):
	"""Name, Urdu name, address and landline: the branch's address / phone when set, else Clinic Settings."""
	s = frappe.get_cached_doc("Clinic Settings")
	b = frappe.db.get_value("Branch", branch, ["hv_address", "hv_phone"], as_dict=True) if branch else None
	b = b or {}
	return {"name": s.clinic_name, "name_ur": s.clinic_name_ur, "address": b.get("hv_address") or s.address, "phone": b.get("hv_phone") or s.phone}


def header_html(c=None, height_mm=16):
	c = c or clinic_block()
	lines = []
	if c.get("name_ur"):
		lines.append(f"<div style=\"font-family:'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',serif;direction:rtl;font-size:13px;color:{TEAL}\">{esc(c['name_ur'])}</div>")
	if c.get("address"):
		lines.append(f"<div><span style='color:{RED}'>&#9679;</span> {esc(c['address'])}</div>")
	if c.get("phone"):
		lines.append(f"<div style='font-weight:700;color:{NAVY};font-size:11px'><span style='color:{RED}'>&#9742;</span> {esc(c['phone'])}</div>")
	return f"""<table style="width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif"><tr>
	<td style="vertical-align:middle;padding:0"><img src="{logo_uri()}" style="height:{height_mm}mm;width:auto" alt="{esc(c.get('name') or '')}"></td>
	<td style="vertical-align:middle;text-align:right;font-size:9.5px;line-height:1.6;color:#334155;padding:0">{''.join(lines)}</td></tr></table>
	<div style="position:relative;height:4px;background:{TEAL};margin:3mm 0 3.5mm;border-radius:2px;overflow:hidden">
	<div style="position:absolute;right:0;top:0;width:22%;height:4px;background:{RED};border-left:4px solid #fff"></div></div>"""


def footer_html(c=None, right=""):
	c = c or clinic_block()
	phone = f" &nbsp;&middot;&nbsp; {esc(c['phone'])}" if c.get("phone") else ""
	return f"""<table style="width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:8.5px;color:#fff"><tr>
	<td style="background:{TEAL};padding:2.2mm 4mm;border-top:1mm solid {RED}"><b style="letter-spacing:.06em">{esc((c.get('name') or '').upper())}</b>{phone}
	{(' &nbsp;&middot;&nbsp; ' + esc(c['address'])) if c.get('address') else ''}</td>
	{f'<td style="background:{NAVY};padding:2.2mm 4mm;text-align:right;white-space:nowrap;border-top:1mm solid {RED}">{right}</td>' if right else ''}</tr></table>"""


def ensure_letter_head():
	"""Create / refresh the default Frappe Letter Head from Clinic Settings (idempotent; run after migrate and on settings save)."""
	if not frappe.db.exists("DocType", "Letter Head"):
		return
	c = clinic_block()
	doc = frappe.get_doc("Letter Head", LETTER_HEAD) if frappe.db.exists("Letter Head", LETTER_HEAD) else frappe.new_doc("Letter Head")
	if doc.is_new():
		doc.letter_head_name = LETTER_HEAD
	doc.source = "HTML"
	doc.content = header_html(c)
	if doc.meta.has_field("footer_source"):
		doc.footer_source = "HTML"
	doc.footer = footer_html(c)
	doc.is_default = 1
	doc.disabled = 0
	doc.flags.ignore_permissions = True
	doc.save()
