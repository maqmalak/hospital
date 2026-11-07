# VVSDesk API

Generated from `hospital_vvs/api/*.py` by `devtools/apidoc.py`. Path: `/api/method/hospital_vvs.api.<module>.<method>`.
Objects and lists are sent as JSON strings. Roles: what the method checks itself (DocType permissions apply too; PW Admin passes every check).

## admin

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `get_settings` |  |  | ADMIN |  |
| `save_settings` | data | POST | ADMIN |  |
| `audit` | user, patient, doctype, from_date, to_date, kind, limit, start |  | ADMIN |  |
| `devices` |  |  | ADMIN |  |
| `save_device` | data | POST | ADMIN |  |
| `rotate_device_key` | name | POST | ADMIN | A lost or stolen screen: the old link stops working at once. |

## appointments

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `board` | date, branch, status, channel, doctor |  | STAFF, DOCTOR, NURSE |  |
| `slots` | doctor, date, branch |  |  |  |
| `dates` | doctor, branch |  |  |  |
| `book` | data | POST | STAFF |  |
| `first_available` | specialization, date, branch |  | STAFF | Suggest the doctor and slot for "any available doctor" (by shift, earliest slot, lighter load). |
| `set_priority` | name, priority | POST | STAFF |  |
| `set_status` | name, status, reason | POST | STAFF |  |
| `reschedule` | name, slot | POST | STAFF |  |
| `resend_message` | name | POST | STAFF | Resend the latest WhatsApp/SMS for this appointment (request or confirmation, by its current status). |
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
| `shift_cond` | shift, col |  |  | SQL condition for the Day / Night filter (shift start times from Clinic Settings). |
| `calendar` | start, end, doctor, branch, summary, shift |  | STAFF, DOCTOR, NURSE | Calendar views. Day/week: every slot (free, held, booked, blocked) with its appointment. Month (summary=1): counts per day |

## billing

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `discount_requests` | status, limit |  | CASH_SUPERVISOR, ACCOUNTANT, discounts.approver_roles() |  |
| `discount_status` | name |  |  | Counter polls / listens for the approver's decision. |
| `decide` | name, approve, note | POST |  |  |
| `approve_with_pin` | name, approver, password | POST |  | Supervisor approves at the counter by entering their own login and password. |

## cash

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `my_shift` |  |  | CASH_ROLES |  |
| `open_shift` | counter, balances | POST | CASH_ROLES |  |
| `movement` | movement_type, amount, reason, account | POST | CASH_ROLES |  |
| `refund` | invoice, reason, payment_mode | POST | RECEPTIONIST, LAB_USER, PHARMACY_CASHIER, DISPENSER | Full refund of a counter bill from the current shift (credit note against the original). |
| `close` | counts, other_modes, explanation | POST | CASH_ROLES |  |
| `closing_view` | name |  | CASH_SUPERVISOR, ACCOUNTANT |  |
| `approvals` | branch |  | CASH_SUPERVISOR |  |
| `decide` | name, action, note | POST |  |  |
| `confirm_drop` | name, accept, note | POST |  |  |
| `report` | from_date, to_date, branch |  | CASH_SUPERVISOR, ACCOUNTANT | Shift history, day-end position per counter and mode, excess/short per cashier, open shifts, pending drops. |

## dashboard

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `summary` | branch, date, days |  | DOCTOR, ACCOUNTANT, CASH_SUPERVISOR |  |

## doctors

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `board` | branch |  | RECEPTIONIST, DOCTOR, NURSE, DEO |  |

