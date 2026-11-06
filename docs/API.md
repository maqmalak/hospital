# VVSDesk API

Generated from `hospital_vvs/api/*.py` by `devtools/apidoc.py`. Path: `/api/method/hospital_vvs.api.<module>.<method>`.
Objects and lists are sent as JSON strings. Roles: what the method checks itself (DocType permissions apply too; PW Admin passes every check).

## admin

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `get_settings` |  |  | ADMIN |  |
| `save_settings` | data | POST | ADMIN |  |
| `audit` | user, patient, doctype, from_date, to_date, kind, limit, start |  | ADMIN |  |

## appointments

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `board` | date, branch, status, channel, doctor |  | STAFF, DOCTOR, NURSE |  |
| `slots` | doctor, date, branch |  |  |  |
| `dates` | doctor, branch |  |  |  |
| `book` | data | POST | STAFF |  |
| `set_status` | name, status, reason | POST | STAFF |  |
| `reschedule` | name, slot | POST | STAFF |  |
| `mark_paid` | name | POST | STAFF |  |
| `link_patient` | name, patient | POST | STAFF | Booking made for a new patient: link it to the patient registered at the desk. |
| `regenerate_slots` | days | POST | ADMIN, RECEPTIONIST |  |
| `public_options` |  | guest |  |  |
| `public_dates` | doctor, branch | guest |  |  |
| `public_slots` | doctor, date, branch | guest |  |  |
| `public_hold` | slot, hold_key | guest POST |  |  |
| `public_release` | slot, hold_key | guest POST |  |  |
| `request_otp` | phone | guest POST |  | Existing patients' numbers must be verified before their household is shown. |
| `verify_otp` | phone, code | guest POST |  |  |
| `public_book` | data | guest POST |  |  |
| `upload_proof` | filename, filedata | guest POST |  | Payment proof image from the public portal (private file, ≤ 5 MB). |
| `manage_get` | token | guest |  |  |
| `manage_reschedule` | token, slot | guest POST |  |  |
| `manage_cancel` | token | guest POST |  |  |

## billing

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `discount_requests` | status, limit |  | CASH_SUPERVISOR, ACCOUNTANT, discounts.approver_roles() |  |
| `discount_status` | name |  |  | Counter polls / listens for the approver's decision. |
| `decide` | name, approve, note | POST |  |  |
| `approve_with_pin` | name, approver, password | POST |  | Supervisor approves at the counter by entering their own login and password. |

## dashboard

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `summary` | branch, date, days |  | DOCTOR, ACCOUNTANT, CASH_SUPERVISOR |  |

## doctors

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `board` | branch |  | RECEPTIONIST, DOCTOR, NURSE, DEO |  |

## messaging

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `whatsapp_webhook` |  | guest |  | Meta webhook: GET = verification handshake; POST = statuses and inbound messages, processed in a job. |
| `simulate_inbound` | phone, text, reply_id, media | POST | RECEPTIONIST | Test mode only: play the patient's side of a WhatsApp chat (Admin / Receptionist). |
| `inbox` |  |  | RECEPTIONIST |  |
| `conversation` | phone |  | RECEPTIONIST |  |
| `reply` | phone, text | POST | RECEPTIONIST |  |
| `close_handoff` | phone | POST | RECEPTIONIST |  |
| `log` | status, channel, event, phone, limit, start |  | RECEPTIONIST, LAB_USER |  |
| `resend` | name | POST | RECEPTIONIST, LAB_USER |  |

