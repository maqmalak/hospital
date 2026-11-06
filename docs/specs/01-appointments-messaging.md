# 01 — Appointments, Messaging (WhatsApp + SMS) & Feedback

## Shared messaging layer (build first, Phase 1)

All patient messages — appointments, lab, pharmacy, feedback — go through `services/messaging.py`.

- **WhatsApp:** WhatsApp Business Cloud API (Meta) through a provider adapter, so a local Business Solution Provider can be swapped in later. First check whether the `frappe_whatsapp` app works on v16; if it does, propose using it in `DECISIONS.md`, otherwise build the adapter.
- **SMS fallback:** an SMS gateway adapter (HTTP API of a local provider, chosen by me). Used for OTPs when WhatsApp isn't available, and as a fallback when a WhatsApp send fails or the number isn't on WhatsApp (setting per message type).
- **Credentials** (access token, phone number ID, webhook verify token, app secret, SMS keys) in `site_config.json` only.
- **Templates:** business-initiated WhatsApp messages must use **pre-approved templates**, in English and Urdu; language from the patient's preference. Keep a **Message Template** DocType mapping each event to WhatsApp template name + SMS text per language.
- **Consent:** send only when the patient has opted in for that channel (`00-masters-patients.md`). OTPs and replies inside a patient-started conversation are allowed without marketing consent.
- **No medical data in messages.** Only first name, clinic name, reference number, date/time and links. Results and medicines stay behind portals.
- **Message Log:** patient, phone, channel (WhatsApp / SMS), template/event, language, linked document, status (Queued / Sent / Delivered / Read / Failed), provider message ID, error, retry count, timestamps. Failed messages show a **Resend** button wherever the linked document is shown.
- **Background jobs:** enqueue after commit; retry with backoff (3 attempts); then fallback channel if enabled; then Failed.
- **Webhook:** one whitelisted, **signature-verified** endpoint (`api/messaging.whatsapp_webhook`) receives delivery statuses and inbound messages; it responds fast and processes in a background job.
- **Settings (Clinic Settings → Messaging):** enable WhatsApp, enable SMS, fallback rules per event, default country code (+92), sender name, quiet hours (no non-urgent messages at night), per-event on/off.

**All templates (English + Urdu):** `appointment_confirmed`, `appointment_reminder`, `appointment_rescheduled`, `appointment_cancelled`, `appointment_rejected`, `otp_code`, `lab_thank_you`, `lab_report_ready`, `lab_report_updated`, `pharmacy_order_ready` (optional), `visit_feedback`. Plan time for Meta approval.

## Appointment data model

- **Time Slot** (generated; Available / Held / Booked / Blocked; hold expiry; branch)
- **Appointment** (Pending → Confirmed → Completed / Rejected / Cancelled / No-show; **source channel** Web / WhatsApp / Reception; booking ref, payment channel, payment proof attachment, refund fields, reminder sent flags, manage token for self-service)
- **WhatsApp Conversation** (phone, linked patient(s), current step, collected data JSON, language, last inbound at, expires at, handed-off flag)

## Booking channels

Both self-service channels call **the same booking service** (`services/appointments.py`), so slot rules, fees, payments and confirmations are identical. Reception still books walk-ins.

**1. Web portal (`/book-appointment`, public, mobile-first, en/ur/ar)**
- Branch (if several) → specialization or doctor → date → slot → patient details (phone first; if the phone matches existing patients, verify by OTP via WhatsApp/SMS and let them pick a household member or add one) → fee and payment (online via Frappe Payments, payment-proof upload, or pay at clinic if allowed) → confirmation with booking ref.
- The chosen slot is **held** during checkout (default 10 minutes); holds expire automatically.
- **Manage booking** (`/my-appointment/:token`): view, reschedule or cancel within the allowed window.

**2. WhatsApp booking (inbound, conversational)**
- Patient messages the clinic number ("Hi", "appointment", "اپوائنٹمنٹ"). The bot uses **interactive messages** (reply buttons, list messages):
  1. Language (English / اردو)
  2. Menu: **Book appointment**, My appointments, Lab report status, Talk to reception
  3. Branch (if several) → specialization → doctor list (with fee)
  4. Date (next N days with free slots) → slot list
  5. Patient: pick from the household on this phone, or enter name, age, gender
  6. Summary + fee → **Confirm** / Change / Cancel
  7. Payment: online link, payment-proof screenshot (image reply attached), or pay at clinic — per settings
  8. Confirmation with booking ref, doctor, date/time, address/map link, manage-booking link
- Use **WhatsApp Flows** instead of step-by-step chat if available on the account; record the choice.
- Unrecognized reply → resend current options; "reception"/"agent" or 2 failed attempts → hand off to the **WhatsApp inbox** on `/appointments`, where staff reply inside the 24-hour window.
- Conversation expires after 30 minutes idle (releases any hold).
- Inside the patient-started **24-hour service window** replies can be free-form/interactive; anything later must be a template.

**Rules**
- Book only Available slots; respect doctor leave, blocked dates, schedules, branch and booking window. Re-check availability inside a row lock when confirming.
- One active booking per patient per doctor per day (setting).
- Anti-abuse: rate-limit by phone and IP; OTP for existing patients' numbers; cap unpaid Pending bookings per phone.
- Reminders: evening before and 3 hours before (configurable).
- No-show: slot released after N minutes; appointment marked No-show.
- `/appointments` shows a channel badge and filter; arrival adds the patient to the physician queue.

**Settings (Clinic Settings → Appointments):** enable, enable web booking, enable WhatsApp booking, walk-in mode, slot window days, slot hold minutes, no-show release minutes, payment channels per booking channel, auto-confirm vs staff-confirm, reschedule/cancel cut-off hours, reminder schedule, one booking per patient per doctor per day.

## Patient feedback (Phase 5)

- After an OPD visit is completed, an IPD discharge or a pharmacy handover (each on/off, delay in hours), send `visit_feedback` with rating buttons (1–5) and an optional comment reply.
- **Patient Feedback** DocType: patient, department, doctor, linked visit, rating, comment, channel, received at.
- Ratings ≤ 2 alert the Admin (realtime + list on dashboard) for follow-up; follow-up notes recorded.
- At most one feedback request per patient per N days (setting).
- Report: average rating by department, doctor and month; comments list.
