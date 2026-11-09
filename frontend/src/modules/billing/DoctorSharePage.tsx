import { useMemo, useState } from "react";
import { Banknote, BookOpen, CheckCircle2, Coins, HandCoins, Plus, ReceiptText, RefreshCw, Search, Settings2, Stethoscope, TrendingUp, Undo2, Wallet, X } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { Empty, Field, inputCls, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { addDaysISO, todayISO } from "@/utils/dates";

const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
interface DocRow { doctor: string; doctor_name: string; doctor_type?: string; supplier?: string; earned: number; reversed: number; paid: number; unpaid: number; bills: number; last_date?: string; rules: number }
interface Overview { doctors: DocRow[]; company: string; basis: string; totals: { earned: number; reversed: number; paid: number; unpaid: number }; modes: string[]; expense_account?: string }
interface Rule { name?: string; doctor?: string; billing_type: string; item_group?: string; item_code?: string; share_type: string; value: number; basis: string; from_date?: string; to_date?: string; branch?: string; is_active: number }
interface Stmt { doctor: string; doctor_name: string; doctor_type?: string; specialization?: string; supplier?: string; totals: { earned: number; reversed: number; paid: number; unpaid: number };
  rows: { name: string; posting_date: string; entry_type: string; amount: number; status: string; payout?: string; sales_invoice: string; item_name?: string; billing_type?: string; patient?: string; patient_name?: string; line_amount: number; earned_fraction: number }[];
  payouts: { name: string; payment_date: string; total_amount: number; mode_of_payment: string; reference_no?: string; payment_entry?: string; status: string }[]; rules: Rule[] }

/** Doctor share (commission): who earns what, what is owed, payout runs (D-43). Accountant / cash supervisor. */
export default function DoctorSharePage() {
  const { data, refetch } = useApi<Overview>("doctor_share.overview");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<DocRow | null>(null);
  const [newRule, setNewRule] = useState(false);
  const [past, setPast] = useState(false);
  const list = useMemo(() => (data?.doctors ?? []).filter((d) => !q || d.doctor_name.toLowerCase().includes(q.toLowerCase())), [data, q]);
  if (!data) return <div className="flex h-60 items-center justify-center"><Spinner size={26} /></div>;
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-[#0b1f3a] p-5 text-white shadow-lg sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_0%_0%,rgba(56,189,248,0.45),transparent_60%),radial-gradient(600px_300px_at_100%_100%,rgba(16,185,129,0.35),transparent_60%)]" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><HandCoins className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">Doctor share</h1>
            <p className="text-sm text-white/75">Commission per doctor · earned {data.basis === "On payment" ? "as bills are paid" : "when the bill is made"} · paid to each doctor's supplier account</p></div>
          <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setNewRule(true)}><Plus className="h-4 w-4" />Commission rule</Button>
          <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setPast(true)}><RefreshCw className="h-4 w-4" />Apply to past bills</Button>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {([["Owed now", data.totals.unpaid, Wallet, "text-amber-200"], ["Earned", data.totals.earned, TrendingUp, "text-emerald-200"], ["Taken back", data.totals.reversed, Undo2, "text-rose-200"], ["Paid out", data.totals.paid, Banknote, "text-sky-200"]] as const).map(([l, v, I, c]) => (
            <div key={l} className="rounded-2xl bg-white/10 p-3 ring-1 ring-inset ring-white/15 backdrop-blur"><div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-white/60">{l}<I className={cn("h-4 w-4", c)} /></div>
              <div className="mt-1 text-2xl font-black tabular-nums">{rs(v)}</div></div>))}
        </div>
      </div>
      {!data.expense_account && <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Set Clinic Settings → Doctor Share → expense account, or commission is recorded without accounting entries.</div>}
      <div className="relative max-w-md"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} placeholder="Find a doctor" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((d) => (
        <div key={d.doctor} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
          <span className={cn("h-1 bg-gradient-to-r", d.unpaid > 0 ? "from-amber-400 to-orange-500" : "from-emerald-400 to-teal-500")} />
          <button className="flex items-center gap-3 p-4 text-start" onClick={() => setOpen(d.doctor)}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-emerald-600 text-white"><Stethoscope className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><b className="block truncate">{d.doctor_name}</b><span className="text-xs text-muted-foreground">{d.doctor_type} · {d.rules} rule{d.rules === 1 ? "" : "s"} · {d.bills} bill{d.bills === 1 ? "" : "s"}</span></span>
            <span className="text-end"><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Owed</span><span className={cn("text-xl font-black tabular-nums", d.unpaid > 0 ? "text-amber-600" : "text-emerald-600")}>{rs(d.unpaid)}</span></span>
          </button>
          <div className="grid grid-cols-3 gap-px border-y border-border bg-border/60 text-[11px]">
            {([["Earned", d.earned, ""], ["Taken back", d.reversed, "text-rose-600"], ["Paid", d.paid, "text-sky-700 dark:text-sky-300"]] as const).map(([l, v, c]) => (
              <div key={l} className="bg-card px-3 py-1.5"><div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{l}</div><div className={cn("font-semibold tabular-nums", c)}>{rs(v)}</div></div>))}
          </div>
          <div className="flex gap-2 p-3"><Button size="sm" variant="neutral" className="flex-1" onClick={() => setOpen(d.doctor)}><BookOpen className="h-4 w-4" />Statement</Button>
            <Button size="sm" variant="save" className="flex-1" disabled={d.unpaid <= 0} onClick={() => setPayFor(d)}><Banknote className="h-4 w-4" />Pay</Button></div>
        </div>))}</div> : <Empty title="No doctor has commission yet" hint="Add a commission rule for a doctor; bills from then on earn commission." icon={Coins} />}
      {open && <StatementDialog doctor={open} onClose={() => { setOpen(null); void refetch(); }} onPay={() => { const d = data.doctors.find((x) => x.doctor === open); if (d) setPayFor(d); }} />}
      {payFor && <PayDialog d={payFor} modes={data.modes} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); void refetch(); }} />}
      {newRule && <RuleDialog onClose={() => setNewRule(false)} onSaved={() => { setNewRule(false); void refetch(); }} />}
      {past && <PastDialog onClose={() => setPast(false)} onDone={() => { setPast(false); void refetch(); }} />}
    </div>
  );
}

