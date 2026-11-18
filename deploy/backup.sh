#!/usr/bin/env bash
# Lyallpur Medical Complex (hospital_vvs) — nightly backup. install-production.sh adds it to the bench user's crontab:
#   45 1 * * *  SITE=<domain> BENCH=~/frappe-bench …/apps/hospital_vvs/deploy/backup.sh >> …/logs/lmc-backup.log 2>&1
#
# 1. bench backup with files (database: patients, visits, admissions, bills, pharmacy, accounts; public + private files), compressed
# 2. keeps KEEP_DAYS days on the server
# 3. copies the new set off the server with rclone (S3, Backblaze, Google Drive, another server over SFTP…)
#    when REMOTE is set (configure once: `rclone config`). A backup only on the same server is not a backup.
set -euo pipefail

BENCH="${BENCH:-$HOME/frappe-bench}"
SITE="${SITE:-lms.micromaxonline.uk}"
KEEP_DAYS="${KEEP_DAYS:-14}"
REMOTE="${REMOTE:-}"            # e.g. offsite:lmc-backups
DIR="$BENCH/sites/$SITE/private/backups"

cd "$BENCH"
echo "$(date -Is) backup of $SITE starting"
STAMP="$(date +%s)"
bench --site "$SITE" backup --with-files --compress
NEW=$(find "$DIR" -maxdepth 1 -type f -newermt "@$STAMP" -printf '%f\n')
echo "$(date -Is) written: $(echo "$NEW" | tr '\n' ' ')"

find "$DIR" -maxdepth 1 -type f -mtime "+$KEEP_DAYS" -print -delete

if [ -n "$REMOTE" ]; then
	for f in $NEW; do rclone copy "$DIR/$f" "$REMOTE/$SITE/$(date +%Y-%m)/"; done
	echo "$(date -Is) copied off the server to $REMOTE"
else
	echo "$(date -Is) WARNING: REMOTE not set — the backup is only on this server"
fi
echo "$(date -Is) done"
