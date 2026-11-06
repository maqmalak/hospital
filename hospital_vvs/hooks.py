app_name = "hospital_vvs"
app_title = "Hospital VVS"
app_publisher = "MicroMax"
app_description = "VVSDesk hospital management system for Pakistan (OPD, IPD, ER, lab, pharmacy, cash, billing)"
app_email = "maqmalak@gmail.com"
app_license = "mit"

required_apps = ["erpnext"]

before_migrate = "hospital_vvs.install.before_migrate"
after_install = "hospital_vvs.install.after_install"
after_migrate = "hospital_vvs.install.after_migrate"

# React app (frontend/) is built into public/frontend and served at /hms (www/hms.html)
website_route_rules = [
	{"from_route": "/hms/<path:app_path>", "to_route": "hms"},
]

doc_events = {
	"Sales Invoice": {
		"on_cancel": "hospital_vvs.services.billing.on_invoice_cancel",
	},
}

scheduler_events = {
	"cron": {
		"*/5 * * * *": [
			"hospital_vvs.services.appointments.release_expired_holds",
			"hospital_vvs.services.appointments.mark_no_shows",
			"hospital_vvs.services.appointments.send_reminders",
			"hospital_vvs.messaging.whatsapp_bot.expire_conversations",
		],
	},
	"daily": [
		"hospital_vvs.services.appointments.generate_slots",
		"hospital_vvs.api.ops.daily_health_summary",
	],
}
