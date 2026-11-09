"""Phase 3 acceptance tests (12-workflows.md W4, W18) and unit tests for bed days, nursing shifts and packages.
Needs the Phase 1–3 demo seeders."""

import random
from datetime import datetime

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, add_to_date, flt, now_datetime, today

from hospital_vvs.services import er, ipd, shifts
from hospital_vvs.setup.company import ABBR
from hospital_vvs.tests.test_phase2 import as_user, receive, test_item

IPD_WH = f"IPD Dispensing LHR - {ABBR}"
DESK = "ipd.desk.test@vvs.demo"


def desk_shift():
	"""A cashier and counter of its own, so stale demo shifts never get in the way."""
	from hospital_vvs import roles as R
	from hospital_vvs.setup.demo import _user

	as_user("Administrator")
	_user("ipd.desk.test", "Ipd Desk Test", [R.RECEPTIONIST], "Lahore Main")
	if not frappe.db.exists("Counter", "IPD Desk Test"):
		frappe.get_doc({"doctype": "Counter", "counter_name": "IPD Desk Test", "branch": "Lahore Main", "counter_type": "IPD Desk",
			"billing_type": "IPD Slip", "number": 9}).insert()
	as_user(DESK)
	s = shifts.current_shift()
	if s and str(s.posting_date) != today():
		as_user("Administrator")
		frappe.db.set_value("POS Opening Entry", s.name, "status", "Closed")
		frappe.db.set_value("Counter", s.hv_counter, {"open_shift": None, "current_user": None})
		as_user(DESK)
		s = None
	if not s:
		from hospital_vvs.tests.test_phase2 import make_staff

		make_staff("IPD Desk Test", DESK)
		s = shifts.open_shift("IPD Desk Test", {"Cash": 1000})
	as_user("Administrator")
	return s


def _seg(bed, start, end=None, rate=1000, icu=0, ward="W"):
	return frappe._dict(bed=bed, ward=ward, from_time=start, to_time=end, daily_rate=rate, icu_surcharge=icu, name=None, idx=bed)


def free_bed(ward_type="General", exclude=()):
	wards = frappe.get_all("Ward", filters={"branch": "Lahore Main", "ward_type": ward_type}, pluck="name")
	beds = frappe.get_all("Hospital Bed", filters={"ward": ["in", wards], "status": "Available", "name": ["not in", list(exclude) or [""]]}, pluck="name")
	if not beds:
		frappe.throw(f"no free {ward_type} bed for tests")
	return beds[0]


def new_patient(name="Test Ipd Patient", **kw):
	p = frappe.get_doc({"doctype": "Patient", "patient_name": f"{name} {frappe.generate_hash(length=4)}", "gender": "Male", "dob": "1980-05-05",
		"branch": "Lahore Main", "phone": f"+92300{random.randint(1000000, 9999999)}",
		"duplicate_reason": "test", **kw})
	p.insert(ignore_permissions=True)
	return p


def doctor():
	return frappe.db.get_value("Doctor", {"doctor_name": "Dr. Ayesha Siddiqui"})


