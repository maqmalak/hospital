import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, HeartPulse, Send, Stethoscope, Thermometer, UserRound } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { Empty, inputCls, PageHeader, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

/** /opd/vitals — the nurse takes vitals after the token and sends the patient to the doctor's waiting list. */
interface Row { name: string; token_no: number; patient: string; patient_name: string; doctor: string; doctor_name: string; room?: string; priority?: string; creation: string;
  gender?: string; age?: number; chief_complaint?: string; is_follow_up?: number; last: { posting_date: string; bp_systolic?: number; bp_diastolic?: number; pulse?: number; temperature?: number; spo2?: number; weight?: number; rbs?: number }[] }
type V = Record<"bp_systolic" | "bp_diastolic" | "pulse" | "temperature" | "spo2" | "weight" | "height" | "rbs", string>;
const EMPTY: V = { bp_systolic: "", bp_diastolic: "", pulse: "", temperature: "", spo2: "", weight: "", height: "", rbs: "" };
const FIELDS: { k: keyof V; label: string; unit: string; lo?: number; hi?: number; step?: string }[] = [
  { k: "bp_systolic", label: "BP systolic", unit: "mmHg", lo: 90, hi: 140 }, { k: "bp_diastolic", label: "BP diastolic", unit: "mmHg", lo: 60, hi: 90 },
  { k: "pulse", label: "Pulse", unit: "/min", lo: 60, hi: 100 }, { k: "temperature", label: "Temperature", unit: "°F", lo: 97, hi: 99.5, step: "0.1" },
  { k: "spo2", label: "SpO₂", unit: "%", lo: 95, hi: 100 }, { k: "rbs", label: "RBS", unit: "mg/dL", lo: 70, hi: 180 },
  { k: "weight", label: "Weight", unit: "kg" }, { k: "height", label: "Height", unit: "cm" }];
const PRIO = ["", "Urgent", "Elderly", "Disabled"];
const mins = (s: string) => Math.max(0, Math.round((Date.now() - new Date(s.replace(" ", "T")).getTime()) / 60000));

export default function VitalsPage() {
  const { data, refetch } = useApi<{ rows: Row[]; done_today: number }>("opd.vitals_queue", undefined, { refetchInterval: 10_000 });
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const cur = rows.find((r) => r.name === sel) ?? rows[0];
  useEffect(() => { if (!sel && rows[0]) setSel(rows[0].name); }, [rows, sel]);
  return (
    <div className="space-y-4">
      <PageHeader title="OPD vitals" icon={HeartPulse} color="from-rose-500 to-pink-600" subtitle="Token → vitals → waiting for the doctor" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><StatCard label="Waiting for vitals" value={rows.length} icon={Activity} tone="rose" />
        <StatCard label="Taken today" value={data?.done_today ?? 0} icon={CheckCircle2} tone="teal" />
        <StatCard label="Longest wait" value={rows.length ? `${Math.max(...rows.map((r) => mins(r.creation)))} min` : "—"} icon={Thermometer} tone="amber" /></div>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-2">{rows.map((r) => (
          <button key={r.name} onClick={() => setSel(r.name)} className={cn("flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-start shadow-sm transition-all", cur?.name === r.name ? "border-rose-400 ring-2 ring-rose-400/30" : "border-border hover:border-rose-300")}>
            <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white"><span className="text-[9px] uppercase opacity-80">Token</span><span className="text-lg font-black leading-none">{r.token_no}</span></span>
            <span className="min-w-0 flex-1"><b className="block truncate">{r.patient_name}</b><span className="text-xs text-muted-foreground">{r.age != null ? `${r.age}y · ` : ""}{r.gender} · {r.doctor_name}</span></span>
            <span className="flex flex-col items-end gap-1">{r.priority && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold text-white", r.priority === "Urgent" ? "bg-rose-600" : "bg-amber-500")}>{r.priority}</span>}
              <span className="text-[10px] text-muted-foreground">{mins(r.creation)} min</span></span></button>))}
          {!rows.length && <Empty title="No one waiting for vitals" icon={HeartPulse} />}</div>
        {cur ? <VitalsForm key={cur.name} r={cur} onDone={() => { setSel(null); void refetch(); }} /> : <div />}
      </div>
    </div>
  );
}

