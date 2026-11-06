"""Shared bits for the Script Reports: branch/date filters and chart helpers."""

import frappe
from frappe.utils import add_days, getdate, today

from hospital_vvs.utils import check_branch


def dates(filters):
	f = frappe._dict(filters or {})
	to = getdate(f.to_date or today())
	frm = getdate(f.from_date or add_days(to, -29))
	if f.branch:
		check_branch(f.branch)
	return f, frm, to


def branch_sql(f, alias=""):
	return (f" and {alias}branch=%(branch)s", {"branch": f.branch}) if f.branch else ("", {})


def bar(labels, datasets, kind="bar"):
	return {"data": {"labels": labels, "datasets": datasets}, "type": kind}
