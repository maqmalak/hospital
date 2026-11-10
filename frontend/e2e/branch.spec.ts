import { expect, test } from "@playwright/test";
import { apiCall, as, open } from "./helpers";

/** W17 branch isolation (live site has one branch; the two-branch case is tests/test_phase7.TestW17BranchIsolation). */
test.describe("reception", () => {
  test.use(as("reception"));
  test("only its own branch is offered and another branch is refused", async ({ page }) => {
    await open(page, "/pw-home");
    await expect(page.getByText("Lahore Main").first()).toBeVisible();
    for (const [m, a] of [["hospital_vvs.api.opd.queue", { branch: "Other Branch" }], ["hospital_vvs.api.opd.recent_slips", { branch: "Other Branch" }]] as const) {
      expect((await apiCall(page, m, a)).status, m).toBe(403);
    }
    expect((await apiCall(page, "hospital_vvs.api.opd.queue", {})).status).toBe(200);
  });
});

test.describe("cashier", () => {
  test.use(as("cashier"));
  test("cannot open a shift on a counter it is not on", async ({ page }) => {
    await open(page, "/pw-home");
    const r = await apiCall(page, "hospital_vvs.api.cash.open_shift", { counter: "Reception 1", balances: JSON.stringify({ Cash: 1 }) });
    expect(r.status).toBe(403);
  });
});