## lab

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `context` |  |  | ORDERING, PATHOLOGIST |  |
| `create_order` | data | POST | ORDERING |  |
| `pay` | name, payment_mode, cash_tendered, discount_amount, discount_authorization | POST | LAB_USER, RECEPTIONIST |  |
| `request_discount` | name, amount, reason | POST | LAB_USER, RECEPTIONIST |  |
| `orders` | date, status, q, branch |  | ORDERING, PATHOLOGIST, NURSE |  |
| `order` | name |  |  |  |
| `samples` | status, branch |  | LAB_STAFF, NURSE |  |
| `sample_action` | name, action, reason, note | POST | LAB_STAFF, NURSE |  |
| `scan` | code |  | LAB_STAFF | Barcode scan anywhere in the lab: sample, order or patient MR. |
| `labels` | samples |  | LAB_STAFF, NURSE |  |
| `worklist` | status, department, branch |  | LAB_STAFF |  |
| `result_form` | invoice_item |  | LAB_STAFF, DOCTOR |  |
| `save_result` | invoice_item, values, text_result, attachment | POST | LAB_STAFF |  |
| `critical_log` | result, notified_person, method, read_back, note, parameter | POST | LAB_STAFF |  |
| `verify_list` | branch |  | PATHOLOGIST |  |
| `verify` | result, interpretation | POST |  |  |
| `send_back` | result, reason | POST |  |  |
| `amend` | result, reason | POST |  |  |
| `release` | name, partial | POST | LAB_STAFF |  |
| `resend_link` | name | POST | LAB_STAFF |  |
| `revoke` | name | POST | LAB_STAFF |  |
| `report_preview` | name |  | LAB_STAFF, DOCTOR, NURSE | Staff view of the full report (HTML), logged. |
| `outsourced` | branch |  | LAB_STAFF |  |
| `dispatch` | samples, reference_lab, courier, expected_back | POST | LAB_STAFF |  |
| `receive_outsourced` | invoice_item, attachment, values, text_result | POST | LAB_STAFF |  |
| `dashboard` | branch |  | LAB_STAFF |  |
| `report_open` | token | guest |  |  |
| `report_verify` | token, answer | guest POST |  |  |
| `report_pdf` | token | guest |  |  |

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
| `file` | name |  | REGISTER_ROLES, ACCOUNTANT, CASH_SUPERVISOR | Patient file: reception visits (with appointment + check-up status), invoices, payments, treatment costs, amount owed, |

## pharmacy

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `pos_context` | counter |  | POS_ROLES, REVIEWER |  |
| `search` | q, counter |  | POS_ROLES, REVIEWER, STORE_KEEPER |  |
| `quote` | lines, counter, prescription | POST | POS_ROLES, REVIEWER |  |
| `substitutes` | item_code, counter |  | POS_ROLES, REVIEWER |  |
| `prescription` | code |  | POS_ROLES, REVIEWER | Load a signed prescription by Rx number or patient MR (latest). |
| `request_discount` | gross, amount, reason, counter | POST | POS_ROLES |  |
| `checkout` | data | POST | POS_ROLES |  |
| `receipt` | name |  |  |  |
| `display_push` | state, counter | POST | POS_ROLES | The POS mirrors its cart to the counter's customer display. |
| `recent` | counter, limit |  | POS_ROLES, REVIEWER |  |
| `refund` | invoice, reason, items | POST | POS_ROLES |  |
| `tickets` | stage, branch |  | PIPE |  |
| `ticket` | name |  | PIPE |  |
| `action` | name, action | POST | roles[action] | One endpoint for pipeline stage changes (row-locked in the service). |
| `dashboard` | branch |  | PIPE, ADMIN |  |
| `display` | key | guest |  |  |

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

## store

| Method | Params | Flags | Roles | Summary |
|---|---|---|---|---|
| `context` | branch |  | STORE, PHARMACY_CASHIER |  |
| `stock` | warehouse, q, only_flags |  | STORE, PHARMACY_CASHIER | Batch-wise stock in packs / strips / units with expiry flags. |
| `receive` | supplier, warehouse, lines, bill_no, branch | POST | STORE_KEEPER |  |
| `requests` | branch |  | STORE, NURSE, LAB_USER |  |
| `create_request` | target, items, source | POST | STORE, NURSE, LAB_USER, PHARMACY_CASHIER | Pharmacy / IPD / lab ask the store for stock. items: [{item_code, qty (units)}]. |
| `transfer` | material_request | POST | STORE_KEEPER | Issue a request from the store by batch, earliest expiry first. |
| `expiry` | branch, window |  | STORE |  |
| `quarantine` | branch | POST | STORE_KEEPER |  |
| `supplier_return` | batch_no, qty, warehouse, reason | POST | STORE_KEEPER |  |
| `write_off` | batch_no, qty, warehouse, reason | POST | ADMIN | Expired / damaged stock written off (Material Issue) — Admin approval. |
| `counts` | branch |  | STORE_KEEPER, ADMIN |  |
| `count_sheet` | name |  | STORE_KEEPER, ADMIN | Blind sheet: system quantities are hidden until the count is submitted. |
| `count_create` | warehouse, scope, rack, category, branch | POST | STORE_KEEPER |  |
| `count_submit` | name, counts | POST | STORE_KEEPER |  |
| `count_approve` | name, approve, note | POST |  |  |
| `reports` | kind, branch, from_date, to_date |  | STORE_KEEPER, REVIEWER, ADMIN, ACCOUNTANT | Pharmacy reports: controlled register, substitutions, sales & margin, slow-moving, reorder, returns. |

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
