#!/usr/bin/env bash
# Daily pharmacy demo data for the hospital site (D-86): shelf top-up + store re-order, cashier/dispenser shifts, today's OPD prescriptions
# sold, walk-in and paper-Rx sales, pick → check → handover pipeline (a few tokens left live on the board), refunds.
#   scripts/pharmacy_demo.sh                    # 25 walk-ins, 2 refunds on site "hospital"
#   WALKINS=40 REFUNDS=3 SITE=hospital scripts/pharmacy_demo.sh
# Daily at 18:30 (crontab -e), after the day's OPD prescriptions:
#   30 18 * * * /home/maqmalak/erpnext-react/apps/hospital_vvs/scripts/pharmacy_demo.sh >> /home/maqmalak/erpnext-react/logs/pharmacy_demo.log 2>&1
set -euo pipefail
BENCH="${BENCH:-/home/maqmalak/erpnext-react}"
SITE="${SITE:-hospital}"
WALKINS="${WALKINS:-25}"
REFUNDS="${REFUNDS:-2}"
cd "$BENCH"
export PATH="$HOME/.local/bin:$PATH"
echo "[$(date '+%F %T')] Pharmacy demo on $SITE: $WALKINS walk-ins, $REFUNDS refunds"
bench --site "$SITE" execute hospital_vvs.setup.pharmacy_demo.run --kwargs "{'walk_ins': $WALKINS, 'refund': $REFUNDS}"
