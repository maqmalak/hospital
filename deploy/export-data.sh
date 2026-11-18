#!/usr/bin/env bash
# Lyallpur Medical Complex (hospital_vvs) — take the data of the development site to production.
#
# Run on the development machine, from anywhere:
#     bash apps/hospital_vvs/deploy/export-data.sh
# It makes a backup with files of SITE and puts it in a folder of its own (default ~/lmc-data-<date>), then prints
# the command that copies it to the server. On the server:
#     RESTORE_DIR=~/lmc-data-<date> SITE=lyallpurhospital.pk LETSENCRYPT_EMAIL=… bash install-production.sh
#
# The folder holds the site's encryption key (in *-site_config_backup.json) and every stored secret (payment
# gateway keys, SMS / WhatsApp / e-mail passwords). Copy it only over SSH (scp/rsync), never by email or chat, and
# delete it from both machines after the restore.
set -euo pipefail

BENCH="${BENCH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
SITE="${SITE:-hospital}"
OUT="${OUT:-$HOME/lmc-data-$(date +%Y%m%d-%H%M)}"
SERVER="${SERVER:-maqmalak@169.58.20.21}"

cd "$BENCH"
[ -d "sites/$SITE" ] || { echo "No site $SITE in $BENCH"; exit 1; }
STAMP="$(date +%s)"
bench --site "$SITE" backup --with-files --compress
DIR="sites/$SITE/private/backups"
mkdir -p "$OUT" && chmod 700 "$OUT"
# the set just written: files newer than the moment this script started
find "$DIR" -maxdepth 1 -type f -newermt "@$STAMP" -exec cp {} "$OUT"/ \;
[ -n "$(ls "$OUT"/*-database.sql.gz 2>/dev/null)" ] || { echo "Backup files not found in $DIR"; exit 1; }
chmod 600 "$OUT"/*

echo
echo "Data for production: $OUT"
ls -lh "$OUT" | tail -n +2
echo
echo "Copy it to the server (only over SSH):"
echo "    rsync -av --chmod=D700,F600 '$OUT/' $SERVER:~/$(basename "$OUT")/"
echo "Then on the server:"
echo "    RESTORE_DIR=~/$(basename "$OUT") SITE=lyallpurhospital.pk LETSENCRYPT_EMAIL=you@yourdomain.com bash install-production.sh"
