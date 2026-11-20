/**
 * Baby chart (D-95): Vitals · Feeds · Output · Weight · Jaundice · Medicines & vaccines · Screenings · Notes · NICU support, plus security,
 * parent updates, discharge checklist and papers. Entries are append-only; corrections are struck through with a reason (audit).
 * Charts follow the dataviz rules: one measure per chart (small multiples), validated palette, thin marks, threshold as a dashed line.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, ArrowLeft, Baby, Bed, Check, ClipboardCheck, Download, Eye, FileText, Heart, ImagePlus, Loader2, Lock, MoveRight, Pencil, Plus, Printer, ShieldCheck, Sun, Syringe, Trash2, Wind,
} from "lucide-react";
import toast from "react-hot-toast";
import { call, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { humanizeError } from "@/services/frappe";
import { Field, inputCls } from "@/components/common";
import { Button } from "@/components/ui/button";
import { axisProps, TipBox, useViz } from "@/lib/viz";
import { cn } from "@/utils/cn";
import { ageLabel, Modal, SEVERITY, STATUSES, StatusChip, UNITS, useNurseryLive, type Alert } from "./shared";
import { ChargesTable, LabsPanel, MedicationPanel, ProceduresPanel, type Dose, type LabOrder, type Order, type Proc } from "@/modules/ipd/panels";
import type { Ctx } from "@/modules/ipd/shared";

interface IpdChart { orders: Order[]; mar: Dose[]; labs: LabOrder[]; procedures: Proc[] }

function NoAdm({ c }: { c: { baby_name: string } }) {
  return <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">{c.baby_name} has no cot admission yet — place the baby in a cot (Move) to order labs, procedures or see the bill.</p>;
}

/** Standing-order dose (vitamin K, birth vaccines) given by the nurse: one STAT IPD order + its MAR dose, batch recorded. */
function StandingDose({ c, onDone }: { c: { name: string; newborn_items: { code: string; name: string; standing: number; vaccine: boolean }[] }; onDone: () => void }) {
  const items = c.newborn_items.filter((i) => i.standing);
  const [item, setItem] = useState(items[0]?.code ?? "");
  const [dose, setDose] = useState("");
  const [batch, setBatch] = useState("");
  const [busy, setBusy] = useState(false);
  const sel = items.find((i) => i.code === item);
  const go = async () => { setBusy(true); try { await call("nursery.give_now", { name: c.name, item, dose: dose || undefined, batch_no: batch || undefined }); toast.success(`${sel?.name} given — on the medication chart`); setBatch(""); setDose(""); onDone(); }
    catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); } };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><Syringe className="h-4 w-4 text-primary" />Give now — newborn standing orders <span className="font-normal text-muted-foreground">(vitamin K, birth vaccines)</span></h3>
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
        <Field label="Medicine / vaccine"><select className={inputCls} value={item} onChange={(e) => setItem(e.target.value)}>{items.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}</select></Field>
        <Field label="Dose"><input className={inputCls} value={dose} onChange={(e) => setDose(e.target.value)} placeholder={item === "NB-BCG" ? "0.05 ml" : item === "NB-OPV" ? "2 drops" : "1 mg"} /></Field>
        <Field label={sel?.vaccine ? "Batch no. (required)" : "Batch no."}><input className={inputCls} value={batch} onChange={(e) => setBatch(e.target.value)} /></Field>
        <Button variant="submit" disabled={busy || !item || (!!sel?.vaccine && !batch.trim())} onClick={() => void go()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Give</Button>
      </div>
    </div>
  );
}

type E = Record<string, unknown> & { name: string; entry_type: string; recorded_at: string; by_name?: string; alert_flags?: string; cancelled?: number; cancel_reason?: string; age_hours?: number };
interface Chart {
  name: string; baby_name: string; baby_patient: string; sex: string; status: string; unit: string; cot_label?: string; mother: string; mother_name: string; mother_phone?: string; father_name?: string;
  birth_datetime: string; delivery_type?: string; gestation_weeks?: number; gestation_days?: number; birth_weight_g: number; current_weight_g?: number; length_cm?: number; head_circ_cm?: number;
  apgar_1?: number; apgar_5?: number; blood_group?: string; band_no: string; tag_no?: string; tag_active: number; nicu_reason?: string; last_bilirubin?: number; phototherapy_on?: number; resp_support?: string;
  multiple_birth?: string; birth_order?: number; siblings: { name: string; baby_name: string }[]; doctor_name?: string; age_hours: number; threshold_now: number; portal_photo_consent: number;
  entries: E[]; admission?: string; newborn_items: { code: string; name: string; form: string; standing: number; vaccine: boolean }[]; security: { event: string; at: string; by_user: string; staff_id?: string; with_whom?: string; band_match?: number; note?: string }[];
  updates: { name: string; status: string; text: string; photo?: string; posted_at: string }[]; epi: { vaccine: string; due: string; age: string; given_at?: string | null; batch?: string | null }[];
  alerts: Alert[]; bill?: { admission: string; gross?: number; net?: number } | null; doc_version: number;
  [k: string]: unknown;
}
const TABS = ["Overview", "Vitals", "Feeds", "Output", "Weight", "Jaundice", "Medicines & vaccines", "Labs", "Procedures", "Screenings", "Notes", "NICU support", "Security", "Parent updates", "Bill", "Discharge", "Papers"] as const;
type Tab = (typeof TABS)[number];
const TAB_TYPES: Partial<Record<Tab, string[]>> = { Vitals: ["Vitals"], Feeds: ["Feed"], Output: ["Output"], Weight: ["Weight"], Jaundice: ["Bilirubin", "Phototherapy"],
  Screenings: ["Screening"], Notes: ["Doctor Note", "Nursing Note"], "NICU support": ["NICU Support"] };
