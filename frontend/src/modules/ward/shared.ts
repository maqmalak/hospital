export interface Bed { name: string; bed_no: string; ward: string; room?: string; bed_type: string; status: string; daily_rate?: number; has_oxygen: number; has_monitor: number;
  current_patient?: string; patient_name?: string; occupied_since?: string; expected_discharge?: string; agreed_rate?: number; admission_reason?: string;
  attending_doctor?: string; doctor_name?: string; reserved_until?: string; status_note?: string; pos_x?: number; pos_y?: number; gender?: string; age?: number; category?: string; label?: string }
export interface Ward { name: string; ward_name: string; ward_name_ur?: string; ward_type: string; gender: string; floor?: string; color?: string; bed_charge_per_day?: number; nursing_station?: string }
export interface BedMap { branch: string; branches: string[]; wards: Ward[]; beds: Bed[]; totals: Record<string, number>; occupancy: number; now: string }

export const parseDT = (s?: string) => (s ? new Date(s.replace(" ", "T")).getTime() : 0);
/** "Overdue" past the expected discharge; "Expiring soon" within 12 hours of it. */
export function stayState(b: Bed, now: number): "overdue" | "soon" | null {
  if (b.status !== "Occupied" || !b.expected_discharge) return null;
  const left = parseDT(b.expected_discharge) - now;
  return left < 0 ? "overdue" : left < 12 * 3600_000 ? "soon" : null;
}
export const hoursText = (ms: number) => { const h = Math.floor(Math.abs(ms) / 3600_000); return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`; };
export const fmtDT = (s?: string) => (s ? new Date(s.replace(" ", "T")).toLocaleString([], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");

export const STATUS_STYLE: Record<string, { card: string; dot: string; text: string }> = {
  Available: { card: "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/50", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  Occupied: { card: "border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/40", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
  Reserved: { card: "border-sky-300 bg-sky-50 dark:bg-sky-500/10 dark:border-sky-500/40", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  Cleaning: { card: "border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  Maintenance: { card: "border-slate-300 bg-slate-100 dark:bg-slate-500/10 dark:border-slate-500/40", dot: "bg-slate-500", text: "text-slate-600 dark:text-slate-300" },
};
