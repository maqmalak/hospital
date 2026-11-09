"""WhatsApp booking bot (01-appointments-messaging.md, workflow W2a).

Step-by-step interactive messages (reply buttons / list messages). Decision D-07: WhatsApp Flows need a verified
Meta account and Flow approval, so the bot uses interactive messages first; Flows can replace steps later.

Every step stores its options in the conversation, so a reply works as a button tap (reply id), the option number
("2") or the option title. Unknown replies re-send the options; "reception"/"agent" or two failed attempts hand the
chat to the WhatsApp inbox on /appointments. 30 minutes idle expires the chat and releases any held slot.
"""

import json
import re

import frappe
from frappe.utils import add_to_date, cint, flt, formatdate, get_datetime, getdate, now_datetime

from hospital_vvs.services import appointments as booking
from hospital_vvs.services import messaging
from hospital_vvs.utils import setting, hhmm

IDLE_MINUTES = 30
HANDOFF_WORDS = {"reception", "agent", "human", "staff", "استقبالیہ", "ریسپشن", "عملہ"}
RESTART_WORDS = {"hi", "hello", "salam", "assalam o alaikum", "aoa", "menu", "start", "appointment", "سلام", "اپوائنٹمنٹ", "مینو"}

T = {
	"en": {
		"welcome": "Welcome to {clinic}. Please choose your language.",
		"menu": "How can we help you?", "menu_btn": "Options",
		"book": "Book appointment", "mine": "My appointments", "lab": "Lab report status", "reception": "Talk to reception",
		"branch": "Choose a branch", "spec": "Choose a speciality", "doctor": "Choose a doctor", "date": "Choose a date",
		"slot": "Choose a time", "choose": "Choose", "no_slots": "No free times for this doctor in the next days. Please choose another doctor.",
		"patient": "Who is the appointment for?", "new": "Someone else (new)",
		"new_details": "Please send the patient's name, age and gender like this:\nAli Raza, 34, M",
		"bad_details": "Please send it like: Ali Raza, 34, M",
		"summary": "Please confirm:\n{patient}\n{doctor}\n{date} at {time}\nFee: Rs {fee}",
		"confirm": "Confirm", "change": "Change", "cancel": "Cancel",
		"payment": "How will you pay the fee?", "pay_clinic": "Pay at clinic", "pay_proof": "Send payment proof", "pay_online": "Pay online",
		"send_proof": "Please send a screenshot or photo of the payment.",
		"done": "Your appointment is booked.\nRef: {ref}\n{doctor}\n{date} at {time}\n{address}\nManage: {link}",
		"pending": "Your booking {ref} is received. We will confirm it shortly.\nManage: {link}",
		"taken": "Sorry, that time was just taken. Please choose another time.",
		"unknown": "Sorry, I didn't understand. Please choose one of the options.",
		"handoff": "Our reception team will reply here shortly.",
		"cancelled": "Booking cancelled. Send Hi to start again.",
		"none": "You have no upcoming appointments.", "upcoming": "Your upcoming appointments:\n{rows}",
		"lab_status": "Lab report status will be available here soon. Our team will message you when your report is ready.",
		"expired": "This chat has expired. Send Hi to start again.",
	},
	"ur": {
		"welcome": "{clinic} میں خوش آمدید۔ براہ کرم زبان منتخب کریں۔",
		"menu": "ہم آپ کی کیا مدد کر سکتے ہیں؟", "menu_btn": "انتخاب",
		"book": "اپوائنٹمنٹ بک کریں", "mine": "میری اپوائنٹمنٹس", "lab": "لیب رپورٹ کی صورتحال", "reception": "استقبالیہ سے بات کریں",
		"branch": "برانچ منتخب کریں", "spec": "شعبہ منتخب کریں", "doctor": "ڈاکٹر منتخب کریں", "date": "تاریخ منتخب کریں",
		"slot": "وقت منتخب کریں", "choose": "منتخب کریں", "no_slots": "اس ڈاکٹر کے پاس اگلے دنوں میں وقت خالی نہیں۔ دوسرا ڈاکٹر منتخب کریں۔",
		"patient": "اپوائنٹمنٹ کس کے لیے ہے؟", "new": "کوئی اور (نیا مریض)",
		"new_details": "مریض کا نام، عمر اور جنس اس طرح بھیجیں:\nعلی رضا، 34، M",
		"bad_details": "براہ کرم اس طرح بھیجیں: علی رضا، 34، M",
		"summary": "براہ کرم تصدیق کریں:\n{patient}\n{doctor}\n{date} — {time}\nفیس: {fee} روپے",
		"confirm": "تصدیق", "change": "تبدیل کریں", "cancel": "منسوخ",
		"payment": "فیس کیسے ادا کریں گے؟", "pay_clinic": "کلینک پر ادائیگی", "pay_proof": "ادائیگی کا ثبوت بھیجیں", "pay_online": "آن لائن ادائیگی",
		"send_proof": "براہ کرم ادائیگی کی تصویر یا اسکرین شاٹ بھیجیں۔",
		"done": "آپ کی اپوائنٹمنٹ بک ہو گئی۔\nحوالہ: {ref}\n{doctor}\n{date} — {time}\n{address}\nتفصیل: {link}",
		"pending": "آپ کی بکنگ {ref} موصول ہو گئی۔ جلد تصدیق کی جائے گی۔\nتفصیل: {link}",
		"taken": "معذرت، یہ وقت ابھی کسی اور نے لے لیا۔ دوسرا وقت منتخب کریں۔",
		"unknown": "معذرت، سمجھ نہیں آیا۔ براہ کرم دیے گئے انتخاب میں سے چنیں۔",
		"handoff": "ہمارا استقبالیہ عملہ جلد یہاں جواب دے گا۔",
		"cancelled": "بکنگ منسوخ۔ دوبارہ شروع کرنے کے لیے Hi بھیجیں۔",
		"none": "آپ کی کوئی آنے والی اپوائنٹمنٹ نہیں۔", "upcoming": "آپ کی آنے والی اپوائنٹمنٹس:\n{rows}",
		"lab_status": "لیب رپورٹ کی صورتحال جلد یہاں دستیاب ہو گی۔ رپورٹ تیار ہونے پر آپ کو پیغام ملے گا۔",
		"expired": "یہ چیٹ ختم ہو گئی۔ دوبارہ شروع کرنے کے لیے Hi بھیجیں۔",
	},
}


