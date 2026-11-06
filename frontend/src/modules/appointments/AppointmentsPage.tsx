import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BellRing, CalendarClock, CalendarDays, CalendarPlus, Check, CheckCheck, Clock, ExternalLink, FilePlus2, Globe, LayoutGrid, List, MessageCircle, Moon, Paperclip, Phone, RotateCcw, Sun, UserRound, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, getCall, humanizeError, useAction, useApi } from "@/lib/api";
import { Empty, Field, inputCls, PatientPicker, Pill, Section, Tabs, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { hhmm, todayISO } from "@/utils/dates";
import { useRealtime } from "@/lib/realtime";
import { CalendarView, type CalView, type Preset, type Shift } from "./CalendarView";
import { cn } from "@/utils/cn";

interface Appt { name: string; patient?: string; patient_name: string; phone: string; doctor: string; doctor_name: string; start_time: string; status: string; source_channel: string;
  booking_ref: string; fee: number; payment_channel: string; payment_status: string; payment_proof?: string; opd_slip?: string; is_new_patient: number; message_failed: boolean;
  new_patient_age?: number; new_patient_gender?: string;
  priority?: string;
  last_message?: { name: string; event: string; status: string; channel: string; error?: string; creation: string } | null }

export default function AppointmentsPage() {
  const { boot, branch } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [date, setDate] = useState(todayISO());
  const [channel, setChannel] = useState<"" | "Reception" | "Web" | "WhatsApp" | "Requests">("");
  const [book, setBook] = useState(!!params.get("patient"));
  const [preset, setPreset] = useState<Preset | null>(null);
  type View = "list" | "cards" | CalView;
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem("hv.appt.view") as View) || "week"; } catch { return "week"; } });
  const changeView = (v: View) => { setView(v); try { localStorage.setItem("hv.appt.view", v); } catch { /* ignore */ } };
  const isCal = view !== "list" && view !== "cards";
  const [shift, setShiftState] = useState<Shift>(() => { try { return (localStorage.getItem("hv.appt.shift") as Shift) || "all"; } catch { return "all"; } });
  const setShift = (v: Shift) => { setShiftState(v); try { localStorage.setItem("hv.appt.shift", v); } catch { /* ignore */ } };
  const dayStart = boot?.shifts?.day_start ?? "07:00:00";
  const nightStart = boot?.shifts?.night_start ?? "17:00:00";
  const inShift = (tm?: string) => { if (shift === "all") return true; const x = hhmm(tm); if (!x) return shift === "day"; const day = x >= hhmm(dayStart) && x < hhmm(nightStart); return shift === "day" ? day : !day; };
  const { data } = useApi<{ rows: Appt[]; stats: { source_channel: string; status: string; n: number }[] }>("appointments.board",
    { date, branch, channel: channel && channel !== "Requests" ? channel : undefined, status: channel === "Requests" ? "Pending" : undefined }, { refetchInterval: 30_000 });
  const status = useAction<Appt>("appointments.set_status", { invalidate: ["appointments.board"],
    success: (r) => (r.status === "Confirmed" ? "Confirmed — WhatsApp confirmation sent" : r.status === "Rejected" ? "Rejected — patient informed" : "Updated") });
  const resend = useAction<{ status: string; event: string }>("appointments.resend_message", { invalidate: ["appointments.board"],
    success: (r) => `${r.event.replace("appointment_", "")} message ${r.status ? r.status.toLowerCase() : "skipped"}` });
  useRealtime(boot?.site, ["hv:appointment_request"], (d) => {
    const x = d as { patient_name: string; phone: string; doctor: string; date: string; time: string; source: string };
    try { const c = new AudioContext(); const o = c.createOscillator(); const g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 740; g.gain.setValueAtTime(0.15, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8); o.start(); o.stop(c.currentTime + 0.8); } catch { /* audio blocked */ }
    toast(`New ${x.source} request: ${x.patient_name} (${x.phone}) · ${x.doctor} · ${x.date} ${x.time}`, { icon: "🔔", duration: 8000 });
    void qc.invalidateQueries({ queryKey: ["appointments.board"] });
  });
  const pendingCount = (data?.stats ?? []).filter((s) => s.status === "Pending").reduce((a, s) => a + s.n, 0);
  const byStatus = (st: string) => (data?.stats ?? []).filter((s) => s.status === st).reduce((a, s) => a + s.n, 0);
  const total = (data?.stats ?? []).reduce((a, s) => a + s.n, 0);
  const allRows = data?.rows ?? [];
  const rows = allRows.filter((r) => inShift(r.start_time));
  const count = (c: string) => (data?.stats ?? []).filter((s) => s.source_channel === c).reduce((a, s) => a + s.n, 0);
  const arrive = async (a: Appt) => {
    try {
      await call("appointments.set_status", { name: a.name, status: "Arrived" });
      void qc.invalidateQueries({ queryKey: ["appointments.board"] });
      if (a.patient) nav(`/opd_slip?patient=${a.patient}`); else nav(`/registration`);
    } catch (e) { toast.error(humanizeError(e)); }
  };
  const RowActions = ({ a }: { a: Appt }) => (
    <div className="flex justify-end gap-1">
                {a.status === "Pending" && <><Button size="xs" variant="submit" onClick={() => status.mutate({ name: a.name, status: "Confirmed" })}><Check className="h-3 w-3" />{t("Confirm")}</Button>
                  <Button size="xs" variant="outline" onClick={() => status.mutate({ name: a.name, status: "Rejected" })}>{t("Reject")}</Button></>}
                {a.status === "Confirmed" && <Button size="xs" variant="primary" onClick={() => void arrive(a)}><FilePlus2 className="h-3 w-3" />{t("Arrived")}</Button>}
                {["Pending", "Confirmed"].includes(a.status) && <Button size="xs" variant="ghost" onClick={() => { const r = prompt("Reason for cancelling"); if (r !== null) status.mutate({ name: a.name, status: "Cancelled", reason: r }); }}><X className="h-3 w-3" /></Button>}
                {a.status === "Arrived" && !a.opd_slip && a.patient && <Button size="xs" variant="outline" onClick={() => nav(`/opd_slip?patient=${a.patient}`)}>{t("OPD slip")}</Button>}
</div>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="relative mb-5 overflow-hidden rounded-3xl bg-[#1b1446] p-5 text-white shadow-lg sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_0%_0%,rgba(139,92,246,0.55),transparent_60%),radial-gradient(600px_300px_at_100%_100%,rgba(20,184,166,0.45),transparent_60%),radial-gradient(500px_250px_at_70%_0%,rgba(56,189,248,0.3),transparent_60%)]" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><CalendarClock className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">{t("Appointments")}</h1>
            <p className="text-sm text-white/75">Reception, web portal and WhatsApp bookings · {new Date(date + "T00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p></div>
          <div className="flex flex-wrap items-center gap-2 [&_button]:border-white/20 [&_.bg-muted]:bg-white/10 [&_.bg-card]:bg-white [&_.bg-card]:text-indigo-900 [&_.text-muted-foreground]:text-white/70">
          <Link to="/appointments/inbox"><Button variant="outline">{t("WhatsApp inbox")}</Button></Link>
          <a href="/hms/book-appointment" target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink className="h-4 w-4" />Web portal</Button></a>
          <Button variant="primary" onClick={() => { setPreset(null); setBook(true); }}><CalendarPlus className="h-4 w-4" />{t("Book appointment")}</Button>
        </div>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2 [&_.bg-muted]:bg-white/10 [&_.bg-card]:bg-white [&_.bg-card]:text-indigo-900 [&_.text-muted-foreground]:text-white/75">
          <div className="flex rounded-xl bg-muted p-1">{([["list", "List", List], ["cards", "Cards", LayoutGrid], ["calendar", "Calendar", CalendarDays]] as const).map(([v, l, I]) => {
            const active = v === "calendar" ? isCal : view === v;
            return <button key={v} onClick={() => changeView(v === "calendar" ? (isCal ? view : "week") : v)} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", active ? "bg-card shadow-sm" : "text-muted-foreground")}><I className="h-4 w-4" />{l}</button>; })}</div>
          <div className="flex rounded-xl bg-muted p-1">{([["all", "All", null], ["day", "Day", Sun], ["night", "Night", Moon]] as const).map(([v, l, I]) => (
            <button key={v} onClick={() => setShift(v)} title={v === "day" ? `${hhmm(dayStart)}–${hhmm(nightStart)}` : v === "night" ? `${hhmm(nightStart)}–${hhmm(dayStart)}` : "All hours"}
              className={cn("flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold", shift === v ? "bg-card shadow-sm" : "text-muted-foreground")}>{I && <I className="h-4 w-4" />}{l}</button>))}</div>
          {!isCal && <input type="date" className="h-9 w-40 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none [color-scheme:dark]" value={date} onChange={(e) => setDate(e.target.value)} />}
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([["Today", total, "bg-white/10"], ["Requests", pendingCount, pendingCount ? "bg-amber-400/30 ring-2 ring-amber-300" : "bg-white/10"], ["Confirmed", byStatus("Confirmed"), "bg-white/10"],
            ["Arrived", byStatus("Arrived") + byStatus("Completed"), "bg-white/10"], ["No-show", byStatus("No-show"), "bg-white/10"], ["Web + WhatsApp", count("Web") + count("WhatsApp"), "bg-white/10"]] as const).map(([l, v, c]) => (
            <div key={l} className={cn("rounded-2xl border border-white/10 p-3 backdrop-blur", c)}><div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{l}</div><div className="text-2xl font-extrabold tabular-nums">{v}</div></div>))}
        </div>
      </div>
      {pendingCount > 0 && channel !== "Requests" && (
        <button onClick={() => setChannel("Requests")} className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-3 text-start text-sm dark:border-amber-500/30 dark:from-amber-500/10 dark:to-orange-500/5">
          <span className="flex h-9 w-9 animate-pulse items-center justify-center rounded-xl bg-amber-500 text-white"><BellRing className="h-4 w-4" /></span>
          <span className="flex-1"><b>{pendingCount} booking request{pendingCount > 1 ? "s" : ""}</b> waiting for reception. Confirming sends the patient a WhatsApp confirmation.</span>
          <span className="font-semibold text-amber-700 dark:text-amber-300">Review →</span></button>)}
      {isCal && <CalendarView view={view as CalView} shift={shift} setView={changeView} onBook={(p) => { setPreset(p); setBook(true); }}
        onOpen={(name) => { const r = rows.find((x) => x.name === name); toast(r ? `${r.patient_name} · ${r.phone} · ${r.status}` : `Appointment ${name}`, { icon: "📅" }); }} />}
      {!isCal && <>
      <div className="mb-3 flex flex-wrap items-center gap-2"><Tabs value={channel} onChange={setChannel} tabs={[{ key: "", label: "All", count: (data?.stats ?? []).reduce((a, s) => a + s.n, 0) },
        { key: "Requests", label: "Requests", count: pendingCount },
        { key: "Reception", label: "Reception", count: count("Reception") }, { key: "Web", label: "Web", count: count("Web") }, { key: "WhatsApp", label: "WhatsApp", count: count("WhatsApp") }]} />
        {shift !== "all" && <span className="ms-auto flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{shift === "day" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          {shift === "day" ? "Day" : "Night"} shift · {rows.length} of {allRows.length}</span>}</div>
      {view === "cards" ? <CardsView rows={rows} actions={(a) => <RowActions a={a} />} msg={(a) => <MsgStatus m={a.last_message} onResend={() => resend.mutate({ name: a.name })} busy={resend.isPending && resend.variables?.name === a.name} />} />
      : <Section>
        {rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Time</th><th className="text-start">{t("Patient")}</th><th className="text-start">{t("Doctor")}</th><th className="text-start">Channel</th><th className="text-start">Payment</th><th className="text-start">Status</th><th className="text-start">WhatsApp</th><th /></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.name} className="border-b border-border/60 last:border-0">
              <td className="py-2.5 font-semibold tabular-nums">{hhmm(a.start_time) || "walk-in"}</td>
              <td><div className="flex items-center gap-1.5 font-medium">{a.patient_name} {a.is_new_patient ? <span className="rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-800">NEW</span> : null}
                {a.priority && a.priority !== "Normal" && <span className={cn("rounded-full px-1.5 text-[10px] font-bold text-white", PRIORITIES.find((x) => x[0] === a.priority)?.[1])}>{a.priority}</span>}</div><div className="text-xs text-muted-foreground">{a.phone} · {a.booking_ref}</div></td>
              <td>{a.doctor_name}</td><td><Pill value={a.source_channel} /></td>
              <td className="text-xs">{a.payment_channel}<div><Pill value={a.payment_status === "Proof Submitted" ? "Pending" : a.payment_status === "Paid" ? "Approved" : undefined} />{a.payment_proof && <a href={a.payment_proof} target="_blank" rel="noreferrer" className="ms-1 inline-flex items-center text-primary"><Paperclip className="h-3 w-3" />proof</a>}</div></td>
              <td><Pill value={a.status} /></td>
              <td><MsgStatus m={a.last_message} onResend={() => resend.mutate({ name: a.name })} busy={resend.isPending && resend.variables?.name === a.name} /></td>
              <td className="text-end"><RowActions a={a} /></td>
            </tr>))}</tbody></table></div> : <Empty title="No appointments" hint="Bookings from reception, the web portal and WhatsApp appear here." icon={CalendarClock} />}
      </Section>}
      </>}
      <BookDialog open={book} preset={preset} onClose={() => setBook(false)} initialPatient={params.get("patient") || undefined} onBooked={() => { setBook(false); void qc.invalidateQueries({ queryKey: ["appointments.board"] }); void qc.invalidateQueries({ queryKey: ["appointments.calendar"] }); }} />
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = { appointment_requested: "Request received", appointment_confirmed: "Confirmation", appointment_rescheduled: "Rescheduled",
  appointment_cancelled: "Cancelled", appointment_rejected: "Rejected", appointment_reminder: "Reminder" };

/** Last WhatsApp/SMS for the booking: what was sent, its delivery state, and Resend. */
function MsgStatus({ m, onResend, busy }: { m?: Appt["last_message"]; onResend: () => void; busy: boolean }) {
  const state = !m ? null : m.status;
  const icon = state === "Read" ? <CheckCheck className="h-3.5 w-3.5 text-sky-500" /> : state === "Delivered" ? <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
    : state === "Sent" ? <Check className="h-3.5 w-3.5 text-muted-foreground" /> : state === "Queued" ? <Clock className="h-3.5 w-3.5 text-amber-500" />
    : state === "Failed" || state === "Skipped" ? <AlertCircle className="h-3.5 w-3.5 text-rose-600" /> : null;
  return (
    <div className="flex items-center gap-1.5">
      {m ? <span title={`${m.channel} · ${m.status}${m.error ? ` · ${m.error}` : ""} · ${m.creation.slice(0, 16)}`} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        state === "Failed" || state === "Skipped" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300")}>
        <MessageCircle className="h-3 w-3" />{EVENT_LABEL[m.event] ?? m.event}{icon}</span> : <span className="text-[11px] text-muted-foreground">No message</span>}
      <button title="Resend to the patient's WhatsApp" disabled={busy} onClick={onResend} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"><RotateCcw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /></button>
    </div>
  );
}

const PRIORITIES = [["Normal", "bg-slate-500"], ["Follow-up", "bg-teal-600"], ["Elderly", "bg-orange-500"], ["Disabled", "bg-blue-600"], ["Urgent", "bg-red-600"]] as const;

interface Suggestion { slot: string; doctor: string; doctor_name: string; date: string; time: string; fee: number; minutes: number; room?: string; load: number }

function BookDialog({ open, onClose, onBooked, initialPatient, preset }: { open: boolean; onClose: () => void; onBooked: () => void; initialPatient?: string; preset?: Preset | null }) {
  const { t } = useTranslation();
  const { branch } = useAuth();
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [mode, setMode] = useState<"doctor" | "any">("doctor");
  const [doctor, setDoctor] = useState("");
  const [spec, setSpec] = useState("");
  const [anyDate, setAnyDate] = useState("");
  const [suggest, setSuggest] = useState<Suggestion | null | undefined>(undefined);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [busy, setBusy] = useState(false);
  const docs = useApi<{ doctors: { name: string; doctor_name: string; specialization?: string; default_fee: number; branch?: string }[] }>("opd.counter_context", { branch }, { enabled: open });
  const dates = useApi<{ slot_date: string; n: number }[]>("appointments.dates", { doctor, branch }, { enabled: mode === "doctor" && !!doctor });
  const slots = useApi<{ name: string; start_time: string }[]>("appointments.slots", { doctor, date, branch }, { enabled: mode === "doctor" && !!doctor && !!date });
  const doctorList = (docs.data?.doctors ?? []).filter((d) => !d.branch || d.branch === branch);
  const specs = [...new Set(doctorList.map((d) => d.specialization).filter(Boolean))] as string[];
  useEffect(() => { if (initialPatient && open) void getCall<PatientHit[]>("hospital_vvs.api.patients.search", { q: initialPatient }).then((r) => r[0] && setPatient(r[0])); }, [initialPatient, open]);
  useEffect(() => { if (open && preset) { setMode("doctor"); setDoctor(preset.doctor); setDate(preset.date); setSlot(preset.slot); } }, [open, preset]);
  useEffect(() => {
    if (mode !== "any" || !spec) { setSuggest(undefined); return; }
    setSuggest(undefined);
    void getCall<Suggestion | null>("hospital_vvs.api.appointments.first_available", { specialization: spec, date: anyDate || undefined, branch }).then((r) => setSuggest(r ?? null));
  }, [mode, spec, anyDate, branch]);
  const chosenSlot = mode === "any" ? suggest?.slot : slot;
  const chosenDoctor = mode === "any" ? suggest?.doctor : doctor;
  const submit = async () => {
    setBusy(true);
    try {
      const a = await call<{ booking_ref: string; doctor_name: string }>("appointments.book", { data: { patient: patient?.name, doctor: chosenDoctor, slot: chosenSlot, branch, priority } });
      toast.success(`Booked · ${a.booking_ref} with ${a.doctor_name} — confirmation sent`); onBooked(); setSlot(""); setSuggest(undefined);
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t("Book appointment")} size="lg">
      <div className="space-y-4">
        <PatientPicker value={patient} onPick={setPatient} onClear={() => setPatient(null)} />
        <div className="grid grid-cols-2 rounded-xl bg-muted p-1">{([["doctor", "Specific doctor"], ["any", "Any available doctor"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={cn("rounded-lg py-2 text-sm font-semibold", mode === k ? "bg-card shadow-sm" : "text-muted-foreground")}>{l}</button>))}</div>
        {mode === "doctor" ? <>
          <Field label="Doctor"><select className={inputCls} value={doctor} onChange={(e) => { setDoctor(e.target.value); setDate(""); setSlot(""); }}><option value="">—</option>
            {doctorList.map((d) => <option key={d.name} value={d.name}>{d.doctor_name} · {d.specialization} · Rs {d.default_fee}</option>)}</select></Field>
          {doctor && <div><div className="mb-1 text-xs font-semibold text-muted-foreground">{t("Choose a date")}</div><div className="flex gap-2 overflow-x-auto pb-1">
            {(dates.data ?? []).map((d) => { const dt = new Date(d.slot_date + "T00:00"); return (
              <button key={d.slot_date} onClick={() => { setDate(d.slot_date); setSlot(""); }} className={cn("min-w-[72px] rounded-xl border p-2 text-center", date === d.slot_date ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                <div className="text-[10px] uppercase">{dt.toLocaleDateString(undefined, { weekday: "short" })}</div><div className="text-lg font-bold">{dt.getDate()}</div><div className="text-[10px] text-muted-foreground">{d.n} free</div></button>); })}
            {dates.data && !dates.data.length && <span className="text-sm text-muted-foreground">No free slots in the booking window.</span>}</div></div>}
          {date && <div><div className="mb-1 text-xs font-semibold text-muted-foreground">{t("Choose a time")}</div><div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {(slots.data ?? []).map((s) => <button key={s.name} onClick={() => setSlot(s.name)} className={cn("rounded-lg border py-2 text-sm font-semibold tabular-nums", slot === s.name ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>{hhmm(s.start_time)}</button>)}</div></div>}
        </> : <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Speciality"><select className={inputCls} value={spec} onChange={(e) => setSpec(e.target.value)}><option value="">—</option>{specs.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Date (empty = soonest)"><input type="date" className={inputCls} value={anyDate} onChange={(e) => setAnyDate(e.target.value)} /></Field>
          </div>
          {spec && (suggest === undefined ? <div className="h-20 animate-pulse rounded-2xl bg-muted" /> : suggest ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-teal-500/5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white"><Check className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><div className="font-bold">{suggest.doctor_name}{suggest.room ? ` · ${suggest.room}` : ""}</div>
                <div className="text-sm">{new Date(suggest.date + "T00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })} at <b>{suggest.time}</b> · {suggest.minutes} min · Rs {suggest.fee.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Earliest free slot on shift · {suggest.load} other booking(s) that day</div></div>
            </div>) : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">No doctor of this speciality has a free slot{anyDate ? " that day" : " in the booking window"}.</p>)}
        </>}
        <div><div className="mb-1 text-xs font-semibold text-muted-foreground">Priority</div>
          <div className="flex flex-wrap gap-2">{PRIORITIES.map(([p, c]) => (
            <button key={p} onClick={() => setPriority(p)} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold", priority === p ? "border-transparent text-white " + c : "border-border")}>
              <span className={cn("h-2 w-2 rounded-full", priority === p ? "bg-white" : c)} />{p}</button>))}</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Today's list and the doctor's queue are arranged by priority (Urgent first, then Elderly/Disabled, Follow-up, Normal). Follow-up is set automatically for returning patients.</p></div>
        <Button variant="primary" className="w-full" disabled={!patient || !chosenSlot} loading={busy} onClick={() => void submit()}>{t("Confirm")}</Button>
        <p className="text-center text-[11px] text-muted-foreground">Reception bookings are confirmed at once and the patient gets a WhatsApp / SMS confirmation.</p>
      </div>
    </Dialog>
  );
}

const STATUS_BAND: Record<string, string> = {
  Pending: "from-amber-400 to-orange-500", Confirmed: "from-sky-500 to-indigo-600", Arrived: "from-violet-500 to-fuchsia-600", Completed: "from-emerald-500 to-teal-600",
  "No-show": "from-rose-500 to-red-600", Cancelled: "from-slate-400 to-slate-500", Rejected: "from-slate-400 to-slate-500",
};

/** Card view: one gradient tile per booking, grouped by hour. */
function CardsView({ rows, actions, msg }: { rows: Appt[]; actions: (a: Appt) => React.ReactNode; msg: (a: Appt) => React.ReactNode }) {
  if (!rows.length) return <Empty title="No appointments" hint="Nothing in this shift for the chosen day." icon={CalendarClock} />;
  const groups: Record<string, Appt[]> = {};
  for (const r of rows) (groups[hhmm(r.start_time).slice(0, 2) || "--"] ??= []).push(r);
  const to12 = (h: string) => (h === "--" ? "Walk-in" : `${((Number(h) + 11) % 12) + 1} ${Number(h) < 12 ? "AM" : "PM"}`);
  return (
    <div className="space-y-5">
      {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([h, list]) => (
        <div key={h}>
          <div className="mb-2 flex items-center gap-2"><span className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-0.5 text-xs font-bold text-white">{to12(h)}</span>
            <span className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">{list.length}</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((a) => { const Ch = a.source_channel === "WhatsApp" ? MessageCircle : a.source_channel === "Web" ? Globe : UserRound; return (
              <article key={a.name} className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <div className={cn("relative flex items-center gap-3 bg-gradient-to-r p-3 text-white", STATUS_BAND[a.status] ?? STATUS_BAND.Confirmed)}>
                  <div className="absolute -end-6 -top-8 h-20 w-20 rounded-full bg-white/15 blur-xl" />
                  <div className="relative text-center"><div className="text-2xl font-black leading-none tabular-nums">{hhmm(a.start_time) || "—"}</div><div className="text-[10px] font-semibold uppercase tracking-wide text-white/80">{a.status}</div></div>
                  <div className="relative ms-auto flex items-center gap-1">
                    {a.priority && a.priority !== "Normal" && <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold backdrop-blur">{a.priority}</span>}
                    <span className="flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold backdrop-blur"><Ch className="h-3 w-3" />{a.source_channel}</span></div>
                </div>
                <div className="flex-1 p-3">
                  <div className="flex items-center gap-1.5 font-bold">{a.patient_name}{a.is_new_patient ? <span className="rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-800">NEW</span> : null}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{a.phone} · <span className="font-mono">{a.booking_ref}</span></div>
                  <div className="mt-2 flex items-center justify-between text-xs"><span className="font-semibold">{a.doctor_name}</span><span className="text-muted-foreground">{a.payment_channel} · {a.payment_status}</span></div>
                  <div className="mt-2">{msg(a)}</div>
                </div>
                <div className="border-t border-border p-2">{actions(a)}</div>
              </article>); })}
          </div>
        </div>))}
    </div>
  );
}
