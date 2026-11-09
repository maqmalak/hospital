import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlarmClock, Bath, BellRing, BarChart3, BedDouble, Droplets, HeartPulse, Megaphone, MessageSquareText, Mic, Radio, Send, Shuffle, Stethoscope, UserRound, Users } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { Empty, Field, inputCls } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { addDaysISO, todayISO } from "@/utils/dates";

const KIND_ICON: Record<string, typeof BellRing> = { Nurse: BellRing, Water: Droplets, Pain: HeartPulse, Bathroom: Bath, Other: Stethoscope };
const mins = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} m`);

interface StationRow { name: string; station_name: string; branch: string; extension?: string; patients: number; unread: number; wards: string[] }
interface BoardRow { name: string; patient: string; patient_name: string; bed_no?: string; ward?: string; unread: number; urgency: string; waiting_seconds: number; overdue: boolean; kinds: string[];
  last?: { direction: string; text: string; creation: string; kind: string } | null }
interface Board { station: string; station_name: string; branch: string; extension?: string; quick_replies: string[]; patients: BoardRow[]; target_minutes: number;
  on_duty: { employee_name: string; shift_type: string; hv_ward: string; hv_is_head_nurse: number }[]; broadcasts: { name: string; text: string; creation: string; recipients: number }[] }
interface Thread { profile: string; patient_name: string; bed_no?: string; ward?: string; admission?: string; messages: { name: string; direction: string; kind: string; urgency: string; text: string; voice: number; creation: string; sender_name?: string; response_seconds?: number }[] }

/** /ns — choose a nursing station. */
export default function StationListPage() {
  const { data } = useApi<StationRow[]>("comms.stations", undefined, { refetchInterval: 10_000 });
  if (!data) return <div className="flex h-60 items-center justify-center"><Spinner size={26} /></div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><h1 className="flex-1 text-2xl font-extrabold">Nursing stations</h1>
        <Link to="/pc-assign"><Button variant="neutral" size="sm"><Shuffle className="h-4 w-4" />Assign patients</Button></Link>
        <Link to="/pc-report"><Button variant="neutral" size="sm"><BarChart3 className="h-4 w-4" />Response times</Button></Link></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.map((s) => (
        <Link key={s.name} to={`/ns/${encodeURIComponent(s.name)}`} className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-sky-600 text-white"><Radio className="h-7 w-7" /></span>
          <span className="min-w-0 flex-1"><b className="block text-lg">{s.station_name}</b><span className="text-xs text-muted-foreground">{s.wards.join(", ") || s.branch}</span>
            <span className="mt-1 block text-xs"><Users className="me-1 inline h-3.5 w-3.5" />{s.patients} patients</span></span>
          {s.unread > 0 && <span className="rounded-full bg-rose-600 px-3 py-1 text-sm font-black text-white">{s.unread}</span>}
        </Link>))}</div>
      {!data.length && <Empty title="No nursing station in your branch" icon={Radio} />}
    </div>
  );
}

/** /ns/:station — live list, thread, reply, broadcast, on-duty nurses. */
export function NursingStationPage() {
  const { station = "" } = useParams();
  const { data: b, refetch } = useApi<Board>("comms.board", { station }, { refetchInterval: 4000 });
  const [sel, setSel] = useState<string | null>(null);
  const [bc, setBc] = useState(false);
  const urgentCount = useMemo(() => (b?.patients ?? []).filter((p) => p.urgency === "Urgent").length, [b]);
  const prevUrgent = useRef(0);
  useEffect(() => { if (urgentCount > prevUrgent.current) chime(); prevUrgent.current = urgentCount; }, [urgentCount]);
  if (!b) return <div className="flex h-60 items-center justify-center"><Spinner size={26} /></div>;
  return (
    <div className="-mt-3 flex h-[calc(100vh-4.25rem)] min-h-0 flex-col gap-3 sm:-mt-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#062a3a] to-[#063a33] p-4 text-white shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Radio className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><h1 className="text-xl font-extrabold">{b.station_name}</h1><div className="text-xs text-white/65">{b.branch}{b.extension ? ` · ext ${b.extension}` : ""} · answer within {b.target_minutes} min</div></div>
          <div className="flex flex-wrap gap-1.5">{b.on_duty.map((n, i) => <span key={i} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ring-white/15">{n.hv_is_head_nurse ? "★ " : ""}{n.employee_name} · {n.shift_type}</span>)}
            {!b.on_duty.length && <span className="text-[11px] text-white/50">No nurse rostered today</span>}</div>
          <Button className="bg-amber-400 text-amber-950 hover:bg-amber-300" onClick={() => setBc(true)}><Megaphone className="h-4 w-4" />Broadcast</Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <section className="min-h-0 overflow-y-auto lg:w-[420px]">
          <div className="space-y-2">{b.patients.map((p) => (
            <button key={p.name} onClick={() => setSel(p.name)} className={cn("flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-start shadow-sm transition-all",
              sel === p.name ? "border-sky-500 ring-2 ring-sky-500/30" : "border-border hover:border-sky-300", p.urgency === "Urgent" && "border-rose-400 bg-rose-50 dark:bg-rose-500/10")}>
              <span className={cn("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-white", p.urgency === "Urgent" ? "animate-pulse bg-rose-600" : p.urgency === "High" ? "bg-amber-500" : p.unread ? "bg-sky-600" : "bg-slate-400")}>
                <BedDouble className="h-4 w-4" /><span className="text-xs font-black">{p.bed_no ?? "—"}</span></span>
              <span className="min-w-0 flex-1"><b className="block truncate">{p.patient_name}</b>
                <span className="block truncate text-xs text-muted-foreground">{p.last ? `${p.last.direction === "From patient" ? "" : "↩ "}${p.last.text}` : "No messages"}</span>
                <span className="mt-0.5 flex flex-wrap gap-1">{p.kinds.map((k) => { const I = KIND_ICON[k] ?? BellRing; return <span key={k} className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700"><I className="h-3 w-3" />{k}</span>; })}
                  {p.waiting_seconds > 0 && <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 text-[10px] font-bold", p.overdue ? "bg-rose-600 text-white" : "bg-amber-100 text-amber-800")}><AlarmClock className="h-3 w-3" />{mins(p.waiting_seconds)}</span>}</span></span>
              {p.unread > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-black text-white">{p.unread}</span>}
            </button>))}
            {!b.patients.length && <Empty title="No admitted patient on this station" icon={BedDouble} />}</div>
        </section>
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
          {sel ? <ThreadView profile={sel} replies={b.quick_replies} onSent={() => void refetch()} /> : <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground"><MessageSquareText className="mb-2 h-10 w-10" />Choose a patient</div>}
        </section>
      </div>
      {bc && <BroadcastDialog station={station} count={b.patients.length} onClose={() => setBc(false)} onDone={() => { setBc(false); void refetch(); }} />}
    </div>
  );
}

function ThreadView({ profile, replies, onSent }: { profile: string; replies: string[]; onSent: () => void }) {
  const { data, refetch } = useApi<Thread>("comms.thread", { profile }, { refetchInterval: 3000 });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages.length]);
  const send = async (body: string) => {
    if (!body.trim()) return;
    setBusy(true);
    try { await call("comms.reply", { profile, text: body }); setText(""); void refetch(); onSent(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  if (!data) return <div className="flex flex-1 items-center justify-center"><Spinner /></div>;
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3"><UserRound className="h-5 w-5 text-sky-600" /><div className="min-w-0 flex-1"><b>{data.patient_name}</b><div className="text-xs text-muted-foreground">Bed {data.bed_no} · {data.ward}</div></div>
        {data.admission && <Link to={`/ipd/${data.admission}`} className="text-xs font-semibold text-sky-700 underline">Open chart</Link>}</div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 p-4">{data.messages.map((m) => { const pt = m.direction === "From patient"; return (
        <div key={m.name} className={cn("flex", pt ? "justify-start" : "justify-end")}>
          <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm", pt ? (m.urgency === "Urgent" ? "bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-100" : "bg-card") : "bg-sky-600 text-white")}>
            {pt && m.kind !== "Message" && <div className="text-[11px] font-black uppercase tracking-wide">{m.kind}</div>}
            {!pt && <div className="text-[11px] font-bold opacity-80">{m.sender_name}</div>}
            <div>{m.voice ? <Mic className="me-1 inline h-3.5 w-3.5 opacity-70" /> : null}{m.text}</div>
            <div className="mt-0.5 text-[10px] opacity-60">{m.creation.slice(11, 16)}{pt && m.response_seconds != null ? ` · answered in ${mins(m.response_seconds)}` : ""}</div></div></div>); })}
        <div ref={end} /></div>
      <div className="border-t border-border p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">{replies.map((r) => <button key={r} disabled={busy} onClick={() => void send(r)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10">{r}</button>)}</div>
        <div className="flex gap-2"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send(text)} placeholder="Reply to the patient" />
          <Button variant="save" loading={busy} disabled={!text.trim()} onClick={() => void send(text)}><Send className="h-4 w-4" />Send</Button></div>
      </div>
    </>
  );
}

function BroadcastDialog({ station, count, onClose, onDone }: { station: string; count: number; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} size="md" title={<span className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-amber-600" />Message to all patients</span>} description={`Shown on every bedside screen of this station (${count} patients).`}>
      <div className="space-y-3"><textarea className={inputCls + " min-h-24"} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Visiting hours end at 8 pm / ملاقات کا وقت رات 8 بجے ختم" autoFocus />
        <Button variant="save" className="w-full" disabled={!text.trim()} loading={busy} onClick={async () => { setBusy(true); try { const r = await call<{ recipients: number }>("comms.broadcast", { station, text }); toast.success(`Sent to ${r.recipients} patients`); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } }}>
          <Megaphone className="h-4 w-4" />Send to all</Button></div>
    </Dialog>
  );
}

/** /pc-assign — move a patient's bedside messages to another station. */
export function AssignPage() {
  const { data, refetch } = useApi<{ profiles: { name: string; patient_name: string; station: string; bed_no?: string; ward?: string }[]; stations: string[] }>("comms.assignments");
  if (!data) return <div className="flex h-60 items-center justify-center"><Spinner size={26} /></div>;
  return (
    <div className="space-y-4"><h1 className="text-2xl font-extrabold">Patient-to-station assignment</h1>
      <div className="overflow-hidden rounded-2xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Patient</th><th className="text-start">Bed</th><th className="px-3 text-start">Station</th></tr></thead>
        <tbody>{data.profiles.map((p) => <tr key={p.name} className="border-t border-border"><td className="px-3 py-2 font-semibold">{p.patient_name}</td><td className="text-xs">{p.bed_no} · {p.ward}</td>
          <td className="px-3 py-1.5"><select className={inputCls + " h-9"} value={p.station ?? ""} onChange={async (e) => { try { await call("comms.set_station", { profile: p.name, station: e.target.value }); toast.success("Moved"); void refetch(); } catch (er) { toast.error(humanizeError(er)); } }}>
            {data.stations.map((s) => <option key={s}>{s}</option>)}</select></td></tr>)}</tbody></table>
        {!data.profiles.length && <div className="p-6 text-center text-sm text-muted-foreground">No admitted patient with bedside messaging.</div>}</div></div>
  );
}

/** /pc-report — response time per station. */
export function ResponseReportPage() {
  const [from, setFrom] = useState(addDaysISO(todayISO(), -6));
  const [to, setTo] = useState(todayISO());
  const { data } = useApi<{ station: string; messages: number; answered: number; unanswered: number; avg_minutes: number | null; median_minutes: number | null; within_target: number | null; kinds: Record<string, number> }[]>("comms.response_report", { from_date: from, to_date: to });
  return (
    <div className="space-y-4"><h1 className="text-2xl font-extrabold">Nurse response times</h1>
      <div className="flex flex-wrap gap-2"><Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(data ?? []).map((s) => (
        <div key={s.station} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><b>{s.station}</b><span className="text-xs text-muted-foreground">{s.messages} calls</span></div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">{[["Average", s.avg_minutes != null ? `${s.avg_minutes} min` : "—"], ["Median", s.median_minutes != null ? `${s.median_minutes} min` : "—"], ["On time", s.within_target != null ? `${s.within_target}%` : "—"]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-muted/50 p-2"><div className="text-[10px] uppercase text-muted-foreground">{l}</div><div className="text-lg font-black">{v}</div></div>))}</div>
          <div className="mt-2 flex flex-wrap gap-1">{Object.entries(s.kinds).map(([k, n]) => <span key={k} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">{k} {n}</span>)}
            {s.unanswered > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">{s.unanswered} unanswered</span>}</div></div>))}</div>
      {data && !data.length && <Empty title="No patient calls in this period" icon={BarChart3} />}
    </div>
  );
}

function chime() {
  try { const a = new AudioContext(); const o = a.createOscillator(); const g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(0.2, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.6); o.start(); o.stop(a.currentTime + 0.6); } catch { /* no audio */ }
}
