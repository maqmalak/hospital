"""WhatsApp webhook (signature verified), inbox for handed-off chats, message log and resend."""

import hashlib
import hmac
import json

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from hospital_vvs import roles as R
from hospital_vvs.services import messaging as svc
from hospital_vvs.utils import require_roles

STATUS_MAP = {"sent": "Sent", "delivered": "Delivered", "read": "Read", "failed": "Failed"}


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def whatsapp_webhook():
	"""Meta webhook: GET = verification handshake; POST = statuses and inbound messages, processed in a job."""
	req = frappe.request
	if req.method == "GET":
		args = frappe.local.form_dict
		if args.get("hub.mode") == "subscribe" and args.get("hub.verify_token") and hmac.compare_digest(
			str(args.get("hub.verify_token")), str(frappe.conf.get("whatsapp_verify_token") or "")):
			frappe.response["type"] = "txt"
			frappe.response["message"] = args.get("hub.challenge")
			return
		frappe.throw(_("Verification failed"), frappe.PermissionError)
	body = req.get_data() or b""
	secret = frappe.conf.get("whatsapp_app_secret")
	sig = (req.headers.get("X-Hub-Signature-256") or "").removeprefix("sha256=")
	if not secret or not hmac.compare_digest(hmac.new(secret.encode(), body, hashlib.sha256).hexdigest(), sig):
		frappe.throw(_("Invalid signature"), frappe.PermissionError)
	frappe.enqueue("hospital_vvs.api.messaging.process_webhook", payload=body.decode(), queue="short", enqueue_after_commit=True)
	return "ok"


def process_webhook(payload):
	from hospital_vvs.messaging.whatsapp_bot import handle_inbound

	data = json.loads(payload)
	for entry in data.get("entry") or []:
		for change in entry.get("changes") or []:
			value = change.get("value") or {}
			for st in value.get("statuses") or []:
				name = frappe.db.get_value("Message Log", {"provider_message_id": st.get("id")})
				status = STATUS_MAP.get(st.get("status"))
				if name and status:
					upd = {"status": status}
					if status == "Delivered":
						upd["delivered_at"] = now_datetime()
					if status == "Read":
						upd["read_at"] = now_datetime()
					if status == "Failed":
						upd["error"] = json.dumps(st.get("errors"))[:500]
					frappe.db.set_value("Message Log", name, upd)
			for msg in value.get("messages") or []:
				phone = "+" + msg.get("from", "").lstrip("+")
				text = reply_id = media = None
				t = msg.get("type")
				if t == "text":
					text = (msg.get("text") or {}).get("body")
				elif t == "interactive":
					it = msg.get("interactive") or {}
					rep = it.get("button_reply") or it.get("list_reply") or {}
					reply_id, text = rep.get("id"), rep.get("title")
				elif t == "button":
					text = (msg.get("button") or {}).get("text")
				elif t in ("image", "document"):
					media = f"wa-media:{(msg.get(t) or {}).get('id')}"
				handle_inbound(phone, text=text, reply_id=reply_id, media=media, provider_id=msg.get("id"))
				frappe.db.commit()


@frappe.whitelist(methods=["POST"])
def simulate_inbound(phone, text=None, reply_id=None, media=None):
	"""Test mode only: play the patient's side of a WhatsApp chat (Admin / Receptionist)."""
	require_roles(R.RECEPTIONIST)
	if svc.live():
		frappe.throw(_("Simulation is only available in test mode."))
	from hospital_vvs.messaging.whatsapp_bot import handle_inbound

	frappe.flags.hv_sync_messages = True
	handle_inbound(phone, text=text, reply_id=reply_id, media=media)
	return conversation(phone)


@frappe.whitelist()
def inbox():
	require_roles(R.RECEPTIONIST)
	return frappe.get_all("WhatsApp Conversation", fields=["name", "phone", "language", "current_step", "handed_off", "unread",
		"last_inbound_at", "patients", "assigned_to"], order_by="handed_off desc, last_inbound_at desc", limit=100)


@frappe.whitelist()
def conversation(phone):
	require_roles(R.RECEPTIONIST)
	conv = frappe.db.get_value("WhatsApp Conversation", {"phone": phone}, ["name", "phone", "language", "current_step", "handed_off",
		"last_inbound_at", "patients", "data"], as_dict=True)
	msgs = frappe.get_all("Message Log", filters={"phone": phone, "channel": "WhatsApp"}, fields=["name", "direction", "body", "status",
		"event", "creation", "media_url", "context", "sent_by"], order_by="creation asc", limit=300)
	for m in msgs:
		ctx = json.loads(m.pop("context") or "{}") if m.get("context") else {}
		m["options"] = [o for o in ((ctx.get("interactive") or {}).get("action") or {}).get("buttons", [])] or [
			r for s in ((ctx.get("interactive") or {}).get("action") or {}).get("sections", []) for r in s.get("rows", [])]
	window_open = bool(conv and conv.last_inbound_at and (now_datetime() - conv.last_inbound_at).total_seconds() < 86400)
	return {"conversation": conv, "messages": msgs, "window_open": window_open}


@frappe.whitelist(methods=["POST"])
def reply(phone, text):
	require_roles(R.RECEPTIONIST)
	data = conversation(phone)
	if not data["window_open"]:
		frappe.throw(_("The 24-hour reply window is closed. Only approved templates can be sent now."))
	conv = data["conversation"]
	frappe.db.set_value("WhatsApp Conversation", conv.name, {"unread": 0, "assigned_to": frappe.session.user})
	svc.send_free_text(phone, text, conversation=conv.name)
	return conversation(phone)


@frappe.whitelist(methods=["POST"])
def close_handoff(phone):
	require_roles(R.RECEPTIONIST)
	name = frappe.db.get_value("WhatsApp Conversation", {"phone": phone})
	frappe.db.set_value("WhatsApp Conversation", name, {"handed_off": 0, "unread": 0, "current_step": "done"})
	return True


@frappe.whitelist()
def log(status=None, channel=None, event=None, phone=None, limit=100, start=0):
	require_roles(R.RECEPTIONIST, R.LAB_USER)
	filters = {"direction": "Out"}
	for k, v in (("status", status), ("channel", channel), ("event", event)):
		if v:
			filters[k] = v
	if phone:
		filters["phone"] = ["like", f"%{phone[-10:]}%"]
	rows = frappe.get_all("Message Log", filters=filters, fields=["name", "patient", "phone", "channel", "event", "language", "status",
		"retry_count", "error", "reference_doctype", "reference_name", "sent_at", "creation", "body"], order_by="creation desc",
		limit=cint(limit) or 100, start=cint(start))
	stats = frappe.db.sql("""select status, channel, count(*) n from `tabMessage Log` where direction='Out'
		and creation >= now() - interval 7 day group by status, channel""", as_dict=True)
	return {"rows": rows, "stats": stats}


@frappe.whitelist(methods=["POST"])
def resend(name):
	require_roles(R.RECEPTIONIST, R.LAB_USER)
	return svc.resend(name)
