import frappe
def make():
    from werkzeug.test import EnvironBuilder
    from werkzeug.wrappers import Request
    from frappe.auth import CookieManager
    from frappe.sessions import Session
    frappe.local.request = Request(EnvironBuilder(path="/").get_environ())
    frappe.local.request_ip = "127.0.0.1"
    frappe.local.cookie_manager = CookieManager()
    s = Session("admin@vvs.demo", resume=False, full_name="Nadia Admin", user_type="System User")
    frappe.db.commit(); print("SID=" + s.sid)
def drop(sid):
    from frappe.sessions import delete_session
    delete_session(sid, reason="test done"); frappe.db.commit(); print("dropped")
