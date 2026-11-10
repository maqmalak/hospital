import { expect, test } from "@playwright/test";
import { as, open } from "./helpers";

/** Lab orders screen (D-49): date filters and priority tags. */
test.use(as("lab"));
test("orders can be filtered by period and priority", async ({ page }) => {
  await open(page, "/lab/orders");
  for (const l of ["Today", "Week", "Month", "Custom"]) await expect(page.getByRole("button", { name: l, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(page.locator('input[type="date"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Urgent", exact: true }).click();
  await page.getByRole("button", { name: "Any priority", exact: true }).click();
  await expect(page.getByPlaceholder("Name, MR or order no.")).toBeVisible();
});
