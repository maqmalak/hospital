import { expect, test } from "@playwright/test";
import { as, open } from "./helpers";

/** Recurring expenses (D-54): the accountant sees the templates and the next due date. */
test.use(as("accounts"));
test("accountant sees recurring expenses with their next date", async ({ page }) => {
  await open(page, "/expenses");
  await page.getByRole("button", { name: "Recurring", exact: true }).click();
  await expect(page.getByText("Building rent").first()).toBeVisible();
  await expect(page.getByText(/Next \d{4}-\d{2}-\d{2}/).first()).toBeVisible();
  await page.getByRole("button", { name: /New recurring/ }).click();
  await expect(page.getByPlaceholder("e.g. Building rent")).toBeVisible();
});
