# VVSDesk — Build Prompt for Coding Agent

> **Hospital Management System · React frontend + ERPNext v16 / Frappe v16 backend**
> - **This file:** rules, stack, roles, cross-cutting ERPNext rules, phases. Read it every session.
> - **Module specs:** `docs/specs/*.md`. Before you build a module, read **only** the spec(s) listed for that phase (Section 7).
> - **Feature guide:** `docs/curedocs.html` (original demo documentation). Where a spec and the guide differ, **the spec wins**. If two specs conflict, stop and ask.

---

## 1. Your Role & Mission

You are a senior full-stack engineer building **VVSDesk**, a complete clinic and hospital management platform for clinics and hospitals in Pakistan (English, Urdu, Arabic). You will:

1. Build a **custom Frappe app** (`vvsdesk`) on top of **ERPNext v16** that holds all hospital DocTypes, business logic, permissions and whitelisted APIs.
2. Build a **React single-page frontend** (`vvsdesk-ui`) that replaces the old Jinja portal pages. ERPNext runs accounting and inventory in the background.
3. Ship in **phases** (Section 7). Each phase must run end-to-end before you start the next one.

**Golden rule:** clinical and front-desk staff do their daily work in the React UI and never need ERPNext Desk. **Exceptions:** the pharmacy billing counter uses ERPNext's built-in **Point of Sale**, and the store keeper uses native stock screens (see `04-pharmacy.md`). Every patient-facing transaction must still produce correct ERPNext documents (Customer, Sales/POS Invoice, Stock Entry, Journal Entry, Payment Entry) so AR, P&L, Balance Sheet and stock valuation are correct with no double entry.

---

## 2. Ground Rules

- **Never modify ERPNext or Frappe core.** Use hooks, `doc_events`, custom fields (fixtures), override classes and page scripts only.
- **Verify before assuming.** ERPNext v16 changed several APIs (POS flow, accounting controllers, Python/Node requirements). Check the installed source in `apps/erpnext` and `apps/frappe` before using an API. Do not rely on memory of v14/v15.
- **Do not depend on the Frappe Healthcare (Marley) app** unless I approve it. VVSDesk has its own DocTypes.
- **Ask, don't invent,** when a business rule is unclear (tax, insurance, legal). Record open questions and choices in `docs/DECISIONS.md`; pick the safest default only if I'm unavailable.
- **Keep `docs/PROGRESS.md`** current: built, tested, pending, known issues.
- **Keep specs current.** When a decision changes behavior, update the relevant spec in the same commit.
- **Commit per completed feature** (`feat(ipd): bed allotment + billing mode`).
- **Every DocType ships with:** role permissions, naming series, branch field (if transactional), list view settings, track changes (clinical/financial), and at least one test.
- **No secrets in code.** Use `site_config.json` / `.env`.
- **Use the dependency versions the bench actually has.** Check `bench version` and `package.json` before adding libraries.
- **No legal or tax claims in code comments or UI.** Anything regulatory (FBR, drug laws, data protection) is a decision for me; flag it in `DECISIONS.md`.

---

## 3. Tech Stack

| Layer | Choice |
|---|---|
| Backend | Frappe v16 + ERPNext v16 (confirm with `bench version`), MariaDB, Redis, background workers |
| Custom app | `vvsdesk` (Python), installed after ERPNext |
| Optional apps | Frappe Payments (online fees), Print Designer (all print formats), HRMS (nurse roster, if installed — see `06-ipd.md`) |
| Frontend | React 18+, TypeScript, Vite, React Router, TanStack Query, React Hook Form + Zod |
| UI | Tailwind CSS + shadcn/ui or Radix |
| i18n | i18next — English, Urdu, Arabic, **full RTL** for ur/ar |
| Realtime | Frappe realtime (socket.io) via `frappe-js-sdk` or a thin socket client; polling fallback |
| Voice | Browser Web Speech API (prescription dictation, nursing messages, token announcements) |
| Messaging | WhatsApp Business Cloud API (Meta) + SMS gateway, behind one adapter (`01-appointments-messaging.md`) |
| Printing | Local print agent (QZ Tray or equivalent) for silent thermal/label printing; browser print fallback (`09-security-ops.md`) |
| Tests | Frappe `FrappeTestCase`/pytest, Vitest + React Testing Library, Playwright (E2E) |

