import { useQueryClient } from "@tanstack/react-query";
import { Pill as PillIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { esc } from "@/lib/print";
import { cn } from "@/utils/cn";

export const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
export interface Split { units: number; packs: number; strips: number; loose: number }
export const stockText = (s?: Split) => (!s ? "" : s.units <= 0 ? "Out of stock" : [s.packs && `${s.packs} pk`, s.strips && `${s.strips} st`, s.loose && `${s.loose} u`].filter(Boolean).join(" · ") || "0");

export function usePharmacyLive(keys: string[]) {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  useRealtime(boot?.site, [`hv:pharmacy:${branch}`], () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })));
}

export function PharmHero({ title, sub, actions, icon: Icon = PillIcon }: { title: string; sub?: string; actions?: React.ReactNode; icon?: typeof PillIcon }) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-3xl bg-[#062a3a] p-5 text-white shadow-lg sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_0%_0%,rgba(14,165,233,0.55),transparent_60%),radial-gradient(600px_300px_at_100%_100%,rgba(16,185,129,0.45),transparent_60%)]" />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><Icon className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">{title}</h1>{sub && <p className="text-sm text-white/75">{sub}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export const TICKET_TONE: Record<string, string> = {
  Queued: "from-slate-500 to-slate-700", Picking: "from-sky-500 to-blue-700", Picked: "from-indigo-500 to-violet-700", Reviewing: "from-violet-500 to-fuchsia-700",
  Exception: "from-rose-500 to-red-700", Ready: "from-emerald-500 to-teal-700", Called: "from-amber-500 to-orange-600", "Not Collected": "from-stone-500 to-stone-700",
  "Handed Over": "from-teal-600 to-emerald-800", "On Hold": "from-slate-400 to-slate-600",
};
export function PriorityBadge({ p }: { p?: string }) {
  if (!p || p === "Normal") return null;
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold text-white", p === "Urgent" ? "bg-rose-600" : p === "Disabled" ? "bg-sky-600" : "bg-amber-500")}>{p === "Elderly-Disabled" ? "ELDERLY / DISABLED" : p.toUpperCase()}</span>;
}

export interface Receipt { name: string; docstatus: number; token?: string; ticket?: string; posting_date: string; posting_time: string; customer: string; patient?: string; prescription?: string;
  counter?: string; cashier: string; is_return?: number; return_against?: string; company?: string; pending_sync?: boolean; paper_rx?: { doctor: string; reg_no?: string; rx_date?: string; patient_name?: string; image?: string } | null; items: { item_code?: string; item_name: string; generic?: string; qty: number; uom: string; rate: number; amount: number; batch_no?: string; expiry?: string; substitute_for?: string | null }[];
  total: number; discount: number; grand_total: number; paid: number; tendered: number; change: number; mode: string; clinic: { name: string; name_ur?: string; address?: string; phone?: string } }

/** 80 mm thermal receipt with the big collection token. */
export function receiptHtml(r: Receipt) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}body{font-family:Arial,sans-serif;font-size:10pt;width:74mm;margin:0}
  .c{text-align:center}.b{font-weight:700}.tk{font-size:34pt;font-weight:900;letter-spacing:2px;border:2px dashed #000;margin:6px 0;padding:4px}
  table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}.r{text-align:right}.m{font-size:8pt;color:#444}hr{border:0;border-top:1px dashed #000}</style></head><body>
  <div class="c b" style="font-size:13pt">${esc(r.clinic.name)}</div>${r.clinic.name_ur ? `<div class="c" style="font-family:'Noto Nastaliq Urdu',serif">${esc(r.clinic.name_ur)}</div>` : ""}
  <div class="c m">${esc(r.clinic.address ?? "")} ${esc(r.clinic.phone ?? "")}</div><hr>
  ${r.token ? `<div class="c m">Collection token</div><div class="c tk">${esc(r.token)}</div>` : ""}
  <div class="m">${esc(r.name)} · ${esc(r.posting_date)} ${esc(r.posting_time)} · ${esc(r.counter ?? "")}</div>
  <div class="m">${esc(r.customer)}${r.patient ? ` · ${esc(r.patient)}` : ""}${r.prescription ? ` · Rx ${esc(r.prescription)}` : ""}</div>${r.paper_rx ? `<div class="m">Prescribed by ${/^dr\.?\s/i.test(r.paper_rx.doctor) ? "" : "Dr "}${esc(r.paper_rx.doctor)}${r.paper_rx.reg_no ? ` (${esc(r.paper_rx.reg_no)})` : ""}${r.paper_rx.rx_date ? ` · ${esc(r.paper_rx.rx_date)}` : ""}</div>` : ""}<hr>
  <table>${r.items.map((i) => `<tr><td><b>${esc(i.item_name)}</b>${i.substitute_for ? `<div class="m">substitute for ${esc(i.substitute_for)}</div>` : ""}<div class="m">${esc(i.qty)} ${esc(i.uom)} × ${Math.round(i.rate)} · B ${esc(i.batch_no ?? "")} · Exp ${esc((i.expiry ?? "").slice(0, 7))}</div></td><td class="r">${Math.round(i.amount).toLocaleString()}</td></tr>`).join("")}</table><hr>
  <table><tr><td>Total</td><td class="r">${Math.round(r.total).toLocaleString()}</td></tr>${r.discount ? `<tr><td>Discount</td><td class="r">-${Math.round(r.discount).toLocaleString()}</td></tr>` : ""}
  <tr class="b"><td style="font-size:13pt">Net payable</td><td class="r" style="font-size:13pt">Rs ${Math.round(r.grand_total).toLocaleString()}</td></tr>
  <tr><td>${esc(r.mode)}</td><td class="r">${Math.round(r.tendered).toLocaleString()}</td></tr>${r.change ? `<tr><td>Change</td><td class="r">${Math.round(r.change).toLocaleString()}</td></tr>` : ""}</table><hr>
  <div class="c m">Cashier: ${esc(r.cashier)} · Medicines once sold are returnable only with this receipt within 7 days, sealed and unexpired.</div></body></html>`;
}
