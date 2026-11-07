import { useState } from "react";
import { AlertTriangle, Banknote, BellRing, CheckCircle2, ClipboardCheck, HandHelping, PackageSearch, Play, Replace, ScanLine, Undo2, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { printDoc } from "@/lib/print";
import { Empty, Field, inputCls, Section, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { PharmHero, PriorityBadge, type Receipt, receiptHtml, rs, TICKET_TONE, usePharmacyLive } from "./shared";

export interface TItem { name: string; item_code: string; item_name: string; uom: string; qty: number; batch_no?: string; expiry?: string; rack?: string; found_qty?: number; counted_qty?: number; line_status: string; note?: string }
export interface Ticket { name: string; token: string; status: string; priority: string; patient_name: string; patient?: string; sales_invoice: string; invoice_status: string; amount_due: number;
  finder?: string; reviewer?: string; handover_counter?: string; queued_at: string; pick_started_at?: string; picked_at?: string; ready_at?: string; called_at?: string; recalls?: number;
  exception_reason?: string; prescription?: string; items: TItem[] }

const act = (name: string, action: string, kw: Record<string, unknown> = {}) => call<Ticket & Receipt>("pharmacy.action", { name, action, ...kw });
const mins = (t?: string) => (t ? Math.max(0, Math.round((Date.now() - new Date(t.replace(" ", "T")).getTime()) / 60000)) : 0);

function TicketCard({ t, onClick, active, children }: { t: Ticket; onClick?: () => void; active?: boolean; children?: React.ReactNode }) {
  const wait = mins(t.queued_at);
  return (
    <div onClick={onClick} className={cn("cursor-pointer overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:shadow-lg", active ? "border-sky-500 ring-2 ring-sky-500/30" : "border-border")}>
      <div className={cn("flex items-center gap-2 bg-gradient-to-r px-3 py-2 text-white", TICKET_TONE[t.status] ?? "from-slate-500 to-slate-700")}>
        <span className="text-2xl font-black tracking-wide">{t.token}</span><PriorityBadge p={t.priority} /><span className="ms-auto text-xs font-semibold">{t.status}</span></div>
      <div className="p-3">
        <div className="flex items-center justify-between text-sm"><span className="truncate font-semibold">{t.patient_name}</span><span className={cn("text-xs tabular-nums", wait > 15 ? "font-bold text-rose-600" : "text-muted-foreground")}>{wait} min</span></div>
        <div className="mt-1 text-xs text-muted-foreground">{t.items.length} items{t.invoice_status !== "Paid" ? ` · due ${rs(t.amount_due)}` : " · paid"}{t.finder ? ` · ${t.finder.split("@")[0]}` : ""}</div>
        {t.exception_reason && <div className="mt-1 text-xs font-semibold text-rose-600">{t.exception_reason}</div>}
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pick (finder)
export function PickPage() {
  const { boot } = useAuth();
  const { data: rows, refetch } = useApi<Ticket[]>("pharmacy.tickets", { stage: "pick" }, { refetchInterval: 15_000 });
  usePharmacyLive(["pharmacy.tickets"]);
  const [open, setOpen] = useState<string | null>(null);
  const mine = rows?.find((r) => r.status === "Picking" && r.finder === boot?.user);
  const current = rows?.find((r) => r.name === (open ?? mine?.name));
  return (
    <div className="mx-auto max-w-7xl">
      <PharmHero title="Pick medicines" sub="Take the next ticket, scan each item from its rack — wrong item or batch is refused" icon={PackageSearch}
        actions={!mine && rows?.some((r) => r.status === "Queued") ? <Button className="bg-white text-sky-800 hover:bg-white/90" onClick={async () => { const n = rows!.find((r) => r.status === "Queued")!; try { await act(n.name, "start_pick"); setOpen(n.name); void refetch(); } catch (e) { toast.error(humanizeError(e)); } }}><Play className="h-4 w-4" />Take next</Button> : undefined} />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">{(rows ?? []).map((t) => <TicketCard key={t.name} t={t} active={current?.name === t.name} onClick={() => setOpen(t.name)} />)}
          {rows && !rows.length && <Empty title="Nothing to pick" icon={PackageSearch} />}</div>
        {current ? <PickPanel t={current} me={boot?.user} onChange={() => void refetch()} /> : <Empty title="Select or take a ticket" />}
      </div>
    </div>
  );
}

function PickPanel({ t, me, onChange }: { t: Ticket; me?: string; onChange: () => void }) {
  const [code, setCode] = useState("");
  const [nf, setNf] = useState<TItem | null>(null);
  const mine = t.status === "Picking" && t.finder === me;
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast.success(ok); onChange(); } catch (e) { toast.error(humanizeError(e), { duration: 6000 }); } };
  const scan = () => { const c = code.trim(); if (!c) return; setCode(""); void run(() => act(t.name, "scan", { code: c })); };
  const done = t.items.filter((i) => i.line_status === "Found").length;
  return (
    <Section title={<span className="flex items-center gap-2 text-lg"><b className="text-2xl">{t.token}</b>{t.patient_name}</span>}
      actions={t.status === "Queued" ? <Button variant="primary" onClick={() => void run(() => act(t.name, "start_pick"), "Picking started")}><Play className="h-4 w-4" />Start picking</Button> : undefined}>
      {mine && <div className="relative mb-3"><ScanLine className="absolute start-3 top-3.5 h-5 w-5 text-sky-600" /><input autoFocus value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scan()} placeholder="Scan item barcode or batch"
        className="h-12 w-full rounded-2xl border-2 border-sky-300 bg-sky-50/50 ps-11 text-lg outline-none focus:border-sky-600 dark:bg-sky-500/10" /></div>}
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all" style={{ width: `${(done / Math.max(t.items.length, 1)) * 100}%` }} /></div>
      <div className="space-y-2">{t.items.map((i) => (
        <div key={i.name} className={cn("flex items-center gap-3 rounded-2xl border p-3", i.line_status === "Found" ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-500/10" : i.line_status === "Not Found" || i.line_status === "Short" ? "border-rose-300 bg-rose-50/60 dark:bg-rose-500/10" : "border-border")}>
          <span className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-800 text-white"><span className="text-[9px] uppercase text-white/60">Rack</span><b className="text-sm">{i.rack || "—"}</b></span>
          <div className="min-w-0 flex-1"><div className="font-bold">{i.item_name}</div><div className="text-xs text-muted-foreground">Batch <b className="font-mono text-foreground">{i.batch_no}</b> · Exp {i.expiry?.slice(0, 7)}</div>{i.note && <div className="text-xs text-rose-600">{i.note}</div>}</div>
          <span className="text-xl font-black tabular-nums">{i.qty}<span className="ms-1 text-xs font-semibold text-muted-foreground">{i.uom}</span></span>
          {i.line_status === "Found" ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : mine ? <Button size="xs" variant="danger" onClick={() => setNf(i)}><XCircle className="h-3 w-3" />Not found</Button> : null}
        </div>))}</div>
      {mine && <Button variant="submit" size="lg" className="mt-4 w-full" disabled={done < t.items.length} onClick={() => void run(() => act(t.name, "complete_pick"), "Sent for review")}><ClipboardCheck className="h-5 w-5" />Picking complete</Button>}
      {nf && <Dialog open onClose={() => setNf(null)} title={`${nf.item_name} not found`} size="sm"><NotFound onSave={(reason, short) => void run(() => act(t.name, "not_found", { line: nf.name, reason, short_qty: short || undefined }), "Pharmacist alerted").then(() => setNf(null))} /></Dialog>}
    </Section>
  );
}

function NotFound({ onSave }: { onSave: (reason: string, short: number) => void }) {
  const [reason, setReason] = useState("Not on rack");
  const [short, setShort] = useState("");
  return (<>
    <div className="grid grid-cols-2 gap-2">{["Not on rack", "Damaged", "Batch mismatch", "Short quantity"].map((r) => <button key={r} onClick={() => setReason(r)} className={cn("rounded-xl border py-2 text-sm font-semibold", reason === r ? "border-rose-600 bg-rose-600 text-white" : "border-border")}>{r}</button>)}</div>
    {reason === "Short quantity" && <Field label="Quantity found" className="mt-2"><input className={inputCls} inputMode="numeric" value={short} onChange={(e) => setShort(e.target.value.replace(/\D/g, ""))} /></Field>}
    <Button variant="destructive" className="mt-4 w-full" onClick={() => onSave(reason, Number(short))}>Report to pharmacist</Button></>);
}

// ------------------------------------------------------------------ review (pharmacist)
interface Review { ticket: Ticket; prescription: null | { name: string; doctor_name: string; diagnosis?: string; medicines: { item: string; item_name: string; dose?: string; frequency?: string; duration?: string; instructions?: string; no_substitution?: number }[] };
  overrides: { item: string; alert: string; reason: string; by: string }[]; otc_alerts: { item: string; alerts: string[]; blocking: boolean }[] }

export function ReviewPage() {
  const { data: rows, refetch } = useApi<Ticket[]>("pharmacy.tickets", { stage: "review" }, { refetchInterval: 15_000 });
  usePharmacyLive(["pharmacy.tickets"]);
  const [open, setOpen] = useState<string | null>(null);
  const cur = open ?? rows?.[0]?.name ?? null;
  return (
    <div className="mx-auto max-w-7xl">
      <PharmHero title="Pharmacist review" sub="Check every line against the prescription, count, approve — or swap with a same-generic substitute" icon={ClipboardCheck} />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">{(rows ?? []).map((t) => <TicketCard key={t.name} t={t} active={cur === t.name} onClick={() => setOpen(t.name)} />)}{rows && !rows.length && <Empty title="Nothing to review" icon={ClipboardCheck} />}</div>
        {cur ? <ReviewPanel key={cur} name={cur} onChange={() => { setOpen(null); void refetch(); }} /> : <Empty title="Select a ticket" />}
      </div>
    </div>
  );
}

function ReviewPanel({ name, onChange }: { name: string; onChange: () => void }) {
  const { data, refetch } = useApi<Review>("pharmacy.ticket", { name });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [back, setBack] = useState("");
  const [swap, setSwap] = useState<TItem | null>(null);
  if (!data) return <div className="h-80 animate-pulse rounded-3xl bg-muted" />;
  const t = data.ticket;
  const run = async (fn: () => Promise<unknown>, ok: string, close = true) => { try { await fn(); toast.success(ok); if (close) onChange(); else void refetch(); } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } };
  return (
    <Section title={<span className="flex items-center gap-2 text-lg"><b className="text-2xl">{t.token}</b>{t.patient_name}<PriorityBadge p={t.priority} /></span>}
      actions={t.status === "Picked" ? <Button variant="workflow" onClick={() => void run(() => act(name, "start_review"), "Review started", false)}><Play className="h-4 w-4" />Start review</Button> : undefined}>
      {data.prescription && <div className="mb-3 rounded-2xl bg-sky-50 p-3 text-sm dark:bg-sky-500/10"><b>Rx {data.prescription.name}</b> · {data.prescription.doctor_name}{data.prescription.diagnosis ? ` · ${data.prescription.diagnosis}` : ""}
        <div className="mt-1 grid gap-0.5 text-xs">{data.prescription.medicines.map((m, i) => <div key={i}>• <b>{m.item_name}</b> {m.dose} {m.frequency} {m.duration} {m.instructions}{m.no_substitution ? <b className="text-rose-600"> · no substitution</b> : null}</div>)}</div></div>}
      {data.overrides.map((o, i) => <div key={i} className="mb-2 flex gap-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />{o.item}: {o.alert} — doctor override “{o.reason}”</div>)}
      {data.otc_alerts.map((o, i) => <div key={i} className={cn("mb-2 rounded-xl p-2 text-xs", o.blocking ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800")}>{o.item}: {o.alerts.join("; ")}</div>)}
      {t.exception_reason && <div className="mb-2 rounded-xl bg-rose-50 p-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10">{t.exception_reason}</div>}
      <table className="w-full text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Medicine</th><th className="text-start">Batch / expiry</th><th className="text-end">Billed</th><th className="w-24 text-end">Counted</th><th /></tr></thead>
        <tbody>{t.items.map((i) => { const c = counts[i.name] ?? String(i.qty); const bad = Number(c) !== Number(i.qty); return (
          <tr key={i.name} className="border-b border-border/60"><td className="py-2"><b>{i.item_name}</b>{i.note && <div className="text-xs text-muted-foreground">{i.note}</div>}<div className="text-[11px]">{i.line_status}</div></td>
            <td className="font-mono text-xs">{i.batch_no}<div className="text-muted-foreground">{i.expiry?.slice(0, 7)}</div></td><td className="text-end font-bold tabular-nums">{i.qty} {i.uom}</td>
            <td className="ps-2"><input className={cn(inputCls, "h-9 text-end tabular-nums", bad && "border-rose-500 text-rose-600")} value={c} inputMode="numeric" onChange={(e) => setCounts((x) => ({ ...x, [i.name]: e.target.value.replace(/[^\d.]/g, "") }))} /></td>
            <td className="ps-1"><button title="Substitute" onClick={() => setSwap(i)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><Replace className="h-4 w-4" /></button></td></tr>); })}</tbody></table>
      <div className="mt-4 flex flex-wrap gap-2">
        <input className={inputCls + " min-w-48 flex-1"} placeholder="Reason to send back to the finder" value={back} onChange={(e) => setBack(e.target.value)} />
        <Button variant="outline" disabled={!back.trim()} onClick={() => void run(() => act(name, "send_back", { reason: back }), "Sent back")}><Undo2 className="h-4 w-4" />Send back</Button>
        <Button variant="submit" disabled={!["Reviewing", "Picked"].includes(t.status)} onClick={() => void run(() => act(name, "approve", { counts: JSON.stringify(Object.fromEntries(t.items.map((i) => [i.name, Number(counts[i.name] ?? i.qty)]))) }), "Approved — ready for handover")}><CheckCircle2 className="h-4 w-4" />Approve</Button>
      </div>
      {swap && <SwapDialog item={swap} onClose={() => setSwap(null)} onPick={(code) => void run(() => act(name, "swap_line", { line: swap.name, new_item: code }), "Substitute applied", false).then(() => setSwap(null))} />}
    </Section>
  );
}

function SwapDialog({ item, onClose, onPick }: { item: TItem; onClose: () => void; onPick: (code: string) => void }) {
  const { data } = useApi<{ item_code: string; item_name: string; price: number }[]>("pharmacy.substitutes", { item_code: item.item_code });
  return (
    <Dialog open onClose={onClose} title={`Substitute ${item.item_name}`} description="Same generic, strength and form. Unpaid bills are re-priced; a paid bill goes back to the counter." size="sm">
      {data?.length ? data.map((s) => <button key={s.item_code} onClick={() => onPick(s.item_code)} className="mb-2 flex w-full justify-between rounded-xl border border-border p-3 text-start hover:border-sky-500"><b>{s.item_name}</b><span className="tabular-nums">{rs(s.price)}</span></button>) : <Empty title={data ? "No substitute in stock" : "Looking…"} />}
    </Dialog>
  );
}

// ------------------------------------------------------------------ dispense (handover)
export function DispensePage() {
  const { boot } = useAuth();
  const { data: rows, refetch } = useApi<Ticket[]>("pharmacy.tickets", { stage: "dispense" }, { refetchInterval: 10_000 });
  const { data: ctx } = useApi<{ counters: { name: string; counter_type: string; number?: number }[]; modes: string[] }>("pharmacy.pos_context");
  usePharmacyLive(["pharmacy.tickets"]);
  const [counter, setCounter] = useState(() => { try { return localStorage.getItem("hv.handover") || ""; } catch { return ""; } });
  const [pay, setPay] = useState<Ticket | null>(null);
  const [scan, setScan] = useState("");
  const handovers = (ctx?.counters ?? []).filter((c) => c.counter_type === "Pharmacy Handover" || c.counter_type === "Pharmacy Billing");
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); void refetch(); } catch (e) { toast.error(humanizeError(e), { duration: 6000 }); } };
  const onScan = () => { const c = scan.trim(); setScan(""); const t = rows?.find((r) => [r.token, r.sales_invoice, r.name].includes(c)); if (!t) { toast.error(`${c}: no ready ticket`); return; } void run(() => act(t.name, "handover", { code: c }), `${t.token} handed over`); };
  return (
    <div className="mx-auto max-w-7xl">
      <PharmHero title="Handover counter" sub="Call the token, collect payment if due, scan the receipt and hand over" icon={HandHelping}
        actions={<>
          <select className="h-10 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white [&>option]:text-slate-900" value={counter} onChange={(e) => { setCounter(e.target.value); try { localStorage.setItem("hv.handover", e.target.value); } catch { /* ignore */ } }}>
            <option value="">My counter…</option>{handovers.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
          <input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onScan()} placeholder="Scan receipt / token" className="h-10 w-48 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white placeholder:text-white/60 outline-none" /></>} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Ready" value={rows?.filter((r) => r.status === "Ready").length ?? 0} tone="teal" />
        <StatCard label="Called" value={rows?.filter((r) => r.status === "Called").length ?? 0} tone="amber" />
        <StatCard label="Not collected" value={rows?.filter((r) => r.status === "Not Collected").length ?? 0} tone="rose" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(rows ?? []).map((t) => (
          <TicketCard key={t.name} t={t}>
            <div className="mt-2 max-h-24 overflow-y-auto text-xs">{t.items.map((i) => <div key={i.name}>• {i.item_name} <b>{i.qty} {i.uom}</b></div>)}</div>
            <div className="mt-3 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="workflow" onClick={() => void run(() => act(t.name, "call", { counter: counter || undefined }), `${t.token} called`)}><BellRing className="h-3.5 w-3.5" />{t.status === "Called" ? `Recall (${t.recalls ?? 0})` : "Call"}</Button>
              {t.invoice_status !== "Paid" && <Button size="sm" variant="save" onClick={() => setPay(t)}><Banknote className="h-3.5 w-3.5" />Collect {rs(t.amount_due)}</Button>}
              <Button size="sm" variant="submit" disabled={t.invoice_status !== "Paid"} onClick={() => void run(() => act(t.name, "handover"), `${t.token} handed over`)}><HandHelping className="h-3.5 w-3.5" />Hand over</Button>
            </div>
          </TicketCard>))}
      </div>
      {rows && !rows.length && <Empty title="No tokens ready" icon={HandHelping} />}
      {pay && <CollectDialog t={pay} modes={ctx?.modes ?? ["Cash"]} agent={!!boot} onClose={() => setPay(null)} onDone={() => { setPay(null); void refetch(); }} />}
    </div>
  );
}

function CollectDialog({ t, modes, agent, onClose, onDone }: { t: Ticket; modes: string[]; agent: boolean; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState("Cash");
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await act(t.name, "collect_payment", { payment_mode: mode, cash_tendered: Number(tendered) || undefined }); toast.success(`Paid${r.change ? ` · change ${rs(r.change)}` : ""}`); void printDoc(receiptHtml(r), "receipt", { agent }); onDone(); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`Collect for ${t.token}`} size="sm">
      <div className="mb-3 text-center text-4xl font-black tabular-nums">{rs(t.amount_due)}</div>
      <div className="mb-3 flex flex-wrap gap-1">{modes.map((m) => <button key={m} onClick={() => setMode(m)} className={cn("flex-1 rounded-xl border py-2 text-xs font-semibold", mode === m ? "border-emerald-600 bg-emerald-600 text-white" : "border-border")}>{m}</button>)}</div>
      {mode === "Cash" && <Field label="Cash tendered"><input className={inputCls + " h-11 text-end text-lg font-bold"} inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>}
      {Number(tendered) > t.amount_due && <div className="mt-2 text-end font-bold text-emerald-600">Change {rs(Number(tendered) - t.amount_due)}</div>}
      <Button variant="submit" className="mt-4 w-full" loading={busy} onClick={() => void save()}>Collect & print</Button>
    </Dialog>
  );
}

// ------------------------------------------------------------------ board (all stages)
const COLS = [{ k: ["Queued"], label: "Queued" }, { k: ["Picking"], label: "Picking" }, { k: ["Picked", "Reviewing", "Exception"], label: "Review" }, { k: ["Ready", "Called", "Not Collected"], label: "Ready / called" }];
export function TicketsPage() {
  const { branch } = useAuth();
  const { data: rows } = useApi<Ticket[]>("pharmacy.tickets", { stage: "board" }, { refetchInterval: 15_000 });
  const { data: d } = useApi<{ times: Record<string, number | null>; sales: { n: number; total: number }; finders: { finder: string; n: number }[] }>("pharmacy.dashboard", { branch });
  usePharmacyLive(["pharmacy.tickets", "pharmacy.dashboard"]);
  const m = (v?: number | null) => (v == null ? "–" : `${Math.round(v)} min`);
  return (
    <div className="mx-auto max-w-[1600px]">
      <PharmHero title="Pharmacy pipeline" sub="Every token from billing to handover, live" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Sales today" value={rs(d?.sales.total)} hint={`${d?.sales.n ?? 0} bills`} tone="teal" />
        <StatCard label="Wait to pick" value={m(d?.times.wait_pick)} tone="blue" />
        <StatCard label="Picking" value={m(d?.times.picking)} tone="violet" />
        <StatCard label="Review" value={m(d?.times.review)} tone="amber" />
        <StatCard label="Bill → handover" value={m(d?.times.total)} tone="rose" />
      </div>
      <div className="grid gap-3 lg:grid-cols-4">{COLS.map((c) => { const list = (rows ?? []).filter((r) => c.k.includes(r.status)); return (
        <div key={c.label} className="rounded-3xl bg-muted/50 p-3"><div className="mb-2 flex justify-between px-1 text-sm font-bold"><span>{c.label}</span><span className="rounded-full bg-card px-2">{list.length}</span></div>
          <div className="space-y-2">{list.map((t) => <TicketCard key={t.name} t={t} />)}</div></div>); })}</div>
    </div>
  );
}
