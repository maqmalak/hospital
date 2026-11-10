import { expect, test } from "@playwright/test";
import { as, bench, noPrint, open } from "./helpers";

/** Pharmacy counter (W6a / W6b start): the cashier finds a medicine and puts it in the cart. */
test.use(as("cashier"));
test("cashier searches a medicine and adds it to the cart", async ({ page }) => {
  bench("open_shift", { user: "cashier@vvs.demo", counter: "Pharmacy 1" });
  await noPrint(page);
  await open(page, "/medicine_invoice");
  const search = page.getByPlaceholder(/Scan barcode or search brand/);
  await search.fill("Panadol");
  const card = page.locator("button:not([disabled])", { hasText: /Panadol/ }).first();
  await expect(card).toBeVisible();
  const before = await page.getByText(/Panadol/).count();
  await card.click();
  await expect.poll(async () => page.getByText(/Panadol/).count()).toBeGreaterThan(before);
});
