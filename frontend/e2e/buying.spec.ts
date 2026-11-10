import { expect, test } from "@playwright/test";
import { as, open } from "./helpers";

/** Buying & assets (D-59): the accountant's dashboard, a purchase order, the asset register and consumption. */
test.use(as("accounts"));
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem("hv.buy.company", "")); });

test("buying dashboard and a purchase order", async ({ page }) => {
  await open(page, "/buying");
  await expect(page.getByText("Owed to suppliers")).toBeVisible();
  await open(page, "/purchase_order");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.locator("tbody tr").first().click();
  await expect(page.getByText("Supplier invoices").first()).toBeVisible();
});

test("asset register opens an asset with its depreciation schedule", async ({ page }) => {
  await open(page, "/assets");
  await expect(page.getByText("Asset register")).toBeVisible();
  await page.locator("tbody tr").first().click();
  await expect(page.getByText(/Depreciation booked/)).toBeVisible();
});

test("consumption by department", async ({ page }) => {
  await open(page, "/consumption");
  await expect(page.getByText("Cost by department")).toBeVisible();
  await expect(page.getByText("Laboratory").first()).toBeVisible();
});
