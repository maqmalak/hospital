import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { USERS, stateFile, BENCH, SITE } from "./helpers";

/** One server-side session per role → Playwright storage state (no passwords in tests). */
export default async function globalSetup() {
  const out = execFileSync("bench", ["--site", SITE, "execute", "hospital_vvs.devtools.e2e.sessions", "--kwargs", JSON.stringify({ users: Object.values(USERS) })],
    { cwd: BENCH, encoding: "utf8" });
  const line = out.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  if (!line) throw new Error(`no sessions from bench:\n${out}`);
  const sids = JSON.parse(line) as Record<string, string>;
  const host = new URL(process.env.E2E_BASE_URL ?? "http://hospital.localhost:8011").hostname;
  mkdirSync(".e2e-state", { recursive: true });
  for (const [user, sid] of Object.entries(sids)) {
    writeFileSync(stateFile(user), JSON.stringify({ cookies: [{ name: "sid", value: sid, domain: host, path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] }));
  }
}
