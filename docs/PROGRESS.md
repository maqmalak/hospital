# Progress

Status as of **2026-11-11**. Phases from `docs/CLAUDE.md` §8.

| Phase | State |
|---|---|
| 0 Foundation | **Done** (see deferred) |
| 1 Patients + OPD + Messaging | **Done** — 19 automated tests green |
| Ward map + kiosk (from Phase 3, owner request) | **Done** (masters, live map, allot/extend/transfer/discharge, kiosk) |
| 2 Pharmacy + Lab + Cash | **Done** (2026-11-07) |
| 3 IPD + ER | **Done** (2026-11-09) — W4, W18 green; full suite 37 green |
| 4 Online Visit | **Done** (2026-11-09) — W5 green; full suite 41 green |
| 5 | Done 2026-11-10 — patient comms + feedback (D-44) |
| 6 | Done 2026-11-10 — doctor share (D-43), welfare, panels, claims, expenses, purchasing, finance reports (D-46) |
| 7 Hardening | Done 2026-11-11 — audit 97/98 (D-53), E2E 20 green, recurring expenses (D-54) |

## How to run

```
cd ~/erpnext-react
bench --site hospital serve --port 8011                 # desk + built React at http://hospital.localhost:8011/hms
cd apps/hospital_vvs/frontend && npm run dev            # dev server http://hospital.localhost:5183 (proxy → :8011)
bench --site hospital execute hospital_vvs.setup.company.run   # company, branches, accounts, POS profiles (re-run safe)
bench --site hospital execute hospital_vvs.setup.demo.seed     # demo data (re-run safe)
bench --site hospital execute hospital_vvs.setup.demo_phase2.seed
bench --site hospital execute hospital_vvs.setup.demo_phase3.seed   # wards rates, diets, procedures, packages, nurses + roster, admissions, ER
bench --site hospital execute hospital_vvs.setup.demo_phase4.seed   # OV staff (ovstaff@vvs.demo), OV doctors (dr.sana, dr.farah), sample requests
bench --site hospital run-tests --app hospital_vvs
```
Demo logins (`<name>@vvs.demo`, password `demo@123` or site_config `hv_demo_password`): admin, reception, reception2,
nurse, supervisor, accounts, lab, pathologist, pharmacist, cashier, store, deo, dr.ayesha, dr.usman, dr.sana, dr.farah, dr.imran.

## Phase 0 — built
- App skeleton, 6 modules (Hospital VVS, OPD, Appointments, Messaging, Billing, IPD); DocTypes generated from `devtools/schema_*.py` (`devtools/generate.py`).
- 16 roles (install hook), 2FA flags on the four money/verification roles.
- **Clinic Settings** (single, 11 tabs): general, module switches (22), printing + printer map, POS profiles per billing type & branch, warehouses, IPD, appointments, messaging, billing (discount rules/approvers), security (idle lock), page access (31 routes); per-branch overrides.
- Company, 2 branches, Branch accounting dimension, 6 income accounts, 5 cost centres, 12 warehouses, 5 modes of payment, **12 POS profiles** (6 billing types × 2 branches), service items.
- React app (Vite + TS + Tailwind, Restaurant OS UI kit, clinical teal theme, light/dark): login with 2FA step, role-filtered control board, sidebar from Page Access Rules, branch switcher, **English / Urdu / Arabic with full RTL**, idle lock screen, training banner, realtime (socket.io) with polling fallback, print adapter (QZ Tray when running, browser print otherwise), 80 mm / CR80 / A4 templates.
- Clinical Access Log (append-only), track changes on clinical/financial DocTypes, audit screen.
- Monitoring endpoint `api.ops.health` + daily health summary to PW Admin; encrypted backup + verify scripts (`docs/OPS.md`).

