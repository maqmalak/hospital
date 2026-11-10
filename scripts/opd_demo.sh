#!/usr/bin/env bash
# Daily OPD demo data for the hospital site (D-51): new + returning patients, OPD slips and tokens, queues, prescriptions, lab orders.
#   scripts/opd_demo.sh                 # 12 new patients, 30 visits on site "hospital"
#   NEW=20 VISITS=50 SITE=hospital scripts/opd_demo.sh
# Daily at 09:00 (crontab -e):
#   0 9 * * * /home/maqmalak/erpnext-react/apps/hospital_vvs/scripts/opd_demo.sh >> /home/maqmalak/erpnext-react/logs/opd_demo.log 2>&1
set -euo pipefail
BENCH="${BENCH:-/home/maqmalak/erpnext-react}"
SITE="${SITE:-hospital}"
NEW="${NEW:-12}"
VISITS="${VISITS:-30}"
cd "$BENCH"
echo "[$(date '+%F %T')] OPD demo on $SITE: $NEW new patients, $VISITS visits"
bench --site "$SITE" execute hospital_vvs.setup.opd_demo.run --kwargs "{'new_patients': $NEW, 'visits': $VISITS}"
