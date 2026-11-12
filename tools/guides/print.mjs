// node print.mjs in.html out.pdf [landscape] — Chrome PDF of a local HTML file (the DFD book).
import { createRequire } from "node:module";
const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [src, out, orient] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage();
await p.goto(`file://${src}`, { waitUntil: "load" });
await p.pdf({ path: out, format: "A4", landscape: orient === "landscape", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
await b.close();
