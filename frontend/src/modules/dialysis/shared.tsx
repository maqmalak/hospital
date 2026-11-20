/** Dialysis unit staff screens (D-99): shared types, state colours (aqua / violet renal accent), live refresh, small widgets. */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/utils/cn";

export { Modal } from "@/modules/radiology/shared";

export type Zone = "Negative" | "HBV" | "HCV" | "HIV";
export interface SessionLite {
  name: string; dialysis_patient: string; patient_name: string; station?: string; shift: string; status: string; payment_status: string; token_no?: string;
  session_type: string; zone?: string; alerts: string[]; pre_weight?: number; weight_gain?: number; start_at?: string; ward_location?: string; nurse_signed_by?: string;
}
export interface Cell { state: "Free" | "Booked" | "In session" | "Cleaning" | "Done" | "Missed" | "Out of service"; session?: SessionLite }
export interface StationRow { name: string; station_no: string; zone: Zone; status: string; machine_serial?: string; out_of_service_reason?: string; cells: Record<string, Cell> }
export interface Board {
  date: string; shifts: string[]; shift_times: Record<string, [string, string]>; stations: StationRow[]; unplaced: SessionLite[];
  counts: Record<string, number>; unpaid: number; requests: number;
  swaps: { name: string; patient_name: string; session_date: string; shift: string; swap_requested_date: string; swap_requested_shift: string; swap_reason: string }[];
}
export interface Ctx {
  stations: { name: string; station_no: string; zone: Zone; status: string }[]; shifts: Record<string, [string, string]>; active_shifts: string[]; days: string[];
  nephrologists: { name: string; doctor_name: string }[]; doctors: { name: string; doctor_name: string; department?: string }[]; panels: string[];
  consumables: { item_code: string; item_name: string }[]; targets: { urr: number; ktv: number; weight_gain: number; sbp_low: number; sbp_high: number };
}
export interface Screening { state: "ok" | "due" | "overdue" | "missing"; override: boolean; due?: string }

export const STATE_STYLE: Record<Cell["state"], string> = {
  Free: "border-dashed border-border bg-muted/20 text-muted-foreground",
  Booked: "border-sky-300 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/10",
  "In session": "border-violet-400 bg-violet-50 dark:border-violet-500/50 dark:bg-violet-500/15",
  Cleaning: "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10",
  Done: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10",
  Missed: "border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10",
  "Out of service": "border-slate-300 bg-slate-200/60 text-slate-600 dark:border-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
};
export const STATE_DOT: Record<Cell["state"], string> = { Free: "bg-slate-300", Booked: "bg-sky-500", "In session": "bg-violet-500", Cleaning: "bg-amber-500", Done: "bg-emerald-500", Missed: "bg-rose-500", "Out of service": "bg-slate-500" };

export const ZONE_STYLE: Record<string, string> = {
  Negative: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  HBV: "bg-amber-500 text-white", HCV: "bg-violet-600 text-white", HIV: "bg-rose-600 text-white",
};
export const ZONE_LABEL: Record<string, string> = { Negative: "Negative zone", HBV: "HBsAg +", HCV: "HCV +", HIV: "HIV +" };

export function ZoneChip({ zone, className }: { zone?: string; className?: string }) {
  const z = zone || "Negative";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", ZONE_STYLE[z], className)}>{ZONE_LABEL[z] ?? z}</span>;
}

export function PayChip({ status }: { status: string }) {
  const tone = status === "Unpaid" ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" : status === "Allowed unpaid" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
    : status === "Package" ? "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200" : status === "Panel credit" ? "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200"
      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200";
  return <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", tone)}>{status === "Unpaid" ? "Payment pending" : status}</span>;
}

export function ScreenChip({ s }: { s?: Screening | null }) {
  if (!s) return null;
  const tone = s.state === "ok" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" : s.state === "due" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
    : "bg-rose-600 text-white";
  return <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", tone)}>Screening {s.state}{s.override ? " · override" : ""}{s.due && s.state !== "ok" ? ` · ${s.due}` : ""}</span>;
}

export const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
export const fmtDate = (d?: string | null, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  d ? new Date(d.slice(0, 10) + "T00:00").toLocaleDateString("en-PK", opts) : "—";
export const todayPk = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10); // Asia/Karachi (UTC+5)

export function useDialysisLive(keys: string[]) {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  useRealtime(boot?.site, [`hv:dialysis:${branch}`], () => { keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); });
}

export function openDoc(kind: string, name: string) {
  window.open(`/api/method/hospital_vvs.api.dialysis.pdf?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`, "_blank", "noopener");
}

export interface SigHandle { dataUrl: () => string | null; clear: () => void }
/** Pointer signature pad (tablet friendly) — PNG data URL only once something was drawn. */
export const SigPad = forwardRef<SigHandle>(function SigPad(_p, ref) {
  const c = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(false);
  const down = useRef(false);
  useImperativeHandle(ref, () => ({
    dataUrl: () => (drawn.current && c.current ? c.current.toDataURL("image/png") : null),
    clear: () => { const x = c.current?.getContext("2d"); if (x && c.current) x.clearRect(0, 0, c.current.width, c.current.height); drawn.current = false; },
  }));
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const b = e.currentTarget.getBoundingClientRect(); return [(e.clientX - b.left) * (e.currentTarget.width / b.width), (e.clientY - b.top) * (e.currentTarget.height / b.height)]; };
  return <canvas ref={c} width={600} height={150} className="h-[120px] w-full touch-none rounded-xl border border-dashed border-border bg-white" aria-label="Signature pad"
    onPointerDown={(e) => { down.current = true; e.currentTarget.setPointerCapture(e.pointerId); const x = e.currentTarget.getContext("2d")!; const [px, py] = pos(e); x.lineWidth = 2.5; x.lineCap = "round"; x.strokeStyle = "#111"; x.beginPath(); x.moveTo(px, py); }}
    onPointerMove={(e) => { if (!down.current) return; const x = e.currentTarget.getContext("2d")!; const [px, py] = pos(e); x.lineTo(px, py); x.stroke(); drawn.current = true; }}
    onPointerUp={() => { down.current = false; }} />;
});

/** The module's page-header colour (aqua → violet). */
export const RENAL_HEADER = "from-sky-500 to-violet-600";
