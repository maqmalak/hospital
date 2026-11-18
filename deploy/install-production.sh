#!/usr/bin/env bash
# =====================================================================================================================
#  Lyallpur Medical Complex (hospital_vvs: hospital ERP + LMC website) — production install on Ubuntu 24.04 LTS
#
#  Frappe v16.34.0 · ERPNext v16.35.0 · HRMS v16.19.0 · CRM v1.84.0 · mm_core · hospital_vvs
#  The versions are the ones the data was made with, so a restored database matches the code.
#
#  Run as the Linux user that will own the bench (it must have sudo), NOT as root:
#
#      SITE=lyallpurhospital.pk LETSENCRYPT_EMAIL=you@yourdomain.com bash install-production.sh
#
#  One site, two domains: lyallpurhospital.pk (SITE) and www.lyallpurhospital.pk + lms.micromaxonline.uk (EXTRA_DOMAINS) — same data,
#  same login, one Let's Encrypt certificate for all three names. Every name needs its DNS A record → this server first.
#
#      → https://<SITE>/hms/site           LMC public website (v2)
#        https://<SITE>/hms/login          staff sign-in → https://<SITE>/hms (hospital ERP, React)
#        https://<SITE>/hms/display/queue  OPD queue TV (and the other /hms/display/* screens)
#        https://<SITE>/app                ERPNext desk
#
#  Server 169.58.20.21, user maqmalak, bench /home/maqmalak/frappe-bench. When that bench already exists (it also serves
#  other sites), the site is added to it: init is skipped and apps already on the bench are kept as they are.
#  DNS: <SITE> → the server's IP (a Cloudflare-proxied record is fine).
#  Without a domain yet:  SSL=0 SITE=lmc.local bash install-production.sh
#
#  With the data of the development site (made by export-data.sh and copied to the server):
#      RESTORE_DIR=~/lmc-data-<date> SITE=… LETSENCRYPT_EMAIL=… bash install-production.sh
#
#  Every value below can be overridden from the environment. The script can be re-run: finished steps are skipped,
#  hospital_vvs and mm_core are pulled to the latest pushed commit and the React app is rebuilt every time.
#  Passwords are generated once and kept in ~/.frappe-install-secrets (mode 600). A full log goes to ~/install-lmc-*.log.
# =====================================================================================================================
set -Eeuo pipefail

# ------------------------------------------------------------------------------------------------ settings
FRAPPE_USER="${FRAPPE_USER:-maqmalak}"
HOME_DIR="${HOME_DIR:-/home/maqmalak}"
BENCH_NAME="${BENCH_NAME:-frappe-bench}"
BENCH_DIR="${HOME_DIR}/${BENCH_NAME}"

SITE="${SITE:-lyallpurhospital.pk}"                 # Frappe site = its public host name (links in emails / SMS use it)
EXTRA_DOMAINS="${EXTRA_DOMAINS-www.lyallpurhospital.pk lms.micromaxonline.uk}"   # same site, more host names (space separated); EXTRA_DOMAINS="" = none
SSL="${SSL:-1}"                                      # 1 = Let's Encrypt certificate for SITE and EXTRA_DOMAINS
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"           # needed with SSL=1: certificate expiry notices go here

