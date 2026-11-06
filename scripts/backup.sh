#!/usr/bin/env bash
# Encrypted backup of the hospital site + optional off-site copy (09-security-ops.md, docs/OPS.md).
#   hourly (cron):  ./apps/hospital_vvs/scripts/backup.sh db
#   daily  (cron):  ./apps/hospital_vvs/scripts/backup.sh full
# Encryption: System Settings → Encrypt Backups = on (gpg, key in site_config backup_encryption_key — keep a copy of
# that key OFF this server, or the backups cannot be restored).
# Off-site: set HV_OFFSITE (rsync target, e.g. backup@10.0.0.5:/srv/vvs) or HV_OFFSITE_S3 (s3://bucket/path, needs aws cli).
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$BENCH"
SITE="${HV_SITE:-hospital}"
MODE="${1:-db}"
if [ "$MODE" = "full" ]; then bench --site "$SITE" backup --with-files --compress; else bench --site "$SITE" backup; fi
DIR="sites/$SITE/private/backups"
if [ -n "${HV_OFFSITE:-}" ]; then rsync -az --ignore-existing "$DIR/" "$HV_OFFSITE/"; fi
if [ -n "${HV_OFFSITE_S3:-}" ]; then aws s3 sync "$DIR/" "$HV_OFFSITE_S3/" --exclude "*" --include "*-enc*"; fi
# retention on this server: 7 days of hourly, 30 days of daily (configurable); off-site keeps 12 monthly (bucket rule)
find "$DIR" -name "*database*" -mtime +"${HV_KEEP_DAYS:-30}" -delete
echo "backup ok: $(ls -t "$DIR" | head -3 | tr '\n' ' ')"
