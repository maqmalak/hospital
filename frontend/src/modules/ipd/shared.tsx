import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BedDouble, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/utils/cn";

export const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
export const dt = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");
export const dOnly = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : "–");
export const tm = (s?: string | null) => (s ? new Date(s.replace(" ", "T")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
export const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
export const toServer = (local: string) => (local ? local.replace("T", " ") + ":00" : undefined);

export interface Ctx {
  branch: string; doctors: { name: string; doctor_name: string; specialization?: string; branch?: string }[];
  payers: { name: string; customer_group: string; hv_coverage_percent: number }[];
  beds: { name: string; bed_no: string; ward: string; status: string; rate: number; ward_type?: string; bed_type?: string }[];
  wards: { name: string; ward_type: string; bed_charge_per_day: number; nursing_charge_per_shift: number; icu_surcharge_per_day: number; color?: string }[];
  packages: { name: string; price: number; days: number; procedure_type?: string }[];
  diet_types: { name: string; diet_name_ur?: string; per_meal_rate: number; per_day_rate: number }[];
  procedure_types: { name: string; category: string; price: number; theatre_charge: number; anesthesia_charge: number; requires_consent: number; requires_preauth: number }[];
  lab_templates: { name: string; test_code: string; department: string; price: number }[];
  charge_items: { name: string; item_name: string; standard_rate: number }[];
  flags: { mar_gate: number; mar_billing: string; stock: string; diet_mode: string; procedure_trigger: string; hold: number; consent: number; packages: number;
    diet: number; mar: number; procedures: number; preauth: number; oxygen_rate: number };
}

export interface BillLine { charge_type: string; item_code: string; description: string; qty: number; rate: number; amount: number; charge?: string; source?: string;
  posted_at?: string; covered: number; covered_amount: number; billed?: number }
export interface Bill { lines: BillLine[]; gross: number; package_covered: number; net: number; discount: number; payer_share: number; patient_share: number;
  advances: number; settled: number; refunded: number; balance: number; credit: number; by_type: Record<string, number>; until: string; final_invoice?: string;
  payer_type: string; payer?: string;
  payments: { name: string; posting_date: string; payment_type: string; mode_of_payment: string; paid_amount: number; hv_purpose: string; creation: string; owner: string }[];
  admission?: { name: string; status: string; admit_datetime: string; release_datetime?: string; ward: string; doctor_name?: string; payer_type: string; payer?: string;
    pre_auth?: string; service_package?: string; discount_amount?: number; discount_authorization?: string; final_invoice?: string; payer_invoice?: string;
    discharge_type?: string; expected_discharge?: string; branch: string };
  er?: { name: string; status: string; arrival_at: string; disposition?: string; billing_mode: string; sales_invoice?: string };
  patient?: { name: string; patient_name: string; gender: string; dob?: string; phone?: string; category?: string };
  bed_no?: string; clinic: { name: string; name_ur?: string; address?: string; phone?: string; logo?: string }; days?: number; coverage_percent?: number; pre_auth_amount?: number;
}

export const CHARGE_TONE: Record<string, string> = {
  Package: "bg-fuchsia-500", Bed: "bg-teal-500", ICU: "bg-rose-600", Nursing: "bg-sky-500", Medicine: "bg-emerald-500", Procedure: "bg-violet-500",
  Lab: "bg-indigo-500", Consumable: "bg-amber-500", Diet: "bg-lime-500", Oxygen: "bg-cyan-500", "Ad-hoc": "bg-slate-500", ER: "bg-red-500",
};
export function ChargeDot({ t }: { t: string }) { return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", CHARGE_TONE[t] ?? "bg-slate-400")} />; }

export const ADM_TONE: Record<string, string> = {
  Admitted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  "Discharge Pending": "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  Discharged: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200", Cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
  Scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200", "Pending Approval": "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  Approved: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200", Administered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  Missed: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200", Refused: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200",
  Held: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200", Active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  Stopped: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200", Completed: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-200",
  "In Progress": "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200", Ordered: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  Served: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200", Open: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
  Billed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200", Released: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
};
export function Chip({ s, className }: { s?: string; className?: string }) {
  if (!s) return null;
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", ADM_TONE[s] ?? "bg-muted text-muted-foreground", className)}>{s}</span>;
}

/** Inpatient hero: deep teal → emerald band like the other Phase 2 module heroes. */
export function IpdHero({ title, sub, actions, icon: Icon = BedDouble, tone = "teal", children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; icon?: LucideIcon;
  tone?: "teal" | "red" | "indigo"; children?: ReactNode }) {
  const bg = tone === "red" ? "bg-[#3b0a0a]" : tone === "indigo" ? "bg-[#14143d]" : "bg-[#06302c]";
  const glow = tone === "red" ? "rgba(239,68,68,0.55)" : tone === "indigo" ? "rgba(99,102,241,0.55)" : "rgba(20,184,166,0.55)";
  return (
    <div className={cn("relative mb-5 overflow-hidden rounded-3xl p-5 text-white shadow-lg sm:p-6", bg)}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(700px 300px at 0% 0%, ${glow}, transparent 60%), radial-gradient(600px 300px at 100% 100%, rgba(16,185,129,0.35), transparent 60%)` }} />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><Icon className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">{title}</h1>{sub && <div className="text-sm text-white/75">{sub}</div>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </div>
  );
}

export function useIpdLive(keys: string[], extra: string[] = []) {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  useRealtime(boot?.site, [`hv:ipd:${branch}`, `hv:mar:${branch}`, `hv:beds:${branch}`, ...extra.map((e) => `hv:${e}:${branch}`)],
    () => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] })));
}

export const TRIAGE_BG: Record<number, string> = { 1: "bg-red-600", 2: "bg-orange-500", 3: "bg-amber-400", 4: "bg-green-600", 5: "bg-blue-600" };
export const ROUTES = ["Oral", "IV", "IM", "SC", "Inhalation", "Topical", "PR", "SL", "NG", "Other"];
export const FREQS = ["OD", "BD", "TDS", "QID", "Q4H", "Q6H", "Q8H", "HS", "STAT", "PRN"];
