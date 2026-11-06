# 09 — Security, Privacy, Operations & Infrastructure

## Authentication
- Frappe **two-factor authentication** mandatory for PW Admin, PW Accountant, PW Cash Supervisor, PW Pathologist; optional (setting) for others.
- Password policy (Frappe), account lockout after failed attempts.
- **Idle session timeout** for staff (setting, e.g. 15 minutes on clinical screens); a lock screen keeps the page and asks for the password/PIN to resume.
- **Shared counter PCs:** optional quick user switch with a personal PIN so each action is recorded against the right person.
- Display devices and public portals use device keys / hashed tokens, never staff sessions.

## Field-level access
- Use **permlevels** so money roles (cashiers, dispenser, accountant) see patient name, MR no., bill and items — **not** diagnoses, notes, results or history. Lab PDFs only for clinical roles and the patient token.
- Test that hidden fields are hidden in API responses, not just the UI.

## Audit & access logs
- `track_changes` on all clinical and financial DocTypes; signed records follow amend rules (`02-opd.md`).
- **Access Log** for reads of sensitive data: patient history, prescriptions, lab results, CNIC reveal, report downloads — who, what, when, from where. Written by the whitelisted read endpoints.
- Audit screen `/audit` (Admin): filter by user, patient, document, date. Logs are append-only (no delete permission for any role).

## Data protection
- HTTPS only; encrypted sensitive fields (CNIC); encrypted backups.
- Consent records (`00-masters-patients.md`); messages carry no medical data.
- Data retention and patient data requests (export, correction) as Admin tools.
- Check current Pakistani data protection requirements with the clinic's legal advisor and record any obligations in `DECISIONS.md`.

## Backups & disaster recovery
- Hourly database backups plus daily full backups (database + files), **encrypted**, copied **off-site** (another server or S3-compatible storage).
- Retention: 7 hourly days, 30 daily, 12 monthly (configurable).
- **Restore drill:** restore to staging monthly and record the result in `docs/OPS.md` (time to restore, checks passed).
- Document recovery targets in `docs/OPS.md` (proposed: lose at most 1 hour of data, back online within 4 hours).

## Environments & deployment
- **Development**, **Staging** (production copy with patient data anonymized by a script), **Production**, **Training** (demo seeder data, reset nightly, red "TRAINING" banner).
- CI runs lint + tests on every push; deploys to staging automatically; production is a manual, tagged release with `bench migrate` and rollback notes.

## Monitoring
- Error tracking (e.g. Sentry) for Python and React; alert on new errors.
- Uptime check, disk/DB size, CPU/memory, **background job queue lag** and **scheduler health** (messages and reminders depend on them), failed message count, SSL expiry.
- Daily health summary to Admin.

## Internet and power outages
- Decide hosting in `DECISIONS.md`: **on-premise server** in the clinic (works on the LAN when internet is down; needs UPS and off-site backups) vs **cloud** (needs a backup internet link, e.g. 4G failover router). Recommendation: on-premise primary for counters and wards, with off-site backups; or cloud with dual internet.
- Check what ERPNext v16 POS can do offline and document it. Whatever the hosting, outbound messages, online payments and FBR reporting (if any) must **queue and retry** when internet returns.
- UPS for server, network switch, counter PCs and printers.

## Printing & hardware
- **Local print agent** (QZ Tray or equivalent) on counter PCs for **silent printing**: 80 mm receipts, barcode labels (lab samples, patient cards), A4 reports. Fall back to browser print if the agent isn't running.
- **Printer Map** in settings: counter/device → receipt printer, label printer, A4 printer.
- Hardware notes in `docs/OPS.md`: keyboard-wedge barcode scanners (1D + QR), 80 mm thermal printers, label printer, customer display screens (any browser), waiting-area TVs, tablets for finders and nursing, card terminals.

## Multi-branch
- Use **one Company with Branch as an accounting dimension** unless branches are separate legal entities (then Company per branch). Record the choice.
- Every transactional DocType, counter, warehouse, POS Profile, naming series, display device and cashier shift carries a branch.
- Users get **User Permissions** for their branch(es); lists, reports and realtime channels are branch-filtered.
- Patient records (MR, history) are shared across branches; billing, stock and cash are per branch.
- Branch overrides for settings (`00-masters-patients.md`).

## Data migration
- Import via the data manager (`/pw-data-manager`, CSV/XLSX with validation preview): patients (keep old MR numbers in a legacy field), doctors, items with **opening stock by batch and expiry**, lab templates, panels, opening balances (panel AR, doctor payables, advances). Dry-run mode and an import log.

## Performance targets (clinic LAN)
- Page load under 2 s; patient search under 500 ms; POS item add under 300 ms; queue/display updates within 2 s; lab report PDF under 3 s.
