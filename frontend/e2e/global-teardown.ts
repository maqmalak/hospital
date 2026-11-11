import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { BENCH, SITE } from "./helpers";

/** Sign out the sessions global-setup created: each demo user has a simultaneous-session limit, and a session left behind
 *  would push out a real person signed in as the same user. */
export default async function globalTeardown() {
  if (!existsSync(".e2e-state/sids.json")) return;
  const sids = readFileSync(".e2e-state/sids.json", "utf8");
  execFileSync("bench", ["--site", SITE, "execute", "hospital_vvs.devtools.e2e.end_sessions", "--kwargs", JSON.stringify({ sids: JSON.parse(sids) })], { cwd: BENCH, encoding: "utf8" });
}
