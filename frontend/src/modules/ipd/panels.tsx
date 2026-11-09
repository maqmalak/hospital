import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCheck, ClipboardPen, FlaskConical, HandHeart, Pill, Plus, Search, Slash, Stethoscope, Syringe, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { ChargeDot, Chip, type Ctx, dt, FREQS, rs, ROUTES, tm } from "./shared";

export interface Target { bed_allotment?: string; er_visit?: string }
const run = async (method: string, args: Record<string, unknown>, ok: string, done?: () => void) => {
  try { await call(method, args); toast.success(ok); done?.(); return true; } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); return false; }
};

// ------------------------------------------------------------------ medication orders + MAR
export interface Order { name: string; item?: string; item_name: string; dose: string; route: string; frequency: string; times?: string; days?: number; start_at?: string;
  status: string; alert_type?: string; alert_message?: string; override_reason?: string; stop_reason?: string; units_per_dose?: number }
export interface Dose { name: string; medication_order: string; item_name: string; dose: string; route?: string; scheduled_at: string; status: string;
  administered_by?: string; administered_at?: string; reason?: string; approved_by?: string; batch_no?: string }

export function MedicationPanel({ target, patient, orders, mar, refresh, gate, canOrder, canChart }: { target: Target; patient: string; orders: Order[]; mar: Dose[];
  refresh: () => void; gate?: boolean; canOrder: boolean; canChart: boolean }) {
  const [adding, setAdding] = useState(false);
  const [dose, setDose] = useState<Dose | null>(null);
  const days = useMemo(() => [...new Set(mar.map((d) => d.scheduled_at.slice(0, 10)))].sort(), [mar]);
  const nowIso = new Date().toISOString().slice(0, 16).replace("T", " ");
  const pending = mar.filter((d) => d.status === "Pending Approval");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-sm font-bold">Medication orders <span className="font-normal text-muted-foreground">· {orders.filter((o) => o.status === "Active").length} active</span></h3>
        {gate && pending.length > 0 && canChart && <Button size="sm" variant="workflow" onClick={() => void run("ipd.approve_dose", { names: pending.map((p) => p.name) },
          `${pending.length} dose(s) approved`, refresh)}><CheckCheck className="h-4 w-4" />Approve {pending.length}</Button>}
        {canOrder && <Button size="sm" variant="save" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Order medicine</Button>}
      </div>
      {!orders.length && <Empty title="No medicines ordered" icon={Pill} />}
      {orders.map((o) => {
        const ds = mar.filter((d) => d.medication_order === o.name);
        return (
          <div key={o.name} className={cn("rounded-2xl border bg-card p-3", o.status !== "Active" ? "border-border opacity-70" : "border-emerald-200 dark:border-emerald-500/30")}>
            <div className="flex flex-wrap items-start gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Pill className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-bold">{o.item_name} <span className="font-normal text-muted-foreground">· {o.dose} · {o.route} · {o.frequency}{o.days ? ` × ${o.days}d` : ""}</span></div>
                {o.alert_type && <div className="mt-0.5 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{o.alert_type}{o.override_reason ? ` — override: ${o.override_reason}` : ""}</span></div>}
                {o.stop_reason && <div className="text-xs text-rose-600">Stopped: {o.stop_reason}</div>}
              </div>
              <Chip s={o.status} />
              {o.status === "Active" && o.frequency === "PRN" && canChart && <Button size="xs" variant="menu" onClick={() => { const n = prompt("Why is the PRN dose needed?"); if (n !== null)
                void run("ipd.prn_dose", { order: o.name, note: n }, "PRN dose added", refresh); }}><Plus className="h-3 w-3" />PRN dose</Button>}
              {o.status === "Active" && canOrder && <Button size="xs" variant="danger" onClick={() => { const r = prompt("Why stop this medicine?"); if (r) void run("ipd.stop_order",
                { name: o.name, reason: r }, "Order stopped", refresh); }}><Slash className="h-3 w-3" />Stop</Button>}
            </div>
            {ds.length > 0 && <div className="mt-3 overflow-x-auto"><div className="flex min-w-max gap-3">{days.map((day) => {
              const list = ds.filter((d) => d.scheduled_at.startsWith(day));
              if (!list.length) return null;
              return (<div key={day}><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{new Date(day).toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" })}</div>
                <div className="flex gap-1">{list.map((d) => <DoseChip key={d.name} d={d} late={d.scheduled_at < nowIso} onClick={() => canChart && setDose(d)} />)}</div></div>);
            })}</div></div>}
          </div>);
      })}
      {adding && <OrderDialog target={target} patient={patient} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
      {dose && <DoseDialog d={dose} gate={!!gate} onClose={() => setDose(null)} onDone={() => { setDose(null); refresh(); }} />}
    </div>
  );
}

function DoseChip({ d, late, onClick }: { d: Dose; late: boolean; onClick: () => void }) {
  const tone = d.status === "Administered" ? "bg-emerald-500 text-white" : d.status === "Missed" ? "bg-rose-500 text-white" : d.status === "Refused" ? "bg-orange-500 text-white"
    : d.status === "Held" ? "bg-slate-400 text-white" : d.status === "Cancelled" ? "bg-muted text-muted-foreground line-through" : d.status === "Pending Approval"
    ? "border-2 border-dashed border-amber-500 text-amber-700 dark:text-amber-300" : late ? "border-2 border-rose-500 text-rose-700 dark:text-rose-300 animate-pulse" : "border border-border";
  return <button onClick={onClick} title={`${d.status}${d.administered_by ? ` · ${d.administered_by}` : ""}${d.reason ? ` · ${d.reason}` : ""}`}
    className={cn("flex h-11 w-14 flex-col items-center justify-center rounded-lg text-[11px] font-bold tabular-nums", tone)}>
    {tm(d.scheduled_at)}<span className="text-[9px] font-semibold opacity-80">{d.status === "Administered" ? tm(d.administered_at) : d.status === "Pending Approval" ? "approve" : d.status === "Scheduled" ? "" : d.status.slice(0, 6)}</span></button>;
}

function DoseDialog({ d, gate, onClose, onDone }: { d: Dose; gate: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const done = ["Administered", "Missed", "Refused", "Cancelled"].includes(d.status);
  return (
    <Dialog open onClose={onClose} title={`${d.item_name} · ${d.dose}`} description={`Due ${dt(d.scheduled_at)} · ${d.route ?? ""}`} size="sm">
      {done ? <div className="space-y-1 text-sm"><Chip s={d.status} /><div>{d.administered_by && `${d.administered_by} · ${dt(d.administered_at)}`}</div>{d.batch_no && <div className="text-muted-foreground">Batch {d.batch_no}</div>}
        {d.reason && <div className="text-muted-foreground">{d.reason}</div>}</div> : (
        <div className="space-y-3">
          {gate && d.status === "Pending Approval" && <Button variant="workflow" className="w-full" onClick={() => void run("ipd.approve_dose", { names: d.name }, "Dose approved", onDone)}><Check className="h-4 w-4" />Approve this dose</Button>}
          <Button variant="submit" size="lg" className="w-full" disabled={d.status === "Pending Approval"} onClick={() => void run("ipd.chart_dose", { name: d.name, status: "Administered" }, "Dose given", onDone)}>
            <Syringe className="h-5 w-5" />Given now</Button>
          <Field label="Not given — reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Patient asleep, NPO, vomiting…" /></Field>
          <div className="grid grid-cols-3 gap-2">{["Missed", "Refused", "Held"].map((s) => <Button key={s} variant="neutral" disabled={!reason.trim()}
            onClick={() => void run("ipd.chart_dose", { name: d.name, status: s, reason }, `Marked ${s.toLowerCase()}`, onDone)}>{s}</Button>)}</div>
        </div>)}
    </Dialog>
  );
}

interface ItemHit { name: string; item_name: string; hv_strength?: string; hv_dosage_form?: string; stock_uom: string }
interface Alert { type: string; severity: string; message: string }

function OrderDialog({ target, patient, onClose, onDone }: { target: Target; patient: string; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [item, setItem] = useState<ItemHit | null>(null);
  const [f, setF] = useState({ dose: "1 tab", units_per_dose: "1", route: "Oral", frequency: "BD", days: "3", times: "", override_reason: "" });
  const [alerts, setAlerts] = useState<{ alerts: Alert[]; blocking: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const hits = useApi<ItemHit[]>("ipd.search_items", { q, stock_only: 1 }, { enabled: q.length > 1 && !item });
  useEffect(() => {
    if (!item) { setAlerts(null); return; }
    void call<{ alerts: Alert[]; blocking: boolean }>("ipd.check_medicine", { patient, item: item.name, dose: f.dose, frequency: f.frequency, ...target }).then(setAlerts).catch(() => setAlerts(null));
  }, [item, f.frequency, f.dose, patient, target]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    const ok = await run("ipd.order_medicine", { data: { ...target, item: item!.name, dose: f.dose, units_per_dose: Number(f.units_per_dose) || 1, route: f.route,
      frequency: f.frequency, days: Number(f.days) || 1, times: f.times || undefined, override_reason: f.override_reason || undefined, prn: f.frequency === "PRN" ? 1 : 0 } },
      `${item!.item_name} ordered`, onDone);
    if (!ok) setBusy(false);
  };
  return (
    <Dialog open onClose={onClose} title="Order medicine" description="From the IPD dispensing store · allergy and interaction checks apply" size="lg">
      <div className="space-y-3">
        {!item ? <div className="relative"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input autoFocus className={inputCls + " ps-9"} placeholder="Medicine (brand or generic)" value={q} onChange={(e) => setQ(e.target.value)} />
          {(hits.data ?? []).length > 0 && <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">{hits.data!.map((h) => (
            <button key={h.name} onClick={() => setItem(h)} className="block w-full px-3 py-2 text-start text-sm hover:bg-muted"><b>{h.item_name}</b> <span className="text-xs text-muted-foreground">{h.hv_strength} {h.hv_dosage_form} · {h.name}</span></button>))}</div>}
        </div> : <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-2 dark:bg-emerald-500/10"><Pill className="h-4 w-4 text-emerald-600" />
          <b className="flex-1">{item.item_name}</b><button onClick={() => { setItem(null); setQ(""); }}><X className="h-4 w-4" /></button></div>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Dose"><input className={inputCls} value={f.dose} onChange={set("dose")} /></Field>
          <Field label="Units per dose" hint="Issued & billed"><input className={inputCls} inputMode="decimal" value={f.units_per_dose} onChange={set("units_per_dose")} /></Field>
          <Field label="Route"><select className={inputCls} value={f.route} onChange={set("route")}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Days"><input className={inputCls} inputMode="numeric" value={f.days} onChange={set("days")} /></Field>
        </div>
        <div className="flex flex-wrap gap-1">{FREQS.map((x) => <button key={x} onClick={() => setF((v) => ({ ...v, frequency: x }))} className={cn("rounded-lg border px-2.5 py-1 text-xs font-bold",
          f.frequency === x ? "border-emerald-600 bg-emerald-600 text-white" : "border-border")}>{x}</button>)}</div>
        <Field label="Dose times" hint="Optional, e.g. 09:00,21:00 — empty uses the ward's times for the frequency"><input className={inputCls} value={f.times} onChange={set("times")} /></Field>
        {alerts?.alerts.length ? <div className={cn("space-y-1 rounded-xl border p-3 text-sm", alerts.blocking ? "border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"
          : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200")}>{alerts.alerts.map((a, i) => <div key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><b>{a.type}:</b> {a.message}</span></div>)}
          {alerts.blocking && <input className={inputCls + " mt-2"} placeholder="Override reason (required)" value={f.override_reason} onChange={set("override_reason")} />}</div> : null}
        <div className="flex justify-end gap-2 border-t border-border pt-3"><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="submit" disabled={!item || (alerts?.blocking && !f.override_reason.trim())} loading={busy} onClick={() => void save()}><Check className="h-4 w-4" />Order</Button></div>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ vitals
export interface Vital { name?: string; recorded_at: string; bp_systolic?: number; bp_diastolic?: number; pulse?: number; temperature?: number; spo2?: number; resp_rate?: number;
  rbs?: number; pain_score?: number; gcs?: number; intake_ml?: number; output_ml?: number; note?: string; recorded_by?: string }
const V_FIELDS: [keyof Vital, string, string][] = [["bp_systolic", "BP sys", "mmHg"], ["bp_diastolic", "BP dia", "mmHg"], ["pulse", "Pulse", "/min"], ["temperature", "Temp", "°F"],
  ["spo2", "SpO₂", "%"], ["resp_rate", "Resp", "/min"], ["rbs", "RBS", "mg/dL"], ["pain_score", "Pain", "0–10"], ["gcs", "GCS", "3–15"], ["intake_ml", "Intake", "ml"], ["output_ml", "Output", "ml"]];

export function VitalsPanel({ target, vitals, refresh, canAdd }: { target: Target; vitals: Vital[]; refresh: () => void; canAdd: boolean }) {
  const [f, setF] = useState<Record<string, string>>({});
  const save = () => void run("ipd.add_vitals", { data: { ...target, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "")) } }, "Vitals saved", () => { setF({}); refresh(); });
  const pts = [...vitals].reverse().filter((v) => v.pulse || v.temperature || v.spo2);
  return (
    <div className="space-y-4">
      {canAdd && <div className="rounded-2xl border border-border bg-card p-3"><div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:grid-cols-11">{V_FIELDS.map(([k, l, u]) => (
        <label key={k} className="text-[11px] font-semibold text-muted-foreground">{l}<input className={inputCls + " mt-0.5 h-9 text-center"} inputMode="decimal" placeholder={u} value={f[k] ?? ""}
          onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} /></label>))}</div>
        <div className="mt-2 flex gap-2"><input className={inputCls} placeholder="Note" value={f.note ?? ""} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />
          <Button variant="save" disabled={!Object.values(f).some(Boolean)} onClick={save}><Check className="h-4 w-4" />Save</Button></div></div>}
      {pts.length > 1 && <Trend pts={pts} />}
      <div className="overflow-x-auto rounded-2xl border border-border"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr>
        <th className="px-2 py-2 text-start">Time</th>{V_FIELDS.slice(0, 9).map(([k, l]) => <th key={k} className="px-2 py-2 text-end">{l}</th>)}<th className="px-2 py-2 text-end">I/O</th></tr></thead>
        <tbody>{vitals.map((v, i) => <tr key={v.name ?? i} className="border-t border-border"><td className="whitespace-nowrap px-2 py-1.5">{dt(v.recorded_at)}</td>
          {V_FIELDS.slice(0, 9).map(([k]) => { const n = Number(v[k]) || 0; const bad = (k === "spo2" && n && n < 92) || (k === "pulse" && (n > 120 || (n && n < 50))) || (k === "temperature" && n > 100.4) || (k === "bp_systolic" && (n > 160 || (n && n < 90)));
            return <td key={k} className={cn("px-2 py-1.5 text-end tabular-nums", bad && "font-bold text-rose-600")}>{n || ""}</td>; })}
          <td className="px-2 py-1.5 text-end tabular-nums text-muted-foreground">{v.intake_ml || v.output_ml ? `${v.intake_ml ?? 0}/${v.output_ml ?? 0}` : ""}</td></tr>)}</tbody></table>
        {!vitals.length && <div className="p-6 text-center text-sm text-muted-foreground">No vitals yet</div>}</div>
    </div>
  );
}

function Trend({ pts }: { pts: Vital[] }) {
  const W = 640, H = 120, pad = 24;
  const series: [keyof Vital, string, number, number][] = [["pulse", "#e11d48", 40, 160], ["spo2", "#0284c7", 80, 100], ["temperature", "#d97706", 95, 105]];
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(pts.length - 1, 1);
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-1 flex gap-4 text-xs font-semibold">{series.map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="h-2 w-4 rounded" style={{ background: c }} />{k === "spo2" ? "SpO₂" : k === "pulse" ? "Pulse" : "Temp"}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full">
        {series.map(([k, c, lo, hi]) => { const p = pts.map((v, i) => [x(i), Number(v[k]) || 0] as const).filter(([, y]) => y);
          const y = (n: number) => H - pad / 2 - ((Math.min(Math.max(n, lo), hi) - lo) / (hi - lo)) * (H - pad);
          return <g key={k}><polyline fill="none" stroke={c} strokeWidth={2} points={p.map(([a, b]) => `${a},${y(b)}`).join(" ")} />{p.map(([a, b], i) => <circle key={i} cx={a} cy={y(b)} r={4} fill={c} stroke="hsl(var(--card))" strokeWidth={2}><title>{`${k} ${b}`}</title></circle>)}</g>; })}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ notes & rounds
export interface Note { name: string; note_type: string; note: string; recorded_at: string; author?: string }
export function NotesPanel({ target, notes, rounds, refresh, canWrite, isDoctor }: { target: Target; notes: Note[]; rounds?: { name: string; round_no: number; doctor: string; round_at: string;
  findings?: string; plan?: string; orders?: string }[]; refresh: () => void; canWrite: boolean; isDoctor: boolean }) {
  const [type, setType] = useState(target.er_visit && !target.bed_allotment ? "ER" : isDoctor ? "Progress" : "Nursing");
  const [text, setText] = useState("");
  const [round, setRound] = useState(false);
  const [r, setR] = useState({ findings: "", plan: "", orders: "" });
  const feed = [...notes.map((n) => ({ kind: "note" as const, at: n.recorded_at, n })), ...(rounds ?? []).map((w) => ({ kind: "round" as const, at: w.round_at, w }))].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="space-y-3">
      {canWrite && <div className="rounded-2xl border border-border bg-card p-3">
        <div className="mb-2 flex flex-wrap gap-1">{(target.er_visit && !target.bed_allotment ? ["ER", "Nursing", "Procedure"] : ["Progress", "Nursing", "Consultant Visit", "Handover"]).map((x) =>
          <button key={x} onClick={() => { setType(x); setRound(false); }} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", type === x && !round ? "border-teal-600 bg-teal-600 text-white" : "border-border")}>{x}</button>)}
          {isDoctor && target.bed_allotment && <button onClick={() => setRound(true)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", round ? "border-violet-600 bg-violet-600 text-white" : "border-border")}>
            <Stethoscope className="me-1 inline h-3 w-3" />Ward round</button>}</div>
        {round ? <div className="grid gap-2 md:grid-cols-3">{(["findings", "plan", "orders"] as const).map((k) => <textarea key={k} className={inputCls + " h-24 py-2"} placeholder={k[0].toUpperCase() + k.slice(1)}
          value={r[k]} onChange={(e) => setR((x) => ({ ...x, [k]: e.target.value }))} />)}</div>
          : <textarea className={inputCls + " h-20 py-2"} placeholder="Write the note — it is signed when saved" value={text} onChange={(e) => setText(e.target.value)} />}
        <div className="mt-2 flex justify-end"><Button variant="save" disabled={round ? !r.findings && !r.plan : !text.trim()} onClick={() => round
          ? void run("ipd.add_round", { data: { ...target, ...r } }, "Round signed", () => { setR({ findings: "", plan: "", orders: "" }); refresh(); })
          : void run("ipd.add_note", { data: { ...target, note_type: type, note: text } }, "Note signed", () => { setText(""); refresh(); })}><ClipboardPen className="h-4 w-4" />Sign & save</Button></div>
      </div>}
      {!feed.length && <Empty title="No notes yet" />}
      {feed.map((x) => x.kind === "note" ? (
        <div key={x.n.name} className="rounded-xl border border-border bg-card p-3"><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Chip s={x.n.note_type} className="bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200" />
          {dt(x.n.recorded_at)} · {x.n.author}</div><div className="whitespace-pre-wrap text-sm">{x.n.note}</div></div>
      ) : (
        <div key={x.w.name} className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/5"><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white">Round {x.w.round_no}</span>{dt(x.w.round_at)} · {x.w.doctor}</div>
          {x.w.findings && <div className="text-sm"><b>Findings:</b> {x.w.findings}</div>}{x.w.plan && <div className="text-sm"><b>Plan:</b> {x.w.plan}</div>}{x.w.orders && <div className="text-sm"><b>Orders:</b> {x.w.orders}</div>}</div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ labs
export interface LabOrder { name: string; status: string; priority?: string; posting_date?: string; items: { template: string; status: string; price?: number; result?: string }[] }
export function LabsPanel({ target, labs, ctx, refresh, canOrder }: { target: Target; labs: LabOrder[]; ctx?: Ctx; refresh: () => void; canOrder: boolean }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [urgent, setUrgent] = useState(false);
  const list = (ctx?.lab_templates ?? []).filter((t) => !q || `${t.name} ${t.test_code}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex items-center"><h3 className="flex-1 text-sm font-bold">Lab orders</h3>{canOrder && <Button size="sm" variant="save" onClick={() => setOpen(true)}><FlaskConical className="h-4 w-4" />Order tests</Button>}</div>
      {!labs.length && <Empty title="No lab orders" icon={FlaskConical} />}
      {labs.map((l) => <div key={l.name} className="rounded-xl border border-border bg-card p-3"><div className="mb-2 flex items-center gap-2"><b className="font-mono text-sm">{l.name}</b>
        {l.priority === "Urgent" && <span className="rounded-full bg-rose-600 px-2 text-[10px] font-bold text-white">URGENT</span>}<Chip s={l.status} /></div>
        <div className="flex flex-wrap gap-1.5">{l.items.map((i) => <span key={i.template} className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs"><b>{i.template}</b><Chip s={i.status} /></span>)}</div></div>)}
      {open && <Dialog open onClose={() => setOpen(false)} title="Order lab tests" description="Charged to the running bill — no payment at the lab counter" size="lg">
        <input autoFocus className={inputCls} placeholder="Search test" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 grid max-h-[46vh] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">{list.map((t) => { const on = sel.includes(t.name); return (
          <button key={t.name} onClick={() => setSel((s) => on ? s.filter((x) => x !== t.name) : [...s, t.name])} className={cn("flex items-center gap-2 rounded-lg border p-2 text-start text-sm",
            on ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10" : "border-border")}><span className={cn("flex h-5 w-5 items-center justify-center rounded border", on && "border-violet-600 bg-violet-600 text-white")}>{on && <Check className="h-3 w-3" />}</span>
            <span className="flex-1 truncate">{t.name}</span><span className="tabular-nums text-muted-foreground">{rs(t.price)}</span></button>); })}</div>
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />Urgent</label>
          <span className="flex-1 text-end text-sm font-bold">{rs((ctx?.lab_templates ?? []).filter((t) => sel.includes(t.name)).reduce((s, t) => s + t.price, 0))}</span>
          <Button variant="submit" disabled={!sel.length} onClick={() => void run("ipd.order_labs", { data: { ...target, tests: sel, priority: urgent ? "Urgent" : "Routine" } }, "Tests ordered — samples are waiting at the lab",
            () => { setOpen(false); setSel([]); refresh(); })}><Check className="h-4 w-4" />Order {sel.length}</Button></div>
      </Dialog>}
    </div>
  );
}

// ------------------------------------------------------------------ procedures + consent
export interface Proc { name: string; procedure_type: string; scheduled_at: string; theatre?: string; anesthesia?: string; status: string; consent?: string; completed_at?: string;
  procedure_fee?: number; theatre_charge?: number; anesthesia_charge?: number; notes?: string; cancel_reason?: string; team?: { role: string; doctor?: string; person_name?: string }[] }
export function ProceduresPanel({ target, procs, ctx, refresh, canWrite }: { target: Target; procs: Proc[]; ctx?: Ctx; refresh: () => void; canWrite: boolean }) {
  const [adding, setAdding] = useState(false);
  const [consent, setConsent] = useState<Proc | null>(null);
  const [f, setF] = useState({ procedure_type: "", scheduled_at: "", theatre: "Minor OT", anesthesia: "Local", surgeon: "", assistant: "", anesthetist: "", notes: "" });
  const pt = ctx?.procedure_types.find((p) => p.name === f.procedure_type);
  const save = () => void run("ipd.schedule_procedure", { data: { ...target, procedure_type: f.procedure_type, scheduled_at: f.scheduled_at ? f.scheduled_at.replace("T", " ") + ":00" : undefined,
    theatre: f.theatre, anesthesia: f.anesthesia, notes: f.notes, team: [["Surgeon", f.surgeon], ["Assistant", f.assistant], ["Anesthetist", f.anesthetist]].filter(([, d]) => d)
      .map(([role, d]) => ({ role, doctor: d })) } }, "Procedure scheduled", () => { setAdding(false); refresh(); });
  return (
    <div className="space-y-3">
      <div className="flex items-center"><h3 className="flex-1 text-sm font-bold">Procedures</h3>{canWrite && <Button size="sm" variant="save" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Schedule</Button>}</div>
      {!procs.length && <Empty title="No procedures" />}
      {procs.map((p) => (
        <div key={p.name} className="rounded-2xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2"><b className="flex-1">{p.procedure_type}</b><Chip s={p.status} />
            {p.consent ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"><HandHeart className="h-3 w-3" />Consent {p.consent}</span>
              : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">No consent yet</span>}</div>
          <div className="mt-1 text-xs text-muted-foreground">{dt(p.scheduled_at)} · {p.theatre} · {p.anesthesia} anesthesia · {rs((p.procedure_fee ?? 0) + (p.theatre_charge ?? 0) + (p.anesthesia_charge ?? 0))}
            {p.team?.length ? ` · ${p.team.map((t) => `${t.role}: ${t.doctor || t.person_name}`).join(", ")}` : ""}</div>
          {canWrite && ["Scheduled", "In Progress"].includes(p.status) && <div className="mt-2 flex flex-wrap gap-1.5">
            {!p.consent && <Button size="xs" variant="menu" onClick={() => setConsent(p)}><HandHeart className="h-3 w-3" />Record consent</Button>}
            {p.status === "Scheduled" && <Button size="xs" variant="workflow" onClick={() => void run("ipd.procedure_status", { name: p.name, status: "In Progress" }, "Procedure started", refresh)}>Start</Button>}
            <Button size="xs" variant="submit" onClick={() => { const n = prompt("Procedure notes (optional)") ?? undefined; void run("ipd.procedure_status", { name: p.name, status: "Completed", notes: n }, "Completed — charge added", refresh); }}>Complete</Button>
            <Button size="xs" variant="danger" onClick={() => { const r = prompt("Why cancel?"); if (r) void run("ipd.procedure_status", { name: p.name, status: "Cancelled", reason: r }, "Cancelled", refresh); }}>Cancel</Button></div>}
        </div>))}
      {adding && <Dialog open onClose={() => setAdding(false)} title="Schedule procedure" size="lg"><div className="space-y-3">
        <Field label="Procedure" required><select className={inputCls} value={f.procedure_type} onChange={(e) => setF({ ...f, procedure_type: e.target.value })}><option value="">—</option>
          {ctx?.procedure_types.map((p) => <option key={p.name} value={p.name}>{p.name} · {p.category} · {rs(p.price + p.theatre_charge + p.anesthesia_charge)}</option>)}</select></Field>
        {pt?.requires_consent ? <div className="text-xs text-amber-700 dark:text-amber-300">Signed consent is needed before it starts.</div> : null}
        <div className="grid gap-3 sm:grid-cols-3"><Field label="When"><input type="datetime-local" className={inputCls} value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} /></Field>
          <Field label="Where"><select className={inputCls} value={f.theatre} onChange={(e) => setF({ ...f, theatre: e.target.value })}>{["Major OT", "Minor OT", "Procedure Room", "Bedside", "Labour Room", "Cath Lab"].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Anesthesia"><select className={inputCls} value={f.anesthesia} onChange={(e) => setF({ ...f, anesthesia: e.target.value })}>{["None", "Local", "Regional", "Spinal", "General", "Sedation"].map((x) => <option key={x}>{x}</option>)}</select></Field></div>
        <div className="grid gap-3 sm:grid-cols-3">{(["surgeon", "assistant", "anesthetist"] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)}><select className={inputCls} value={f[k]}
          onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">—</option>{ctx?.doctors.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select></Field>)}</div>
        <Field label="Notes"><input className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button variant="submit" disabled={!f.procedure_type} onClick={save}><Check className="h-4 w-4" />Schedule</Button></div>
      </div></Dialog>}
      {consent && <ConsentDialog target={target} procedure={consent} onClose={() => setConsent(null)} onDone={() => { setConsent(null); refresh(); }} />}
    </div>
  );
}

export function ConsentDialog({ target, procedure, type = "Procedure", onClose, onDone }: { target: Target; procedure?: Proc; type?: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ consent_type: type, signed_by: "Patient", signer_name: "", relation: "", witness_name: "", witness_2: "", details: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open onClose={onClose} title={`Consent${procedure ? ` · ${procedure.procedure_type}` : ""}`} description="Signed on paper; record who signed and the witnesses. Attach the scan in the desk if needed." size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3"><Field label="Type"><select className={inputCls} value={f.consent_type} onChange={set("consent_type")}>{["Admission", "Procedure", "Anesthesia", "Blood Transfusion", "High Risk", "LAMA", "Other"].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Signed by"><select className={inputCls} value={f.signed_by} onChange={set("signed_by")}><option>Patient</option><option>Attendant</option></select></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Name of signer" required><input className={inputCls} value={f.signer_name} onChange={set("signer_name")} /></Field>
          {f.signed_by === "Attendant" && <Field label="Relation"><input className={inputCls} value={f.relation} onChange={set("relation")} /></Field>}</div>
        <div className="grid grid-cols-2 gap-3"><Field label="Witness" required><input className={inputCls} value={f.witness_name} onChange={set("witness_name")} /></Field>
          <Field label="Second witness"><input className={inputCls} value={f.witness_2} onChange={set("witness_2")} /></Field></div>
        <Field label="What was explained"><textarea className={inputCls + " h-16 py-2"} value={f.details} onChange={set("details")} /></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="submit" disabled={!f.signer_name || !f.witness_name}
          onClick={() => void run("ipd.record_consent", { data: { ...target, ...f, procedure: procedure?.name } }, "Consent recorded", onDone)}><Check className="h-4 w-4" />Save consent</Button></div>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ charges (ad-hoc, consumable, oxygen)
export function ChargeDialog({ target, ctx, onClose, onDone }: { target: Target; ctx?: Ctx; onClose: () => void; onDone: () => void }) {
  const { hasRole } = useAuth();
  const canRate = hasRole("PW Receptionist", "PW Accountant");
  const [kind, setKind] = useState<"Ad-hoc" | "Consumable" | "Oxygen">("Ad-hoc");
  const [item, setItem] = useState("");
  const [q, setQ] = useState("");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const [desc, setDesc] = useState("");
  const stock = useApi<{ name: string; item_name: string; standard_rate: number }[]>("ipd.search_items", { q, stock_only: 1 }, { enabled: kind === "Consumable" && q.length > 1 });
  const chosen = ctx?.charge_items.find((i) => i.name === item);
  const preview = kind === "Oxygen" ? (Number(qty) || 0) * (ctx?.flags.oxygen_rate || 0) : (Number(rate) || chosen?.standard_rate || 0) * (Number(qty) || 1);
  return (
    <Dialog open onClose={onClose} title="Add a charge" description="Posts to the running bill at once" size="md">
      <div className="space-y-3">
        <div className="flex gap-1 rounded-xl bg-muted p-1">{(["Ad-hoc", "Consumable", "Oxygen"] as const).map((k) => <button key={k} onClick={() => { setKind(k); setItem(""); }}
          className={cn("flex-1 rounded-lg py-1.5 text-sm font-semibold", kind === k ? "bg-card shadow" : "text-muted-foreground")}>{k === "Ad-hoc" ? "Service" : k}</button>)}</div>
        {kind === "Ad-hoc" && <Field label="Service"><select className={inputCls} value={item} onChange={(e) => setItem(e.target.value)}><option value="">— other hospital service —</option>
          {ctx?.charge_items.map((i) => <option key={i.name} value={i.name}>{i.item_name}{i.standard_rate ? ` · ${rs(i.standard_rate)}` : ""}</option>)}</select></Field>}
        {kind === "Consumable" && <Field label="Item from the IPD store">{item ? <div className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"><b className="flex-1">{item}</b><button onClick={() => setItem("")}><X className="h-4 w-4" /></button></div>
          : <><input className={inputCls} placeholder="Search cannula, syringe, gloves…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-1 max-h-40 overflow-y-auto">{stock.data?.map((s) => <button key={s.name} onClick={() => setItem(s.name)} className="block w-full rounded px-2 py-1 text-start text-sm hover:bg-muted">{s.item_name}</button>)}</div></>}</Field>}
        <div className="grid grid-cols-2 gap-3"><Field label={kind === "Oxygen" ? "Hours" : "Qty"}><input className={inputCls} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          {kind !== "Oxygen" && canRate && <Field label="Rate" hint="Empty = price list"><input className={inputCls} inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))} /></Field>}</div>
        <Field label="Description"><input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={kind === "Oxygen" ? "Oxygen via mask" : ""} /></Field>
        <div className="flex items-center justify-between border-t border-border pt-3"><span className="text-lg font-black tabular-nums">{rs(preview)}</span>
          <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="submit" disabled={kind === "Consumable" && !item}
            onClick={() => void run("ipd.add_charge", { data: { ...target, charge_type: kind, item_code: item || undefined, qty: Number(qty) || 1, rate: rate === "" ? undefined : Number(rate), description: desc || undefined } },
              "Charge added", onDone)}><Check className="h-4 w-4" />Add</Button></div></div>
      </div>
    </Dialog>
  );
}

export function ChargesTable({ lines, onCancel }: { lines: { charge_type: string; description: string; qty: number; rate: number; amount: number; covered_amount?: number; charge?: string; posted_at?: string; billed?: number }[];
  onCancel?: (name: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr>
      <th className="px-3 py-2 text-start">Charge</th><th className="px-3 py-2 text-start">When</th><th className="px-3 py-2 text-end">Qty</th><th className="px-3 py-2 text-end">Rate</th>
      <th className="px-3 py-2 text-end">Amount</th>{onCancel && <th />}</tr></thead>
      <tbody>{lines.map((l, i) => <tr key={l.charge ?? i} className="border-t border-border"><td className="px-3 py-1.5"><span className="flex items-center gap-2"><ChargeDot t={l.charge_type} />
        <span className="min-w-0"><span className="block truncate font-medium">{l.description}</span><span className="text-[11px] text-muted-foreground">{l.charge_type}{l.charge ? "" : " · computed"}{l.covered_amount ? ` · package ${rs(l.covered_amount)}` : ""}</span></span></span></td>
        <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">{dt(l.posted_at)}</td><td className="px-3 py-1.5 text-end tabular-nums">{l.qty}</td>
        <td className="px-3 py-1.5 text-end tabular-nums">{rs(l.rate)}</td><td className={cn("px-3 py-1.5 text-end font-semibold tabular-nums", l.covered_amount && "text-muted-foreground line-through")}>{rs(l.amount)}</td>
        {onCancel && <td className="px-2">{l.charge && !l.billed && <button title="Cancel charge" className="text-rose-600 hover:text-rose-700" onClick={() => onCancel(l.charge!)}><Trash2 className="h-4 w-4" /></button>}</td>}</tr>)}</tbody></table>
      {!lines.length && <div className="p-6 text-center text-sm text-muted-foreground">No charges</div>}</div>
  );
}
