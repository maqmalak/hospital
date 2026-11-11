# Operations

## Recovery targets (proposed — confirm with the clinic)
Lose at most **1 hour** of data (RPO), back online within **4 hours** (RTO).

## Backups
- Encryption: System Settings → **Encrypt Backups** = on (gpg). The key is `backup_encryption_key` in `sites/hospital/site_config.json`.
  **Keep a copy of that key outside this server** (password manager / sealed envelope) — without it no backup can be restored.
- Schedule (crontab of the bench user):
  ```
  0 * * * *  cd ~/erpnext-react && ./apps/hospital_vvs/scripts/backup.sh auto >> logs/hv-backup.log 2>&1
  30 2 * * * cd ~/erpnext-react && ./apps/hospital_vvs/scripts/backup.sh full >> logs/hv-backup.log 2>&1
  ```
- **Installed on this machine 2026-11-11.** `auto` = DB backup every hour, plus a full backup whenever none was taken in the last 24 h —
  cron skips jobs while a PC sleeps (this one slept 03:00–23:00 on 11 Nov and missed every backup), so the first hourly run after waking catches up.
  The script sets its own PATH (cron has none for `bench`). Log: `logs/hv-backup.log`.
- Off-site: set `HV_OFFSITE=user@host:/path` (rsync) or `HV_OFFSITE_S3=s3://bucket/path` in the cron line. Retention: 7 days hourly, 30 days daily
  on the server (`HV_KEEP_DAYS`), 12 monthly on the off-site bucket (lifecycle rule).

## Daily jobs
| When | Job | How |
|---|---|---|
| Hourly + 02:30 | Backups (automatic) | crontab, see *Backups*; check `logs/hv-backup.log`, run `scripts/verify_backup.sh` |
| Morning | Health check | `bench --site hospital execute hospital_vvs.api.ops.health` — scheduler fresh, 0 failed jobs, last backup today. `errors_24h` counts test refusals too: look at Error Log grouped by title |
| Morning | Yesterday's shifts | closed by the demo scripts on the demo site (`opd_demo.close_stale_shifts`); a count *Pending Approval* needs the cash supervisor (`/cash/approvals`) |
| Demo site only | OPD demo data | `scripts/opd_demo.sh` (12 new patients, 30 visits) |
| Demo site only, after OPD | IPD / ER demo data | `scripts/ipd_demo.sh` — cleaned beds back to Available, yesterday's ER visits closed (admit / home / referred), new ER arrivals triaged, longest stays discharged (summary → final bill → settlement or refund → bed to Cleaning), today's OPD patients admitted with an advance, vitals / nursing note / diet / due doses for every inpatient |

## Restore drill (monthly)
1. Quick check (any time, touches no site): `./apps/hospital_vvs/scripts/verify_backup.sh` — decrypts the newest DB backup and counts tables.
2. Full drill on staging:
   ```
   bench new-site staging.hospital --admin-password <x>                  # needs MariaDB root, once
   bench --site staging.hospital restore <db-enc.sql.gz> --with-public-files <files> --with-private-files <pfiles> --encryption-key <key>
   bench --site staging.hospital migrate
   bench --site staging.hospital execute hospital_vvs.setup.anonymize.run   # anonymize patients (refuses on non-staging / training sites)
   ```
   Then log in, open a patient history, an invoice and the dashboard.

| Date | Backup file | Time to restore | Checks | Result |
|---|---|---|---|---|
| 2026-11-06 | 20261106_220651-hospital-database-enc.sql.gz (16 MB) | decrypt + unzip < 1 s | Patient, OPD Slip, Prescription, Appointment, Sales Invoice, GL Entry present | Pass (decrypt check only — staging site not created yet) |
| 2026-11-11 | 20261110_180017-hospital-database-enc.sql.gz | decrypt + unzip < 1 s | tables present (hardening audit H10-1) | Pass (decrypt check only — staging site not created yet) |

## Browser tests (E2E)
`cd apps/hospital_vvs/frontend && npm run e2e` — Playwright with the installed Google Chrome against http://hospital.localhost:8011 (`E2E_BASE_URL`, `E2E_SITE`, `E2E_BENCH` to change). Sessions are created on the server; set `E2E_PASSWORD` to include the login-form test. Report: `frontend/e2e-report/`.

## Security audit
Before every release: `bench --site hospital execute hospital_vvs.devtools.qa_hardening.run` (roles, hidden fields, public endpoints, brute force, audit trail, branch lock, performance, backups, docs) → `docs/QA-HARDENING.md`.
Fresh demo / training data: `bench --site <site> execute hospital_vvs.setup.demo.seed_all`.

## Environments
| Env | Site | Notes |
|---|---|---|
| Development | `hospital` (this bench) | developer_mode, test messaging mode |
| Staging | `staging.hospital` (to create) | production copy, anonymized |
| Training | `training.hospital` (to create) | `bench --site training.hospital set-config hv_training_site 1` → red TRAINING banner; nightly reset = restore a clean backup + `hospital_vvs.setup.demo.seed` |
| Production | client server | manual tagged release, `bench migrate`, rollback = previous tag + restore |

## Sessions
Each staff user may have 5 signed-in sessions at once (User → Simultaneous Sessions); past that Frappe signs out the oldest. The audit and
browser tests sign out the sessions they create (`devtools/e2e.end_sessions`), so running them never logs out staff using the same demo user.

## Monitoring
- `GET /api/method/hospital_vvs.api.ops.health` (PW Admin): scheduler on/stale, failed jobs 24 h, queue length, failed/queued messages, disk, DB size, last backup, error-log count.
- Daily summary to every PW Admin as a Notification (scheduler `daily`).
- Error tracking (Sentry for Python + React) and uptime/SSL checks: add when a DSN and a monitoring host are chosen.

## Hardware (counters, wards)
Keyboard-wedge 1D + QR scanners (every patient field accepts a scan), 80 mm thermal printers, label printer (patient cards / sample labels), QZ Tray on counter PCs for silent printing
(Clinic Settings → Printing → Printer Map: PC name → printers; set the PC name once per browser in localStorage `hv.device`), waiting-area TVs (`/hms/display/queue`), ward kiosk screens (`/hms/display/ward`), UPS for server, switch, counters and printers.

## Ports on this bench
Desk/API **8011**, React dev **5183** (`hospital.localhost`), socket.io 9000 (shared), Redis 13000/11000 (shared).
