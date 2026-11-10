import { expect, test } from "@playwright/test";
import { apiCall, as, benchJson, open } from "./helpers";

/** W15 security (09-security-ops.md): money roles get no clinical data, the admin sees who viewed what, guests reach nothing. */
const subject = () => benchJson<{ rx: string; mr: string }>("subject");

test.describe("cashier", () => {
  test.use(as("cashier"));
  test("history screen and clinical endpoints are refused", async ({ page }) => {
    const { mr, rx } = subject();
    await open(page, `/pw-history/${mr}`);
    await expect(page.getByText("No access")).toBeVisible();
    for (const [m, a] of [["hospital_vvs.api.patients.history", { name: mr }], ["hospital_vvs.api.prescription.copy_previous", { patient: mr }],
      ["hospital_vvs.api.prescription.print_data", { name: rx }]] as const) {
      const r = await apiCall(page, m, a);
      expect(r.status, m).toBe(403);
    }
  });
  test("patient record comes without allergies or chronic conditions", async ({ page }) => {
    const { mr } = subject();
    await open(page, "/pw-home");
    const r = await apiCall(page, "frappe.client.get", { doctype: "Patient", name: mr });
    expect(r.status).toBe(200);
    expect(r.body.message.allergies ?? []).toHaveLength(0);
    expect(r.body.message.chronic_conditions ?? []).toHaveLength(0);
  });
});

test.describe("finder", () => {
  test.use(as("finder"));
  test("reads a prescription's medicines but not its diagnoses", async ({ page }) => {
    const { rx } = subject();
    await open(page, "/pw-home");
    const r = await apiCall(page, "frappe.client.get", { doctype: "Prescription", name: rx });
    expect(r.body.message.medicines.length).toBeGreaterThan(0);
    expect(r.body.message.diagnoses ?? []).toHaveLength(0);
  });
});

test.describe("doctor then admin", () => {
  test("a history view appears on the admin audit screen", async ({ browser }) => {
    const { mr } = subject();
    const doc = await (await browser.newContext(as("doctor"))).newPage();
    await open(doc, `/pw-history/${mr}`);
    await expect(doc.getByText(mr).first()).toBeVisible();
    const admin = await (await browser.newContext(as("admin"))).newPage();
    await open(admin, "/audit");
    await expect(admin.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(admin.getByText(mr).first()).toBeVisible();
    const r = await apiCall(doc, "hospital_vvs.api.admin.audit", { patient: mr });
    expect(r.status).toBe(403);  // only the admin opens the audit log
  });
});

test("a guest gets nothing from staff endpoints", async ({ request }) => {
  for (const m of ["hospital_vvs.api.patients.search", "hospital_vvs.api.opd.queue", "hospital_vvs.api.admin.audit", "hospital_vvs.api.pharmacy.receipt"]) {
    const r = await request.post(`/api/method/${m}`, { form: { q: "MR" } });
    expect(r.status(), m).toBe(403);
  }
});
