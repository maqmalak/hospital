"""Disease statistics by ICD-10 diagnosis, age group and gender (health department reporting)."""

import frappe
from frappe import _

from hospital_vvs.report_utils import bar, branch_sql, dates

BANDS = [("0-4", 0, 5), ("5-14", 5, 15), ("15-29", 15, 30), ("30-44", 30, 45), ("45-59", 45, 60), ("60+", 60, 200)]


def execute(filters=None):
	f, frm, to = dates(filters)
	bsql, args = branch_sql(f, "p.")
	data = frappe.db.sql(f"""select d.diagnosis icd, d.diagnosis_name, pt.gender, timestampdiff(year, pt.dob, p.prescription_date) age
		from `tabPrescription Diagnosis` d join tabPrescription p on p.name=d.parent join tabPatient pt on pt.name=p.patient
		where p.docstatus=1 and p.status='Signed' and p.prescription_date between %(frm)s and %(to)s {bsql}""",
		dict(args, frm=frm, to=to), as_dict=True)
	rows = {}
	for r in data:
		row = rows.setdefault(r.icd, {"icd": r.icd, "diagnosis_name": r.diagnosis_name, "male": 0, "female": 0, "total": 0,
			**{b[0]: 0 for b in BANDS}})
		row["total"] += 1
		if r.gender in ("Male", "Female"):
			row[r.gender.lower()] += 1
		for label, lo, hi in BANDS:
			if r.age is not None and lo <= r.age < hi:
				row[label] += 1
	out = sorted(rows.values(), key=lambda x: -x["total"])
	cols = [{"fieldname": "icd", "label": _("ICD-10"), "fieldtype": "Link", "options": "Diagnosis", "width": 90},
		{"fieldname": "diagnosis_name", "label": _("Diagnosis"), "width": 220}] + [
		{"fieldname": b[0], "label": b[0], "fieldtype": "Int", "width": 70} for b in BANDS] + [
		{"fieldname": "male", "label": _("Male"), "fieldtype": "Int", "width": 70},
		{"fieldname": "female", "label": _("Female"), "fieldtype": "Int", "width": 70},
		{"fieldname": "total", "label": _("Total"), "fieldtype": "Int", "width": 70}]
	top = out[:10]
	chart = bar([r["diagnosis_name"] for r in top], [{"name": _("Cases"), "values": [r["total"] for r in top]}])
	return cols, out, None, chart
