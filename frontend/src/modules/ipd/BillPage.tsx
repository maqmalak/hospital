import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Banknote, FileWarning, HandCoins, Percent, Printer, Receipt, RotateCcw, Search, Undo2, Wallet, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { printDoc } from "@/lib/print";
import { Empty, Field, inputCls } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { ChargesTable } from "./panels";
import { billHtml } from "./prints";
import { type Bill, CHARGE_TONE, ChargeDot, Chip, dt, IpdHero, rs, useIpdLive } from "./shared";

const MODES = ["Cash", "Card", "Bank Transfer", "JazzCash", "Easypaisa"];
interface Row { name: string; patient_name: string; patient: string; bed_no?: string; ward: string; status: string; charges_total: number; advance_total: number; payer_type: string; final_invoice?: string }

/** IPD desk: running bill, advances, discount, final invoice, settlement (all in the collector's cashier shift). */
export default function BillPage() {
  const [sp, setSp] = useSearchParams();
  const { branch } = useAuth();
  const adm = sp.get("adm") || "";
  const [q, setQ] = useState("");
  const { data: rows } = useApi<Row[]>("ipd.admissions", { branch, status: "open", q });
  useIpdLive(["ipd.admissions", "ipd.bill"]);
  return (
    <div className="mx-auto max-w-[1500px]">
      <IpdHero title="IPD bill" icon={Receipt} sub="Running bill, advances, final invoice and settlement" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-border bg-card p-3 lg:sticky lg:top-0 lg:max-h-[80vh] lg:overflow-y-auto">
          <div className="relative mb-2"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} placeholder="Patient, MR, admission" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {(rows ?? []).map((r) => <button key={r.name} onClick={() => setSp({ adm: r.name })} className={cn("mb-1 block w-full rounded-xl p-2 text-start", adm === r.name ? "bg-teal-600 text-white" : "hover:bg-muted")}>
            <div className="flex items-center gap-2"><span className="rounded bg-black/10 px-1.5 text-xs font-black dark:bg-white/10">{r.bed_no}</span><b className="flex-1 truncate">{r.patient_name}</b>{r.final_invoice && <span className="text-[10px] font-bold">BILLED</span>}</div>
            <div className={cn("text-xs", adm === r.name ? "text-white/80" : "text-muted-foreground")}>{r.name} · {r.ward} · {r.payer_type}</div></button>)}
          {rows && !rows.length && <div className="p-4 text-center text-sm text-muted-foreground">No open admissions</div>}
        </aside>
        {adm ? <BillView name={adm} /> : <Empty title="Pick an admission" hint="Choose a patient on the left." icon={Receipt} />}
      </div>
    </div>
  );
}

