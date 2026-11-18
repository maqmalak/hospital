#!/usr/bin/env bash
# Nurses' drug round for the hospital demo site (D-85): charts every inpatient dose due up to now (MAR), 3 times a day (08:05, 14:05, 20:05 — doses are timed 08 / 14 / 20); admissions with no medicine get a starter plan first.
#   scripts/drug_round.sh                  # site "hospital"
# Crontab (crontab -e):
#   5 8,14,20 * * * /home/maqmalak/erpnext-react/apps/hospital_vvs/scripts/drug_round.sh >> /home/maqmalak/erpnext-react/logs/drug_round.log 2>&1
set -euo pipefail
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
BENCH="${BENCH:-/home/maqmalak/erpnext-react}"
SITE="${SITE:-hospital}"
cd "$BENCH"
bench --site "$SITE" execute hospital_vvs.setup.ipd_demo.drug_round
