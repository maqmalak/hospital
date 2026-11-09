import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Ambulance, BedDouble, CheckCircle2, Clock, FlaskConical, HeartPulse, IdCard, LogOut, Merge, Plus, Receipt, Scale, ShieldAlert, Siren, Stethoscope, UserRoundSearch } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { Field, inputCls, PatientPicker, Tabs, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { ChargesTable, LabsPanel, type LabOrder, MedicationPanel, NotesPanel, type Note, type Order, type Dose, type Proc, ProceduresPanel, type Vital, VitalsPanel } from "../ipd/panels";
import { type Ctx, dt, IpdHero, rs } from "../ipd/shared";

interface Visit { name: string; patient: string; patient_name: string; is_unknown: number; arrival_at: string; arrival_mode: string; status: string; triage_level?: string; triage_rank?: number;
  triage_color?: string; chief_complaint?: string; assigned_doctor?: string; doctor_name?: string; bay?: string; bay_no?: string; medico_legal: number; disposition?: string;
  bed_allotment?: string; waiting_minutes: number; pending_labs: number; due_doses: number; pulse?: number; spo2?: number; bp_systolic?: number; bp_diastolic?: number }
interface Board { visits: Visit[]; scale: string; levels: { level: string; rank: number; color: string }[]; bays: { name: string; bed_no: string; status: string; patient_name?: string }[];
  counts: Record<string, number>; untriaged: number }

export default function ErBoardPage() {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  const { data: b } = useApi<Board>("er.board", { branch }, { refetchInterval: 20_000 });
  useRealtime(boot?.site, [`hv:er:${branch}`, `hv:mar:${branch}`, `hv:lab:${branch}`], () => { void qc.invalidateQueries({ queryKey: ["er.board"] }); void qc.invalidateQueries({ queryKey: ["er.visit"] }); });
  const [reg, setReg] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  const active = (b?.visits ?? []).filter((v) => v.status !== "Disposed");
  const done = (b?.visits ?? []).filter((v) => v.status === "Disposed");
  const lanes = [...(b?.levels ?? []), { level: "", rank: 99, color: "#64748b" }];
  return (
    <div className="mx-auto max-w-[1700px]">
      <IpdHero tone="red" icon={Siren} title="Emergency" sub={`${branch} · ${active.length} in the department · triage scale ${b?.scale ?? ""}`}
        actions={<Button className="bg-white text-red-800 hover:bg-white/90" onClick={() => setReg(true)}><Plus className="h-4 w-4" />Register arrival</Button>}>
        <div className="flex flex-wrap gap-2">{(b?.levels ?? []).map((l) => <span key={l.level} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold">
          <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />{l.level}<span className="rounded-full bg-white/20 px-2 tabular-nums">{b?.counts[l.level] ?? 0}</span></span>)}
          {!!b?.untriaged && <span className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-red-800 animate-pulse"><Clock className="h-4 w-4" />{b.untriaged} waiting for triage</span>}
          <span className="ms-auto flex items-center gap-1 text-sm text-white/80"><BedDouble className="h-4 w-4" />Bays free {(b?.bays ?? []).filter((x) => x.status === "Available").length}/{b?.bays.length ?? 0}</span></div>
      </IpdHero>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(lanes.length, 6)}, minmax(220px, 1fr))` }}>
        {lanes.map((l) => { const list = active.filter((v) => (l.level ? v.triage_level === l.level : !v.triage_level)); if (!l.level && !list.length) return null; return (
          <section key={l.level || "none"} className="min-w-0 rounded-2xl border border-border bg-card/60">
            <div className="flex items-center gap-2 rounded-t-2xl px-3 py-2 text-sm font-black text-white" style={{ background: l.color }}>{l.level || "Not triaged"}<span className="ms-auto rounded-full bg-white/25 px-2">{list.length}</span></div>
            <div className="space-y-2 p-2">{list.map((v) => <VisitCard key={v.name} v={v} onOpen={() => setOpen(v.name)} />)}
              {!list.length && <div className="py-6 text-center text-xs text-muted-foreground">—</div>}</div>
          </section>); })}
      </div>
      {done.length > 0 && <section className="mt-5 rounded-2xl border border-border bg-card p-3"><div className="mb-2 text-xs font-bold uppercase text-muted-foreground">Closed in the last 6 hours</div>
        <div className="flex flex-wrap gap-2">{done.map((v) => <button key={v.name} onClick={() => setOpen(v.name)} className="rounded-xl border border-border px-3 py-1.5 text-start text-sm hover:bg-muted">
          <b>{v.patient_name}</b> <span className="text-xs text-muted-foreground">· {v.disposition}{v.bed_allotment ? ` · ${v.bed_allotment}` : ""}</span></button>)}</div></section>}
      {reg && <RegisterDialog levels={b?.levels ?? []} onClose={() => setReg(false)} onDone={(n) => { setReg(false); setOpen(n); }} />}
      {open && <VisitDialog name={open} board={b} onClose={() => setOpen(null)} />}
    </div>
  );
}

function VisitCard({ v, onOpen }: { v: Visit; onOpen: () => void }) {
  const long = v.waiting_minutes > (v.triage_rank === 1 ? 10 : v.triage_rank === 2 ? 30 : 60);
  return (
    <button onClick={onOpen} className="block w-full rounded-xl border border-border bg-card p-3 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ borderInlineStart: `5px solid ${v.triage_color || "#64748b"}` }}>
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="flex items-center gap-1 truncate font-bold">{v.is_unknown ? <UserRoundSearch className="h-4 w-4 text-amber-600" /> : null}{v.patient_name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{v.patient} · {v.arrival_mode}</div></div>
        <span className={cn("rounded-lg px-1.5 py-0.5 text-xs font-black tabular-nums", long ? "bg-rose-600 text-white animate-pulse" : "bg-muted")}>{v.waiting_minutes}′</span></div>
      {v.chief_complaint && <div className="mt-1 line-clamp-2 text-xs">{v.chief_complaint}</div>}
      <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold">
        {v.bay_no && <span className="rounded bg-teal-100 px-1.5 py-0.5 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200">Bay {v.bay_no}</span>}
        <span className={cn("rounded px-1.5 py-0.5", v.doctor_name ? "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200" : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200")}>{v.doctor_name || "No doctor"}</span>
        {v.medico_legal ? <span className="rounded bg-slate-800 px-1.5 py-0.5 text-white">MLC</span> : null}
        {v.pending_labs > 0 && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">labs {v.pending_labs}</span>}
        {v.due_doses > 0 && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">doses {v.due_doses}</span>}
        {(v.pulse || v.spo2) ? <span className="rounded bg-muted px-1.5 py-0.5">{v.pulse ? `P ${v.pulse}` : ""}{v.spo2 ? ` · SpO₂ ${v.spo2}` : ""}{v.bp_systolic ? ` · ${v.bp_systolic}/${v.bp_diastolic}` : ""}</span> : null}
      </div>
    </button>
  );
}

function VitalsInputs({ v, set }: { v: Record<string, string>; set: (k: string, x: string) => void }) {
  return <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">{[["bp_systolic", "BP sys"], ["bp_diastolic", "BP dia"], ["pulse", "Pulse"], ["spo2", "SpO₂"], ["temperature", "Temp"], ["resp_rate", "Resp"], ["gcs", "GCS"]].map(([k, l]) => (
    <label key={k} className="text-[11px] font-semibold text-muted-foreground">{l}<input className={inputCls + " mt-0.5 h-9 text-center"} inputMode="decimal" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></label>))}</div>;
}

function RegisterDialog({ levels, onClose, onDone }: { levels: Board["levels"]; onClose: () => void; onDone: (n: string) => void }) {
  const { branch } = useAuth();
  const [known, setKnown] = useState(true);
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [u, setU] = useState({ gender: "Male", approx_age: "40", description: "" });
  const [f, setF] = useState({ arrival_mode: "Walk-in", brought_by: "", brought_by_phone: "", chief_complaint: "", medico_legal: false, mlc_no: "", police_station: "" });
  const [level, setLevel] = useState("");
  const [vit, setVit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const n = await call<string>("er.register", { data: { branch, patient: known ? patient?.name : undefined, unknown: known ? undefined : { ...u, approx_age: Number(u.approx_age) || 30 },
        ...f, medico_legal: f.medico_legal ? 1 : 0, triage_level: level || undefined, vitals: Object.fromEntries(Object.entries(vit).filter(([, x]) => x !== "")) } });
      toast.success("Registered"); onDone(n);
    } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={<span className="flex items-center gap-2"><Ambulance className="h-5 w-5 text-red-600" />Emergency arrival</span>} description="Minimum data now — complete the record later" size="xl">
      <div className="space-y-3">
        <div className="flex gap-1 rounded-xl bg-muted p-1">{[[true, "Known patient"], [false, "Unknown patient"]].map(([k, l]) => <button key={String(k)} onClick={() => setKnown(k as boolean)}
          className={cn("flex-1 rounded-lg py-2 text-sm font-bold", known === k ? "bg-card shadow" : "text-muted-foreground")}>{l as string}</button>)}</div>
        {known ? <PatientPicker value={patient} onPick={setPatient} onClear={() => setPatient(null)} autoFocus /> : (
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Sex"><div className="flex gap-1">{["Male", "Female", "Other"].map((g) => <button key={g} onClick={() => setU({ ...u, gender: g })}
            className={cn("flex-1 rounded-lg border py-2 text-sm font-semibold", u.gender === g ? "border-red-600 bg-red-600 text-white" : "border-border")}>{g}</button>)}</div></Field>
            <Field label="Approximate age"><input className={inputCls} inputMode="numeric" value={u.approx_age} onChange={(e) => setU({ ...u, approx_age: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Label" hint={`Default: Unknown ${u.gender} ~${u.approx_age}`}><input className={inputCls} value={u.description} onChange={(e) => setU({ ...u, description: e.target.value })} placeholder="e.g. Unknown male, blue shirt" /></Field></div>)}
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Arrived by"><select className={inputCls} value={f.arrival_mode} onChange={(e) => setF({ ...f, arrival_mode: e.target.value })}>
          {["Walk-in", "Ambulance (1122)", "Private ambulance", "Private vehicle", "Police", "Referred"].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Brought by"><input className={inputCls} value={f.brought_by} onChange={(e) => setF({ ...f, brought_by: e.target.value })} /></Field>
          <Field label="Their phone"><input className={inputCls} value={f.brought_by_phone} onChange={(e) => setF({ ...f, brought_by_phone: e.target.value })} /></Field></div>
        <Field label="Chief complaint"><input className={inputCls} value={f.chief_complaint} onChange={(e) => setF({ ...f, chief_complaint: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.medico_legal} onChange={(e) => setF({ ...f, medico_legal: e.target.checked })} /><Scale className="h-4 w-4" />Medico-legal case (record only)</label>
        {f.medico_legal && <div className="grid grid-cols-2 gap-3"><Field label="MLC no."><input className={inputCls} value={f.mlc_no} onChange={(e) => setF({ ...f, mlc_no: e.target.value })} /></Field>
          <Field label="Police station"><input className={inputCls} value={f.police_station} onChange={(e) => setF({ ...f, police_station: e.target.value })} /></Field></div>}
        <Field label="Triage now (optional)"><div className="flex flex-wrap gap-2">{levels.map((l) => <button key={l.level} onClick={() => setLevel(level === l.level ? "" : l.level)}
          className={cn("rounded-xl px-4 py-2 text-sm font-black text-white transition-all", level === l.level ? "ring-4 ring-offset-2 ring-offset-card" : "opacity-60 hover:opacity-100")} style={{ background: l.color, ["--tw-ring-color" as string]: l.color }}>{l.level}</button>)}</div></Field>
        {level && <VitalsInputs v={vit} set={(k, x) => setVit((o) => ({ ...o, [k]: x }))} />}
        <div className="flex justify-end gap-2 border-t border-border pt-3"><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={known && !patient} loading={busy} onClick={() => void save()}><Siren className="h-4 w-4" />Register</Button></div>
      </div>
    </Dialog>
  );
}

interface VisitData extends Visit { chief_complaint?: string; mlc_no?: string; police_station?: string; brought_by?: string; billing_mode: string; sales_invoice?: string; triaged_at?: string;
  notes: Note[]; orders: Order[]; mar: Dose[]; vitals: Vital[]; labs: LabOrder[]; procedures: Proc[];
  charges: { name: string; charge_type: string; description: string; qty: number; rate: number; amount: number; status: string; posted_at: string }[];
  patient_info: { name: string; patient_name: string; gender: string; age?: number; phone?: string; temporary_record: number; merged_into?: string; allergies: { allergy: string }[] } }

function VisitDialog({ name, board, onClose }: { name: string; board?: Board; onClose: () => void }) {
  const { branch, hasRole } = useAuth();
  const qc = useQueryClient();
  const { data: v, refetch } = useApi<VisitData>("er.visit", { name });
  const { data: ctx } = useApi<Ctx>("ipd.context", { branch });
  const [tab, setTab] = useState<"care" | "meds" | "labs" | "vitals" | "notes" | "procedures" | "bill" | "out">("care");
  const [vit, setVit] = useState<Record<string, string>>({});
  const refresh = () => { void refetch(); void qc.invalidateQueries({ queryKey: ["er.board"] }); };
  const act = async (method: string, args: Record<string, unknown>, ok: string) => { try { await call(method, args); toast.success(ok); refresh(); return true; } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); return false; } };
  if (!v) return <Dialog open onClose={onClose} size="xl"><div className="flex h-40 items-center justify-center"><Spinner /></div></Dialog>;
  const closed = v.status === "Disposed";
  const target = v.bed_allotment ? { bed_allotment: v.bed_allotment } : { er_visit: v.name };
  const total = v.charges.reduce((s, c) => s + c.amount, 0);
  return (
    <Dialog open onClose={onClose} size="xl" title={<span className="flex flex-wrap items-center gap-2"><span className="h-4 w-4 rounded-full" style={{ background: v.triage_color || "#64748b" }} />{v.patient_name}
      {v.patient_info.temporary_record ? <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-amber-950">TEMPORARY MR</span> : null}
      {v.medico_legal ? <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-black text-white">MLC {v.mlc_no}</span> : null}</span>}
      description={`${v.name} · ${v.patient} · arrived ${dt(v.arrival_at)} (${v.arrival_mode}) · ${v.status}${v.disposition ? ` · ${v.disposition}` : ""}`}>
      {v.patient_info.allergies.length > 0 && <div className="mb-3 flex items-center gap-2 rounded-xl border-2 border-rose-400 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><ShieldAlert className="h-4 w-4" />Allergies: {v.patient_info.allergies.map((a) => a.allergy).join(", ")}</div>}
      <div className="mb-3 overflow-x-auto"><Tabs value={tab} onChange={setTab} tabs={[{ key: "care", label: "Triage & team" }, { key: "meds", label: "Medicines", count: v.orders.length || undefined },
        { key: "labs", label: "Labs", count: v.labs.length || undefined }, { key: "vitals", label: "Vitals" }, { key: "notes", label: "Notes", count: v.notes.length || undefined },
        { key: "procedures", label: "Procedures" }, { key: "bill", label: `Bill ${rs(total)}` }, { key: "out", label: "Disposition" }]} /></div>
      <div className="max-h-[62vh] overflow-y-auto pe-1">
        {tab === "care" && <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-border p-3"><h3 className="flex items-center gap-2 text-sm font-bold"><HeartPulse className="h-4 w-4 text-red-600" />Triage {v.triaged_at && <span className="font-normal text-muted-foreground">· {dt(v.triaged_at)}</span>}</h3>
            <div className="flex flex-wrap gap-2">{(board?.levels ?? []).map((l) => <button key={l.level} disabled={closed} onClick={() => void act("er.triage", { name: v.name, level: l.level,
              vitals: Object.fromEntries(Object.entries(vit).filter(([, x]) => x !== "")) }, `Triage ${l.level}`)} className={cn("rounded-xl px-4 py-2 text-sm font-black text-white", v.triage_level === l.level ? "ring-4 ring-offset-2 ring-offset-card" : "opacity-70 hover:opacity-100")}
              style={{ background: l.color, ["--tw-ring-color" as string]: l.color }}>{l.level}</button>)}</div>
            <VitalsInputs v={vit} set={(k, x) => setVit((o) => ({ ...o, [k]: x }))} /><div className="text-[11px] text-muted-foreground">Enter vitals, then tap a level to save both.</div>
            {v.chief_complaint && <div className="text-sm"><b>Complaint:</b> {v.chief_complaint}</div>}</section>
          <section className="space-y-3 rounded-2xl border border-border p-3"><h3 className="flex items-center gap-2 text-sm font-bold"><Stethoscope className="h-4 w-4 text-sky-600" />Doctor & bay</h3>
            <Field label="Doctor"><select className={inputCls} disabled={closed} value={v.assigned_doctor ?? ""} onChange={(e) => void act("er.assign", { name: v.name, doctor: e.target.value }, "Doctor assigned")}>
              <option value="">—</option>{ctx?.doctors.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select></Field>
            <Field label="Bay"><div className="grid grid-cols-4 gap-1.5">{(board?.bays ?? []).map((bay) => <button key={bay.name} disabled={closed || (bay.status !== "Available" && bay.name !== v.bay)}
              onClick={() => void act("er.assign", { name: v.name, bay: bay.name }, `Bay ${bay.bed_no}`)} className={cn("rounded-lg border py-2 text-xs font-bold", bay.name === v.bay ? "border-teal-600 bg-teal-600 text-white"
              : bay.status === "Available" ? "border-emerald-400 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10" : "border-border bg-muted text-muted-foreground")} title={bay.patient_name}>{bay.bed_no}</button>)}</div></Field>
            <div className="flex gap-2">{["In Treatment", "Observation"].map((s) => <Button key={s} size="sm" variant={v.status === s ? "workflow" : "neutral"} disabled={closed} onClick={() => void act("er.assign", { name: v.name, status: s }, s)}>{s}</Button>)}</div>
          </section>
          {v.patient_info.temporary_record && hasRole("PW Admin") ? <IdentifyBox name={v.name} onDone={refresh} /> : v.patient_info.temporary_record ? <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 md:col-span-2 dark:bg-amber-500/10 dark:text-amber-200">
            <IdCard className="me-1 inline h-4 w-4" />Temporary record. When the patient is identified, the administrator merges it into the real record (Patients → Merge, or here).</div> : null}
        </div>}
        {tab === "meds" && <MedicationPanel target={target} patient={v.patient} orders={v.orders} mar={v.mar} refresh={refresh} gate={!!ctx?.flags.mar_gate} canOrder={!closed && hasRole("PW Doctor")} canChart={!closed && hasRole("PW Nurse", "PW Doctor")} />}
        {tab === "labs" && <LabsPanel target={target} labs={v.labs} ctx={ctx} refresh={refresh} canOrder={!closed} />}
        {tab === "vitals" && <VitalsPanel target={target} vitals={v.vitals} refresh={refresh} canAdd={!closed} />}
        {tab === "notes" && <NotesPanel target={target} notes={v.notes} refresh={refresh} canWrite={!closed && hasRole("PW Doctor", "PW Nurse")} isDoctor={hasRole("PW Doctor")} />}
        {tab === "procedures" && <ProceduresPanel target={target} procs={v.procedures} ctx={ctx} refresh={refresh} canWrite={!closed && hasRole("PW Doctor", "PW Nurse")} />}
        {tab === "bill" && <div className="space-y-2"><div className="text-sm text-muted-foreground">Billing: {v.billing_mode}. {v.bed_allotment ? <>Carried to admission <Link className="font-semibold text-teal-700" to={`/ipd/${v.bed_allotment}`}>{v.bed_allotment}</Link>.</> : v.sales_invoice ? `Invoice ${v.sales_invoice}.` : "Billed at disposition."}</div>
          <ChargesTable lines={v.charges.map((c) => ({ ...c, charge: c.name }))} /></div>}
        {tab === "out" && <Disposition v={v} ctx={ctx} onDone={() => { refresh(); }} />}
      </div>
    </Dialog>
  );
}

function IdentifyBox({ name, onDone }: { name: string; onDone: () => void }) {
  const [p, setP] = useState<PatientHit | null>(null);
  return (
    <section className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50/60 p-3 md:col-span-2 dark:bg-amber-500/5">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Merge className="h-4 w-4" />Identity found? Merge into the real record</h3>
      <PatientPicker value={p} onPick={setP} onClear={() => setP(null)} placeholder="Find the existing patient" />
      <Button variant="workflow" disabled={!p} onClick={async () => { if (!confirm(`Move this ER visit and everything on the temporary record to ${p!.patient_name} (${p!.name})? This cannot be undone.`)) return;
        try { await call("er.identify", { name, patient: p!.name }); toast.success("Merged"); onDone(); } catch (e) { toast.error(humanizeError(e)); } }}><Merge className="h-4 w-4" />Merge</Button>
    </section>
  );
}

function Disposition({ v, ctx, onDone }: { v: VisitData; ctx?: Ctx; onDone: () => void }) {
  const [d, setD] = useState("Discharged Home");
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (v.status === "Disposed") return <div className="rounded-2xl bg-muted p-4 text-sm"><CheckCircle2 className="me-1 inline h-4 w-4 text-emerald-600" />{v.disposition}{v.bed_allotment && <> · <Link className="font-semibold text-teal-700" to={`/ipd/${v.bed_allotment}`}>open the admission</Link></>}</div>;
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const beds = (ctx?.beds ?? []).filter((b) => b.ward_type !== "Emergency");
  const go = async () => {
    setBusy(true);
    try {
      const r = await call<{ bed_allotment?: string; sales_invoice?: string }>("er.dispose", { name: v.name, disposition: d, note: f.note, referred_to: f.referred_to, cause_of_death: f.cause_of_death,
        death_datetime: f.death_datetime ? f.death_datetime.replace("T", " ") + ":00" : undefined, lama_form: f.lama_form, payment_mode: f.payment_mode || "Cash",
        admit: d === "Admitted" ? { bed: f.bed, doctor: f.doctor || v.assigned_doctor, reason: f.reason || v.chief_complaint, diagnosis: f.diagnosis } : undefined });
      toast.success(r.bed_allotment ? `Admitted · ${r.bed_allotment}` : r.sales_invoice ? `Closed · invoice ${r.sales_invoice}` : "Closed"); onDone();
    } catch (e) { toast.error(humanizeError(e), { duration: 8000 }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">{[["Discharged Home", LogOut], ["Admitted", BedDouble], ["Referred Out", Ambulance], ["LAMA", ShieldAlert], ["Expired", HeartPulse]].map(([k, I]) => {
        const Icon = I as typeof LogOut; return <button key={k as string} onClick={() => setD(k as string)} className={cn("flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold",
          d === k ? "border-red-600 bg-red-600 text-white" : "border-border")}><Icon className="h-4 w-4" />{k as string}</button>; })}</div>
      {d === "Admitted" && <div className="grid gap-3 sm:grid-cols-2"><Field label="Bed" required><select className={inputCls} value={f.bed ?? ""} onChange={set("bed")}><option value="">—</option>
        {[...new Set(beds.map((b) => b.ward))].map((w) => <optgroup key={w} label={w}>{beds.filter((b) => b.ward === w).map((b) => <option key={b.name} value={b.name}>{b.bed_no} · {rs(b.rate)}/day</option>)}</optgroup>)}</select></Field>
        <Field label="Admitting doctor"><select className={inputCls} value={f.doctor ?? v.assigned_doctor ?? ""} onChange={set("doctor")}><option value="">—</option>{ctx?.doctors.map((x) => <option key={x.name} value={x.name}>{x.doctor_name}</option>)}</select></Field>
        <Field label="Reason"><input className={inputCls} value={f.reason ?? v.chief_complaint ?? ""} onChange={set("reason")} /></Field><Field label="Provisional diagnosis"><input className={inputCls} value={f.diagnosis ?? ""} onChange={set("diagnosis")} /></Field>
        <div className="text-xs text-muted-foreground sm:col-span-2">ER charges, orders, labs and notes move to the admission. Insurance needs an approved pre-auth.</div></div>}
      {d === "Referred Out" && <Field label="Referred to" required><input className={inputCls} value={f.referred_to ?? ""} onChange={set("referred_to")} /></Field>}
      {d === "LAMA" && <Field label="Signed LAMA form (file URL)" required><input className={inputCls} value={f.lama_form ?? ""} onChange={set("lama_form")} /></Field>}
      {d === "Expired" && <div className="grid gap-3 sm:grid-cols-2"><Field label="Date & time of death" required><input type="datetime-local" className={inputCls} value={f.death_datetime ?? ""} onChange={set("death_datetime")} /></Field>
        <Field label="Cause"><input className={inputCls} value={f.cause_of_death ?? ""} onChange={set("cause_of_death")} /></Field></div>}
      {d !== "Admitted" && <Field label={v.billing_mode === "OPD-style slip" ? "Payment at the counter" : "Bill"} hint={v.billing_mode === "OPD-style slip" ? "Collected now in your shift" : "Credit invoice; collect at the desk"}>
        <div className="flex flex-wrap gap-1">{["Cash", "Card", "Bank Transfer", "JazzCash", "Easypaisa"].map((m) => <button key={m} onClick={() => setF((x) => ({ ...x, payment_mode: m }))}
          className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold", (f.payment_mode || "Cash") === m ? "border-emerald-600 bg-emerald-600 text-white" : "border-border")}>{m}</button>)}</div></Field>}
      <Field label="Note"><input className={inputCls} value={f.note ?? ""} onChange={set("note")} /></Field>
      <Button variant="danger" size="lg" loading={busy} disabled={d === "Admitted" && !f.bed} onClick={() => void go()}>{d === "Admitted" ? <BedDouble className="h-5 w-5" /> : <Receipt className="h-5 w-5" />}{d === "Admitted" ? "Admit" : `Close as ${d}`}</Button>
      {v.pending_labs > 0 && <div className="flex items-center gap-1 text-xs text-amber-700"><FlaskConical className="h-3 w-3" />{v.pending_labs} lab order(s) still in progress.</div>}
    </div>
  );
}

