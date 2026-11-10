import { expect, test } from "@playwright/test";

/** The real login form (Phase 0 exit). Needs E2E_PASSWORD (the demo users' password); skipped otherwise. */
const PASSWORD = process.env.E2E_PASSWORD;

test("wrong password shows a clear message", async ({ page }) => {
  await page.goto("/hms/login");
  await page.getByPlaceholder("name@hospital.pk").fill("nurse@vvs.demo");
  await page.getByPlaceholder("••••••••").fill("not-the-password");
  await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
  await expect(page.getByText(/don't match/)).toBeVisible();
});

test("a nurse signs in and lands on the control board", async ({ page }) => {
  test.skip(!PASSWORD, "set E2E_PASSWORD to run the real login");
  await page.goto("/hms/login");
  await page.getByPlaceholder("name@hospital.pk").fill("nurse@vvs.demo");
  await page.getByPlaceholder("••••••••").fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
  await expect(page).toHaveURL(/\/hms\/pw-home/);
  await expect(page.getByText(/OPD vitals/).first()).toBeVisible();
});
