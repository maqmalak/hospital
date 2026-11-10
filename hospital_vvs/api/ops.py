"""Monitoring (09-security-ops.md): health check and the daily summary to PW Admin users."""

import os
import shutil

import frappe
from frappe.utils import add_to_date, now_datetime

from hospital_vvs import roles as R
from hospital_vvs.utils import require_roles


def collect():
	now = now_datetime()
	since = add_to_date(now, hours=-24)
	# frequent cron jobs keep no log rows, so read each job type's last run (QA 2026-11-11: the log made a running scheduler look stale)
	last_job = frappe.db.sql("select max(last_execution) from `tabScheduled Job Type` where stopped=0")[0][0]
	failed_jobs = frappe.db.count("Scheduled Job Log", {"status": "Failed", "creation": [">=", since]})
	try:
		from frappe.utils.background_jobs import get_queue

		queued = sum(len(get_queue(q)) for q in ("short", "default", "long"))
	except Exception:
		queued = None
	site_path = frappe.get_site_path()
	disk = shutil.disk_usage(site_path)
	db_mb = frappe.db.sql("""select round(sum(data_length + index_length)/1024/1024, 1) from information_schema.tables
		where table_schema=%s""", frappe.conf.db_name)[0][0]
	backups = sorted((f for f in os.listdir(frappe.get_site_path("private", "backups")) if f.endswith(".sql.gz")), reverse=True) \
		if os.path.isdir(frappe.get_site_path("private", "backups")) else []
	return {
		"time": str(now),
		"scheduler_enabled": not frappe.utils.scheduler.is_scheduler_disabled(),
		"scheduler_last_run": str(last_job) if last_job else None,
		"scheduler_stale": (not last_job) or last_job < add_to_date(now, minutes=-15),
		"failed_scheduled_jobs_24h": failed_jobs,
		"queued_jobs": queued,
		"failed_messages_24h": frappe.db.count("Message Log", {"status": "Failed", "creation": [">=", since]}),
		"queued_messages": frappe.db.count("Message Log", {"status": "Queued"}),
		"disk_free_gb": round(disk.free / 1024 ** 3, 1),
		"disk_used_pct": round(disk.used * 100 / disk.total, 1),
		"db_size_mb": db_mb,
		"last_backup": backups[0] if backups else None,
		"errors_24h": frappe.db.count("Error Log", {"creation": [">=", since]}),
	}


@frappe.whitelist()
def health():
	require_roles(R.ADMIN)
	return collect()


def daily_health_summary():
	data = collect()
	admins = frappe.db.sql_list("""select distinct hr.parent from `tabHas Role` hr join tabUser u on u.name=hr.parent
		where hr.role=%s and u.enabled=1 and hr.parenttype='User'""", R.ADMIN)
	lines = "".join(f"<tr><td>{k.replace('_', ' ')}</td><td><b>{v}</b></td></tr>" for k, v in data.items())
	for user in admins:
		frappe.get_doc({"doctype": "Notification Log", "for_user": user, "type": "Alert", "subject": "VVSDesk daily health summary",
			"email_content": f"<table>{lines}</table>"}).insert(ignore_permissions=True)