FRAPPE_REPO="${FRAPPE_REPO:-https://github.com/frappe/frappe}"
FRAPPE_BRANCH="${FRAPPE_BRANCH:-v16.34.0}"
ERPNEXT_BRANCH="${ERPNEXT_BRANCH:-v16.35.0}"
HRMS_REPO="${HRMS_REPO:-https://github.com/frappe/hrms}"
HRMS_BRANCH="${HRMS_BRANCH:-v16.19.0}"
HRMS_REF="${HRMS_REF:-7e0fba4bf11a63ac7b21a717610e235310815c1a}"          # v16.19.0
CRM_REPO="${CRM_REPO:-https://github.com/frappe/crm}"   # installed on the development site, so the restored data needs it
CRM_BRANCH="${CRM_BRANCH:-v1.84.0}"
CRM_REF="${CRM_REF:-0adc6715d79b7647d1bcecf41f5d2cf928253b4b}"            # v1.84.0
MM_CORE_REPO="${MM_CORE_REPO:-https://github.com/maqmalak/mm_core.git}"   # shared helpers hospital_vvs imports
MM_CORE_BRANCH="${MM_CORE_BRANCH:-main}"
APP_REPO="${APP_REPO:-https://github.com/maqmalak/hospital.git}"          # hospital_vvs
APP_BRANCH="${APP_BRANCH:-main}"
RESTORE_DIR="${RESTORE_DIR:-}"               # a folder made by export-data.sh: restore its data into the new site

PYTHON_VERSION="${PYTHON_VERSION:-3.14}"
NODE_VERSION="${NODE_VERSION:-24}"
MARIADB_VERSION="${MARIADB_VERSION:-11.8}"   # from the MariaDB repository; set to "" to use Ubuntu's own MariaDB
TIMEZONE="${TIMEZONE:-Asia/Karachi}"
DEMO_JOBS="${DEMO_JOBS:-0}"                  # 1 = demo-data cron jobs (drug round 3x daily, pharmacy day) — demo servers only
ENABLE_UFW="${ENABLE_UFW:-1}"                # firewall: only SSH, HTTP and HTTPS
APT_UPGRADE="${APT_UPGRADE:-1}"              # 0 = skip `apt upgrade` (a server already in use: no service restarts)

SECRETS="${HOME_DIR}/.frappe-install-secrets"
LOG="${HOME_DIR}/install-lmc-$(date +%Y%m%d-%H%M%S).log"
APPS=(erpnext hrms crm mm_core hospital_vvs)   # install order: required apps first

# ------------------------------------------------------------------------------------------------ helpers
exec > >(tee -a "$LOG") 2>&1
STEP=0
step() { STEP=$((STEP + 1)); printf '\n\033[1;36m══ %02d · %s\033[0m\n' "$STEP" "$*"; }
info() { printf '   \033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }
trap 'die "Failed at line $LINENO (step $STEP). See $LOG"' ERR

load_env() {
	export PATH="${HOME_DIR}/.local/bin:${PATH}"
	export NVM_DIR="${HOME_DIR}/.nvm"
	if [ -s "$NVM_DIR/nvm.sh" ]; then
		set +u   # nvm reads unset variables
		# shellcheck disable=SC1091
		. "$NVM_DIR/nvm.sh"
		nvm use "$NODE_VERSION" >/dev/null 2>&1 || true
		set -u
	fi
}

secret() {  # secret NAME → value, generated once and kept in $SECRETS
	local name="$1" val
	touch "$SECRETS" && chmod 600 "$SECRETS"
	val="$(grep -E "^${name}=" "$SECRETS" | cut -d= -f2- || true)"
	if [ -z "$val" ]; then
		val="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
		echo "${name}=${val}" >>"$SECRETS"
	fi
	printf '%s' "$val"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------------------------------------------------------------------------ 0. checks
step "Checks"
[ "$(id -u)" -ne 0 ] || die "Run this as the bench user, not as root (it uses sudo where needed)."
[ "$(id -un)" = "$FRAPPE_USER" ] || die "Run this as ${FRAPPE_USER} (now: $(id -un)), or set FRAPPE_USER."
sudo -v || die "${FRAPPE_USER} needs sudo."
. /etc/os-release
[ "${VERSION_ID:-}" = "24.04" ] || warn "This script is written for Ubuntu 24.04; found ${PRETTY_NAME:-unknown}."
case "$(dpkg --print-architecture)" in
	amd64) ARCH=amd64 ;; arm64) ARCH=arm64 ;; *) die "Unsupported CPU architecture $(dpkg --print-architecture)" ;;
