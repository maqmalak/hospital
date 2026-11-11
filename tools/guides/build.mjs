// A4 guide books (PDF) for the help centre (D-63): a cover card with the stages, numbered sections with steps and
// light-theme screenshots taken live as the right staff member. Same idea as the realestate guides.
//   node tools/guides/build.mjs            → screenshots + every guide
//   node tools/guides/build.mjs --no-shots → re-render from the last screenshots
//   node tools/guides/build.mjs lab ipd    → only these guides
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { BASE, USERS, endSessions, startSessions } from "../videos/lib.mjs";
import { GUIDES } from "./content.mjs";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const HERE = new URL(".", import.meta.url).pathname;
const SHOTS = join(HERE, "out/shots");
const OUT = join(HERE, "../../hospital_vvs/public/help");
mkdirSync(SHOTS, { recursive: true });
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const noShots = args.includes("--no-shots");
const only = args.filter((a) => !a.startsWith("--"));
const guides = GUIDES.filter((g) => !only.length || only.includes(g.slug));

async function shots(sids) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const host = new URL(BASE).hostname;
  const ctxs = {};
  const ctxFor = async (role) => {
    if (ctxs[role]) return ctxs[role];
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25, colorScheme: "light", locale: "en-GB" });
    await c.addInitScript(() => { try { localStorage.setItem("hv.theme", "light"); localStorage.setItem("hv.lang", "en"); } catch { /* ignore */ } window.print = () => undefined; });
    if (role !== "guest") await c.addCookies([{ name: "sid", value: sids[USERS[role][0]], domain: host, path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
    ctxs[role] = c;
    return c;
  };
  const wanted = new Map();
  for (const g of guides) for (const s of g.sections) for (const st of s.shots ?? []) wanted.set(st.key, st);
  for (const [key, st] of wanted) {
    const file = join(SHOTS, `${key}.jpg`);
    try {
      const page = await (await ctxFor(st.role)).newPage();
      await page.goto(`${BASE}/hms${st.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(st.wait ?? 2500);
      if (st.scroll) await page.mouse.wheel(0, st.scroll), await page.waitForTimeout(900);
      await page.screenshot({ path: file, type: "jpeg", quality: 78 });
      await page.close();
      console.log(`  shot ${key}`);
    } catch (e) { console.warn(`  ! shot ${key}: ${e.message.split("\n")[0]}`); }
  }
  await browser.close();
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const img = (key) => { const f = join(SHOTS, `${key}.jpg`); return existsSync(f) ? `data:image/jpeg;base64,${readFileSync(f).toString("base64")}` : null; };

function html(g) {
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const sections = g.sections.map((s, i) => `
    <section>
      <h2><span>${i + 1}</span>${esc(s.title)}</h2>
      ${s.intro ? `<p class="intro">${md(s.intro)}</p>` : ""}
      ${s.steps?.length ? `<ol>${s.steps.map((x) => `<li>${md(x)}</li>`).join("")}</ol>` : ""}
      ${(s.shots ?? []).map((st) => { const src = img(st.key); return src ? `<figure><img src="${src}"/><figcaption>${md(st.caption ?? "")}</figcaption></figure>` : ""; }).join("")}
      ${s.note ? `<div class="note">${md(s.note)}</div>` : ""}
    </section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(g.title)}</title><style>
  @page { size: A4; margin: 14mm 13mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 "Segoe UI", system-ui, Arial, sans-serif; color: #0f172a; margin: 0; }
  .cover { background: linear-gradient(135deg,#0f766e,#064e3b 60%,#0c4a6e); color: #fff; border-radius: 16px; padding: 26px 28px; margin-bottom: 18px; }
  .cover em { font: 700 8pt/1 system-ui; letter-spacing: .22em; text-transform: uppercase; color: #99f6e4; font-style: normal; }
  .cover h1 { font-size: 24pt; line-height: 1.15; margin: 10px 0 8px; }
  .cover p { color: #ccfbf1; margin: 0 0 14px; max-width: 150mm; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips span { background: rgba(255,255,255,.13); border: 1px solid rgba(255,255,255,.25); border-radius: 999px; padding: 4px 10px; font-size: 8.5pt; font-weight: 600; }
  .meta { margin-top: 14px; font-size: 8pt; color: #a7f3d0; }
  section { break-inside: auto; margin: 0 0 14px; }
  h2 { display: flex; align-items: center; gap: 10px; font-size: 14pt; margin: 18px 0 6px; padding-bottom: 5px; border-bottom: 2px solid #ccfbf1; break-after: avoid; }
  h2 span { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #0f766e; color: #fff; font-size: 10pt; }
  .intro { margin: 4px 0 6px; color: #334155; }
  ol { margin: 4px 0 8px 18px; padding: 0; } li { margin: 2px 0; } li::marker { color: #0f766e; font-weight: 700; }
  figure { margin: 8px 0 10px; break-inside: avoid; }
  figure img { width: 100%; border: 1px solid #e2e8f0; border-radius: 10px; box-shadow: 0 2px 8px rgba(15,23,42,.08); }
  figcaption { font-size: 8.5pt; color: #64748b; margin-top: 3px; }
  .note { background: #f0fdfa; border-left: 4px solid #14b8a6; padding: 8px 12px; border-radius: 6px; font-size: 9.5pt; break-inside: avoid; }
  </style></head><body>
  <div class="cover"><em>VVS Hospital · Hospital ERP · Guide</em><h1>${esc(g.title)}</h1><p>${md(g.summary)}</p>
    <div class="chips">${g.stages.map((s, i) => `<span>${i + 1}. ${esc(s)}</span>`).join("")}</div>
    <div class="meta">For: ${esc(g.for)} · ${today} · Open the app at /hms and follow along; each screen shown here is the live app.</div></div>
  ${sections}
  </body></html>`;
}

async function render() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  for (const g of guides) {
    const file = join(OUT, `${g.slug}.pdf`);
    const htmlFile = join(HERE, "out", `${g.slug}.html`);
    writeFileSync(htmlFile, html(g));
    await page.goto(`file://${htmlFile}`, { waitUntil: "load" });
    await page.pdf({ path: file, format: "A4", printBackground: true, margin: { top: "14mm", bottom: "16mm", left: "13mm", right: "13mm" },
      displayHeaderFooter: true, headerTemplate: "<span></span>",
      footerTemplate: `<div style="font:8px system-ui;color:#94a3b8;width:100%;padding:0 13mm;display:flex;justify-content:space-between"><span>VVS Hospital · ${esc(g.title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>` });
    console.log(`✓ ${g.slug}.pdf`);
  }
  await browser.close();
}

if (!noShots) {
  const sids = startSessions();
  try { await shots(sids); } finally { endSessions(); }
}
await render();
