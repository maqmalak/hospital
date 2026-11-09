# Progress

Status as of **2026-11-09**. Phases from `docs/CLAUDE.md` §8.

| Phase | State |
|---|---|
| 0 Foundation | **Done** (see deferred) |
| 1 Patients + OPD + Messaging | **Done** — 19 automated tests green |
| Ward map + kiosk (from Phase 3, owner request) | **Done** (masters, live map, allot/extend/transfer/discharge, kiosk) |
| 2 Pharmacy + Lab + Cash | **Done** (2026-11-07) |
| 3 IPD + ER | **Done** (2026-11-09) — W4, W18 green; full suite 37 green |
| 4 Online Visit | **Done** (2026-11-09) — W5 green; full suite 41 green |
| 5–7 | Not started — Phase 5 (Patient Comms + Feedback) waits for review |

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
Demo logins (`<name>@vvs.demo`, password `Demo@1234` or site_config `hv_demo_password`): admin, reception, reception2, reception.isb (Islamabad only),
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

## Deferred / known gaps
- **Staging + training sites, restore drill on staging**: need `bench new-site` (MariaDB root password) — scripts and steps in `docs/OPS.md`; decrypt-and-check drill done locally.
- **CI**: workflow file written (`.github/workflows/ci.yml`); no remote repo yet.
- Playwright E2E not written yet (backend tests cover the workflows); Vitest has one unit file.
- Sentry/uptime: hooks documented, not wired (needs DSN / monitoring host).
- Lab template editor screen (`/lab/templates`) not built yet — templates are edited in the desk for now.
- Thermal label / receipt printing tested through the browser print dialog only (QZ Tray silent print untested on real printers).
- Urdu/Arabic: navigation, actions and main clinical/billing terms translated; long help texts still English. Phase 3 screens are English-first (labels go through i18n where shared components are used).
- Phase 4: no online card gateway (Frappe Payments) yet — patients pay by wallet / bank transfer and staff confirm it; video calls are external links (no recording). Older Phase 2 lab test runs left a few test lab orders on patient MR-LHR-000057 (LAB-2026-00009 … 00022) — not removed, waiting for the owner's OK.
- Phase 3: bedside room portal `/patient/:token` and nursing stations are Phase 5 (the token is created now); insurance claims, doctor share on IPD bills and welfare funds are Phase 6; feedback after discharge waits for a `ipd_feedback` message template (Phase 5); LAMA / consent scans are linked by file URL (upload in the desk).
