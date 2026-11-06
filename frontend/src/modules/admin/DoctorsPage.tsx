import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CalendarClock, CalendarOff, CalendarPlus, ClipboardList, DoorOpen, LayoutGrid, List, Pencil, Plus, Search, Stethoscope, UserCheck, Users } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { humanizeError, postCall } from "@/services/frappe";
import { Empty, Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { hhmm } from "@/utils/dates";
import { Editor, KINDS } from "./MastersPage";

interface Sched { day: string; start_time: string; end_time: string; branch?: string }
interface Doc {
  name: string; doctor_name: string; doctor_name_ur?: string; specialization?: string; department?: string; doctor_type: string; branch?: string;
  default_fee: number; follow_up_fee: number; consultation_room?: string; color?: string; photo?: string; is_active: number; qualification?: string;
  registration_no?: string; user?: string; schedule: Sched[]; today: { total: number; waiting: number; with_doctor: number; done: number };
  upcoming: number; leave: { from: string; to: string; reason?: string } | null; on_leave: boolean; works_today: boolean; dept_color?: string;
  month_visits: number; month_revenue: number;
}
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TODAY = DAYS[(new Date().getDay() + 6) % 7];
const hm = hhmm;
const rs = (v: number) => `Rs ${Math.round(v || 0).toLocaleString("en-PK")}`;
const initials = (n: string) => n.replace(/^Dr\.?\s*/i, "").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
/** Card band: the doctor's colour fading into a deep navy-teal (works in light and dark). */
const band = (c?: string) => `linear-gradient(135deg, ${c || "#0d9488"} 0%, color-mix(in srgb, ${c || "#0d9488"} 60%, #0b2530) 100%)`;

function status(d: Doc): { label: string; cls: string } {
  if (!d.is_active) return { label: "Inactive", cls: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300" };
  if (d.on_leave) return { label: "On leave", cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" };
  if (d.works_today) return { label: "Available today", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
  return { label: "Off today", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" };
}

export default function DoctorsPage() {
  const { branch, can, hasRole } = useAuth();
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [view, setView] = useState<"cards" | "list">(() => { try { return (localStorage.getItem("hv.doctors.view") as "cards" | "list") || "cards"; } catch { return "cards"; } });
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("");
  const [type, setType] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [edit, setEdit] = useState<string | null>(null);
  const [leaveFor, setLeaveFor] = useState<Doc | null>(null);
  const { data, isLoading } = useApi<Doc[]>("doctors.board", { branch }, { refetchInterval: 60_000 });
  const all = data ?? [];
  const specs = useMemo(() => [...new Set(all.map((d) => d.specialization).filter(Boolean))].sort() as string[], [all]);
  const shown = all.filter((d) => (!activeOnly || d.is_active) && (!spec || d.specialization === spec) && (!type || d.doctor_type === type)
    && (!q || `${d.doctor_name} ${d.doctor_name_ur ?? ""} ${d.specialization ?? ""} ${d.consultation_room ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const setV = (v: "cards" | "list") => { setView(v); try { localStorage.setItem("hv.doctors.view", v); } catch { /* ignore */ } };
  const refresh = () => void qc.invalidateQueries({ queryKey: ["doctors.board"] });
  const name = (d: Doc) => (i18n.language === "ur" && d.doctor_name_ur ? d.doctor_name_ur : d.doctor_name);
  const canEdit = hasRole("PW Admin", "PW Receptionist");
  const actions = (d: Doc) => ({
    book: can("/appointments") ? () => nav(`/appointments`) : undefined,
    queue: can("/physician-queue") ? () => nav(`/physician-queue`) : undefined,
    edit: canEdit ? () => setEdit(d.name) : undefined,
    leave: canEdit ? () => setLeaveFor(d) : undefined,
  });

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Doctors" icon={Stethoscope} color="from-teal-600 to-cyan-700" subtitle={`${branch} · ${all.filter((d) => d.is_active).length} active`}
        actions={canEdit && <Button variant="primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" />New doctor</Button>} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Doctors" value={all.filter((d) => d.is_active).length} hint={`${specs.length} specialities`} icon={Stethoscope} tone="teal" />
        <StatCard label="Available today" value={all.filter((d) => d.is_active && d.works_today && !d.on_leave).length} icon={UserCheck} tone="blue" />
        <StatCard label="On leave" value={all.filter((d) => d.on_leave).length} hint={`${all.filter((d) => d.leave && !d.on_leave).length} upcoming`} icon={CalendarOff} tone="rose" />
        <StatCard label={t("Waiting")} value={all.reduce((s, d) => s + d.today.waiting, 0)} hint={`${all.reduce((s, d) => s + d.today.total, 0)} patients today`} icon={Users} tone="amber" />
        <StatCard label="Bookings · 7 days" value={all.reduce((s, d) => s + d.upcoming, 0)} icon={CalendarClock} tone="violet" />
      </div>

      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/90 p-2 shadow-sm backdrop-blur">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3">
          <Search className="h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, speciality or room" className="h-10 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-10 w-44 rounded-lg border border-input bg-[hsl(var(--input-bg))] px-3 text-sm outline-none focus:border-primary"><option value="">All types</option><option>Internal</option><option>Visiting</option><option>External Referring</option></select>
        <label className="flex items-center gap-2 px-2 text-sm"><input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="h-4 w-4 accent-teal-600" />Active only</label>
        <div className="ms-auto flex rounded-xl bg-muted p-1">
          {([["cards", LayoutGrid, "Cards"], ["list", List, "List"]] as const).map(([k, I, l]) => (
            <button key={k} onClick={() => setV(k)} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", view === k ? "bg-card shadow-sm" : "text-muted-foreground")}><I className="h-4 w-4" />{l}</button>))}
        </div>
        <div className="flex w-full gap-1.5 overflow-x-auto pb-0.5">
          <button onClick={() => setSpec("")} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", !spec ? "bg-gradient-to-r from-teal-600 to-emerald-500 text-white" : "bg-muted hover:bg-accent")}>All specialities</button>
          {specs.map((s) => <button key={s} onClick={() => setSpec(s === spec ? "" : s)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", spec === s ? "bg-gradient-to-r from-teal-600 to-emerald-500 text-white" : "bg-muted hover:bg-accent")}>{s}</button>)}
        </div>
      </div>

      {isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-3xl" />)}</div>
        : !shown.length ? <Empty title="No doctors match" hint="Clear the filters or add a doctor." icon={Stethoscope} />
        : view === "cards" ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((d) => <DoctorCard key={d.name} d={d} name={name(d)} {...actions(d)} />)}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gradient-to-r from-teal-700 to-emerald-600 text-start text-xs uppercase tracking-wide text-white">
                <th className="px-4 py-3 text-start">{t("Doctor")}</th><th className="text-start">Speciality</th><th className="text-start">{t("Room")}</th>
                <th className="text-end">{t("Fee")}</th><th className="px-3 text-start">Week</th><th className="text-end">{t("Today")}</th><th className="text-end">30 days</th>
                <th className="px-3 text-start">Status</th><th className="px-3" /></tr></thead>
              <tbody>{shown.map((d) => {
                const st = status(d);
                const a = actions(d);
                return (
                  <tr key={d.name} className={cn("border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40", !d.is_active && "opacity-60")}>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-3"><Avatar d={d} size={40} />
                      <div className="min-w-0"><div className="truncate font-semibold">{name(d)}</div><div className="truncate text-xs text-muted-foreground">{d.qualification}{d.registration_no ? ` · ${d.registration_no}` : ""}</div></div></div></td>
                    <td><div className="font-medium">{d.specialization}</div><div className="text-xs text-muted-foreground">{d.doctor_type}</div></td>
                    <td className="text-muted-foreground">{d.consultation_room || "–"}</td>
                    <td className="text-end tabular-nums"><div className="font-bold">{rs(d.default_fee)}</div><div className="text-xs text-muted-foreground">F/U {rs(d.follow_up_fee)}</div></td>
                    <td className="px-3"><WeekStrip schedule={d.schedule} small color={d.color} /></td>
                    <td className="text-end tabular-nums"><b>{d.today.total}</b> <span className="text-xs text-muted-foreground">({d.today.waiting} waiting)</span></td>
                    <td className="text-end tabular-nums">{d.month_visits}</td>
                    <td className="px-3"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>{st.label}</span></td>
                    <td className="px-3"><div className="flex justify-end gap-1">
                      {a.book && <IconBtn title="Book" icon={CalendarPlus} onClick={a.book} />}{a.queue && <IconBtn title="Queue" icon={ClipboardList} onClick={a.queue} />}
                      {a.leave && <IconBtn title="Leave" icon={CalendarOff} onClick={a.leave} />}{a.edit && <IconBtn title="Edit" icon={Pencil} onClick={a.edit} />}</div></td>
                  </tr>);
              })}</tbody>
            </table></div>
          </div>
        )}

      {edit && <Dialog open onClose={() => setEdit(null)} title={edit === "new" ? "New doctor" : "Edit doctor"} size="lg">
        <Editor kind={KINDS.find((k) => k.key === "doctors")!} name={edit} onClose={() => setEdit(null)} onSaved={() => { refresh(); if (edit === "new") setEdit(null); }} />
      </Dialog>}
      {leaveFor && <LeaveDialog d={leaveFor} onClose={() => setLeaveFor(null)} onDone={() => { setLeaveFor(null); refresh(); }} />}
    </div>
  );
}

function DoctorCard({ d, name, book, queue, edit, leave }: { d: Doc; name: string; book?: () => void; queue?: () => void; edit?: () => void; leave?: () => void }) {
  const { t } = useTranslation();
  const st = status(d);
  const todays = d.schedule.filter((s) => s.day === TODAY);
  const load = d.today.total ? Math.round((d.today.done / d.today.total) * 100) : 0;
  return (
    <article className={cn("group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl", !d.is_active && "opacity-70")}>
      <div className="relative h-24" style={{ background: band(d.color) }}>
        <div className="absolute -end-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-xl" />
        <div className="absolute -bottom-12 start-1/3 h-24 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between p-3 text-white">
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur">{d.specialization || "General"}</span>
          {d.consultation_room && <span className="flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur"><DoorOpen className="h-3 w-3" />{d.consultation_room}</span>}
        </div>
      </div>
      <div className="relative -mt-10 flex flex-col items-center px-4 text-center">
        <div className="rounded-full bg-card p-1 shadow-lg"><Avatar d={d} size={76} /></div>
        <span className={cn("mt-2 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", st.cls)}>{st.label}</span>
        <h3 className="mt-1.5 line-clamp-1 text-lg font-bold">{name}</h3>
        {d.doctor_name_ur && name !== d.doctor_name_ur && <div className="font-urdu text-sm leading-relaxed text-muted-foreground">{d.doctor_name_ur}</div>}
        <div className="line-clamp-1 text-xs text-muted-foreground">{d.qualification}</div>
        {d.registration_no && <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><BadgeCheck className="h-3 w-3 text-teal-600" />{d.registration_no}</div>}
      </div>

      <div className="mx-4 mt-3 grid grid-cols-2 overflow-hidden rounded-2xl border border-border">
        <div className="bg-gradient-to-br from-teal-50 to-emerald-50 p-2.5 text-center dark:from-teal-500/10 dark:to-emerald-500/5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("Fee")}</div>
          <div className="text-lg font-extrabold tabular-nums text-teal-700 dark:text-teal-300">{rs(d.default_fee)}</div></div>
        <div className="border-s border-border p-2.5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("Follow-up")}</div>
          <div className="text-lg font-extrabold tabular-nums">{rs(d.follow_up_fee)}</div></div>
      </div>

      <div className="mx-4 mt-3">
        <WeekStrip schedule={d.schedule} color={d.color} />
        <div className="mt-1.5 text-center text-[11px] text-muted-foreground">
          {d.on_leave && d.leave ? <span className="font-semibold text-rose-600">On leave until {d.leave.to}{d.leave.reason ? ` · ${d.leave.reason}` : ""}</span>
            : todays.length ? <>Today {todays.map((s) => `${hm(s.start_time)}–${hm(s.end_time)}`).join(", ")}</>
            : d.leave ? <span className="text-amber-600">Leave from {d.leave.from}</span> : "No clinic today"}
        </div>
      </div>

      <div className="mx-4 mt-3 grid grid-cols-3 gap-2 text-center">
        {([["Waiting", d.today.waiting, "text-amber-600"], ["With doctor", d.today.with_doctor, "text-violet-600"], ["Done", d.today.done, "text-emerald-600"]] as const).map(([l, v, c]) => (
          <div key={l} className="rounded-xl bg-muted/70 py-1.5"><div className={cn("text-base font-extrabold tabular-nums", c)}>{v}</div><div className="text-[10px] text-muted-foreground">{t(l)}</div></div>))}
      </div>
      <div className="mx-4 mt-2">
        <div className="h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all" style={{ width: `${load}%` }} /></div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{d.month_visits} visits · 30 days</span><span>{d.upcoming} booked · 7 days</span></div>
      </div>

      <div className="mt-auto grid grid-cols-4 gap-1 border-t border-border p-2 pt-2">
        <CardAction icon={CalendarPlus} label="Book" onClick={book} />
        <CardAction icon={ClipboardList} label="Queue" onClick={queue} />
        <CardAction icon={CalendarOff} label="Leave" onClick={leave} />
        <CardAction icon={Pencil} label="Edit" onClick={edit} />
      </div>
    </article>
  );
}

function WeekStrip({ schedule, small, color }: { schedule: Sched[]; small?: boolean; color?: string }) {
  return (
    <div className={cn("flex", small ? "gap-0.5" : "justify-between gap-1")}>
      {DAYS.map((day) => {
        const on = schedule.filter((s) => s.day === day);
        const today = day === TODAY;
        return (
          <span key={day} title={on.length ? `${day}: ${on.map((s) => `${hm(s.start_time)}–${hm(s.end_time)}`).join(", ")}` : `${day}: off`}
            className={cn("flex items-center justify-center rounded-full font-bold", small ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs",
              on.length ? "text-white shadow-sm" : "bg-muted text-muted-foreground/70", today && "ring-2 ring-offset-2 ring-offset-card ring-amber-400")}
            style={on.length ? { background: band(color) } : undefined}>{day[0]}</span>);
      })}
    </div>
  );
}

function Avatar({ d, size }: { d: Doc; size: number }) {
  const style = { width: size, height: size, fontSize: size * 0.34 };
  return d.photo ? <img src={d.photo} alt="" style={style} className="rounded-full object-cover" />
    : <span style={{ ...style, background: band(d.color) }} className="flex items-center justify-center rounded-full font-extrabold text-white">{initials(d.doctor_name)}</span>;
}

function CardAction({ icon: I, label, onClick }: { icon: typeof Pencil; label: string; onClick?: () => void }) {
  return (
    <button disabled={!onClick} onClick={onClick} className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30">
      <I className="h-4 w-4" />{label}</button>
  );
}

function IconBtn({ icon: I, title, onClick }: { icon: typeof Pencil; title: string; onClick: () => void }) {
  return <button title={title} onClick={onClick} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><I className="h-4 w-4" /></button>;
}

function LeaveDialog({ d, onClose, onDone }: { d: Doc; onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await postCall("frappe.client.insert", { doc: JSON.stringify({ doctype: "Doctor Leave", doctor: d.name, from_date: from, to_date: to, reason, branch: d.branch }) });
      toast.success("Leave saved — free slots on those days are blocked"); onDone();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Leave · ${d.doctor_name}`} description="Free appointment slots on these days are blocked; existing bookings stay for reception to move." size="sm">
      <div className="grid grid-cols-2 gap-3"><Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></div>
      <Field label="Reason" className="mt-3"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Conference, personal…" /></Field>
      <Button variant="primary" className="mt-4 w-full" loading={busy} onClick={() => void save()}><CalendarOff className="h-4 w-4" />Save leave</Button>
    </Dialog>
  );
}