class TestBedRules(IntegrationTestCase):
	def test_midnight_census_and_minimum(self):
		frappe.db.set_single_value("Clinic Settings", "min_bed_days", 1)
		frappe.clear_document_cache("Clinic Settings")
		s1 = _seg("A", datetime(2026, 11, 1, 10), datetime(2026, 11, 3, 9))   # 2 midnights
		s2 = _seg("B", datetime(2026, 11, 3, 9), None)                        # until 4th 08:00 → 1 midnight
		days = ipd.bed_days([s1, s2], datetime(2026, 11, 4, 8))
		self.assertEqual([d for _s, d in days], [2, 1])
		same_day = ipd.bed_days([_seg("A", datetime(2026, 11, 1, 9))], datetime(2026, 11, 1, 18))
		self.assertEqual(same_day[0][1], 1)  # day case: minimum one day on the admission bed

	def test_nursing_shift_per_started_shift(self):
		frappe.db.set_single_value("Clinic Settings", "nursing_shift_starts", "08:00,14:00,20:00")
		frappe.clear_document_cache("Clinic Settings")
		# 10:00 → 21:00 same day: morning (from arrival), evening, night = 3 shifts
		n = ipd.nursing_shifts([_seg("A", datetime(2026, 11, 1, 10))], datetime(2026, 11, 1, 21))
		self.assertEqual(n[0][1], 3)
		# moved to B at 15:00: morning + evening (began 14:00 on A) on A, night on B
		a, b = _seg("A", datetime(2026, 11, 1, 10), datetime(2026, 11, 1, 15)), _seg("B", datetime(2026, 11, 1, 15))
		self.assertEqual([c for _s, c in ipd.nursing_shifts([a, b], datetime(2026, 11, 1, 21))], [2, 1])

	def test_package_covers_and_limits(self):
		pkg = "Test Package " + frappe.generate_hash(length=4)
		frappe.get_doc({"doctype": "Service Package", "package_name": pkg, "price": 50000, "days": 2,
			"inclusions": [{"charge_type": "Bed", "limit_amount": 0}, {"charge_type": "Medicine", "limit_amount": 1000}]}).insert()
		lines = [ipd._line("Bed", "IPD-BED", "bed", 3, 4000), ipd._line("Medicine", "X", "m1", 1, 700), ipd._line("Medicine", "X", "m2", 1, 700),
			ipd._line("Lab", "Y", "cbc", 1, 900)]
		out = ipd.apply_package(lines, pkg)
		self.assertEqual(out[0]["charge_type"], "Package")
		bed = next(x for x in out if x["charge_type"] == "Bed")
		self.assertEqual(bed["covered_amount"], 8000)          # 2 of 3 days in the package
		meds = [x for x in out if x["charge_type"] == "Medicine"]
		self.assertEqual(sum(m["covered_amount"] for m in meds), 1000)  # medicine limit
		self.assertEqual(next(x for x in out if x["charge_type"] == "Lab")["covered_amount"], 0)
		billable = sum(x["amount"] - x["covered_amount"] for x in out)
		self.assertEqual(billable, 50000 + 4000 + 400 + 900)