## Phase 1 — built
- **Patients**: MR per branch (`MR-LHR-000123`), Customer on insert, encrypted CNIC + hash + mask + logged reveal, live duplicate check (CNIC / phone + fuzzy name / name + age), create-anyway reason, households by phone, consents with history, categories/payer, allergies, conditions, long-term medicines, patient card with MR-only QR, merge tool with preview, typed-MR confirmation and merge log.
- **Doctors** (schedule, fees, PMDC no., signature), leave & blocked dates (block free slots), departments, specializations, allergies → generics/classes, ICD-10 diagnoses (33 seeded), generics/drug classes, medicines on Item (generic, class, strength, form, max dose, Rx flag).
- **Appointments**: slot generation, holds with row lock (race test), one booking service for reception / web / WhatsApp, auto- or staff-confirm, reschedule/cancel cut-offs, reminders (evening before + N hours), no-show release, OTP for existing phones, unpaid-booking cap, rate-limited public API. Screens: `/appointments` (channel tabs, actions, booking dialog), public `/book-appointment` (mobile, en/ur/ar, payment proof upload), `/my-appointment/:token`.
- **Messaging**: Message Template (11 events, en + ur SMS text), Message Log, consent, quiet hours, retry with backoff, SMS fallback, resend, signature-verified webhook, **WhatsApp bot** (language → menu → speciality → doctor → date → slot → household member / new patient → confirm → payment / proof → confirmation; re-prompt; handoff; 30-minute expiry), inbox with 24-hour window and test-mode patient simulator.
- **OPD**: POS-style counter (doctor tiles with live queue counts, vitals + BMI, services, discount authorization, payer split, payment modes, cash tendered/change, idempotent save, 80 mm slip with big token and QR), free follow-up window, queue with priorities and realtime board, waiting-room TV with chime + English/Urdu voice.
- **Prescription workspace**: medicine search (brand/generic) + favourites + templates + copy previous, live **allergy / interaction / duplicate-therapy / dose** alerts, override reason stored per line, ICD-10 and lab chips, voice dictation, Ctrl+Enter sign & print (A4/A5), amend with reason → v2 "Amended", v1 Superseded.
- **History** timeline (visits, prescriptions with versions, overrides, appointments, bed stays) + vitals trend chart; every open logged.
- **Discount approvals** (realtime), **message log** (resend), **dashboard** (KPIs, 14-day trend, collection by mode, channel mix, demographics, top diagnoses, doctor table), **6 MIS Script Reports** with React viewer + CSV, **settings editor**, **masters editor**.

