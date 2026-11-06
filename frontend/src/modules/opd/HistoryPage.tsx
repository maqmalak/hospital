import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BedDouble, CalendarClock, FileText, History, Pill as PillIcon, ShieldAlert, Stethoscope } from "lucide-react";
import { useApi } from "@/lib/api";
import { axisProps, Legend, TipBox, useViz } from "@/lib/viz";
import { Empty, PageHeader, PatientPicker, Pill, Section, Tabs } from "@/components/common";

interface H {
  patient: { name: string; patient_name: string; patient_name_ur?: string; age?: number; gender: string; blood_group?: string; allergies?: { allergy: string }[]; chronic_conditions?: { diagnosis_name: string }[] };
  visits: { name: string; posting_date: string; doctor_name: string; purpose: string; branch: string; chief_complaint?: string; token_no: number }[];
  prescriptions: { name: string; prescription_date: string; doctor_name: string; status: string; version_no: number; amended_from?: string; amendment_reason?: string; advice?: string; branch: string; has_overrides: number;
    medicines: { item_name: string; dose?: string; frequency?: string; duration?: string; alert_type?: string; override_reason?: string }[]; diagnoses: { diagnosis: string; diagnosis_name: string }[]; lab_tests: { test_name: string }[] }[];
  appointments: { name: string; appointment_date: string; start_time: string; doctor_name: string; status: string; source_channel: string; booking_ref: string }[];
  beds: { bed: string; ward: string; to_status: string; changed_on: string }[];
  vitals: { posting_date: string; bp_systolic?: number; bp_diastolic?: number; pulse?: number; temperature?: number; spo2?: number; weight?: number; rbs?: number }[];
}
type Metric = "bp" | "pulse" | "weight" | "rbs" | "spo2";

