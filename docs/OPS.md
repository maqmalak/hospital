# Operations

## Recovery targets (proposed — confirm with the clinic)
Lose at most **1 hour** of data (RPO), back online within **4 hours** (RTO).

## Backups
- Encryption: System Settings → **Encrypt Backups** = on (gpg). The key is `backup_encryption_key` in `sites/hospital/site_config.json`.
  **Keep a copy of that key outside this server** (password manager / sealed envelope) — without it no backup can be restored.
- Schedule (crontab of the bench user):
  ```
  0 * * * *  cd ~/erpnext-react && ./apps/hospital_vvs/scripts/backup.sh db   >> logs/hv-backup.log 2>&1
  30 2 * * * cd ~/erpnext-react && ./apps/hospital_vvs/scripts/backup.sh full >> logs/hv-backup.log 2>&1
  ```
- Off-site: set `HV_OFFSITE=user@host:/path` (rsync) or `HV_OFFSITE_S3=s3://bucket/path` in the cron line. Retention: 7 days hourly, 30 days daily
  on the server (`HV_KEEP_DAYS`), 12 monthly on the off-site bucket (lifecycle rule).

## Restore drill (monthly)
1. Quick check (any time, touches no site): `./apps/hospital_vvs/scripts/verify_backup.sh` — decrypts the newest DB backup and counts tables.
2. Full drill on staging:
   ```
   bench new-site staging.hospital --admin-password <x>                  # needs MariaDB root, once
   bench --site staging.hospital restore <db-enc.sql.gz> --with-public-files <files> --with-private-files <pfiles> --encryption-key <key>
   bench --site staging.hospital migrate
   bench --site staging.hospital execute hospital_vvs.setup.anonymize.run   # Phase 7: anonymize patient data on staging
   ```
   Then log in, open a patient history, an invoice and the dashboard.

| Date | Backup file | Time to restore | Checks | Result |
|---|---|---|---|---|
| 2026-11-06 | 20261106_220651-hospital-database-enc.sql.gz (16 MB) | decrypt + unzip < 1 s | Patient, OPD Slip, Prescription, Appointment, Sales Invoice, GL Entry present | Pass (decrypt check only — staging site not created yet) |

## Environments
| Env | Site | Notes |
|---|---|---|
| Development | `hospital` (this bench) | developer_mode, test messaging mode |
| Staging | `staging.hospital` (to create) | production copy, anonymized |
| Training | `training.hospital` (to create) | `bench --site training.hospital set-config hv_training_site 1` → red TRAINING banner; nightly reset = restore a clean backup + `hospital_vvs.setup.demo.seed` |
| Production | client server | manual tagged release, `bench migrate`, rollback = previous tag + restore |

## Monitoring
- `GET /api/method/hospital_vvs.api.ops.health` (PW Admin): scheduler on/stale, failed jobs 24 h, queue length, failed/queued messages, disk, DB size, last backup, error-log count.
- Daily summary to every PW Admin as a Notification (scheduler `daily`).
- Error tracking (Sentry for Python + React) and uptime/SSL checks: add when a DSN and a monitoring host are chosen.

## Hardware (counters, wards)
Keyboard-wedge 1D + QR scanners (every patient field accepts a scan), 80 mm thermal printers, label printer (patient cards / sample labels), QZ Tray on counter PCs for silent printing
(Clinic Settings → Printing → Printer Map: PC name → printers; set the PC name once per browser in localStorage `hv.device`), waiting-area TVs (`/hms/display/queue`), ward kiosk screens (`/hms/display/ward`), UPS for server, switch, counters and printers.

## Ports on this bench
Desk/API **8011**, React dev **5183** (`hospital.localhost`), socket.io 9000 (shared), Redis 13000/11000 (shared).
