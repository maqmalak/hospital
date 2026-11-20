/** Nursery & NICU staff screens (D-95): shared types, status colours, live refresh. Modal is reused from radiology. */
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/utils/cn";

export { Modal } from "@/modules/radiology/shared";

export type Status = "Stable" | "Observation" | "Critical" | "Phototherapy" | "Ready for discharge" | "Discharged";
export const STATUS_STYLE: Record<string, { dot: string; tile: string; chip: string }> = {
  Stable: { dot: "bg-emerald-500", tile: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" },
  Observation: { dot: "bg-amber-500", tile: "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10", chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" },
  Critical: { dot: "bg-rose-600 animate-pulse", tile: "border-rose-400 bg-rose-50 dark:border-rose-500/50 dark:bg-rose-500/10", chip: "bg-rose-600 text-white" },
  Phototherapy: { dot: "bg-sky-500", tile: "border-sky-300 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/10", chip: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200" },
  "Ready for discharge": { dot: "bg-violet-500", tile: "border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10", chip: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200" },
  Discharged: { dot: "bg-slate-400", tile: "border-border bg-muted/40", chip: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300" },
};
export const STATUSES: Status[] = ["Stable", "Observation", "Critical", "Phototherapy", "Ready for discharge"];
export function StatusChip({ s, className }: { s: string; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold", STATUS_STYLE[s]?.chip ?? "bg-muted", className)}>{s}</span>;
}
export const SEVERITY: Record<string, string> = { red: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
  amber: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200", blue: "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200" };

export interface Alert { kind: string; severity: string; name: string; baby: string; text: string; at: string }
export const ageLabel = (h?: number) => (h == null ? "" : h < 48 ? `${Math.round(h)} h` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`);
export const UNITS = ["Rooming-in", "Nursery", "NICU"] as const;

export function useNurseryLive(keys: string[]) {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  useRealtime(boot?.site, [`hv:nursery:${branch}`], (ev) => {
    keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    const e = ev as { action?: string; baby?: string; flags?: string[] } | undefined;
    if (e?.flags?.length && (e.action === "alert" || e.action === "alarm")) toast.error(`${e.baby}: ${e.flags[0]}`, { duration: 9000 });
  });
}