def t(conv, key, **kw):
	return T.get(conv.language or "ur", T["en"]).get(key, key).format(**kw)


def get_conversation(phone):
	name = frappe.db.get_value("WhatsApp Conversation", {"phone": phone}, "name")
	if name:
		return frappe.get_doc("WhatsApp Conversation", name)
	return frappe.get_doc({"doctype": "WhatsApp Conversation", "phone": phone, "language": "ur", "data": "{}"}).insert(ignore_permissions=True)


def data(conv):
	return json.loads(conv.data or "{}")


def save(conv, d, step=None):
	conv.data = json.dumps(d, default=str)
	if step is not None:
		conv.current_step = step
	conv.expires_at = add_to_date(now_datetime(), minutes=IDLE_MINUTES)
	conv.save(ignore_permissions=True)


# ------------------------------------------------------------------ outbound helpers
def ask(conv, d, step, body, options, button=None):
	"""Send options as reply buttons (≤3, titles ≤20) or a list message (≤10 rows), and remember them."""
	d["options"] = options
	d["step_body"] = body
	save(conv, d, step)
	preview = body + "\n" + "\n".join(f"{i + 1}. {title}" for i, (oid, title) in enumerate(options))
	if len(options) <= 3 and all(len(o[1]) <= 20 for o in options):
		payload = {"type": "button", "body": {"text": body},
			"action": {"buttons": [{"type": "reply", "reply": {"id": oid, "title": title}} for oid, title in options]}}
	else:
		payload = {"type": "list", "body": {"text": body}, "action": {"button": (button or t(conv, "choose"))[:20],
			"sections": [{"title": (button or t(conv, "choose"))[:24], "rows": [{"id": oid, "title": title[:24],
				"description": title[24:96]} for oid, title in options[:10]]}]}}
	messaging.send_interactive(conv.phone, payload, conversation=conv.name, text_preview=preview)


def say(conv, text):
	messaging.send_free_text(conv.phone, text, conversation=conv.name)


def match_option(d, text, reply_id):
	options = d.get("options") or []
	if reply_id and any(o[0] == reply_id for o in options):
		return reply_id
	s = (text or "").strip()
	if s.isdigit() and 1 <= int(s) <= len(options):
		return options[int(s) - 1][0]
	for oid, title in options:
		if s and s.lower() == title.lower():
			return oid
	return None


