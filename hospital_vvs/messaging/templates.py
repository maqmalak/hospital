"""Default Message Templates (01-appointments-messaging.md). WhatsApp template names must match the names
approved by Meta for the clinic's account; the SMS texts are the fallback. No medical data in any text."""

import frappe

# event: (wa params, sms en, sms ur, urgent)
DEFAULTS = {
	"appointment_confirmed": ("first_name,clinic,ref,doctor,date,time,link",
		"Dear {first_name}, your appointment {ref} with {doctor} at {clinic} is confirmed for {date} {time}. Manage: {link}",
		"محترم {first_name}، {clinic} میں {doctor} کے ساتھ آپ کی اپوائنٹمنٹ {ref} کی تصدیق ہو گئی ہے: {date} {time}۔ تفصیل: {link}", 0),
	"appointment_reminder": ("first_name,clinic,ref,doctor,date,time",
		"Reminder: {first_name}, your appointment {ref} with {doctor} at {clinic} is on {date} at {time}.",
		"یاد دہانی: {first_name}، {clinic} میں {doctor} کے ساتھ آپ کی اپوائنٹمنٹ {ref} {date} کو {time} بجے ہے۔", 0),
	"appointment_rescheduled": ("first_name,clinic,ref,date,time,link",
		"{first_name}, appointment {ref} at {clinic} is moved to {date} {time}. Manage: {link}",
		"{first_name}، {clinic} میں آپ کی اپوائنٹمنٹ {ref} اب {date} {time} پر ہے۔ تفصیل: {link}", 0),
	"appointment_cancelled": ("first_name,clinic,ref",
		"{first_name}, appointment {ref} at {clinic} has been cancelled.",
		"{first_name}، {clinic} میں آپ کی اپوائنٹمنٹ {ref} منسوخ کر دی گئی ہے۔", 0),
	"appointment_rejected": ("first_name,clinic,ref",
		"{first_name}, we could not confirm appointment {ref} at {clinic}. Please call us to book another time.",
		"{first_name}، {clinic} میں اپوائنٹمنٹ {ref} کی تصدیق نہیں ہو سکی۔ براہ کرم دوسرا وقت لینے کے لیے رابطہ کریں۔", 0),
	"otp_code": ("code,clinic",
		"{code} is your {clinic} verification code. It expires in a few minutes.",
		"{clinic} تصدیقی کوڈ: {code}۔ یہ چند منٹ میں ختم ہو جائے گا۔", 1),
	"lab_thank_you": ("first_name,clinic,ref,tat",
		"Thank you {first_name}. Your lab order {ref} at {clinic} is received. Expected report time: {tat}.",
		"شکریہ {first_name}۔ {clinic} میں آپ کا لیب آرڈر {ref} موصول ہو گیا۔ متوقع رپورٹ وقت: {tat}۔", 0),
	"lab_report_ready": ("first_name,clinic,ref,link",
		"{first_name}, your report {ref} from {clinic} is ready: {link}",
		"{first_name}، {clinic} سے آپ کی رپورٹ {ref} تیار ہے: {link}", 0),
	"lab_report_updated": ("first_name,clinic,ref,link",
		"{first_name}, report {ref} from {clinic} was updated. New link: {link}",
		"{first_name}، {clinic} سے رپورٹ {ref} اپ ڈیٹ ہوئی ہے۔ نیا لنک: {link}", 0),
	"pharmacy_order_ready": ("first_name,clinic,token",
		"{first_name}, your medicines (token {token}) are ready at {clinic} pharmacy.",
		"{first_name}، آپ کی ادویات (ٹوکن {token}) {clinic} فارمیسی پر تیار ہیں۔", 0),
	"visit_feedback": ("first_name,clinic,link",
		"{first_name}, how was your visit to {clinic}? Rate us 1-5: {link}",
		"{first_name}، {clinic} میں آپ کا تجربہ کیسا رہا؟ 1 سے 5 تک ریٹنگ دیں: {link}", 0),
}


def ensure_templates():
	for event, (params, en, ur, urgent) in DEFAULTS.items():
		if frappe.db.exists("Message Template", event):
			continue
		frappe.get_doc({
			"doctype": "Message Template", "event": event, "enabled": 1, "fallback_to_sms": 1, "urgent": urgent,
			"marketing": 0 if event == "otp_code" else 1,
			"wa_template_en": event, "wa_template_ur": event + "_ur", "wa_params": params,
			"sms_text_en": en, "sms_text_ur": ur,
		}).insert(ignore_permissions=True)