esac
if [ "$SSL" = "1" ]; then
	[ -n "$LETSENCRYPT_EMAIL" ] || die "Set LETSENCRYPT_EMAIL=… for the SSL certificate (or SSL=0 to install without SSL)."
	case "$LETSENCRYPT_EMAIL" in *@example.com|*@example.org|*@domain.com|*@yourdomain.com|your-*|you@*|*@localhost|*@*.local) die "LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL} is a placeholder — Let's Encrypt refuses it. Use a real address.";; esac
	PUBLIC_IP="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
	for host in "$SITE" $EXTRA_DOMAINS; do
		DNS_IP="$(getent ahostsv4 "$host" | awk 'NR==1{print $1}')"
		if [[ "$DNS_IP" =~ ^(104\.(1[6-9]|2[0-3])|172\.(6[4-9]|7[01])|188\.114\.(9[6-9]|10[0-9]|11[01])|162\.15[89])\. ]]; then
			info "${host} → ${DNS_IP} (Cloudflare proxy — the origin must be this server; if the SSL step fails, set the record to 'DNS only' while it runs)"
		elif [ -z "$DNS_IP" ]; then
			warn "${host} does not resolve yet — add its DNS A record, or the SSL step will fail."
		elif [ -n "$PUBLIC_IP" ] && [ "$DNS_IP" != "$PUBLIC_IP" ]; then
			warn "${host} points to ${DNS_IP}, this server is ${PUBLIC_IP} — the SSL step will fail until DNS is updated."
		else
			info "${host} → ${DNS_IP}"
		fi
	done
