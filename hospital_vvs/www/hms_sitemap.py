"""/hms_sitemap.xml — sitemap of the public hospital website v2 (/hms/site, D-80).

Static pages are listed here; department and article slugs are read from the website's own content file
(frontend/src/modules/landing/v2/content.ts) so the sitemap never lists a page the site does not have;
doctor profiles come from the Doctor records the site shows.
Empty in mock mode — only filled once the site config key `hv_site_indexing` is set (see robots.py)."""

import os
import re

import frappe
from frappe.utils import get_url, nowdate

no_cache = 1
base_template_path = "www/hms_sitemap.xml"

PAGES = ["", "about", "departments", "services", "doctors", "rooms", "pharmacy", "map", "directions", "patients", "careers", "news", "contact", "radiology", "mri-ct", "nursery"]


def _slugs(block):
	"""Slugs in one exported array of content.ts (DEPARTMENTS / ARTICLES)."""
	path = frappe.get_app_path("hospital_vvs", "..", "frontend", "src", "modules", "landing", "v2", "content.ts")
	if not os.path.exists(path):
		return []
	src = open(path, encoding="utf-8").read()
	m = re.search(rf"export const {block}\b[^=]*=\s*\[(.*?)\n\];", src, re.S)
	return re.findall(r'slug:\s*"([a-z0-9-]+)"', m.group(1)) if m else []


def get_context(context):
	if not frappe.conf.get("hv_site_indexing"):
		return {"links": []}
	today = nowdate()
	routes = [f"/hms/site/{p}".rstrip("/") for p in PAGES] + ["/hms/book-appointment"]
	routes += [f"/hms/site/departments/{s}" for s in _slugs("DEPARTMENTS")]
	routes += [f"/hms/site/news/{s}" for s in _slugs("ARTICLES")]
	doctors = frappe.get_all("Doctor", filters={"is_active": 1, "doctor_type": ["!=", "External Referring"]}, pluck="name")
	routes += [f"/hms/site/doctors/{d.lower()}" for d in doctors]
	return {"links": [{"loc": get_url(r), "lastmod": today} for r in routes]}