function VitalsForm({ r, onDone }: { r: Row; onDone: () => void }) {
  const [v, setV] = useState<V>(EMPTY);
  const [prio, setPrio] = useState(r.priority ?? "");
  const [cc, setCc] = useState(r.chief_complaint ?? "");
  const [busy, setBusy] = useState(false);
  const last = r.last?.[0];
  const bmi = Number(v.weight) && Number(v.height) ? (Number(v.weight) / (Number(v.height) / 100) ** 2).toFixed(1) : "";
  const save = async () => {
    setBusy(true);
    try { await call("opd.record_vitals", { queue_entry: r.name, vitals: JSON.stringify(v), priority: prio, chief_complaint: cc || undefined }); toast.success(`Token ${r.token_no} sent to ${r.doctor_name}`); onDone(); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10"><UserRound className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><h2 className="truncate text-xl font-extrabold">{r.patient_name}</h2><div className="text-sm text-muted-foreground">{r.patient} · {r.age != null ? `${r.age} y` : ""} {r.gender} · Token {r.token_no} · {r.doctor_name}{r.room ? ` · ${r.room}` : ""}{r.is_follow_up ? " · follow-up" : ""}</div></div></div>
      {last && <div className="mt-3 rounded-xl bg-muted/60 p-2 text-xs text-muted-foreground">Last visit {last.posting_date}: BP {last.bp_systolic}/{last.bp_diastolic} · pulse {last.pulse} · temp {last.temperature} · SpO₂ {last.spo2} · wt {last.weight}{last.rbs ? ` · RBS ${last.rbs}` : ""}</div>}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{FIELDS.map((f, i) => {
        const n = Number(v[f.k]); const off = v[f.k] !== "" && f.lo != null && (n < f.lo || n > (f.hi ?? Infinity));
        return <label key={f.k} className="block text-xs font-semibold">{f.label}
          <div className="relative mt-1"><input autoFocus={i === 0} inputMode="decimal" className={cn(inputCls, "h-12 pe-12 text-lg font-bold tabular-nums", off && "border-rose-400 text-rose-600")}
            value={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.value.replace(/[^\d.]/g, "") })} />
            <span className="absolute end-3 top-3.5 text-xs font-normal text-muted-foreground">{f.unit}</span></div></label>; })}</div>
      <div className="mt-2 text-sm text-muted-foreground">{bmi ? <>BMI <b className="text-foreground">{bmi}</b></> : "BMI is worked out from weight and height."}</div>
      <label className="mt-3 block text-xs font-semibold">Chief complaint<input className={inputCls + " mt-1"} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="e.g. fever 3 days, cough" /></label>
      <div className="mt-3"><div className="mb-1 text-xs font-semibold">Priority for the doctor</div><div className="flex flex-wrap gap-1.5">{PRIO.map((p) => (
        <button key={p || "n"} onClick={() => setPrio(p)} className={cn("rounded-full border px-3 py-1 text-xs font-bold", prio === p ? (p === "Urgent" ? "border-rose-600 bg-rose-600 text-white" : p ? "border-amber-500 bg-amber-500 text-white" : "border-teal-600 bg-teal-600 text-white") : "border-border")}>{p || "Normal"}</button>))}</div></div>
      <Button variant="save" size="lg" className="mt-5 w-full" loading={busy} onClick={() => void save()}><Send className="h-5 w-5" />Save & send to {r.doctor_name}<Stethoscope className="h-4 w-4 opacity-70" /></Button>
    </section>
  );
}
