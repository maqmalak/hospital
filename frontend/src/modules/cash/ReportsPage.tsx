import { useState } from "react";
import { AlertTriangle, Clock, FileClock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { Empty, Field, inputCls, Pill, Section, StatCard } from "@/components/common";
import { addDaysISO, todayISO } from "@/utils/dates";
import { cn } from "@/utils/cn";
import { Hero } from "./ShiftPage";
import { rs } from "./shared";

interface Rep { closings: { name: string; counter: string; user_name: string; status: string; total_expected: number; total_counted: number; difference: number; period_start: string; supervisor?: string }[];
  by_mode: { counter: string; mode: string; amount: number; invoices: number }[]; cashiers: { user_name: string; shifts: number; net: number; short: number; excess: number }[];
  open_shifts: { name: string; hv_counter: string; user_name: string; period_start_date: string; stale: boolean }[]; pending_drops: number; uncollected_drafts: { name: string; customer_name: string; grand_total: number; hv_token?: string }[] }

export default function CashReportsPage() {
  const { branch } = useAuth();
  const [from, setFrom] = useState(addDaysISO(todayISO(), -6));
  const [to, setTo] = useState(todayISO());
  const { data } = useApi<Rep>("cash.report", { from_date: from, to_date: to, branch });
  const counters = [...new Set((data?.by_mode ?? []).map((r) => r.counter || "—"))];
  const modes = [...new Set((data?.by_mode ?? []).map((r) => r.mode))];
  return (
    <div className="mx-auto max-w-7xl">
      <Hero title="Cash reports" sub={`${branch} · ${from} → ${to}`} actions={<div className="flex gap-2 [&_input]:text-slate-900"><Field label=""><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label=""><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Collected" value={rs((data?.by_mode ?? []).reduce((s, r) => s + r.amount, 0))} tone="teal" />
        <StatCard label="Net excess / short" value={rs((data?.cashiers ?? []).reduce((s, r) => s + r.net, 0))} tone="rose" />
        <StatCard label="Open shifts" value={data?.open_shifts.length ?? 0} hint={`${data?.open_shifts.filter((o) => o.stale).length ?? 0} from earlier days`} icon={Clock} tone="amber" />
        <StatCard label="Cash drops pending" value={data?.pending_drops ?? 0} tone="violet" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Day-end by counter and mode">
          {counters.length ? <table className="w-full text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Counter</th>{modes.map((m) => <th key={m} className="text-end">{m}</th>)}<th className="text-end">Total</th></tr></thead>
            <tbody>{counters.map((c) => { const rows = (data?.by_mode ?? []).filter((r) => (r.counter || "—") === c); return (
              <tr key={c} className="border-b border-border/60"><td className="py-2 font-semibold">{c}</td>{modes.map((m) => <td key={m} className="text-end tabular-nums">{rs(rows.find((r) => r.mode === m)?.amount)}</td>)}<td className="text-end font-bold tabular-nums">{rs(rows.reduce((s, r) => s + r.amount, 0))}</td></tr>); })}</tbody></table> : <Empty title="No collections" />}
        </Section>
        <Section title="Excess / short by cashier">
          {data?.cashiers.length ? data.cashiers.map((c) => (
            <div key={c.user_name} className="flex items-center gap-3 border-b border-border/60 py-2 text-sm last:border-0"><span className="flex-1 font-medium">{c.user_name} <span className="text-xs text-muted-foreground">{c.shifts} shifts</span></span>
              <span className="text-xs text-sky-600">+{rs(c.excess)}</span><span className="text-xs text-rose-600">{rs(c.short)}</span><span className={cn("w-24 text-end font-bold tabular-nums", c.net < 0 ? "text-rose-600" : "text-emerald-600")}>{rs(c.net)}</span></div>)) : <Empty title="No closed shifts" />}
        </Section>
        <Section title={<span className="flex items-center gap-2"><FileClock className="h-4 w-4" />Shift history</span>} className="lg:col-span-2">
          <table className="w-full text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Opened</th><th className="text-start">Counter</th><th className="text-start">Cashier</th><th className="text-end">Expected</th><th className="text-end">Counted</th><th className="text-end">Difference</th><th className="text-start ps-3">Status</th></tr></thead>
            <tbody>{(data?.closings ?? []).map((c) => <tr key={c.name} className="border-b border-border/60"><td className="py-2 text-xs">{String(c.period_start).slice(0, 16)}</td><td>{c.counter}</td><td>{c.user_name}</td>
              <td className="text-end tabular-nums">{rs(c.total_expected)}</td><td className="text-end tabular-nums">{rs(c.total_counted)}</td><td className={cn("text-end font-semibold tabular-nums", c.difference < 0 ? "text-rose-600" : c.difference > 0 ? "text-sky-600" : "")}>{rs(c.difference)}</td>
              <td className="ps-3"><Pill value={c.status === "Pending Approval" ? "Pending" : ["Approved", "Balanced", "Within Tolerance"].includes(c.status) ? "Approved" : c.status} /></td></tr>)}</tbody></table>
        </Section>
        {(data?.open_shifts.length ?? 0) > 0 && <Section title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Open shifts</span>}>
          {data!.open_shifts.map((o) => <div key={o.name} className="flex justify-between border-b border-border/60 py-2 text-sm"><span>{o.hv_counter} · {o.user_name}</span><span className={cn("text-xs", o.stale && "font-bold text-rose-600")}>{String(o.period_start_date).slice(0, 16)}{o.stale && " · not closed"}</span></div>)}</Section>}
        {(data?.uncollected_drafts.length ?? 0) > 0 && <Section title="Uncollected pharmacy drafts">
          {data!.uncollected_drafts.map((d) => <div key={d.name} className="flex justify-between border-b border-border/60 py-2 text-sm"><span>{d.hv_token ?? d.name} · {d.customer_name}</span><span className="tabular-nums">{rs(d.grand_total)}</span></div>)}</Section>}
      </div>
    </div>
  );
}
