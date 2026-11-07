import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Banknote, ClipboardList, CreditCard, FileText, Minus, Monitor, Percent, Plus, Printer, Replace, ScanLine, Search, ShieldAlert, Smartphone, Trash2, UserRound, X } from "lucide-react";
import toast from "react-hot-toast";
import { call, getCall, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { printDoc } from "@/lib/print";
import { Empty, Field, inputCls, PatientPicker, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { type Receipt, receiptHtml, rs, type Split, stockText, usePharmacyLive } from "./shared";

interface Ctx { counter: { name: string; counter_name: string; branch: string } | null; shift: string | null; shift_counter: string | null; warehouse: string | null; collect_payment_at: string;
  pipeline: number; near_expiry_days: number; display_key?: string; counters: { name: string; counter_type: string; number?: number }[];
  waiting_prescriptions: { name: string; prescription: string; patient: string; customer_name: string; creation: string; doctor_name?: string }[]; modes: string[] }
interface Hit { item_code: string; item_name: string; generic?: string; strength?: string; form?: string; rack?: string; rx: number; controlled: number; stock: Split; upp: number; ups: number; spp: number;
  uoms: string[]; stock_uom: string; prices: Record<string, number>; next_expiry?: string; near_expiry: boolean }
interface Line { key: string; item_code: string; item_name: string; uom: string; qty: number; uoms: string[]; prices: Record<string, number>; original_item?: string; rx?: number; controlled?: number;
  generic?: string; strength?: string; no_substitution?: number; dose?: string; frequency?: string; duration?: string }
interface QLine { item_code: string; item_name: string; uom: string; qty: number; batch_no: string; expiry: string; near_expiry: boolean; days_left: number; rate: number; amount: number; rack?: string; original_item?: string }
interface Quote { lines: QLine[]; errors: string[]; warnings: string[]; rx_missing: string[]; total: number }
interface Sub { item_code: string; item_name: string; stock: Split; price: number; rx: number }

const MODE_ICON: Record<string, typeof Banknote> = { Cash: Banknote, Card: CreditCard, JazzCash: Smartphone, Easypaisa: Smartphone, "Bank Transfer": CreditCard };
const FORM_EMOJI: Record<string, string> = { Tablet: "💊", Capsule: "💊", Syrup: "🧴", Suspension: "🧴", Injection: "💉", Drops: "💧", Cream: "🧴", Ointment: "🧴", Inhaler: "🌬️", Sachet: "🧂" };

export default function PosPage() {
  const { boot } = useAuth();
  const { data: ctx, refetch: refetchCtx } = useApi<Ctx>("pharmacy.pos_context", undefined, { refetchInterval: 30_000 });
  usePharmacyLive(["pharmacy.pos_context", "pharmacy.recent"]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [rx, setRx] = useState<{ prescription: string; doctor?: string } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [mode, setMode] = useState("Cash");
  const [tendered, setTendered] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [discount, setDiscount] = useState<{ amount: number; auth: string; status: string } | null>(null);
  const [discOpen, setDiscOpen] = useState(false);
  const [subFor, setSubFor] = useState<Line | null>(null);
  const [rxOpen, setRxOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState(() => crypto.randomUUID());
  const searchRef = useRef<HTMLInputElement>(null);

  // catalogue search (debounced)
  useEffect(() => {
    const h = window.setTimeout(async () => { try { setHits(await getCall<Hit[]>("hospital_vvs.api.pharmacy.search", { q })); } catch { setHits([]); } }, q ? 220 : 0);
    return () => window.clearTimeout(h);
  }, [q]);

  // server-side pricing: FEFO batches, splits, near-expiry, prescription checks
  useEffect(() => {
    if (!lines.length) { setQuote(null); return; }
    const h = window.setTimeout(async () => {
      try { setQuote(await call<Quote>("pharmacy.quote", { lines: lines.map((l) => ({ item_code: l.item_code, uom: l.uom, qty: l.qty, original_item: l.original_item })), prescription: rx?.prescription })); }
      catch (e) { toast.error(humanizeError(e)); }
    }, 250);
    return () => window.clearTimeout(h);
  }, [lines, rx]);

  const gross = quote?.total ?? 0;
  const disc = discount && ["Within Limit", "Approved"].includes(discount.status) ? discount.amount : 0;
  const net = Math.max(gross - disc, 0);
  const payLater = ctx?.collect_payment_at === "Handover counter" && !!ctx?.pipeline;

  // mirror the cart on the customer display
  useEffect(() => {
    const h = window.setTimeout(() => {
      void call("pharmacy.display_push", { state: lines.length ? { state: "cart", lines: (quote?.lines ?? []).map((l) => ({ name: l.item_name, qty: l.qty, uom: l.uom, amount: l.amount })), total: gross, discount: disc, net } : { state: "idle" } }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(h);
  }, [quote, disc]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = useCallback((h: Hit, uom?: string) => {
    if (h.stock.units <= 0) { toast.error(`${h.item_name} is out of stock`); return; }
    const u = uom ?? (h.uoms.includes("Strip") ? "Strip" : h.uoms[0]);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item_code === h.item_code && l.uom === u && !l.original_item);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: crypto.randomUUID(), item_code: h.item_code, item_name: h.item_name, uom: u, qty: 1, uoms: h.uoms, prices: h.prices, rx: h.rx, controlled: h.controlled, generic: h.generic, strength: h.strength }];
    });
  }, []);
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)).filter((l) => l.qty > 0));

  const onScanEnter = () => {
    const exact = hits.find((h) => h.item_code.toLowerCase() === q.trim().toLowerCase()) ?? (hits.length === 1 ? hits[0] : undefined);
    if (exact) { add(exact); setQ(""); }
  };

  const loadRx = async (code: string) => {
    try {
      const r = await getCall<{ prescription: string; patient: string; patient_name: string; doctor: string; lines: (Line & { alert?: string })[] }>("hospital_vvs.api.pharmacy.prescription", { code });
      const found = await Promise.all(r.lines.map(async (l) => (await getCall<Hit[]>("hospital_vvs.api.pharmacy.search", { q: l.item_code }))[0]));
      setLines(r.lines.map((l, i) => ({ ...l, key: crypto.randomUUID(), uoms: found[i]?.uoms ?? [l.uom], prices: found[i]?.prices ?? {}, rx: found[i]?.rx, controlled: found[i]?.controlled, generic: found[i]?.generic, strength: found[i]?.strength })));
      setRx({ prescription: r.prescription, doctor: r.doctor });
      setPatient({ name: r.patient, patient_name: r.patient_name, gender: "" });
      setRxOpen(false);
      toast.success(`Prescription ${r.prescription} loaded`);
    } catch (e) { toast.error(humanizeError(e)); }
  };

  const reset = () => { setLines([]); setPatient(null); setRx(null); setDiscount(null); setTendered(""); setPriority("Normal"); setMode("Cash"); setRef(crypto.randomUUID()); searchRef.current?.focus(); };

  const checkout = async () => {
    if (!lines.length) return;
    if (!payLater && mode === "Cash" && tendered && Number(tendered) < net) { toast.error("Cash tendered is less than the bill"); return; }
    setBusy(true);
    try {
      const r = await call<Receipt>("pharmacy.checkout", { data: { lines: lines.map((l) => ({ item_code: l.item_code, uom: l.uom, qty: l.qty, original_item: l.original_item })), patient: patient?.name,
        prescription: rx?.prescription, payment_mode: mode, cash_tendered: Number(tendered) || undefined, discount_amount: disc || undefined, discount_authorization: disc ? discount?.auth : undefined,
        priority, client_ref: ref } });
      setReceipt(r); reset(); void refetchCtx();
    } catch (e) { toast.error(humanizeError(e), { duration: 8000 }); } finally { setBusy(false); }
  };

  // keyboard: F2 search, F4 prescription, F9 pay
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F4") { e.preventDefault(); setRxOpen(true); }
      if (e.key === "F9") { e.preventDefault(); void checkout(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!ctx) return <div className="h-[80vh] animate-pulse rounded-3xl bg-muted" />;
  const noShift = !payLater && !ctx.shift;
  const byLine = (l: Line) => (quote?.lines ?? []).filter((x) => x.item_code === l.item_code && (x.original_item ?? undefined) === (l.original_item ?? undefined));

  return (
    <div className="-m-3 flex h-[calc(100vh-3.5rem)] min-h-0 flex-col gap-3 bg-gradient-to-br from-sky-50 via-background to-emerald-50 p-3 dark:from-sky-950/30 dark:to-emerald-950/20 lg:flex-row sm:-m-4 sm:p-4">
      {/* ---------------- catalogue ---------------- */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <ScanLine className="absolute start-3 top-3 h-5 w-5 text-sky-600" />
            <input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onScanEnter()}
              placeholder="Scan barcode or search brand / generic   (F2)" className="h-12 w-full rounded-2xl border border-border bg-card ps-11 pe-10 text-base shadow-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15" />
            {q && <button onClick={() => setQ("")} className="absolute end-3 top-3.5 text-muted-foreground"><X className="h-5 w-5" /></button>}
          </div>
          <Button variant="menu" className="h-12" onClick={() => setRxOpen(true)}><FileText className="h-4 w-4" />Prescription <kbd className="ms-1 rounded bg-primary/10 px-1 text-[10px]">F4</kbd></Button>
          {ctx.display_key && <a href={`/hms/display/counter/${ctx.display_key}`} target="_blank" rel="noreferrer"><Button variant="neutral" className="h-12" title="Open customer display"><Monitor className="h-4 w-4" /></Button></a>}
        </div>
        {ctx.waiting_prescriptions.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {ctx.waiting_prescriptions.map((w) => (
              <button key={w.name} onClick={() => void loadRx(w.prescription)} className="flex shrink-0 items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-start text-xs shadow-sm hover:border-sky-500 dark:border-sky-500/30 dark:bg-white/5">
                <ClipboardList className="h-4 w-4 text-sky-600" /><span><b className="block text-sm">{w.customer_name}</b>{w.doctor_name} · {w.creation.slice(11, 16)}</span></button>))}
          </div>)}
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto pb-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {hits.map((h) => { const out = h.stock.units <= 0; return (
            <button key={h.item_code} onClick={() => add(h)} disabled={out}
              className={cn("group relative flex flex-col rounded-2xl border bg-card p-3 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-lg disabled:opacity-50", h.near_expiry ? "border-amber-300" : "border-border")}>
              <div className="flex items-start gap-2"><span className="text-2xl">{FORM_EMOJI[h.form ?? ""] ?? "💊"}</span>
                <div className="min-w-0 flex-1"><div className="line-clamp-2 text-sm font-bold leading-tight">{h.item_name}</div><div className="truncate text-[11px] text-muted-foreground">{h.generic} {h.strength}</div></div></div>
              <div className="mt-2 flex flex-wrap gap-1">
                {h.rx ? <span className="rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">Rx</span> : null}
                {h.controlled ? <span className="rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-200">Controlled</span> : null}
                {h.near_expiry && <span className="rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">Exp {h.next_expiry?.slice(0, 7)}</span>}
                {h.rack && <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{h.rack}</span>}
              </div>
              <div className="mt-auto flex items-end justify-between pt-2"><span className={cn("text-[11px]", out ? "font-bold text-rose-600" : "text-muted-foreground")}>{stockText(h.stock)}</span>
                <span className="text-sm font-extrabold tabular-nums text-sky-700 dark:text-sky-300">{rs(h.prices.Pack ?? Object.values(h.prices)[0])}</span></div>
              {h.uoms.length > 1 && !out && <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>{h.uoms.map((u) => (
                <span key={u} role="button" onClick={() => add(h, u)} className="flex-1 rounded-lg bg-sky-50 py-1 text-center text-[11px] font-semibold text-sky-800 hover:bg-sky-600 hover:text-white dark:bg-sky-500/15 dark:text-sky-200">+{u} {rs(h.prices[u])}</span>))}</div>}
            </button>); })}
          {!hits.length && <div className="col-span-full"><Empty title={q ? "No medicine found" : "Start typing to search"} icon={Search} /></div>}
        </div>
      </section>

      {/* ---------------- cart ---------------- */}
      <aside className="flex min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xl lg:w-[420px]">
        <div className="bg-gradient-to-br from-sky-700 to-emerald-600 p-4 text-white">
          <div className="flex items-center gap-2"><span className="text-sm font-semibold text-white/80">{ctx.counter?.counter_name ?? "Pharmacy"}</span>
            <span className={cn("ms-auto rounded-full px-2 py-0.5 text-[10px] font-bold", ctx.shift ? "bg-white/20" : "bg-rose-500")}>{ctx.shift ? "SHIFT OPEN" : payLater ? "PAY AT HANDOVER" : "NO SHIFT"}</span></div>
          {patient ? <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2"><UserRound className="h-4 w-4" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{patient.patient_name} <span className="font-mono text-xs text-white/70">{patient.name}</span></span>
            <button onClick={() => { setPatient(null); setRx(null); }}><X className="h-4 w-4" /></button></div>
            : <div className="mt-2 [&_input]:border-white/30 [&_input]:bg-white/15 [&_input]:text-white [&_input]:placeholder:text-white/60"><PatientPicker onPick={setPatient} placeholder="Patient (optional) — MR / phone / name" /></div>}
          {rx && <div className="mt-2 flex items-center gap-2 text-xs"><FileText className="h-3.5 w-3.5" />Rx {rx.prescription} · {rx.doctor}<button className="ms-auto underline" onClick={() => setRx(null)}>remove</button></div>}
        </div>
        {noShift && <Link to="/cash/shift" className="flex items-center gap-2 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"><ShieldAlert className="h-4 w-4" />Open your cash shift before billing →</Link>}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {lines.map((l) => { const ql = byLine(l); return (
            <div key={l.key} className="rounded-2xl border border-border bg-background p-3">
              <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{l.item_name}</div>
                <div className="text-[11px] text-muted-foreground">{l.generic} {l.strength}{l.original_item ? " · substitute" : ""}{l.dose ? ` · ${l.dose} ${l.frequency ?? ""} ${l.duration ?? ""}` : ""}</div></div>
                <span className="text-sm font-extrabold tabular-nums">{rs(ql.reduce((s, x) => s + x.amount, 0))}</span></div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center rounded-xl border border-border"><button className="px-2 py-1.5" onClick={() => setLine(l.key, { qty: l.qty - 1 })}><Minus className="h-3.5 w-3.5" /></button>
                  <input className="w-10 bg-transparent text-center text-sm font-bold tabular-nums outline-none" value={l.qty} inputMode="numeric" onChange={(e) => setLine(l.key, { qty: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
                  <button className="px-2 py-1.5" onClick={() => setLine(l.key, { qty: l.qty + 1 })}><Plus className="h-3.5 w-3.5" /></button></div>
                <div className="flex gap-0.5 rounded-xl bg-muted p-0.5">{l.uoms.map((u) => <button key={u} onClick={() => setLine(l.key, { uom: u })} className={cn("rounded-lg px-2 py-1 text-[11px] font-semibold", l.uom === u ? "bg-sky-600 text-white" : "text-muted-foreground")}>{u}</button>)}</div>
                <div className="flex-1" />
                {!l.no_substitution && <button title="Substitute (same generic)" onClick={() => setSubFor(l)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><Replace className="h-4 w-4" /></button>}
                <button onClick={() => setLine(l.key, { qty: 0 })} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
              </div>
              {ql.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{ql.map((x) => <span key={x.batch_no} className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", x.near_expiry ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200")}>
                {x.qty} {x.uom} · B {x.batch_no} · {x.expiry.slice(0, 7)}{x.rack ? ` · ${x.rack}` : ""}</span>)}</div>}
            </div>); })}
          {!lines.length && <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground"><div className="text-5xl">🛒</div><div className="mt-2 text-sm">Cart is empty — scan or tap a medicine</div></div>}
          {quote?.errors.map((e, i) => <div key={i} className="flex gap-2 rounded-xl bg-rose-50 p-2 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"><AlertTriangle className="h-4 w-4 shrink-0" />{e}</div>)}
          {(quote?.rx_missing.length ?? 0) > 0 && <div className="rounded-xl bg-sky-50 p-2 text-xs font-semibold text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">Prescription needed for {quote!.rx_missing.join(", ")} — load it with F4.</div>}
          {quote?.warnings.map((w, i) => <div key={i} className="rounded-xl bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{w}</div>)}
        </div>
        <div className="border-t border-border p-3">
          <div className="space-y-1 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Items</span><span className="tabular-nums">{rs(gross)}</span></div>
            <div className="flex items-center justify-between"><button className="flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setDiscOpen(true)} disabled={!gross}><Percent className="h-3.5 w-3.5" />Discount{discount?.status === "Pending" && <span className="text-amber-600"> · waiting approval</span>}</button><span className="tabular-nums text-rose-600">{disc ? `-${rs(disc)}` : "–"}</span></div></div>
          <div className="my-2 flex items-end justify-between"><span className="text-sm font-semibold">Net payable</span><span className="text-3xl font-black tabular-nums text-sky-800 dark:text-sky-200">{rs(net)}</span></div>
          {!payLater && <div className="mb-2 grid grid-cols-5 gap-1">{ctx.modes.map((m) => { const I = MODE_ICON[m] ?? Banknote; return <button key={m} onClick={() => setMode(m)} className={cn("flex flex-col items-center gap-0.5 rounded-xl border py-1.5 text-[10px] font-semibold", mode === m ? "border-emerald-600 bg-emerald-600 text-white" : "border-border")}><I className="h-4 w-4" />{m.replace("Bank Transfer", "Bank")}</button>; })}</div>}
          {!payLater && mode === "Cash" && <div className="mb-2 flex items-center gap-2"><input className={inputCls + " h-10 text-end text-lg font-bold tabular-nums"} placeholder="Cash tendered" inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/\D/g, ""))} />
            {[500, 1000, 5000].map((v) => <button key={v} onClick={() => setTendered(String(v))} className="rounded-lg border border-border px-2 py-2 text-xs font-semibold">{v}</button>)}</div>}
          {Number(tendered) > net && <div className="mb-2 flex justify-between rounded-xl bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"><span>Change</span><span className="tabular-nums">{rs(Number(tendered) - net)}</span></div>}
          {ctx.pipeline ? <div className="mb-2 flex gap-1">{["Normal", "Elderly-Disabled", "Urgent"].map((p) => <button key={p} onClick={() => setPriority(p)} className={cn("flex-1 rounded-lg border py-1 text-[11px] font-semibold", priority === p ? "border-sky-600 bg-sky-600 text-white" : "border-border text-muted-foreground")}>{p.replace("-", " / ")}</button>)}</div> : null}
          <div className="flex gap-2"><Button variant="neutral" className="h-12" onClick={reset} disabled={!lines.length}><X className="h-4 w-4" /></Button>
            <Button variant="submit" className="h-12 flex-1 text-base" disabled={!lines.length || !!quote?.errors.length || noShift || discount?.status === "Pending"} loading={busy} onClick={() => void checkout()}>
              {payLater ? "Send to dispensing" : `Pay ${rs(net)}`} <kbd className="ms-1 rounded bg-white/20 px-1 text-[10px]">F9</kbd></Button></div>
        </div>
      </aside>

      {rxOpen && <RxDialog onClose={() => setRxOpen(false)} onLoad={(c) => void loadRx(c)} />}
      {subFor && <SubDialog line={subFor} onClose={() => setSubFor(null)} onPick={(s) => { setLines((ls) => ls.map((l) => (l.key === subFor.key ? { ...l, item_code: s.item_code, item_name: s.item_name, original_item: l.original_item ?? l.item_code } : l))); setSubFor(null); }} />}
      {discOpen && <DiscountDialog gross={gross} onClose={() => setDiscOpen(false)} onDone={(d) => { setDiscount(d); setDiscOpen(false); }} />}
      {receipt && <ReceiptDialog r={receipt} onClose={() => { setReceipt(null); searchRef.current?.focus(); }} agent={!!boot} />}
    </div>
  );
}

function RxDialog({ onClose, onLoad }: { onClose: () => void; onLoad: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <Dialog open onClose={onClose} title="Load prescription" description="Scan the prescription QR, or type the Rx number or patient MR (latest signed prescription)." size="sm">
      <input className={inputCls + " h-12 font-mono text-lg"} autoFocus value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && code.trim() && onLoad(code.trim())} />
      <Button variant="primary" className="mt-3 w-full" disabled={!code.trim()} onClick={() => onLoad(code.trim())}>Load</Button>
    </Dialog>
  );
}

function SubDialog({ line, onClose, onPick }: { line: Line; onClose: () => void; onPick: (s: Sub) => void }) {
  const { data } = useApi<Sub[]>("pharmacy.substitutes", { item_code: line.original_item ?? line.item_code });
  return (
    <Dialog open onClose={onClose} title={`Substitutes for ${line.item_name}`} description={`Same generic, strength and form — ${line.generic ?? ""} ${line.strength ?? ""}. Logged on the bill.`} size="md">
      {data?.length ? <div className="space-y-2">{data.map((s) => (
        <button key={s.item_code} onClick={() => onPick(s)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-start hover:border-sky-500">
          <span className="text-2xl">💊</span><span className="min-w-0 flex-1"><b className="block">{s.item_name}</b><span className="text-xs text-muted-foreground">{stockText(s.stock)}</span></span><span className="font-bold tabular-nums">{rs(s.price)}</span></button>))}</div>
        : <Empty title={data ? "No substitute in stock" : "Looking…"} />}
    </Dialog>
  );
}

function DiscountDialog({ gross, onClose, onDone }: { gross: number; onClose: () => void; onDone: (d: { amount: number; auth: string; status: string }) => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ name: string; amount: number } | null>(null);
  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(async () => {
      try { const r = await getCall<{ status: string }>("hospital_vvs.api.billing.discount_status", { name: pending.name });
        if (r.status === "Approved") { toast.success("Discount approved"); onDone({ amount: pending.amount, auth: pending.name, status: r.status }); }
        if (r.status === "Rejected") { toast.error("Discount rejected"); setPending(null); } } catch { /* keep polling */ }
    }, 4000);
    return () => window.clearInterval(t);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try { const r = await call<{ name: string; status: string }>("pharmacy.request_discount", { gross, amount: Number(amount), reason });
      if (r.status === "Within Limit" || r.status === "Approved") onDone({ amount: Number(amount), auth: r.name, status: r.status });
      else { setPending({ name: r.name, amount: Number(amount) }); toast("Above your limit — sent to the supervisor", { icon: "⏳" }); } }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  const pct = gross ? (Number(amount) / gross) * 100 : 0;
  return (
    <Dialog open onClose={onClose} title="Discount" description={`Bill ${rs(gross)}. Within your limit it applies at once; above it the supervisor approves.`} size="sm">
      {pending ? <div className="py-6 text-center"><div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />Waiting for approval of {rs(pending.amount)}…</div> : <>
        <div className="mb-2 flex gap-1">{[5, 10, 15, 20].map((p) => <button key={p} onClick={() => setAmount(String(Math.round((gross * p) / 100)))} className="flex-1 rounded-lg border border-border py-1.5 text-sm font-semibold">{p}%</button>)}</div>
        <Field label={`Amount (${pct.toFixed(1)}%)`}><input className={inputCls + " h-11 text-end text-lg font-bold tabular-nums"} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} autoFocus /></Field>
        <Field label="Reason" required className="mt-2"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Button variant="primary" className="mt-4 w-full" disabled={!Number(amount) || !reason.trim()} loading={busy} onClick={() => void save()}>Apply discount</Button></>}
    </Dialog>
  );
}

function ReceiptDialog({ r, onClose, agent }: { r: Receipt; onClose: () => void; agent: boolean }) {
  const print = () => void printDoc(receiptHtml(r), "receipt", { agent });
  return (
    <Dialog open onClose={onClose} title={r.docstatus === 1 ? "Paid" : "Sent to dispensing"} size="sm">
      <div className="rounded-3xl bg-gradient-to-br from-sky-700 to-emerald-600 p-5 text-center text-white">
        {r.token && <><div className="text-xs uppercase tracking-[0.3em] text-white/70">Token</div><div className="text-6xl font-black tracking-wider">{r.token}</div></>}
        <div className="mt-2 text-2xl font-bold tabular-nums">{rs(r.grand_total)}</div>
        {r.change > 0 && <div className="mt-1 rounded-xl bg-white/20 py-1 text-lg font-bold">Change {rs(r.change)}</div>}
        <div className="mt-1 text-xs text-white/80">{r.name} · {r.mode}</div>
      </div>
      <div className="mt-3 max-h-48 overflow-y-auto text-sm">{r.items.map((i, k) => <div key={k} className="flex justify-between border-b border-border/50 py-1"><span>{i.item_name} <span className="text-xs text-muted-foreground">{i.qty} {i.uom}</span></span><span className="tabular-nums">{rs(i.amount)}</span></div>)}</div>
      <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={print}><Printer className="h-4 w-4" />Print receipt</Button><Button variant="primary" className="flex-1" onClick={onClose} autoFocus>Next customer</Button></div>
    </Dialog>
  );
}
