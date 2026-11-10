# Hardening audit — Phase 7 (2026-11-11)

Security, privacy and operations audit (09-security-ops.md, W15, W17), run as the real demo users: **cashier@, finder@, accounts@, dispenser@** (must not see clinical data), **nurse@, dr.ayesha@, reception@, pathologist@, lab@** (must keep what they need), **admin@** (audit screen, health), and **Guest** over HTTP against the running site. Sessions for HTTP checks are minted on the server, so no passwords are used. Runner: `bench --site hospital execute hospital_vvs.devtools.qa_hardening.run`. Raw: `docs/qa-hardening-run.json`. Regression tests: `tests/test_phase7.py`.

**Final run: 98 checks, 97 pass, 0 fail, 1 warning (owner decision)** — first run 79 checks, 36 pass, 42 fail.

## Defects found and fixed

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | Copy previous prescription, live allergy / interaction check, Rx templates, diagnosis suggestions and IPD medicine check had no role check | A cashier, finder, accountant or dispenser could pull a patient's diagnoses, medicines and allergy alerts | Clinical roles only (`require_roles(*R.CLINICAL)`) |
| 2 | Prescription print data relied on DocType read, which the finder has | The finder could get the full prescription with diagnoses; reception could not reprint at all | Clinical roles + receptionist (reprint for the patient); queue *Print Rx* shown only to those roles |
| 3 | Diagnoses, tests and examination notes were permlevel 0 on Prescription | The finder read them through the standard API (`frappe.client.get`) | Moved to permlevel 1 — clinical roles only; the finder still sees the medicines to pick |
| 4 | POS prescription lines carried the safety-alert and override text | The pharmacy cashier saw "Allergy: penicillin" and the doctor's override reason | Alert / override text only for clinical roles (pharmacist reviewer keeps it) |
| 5 | Bed map, bed history, today's OPD slips, slip preview, payer preview, pharmacy receipt and duplicate-patient search had no role check | Admission reasons, patient lists, payer cover and receipts open to every staff login | Role checks matching the screens that use them |
| 6 | 39 endpoints took a `branch` argument without checking it (OPD queue, lab orders / samples / worklist, pharmacy tickets, store, roster, doctor share, ER board …) | With strict branch lock, a user could still read another branch by passing its name | Shared `scope_branch()` refuses a branch the user is not in |
| 7 | Internal SQL helper `appointments.shift_cond` was whitelisted | Callable from outside (returned SQL text) | No longer an API method |
| 8 | No limit on wrong passwords at the idle lock screen and at counter approval (supervisor password) | Unlimited guessing of a staff password from a logged-in counter | 5 wrong tries in 10 minutes → blocked (per user / per approver) |
| 9 | Pharmacy display endpoint (public, device key) was not rate-limited | Device-key guessing | 900 calls / 10 min per IP (screens poll every few seconds) |
| 10 | 17 DocTypes kept no version history — incl. **Controlled Drug Register, Doctor Share Ledger, FBR Invoice**, Display Device, message / Rx templates, masters | Changes to regulated and money records not traceable | Every DocType tracks changes by default; only append-only logs are exempt |
| 11 | **W17:** branch user permissions also filtered Patient | A nurse at branch B could not open a patient registered at branch A (spec: MR shared by all branches) | Patient *Registered at Branch* ignores user permissions; billing, stock and cash stay per branch |
| 12 | `docs/API.md` was out of date | Methods missing from the API reference | Regenerated; the audit checks every method is listed |

## Added

