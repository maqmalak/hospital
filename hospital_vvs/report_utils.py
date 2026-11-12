"""Shared bits for the Script Reports: branch/date filters and chart helpers."""

import frappe
from frappe.utils import add_days, getdate, today

from hospital_vvs.utils import check_branch, require_company


def dates(filters):
	f = frappe._dict(filters or {})
	to = getdate(f.to_date or today())
	frm = getdate(f.from_date or add_days(to, -29))
	if f.branch:
		check_branch(f.branch)
	return f, frm, to


def branch_sql(f, alias="", by_company=False):
	"""Company is mandatory on every report. `by_company`: the rows carry their own company (invoices, expenses);
	otherwise the company is the one each branch belongs to."""
	args = {"company": require_company(f.company), "branch": f.branch}
	sql = f" and {alias}company=%(company)s" if by_company else f" and {alias}branch in (select name from tabBranch where hv_company=%(company)s)"
	if f.branch:
		sql += f" and {alias}branch=%(branch)s"
	return sql, args


def bar(labels, datasets, kind="bar"):
	return {"data": {"labels": labels, "datasets": datasets}, "type": kind}
