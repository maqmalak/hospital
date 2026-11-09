"""Phase 4 demo data (re-run safe): OV staff + OV doctors and a few online requests in every state.
bench --site hospital execute hospital_vvs.setup.demo_phase4.seed
"""

import frappe
from frappe.utils import add_to_date, now_datetime

from hospital_vvs import roles as R
from hospital_vvs.setup.demo import _user

OV_DOCTORS = ("dr.sana", "dr.farah")
REQUESTS = [  # name, phone, gender, age, complaint, symptoms, method, proof?, state
	("Hamid Raza", "+923331112201", "Male", 34, "Fever and body aches for three days", ["Fever", "Body ache"], "JazzCash", True, "Pending"),
	("Nadia Iqbal", "+923331112202", "Female", 27, "Skin rash on both arms after a new soap", ["Rash", "Itching"], "Easypaisa", True, "Accepted"),
	("Saad Mehmood", "+923331112203", "Male", 6, "Child has a cough and runny nose", ["Cough", "Runny nose"], "Bank Transfer", False, "Pending"),
	("Rukhsana Bibi", "+923331112204", "Female", 58, "Follow-up for blood pressure, readings high at home", ["Headache"], "JazzCash", True, "Completed"),
]


def seed():
	frappe.set_user("Administrator")
	frappe.flags.hv_sync_messages = True
	_user("ovstaff", "Owais Online Desk", [R.OV_STAFF], "Lahore Main")
	for login in OV_DOCTORS:
		email = f"{login}@vvs.demo"
		if frappe.db.exists("User", email):
			frappe.get_doc("User", email).add_roles(R.OV_DOCTOR)
		doc = frappe.db.get_value("Doctor", {"user": email})
		if doc:
			frappe.db.set_value("Doctor", doc, "online_visits", 1)
	from hospital_vvs.services import online_visit as svc

	if frappe.db.count("Online Visit Request") >= len(REQUESTS):
		return
	doctor = frappe.db.get_value("Doctor", {"online_visits": 1, "is_active": 1})
	for name, phone, gender, age, complaint, symptoms, method, proof, state in REQUESTS:
		ov, _token = svc.create({"patient_name": name, "phone": phone, "gender": gender, "age": age, "complaint": complaint, "symptoms": symptoms,
			"duration": "3 days", "payment_method": method, "payment_reference": f"TX{phone[-4:]}" if proof else None, "language": "ur", "city": "Lahore"})
		if state in ("Accepted", "Completed"):
			svc.verify_fee(ov.name)
			svc.accept(ov.name, doctor, add_to_date(now_datetime(), minutes=45))
		if state == "Completed":
			ovd = frappe.get_doc("Online Visit Request", ov.name)
			rx = frappe.get_doc({"doctype": "Prescription", "patient": ovd.patient, "doctor": doctor, "branch": ovd.branch, "source": "Online Visit",
				"online_visit": ov.name, "advice": "Check BP twice daily, low salt diet. Visit the clinic if above 160/100."})
			rx.insert(ignore_permissions=True)
			rx.submit()
			svc.complete(ov.name, "BP reviewed on video; continue medicines.", "Online")
	frappe.db.commit()
	print("phase 4 demo seeded")
