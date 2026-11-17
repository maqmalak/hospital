"""/robots.txt — Frappe's own (Website Settings → Robots.txt, or site config) plus the website's sitemaps (D-81).
Sitemap URLs are built from the site's own address, so they stay right when the domain changes at go-live."""

import frappe
from frappe.utils import get_url

base_template_path = "www/robots.txt"
no_cache = 1


def get_context(context):
	own = (frappe.db.get_single_value("Website Settings", "robots_txt")
		or (frappe.local.conf.robots_txt and frappe.read_file(frappe.local.conf.robots_txt)) or "").strip()
	lines = [own] if own else ["User-agent: *", "Disallow: /app", "Disallow: /hms/login"]
	for path in ("/hms_sitemap.xml", "/sitemap.xml"):
		line = f"Sitemap: {get_url(path)}"
		if line not in own:
			lines.append(line)
	return {"robots_txt": "\n".join(lines)}
