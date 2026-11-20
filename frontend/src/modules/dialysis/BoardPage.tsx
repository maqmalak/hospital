/** Dialysis station & shift board (D-99): stations × shifts for a day, colour-coded (Free / Booked / In session / Cleaning / Done / Missed /
 *  Out of service), infection-control zones, payment state, alerts; check-in, assign station, allow unpaid, swaps and new requests. */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Droplets, LogIn, RefreshCw, Repeat2, ShieldAlert, Stethoscope, UserPlus, Users, Wrench } from "lucide-react";
import { useAction, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { type Board, type Cell, type Ctx, fmtDate, Modal, PayChip, RENAL_HEADER, type SessionLite, STATE_DOT, STATE_STYLE, todayPk, useDialysisLive, ZoneChip } from "./shared";

const addDays = (d: string, n: number) => new Date(new Date(d + "T00:00").getTime() + n * 864e5 + 5 * 3600_000).toISOString().slice(0, 10);

export default function BoardPage() {
  const { hasRole } = useAuth();
  const nav = useNavigate();
  const [date, setDate] = useState(todayPk());
  const { data, refetch, isFetching } = useApi<Board>("dialysis.board", { date }, { refetchInterval: 60_000 });
  const ctx = useApi<Ctx>("dialysis.context", undefined, { staleTime: 300_000 }).data;
  useDialysisLive(["dialysis.board"]);
  const lead = hasRole("PW Nephrologist", "PW Dialysis In-charge");
  const [act, setAct] = useState<{ kind: "assign" | "allow" | "swap"; s: SessionLite | Board["swaps"][number] } | null>(null);
  const checkin = useAction("dialysis.checkin", { success: "Checked in", onSuccess: () => void refetch() });
  const all = (data?.stations ?? []).flatMap((s) => Object.values(s.cells)).filter((c) => c.session);
  const alerts = [...all, ...(data?.unplaced ?? []).map((u) => ({ state: "Booked" as const, session: u }))].filter((c) => c.session!.alerts.length);

  const cellClick = (c: Cell) => {
    if (!c.session) return;
    const s = c.session;
    if (s.status === "Scheduled" && s.payment_status === "Unpaid" && lead) return setAct({ kind: "allow", s });
    nav(`/dialysis/session/${s.name}`);
  };

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title="Dialysis unit" icon={Droplets} color={RENAL_HEADER} subtitle={`${fmtDate(date, { weekday: "long", day: "numeric", month: "long" })} · ${data?.stations.length ?? 0} stations · ${data?.shifts.length ?? 3} shifts`}
        actions={<>
          <Link to="/dialysis/patients"><Button variant="outline" size="sm"><Users className="h-4 w-4" />Patients{data?.requests ? <span className="ms-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">{data.requests}</span> : null}</Button></Link>
          <Link to="/nephrology/clinic"><Button variant="outline" size="sm"><Stethoscope className="h-4 w-4" />CKD clinic</Button></Link>
          <Link to="/dialysis/unit"><Button variant="outline" size="sm"><Wrench className="h-4 w-4" />Machines, water &amp; stock</Button></Link>
          {lead && <Link to="/dialysis/reports"><Button variant="outline" size="sm"><BarChart3 className="h-4 w-4" />Reports</Button></Link>}
          <Button variant="outline" size="sm" onClick={() => void refetch()} aria-label="Refresh"><RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /></Button>
        </>} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Booked" value={data?.counts.Scheduled ?? 0} icon={CalendarDays} tone="blue" />
        <StatCard label="In session" value={(data?.counts["In Session"] ?? 0) + (data?.counts["Checked-in"] ?? 0)} icon={Droplets} tone="violet" />
        <StatCard label="Completed" value={data?.counts.Completed ?? 0} icon={Droplets} />
        <StatCard label="Payment pending" value={data?.unpaid ?? 0} icon={AlertTriangle} tone="rose" />
        <StatCard label="Swap requests" value={data?.swaps.length ?? 0} icon={Repeat2} tone="amber" />
        <StatCard label="New requests" value={data?.requests ?? 0} icon={UserPlus} tone="amber" onClick={() => nav("/dialysis/patients?tab=requests")} />
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
        <Field label="Date" className="w-40"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setDate(todayPk())}>Today</Button>
        <div className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {(Object.keys(STATE_STYLE) as Cell["state"][]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full", STATE_DOT[k])} />{k}</span>)}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[820px] border-separate border-spacing-2 text-sm">
            <thead><tr><th className="w-36 text-start text-xs uppercase tracking-wide text-muted-foreground">Station</th>
              {data?.shifts.map((sh) => <th key={sh} className="text-start text-xs uppercase tracking-wide text-muted-foreground">{sh} <span className="font-normal normal-case">{data.shift_times[sh]?.join("–")}</span></th>)}</tr></thead>
            <tbody>{data?.stations.map((st) => (
              <tr key={st.name}>
                <td className={cn("rounded-xl px-2 py-2 align-top", st.zone !== "Negative" && "bg-violet-50 dark:bg-violet-500/10")}>
                  <div className="text-base font-black">{st.station_no}</div><ZoneChip zone={st.zone} />
                  <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{st.machine_serial}</div>
                  {st.status === "Out of service" && <div className="mt-1 text-[10px] font-bold text-rose-600">{st.out_of_service_reason}</div>}
                </td>
                {data.shifts.map((sh) => { const c = st.cells[sh]; const s = c.session; return (
                  <td key={sh} className="align-top">
                    <button type="button" onClick={() => cellClick(c)} disabled={!s}
                      className={cn("min-h-[92px] w-full rounded-xl border-2 p-2 text-start transition hover:shadow-md disabled:cursor-default", STATE_STYLE[c.state])}>
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide"><span className="flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", STATE_DOT[c.state])} />{c.state}</span>
                        {s?.token_no && <span className="font-mono">{s.token_no}</span>}</div>
                      {s && <>
                        <div className="mt-1 line-clamp-1 font-bold">{s.patient_name}</div>
                        <div className="mt-1 flex flex-wrap gap-1"><PayChip status={s.payment_status} />{s.session_type !== "Regular" && <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{s.session_type}</span>}</div>
                        {!!s.alerts.length && <div className="mt-1 line-clamp-2 text-[11px] font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle className="me-0.5 inline h-3 w-3" />{s.alerts.join(" · ")}</div>}
                        {s.status === "Scheduled" && s.payment_status !== "Unpaid" && date === todayPk() && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); checkin.mutate({ name: s.name }); }}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-sky-700"><LogIn className="h-3 w-3" />Check in</span>}
                      </>}
                    </button>
                  </td>); })}
              </tr>))}</tbody>
          </table>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          {!!data?.unplaced.length && <Panel title="Needs a station / ICU bedside" icon={ShieldAlert}>
            <ul className="space-y-1.5">{data.unplaced.map((s) => <li key={s.name} className="flex items-center gap-2 rounded-xl border border-border p-2 text-sm">
              <button className="min-w-0 flex-1 text-start" onClick={() => nav(`/dialysis/session/${s.name}`)}><b className="block truncate">{s.patient_name}</b>
                <span className="text-xs text-muted-foreground">{s.shift} · {s.ward_location || s.session_type} · <ZoneChip zone={s.zone} /></span></button>
              {lead && !s.ward_location && <Button size="sm" variant="outline" onClick={() => setAct({ kind: "assign", s })}>Assign</Button>}</li>)}</ul>
          </Panel>}
          <Panel title={`Swap requests (${data?.swaps.length ?? 0})`} icon={Repeat2}>
            {data?.swaps.length ? <ul className="space-y-1.5">{data.swaps.map((w) => <li key={w.name} className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
              <b>{w.patient_name}</b><div className="text-xs">{fmtDate(w.session_date)} {w.shift} → <b>{fmtDate(w.swap_requested_date)} {w.swap_requested_shift}</b></div>
              <div className="text-xs text-muted-foreground">{w.swap_reason}</div>{lead && <Button size="sm" className="mt-1" onClick={() => setAct({ kind: "swap", s: w })}>Review</Button>}</li>)}</ul>
              : <p className="text-sm text-muted-foreground">None</p>}
          </Panel>
          <Panel title={`Alerts (${alerts.length})`} icon={AlertTriangle}>
            {alerts.length ? <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">{alerts.map((c) => <li key={c.session!.name}><button className="w-full rounded-xl border border-rose-200 bg-rose-50 p-2 text-start text-sm dark:border-rose-500/30 dark:bg-rose-500/10" onClick={() => nav(`/dialysis/session/${c.session!.name}`)}>
              <b>{c.session!.patient_name}</b> <span className="text-xs text-muted-foreground">{c.session!.station} · {c.session!.shift}</span><div className="text-xs text-rose-800 dark:text-rose-200">{c.session!.alerts.join(" · ")}</div></button></li>)}</ul>
              : <p className="text-sm text-muted-foreground">No alerts</p>}
          </Panel>
        </aside>
      </div>
      {act?.kind === "allow" && <AllowModal s={act.s as SessionLite} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {act?.kind === "assign" && ctx && <AssignModal s={act.s as SessionLite} ctx={ctx} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {act?.kind === "swap" && ctx && <SwapModal w={act.s as Board["swaps"][number]} ctx={ctx} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
    </div>
  );
}

function Panel({ title, icon: I, children }: { title: string; icon: typeof Droplets; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="mb-2 flex items-center gap-2 text-sm font-bold"><I className="h-4 w-4 text-sky-600 dark:text-sky-300" />{title}</h2>{children}</section>;
}

function AllowModal({ s, onClose, onDone }: { s: SessionLite; onClose: () => void; onDone: () => void }) {
  const nav = useNavigate();
  const [reason, setReason] = useState("");
  const go = useAction("dialysis.allow_unpaid", { success: "Allowed — the patient can be checked in", onSuccess: onDone });
  return (
    <Modal title={`Payment pending · ${s.patient_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={() => nav(`/dialysis/session/${s.name}`)}>Open session</Button>
      <Button variant="submit" disabled={reason.trim().length < 5 || go.isPending} onClick={() => go.mutate({ name: s.name, reason })}>Allow unpaid</Button></>}>
      <p className="mb-3 text-sm text-muted-foreground">The patient should pay at the Charges Counter (cash, package or panel credit). For a regular or emergency patient the in-charge can allow the session now — the reason is logged and the session stays on the dues list.</p>
      <Field label="Reason" required><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. regular patient, family bringing payment by noon" /></Field>
    </Modal>
  );
}

function AssignModal({ s, ctx, onClose, onDone }: { s: SessionLite; ctx: Ctx; onClose: () => void; onDone: () => void }) {
  const [st, setSt] = useState("");
  const go = useAction("dialysis.assign_station", { success: "Station assigned", onSuccess: onDone });
  const ok = ctx.stations.filter((x) => x.status === "Active" && x.zone === (s.zone || "Negative"));
  return (
    <Modal title={`Assign station · ${s.patient_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" disabled={!st || go.isPending} onClick={() => go.mutate({ name: s.name, station: st })}>Assign</Button></>}>
      <p className="mb-2 text-sm">Zone: <ZoneChip zone={s.zone} /> — only stations of the same infection-control zone are offered (the server checks it too).</p>
      <div className="grid grid-cols-3 gap-2">{ok.map((x) => <button key={x.name} onClick={() => setSt(x.name)} className={cn("rounded-xl border-2 p-3 font-bold", st === x.name ? "border-sky-600 bg-sky-50 dark:bg-sky-500/10" : "border-border")}>{x.station_no}</button>)}</div>
    </Modal>
  );
}

function SwapModal({ w, ctx, onClose, onDone }: { w: Board["swaps"][number]; ctx: Ctx; onClose: () => void; onDone: () => void }) {
  const [station, setStation] = useState("");
  const [reason, setReason] = useState("");
  const ok = useAction("dialysis.move_session", { success: "Swap approved — patient informed", onSuccess: onDone });
  const no = useAction("dialysis.reject_swap", { success: "Swap rejected — patient informed", onSuccess: onDone });
  return (
    <Modal title={`Swap · ${w.patient_name}`} onClose={onClose} footer={<><Button variant="danger" disabled={!reason.trim() || no.isPending} onClick={() => no.mutate({ name: w.name, reason })}>Reject</Button>
      <Button variant="submit" disabled={ok.isPending} onClick={() => ok.mutate({ name: w.name, date: w.swap_requested_date, shift: w.swap_requested_shift, station: station || undefined, reason: w.swap_reason, approve_swap: 1 })}>Approve</Button></>}>
      <p className="mb-3 text-sm">{fmtDate(w.session_date)} {w.shift} → <b>{fmtDate(w.swap_requested_date)} {w.swap_requested_shift}</b><br /><span className="text-muted-foreground">{w.swap_reason}</span></p>
      <Field label="Station on the new day (empty = keep the same)"><select className={inputCls} value={station} onChange={(e) => setStation(e.target.value)}><option value="">Same station</option>{ctx.stations.filter((x) => x.status === "Active").map((x) => <option key={x.name} value={x.name}>{x.station_no} · {x.zone}</option>)}</select></Field>
      <Field label="Reason (needed to reject)" className="mt-3"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
