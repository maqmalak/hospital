import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Lock, PiggyBank, Play, Receipt, RotateCcw, Undo2, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { Empty, Field, inputCls, Pill, Section, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { COUNTER_ICON, type MyShift, rs } from "./shared";

export default function ShiftPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, refetch } = useApi<MyShift>("cash.my_shift", undefined, { refetchInterval: 20_000 });
  const [counter, setCounter] = useState("");
  const [float_, setFloat] = useState<Record<string, string>>({});
  const [mv, setMv] = useState<null | "Pay In" | "Pay Out" | "Cash Drop">(null);
  const [refund, setRefund] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <div className="h-96 animate-pulse rounded-3xl bg-muted" />;
  const s = data.shift;

  const open = async () => {
    setBusy(true);
    try { await call("cash.open_shift", { counter, balances: Object.fromEntries(Object.entries(float_).map(([k, v]) => [k, Number(v) || 0])) }); toast.success("Shift opened"); void refetch(); void qc.invalidateQueries(); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };

  if (!s) return (
    <div className="mx-auto max-w-5xl">
      <Hero title="Open your shift" sub="No money is collected outside a shift. Pick your counter and count the opening float." />
      <Section title="Counter">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.counters.map((c) => { const taken = !!c.open_shift; return (
            <button key={c.name} disabled={taken} onClick={() => setCounter(c.name)}
              className={cn("rounded-2xl border p-4 text-start transition-all disabled:opacity-50", counter === c.name ? "border-transparent bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg" : "border-border hover:border-primary/40")}>
              <div className="text-2xl">{COUNTER_ICON[c.counter_type] ?? "💳"}</div>
              <div className="mt-1 font-bold">{c.counter_name}</div>
              <div className={cn("text-xs", counter === c.name ? "text-white/80" : "text-muted-foreground")}>{c.counter_type} · {c.branch}</div>
              {taken && <div className="mt-1 text-xs font-semibold text-rose-600">In use by {c.current_user}</div>}
            </button>); })}
        </div>
      </Section>
      <Section title="Opening float" className="mt-4">
        <div className="grid gap-3 sm:grid-cols-3">{data.modes.map((m) => (
          <Field key={m} label={m}><input className={inputCls + " h-11 text-end text-lg tabular-nums"} inputMode="numeric" placeholder="0" value={float_[m] ?? ""} onChange={(e) => setFloat((f) => ({ ...f, [m]: e.target.value.replace(/\D/g, "") }))} /></Field>))}</div>
        <Button variant="submit" size="lg" className="mt-4 w-full" disabled={!counter} loading={busy} onClick={() => void open()}><Play className="h-5 w-5" />Open shift</Button>
      </Section>
    </div>
  );

  const cash = s.modes.find((m) => m.mode_of_payment === "Cash");
  const over = cash && s.max_cash_in_drawer && cash.expected > s.max_cash_in_drawer;
  return (
    <div className="mx-auto max-w-7xl">
      <Hero title={`${s.counter} · shift open`} sub={`Since ${new Date(s.opened_at.replace(" ", "T")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${s.shift}`}
        actions={<>
          <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setMv("Pay In")}><ArrowDownToLine className="h-4 w-4" />Pay in</Button>
          <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setMv("Pay Out")}><ArrowUpFromLine className="h-4 w-4" />Pay out</Button>
          <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setMv("Cash Drop")}><PiggyBank className="h-4 w-4" />Cash drop</Button>
          <Link to="/cash/close"><Button className="bg-white text-emerald-800 hover:bg-white/90"><Lock className="h-4 w-4" />Close shift</Button></Link>
        </>} />
      {data.closing && <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-500/10"><b>Closing {data.closing.status}.</b> {data.closing.decision_note} — billing is paused until it is settled. <Link to="/cash/close" className="font-semibold underline">Open the count</Link></div>}
      {over && <div className="mb-4 rounded-2xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">Cash in the drawer is above {rs(s.max_cash_in_drawer)} — please make a cash drop.</div>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sales" value={rs(s.sales_total)} hint={`${s.invoice_count} bills`} icon={Receipt} tone="teal" />
        <StatCard label="Refunds" value={rs(s.refund_total)} hint={`${s.refund_count} credit notes`} icon={Undo2} tone="rose" />
        <StatCard label="Cash in drawer" value={rs(cash?.expected)} hint={`float ${rs(cash?.opening)}`} icon={Banknote} tone="amber" />
        <StatCard label="All modes" value={rs(s.total_expected)} icon={Wallet} tone="violet" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="By payment mode" className="lg:col-span-2">
          <table className="w-full text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Mode</th><th className="text-end">Opening</th><th className="text-end">Collections</th><th className="text-end">Pay in</th><th className="text-end">Pay out</th><th className="text-end">Drops</th><th className="text-end">Expected</th></tr></thead>
            <tbody>{s.modes.filter((m) => m.expected || m.collections || m.opening).map((m) => <tr key={m.mode_of_payment} className="border-b border-border/60"><td className="py-2 font-semibold">{m.mode_of_payment}</td>
              {[m.opening, m.collections, m.pay_in, m.pay_out, m.cash_drop].map((v, i) => <td key={i} className="text-end tabular-nums">{v ? rs(v) : "–"}</td>)}<td className="text-end font-bold tabular-nums">{rs(m.expected)}</td></tr>)}</tbody></table>
        </Section>
        <Section title="Cash movements">
          {data.movements?.length ? data.movements.map((m) => (
            <div key={m.name} className="flex items-center gap-2 border-b border-border/60 py-2 text-sm last:border-0"><span className="flex-1"><b>{m.movement_type}</b> <span className="text-muted-foreground">{m.reason}</span></span>
              <span className="tabular-nums">{rs(m.amount)}</span><Pill value={m.status === "Pending Confirmation" ? "Pending" : m.status === "Posted" || m.status === "Confirmed" ? "Approved" : "Rejected"} /></div>)) : <Empty title="No movements" />}
        </Section>
        <Section title="Bills in this shift" className="lg:col-span-3">
          <div className="max-h-96 overflow-y-auto"><table className="w-full text-sm"><tbody>{(data.invoices ?? []).map((i) => (
            <tr key={i.name} className="border-b border-border/60"><td className="py-2 font-mono text-xs">{i.name}</td><td>{i.customer_name}</td><td className="text-xs text-muted-foreground">{i.hv_billing_type} · {i.mode} · {i.posting_time?.slice(0, 5)}</td>
              <td className={cn("text-end font-semibold tabular-nums", i.is_return && "text-rose-600")}>{rs(i.grand_total)}</td>
              <td className="text-end">{!i.is_return && <Button size="xs" variant="ghost" onClick={() => setRefund(i.name)}><RotateCcw className="h-3 w-3" />{t("Refund")}</Button>}</td></tr>))}</tbody></table>
            {!data.invoices?.length && <Empty title="No bills yet" />}</div>
        </Section>
      </div>
      {mv && <MovementDialog type={mv} onClose={() => setMv(null)} onDone={() => { setMv(null); void refetch(); }} />}
      {refund && <RefundDialog invoice={refund} onClose={() => setRefund(null)} onDone={() => { setRefund(null); void refetch(); }} />}
    </div>
  );
}