- `setup/anonymize.py` — anonymize patients on a staging / training copy (names, phones, CNIC, address, guardian, photo; copies on slips, invoices, results, beds; message phones). Refuses on any site whose name does not start with *staging* / *training* (or `hv_allow_anonymize`). `only=[MR…]` for a trial on a few records.
- `setup.demo.seed_all` — one command for a fresh demo / training site (company, pharmacy company, every phase's demo data, branch + counter access; `opd_day=1` adds a day of live OPD traffic).
- `devtools/qa_hardening.py` — this audit; re-run before every release.

## Owner decisions (not changed by the audit)

| Item | Now | Recommendation |
|---|---|---|
| Two-factor login (Admin, Accountant, Cash Supervisor, Pathologist) | Roles flagged; switched **off** on this demo site | Clinic Settings → Enforce two-factor + System Settings → Enable 2FA before go-live |
| Desk session length | 170 hours | 12 hours (the React app also locks after 15 idle minutes) |
| Login lockout | 10 wrong tries, 60 s wait | 5 tries, 300 s |
| Full restore drill on staging | Quick decrypt check passes; `staging.hospital` not created (needs MariaDB root) | Create staging, restore, migrate, anonymize — steps in OPS.md |
| Lab analyzer interface | Not built (optional) | Only if an analyzer with LIS output is bought |

## Performance (clinic LAN targets, 09-security-ops.md)

| Check | Target | Measured |
|---|---|---|
| patient search by MR | 500 ms | 3 ms |
| patient search by name | 500 ms | 7 ms |
| patient search by phone | 500 ms | 3 ms |
| OPD queue (whole branch) | 1000 ms | 6 ms |
| patient history | 2000 ms | 20 ms |
| POS item search | 300 ms | 37 ms |
| POS item add (price + stock) | 300 ms | 30 ms |
| lab report PDF | 3000 ms | 564 ms |
| React app page load (/hms) | 2000 ms | 200 54 ms |
| session boot over HTTP | 1000 ms | 200 13 ms |
| OPD queue over HTTP | 1000 ms | 200 15 ms |

## Scenarios and checks

### H01 role guards — cashiers, finders and accounts cannot reach clinical data
- ✅ **H01-cashier-1** cashier: copy previous prescription (diagnoses) is refused
- ✅ **H01-cashier-2** cashier: live allergy / interaction check is refused
- ✅ **H01-cashier-3** cashier: prescription print data is refused
- ✅ **H01-cashier-4** cashier: patient history is refused
- ✅ **H01-cashier-5** cashier: IPD medicine safety check is refused
- ✅ **H01-cashier-6** cashier: diagnosis suggestions are refused
- ✅ **H01-finder-1** finder: copy previous prescription (diagnoses) is refused
- ✅ **H01-finder-2** finder: live allergy / interaction check is refused
- ✅ **H01-finder-3** finder: prescription print data is refused
- ✅ **H01-finder-4** finder: patient history is refused
- ✅ **H01-finder-5** finder: IPD medicine safety check is refused
- ✅ **H01-finder-6** finder: diagnosis suggestions are refused
- ✅ **H01-accounts-1** accounts: copy previous prescription (diagnoses) is refused
- ✅ **H01-accounts-2** accounts: live allergy / interaction check is refused
- ✅ **H01-accounts-3** accounts: prescription print data is refused
- ✅ **H01-accounts-4** accounts: patient history is refused
- ✅ **H01-accounts-5** accounts: IPD medicine safety check is refused
- ✅ **H01-accounts-6** accounts: diagnosis suggestions are refused
- ✅ **H01-dispenser-1** dispenser: copy previous prescription (diagnoses) is refused
- ✅ **H01-dispenser-2** dispenser: live allergy / interaction check is refused
- ✅ **H01-dispenser-3** dispenser: prescription print data is refused
- ✅ **H01-dispenser-4** dispenser: patient history is refused
- ✅ **H01-dispenser-5** dispenser: IPD medicine safety check is refused
- ✅ **H01-dispenser-6** dispenser: diagnosis suggestions are refused
- ✅ **H01-cashier-7** cashier: bed map (admission reasons) is refused
- ✅ **H01-cashier-8** cashier: bed history is refused
- ✅ **H01-cashier-9** cashier: today's OPD slips list is refused
- ✅ **H01-finder-7** finder: bed map (admission reasons) is refused
- ✅ **H01-finder-8** finder: bed history is refused
- ✅ **H01-finder-9** finder: today's OPD slips list is refused
- ✅ **H01-finder-10** finder: payer preview (panel / insurance of a patient) is refused
- ✅ **H01-nurse-11** nurse: pharmacy receipt (money) is refused
- ✅ **H01-12** doctor copies the previous prescription
- ✅ **H01-13** receptionist can reprint a prescription for the patient
- ✅ **H01-14** nurse opens patient history
- ✅ **H01-15** cashier opens a pharmacy receipt
- ✅ **H01-16** cashier loads the signed prescription into the POS

### H02 field-level — hidden fields are missing from API responses
- ✅ **H02-1** finder reads a prescription without diagnoses
- ✅ **H02-2** finder reads a prescription without examination notes
- ✅ **H02-3** finder still sees the medicines to pick
- ✅ **H02-4** nurse (clinical) sees the diagnoses
- ✅ **H02-5** cashier reads the patient without allergies / chronic conditions / blood group
- ✅ **H02-6** POS prescription lines carry no allergy / interaction alert text for the cashier
- ✅ **H02-7** patient search returns no clinical fields
- ✅ **H02-8** cashier cannot read a lab result
- ✅ **H02-9** accountant reads an OPD slip without vitals or complaint
- ✅ **H02-10** over HTTP too: finder's prescription has no diagnoses

### H03 public surface — Guest reaches only the reviewed public endpoints
- ✅ **H03-1** no new public (Guest) endpoint outside the reviewed list
- ✅ **H03-2** every public endpoint is rate-limited
- ✅ **H03-3** all 284 staff endpoints refuse a Guest over HTTP
- ✅ **H03-4** token links with a made-up token return nothing
- ✅ **H03-5** the mock card page rejects an unknown payment

### H04 endpoint audit — every staff endpoint checks role, permission or branch
- ✅ **H04-1** no staff endpoint without a server-side check (or a reviewed reason)
- ✅ **H04-2** internal SQL helper shift_cond is not callable from outside

### H05 brute force — wrong passwords are limited on the lock screen and counter approval
- ✅ **H05-1** lock screen: the 6th wrong password in 10 min is blocked
- ✅ **H05-2** counter approval: the 6th wrong supervisor password in 10 min is blocked
- ✅ **H05-3** login lockout after repeated failures is on

### H06 W15 security — 2FA, idle lock, access log and audit screen
- ✅ **H06-1** 2FA flag set on Admin, Accountant, Cash Supervisor, Pathologist roles
- ⚠️ **H06-2** 2FA switched on for the site — off on this demo site — turn on before go-live (Clinic Settings → Enforce two-factor; System Settings → Enable 2FA)
- ✅ **H06-3** idle lock minutes reach the browser (lock screen)
- ✅ **H06-4** password strength policy
- ✅ **H06-5** opening a patient's history writes the access log (who, what, when)
- ✅ **H06-6** admin audit screen shows who viewed the history
- ✅ **H06-7** access log cannot be deleted (even by an admin)
- ✅ **H06-8** access log cannot be edited
- ✅ **H06-9** a doctor cannot open the audit screen
- ✅ **H06-10** cashier cannot reveal a full CNIC (and the try is logged)
- ✅ **H06-11** denied CNIC reveal is in the access log

### H07 audit trail — clinical and financial documents keep a version history
- ✅ **H07-1** every app document (except append-only logs) tracks changes
- ✅ **H07-2** ERPNext money documents track changes

### H08 branch lock — users stay inside their branch
- ✅ **H08-1** strict branch access is on
- ✅ **H08-2** all 22 staff users are tied to a branch
- ✅ **H08-reception:** reception: another branch's OPD queue is refused
- ✅ **H08-reception:** reception: another branch's OPD slips is refused
- ✅ **H08-lab: anoth** lab: another branch's orders is refused
- ✅ **H08-cashier: a** cashier: any other branch is refused
- ✅ **H08-6** cashier is offered only counters whose POS profile lists them
- ✅ **H08-7** cashier cannot open a shift on another counter (Handover 3)

### H09 performance — 09-security-ops.md targets
- ✅ **H09-1** patient search by MR under 500 ms
- ✅ **H09-2** patient search by name under 500 ms
- ✅ **H09-3** patient search by phone under 500 ms
- ✅ **H09-4** OPD queue (whole branch) under 1000 ms
- ✅ **H09-6** patient history under 2000 ms
- ✅ **H09-7** POS item search under 300 ms
- ✅ **H09-8** POS item add (price + stock) under 300 ms
- ✅ **H09-9** lab report PDF under 3000 ms
- ✅ **H09-10** React app page load (/hms) under 2000 ms
- ✅ **H09-5** session boot over HTTP under 1000 ms
- ✅ **H09-11** OPD queue over HTTP under 1000 ms

### H10 operations — backups, health, staging anonymize, docs, demo seeder
- ✅ **H10-1** newest database backup decrypts and contains the tables (restore quick check)
- ✅ **H10-2** a backup was taken in the last 26 hours
- ✅ **H10-3** scheduler is on and running
- ✅ **H10-4** health check reports disk, DB size and queues
- ✅ **H10-5** receptionist cannot open the health check
- ✅ **H10-6** anonymize refuses to run on this (non-staging) site
- ✅ **H10-7** docs/API.md lists every whitelisted method
- ✅ **H10-8** one-command demo seeder exists (setup.demo.seed_all)
- ✅ **H10-9** docs folder has ops, API, decisions, progress and QA reports