function BillView({ name }: { name: string }) {
  const { hasRole } = useAuth();
  const { data: b, refetch } = useApi<Bill>("ipd.bill", { name }, { refetchInterval: 60_000 });
  const [pay, setPay] = useState<null | "Advance" | "Settlement" | "Refund">(null);
  const [disc, setDisc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"summary" | "lines">("summary");
  const order = useMemo(() => Object.entries(b?.by_type ?? {}).sort((x, y) => y[1] - x[1]), [b]);
  if (!b) return <div className="flex h-64 items-center justify-center"><Spinner size={28} /></div>;
  const a = b.admission!;
  const billed = !!a.final_invoice;
  const finalBill = async (override?: string) => {
    setBusy(true);
    try { await call("ipd.final_bill", { name, discount_amount: a.discount_amount || 0, discount_authorization: a.discount_authorization, override_reason: override }); toast.success("Final bill made"); void refetch(); }
    catch (e) { const msg = humanizeError(e); toast.error(msg, { duration: 9000 }); if (/hold/i.test(msg) && hasRole("PW Doctor", "PW Cash Supervisor", "PW Accountant")) { const r = prompt(`${msg}\n\nMake the bill anyway? Enter the reason:`); if (r) await finalBill(r); } }
    finally { setBusy(false); }
  };
  const max = Math.max(...order.map(([, v]) => v), 1);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1"><div className="text-lg font-bold">{b.patient?.patient_name} <span className="text-sm font-normal text-muted-foreground">{b.patient?.name}</span></div>
              <div className="text-xs text-muted-foreground">{a.name} · {a.ward} · bed {b.bed_no} · {b.days ?? 0} day(s) · in {dt(a.admit_datetime)}{a.release_datetime ? ` · out ${dt(a.release_datetime)}` : ""}</div></div>
            <Chip s={a.status} />{billed && <Chip s="Billed" />}
            <Link to={`/ipd/${a.name}`}><Button size="sm" variant="neutral">Chart</Button></Link>
          </div>
          <div className="mb-3 flex gap-1 rounded-xl bg-muted p-1">{[["summary", "By type"], ["lines", "Every line"]].map(([k, l]) => <button key={k} onClick={() => setView(k as "summary")}
            className={cn("flex-1 rounded-lg py-1.5 text-sm font-semibold", view === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>)}</div>
          {view === "summary" ? <div className="space-y-2">{order.map(([t, v]) => (
            <div key={t} className="grid grid-cols-[120px_1fr_110px] items-center gap-3 text-sm"><span className="flex items-center gap-2 font-semibold"><ChargeDot t={t} />{t}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", CHARGE_TONE[t] ?? "bg-slate-400")} style={{ width: `${Math.max((v / max) * 100, 2)}%` }} /></span>
              <span className="text-end font-bold tabular-nums">{rs(v)}</span></div>))}
            {!order.length && <div className="text-sm text-muted-foreground">No charges yet.</div>}</div>
            : <ChargesTable lines={b.lines} />}
        </section>
        <aside className="space-y-3">
          <div className="rounded-2xl bg-gradient-to-br from-teal-800 to-emerald-900 p-4 text-white shadow-lg">
            <Row k="Gross" v={rs(b.gross)} />{b.package_covered > 0 && <Row k={`Package (${a.service_package})`} v={`−${rs(b.package_covered)}`} />}
            {b.discount > 0 && <Row k="Discount" v={`−${rs(b.discount)}`} />}
            {b.payer_share > 0 && <Row k={`${a.payer_type} · ${a.payer} (${b.coverage_percent}%)`} v={`−${rs(b.payer_share)}`} />}
            {b.pre_auth_amount ? <div className="text-[11px] text-white/60">Pre-auth {a.pre_auth}: up to {rs(b.pre_auth_amount)}</div> : null}
            <div className="my-2 border-t border-white/20" />
            <Row k="Patient share" v={rs(b.patient_share)} big />
            <Row k="Advances" v={`−${rs(b.advances)}`} />{b.settled > 0 && <Row k="Paid" v={`−${rs(b.settled)}`} />}{b.refunded > 0 && <Row k="Refunded" v={rs(b.refunded)} />}
            <div className="mt-2 rounded-xl bg-white/10 p-3"><div className="text-[10px] uppercase tracking-widest text-white/60">{b.credit > 0 ? "Refund due to patient" : "Balance due"}</div>
              <div className="text-3xl font-black tabular-nums">{rs(b.credit > 0 ? b.credit : b.balance)}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {!billed && <Button variant="save" onClick={() => setPay("Advance")}><Wallet className="h-4 w-4" />Advance</Button>}
            {billed && b.balance > 0 && <Button variant="submit" onClick={() => setPay("Settlement")}><Banknote className="h-4 w-4" />Collect</Button>}
            {b.credit > 0 && <Button variant="danger" onClick={() => setPay("Refund")}><Undo2 className="h-4 w-4" />Refund</Button>}
            {!billed && <Button variant="neutral" onClick={() => setDisc(true)}><Percent className="h-4 w-4" />Discount</Button>}
            <Button variant="neutral" onClick={() => void printDoc(billHtml(b, billed ? "Final bill" : "Interim bill"), "a4")}><Printer className="h-4 w-4" />{billed ? "Final bill" : "Interim bill"}</Button>
            {!billed && <Button variant="neutral" onClick={() => { const v = prompt("Advance to request (Rs)", String(Math.max(Math.round((b.patient_share - b.advances) / 1000) * 1000, 5000))); if (v) void printDoc(billHtml(b, "Advance request", Number(v) || 0), "a4"); }}>
              <FileWarning className="h-4 w-4" />Advance request</Button>}
          </div>
          {!billed && a.status !== "Discharged" && <Button variant="workflow" size="lg" className="w-full" loading={busy} onClick={() => { if (confirm("Make the final bill now? Bed days stop counting at this moment.")) void finalBill(); }}>
            <Receipt className="h-5 w-5" />Make final bill</Button>}
          {billed && <div className="rounded-xl border border-border p-3 text-sm"><div>Invoice <b>{a.final_invoice}</b>{a.payer_invoice && <> · payer <b>{a.payer_invoice}</b></>}</div>
            {hasRole("PW Accountant", "PW Cash Supervisor") && a.status !== "Discharged" && <Button size="sm" variant="danger" className="mt-2" onClick={async () => { const r = prompt("Why cancel the final bill?"); if (!r) return;
              try { await call("ipd.cancel_final_bill", { name, reason: r }); toast.success("Final bill cancelled — the stay continues"); void refetch(); } catch (e) { toast.error(humanizeError(e)); } }}><XCircle className="h-4 w-4" />Cancel bill</Button>}</div>}
          {b.payments.length > 0 && <div className="rounded-2xl border border-border bg-card p-3"><div className="mb-2 text-xs font-bold uppercase text-muted-foreground">Payments</div>
            {b.payments.map((p) => <div key={p.name} className="flex items-center gap-2 py-1 text-sm"><HandCoins className="h-4 w-4 text-muted-foreground" /><span className="flex-1">{p.hv_purpose || p.payment_type} · {p.mode_of_payment}<div className="text-[11px] text-muted-foreground">{p.name} · {p.posting_date}</div></span>
              <b className={cn("tabular-nums", p.payment_type === "Pay" && "text-rose-600")}>{p.payment_type === "Pay" ? "−" : ""}{rs(p.paid_amount)}</b></div>)}</div>}
        </aside>
      </div>
      {pay && <PayDialog name={name} purpose={pay} suggested={pay === "Refund" ? b.credit : pay === "Settlement" ? b.balance : 0} onClose={() => setPay(null)} onDone={() => { setPay(null); void refetch(); }} />}
      {disc && <DiscountDialog name={name} net={b.net} onClose={() => setDisc(false)} onDone={() => { setDisc(false); void refetch(); }} />}
    </div>
  );
}

function Row({ k, v, big }: { k: string; v: string; big?: boolean }) {
  return <div className={cn("flex justify-between gap-2 py-0.5", big ? "text-lg font-black" : "text-sm text-white/85")}><span className="truncate">{k}</span><span className="tabular-nums">{v}</span></div>;
}

function PayDialog({ name, purpose, suggested, onClose, onDone }: { name: string; purpose: "Advance" | "Settlement" | "Refund"; suggested: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(suggested ? String(Math.round(suggested)) : "");
  const [mode, setMode] = useState("Cash");
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const change = Math.max((Number(tendered) || 0) - (Number(amount) || 0), 0);
  const save = async () => {
    setBusy(true);
    try { await call("ipd.take_payment", { name, amount: Number(amount), payment_mode: mode, purpose, cash_tendered: Number(tendered) || undefined }); toast.success(`${purpose} ${rs(Number(amount))} posted`); onDone(); }
    catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={purpose === "Refund" ? "Refund to patient" : purpose === "Settlement" ? "Collect the balance" : "Take an advance"} description="Posted in your cashier shift" size="sm">
      <div className="space-y-3">
        <input autoFocus className={inputCls + " h-14 text-end text-3xl font-black tabular-nums"} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
        <div className="flex flex-wrap gap-1">{MODES.map((m) => <button key={m} onClick={() => setMode(m)} className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold", mode === m ? "border-emerald-600 bg-emerald-600 text-white" : "border-border")}>{m}</button>)}</div>
        {mode === "Cash" && purpose !== "Refund" && <Field label="Cash tendered"><input className={inputCls + " text-end tabular-nums"} inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/\D/g, ""))} />
          {change > 0 && <div className="mt-1 text-end text-sm font-bold text-emerald-600">Change {rs(change)}</div>}</Field>}
        <Button variant={purpose === "Refund" ? "danger" : "submit"} size="lg" className="w-full" disabled={!Number(amount)} loading={busy} onClick={() => void save()}>
          {purpose === "Refund" ? <RotateCcw className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}{purpose === "Refund" ? "Pay out" : "Receive"} {rs(Number(amount))}</Button>
      </div>
    </Dialog>
  );
}

function DiscountDialog({ name, net, onClose, onDone }: { name: string; net: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<{ name: string; status: string; percent: number } | null>(null);
  const ask = async () => {
    try { const r = await call<{ name: string; status: string; percent: number }>("ipd.request_discount", { name, amount: Number(amount), reason }); setRes(r);
      toast.success(r.status === "Approved" ? "Within your limit — applied on the final bill" : "Sent for approval"); }
    catch (e) { toast.error(humanizeError(e)); }
  };
  return (
    <Dialog open onClose={onClose} title="Discount" description={`Bill after package: ${rs(net)}. Above your limit it goes to a supervisor.`} size="sm">
      {res ? <div className="space-y-3 text-sm"><div>Request <b>{res.name}</b> · {res.percent}% · <Chip s={res.status} /></div>
        <div className="text-muted-foreground">The approved discount is applied when the final bill is made. Ask the supervisor to approve it on their screen first if it is pending.</div>
        <Button className="w-full" variant="save" onClick={async () => { if (res.status !== "Approved") { toast("Waiting for approval", { icon: "⏳" }); return; }
          try { await call("ipd.apply_discount", { name, discount_authorization: res.name }); toast.success("Discount added to the bill"); onDone(); }
          catch (e) { toast.error(humanizeError(e)); } }}>Use on this bill</Button></div> : (
        <div className="space-y-3"><Field label="Amount (Rs)"><input className={inputCls} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Reason" required><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Button variant="workflow" className="w-full" disabled={!Number(amount) || !reason.trim()} onClick={() => void ask()}><Percent className="h-4 w-4" />Request</Button></div>)}
    </Dialog>
  );
}
