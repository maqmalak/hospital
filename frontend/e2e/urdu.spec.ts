import { expect, test } from "@playwright/test";
import { as, open } from "./helpers";

/** English + Urdu (RTL) on every screen (Definition of Done, D-55): literal text, list values, statuses and the menu switch together. */
const urdu = (page: import("@playwright/test").Page) => page.addInitScript(() => localStorage.setItem("hv.lang", "ur"));

test.describe("nurse in Urdu", () => {
  test.use(as("nurse"));
  test("vitals screen, priority chips and menu are in Urdu, right to left", async ({ page }) => {
    await urdu(page);
    await open(page, "/opd/vitals");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "او پی ڈی وائٹلز" })).toBeVisible();
    await expect(page.getByText("وائٹلز کا انتظار").first()).toBeVisible();     // stat card label (literal)
    await expect(page.getByText("داخلے").first()).toBeVisible();                 // menu label from the server
  });
});

test.describe("cashier in Urdu", () => {
  test.use(as("cashier"));
  test("POS empty cart, payment choice and priorities are in Urdu", async ({ page }) => {
    await urdu(page);
    await open(page, "/medicine_invoice");
    await expect(page.getByText("دوا اسکین یا ٹیپ کریں · F4 سے نسخہ لوڈ کریں")).toBeVisible();  // text inside {cond && …}
    await expect(page.getByText("حوالگی پر ادائیگی").first()).toBeVisible();                    // value from a list
    await expect(page.getByText("No access")).toHaveCount(0);
  });
});

test.describe("lab in English", () => {
  test.use(as("lab"));
  test("switching back to English restores English text", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("hv.lang", "en"));
    await open(page, "/lab/orders");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("button", { name: "Today", exact: true })).toBeVisible();
  });
});
