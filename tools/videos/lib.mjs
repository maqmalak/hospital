// Recording harness (ported from the realestate videos, D-63): system Chrome via Playwright, one .webm per scene, with a
// caption bar, a visible pointer, readable zoom on every click and a badge showing which staff member is acting.
// Sessions are minted on the server per demo user (devtools/e2e.sessions) — no passwords — and signed out at the end.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

export const BASE = process.env.HV_BASE ?? "http://hospital.localhost:8011";
export const BENCH = process.env.HV_BENCH ?? "/home/maqmalak/erpnext-react";
export const SITE = process.env.HV_SITE ?? "hospital";
export const OUT = new URL("./out/", import.meta.url).pathname;
const SIZE = { width: 1440, height: 900 };
const ZOOM = Number(process.env.HV_ZOOM ?? 1.6);  // interactions zoom in this much (HV_ZOOM=1 turns it off)

export const USERS = {
  reception: ["reception@vvs.demo", "Reception"], nurse: ["nurse@vvs.demo", "Nurse"], doctor: ["dr.ayesha@vvs.demo", "Doctor"],
  lab: ["lab@vvs.demo", "Lab technologist"], pathologist: ["pathologist@vvs.demo", "Pathologist"], cashier: ["cashier@vvs.demo", "Pharmacy cashier"],
  finder: ["finder@vvs.demo", "Pharmacy finder"], reviewer: ["pharmacist@vvs.demo", "Pharmacist"], dispenser: ["dispenser@vvs.demo", "Dispenser"],
  store: ["store@vvs.demo", "Store keeper"], supervisor: ["supervisor@vvs.demo", "Cash supervisor"], accounts: ["accounts@vvs.demo", "Accountant"],
  headnurse: ["headnurse@vvs.demo", "Head nurse"], admin: ["admin@vvs.demo", "Admin"],
};

// ---------------------------------------------------------------- server helpers
export function bench(module, kw = {}) {
  const out = execFileSync("bench", ["--site", SITE, "execute", module, "--kwargs", JSON.stringify(kw)], { cwd: BENCH, encoding: "utf8", maxBuffer: 1 << 24 });
  const line = out.trim().split("\n").filter((l) => l.startsWith("{") || l.startsWith("[") || l === "null").pop() ?? "null";
  return JSON.parse(line);
}
/** devtools.e2e.state(what=…) helpers (open_shift, doctor, queue_status, …). */
export const state = (what, kw = {}) => bench("hospital_vvs.devtools.e2e.state", { what, ...kw });

let SIDS = null;
export function startSessions() {
  const users = Object.values(USERS).map(([u]) => u);
  SIDS = bench("hospital_vvs.devtools.e2e.sessions", { users });
  return SIDS;
}
export function endSessions() {
  if (SIDS) bench("hospital_vvs.devtools.e2e.end_sessions", { sids: SIDS });
  SIDS = null;
}

// ---------------------------------------------------------------- overlay injected into every page
const OVERLAY = `
(() => {
  if (window.__hvOverlay) return; window.__hvOverlay = true;
  window.print = () => undefined;  // never open a print dialog on video
  const css = document.createElement('style'); css.id = 'hv-style';
  css.textContent = \`
    #hv-cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;max-width:min(1100px,92vw);
      background:rgba(6,40,38,.94);color:#fff;font:600 23px/1.4 system-ui,'Segoe UI',sans-serif;padding:14px 26px;border-radius:14px;
      box-shadow:0 12px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);pointer-events:none}
    #hv-cap small{display:block;font:700 14px/1.3 system-ui,sans-serif;color:#5eead4;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px}
    #hv-ptr{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(20,184,166,.35);border:2px solid #0f766e;pointer-events:none;transition:left .05s linear,top .05s linear}
    #hv-ptr.click{animation:hvPulse .45s ease-out}
    @keyframes hvPulse{0%{transform:scale(1)}50%{transform:scale(1.9);background:rgba(20,184,166,.55)}100%{transform:scale(1)}}
    #hv-role{position:fixed;right:18px;top:64px;z-index:2147483647;display:flex;align-items:center;gap:8px;pointer-events:none;
      background:rgba(15,23,42,.88);color:#fff;font:700 15px/1 system-ui,sans-serif;padding:9px 14px;border-radius:999px;box-shadow:0 8px 20px rgba(0,0,0,.25)}
    #hv-role i{width:10px;height:10px;border-radius:50%;background:#34d399;box-shadow:0 0 0 4px rgba(52,211,153,.25)}
    #hv-role span{font-weight:500;color:#a7f3d0}
    #hv-title{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#0f766e,#064e3b 60%,#0c4a6e);color:#fff;font:800 48px/1.2 system-ui,sans-serif;text-align:center;padding:40px}
    #hv-title small{font:500 23px/1.45 system-ui,sans-serif;color:#ccfbf1;margin-top:16px;max-width:980px}
    #hv-title em{font:700 15px/1 system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#99f6e4;margin-bottom:20px;font-style:normal}
    #hv-title ol{margin:26px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:1100px}
    #hv-title li{font:600 17px/1 system-ui,sans-serif;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);padding:9px 14px;border-radius:999px}\`;
  window.__hvEnsure = () => { if (!document.getElementById('hv-style')) (document.head || document.documentElement).appendChild(css); };
  window.__hvZoom = (x, y, scale) => {
    const root = document.getElementById('root') || document.body.firstElementChild;
    if (!root) return;
    root.style.transition = 'transform .55s cubic-bezier(.2,.7,.2,1)';
    root.style.transformOrigin = x + 'px ' + y + 'px';
    root.style.transform = scale > 1 ? 'scale(' + scale + ')' : '';
  };
  window.__hvRole = (label, user) => {
    window.__hvEnsure(); let r = document.getElementById('hv-role');
    if (!r) { r = document.createElement('div'); r.id = 'hv-role'; document.body.appendChild(r); }
    r.innerHTML = '<i></i>' + label + ' <span>' + user + '</span>';
  };
  const ptr = document.createElement('div'); ptr.id = 'hv-ptr'; ptr.style.left = '-50px'; ptr.style.top = '-50px';
  const mount = () => {
    window.__hvEnsure(); if (document.body && !document.getElementById('hv-ptr')) document.body.appendChild(ptr);
    const who = sessionStorage.getItem('hv.video.role'); if (who && document.body && !document.getElementById('hv-role')) { const [l, u] = who.split('|'); window.__hvRole(l, u); }
  };
  document.addEventListener('DOMContentLoaded', mount); mount();
  addEventListener('mousemove', (e) => { mount(); ptr.style.left = e.clientX + 'px'; ptr.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => { ptr.classList.remove('click'); void ptr.offsetWidth; ptr.classList.add('click'); }, true);
})();`;