export function Hero({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-3xl bg-[#04281f] p-5 text-white shadow-lg sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_0%_0%,rgba(16,185,129,0.55),transparent_60%),radial-gradient(600px_300px_at_100%_100%,rgba(245,158,11,0.3),transparent_60%)]" />
      <div className="relative flex flex-wrap items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><Wallet className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">{title}</h1>{sub && <p className="text-sm text-white/75">{sub}</p>}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

function MovementDialog({ type, onClose, onDone }: { type: "Pay In" | "Pay Out" | "Cash Drop"; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const help = { "Pay In": "Float top-up from the safe.", "Pay Out": "Petty expense or cash refund from the drawer — keep the receipt.", "Cash Drop": "Excess cash to the safe. The supervisor confirms receipt." }[type];
  const save = async () => { setBusy(true); try { await call("cash.movement", { movement_type: type, amount: Number(amount), reason }); toast.success(`${type} recorded`); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} title={type} description={help} size="sm">
      <Field label="Amount"><input className={inputCls + " h-12 text-end text-2xl font-bold tabular-nums"} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
      <Field label="Reason" className="mt-3"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Button variant="primary" className="mt-4 w-full" disabled={!amount || !reason.trim()} loading={busy} onClick={() => void save()}>Record {type.toLowerCase()}</Button>
    </Dialog>
  );
}

function RefundDialog({ invoice, onClose, onDone }: { invoice: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { const r = await call<string>("cash.refund", { invoice, reason }); toast.success(`Refunded · ${r}`); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} title={`Refund ${invoice}`} description="A credit note against the bill, paid back from your drawer. Stock returns to its batch." size="sm">
      <Field label="Reason" required><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
      <Button variant="destructive" className="mt-4 w-full" disabled={!reason.trim()} loading={busy} onClick={() => void save()}><RotateCcw className="h-4 w-4" />Refund in full</Button>
    </Dialog>
  );
}
