/** Counter collection report (D-98): category-wise revenue (X-ray / Ultrasound / MRI / CT / Lab / OPD …), payment methods,
 *  cashier-wise collection, referring doctors, discounts and refunds — all totalled from the counter slips on the server. */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgePercent, Printer, ReceiptText, Undo2, Wallet } from "lucide-react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { esc, money, printDoc } from "@/lib/print";
import { axisProps, TipBox, useViz } from "@/lib/viz";

interface Cat { label: string; count: number; gross: number; discount: number; net: number; refunded: number }
interface Rep {
  from: string; to: string; categories: Cat[]; modes: { label: string; value: number }[]; cashiers: { label: string; slips: number; collected: number }[];
  doctors: { label: string; count: number; net: number }[]; discounts: { slip: string; service: string; discount: number; cashier: string }[];
  refunds: { slip: string; service: string; amount: number; reason?: string }[]; daily: { d: string; value: number }[];
  totals: { slips: number; gross: number; discount: number; net: number; refunded: number; tendered: number; panel_credit: number };
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const rs = (n?: number) => `Rs ${Math.round(n ?? 0).toLocaleString()}`;

export default function CollectionPage() {
  const { branch } = useAuth();
  const [from, setFrom] = useState(iso(new Date()));
  const [to, setTo] = useState(iso(new Date()));
  const { data, isLoading } = useApi<Rep>("counter.report", { from_date: from, to_date: to, branch });
  const v = useViz();
  const t = data?.totals;
  const maxCat = Math.max(1, ...(data?.categories ?? []).map((c) => c.net));
  const tip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) =>
    active && payload?.length ? <TipBox title={label} rows={[{ label: "Collected", value: rs(payload[0].value), color: v.series[0] }]} /> : null;

