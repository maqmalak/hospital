#!/usr/bin/env bash
# Lyallpur Medical Complex (hospital_vvs) — give every user of the site one password (e.g. for training or a demo).
#
# Run on the server as the bench user:
#     bash set-passwords.sh                           # all enabled users except Administrator
#     INCLUDE_ADMINISTRATOR=1 bash set-passwords.sh   # Administrator too
#
# The password is typed when the script asks for it (twice, hidden). It is never written in this script, in the
# repository or in the shell history. Every session of those users is logged out.
set -euo pipefail

BENCH="${BENCH:-$HOME/frappe-bench}"
SITE="${SITE:-lyallpurhospital.pk}"
INCLUDE_ADMINISTRATOR="${INCLUDE_ADMINISTRATOR:-0}"

cd "$BENCH"
[ -d "sites/$SITE" ] || { echo "No site $SITE in $BENCH"; exit 1; }
COUNT="$(bench --site "$SITE" mariadb -N -e "select count(*) from tabUser where enabled=1 and name not in ('Guest'$( [ "$INCLUDE_ADMINISTRATOR" = "1" ] || echo ", 'Administrator'"))" 2>/dev/null | tail -1)"

echo "Site:  $SITE"
echo "Users: $COUNT enabled users$( [ "$INCLUDE_ADMINISTRATOR" = "1" ] && echo ", Administrator included" || echo " (not Administrator)")"
echo "A shared password lets anyone who knows it sign in as any of these users."
read -r -p "Type the site name to continue: " confirm
[ "$confirm" = "$SITE" ] || { echo "Cancelled."; exit 1; }

read -r -s -p "New password: " p1; echo
read -r -s -p "Repeat it:    " p2; echo
[ "$p1" = "$p2" ] || { echo "The passwords do not match."; exit 1; }
[ "${#p1}" -ge 8 ] || { echo "Use at least 8 characters."; exit 1; }

USERS_PASSWORD="$p1" INCLUDE_ADMINISTRATOR="$INCLUDE_ADMINISTRATOR" \
	bench --site "$SITE" execute hospital_vvs.production.set_all_passwords
unset p1 p2
echo "Done."