fi
if [ -n "$RESTORE_DIR" ]; then
	[ -d "$RESTORE_DIR" ] || die "RESTORE_DIR ${RESTORE_DIR} does not exist — copy the folder from export-data.sh to this server first."
	ls "$RESTORE_DIR"/*-database.sql* >/dev/null 2>&1 || die "No *-database.sql.gz in ${RESTORE_DIR}."
	info "restore from ${RESTORE_DIR}: $(ls "$RESTORE_DIR" | tr '\n' ' ')"
fi
GIT_TERMINAL_PROMPT=0 git ls-remote "$APP_REPO" HEAD >/dev/null 2>&1 ||
	warn "Cannot reach $APP_REPO yet (private repository? git not installed?) — checked again when the app is fetched."
info "user ${FRAPPE_USER} · bench ${BENCH_DIR} · site ${SITE} · Frappe ${FRAPPE_BRANCH} · ${ARCH}"
( while true; do sudo -n true; sleep 50; kill -0 "$$" 2>/dev/null || exit; done ) 2>/dev/null &   # keep sudo alive

# ------------------------------------------------------------------------------------------------ 1. server
step "Server: time zone and system update"
sudo timedatectl set-timezone "$TIMEZONE" || warn "could not set the time zone"
sudo apt-get update -y
if [ "$APT_UPGRADE" = "1" ]; then sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y; else info "apt upgrade skipped (APT_UPGRADE=0)"; fi
info "$(date)"

# ------------------------------------------------------------------------------------------------ 2. packages
step "Packages"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
	git curl wget ca-certificates gnupg openssl cron software-properties-common \
	python3-dev python3-pip python3-setuptools python3-venv \
	build-essential pkg-config libmysqlclient-dev libffi-dev libssl-dev \
	xvfb libfontconfig fontconfig xfonts-75dpi xfonts-base \
	redis-server nginx supervisor ansible ufw
info "git $(git --version | awk '{print $3}') · redis $(redis-server --version | awk '{print $3}')"

step "wkhtmltopdf (patched Qt, for bills, prescriptions, lab reports and other PDF prints)"
if wkhtmltopdf --version 2>/dev/null | grep -q "with patched qt"; then
	info "already installed: $(wkhtmltopdf --version)"
else
	deb="wkhtmltox_0.12.6.1-2.jammy_${ARCH}.deb"
	wget -q -O "/tmp/${deb}" "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-2/${deb}"
	sudo dpkg -i "/tmp/${deb}" || sudo DEBIAN_FRONTEND=noninteractive apt-get -f install -y
	sudo dpkg -i "/tmp/${deb}"
	info "$(wkhtmltopdf --version)"
fi

# ------------------------------------------------------------------------------------------------ 3. python
step "Python ${PYTHON_VERSION} (uv)"
if ! command -v uv >/dev/null 2>&1 && [ ! -x "${HOME_DIR}/.local/bin/uv" ]; then
	curl -LsSf https://astral.sh/uv/install.sh | sh
fi
load_env
uv python install "$PYTHON_VERSION" --default || uv python install "$PYTHON_VERSION"
PYTHON_BIN="$(env -u VIRTUAL_ENV uv python find --managed-python "$PYTHON_VERSION")"   # never an active virtualenv
info "uv $(uv --version | awk '{print $2}') · $("$PYTHON_BIN" --version) at ${PYTHON_BIN}"

# ------------------------------------------------------------------------------------------------ 4. mariadb
step "MariaDB ${MARIADB_VERSION:-from Ubuntu}"
if ! command -v mariadb >/dev/null 2>&1; then
	if [ -n "$MARIADB_VERSION" ]; then
		curl -LsS https://r.mariadb.com/downloads/mariadb_repo_setup | sudo bash -s -- --mariadb-server-version="mariadb-${MARIADB_VERSION}" --skip-maxscale
		sudo apt-get update -y
	fi
	sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client
fi
if [ ! -f /etc/mysql/mariadb.conf.d/99-frappe.cnf ]; then   # another bench on this server may have tuned it already
	sudo tee /etc/mysql/mariadb.conf.d/99-frappe.cnf >/dev/null <<'CNF'
# Frappe / ERPNext (written by install-production.sh)
[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
bind-address = 127.0.0.1
innodb_file_per_table = 1
innodb_buffer_pool_size = 1G
max_allowed_packet = 256M

[mysql]
default-character-set = utf8mb4
CNF
	sudo systemctl enable --now mariadb
	sudo systemctl restart mariadb
fi
# Non-interactive mysql_secure_installation: root by password (bench uses it) or by the unix socket; no anonymous
# users, no remote root, no test database.
DB_ROOT_PASSWORD="$(secret DB_ROOT_PASSWORD)"
if ! mariadb -uroot -p"$DB_ROOT_PASSWORD" -e "SELECT 1" >/dev/null 2>&1 && sudo mariadb -e "SELECT 1" >/dev/null 2>&1; then
	sudo mariadb <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED VIA unix_socket OR mysql_native_password USING PASSWORD('${DB_ROOT_PASSWORD}');
DELETE FROM mysql.global_priv WHERE User='';
DELETE FROM mysql.global_priv WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
SQL
fi
mariadb -uroot -p"$DB_ROOT_PASSWORD" -e "SELECT 1" >/dev/null || die "MariaDB root password check failed (see $SECRETS)."
info "$(mariadb --version)"

# ------------------------------------------------------------------------------------------------ 5. node
step "Node ${NODE_VERSION} (nvm) and yarn"
if [ ! -s "${HOME_DIR}/.nvm/nvm.sh" ]; then
	curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
load_env
set +u
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
nvm use "$NODE_VERSION"
set -u
command -v yarn >/dev/null 2>&1 || npm install -g yarn
info "node $(node --version) · npm $(npm --version) · yarn $(yarn --version)"
# supervisor runs `bench socketio`, which looks for node on the system PATH; nvm's node lives in the home folder.
sudo ln -sf "$(command -v node)" /usr/local/bin/node

# ------------------------------------------------------------------------------------------------ 6. bench
step "bench CLI"
command -v bench >/dev/null 2>&1 || uv tool install frappe-bench
grep -q 'HOME/.local/bin' "${HOME_DIR}/.bashrc" 2>/dev/null ||
	echo 'export PATH="$HOME/.local/bin:$PATH"' >>"${HOME_DIR}/.bashrc"
load_env
info "bench $(bench --version 2>/dev/null)"

step "bench init: Frappe ${FRAPPE_BRANCH}"
if [ -d "${BENCH_DIR}/apps/frappe" ]; then
	have="$(git -C "${BENCH_DIR}/apps/frappe" describe --tags 2>/dev/null || true)"
	info "${BENCH_DIR} exists (Frappe ${have:-?}) — skipping init"
	[ "$have" = "$FRAPPE_BRANCH" ] || warn "the bench runs Frappe ${have:-?}, the data was made on ${FRAPPE_BRANCH}; migrate will upgrade it"
else
	cd "$HOME_DIR"
	bench init "$BENCH_NAME" --frappe-path "$FRAPPE_REPO" --frappe-branch "$FRAPPE_BRANCH" --python "$PYTHON_BIN" --verbose
fi
cd "$BENCH_DIR"

# ------------------------------------------------------------------------------------------------ 7. apps
step "Apps: ${APPS[*]}"
other_sites_using() {  # other_sites_using APP → the other sites of this bench that have APP installed
	local s
	for s in sites/*/site_config.json; do
		s="$(basename "$(dirname "$s")")"
		[ "$s" = "$SITE" ] && continue
		bench --site "$s" list-apps 2>/dev/null | grep -qE "^$1( |$)" && printf '%s ' "$s"
	done
	return 0
}
get_app() {  # get_app NAME REPO BRANCH [COMMIT]
	if [ -d "apps/$1" ] && ! grep -qx "$1" sites/apps.txt; then
		warn "apps/$1 is left over from a failed get-app (not in sites/apps.txt) — fetching it again"
		rm -rf "apps/$1"
	fi
	if [ -d "apps/$1" ] && { [ "$2" = "$APP_REPO" ] || [ "$2" = "$MM_CORE_REPO" ]; }; then   # our apps: latest pushed code on every run
		git -C "apps/$1" pull -q --ff-only "$2" "$3" && info "$1 updated to $(git -C "apps/$1" rev-parse --short HEAD)"
	fi
	if [ -d "apps/$1" ]; then
		info "$1 already in apps/ ($(git -C "apps/$1" describe --tags --always 2>/dev/null))"
	else
		bench get-app --branch "$3" "$2"
	fi
	[ -n "${4:-}" ] || return 0
	# Pin the exact commit the data was made with — but never move an app other sites of this bench run on.
	if git -C "apps/$1" rev-parse HEAD | grep -q "^$4"; then info "$1 at ${4:0:10}"; return 0; fi
	local users; users="$(other_sites_using "$1")"
	if [ -n "$users" ]; then
		info "$1 kept at its current version: the sites ${users}use it (migrate brings the data up to it)"
		return 0
	fi
	git -C "apps/$1" fetch -q "$2" "$3"   # by URL: bench names the remote "upstream"
	git -C "apps/$1" checkout -q "$4"
	bench setup requirements --python "$1" >/dev/null
	info "$1 pinned to ${4:0:10}"
}
get_app erpnext https://github.com/frappe/erpnext "$ERPNEXT_BRANCH"
get_app hrms "$HRMS_REPO" "$HRMS_BRANCH" "$HRMS_REF"
get_app crm "$CRM_REPO" "$CRM_BRANCH" "$CRM_REF"
get_app mm_core "$MM_CORE_REPO" "$MM_CORE_BRANCH"
get_app hospital_vvs "$APP_REPO" "$APP_BRANCH"
for a in frappe "${APPS[@]}"; do info "$a  $(git -C "apps/$a" describe --tags --always 2>/dev/null)"; done