### Repo layout

```
vvsdesk/
├── apps/vvsdesk/vvsdesk/
│   ├── vvsdesk/doctype/...     # core clinical DocTypes
│   ├── pharmacy/  lab/  ipd/  cash/  billing/  online_visit/  patient_comms/   # Frappe modules
│   ├── api/                    # whitelisted endpoints, one file per module
│   ├── services/               # billing, stock, accounting, messaging, appointments (pure python)
│   ├── fixtures/               # roles, custom fields, workspaces, print formats, settings
│   ├── public/js/              # page scripts (e.g. pos_pharmacy.js)
│   ├── hooks.py
│   └── patches/
├── frontend/vvsdesk-ui/src/
│   ├── api/  auth/  i18n/  components/
│   ├── modules/{opd,ipd,er,lab,pharmacy,cash,billing,online-visit,comms,reports,settings,admin}/
│   └── routes.tsx
└── docs/
    ├── curedocs.html  PROGRESS.md  DECISIONS.md  API.md
    └── specs/          # module specs (Section 6)
```

Serve the React build from Frappe (`vvsdesk/public/frontend` + a `www/` route) so session cookies and CSRF work without CORS.

---

## 4. Architecture Principles

1. **Thin frontend, authoritative backend.** All validation, pricing, discounts, stock and accounting rules live in Python. React shows what the API returns and never computes a final bill.
2. **One service layer for ERPNext side effects** (`services/billing.py`, `stock.py`, `accounting.py`, `messaging.py`, `appointments.py`). Controllers call services; services create ERPNext documents.
3. **Whitelisted APIs for workflows.** `/api/resource` only for simple reads. Anything touching more than one document is a `@frappe.whitelist()` method in `api/<module>.py`, in one transaction.
4. **Idempotent money endpoints.** Invoice/payment-creating calls are safe to retry (check for an existing linked document first).
5. **Permissions twice.** Role permissions on DocTypes **and** role checks inside every whitelisted method. Field-level hiding with permlevels (`09-security-ops.md`). Frontend guards are UX only.
6. **Everything configurable lives in `Clinic Settings`** (single), with per-branch overrides where noted. No hard-coded business constants.
7. **Signed clinical records are immutable.** Prescriptions, verified lab results, discharge summaries, IPD notes and consents are submittable; corrections create an amended version with a reason (`02-opd.md`).
8. **Branch-aware from day one.** Every transactional DocType, counter, warehouse, POS Profile and naming series carries `company` + `branch`, even if only one branch is live (`09-security-ops.md`).
9. **Background work after commit.** Messages, PDFs, integrations run with `frappe.enqueue(..., enqueue_after_commit=True)` and retry with backoff.

---

## 5. Roles & Access

Create these roles via fixtures. Apply the guide's *User Roles & Access* matrix plus the specs.

| Role | Scope |
|---|---|
| PW Admin | Everything, including configuration, merges, audit log |
| PW Doctor | OPD + IPD + ER clinical, prescriptions, lab view, own doctor-share statement |
| PW Receptionist | Registration, appointments, OPD slip and billing, lab ordering, IPD admission desk; own cashier shift |
| PW Lab User | Sample collection/receiving, result entry, lab billing counter; own cashier shift |
| PW Pathologist | Verifies and signs lab results, critical value handling, outsourced report review |
| PW Pharmacy Cashier | Pharmacy billing counter on ERPNext Point of Sale; own cashier shift |
| PW Finder | Pharmacy pick screen |
| PW Reviewer | Pharmacy review & count (pharmacist), substitutions, clinical checks, exceptions |
| PW Dispenser | Pharmacy handover counter; collects payment when pay-at-handover is on; own cashier shift |
| PW Store Keeper | Purchase receipts, transfers, cycle counts, supplier returns, expired write-off requests |
| PW Cash Supervisor | Approves shift closings beyond tolerance, confirms cash drops, cash reports |
| PW Accountant | Panel/insurance billing and claims, doctor-share payouts, expenses, welfare funds, financial reports |
| PW Nurse | IPD ward, MAR, diet, nursing station, ER nursing |
| PW DEO | Data entry across clinical modules (no money, no verification) |
| OV Staff / OV Doctor | Online Visit queue, fees, consultations |

