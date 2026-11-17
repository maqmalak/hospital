/**
 * Hospital letterhead for every printed page (D-79): prescriptions, lab / IPD / pharmacy documents, accounting documents and
 * report prints. Modelled on the brand board stationery: full logo top-left, address + landline top-right, teal → red rule,
 * a faint logo mark as a watermark and a teal wave footer with a red accent. Thermal (80 mm) slips get a compact centred
 * header with the logo mark.
 *
 * The header and the footer space repeat on every printed page (table thead / tfoot), the footer art is fixed to the page
 * bottom. Clinic details come from the print data, falling back to the signed-in boot (Clinic Settings + branch).
 */
import { esc } from "./print";

export interface LhClinic { name: string; name_ur?: string; address?: string; phone?: string; email?: string; logo?: string }

let BOOT: LhClinic | null = null;
/** Called once the session boot has loaded, so prints without their own clinic block still get the letterhead. */
export function setLetterheadClinic(c: LhClinic | null | undefined) { BOOT = c ? { ...c } : null; }

const origin = () => (typeof window !== "undefined" ? window.location.origin : "");
const abs = (u?: string) => (!u ? "" : /^(https?:|data:)/.test(u) ? u : `${origin()}${u.startsWith("/") ? "" : "/"}${u}`);
const BRAND = (f: string) => abs(`${import.meta.env.BASE_URL}brand/${f}`);
export const LOGO_URL = () => BRAND("lyallpur-lockup.webp");
export const MARK_URL = () => BRAND("lyallpur-mark.png");

/** Print clinic block merged over the boot clinic (print data wins field by field). */
export function lhClinic(c?: Partial<LhClinic> | null): LhClinic {
  const b = BOOT ?? { name: "Lyallpur Medical Complex" };
  const pick = <K extends keyof LhClinic>(k: K) => (c?.[k] as LhClinic[K]) || b[k];
  const own = !c?.name || c.name === b.name;
  return { name: pick("name") || b.name, name_ur: own ? pick("name_ur") : c?.name_ur, address: pick("address"), phone: pick("phone"), email: pick("email") };
}
/** The hospital's own name (a contract pharmacy's receipts carry their company name and no hospital logo). */
export const isHospital = (name?: string) => !name || !BOOT || name === BOOT.name;

const PIN = `<svg viewBox="0 0 24 24" width="9" height="9" fill="#E5322F" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>`;
const TEL = `<svg viewBox="0 0 24 24" width="9" height="9" fill="#E5322F" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"/></svg>`;
const MAIL = `<svg viewBox="0 0 24 24" width="9" height="9" fill="#E5322F" aria-hidden="true"><path d="M3 5h18v14H3V5Zm9 7.5L19 7H5l7 5.5Z"/></svg>`;

/** CSS for A4 / A5 letterhead pages. Put it inside the template's <style>; it sets @page itself. */
export function lhCss(size: "A4" | "A5" | "auto" = "A4") {
  const a5 = size === "A5";
  const pad = a5 ? "9mm" : "12mm";
  return `@page{size:${size === "auto" ? "auto" : size};margin:0}
  html,body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  table.lh-page{width:100%;border-collapse:collapse;border:0}
  table.lh-page>thead>tr>td,table.lh-page>tbody>tr>td,table.lh-page>tfoot>tr>td{padding:0 ${pad};border:0;background:none}
  table.lh-page>thead>tr>td{padding-top:${a5 ? "7mm" : "9mm"}}
  .lh-head{display:flex;align-items:center;justify-content:space-between;gap:6mm}
  .lh-logo{height:${a5 ? "12mm" : "16mm"};width:auto;display:block}
  .lh-contact{text-align:right;font:${a5 ? "8.5px" : "9.5px"}/1.55 Inter,Arial,sans-serif;color:#334155;max-width:${a5 ? "62mm" : "78mm"}}
  .lh-contact div{display:flex;justify-content:flex-end;align-items:center;gap:4px}
  .lh-contact .lh-tel{font-weight:700;color:#0C2431;font-size:${a5 ? "10px" : "11px"};letter-spacing:.02em}
  .lh-contact .lh-ur{font-family:'Gulzar','Noto Nastaliq Urdu',serif;direction:rtl;font-size:${a5 ? "11px" : "13px"};color:#2B6E85;line-height:1.9}
  .lh-rule{display:flex;height:1.1mm;margin:${a5 ? "2.5mm" : "3.5mm"} 0 ${a5 ? "3mm" : "4mm"};border-radius:1mm;overflow:hidden}
  .lh-rule i{flex:1;background:#2B6E85}.lh-rule b{width:22%;background:#E5322F;margin-left:1.2mm}
  .lh-title{display:flex;justify-content:space-between;align-items:center;margin:0 0 3mm}
  .lh-title span{font:800 ${a5 ? "10px" : "11px"}/1 Inter,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#fff;background:#0C2431;padding:1.6mm 4mm;border-radius:10mm}
  .lh-title em{font-style:normal;font:${a5 ? "9px" : "10px"}/1.4 Inter,Arial,sans-serif;color:#475569;text-align:right}
  .lh-fspace{height:${a5 ? "14mm" : "17mm"}}
  .lh-foot{position:fixed;left:0;right:0;bottom:0;height:${a5 ? "12mm" : "14mm"};color:#fff;font:${a5 ? "8px" : "9px"}/1.3 Inter,Arial,sans-serif}
  .lh-foot svg{position:absolute;inset:0;width:100%;height:100%}
  .lh-foot .lh-ft{position:absolute;left:${pad};right:${pad};bottom:${a5 ? "2.2mm" : "2.8mm"};display:flex;justify-content:space-between;gap:4mm}
  .lh-foot b{letter-spacing:.06em}
  .lh-wm{position:fixed;right:-14mm;bottom:12mm;width:${a5 ? "70mm" : "105mm"};opacity:.045;pointer-events:none;z-index:0}
  .lh-wm img{width:100%}
  table.lh-page{position:relative;z-index:1}`;
}

