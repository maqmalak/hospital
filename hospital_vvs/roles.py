"""Roles (CLAUDE.md §5) and the groups the permission checks use."""

ADMIN = "PW Admin"
DOCTOR = "PW Doctor"
RECEPTIONIST = "PW Receptionist"
LAB_USER = "PW Lab User"
PATHOLOGIST = "PW Pathologist"
PHARMACY_CASHIER = "PW Pharmacy Cashier"
FINDER = "PW Finder"
REVIEWER = "PW Reviewer"
DISPENSER = "PW Dispenser"
STORE_KEEPER = "PW Store Keeper"
CASH_SUPERVISOR = "PW Cash Supervisor"
ACCOUNTANT = "PW Accountant"
NURSE = "PW Nurse"
DEO = "PW DEO"
OV_STAFF = "OV Staff"
OV_DOCTOR = "OV Doctor"

ALL = [ADMIN, DOCTOR, RECEPTIONIST, LAB_USER, PATHOLOGIST, PHARMACY_CASHIER, FINDER, REVIEWER, DISPENSER,
	STORE_KEEPER, CASH_SUPERVISOR, ACCOUNTANT, NURSE, DEO, OV_STAFF, OV_DOCTOR]

# Desk access: staff may open ERPNext Desk screens (POS for the pharmacy, stock screens for the store keeper).
DESK = ALL

# Roles that must use two-factor authentication (09-security-ops.md)
TWO_FACTOR = [ADMIN, ACCOUNTANT, CASH_SUPERVISOR, PATHOLOGIST]

# Clinical roles see diagnoses, notes, vitals, allergies and results (permlevel 1). Money roles do not.
CLINICAL = [ADMIN, DOCTOR, NURSE, PATHOLOGIST, REVIEWER, DEO, OV_DOCTOR]
FRONT_DESK = [ADMIN, RECEPTIONIST]
MONEY = [RECEPTIONIST, LAB_USER, PHARMACY_CASHIER, DISPENSER, ACCOUNTANT, CASH_SUPERVISOR]
CNIC_REVEAL = [ADMIN, RECEPTIONIST]

DESCRIPTIONS = {
	ADMIN: "Everything, including configuration, merges and the audit log",
	DOCTOR: "OPD, IPD and ER clinical work, prescriptions, lab view, own doctor-share statement",
	RECEPTIONIST: "Registration, appointments, OPD slip and billing, lab ordering, admission desk",
	LAB_USER: "Sample collection, receiving, result entry, lab billing counter",
	PATHOLOGIST: "Verifies and signs lab results, critical values, outsourced reports",
	PHARMACY_CASHIER: "Pharmacy billing counter (ERPNext Point of Sale)",
	FINDER: "Pharmacy pick screen",
	REVIEWER: "Pharmacist: review and count, substitutions, clinical checks",
	DISPENSER: "Pharmacy handover counter",
	STORE_KEEPER: "Purchase receipts, transfers, cycle counts, supplier returns",
	CASH_SUPERVISOR: "Shift closings beyond tolerance, cash drops, cash reports",
	ACCOUNTANT: "Panels, insurance, doctor share, expenses, welfare, financial reports",
	NURSE: "IPD ward, MAR, diet, nursing station, ER nursing",
	DEO: "Data entry across clinical modules (no money, no verification)",
	OV_STAFF: "Online Visit queue and fees",
	OV_DOCTOR: "Online Visit consultations",
}


# Standard ERPNext roles that go with a hospital role (D-65): the accounting and buying screens ported from sugarcane read and
# write ERPNext documents and reports directly, so ERPNext's own permissions apply there.
ERP_ROLES = {
	ACCOUNTANT: ["Accounts Manager", "Accounts User", "Purchase Manager", "Purchase User"],
	STORE_KEEPER: ["Purchase User", "Stock User"],
}
ERP_ROLE_SET = {r for v in ERP_ROLES.values() for r in v}


def erp_roles_for(pw_roles):
	return sorted({r for p in pw_roles for r in ERP_ROLES.get(p, [])})
