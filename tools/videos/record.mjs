// node tools/videos/record.mjs            → record every scene in scenes/
// node tools/videos/record.mjs 03 07      → only scenes whose file name starts with these prefixes
// Sessions for the demo users are minted once and signed out at the end (no passwords; real staff are never logged out).
import { readdirSync } from "node:fs";
import { endSessions, scene, startSessions } from "./lib.mjs";

const dir = new URL("./scenes/", import.meta.url).pathname;
const only = process.argv.slice(2);
const files = readdirSync(dir).filter((f) => f.endsWith(".mjs") && (!only.length || only.some((p) => f.startsWith(p)))).sort();
let failed = 0;
startSessions();
try {
  for (const f of files) {
    const mod = await import(`${dir}${f}`);
    if (!(await scene(f.replace(/\.mjs$/, ""), mod.default))) failed++;
  }
} finally {
  endSessions();
}
process.exit(failed ? 1 : 0);
