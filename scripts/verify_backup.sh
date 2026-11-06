#!/usr/bin/env bash
# Restore-check without touching any site: decrypt the newest encrypted DB backup into a temp folder and count key
# tables in the dump. The full drill (restore onto the staging site) is in docs/OPS.md.
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$BENCH"
SITE="${HV_SITE:-hospital}"
F=$(ls -t sites/$SITE/private/backups/*database*.sql.gz* | head -1)
KEY=$(./env/bin/python -c "import json;print(json.load(open('sites/$SITE/site_config.json')).get('backup_encryption_key',''))")
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
START=$(date +%s)
if [[ "$F" == *-enc* ]]; then gpg --batch --yes --passphrase "$KEY" --pinentry-mode loopback -o "$TMP/db.sql.gz" -d "$F" 2>/dev/null; else cp "$F" "$TMP/db.sql.gz"; fi
gunzip "$TMP/db.sql.gz"
echo "file: $F  size: $(du -h "$TMP/db.sql" | cut -f1)  decrypt+unzip: $(( $(date +%s) - START ))s"
for t in tabPatient "tabOPD Slip" tabPrescription tabAppointment "tabSales Invoice" "tabGL Entry"; do
  printf '%-20s %s insert statements\n' "$t" "$(grep -c "INSERT INTO \`$t\`" "$TMP/db.sql" || true)"
done