/** Letterhead header (logo + contact + rule), optional title pill with a right-hand note. */
export function lhHeader(clinic?: Partial<LhClinic> | null, title?: string, note?: string) {
  const c = lhClinic(clinic);
  const logo = LOGO_URL();
  return `<div class="lh-head"><img class="lh-logo" src="${esc(logo)}" alt="${esc(c.name)}">
  <div class="lh-contact">${c.name_ur ? `<div class="lh-ur">${esc(c.name_ur)}</div>` : ""}
  ${c.address ? `<div>${PIN}<span>${esc(c.address)}</span></div>` : ""}
  ${c.phone ? `<div class="lh-tel">${TEL}<span>${esc(c.phone)}</span></div>` : ""}
  ${c.email ? `<div>${MAIL}<span>${esc(c.email)}</span></div>` : ""}</div></div>
  <div class="lh-rule"><i></i><b></b></div>
  ${title ? `<div class="lh-title"><span>${esc(title)}</span>${note ? `<em>${note}</em>` : ""}</div>` : ""}`;
}

/** Wave footer fixed to the bottom of every page. `right` is trusted HTML (already escaped). */
export function lhFooter(clinic?: Partial<LhClinic> | null, right = "") {
  const c = lhClinic(clinic);
  return `<div class="lh-foot"><svg viewBox="0 0 800 60" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 22 C 180 4, 360 4, 520 18 S 720 30, 800 10 L800 60 L0 60 Z" fill="#2B6E85"/>
  <path d="M560 22 C 650 30, 730 26, 800 8 L800 18 C 730 34, 650 36, 590 30 Z" fill="#E5322F"/>
  <path d="M0 32 C 200 16, 380 18, 540 28 S 740 40, 800 24 L800 60 L0 60 Z" fill="#0C2431" opacity=".55"/></svg>
  <div class="lh-ft"><span><b>${esc(c.name.toUpperCase())}</b>${c.phone ? ` &nbsp;·&nbsp; ${esc(c.phone)}` : ""}</span><span>${right}</span></div></div>`;
}

/** Open / close halves of lhPage, for templates that build their body in pieces. */
export function lhStart(clinic?: Partial<LhClinic> | null, opts: { title?: string; note?: string; footRight?: string; watermark?: boolean } = {}) {
  return lhPage("\u0000", clinic, opts).split("\u0000")[0];
}
export const lhEnd = () => `</td></tr></tbody></table>`;

/** Wrap a page body in the letterhead: repeating header, footer art, watermark. `inner` is trusted HTML. */
export function lhPage(inner: string, clinic?: Partial<LhClinic> | null, opts: { title?: string; note?: string; footRight?: string; watermark?: boolean } = {}) {
  return `${lhFooter(clinic, opts.footRight)}${opts.watermark === false ? "" : `<div class="lh-wm"><img src="${esc(MARK_URL())}" alt=""></div>`}
  <table class="lh-page"><thead><tr><td>${lhHeader(clinic, opts.title, opts.note)}</td></tr></thead>
  <tfoot><tr><td><div class="lh-fspace"></div></td></tr></tfoot><tbody><tr><td>${inner}</td></tr></tbody></table>`;
}

/** Compact centred header for 80 mm thermal slips: logo mark, name, Urdu name, address and landline. */
export function thermalHeader(clinic?: Partial<LhClinic> | null) {
  const c = lhClinic(clinic);
  const own = isHospital(clinic?.name);
  return `<div style="text-align:center">${own ? `<img src="${esc(MARK_URL())}" alt="" style="height:15mm;width:15mm;filter:grayscale(1) contrast(1.4)">` : ""}
  <div style="font-weight:800;font-size:14px;letter-spacing:.04em;text-transform:uppercase">${esc(c.name)}</div>
  ${c.name_ur ? `<div style="font-family:'Gulzar','Noto Nastaliq Urdu',serif;direction:rtl;font-size:13px;line-height:1.8">${esc(c.name_ur)}</div>` : ""}
  ${c.address ? `<div style="font-size:10px">${esc(c.address)}</div>` : ""}${c.phone ? `<div style="font-size:11px;font-weight:700">Tel ${esc(c.phone)}</div>` : ""}</div>`;
}
