/** Prescription quantity from dose × frequency × duration — same rules as services/rx_qty.py (D-51). */
const FREQ: Record<string, number> = { od: 1, qd: 1, once: 1, daily: 1, hs: 1, bd: 2, bid: 2, twice: 2, tds: 3, tid: 3, thrice: 3, qid: 4, qds: 4, sos: 1, prn: 1, stat: 1, weekly: 1 / 7, alternate: 0.5, eod: 0.5 };
const LIQUID = ["syrup", "suspension", "elixir", "solution", "liquid", "mixture"];
const PACK = ["drop", "cream", "ointment", "gel", "inhaler", "spray", "lotion", "shampoo", "patch", "powder"];

function num(s: string): number | null {
  const t = String(s ?? "").trim().replace("½", "0.5").replace("¼", "0.25").replace("¾", "0.75");
  const fr = t.match(/^\s*(\d+)\s*\/\s*(\d+)/);
  if (fr) return Number(fr[1]) / Math.max(Number(fr[2]), 1);
  const m = t.match(/^\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}
function perDay(freq: string): [number | null, number | null] {
  const f = String(freq ?? "").trim().toLowerCase();
  if (!f) return [null, null];
  if (/^[\d.½¼¾/]+(\s*[+-]\s*[\d.½¼¾/]+)+$/.test(f)) { const parts = f.split(/[+-]/).map((x) => num(x) ?? 0); return [parts.filter(Boolean).length, parts.reduce((a, b) => a + b, 0)]; }
  const q = f.match(/(?:q|every)\s*(\d+)\s*(?:h|hr|hrs|hour|hours)/); if (q && Number(q[1])) return [24 / Number(q[1]), null];
  const x = f.match(/(\d+)\s*(?:times|x)\s*(?:a|per)?\s*day/); if (x) return [Number(x[1]), null];
  for (const [k, v] of Object.entries(FREQ)) if (new RegExp(`\\b${k}\\b`).test(f)) return [v, null];
  return [null, null];
}
function days(duration: string): number | null {
  const d = String(duration ?? "").trim().toLowerCase();
  if (!d) return null;
  if (/continue|long term|ongoing|lifelong/.test(d)) return 30;
  const n = num(d.replace(/^[x×]\s*/, "")); if (n == null) return null;
  if (/\bmonth|\bm\b|mo\b/.test(d)) return n * 30;
  if (/week|\bw\b|wk/.test(d)) return n * 7;
  return n;
}
/** → { qty, unit } or null. unit is for display (tabs / bottle / pack). */
export function rxQty(dose: string, frequency: string, duration: string, form = "", name = "", bottleMl = 120): { qty: number; unit: string } | null {
  const fm = `${form} ${name}`.toLowerCase();
  if (PACK.some((w) => fm.includes(w))) return { qty: 1, unit: "pack" };
  const [takes, sum] = perDay(frequency); const n = days(duration);
  if (!takes || !n) return null;
  const doseTxt = String(dose ?? "").toLowerCase(); const dn = num(dose) ?? 1;
  if (LIQUID.some((w) => fm.includes(w)) || doseTxt.includes("ml")) {
    const ml = doseTxt.includes("ml") ? dn : 5 * dn; const total = ml * (sum ?? takes) * n;
    const b = Math.max(Math.ceil(total / bottleMl), 1); return { qty: b, unit: b === 1 ? "bottle" : "bottles" };
  }
  const per = sum != null ? (sum === takes ? takes * dn : sum) : takes * dn;
  const q = Math.max(Math.ceil(per * n - 1e-9), 1);
  return { qty: q, unit: /inject|amp|vial/.test(fm) ? "amp" : /caps/.test(fm) ? "caps" : "tabs" };
}
