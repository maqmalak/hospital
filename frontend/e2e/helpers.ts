import { execFileSync } from "node:child_process";
import { type APIRequestContext, type Page, expect } from "@playwright/test";

export const BENCH = process.env.E2E_BENCH ?? "/home/maqmalak/erpnext-react";
export const SITE = process.env.E2E_SITE ?? "hospital";
export const USERS = {
  admin: "admin@vvs.demo", reception: "reception@vvs.demo", nurse: "nurse@vvs.demo", doctor: "dr.ayesha@vvs.demo", cashier: "cashier@vvs.demo",
  finder: "finder@vvs.demo", accounts: "accounts@vvs.demo", lab: "lab@vvs.demo", pathologist: "pathologist@vvs.demo",
} as const;
export const stateFile = (user: string) => `.e2e-state/${user.replace(/[^a-z0-9]/gi, "_")}.json`;
export const as = (role: keyof typeof USERS) => ({ storageState: stateFile(USERS[role]) });

/** Server-side helper (setup that is not part of the flow under test). */
export function bench(what: string, kw: Record<string, unknown> = {}) {
  return execFileSync("bench", ["--site", SITE, "execute", "hospital_vvs.devtools.e2e.state", "--kwargs", JSON.stringify({ what, ...kw })], { cwd: BENCH, encoding: "utf8" });
}

/** Whitelisted call from inside the logged-in browser (same cookies + CSRF as the app). */
export async function apiCall(page: Page, method: string, args: Record<string, unknown> = {}) {
  return page.evaluate(async ([m, a]) => {
    const csrf = (window as unknown as { csrf_token?: string }).csrf_token ?? "";
    const r = await fetch(`/api/method/${m}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": csrf }, body: JSON.stringify(a), credentials: "include" });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }, [method, args] as const);
}

export async function open(page: Page, path: string) {
  await page.goto(`/hms${path}`);
  await expect(page.getByText("Loading", { exact: true })).toHaveCount(0);
}

export async function raw(request: APIRequestContext, method: string, data: Record<string, string> = {}) {
  return request.post(`/api/method/${method}`, { form: data });
}

/** bench() helper whose last stdout line is JSON. */
export function benchJson<T = Record<string, unknown>>(what: string, kw: Record<string, unknown> = {}): T {
  const line = bench(what, kw).trim().split("\n").filter((l) => l.startsWith("{") || l === "null").pop() ?? "null";
  return JSON.parse(line) as T;
}

/** Print dialogs never open in tests. */
export async function noPrint(page: Page) {
  await page.addInitScript(() => { window.print = () => undefined; });
}
