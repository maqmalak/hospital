"""WhatsApp templates in Meta's format, ready to submit for approval (Business Manager or the Graph API
POST /{waba_id}/message_templates). Built from the Message Templates (English + Urdu), D-47.

Meta rules applied: lowercase names; {{1}}, {{2}} … in parameter order; a body may not start or end with a variable (a greeting /
closing is added); an example value for every variable; OTP uses Meta's fixed AUTHENTICATION format (copy-code button).
"""

import json
import re

import frappe

PREFIX = "vvs_"
CATEGORY = {"otp_code": "AUTHENTICATION", "visit_feedback": "MARKETING"}  # all others: UTILITY (transaction updates)
SAMPLES = {"first_name": "Ali", "clinic": "VVS Hospital", "ref": "APT-2026-00123", "doctor": "Dr. Ayesha Siddiqui", "date": "12-11-2026", "time": "10:30 AM",
	"clinic_phone": "042-35000000", "link": "https://hospital.example.pk/hms/r/Ab12Cd", "code": "482913", "tat": "6 hours", "amount": "Rs 1,500",
	"reason": "doctor on leave", "test": "Complete Blood Count", "token": "P-014", "counter": "Handover 3"}
GREET = {"en": "Hello ", "ur": "محترم "}
CLOSE = {"en": " Thank you.", "ur": " شکریہ۔"}


def body(text, params, lang):
	order = [p.strip() for p in (params or "").split(",") if p.strip()]
	out = text
	for i, key in enumerate(order, 1):
		out = out.replace("{" + key + "}", "{{" + str(i) + "}}")
	out = out.strip()
	if out.startswith("{{"):
		out = GREET[lang] + out
	if re.search(r"\{\{\d+\}\}[\s.:،۔]*$", out):
		out = out.rstrip() + CLOSE[lang]
	return out, [SAMPLES.get(k, k.replace("_", " ")) for k in order]


def build():
	out = []
	for t in frappe.get_all("Message Template", fields=["event", "enabled", "wa_params", "sms_text_en", "sms_text_ur"], order_by="event"):
		cat = CATEGORY.get(t.event, "UTILITY")
		for lang, text in (("en", t.sms_text_en), ("ur", t.sms_text_ur)):
			if not text:
				continue
			name = PREFIX + t.event
			if cat == "AUTHENTICATION":
				comps = [{"type": "BODY", "add_security_recommendation": True}, {"type": "FOOTER", "code_expiration_minutes": 10},
					{"type": "BUTTONS", "buttons": [{"type": "OTP", "otp_type": "COPY_CODE", "text": "Copy code" if lang == "en" else "کوڈ کاپی کریں"}]}]
				preview = "<Meta fixed text> {{1}} is your verification code. For your security, do not share this code."
			else:
				b, ex = body(text, t.wa_params, lang)
				comps = [{"type": "BODY", "text": b, **({"example": {"body_text": [ex]}} if ex else {})}]
				preview = b
			out.append({"name": name, "language": lang, "category": cat, "components": comps, "_event": t.event, "_enabled": t.enabled, "_preview": preview})
	return out


def write_files(folder=None):
	"""bench --site hospital execute hospital_vvs.messaging.meta.write_files → docs/whatsapp/ (JSON for the API + a table to review)."""
	import os

	folder = folder or os.path.join(frappe.get_app_path("hospital_vvs"), "..", "docs", "whatsapp")
	os.makedirs(folder, exist_ok=True)
	rows = build()
	api = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
	with open(os.path.join(folder, "meta-templates.json"), "w") as fh:
		fh.write(json.dumps(api, indent=1, ensure_ascii=False) + "\n")
	lines = ["# WhatsApp templates for Meta approval", "", "Generated from Message Templates (`bench --site hospital execute hospital_vvs.messaging.meta.write_files`).",
		"Submit each row in WhatsApp Manager → Message templates (or POST `meta-templates.json` items to `/{waba_id}/message_templates`).",
		"After approval, the Message Template's *WhatsApp Template (English / Urdu)* must hold the same name; the language code picks the version.", "",
		"| Name | Lang | Category | Body (variables in order) |", "|---|---|---|---|"]
	for r in rows:
		lines.append(f"| `{r['name']}` | {r['language']} | {r['category']} | {r['_preview'].replace('|', '/')} |")
	lines += ["", "Notes: *AUTHENTICATION* uses Meta's fixed OTP text with a copy-code button. *visit_feedback* is filed as MARKETING (Meta may also accept it as UTILITY).",
		"No medical details are in any template (spec 01)."]
	with open(os.path.join(folder, "TEMPLATES.md"), "w") as fh:
		fh.write("\n".join(lines) + "\n")
	for r in rows:  # point the Message Templates at the names being submitted
		frappe.db.set_value("Message Template", r["_event"], "wa_template_en" if r["language"] == "en" else "wa_template_ur", r["name"], update_modified=False)
	frappe.db.commit()
	return {"templates": len(rows), "folder": os.path.abspath(folder)}
