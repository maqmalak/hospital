/** Radiology staff screens (D-91): shared types, status / priority / TAT chips, live refresh, modal, print helper. */
import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/utils/cn";

export interface Row {
  name: string; booking_ref: string; patient?: string; patient_name: string; gender?: string; age?: number; procedure: string; procedure_name: string; modality: string;
  priority: "Routine" | "Urgent" | "Emergency"; status: string; report_status: string; scheduled_date: string; slot_time?: string | null; walk_in: number; token_no?: string;
  booking_source?: string; payment_status: string; payment_option: string; amount?: number; expected_at?: string | null; scanned_at?: string | null; verified_at?: string | null;
  radiologist?: string; radiologist_name?: string; critical_finding: number; copy_requested: number; ward_location?: string; referring_name?: string; external_referrer?: string;
  tat?: "green" | "amber" | "red" | null; qc_passed?: number; registered_at?: string | null;
}
export interface Ctx { procedures: { name: string; procedure_name: string; modality: string; category: string; price: number; walk_in: number; needs_consent: number; female_only: number; duration_min: number; tat_hours: number }[];
  radiologists: { name: string; doctor_name: string }[]; doctors: { name: string; doctor_name: string; specialization?: string }[]; panels: string[]; me?: string }

export const STATUSES = ["Booked", "Registered", "In Progress", "Scanned", "Reporting", "Verified", "Delivered"] as const;
export const STATUS_TONE: Record<string, string> = {
  Booked: "bg-slate-100 text-slate-700 ring-slate-300/60 dark:bg-white/10 dark:text-slate-200",
  Registered: "bg-sky-100 text-sky-800 ring-sky-300/60 dark:bg-sky-500/15 dark:text-sky-200",
  "In Progress": "bg-indigo-100 text-indigo-800 ring-indigo-300/60 dark:bg-indigo-500/15 dark:text-indigo-200",
  Scanned: "bg-violet-100 text-violet-800 ring-violet-300/60 dark:bg-violet-500/15 dark:text-violet-200",
  Reporting: "bg-amber-100 text-amber-800 ring-amber-300/60 dark:bg-amber-500/15 dark:text-amber-200",
  Verified: "bg-teal-100 text-teal-800 ring-teal-300/60 dark:bg-teal-500/15 dark:text-teal-200",
  Delivered: "bg-emerald-100 text-emerald-800 ring-emerald-300/60 dark:bg-emerald-500/15 dark:text-emerald-200",
  Cancelled: "bg-slate-100 text-slate-500 ring-slate-200 line-through", "No Show": "bg-rose-50 text-rose-600 ring-rose-200",
};
export function StatusBadge({ s, className }: { s: string; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STATUS_TONE[s] ?? "bg-muted", className)}>{s}</span>;
}
export const PRIORITY_BAR: Record<string, string> = { Emergency: "bg-rose-600", Urgent: "bg-amber-500", Routine: "bg-slate-300 dark:bg-slate-600" };
export function PriorityTag({ p }: { p: string }) {
  const tone = p === "Emergency" ? "bg-rose-600 text-white" : p === "Urgent" ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", tone)}>{p === "Emergency" ? "⚡ " : p === "Urgent" ? "▲ " : ""}{p}</span>;
}
export function TatDot({ t, due }: { t?: string | null; due?: string | null }) {
  if (!t) return <span className="text-xs text-muted-foreground">—</span>;
  const tone = t === "red" ? "bg-rose-500" : t === "amber" ? "bg-amber-500" : "bg-emerald-500";
  const label = t === "red" ? "Overdue" : t === "amber" ? "Due soon" : "On time";
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs" title={due ? `Due ${due}` : undefined}>
    <span className={cn("h-2.5 w-2.5 rounded-full", tone, t === "red" && "animate-pulse")} /><span className="font-medium">{label}</span>{due && <span className="text-muted-foreground">{due.slice(11, 16)}</span>}</span>;
}

export function useRadLive(keys: string[]) {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  useRealtime(boot?.site, [`hv:radiology:${branch}`, "hv:critical_imaging"], (ev?: unknown) => {
    keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    const e = ev as { patient?: string; note?: string } | undefined;
    if (e?.note) toast.error(`Critical imaging finding: ${e.patient} — ${e.note}`, { duration: 10000 });
  });
}

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()} className={cn("flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl", wide ? "max-w-4xl" : "max-w-lg")}>
        <div className="flex items-center gap-3 border-b border-border px-5 py-3.5"><h2 className="min-w-0 flex-1 truncate text-base font-bold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-muted"><X className="h-5 w-5" /></button></div>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Open the server-rendered report PDF (staff copy, includes drafts with a NOT SIGNED stamp). */
export function openPdf(name: string) {
  window.open(`/api/method/hospital_vvs.api.radiology.print_pdf?name=${encodeURIComponent(name)}`, "_blank", "noopener");
}

export const age = (r: { age?: number; gender?: string }) => [r.age ? `${r.age}y` : "", r.gender?.[0] ?? ""].filter(Boolean).join(" ");
export const hm = (t?: string | null) => (t ? t.slice(0, 5) : "");
export const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
