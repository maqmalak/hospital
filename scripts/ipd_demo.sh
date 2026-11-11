#!/usr/bin/env bash
# Daily IPD / ER demo data for the hospital site (D-61): housekeeping, ER close + arrivals, discharges with final bill, admissions, ward care.
# Run after opd_demo.sh (admissions come from today's OPD patients).
#   scripts/ipd_demo.sh                       # admit 3, discharge 3, 3 ER arrivals on site "hospital"
#   ADMIT=4 DISCHARGE=2 ER=5 SITE=hospital scripts/ipd_demo.sh
# Daily at 09:15 (crontab -e):
#   15 9 * * * /home/maqmalak/erpnext-react/apps/hospital_vvs/scripts/ipd_demo.sh >> /home/maqmalak/erpnext-react/logs/ipd_demo.log 2>&1
set -euo pipefail
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
BENCH="${BENCH:-/home/maqmalak/erpnext-react}"
SITE="${SITE:-hospital}"
cd "$BENCH"
bench --site "$SITE" execute hospital_vvs.setup.ipd_demo.run --kwargs "{'admit_n': ${ADMIT:-3}, 'discharge_n': ${DISCHARGE:-3}, 'er_n': ${ER:-3}}"