## UI round 2 (2026-11-07, owner requests)
- Doctors board (gradient cards / list, weekly strip, today's queue, leave, edit), Patients board (cards / list, KPIs, chips, paging), new login page.
- Registration redesigned (section cards, webcam photo, live card preview, duplicate panel), Urdu name auto-filled from English, Gulzar Urdu font everywhere.
- Patient file on every patient: reception visits with appointment + check-up status, invoices, payments, treatment costs, amount owed (patient / payer), procedures and bed log.
- Appointments: gradient header with KPIs, **calendar Day / Multi-day (3–14) / Week / Month** with every slot, click a free slot to book; Requests tab + live alert; WhatsApp status per booking with Resend; priority; "any available doctor".
- Web portal redesigned (5 steps, doctor cards with next free day, morning/afternoon/evening slots, sticky summary + hold timer, consent tick box, add-to-calendar).
- Fixed: times before 10:00 printed as "9:00:" (now hhmm helper everywhere).

## Tests (`hospital_vvs/tests/test_phase1.py`, 22 green; Vitest 6)
Identity (MR, customer, CNIC encrypted/masked, duplicate + merge moves visits/invoices/customer, reveal logged, cashier blocked, clinical fields hidden from cashier API) · OPD (POS invoice on OPD profile & income account, branch, GL balanced, token, queue, free follow-up no invoice, panel split) · tax before discount · discounts (limit, approval, self-approval blocked, reason required, unapproved discount blocks the slip) · safety (allergy + Major interaction block, override, immutability, amend v2/Superseded, dose parsing) · appointments (hold race, book, reschedule, cancel, leave hides slots, expired hold released) · WhatsApp bot (Urdu booking for a new household member with payment proof; reception handoff) · messaging (no consent → skipped; WhatsApp failure → SMS fallback) · role-filtered routes.

## Phase 2 — built (2026-11-07)
- **Cash** (`/cash/shift`, `/cash/close`, `/cash/approvals`, `/cash/reports`): counter shifts on POS Opening Entry (one per counter), opening float per mode, live expected cash, pay in / pay out / cash drop (supervisor confirms), refunds as credit notes, **blind count by denomination**, tolerance → auto close or supervisor approve / recount / cashier liability, POS Closing Entry + Over/Short journal, reports (day-end by counter × mode, excess/short per cashier, open/stale shifts, pending drops, uncollected drafts). Billing is refused outside an open shift.
- **Laboratory** (`/lab/orders`, `/lab/samples`, `/tests`, `/lab/verify`, `/lab/outsourced`): 14 test templates with age/gender ranges and critical limits, order + payment, samples per container with 50×25 mm QR labels, scan to collect/receive, reject → recollection, result entry with live flags and previous values, **critical value alert + mandatory notification log**, pathologist verify / send back / amend (versioned), partial release, outsourced dispatch with purchase bill and report upload, TAT tracking.
- **Public lab report** `/hms/lab-report/<token>` (verification, view, PDF with download limit, revoke / resend).
- **Pharmacy POS** `/medicine_invoice` (Restaurant style): scan / search, Pack-Strip-Unit pricing from batch MRP, FEFO batch split shown per line, near-expiry and Rx / controlled checks, waiting prescriptions, same-generic substitutes, discount with approval, 5 payment modes, cash tendered / change, customer display mirror, 80 mm receipt with collection token, F2/F4/F9 keys.
- **Dispensing pipeline**: `/pharmacy/pick` (rack-ordered pick list, scan item/batch, wrong item/batch refused, not-found → exception), `/pharmacy/review` (prescription side by side, count check, substitute swap, send back), `/pharmacy/dispense` (call / recall, collect payment at handover, scan receipt, hand over), `/pharmacy/tickets` board with stage times. Controlled Drug Register written on every sale/return.
- **Store**: `/store/receive` (purchase receipt by batch, expired refused), `/store/transfers` (requests issued earliest-expiry-first), `/store/returns` (expiry watch, quarantine, supplier return, admin write-off), `/store/cycle-count` (blind count, variance approval → Stock Reconciliation), `/pharmacy/items` (batch stock in pk/strip/units), `/pharmacy/reports` (sales & margin, controlled register, substitutions, slow-moving, returns, CSV).
- **Display devices**: customer display, pharmacy token board with chime, OPD waiting TV, ward bed board — device-key links, managed at `/display/devices`.
- Prescription workspace lab chips now come from the active lab templates, with an urgent toggle.

## Tests — Phase 2 (`tests/test_phase2.py`, 10; full suite 32 green)
Pharmacy packs + FEFO + expired blocked + Rx rule + return; pipeline race (two finders) + wrong batch refused; pay at handover; controlled register · store transfer, cycle count, quarantine, supplier return · lab order → samples → results → critical log → verify → release → token link (verify, lock, expiry) · outsourced dispatch → purchase bill → report · cash shift open/close blind count, tolerance, approval, liability · W1 prescription → lab order + draft medicine invoice · display page keeps the signed-in session.

## Phase 3 — built (2026-11-09)
- **Admission** (`/ipd`, admit from the bed map or the list): patient, bed, doctor, billing mode (self / panel / insurance with an approved pre-auth / welfare), package, agreed rate, planned days, optional advance. Bed → Occupied, Patient Comms profile + bedside token, wristband print (QR = MR only). Readmission within 30 days is linked.
- **Chart** (`/ipd/:name`): overview (bed history, vitals, doses due, nurses on duty), signed notes and ward rounds, **medication orders → MAR** (dose times from frequency, allergy / interaction / dose checks with override reason, approval gate, Given / Missed / Refused / Held, PRN doses, stop with reason), vitals with trend and intake/output, diet orders, procedures with team and signed consent, lab orders on the running bill, charges (service, consumable from the IPD store, oxygen by hours), discharge.
- **Drug round** `/ipd/mar` (all wards, overdue first, one-tap chart, bulk approve), **diet list** `/ipd/kitchen`, **pre-auth** `/ipd/pre-auth`.
- **Billing** `/ipd_slip`: running bill by type or line, package cover, payer split capped by pre-auth, discount via the existing approval flow, advances / settlement / refund as Payment Entries in the cashier shift, interim bill, advance request and final bill prints (A4), final invoice (+ payer invoice) with the admission's advances allocated, cancel final bill (accountant / supervisor).
- **Discharge**: summary signed (Normal / LAMA with form / Referred / Expired with death details) → clearance checklist (summary, labs, doses, procedures, bill, dues) with hold and reasoned override → final bill → complete → bed Cleaning → Available, comms profile off, open orders closed. Summary print (A4).
- **Emergency** `/er`: register known or **unknown** patient (temporary MR), arrival mode, medico-legal record, triage (Red/Yellow/Green or 5-level, setting) with vitals, live board by triage and waiting time, doctor and bay, medicines / labs / procedures / notes / vitals as in IPD, disposition: home / referred / LAMA / expired (bills the visit: OPD-style POS or running bill) or **admit** (charges, orders, labs and advances move to the admission). Admin merges an identified unknown patient from the visit.
- **Nurse roster** `/roster` on HRMS Shift Type / Shift Assignment: week grid wards × shifts, nurse in charge, repeat next week. On-duty nurses show on the chart and drug round.
- **Reports** `/ipd_report`: occupancy and census by ward, admissions / discharges per day, average stay, revenue by charge type, discharges by type and doctor, ER visits by triage and outcome, outstanding after discharge.
- Bed map: allot = admit, transfer and extend go through the admission, discharge opens the chart, IPD Slip opens the bill. Beds occupied before Phase 3 were turned into admissions by a patch.

## Tests — Phase 3 (`tests/test_phase3.py`, 5; full suite 37 green)
Bed days by midnight census + minimum · nursing per started shift across a transfer · package cover with limits · **W4**: insurance admission refused without pre-auth → admit with pre-auth (bed occupied, comms token) → ward round → MAR gate, stock issued from IPD store, charge → transfer to ICU → diet → procedure blocked until consent → oxygen, ad-hoc, lab → advance in the cashier shift → clearance hold (unsigned summary, pending lab) → summary signed → final bill with every charge type, one line per bed segment, payer 70 % invoice, advance allocated, GL balanced → discharge held for dues → settle → discharged, bed Cleaning → Available, comms off · **W18**: unknown patient → Red at the top of the board → lab + medicine → admitted with ER charges carried → merged into the real patient. Phase 1/2 test helpers now skip stale demo shifts and temporary patients.

## Phase 4 — built (2026-11-09)
- **Public form** `/hms/online-visit` (mobile first, English / Urdu / Arabic with RTL), 4 steps: patient (phone; registered phones verify a WhatsApp/SMS code and pick a household member, otherwise name / age / sex / city) → problem (complaint, symptom chips, since when, conditions, current medicines, allergies, up to 5 photos, preferred speciality) → payment (fee, wallet / bank instructions, method, transaction ID, receipt upload, or pay later) → review with message consent. Result: a private status link.
- **Status page** `/hms/online-visit/<token>`: progress (sent → accepted → completed), doctor and time, **Join video call** button, fee state, pay later, refund details, cancel while pending; the prescription (view / print) after the last 4 phone digits. Refreshes every 20 s.
- **Staff dashboard** `/ov-staff` (OV Staff; OV Doctors see their own): live board New / Accepted / Completed / Cancelled, counts (fees to check, refunds due), request detail with photos and receipt, **fee received / not found**, accept (doctor, time, auto Jitsi link or pasted link) or reject, change time / link, cancel, **refund**. OV Doctor: open the call, **Write prescription** (prescription workspace with the request's complaint, medicines and allergy note), complete with notes and follow-up. Report `/ov-staff/report`.
- Messages (WhatsApp / SMS, Urdu + English): request received (with link), accepted (doctor, time, video link), rejected, completed, cancelled, refunded.
- Accepting registers the patient if new (MR at the online branch). Signing the prescription links it to the request; the pharmacy draft and lab order rules apply as for OPD.
- Token endpoints (online visit and lab report) now send `Cache-Control: no-store`.

## Tests — Phase 4 (`tests/test_phase4.py`, 4; full suite 41 green)
**W5**: Urdu request → token (hash only) → status pending, no link → fee confirmed (invoice + JazzCash payment) → accepted, patient registered, Jitsi link on the status page → complete refused without a prescription → prescription signed from the workspace links itself → completed → prescription hidden until the 4-digit check, wrong digits refused, right digits show it · cancel → refund (credit note + payment back, reference on the status page) · patient self-cancel while pending · registered phone must be verified to link a patient · `no-store` header. Tests now block database commits (the wrong-PIN path commits its lock), so test records no longer leak into the site.

## Change — contract pharmacy and reception money (2026-11-09, D-38)
- New company **VVS Pharmacy (Contract)** (`bench --site hospital execute hospital_vvs.setup.pharmacy_company.run`): own accounts, bank, JazzCash / Easypaisa wallets, warehouses, POS profile per branch; the Medicine billing type, store screens and pharmacy counters use it. Demo medicine stock (108 batches, not the expired one) was handed over with `pharmacy_company.move_demo_stock` (demo only).
- Counters **Pharmacy 1** and **Pharmacy 2** still have demo shifts open from 7 Nov (cashier@ and Administrator, the latter with a closing waiting for the supervisor); they switch to the contractor as soon as those shifts are closed at `/cash/close` / `/cash/approvals`. Handover 3 and Pharmacy ISB already switched.
- Ward medicine orders → signed IPD/ER prescription → pharmacy waiting list; the patient pays the pharmacy. No medicines on the IPD bill; MAR is nursing only. Stopping an order withdraws an unpaid pharmacy draft.
- Online visit fees are taken by **reception in their shift** (Cash / Bank Transfer / JazzCash / Easypaisa) and refunded from the shift; reception sees `/ov-staff` for that. Hospital wallets now have their own accounts (JazzCash Wallet, Easypaisa Wallet).
- Tests: 42 green (new: ward order billed by the pharmacy; fee in the reception shift; online desk cannot post money).

## Change — Reception counter (Restaurant OS style, 2026-11-09, D-39)
- `/counter` for receptionists (and cash supervisors): catalogue of doctors (fee, waiting count), services and lab tests; patient search or quick new patient; **Patient bills** tab with the open admission (advance, or settle the final bill), unpaid online visit fees and old dues.
- Cart cards with kind colour, quantity, Rs discount (authorization per billing type), and Normal / Elderly / Disabled / Urgent priority on consultations (moves the token up the doctor's queue). Server prices every line (free follow-up, panel share).
- Payment: tender tiles, keypad, exact / quick cash, split across modes with transaction IDs, change; 80 mm receipt with big OPD tokens; customer display window; hold / resume; receipts panel with reprint and refund by line; F-key shortcuts; lock (F12).
- Offline: sales queue in the browser and sync every 30 s / on reconnect; posted once (client reference); failed ones stay listed with the reason.
- Shift page now offers each role only its own counters (reception does not see the contractor's pharmacy counters).
- Tests: `tests/test_counter.py` (3) — one cart with split tender, change only from cash, priority, idempotent retry, refund of one line; IPD advance split over two modes and refunded; offline sync with one failing sale. Full suite 45 green. Checked in the browser as reception2: Rs 2,000 cash + Rs 5,500 JazzCash over a consultation and an IPD advance (RCPT-2611-00001, token 1). That demo shift at Reception 2 is still open.

## Pharmacy QA (2026-11-09)
Billing at handover is now on (Collect payment at = Handover counter). Full journey cart → pick → review → handover tested as the four demo users (browser + `tests/test_pharmacy_qa.py`, 7 cases); 6 defects found and fixed (dispenser shift missing handover sales, partial supply, split payment with transaction IDs, 4 priorities, draft label, review refresh / double submit). Report: [QA-PHARMACY.md](QA-PHARMACY.md). Full suite 52 green.

## Deferred / known gaps
- **Staging + training sites, restore drill on staging**: need `bench new-site` (MariaDB root password) — scripts and steps in `docs/OPS.md`; decrypt-and-check drill done locally.
- **CI**: workflow file written (`.github/workflows/ci.yml`); no remote repo yet.
- Playwright E2E: 20 browser tests (`frontend/e2e`, D-54) for the main workflows; IPD, online visit and pharmacy pipeline screens are covered by backend tests only. Vitest has one unit file.
- Sentry/uptime: hooks documented, not wired (needs DSN / monitoring host).
- Thermal label / receipt printing tested through the browser print dialog only (QZ Tray silent print untested on real printers).
- Urdu: every screen text, list value, status and menu label (2,301) — D-55, checked in CI. Arabic falls back to English for most screens (128 translated).
- Phase 4: no online card gateway (Frappe Payments) yet — patients pay by wallet / bank transfer and staff confirm it; video calls are external links (no recording). Older Phase 2 lab test runs left a few test lab orders on patient MR-LHR-000057 (LAB-2026-00009 … 00022) — not removed, waiting for the owner's OK.
- Phase 3: bedside room portal `/patient/:token` and nursing stations are Phase 5 (the token is created now); insurance claims, doctor share on IPD bills and welfare funds are Phase 6; feedback after discharge waits for a `ipd_feedback` message template (Phase 5); LAMA / consent scans are linked by file URL (upload in the desk).

## Pharmacy POS upgrade (2026-11-09) — D-40
`/medicine_invoice` rebuilt in Restaurant OS style: top bar (Prescription, Drafts, Return, Invoices, Shift summary / close, display, lock, F-keys), cards / list with category tabs, Walk-in / Patient / Credit customer search (name, MR, mobile, CNIC), quick prescription search, discount in % or Rs within the setup limit (over-limit → supervisor or blocked), pay now (split tender) **or** pay at handover chosen per sale, credit sales on account, offline queue. New endpoints: `customers`, `find_prescriptions`, `invoices`, `shift_summary`, `offline_bundle`, `sync`. Tests: 56 green (4 new POS option cases).

## Branch and counter lock (2026-11-10) — D-41
Users locked to their branch (strict) and to counters whose POS Profile lists them (Applicable for Users); shift page, open shift, pharmacy POS and checkout enforce it. Setup `hospital_vvs.setup.access.run`. Tests: 59 green (3 new access cases).

## POS polish (2026-11-10) — D-42
Paper prescription for walk-ins; cash in / out (F6) inside the POS; Restaurant OS style top bar, cart panel, invoice management (cards / list, status tiles, view / reprint / return) and customer display (`/medicine_invoice/display`, same design for the reception counter and display devices); hide / show left menu on every page and full-page POS. Invoice list now limited to the user's branches. Tests: 62 green.

## Doctor share (2026-11-10) — D-43 (Phase 6 part, built early on request)
Commission rules, ledger earned as bills are paid, reversals on refunds / cancelled payments, payouts to the doctor's supplier with Payment Entry, accountant screen `/doctor-share` (owed / earned / taken back / paid, statement, rules, pay, apply to past bills), doctor's `/my-share`, desk section *Accounts & Doctor Share*. Demo rules: Dr Ayesha (OPD 50 %, lab referrals 10 %), Dr Usman (OPD 40 %), Dr Sana (OPD 45 %, online fees 60 %), applied to November bills. Tests: 67 green (5 new).

## Phase 5 — patient comms + feedback (2026-11-10) — D-44
Built: Nursing Station, Comms Message, Station Broadcast, Patient Feedback; bedside page `/patient/:token` (quick buttons, text, Urdu/English voice-to-text, live replies, broadcasts), nursing station `/ns` and `/ns/:station` (urgent first, unread, waiting time vs target, thread, quick replies, broadcast, on-duty nurses, chime), `/pc-assign`, `/pc-report`; feedback job (OPD / discharge / pharmacy, delay, gap, link expiry), public `/feedback/:token`, WhatsApp 1–5 reply, admin `/feedback` with follow-ups and report; desk section *Patient Comms & Feedback*. Tests: W6 and W16 plus token, branch and gap cases — full suite 72 green. Browser: bedside "I am in pain" → station urgent → reply answered in 17 s.
Pending / owner: Meta approval of `visit_feedback` (EN/UR); bedside tablets per room; which wards' stations to staff.

## Islamabad branch removed (2026-11-10) — D-45
Single branch (Lahore Main). Everything Islamabad deleted or moved to Lahore; stock reversed to Main Store LHR; all users on Lahore Main. Tests: 72 green.

## Phase 6 — finance (2026-11-10) — D-46
Built: shared payer rule (panel / insurer / welfare) in OPD, lab and IPD billing; Welfare Scheme + Welfare Approval, donations, fund balances (`/welfare`); panels & insurers setup, statements, payments with deductions, ageing (`/panels`); Insurance Claim workflow with deductions or billing the patient (`/claims`); Expenses with receipt and amount-based approval levels → Journal Entry (`/expenses`); purchase order / invoice lists with approval (`/purchase_order`, `/purchase_invoice`); `/finance` overview; Script Reports Revenue Analysis, Payer Ageing, Welfare Fund Utilization, Expenses by Category; pending task done: **lab template editor `/lab/templates`** (tests, parameters, normal / critical ranges by sex and age, price, turnaround, outsourcing). Demo: State Life and Pakistan Telecom panel show their balances; "Zakat Welfare Fund" linked to a scheme. Tests: W8, W11 (welfare), W12 (panel + insurance) — full suite 80 green.
Not built / owner: recurring expense templates. (Card gateway and FBR: see D-47.)

## Card gateway (mock), FBR day-end, WhatsApp templates (2026-11-10) — D-47
Online Payment + mock checkout `/pay/:token`, Pay by card on the online visit status page, payment links for unpaid bills (`/online-payments`), Card Gateway Clearing account + mode *Card (online)*; FBR Invoice log, day-end run (scheduler + Report now on `/fbr`), FBR number + QR on pharmacy receipt reprints; 38 Meta-ready WhatsApp templates in `docs/whatsapp/`. Site: gateway on (Mock), FBR on (Mock, Medicine). Tests: 85 green (5 new).
Owner: choose the card gateway and add its keys; FBR POS ID / NTN / token and scope from the tax advisor; submit the WhatsApp templates in Meta.

## Handwritten lab reports, print & hand over (2026-11-10) — D-48
Report file (scan / photo / outside PDF) on the result screen; merged into the patient PDF; portal download of the original file; WhatsApp link on release / resend; Print & hand over with recipient recorded; wider template editor. Tests: 87 green (2 new).

## Lab QA audit (2026-11-10) — D-49
81/81 checks after fixing 3 defects (reject after result, lab-user amendment, refund not cancelling tests); priority tags Normal / Priority / Urgent; lab orders Today / Week / Month / Custom filter; ~36 realistic lab orders in every state. Report: [QA-LAB.md](QA-LAB.md). Tests: 92 green (5 new regression tests).

## Lab report print (2026-11-10) — D-50
Elegant A4 report with logo, QR verification page, signatory with digital-signature line (no stamp), remarks, previous result column with date, page numbers; result-entry history of the last 5 results. Tests: 93 green.
Owner: upload the logo (and optionally a signature image) (Clinic Settings → General / Lab → Lab report print); set the signatory name, title, PMDC no. and licence line.

## OPD QA audit (2026-11-10) — D-51
52/52 live checks after fixing prescription quantity (blank → 1 unit) and shift-closing denominations; pending patients on `/pw-prescription`; English → Urdu field with phonetic keyboard and learned corrections; `scripts/opd_demo.sh` daily demo data. Report: [QA-OPD.md](QA-OPD.md). Tests: 97 green.

## OPD nurse vitals stage (2026-11-10) — D-52
Register → token → **nurse vitals** (`/opd/vitals`) → waiting for doctor → with doctor → done; queue in four columns; OPD audit 61/61 (9 new nurse checks). Tests: 97 green.

## Phase 7 — hardening (2026-11-11) — D-53
Live audit 97/98 (first run 36/79): 12 defects fixed — clinical endpoints and Rx print limited to clinical roles (+ reception reprint), Prescription diagnoses / tests / notes at permlevel 1, cashier POS lines without allergy alert text, role checks on bed map / slips / payer preview / receipts / duplicate search, branch argument checked on 39 endpoints, internal SQL helper no longer an API, wrong-password limit on lock screen and counter approval, display endpoint rate-limited, version history on 17 more DocTypes (Controlled Drug Register, Doctor Share Ledger, FBR Invoice …), patients shared across branches (W17), API.md regenerated. Performance targets all met (search 3–7 ms, history 20 ms, POS item add 30 ms, lab PDF 0.6 s, /hms 54 ms). Added staging anonymize and `setup.demo.seed_all`. Report: [QA-HARDENING.md](QA-HARDENING.md). Tests: 107 green (10 new, W15 + W17).
Owner: switch on 2FA; shorter desk sessions (12 h) and stricter lockout (5 / 300 s); create `staging.hospital` for the full restore drill (needs MariaDB root); analyzer interface only if wanted.

## E2E tests + recurring expenses (2026-11-11) — D-54
Playwright drives the installed Chrome against the running site (`cd frontend && npm run e2e`; `E2E_PASSWORD=… npm run e2e` adds the real login): 20 green — W1 OPD end to end (register → token → nurse vitals → doctor → signed prescription with medicine), W15, W17, POS, lab filters, public pages, recurring expenses. Found on the way: the health check called a running scheduler stale (fixed); the first E2E runs signed 5 prescriptions without medicine on E2E test patients RX-2026-000414…418 (test bug, fixed; records left as signed diagnosis-only prescriptions).
Recurring expenses on `/expenses` → Recurring: rent / utilities / contracts drafted automatically when due (standing bill → straight to approval). Demo: Building rent Rs 350,000 and Internet Rs 18,500 from 1 Dec. Tests: 110 green (3 new).

## Urdu on every screen (2026-11-11) — D-55
All screens in Urdu (RTL), including IPD / ER, pharmacy, finance and the public pages: a build-time step translates literal text, labels, placeholders, list values, statuses and template parts from one dictionary (2,301 entries checked by `npm run i18n:check`, strict in CI). Names, medicines, numbers and units stay as entered. E2E: 23 green (3 new Urdu / English cases).

## IPD & ER audit (2026-11-11) — D-56
70/70 live checks (admission desk, insurance pre-auth, rounds, vitals, MAR, transfer, diet, procedure + consent, charges, labs, advances, discount approval, discharge clearance, final bill, refund, insurer split, ER triage → disposition → admit / refer / identify, reports, access). Fixed: impossible vitals accepted, discharge without refunding the extra advance, final bill crash on 100 % insurer cover, ER identify failing for the admin. Report: [QA-IPD.md](QA-IPD.md). Tests: 114 green (4 new).

## Desktop home (2026-11-11) — D-57
`/pw-home` is now the Desktop in the real-estate style (glossy app icons with live counts and hover playbooks, Needs Attention, Quick Links, Recent Activity panel), fed by `dashboard.home`, role-aware. Menu: Desktop, OPD (was Front desk), Insights & Online (merged). Urdu complete; E2E 23 green.

## Users & roles (2026-11-11) — D-58
Admin screen `/users` (Admin → Users & roles): staff accounts with roles, branch and password / reset link; roles with their people and screens; page-access grid (screen × role). No lock-out guards. Tests: 117 green (3 new); E2E 22 green; Urdu complete.

## Buying, assets, consumption (2026-11-11) — D-59
New menu group *Buying & Assets*: dashboard, suppliers, material requests, purchase orders (approve → receive by batch / location → bill), receipts, supplier invoices (pay), fixed-asset register with depreciation, consumption by department. Demo data: Pakistani pharma suppliers and medicine orders for the contract pharmacy; Rs 92.5 M of hospital machinery, plant, furniture, building works and IT as depreciating assets; consumables bought and issued weekly to OPD / Lab / IPD / OT / ER. Tests: 120 green (3 new); E2E 25 green; Urdu complete.
Owner: confirm useful lives / depreciation rates with the auditor; real supplier list, NTNs and credit terms.

## Lab payment at reception (2026-11-11) — D-60
Both walk-in flows pay at the reception counter: lab-made orders show at the counter (*From the lab*), reception collects with Rs / % discount and prints the receipt, the lab sees Paid / Unpaid and samples only after payment. Tests: 123 green (3 new); E2E 25 green; Urdu complete. Fresh encrypted backup taken (the backup cron in OPS.md is not installed on this machine — owner to schedule).
