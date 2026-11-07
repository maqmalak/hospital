# Progress

Status as of **2026-11-06**. Phases from `docs/CLAUDE.md` §8.

| Phase | State |
|---|---|
| 0 Foundation | **Done** (see deferred) |
| 1 Patients + OPD + Messaging | **Done** — 19 automated tests green |
| Ward map + kiosk (from Phase 3, owner request) | **Done** (masters, live map, allot/extend/transfer/discharge, kiosk) |
| 2 Pharmacy + Lab + Cash | Next — waiting for review |
| 3–7 | Not started |

## How to run

```
cd ~/erpnext-react
bench --site hospital serve --port 8011                 # desk + built React at http://hospital.localhost:8011/hms
cd apps/hospital_vvs/frontend && npm run dev            # dev server http://hospital.localhost:5183 (proxy → :8011)
bench --site hospital execute hospital_vvs.setup.company.run   # company, branches, accounts, POS profiles (re-run safe)
bench --site hospital execute hospital_vvs.setup.demo.seed     # demo data (re-run safe)
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

## Deferred / known gaps
- **Staging + training sites, restore drill on staging**: need `bench new-site` (MariaDB root password) — scripts and steps in `docs/OPS.md`; decrypt-and-check drill done locally.
- **CI**: workflow file written (`.github/workflows/ci.yml`); no remote repo yet.
- Playwright E2E not written yet (backend tests cover the workflows); Vitest has one unit file.
- Sentry/uptime: hooks documented, not wired (needs DSN / monitoring host).
- Lab template editor screen (`/lab/templates`) not built yet — templates are edited in the desk for now.
- Thermal label / receipt printing tested through the browser print dialog only (QZ Tray silent print untested on real printers).
- Urdu/Arabic: navigation, actions and main clinical/billing terms translated; long help texts still English.
