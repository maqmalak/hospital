import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, ChevronLeft, ChevronRight, Globe, Lock, MessageCircle, Plus, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/utils/cn";
import { toISODate } from "@/utils/dates";

export type CalView = "day" | "multi" | "week" | "month";
interface Doctor { name: string; doctor_name: string; specialization?: string; color?: string; consultation_room?: string }
interface Slot { name: string | null; doctor: string; slot_date: string; start_time: string; end_time: string; status: string; appointment?: string;
  patient?: string; patient_name?: string; phone?: string; appt_status?: string; source_channel?: string; booking_ref?: string; priority?: string }
interface Base { doctors: Doctor[]; leave: { doctor: string; from_date: string; to_date: string; reason?: string }[]; blocked: { date: string; reason?: string }[] }
interface DayData extends Base { slots: Slot[] }
interface MonthData extends Base { days: Record<string, { free: number; booked: number; held: number; blocked: number; doctors: { doctor: string; free: number; booked: number }[]; status: Record<string, number> }> }
export interface Preset { doctor: string; date: string; slot: string; time: string }

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const iso = toISODate;
const to12 = (t: string) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "a" : "p"}`; };
const APPT: Record<string, string> = {
  Pending: "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
  Confirmed: "border-sky-400 bg-sky-50 text-sky-900 dark:bg-sky-500/15 dark:text-sky-100",
  Arrived: "border-violet-400 bg-violet-50 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100",
  Completed: "border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100",
  "No-show": "border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100",
};
const PRI: Record<string, string> = { Urgent: "bg-red-600", Elderly: "bg-orange-500", Disabled: "bg-blue-600", "Follow-up": "bg-teal-600" };

export function CalendarView({ view, setView, onBook, onOpen }: { view: CalView; setView: (v: CalView) => void; onBook: (p: Preset) => void; onOpen: (appointment: string) => void }) {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  const [doctor, setDoctor] = useState("");
  const [span, setSpan] = useState(() => { try { return Number(localStorage.getItem("hv.cal.span")) || 3; } catch { return 3; } });
  const range = useMemo(() => {
    if (view === "day") return [anchor, anchor];
    if (view === "multi") return [anchor, addDays(anchor, span - 1)];
    if (view === "week") { const s = startOfWeek(anchor); return [s, addDays(s, 6)]; }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const s = startOfWeek(first);
    return [s, addDays(s, 41)];
  }, [view, anchor, span]);
  const base = useApi<DayData | MonthData>("appointments.calendar", { start: iso(range[0]), end: iso(range[1]), branch, summary: view === "month" ? 1 : 0,
    doctor: view === "week" || view === "multi" ? doctor || undefined : undefined }, { refetchInterval: 30_000 });
  useRealtime(boot?.site, ["hv:appointment_request"], () => void qc.invalidateQueries({ queryKey: ["appointments.calendar"] }));
  const doctors = base.data?.doctors ?? [];
  const weekDoctor = doctor || doctors[0]?.name || "";
  const step = (n: number) => setAnchor((a) => (view === "day" ? addDays(a, n) : view === "multi" ? addDays(a, span * n) : view === "week" ? addDays(a, 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1)));
  const title = view === "day" ? anchor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : view === "week" || view === "multi" ? `${range[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${range[1].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
    : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const onLeave = (doc: string, date: string) => base.data?.leave.find((l) => l.doctor === doc && l.from_date <= date && l.to_date >= date);
  const blockedDay = (date: string) => base.data?.blocked.find((b) => b.date === date);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-gradient-to-r from-muted/60 to-transparent p-3">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="rounded-lg border border-border p-2 hover:bg-muted"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
          <button onClick={() => setAnchor(new Date())} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted">Today</button>
          <button onClick={() => step(1)} className="rounded-lg border border-border p-2 hover:bg-muted"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
        </div>
        <h2 className="min-w-0 flex-1 truncate px-2 text-lg font-bold">{title}</h2>
        {view === "multi" && <div className="flex rounded-xl bg-muted p-1">{[3, 5, 10, 14].map((n) => (
          <button key={n} onClick={() => { setSpan(n); try { localStorage.setItem("hv.cal.span", String(n)); } catch { /* ignore */ } }} className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", span === n ? "bg-card shadow-sm" : "text-muted-foreground")}>{n}d</button>))}</div>}
        {(view === "week" || view === "multi") && <select value={weekDoctor} onChange={(e) => setDoctor(e.target.value)} className="h-9 rounded-lg border border-input bg-[hsl(var(--input-bg))] px-2 text-sm">
          {doctors.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select>}
        <div className="flex rounded-xl bg-muted p-1">{([["day", "Day"], ["multi", "Multi-day"], ["week", "Week"], ["month", "Month"]] as [CalView, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", view === v ? "bg-gradient-to-r from-teal-600 to-emerald-500 text-white shadow-sm" : "text-muted-foreground")}>{l}</button>))}</div>
      </div>
      <Legend />
      {!base.data ? <div className="h-96 animate-pulse bg-muted/40" />
        : view === "month" ? <MonthGrid data={base.data as MonthData} anchor={anchor} start={range[0]} doctors={doctors} onDay={(d) => { setAnchor(d); setView("day"); }} />
        : view === "day" ? <Grid slots={(base.data as DayData).slots} columns={doctors.map((d) => ({ key: d.name, date: iso(anchor), label: d.doctor_name, sub: d.specialization, color: d.color, leave: onLeave(d.name, iso(anchor))?.reason ?? (onLeave(d.name, iso(anchor)) ? "On leave" : undefined) }))}
            match={(s, c) => s.doctor === c.key && s.slot_date === c.date} blocked={blockedDay(iso(anchor))?.reason} onBook={onBook} onOpen={onOpen} />
        : <Grid slots={(base.data as DayData).slots.filter((s) => s.doctor === weekDoctor)} columns={Array.from({ length: view === "multi" ? span : 7 }, (_, i) => { const d = addDays(range[0], i); const k = iso(d); const lv = onLeave(weekDoctor, k);
            return { key: k, date: k, label: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }), sub: d.toLocaleDateString(undefined, { month: "short" }), today: k === iso(new Date()),
              leave: blockedDay(k) ? blockedDay(k)!.reason || "Clinic closed" : lv ? lv.reason || "On leave" : undefined }; })}
            match={(s, c) => s.slot_date === c.date} onBook={onBook} onOpen={onOpen} keepAll />}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
      {[["border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10", "Free"], ["border-amber-400 bg-amber-50", "Request (pending)"], ["border-sky-400 bg-sky-50", "Confirmed"],
        ["border-violet-400 bg-violet-50", "Arrived"], ["border-emerald-400 bg-emerald-100", "Completed"], ["border-rose-400 bg-rose-50", "No-show"], ["border-slate-300 bg-slate-100", "Held / blocked"]].map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded border", c)} />{l}</span>))}
    </div>
  );
}

interface Col { key: string; date: string; label: string; sub?: string; color?: string; leave?: string; today?: boolean }

/** Time rows × columns (doctors for Day, days for Week). Every slot is one cell. */
function Grid({ slots, columns, match, blocked, onBook, onOpen, keepAll }: { slots: Slot[]; columns: Col[]; match: (s: Slot, c: Col) => boolean; blocked?: string;
  onBook: (p: Preset) => void; onOpen: (a: string) => void; keepAll?: boolean }) {
  const times = [...new Set(slots.map((s) => s.start_time))].sort();
  const cols = keepAll ? columns.map((c) => (c.leave || slots.some((s) => match(s, c)) ? c : { ...c, leave: c.date < iso(new Date()) ? "Past" : "No clinic" })) : columns.filter((c) => slots.some((s) => match(s, c)) || c.leave);
  if (blocked) return <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground"><CalendarOff className="h-8 w-8" /><b>Clinic closed</b>{blocked}</div>;
  if (!times.length) return <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground"><CalendarOff className="h-8 w-8" />No clinic hours in this period.</div>;
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          <tr><th className="sticky start-0 z-20 w-16 border-b border-e border-border bg-card p-2" />
            {cols.map((c) => (
              <th key={c.key} className={cn("min-w-[150px] border-b border-border bg-card p-2 text-start", c.today && "bg-teal-50 dark:bg-teal-500/10")}>
                <div className="flex items-center gap-2">{c.color && <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />}
                  <div className="min-w-0"><div className="truncate text-sm font-bold">{c.label}</div><div className="truncate font-normal text-muted-foreground">{c.sub}</div></div></div>
              </th>))}</tr>
        </thead>
        <tbody>
          {times.map((tm) => (
            <tr key={tm}>
              <td className="sticky start-0 z-[5] border-e border-b border-border/60 bg-card px-2 py-1 text-end align-top font-semibold tabular-nums text-muted-foreground">{to12(tm)}</td>
              {cols.map((c) => {
                if (c.leave) return <td key={c.key} className="border-b border-border/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(148,163,184,0.15)_6px,rgba(148,163,184,0.15)_12px)] p-1 text-center text-[10px] text-muted-foreground">{tm === times[0] ? c.leave : ""}</td>;
                const s = slots.find((x) => match(x, c) && x.start_time === tm);
                return <td key={c.key} className={cn("border-b border-border/40 p-1 align-top", c.today && "bg-teal-50/40 dark:bg-teal-500/5")}><Cell s={s} onBook={onBook} onOpen={onOpen} /></td>;
              })}
            </tr>))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ s, onBook, onOpen }: { s?: Slot; onBook: (p: Preset) => void; onOpen: (a: string) => void }) {
  if (!s) return <div className="h-11" />;
  if (s.status === "Available") return (
    <button onClick={() => s.name && onBook({ doctor: s.doctor, date: s.slot_date, slot: s.name, time: s.start_time })}
      className="group flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 text-[11px] font-semibold text-emerald-700 transition-all hover:border-solid hover:bg-emerald-500 hover:text-white dark:border-emerald-500/40 dark:bg-emerald-500/5 dark:text-emerald-300">
      <Plus className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />{to12(s.start_time)}</button>);
  if (s.status === "Held") return <div className="flex h-11 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-slate-100 text-[11px] text-slate-600 dark:bg-slate-500/10 dark:text-slate-300"><Lock className="h-3 w-3" />Held online</div>;
  if (s.status === "Blocked") return <div className="h-11 rounded-lg bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(148,163,184,0.25)_5px,rgba(148,163,184,0.25)_10px)]" />;
  const st = s.appt_status || "Confirmed";
  const Icon = s.source_channel === "WhatsApp" ? MessageCircle : s.source_channel === "Web" ? Globe : UserRound;
  return (
    <button onClick={() => s.appointment && onOpen(s.appointment)} title={`${s.patient_name} · ${s.phone ?? ""} · ${s.booking_ref ?? ""} · ${st}`}
      className={cn("flex h-11 w-full flex-col justify-center overflow-hidden rounded-lg border-s-4 px-2 text-start shadow-sm transition-transform hover:scale-[1.02]", APPT[st] ?? APPT.Confirmed)}>
      <div className="flex items-center gap-1 truncate text-[11px] font-bold"><Icon className="h-3 w-3 shrink-0 opacity-70" /><span className="truncate">{s.patient_name}</span>
        {s.priority && PRI[s.priority] && <span className={cn("ms-auto h-2 w-2 shrink-0 rounded-full", PRI[s.priority])} title={s.priority} />}</div>
      <div className="truncate text-[10px] opacity-75">{to12(s.start_time)} · {st}</div>
    </button>
  );
}

function MonthGrid({ data, anchor, start, doctors, onDay }: { data: MonthData; anchor: Date; start: Date; doctors: Doctor[]; onDay: (d: Date) => void }) {
  const color = Object.fromEntries(doctors.map((d) => [d.name, d.color || "#0d9488"]));
  const today = iso(new Date());
  return (
    <div className="grid grid-cols-7">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="border-b border-border bg-muted/40 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{d}</div>)}
      {Array.from({ length: 42 }, (_, i) => {
        const d = addDays(start, i); const k = iso(d); const x = data.days[k]; const inMonth = d.getMonth() === anchor.getMonth();
        const total = x ? x.free + x.booked + x.held : 0; const pct = total ? Math.round((x!.booked / total) * 100) : 0;
        const closed = data.blocked.find((b) => b.date === k);
        const pend = x?.status?.Pending ?? 0;
        return (
          <button key={k} onClick={() => onDay(d)} className={cn("group min-h-[110px] border-b border-e border-border/60 p-2 text-start transition-colors hover:bg-teal-50/60 dark:hover:bg-teal-500/5", !inMonth && "bg-muted/30 text-muted-foreground/60")}>
            <div className="flex items-center justify-between">
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold", k === today && "bg-gradient-to-br from-teal-600 to-emerald-500 text-white")}>{d.getDate()}</span>
              {pend > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{pend} req</span>}
            </div>
            {closed ? <div className="mt-2 rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">Closed{closed.reason ? ` · ${closed.reason}` : ""}</div>
              : x && total > 0 ? <>
                <div className="mt-2 flex items-baseline gap-1"><span className="text-lg font-extrabold tabular-nums">{x.booked}</span><span className="text-[10px] text-muted-foreground">booked · {x.free} free</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15"><div className="h-1.5 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500" style={{ width: `${pct}%` }} /></div>
                <div className="mt-1.5 flex flex-wrap gap-0.5">{x.doctors.slice(0, 8).map((dd) => <span key={dd.doctor} className="h-2 w-2 rounded-full" style={{ background: color[dd.doctor] ?? "#94a3b8", opacity: dd.booked ? 1 : 0.35 }} title={`${doctors.find((z) => z.name === dd.doctor)?.doctor_name}: ${dd.booked} booked, ${dd.free} free`} />)}</div>
              </> : <div className="mt-3 text-[10px] text-muted-foreground/60">—</div>}
          </button>);
      })}
    </div>
  );
}
