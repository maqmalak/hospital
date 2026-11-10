import { expect, test, type Browser } from "@playwright/test";
import { benchJson, noPrint, open, stateFile, USERS } from "./helpers";

/** W1 (OPD part, D-52): register → OPD slip + token → nurse vitals → doctor's pending list → prescription signed and printable. */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString().slice(-6);
const LAST = ["Raza", "Awan", "Malik", "Qureshi", "Butt", "Siddiqui", "Bhatti", "Iqbal", "Javed", "Abbasi"];
const FIRST = ["Bilal", "Hamza", "Usman", "Faisal", "Kamran", "Naveed", "Zubair", "Asad", "Tariq", "Shahid"];
const NAME = `${FIRST[Number(stamp[3])]} ${LAST[Number(stamp[5])]} ${LAST[Number(stamp[4])]}`;  // 1,000 combinations; age varies too (duplicate check)
const AGE = String(20 + (Number(stamp) % 50));
const PHONE = `300${Math.floor(1000000 + Math.random() * 8999999)}`;
let mr = "";

async function page(browser: Browser, role: keyof typeof USERS) {
  const ctx = await browser.newContext({ storageState: stateFile(USERS[role]) });
  const p = await ctx.newPage();
  await noPrint(p);
  return p;
}

test("reception registers a new patient and issues an OPD slip with a token", async ({ browser }) => {
  benchJson("open_shift", { user: USERS.reception, counter: "Reception 1" });
  const doc = benchJson<{ doctor_name: string }>("doctor", { user: USERS.doctor });
  const p = await page(browser, "reception");
  await open(p, "/registration");
  await p.getByPlaceholder("Muhammad Ali Khan").fill(NAME);
  await p.locator("button", { hasText: /^Male$/ }).first().click();
  await p.getByPlaceholder("Age").fill(AGE);
  await p.getByPlaceholder("300 1234567").fill(PHONE);
  await p.getByRole("button", { name: /Register & OPD slip/ }).click();
  await expect(p).toHaveURL(/\/opd_slip\?patient=MR-/);
  mr = new URL(p.url()).searchParams.get("patient") ?? "";
  expect(mr).toMatch(/^MR-/);
  await p.getByRole("button", { name: new RegExp(doc.doctor_name) }).first().click();
  const save = p.getByRole("button", { name: /Save & print/ });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(p.getByText(/Token \d+ · OPD/)).toBeVisible();
  const q = benchJson<{ status: string; token_no: number }>("queue_status", { patient: mr });
  expect(q.status).toBe("Vitals");  // the nurse is next (Clinic Settings → OPD: nurse takes vitals)
});

test("nurse records vitals and sends the token to the doctor", async ({ browser }) => {
  const p = await page(browser, "nurse");
  await open(p, "/opd/vitals");
  await p.getByRole("button", { name: new RegExp(NAME) }).click();
  await expect(p.getByRole("heading", { name: NAME })).toBeVisible();
  for (const [label, v] of [["BP systolic", "128"], ["BP diastolic", "84"], ["Pulse", "78"], ["Temperature", "99.1"], ["SpO₂", "98"], ["Weight", "72"], ["Height", "172"]] as const) {
    await p.getByLabel(new RegExp(`^${label}`)).fill(v);
  }
  await expect(p.getByText(/BMI/)).toContainText("24.3");
  await p.getByRole("button", { name: /Save & send to/ }).click();
  await expect(p.getByText(/sent to/)).toBeVisible();
  expect(benchJson<{ status: string }>("queue_status", { patient: mr }).status).toBe("Waiting");
});

test("doctor opens the patient from the pending list, prescribes and signs", async ({ browser }) => {
  const p = await page(browser, "doctor");
  await open(p, "/pw-prescription");
  await p.getByRole("button", { name: new RegExp(NAME) }).first().click();
  await expect(p).toHaveURL(/queue=QE-/);
  await expect(p.getByText("128/84").first()).toBeVisible();  // nurse's vitals reach the doctor
  const search = p.getByPlaceholder("Medicine — brand or generic");
  await search.fill("Panadol");
  const hit = p.locator("div.absolute button", { hasText: /Panadol/ }).first();  // the search drop-down
  await expect(hit).toBeVisible();
  await hit.dispatchEvent("mousedown");
  await expect(p.getByText(/Panadol/).first()).toBeVisible();
  await expect(p.getByPlaceholder("Qty").first()).toBeVisible();  // a medicine line is on the prescription
  await expect(p.getByPlaceholder("Qty").first()).not.toHaveValue("");  // quantity worked out (D-51)
  await p.locator("button", { hasText: /^\+ / }).first().click();  // one-click diagnosis chip
  await p.getByRole("button", { name: /Sign & print/ }).click();
  await expect(p.getByText(/Signed — this prescription can no longer be edited/)).toBeVisible();
  await expect(p.getByRole("button", { name: /^Print$/ })).toBeVisible();
  const rx = benchJson<{ meds: number }>("last_rx", { patient: mr });
  expect(rx.meds).toBeGreaterThan(0);  // the signed prescription really carries the medicine
});
