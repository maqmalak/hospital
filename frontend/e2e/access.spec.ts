import { expect, test } from "@playwright/test";
import { as, open } from "./helpers";

/** Role-filtered home and route guard (Phase 0 exit; 11-routes.md). */
test.describe("reception", () => {
  test.use(as("reception"));
  test("home shows the reception tools", async ({ page }) => {
    await open(page, "/pw-home");
    await expect(page.getByRole("link", { name: /Patient registration/i }).first()).toBeVisible();
  });
});

test.describe("cashier", () => {
  test.use(as("cashier"));
  test("cannot open the prescription workspace", async ({ page }) => {
    await open(page, "/pw-prescription");
    await expect(page.getByText("No access")).toBeVisible();
  });
});