step "React app: hospital ERP + LMC website (/hms)"
load_env
( cd apps/hospital_vvs/frontend && npm ci --no-audit --no-fund && npm run build ) ||
	die "hospital_vvs frontend build failed"
info "hospital ERP + website → apps/hospital_vvs/hospital_vvs/public/frontend + www/hms.html"

# ------------------------------------------------------------------------------------------------ 8. site
step "Site ${SITE}"
ADMIN_PASSWORD="$(secret LMC_ADMIN_PASSWORD)"   # its own: the secrets file may serve other sites of this bench
if [ -d "sites/${SITE}" ] && ! bench --site "$SITE" list-apps >/dev/null 2>&1; then
	warn "sites/${SITE} is left over from a failed run (its database does not answer) — removing it"
	bench drop-site "$SITE" --db-root-username root --db-root-password "$DB_ROOT_PASSWORD" --force --no-backup 2>/dev/null || true
	rm -rf "sites/${SITE}"
fi
if [ -d "sites/${SITE}" ]; then
	info "site exists — skipping new-site"
else
	bench new-site "$SITE" --db-root-username root --db-root-password "$DB_ROOT_PASSWORD" \
		--admin-password "$ADMIN_PASSWORD" --set-default
fi

# migrate and restore need the bench's Redis, which supervisor only runs after step 9: start it here for a moment.
TMP_REDIS=()
for conf in config/redis_cache.conf config/redis_queue.conf; do
	port="$(awk '$1=="port"{print $2}' "$conf")"
	if ! redis-cli -p "$port" ping >/dev/null 2>&1; then
		redis-server "$conf" --daemonize yes >/dev/null && TMP_REDIS+=("$port")
	fi
