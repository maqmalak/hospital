// After `vite build`: copy the built index.html to hospital_vvs/www/hms.html so Frappe serves the SPA at /hms
// (hooks.py → website_route_rules sends /hms/* there too). The CSRF token is filled in by Jinja on each request.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const built = resolve(here, "../../hospital_vvs/public/frontend/index.html");
const target = resolve(here, "../../hospital_vvs/www/hms.html");
const html = readFileSync(built, "utf8").replace(
  "<!-- frappe-boot -->",
  "<script>window.csrf_token = '{{ frappe.session.csrf_token }}'; window.hv_site = '{{ hv_site }}';</script>",
);
writeFileSync(target, html);
console.log("wrote", target);
