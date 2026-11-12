import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, BedDouble, CalendarClock, Clock, LayoutDashboard, Percent, TableProperties, UserPlus, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { axisProps, Legend, TipBox, useViz } from "@/lib/viz";
import { PageHeader, Section, StatCard, inputCls } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { AppAnalytics } from "./AppAnalytics";
import { todayISO } from "@/utils/dates";

interface Row { label: string; value: number }
interface Summary {
  kpi: Record<string, number | null>; revenue_by_type: Row[]; revenue_by_mode: Row[];
  appointments_by_channel: (Row & { no_show: number; came: number })[]; beds: Row[];
  by_doctor: { label: string; visits: number; follow_up: number; revenue: number; consult: number | null }[];
  trend: { date: string; visits: number; revenue: number }[]; top_diagnoses: (Row & { code: string })[];
  demographics: { band: string; Male: number; Female: number }[];
}

const rs = (v?: number | null) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
const day = (d: string) => new Date(d + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function DashboardPage() {
  const { branch, hasRole } = useAuth();
  const { t } = useTranslation();
  const viz = useViz();
  const [date, setDate] = useState(todayISO());
  const [table, setTable] = useState(false);
  const overview = hasRole("PW Doctor", "PW Accountant", "PW Cash Supervisor");  // hospital-wide money and visits: managers only
  const { data, isLoading } = useApi<Summary>("dashboard.summary", { branch, date }, { refetchInterval: 60_000, enabled: overview });
  const k = data?.kpi ?? {};
  const blue = viz.series[0];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Dashboard" icon={LayoutDashboard} color="from-indigo-500 to-blue-600" subtitle={`${branch} · ${t("Today")}`}
        actions={<>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + " w-40"} />
          <button onClick={() => setTable((v) => !v)} className="flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm hover:bg-muted"><TableProperties className="h-4 w-4" />{table ? "Charts" : "Table"}</button>
        </>} />
      <AppAnalytics />
      {!overview ? null : isLoading || !data ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t("Visits")} value={k.visits ?? 0} hint={`${k.new_visits} new · ${k.follow_up} follow-up`} icon={Activity} tone="teal" />
            <StatCard label={t("Collected")} value={rs(k.collected)} hint={`billed ${rs(k.billed)} · payer credit ${rs(k.payer_credit)}`} icon={Wallet} tone="blue" />
            <StatCard label={t("Avg wait")} value={k.avg_wait != null ? `${k.avg_wait} min` : "–"} hint={`${t("Avg consult")} ${k.avg_consult ?? "–"} min`} icon={Clock} tone="violet" />
            <StatCard label={t("Occupancy")} value={`${k.occupancy}%`} hint={`${k.occupied} / ${k.beds} beds`} icon={BedDouble} tone="amber" />
            <StatCard label={t("New patients")} value={k.new_patients ?? 0} icon={UserPlus} tone="slate" />
            <StatCard label={t("Appointments")} value={k.appointments ?? 0} hint={`${k.no_show} no-show`} icon={CalendarClock} tone="blue" />
            <StatCard label={t("Waiting")} value={k.waiting ?? 0} hint={`${k.with_doctor} with doctor · ${k.done} done`} icon={Clock} tone="rose" />
            <StatCard label={t("Discount")} value={rs(k.discount)} hint={`${k.pending_discounts} pending approval`} icon={Percent} tone="amber" />
          </div>

          {table ? <TrendTable data={data} /> : (
            <div className="grid gap-4 lg:grid-cols-3">
              <Section title="OPD visits · last 14 days" className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.trend} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barCategoryGap={4}>
                    <CartesianGrid vertical={false} stroke={viz.grid} />
                    <XAxis dataKey="date" tickFormatter={day} {...axisProps(viz.axis)} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} {...axisProps(viz.axis)} />
                    <Tooltip cursor={{ fill: viz.cursor }} content={({ active, payload }) => active && payload?.length ? (
                      <TipBox title={day(String(payload[0].payload.date))} rows={[{ label: t("Visits"), value: payload[0].payload.visits, color: blue },
                        { label: t("Revenue"), value: rs(payload[0].payload.revenue) }]} />) : null} />
                    <Bar dataKey="visits" fill={blue} radius={[4, 4, 0, 0]} maxBarSize={28}>
                      <LabelList dataKey="visits" position="top" fill={viz.axis} fontSize={10} formatter={(v: number) => (v ? v : "")} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Section>
              <Section title="Collection by payment mode">
                <HBars rows={data.revenue_by_mode} color={blue} format={rs} />
              </Section>
              <Section title="OPD revenue · last 14 days" className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.trend} margin={{ top: 8, right: 8, left: -6, bottom: 0 }} barCategoryGap={4}>
                    <CartesianGrid vertical={false} stroke={viz.grid} />
                    <XAxis dataKey="date" tickFormatter={day} {...axisProps(viz.axis)} interval="preserveStartEnd" />
                    <YAxis tickFormatter={short} {...axisProps(viz.axis)} />
                    <Tooltip cursor={{ fill: viz.cursor }} content={({ active, payload }) => active && payload?.length ? (
                      <TipBox title={day(String(payload[0].payload.date))} rows={[{ label: t("Revenue"), value: rs(payload[0].payload.revenue), color: viz.series[2] }]} />) : null} />
                    <Bar dataKey="revenue" fill={viz.series[2]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
              <Section title="Appointments by channel">
                <HBars rows={data.appointments_by_channel} color={viz.series[6]} empty="No appointments today" />
              </Section>
              <Section title="Patients by age and gender · 30 days" className="lg:col-span-2"
                actions={<Legend items={[{ label: t("Male"), color: viz.series[0] }, { label: t("Female"), color: viz.series[1] }]} />}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.demographics} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke={viz.grid} />
                    <XAxis dataKey="band" {...axisProps(viz.axis)} />
                    <YAxis allowDecimals={false} {...axisProps(viz.axis)} />
                    <Tooltip cursor={{ fill: viz.cursor }} content={({ active, payload, label }) => active && payload?.length ? (
                      <TipBox title={`Age ${label}`} rows={[{ label: t("Male"), value: payload[0].payload.Male, color: viz.series[0] }, { label: t("Female"), value: payload[0].payload.Female, color: viz.series[1] }]} />) : null} />
                    <Bar dataKey="Male" fill={viz.series[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="Female" fill={viz.series[1]} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>
              <Section title="Top diagnoses · 30 days">
                <HBars rows={data.top_diagnoses.map((d) => ({ ...d, label: `${d.label}` }))} color={viz.series[0]} empty="No diagnoses yet" />
              </Section>
              <Section title="Doctors today" className="lg:col-span-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-start text-xs uppercase text-muted-foreground">
                      <th className="py-2 text-start">{t("Doctor")}</th><th className="text-end">{t("Visits")}</th><th className="text-end">{t("Follow-up")}</th>
                      <th className="text-end">{t("Avg consult")}</th><th className="text-end">{t("Revenue")}</th><th className="w-1/3 ps-4" /></tr></thead>
                    <tbody>{data.by_doctor.map((d) => {
                      const max = Math.max(...data.by_doctor.map((x) => x.visits), 1);
                      return (
                        <tr key={d.label} className="border-b border-border/60 last:border-0">
                          <td className="py-2 font-medium">{d.label}</td><td className="text-end tabular-nums">{d.visits}</td><td className="text-end tabular-nums">{d.follow_up}</td>
                          <td className="text-end tabular-nums">{d.consult != null ? `${Math.round(d.consult)} min` : "–"}</td><td className="text-end tabular-nums">{rs(d.revenue)}</td>
                          <td className="ps-4"><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full" style={{ width: `${(d.visits / max) * 100}%`, background: blue }} /></div></td>
                        </tr>);
                    })}</tbody>
                  </table>
                  {!data.by_doctor.length && <p className="py-6 text-center text-sm text-muted-foreground">No visits yet today.</p>}
                </div>
              </Section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Horizontal magnitude bars: label + value in text ink, single hue bar (one series → no legend). */
function HBars({ rows, color, format = String, empty = "Nothing yet" }: { rows: { label: string; value: number }[]; color: string; format?: (v: number) => string; empty?: string }) {
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: ${format(Number(r.value))}`}>
          <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate text-muted-foreground">{r.label}</span><span className="font-semibold tabular-nums">{format(Number(r.value))}</span></div>
          <div className="h-2.5 rounded-full bg-muted"><div className="h-2.5 rounded-full transition-all" style={{ width: `${(Number(r.value) / max) * 100}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  );
}

function TrendTable({ data }: { data: Summary }) {
  return (
    <Section title="Last 14 days">
      <table className="w-full text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Date</th><th className="text-end">Visits</th><th className="text-end">Revenue</th></tr></thead>
        <tbody>{data.trend.map((r) => <tr key={r.date} className="border-b border-border/60"><td className="py-1.5">{day(r.date)}</td><td className="text-end tabular-nums">{r.visits}</td><td className="text-end tabular-nums">{rs(r.revenue)}</td></tr>)}</tbody></table>
    </Section>
  );
}