done
for _ in 1 2 3 4 5 6 7 8 9 10; do redis-cli -p "$(awk '$1=="port"{print $2}' config/redis_cache.conf)" ping >/dev/null 2>&1 && break; sleep 1; done

if [ -n "$RESTORE_DIR" ] && [ ! -f "sites/${SITE}/.restored" ]; then
	step "Restore data from ${RESTORE_DIR}"
	pick() { find "$RESTORE_DIR" -maxdepth 1 -name "$1" | sort | tail -1; }
	DB_FILE="$(pick '*-database.sql.gz')"; [ -n "$DB_FILE" ] || DB_FILE="$(pick '*-database.sql')"
	# files come as .tgz (backup --compress) or .tar
	PUB_FILE="$(find "$RESTORE_DIR" -maxdepth 1 \( -name '*-files.tgz' -o -name '*-files.tar' \) ! -name '*-private-files.*' | sort | tail -1)"
	PRIV_FILE="$(find "$RESTORE_DIR" -maxdepth 1 \( -name '*-private-files.tgz' -o -name '*-private-files.tar' \) | sort | tail -1)"
	CFG_FILE="$(pick '*site_config_backup.json')"
	[ -n "$DB_FILE" ] || die "No *-database.sql.gz in ${RESTORE_DIR}"
	info "database ${DB_FILE##*/}${PUB_FILE:+ · ${PUB_FILE##*/}}${PRIV_FILE:+ · ${PRIV_FILE##*/}}"
	# The same encryption key, or the stored secrets (payment gateway keys, SMS / WhatsApp / email passwords) cannot be read.
	if [ -n "$CFG_FILE" ]; then
		KEY="$("$PYTHON_BIN" -c "import json,sys; print(json.load(open(sys.argv[1])).get('encryption_key',''))" "$CFG_FILE")"
		if [ -n "$KEY" ]; then bench --site "$SITE" set-config encryption_key "$KEY"; info "encryption key carried over"; fi
	else
		warn "no site_config_backup.json: stored secrets of the old site will not decrypt"
	fi
	bench --site "$SITE" restore "$DB_FILE" ${PUB_FILE:+--with-public-files "$PUB_FILE"} ${PRIV_FILE:+--with-private-files "$PRIV_FILE"} \
		--db-root-username root --db-root-password "$DB_ROOT_PASSWORD" --force
	bench --site "$SITE" set-admin-password "$ADMIN_PASSWORD"   # Administrator gets this server's password (see $SECRETS)
	touch "sites/${SITE}/.restored"
	info "restored; Administrator password reset"
