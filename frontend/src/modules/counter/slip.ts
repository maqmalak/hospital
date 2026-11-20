/**
 * "Charges Received — Counter Slip" (D-98) for the Reception counter: 80 mm thermal and A5 letterhead. English with Urdu labels.
 * Grouped by category (Radiology / Ultrasound / MRI / CT / Laboratory / Other), department tokens with where to go, preparation and
 * report time, amount in words, payment methods, QR + barcode of the slip no., "DUPLICATE COPY" on reprints, and a refund-slip variant.
 */
import { esc, money, qrSvg } from "@/lib/print";
import { lhCss, lhPage, thermalHeader } from "@/lib/letterhead";
import type { Receipt } from "./receipt";

export interface SlipDept { line?: number; department: string; token?: string; where?: string; prep?: string; report_at?: string; booking_ref?: string; safety?: string }
export type SlipReceipt = Receipt & { departments?: SlipDept[]; referring?: string; print_count?: number; refund_reason?: string;
  patient_info?: { gender?: string; age?: number; phone?: string; panel?: string } | null;
  lines: (Receipt["lines"][number] & { department?: string; target?: string; procedure?: string })[] };

const CAT: Record<string, [string, string]> = {
  "X-Ray": ["Radiology (X-ray)", "ریڈیالوجی (ایکسرے)"], Ultrasound: ["Ultrasound / Doppler", "الٹراساؤنڈ / ڈوپلر"], Doppler: ["Ultrasound / Doppler", "الٹراساؤنڈ / ڈوپلر"],
  MRI: ["MRI", "ایم آر آئی"], CT: ["CT Scan", "سی ٹی اسکین"], Lab: ["Laboratory", "لیبارٹری"], Consultation: ["OPD consultation", "او پی ڈی معائنہ"],
  Service: ["Other procedures", "دیگر پروسیجرز"], Other: ["Payments", "ادائیگیاں"],
};
const ORDER = ["Radiology (X-ray)", "Ultrasound / Doppler", "MRI", "CT Scan", "Laboratory", "Other procedures", "OPD consultation", "Payments"];
function catOf(l: SlipReceipt["lines"][number]): [string, string] {
  if (l.kind === "Imaging" || l.kind === "Imaging Order") return CAT[l.department ?? ""] ?? CAT["X-Ray"];
  if (l.kind === "Lab" || l.kind === "Lab Order") return CAT.Lab;
  return CAT[l.kind] ?? CAT.Other;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function words(n: number): string {
  n = Math.round(n);
  if (n === 0) return "Zero";
  const two = (x: number) => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? " " + ONES[x % 10] : ""}`);
  const three = (x: number) => (x >= 100 ? `${ONES[Math.floor(x / 100)]} Hundred${x % 100 ? " " + two(x % 100) : ""}` : two(x));
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return parts.join(" ");
}
export const amountInWords = (v: number) => `Rupees ${words(v)} only`;

/** Code-128-like visual barcode (bars from the characters) — for quick visual matching; the QR is the machine-readable code. */
function barcode(text: string) {
  let x = 0;
  const bars: string[] = [];
  for (const ch of `*${text}*`) {
    const c = ch.charCodeAt(0);
    for (let i = 0; i < 6; i++) { const w = ((c >> i) & 1) + 1; if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="34"/>`); x += w + 1; }
    x += 2;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 34" width="100%" height="10mm" preserveAspectRatio="none" fill="#000">${bars.join("")}</svg>`;
}

function grouped(r: SlipReceipt) {
  const g: Record<string, { ur: string; rows: SlipReceipt["lines"] }> = {};
  r.lines.forEach((l) => { const [en, ur] = catOf(l); (g[en] ??= { ur, rows: [] }).rows.push(l); });
  return ORDER.filter((k) => g[k]).map((k) => ({ cat: k, ...g[k] }));
}