const COLS: Record<string, [string, string][]> = {
  Vitals: [["temp_c", "Temp °C"], ["hr", "HR"], ["rr", "RR"], ["spo2", "SpO₂"]], Feed: [["feed_type", "Type"], ["feed_ml", "ml"], ["feed_min", "min"], ["note", "Note"]],
  Output: [["urine", "Wet"], ["stool", "Stool"], ["note", "Note"]], Weight: [["weight_g", "g"], ["note", "Note"]], Bilirubin: [["bilirubin", "mg/dL"], ["bili_method", "Method"], ["photo_on", "Photo"]],
  Phototherapy: [["photo_on", "Photo"], ["note", "Note"]], Medication: [["item", "Medicine"], ["dose", "Dose"], ["route", "Route"], ["batch_no", "Batch"]], Vaccine: [["item", "Vaccine"], ["dose", "Dose"], ["route", "Route"], ["batch_no", "Batch"]],
  Screening: [["screening", "Test"], ["result", "Result"], ["note", "Note"]], "Doctor Note": [["note", "Note"]], "Nursing Note": [["note", "Note"]],
  "NICU Support": [["resp_support", "Support"], ["fio2", "FiO₂"], ["peep", "PEEP"], ["pip", "PIP"], ["vent_rate", "Rate"], ["iv_fluid", "IV"], ["iv_rate", "ml/h"], ["incubator_temp", "Incub °C"]],
};
/** Same placeholder line as the server (services/nursery.py · phototherapy_threshold) — the paediatric team replaces it. */
const threshold = (h: number, ga = 40) => Math.round(Math.min(5 + Math.min(Math.max(h, 0), 96) * 0.1 - (ga < 37 ? 3 : 0), ga >= 37 ? 15 : 12) * 10) / 10;