fi
installed="$(bench --site "$SITE" list-apps 2>/dev/null || true)"
for a in "${APPS[@]}"; do
	if grep -qw "^$a" <<<"$installed"; then info "$a already installed"; else bench --site "$SITE" install-app "$a"; fi
done
SCHEME="http"; [ "$SSL" = "1" ] && SCHEME="https"
BASE_URL="${SCHEME}://${SITE}"
bench --site "$SITE" set-config host_name "$BASE_URL"
bench --site "$SITE" set-config developer_mode 0
bench --site "$SITE" set-config allow_tests 0
bench --site "$SITE" migrate                 # custom fields, roles, settings, scheduled jobs (after_migrate)
bench build --production
bench --site "$SITE" clear-cache
for port in "${TMP_REDIS[@]}"; do redis-cli -p "$port" shutdown nosave >/dev/null 2>&1 || true; done
info "apps on ${SITE}: $(bench --site "$SITE" list-apps | tr '\n' ' ')"

# ------------------------------------------------------------------------------------------------ 9. production
step "Production: scheduler, workers, nginx, supervisor"
bench config dns_multitenant on            # nginx picks the site by host name
for d in $EXTRA_DOMAINS; do
	grep -q "\"${d}\"" "sites/${SITE}/site_config.json" || bench setup add-domain "$d" --site "$SITE"
done
bench --site "$SITE" enable-scheduler      # appointment slots, reminders and no-shows, WhatsApp bot, feedback, FBR, daily summary
bench --site "$SITE" set-maintenance-mode off
sudo env "PATH=$PATH" bench setup production "$FRAPPE_USER" --yes
bench setup nginx --yes --log_format combined
if ! sudo supervisorctl status 2>/dev/null | grep -q "${BENCH_NAME}"; then
	warn "supervisor did not pick up the bench — linking its config"
	sudo ln -sf "${BENCH_DIR}/config/supervisor.conf" "/etc/supervisor/conf.d/${BENCH_NAME}.conf"
	sudo supervisorctl reread && sudo supervisorctl update
fi
# nginx only needs to walk into the bench and read the apps' public files — not the whole home folder (~/.ssh,
# site_config.json with the database password).
chmod o+x "$HOME_DIR" "$BENCH_DIR" "${BENCH_DIR}/sites"
chmod -R o+rX "${BENCH_DIR}/sites/assets" "${BENCH_DIR}"/apps/*/*/public 2>/dev/null || true
sudo nginx -t
sudo systemctl reload nginx
sudo supervisorctl restart all || warn "a process did not start — see: sudo supervisorctl status, and ${BENCH_DIR}/logs/"
sudo supervisorctl status || true

# ------------------------------------------------------------------------------------------------ 10. ssl
if [ "$SSL" = "1" ]; then
	step "SSL (Let's Encrypt): ${SITE} ${EXTRA_DOMAINS}"
	command -v certbot >/dev/null 2>&1 || { sudo snap install core; sudo snap refresh core; sudo snap install --classic certbot; sudo ln -sf /snap/bin/certbot /usr/bin/certbot; }
	# One certificate for every name. `certonly` leaves the nginx files alone; the certificate goes into the site's
	# config so a later `bench setup nginx` keeps SSL, and every renewal reloads nginx.
	DOMAIN_ARGS=(-d "$SITE"); for d in $EXTRA_DOMAINS; do DOMAIN_ARGS+=(-d "$d"); done
	sudo certbot certonly --nginx --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" --cert-name "$SITE" \
		"${DOMAIN_ARGS[@]}" --deploy-hook "systemctl reload nginx"
	CERT_DIR="/etc/letsencrypt/live/${SITE}"
	bench --site "$SITE" set-config ssl_certificate "${CERT_DIR}/fullchain.pem"
	bench --site "$SITE" set-config ssl_certificate_key "${CERT_DIR}/privkey.pem"
	bench setup nginx --yes --log_format combined
	sudo nginx -t && sudo systemctl reload nginx
	sudo certbot renew --dry-run --cert-name "$SITE" >/dev/null && info "automatic renewal works"
