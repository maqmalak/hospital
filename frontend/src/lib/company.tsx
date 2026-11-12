import { useEffect, useSyncExternalStore } from "react";
import { Building2 } from "lucide-react";
import { useApi } from "@/lib/api";
import { cn } from "@/utils/cn";

/**
 * The company every accounts, sales and buying screen and report runs for (D-70). One choice for the whole app (the
 * ported accounting screens read the same value), always a single company: there is no "all companies" view, and the
 * server refuses these calls without one.
 */
const KEY = "hv.company";
let current = (() => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } })();
const subs = new Set<() => void>();

export function setCompany(c: string) {
  if (c === current) return;
  current = c;
  try { localStorage.setItem(KEY, c); } catch { /* private mode */ }
  subs.forEach((f) => f());
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** [company, setCompany, companies]. Company is "" only until the list has loaded; then it is always a real company. */
export function useCompany(): [string, (c: string) => void, string[]] {
  const company = useSyncExternalStore(subscribe, () => current);
  const { data } = useApi<string[]>("finance.companies", undefined, { staleTime: 10 * 60_000 });
  const list = data ?? [];
  useEffect(() => { if (list.length && !list.includes(company)) setCompany(list[0]); }, [list, company]);
  return [list.includes(company) ? company : "", setCompany, list];
}

const short = (c: string) => c.replace(/^VVS\s+/, "").replace(/\s*\(.*\)$/, "");

/** Required company picker: one button per company (a select when there are many). */
export function CompanyPicker({ className }: { className?: string }) {
  const [company, set, list] = useCompany();
  if (list.length > 3) return (
    <label className={cn("flex items-center gap-2 rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold", className)}>
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <select aria-label="Company" className="bg-transparent outline-none" value={company} onChange={(e) => set(e.target.value)}>
        {list.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
  return (
    <div role="radiogroup" aria-label="Company" className={cn("flex items-center rounded-xl bg-muted p-1", className)}>
      <Building2 className="mx-1.5 h-4 w-4 text-muted-foreground" />
      {list.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={company === c} title={c} onClick={() => set(c)}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", company === c ? "tab-gold" : "text-muted-foreground")}>{short(c)}</button>
      ))}
    </div>
  );
}

/** Strip above a report / list: which company it is for, and the picker. */
export function CompanyBar() {
  const [company] = useCompany();
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-2 shadow-sm">
      <div className="text-xs text-muted-foreground">Company <b className="ms-1 text-sm text-foreground">{company || "…"}</b></div>
      <CompanyPicker />
    </div>
  );
}