const css = (a5: boolean) => `${a5 ? "" : "@page{size:80mm auto;margin:3mm}"}
body{font:${a5 ? "10.5px" : "11.5px"}/1.35 Inter,Arial,sans-serif;${a5 ? "" : "width:74mm;"}margin:0;color:#000}.c{text-align:center}.r{display:flex;justify-content:space-between;gap:4px}
.b{font-weight:800}.hr{border-top:1px dashed #000;margin:1.8mm 0}.xs{font-size:${a5 ? "9px" : "9.5px"}}.ur{font-family:Gulzar,'Noto Nastaliq Urdu',serif;direction:rtl;font-size:${a5 ? "10px" : "10.5px"}}
.title{font-weight:900;letter-spacing:.08em;text-align:center;font-size:${a5 ? "13px" : "12px"};margin:1mm 0}
.dup{border:2px solid #000;text-align:center;font-weight:900;letter-spacing:.2em;margin:1mm 0;padding:.6mm}
.refund{border:2px solid #b91c1c;color:#b91c1c;text-align:center;font-weight:900;letter-spacing:.15em;margin:1mm 0;padding:.6mm}
table{width:100%;border-collapse:collapse}th{font-size:9px;text-align:left;border-bottom:1px solid #000;padding:.6mm .8mm}td{padding:.6mm .8mm;vertical-align:top}
.cat td{font-weight:800;border-top:1px solid #999;padding-top:1.2mm;background:#f1f5f4}.num{text-align:right;white-space:nowrap}
.tk{border:2px solid #000;border-radius:5px;padding:1.2mm;margin:1mm 0;display:flex;gap:2mm;align-items:center}.tk .n{font-size:${a5 ? "22px" : "26px"};font-weight:900;line-height:1;min-width:18mm;text-align:center}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:.6mm 4mm}.box{border:1.5px solid #0e5e6f;border-radius:4px;padding:1.5mm 2mm}`;

