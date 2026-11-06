"""React routes (11-routes.md) → default Page Access Rules. Paths are relative to the app base (/hms).

(route, label, roles, module switch that hides it). PW Admin can open every route; public/token routes are
not listed because they need no session.
"""

from hospital_vvs.roles import (
	ACCOUNTANT, ADMIN, CASH_SUPERVISOR, DEO, DISPENSER, DOCTOR, FINDER, LAB_USER, NURSE, OV_DOCTOR, OV_STAFF,
	PATHOLOGIST, PHARMACY_CASHIER, RECEPTIONIST, REVIEWER, STORE_KEEPER, ALL,
)

CASH_ROLES = [RECEPTIONIST, LAB_USER, PHARMACY_CASHIER, DISPENSER, CASH_SUPERVISOR]

DEFAULT_ROUTES = [
	("/pw-home", "Control board", ALL, ""),
	("/pw-dashboard", "Dashboard", [ADMIN, DOCTOR, ACCOUNTANT], ""),
	("/registration", "Patient registration", [RECEPTIONIST, DEO], ""),
	("/patients", "Patients", [RECEPTIONIST, DOCTOR, NURSE, DEO], ""),
	("/patients/merge", "Merge patients", [ADMIN], ""),
	("/appointments", "Appointments", [RECEPTIONIST], "enable_appointments"),
	("/appointments/inbox", "WhatsApp inbox", [RECEPTIONIST], "enable_whatsapp"),
	("/physician-queue", "Physician queue", ALL, ""),
	("/opd_slip", "OPD slip", [RECEPTIONIST], ""),
	("/pw-prescription", "Prescription workspace", [DOCTOR, OV_DOCTOR], ""),
	("/pw-history", "Patient history", [DOCTOR, NURSE], ""),
	("/doctors", "Doctors", [RECEPTIONIST], ""),
	("/billing/discount-approvals", "Discount approvals", [CASH_SUPERVISOR, ACCOUNTANT], ""),
	("/messages", "Message log", [RECEPTIONIST], ""),
	("/er", "Emergency", [DOCTOR, NURSE, RECEPTIONIST], "enable_emergency"),
	("/ward", "Wards & beds", [DOCTOR, NURSE, RECEPTIONIST], "enable_ward"),
	("/display/ward", "Ward kiosk display", [DOCTOR, NURSE, RECEPTIONIST], "enable_ward"),
	("/lab/samples", "Lab samples", [LAB_USER], "enable_lab"),
	("/tests", "Lab results", [LAB_USER], "enable_lab"),
	("/lab/verify", "Lab verification", [PATHOLOGIST], "enable_lab"),
	("/medicine_invoice", "Pharmacy POS", [PHARMACY_CASHIER], "enable_medicine"),
	("/pharmacy/pick", "Pharmacy pick", [FINDER], "enable_pharmacy_pipeline"),
	("/pharmacy/review", "Pharmacy review", [REVIEWER], "enable_pharmacy_pipeline"),
	("/pharmacy/dispense", "Pharmacy handover", [DISPENSER], "enable_pharmacy_pipeline"),
	("/pharmacy/items", "Medicine master", [STORE_KEEPER], "enable_medicine"),
	("/cash/shift", "Cashier shift", CASH_ROLES, "enable_shifts"),
	("/cash/close", "Close shift", CASH_ROLES, "enable_shifts"),
	("/ov-staff", "Online visits", [OV_STAFF, OV_DOCTOR], "enable_online_visit"),
	("/reports", "Reports", [DOCTOR, ACCOUNTANT, CASH_SUPERVISOR, STORE_KEEPER, REVIEWER], ""),
	("/audit", "Audit log", [ADMIN], ""),
	("/settings", "Clinic settings", [ADMIN], ""),
	("/masters", "Clinical masters", [DOCTOR, REVIEWER], ""),
]