/** The signed-in doctor's own statement (read-only). */
export function MySharePage() {
  const { data, error } = useApi<Stmt>("doctor_share.my_statement");
  if (error) return <Empty title="Your user is not linked to a doctor" icon={Stethoscope} />;
  if (!data) return <div className="flex h-60 items-center justify-center"><Spinner size={26} /></div>;
  return <div className="space-y-4"><h1 className="text-2xl font-extrabold">My commission</h1><StatementBody s={data} readOnly /></div>;
}

function StatementDialog({ doctor, onClose, onPay }: { doctor: string; onClose: () => void; onPay: () => void }) {
  const { data, refetch } = useApi<Stmt>("doctor_share.statement", { doctor });
  return (
    <Dialog open onClose={onClose} size="xl" className="max-w-5xl" title={data ? `${data.doctor_name} — commission` : "Statement"} description={data ? [data.doctor_type, data.specialization, data.supplier ? `Supplier ${data.supplier}` : ""].filter(Boolean).join(" · ") : undefined}>
      {data ? <StatementBody s={data} onPay={onPay} onChanged={() => void refetch()} /> : <div className="flex h-40 items-center justify-center"><Spinner /></div>}
    </Dialog>
  );
}

function StatementBody({ s, readOnly, onPay, onChanged }: { s: Stmt; readOnly?: boolean; onPay?: () => void; onChanged?: () => void }) {
  const [tab, setTab] = useState<"ledger" | "payouts" | "rules">("ledger");
  const [filter, setFilter] = useState<"" | "Unpaid" | "Paid">("");
  const [edit, setEdit] = useState<Rule | null>(null);
  const rows = s.rows.filter((r) => !filter || r.status === filter);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard label="Owed now" value={rs(s.totals.unpaid)} icon={Wallet} tone="amber" />
        <StatCard label="Earned" value={rs(s.totals.earned)} icon={TrendingUp} tone="teal" />
        <StatCard label="Taken back" value={rs(s.totals.reversed)} hint="Refunds / cancelled payments" icon={Undo2} tone="rose" />
        <StatCard label="Paid" value={rs(s.totals.paid)} icon={Banknote} tone="blue" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-muted p-1">{([["ledger", "Ledger", ReceiptText], ["payouts", "Payouts", Banknote], ["rules", "Rules", Settings2]] as const).filter(([k]) => !readOnly || k !== "rules" || s.rules.length).map(([k, l, I]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold", tab === k ? "bg-card shadow" : "text-muted-foreground")}><I className="h-3.5 w-3.5" />{l}</button>))}</div>
        {tab === "ledger" && <div className="flex rounded-xl bg-muted p-1">{([["", "All"], ["Unpaid", "Unpaid"], ["Paid", "Paid"]] as const).map(([k, l]) => (
          <button key={l} onClick={() => setFilter(k)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", filter === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>))}</div>}
        <div className="flex-1" />
        {!readOnly && s.totals.unpaid > 0 && onPay && <Button size="sm" variant="save" onClick={onPay}><Banknote className="h-4 w-4" />Pay {rs(s.totals.unpaid)}</Button>}
        {!readOnly && tab === "rules" && <Button size="sm" variant="neutral" onClick={() => setEdit({ doctor: s.doctor, billing_type: "OPD Slip", share_type: "Percent", value: 0, basis: "Net of discount", is_active: 1 })}><Plus className="h-4 w-4" />Rule</Button>}
      </div>
      {tab === "ledger" && <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-[11px] uppercase text-muted-foreground"><tr>
        <th className="px-3 py-2 text-start">Date</th><th className="text-start">Bill</th><th className="text-start">Patient · service</th><th className="text-end">Line</th><th className="text-end">Paid %</th><th className="text-end">Commission</th><th className="px-3 text-start">Status</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name} className="border-t border-border">
          <td className="px-3 py-2 text-xs">{r.posting_date}</td><td className="font-mono text-xs">{r.sales_invoice}<div className="font-sans text-[10px] text-muted-foreground">{r.billing_type}</div></td>
          <td className="max-w-[240px] truncate text-xs">{r.patient_name ?? r.patient}<div className="text-[11px] text-muted-foreground">{r.item_name}</div></td>
          <td className="text-end text-xs tabular-nums">{rs(r.line_amount)}</td><td className="text-end text-xs tabular-nums">{Math.round(r.earned_fraction)}%</td>
          <td className={cn("text-end font-bold tabular-nums", r.amount < 0 && "text-rose-600")}>{rs(r.amount)}</td>
          <td className="px-3"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.status === "Paid" ? "bg-sky-100 text-sky-800" : r.amount < 0 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800")}>{r.amount < 0 ? "Taken back" : r.status}</span></td></tr>)}</tbody></table>
        {!rows.length && <div className="p-6 text-center text-sm text-muted-foreground">No entries.</div>}</div>}
      {tab === "payouts" && <div className="space-y-2">{s.payouts.map((p) => (
        <div key={p.name} className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm"><Banknote className="h-5 w-5 text-sky-600" />
          <div className="min-w-0 flex-1"><b className="font-mono">{p.name}</b><div className="text-xs text-muted-foreground">{p.payment_date} · {p.mode_of_payment}{p.reference_no ? ` · ${p.reference_no}` : ""}{p.payment_entry ? ` · ${p.payment_entry}` : ""}</div></div>
          <b className="tabular-nums">{rs(p.total_amount)}</b><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", p.status === "Paid" ? "bg-emerald-100 text-emerald-800" : "bg-muted")}>{p.status}</span>
          {!readOnly && p.status === "Paid" && <button className="text-xs font-semibold text-rose-600 underline" onClick={async () => { if (!window.confirm(`Cancel payout ${p.name}? The payment entry is cancelled and the commission becomes unpaid again.`)) return;
            try { await call("doctor_share.cancel_payout", { name: p.name }); toast.success("Payout cancelled"); onChanged?.(); } catch (e) { toast.error(humanizeError(e)); } }}>Cancel</button>}
        </div>))}{!s.payouts.length && <div className="p-6 text-center text-sm text-muted-foreground">No payouts yet.</div>}</div>}
      {tab === "rules" && <div className="space-y-2">{s.rules.map((r) => (
        <button key={r.name} disabled={readOnly} onClick={() => setEdit(r)} className={cn("flex w-full items-center gap-3 rounded-xl border border-border p-3 text-start text-sm", !r.is_active && "opacity-50", !readOnly && "hover:border-sky-400")}>
          <Settings2 className="h-5 w-5 text-sky-600" /><div className="min-w-0 flex-1"><b>{r.billing_type === "Any" ? "All bills" : r.billing_type}</b>{r.item_code ? ` · ${r.item_code}` : r.item_group ? ` · ${r.item_group}` : ""}
            <div className="text-xs text-muted-foreground">{r.basis}{r.from_date ? ` · from ${r.from_date}` : ""}{r.to_date ? ` to ${r.to_date}` : ""}{r.branch ? ` · ${r.branch}` : ""}{r.is_active ? "" : " · inactive"}</div></div>
          <b className="text-lg tabular-nums">{r.share_type === "Percent" ? `${r.value}%` : `${rs(r.value)} / unit`}</b></button>))}
        {!s.rules.length && <div className="p-6 text-center text-sm text-muted-foreground">No commission rule — this doctor earns nothing on new bills.</div>}</div>}
      {edit && <RuleDialog rule={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged?.(); }} />}
    </div>
  );
}

function RuleDialog({ rule, onClose, onSaved }: { rule?: Rule; onClose: () => void; onSaved: () => void }) {
  const { data: doctors } = useApi<{ name: string; doctor_name: string; doctor_type: string }[]>("doctor_share.doctors", undefined, { enabled: !rule?.doctor });
  const [r, setR] = useState<Rule>(rule ?? { billing_type: "OPD Slip", share_type: "Percent", value: 0, basis: "Net of discount", is_active: 1 });
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await call("doctor_share.save_rule", { data: JSON.stringify(r) }); toast.success("Rule saved"); onSaved(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  const set = (p: Partial<Rule>) => setR((x) => ({ ...x, ...p }));
  return (
    <Dialog open onClose={onClose} size="md" title={r.name ? "Edit commission rule" : "New commission rule"} description="The most specific rule wins: a service beats a service group, which beats a billing type, which beats 'All bills'.">
      <div className="space-y-3">
        {!rule?.doctor && <Field label="Doctor" required><select className={inputCls} value={r.doctor ?? ""} onChange={(e) => set({ doctor: e.target.value })}><option value="">Choose…</option>
          {(doctors ?? []).map((d) => <option key={d.name} value={d.name}>{d.doctor_name} · {d.doctor_type}</option>)}</select></Field>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Bills"><select className={inputCls} value={r.billing_type} onChange={(e) => set({ billing_type: e.target.value })}>
            {[["Any", "All bills"], ["OPD Slip", "OPD consultations"], ["Lab", "Lab tests referred"], ["IPD Slip", "IPD / ER bills"], ["Fee", "Online visit fees"], ["General", "Other services"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Service (optional)"><input className={inputCls} value={r.item_code ?? ""} onChange={(e) => set({ item_code: e.target.value })} placeholder="Item code" /></Field>
        </div>
        <div className="grid grid-cols-[1fr_1fr] gap-2">
          <Field label="Commission"><div className="flex rounded-xl bg-muted p-1">{([["Percent", "%"], ["Fixed per unit", "Rs / unit"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => set({ share_type: v })} className={cn("flex-1 rounded-lg py-1.5 text-xs font-bold", r.share_type === v ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>))}</div></Field>
          <Field label={r.share_type === "Percent" ? "Percent" : "Rs per unit"} required><input className={inputCls + " text-end font-bold"} inputMode="decimal" value={r.value || ""} onChange={(e) => set({ value: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></Field>
        </div>
        {r.share_type === "Percent" && <Field label="Percent of"><select className={inputCls} value={r.basis} onChange={(e) => set({ basis: e.target.value })}><option>Net of discount</option><option>Gross</option></select></Field>}
        <div className="grid grid-cols-2 gap-2"><Field label="From"><input type="date" className={inputCls} value={r.from_date ?? ""} onChange={(e) => set({ from_date: e.target.value })} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={r.to_date ?? ""} onChange={(e) => set({ to_date: e.target.value })} /></Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!r.is_active} onChange={(e) => set({ is_active: e.target.checked ? 1 : 0 })} />Active</label>
        <Button variant="save" className="w-full" disabled={!r.doctor || !r.value} loading={busy} onClick={() => void save()}><CheckCircle2 className="h-4 w-4" />Save rule</Button>
      </div>
    </Dialog>
  );
}

function PayDialog({ d, modes, onClose, onDone }: { d: DocRow; modes: string[]; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState(todayISO());
  const [from, setFrom] = useState("");
  const [mode, setMode] = useState(modes.includes("Cash") ? "Cash" : modes[0]);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const { data } = useApi<{ rows: { name: string }[]; total: number }>("doctor_share.unpaid", { doctor: d.doctor, from_date: from || undefined, to_date: to });
  const go = async () => {
    setBusy(true);
    try { const r = await call<{ payout: string; payment_entry: string; total: number }>("doctor_share.pay", { doctor: d.doctor, mode_of_payment: mode, from_date: from || undefined, to_date: to, reference_no: ref || undefined });
      toast.success(`Paid ${rs(r.total)} · ${r.payment_entry}`); onDone(); }
    catch (e) { toast.error(humanizeError(e), { duration: 8000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} size="md" title={<span className="flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-600" />Pay {d.doctor_name}</span>} description="All unpaid commission up to the date is paid in one payment to the doctor's supplier account.">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2"><Field label="From (optional)"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Up to"><input type="date" className={inputCls} value={to} max={todayISO()} onChange={(e) => setTo(e.target.value)} /></Field></div>
        <div className="flex flex-wrap gap-1.5">{[["This month", todayISO().slice(0, 8) + "01"], ["Last 7 days", addDaysISO(todayISO(), -6)], ["All", ""]].map(([l, f]) => <button key={l} onClick={() => { setFrom(f); setTo(todayISO()); }} className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-sky-400">{l}</button>)}</div>
        <Field label="Paid by"><div className="flex flex-wrap gap-1.5">{modes.map((m) => <button key={m} onClick={() => setMode(m)} className={cn("rounded-xl border-2 px-3 py-2 text-xs font-bold", mode === m ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-border")}>{m}</button>)}</div></Field>
        {mode !== "Cash" && <Field label="Cheque / transaction no." required><input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>}
        <div className="rounded-2xl bg-gradient-to-br from-sky-800 to-emerald-800 p-4 text-white"><div className="text-[10px] uppercase tracking-widest text-white/60">To pay · {data?.rows.length ?? 0} entries</div>
          <div className="text-4xl font-black tabular-nums">{data ? rs(data.total) : "…"}</div></div>
        <Button variant="submit" size="lg" className="w-full" disabled={!data || data.total <= 0 || (mode !== "Cash" && !ref.trim())} loading={busy} onClick={() => void go()}><CheckCircle2 className="h-5 w-5" />Approve and pay</Button>
      </div>
    </Dialog>
  );
}

function PastDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} size="sm" title="Apply rules to past bills" description="Checks every bill in the period against today's rules and adds only the difference. Safe to run again.">
      <div className="space-y-3"><div className="grid grid-cols-2 gap-2"><Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
        <div className="flex gap-2"><Button variant="neutral" className="flex-1" onClick={onClose}><X className="h-4 w-4" />Cancel</Button>
          <Button variant="save" className="flex-1" loading={busy} onClick={async () => { setBusy(true); try { const r = await call<{ bills: number }>("doctor_share.recompute_range", { from_date: from, to_date: to }); toast.success(`${r.bills} bills checked`); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } }}>
            <RefreshCw className="h-4 w-4" />Apply</Button></div></div>
    </Dialog>
  );
}