class TestW4Admission(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("Clinic Settings", {"mar_approval_gate": 1, "mar_billing_trigger": "On administration",
			"stock_deduction_timing": "Immediately", "require_preauth_for_insurance": 1, "procedure_invoice_trigger": "On completion",
			"discharge_clearance_hold": 1, "enable_consent": 1, "min_bed_days": 1, "nursing_shift_starts": "08:00,14:00,20:00",
			"diet_billing_mode": "Per day", "require_shift_for_billing": 1, "enable_shifts": 1, "ipd_medicine_billing": "Hospital IPD bill"})
		frappe.clear_document_cache("Clinic Settings")

	def test_w4_admission_to_discharge(self):
		ins = "Test Insurer " + frappe.generate_hash(length=4)
		frappe.get_doc({"doctype": "Customer", "customer_name": ins, "customer_group": "Insurance Providers", "territory": "Pakistan",
			"customer_type": "Company", "hv_coverage_percent": 70}).insert()
		pat = new_patient(category="Insurance", insurance_provider=ins, policy_no="P-1")
		bed = free_bed("General")
		# insurance admission without pre-auth is refused
		with self.assertRaises(frappe.ValidationError):
			ipd.admit(pat.name, bed, doctor(), payer_type="Insurance", payer=ins)
		pa = frappe.get_doc({"doctype": "Insurance Pre-Auth", "patient": pat.name, "payer": ins, "requested_amount": 500000, "approved_amount": 400000,
			"approval_no": "PA-T1", "status": "Approved", "valid_till": add_days(today(), 10)}).insert()
		start = datetime.combine(frappe.utils.getdate(add_days(today(), -3)), datetime.min.time()).replace(hour=10)
		adm, token = ipd.admit(pat.name, bed, doctor(), reason="Fever", payer_type="Insurance", payer=ins, pre_auth=pa.name, admit_at=start)
		self.assertEqual(frappe.db.get_value("Hospital Bed", bed, "status"), "Occupied")
		prof = frappe.get_doc("Patient Comms Profile", adm.comms_profile)
		self.assertTrue(prof.active)
		self.assertEqual(prof.token_hash, ipd._hash(token))
		self.assertEqual(adm.coverage_percent, 70)

		# ward round
		w = frappe.get_doc({"doctype": "Ward Round", "bed_allotment": adm.name, "patient": pat.name, "branch": adm.branch, "doctor": doctor(),
			"findings": "Febrile", "plan": "IV antibiotics"})
		w.insert()
		w.submit()
		self.assertEqual(w.round_no, 1)

		# MAR with the approval gate, stock and billing on administration
		code = test_item("TEST-IPD-CEF", rx=1)
		receive(code, IPD_WH)
		from hospital_vvs.services import pharmacy

		units_before = pharmacy.stock_units(code, IPD_WH)
		mo, _alerts = ipd.order_medicine(patient=pat.name, item=code, dose="1 cap", frequency="STAT", units_per_dose=2, doctor=doctor(), adm=adm.name)
		dose = frappe.get_all("MAR Entry", filters={"medication_order": mo.name}, pluck="name")[0]
		self.assertEqual(frappe.db.get_value("MAR Entry", dose, "status"), "Pending Approval")
		with self.assertRaises(frappe.ValidationError):
			ipd.chart_dose(dose, "Administered")
		ipd.approve_dose(dose)
		e = ipd.chart_dose(dose, "Administered")
		self.assertTrue(e.stock_entry)
		self.assertTrue(e.ipd_charge)
		self.assertEqual(pharmacy.stock_units(code, IPD_WH), units_before - 2)

		# bed transfer to ICU 1 day ago (after one midnight in the first bed … two midnights here)
		icu = free_bed("ICU")
		moved_at = add_to_date(now_datetime(), days=-1)
		ipd.transfer(adm.name, icu, "Deteriorating", at=moved_at)
		self.assertEqual(frappe.db.get_value("Hospital Bed", bed, "status"), "Cleaning")
		adm.reload()
		self.assertEqual(len(adm.segments), 2)

		# diet, procedure with consent, ad-hoc, oxygen, lab
		ipd.order_diet(adm.name, "Normal")
		pr = ipd.schedule_procedure(procedure_type="Wound Debridement", adm=adm.name)
		with self.assertRaises(frappe.ValidationError):
			ipd.procedure_status(pr.name, "In Progress")
		ipd.record_consent(patient=pat.name, consent_type="Procedure", signer_name="Patient self", witness_name="Nurse Nargis", procedure=pr.name, adm=adm.name)
		ipd.procedure_status(pr.name, "Completed")
		ipd.add_charge(charge_type="Ad-hoc", item_code="PROC-ECG", qty=1, rate=1200, adm=adm.name)
		ipd.add_charge(charge_type="Oxygen", item_code="IPD-OXYGEN", qty=5, rate=300, adm=adm.name)
		ti = ipd.order_labs(["Complete Blood Count"], adm=adm.name)
		self.assertEqual(frappe.db.get_value("Test Invoice", ti.name, "bill_to_admission"), 1)
		self.assertTrue(frappe.db.exists("IPD Charge", {"bed_allotment": adm.name, "charge_type": "Lab"}))

		# advance in the desk's cashier shift
		shift = desk_shift()
		as_user(DESK)
		ipd.take_payment(5000, "Cash", "Advance", adm=adm.name)
		as_user("Administrator")
		self.assertIn("Cash", [m["mode_of_payment"] for m in shifts.summary(shift.name)["modes"]])

		# clearance: summary unsigned + lab pending → final bill on hold
		with self.assertRaises(frappe.ValidationError):
			ipd.make_final_bill(adm.name)
		frappe.db.sql("update `tabTest Invoice Item` set status='Released' where parent=%s", ti.name)
		ipd.sign_summary(adm.name, {"final_diagnosis": "Cellulitis", "treatment_summary": "IV antibiotics, debridement", "discharge_type": "Normal",
			"medicines": [{"medicine": "Cefixime 400", "dose": "1", "frequency": "OD", "days": 5}]})
		self.assertEqual(frappe.db.get_value("Discharge Summary", {"bed_allotment": adm.name}, "docstatus"), 1)

		bill = ipd.running_bill(adm.name)
		types = {ln["charge_type"] for ln in bill["lines"]}
		for t in ("Bed", "ICU", "Nursing", "Medicine", "Procedure", "Lab", "Diet", "Oxygen", "Ad-hoc"):
			self.assertIn(t, types, t)
		beds = [ln for ln in bill["lines"] if ln["charge_type"] == "Bed"]
		self.assertEqual(len(beds), 2)  # one line per bed segment
		self.assertEqual(sum(ln["qty"] for ln in beds), 3)  # three midnights in all

		inv_name = ipd.make_final_bill(adm.name)
		adm.reload()
		si = frappe.get_doc("Sales Invoice", inv_name)
		pi = frappe.get_doc("Sales Invoice", adm.payer_invoice)
		net = bill["net"]
		self.assertAlmostEqual(flt(si.grand_total) + flt(pi.grand_total), net, delta=2)
		self.assertAlmostEqual(flt(pi.grand_total), round(net * 0.7), delta=2)
		self.assertEqual(si.hv_billing_type, "IPD Slip")
		self.assertAlmostEqual(flt(si.outstanding_amount), flt(si.rounded_total or si.grand_total) - 5000, delta=1)  # advance allocated
		gl = frappe.db.sql("select sum(debit)-sum(credit) from `tabGL Entry` where voucher_no=%s and is_cancelled=0", si.name)[0][0]
		self.assertAlmostEqual(flt(gl), 0, delta=0.01)
		self.assertFalse(frappe.db.exists("IPD Charge", {"bed_allotment": adm.name, "status": "Open"}))

		# dues outstanding → discharge on hold; settle in the shift → bed to cleaning, comms off
		with self.assertRaises(frappe.ValidationError):
			ipd.complete_discharge(adm.name)
		as_user(DESK)
		ipd.take_payment(flt(si.outstanding_amount), "Card", "Settlement", adm=adm.name)
		as_user("Administrator")
		ipd.complete_discharge(adm.name)
		adm.reload()
		self.assertEqual(adm.status, "Discharged")
		self.assertEqual(frappe.db.get_value("Hospital Bed", icu, "status"), "Cleaning")
		self.assertEqual(frappe.db.get_value("Patient Comms Profile", adm.comms_profile, "active"), 0)
		from hospital_vvs.api.ward import _set

		_set(icu, "Available")
		self.assertEqual(frappe.db.get_value("Hospital Bed", icu, "status"), "Available")
		_set(bed, "Available")


class TestContractPharmacyWardOrders(IntegrationTestCase):
	"""D-38: ward medicines go to the contract pharmacy as a prescription; the hospital bill and stock are untouched."""

	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("Clinic Settings", {"ipd_medicine_billing": "Pharmacy bills patient", "mar_approval_gate": 0,
			"enable_medicine": 1, "auto_medicine_invoice": 1})
		frappe.clear_document_cache("Clinic Settings")

	def test_ward_order_billed_by_pharmacy(self):
		pat = new_patient("Ward Order")
		bed = free_bed("General")
		adm, _t = ipd.admit(pat.name, bed, doctor(), reason="Test")
		code = test_item("TEST-WARD-PCM", rx=1)
		mo, _a = ipd.order_medicine(patient=pat.name, item=code, dose="1 tab", frequency="BD", units_per_dose=1, days=2, doctor=doctor(), adm=adm.name)
		mo.reload()
		self.assertTrue(mo.prescription)
		rx = frappe.get_doc("Prescription", mo.prescription)
		self.assertEqual((rx.source, rx.docstatus), ("IPD", 1))
		doses = frappe.db.count("MAR Entry", {"medication_order": mo.name})
		self.assertEqual(rx.medicines[0].qty, doses)
		draft = frappe.get_all("Sales Invoice", filters={"hv_prescription": rx.name, "docstatus": 0}, fields=["name", "company"])
		self.assertEqual(len(draft), 1)
		self.assertEqual(draft[0].company, frappe.db.get_single_value("Clinic Settings", "pharmacy_company"))
		dose = frappe.get_all("MAR Entry", filters={"medication_order": mo.name}, pluck="name", order_by="scheduled_at", limit=1)[0]
		e = ipd.chart_dose(dose, "Administered")
		self.assertFalse(e.stock_entry)
		self.assertFalse(e.ipd_charge)
		self.assertFalse([ln for ln in ipd.running_bill(adm.name)["lines"] if ln["charge_type"] == "Medicine"])
		self.assertTrue(next(c for c in ipd.clearance(adm.name)["checks"] if c["key"] == "pharmacy")["warn"])
		ipd.stop_order(mo.name, "Changed plan")
		self.assertFalse(frappe.db.exists("Sales Invoice", {"hv_prescription": rx.name, "docstatus": 0}))
		frappe.db.set_value("Bed Allotment", adm.name, "status", "Cancelled")
		from hospital_vvs.api.ward import _set

		_set(bed, "Cleaning")
		_set(bed, "Available")


class TestW18Emergency(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("Clinic Settings", {"triage_scale": "Red / Yellow / Green", "enable_emergency": 1, "er_fee": 1500,
			"mar_approval_gate": 0, "require_preauth_for_insurance": 1})
		frappe.clear_document_cache("Clinic Settings")

	def test_w18_unknown_patient_to_admission_and_merge(self):
		v = er.register(unknown={"gender": "Male", "approx_age": 40}, branch="Lahore Main", arrival_mode="Ambulance (1122)",
			chief_complaint="RTA", medico_legal=1)
		tmp = frappe.db.get_value("ER Visit", v.name, "patient")
		self.assertTrue(tmp.startswith("TMP-"))
		self.assertIn("Unknown Male ~40", frappe.db.get_value("Patient", tmp, "patient_name"))
		er.triage(v.name, "Red", {"pulse": 130, "spo2": 88})
		b = er.board("Lahore Main")
		open_rows = [r for r in b["visits"] if r.status != "Disposed"]
		pos = [r.name for r in open_rows].index(v.name)
		self.assertTrue(all(r.triage_rank == 1 for r in open_rows[:pos + 1]))  # red: above every yellow / green / untriaged visit
		ipd.order_labs(["Complete Blood Count"], "Urgent", doctor(), er_visit=v.name)
		code = test_item("TEST-ER-INJ", rx=0)
		receive(code, IPD_WH)
		mo, _a = ipd.order_medicine(patient=tmp, item=code, dose="1 amp", frequency="STAT", er_visit=v.name, doctor=doctor())
		ipd.chart_dose(frappe.get_all("MAR Entry", filters={"medication_order": mo.name}, pluck="name")[0], "Administered")
		er_charges = frappe.db.sql("select sum(amount) from `tabIPD Charge` where er_visit=%s and status='Open'", v.name)[0][0]
		self.assertTrue(flt(er_charges) >= 1500 + 900)
		bed = free_bed("General")
		out = er.dispose(v.name, "Admitted", admit={"bed": bed, "doctor": doctor(), "reason": "Head injury observation"})
		adm = frappe.db.get_value("ER Visit", v.name, "bed_allotment")
		self.assertTrue(adm)
		self.assertEqual(out.status, "Disposed")
		carried = frappe.db.sql("select sum(amount) from `tabIPD Charge` where bed_allotment=%s and status='Open'", adm)[0][0]
		self.assertAlmostEqual(flt(carried), flt(er_charges))  # Bed Allotment carries the ER charges
		self.assertEqual(frappe.db.get_value("Bed Allotment", adm, "source"), "ER")
		# identity found → merge the temporary record into the real patient
		real = new_patient("Identified Patient")
		from hospital_vvs.api.patients import merge

		merge(real.name, tmp, tmp)
		self.assertEqual(frappe.db.get_value("Bed Allotment", adm, "patient"), real.name)
		self.assertEqual(frappe.db.get_value("ER Visit", v.name, "patient"), real.name)
		self.assertEqual(frappe.db.get_value("Patient", tmp, "merged_into"), real.name)
		self.assertEqual(frappe.db.count("IPD Charge", {"patient": tmp}), 0)
		# tidy: discharge without billing the test stay
		frappe.db.set_value("Bed Allotment", adm, "status", "Cancelled")
		from hospital_vvs.api.ward import _set

		_set(bed, "Cleaning")
		_set(bed, "Available")
