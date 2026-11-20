/**
 * Radiology worklist (RIS, D-91 C1): today's (or any range of) studies with priority, status, TAT and the next action for the
 * signed-in role — register & token, bill, start scan (safety / pregnancy / consent), complete with image-quality check, report,
 * print, deliver. New walk-in / ward / phone orders from here. Live via hv:radiology realtime.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertOctagon, BarChart3, BookOpen, CheckCircle2, ClipboardCheck, Clock3, CreditCard, FilePenLine, Disc3, Plus, Printer, RefreshCw, ScanLine, Search, Send,
  ShieldAlert, ShieldCheck, Stethoscope, UserCheck, Wrench, XCircle,
} from "lucide-react";
import { call, useAction, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, PageHeader, PatientPicker, StatCard, type PatientHit } from "@/components/common";
import { ShiftNotice } from "@/components/common/ShiftNotice";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { age, hm, Modal, openPdf, PRIORITY_BAR, PriorityTag, rs, SAFETY_TONE, StatusBadge, TatDot, useRadLive, type Ctx, type Row } from "./shared";

const MODALITIES = ["X-Ray", "Ultrasound", "Doppler", "MRI", "CT"] as const;
const SAFETY_MODS = ["MRI", "CT"];

const today = () => new Date().toISOString().slice(0, 10);

export default function WorklistPage() {
  const { branch, hasRole } = useAuth();
  const nav = useNavigate();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [modality, setModality] = useState("");
  const [status, setStatus] = useState("");
  const [rad, setRad] = useState("");
  const [q, setQ] = useState("");
  const [machine, setMachine] = useState("");
  const params = { date: from, to_date: to, modality, status, radiologist: rad, q: q.trim() || undefined, branch, machine: machine || undefined };
  const { data: rows, refetch, isFetching } = useApi<Row[]>("radiology.worklist", params, { refetchInterval: 60_000 });
  const { data: ctx } = useApi<Ctx>("radiology.context");
  useRadLive(["radiology.worklist"]);
  const [act, setAct] = useState<{ kind: "start" | "complete" | "bill" | "cancel" | "deliver" | "safety" | "clear" | "tech"; row: Row } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const register = useAction<Row>("radiology.register", { success: (r) => `Registered · token ${(r as unknown as { token_no: string }).token_no}`, onSuccess: () => void refetch() });

  const isFront = hasRole("PW Receptionist");
  const isRoom = hasRole("PW Radiographer", "PW Sonographer", "PW Radiologist", "PW MRI Technologist", "PW CT Technologist");
  const isRad = hasRole("PW Radiologist");
  const list = rows ?? [];
  const k = useMemo(() => ({
    total: list.filter((r) => !["Cancelled", "No Show"].includes(r.status)).length,
    waiting: list.filter((r) => ["Booked", "Registered"].includes(r.status)).length,
    room: list.filter((r) => r.status === "In Progress").length,
    toReport: list.filter((r) => ["Scanned", "Reporting"].includes(r.status)).length,
    overdue: list.filter((r) => r.tat === "red" && !["Verified", "Delivered"].includes(r.status)).length,
    critical: list.filter((r) => r.critical_finding).length,
  }), [list]);

  const next = (r: Row) => {
    const b: React.ReactNode[] = [];
    if (r.status === "Booked" && (isFront || isRoom)) b.push(<Button key="reg" size="sm" variant="outline" onClick={() => register.mutate({ name: r.name })}><UserCheck className="h-4 w-4" />Register</Button>);
    if (["Booked", "Registered"].includes(r.status) && isFront && ["Unpaid", "Panel Pending"].includes(r.payment_status)) b.push(<Button key="bill" size="sm" variant="outline" onClick={() => setAct({ kind: "bill", row: r })}><CreditCard className="h-4 w-4" />Bill</Button>);
    const sOpen = !!r.safety_status && r.safety_status !== "Not required" && ["Booked", "Registered"].includes(r.status);
    if (sOpen && (isFront || isRoom)) b.push(<Button key="saf" size="sm" variant="outline" onClick={() => setAct({ kind: "safety", row: r })}><ShieldCheck className="h-4 w-4" />Safety</Button>);
    if (r.safety_status === "Clearance required" && isRad) b.push(<Button key="clr" size="sm" variant="submit" onClick={() => setAct({ kind: "clear", row: r })}><ShieldAlert className="h-4 w-4" />Clear</Button>);
    if (SAFETY_MODS.includes(r.modality) && ["In Progress", "Scanned"].includes(r.status) && isRoom) b.push(<Button key="tech" size="sm" variant="outline" onClick={() => setAct({ kind: "tech", row: r })} aria-label="Technologist record"><Wrench className="h-4 w-4" /></Button>);
    if (["Registered", "Booked"].includes(r.status) && isRoom) b.push(<Button key="start" size="sm" onClick={() => setAct({ kind: "start", row: r })}><ScanLine className="h-4 w-4" />Start</Button>);
    if (r.status === "In Progress" && isRoom) b.push(<Button key="done" size="sm" onClick={() => setAct({ kind: "complete", row: r })}><ClipboardCheck className="h-4 w-4" />Complete</Button>);
    if (["Scanned", "Reporting", "Verified", "Delivered", "In Progress"].includes(r.status) && isRoom) b.push(<Button key="rep" size="sm" variant={["Scanned", "Reporting"].includes(r.status) && isRad ? "submit" : "outline"} onClick={() => nav(`/radiology/report/${r.name}`)}><FilePenLine className="h-4 w-4" />{["Verified", "Delivered"].includes(r.status) ? "Open" : "Report"}</Button>);
    if (["Verified", "Delivered"].includes(r.status)) b.push(<Button key="pdf" size="sm" variant="outline" onClick={() => openPdf(r.name)} aria-label="Print report"><Printer className="h-4 w-4" /></Button>);
    if (r.status === "Verified" && (isFront || isRoom)) b.push(<Button key="del" size="sm" variant="outline" onClick={() => setAct({ kind: "deliver", row: r })}><Send className="h-4 w-4" />Deliver</Button>);
    if (["Booked", "Registered"].includes(r.status) && (isFront || isRad)) b.push(<Button key="x" size="sm" variant="ghost" onClick={() => setAct({ kind: "cancel", row: r })} aria-label="Cancel"><XCircle className="h-4 w-4" /></Button>);
    return b;
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Radiology worklist" icon={ScanLine} subtitle={<>X-ray · Ultrasound · Doppler · MRI · CT — {from === to ? new Date(from + "T00:00").toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long" }) : `${from} → ${to}`}</>}
        actions={<>
          {isRad && <Link to="/radiology/analytics"><Button variant="outline" size="sm"><BarChart3 className="h-4 w-4" />Analytics</Button></Link>}
          {isRad && <Link to="/radiology/catalogue"><Button variant="outline" size="sm"><BookOpen className="h-4 w-4" />Catalogue</Button></Link>}
          <Button variant="outline" size="sm" onClick={() => void refetch()} aria-label="Refresh"><RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /></Button>
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" />New study</Button>
        </>} />
      {isFront && <ShiftNotice className="mb-3" />}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Studies" value={k.total} icon={ScanLine} onClick={() => setStatus("")} />
        <StatCard label="Waiting" value={k.waiting} icon={Clock3} tone="slate" onClick={() => setStatus("Registered")} />
        <StatCard label="In the room" value={k.room} icon={Stethoscope} tone="violet" onClick={() => setStatus("In Progress")} />
        <StatCard label="To report" value={k.toReport} icon={FilePenLine} tone="amber" onClick={() => setStatus("Scanned")} />
        <StatCard label="Overdue" value={k.overdue} icon={Clock3} tone="rose" hint="past report due time" />
        <StatCard label="Critical" value={k.critical} icon={AlertOctagon} tone="rose" />
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3">
        <Field label="From" className="w-36"><input type="date" className={inputCls} value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></Field>
        <Field label="To" className="w-36"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Modality" className="w-36"><select className={inputCls} value={modality} onChange={(e) => setModality(e.target.value)}><option value="">All</option>{MODALITIES.map((m) => <option key={m}>{m}</option>)}</select></Field>
        {!!ctx?.machines?.length && <Field label="Machine" className="w-32"><select className={inputCls} value={machine} onChange={(e) => setMachine(e.target.value)}><option value="">All</option>{ctx.machines.map((m) => <option key={m}>{m}</option>)}</select></Field>}
        <Field label="Status" className="w-40"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="Open">Open (not reported)</option>
          {["Booked", "Registered", "In Progress", "Scanned", "Reporting", "Verified", "Delivered", "Cancelled", "No Show"].map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Radiologist" className="w-44"><select className={inputCls} value={rad} onChange={(e) => setRad(e.target.value)}><option value="">All</option>{(ctx?.radiologists ?? []).map((r) => <option key={r.name} value={r.name}>{r.doctor_name}</option>)}</select></Field>
        <label className="relative min-w-56 flex-1"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={cn(inputCls, "ps-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, MR no., booking ID, phone" aria-label="Search" /></label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="w-1 p-0" /><th className="px-3 py-2.5 text-start">Time / token</th><th className="px-3 text-start">Patient</th><th className="px-3 text-start">Scan</th><th className="px-3 text-start">Priority</th>
                <th className="px-3 text-start">Status</th><th className="px-3 text-start">Payment</th><th className="px-3 text-start">TAT · radiologist</th><th className="px-3 text-end">Action</th></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.name} className={cn("border-t border-border/60 align-middle transition hover:bg-muted/30", r.critical_finding && "bg-rose-50/70 dark:bg-rose-500/[0.07]", ["Cancelled", "No Show"].includes(r.status) && "opacity-55")}>
                  <td className="p-0"><span className={cn("block h-14 w-1", PRIORITY_BAR[r.priority])} /></td>
                  <td className="px-3 py-2.5"><div className="whitespace-nowrap font-semibold tabular-nums">{r.walk_in ? "Walk-in" : hm(r.slot_time)}</div>
                    <div className="text-xs text-muted-foreground">{r.token_no ? <b className="text-foreground">{r.token_no}</b> : r.booking_source}{from !== to ? ` · ${r.scheduled_date.slice(5)}` : ""}</div></td>
                  <td className="max-w-[200px] px-3"><button onClick={() => nav(`/radiology/report/${r.name}`)} className="block truncate text-start font-semibold hover:text-primary">{r.patient_name}</button>
                    <div className="truncate text-xs text-muted-foreground">{age(r)} · {r.patient || "not registered"} · <span className="font-mono">{r.booking_ref}</span></div></td>
                  <td className="max-w-[210px] px-3"><div className="truncate font-medium">{r.procedure_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.modality}{r.machine ? ` · ${r.machine}` : ""}{r.contrast_used ? " · contrast" : ""}{r.ward_location ? ` · ${r.ward_location}` : ""}{r.referring_name || r.external_referrer ? ` · ref ${r.referring_name || r.external_referrer}` : ""}</div></td>
                  <td className="px-3"><PriorityTag p={r.priority} /></td>
                  <td className="px-3"><div className="flex flex-wrap items-center gap-1"><StatusBadge s={r.status} />{r.critical_finding ? <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">CRITICAL</span> : null}
                    {r.safety_status && r.safety_status !== "Not required" ? <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", SAFETY_TONE[r.safety_status] ?? "bg-muted")} title="MRI / contrast safety">{r.safety_status === "Clearance required" ? "SAFETY BLOCK" : `Safety: ${r.safety_status}`}</span> : null}
                    {r.copy_requested ? <span title="Printed copy / CD requested" className="text-muted-foreground"><Disc3 className="h-3.5 w-3.5" /></span> : null}</div>
                    {r.report_status !== "Not Started" && !["Verified", "Delivered"].includes(r.status) && <div className="mt-0.5 text-[11px] text-muted-foreground">Report: {r.report_status}</div>}</td>
                  <td className="px-3"><span className={cn("text-xs font-semibold", r.payment_status === "Paid" || r.payment_status === "Panel Approved" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>{r.payment_status}</span>
                    <div className="text-[11px] text-muted-foreground">{rs(r.amount)}{r.counter_receipt ? <> · <span className="font-mono">{r.counter_receipt}</span></> : null}</div></td>
                  <td className="px-3"><TatDot t={r.tat} due={r.expected_at} />{r.radiologist_name && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.radiologist_name}</div>}</td>
                  <td className="px-3"><div className="flex flex-wrap justify-end gap-1.5">{next(r)}</div></td>
                </tr>))}
            </tbody>
          </table>
        </div>
        {rows && !list.length && <div className="p-6"><Empty title="No studies" hint="Change the filters, or add a walk-in with New study." icon={ScanLine} /></div>}
      </div>

      {act?.kind === "start" && <StartModal r={act.row} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {act?.kind === "complete" && <CompleteModal r={act.row} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {act?.kind === "bill" && <BillModal r={act.row} panels={ctx?.panels ?? []} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {act?.kind === "cancel" && <CancelModal r={act.row} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {act?.kind === "deliver" && <DeliverModal r={act.row} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {act?.kind === "safety" && <SafetyModal r={act.row} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {act?.kind === "clear" && <ClearModal r={act.row} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {act?.kind === "tech" && <TechModal r={act.row} machines={ctx?.machines ?? []} onClose={() => setAct(null)} onDone={() => { setAct(null); void refetch(); }} />}
      {newOpen && ctx && <NewStudy ctx={ctx} onClose={() => setNewOpen(false)} onDone={() => { setNewOpen(false); void refetch(); }} />}
    </div>
  );
}

function StartModal({ r, onClose, onDone }: { r: Row; onClose: () => void; onDone: () => void }) {
  const [preg, setPreg] = useState("");
  const [consent, setConsent] = useState(false);
  const [safety, setSafety] = useState(true);
  const [override, setOverride] = useState("");
  const go = useAction("radiology.start", { success: "Scan started", onSuccess: onDone });
  const xray = r.modality === "X-Ray";
  const askPreg = r.gender === "Female" && (!r.age || (r.age >= 12 && r.age <= 50));
  return (
    <Modal title={`Start · ${r.procedure_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button>
      <Button disabled={go.isPending} onClick={() => go.mutate({ name: r.name, consent: consent ? 1 : 0, safety: safety ? 1 : 0, pregnancy_status: preg || undefined, override: override || undefined })}><ScanLine className="h-4 w-4" />Start scan</Button></>}>
      <div className="mb-4 rounded-xl bg-muted/50 p-3 text-sm"><b>{r.patient_name}</b> · {age(r)} · {r.booking_ref}{r.priority !== "Routine" && <> · <PriorityTag p={r.priority} /></>}</div>
      <div className="space-y-3">
        <label className="flex items-center gap-3 rounded-xl border border-border p-3"><input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm"><b>Safety screening done</b> — identity confirmed (name + MR), metal removed, gown{xray ? ", lead shield placed" : ""}.</span></label>
        {askPreg && <Field label="Pregnancy check (female 12-50 y)" required={xray}>
          <div className="grid grid-cols-3 gap-2">{["Not pregnant", "Pregnant", "Possibly pregnant"].map((s) => <button key={s} type="button" onClick={() => setPreg(s)} className={cn("rounded-lg border px-2 py-2 text-xs font-semibold", preg === s ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{s}</button>)}</div></Field>}
        {xray && askPreg && preg && preg !== "Not pregnant" && <Field label="Radiologist's go-ahead (required to X-ray a pregnant patient)"><textarea className={cn(inputCls, "h-20 py-2")} value={override} onChange={(e) => setOverride(e.target.value)} placeholder="e.g. Dr. Saima Javed approved — trauma, abdomen shielded" /></Field>}
        <label className="flex items-center gap-3 rounded-xl border border-border p-3"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm"><b>Written / verbal consent taken</b> — required for contrast studies, TVS and guided procedures.</span></label>
        {["Unpaid", "Panel Pending"].includes(r.payment_status) && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">Not billed yet — only {r.priority === "Emergency" ? "allowed because this is an emergency" : "emergencies may be scanned before billing"}.</p>}
      </div>
    </Modal>
  );
}

function CompleteModal({ r, onClose, onDone }: { r: Row; onClose: () => void; onDone: () => void }) {
  const [ok, setOk] = useState(true);
  const [note, setNote] = useState("");
  const [films, setFilms] = useState(r.modality === "X-Ray" ? "1 film" : "");
  const go = useAction("radiology.complete_scan", { success: ok ? "Scan complete — sent for reporting" : "Marked for repeat", onSuccess: onDone });
  return (
    <Modal title={`Complete · ${r.procedure_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button>
      <Button variant={ok ? "submit" : "danger"} disabled={go.isPending || (!ok && !note.trim())} onClick={() => go.mutate({ name: r.name, qc_passed: ok ? 1 : 0, qc_note: note || undefined, films: films || undefined })}>
        <CheckCircle2 className="h-4 w-4" />{ok ? "Complete & send to radiologist" : "Repeat the scan"}</Button></>}>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOk(true)} className={cn("rounded-xl border-2 p-4 text-start", ok ? "border-emerald-500 bg-emerald-500/10" : "border-border")}><b className="block">Image quality OK</b><span className="text-xs text-muted-foreground">Positioning, exposure, coverage, no motion</span></button>
        <button type="button" onClick={() => setOk(false)} className={cn("rounded-xl border-2 p-4 text-start", !ok ? "border-rose-500 bg-rose-500/10" : "border-border")}><b className="block">Repeat needed</b><span className="text-xs text-muted-foreground">Patient stays; the reason is logged</span></button>
      </div>
      <Field label={ok ? "Note for the radiologist (optional)" : "Reason for repeat"} className="mt-4"><textarea className={cn(inputCls, "h-20 py-2")} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <Field label="Films / CD" className="mt-3"><input className={inputCls} value={films} onChange={(e) => setFilms(e.target.value)} placeholder="e.g. 2 films, CD" /></Field>
    </Modal>
  );
}

function BillModal({ r, panels, onClose, onDone }: { r: Row; panels: string[]; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState("Cash");
  const [panel, setPanel] = useState("");
  const [policy, setPolicy] = useState("");
  const isPanel = r.payment_option === "Insurance / Panel";
  const bill = useAction("radiology.bill", { success: "Billed", onSuccess: onDone });
  const setP = useAction("radiology.set_panel", { success: "Panel set" });
  return (
    <Modal title={`Bill · ${r.procedure_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button>
      <Button variant="submit" disabled={bill.isPending} onClick={async () => { if (panel && !isPanel) await setP.mutateAsync({ name: r.name, panel, policy_no: policy }); bill.mutate({ name: r.name, payment_mode: mode }); }}>
        <CreditCard className="h-4 w-4" />{isPanel || panel ? "Bill to panel" : `Collect ${rs(r.amount)}`}</Button></>}>
      <div className="mb-4 flex items-baseline justify-between rounded-xl bg-muted/50 p-4"><span><b>{r.patient_name}</b><span className="block text-xs text-muted-foreground">{r.booking_ref} · {r.payment_option}</span></span><span className="text-2xl font-extrabold tabular-nums">{rs(r.amount)}</span></div>
      {!isPanel && <Field label="Payment mode"><div className="grid grid-cols-3 gap-2">{["Cash", "Card", "Bank Transfer"].map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={cn("rounded-lg border px-2 py-2 text-sm font-semibold", mode === m ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{m}</button>)}</div></Field>}
      <details className="mt-4 rounded-xl border border-border p-3" open={isPanel}><summary className="cursor-pointer text-sm font-semibold">Panel / insurance instead</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Panel / insurer"><select className={inputCls} value={panel} onChange={(e) => setPanel(e.target.value)}><option value="">{isPanel ? "(as booked)" : "—"}</option>{panels.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Policy / employee no."><input className={inputCls} value={policy} onChange={(e) => setPolicy(e.target.value)} /></Field></div></details>
      <p className="mt-3 text-xs text-muted-foreground">Counter payments post to your open cashier shift (billing type General); panel bills go to the panel's account.</p>
    </Modal>
  );
}

function CancelModal({ r, onClose, onDone }: { r: Row; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [noShow, setNoShow] = useState(false);
  const go = useAction("radiology.cancel", { success: noShow ? "Marked no-show" : "Cancelled", onSuccess: onDone });
  return (
    <Modal title={`Cancel · ${r.patient_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Keep</Button><Button variant="danger" disabled={!reason.trim() || go.isPending} onClick={() => go.mutate({ name: r.name, reason, no_show: noShow ? 1 : 0 })}>Confirm</Button></>}>
      <div className="mb-3 grid grid-cols-2 gap-2">{[false, true].map((v) => <button key={String(v)} type="button" onClick={() => setNoShow(v)} className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", noShow === v ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{v ? "No-show" : "Cancel"}</button>)}</div>
      <Field label="Reason" required><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Patient request / not prepared / duplicate" /></Field>
    </Modal>
  );
}

function DeliverModal({ r, onClose, onDone }: { r: Row; onClose: () => void; onDone: () => void }) {
  const [via, setVia] = useState("Printed copy");
  const go = useAction("radiology.deliver", { success: "Delivered", onSuccess: onDone });
  return (
    <Modal title={`Hand over · ${r.procedure_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="outline" onClick={() => openPdf(r.name)}><Printer className="h-4 w-4" />Print</Button><Button variant="submit" onClick={() => go.mutate({ name: r.name, via })}><Send className="h-4 w-4" />Mark delivered</Button></>}>
      <div className="grid gap-2">{["Printed copy", "Printed copy + films", "CD with images", "Handed to ward", "Sent to referring doctor"].map((v) => <button key={v} type="button" onClick={() => setVia(v)} className={cn("rounded-xl border-2 px-4 py-3 text-start text-sm font-semibold", via === v ? "border-primary bg-primary/10" : "border-border")}>{v}</button>)}</div>
      <p className="mt-3 text-xs text-muted-foreground">The patient was sent the report-ready alert with the portal link when the report was signed.</p>
    </Modal>
  );
}

function NewStudy({ ctx, onClose, onDone }: { ctx: Ctx; onClose: () => void; onDone: () => void }) {
  const [p, setP] = useState<PatientHit | null>(null);
  const [proc, setProc] = useState("");
  const [priority, setPriority] = useState("Routine");
  const [source, setSource] = useState("Walk-in");
  const [ward, setWard] = useState("");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const pr = ctx.procedures.find((x) => x.name === proc);
  const submit = async () => {
    if (!p || !proc) return;
    setBusy(true);
    try { await call("radiology.create", { data: JSON.stringify({ patient: p.name, procedure: proc, priority, source, ward_location: ward, referring_doctor: ref || undefined, clinical_notes: notes, walk_in: 1, date: today() }) }); onDone(); }
    catch (e) { (await import("react-hot-toast")).default.error((await import("@/services/frappe")).humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="New imaging study" onClose={onClose} wide footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" disabled={!p || !proc || busy} onClick={() => void submit()}><Plus className="h-4 w-4" />Create</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Patient" required className="md:col-span-2"><PatientPicker value={p} onPick={setP} onClear={() => setP(null)} autoFocus placeholder="Search name, MR no., phone or CNIC" /></Field>
        <Field label="Scan" required className="md:col-span-2"><select className={inputCls} value={proc} onChange={(e) => setProc(e.target.value)}><option value="">Choose…</option>
          {MODALITIES.map((m) => <optgroup key={m} label={m}>{ctx.procedures.filter((x) => x.modality === m && (!x.female_only || p?.gender !== "Male")).map((x) => <option key={x.name} value={x.name}>{x.procedure_name} — {rs(x.price)}</option>)}</optgroup>)}</select></Field>
        <Field label="Priority"><div className="grid grid-cols-3 gap-2">{["Routine", "Urgent", "Emergency"].map((x) => <button key={x} type="button" onClick={() => setPriority(x)} className={cn("rounded-lg border px-2 py-2 text-sm font-semibold", priority === x ? (x === "Emergency" ? "border-rose-600 bg-rose-600 text-white" : x === "Urgent" ? "border-amber-500 bg-amber-500 text-white" : "border-primary bg-primary text-primary-foreground") : "border-border")}>{x}</button>)}</div></Field>
        <Field label="Source"><select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>{["Walk-in", "OPD", "Ward / ICU", "Phone", "WhatsApp"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        {(source === "Ward / ICU" || /portable/i.test(proc)) && <Field label="Ward / bed (portable)"><input className={inputCls} value={ward} onChange={(e) => setWard(e.target.value)} placeholder="ICU · Bed I-03" /></Field>}
        <Field label="Referring doctor"><select className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)}><option value="">—</option>{ctx.doctors.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select></Field>
        <Field label="Clinical notes / indication" className="md:col-span-2"><textarea className={cn(inputCls, "h-20 py-2")} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      {pr && <p className="mt-3 text-xs text-muted-foreground">{pr.modality} · {pr.duration_min} min · report due {pr.tat_hours} h after the scan{pr.needs_consent ? " · consent required" : ""}.</p>}
    </Modal>
  );
}

interface StudyFull { safety_questions: { question: string; blocking: number }[]; safety_answers?: { question: string; answer: string; detail?: string }[]; creatinine?: number; egfr?: number;
  creatinine_date?: string; weight_kg?: number; consent_signer?: string; consent_signature?: string; sedation_consent?: number; safety_status?: string; clearance_note?: string;
  contrast?: string; contrast_used?: number; protocol?: string; contrast_agent?: string; contrast_volume?: number; contrast_batch?: string; sedation_given?: number; ctdi?: number; dlp?: number;
  image_count?: number; pacs_url?: string; machine?: string }

/** MRI / contrast safety questionnaire + consent signature (D-98). Blocking "Yes / Not sure" answers hold the scan until a radiologist clears it. */
function SafetyModal({ r, onClose, onDone }: { r: Row; onClose: () => void; onDone: () => void }) {
  const { data } = useApi<StudyFull>("radiology.study", { name: r.name });
  const [ans, setAns] = useState<Record<string, { answer: string; detail: string }>>({});
  const [kid, setKid] = useState({ creatinine: "", egfr: "", creatinine_date: "", weight_kg: "" });
  const [signer, setSigner] = useState(r.patient_name);
  const [sedation, setSedation] = useState(false);
  const sig = useRef<SigHandle>(null);
  useEffect(() => {
    if (!data) return;
    setAns(Object.fromEntries((data.safety_answers ?? []).map((a) => [a.question, { answer: a.answer, detail: a.detail ?? "" }])));
    setKid({ creatinine: data.creatinine ? String(data.creatinine) : "", egfr: data.egfr ? String(data.egfr) : "", creatinine_date: data.creatinine_date ?? "", weight_kg: data.weight_kg ? String(data.weight_kg) : "" });
    if (data.consent_signer) setSigner(data.consent_signer);
    setSedation(!!data.sedation_consent);
  }, [data]);
  const qs = data?.safety_questions ?? [];
  const contrast = !!data && (data.contrast === "Yes" || data.contrast === "Optional" || !!data.contrast_used);
  const go = useAction("radiology.save_safety", { success: "Safety screening saved", onSuccess: onDone });
  const flagged = qs.some((x) => x.blocking && ["Yes", "Not sure"].includes(ans[x.question]?.answer ?? ""));
  const all = qs.every((x) => ans[x.question]?.answer);
  return (
    <Modal title={`Safety screening · ${r.procedure_name}`} onClose={onClose} wide footer={<><Button variant="outline" onClick={onClose}>Close</Button>
      <Button variant="submit" disabled={!data || !all || go.isPending} onClick={() => go.mutate({ name: r.name, answers: JSON.stringify(qs.map((x) => ({ question: x.question, answer: ans[x.question]?.answer || "No", detail: ans[x.question]?.detail || "" }))),
        creatinine: kid.creatinine || undefined, egfr: kid.egfr || undefined, creatinine_date: kid.creatinine_date || undefined, weight_kg: kid.weight_kg || undefined,
        signature: sig.current?.dataUrl() || undefined, signer: signer || undefined, sedation_consent: sedation ? 1 : 0 })}><ShieldCheck className="h-4 w-4" />Save screening</Button></>}>
      <div className="mb-3 rounded-xl bg-muted/50 p-3 text-sm"><b>{r.patient_name}</b> · {age(r)} · {r.booking_ref}{r.safety_status ? <span className={cn("ms-2 rounded-full px-2 py-0.5 text-[11px] font-bold", SAFETY_TONE[r.safety_status])}>{r.safety_status}</span> : null}</div>
      {data?.clearance_note && <p className="mb-3 rounded-xl bg-emerald-500/10 p-3 text-sm">Radiologist clearance: {data.clearance_note}</p>}
      <div className="space-y-2">{qs.map((x) => { const a = ans[x.question]; return (
        <div key={x.question} className={cn("rounded-xl border p-2.5", x.blocking && a && a.answer !== "No" ? "border-rose-400 bg-rose-500/5" : "border-border")}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><span className="flex-1 text-sm">{x.question}{x.blocking ? <span className="ms-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">BLOCKING</span> : null}</span>
            <div className="flex gap-1">{["No", "Yes", "Not sure"].map((v) => <button key={v} type="button" onClick={() => setAns({ ...ans, [x.question]: { answer: v, detail: a?.detail ?? "" } })}
              className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold", a?.answer === v ? (v === "No" ? "border-emerald-600 bg-emerald-600 text-white" : "border-amber-600 bg-amber-600 text-white") : "border-border")}>{v}</button>)}</div></div>
          {a && a.answer !== "No" && <input className={cn(inputCls, "mt-2")} placeholder="Details" value={a.detail} onChange={(e) => setAns({ ...ans, [x.question]: { ...a, detail: e.target.value } })} />}
        </div>); })}</div>
      {flagged && <p className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm font-medium text-rose-800 dark:text-rose-200">A blocking answer is flagged — the scan stays blocked until a radiologist records clearance.</p>}
      {contrast && <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Field label="Creatinine (mg/dL)"><input className={inputCls} value={kid.creatinine} onChange={(e) => setKid({ ...kid, creatinine: e.target.value })} inputMode="decimal" /></Field>
        <Field label="eGFR"><input className={inputCls} value={kid.egfr} onChange={(e) => setKid({ ...kid, egfr: e.target.value })} inputMode="numeric" /></Field>
        <Field label="Test date"><input type="date" className={inputCls} value={kid.creatinine_date} onChange={(e) => setKid({ ...kid, creatinine_date: e.target.value })} /></Field>
        <Field label="Weight (kg)"><input className={inputCls} value={kid.weight_kg} onChange={(e) => setKid({ ...kid, weight_kg: e.target.value })} inputMode="numeric" /></Field></div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Consent signed by (patient / guardian)"><input className={inputCls} value={signer} onChange={(e) => setSigner(e.target.value)} /></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={sedation} onChange={(e) => setSedation(e.target.checked)} className="h-4 w-4" />Sedation consent</label>
      </div>
      <div className="mt-2"><div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Signature</span><button type="button" className="text-primary" onClick={() => sig.current?.clear()}>Clear</button></div>
        <SigPad ref={sig} />{data?.consent_signature && <p className="mt-1 text-xs text-muted-foreground">A signature is already on file — sign again only to replace it.</p>}</div>
    </Modal>
  );
}

function ClearModal({ r, onClose, onDone }: { r: Row; onClose: () => void; onDone: () => void }) {
  const { data } = useApi<StudyFull>("radiology.study", { name: r.name });
  const [note, setNote] = useState("");
  const go = useAction("radiology.clear_safety", { success: "Cleared — the scan can start", onSuccess: onDone });
  const flagged = (data?.safety_answers ?? []).filter((a) => a.answer !== "No");
  return (
    <Modal title={`Radiologist clearance · ${r.patient_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button>
      <Button variant="submit" disabled={note.trim().length < 5 || go.isPending} onClick={() => go.mutate({ name: r.name, note })}><ShieldCheck className="h-4 w-4" />Clear for scan</Button></>}>
      <div className="mb-3 text-sm">{r.procedure_name} · {r.booking_ref}</div>
      <ul className="mb-3 space-y-1.5">{flagged.map((a) => <li key={a.question} className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm"><b>{a.answer}</b> — {a.question}{a.detail ? <span className="block text-xs text-muted-foreground">{a.detail}</span> : null}</li>)}
        {data?.egfr ? <li className="rounded-lg bg-muted px-3 py-2 text-sm">eGFR {data.egfr}{data.creatinine ? ` · creatinine ${data.creatinine}` : ""}</li> : null}</ul>
      <Field label="Decision — what was checked and why it is safe" required><textarea className={cn(inputCls, "h-24 py-2")} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. MRI-conditional pacemaker (card seen), cardiology informed, device in MRI mode" /></Field>
    </Modal>
  );
}

/** Technologist record: protocol, contrast (agent / volume / batch), sedation, CT dose (CTDIvol / DLP), images, PACS link, machine. */
function TechModal({ r, machines, onClose, onDone }: { r: Row; machines: string[]; onClose: () => void; onDone: () => void }) {
  const { data } = useApi<StudyFull>("radiology.study", { name: r.name });
  const [f, setF] = useState<Record<string, string | number>>({});
  useEffect(() => { if (data) setF({ protocol: data.protocol ?? "", contrast_used: data.contrast_used ?? 0, contrast_agent: data.contrast_agent ?? "", contrast_volume: data.contrast_volume ?? "", contrast_batch: data.contrast_batch ?? "",
    sedation_given: data.sedation_given ?? 0, ctdi: data.ctdi ?? "", dlp: data.dlp ?? "", image_count: data.image_count ?? "", pacs_url: data.pacs_url ?? "", machine: data.machine ?? r.machine ?? "" }); }, [data, r.machine]);
  const go = useAction("radiology.tech_record", { success: "Technologist record saved", onSuccess: onDone });
  const set = (k: string, v: string | number) => setF({ ...f, [k]: v });
  const ct = r.modality === "CT";
  const txt = (k: string) => String(f[k] ?? "");
  return (
    <Modal title={`Technologist record · ${r.procedure_name}`} onClose={onClose} wide footer={<><Button variant="outline" onClick={onClose}>Close</Button>
      <Button variant="submit" disabled={!data || go.isPending} onClick={() => go.mutate({ name: r.name, data: JSON.stringify(f) })}><Wrench className="h-4 w-4" />Save</Button></>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Machine"><select className={inputCls} value={txt("machine")} onChange={(e) => set("machine", e.target.value)}><option value="">—</option>{machines.filter((m) => m.startsWith(ct ? "CT" : "MRI")).map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Protocol / sequences"><input className={inputCls} value={txt("protocol")} onChange={(e) => set("protocol", e.target.value)} placeholder={ct ? "e.g. Non-contrast axial 5 mm, KUB low dose" : "e.g. Sag T1/T2, Ax T2, STIR"} /></Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={!!Number(f.contrast_used)} onChange={(e) => set("contrast_used", e.target.checked ? 1 : 0)} className="h-4 w-4" />Contrast given</label>
        {!!Number(f.contrast_used) && <>
          <Field label="Contrast agent" required><input className={inputCls} value={txt("contrast_agent")} onChange={(e) => set("contrast_agent", e.target.value)} placeholder={ct ? "Iohexol 350" : "Gadoterate"} /></Field>
          <Field label="Volume (mL)"><input className={inputCls} value={txt("contrast_volume")} onChange={(e) => set("contrast_volume", e.target.value)} inputMode="decimal" /></Field>
          <Field label="Batch / lot no." required><input className={inputCls} value={txt("contrast_batch")} onChange={(e) => set("contrast_batch", e.target.value)} /></Field></>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!Number(f.sedation_given)} onChange={(e) => set("sedation_given", e.target.checked ? 1 : 0)} className="h-4 w-4" />Sedation given</label>
        {ct && <><Field label="CTDIvol (mGy)"><input className={inputCls} value={txt("ctdi")} onChange={(e) => set("ctdi", e.target.value)} inputMode="decimal" /></Field>
          <Field label="DLP (mGy·cm)"><input className={inputCls} value={txt("dlp")} onChange={(e) => set("dlp", e.target.value)} inputMode="decimal" /></Field></>}
        <Field label="Images / series"><input className={inputCls} value={txt("image_count")} onChange={(e) => set("image_count", e.target.value)} inputMode="numeric" /></Field>
        <Field label="PACS / viewer link" className="md:col-span-2"><input className={inputCls} value={txt("pacs_url")} onChange={(e) => set("pacs_url", e.target.value)} placeholder="https://…" /></Field>
      </div>
    </Modal>
  );
}

interface SigHandle { dataUrl: () => string | null; clear: () => void }
/** Minimal pointer signature pad — returns a PNG data URL only once something was drawn. */
const SigPad = forwardRef<SigHandle>(function SigPad(_p, ref) {
  const c = useRef<HTMLCanvasElement>(null);
  const drawn = useRef(false);
  const down = useRef(false);
  useImperativeHandle(ref, () => ({
    dataUrl: () => (drawn.current && c.current ? c.current.toDataURL("image/png") : null),
    clear: () => { const x = c.current?.getContext("2d"); if (x && c.current) x.clearRect(0, 0, c.current.width, c.current.height); drawn.current = false; },
  }));
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const b = e.currentTarget.getBoundingClientRect(); return [(e.clientX - b.left) * (e.currentTarget.width / b.width), (e.clientY - b.top) * (e.currentTarget.height / b.height)]; };
  return <canvas ref={c} width={600} height={150} className="h-[120px] w-full touch-none rounded-xl border border-dashed border-border bg-white" aria-label="Signature pad"
    onPointerDown={(e) => { down.current = true; e.currentTarget.setPointerCapture(e.pointerId); const x = e.currentTarget.getContext("2d")!; const [px, py] = pos(e); x.lineWidth = 2.5; x.lineCap = "round"; x.strokeStyle = "#111"; x.beginPath(); x.moveTo(px, py); }}
    onPointerMove={(e) => { if (!down.current) return; const x = e.currentTarget.getContext("2d")!; const [px, py] = pos(e); x.lineTo(px, py); x.stroke(); drawn.current = true; }}
    onPointerUp={() => { down.current = false; }} />;
});
