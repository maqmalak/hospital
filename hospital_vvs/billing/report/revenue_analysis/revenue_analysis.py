import frappe
from frappe import _

from hospital_vvs.report_utils import bar, branch_sql, dates


def execute(filters=None):
	"""Net revenue by billing type, department, doctor and service (07, 10)."""
	f, frm, to = dates(filters)
	bsql, args = branch_sql(f, "si.")
	rows = frappe.db.sql(f"""select si.hv_billing_type billing_type, ifnull(dep.name, '') department, ifnull(d.doctor_name, '') doctor, sii.item_name service,
		sum(sii.qty) qty, sum(sii.base_amount) gross, sum(sii.base_net_amount) net
		from `tabSales Invoice Item` sii join `tabSales Invoice` si on si.name=sii.parent left join tabDoctor d on d.name=sii.hv_doctor
		left join `tabMedical Department` dep on dep.name=d.department
		where si.docstatus=1 and si.posting_date between %(frm)s and %(to)s and ifnull(si.hv_billing_type,'')!='' {bsql}
		group by si.hv_billing_type, dep.name, d.doctor_name, sii.item_name order by net desc""", dict(args, frm=frm, to=to), as_dict=True)
	cols = [{"fieldname": "billing_type", "label": _("Billing type"), "width": 110}, {"fieldname": "department", "label": _("Department"), "width": 150},
		{"fieldname": "doctor", "label": _("Doctor"), "width": 170}, {"fieldname": "service", "label": _("Service"), "width": 200},
		{"fieldname": "qty", "label": _("Qty"), "fieldtype": "Float", "width": 70}, {"fieldname": "gross", "label": _("Gross"), "fieldtype": "Currency", "width": 120},
		{"fieldname": "net", "label": _("Net"), "fieldtype": "Currency", "width": 120}]
	by_type = {}
	for r in rows:
		by_type[r.billing_type] = by_type.get(r.billing_type, 0) + (r.net or 0)
	return cols, rows, None, bar(list(by_type), [{"name": _("Net revenue"), "values": list(by_type.values())}])