// ---------------------------------------------------------------- one scene = one video
export async function scene(name, fn) {
  mkdirSync(OUT, { recursive: true });
  if (!SIDS) startSessions();
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--force-device-scale-factor=1", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, colorScheme: "light", locale: "en-GB" });
  await context.addInitScript(() => { try { localStorage.setItem("hv.theme", "light"); localStorage.setItem("hv.lang", "en"); } catch { /* ignore */ } });
  await context.addInitScript(OVERLAY);
  const page = await context.newPage();
  const h = helpers(page, context);
  let ok = true;
  try {
    await fn(page, h);
  } catch (e) {
    ok = false;
    console.error(`[${name}] failed:`, e.message.split("\n")[0]);
    await page.screenshot({ path: join(OUT, `${name}-error.png`) }).catch(() => {});
  }
  const video = page.video();
  const others = context.pages().filter((p) => p !== page).map((p) => p.video()).filter(Boolean);
  await context.close();
  await browser.close();
  const target = join(OUT, `${name}.webm`);
  if (existsSync(target)) unlinkSync(target);
  renameSync(await video.path(), target);
  for (const v of others) { try { unlinkSync(await v.path()); } catch { /* already gone */ } }
  console.log(`${ok ? "✓" : "✗"} ${name} → ${target}`);
  return ok;
}

