import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { esc, qrSvg } from "@/lib/print";
import { cn } from "@/utils/cn";

export const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;

export const ITEM_TONE: Record<string, string> = {
  Ordered: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200", Collected: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  Received: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200", "Result Entered": "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  Verified: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200", Released: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200", Dispatched: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
  "Report Received": "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/20 dark:text-fuchsia-200", Cancelled: "bg-slate-100 text-slate-500",
  Paid: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200", "In Progress": "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  "Partially Released": "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200", Draft: "bg-slate-100 text-slate-600", Pending: "bg-slate-100 text-slate-700",
};
export function StatusChip({ s, className }: { s: string; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", ITEM_TONE[s] ?? "bg-muted text-muted-foreground", className)}>{s}</span>;
}

export const FLAG_TONE: Record<string, string> = { Low: "text-amber-600", High: "text-amber-600", Abnormal: "text-amber-600", "Critical Low": "text-rose-600 font-black", "Critical High": "text-rose-600 font-black" };
export const flagArrow = (f?: string) => (f?.includes("High") ? " ▲" : f?.includes("Low") ? " ▼" : "");

export const CONTAINER_TONE: Record<string, string> = { "Purple (EDTA)": "bg-violet-500", "Red (Plain)": "bg-rose-500", "Yellow (Gel)": "bg-amber-400", "Grey (Fluoride)": "bg-slate-400",
  "Blue (Citrate)": "bg-sky-500", "Green (Heparin)": "bg-emerald-500", "Urine container": "bg-yellow-300", "Stool container": "bg-orange-700" };
export function Tube({ container }: { container?: string }) {
  const tone = Object.entries(CONTAINER_TONE).find(([k]) => container?.toLowerCase().includes(k.split(" ")[0].toLowerCase()))?.[1] ?? "bg-teal-500";
  return <span title={container} className="inline-flex h-7 w-3 flex-col overflow-hidden rounded-b-full rounded-t-sm border border-black/10"><span className={cn("h-2", tone)} /><span className="flex-1 bg-white/80 dark:bg-white/20" /></span>;
}

export function useLabLive(keys: string[]) {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  useRealtime(boot?.site, [`hv:lab:${branch}`, `hv:critical_value:${branch}`], () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })));
}

export function LabHero({ title, sub, actions, icon: Icon = FlaskConical }: { title: string; sub?: string; actions?: React.ReactNode; icon?: typeof FlaskConical }) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-3xl bg-[#1e1147] p-5 text-white shadow-lg sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_0%_0%,rgba(139,92,246,0.6),transparent_60%),radial-gradient(600px_300px_at_100%_100%,rgba(20,184,166,0.45),transparent_60%)]" />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><Icon className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">{title}</h1>{sub && <p className="text-sm text-white/75">{sub}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export interface Label { barcode: string; mr: string; name: string; tests: string[]; sample_type: string; container: string; time: string }
/** 50×25 mm sample labels, one per page, QR of the sample number. */
export function labelsHtml(labels: Label[]) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:50mm 25mm;margin:0}body{margin:0;font-family:Arial,sans-serif}
  .l{width:50mm;height:25mm;box-sizing:border-box;padding:1.5mm 2mm;display:flex;gap:2mm;page-break-after:always;overflow:hidden}
  .t{font-size:7pt;line-height:1.15;min-width:0}.b{font-weight:700;font-size:8pt}.m{font-family:monospace;font-size:8pt;font-weight:700}</style></head><body>
  ${labels.map((l) => `<div class="l">${qrSvg(l.barcode, 0.55)}<div class="t"><div class="m">${esc(l.barcode)}</div><div class="b">${esc(l.name)}</div><div>${esc(l.mr)}</div>
  <div>${esc(l.sample_type)} · ${esc(l.container)}</div><div><b>${esc(l.tests.join(", "))}</b></div><div>${esc(l.time)}</div></div></div>`).join("")}</body></html>`;
}
