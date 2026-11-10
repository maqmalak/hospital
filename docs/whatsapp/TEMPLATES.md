# WhatsApp templates for Meta approval

Generated from Message Templates (`bench --site hospital execute hospital_vvs.messaging.meta.write_files`).
Submit each row in WhatsApp Manager → Message templates (or POST `meta-templates.json` items to `/{waba_id}/message_templates`).
After approval, the Message Template's *WhatsApp Template (English / Urdu)* must hold the same name; the language code picks the version.

| Name | Lang | Category | Body (variables in order) |
|---|---|---|---|
| `vvs_appointment_cancelled` | en | UTILITY | Hello {{1}}, appointment {{3}} at {{2}} has been cancelled. |
| `vvs_appointment_cancelled` | ur | UTILITY | محترم {{1}}، {{2}} میں آپ کی اپوائنٹمنٹ {{3}} منسوخ کر دی گئی ہے۔ |
| `vvs_appointment_confirmed` | en | UTILITY | Dear {{1}}, your appointment {{3}} with {{4}} at {{2}} is confirmed for {{5}} {{6}}. Manage: {{7}} Thank you. |
| `vvs_appointment_confirmed` | ur | UTILITY | محترم {{1}}، {{2}} میں {{4}} کے ساتھ آپ کی اپوائنٹمنٹ {{3}} کی تصدیق ہو گئی ہے: {{5}} {{6}}۔ تفصیل: {{7}} شکریہ۔ |
| `vvs_appointment_rejected` | en | UTILITY | Hello {{1}}, we could not confirm appointment {{3}} at {{2}}. Please call us to book another time. |
| `vvs_appointment_rejected` | ur | UTILITY | محترم {{1}}، {{2}} میں اپوائنٹمنٹ {{3}} کی تصدیق نہیں ہو سکی۔ براہ کرم دوسرا وقت لینے کے لیے رابطہ کریں۔ |
| `vvs_appointment_reminder` | en | UTILITY | Reminder: {{1}}, your appointment {{3}} with {{4}} at {{2}} is on {{5}} at {{6}}. Thank you. |
| `vvs_appointment_reminder` | ur | UTILITY | یاد دہانی: {{1}}، {{2}} میں {{4}} کے ساتھ آپ کی اپوائنٹمنٹ {{3}} {{5}} کو {{6}} بجے ہے۔ |
| `vvs_appointment_requested` | en | UTILITY | Dear {{1}}, {{2}} received your appointment request {{3}} with {{4}} for {{5}} {{6}}. Reception will confirm it on WhatsApp shortly. Help: {{7}} Thank you. |
| `vvs_appointment_requested` | ur | UTILITY | محترم {{1}}، {{2}} کو {{4}} کے ساتھ {{5}} {{6}} کے لیے آپ کی اپوائنٹمنٹ کی درخواست {{3}} موصول ہو گئی ہے۔ استقبالیہ جلد واٹس ایپ پر تصدیق کرے گا۔ رابطہ: {{7}} شکریہ۔ |
| `vvs_appointment_rescheduled` | en | UTILITY | Hello {{1}}, appointment {{3}} at {{2}} is moved to {{4}} {{5}}. Manage: {{6}} Thank you. |
| `vvs_appointment_rescheduled` | ur | UTILITY | محترم {{1}}، {{2}} میں آپ کی اپوائنٹمنٹ {{3}} اب {{4}} {{5}} پر ہے۔ تفصیل: {{6}} شکریہ۔ |
| `vvs_lab_report_ready` | en | UTILITY | Hello {{1}}, your report {{3}} from {{2}} is ready: {{4}} Thank you. |
| `vvs_lab_report_ready` | ur | UTILITY | محترم {{1}}، {{2}} سے آپ کی رپورٹ {{3}} تیار ہے: {{4}} شکریہ۔ |
| `vvs_lab_report_updated` | en | UTILITY | Hello {{1}}, report {{3}} from {{2}} was updated. New link: {{4}} Thank you. |
| `vvs_lab_report_updated` | ur | UTILITY | محترم {{1}}، {{2}} سے رپورٹ {{3}} اپ ڈیٹ ہوئی ہے۔ نیا لنک: {{4}} شکریہ۔ |
| `vvs_lab_thank_you` | en | UTILITY | Thank you {{1}}. Your lab order {{3}} at {{2}} is received. Expected report time: {{4}}. Thank you. |
| `vvs_lab_thank_you` | ur | UTILITY | شکریہ {{1}}۔ {{2}} میں آپ کا لیب آرڈر {{3}} موصول ہو گیا۔ متوقع رپورٹ وقت: {{4}}۔ شکریہ۔ |
| `vvs_otp_code` | en | AUTHENTICATION | <Meta fixed text> {{1}} is your verification code. For your security, do not share this code. |
| `vvs_otp_code` | ur | AUTHENTICATION | <Meta fixed text> {{1}} is your verification code. For your security, do not share this code. |
| `vvs_ov_accepted` | en | UTILITY | Hello {{1}}, your online consultation {{3}} with {{4}} ({{2}}) is on {{5}} at {{6}}. Video link: {{7}} Thank you. |
| `vvs_ov_accepted` | ur | UTILITY | محترم {{1}}، {{2}} میں {{4}} کے ساتھ آپ کی آن لائن مشاورت {{3}} {{5}} کو {{6}} بجے ہے۔ ویڈیو لنک: {{7}} شکریہ۔ |
| `vvs_ov_cancelled` | en | UTILITY | Hello {{1}}, online consultation {{3}} at {{2}} has been cancelled. |
| `vvs_ov_cancelled` | ur | UTILITY | محترم {{1}}، {{2}} میں آن لائن مشاورت {{3}} منسوخ کر دی گئی ہے۔ |
| `vvs_ov_completed` | en | UTILITY | Hello {{1}}, your online consultation {{3}} at {{2}} is complete. Open your link to see the prescription. |
| `vvs_ov_completed` | ur | UTILITY | محترم {{1}}، {{2}} میں آپ کی آن لائن مشاورت {{3}} مکمل ہو گئی۔ نسخہ دیکھنے کے لیے اپنا لنک کھولیں۔ |
| `vvs_ov_received` | en | UTILITY | Dear {{1}}, {{2}} received your online consultation request {{3}}. Track it here: {{4}} Thank you. |
| `vvs_ov_received` | ur | UTILITY | محترم {{1}}، {{2}} کو آپ کی آن لائن مشاورت کی درخواست {{3}} موصول ہو گئی ہے۔ صورتحال یہاں دیکھیں: {{4}} شکریہ۔ |
| `vvs_ov_refunded` | en | UTILITY | Hello {{1}}, {{2}} refunded {{4}} for online consultation {{3}}. Thank you. |
| `vvs_ov_refunded` | ur | UTILITY | محترم {{1}}، {{2}} نے آن لائن مشاورت {{3}} کے {{4}} واپس کر دیے ہیں۔ |
| `vvs_ov_rejected` | en | UTILITY | Hello {{1}}, {{2}} could not take online request {{3}}. Please visit the clinic or call us. Any fee paid will be refunded. |
| `vvs_ov_rejected` | ur | UTILITY | محترم {{1}}، {{2}} آن لائن درخواست {{3}} قبول نہیں کر سکا۔ براہ کرم کلینک تشریف لائیں یا رابطہ کریں۔ ادا شدہ فیس واپس کر دی جائے گی۔ |
| `vvs_payment_link` | en | UTILITY | Dear {{1}}, please pay {{3}} for {{4}} at {{2}} securely by card: {{5}} Thank you. |
| `vvs_payment_link` | ur | UTILITY | محترم {{1}}، {{2}} میں {{4}} کے {{3}} کارڈ سے محفوظ طریقے سے ادا کریں: {{5}} شکریہ۔ |
| `vvs_pharmacy_order_ready` | en | UTILITY | Hello {{1}}, your medicines (token {{3}}) are ready at {{2}} pharmacy. |
| `vvs_pharmacy_order_ready` | ur | UTILITY | محترم {{1}}، آپ کی ادویات (ٹوکن {{3}}) {{2}} فارمیسی پر تیار ہیں۔ |
| `vvs_visit_feedback` | en | MARKETING | Hello {{1}}, how was your visit to {{2}}? Rate us 1-5: {{3}} Thank you. |
| `vvs_visit_feedback` | ur | MARKETING | محترم {{1}}، {{2}} میں آپ کا تجربہ کیسا رہا؟ 1 سے 5 تک ریٹنگ دیں: {{3}} شکریہ۔ |

Notes: *AUTHENTICATION* uses Meta's fixed OTP text with a copy-code button. *visit_feedback* is filed as MARKETING (Meta may also accept it as UTILITY).
No medical details are in any template (spec 01).
