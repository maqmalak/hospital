/**
 * Finance (/finance) in the sugarcane finance-page style (D-64): bank / cash, payables / receivables, profit this financial year,
 * post-dated cheques; every finance function as coloured cards; draft vouchers — tick, post and print together; posted vouchers;
 * income vs expense by month; then the hospital's revenue, discount, expense, payer and doctor-share analytics.
 * Data: hospital_vvs.api.finance.accounts / post_vouchers / print_vouchers and finance.overview.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Banknote, BarChart3, BookOpen, Building2, CheckCircle2, ChevronRight, Clock, ExternalLink, FileText, HandCoins, HeartHandshake, Landmark, type LucideIcon,
  Plus, Printer, Receipt, Scale, Settings, ShieldCheck, ShoppingCart, Truck, Wallet,
} from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { http } from "@/services/frappe";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/skeleton";
import { axisProps, useViz } from "@/lib/viz";
import { cn } from "@/utils/cn";
import { FinanceOverviewPage } from "./FinancePages";

interface Acct { account: string; account_name: string; balance: number }
interface Voucher { doctype: string; name: string; code: string; posting_date: string; amount: number; remark?: string; owner?: string }
interface Fin {
  company: string; fy_start: string; month: string; banks: Acct[]; cash: Acct[]; payable: number; receivable: number;
  profit: { income: number; expense: number; profit: number; margin: number }; trend: { month: string; income: number; expense: number }[];
  drafts: Voucher[]; recent: Voucher[]; codes: { code: string; n: number; amount: number }[]; pdc: { n: number; issued: number; received: number };
  assets: { n: number; cost: number; book: number };
}

const C = { blue: "#2563eb", emerald: "#059669", rose: "#e11d48", amber: "#d97706", teal: "#0d9488", violet: "#7c3aed", slate: "#475569" };
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
const rsShort = (v: number) => `Rs ${short(v)}`;
const short = (v: number) => (Math.abs(v) >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : Math.round(v).toLocaleString("en-PK"));
const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const CODE_TONE: Record<string, string> = {
  JV: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200", BPV: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
  BRV: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200", CPV: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200",
  CRV: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200",
};
const Code = ({ c }: { c: string }) => <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold", CODE_TONE[c] ?? CODE_TONE.JV)}>{c || "JV"}</span>;
const desk = (dt: string, name?: string) => (dt === "Journal Entry" ? "/hms/accounting/journal-entries" : "/hms/accounting/payment-entries") + (name ? `/${encodeURIComponent(name)}` : "");
const Desk = ({ dt, name }: { dt: string; name: string }) => <a href={desk(dt, name)} className="font-mono text-xs text-teal-700 hover:underline dark:text-teal-300">{name}</a>;

function Kpi({ icon: I, label, value, sub, color, to, title }: { icon: LucideIcon; label: string; value: string; sub?: ReactNode; color: string; to?: string; title?: string }) {
  const body = (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-[0.12] blur-2xl" style={{ background: color }} />
      <span className="grid h-10 w-10 place-items-center rounded-xl text-white shadow-md ring-1 ring-white/20 transition-transform group-hover:scale-110" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}><I className="h-5 w-5" /></span>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-2xl font-bold tracking-tight tabular-nums" title={title}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
}

function Card({ title, sub, actions, children, className }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-border bg-card shadow-sm", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4"><div className="min-w-0"><h3 className="font-semibold tracking-tight">{title}</h3>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>{actions}</header>
      <div className="min-h-0 flex-auto px-3 pb-3 pt-2 sm:px-4">{children}</div>
    </section>
  );
}

// every finance function as coloured cards (hospital screens + ERPNext desk)
type Item = { label: string; to: string; icon: LucideIcon; desk?: boolean };
const MANAGE: { title: string; tile: string; wash: string; items: Item[] }[] = [
  { title: "Transactions", tile: "from-blue-500 to-indigo-600", wash: "from-blue-500/15", items: [
    { label: "Journal entries", to: "/accounting/journal-entries", icon: BookOpen }, { label: "Payment entries", to: "/accounting/payment-entries", icon: HandCoins },
    { label: "Expenses", to: "/expenses", icon: Receipt }, { label: "Discount approvals", to: "/billing/discount-approvals", icon: ShieldCheck }] },
  { title: "Receivables & payables", tile: "from-amber-400 to-orange-500", wash: "from-amber-500/15", items: [
    { label: "Panels & insurers", to: "/panels", icon: Building2 }, { label: "Insurance claims", to: "/claims", icon: FileText },
    { label: "Supplier invoices", to: "/purchase/invoices", icon: ShoppingCart }, { label: "Doctor share", to: "/doctor-share", icon: HeartHandshake }] },
  { title: "Banking & cash", tile: "from-emerald-400 to-teal-600", wash: "from-emerald-500/15", items: [
    { label: "Cash reports", to: "/cash/reports", icon: Wallet }, { label: "Online card payments", to: "/online-payments", icon: Banknote },
    { label: "Bank clearance", to: "/accounting/bank-clearance", icon: Scale }, { label: "Welfare & zakat", to: "/welfare", icon: HeartHandshake }] },
  { title: "Reports", tile: "from-sky-400 to-cyan-600", wash: "from-sky-500/15", items: [
    { label: "General ledger", to: "/accounting/reports/general-ledger", icon: BookOpen }, { label: "Trial balance", to: "/accounting/reports/trial-balance", icon: Scale },
    { label: "Profit and loss", to: "/accounting/reports/profit-and-loss", icon: BarChart3 }, { label: "Balance sheet", to: "/accounting/reports/balance-sheet", icon: Landmark }] },
  { title: "Assets & buying", tile: "from-violet-400 to-purple-600", wash: "from-violet-500/15", items: [
    { label: "Fixed assets", to: "/assets", icon: Building2 }, { label: "Purchase orders", to: "/import/purchase-orders", icon: Truck },
    { label: "Buying", to: "/buying", icon: ShoppingCart }, { label: "Consumption", to: "/consumption", icon: Receipt }] },
  { title: "Tax & setup", tile: "from-slate-400 to-slate-600", wash: "from-slate-500/15", items: [
    { label: "FBR reporting", to: "/fbr", icon: FileText }, { label: "Chart of accounts", to: "/accounting/chart-of-accounts", icon: BookOpen },
    { label: "Cost centres", to: "/accounting/cost-centers", icon: Landmark }, { label: "Clinic settings", to: "/settings", icon: Settings }] },
];

function ManageFinance() {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div><h3 className="text-lg font-semibold">Manage finance</h3>
          <p className="text-xs text-muted-foreground">Every accounting function: vouchers and payments, receivables and payables, banking, statements, assets and setup.</p></div>
        <div className="flex gap-2">
          <Link to="/accounting/journal-entries/new" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 px-3 text-sm font-semibold text-white shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Journal voucher</Link>
          <Link to="/accounting/payment-entries/new" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-3 text-sm font-semibold text-white shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Payment / receipt</Link>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {MANAGE.map((g) => (
          <div key={g.title} className={cn("rounded-2xl border border-border bg-gradient-to-br to-transparent p-3", g.wash)}>
            <div className="mb-2 flex items-center justify-between px-1"><span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{g.title}</span>
              <span className="rounded-full bg-background/80 px-2 text-[10px] font-semibold text-muted-foreground">{g.items.length}</span></div>
            <div className="space-y-0.5">
              {g.items.map((i) => {
                const inner = <>
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm", g.tile)}><i.icon className="h-3.5 w-3.5" /></span>
                  <span className="min-w-0 flex-1 truncate font-medium group-hover:text-primary">{i.label}</span>
                  {i.desk ? <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}</>;
                const cls = "group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-sm transition-colors hover:bg-background/80";
                return i.desk ? <a key={i.to} href={i.to} target="_blank" rel="noreferrer" className={cls}>{inner}</a> : <Link key={i.to} to={i.to} className={cls}>{inner}</Link>;
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function printRefs(list: string[]) {
  try {
    const r = await http.post("/api/method/hospital_vvs.api.finance.print_vouchers", new URLSearchParams({ refs: JSON.stringify(list) }), { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) { toast.error(humanizeError(e)); }
}

export default function AccountsPage() {
  const { data: d, refetch } = useApi<Fin>("finance.accounts");
  const qc = useQueryClient();
  const v = useViz();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const refs = useMemo(() => [...sel], [sel]);
  if (!d) return <div className="flex h-72 items-center justify-center"><Spinner size={26} /></div>;
  const key = (r: Voucher) => `${r.doctype}::${r.name}`;
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const bank = d.banks.reduce((a, b) => a + b.balance, 0), cash = d.cash.reduce((a, b) => a + b.balance, 0);
  const post = async () => {
    setBusy(true);
    try {
      const r = await call<{ posted: string[]; failed: { name: string; error: string }[] }>("finance.post_vouchers", { refs: JSON.stringify(refs) });
      if (r.posted.length) toast.success(`${r.posted.length} voucher(s) posted`);
      r.failed.forEach((f) => toast.error(`${f.name}: ${f.error}`, { duration: 7000 }));
      setSel(new Set()); void refetch(); void qc.invalidateQueries({ queryKey: ["finance.overview"] });
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 via-red-600 to-orange-500 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Landmark className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Finance</div>
            <h1 className="text-2xl font-bold tracking-tight">Finance and accounts</h1>
            <p className="text-sm text-white/85">{d.company} · financial year from {day(d.fy_start)} · bank and cash, payables and receivables, vouchers (JV / BPV / BRV / CPV / CRV), batch posting and printing, fixed assets.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Kpi icon={Landmark} label="Bank" value={rsShort(bank)} title={rs(bank)} color={C.blue} sub={`${d.banks.length} accounts`} />
        <Kpi icon={Banknote} label="Cash in hand" value={rsShort(cash)} title={rs(cash)} color={C.emerald} sub={`${d.cash.length} cash accounts`} to="/cash/reports" />
        <Kpi icon={Receipt} label="Payable (supplier bills)" value={rsShort(d.payable)} title={rs(d.payable)} color={C.rose} to="/purchase_invoice" sub="outstanding" />
        <Kpi icon={Wallet} label="Receivable" value={rsShort(d.receivable)} title={rs(d.receivable)} color={C.amber} to="/panels" sub="patients, panels, insurers" />
        <Kpi icon={BarChart3} label={`Profit since ${day(d.fy_start)}`} value={rsShort(d.profit.profit)} title={rs(d.profit.profit)} color={d.profit.profit >= 0 ? C.teal : C.rose} sub={`margin ${d.profit.margin}% · income ${short(d.profit.income)}`} />
        <Kpi icon={Clock} label="Post-dated cheques" value={String(d.pdc.n)} color={C.violet} sub={`in ${rs(d.pdc.received)} · out ${rs(d.pdc.issued)}`} />
      </div>

      <ManageFinance />

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div><h3 className="font-semibold">Vouchers waiting to be posted ({d.drafts.length})</h3>
            <p className="text-xs text-muted-foreground">Tick and post together (each is checked on its own), or print them — one voucher a page.</p></div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!d.drafts.length} onClick={() => setSel(sel.size === d.drafts.length ? new Set() : new Set(d.drafts.map(key)))}>{sel.size === d.drafts.length && sel.size ? "Clear" : "Select all"}</Button>
            <Button size="sm" variant="outline" disabled={!sel.size} onClick={() => void printRefs(refs)}><Printer className="h-4 w-4" />Print {sel.size || ""}</Button>
            <Button size="sm" variant="submit" disabled={!sel.size} loading={busy} onClick={() => void post()}><CheckCircle2 className="h-4 w-4" />Post {sel.size || ""}</Button>
          </div>
        </header>
        <div className="divide-y divide-border">
          {d.drafts.length === 0 && <p className="p-5 text-sm text-muted-foreground">No drafts — every voucher is posted.</p>}
          {d.drafts.map((r) => (
            <label key={key(r)} className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-2 text-sm hover:bg-muted/40">
              <input type="checkbox" checked={sel.has(key(r))} onChange={() => toggle(key(r))} className="accent-teal-600" />
              <Code c={r.code} /><Desk dt={r.doctype} name={r.name} />
              <span className="text-muted-foreground">{day(r.posting_date)}</span>
              <span className="min-w-0 flex-1 truncate">{r.remark}</span>
              <b className="tabular-nums">{rs(r.amount)}</b>
            </label>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Income and expense by month" sub="From the general ledger" className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={d.trend} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={v.grid} vertical={false} />
                <XAxis dataKey="month" {...axisProps(v.axis)} />
                <YAxis {...axisProps(v.axis)} width={52} tickFormatter={(x: number) => short(x)} />
                <Tooltip formatter={(x: number) => rs(x)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill={C.teal} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="expense" name="Expense" fill={C.rose} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Line dataKey={(r: { income: number; expense: number }) => r.income - r.expense} name="Profit" stroke={C.violet} strokeWidth={2} dot isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title={`This month by voucher type`} sub={d.month}>
            <div className="space-y-1.5 px-1 pb-2 text-sm">
              {d.codes.map((c) => <div key={c.code} className="flex items-center justify-between gap-2"><Code c={c.code} /><span className="flex-1 text-xs text-muted-foreground">{c.n} vouchers</span><b className="tabular-nums">{rs(c.amount)}</b></div>)}
              {!d.codes.length && <p className="text-muted-foreground">No vouchers this month.</p>}
              <p className="pt-2 text-xs text-muted-foreground">Fixed assets: {d.assets.n} · cost {rs(d.assets.cost)} · book value {rs(d.assets.book)}</p>
            </div>
          </Card>
          <Card title="Bank and cash accounts">
            <div className="space-y-1 px-1 pb-2 text-sm">{[...d.banks, ...d.cash].map((a) => <div key={a.account} className="flex justify-between gap-2"><span className="truncate">{a.account_name}</span><b className="tabular-nums">{rs(a.balance)}</b></div>)}</div>
          </Card>
        </div>
      </div>

      <Card title="Posted vouchers" sub="Latest journals and payments; print any">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground"><th className="py-2">Type</th><th>Voucher</th><th>Date</th><th>Narration</th><th className="text-right">Amount</th><th /></tr></thead>
            <tbody>{d.recent.map((r) => (
              <tr key={key(r)} className="border-b border-border/60">
                <td className="py-1.5"><Code c={r.code} /></td><td><Desk dt={r.doctype} name={r.name} /></td><td className="text-xs text-muted-foreground">{day(r.posting_date)}</td>
                <td className="max-w-[360px] truncate text-xs">{r.remark}</td><td className="text-right font-semibold tabular-nums">{rs(r.amount)}</td>
                <td className="text-right"><button onClick={() => void printRefs([key(r)])} className="rounded-md p-1 text-teal-600 hover:bg-muted" title="Print"><Printer className="h-4 w-4" /></button></td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>

      <div className="pt-2">
        <FinanceOverviewPage embedded />
      </div>
    </div>
  );
}