# ------------------------------------------------------------------ steps
def start(conv):
	d = {}
	release(conv)
	conv.handed_off = 0
	conv.failed_attempts = 0
	ask(conv, d, "lang", T["en"]["welcome"].format(clinic=setting("sender_name") or "the clinic") + "\n"
		+ T["ur"]["welcome"].format(clinic=setting("sender_name") or "کلینک"), [("lang:en", "English"), ("lang:ur", "اردو")])


def menu(conv, d):
	ask(conv, d, "menu", t(conv, "menu"), [("menu:book", t(conv, "book")), ("menu:mine", t(conv, "mine")),
		("menu:lab", t(conv, "lab")), ("menu:reception", t(conv, "reception"))], button=t(conv, "menu_btn"))


def ask_branch(conv, d):
	branches = frappe.get_all("Branch", pluck="name", order_by="name")
	if len(branches) <= 1:
		d["branch"] = branches[0] if branches else None
		return ask_spec(conv, d)
	ask(conv, d, "branch", t(conv, "branch"), [(f"branch:{b}", b) for b in branches[:10]])


def ask_spec(conv, d):
	specs = frappe.db.sql("""select distinct d.specialization from `tabDoctor` d where d.is_active=1 and d.doctor_type!='External Referring'
		and ifnull(d.specialization,'')!='' order by d.specialization limit 10""", pluck=True)
	field = "specialization_ur" if conv.language == "ur" else None
	options = []
	for s in specs:
		label = (frappe.db.get_value("Specialization", s, field) if field else None) or s
		options.append((f"spec:{s}", label))
	ask(conv, d, "spec", t(conv, "spec"), options)


def ask_doctor(conv, d):
	filters = {"is_active": 1, "specialization": d.get("spec"), "doctor_type": ["!=", "External Referring"]}
	docs = frappe.get_all("Doctor", filters=filters, fields=["name", "doctor_name", "doctor_name_ur", "default_fee"], limit=10)
	options = [(f"doc:{x.name}", f"{(x.doctor_name_ur if conv.language == 'ur' and x.doctor_name_ur else x.doctor_name)} — Rs {flt(x.default_fee):,.0f}")
		for x in docs]
	ask(conv, d, "doctor", t(conv, "doctor"), options)


def ask_date(conv, d):
	dates = booking.available_dates(d["doctor"], d.get("branch"))[:10]
	if not dates:
		say(conv, t(conv, "no_slots"))
		return ask_doctor(conv, d)
	ask(conv, d, "date", t(conv, "date"), [(f"date:{r.slot_date}", formatdate(r.slot_date, "EEE dd MMM")) for r in dates])


def ask_slot(conv, d):
	slots = booking.available_slots(d["doctor"], d["date"], d.get("branch"))[:10]
	if not slots:
		say(conv, t(conv, "taken"))
		return ask_date(conv, d)
	ask(conv, d, "slot", t(conv, "slot"), [(f"slot:{s.name}", hhmm(s.start_time)) for s in slots])


def household(phone):
	names = set(frappe.get_all("Patient", filters={"phone": phone, "disabled": 0}, pluck="name"))
	for hh in frappe.get_all("Household", filters={"phone": phone}, pluck="name"):
		names.update(frappe.get_all("Household Member", filters={"parent": hh}, pluck="patient"))
	return frappe.get_all("Patient", filters={"name": ["in", list(names) or [""]], "disabled": 0}, fields=["name", "patient_name"])


def ask_patient(conv, d):
	members = household(conv.phone)
	conv.patients = ", ".join(m.name for m in members)
	options = [(f"pat:{m.name}", m.patient_name) for m in members[:9]] + [("pat:new", t(conv, "new"))]
	ask(conv, d, "patient", t(conv, "patient"), options)


def ask_summary(conv, d):
	try:
		booking.hold_slot(d["slot"], f"wa:{conv.phone}")
	except frappe.ValidationError:
		say(conv, t(conv, "taken"))
		return ask_slot(conv, d)
	conv.held_slot = d["slot"]
	s = frappe.db.get_value("Time Slot", d["slot"], ["slot_date", "start_time"], as_dict=True)
	doc = frappe.db.get_value("Doctor", d["doctor"], ["doctor_name", "default_fee"], as_dict=True)
	body = t(conv, "summary", patient=d.get("patient_name"), doctor=doc.doctor_name, date=formatdate(s.slot_date),
		time=hhmm(s.start_time), fee=f"{booking.doctor_fee(d['doctor']):,.0f}")
	ask(conv, d, "summary", body, [("sum:confirm", t(conv, "confirm")), ("sum:change", t(conv, "change")),
		("sum:cancel", t(conv, "cancel"))])


