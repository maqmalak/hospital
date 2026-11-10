import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Download, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getCall } from "@/services/frappe";
import { axisProps, Legend, TipBox, useViz } from "@/lib/viz";
import { Field, inputCls, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { exportToCsv } from "@/utils/export";
import { addDaysISO, todayISO } from "@/utils/dates";

const REPORTS = [
  { name: "OPD Visits by Doctor", desc: "Visits, new vs follow-up, waiting and consultation time, revenue", group: "Daily / operational" },
  { name: "Appointments by Channel", desc: "Web / WhatsApp / Reception bookings, no-show rate", group: "Daily / operational" },
  { name: "Day End Collection", desc: "By counter, cashier and payment mode", group: "Financial" },
  { name: "Discount Report", desc: "By user, reason and billing type", group: "Financial" },
  { name: "Revenue Analysis", desc: "Net revenue by billing type, department, doctor and service", group: "Financial" },
  { name: "Payer Ageing", desc: "Panels, insurers and welfare funds: what is owed, by age", group: "Financial" },
  { name: "Welfare Fund Utilization", desc: "Donations, use and balance per welfare / zakat fund", group: "Financial" },
  { name: "Expenses by Category", desc: "Approved expenses by category and month", group: "Financial" },
  { name: "Disease Statistics", desc: "ICD-10 by age group and gender (health department)", group: "Clinical / statutory" },
  { name: "Message Delivery", desc: "WhatsApp / SMS success rate by event", group: "Quality" },
];
interface Col { fieldname: string; label: string; fieldtype?: string }
interface Result { columns: Col[]; result: Record<string, unknown>[]; chart?: { data: { labels: string[]; datasets: { name: string; values: number[] }[] }; type: string } }

export default function ReportsPage() {
  const { report } = useParams();
  const name = report ? decodeURIComponent(report) : "";
  if (!name) return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Reports" icon={BarChart3} color="from-blue-500 to-sky-600" subtitle="MIS reports — open one, filter, export. Each is also an ERPNext report in Desk." />
      {[...new Set(REPORTS.map((r) => r.group))].map((g) => (
        <div key={g} className="mb-5"><h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{REPORTS.filter((r) => r.group === g).map((r) => (
            <Link key={r.name} to={`/reports/${encodeURIComponent(r.name)}`} className="hover-outline rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4 text-primary" />{r.name}</div><div className="mt-1 text-sm text-muted-foreground">{r.desc}</div></Link>))}</div></div>))}
    </div>
  );
  return <ReportView name={name} />;
}

function ReportView({ name }: { name: string }) {
  const { branch } = useAuth();
  const viz = useViz();
  const [from, setFrom] = useState(addDaysISO(todayISO(), -29));
  const [to, setTo] = useState(todayISO());
  const { data, isFetching } = useQuery({ queryKey: ["report", name, from, to, branch], queryFn: () => getCall<Result>("frappe.desk.query_report.run", { report_name: name, filters: JSON.stringify({ from_date: from, to_date: to, branch }) }) });
  const rows = (data?.result ?? []).filter((r) => !Array.isArray(r));
  const cols = (data?.columns ?? []).map((c) => (typeof c === "string" ? { fieldname: c, label: c } : c));
  const chart = data?.chart;
  const chartRows = chart ? chart.data.labels.map((l, i) => Object.fromEntries([["label", l], ...chart.data.datasets.map((d) => [d.name, d.values[i]])])) : [];
  const fmt = (v: unknown, c: Col) => (v == null ? "" : c.fieldtype === "Currency" ? `Rs ${Math.round(Number(v)).toLocaleString()}` : c.fieldtype === "Percent" ? `${v}%` : String(v));
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={name} icon={BarChart3} color="from-blue-500 to-sky-600" subtitle={<Link to="/reports" className="text-primary">← All reports</Link>}
        actions={<>
          <Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button variant="outline" className="mt-5" onClick={() => exportToCsv(cols.map((c) => ({ key: c.fieldname, label: c.label })), rows as Record<string, unknown>[], name)}><Download className="h-4 w-4" />CSV</Button>
          <a href={`/app/query-report/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="mt-5"><Button variant="outline"><ExternalLink className="h-4 w-4" />Desk</Button></a>
        </>} />
      {chart && chartRows.length > 0 && <Section className="mb-4" actions={chart.data.datasets.length > 1 ? <Legend items={chart.data.datasets.map((d, i) => ({ label: d.name, color: viz.series[i] }))} /> : undefined}>
        <ResponsiveContainer width="100%" height={260}>
          {chart.type === "pie" ? (
            <PieChart><Pie data={chartRows} dataKey={chart.data.datasets[0].name} nameKey="label" innerRadius={60} outerRadius={100} stroke={viz.surface} strokeWidth={2} label={(e: { label: string }) => e.label}>
              {chartRows.map((_, i) => <Cell key={i} fill={viz.series[i % 8]} />)}</Pie>
              <Tooltip content={({ active, payload }) => active && payload?.length ? <TipBox rows={[{ label: String(payload[0].name), value: Math.round(Number(payload[0].value)).toLocaleString(), color: String(payload[0].payload.fill ?? "") }]} /> : null} /></PieChart>
          ) : (
            <BarChart data={chartRows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={viz.grid} /><XAxis dataKey="label" {...axisProps(viz.axis)} interval={0} tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 13) + "…" : v)} /><YAxis {...axisProps(viz.axis)} />
              <Tooltip cursor={{ fill: viz.cursor }} content={({ active, payload, label }) => active && payload?.length ? <TipBox title={String(label)} rows={payload.map((p, i) => ({ label: String(p.name), value: Math.round(Number(p.value)).toLocaleString(), color: viz.series[i] }))} /> : null} />
              {chart.data.datasets.map((d, i) => <Bar key={d.name} dataKey={d.name} fill={viz.series[i]} radius={[4, 4, 0, 0]} maxBarSize={36} />)}
            </BarChart>)}
        </ResponsiveContainer></Section>}
      <Section>
        {isFetching && <div className="mb-2 text-xs text-muted-foreground">Loading…</div>}
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground">{cols.map((c) => <th key={c.fieldname} className={"py-2 " + (["Int", "Float", "Currency", "Percent"].includes(c.fieldtype ?? "") ? "text-end" : "text-start")}>{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border/60">{cols.map((c) => <td key={c.fieldname} className={"py-1.5 " + (["Int", "Float", "Currency", "Percent"].includes(c.fieldtype ?? "") ? "text-end tabular-nums" : "")}>{fmt(r[c.fieldname], c)}</td>)}</tr>)}</tbody>
        </table>{!rows.length && !isFetching && <p className="py-6 text-center text-sm text-muted-foreground">No data for these dates.</p>}</div>
      </Section>
    </div>
  );
}
