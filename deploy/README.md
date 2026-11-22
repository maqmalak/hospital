# Deploy: Lyallpur Medical Complex (hospital ERP + LMC website)

Server `169.58.20.21`, user `maqmalak`, bench `/home/maqmalak/frappe-bench` (shared with the other sites already there).
**One server, one site, two domains:** `lyallpurhospital.pk` (the site name) and `www.lyallpurhospital.pk` + `lms.micromaxonline.uk`
(`EXTRA_DOMAINS`). All three open the same site with the same data and login; one Let's Encrypt certificate covers them.
Every path below works on each domain, e.g. `https://lms.micromaxonline.uk/hms/site`.

One Frappe site serves everything. The website, the hospital ERP and the desk share the login, the data and the domain:

| URL | What |
|---|---|
| `https://lyallpurhospital.pk/hms/site` | LMC public website (v2): departments, doctors, booking, online visits |
| `https://lyallpurhospital.pk/hms/login` | staff sign-in → the hospital ERP at `/hms` (React, `frontend/`) |
| `https://lyallpurhospital.pk/hms/display/queue` | OPD queue TV (pharmacy, ward and other screens under `/hms/display/…`) |
| `https://lyallpurhospital.pk/app` | ERPNext desk |

| File | Where it runs | What it does |
|---|---|---|
| `export-data.sh` | development machine | Backs up the `hospital` site with files into `~/lmc-data-<date>` and prints the copy command. |
| `install-production.sh` | production server (Ubuntu 24.04) | Installs everything (Frappe, ERPNext, HRMS, CRM, mm_core, hospital_vvs), builds the React app, restores the data, and sets up nginx, supervisor, SSL, the firewall and the nightly backup. |
| `set-passwords.sh` | production server | Gives every user one password (asked when run, never stored). |
| `backup.sh` | production server (cron) | Nightly backup with files, kept 14 days; copies off the server when `REMOTE` is set. |

## Steps

1. **Commit and push the apps** so the server can fetch them:
   ```bash
   git -C apps/hospital_vvs push origin main      # github.com/maqmalak/hospital
   git -C apps/mm_core push origin main           # github.com/maqmalak/mm_core (hospital_vvs imports it)
   ```
   If a repository is private, give the server read access (a deploy key, or `APP_REPO=https://<token>@github.com/...`).
2. **DNS** — every name must point to `169.58.20.21` before the install (the SSL step needs all of them):
   - **micromaxonline.uk** zone (Cloudflare): `A` · `lms` → `169.58.20.21`
   - **lyallpurhospital.pk** (bought at HosterPK): add it to Cloudflare as its own site (*Add a domain*, Free plan), put the two
     Cloudflare nameservers in HosterPK (domain → Nameservers; a .pk change can take hours, up to 24–48), then in that zone:
     `A` · `@` → `169.58.20.21` and `A` · `www` → `169.58.20.21`.
     (Or keep HosterPK's DNS and add the same two `A` records there.)
   - Keep the records **DNS only** (grey cloud) while the install gets the certificate; afterwards the proxy can be turned on
     with SSL/TLS mode **Full (strict)**. Check: `getent hosts lms.micromaxonline.uk lyallpurhospital.pk www.lyallpurhospital.pk`.
3. **Export the data** (development machine): `bash apps/hospital_vvs/deploy/export-data.sh`
4. **Copy to the server** with the `rsync` command it prints, and copy this `deploy` folder too (or clone the repo).
5. **Install** (on the server, as the bench user with sudo, not root):
   ```bash
   RESTORE_DIR=~/lmc-data-<date> SITE=lyallpurhospital.pk LETSENCRYPT_EMAIL=you@yourdomain.com bash install-production.sh
   ```
   The bench on that server already serves other sites, so add `APT_UPGRADE=0` to avoid restarting their services.
6. **Before the scheduler sends anything:** the data has SMS and WhatsApp switched on (Clinic Settings) and FBR in *Mock*
   mode. Check the gateways and numbers on production — reminders and feedback requests go out every 5–15 minutes.
7. **Delete the data folder** from both machines; it holds the site's encryption key and stored secrets.

Options (environment variables): `SITE`, `EXTRA_DOMAINS` (default `www.lyallpurhospital.pk lms.micromaxonline.uk`; `EXTRA_DOMAINS=""` = only SITE;
adding a domain later = re-run with the longer list), `APT_UPGRADE=0`, `SSL=0`,
`BENCH_NAME`, `ENABLE_UFW=0`, `DEMO_JOBS=1` (demo servers only: drug round 3× daily and the pharmacy day — never on a live
hospital), and the pinned versions (`FRAPPE_BRANCH`, `ERPNEXT_BRANCH`, `HRMS_BRANCH`/`HRMS_REF`, `CRM_BRANCH`/`CRM_REF`),
`MM_CORE_REPO`/`MM_CORE_BRANCH`, `APP_REPO`/`APP_BRANCH`.
The script can be re-run; it pulls the latest pushed hospital_vvs and mm_core and rebuilds the React app every time.

Passwords (MariaDB root, and this site's `LMC_ADMIN_PASSWORD`) are generated on the server into `~/.frappe-install-secrets`.

## Updating later

```bash
cd ~/frappe-bench/apps/hospital_vvs/deploy && git pull && APT_UPGRADE=0 SITE=lyallpurhospital.pk LETSENCRYPT_EMAIL=… bash install-production.sh
```

It pulls hospital_vvs and mm_core, rebuilds the React app, runs `migrate` **twice** (a module added since the last
deploy — e.g. Dialysis — only becomes syncable after the first run creates its Module Def) and restarts.

**Release D-98 / D-99 (Imaging MRI-CT, Nephrology & Dialysis, website themes):** nothing extra is needed for the code;
`migrate` creates the 39 MRI/CT procedures, 4 report templates, 12 dialysis stations, the DIA-* rate items, the Dialysis
Store and the dialysis lab templates. To also add the **sample data** (MRI/CT studies, ~30 dialysis patients with a month
of sessions, labs, packages, unit logs) to the live data, add `SEED_MODULES=1`:

```bash
cd ~/frappe-bench/apps/hospital_vvs/deploy && git pull && APT_UPGRADE=0 SEED_MODULES=1 SITE=lyallpurhospital.pk LETSENCRYPT_EMAIL=… bash install-production.sh
```

`SEED_MODULES` only adds; it never deletes or overwrites. Demo dialysis patients have SMS / WhatsApp switched off.
`RESTORE_DIR=…` (data from `export-data.sh`) is different: it **replaces** the whole live database — anything entered on
production since the last restore (website bookings, registrations, bills) is lost. Back up first (`bash backup.sh`).

or by hand: `git -C apps/hospital_vvs pull`, `cd apps/hospital_vvs/frontend && npm ci && npm run build`,
`bench --site lyallpurhospital.pk migrate` (twice), `bench build --app hospital_vvs`, `sudo supervisorctl restart all`,
optionally `bench --site lyallpurhospital.pk execute hospital_vvs.setup.radiology_demo.run_mrct` and
`bench --site lyallpurhospital.pk execute hospital_vvs.setup.dialysis_demo.run`.

## Help centre videos

The manuals are in git. The videos (about 170 MB) are not: copy them to the server once, and again after they are re-recorded:

```bash
rsync -av --mkpath apps/hospital_vvs/hospital_vvs/public/downloads/videos/ \
  maqmalak@169.58.20.21:~/frappe-bench/apps/hospital_vvs/hospital_vvs/public/downloads/videos/
```