def ask_payment(conv, d):
	allowed = [c.strip() for c in (setting("whatsapp_payment_channels") or "At Clinic").split("\n") if c.strip()]
	key = {"At Clinic": "pay_clinic", "Payment Proof": "pay_proof", "Online": "pay_online"}
	options = [(f"pay:{c}", t(conv, key[c])) for c in allowed if c in key]
	if len(options) == 1:
		return finish(conv, d, allowed[0])
	ask(conv, d, "payment", t(conv, "payment"), options)


def finish(conv, d, channel, proof=None):
	patient = d.get("patient")
	if not patient:
		patient = create_patient(conv, d)
	try:
		appt = booking.book(doctor=d["doctor"], slot=d["slot"], patient=patient, phone=conv.phone, source_channel="WhatsApp",
			payment_channel=channel, hold_key=f"wa:{conv.phone}", payment_proof=proof, notify_patient=False)
	except frappe.ValidationError:
		say(conv, t(conv, "taken"))
		return ask_slot(conv, d)
	conv.held_slot = None
	address = frappe.db.get_value("Branch", appt.branch, "hv_address") or ""
	key = "done" if appt.status == "Confirmed" else "pending"
	say(conv, t(conv, key, ref=appt.booking_ref, doctor=appt.doctor_name, date=formatdate(appt.appointment_date),
		time=hhmm(appt.start_time), address=address, link=booking.manage_link(appt)))
	save(conv, {"last_booking": appt.name}, "done")
	return appt


def create_patient(conv, d):
	from hospital_vvs.hospital_vvs.doctype.patient.patient import dob_from_age

	branch = d.get("branch") or setting("default_branch")
	p = frappe.get_doc({"doctype": "Patient", "patient_name": d["patient_name"], "gender": d.get("gender") or "Other",
		"dob": dob_from_age(cint(d.get("age") or 30)), "dob_estimated": 1, "phone": conv.phone, "branch": branch,
		"preferred_language": conv.language,
		"consents": [{"consent_type": "WhatsApp messages", "status": "Given", "recorded_on": now_datetime(), "recorded_by": "Administrator"}],
		"duplicate_reason": "Self-registered on WhatsApp",
	})
	p.insert(ignore_permissions=True)
	return p.name


def parse_details(text):
	parts = [x.strip() for x in re.split(r"[,،]", text or "") if x.strip()]
	if len(parts) < 3 or not re.fullmatch(r"\d{1,3}", parts[1]):
		return None
	g = parts[2].upper()[:1]
	gender = {"M": "Male", "F": "Female", "م": "Male", "ع": "Female"}.get(g, "Other")
	return {"patient_name": parts[0], "age": int(parts[1]), "gender": gender}


def release(conv):
	if conv.held_slot:
		booking.release_hold(conv.held_slot, f"wa:{conv.phone}")
		conv.held_slot = None


def handoff(conv):
	release(conv)
	conv.handed_off = 1
	conv.unread = cint(conv.unread) + 1
	save(conv, data(conv), "handoff")
	say(conv, t(conv, "handoff"))
	frappe.publish_realtime("hv:wa_inbox", {"phone": conv.phone, "conversation": conv.name}, after_commit=True)


def fail(conv, d):
	conv.failed_attempts = cint(conv.failed_attempts) + 1
	if conv.failed_attempts >= 2:
		return handoff(conv)
	say(conv, t(conv, "unknown"))
	ask(conv, d, conv.current_step, d.get("step_body") or t(conv, "choose"), d.get("options") or [])


