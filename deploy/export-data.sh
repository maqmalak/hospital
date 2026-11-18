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
chmod 600 "$OUT"/*
# System Settings → "Encrypt backup" makes *-enc.* files (gpg, passphrase = the site's backup_encryption_key). The new
# server has its own key and could not open them, so they are decrypted here into the plain names the installer expects.
if ls "$OUT"/*-enc.* >/dev/null 2>&1; then
	command -v gpg >/dev/null || { echo "The backup is encrypted and gpg is not installed (sudo apt install gnupg)."; exit 1; }
	KEY="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('backup_encryption_key',''))" "sites/$SITE/site_config.json")"
	[ -n "$KEY" ] || { echo "Encrypted backup but no backup_encryption_key in sites/$SITE/site_config.json"; exit 1; }
	GNUPGHOME="$(mktemp -d)"; export GNUPGHOME   # a throw-away keyring: the user's ~/.gnupg is not touched
	for f in "$OUT"/*-enc.*; do
		plain="${f/-enc./.}"
		if [[ "$f" == *site_config_backup-enc.json ]]; then
			mv "$f" "$plain"   # Frappe encrypts the database and the file archives; the config is only named -enc
		else
			# passphrase on stdin, not on the command line (ps would show it)
			printf '%s' "$KEY" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 -o "$plain" -d "$f" ||
				{ echo "Could not decrypt ${f##*/}"; exit 1; }
			rm -f "$f"
		fi
		chmod 600 "$plain"
	done
	rm -rf "$GNUPGHOME"; unset KEY GNUPGHOME
	echo "Decrypted the encrypted backup (site has 'Encrypt backup' on)."
fi
[ -n "$(ls "$OUT"/*-database.sql.gz 2>/dev/null)" ] || { echo "Backup files not found in $DIR"; exit 1; }

echo
echo "Data for production: $OUT"
ls -lh "$OUT" | tail -n +2
echo
echo "Copy it to the server (only over SSH):"
echo "    rsync -av --chmod=D700,F600 '$OUT/' $SERVER:~/$(basename "$OUT")/"
echo "Then on the server:"
echo "    RESTORE_DIR=~/$(basename "$OUT") SITE=lyallpurhospital.pk LETSENCRYPT_EMAIL=you@yourdomain.com bash install-production.sh"