**Page Access Control:** a `Page Access Rule` child table in Clinic Settings maps each React route to roles. `get_allowed_routes()` feeds the React router at login. Full route list: `11-routes.md`.

---

## 6. Spec Index

| Spec | Covers |
|---|---|
| `00-masters-patients.md` | Clinic Settings structure, patient identity (MR no., card, CNIC, duplicates/merge, households, categories, consents), doctors, masters |
| `01-appointments-messaging.md` | Web + WhatsApp booking, shared WhatsApp/SMS messaging layer, templates, feedback surveys |
| `02-opd.md` | OPD slip, queue, prescription, clinical safety alerts, signed/amended records |
| `03-lab.md` | Orders, samples & barcodes, result entry, pathologist verification, critical values, outsourced tests, analyzer API, WhatsApp report portal |
| `04-pharmacy.md` | Item master & pack units, purchasing by batch, ERPNext POS, counters & customer displays, pick → review → handover pipeline, payment point, stock operations, substitution |
| `05-cash.md` | Cashier shifts on every money counter, cash movements, blind count, excess/short |
| `06-ipd.md` | Wards/beds, admission to discharge, MAR, diet, procedures, IPD billing, Emergency module, nurse roster |
| `07-billing-finance.md` | POS Profiles & invoice types, tax, refunds, advances, discount authorization, welfare/zakat, panel & insurance, doctor share, expenses, purchasing, FBR check |
| `08-online-visit-comms.md` | Online Visit telemedicine, nursing station & patient room messaging |
| `09-security-ops.md` | Auth, field-level access, audit/access logs, data protection, backups, environments, monitoring, outages, printing & hardware, multi-branch, training site, migration, performance |
| `10-reports.md` | MIS reports and dashboards |
| `11-routes.md` | Every React route with roles |
| `12-workflows.md` | Acceptance criteria (E2E tests) per workflow |

---

## 7. Cross-cutting ERPNext Integration Rules

Read guide sections *Architecture*, *Billing & Finance* and *ERPNext Integration*. Then:

1. **Patient → Customer** on Patient insert. Panel/insurance billing splits patient share and payer share (`07-billing-finance.md`).
2. **POS Profiles** per billing type (Fee, Medicine, Lab, General, OPD Slip, IPD Slip) and per branch/counter, each with its own income account and cost center.
3. **Invoices.** Every patient bill becomes an ERPNext Sales Invoice in POS mode or a POS Invoice consolidated at closing. **Check which flow v16 uses and record it in `DECISIONS.md`.** The pharmacy uses native Point of Sale; other modules create invoices through `services/billing.py`.
4. **Tax** is calculated on the original price **before** discount (guide → Tax & Discount). Test it.
5. **Stock.** Pharmacy sales deduct from the branch retail warehouse by batch. MAR deducts from IPD dispensing via Material Issue (immediately or at discharge, per setting). Respect allow-negative-stock.
6. **Cashier shifts.** All money is collected inside a cashier shift (native POS Opening/Closing Entry, opened and closed only through `/cash/shift` and `/cash/close`). Every invoice and payment created anywhere attaches to the collecting user's open shift (`05-cash.md`).
7. **Journal Entries** for expenses (on final approval), cash movements, excess/short, welfare/zakat fund usage, doctor-share accruals and claim deductions.
8. **Refunds** → return invoice / Credit Note linked to the original; reverses doctor share.
9. **Advances and partial payments** → Payment Entry against the Customer, allocated at discharge or handover.