# ------------------------------------------------------------------ entry point
def handle_inbound(phone, text=None, reply_id=None, media=None, provider_id=None):
	"""Process one inbound message (called by the webhook job and by tests)."""
	from hospital_vvs.hospital_vvs.doctype.patient.patient import normalize_phone

	phone = normalize_phone(phone)
	conv = get_conversation(phone)
	expired = conv.expires_at and get_datetime(conv.expires_at) < now_datetime()
	conv.last_inbound_at = now_datetime()
	frappe.get_doc({"doctype": "Message Log", "direction": "In", "phone": phone, "channel": "WhatsApp", "status": "Received",
		"body": text or reply_id or ("[image]" if media else ""), "media_url": media, "provider_message_id": provider_id,
		"conversation": conv.name, "patient": (household(phone) or [{}])[0].get("name")}).insert(ignore_permissions=True)
	words = (text or "").strip().lower()
	from hospital_vvs.services.patient_comms import whatsapp_rating

	if not conv.handed_off and whatsapp_rating(phone, words):  # "1".."5" answers an open feedback request (D-44)
		return say(conv, "شکریہ! Thank you for your feedback.")
	if words in HANDOFF_WORDS or reply_id == "menu:reception":
		return handoff(conv)
	if conv.handed_off and not (words in RESTART_WORDS):
		conv.unread = cint(conv.unread) + 1
		conv.save(ignore_permissions=True)
		frappe.publish_realtime("hv:wa_inbox", {"phone": phone, "conversation": conv.name}, after_commit=True)
		return None
	if expired or not conv.current_step or conv.current_step in ("done", "handoff") or words in RESTART_WORDS:
		return start(conv)
	d = data(conv)
	step = conv.current_step

	if step == "proof":
		if media:
			return finish(conv, d, "Payment Proof", proof=media)
		say(conv, t(conv, "send_proof"))
		return None
	if step == "new_details":
		details = parse_details(text)
		if not details:
			conv.failed_attempts = cint(conv.failed_attempts) + 1
			if conv.failed_attempts >= 2:
				return handoff(conv)
			save(conv, d)
			say(conv, t(conv, "bad_details"))
			return None
		d.update(details)
		d["patient"] = None
		return ask_summary(conv, d)

	choice = match_option(d, text, reply_id)
	if not choice:
		return fail(conv, d)
	conv.failed_attempts = 0
	kind, _, value = choice.partition(":")
	if kind == "lang":
		conv.language = value
		return menu(conv, d)
	if kind == "menu":
		if value == "book":
			return ask_branch(conv, d)
		if value == "mine":
			rows = frappe.get_all("Appointment", filters={"phone": phone, "status": ["in", booking.ACTIVE],
				"appointment_date": [">=", frappe.utils.today()]}, fields=["booking_ref", "doctor_name", "appointment_date", "start_time"],
				order_by="appointment_date", limit=5)
			say(conv, t(conv, "upcoming", rows="\n".join(f"{r.booking_ref} · {r.doctor_name} · {formatdate(r.appointment_date)} {hhmm(r.start_time)}"
				for r in rows)) if rows else t(conv, "none"))
			return menu(conv, d)
		if value == "lab":
			say(conv, t(conv, "lab_status"))
			return menu(conv, d)
	if kind == "branch":
		d["branch"] = value
		return ask_spec(conv, d)
	if kind == "spec":
		d["spec"] = value
		return ask_doctor(conv, d)
	if kind == "doc":
		d["doctor"] = value
		return ask_date(conv, d)
	if kind == "date":
		d["date"] = value
		return ask_slot(conv, d)
	if kind == "slot":
		d["slot"] = value
		return ask_patient(conv, d)
	if kind == "pat":
		if value == "new":
			save(conv, d, "new_details")
			say(conv, t(conv, "new_details"))
			return None
		d["patient"] = value
		d["patient_name"] = frappe.db.get_value("Patient", value, "patient_name")
		return ask_summary(conv, d)
	if kind == "sum":
		if value == "confirm":
			return ask_payment(conv, d)
		if value == "change":
			release(conv)
			return ask_spec(conv, d)
		release(conv)
		save(conv, {}, "done")
		say(conv, t(conv, "cancelled"))
		return None
	if kind == "pay":
		if value == "Payment Proof":
			save(conv, d, "proof")
			say(conv, t(conv, "send_proof"))
			return None
		return finish(conv, d, value)
	return fail(conv, d)


def expire_conversations():
	for name in frappe.get_all("WhatsApp Conversation", filters={"expires_at": ["<", now_datetime()],
		"current_step": ["not in", ["", "done", "handoff", "expired"]]}, pluck="name"):
		conv = frappe.get_doc("WhatsApp Conversation", name)
		release(conv)
		conv.current_step = "expired"
		conv.save(ignore_permissions=True)
