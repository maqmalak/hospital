app_name = "hospital_vvs"
app_title = "Hospital VVS"

# Tile on the Frappe Desk app screen (/desk and /apps); opens the VVS Hospital workspace
add_to_apps_screen = [
	{"name": "hospital_vvs", "logo": "/assets/hospital_vvs/images/logo.svg", "title": "VVS Hospital", "route": "/desk/vvs-hospital"},
]
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

# called by Prescription.on_submit (signed): lab order and draft medicine invoice
hv_on_prescription_signed = [
	"hospital_vvs.services.lab.on_prescription_signed",
	"hospital_vvs.services.pharmacy.on_prescription_signed",
	"hospital_vvs.services.online_visit.on_prescription_signed",
]

doc_events = {
	"Sales Invoice": {
		"validate": ["hospital_vvs.services.pharmacy.validate_invoice", "hospital_vvs.services.doctor_share.fill_line_doctors"],
		"on_submit": ["hospital_vvs.services.pharmacy.on_invoice_submit", "hospital_vvs.services.doctor_share.on_invoice_change",
			"hospital_vvs.services.fbr.on_invoice_submit", "hospital_vvs.services.lab.on_refund"],
		"on_cancel": ["hospital_vvs.services.billing.on_invoice_cancel", "hospital_vvs.services.doctor_share.on_invoice_change"],
	},
	# doctor share is earned as bills are paid (D-43)
	"Payment Entry": {
		"on_submit": "hospital_vvs.services.doctor_share.on_payment_change",
		"on_cancel": "hospital_vvs.services.doctor_share.on_payment_change",
	},
	"Doctor Share Payout": {
		"validate": "hospital_vvs.services.doctor_share.payout_validate",
		"on_submit": "hospital_vvs.services.doctor_share.payout_submit",
		"on_cancel": "hospital_vvs.services.doctor_share.payout_cancel",
	},
	"Item": {
		"validate": "hospital_vvs.services.pharmacy.item_validate",
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
		"*/15 * * * *": [
			"hospital_vvs.services.patient_comms.queue_feedback_requests",
			"hospital_vvs.services.fbr.scheduled",
		],
	},
	"daily": [
		"hospital_vvs.services.appointments.generate_slots",
		"hospital_vvs.api.ops.daily_health_summary",
		"hospital_vvs.services.expenses.scheduled",
	],
}

# Patient merge also moves admission and ER records (api/patients._extra_links)
hv_patient_links = ["hospital_vvs.services.ipd.patient_links"]

# token portals: Cache-Control no-store
after_request = ["hospital_vvs.utils.no_store"]
