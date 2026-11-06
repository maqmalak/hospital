"""Shared WhatsApp + SMS messaging layer (01-appointments-messaging.md).

send(event, ...) → Message Log (Queued) → delivered after commit in a background job → retries with backoff
(max_send_attempts) → SMS fallback when the template allows → Failed.

Providers sit behind adapters. Clinic Settings → Messaging → Message Mode:
  * "Test (no provider)": nothing leaves the server; the log is marked Sent with a fake provider id.
  * "Live": credentials from site_config.json only —
      whatsapp_access_token, whatsapp_phone_number_id, whatsapp_app_secret, whatsapp_verify_token,
      whatsapp_api_version (default v21.0), sms_gateway_url, sms_gateway_key, sms_gateway_sender.
Messages never carry medical data: only first name, clinic, reference, date/time and links.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, get_datetime, now_datetime

from hospital_vvs.utils import first_name, setting, settings

BACKOFF_MINUTES = [1, 5, 15]


# ------------------------------------------------------------------ adapters
class TestAdapter:
	name = "test"

	def send_template(self, phone, template, language, params):
		return "test-" + frappe.generate_hash(length=12)

	def send_text(self, phone, text):
		return "test-" + frappe.generate_hash(length=12)

	def send_interactive(self, phone, payload):
		return "test-" + frappe.generate_hash(length=12)

	def send_sms(self, phone, text):
		return "test-sms-" + frappe.generate_hash(length=10)


class WhatsAppCloudAdapter:
	"""Meta WhatsApp Business Cloud API. A local Business Solution Provider can replace this class."""

	name = "whatsapp_cloud"

	def __init__(self):
		conf = frappe.conf
		self.token = conf.get("whatsapp_access_token")
		self.phone_id = conf.get("whatsapp_phone_number_id")
		self.version = conf.get("whatsapp_api_version") or "v21.0"
		if not (self.token and self.phone_id):
			raise frappe.ValidationError("WhatsApp credentials are missing in site_config.json")

	def _post(self, body):
		import requests

		r = requests.post(f"https://graph.facebook.com/{self.version}/{self.phone_id}/messages", json=body, timeout=20,
			headers={"Authorization": f"Bearer {self.token}"})
		data = r.json() if r.content else {}
		if r.status_code >= 300:
			raise frappe.ValidationError((data.get("error") or {}).get("message") or f"HTTP {r.status_code}")
		return (data.get("messages") or [{}])[0].get("id")

	def send_template(self, phone, template, language, params):
		return self._post({"messaging_product": "whatsapp", "to": phone.lstrip("+"), "type": "template",
			"template": {"name": template, "language": {"code": "ur" if language == "ur" else "en"},
				"components": [{"type": "body", "parameters": [{"type": "text", "text": str(p)} for p in params]}]}})

	def send_text(self, phone, text):
		return self._post({"messaging_product": "whatsapp", "to": phone.lstrip("+"), "type": "text", "text": {"body": text}})

	def send_interactive(self, phone, payload):
		return self._post({"messaging_product": "whatsapp", "to": phone.lstrip("+"), "type": "interactive", "interactive": payload})


class HttpSmsAdapter:
	"""Generic HTTP SMS gateway (local provider chosen by the clinic). POST {to, text, sender, key}."""

	name = "sms_http"

	def send_sms(self, phone, text):
		import requests

		url = frappe.conf.get("sms_gateway_url")
		if not url:
			raise frappe.ValidationError("sms_gateway_url is missing in site_config.json")
		r = requests.post(url, timeout=20, data={"to": phone, "text": text, "sender": frappe.conf.get("sms_gateway_sender"),
			"key": frappe.conf.get("sms_gateway_key")})
		if r.status_code >= 300:
			raise frappe.ValidationError(f"SMS gateway HTTP {r.status_code}")
		return (r.text or "")[:120]


def live():
	return settings().message_mode == "Live" and not frappe.flags.in_test


def wa_adapter():
	return WhatsAppCloudAdapter() if live() else TestAdapter()


def sms_adapter():
	return HttpSmsAdapter() if live() else TestAdapter()


# ------------------------------------------------------------------ rules
def channel_enabled(channel):
	return cint(settings().get("enable_whatsapp" if channel == "WhatsApp" else "enable_sms"))


def has_consent(patient, channel):
	if not patient:
		return False
	field = "whatsapp_consent" if channel == "WhatsApp" else "sms_consent"
	return bool(frappe.db.get_value("Patient", patient, field))


def in_quiet_hours(at=None):
	s = settings()
	if not (s.quiet_hours_start and s.quiet_hours_end):
		return False
	t = (at or now_datetime()).time()
	start, end = get_datetime(f"2000-01-01 {s.quiet_hours_start}").time(), get_datetime(f"2000-01-01 {s.quiet_hours_end}").time()
	return (start <= t or t < end) if start > end else (start <= t < end)


def quiet_hours_end_after(now):
	end = get_datetime(f"{now.date()} {settings().quiet_hours_end}")
	return end if end > now else add_to_date(end, days=1)


def render(text, context):
	class Safe(dict):
		def __missing__(self, key):
			return ""
	return (text or "").format_map(Safe(context))


# ------------------------------------------------------------------ public API
def send(event, *, phone=None, patient=None, context=None, reference_doctype=None, reference_name=None,
	language=None, conversation=None, channel=None):
	"""Queue one message. Returns the Message Log name, or None when skipped (template off, no consent, …)."""
	tpl = frappe.db.get_value("Message Template", event, ["enabled", "marketing", "urgent", "fallback_to_sms"], as_dict=True)
	ctx = dict(context or {})
	ctx.setdefault("clinic", setting("sender_name") or setting("clinic_name"))
	if patient:
		pdoc = frappe.db.get_value("Patient", patient, ["patient_name", "phone", "preferred_language"], as_dict=True) or {}
		phone = phone or pdoc.get("phone")
		language = language or pdoc.get("preferred_language")
		ctx.setdefault("first_name", first_name(pdoc.get("patient_name")))
	language = "ur" if language == "ur" else "en"
	if not phone:
		return None
	reason = None
	if not tpl or not tpl.enabled:
		reason = "Template disabled"
	channel = channel or ("WhatsApp" if channel_enabled("WhatsApp") else "SMS")
	if not reason and not channel_enabled(channel):
		reason = f"{channel} disabled"
	if not reason and tpl.marketing and not conversation and not has_consent(patient, channel):
		if channel == "WhatsApp" and tpl.fallback_to_sms and channel_enabled("SMS") and has_consent(patient, "SMS"):
			channel = "SMS"
		else:
			reason = "No consent"
	now = now_datetime()
	log = frappe.get_doc({
		"doctype": "Message Log", "direction": "Out", "patient": patient, "phone": phone, "channel": channel, "event": event,
		"language": language, "status": "Skipped" if reason else "Queued", "error": reason,
		"reference_doctype": reference_doctype, "reference_name": reference_name, "context": json.dumps(ctx, default=str),
		"conversation": conversation, "sent_by": frappe.session.user,
		"next_attempt_at": quiet_hours_end_after(now) if (not reason and tpl and not tpl.urgent and in_quiet_hours(now)) else now,
	}).insert(ignore_permissions=True)
	if not reason and get_datetime(log.next_attempt_at) <= now:
		enqueue_delivery(log.name)
	return log.name


def enqueue_delivery(log_name):
	if frappe.flags.in_test or frappe.flags.hv_sync_messages:
		deliver(log_name)
	else:
		frappe.enqueue("hospital_vvs.services.messaging.deliver", log_name=log_name, queue="short",
			enqueue_after_commit=True, job_id=f"hv-msg-{log_name}", deduplicate=True)


def deliver(log_name):
	log = frappe.get_doc("Message Log", log_name)
	if log.status not in ("Queued",):
		return
	tpl = frappe.get_doc("Message Template", log.event) if log.event and frappe.db.exists("Message Template", log.event) else None
	ctx = json.loads(log.context or "{}")
	try:
		if log.channel == "WhatsApp":
			if log.body and not tpl:
				pid = wa_adapter().send_text(log.phone, log.body)
			else:
				name = tpl.wa_template_ur if log.language == "ur" else tpl.wa_template_en
				params = [ctx.get(k.strip(), "") for k in (tpl.wa_params or "").split(",") if k.strip()]
				pid = wa_adapter().send_template(log.phone, name, log.language, params)
				log.body = render(tpl.sms_text_ur if log.language == "ur" else tpl.sms_text_en, ctx)
		else:
			text = log.body or render(tpl.sms_text_ur if log.language == "ur" else tpl.sms_text_en, ctx)
			log.body = text
			pid = sms_adapter().send_sms(log.phone, text)
		log.provider_message_id = pid
		log.status = "Sent"
		log.sent_at = now_datetime()
		log.error = None
	except Exception as e:
		log.retry_count = cint(log.retry_count) + 1
		log.error = str(e)[:500]
		max_attempts = cint(setting("max_send_attempts")) or 3
		if log.retry_count < max_attempts:
			log.next_attempt_at = add_to_date(now_datetime(), minutes=BACKOFF_MINUTES[min(log.retry_count - 1, 2)])
		elif log.channel == "WhatsApp" and tpl and tpl.fallback_to_sms and channel_enabled("SMS"):
			log.status = "Failed"
			log.save(ignore_permissions=True)
			fb = frappe.copy_doc(log)
			fb.update({"channel": "SMS", "status": "Queued", "retry_count": 0, "error": f"Fallback from {log.name}",
				"provider_message_id": None, "next_attempt_at": now_datetime(), "body": None})
			fb.insert(ignore_permissions=True)
			enqueue_delivery(fb.name)
			return
		else:
			log.status = "Failed"
	log.save(ignore_permissions=True)
	frappe.publish_realtime("hv:message_status", {"name": log.name, "status": log.status,
		"reference_doctype": log.reference_doctype, "reference_name": log.reference_name}, after_commit=True)


def process_queue():
	"""Scheduler: deliver due Queued messages (retries and messages held for quiet hours)."""
	for name in frappe.get_all("Message Log", filters={"status": "Queued", "direction": "Out",
		"next_attempt_at": ["<=", now_datetime()]}, pluck="name", limit=200):
		deliver(name)


def resend(log_name):
	old = frappe.get_doc("Message Log", log_name)
	new = frappe.copy_doc(old)
	new.update({"status": "Queued", "retry_count": 0, "error": None, "provider_message_id": None, "sent_at": None,
		"delivered_at": None, "read_at": None, "next_attempt_at": now_datetime(), "sent_by": frappe.session.user})
	new.insert(ignore_permissions=True)
	enqueue_delivery(new.name)
	return new.name


def send_free_text(phone, text, conversation=None, patient=None):
	"""Reply inside the patient-started 24-hour window (bot replies, inbox replies)."""
	log = frappe.get_doc({"doctype": "Message Log", "direction": "Out", "phone": phone, "channel": "WhatsApp", "status": "Queued",
		"body": text, "conversation": conversation, "patient": patient, "language": "", "sent_by": frappe.session.user,
		"next_attempt_at": now_datetime()}).insert(ignore_permissions=True)
	enqueue_delivery(log.name)
	return log.name


def send_interactive(phone, payload, conversation=None, text_preview=None):
	"""Interactive buttons / lists. Logged with a plain-text preview of what the patient sees."""
	log = frappe.get_doc({"doctype": "Message Log", "direction": "Out", "phone": phone, "channel": "WhatsApp",
		"status": "Queued", "body": text_preview, "context": json.dumps({"interactive": payload}), "conversation": conversation,
		"sent_by": frappe.session.user}).insert(ignore_permissions=True)
	try:
		log.provider_message_id = wa_adapter().send_interactive(phone, payload)
		log.status, log.sent_at = "Sent", now_datetime()
	except Exception as e:
		log.status, log.error = "Failed", str(e)[:500]
	log.save(ignore_permissions=True)
	return log.name