function helpers(page, context) {
  let mx = 720, my = 450;
  const host = new URL(BASE).hostname;
  const pause = (ms = 900) => page.waitForTimeout(ms);
  const moveTo = async (x, y) => {
    const steps = 18;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      await page.mouse.move(mx + (x - mx) * e, my + (y - my) * e);
      await page.waitForTimeout(12);
    }
    mx = x; my = y;
  };
  const center = async (l) => {
    await l.scrollIntoViewIfNeeded({ timeout: 15000 });
    const b = await l.boundingBox({ timeout: 15000 });
    if (!b) throw new Error("element not visible");
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const loc = (target) => (typeof target === "string" ? page.locator(target).first() : target);
  const zoomIn = async (x, y) => { if (ZOOM > 1) { await page.evaluate(([zx, zy, s]) => window.__hvZoom?.(zx, zy, s), [x, y, ZOOM]); await pause(600); } };
  const zoomOut = async () => { if (ZOOM > 1) { await page.evaluate(() => window.__hvZoom?.(0, 0, 1)); await pause(420); } };
  let role = null;
  const h = {
    page, context, pause,
    /** Act as a demo user from now on (session cookie swap) and show who it is. */
    async as(key) {
      const [user, label] = USERS[key];
      if (!SIDS?.[user]) throw new Error(`no session for ${user}`);
      await context.addCookies([{ name: "sid", value: SIDS[user], domain: host, path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
      role = `${label}|${user}`;
      await context.addInitScript((r) => { try { sessionStorage.setItem("hv.video.role", r); } catch { /* ignore */ } }, role);
      await page.evaluate((r) => { try { sessionStorage.setItem("hv.video.role", r); } catch { /* ignore */ } const [l, u] = r.split("|"); window.__hvRole?.(l, u); }, role).catch(() => {});
    },
    /** Full-screen title card (optional chips listing the steps). */
    async title(heading, sub, steps = [], eyebrow = "VVS Hospital · Hospital ERP") {
      if (!page.url().startsWith(BASE)) await page.goto(`${BASE}/hms/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.evaluate(([e, t, s, st]) => {
        window.__hvEnsure?.();
        const d = document.createElement("div"); d.id = "hv-title";
        d.innerHTML = `<em>${e}</em><div>${t}</div><small>${s ?? ""}</small>` + (st.length ? `<ol>${st.map((x, i) => `<li>${i + 1}. ${x}</li>`).join("")}</ol>` : "");
        document.body.appendChild(d);
      }, [eyebrow, heading, sub, steps]);
      await pause(3600 + steps.length * 350);
      await page.evaluate(() => document.getElementById("hv-title")?.remove());
    },
    /** Chapter card inside a long video. */
    async chapter(n, heading, sub) { await h.hush(); await h.title(heading, sub, [], `Part ${n}`); },
    async say(text, step) {
      await page.evaluate(([t, s]) => {
        window.__hvEnsure?.();
        let c = document.getElementById("hv-cap");
        if (!c) { c = document.createElement("div"); c.id = "hv-cap"; document.body.appendChild(c); }
        c.innerHTML = (s ? `<small>${s}</small>` : "") + t;
      }, [text, step ?? ""]);
      await pause(Math.min(4600, 1500 + text.length * 32));
    },
    async hush() { await page.evaluate(() => document.getElementById("hv-cap")?.remove()).catch(() => {}); },
    async go(path, wait = 2200) {
      await page.goto(`${BASE}/hms${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.getByText("Loading", { exact: true }).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
      await pause(wait);
    },
    /** Visit a page and explain it (page tours). */
    async visit(path, text, step, wait = 2400) {
      await h.go(path, wait);
      await h.say(text, step);
      await h.scroll(380, 900); await h.scroll(-380, 500);
    },
    async focus(target, ms = 1800, scale = ZOOM) {
      const [x, y] = Array.isArray(target) ? target : await center(loc(target));
      await page.evaluate(([zx, zy, s]) => window.__hvZoom?.(zx, zy, s), [x, y, scale]);
      await pause(ms);
      await zoomOut();
    },
    async click(target, after = 1100, zoom = true) {
      const l = loc(target);
      const [x, y] = await center(l);
      await moveTo(x, y);
      if (zoom) await zoomIn(x, y);
      await pause(250);
      await l.click({ timeout: 10000 });
      await pause(Math.min(after, 900));
      if (zoom) await zoomOut();
      await pause(Math.max(after - 900, 200));
    },
    async hover(target, after = 1500) { const [x, y] = await center(loc(target)); await moveTo(x, y); await pause(after); },
    async type(target, text, after = 700, zoom = true) {
      const l = loc(target);
      const [x, y] = await center(l);
      await moveTo(x, y);
      if (zoom) await zoomIn(x, y);
      await l.click({ timeout: 10000 });
      await l.fill("");
      await page.keyboard.type(String(text), { delay: 45 });
      await pause(after);
      if (zoom) await zoomOut();
    },
    async fill(target, text, after = 300) { const l = loc(target); const [x, y] = await center(l); await moveTo(x, y); await l.fill(String(text)); await pause(after); },
    async scroll(dy = 500, after = 1200) { await page.mouse.wheel(0, dy); await pause(after); },
    async scrollTo(target, after = 1200) { await loc(target).scrollIntoViewIfNeeded({ timeout: 15000 }); await pause(after); },
    button(name, scope) { return (scope ?? page).getByRole("button", { name, exact: false }).first(); },
    dialog() { return page.getByRole("dialog").last(); },
    /** Whitelisted call as the current user (setup steps the video narrates). */
    async call(method, args = {}) {
      const m = method.includes(".api.") || method.startsWith("frappe.") ? method : `hospital_vvs.api.${method}`;
      const r = await page.evaluate(async ([mm, a]) => {
        const t = await fetch("/api/method/mm_core.api.get_csrf_token_for_session", { credentials: "include" }).then((x) => x.json()).catch(() => ({}));
        const res = await fetch(`/api/method/${mm}`, { method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "X-Frappe-CSRF-Token": t.message ?? "" }, body: JSON.stringify(a) });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      }, [m, args]);
      if (r.status !== 200) throw new Error(`${method}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
      return r.body.message;
    },
    async get(method, args = {}) {
      const m = method.includes(".api.") || method.startsWith("frappe.") ? method : `hospital_vvs.api.${method}`;
      const q = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])).toString();
      const r = await page.evaluate(async (u) => { const res = await fetch(u, { credentials: "include" }); return { status: res.status, body: await res.json().catch(() => ({})) }; }, `/api/method/${m}?${q}`);
      if (r.status !== 200) throw new Error(`${method}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
      return r.body.message;
    },
  };
  return h;
}