## opd

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `counter_context` | branch |  |  | Doctors with fee and today's queue, service items and payment modes for the OPD counter. |
| `preview` | data |  |  | Totals as the server computes them (free follow-up, payer split) before the cashier saves. |
| `request_discount` | data | POST | COUNTER_ROLES, LAB_USER, PHARMACY_CASHIER, DISPENSER, CASH_SUPERVISOR, ACCOUNTANT |  |
| `create_slip` | data | POST | COUNTER_ROLES | Save + submit the slip: invoice on the OPD POS Profile (skipped when 0), token and queue entry. |
| `slip_print` | name |  |  |  |
| `recent_slips` | branch, limit |  |  |  |
| `queue` | doctor, branch, date |  |  |  |
| `set_queue_status` | name, status, priority | POST | DOCTOR, RECEPTIONIST, NURSE, DEO |  |
| `call_next` | doctor, branch | POST | DOCTOR, NURSE, RECEPTIONIST |  |
| `display` | branch |  |  | Waiting-room display: token and room only (first name when the setting allows). |

## ops

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `health` |  |  | ADMIN |  |

## patients

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `search` | q, limit, include_disabled |  |  | MR no. / QR scan, phone, CNIC (exact, via hash), legacy MR or name. |
| `find_duplicates` | patient_name, phone, cnic, dob, age, exclude |  |  | Likely duplicates: same CNIC; same phone + similar name; same name + DOB/age within a year. |
| `register` | data, duplicate_reason | POST | REGISTER_ROLES |  |
| `get` | name |  |  | Patient record. Clinical fields only for clinical roles and the front desk (field-level, server side). |
| `update` | name, data | POST | REGISTER_ROLES |  |
| `reveal_cnic` | name | POST |  | Full CNIC for Admin / Receptionist only; every reveal is written to the access log. |
| `add_consent` | name, consent_type, status | POST | REGISTER_ROLES |  |
| `card` | name |  |  |  |
| `history` | name |  | DOCTOR, NURSE, OV_DOCTOR, DEO | Timeline across branches (02-opd.md). Every open is written to the access log. |
| `merge_preview` | survivor, duplicate |  | ADMIN |  |
| `merge` | survivor, duplicate, confirm_mr | POST | ADMIN | Move every linked record and the Customer to the survivor; disable the duplicate. Cannot be undone automatically. |
| `board` | q, category, gender, branch, sort, start, limit |  | REGISTER_ROLES | Patients screen: a page of patients with visit counts, last visit, allergy flag and upcoming booking, plus totals. |

## prescription

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `workspace` | queue_entry, patient, prescription |  | DOCTOR_ROLES, NURSE, DEO |  |
| `search_medicines` | q, limit |  |  | Brand or generic, with strength and form. |
| `search_diagnoses` | q, limit |  |  |  |
| `check` | patient, lines, prescription |  |  | Live safety check as lines are added (same rules as on save). |
| `save` | data, sign | POST | DOCTOR_ROLES | Create or update the draft; sign=1 submits it (blocked while a blocking alert has no override reason). |
| `amend` | name, reason | POST | DOCTOR_ROLES | Cancel-and-keep the signed version, return a new draft (version N+1) carrying the reason. |
| `get_template` | name |  |  |  |
| `save_template` | template_name, data, shared | POST | DOCTOR_ROLES |  |
| `copy_previous` | patient |  |  |  |
| `print_data` | name |  |  |  |

## session

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `boot` |  |  |  |  |
| `unlock` | password | POST |  | Idle lock screen: re-check the signed-in user's password without a new login. |
| `set_language` | language | POST |  |  |

## ward

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `bed_map` | branch |  |  |  |
| `set_status` | bed, status, note, hours | POST | STAFF |  |
| `assign` | bed, patient, doctor, note, days, rate, reason | POST | STAFF | Allot a bed (interim until Phase 3's Bed Allotment drives this): expected stay, agreed daily rate, reason. |
| `extend` | bed, days | POST | STAFF |  |
| `kiosk` | branch |  |  | Ward kiosk display: per-ward counts and beds; initials only unless first names are allowed on displays. |
| `transfer` | bed, to_bed, note | POST | NURSE, DOCTOR |  |
| `release` | bed, note | POST | STAFF |  |
| `bed_history` | bed |  |  |  |