  const print = () => {
    if (!data) return;
    const row = (c: string[]) => `<tr>${c.map((x, i) => `<td${i ? ' style="text-align:right"' : ""}>${x}</td>`).join("")}</tr>`;
    void printDoc(`<html><head><style>body{font:12px Arial;margin:12mm}table{width:100%;border-collapse:collapse;margin-bottom:6mm}td,th{border-bottom:1px solid #ddd;padding:3px 4px;text-align:left}h1{font-size:16px}h2{font-size:13px;margin:4mm 0 1mm}</style></head><body>
      <h1>Counter collection — ${esc(data.from)}${data.to !== data.from ? ` to ${esc(data.to)}` : ""}</h1>
      <h2>By category</h2><table><tr><th>Category</th><th>Services</th><th>Gross</th><th>Discount</th><th>Net</th><th>Refunded</th></tr>
      ${data.categories.map((c) => row([esc(c.label), String(c.count), money(c.gross), money(c.discount), money(c.net), money(c.refunded)])).join("")}
      ${row(["<b>Total</b>", String(data.categories.reduce((a, c) => a + c.count, 0)), money(t!.gross), money(t!.discount), `<b>${money(t!.net)}</b>`, money(t!.refunded)])}</table>
      <h2>Payment methods</h2><table>${data.modes.map((m) => row([esc(m.label), money(m.value)])).join("")}</table>
      <h2>Cashiers</h2><table>${data.cashiers.map((c) => row([esc(c.label), `${c.slips} slips`, money(c.collected)])).join("")}</table>
      <h2>Referring doctors</h2><table>${data.doctors.map((d) => row([esc(d.label), String(d.count), money(d.net)])).join("")}</table></body></html>`, "a4");
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Counter collection" icon={ReceiptText} subtitle="Category-wise revenue from the counter slips"
        actions={<div className="flex flex-wrap items-end gap-2"><Field label="From" className="w-36"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" className="w-36"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button variant="outline" size="sm" onClick={print} disabled={!data}><Printer className="h-4 w-4" />Print</Button></div>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Net collected" value={rs(t?.net)} hint={`${t?.slips ?? 0} slips`} icon={Wallet} />
        <StatCard label="Gross charges" value={rs(t?.gross)} hint={t?.panel_credit ? `${rs(t.panel_credit)} on panel credit` : undefined} icon={ReceiptText} tone="blue" />
        <StatCard label="Discounts" value={rs(t?.discount)} hint={`${data?.discounts.length ?? 0} lines`} icon={BadgePercent} tone="amber" />
        <StatCard label="Refunded" value={rs(t?.refunded)} hint={`${data?.refunds.length ?? 0} lines`} icon={Undo2} tone="rose" />
      </div>
      {!isLoading && !t?.slips ? <Empty title="No counter slips in this period" icon={ReceiptText} /> : <>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="By category" className="lg:col-span-2">
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2">Category</th><th className="text-right">Services</th><th className="text-right">Gross</th><th className="text-right">Discount</th><th className="text-right">Net</th><th className="text-right">Refunded</th></tr></thead>
              <tbody>{data?.categories.map((c) => <tr key={c.label} className="border-t border-border">
                <td className="py-2"><div className="font-medium">{c.label}</div><div className="mt-1 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(c.net / maxCat) * 100}%`, background: v.series[0] }} /></div></td>
                <td className="text-right tabular-nums">{c.count}</td><td className="text-right tabular-nums">{money(c.gross)}</td><td className="text-right tabular-nums">{c.discount ? money(c.discount) : "—"}</td>
                <td className="text-right font-bold tabular-nums">{money(c.net)}</td><td className="text-right tabular-nums">{c.refunded ? money(c.refunded) : "—"}</td></tr>)}
                <tr className="border-t-2 border-border font-bold"><td className="py-2">Total</td><td className="text-right tabular-nums">{data?.categories.reduce((a, c) => a + c.count, 0)}</td>
                  <td className="text-right tabular-nums">{money(t?.gross ?? 0)}</td><td className="text-right tabular-nums">{money(t?.discount ?? 0)}</td><td className="text-right tabular-nums">{money(t?.net ?? 0)}</td><td className="text-right tabular-nums">{money(t?.refunded ?? 0)}</td></tr></tbody></table></div>
          </Card>
          <Card title="Payment methods">
            <ul className="space-y-2">{data?.modes.map((m) => <li key={m.label} className="flex justify-between text-sm"><span>{m.label}</span><b className="tabular-nums">{rs(m.value)}</b></li>)}</ul>
            <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cashiers</h3>
            <ul className="space-y-2">{data?.cashiers.map((c) => <li key={c.label} className="flex justify-between text-sm"><span>{c.label} <span className="text-muted-foreground">· {c.slips} slips</span></span><b className="tabular-nums">{rs(c.collected)}</b></li>)}</ul>
          </Card>
          {(data?.daily.length ?? 0) > 1 && <Card title="Collected per day" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={240}><BarChart data={data!.daily.map((d) => ({ ...d, d: d.d.slice(5) }))} barCategoryGap="25%"><CartesianGrid vertical={false} stroke={v.grid} />
              <XAxis dataKey="d" {...axisProps(v.axis)} minTickGap={16} /><YAxis {...axisProps(v.axis)} width={56} tickFormatter={(n: number) => `${Math.round(n / 1000)}k`} />
              <Tooltip cursor={{ fill: v.cursor }} content={tip as never} /><Bar dataKey="value" fill={v.series[0]} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          </Card>}
          <Card title="Referring doctors">
            <ul className="space-y-2">{data?.doctors.map((d) => <li key={d.label} className="flex justify-between gap-2 text-sm"><span className="truncate">{d.label} <span className="text-muted-foreground">· {d.count}</span></span><b className="tabular-nums">{rs(d.net)}</b></li>)}</ul>
          </Card>
          <Card title="Discounts given" className="lg:col-span-2"><List rows={(data?.discounts ?? []).map((d) => [d.slip, d.service, d.cashier, money(d.discount)])} empty="No discounts" /></Card>
          <Card title="Refunds"><List rows={(data?.refunds ?? []).map((r) => [r.slip, r.service, r.reason ?? "", money(r.amount)])} empty="No refunds" /></Card>
        </div>
      </>}
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${className}`}><h2 className="mb-3 text-sm font-bold">{title}</h2>{children}</section>;
}
function List({ rows, empty }: { rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <ul className="max-h-72 divide-y divide-border overflow-y-auto text-sm">{rows.map((r, i) => <li key={i} className="flex gap-2 py-1.5"><span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{r[0]}</span>
    <span className="min-w-0 flex-1 truncate">{r[1]}{r[2] ? <span className="text-muted-foreground"> · {r[2]}</span> : null}</span><b className="tabular-nums">{r[3]}</b></li>)}</ul>;
}