export default function HistoryPage() {
  const { mr } = useParams();
  const nav = useNavigate();
  const { t } = useTranslation();
  const viz = useViz();
  const [tab, setTab] = useState<"timeline" | "rx" | "appointments">("timeline");
  const [metric, setMetric] = useState<Metric>("bp");
  const { data } = useApi<H>("patients.history", { name: mr }, { enabled: !!mr });
  if (!mr) return <div className="mx-auto max-w-2xl"><PageHeader title="Patient history" icon={History} color="from-fuchsia-500 to-purple-600" /><Section><PatientPicker autoFocus onPick={(p) => nav(`/pw-history/${p.name}`)} /></Section></div>;
  if (!data) return <div className="p-10 text-center text-muted-foreground">{t("Loading…")}</div>;
  const p = data.patient;
  const series: Record<Metric, { keys: string[]; labels: string[] }> = {
    bp: { keys: ["bp_systolic", "bp_diastolic"], labels: ["Systolic", "Diastolic"] }, pulse: { keys: ["pulse"], labels: ["Pulse"] },
    weight: { keys: ["weight"], labels: ["Weight kg"] }, rbs: { keys: ["rbs"], labels: ["RBS mg/dL"] }, spo2: { keys: ["spo2"], labels: ["SpO₂ %"] } };
  const s = series[metric];
  const timeline = [
    ...data.visits.map((v) => ({ date: v.posting_date, kind: "visit" as const, v })),
    ...data.beds.map((b) => ({ date: b.changed_on.slice(0, 10), kind: "bed" as const, b })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const rxByVisit = (date: string) => data.prescriptions.filter((r) => r.prescription_date === date);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={p.patient_name} icon={History} color="from-fuchsia-500 to-purple-600" subtitle={<span>{p.name} · {p.age}y · {t(p.gender)} {p.blood_group && `· ${p.blood_group}`} · {data.visits.length} visits</span>}
        actions={<div className="w-72"><PatientPicker onPick={(x) => nav(`/pw-history/${x.name}`)} /></div>} />
      {(p.allergies?.length ?? 0) > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-rose-50 p-3 dark:bg-rose-500/10"><ShieldAlert className="h-4 w-4 text-rose-600" />{p.allergies!.map((a) => <span key={a.allergy} className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white">{a.allergy}</span>)}
        {p.chronic_conditions?.map((c) => <span key={c.diagnosis_name} className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">{c.diagnosis_name}</span>)}</div>}
      <Section title="Vitals trend" className="mb-4" actions={<div className="flex gap-1">{(Object.keys(series) as Metric[]).map((k) => <button key={k} onClick={() => setMetric(k)} className={"rounded-lg px-2 py-1 text-xs font-semibold " + (metric === k ? "bg-primary text-primary-foreground" : "bg-muted")}>{k.toUpperCase()}</button>)}</div>}>
        {data.vitals.length < 2 ? <p className="py-8 text-center text-sm text-muted-foreground">Not enough visits with vitals for a trend.</p> : <>
          {s.keys.length > 1 && <div className="mb-2"><Legend items={s.labels.map((l, i) => ({ label: l, color: viz.series[i] }))} /></div>}
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.vitals} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={viz.grid} />
              <XAxis dataKey="posting_date" tickFormatter={(d: string) => d.slice(5)} {...axisProps(viz.axis)} />
              <YAxis domain={["auto", "auto"]} {...axisProps(viz.axis)} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? <TipBox title={String(label)} rows={s.keys.map((k, i) => ({ label: s.labels[i], value: String(payload[0].payload[k] ?? "–"), color: viz.series[i] }))} /> : null} />
              {s.keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={viz.series[i]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: viz.surface, fill: viz.series[i] }} activeDot={{ r: 6 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer></>}
      </Section>
      <div className="mb-3"><Tabs value={tab} onChange={setTab} tabs={[{ key: "timeline", label: "Timeline", count: timeline.length }, { key: "rx", label: "Prescriptions", count: data.prescriptions.length }, { key: "appointments", label: "Appointments", count: data.appointments.length }]} /></div>
      {tab === "timeline" && (timeline.length ? <ol className="relative space-y-3 border-s-2 border-border ps-6">
        {timeline.map((e, i) => (
          <li key={i} className="relative">
            <span className={"absolute -start-[33px] top-3 flex h-6 w-6 items-center justify-center rounded-full text-white " + (e.kind === "visit" ? "bg-teal-600" : "bg-amber-500")}>{e.kind === "visit" ? <Stethoscope className="h-3.5 w-3.5" /> : <BedDouble className="h-3.5 w-3.5" />}</span>
            {e.kind === "visit" ? <Section>
              <div className="flex flex-wrap items-center gap-2"><b>{e.v.posting_date}</b><span className="text-sm text-muted-foreground">{e.v.doctor_name} · {e.v.purpose} · {e.v.branch}</span><span className="ms-auto font-mono text-xs text-muted-foreground">{e.v.name}</span></div>
              {e.v.chief_complaint && <div className="mt-1 text-sm">{e.v.chief_complaint}</div>}
              {rxByVisit(e.v.posting_date).map((r) => <RxCard key={r.name} r={r} compact />)}
            </Section> : <div className="rounded-xl border border-border bg-card p-3 text-sm"><b>{e.date}</b> · Bed {e.b.bed} ({e.b.ward}) → {e.b.to_status}</div>}
          </li>))}
      </ol> : <Empty title="No visits yet" />)}
      {tab === "rx" && <div className="space-y-3">{data.prescriptions.map((r) => <Section key={r.name}><RxCard r={r} /></Section>)}{!data.prescriptions.length && <Empty title="No prescriptions" icon={FileText} />}</div>}
      {tab === "appointments" && <Section>{data.appointments.map((a) => <div key={a.name} className="flex items-center gap-3 border-b border-border/60 py-2 text-sm last:border-0"><CalendarClock className="h-4 w-4 text-muted-foreground" /><span className="flex-1">{a.appointment_date} {a.start_time?.slice(0, 5)} · {a.doctor_name}</span><Pill value={a.source_channel} /><Pill value={a.status} /></div>)}
        {!data.appointments.length && <Empty title="No appointments" />}</Section>}
    </div>
  );
}

function RxCard({ r, compact }: { r: H["prescriptions"][number]; compact?: boolean }) {
  return (
    <div className={compact ? "mt-2 rounded-xl bg-muted/60 p-3" : ""}>
      <div className="flex flex-wrap items-center gap-2 text-sm"><PillIcon className="h-4 w-4 text-rose-500" /><b className="font-mono text-xs">{r.name}</b><Pill value={r.status} />{r.version_no > 1 && <span className="text-xs text-orange-700">v{r.version_no} · {r.amendment_reason}</span>}
        {!compact && <span className="text-muted-foreground">{r.prescription_date} · {r.doctor_name}</span>}{r.has_overrides ? <span className="text-xs font-semibold text-rose-600">safety override</span> : null}</div>
      {r.diagnoses.length > 0 && <div className="mt-1 text-xs text-violet-700 dark:text-violet-300">{r.diagnoses.map((d) => `${d.diagnosis_name} (${d.diagnosis})`).join(" · ")}</div>}
      <div className="mt-1 grid gap-0.5 text-sm">{r.medicines.map((m, i) => <div key={i}>• {m.item_name} <span className="text-muted-foreground">{m.dose} · {m.frequency} · {m.duration}</span>{m.override_reason && <span className="text-xs text-rose-600"> — override: {m.override_reason}</span>}</div>)}</div>
      {r.lab_tests.length > 0 && <div className="mt-1 text-xs text-sky-700 dark:text-sky-300">Tests: {r.lab_tests.map((l) => l.test_name).join(", ")}</div>}
      {r.advice && <div className="mt-1 text-xs text-muted-foreground">{r.advice}</div>}
    </div>
  );
}