/** One slip, 80 mm or A5. `copy`: print number (0 = original). `refund`: refund slip. */
export function slipHtml(r: SlipReceipt, { a5 = false, copy = 0, refund = false }: { a5?: boolean; copy?: number; refund?: boolean } = {}) {
  const P = r.patient_info ?? {};
  const rows = grouped(r);
  const refundedTotal = r.lines.filter((l) => l.refunded).reduce((s, l) => s + Number(l.amount || 0), 0);
  const kv = (en: string, ur: string, v: string) => `<div class="r"><span>${en} <span class="ur">${ur}</span></span><span class="b">${v}</span></div>`;
  const head = a5 ? "" : thermalHeader(r.clinic);
  const table = a5
    ? `<table><thead><tr><th>Sr</th><th>Service · سروس</th><th>Dept</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Disc</th><th class="num">Amount</th></tr></thead><tbody>
      ${rows.map((g) => `<tr class="cat"><td colspan="7">${esc(g.cat)} <span class="ur">${g.ur}</span></td></tr>` + g.rows.map((l, i) => `<tr${l.refunded ? ' style="text-decoration:line-through;color:#777"' : ""}>
        <td>${i + 1}</td><td>${esc(l.label)}</td><td class="xs">${esc(l.department ?? "")}</td><td class="num">${l.qty}</td><td class="num">${money(l.rate)}</td><td class="num">${l.discount ? money(l.discount) : ""}</td><td class="num b">${money(l.amount)}</td></tr>`).join("")).join("")}</tbody></table>`
    : rows.map((g) => `<div class="b" style="margin-top:1.2mm">${esc(g.cat)} <span class="ur">${g.ur}</span></div>` + g.rows.map((l) => `<div class="r"${l.refunded ? ' style="text-decoration:line-through"' : ""}><span>${l.qty !== 1 ? `${l.qty} × ` : ""}${esc(l.label)}</span><span>${money(l.amount)}</span></div>`
      + (l.discount ? `<div class="r xs"><span>&nbsp; discount</span><span>−${money(l.discount)}</span></div>` : "")).join("")).join("");
  const depts = (r.departments ?? []).map((d) => `<div class="tk"><div class="n">${esc(d.token ?? "—")}</div><div class="xs"><b>${esc(d.department)}</b>${d.where ? ` — ${esc(d.where)}` : ""}
    ${d.report_at ? `<br>Report: ${esc(d.report_at)}` : ""}${d.prep ? `<br><i>${esc(d.prep.slice(0, a5 ? 220 : 140))}</i>` : ""}${d.safety && !["Not required", "Cleared"].includes(d.safety) ? `<br><b>Safety screening: ${esc(d.safety)}</b>` : ""}</div></div>`).join("");
  const tokens = (r.tokens ?? []).map((t) => `<div class="tk"><div class="n">${esc(t.token)}</div><div class="xs"><b>${esc(t.doctor)}</b>${t.room ? ` — Room ${esc(t.room)}` : ""}</div></div>`).join("");
  const net = refund ? refundedTotal : r.patient_total;
  const body = `${head}
  <div class="title">${refund ? "REFUND SLIP" : "CHARGES RECEIVED — COUNTER SLIP"}<div class="ur" style="text-align:center">${refund ? "واپسی کی رسید" : "وصولی رسید"}</div></div>
  ${copy > 0 ? `<div class="dup">DUPLICATE COPY · ${copy}</div>` : ""}${refund ? `<div class="refund">REFUNDED ${money(refundedTotal)}</div>` : ""}
  <div class="${a5 ? "grid" : ""}">
    ${kv("Slip no.", "رسید نمبر", esc(r.name))}${kv("Date", "تاریخ", esc(r.posted_at.slice(0, 16)))}
    ${kv("Patient", "مریض", esc(r.patient_name))}${kv("MR No.", "ایم آر", esc(r.patient))}
    ${P.age != null || P.gender ? kv("Age / Gender", "عمر / جنس", `${P.age ?? "—"} / ${esc(P.gender ?? "—")}`) : ""}${P.phone ? kv("Phone", "فون", esc(P.phone)) : ""}
    ${r.referring ? kv("Referred by", "ریفر", esc(r.referring)) : ""}${P.panel ? kv("Panel", "پینل", esc(P.panel)) : ""}
    ${kv("Counter", "کاؤنٹر", esc(r.counter ?? ""))}${kv("Cashier", "کیشیئر", esc(r.cashier ?? ""))}
  </div>
  <div class="hr"></div>${table}<div class="hr"></div>
  ${kv("Gross", "کل", money(r.gross_total))}${r.discount_total ? kv("Discount", "رعایت", `−${money(r.discount_total)}`) : ""}
  ${r.payer_share ? kv(`Credit — ${esc(P.panel ?? "panel")}`, "پینل", money(r.payer_share)) : ""}
  ${kv(refund ? "Refunded" : "Net received", refund ? "واپس" : "وصول", money(net))}
  ${r.tenders.map((t) => `<div class="r xs"><span>${esc(t.mode_of_payment)}${t.reference_no ? ` · ref ${esc(t.reference_no)}` : ""}</span><span>${money(t.amount)}</span></div>`).join("")}
  ${r.change_amount ? kv("Change", "بقایا", money(r.change_amount)) : ""}
  <div class="xs" style="margin-top:1mm"><b>${amountInWords(net)}</b></div>
  ${refund && r.refund_reason ? `<div class="xs" style="margin-top:1mm">Reason: ${esc(r.refund_reason)}</div>` : ""}
  ${!refund && (depts || tokens) ? `<div class="hr"></div><div class="b">Where to go · <span class="ur">کہاں جائیں</span></div>${tokens}${depts}` : ""}
  <div class="hr"></div>
  <div style="display:flex;gap:3mm;align-items:center"><div>${qrSvg(`${location.origin}/hms/site/radiology/reports?slip=${r.name}`, a5 ? 0.55 : 0.6)}</div><div style="flex:1">${barcode(r.name)}<div class="c xs">${esc(r.name)}</div></div></div>
  <div class="xs c" style="margin-top:1mm">Please keep this slip for report collection. · <span class="ur">رپورٹ لینے کے لیے یہ رسید سنبھال کر رکھیں۔</span></div>
  <div class="xs c">Refunds only before the service is performed, with supervisor approval. Computer-generated slip.</div>
  ${a5 ? `<div class="r xs" style="margin-top:6mm"><span>Cashier signature: ____________________</span><span>${r.offline ? "Synced from offline" : ""}</span></div>` : ""}`;
  return `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=Gulzar&display=swap" rel="stylesheet">
  <style>${a5 ? lhCss("A5") : ""}${css(a5)}</style></head><body>${a5 ? lhPage(body, r.clinic, { title: refund ? "Refund slip" : "Counter slip", note: esc(r.name), footRight: "Charges Received" }) : body}</body></html>`;
}
