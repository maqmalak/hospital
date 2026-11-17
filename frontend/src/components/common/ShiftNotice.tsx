import { Link } from "react-router-dom";
import { AlertTriangle, LockOpen } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";

interface Mine { shift: { shift: string; counter: string; opened_at: string } | null; closing?: { status: string } | null }
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Billing screens: warns before the cashier starts when money can't be taken — no open shift, or yesterday's shift still
 * open (the server refuses those bills, D-61) — with a one-click link to fix it. Hidden when shifts are switched off.
 */
export function ShiftNotice({ className = "" }: { className?: string }) {
  const { boot } = useAuth();
  const on = !!boot?.modules?.enable_shifts;
  const { data } = useApi<Mine>("cash.my_shift", undefined, { enabled: on, retry: false, refetchInterval: 60_000 });
  if (!on || !data) return null;
  const s = data.shift;
  const opened = s ? s.opened_at.slice(0, 10) : "";
  const old = !!s && opened !== day(new Date());
  if (s && !old && !data.closing) return null;
  const msg = !s ? "No cashier shift is open — slips can't be saved until you open one."
    : data.closing ? "Your shift is being closed — finish the count or ask the supervisor before billing."
    : `Your shift from ${opened} is still open. Close it, then open today's shift, before saving slips.`;
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 ${className}`}>
      <AlertTriangle className="h-5 w-5 shrink-0" /><span className="flex-1 font-medium">{msg}</span>
      <Link to={!s ? "/cash/shift" : "/cash/close"} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700">
        <LockOpen className="h-4 w-4" />{!s ? "Open shift" : old ? "Close old shift" : "View closing"}</Link>
    </div>
  );
}