export default function BabyPage() {
  const { name = "" } = useParams();
  const { hasRole } = useAuth();
  const { data: c, refetch: refetchNb } = useApi<Chart>("nursery.chart", { name });
  const { branch } = useAuth();
  // the baby's IPD admission: medicines (orders + MAR), labs, procedures and the bill are the same records the IPD screen shows (D-96)
  const { data: ipdc, refetch: refetchIpd } = useApi<IpdChart>("ipd.chart", { name: c?.admission }, { enabled: !!c?.admission });
  const { data: bill, refetch: refetchBill } = useApi<{ lines: Parameters<typeof ChargesTable>[0]["lines"]; gross?: number; net?: number; paid?: number; balance?: number }>("ipd.bill", { name: c?.admission }, { enabled: !!c?.admission });
  const { data: ctx } = useApi<Ctx>("ipd.context", { branch });
  const refetch = () => { void refetchNb(); void refetchIpd(); void refetchBill(); };
  useNurseryLive(["nursery.chart", "ipd.chart", "ipd.bill"]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [add, setAdd] = useState<string | null>(null);
  const [move, setMove] = useState(false);
  const [strike, setStrike] = useState<E | null>(null);
  const [edit, setEdit] = useState<E | null>(null);
  const clinical = hasRole("PW Nursery Nurse", "PW NICU Nurse", "PW Neonatologist");
  const doctor = hasRole("PW Neonatologist");
  if (!c) return <div className="flex items-center justify-center gap-2 p-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading chart…</div>;
  const done = c.status === "Discharged";
  const list = (types: string[]) => c.entries.filter((e) => types.includes(e.entry_type));
  const types = TAB_TYPES[tab];
  const loss = c.current_weight_g ? ((c.birth_weight_g - c.current_weight_g) / c.birth_weight_g) * 100 : 0;
  const status = async (s: string) => { try { await call("nursery.set_status", { name, status: s }); toast.success(`Status: ${s}`); void refetch(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <Link to="/nursery" className="rounded-lg p-1.5 hover:bg-muted" aria-label="Back to board"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Baby className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><h1 className="vvs-serif truncate text-xl font-semibold">{c.baby_name}</h1>
            <div className="text-xs text-muted-foreground">{c.baby_patient} · band <span className="font-mono">{c.band_no}</span> · mother {c.mother_name} ({c.mother})</div></div>
          <StatusChip s={c.status} />
          {!done && clinical && <select aria-label="Change status" className={cn(inputCls, "h-8 w-auto py-0 text-xs")} value="" onChange={(e) => e.target.value && void status(e.target.value)}>
            <option value="">Set status…</option>{STATUSES.filter((s) => s !== c.status).map((s) => <option key={s}>{s}</option>)}</select>}
          {!done && <Button size="sm" variant="outline" onClick={() => setMove(true)}><MoveRight className="h-4 w-4" />Move</Button>}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm md:grid-cols-4 xl:grid-cols-8">
          {([["Age", ageLabel(c.age_hours)], ["Sex", c.sex], ["Gestation", c.gestation_weeks ? `${c.gestation_weeks}+${c.gestation_days ?? 0} wk` : "—"], ["Birth weight", `${c.birth_weight_g} g`],
            ["Now", c.current_weight_g ? `${c.current_weight_g} g (${loss > 0 ? "−" : "+"}${Math.abs(loss).toFixed(1)}%)` : "—"], ["Unit / cot", `${c.unit}${c.cot_label ? ` · ${c.cot_label.split(" · ")[1]}` : ""}`],
            ["Apgar", `${c.apgar_1 ?? "—"} / ${c.apgar_5 ?? "—"}`], ["Paediatrician", c.doctor_name || "—"]] as [string, string][]).map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt><dd className={cn("truncate font-semibold", k === "Now" && loss > 10 && "text-rose-600")}>{v}</dd></div>))}
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-border bg-muted/30 px-4 py-2 text-xs">
          {c.phototherapy_on ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-2 py-0.5 font-bold text-white"><Sun className="h-3 w-3" />Phototherapy on</span> : null}
          {c.resp_support && c.resp_support !== "Room air" ? <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500 px-2 py-0.5 font-bold text-white"><Wind className="h-3 w-3" />{c.resp_support}</span> : null}
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold", c.tag_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-rose-600 text-white")}><ShieldCheck className="h-3 w-3" />{c.tag_active ? `Tag ${c.tag_no}` : "No active tag"}</span>
          {c.nicu_reason && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-bold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">NICU: {c.nicu_reason}</span>}
          {c.siblings.map((s) => <Link key={s.name} to={`/nursery/baby/${s.name}`} className="rounded-full bg-pink-100 px-2 py-0.5 font-bold text-pink-800 dark:bg-pink-500/15 dark:text-pink-200">{c.multiple_birth}: {s.baby_name}</Link>)}
          {c.bill?.gross != null && <span className="ms-auto text-muted-foreground">Cot bill so far: <b className="text-foreground">Rs {Math.round(c.bill.gross).toLocaleString()}</b> · {c.bill.admission}</span>}
        </div>
      </div>

      {!!c.alerts.length && <div className="mb-4 grid gap-2 md:grid-cols-2">{c.alerts.map((a, i) => <div key={i} className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", SEVERITY[a.severity])}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><b className="uppercase">{a.kind}</b> · {a.text}</span></div>)}</div>}

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-muted p-1" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
          className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", tab === t ? "tab-gold" : "text-muted-foreground hover:text-foreground")}>{t}</button>)}
      </div>

      {tab === "Overview" && <Overview c={c} />}
      {types && <section className="space-y-4">
        {!done && clinical && <div className="flex flex-wrap gap-2">{types.filter((t) => (t !== "Doctor Note" || doctor) && (t !== "NICU Support" || hasRole("PW NICU Nurse", "PW Neonatologist"))).map((t) =>
          <Button key={t} size="sm" onClick={() => setAdd(t)}><Plus className="h-4 w-4" />{t === "Bilirubin" ? "Bilirubin" : t === "Phototherapy" ? "Phototherapy on / off" : `Add ${t.toLowerCase()}`}</Button>)}</div>}
        {tab === "Vitals" && <VitalsCharts rows={list(["Vitals"])} unit={c.unit} />}
        {tab === "Weight" && <SeriesChart rows={list(["Weight"])} k="weight_g" label="Weight (g)" refY={c.birth_weight_g * 0.9} refLabel="−10% of birth weight" />}
        {tab === "Jaundice" && <JaundiceChart rows={list(["Bilirubin"])} ga={c.gestation_weeks ?? 40} />}
        {tab === "Medicines & vaccines" && <EpiTable epi={c.epi} />}
        <EntryTable rows={list(types)} types={types} onStrike={clinical && !done ? setStrike : undefined} onEdit={clinical && !done ? setEdit : undefined} />
      </section>}
      {tab === "Medicines & vaccines" && <div className="space-y-4">
        {!c.admission ? <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Place the baby in a cot first — medicines are charted on the cot admission.</p> : <>
          {!done && clinical && <StandingDose c={c} onDone={refetch} />}
          {ipdc && <MedicationPanel target={{ bed_allotment: c.admission }} patient={c.baby_patient} orders={ipdc.orders} mar={ipdc.mar} refresh={refetch} gate={!!ctx?.flags?.mar_gate}
            canOrder={!done && doctor} canChart={!done && clinical} />}
          <EpiTable epi={c.epi} />
          <p className="text-xs text-muted-foreground">One medication chart: orders and doses here are the same records as on the IPD admission ({c.admission}) — stock, the pharmacy and the bill follow automatically.</p></>}
      </div>}
      {tab === "Labs" && (ipdc ? <LabsPanel target={{ bed_allotment: c.admission! }} labs={ipdc.labs} ctx={ctx} refresh={refetch} canOrder={!done && clinical} /> : <NoAdm c={c} />)}
      {tab === "Procedures" && (ipdc ? <ProceduresPanel target={{ bed_allotment: c.admission! }} procs={ipdc.procedures} ctx={ctx} refresh={refetch} canWrite={!done && clinical} /> : <NoAdm c={c} />)}
      {tab === "Bill" && (c.admission ? <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex-1 text-sm"><b>Cot admission {c.admission}</b><div className="text-xs text-muted-foreground">Cot days, nursing, medicines, labs and procedures — the same bill the IPD and billing desks see.</div></div>
          {bill?.gross != null && <div className="text-end"><div className="text-xs text-muted-foreground">Total so far</div><div className="text-xl font-extrabold tabular-nums">Rs {Math.round(bill.gross).toLocaleString()}</div></div>}
          <Link to={`/ipd/${c.admission}?tab=charges`}><Button size="sm" variant="outline">Open IPD bill</Button></Link>
        </div>
        <ChargesTable lines={bill?.lines ?? []} />
      </div> : <NoAdm c={c} />)}
      {tab === "Security" && <SecurityTab c={c} onDone={() => void refetch()} />}
      {tab === "Parent updates" && <UpdatesTab c={c} onDone={() => void refetch()} canPost={clinical && !done} />}
      {tab === "Discharge" && <DischargeTab c={c} doctor={doctor} onDone={() => void refetch()} />}
      {tab === "Papers" && <PapersTab c={c} />}

      {add && <AddEntry type={add} c={c} onClose={() => setAdd(null)} onDone={() => { setAdd(null); void refetch(); }} />}
      {edit && <AddEntry type={edit.entry_type} c={c} entry={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void refetch(); }} />}
      {move && <MoveModal c={c} onClose={() => setMove(false)} onDone={() => { setMove(false); void refetch(); }} />}
      {strike && <StrikeModal e={strike} onClose={() => setStrike(null)} onDone={() => { setStrike(null); void refetch(); }} />}
    </div>
  );
}

function Overview({ c }: { c: Chart }) {
  const last = (t: string) => c.entries.find((e) => e.entry_type === t && !e.cancelled);
  const v = last("Vitals"), f = last("Feed"), w = last("Weight"), b = last("Bilirubin"), s = last("NICU Support");
  const card = (title: string, I: typeof Heart, body: React.ReactNode, at?: string) => <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><I className="h-4 w-4 text-primary" />{title}{at && <span className="ms-auto font-normal normal-case">{at.slice(5)}</span>}</div>{body}</div>;
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {card("Last vitals", Heart, v ? <div className="grid grid-cols-4 gap-2 text-center">{([["temp_c", "°C"], ["hr", "HR"], ["rr", "RR"], ["spo2", "SpO₂"]] as const).map(([k, l]) => <div key={k}><div className="text-xl font-extrabold tabular-nums">{String(v[k] ?? "—")}</div><div className="text-[11px] text-muted-foreground">{l}</div></div>)}</div> : "—", v?.recorded_at)}
      {card("Last feed", Baby, f ? <div className="text-lg font-bold">{String(f.feed_type)} {f.feed_ml ? `· ${f.feed_ml} ml` : f.feed_min ? `· ${f.feed_min} min` : ""}</div> : "—", f?.recorded_at)}
      {card("Weight", Bed, <div className="text-lg font-bold">{String(w?.weight_g ?? c.birth_weight_g)} g <span className="text-sm font-normal text-muted-foreground">birth {c.birth_weight_g} g</span></div>, w?.recorded_at)}
      {card("Bilirubin", Sun, b ? <div className="text-lg font-bold">{String(b.bilirubin)} mg/dL <span className="text-sm font-normal text-muted-foreground">line now {c.threshold_now} [placeholder]</span></div> : "—", b?.recorded_at)}
      {s && card("NICU support", Wind, <div className="text-lg font-bold">{String(s.resp_support)}{s.fio2 ? ` · FiO₂ ${s.fio2}%` : ""}{s.iv_fluid ? <div className="text-sm font-normal">{String(s.iv_fluid)} {String(s.iv_rate ?? "")} ml/h</div> : null}</div>, s.recorded_at)}
      {card("Birth", ClipboardCheck, <div className="text-sm">{c.delivery_type} · {c.birth_datetime.slice(0, 16)}<br />Length {c.length_cm ?? "—"} cm · head {c.head_circ_cm ?? "—"} cm · blood group {c.blood_group}</div>)}
    </div>
  );
}

function EntryTable({ rows, types, onStrike, onEdit }: { rows: E[]; types: string[]; onStrike?: (e: E) => void; onEdit?: (e: E) => void }) {
  const cols = Array.from(new Map(types.flatMap((t) => COLS[t] ?? []).map((c) => [c[0], c])).values());
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing charted yet.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Time</th>{types.length > 1 && <th className="text-start">Type</th>}
        {cols.map(([k, l]) => <th key={k} className="px-2 text-start">{l}</th>)}<th className="px-2 text-start">Alerts</th><th className="px-2 text-start">By</th><th className="w-24 px-3 text-end">Actions</th></tr></thead>
        <tbody>{rows.map((e) => <tr key={e.name} className={cn("group border-t border-border/60 align-top transition hover:bg-muted/30", e.cancelled && "bg-muted/20 text-muted-foreground line-through decoration-rose-500/70")}>
          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{e.recorded_at.slice(5)}<div className="text-[10px] text-muted-foreground no-underline">{ageLabel(e.age_hours as number)}</div></td>
          {types.length > 1 && <td className="py-2">{e.entry_type}</td>}
          {cols.map(([k]) => <td key={k} className="max-w-[320px] px-2 py-2">{e[k] != null && e[k] !== "" && e[k] !== 0 ? String(e[k]) : ""}</td>)}
          <td className="px-2 py-2 text-xs font-semibold text-rose-600">{e.alert_flags ? String(e.alert_flags).split("\n").map((x) => <div key={x}>⚠ {x}</div>) : ""}</td>
          <td className="whitespace-nowrap px-2 py-2 text-xs">{e.by_name}{e.cancelled ? <div className="text-rose-600 no-underline">struck: {e.cancel_reason}</div> : null}</td>
          <td className="px-3 py-1.5"><div className="flex justify-end gap-1 no-underline opacity-70 transition group-hover:opacity-100">
            {e.source === "MAR" ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">MAR</span> : e.cancelled ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 no-underline dark:bg-rose-500/15 dark:text-rose-200">STRUCK</span> : <>
              {onEdit && <button onClick={() => onEdit(e)} className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary" aria-label="Edit entry" title="Edit (correct)"><Pencil className="h-4 w-4" /></button>}
              {onStrike && <button onClick={() => onStrike(e)} className="rounded-lg p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600" aria-label="Delete entry" title="Delete (strike through)"><Trash2 className="h-4 w-4" /></button>}</>}
          </div></td></tr>)}</tbody></table>
    </div>
  );
}

function VitalsCharts({ rows, unit }: { rows: E[]; unit: string }) {
  const specs: [string, string, number, number][] = [["temp_c", "Temperature (°C)", 36.5, 37.5], ["hr", "Heart rate (/min)", 100, 180], ["rr", "Respiratory rate (/min)", 30, 60], ["spo2", "SpO₂ (%)", unit === "NICU" ? 90 : 95, 100]];
  return <div className="grid gap-4 md:grid-cols-2">{specs.map(([k, l, lo, hi]) => <SeriesChart key={k} rows={rows} k={k} label={l} band={[lo, hi]} />)}</div>;
}

function SeriesChart({ rows, k, label, band, refY, refLabel }: { rows: E[]; k: string; label: string; band?: [number, number]; refY?: number; refLabel?: string }) {
  const v = useViz();
  const data = useMemo(() => rows.filter((e) => !e.cancelled && e[k] != null && e[k] !== "").map((e) => ({ t: e.recorded_at.slice(5), y: Number(e[k]), flag: !!e.alert_flags })).reverse(), [rows, k]);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-sm font-bold">{label}<span className="text-xs font-normal text-muted-foreground">{band ? `normal ${band[0]}–${band[1]}` : refLabel}</span></div>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data}><CartesianGrid vertical={false} stroke={v.grid} /><XAxis dataKey="t" {...axisProps(v.axis)} minTickGap={24} /><YAxis {...axisProps(v.axis)} width={38} domain={["auto", "auto"]} />
          <Tooltip content={({ active, payload }) => active && payload?.length ? <TipBox title={String(payload[0].payload.t)} rows={[{ label, value: payload[0].payload.y, color: v.series[0] }]} /> : null} />
          {band && <><ReferenceLine y={band[0]} stroke={v.axis} strokeDasharray="4 4" /><ReferenceLine y={band[1]} stroke={v.axis} strokeDasharray="4 4" /></>}
          {refY && <ReferenceLine y={refY} stroke="#d03b3b" strokeDasharray="4 4" />}
          <Line dataKey="y" stroke={v.series[0]} strokeWidth={2} dot={(p: { cx?: number; cy?: number; payload?: { flag: boolean } }) => <circle key={`${p.cx}-${p.cy}`} cx={p.cx} cy={p.cy} r={p.payload?.flag ? 4.5 : 3} fill={p.payload?.flag ? "#d03b3b" : v.series[0]} stroke={v.surface} strokeWidth={2} />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function JaundiceChart({ rows, ga }: { rows: E[]; ga: number }) {
  const v = useViz();
  const pts = rows.filter((e) => !e.cancelled && e.bilirubin).map((e) => ({ h: Math.round(Number(e.age_hours)), y: Number(e.bilirubin), photo: e.photo_on })).reverse();
  const maxH = Math.max(96, ...pts.map((p) => p.h));
  const line = Array.from({ length: Math.ceil(maxH / 6) + 1 }, (_, i) => ({ h: i * 6, line: threshold(i * 6, ga) }));
  const data = [...line.map((l) => ({ ...l, y: undefined as number | undefined })), ...pts.map((p) => ({ h: p.h, y: p.y, line: undefined as number | undefined }))].sort((a, b) => a.h - b.h);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-bold">Bilirubin vs age (hours)<span className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-[#d03b3b]" />Phototherapy line [placeholder]</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: v.series[0] }} />Measured</span></span></div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}><CartesianGrid vertical={false} stroke={v.grid} /><XAxis dataKey="h" type="number" domain={[0, maxH]} {...axisProps(v.axis)} unit=" h" /><YAxis {...axisProps(v.axis)} width={34} unit="" />
          <Tooltip content={({ active, payload }) => active && payload?.length ? <TipBox title={`${payload[0].payload.h} h`} rows={payload.filter((p) => p.value != null).map((p) => ({ label: p.dataKey === "line" ? "Line" : "Bilirubin", value: `${p.value} mg/dL`, color: p.dataKey === "line" ? "#d03b3b" : v.series[0] }))} /> : null} />
          <Line dataKey="line" stroke="#d03b3b" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls />
          <Line dataKey="y" stroke={v.series[0]} strokeWidth={2} connectNulls dot={{ r: 4, fill: v.series[0], stroke: v.surface, strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-muted-foreground">Gestation {ga} weeks. The line is a placeholder until LMC's paediatric team supplies its nomogram.</p>
    </div>
  );
}

function EpiTable({ epi }: { epi: Chart["epi"] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Syringe className="h-4 w-4 text-primary" />EPI schedule <span className="font-normal text-muted-foreground">[verify against EPI Punjab]</span></h3>
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{epi.map((r) => <div key={r.vaccine} className={cn("flex items-center justify-between rounded-lg px-3 py-1.5 text-sm", r.given_at ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-muted/40")}>
        <span><b>{r.vaccine}</b> <span className="text-xs text-muted-foreground">{r.age}</span></span><span className={cn("text-xs", r.given_at ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{r.given_at ? `✓ ${r.given_at}` : r.due}</span></div>)}</div></div>
  );
}

/** One form for every entry type (fields per type). */
const FORM: Record<string, [string, string, string?, string[]?][]> = {
  Vitals: [["temp_c", "Temp (°C)", "number"], ["hr", "Heart rate", "number"], ["rr", "Resp. rate", "number"], ["spo2", "SpO₂ (%)", "number"]],
  Feed: [["feed_type", "Type", "select", ["Breastfeed", "Expressed breast milk", "Formula", "Donor milk", "NG / OG tube", "Nil by mouth"]], ["feed_ml", "Volume (ml)", "number"], ["feed_min", "Duration (min)", "number"], ["note", "Note"]],
  Output: [["urine", "Wet nappies", "number"], ["stool", "Stool", "select", ["None", "Meconium", "Transitional", "Yellow", "Abnormal"]], ["note", "Note"]],
  Weight: [["weight_g", "Weight (g)", "number"], ["note", "Note"]],
  Bilirubin: [["bilirubin", "Bilirubin (mg/dL)", "number"], ["bili_method", "Method", "select", ["Transcutaneous", "Serum"]], ["photo_on", "Phototherapy", "select", ["", "Started", "Stopped"]], ["note", "Note"]],
  Phototherapy: [["photo_on", "Phototherapy", "select", ["Started", "Stopped"]], ["note", "Note"]],
  Medication: [["item", "Medicine"], ["dose", "Dose"], ["route", "Route", "select", ["IM", "IV", "Oral", "SC", "Topical"]], ["batch_no", "Batch no."], ["note", "Note"]],
  Vaccine: [["item", "Vaccine", "vaccine"], ["dose", "Dose"], ["route", "Route", "select", ["Intradermal", "Oral", "IM"]], ["batch_no", "Batch no. (required)"]],
  Screening: [["screening", "Test", "select", ["Hearing (OAE)", "CCHD pulse oximetry", "Metabolic (heel prick)", "Eye (ROP)", "Hip"]], ["result", "Result", "select", ["Pass", "Refer", "Normal", "Abnormal"]], ["note", "Note"]],
  "Doctor Note": [["note", "Note", "textarea"], ["share_with_parents", "Share with parents (My Baby)", "check"]],
  "Nursing Note": [["note", "Note", "textarea"], ["share_with_parents", "Share with parents (My Baby)", "check"]],
  "NICU Support": [["resp_support", "Respiratory support", "select", ["Room air", "Nasal oxygen", "High-flow", "CPAP", "Ventilator"]], ["fio2", "FiO₂ (%)", "number"], ["peep", "PEEP / CPAP (cmH₂O)", "number"], ["pip", "PIP", "number"],
    ["vent_rate", "Vent rate", "number"], ["iv_fluid", "IV fluid"], ["iv_rate", "IV rate (ml/h)", "number"], ["incubator_temp", "Incubator °C", "number"], ["note", "Note"]],
};
const VACCINES = ["BCG", "OPV-0", "Hepatitis B (birth dose)", "OPV-1", "Pentavalent-1", "PCV-1", "Rotavirus-1", "IPV-1"];

function AddEntry({ type, c, entry, onClose, onDone }: { type: string; c: Chart; entry?: E; onClose: () => void; onDone: () => void }) {
  const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const [v, setV] = useState<Record<string, string | boolean>>(() => entry
    ? { recorded_at: entry.recorded_at.replace(" ", "T").slice(0, 16), ...Object.fromEntries((FORM[type] ?? []).map(([k, , kind]) => [k, kind === "check" ? !!entry[k] : entry[k] == null || entry[k] === 0 && k !== "urine" ? "" : String(entry[k])])) }
    : { recorded_at: nowLocal(), ...(type === "Phototherapy" ? { photo_on: c.phototherapy_on ? "Stopped" : "Started" } : {}) });
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const data = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x !== false).map(([k, x]) => [k, x === true ? 1 : x]));
      data.recorded_at = String(v.recorded_at).replace("T", " ") + ":00";
      const r = entry ? await call<{ alert_flags?: string }>("nursery.amend_entry", { entry: entry.name, data: JSON.stringify(data), reason: why || undefined })
        : await call<{ alert_flags?: string }>("nursery.add_entry", { name: c.name, entry_type: type, data: JSON.stringify(data) });
      if (r.alert_flags) toast.error(`Alert: ${r.alert_flags.split("\n")[0]}`, { duration: 8000 }); else toast.success(entry ? `${type} corrected — the old entry stays struck through` : `${type} saved`);
      onDone();
    } catch (e) { toast.error(humanizeError(e), { duration: 6000 }); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${entry ? "Edit" : type === "Phototherapy" ? "" : "Add"} ${type.toLowerCase()} · ${c.baby_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Time" className="sm:col-span-2"><input type="datetime-local" className={inputCls} value={String(v.recorded_at)} max={nowLocal()} onChange={(e) => setV({ ...v, recorded_at: e.target.value })} /></Field>
        {(FORM[type] ?? []).map(([k, l, kind, opts]) => (
          <Field key={k} label={l} className={kind === "textarea" || k === "note" ? "sm:col-span-2" : ""}>
            {kind === "select" ? <select className={inputCls} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })}><option value="">—</option>{opts!.filter(Boolean).map((o) => <option key={o}>{o}</option>)}</select>
              : kind === "vaccine" ? <select className={inputCls} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value, route: e.target.value === "BCG" ? "Intradermal" : e.target.value.startsWith("OPV") ? "Oral" : "IM" })}><option value="">—</option>{VACCINES.map((o) => <option key={o}>{o}</option>)}</select>
              : kind === "textarea" ? <textarea className={cn(inputCls, "h-24 py-2")} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              : kind === "check" ? <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} className="h-4 w-4" />Yes — approved for parents</label>
              : <input className={inputCls} inputMode={kind === "number" ? "decimal" : undefined} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
          </Field>))}
      </div>
      {entry && <Field label="Reason for the correction (optional)" className="mt-3"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Typing error / wrong time" /></Field>}
      {entry && <p className="mt-2 text-xs text-muted-foreground">The original entry stays in the chart, struck through, so the audit trail is complete.</p>}
      {type === "Bilirubin" && <p className="mt-3 text-xs text-muted-foreground">Phototherapy line at {ageLabel(c.age_hours)}: {c.threshold_now} mg/dL [placeholder]. Values at or above the line raise an alert.</p>}
      {type === "Vitals" && <p className="mt-3 text-xs text-muted-foreground">Alert limits [confirm]: temp 36.5–37.5 °C · HR 100–180 · RR 30–60 · SpO₂ ≥ {c.unit === "NICU" ? 90 : 95}%.</p>}
    </Modal>
  );
}

