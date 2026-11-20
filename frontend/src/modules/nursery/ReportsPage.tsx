/** Nursery reports (D-95): births per day / month, cot occupancy, NICU admissions by reason, average stay, delivery mix. */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Baby, BarChart3, Bed, HeartPulse, Scale } from "lucide-react";
import { useApi } from "@/lib/api";
import { Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { axisProps, TipBox, useViz } from "@/lib/viz";

interface R { births: { d: string; n: number }[]; monthly: { m: string; n: number }[]; reasons: { label: string; value: number }[]; stay: { unit: string; days: number; n: number }[];
  delivery: { label: string; value: number }[]; occupancy: { unit: string; cots: number; occupied: number }[]; totals: { births: number; nicu: number; lbw: number; in_care: number } }
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function ReportsPage() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const { data } = useApi<R>("nursery.reports", { from_date: from, to_date: to });
  const v = useViz();
  const bars = (rows: { label: string; value: number }[], height = 220, layout: "h" | "v" = "v") => (
    <ResponsiveContainer width="100%" height={height}>
      {layout === "h" ? <BarChart data={rows} layout="vertical" margin={{ left: 8 }}><CartesianGrid horizontal={false} stroke={v.grid} /><XAxis type="number" {...axisProps(v.axis)} allowDecimals={false} /><YAxis type="category" dataKey="label" {...axisProps(v.axis)} width={140} />
        <Tooltip cursor={{ fill: v.cursor }} content={({ active, payload }) => active && payload?.length ? <TipBox title={String(payload[0].payload.label)} rows={[{ label: "Babies", value: payload[0].payload.value, color: v.series[0] }]} /> : null} /><Bar dataKey="value" fill={v.series[0]} radius={[0, 4, 4, 0]} barSize={16} /></BarChart>
      : <BarChart data={rows}><CartesianGrid vertical={false} stroke={v.grid} /><XAxis dataKey="label" {...axisProps(v.axis)} minTickGap={14} /><YAxis {...axisProps(v.axis)} width={30} allowDecimals={false} />
        <Tooltip cursor={{ fill: v.cursor }} content={({ active, payload }) => active && payload?.length ? <TipBox title={String(payload[0].payload.label)} rows={[{ label: "Births", value: payload[0].payload.value, color: v.series[0] }]} /> : null} /><Bar dataKey="value" fill={v.series[0]} radius={[4, 4, 0, 0]} /></BarChart>}
    </ResponsiveContainer>);
  const card = (t: string, body: React.ReactNode, cls = "") => <section className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${cls}`}><h2 className="mb-3 text-sm font-bold">{t}</h2>{body}</section>;
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="Nursery reports" icon={BarChart3} subtitle="Births, occupancy, NICU admissions and length of stay"
        actions={<div className="flex gap-2"><Field label="From" className="w-36"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To" className="w-36"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field></div>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Births" value={data?.totals.births ?? 0} icon={Baby} />
        <StatCard label="NICU admissions" value={data?.totals.nicu ?? 0} icon={HeartPulse} tone="rose" />
        <StatCard label="Low birth weight (<2.5 kg)" value={data?.totals.lbw ?? 0} icon={Scale} tone="amber" />
        <StatCard label="In care now" value={data?.totals.in_care ?? 0} icon={Bed} tone="blue" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {card("Births per day", bars((data?.births ?? []).map((b) => ({ label: b.d.slice(5), value: b.n }))), "lg:col-span-2")}
        {card("Cot occupancy now", <ul className="space-y-3 pt-1">{(data?.occupancy ?? []).map((o) => { const pct = o.cots ? (o.occupied / o.cots) * 100 : 0; return (
          <li key={o.unit}><div className="mb-1 flex justify-between text-sm"><span>{o.unit}</span><span className="font-semibold tabular-nums">{o.occupied}/{o.cots} · {pct.toFixed(0)}%</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: v.series[0] }} /></div></li>); })}</ul>)}
        {card("Births per month", bars((data?.monthly ?? []).map((m) => ({ label: m.m, value: m.n }))))}
        {card("NICU admissions by reason", bars(data?.reasons ?? [], 220, "h"))}
        {card("Average length of stay", <table className="w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="py-1 text-start">Unit</th><th className="text-end">Babies</th><th className="text-end">Avg days</th></tr></thead>
          <tbody>{(data?.stay ?? []).map((s) => <tr key={s.unit} className="border-t border-border/60"><td className="py-2">{s.unit}</td><td className="text-end tabular-nums">{s.n}</td><td className="text-end font-semibold tabular-nums">{s.days}</td></tr>)}</tbody></table>)}
        {card("Delivery type", bars(data?.delivery ?? [], 200, "h"), "lg:col-span-3")}
      </div>
    </div>
  );
}
