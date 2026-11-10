import { defineConfig } from "@playwright/test";

/** E2E against the running site (12-workflows.md). Uses the installed Google Chrome; sessions come from e2e/global-setup.ts.
 *  npm run e2e                      # all
 *  E2E_PASSWORD=… npm run e2e       # also the real login form test
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "e2e-report", open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://hospital.localhost:8011",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
