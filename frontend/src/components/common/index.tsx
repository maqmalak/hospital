import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Inbox, ScanLine, Search, X, type LucideIcon } from "lucide-react";
import { getCall } from "@/services/frappe";
import { cn } from "@/utils/cn";

export function PageHeader({ title, subtitle, icon: Icon, actions, color = "from-teal-600 to-emerald-500" }: {
  title: string; subtitle?: ReactNode; icon?: LucideIcon; actions?: ReactNode; color?: string }) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {Icon && <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", color)}><Icon className="h-5 w-5" /></span>}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold tracking-tight">{t(title)}</h1>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  teal: "from-teal-500/15 to-emerald-500/5 text-teal-700 dark:text-teal-300",
  blue: "from-sky-500/15 to-blue-500/5 text-sky-700 dark:text-sky-300",
  violet: "from-violet-500/15 to-indigo-500/5 text-violet-700 dark:text-violet-300",
  amber: "from-amber-500/15 to-orange-500/5 text-amber-700 dark:text-amber-300",
  rose: "from-rose-500/15 to-pink-500/5 text-rose-700 dark:text-rose-300",
  slate: "from-slate-500/15 to-slate-500/5 text-slate-700 dark:text-slate-300",
};

export function StatCard({ label, value, hint, icon: Icon, tone = "teal", onClick }: { label: string; value: ReactNode; hint?: ReactNode;
  icon?: LucideIcon; tone?: keyof typeof TONES; onClick?: () => void }) {
  const t = TONES[tone] ?? TONES.teal;
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={cn("hover-lift relative overflow-hidden rounded-2xl border border-border bg-card p-4 text-start shadow-sm disabled:cursor-default")}>
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90", t)} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-foreground">{value}</div>
          {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && <span className={cn("rounded-xl bg-white/70 p-2 dark:bg-white/10", t.split(" ").slice(2).join(" "))}><Icon className="h-5 w-5" /></span>}
      </div>
    </button>
  );
}

const PILL: Record<string, string> = {
  Waiting: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  Called: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  "In Consultation": "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  Done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  Skipped: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  Confirmed: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  Arrived: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  Completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  Cancelled: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  Rejected: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  "No-show": "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  Signed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  Draft: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  Superseded: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  Approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  "Within Limit": "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300",
  Used: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  Sent: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  Delivered: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300",
  Read: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  Failed: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  Queued: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  Skipped_msg: "bg-slate-200 text-slate-700",
  Web: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
  WhatsApp: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  Reception: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  Urgent: "bg-red-600 text-white", Elderly: "bg-orange-500 text-white", Disabled: "bg-blue-600 text-white",
};

export function Pill({ value, className }: { value?: string | null; className?: string }) {
  const { t } = useTranslation();
  if (!value) return null;
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", PILL[value] ?? "bg-muted text-muted-foreground", className)}>{t(value)}</span>;
}

export function Empty({ title, hint, icon: Icon = Inbox }: { title: string; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
      <Icon className="mb-2 h-8 w-8 opacity-60" /><div className="font-semibold text-foreground">{title}</div>{hint && <div className="text-sm">{hint}</div>}
    </div>
  );
}

export function Field({ label, children, hint, required, className }: { label: string; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t(label)}{required && <span className="text-destructive"> *</span>}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls = "h-10 w-full rounded-lg border border-input bg-[hsl(var(--input-bg))] px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Section({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm", className)}>
      {(title || actions) && <div className="mb-3 flex items-center gap-2"><h2 className="flex-1 text-sm font-bold">{title}</h2>{actions}</div>}
      {children}
    </section>
  );
}

export interface PatientHit { name: string; patient_name: string; patient_name_ur?: string; gender: string; age?: number; phone?: string; city?: string;
  category?: string; cnic_masked?: string; photo?: string; last_visit?: string; branch?: string }

/** Patient search: MR / QR scan, phone, CNIC (exact), name. A scanner's Enter selects the single exact MR match. */
export function PatientPicker({ onPick, autoFocus, placeholder, value, onClear }: { onPick: (p: PatientHit) => void; autoFocus?: boolean;
  placeholder?: string; value?: PatientHit | null; onClear?: () => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<number>();
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = window.setTimeout(async () => {
      try {
        const r = await getCall<PatientHit[]>("hospital_vvs.api.patients.search", { q });
        setHits(r); setOpen(true); setActive(0);
      } catch { setHits([]); }
    }, 220);
    return () => window.clearTimeout(timer.current);
  }, [q]);
  const pick = (p: PatientHit) => { onPick(p); setQ(""); setHits([]); setOpen(false); };
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-2">
        <Avatarish name={value.patient_name} src={value.photo} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{value.patient_name} <span className="text-xs font-normal text-muted-foreground">{value.patient_name_ur}</span></div>
          <div className="text-xs text-muted-foreground">{value.name} · {value.gender}{value.age != null ? ` · ${value.age}y` : ""} · {value.phone}</div>
        </div>
        {value.category && value.category !== "Normal" && <Pill value={value.category} className="bg-amber-100 text-amber-800" />}
        {onClear && <button onClick={onClear} className="rounded-md p-1 hover:bg-muted" aria-label="Clear"><X className="h-4 w-4" /></button>}
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter") {
              e.preventDefault();
              const exact = hits.find((h) => h.name.toUpperCase() === q.trim().toUpperCase());
              if (exact) pick(exact); else if (hits[active]) pick(hits[active]);
              else if (q.trim().toUpperCase().startsWith("MR-")) void getCall<PatientHit[]>("hospital_vvs.api.patients.search", { q }).then((r) => r[0] && pick(r[0]));
            }
          }}
          placeholder={placeholder ?? t("Search patient") + " — MR / phone / CNIC / name"} className="h-11 flex-1 bg-transparent text-sm outline-none" />
        <ScanLine className="h-4 w-4 text-muted-foreground" aria-label="Scanner ready" />
      </div>
      {open && hits.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          {hits.map((h, i) => (
            <button key={h.name} onMouseDown={(e) => { e.preventDefault(); pick(h); }} onMouseEnter={() => setActive(i)}
              className={cn("flex w-full items-center gap-3 border-b border-border/60 px-3 py-2 text-start last:border-0", i === active && "bg-accent")}>
              <Avatarish name={h.patient_name} src={h.photo} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{h.patient_name} <span className="font-normal text-muted-foreground">{h.patient_name_ur}</span></div>
                <div className="truncate text-xs text-muted-foreground">{h.name} · {h.phone} · {h.age != null ? `${h.age}y` : ""} · {h.gender}{h.last_visit ? ` · last ${h.last_visit}` : ""}</div>
              </div>
              {h.category && h.category !== "Normal" && <Pill value={h.category} className="bg-amber-100 text-amber-800" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Avatarish({ name, src, size = 9 }: { name?: string; src?: string; size?: number }) {
  const initials = (name || "?").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const style = { width: size * 4, height: size * 4 };
  return src ? <img src={src} alt="" style={style} className="shrink-0 rounded-full object-cover" />
    : <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white">{initials}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
      {tabs.map((tb) => (
        <button key={tb.key} onClick={() => onChange(tb.key)}
          className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", value === tb.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {t(tb.label)}{tb.count != null && <span className="ms-1.5 rounded-full bg-primary/15 px-1.5 text-[11px] text-primary">{tb.count}</span>}
        </button>
      ))}
    </div>
  );
}
