import { createRequire } from "module";
const { chromium } = createRequire(new URL("../../frontend/package.json", import.meta.url))("@playwright/test");
const S = process.argv[2], B = "http://hospital.localhost:5183", D = "hospital.localhost";
const b = await chromium.launch({ channel: "chrome" });
async function shot(name, url, { palette = "lime", theme = "dark", sid = null, w = 1440, h = 860 } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([p, t]) => { localStorage.setItem("hv.palette", p); localStorage.setItem("hv.theme", t); }, [palette, theme]);
  if (sid) await ctx.addCookies([{ name: "sid", value: sid, domain: D, path: "/" }, { name: "user_id", value: "admin%40vvs.demo", domain: D, path: "/" }, { name: "system_user", value: "yes", domain: D, path: "/" }]);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(B + url, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForTimeout(5500);
  await p.screenshot({ path: `${S}/${name}.png` }); console.log(name, p.url().replace(B, ""), errs.length ? errs : "");
  await ctx.close();
}
await shot("login-lime", "/hms/login");
await shot("login-gold", "/hms/login", { palette: "gold", theme: "light" });
await shot("login-lime-mobile", "/hms/login", { w: 390, h: 800 });
await shot("app-lime-dark", "/hms/pw-home", { sid: process.env.SID });
await shot("app-lime-light", "/hms/pw-home", { sid: process.env.SID, theme: "light" });
await shot("app-gold-light", "/hms/pw-home", { sid: process.env.SID, palette: "gold", theme: "light" });
await shot("site-lime", "/hms/site", { theme: "light" });
await b.close();
