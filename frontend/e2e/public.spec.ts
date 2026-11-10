import { expect, test } from "@playwright/test";

/** Public pages need no login and give nothing away on a wrong link. */
test("a forged lab report QR is rejected", async ({ page }) => {
  await page.goto("/hms/verify-report/LAB-2026-00001/forged");
  await expect(page.getByText(/not a valid report/i).first()).toBeVisible();
});

test("an unknown lab report link shows an error, not a report", async ({ page }) => {
  await page.goto(`/hms/lab-report/${"x".repeat(32)}`);
  await expect(page.getByText(/not valid|expired|not found|invalid/i).first()).toBeVisible();
});

test("the online visit form opens for patients", async ({ page }) => {
  await page.goto("/hms/online-visit");
  await expect(page.getByText(/online/i).first()).toBeVisible();
  await expect(page.getByText("No access")).toHaveCount(0);
});
