import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CreditCard, FileCheck2, Link2, Lock, RefreshCw, Send, ShieldCheck, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { getCall, postCall } from "@/services/frappe";
import { Empty, Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;

/** /pay/:token — the card page. In Mock mode it simulates the gateway (no card details are asked or stored). */
export function CheckoutPage() {
  const { token = "" } = useParams();
  const [s, setS] = useState<{ amount: number; description: string; status: string; provider: string; mock: boolean; clinic?: string; return_url?: string; provider_ref?: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => getCall<typeof s>("hospital_vvs.api.payments.checkout", { token }).then(setS).catch((e) => setErr(humanizeError(e)));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const pay = async (success: number) => { setBusy(true); try { await postCall("hospital_vvs.api.payments.mock_pay", { token, success }); await load(); } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-sky-100 p-4 dark:from-slate-950 dark:to-sky-950">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-card shadow-2xl">
        <div className="bg-gradient-to-r from-indigo-600 to-sky-600 p-6 text-white"><div className="flex items-center gap-2 text-sm opacity-80"><Lock className="h-4 w-4" />Secure payment · {s?.clinic}</div>
          <div className="mt-3 text-4xl font-black tabular-nums">{s ? rs(s.amount) : "…"}</div><div className="mt-1 text-sm opacity-80">{s?.description}</div></div>
        <div className="space-y-4 p-6">
          {err && <div className="flex gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</div>}
          {!s && !err && <div className="flex justify-center"><Spinner /></div>}
          {s?.status === "Paid" && <div className="text-center"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" /><div className="mt-2 text-2xl font-bold">Payment received</div>
            <div className="text-sm text-muted-foreground">Transaction {s.provider_ref}</div>{s.return_url && <a href={s.return_url} className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white">Back to the clinic page</a>}</div>}
          {s && ["Failed", "Expired", "Cancelled"].includes(s.status) && <div className="text-center"><XCircle className="mx-auto h-14 w-14 text-rose-500" /><div className="mt-2 text-xl font-bold">Payment {s.status.toLowerCase()}</div>
            <div className="text-sm text-muted-foreground">Ask the clinic for a new payment link.</div>{s.return_url && <a href={s.return_url} className="mt-3 inline-block text-sm font-semibold text-sky-700 underline">Back</a>}</div>}
          {s?.status === "Initiated" && (s.mock ? <>
            <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><b>Test mode.</b> The card gateway is not chosen yet; these buttons simulate the bank's answer. No card details are entered.</div>
            <button disabled={busy} onClick={() => void pay(1)} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-lg font-bold text-white disabled:opacity-50"><CreditCard className="h-5 w-5" />Simulate successful payment</button>
            <button disabled={busy} onClick={() => void pay(0)} className="h-11 w-full rounded-2xl border border-border font-semibold text-rose-600">Simulate declined card</button></>
            : <div className="text-center text-sm text-muted-foreground">Redirecting to {s.provider}…</div>)}
          <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Card details are handled only by the bank's page.</div>
        </div>
      </div>
    </div>
  );
}

interface OP { name: string; reference_doctype: string; reference_name: string; patient?: string; description?: string; amount: number; status: string; provider: string; gateway_mode?: string; provider_ref?: string; paid_at?: string; payment_entry?: string; creation: string }
interface FbrRow { name: string; sales_invoice: string; posting_date: string; billing_type?: string; status: string; fbr_invoice_no?: string; amount: number; is_return: number; attempts: number; reported_at?: string; batch?: string; last_error?: string }
interface FbrDay { date: string; Pending: number; Reported: number; Failed: number; Skipped: number; amount: number }

/** /online-payments — card payment links and their status (mock until the gateway is chosen). */
export function OnlinePaymentsPage() {
  const { data, refetch } = useApi<{ rows: OP[]; enabled: number; provider: string; mock: boolean }>("payments.online_payments");
  const [link, setLink] = useState(false);
  if (!data) return <div className="flex h-60 items-center justify-center"><Spinner size={26} /></div>;
  const paid = data.rows.filter((r) => r.status === "Paid");
  return (
    <div className="space-y-5">
      <PageHeader title="Online card payments" icon={CreditCard} color="from-indigo-600 to-sky-600" subtitle={`${data.enabled ? "On" : "Off"} · gateway ${data.provider}${data.mock ? " (test mode)" : ""} · Clinic Settings → Online Card Payments`}
        actions={<Button variant="save" disabled={!data.enabled} onClick={() => setLink(true)}><Link2 className="h-4 w-4" />Payment link for a bill</Button>} />
      {!data.enabled && <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Online card payments are switched off. Turn them on in Clinic Settings → Online Card Payments (Mock mode works without a gateway).</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Paid by card" value={rs(paid.reduce((a, r) => a + r.amount, 0))} hint={`${paid.length} payments`} icon={CheckCircle2} tone="teal" />
        <StatCard label="Waiting" value={data.rows.filter((r) => r.status === "Initiated").length} icon={RefreshCw} tone="amber" /><StatCard label="Failed" value={data.rows.filter((r) => r.status === "Failed").length} icon={XCircle} tone="rose" /></div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Payment</th><th className="text-start">For</th><th className="text-end">Amount</th><th className="text-start">Gateway</th><th className="px-3 text-start">Status</th></tr></thead>
        <tbody>{data.rows.map((r) => <tr key={r.name} className="border-t border-border"><td className="px-3 py-2 font-mono text-xs">{r.name}<div className="font-sans text-[10px] text-muted-foreground">{r.creation.slice(0, 16)}</div></td>
          <td className="text-xs">{r.description}<div className="text-[10px] text-muted-foreground">{r.reference_name}{r.patient ? ` · ${r.patient}` : ""}</div></td><td className="text-end tabular-nums">{rs(r.amount)}</td>
          <td className="text-xs">{r.provider}{r.provider_ref ? <div className="text-[10px] text-muted-foreground">{r.provider_ref}</div> : null}</td>
          <td className="px-3"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.status === "Paid" ? "bg-emerald-100 text-emerald-800" : r.status === "Initiated" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700")}>{r.status}</span></td></tr>)}</tbody></table>
        {!data.rows.length && <div className="p-6 text-center text-sm text-muted-foreground">No online payments yet.</div>}</div>
      {link && <LinkDialog onClose={() => setLink(false)} onDone={() => { setLink(false); void refetch(); }} />}
    </div>
  );
}

function LinkDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [inv, setInv] = useState("");
  const [send, setSend] = useState(true);
  const [res, setRes] = useState<{ url: string; amount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} size="md" title="Card payment link" description="For the unpaid part of a bill (IPD dues, panel patient share, credit bills).">
      {res ? <div className="space-y-3"><div className="rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-500/10"><b>{rs(res.amount)}</b> · link ready{send ? " and sent to the patient" : ""}</div>
        <div className="flex gap-2"><input readOnly className={inputCls + " font-mono text-xs"} value={res.url} /><Button variant="neutral" onClick={() => { void navigator.clipboard?.writeText(res.url); toast.success("Copied"); }}>Copy</Button></div>
        <Button variant="save" className="w-full" onClick={onDone}>Done</Button></div>
        : <div className="space-y-3"><Field label="Invoice number" required><input className={inputCls + " font-mono"} placeholder="ACC-SINV-2026-…" value={inv} onChange={(e) => setInv(e.target.value.trim())} autoFocus /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />Send to the patient by WhatsApp / SMS</label>
          <Button variant="save" className="w-full" disabled={!inv} loading={busy} onClick={async () => { setBusy(true); try { setRes(await call("payments.create_link", { sales_invoice: inv, send: send ? 1 : 0 })); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } }}>
            <Send className="h-4 w-4" />Create link</Button></div>}
    </Dialog>
  );
}

/** /fbr — day-end FBR reporting: per-day status, failures, report now. */
export function FbrPage() {
  const [status, setStatus] = useState("");
  const { data, refetch } = useApi<{ rows: FbrRow[]; days: FbrDay[]; enabled: number; mode: string; pos_id?: string; run_time: string; billing_types?: string; last_run?: string }>("payments.fbr_status", status ? { status } : undefined);
  const [busy, setBusy] = useState(false);
  if (!data) return <div className="flex h-60 items-center justify-center"><Spinner size={26} /></div>;
  const run = async () => { setBusy(true); try { const r = await call<{ reported: number; failed: number }>("payments.fbr_run"); toast.success(`Reported ${r.reported}${r.failed ? ` · ${r.failed} failed` : ""}`); void refetch(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <div className="space-y-5">
      <PageHeader title="FBR reporting" icon={FileCheck2} color="from-emerald-700 to-green-800" subtitle={`${data.enabled ? "On" : "Off"} · ${data.mode} · POS ${data.pos_id || "—"} · day-end at ${data.run_time.slice(0, 5)} · ${(data.billing_types || "all billing types").replace(/\n/g, ", ")}${data.last_run ? ` · last run ${data.last_run}` : ""}`}
        actions={<Button variant="save" disabled={!data.enabled} loading={busy} onClick={() => void run()}><RefreshCw className="h-4 w-4" />Report now</Button>} />
      {!data.enabled && <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">FBR reporting is off. Clinic Settings → FBR: switch on, set the POS ID, NTN and which billing types are reported. Mock mode gives test FBR numbers.</div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{data.days.slice(0, 8).map((d) => (
        <div key={d.date} className="rounded-2xl border border-border bg-card p-3"><div className="flex items-center justify-between"><b>{d.date}</b><span className="text-xs text-muted-foreground">{rs(d.amount)}</span></div>
          <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-semibold"><span className="rounded-full bg-emerald-100 px-2 text-emerald-800">{d.Reported} reported</span>{d.Pending ? <span className="rounded-full bg-amber-100 px-2 text-amber-800">{d.Pending} pending</span> : null}
            {d.Failed ? <span className="rounded-full bg-rose-100 px-2 text-rose-700">{d.Failed} failed</span> : null}</div></div>))}
        {!data.days.length && <Empty title="Nothing queued for FBR yet" icon={FileCheck2} />}</div>
      <div className="flex rounded-xl bg-muted p-1 sm:w-fit">{["", "Pending", "Reported", "Failed", "Skipped"].map((s) => <button key={s || "all"} onClick={() => setStatus(s)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === s ? "bg-card shadow" : "text-muted-foreground")}>{s || "All"}</button>)}</div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Invoice</th><th className="text-start">Type</th><th className="text-end">Amount</th><th className="text-start">FBR no.</th><th className="px-3 text-start">Status</th></tr></thead>
        <tbody>{data.rows.map((r) => <tr key={r.name} className="border-t border-border"><td className="px-3 py-2 font-mono text-xs">{r.sales_invoice}<div className="font-sans text-[10px] text-muted-foreground">{r.posting_date}{r.is_return ? " · return" : ""}</div></td>
          <td className="text-xs">{r.billing_type}</td><td className="text-end tabular-nums">{rs(r.amount)}</td><td className="font-mono text-xs">{r.fbr_invoice_no ?? "—"}{r.last_error && <div className="font-sans text-[10px] text-rose-600">{r.last_error}</div>}</td>
          <td className="px-3"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.status === "Reported" ? "bg-emerald-100 text-emerald-800" : r.status === "Pending" ? "bg-amber-100 text-amber-800" : r.status === "Failed" ? "bg-rose-100 text-rose-700" : "bg-muted")}>{r.status}</span></td></tr>)}</tbody></table>
        {!data.rows.length && <div className="p-6 text-center text-sm text-muted-foreground">No rows.</div>}</div>
    </div>
  );
}
