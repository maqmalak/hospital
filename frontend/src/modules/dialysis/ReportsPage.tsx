/** Dialysis reports (D-99): sessions per day / shift / station, revenue (sessions + packages from the counter slips), package utilisation,
 *  panel / Sehat Card claims, dues, missed sessions and adequacy against target. Categorical colours from the validated palette (lib/viz). */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CalendarX2, Droplets, Package, Wallet } from "lucide-react";
import { useApi } from "@/lib/api";
import { Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { axisProps, TipBox, useViz } from "@/lib/viz";
import { RENAL_HEADER, rs } from "./shared";

interface Rep {
  from: string; to: string; completed: number; missed: number; patients: number; by_day: { d: string; value: number }[]; by_shift: { label: string; value: number }[];
  by_station: { label: string; value: number }[]; payment: { label: string; value: number }[]; revenue: { sessions: number; packages: number };
  packages: { package_name: string; n: number; sessions: number; used: number }[]; panel: { session: string; date: string; patient: string; amount: number }[];
  dues: { session: string; date: string; patient: string; amount: number; status: string }[]; adequacy: { n: number; urr_ok: number; ktv_ok: number };
}
const iso = (d: Date) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);

export default function ReportsPage() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const { data } = useApi<Rep>("dialysis.report", { from_date: from, to_date: to });
  const v = useViz();
  const tip = (unit: string) => ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) =>
    active && payload?.length ? <TipBox title={label} rows={[{ label: unit, value: payload[0].value, color: v.series[0] }]} /> : null;
  const bars = (rows: { label: string; value: number }[], h = 220) => (
    <ResponsiveContainer width="100%" height={h}><BarChart data={rows} barCategoryGap="28%"><CartesianGrid vertical={false} stroke={v.grid} />
      <XAxis dataKey="label" {...axisProps(v.axis)} interval={0} /><YAxis {...axisProps(v.axis)} width={32} allowDecimals={false} />
      <Tooltip cursor={{ fill: v.cursor }} content={tip("Sessions") as never} /><Bar dataKey="value" fill={v.series[0]} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Dialysis reports" icon={BarChart3} color={RENAL_HEADER} subtitle="Sessions, revenue, packages, panel claims and dues"
        actions={<div className="flex gap-2"><Field label="From" className="w-36"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" className="w-36"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></div>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Sessions done" value={data?.completed ?? 0} icon={Droplets} tone="blue" hint={`${data?.patients ?? 0} active patients`} />
        <StatCard label="Missed" value={data?.missed ?? 0} icon={CalendarX2} tone="rose" />
        <StatCard label="Revenue — sessions" value={rs(data?.revenue.sessions)} icon={Wallet} />
        <StatCard label="Revenue — packages" value={rs(data?.revenue.packages)} icon={Package} tone="violet" />
        <StatCard label="Adequacy on target" value={`URR ${pct(data?.adequacy.urr_ok ?? 0, data?.adequacy.n ?? 0)}`} hint={`Kt/V ${pct(data?.adequacy.ktv_ok ?? 0, data?.adequacy.n ?? 0)} · ${data?.adequacy.n ?? 0} measured`} icon={BarChart3} tone="amber" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Sessions per day" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}><BarChart data={(data?.by_day ?? []).map((x) => ({ ...x, label: x.d.slice(5) }))} barCategoryGap="20%"><CartesianGrid vertical={false} stroke={v.grid} />
            <XAxis dataKey="label" {...axisProps(v.axis)} minTickGap={16} /><YAxis {...axisProps(v.axis)} width={32} allowDecimals={false} />
            <Tooltip cursor={{ fill: v.cursor }} content={tip("Sessions") as never} /><Bar dataKey="value" fill={v.series[0]} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </Card>
        <Card title="By shift">{bars(data?.by_shift ?? [])}</Card>
        <Card title="By station" className="lg:col-span-2">{bars(data?.by_station ?? [])}</Card>
        <Card title="How sessions were paid"><ul className="space-y-2 text-sm">{data?.payment.map((p) => <li key={p.label} className="flex justify-between"><span>{p.label}</span><b className="tabular-nums">{p.value}</b></li>)}</ul></Card>
        <Card title="Package utilisation"><ul className="space-y-2 text-sm">{data?.packages.map((p) => <li key={p.package_name}><div className="flex justify-between"><span>{p.package_name} × {p.n}</span><b>{p.used}/{p.sessions}</b></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${p.sessions ? (p.used / p.sessions) * 100 : 0}%`, background: v.series[0] }} /></div></li>)}</ul></Card>
        <Card title={`Panel / Sehat Card claims (${data?.panel.length ?? 0})`}><List rows={(data?.panel ?? []).map((x) => [x.date, x.patient, rs(x.amount)])} /></Card>
        <Card title={`Dues — completed, not paid (${data?.dues.length ?? 0})`}><List rows={(data?.dues ?? []).map((x) => [x.date, `${x.patient} · ${x.status}`, rs(x.amount)])} /></Card>
      </div>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${className}`}><h2 className="mb-3 text-sm font-bold">{title}</h2>{children}</section>;
}
function List({ rows }: { rows: string[][] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">None</p>;
  return <ul className="max-h-72 divide-y divide-border overflow-y-auto text-sm">{rows.map((r, i) => <li key={i} className="flex gap-2 py-1.5"><span className="w-20 shrink-0 text-xs text-muted-foreground">{r[0]}</span><span className="min-w-0 flex-1 truncate">{r[1]}</span><b className="tabular-nums">{r[2]}</b></li>)}</ul>;
}