function MoveModal({ c, onClose, onDone }: { c: Chart; onClose: () => void; onDone: () => void }) {
  const { data: ctx } = useApi<{ free: Record<string, { name: string; bed_no: string; ward: string }[]> }>("nursery.context");
  const [unit, setUnit] = useState(c.unit === "NICU" ? "Nursery" : "NICU");
  const [cot, setCot] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await call("nursery.move", { name: c.name, unit, cot: cot || undefined, reason: reason || undefined }); toast.success(`Moved to ${unit}`); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <Modal title={`Move ${c.baby_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button disabled={busy} onClick={() => void go()}><MoveRight className="h-4 w-4" />Move</Button></>}>
      <div className="grid grid-cols-3 gap-2">{UNITS.map((u) => <button key={u} type="button" disabled={u === c.unit} onClick={() => { setUnit(u); setCot(""); }} className={cn("rounded-lg border px-2 py-2 text-sm font-semibold disabled:opacity-40", unit === u ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{u}</button>)}</div>
      <Field label="Cot" className="mt-3"><select className={inputCls} value={cot} onChange={(e) => setCot(e.target.value)}><option value="">First free</option>{(ctx?.free[unit] ?? []).map((b) => <option key={b.name} value={b.name}>{b.bed_no} · {b.ward}</option>)}</select></Field>
      <Field label={unit === "NICU" ? "Reason (NICU admission)" : "Reason"} className="mt-3"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={unit === "NICU" ? "Respiratory distress" : "Stable — back to mother"} /></Field>
      <p className="mt-3 text-xs text-muted-foreground">Recorded as an IPD bed transfer, so the bill follows the cot rate of the new unit.</p>
    </Modal>
  );
}

function StrikeModal({ e, onClose, onDone }: { e: E; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const go = async () => { try { await call("nursery.strike", { entry: e.name, reason }); toast.success("Entry struck through"); onDone(); } catch (x) { toast.error(humanizeError(x)); } };
  return (
    <Modal title="Delete this entry?" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Keep</Button><Button variant="danger" disabled={reason.trim().length < 4} onClick={() => void go()}><Trash2 className="h-4 w-4" />Delete (strike through)</Button></>}>
      <p className="text-sm">{e.entry_type} at {e.recorded_at}. The entry stays visible, struck through, with your name, the time and the reason — it is never deleted.</p>
      <Field label="Reason" className="mt-3"><input className={inputCls} value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Entered on the wrong baby / wrong value" autoFocus /></Field>
    </Modal>
  );
}

function SecurityTab({ c, onDone }: { c: Chart; onDone: () => void }) {
  const { hasRole } = useAuth();
  const [v, setV] = useState({ event: "Band check at hand-over", with_whom: "", staff_id: "", band_match: true, note: "", tag_no: c.tag_no ?? "" });
  const can = hasRole("PW Nursery Nurse", "PW NICU Nurse", "PW Security", "PW Ward Admin");
  const save = async () => { try { await call("nursery.security_event", { name: c.name, ...v, band_match: v.band_match ? 1 : 0 }); toast.success("Logged"); onDone(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm"><table className="w-full min-w-[600px] text-sm"><thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Time</th><th className="text-start">Event</th><th className="text-start">With</th><th className="text-start">Bands</th><th className="text-start">Staff</th><th className="text-start">Note</th></tr></thead>
        <tbody>{c.security.map((s, i) => <tr key={i} className="border-t border-border/60"><td className="px-3 py-2 tabular-nums">{String(s.at).slice(5, 16)}</td><td className={cn("font-semibold", s.event === "Tag alarm" && "text-rose-600")}>{s.event}</td><td>{s.with_whom}</td>
          <td>{s.event === "Band check at hand-over" ? (s.band_match ? <span className="font-bold text-emerald-600">✓ match</span> : <span className="font-bold text-rose-600">✗ NO MATCH</span>) : ""}</td><td className="text-xs">{s.staff_id || s.by_user}</td><td className="text-xs">{s.note}</td></tr>)}</tbody></table></div>
      {can && c.status !== "Discharged" && <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-primary" />Log a security event</h3>
        <div className="space-y-3">
          <Field label="Event"><select className={inputCls} value={v.event} onChange={(e) => setV({ ...v, event: e.target.value })}>{["Band check at hand-over", "Left ward", "Returned to ward", "Tag applied", "Tag removed", "Tag alarm", "Alarm resolved"].map((x) => <option key={x}>{x}</option>)}</select></Field>
          {v.event === "Band check at hand-over" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.band_match} onChange={(e) => setV({ ...v, band_match: e.target.checked })} className="h-4 w-4" />Mother's and baby's band numbers match ({c.band_no})</label>}
          {v.event === "Tag applied" && <Field label="Tag no."><input className={inputCls} value={v.tag_no} onChange={(e) => setV({ ...v, tag_no: e.target.value })} /></Field>}
          <Field label="Handed to / with"><input className={inputCls} value={v.with_whom} onChange={(e) => setV({ ...v, with_whom: e.target.value })} placeholder="Mother (verified) / Dr. … / X-ray" /></Field>
          <Field label="Staff ID"><input className={inputCls} value={v.staff_id} onChange={(e) => setV({ ...v, staff_id: e.target.value })} /></Field>
          <Field label="Note"><input className={inputCls} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
          <Button className="w-full" onClick={() => void save()}><Lock className="h-4 w-4" />Log event</Button>
        </div></div>}
    </div>
  );
}

function UpdatesTab({ c, onDone, canPost }: { c: Chart; onDone: () => void; canPost: boolean }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (f?: File | null) => {
    if (!f) return;
    const data = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
    try { setPhoto((await call<{ file_url: string }>("nursery.upload_photo", { name: c.name, filename: f.name, filedata: data })).file_url); } catch (e) { toast.error(humanizeError(e)); }
  };
  const post = async (approve: boolean) => { setBusy(true); try { await call("nursery.post_update", { name: c.name, text, photo: photo || undefined, approve: approve ? 1 : 0 }); setText(""); setPhoto(null); toast.success(approve ? "Shared with parents" : "Saved as draft"); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  const setStatus = async (u: string, status: string) => { try { await call("nursery.approve_update", { update: u, status }); onDone(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-2">{c.updates.length ? c.updates.map((u) => <div key={u.name} className="flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        {u.photo && <a href={u.photo} target="_blank" rel="noreferrer"><img src={u.photo} alt="" className="h-20 w-20 rounded-xl object-cover" /></a>}
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-xs text-muted-foreground">{String(u.posted_at).slice(0, 16)}<span className={cn("rounded-full px-2 py-0.5 font-bold", u.status === "Approved" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-muted")}>{u.status}</span></div>
          <p className="mt-1 text-sm">{u.text}</p>
          {canPost && <div className="mt-2 flex gap-2">{u.status !== "Approved" && <Button size="xs" variant="outline" onClick={() => void setStatus(u.name, "Approved")}><Eye className="h-3.5 w-3.5" />Approve for parents</Button>}{u.status !== "Hidden" && <Button size="xs" variant="ghost" onClick={() => void setStatus(u.name, "Hidden")}>Hide</Button>}</div>}</div></div>)
        : <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No updates yet.</p>}</div>
      {canPost && <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold"><Heart className="h-4 w-4 text-rose-500" />Update for the parents (My Baby)</h3>
        <textarea className={cn(inputCls, "h-28 py-2")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Plain, kind words — no test results or diagnoses." />
        {c.portal_photo_consent ? <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-primary"><ImagePlus className="h-4 w-4" />{photo ? "Photo attached ✓" : "Add photo of the day"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} /></label>
          : <p className="mt-2 text-xs text-muted-foreground">Photos are off — the parents have not consented.</p>}
        <div className="mt-3 flex gap-2"><Button variant="outline" disabled={!text.trim() || busy} onClick={() => void post(false)}>Save draft</Button><Button variant="submit" disabled={!text.trim() || busy} onClick={() => void post(true)}>Share now</Button></div>
      </div>}
    </div>
  );
}

const CHECKS: [string, string][] = [["dc_feeding", "Feeding established"], ["dc_weight", "Weight acceptable (loss < 10%)"], ["dc_jaundice", "Jaundice cleared / safe"], ["dc_screenings", "Screenings done (hearing, CCHD)"],
  ["dc_vaccines", "Birth vaccines given"], ["dc_parent_taught", "Parents taught (feeding, cord, safe sleep, danger signs)"], ["dc_tag_removed", "Security tag removed"], ["dc_band_checked", "Bands matched at hand-over"]];

function DischargeTab({ c, doctor, onDone }: { c: Chart; doctor: boolean; onDone: () => void }) {
  const done = c.status === "Discharged";
  const [v, setV] = useState<Record<string, string | number>>(() => Object.fromEntries([...CHECKS.map(([k]) => [k, Number(c[k] || 0)]), ["discharge_diagnosis", String(c.discharge_diagnosis ?? "")],
    ["discharge_advice", String(c.discharge_advice ?? "Exclusive breastfeeding on demand. Keep the cord clean and dry. Sleep on the back.")], ["discharge_meds", String(c.discharge_meds ?? "")],
    ["follow_up_date", String(c.follow_up_date ?? new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10))]]));
  const [busy, setBusy] = useState(false);
  const hints: Record<string, boolean> = { dc_weight: c.current_weight_g ? (c.birth_weight_g - c.current_weight_g) / c.birth_weight_g < 0.1 : false, dc_tag_removed: !c.tag_active,
    dc_vaccines: ["BCG", "OPV-0", "Hepatitis B (birth dose)"].every((x) => c.epi.find((r) => r.vaccine === x)?.given_at),
    dc_screenings: ["Hearing (OAE)", "CCHD pulse oximetry"].every((s) => c.entries.some((e) => e.entry_type === "Screening" && e.screening === s && !e.cancelled)) };
  const all = CHECKS.every(([k]) => Number(v[k]));
  const go = async () => { setBusy(true); try { await call("nursery.discharge", { name: c.name, data: JSON.stringify(v) }); toast.success("Discharged — papers signed"); onDone(); } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); } };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><ClipboardCheck className="h-4 w-4 text-primary" />Discharge checklist</h3>
        <ul className="space-y-2">{CHECKS.map(([k, l]) => <li key={k}><label className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm", Number(v[k]) ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10" : "border-border")}>
          <input type="checkbox" disabled={done || !doctor} checked={!!Number(v[k])} onChange={(e) => setV({ ...v, [k]: e.target.checked ? 1 : 0 })} className="h-4 w-4" /><span className="flex-1">{l}</span>
          {k in hints && <span className={cn("text-[11px] font-semibold", hints[k] ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>{hints[k] ? "chart confirms" : "chart: not yet"}</span>}</label></li>)}</ul>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        {done ? <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm dark:bg-emerald-500/10"><Lock className="mt-0.5 h-5 w-5 text-emerald-700" /><div><b>Discharged {String(c.discharged_at ?? "").slice(0, 16)}</b> — papers signed (v{c.doc_version}). Open them in the Papers tab; the mother can download them in My Baby.</div></div> : <>
          <Field label="Diagnosis"><textarea className={cn(inputCls, "h-16 py-2")} disabled={!doctor} value={String(v.discharge_diagnosis)} onChange={(e) => setV({ ...v, discharge_diagnosis: e.target.value })} placeholder="Healthy term newborn" /></Field>
          <Field label="Advice" className="mt-3"><textarea className={cn(inputCls, "h-20 py-2")} disabled={!doctor} value={String(v.discharge_advice)} onChange={(e) => setV({ ...v, discharge_advice: e.target.value })} /></Field>
          <Field label="Medicines at discharge" className="mt-3"><input className={inputCls} disabled={!doctor} value={String(v.discharge_meds)} onChange={(e) => setV({ ...v, discharge_meds: e.target.value })} placeholder="None / Vitamin D drops 400 IU daily" /></Field>
          <Field label="Follow-up" className="mt-3"><input type="date" className={inputCls} disabled={!doctor} value={String(v.follow_up_date)} onChange={(e) => setV({ ...v, follow_up_date: e.target.value })} /></Field>
          {doctor ? <Button variant="submit" className="mt-4 w-full" disabled={!all || busy} onClick={() => void go()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Discharge & sign papers</Button>
            : <p className="mt-4 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">The paediatrician completes the checklist and signs the discharge.</p>}
          <p className="mt-2 text-xs text-muted-foreground">Signing locks the summary, adds the QR verification and sends the cot admission to the billing desk (Discharge Pending).</p></>}
      </div>
    </div>
  );
}

function PapersTab({ c }: { c: Chart }) {
  const [html, setHtml] = useState<string | null>(null);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const docs: [string, string, boolean][] = [["discharge", "Newborn discharge summary", true], ["birth", "Birth record slip (NADRA / union council)", true], ["epi", "EPI vaccination card", true], ["nicu", "NICU daily progress report", c.unit === "NICU" || c.entries.some((e) => e.entry_type === "NICU Support")]];
  const q = (kind: string) => `name=${encodeURIComponent(c.name)}&kind=${kind}${kind === "nicu" ? `&day=${day}` : ""}`;
  const preview = async (kind: string) => { try { setHtml((await call<{ html: string }>("nursery.document", { name: c.name, kind, day: kind === "nicu" ? day : undefined })).html); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {docs.filter((d) => d[2]).map(([k, l]) => <div key={k} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><b>{l}</b><div className="text-xs text-muted-foreground">A4 · letterhead · QR verification{k === "discharge" && c.status !== "Discharged" ? " · DRAFT until discharge" : ""}</div></div>
        {k === "nicu" && <input type="date" className={cn(inputCls, "w-40")} value={day} onChange={(e) => setDay(e.target.value)} />}
        <Button size="sm" variant="outline" onClick={() => void preview(k)}><Eye className="h-4 w-4" />Preview</Button>
        <a href={`/api/method/hospital_vvs.api.nursery.document_pdf?${q(k)}`} target="_blank" rel="noreferrer"><Button size="sm"><Download className="h-4 w-4" />PDF</Button></a>
      </div>)}
      {html && <Modal title="Preview" wide onClose={() => setHtml(null)} footer={<Button onClick={() => (document.getElementById("nz-prev") as HTMLIFrameElement)?.contentWindow?.print()}><Printer className="h-4 w-4" />Print</Button>}>
        <iframe id="nz-prev" title="Document" srcDoc={html} className="h-[72vh] w-full rounded-lg border border-border bg-white" /></Modal>}
    </div>
  );
}
