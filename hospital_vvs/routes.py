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
	("/ipd", "Admissions", [DOCTOR, NURSE, RECEPTIONIST, DEO], "enable_ward"),
	("/ipd/mar", "Medication rounds (MAR)", [NURSE, DOCTOR], "enable_mar"),
	("/ipd/kitchen", "Diet list", [NURSE, RECEPTIONIST], "enable_diet"),
	("/ipd_slip", "IPD bill", [RECEPTIONIST, ACCOUNTANT, CASH_SUPERVISOR], "enable_ward"),
	("/ipd_report", "IPD reports", [DOCTOR, RECEPTIONIST, ACCOUNTANT], "enable_ward"),
	("/ipd/pre-auth", "Insurance pre-auth", [RECEPTIONIST, ACCOUNTANT], "enable_insurance"),
	("/roster", "Nurse roster", [NURSE], ""),
	("/display/ward", "Ward kiosk display", [DOCTOR, NURSE, RECEPTIONIST], "enable_ward"),
	("/lab/samples", "Lab samples", [LAB_USER], "enable_lab"),
	("/tests", "Lab results", [LAB_USER, PATHOLOGIST], "enable_lab"),
	("/lab/verify", "Lab verification", [PATHOLOGIST], "enable_lab"),
	("/medicine_invoice", "Pharmacy POS", [PHARMACY_CASHIER], "enable_medicine"),
	("/pharmacy/pick", "Pharmacy pick", [FINDER], "enable_pharmacy_pipeline"),
	("/pharmacy/review", "Pharmacy review", [REVIEWER], "enable_pharmacy_pipeline"),
	("/pharmacy/dispense", "Pharmacy handover", [DISPENSER], "enable_pharmacy_pipeline"),
	("/pharmacy/items", "Medicine master", [STORE_KEEPER, REVIEWER], "enable_medicine"),
	("/cash/shift", "Cashier shift", CASH_ROLES, "enable_shifts"),
	("/cash/close", "Close shift", CASH_ROLES, "enable_shifts"),
	("/cash/approvals", "Cash approvals", [CASH_SUPERVISOR], "enable_shifts"),
	("/cash/reports", "Cash reports", [CASH_SUPERVISOR, ACCOUNTANT], "enable_shifts"),
	("/lab/orders", "Lab orders", [LAB_USER, RECEPTIONIST], "enable_lab"),
	("/lab/outsourced", "Outsourced tests", [LAB_USER, PATHOLOGIST], "enable_lab"),
	("/lab/templates", "Lab test templates", [PATHOLOGIST], "enable_lab"),
	("/pharmacy/tickets", "Pharmacy pipeline", [PHARMACY_CASHIER, REVIEWER, DISPENSER], "enable_medicine"),
	("/pharmacy/reports", "Pharmacy reports", [REVIEWER, STORE_KEEPER], "enable_medicine"),
	("/store/transfers", "Store transfers", [STORE_KEEPER, REVIEWER], "enable_medicine"),
	("/store/cycle-count", "Cycle count", [STORE_KEEPER], "enable_medicine"),
	("/store/returns", "Expiry & returns", [STORE_KEEPER], "enable_medicine"),
	("/store/receive", "Receive stock", [STORE_KEEPER], "enable_medicine"),
	("/display/devices", "Display devices", [], ""),
	("/ov-staff", "Online visits", [OV_STAFF, OV_DOCTOR, RECEPTIONIST, CASH_SUPERVISOR], "enable_online_visit"),
	("/ov-staff/report", "Online visit report", [OV_STAFF, ACCOUNTANT], "enable_online_visit"),
	("/reports", "Reports", [DOCTOR, ACCOUNTANT, CASH_SUPERVISOR, STORE_KEEPER, REVIEWER], ""),
	("/audit", "Audit log", [ADMIN], ""),
	("/settings", "Clinic settings", [ADMIN], ""),
	("/masters", "Clinical masters", [DOCTOR, REVIEWER], ""),
]
