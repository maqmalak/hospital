import { esc, money, qrSvg } from "@/lib/print";

export interface ReceiptLine { idx?: number; kind: string; label: string; qty: number; rate: number; discount?: number; amount: number; token_no?: number; refunded?: number; reference_name?: string }
export interface Receipt {
  name: string; posted_at: string; patient: string; patient_name: string; status?: string; lines: ReceiptLine[]; tenders: { mode_of_payment: string; amount: number; reference_no?: string }[];
  gross_total: number; discount_total: number; payer_share?: number; patient_total: number; tendered: number; change_amount: number;
  tokens: { doctor: string; token: number | string; room?: string }[]; cashier?: string; counter?: string; offline?: number | boolean; pending_sync?: boolean;
  clinic: { name: string; name_ur?: string; address?: string; phone?: string };
}

/** 80 mm reception receipt: big OPD tokens first, then every line and tender; QR of the MR number. */
export function receiptHtml(r: Receipt) {
  const row = (k: string, v: string, b = false) => `<div class="r${b ? " b" : ""}"><span>${k}</span><span>${v}</span></div>`;
  const tok = r.tokens.map((t) => `<div class="tk"><div class="xs">${esc(t.doctor)}${t.room ? ` · Room ${esc(t.room)}` : ""}</div><div class="n">${esc(t.token)}</div></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Gulzar&display=swap" rel="stylesheet">
  <style>@page{size:80mm auto;margin:3mm}body{font:12px/1.35 Inter,sans-serif;width:74mm;margin:0;color:#000}.c{text-align:center}.r{display:flex;justify-content:space-between;gap:4px}
  .b{font-weight:800}.hr{border-top:1px dashed #000;margin:2mm 0}.xs{font-size:10px}.tk{border:2px solid #000;border-radius:6px;text-align:center;margin:1.5mm 0;padding:1mm}
  .tk .n{font-size:40px;font-weight:800;line-height:1}.ur{font-family:Gulzar,serif;direction:rtl}.off{border:2px dashed #000;padding:1mm;text-align:center;font-weight:800;margin:1mm 0}</style></head><body>
  <div class="c b" style="font-size:15px">${esc(r.clinic.name)}</div>${r.clinic.name_ur ? `<div class="c ur">${esc(r.clinic.name_ur)}</div>` : ""}
  <div class="c xs">${esc(r.clinic.address || "")}${r.clinic.phone ? ` · ${esc(r.clinic.phone)}` : ""}</div><div class="hr"></div>
  ${r.pending_sync ? `<div class="off">OFFLINE RECEIPT · token on sync</div>` : ""}${tok}
  ${row("Receipt", esc(r.name))}${row("Date", esc(r.posted_at.slice(0, 16)))}${row("MR No.", `<b>${esc(r.patient)}</b>`)}${row("Patient", esc(r.patient_name))}
  <div class="hr"></div>${r.lines.map((l) => row(`${l.qty !== 1 ? `${l.qty} × ` : ""}${esc(l.label)}${l.refunded ? " (refunded)" : ""}`, money(l.amount))
    + (l.discount ? `<div class="r xs"><span>&nbsp; discount</span><span>−${money(l.discount)}</span></div>` : "")).join("")}
  <div class="hr"></div>${r.discount_total ? row("Discount", `−${money(r.discount_total)}`) : ""}${r.payer_share ? row("Panel / insurer pays", money(r.payer_share)) : ""}
  ${row("TOTAL", money(r.patient_total), true)}${r.tenders.map((t) => row(`${esc(t.mode_of_payment)}${t.reference_no ? ` · ${esc(t.reference_no)}` : ""}`, money(t.amount))).join("")}
  ${r.change_amount ? row("Change", money(r.change_amount), true) : ""}
  <div class="c" style="margin-top:2mm">${qrSvg(r.patient, 0.7)}</div><div class="c xs">${r.cashier ? `Cashier: ${esc(r.cashier)}` : ""}${r.counter ? ` · ${esc(r.counter)}` : ""}</div>
  <div class="c xs" style="margin-top:1mm">Keep this receipt. Wait for your token to be called.</div></body></html>`;
}
