/** Radiology analytics (D-91 C1): daily scans by modality, modality split, turnaround vs target, revenue, radiologist workload,
 *  top procedures, booking channels. Categorical colours from the validated palette (lib/viz), fixed order per modality. */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertOctagon, BarChart3, Clock3, ScanLine, Wallet } from "lucide-react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { axisProps, Legend, TipBox, useViz } from "@/lib/viz";
import { rs } from "./shared";

interface A {
  daily: { d: string; modality: string; n: number }[]; split: { label: string; value: number }[]; tat: { modality: string; minutes: number; n: number; on_time: number }[];
  revenue: { label: string; value: number }[]; workload: { label: string; value: number; critical: number }[]; top: { label: string; value: number }[]; sources: { label: string; value: number }[];
  totals: { scans: number; revenue: number; critical: number; open: number };
}
const MODS = ["X-Ray", "Ultrasound", "Doppler", "MRI", "CT"] as const;
const iso = (d: Date) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10); // Asia/Karachi date

export default function AnalyticsPage() {
  const { branch } = useAuth();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const { data } = useApi<A>("radiology.analytics", { from_date: from, to_date: to, branch });
  const v = useViz();
  const color = (m: string) => v.series[Math.max(0, MODS.indexOf(m as (typeof MODS)[number]))];
  const days = Object.values((data?.daily ?? []).reduce<Record<string, Record<string, number | string>>>((acc, r) => {
    (acc[r.d] ??= { d: r.d.slice(5) })[r.modality] = r.n; return acc;
  }, {}));
  const tatAll = (data?.tat ?? []).reduce((a, r) => ({ n: a.n + r.n, on: a.on + Number(r.on_time || 0), m: a.m + r.minutes * r.n }), { n: 0, on: 0, m: 0 });
  const tip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) =>
    active && payload?.length ? <TipBox title={label} rows={payload.map((p) => ({ label: p.name, value: p.value, color: p.color }))} /> : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Radiology analytics" icon={BarChart3} subtitle="Volumes, turnaround, revenue and workload"
        actions={<div className="flex gap-2"><Field label="From" className="w-36"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" className="w-36"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></div>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Scans performed" value={(data?.totals.scans ?? 0).toLocaleString()} icon={ScanLine} />
        <StatCard label="Revenue (paid + panel)" value={rs(data?.totals.revenue)} icon={Wallet} tone="blue" />
        <StatCard label="Average turnaround" value={tatAll.n ? `${Math.round(tatAll.m / tatAll.n)} min` : "—"} hint={tatAll.n ? `${Math.round((tatAll.on / tatAll.n) * 100)}% within target` : undefined} icon={Clock3} tone="amber" />
        <StatCard label="Critical findings" value={data?.totals.critical ?? 0} hint={`${data?.totals.open ?? 0} studies open now`} icon={AlertOctagon} tone="rose" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Daily scans by modality" className="lg:col-span-2" legend={<Legend items={MODS.map((m) => ({ label: m, color: color(m) }))} />}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={days} barCategoryGap="22%"><CartesianGrid vertical={false} stroke={v.grid} />
              <XAxis dataKey="d" {...axisProps(v.axis)} interval="preserveStartEnd" minTickGap={18} /><YAxis {...axisProps(v.axis)} width={30} allowDecimals={false} />
              <Tooltip cursor={{ fill: v.cursor }} content={tip as never} />
              {MODS.map((m, i) => <Bar key={m} dataKey={m} stackId="a" fill={color(m)} stroke={v.surface} strokeWidth={1} radius={i === MODS.length - 1 ? [4, 4, 0, 0] : 0} />)}
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Modality split">
          <ul className="space-y-3 pt-2">{MODS.map((m) => { const val = data?.split.find((s) => s.label === m)?.value ?? 0; const pct = data?.totals.scans ? (val / data.totals.scans) * 100 : 0; return (
            <li key={m}><div className="mb-1 flex justify-between text-sm"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color(m) }} />{m}</span><span className="font-semibold tabular-nums">{val} · {pct.toFixed(0)}%</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color(m) }} /></div></li>); })}</ul>
          <h4 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-muted-foreground">Revenue by modality</h4>
          <ul className="space-y-1.5 text-sm">{MODS.map((m) => <li key={m} className="flex justify-between"><span>{m}</span><span className="font-semibold tabular-nums">{rs(data?.revenue.find((r) => r.label === m)?.value)}</span></li>)}</ul>
        </Card>

        <Card title="Turnaround (scan → signed)">
          <table className="w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-start">Modality</th><th className="text-end">Reports</th><th className="text-end">Avg</th><th className="text-end">On time</th></tr></thead>
            <tbody>{(data?.tat ?? []).map((r) => { const pct = r.n ? (Number(r.on_time) / r.n) * 100 : 0; return <tr key={r.modality} className="border-t border-border/60"><td className="py-2"><span className="me-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color(r.modality) }} />{r.modality}</td>
              <td className="text-end tabular-nums">{r.n}</td><td className="text-end tabular-nums">{r.minutes >= 90 ? `${(r.minutes / 60).toFixed(1)} h` : `${r.minutes} min`}</td>
              <td className={`text-end font-semibold tabular-nums ${pct >= 90 ? "text-emerald-600" : pct >= 75 ? "text-amber-600" : "text-rose-600"}`}>{pct.toFixed(0)}%</td></tr>; })}</tbody></table>
        </Card>
        <Card title="Radiologist workload (signed reports)">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.workload ?? []} layout="vertical" margin={{ left: 8 }}><CartesianGrid horizontal={false} stroke={v.grid} />
              <XAxis type="number" {...axisProps(v.axis)} allowDecimals={false} /><YAxis type="category" dataKey="label" {...axisProps(v.axis)} width={110} />
              <Tooltip cursor={{ fill: v.cursor }} content={({ active, payload }) => active && payload?.length ? <TipBox title={String(payload[0].payload.label)} rows={[{ label: "Reports", value: payload[0].payload.value, color: v.series[0] }, { label: "Critical", value: payload[0].payload.critical }]} /> : null} />
              <Bar dataKey="value" fill={v.series[0]} radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Booking channels">
          <ul className="space-y-2 pt-1">{(data?.sources ?? []).map((s) => { const max = Math.max(...(data?.sources ?? []).map((x) => x.value), 1); return (
            <li key={s.label} className="text-sm"><div className="mb-1 flex justify-between"><span>{s.label}</span><span className="font-semibold tabular-nums">{s.value}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(s.value / max) * 100}%`, background: v.series[0] }} /></div></li>); })}</ul>
        </Card>
        <Card title="Most requested scans" className="lg:col-span-3">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.top ?? []} margin={{ bottom: 4 }}><CartesianGrid vertical={false} stroke={v.grid} />
              <XAxis dataKey="label" {...axisProps(v.axis)} interval={0} tickFormatter={(t: string) => (t.length > 18 ? t.slice(0, 17) + "…" : t)} /><YAxis {...axisProps(v.axis)} width={30} allowDecimals={false} />
              <Tooltip cursor={{ fill: v.cursor }} content={({ active, payload }) => active && payload?.length ? <TipBox title={String(payload[0].payload.label)} rows={[{ label: "Scans", value: payload[0].payload.value, color: v.series[0] }]} /> : null} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={34}>{(data?.top ?? []).map((t) => <Cell key={t.label} fill={v.series[0]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children, className = "", legend }: { title: string; children: React.ReactNode; className?: string; legend?: React.ReactNode }) {
  return <section className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${className}`}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">{title}</h2>{legend}</div>{children}</section>;
}
