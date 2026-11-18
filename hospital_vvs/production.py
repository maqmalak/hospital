"""Server-side helpers for deploy/ scripts (run with `bench --site … execute`)."""
import os

import frappe
from frappe.utils.password import update_password


def set_all_passwords():
	"""Give every enabled user the password in $USERS_PASSWORD (deploy/set-passwords.sh asks for it, hidden).
	Administrator only with $INCLUDE_ADMINISTRATOR=1. Their sessions are logged out."""
	pwd = os.environ.get("USERS_PASSWORD") or ""
	if len(pwd) < 8:
		frappe.throw("USERS_PASSWORD must be set (at least 8 characters).")
	skip = {"Guest"} if os.environ.get("INCLUDE_ADMINISTRATOR") == "1" else {"Guest", "Administrator"}
	users = [u for u in frappe.get_all("User", {"enabled": 1}, pluck="name") if u not in skip]
	for user in users:
		update_password(user, pwd, logout_all_sessions=True)
	frappe.db.commit()
	print(f"{len(users)} user(s) updated")