fi

# ------------------------------------------------------------------------------------------------ 11. firewall
if [ "$ENABLE_UFW" = "1" ]; then
	step "Firewall (ufw): SSH, HTTP, HTTPS only"
	sudo ufw allow OpenSSH
	sudo ufw allow 80/tcp
	sudo ufw allow 443/tcp
	sudo ufw --force enable
	sudo ufw status verbose | head -12
fi

# ------------------------------------------------------------------------------------------------ 12. nightly backup
step "Nightly backup (cron, 01:45)"
CRON_LINE="45 1 * * * SITE=${SITE} BENCH=${BENCH_DIR} ${BENCH_DIR}/apps/hospital_vvs/deploy/backup.sh >> ${BENCH_DIR}/logs/lmc-backup.log 2>&1"
if crontab -l 2>/dev/null | grep -qF "hospital_vvs/deploy/backup.sh"; then
	info "already in crontab"
else
	( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
	info "added: ${CRON_LINE}"
fi

# ------------------------------------------------------------------------------------------------ 13. demo jobs (optional)
if [ "$DEMO_JOBS" = "1" ]; then
	step "Demo-data jobs (DEMO_JOBS=1): nurses' drug round 08:05/14:05/20:05, pharmacy day 18:30"
	S="${BENCH_DIR}/apps/hospital_vvs/scripts"
	for line in \
		"5 8,14,20 * * * SITE=${SITE} BENCH=${BENCH_DIR} ${S}/drug_round.sh >> ${BENCH_DIR}/logs/lmc-drug_round.log 2>&1" \
		"30 18 * * * SITE=${SITE} BENCH=${BENCH_DIR} ${S}/pharmacy_demo.sh >> ${BENCH_DIR}/logs/lmc-pharmacy_demo.log 2>&1"; do
		script="$(awk '{print $8}' <<<"$line")"
		if crontab -l 2>/dev/null | grep -F "$script" | grep -qF "SITE=${SITE} "; then info "already in crontab: ${script##*/}"
		else ( crontab -l 2>/dev/null; echo "$line" ) | crontab - && info "added: ${line}"; fi
	done
else
	info "demo-data jobs not added (DEMO_JOBS=0) — a live hospital must not get generated patients"
fi

# ------------------------------------------------------------------------------------------------ done
step "Done"
bench version --format table || bench version
cat <<EOF

  LMC website      ${BASE_URL}/hms/site
  Staff sign-in    ${BASE_URL}/hms/login   (hospital ERP at ${BASE_URL}/hms)
  Queue display    ${BASE_URL}/hms/display/queue
  Desk             ${BASE_URL}/app
  Login            Administrator / LMC_ADMIN_PASSWORD in ${SECRETS}
  Bench            ${BENCH_DIR}
  Log              ${LOG}

  Next:
   1. Restored site: sign in and check the data (patients, OPD, IPD, pharmacy stock, Clinic Settings, Letter Head).
      New site (no RESTORE_DIR): open ${BASE_URL}/app, finish the ERPNext setup wizard; the hospital setup runs on install.
   2. Staff passwords: the restored users keep the development passwords — give them new ones (set-passwords.sh, or per user).
   3. Help-centre videos are not in git: copy them once (see README.md).
   4. Search engines: when the website is final, turn on hv_site_indexing (Clinic Settings) so Google may index /hms/site.
   5. Copy backups off the server: set REMOTE=… for deploy/backup.sh (see the script).
EOF
[ "$SSL" = "1" ] || echo "  No SSL: add '${SITE}' to the hosts file of the PCs that use it, or re-run with SSL=1."
