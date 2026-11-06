#!/usr/bin/env bash
# VVSDesk hospital — create the site "hospital" and install its apps on this bench (re-run safe).
#
#   ./apps/hospital_vvs/setup_hospital.sh      (from the bench folder; asks for the MariaDB root password once)
#
# Desk:  http://hospital.localhost:8011/desk        React (dev): http://hospital.localhost:5183/hms
# Only the hospital site is touched; other sites on this bench keep their own site_config.
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/../.." && pwd)"
SITE="hospital"
cd "$BENCH"

grep -qx hospital_vvs sites/apps.txt || { ./env/bin/pip install -q -e apps/hospital_vvs && printf '\nhospital_vvs\n' >> sites/apps.txt; }

if [ ! -d "sites/$SITE" ]; then
  bench new-site "$SITE" --admin-password "${ADMIN_PASSWORD:-admin@123}"
fi
bench --site "$SITE" set-config developer_mode 1
bench --site "$SITE" set-config allow_tests true
bench --site "$SITE" set-config host_name "http://hospital.localhost:8011"
bench --site "$SITE" set-config webserver_port 8011

for app in erpnext hrms crm mm_core hospital_vvs; do
  bench --site "$SITE" list-apps | grep -q "^$app" || bench --site "$SITE" install-app "$app"
done
bench --site "$SITE" migrate
bench --site "$SITE" clear-cache
echo "Done. Desk: http://hospital.localhost:8011/desk (Administrator / ${ADMIN_PASSWORD:-admin@123})"