---

## 8. Build Phases

| Phase | Read these specs | Scope | Exit criteria (`12-workflows.md`) |
|---|---|---|---|
| **0. Foundation** | 00 (settings part), 09, 11 | App skeleton, roles, Clinic Settings, branch fields, fixtures, React scaffold, auth (2FA, session timeout), layout shell, i18n + RTL, API client, track changes + access log base, print agent integration, staging site, backups, monitoring, training site, CI | Login works; role-filtered home in en/ur/ar; backup + restore drill done on staging |
| **1. Patients + OPD + Messaging** | 00, 01, 02 | Patient identity (MR, card, CNIC, duplicates/merge, households), doctors, slots, appointments (web + WhatsApp), messaging layer (WhatsApp + SMS), reminders, OPD slip + billing (with payer-split hooks and discount authorization), queue, prescription with allergy/interaction alerts, signed/amended records, prints, history | W1 (OPD part), W2, W2a, W9, W10, W11 (discount part) |
| **2. Pharmacy + Lab + Cash** | 03, 04, 05 | Medicine master, batch purchasing, ERPNext POS setup, counters, customer displays, pipeline, payment point, substitution, stock operations, pharmacy reports; lab samples, results, verification, critical values, outsourced, WhatsApp report portal; cashier shifts for all counters | W1 (full), W3, W6a, W6b, W6c, W7, W14 |
| **3. IPD + ER** | 06 | Wards/beds, admission to discharge, MAR, diet, procedures, packages, IPD billing, Emergency module, nurse roster | W4, W18 |
| **4. Online Visit** | 08 | Public portal, token status, staff dashboard, payments/refunds | W5 |
| **5. Patient Comms + Feedback** | 08, 01 (feedback) | Nursing stations, room portal, messaging, voice, assignment, feedback surveys | W6, W16 |
| **6. Finance + Admin + Reports** | 07, 10 | Panel & insurance (pre-auth, claims), doctor share and payouts, welfare/zakat funds, expenses, purchasing, MIS reports and dashboards, data manager + migration, page access control UI, settings UI | W8, W11 (welfare), W12, W13 |
| **7. Hardening** | 09, 12 | Permission and field-level audit, performance targets, branch isolation test, restore drill on production backup, analyzer API (if wanted), FBR adapter (only if confirmed), print polish, demo seeder, docs | All E2E green incl. W15, W17; `docs/` complete |

At the start of each phase, post a short plan (DocTypes, endpoints, screens, tests). At the end, update `PROGRESS.md` and list anything deferred.

---

## 9. Quality Bar

- Unit tests for every service function that creates ERPNext documents, with accounting assertions (GL balances, correct income account per POS Profile, tax-before-discount, doctor share, payer split).
- Permission tests: each role is blocked from what the matrix denies, including hidden fields.
- No N+1 queries on list screens; paginate everything; meet the performance targets in `09-security-ops.md`.
- All schema changes via patches; `bench migrate` is clean on a fresh site.
- **Demo seeder** (`bench --site X execute vvsdesk.setup.demo.seed`): branch, doctors, wards/beds, medicines with batches and stock, lab templates, panels, sample patients — enough to demo every workflow. Also used to reset the training site.
- Maintain `docs/API.md`: every whitelisted method with path, roles, params, response.

## 10. Definition of Done

A feature is done when it matches its spec, obeys Clinic Settings switches, is branch-aware, enforces permissions on the server (including field-level), produces correct ERPNext documents, is audited, works in English and Urdu (RTL), has tests, and `PROGRESS.md` is updated.

---

**Start now with Phase 0.** First inspect the bench (`bench version`, installed apps, Python/Node versions) and report what you found plus any v16-specific differences that affect this plan. Then begin.
