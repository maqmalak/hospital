import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Banknote, BookUser, CheckCircle2, ClipboardList, CloudOff, CreditCard, Delete, FileText, History, Keyboard, LayoutGrid, List, Lock, Minus, Monitor,
  PauseCircle, Percent, Plus, Printer, ReceiptText, RefreshCw, Replace, ScanLine, Search, ShieldAlert, Smartphone, Trash2, Undo2, UserRound, Wallet, Wifi, X,
} from "lucide-react";
import toast from "react-hot-toast";
import { call, getCall, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { printDoc } from "@/lib/print";
import { Empty, inputCls } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { isNetworkError, kvGet, kvSet, loadBundle, refreshBundle, usePharmacySync, type Queued } from "./offline";
import { type Receipt, receiptHtml, rs, type Split, stockText, usePharmacyLive } from "./shared";

interface Ctx { counter: { name: string; counter_name: string; branch: string } | null; shift: string | null; shift_counter: string | null; warehouse: string | null; collect_payment_at: string;
  pipeline: number; near_expiry_days: number; display_key?: string; counters: { name: string; counter_type: string; number?: number }[];
  waiting_prescriptions: { name: string; prescription: string; patient: string; customer_name: string; creation: string; doctor_name?: string }[]; modes: string[];
  discount: { max_percent: number; max_amount: number | null; policy: string }; categories: string[]; pay_choice: string; credit_customers: number }
interface Hit { item_code: string; item_name: string; generic?: string; strength?: string; form?: string; rack?: string; rx: number; controlled: number; stock: Split; upp: number; ups: number; spp: number;
  uoms: string[]; stock_uom: string; prices: Record<string, number>; next_expiry?: string; near_expiry: boolean; category?: string; batch?: string }
interface Line { key: string; item_code: string; item_name: string; uom: string; qty: number; uoms: string[]; prices: Record<string, number>; original_item?: string; rx?: number; controlled?: number;
  generic?: string; strength?: string; no_substitution?: number; dose?: string; frequency?: string; duration?: string; batch?: string; expiry?: string; rack?: string }
interface QLine { item_code: string; item_name: string; uom: string; qty: number; batch_no: string; expiry: string; near_expiry: boolean; days_left: number; rate: number; amount: number; rack?: string; original_item?: string }
interface Quote { lines: QLine[]; errors: string[]; warnings: string[]; rx_missing: string[]; total: number }
interface Sub { item_code: string; item_name: string; stock: Split; price: number; rx: number }
interface PatientRow { name: string; patient_name: string; patient_name_ur?: string; phone?: string; gender?: string; age?: number; category?: string; customer?: string; cnic_masked?: string; credit?: number }
interface CreditRow { name: string; customer_name: string; mobile_no?: string; balance: number; credit_limit: number }
type Cust = { kind: "walkin" } | { kind: "patient"; p: PatientRow } | { kind: "credit"; c: CreditRow };
interface Bundle { items: Hit[]; patients: PatientRow[]; credit: CreditRow[]; categories: string[]; modes: string[]; counter: string; generated_at: string }
interface Held { id: string; at: string; lines: Line[]; cust: Cust; rx: { prescription: string; doctor?: string } | null; priority: string }
interface Tender { mode_of_payment: string; amount: number; reference_no?: string }

const MODE_ICON: Record<string, typeof Banknote> = { Cash: Banknote, Card: CreditCard, JazzCash: Smartphone, Easypaisa: Smartphone, "Bank Transfer": CreditCard, "On account": BookUser };
const FORM_EMOJI: Record<string, string> = { Tablet: "💊", Capsule: "💊", Syrup: "🧴", Suspension: "🧴", Injection: "💉", Drops: "💧", Cream: "🧴", Ointment: "🧴", Inhaler: "🌬️", Sachet: "🧂" };
const PRIO: Record<string, string> = { Normal: "border-slate-600 bg-slate-600", Elderly: "border-amber-500 bg-amber-500", Disabled: "border-sky-600 bg-sky-600", Urgent: "border-rose-600 bg-rose-600" };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const custLabel = (c: Cust) => (c.kind === "walkin" ? "Walk-in customer" : c.kind === "patient" ? c.p.patient_name : c.c.customer_name);

export default function PosPage() {
  const { boot } = useAuth();
  const { data: live, refetch: refetchCtx, error: ctxErr } = useApi<Ctx>("pharmacy.pos_context", undefined, { refetchInterval: 30_000, retry: false });
  usePharmacyLive(["pharmacy.pos_context", "pharmacy.invoices"]);
  const [cachedCtx, setCachedCtx] = useState<Ctx>();
  const sync = usePharmacySync(() => void refetchCtx());
  useEffect(() => { void kvGet<Ctx>("ctx").then(setCachedCtx); }, []);
  useEffect(() => { if (live) void kvSet("ctx", live); }, [live]);
  useEffect(() => { if (ctxErr && isNetworkError(ctxErr)) sync.markOffline(); }, [ctxErr]); // eslint-disable-line react-hooks/exhaustive-deps
  const offline = !sync.online;
  const ctx = live ?? (offline ? cachedCtx : undefined);
  const counter = ctx?.counter?.name ?? "";
  const [bundle, setBundle] = useState<Bundle>();
  useEffect(() => { if (counter) void loadBundle<Bundle>(counter).then(setBundle); }, [counter]);
  useEffect(() => { if (counter && sync.online) void refreshBundle<Bundle>(counter).then(setBundle).catch(() => undefined); }, [counter, sync.online]);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [view, setView] = useState<"grid" | "list">(() => { try { return (localStorage.getItem("hv.pos.view") as "list") || "grid"; } catch { return "grid"; } });
  const [hits, setHits] = useState<Hit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [cust, setCust] = useState<Cust>({ kind: "walkin" });
  const [rx, setRx] = useState<{ prescription: string; doctor?: string } | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [priority, setPriority] = useState("Normal");
  const [payAt, setPayAt] = useState<"now" | "handover">("now");
  const [discount, setDiscount] = useState<{ amount: number; auth: string; status: string } | null>(null);
  const [dlg, setDlg] = useState<null | "rx" | "pay" | "held" | "invoices" | "shift" | "keys" | "returns">(null);
  const [subFor, setSubFor] = useState<Line | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState(uid);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void kvGet<Held[]>("held").then((h) => setHeld(h ?? [])); }, []);
  useEffect(() => { try { localStorage.setItem("hv.pos.view", view); } catch { /* ignore */ } }, [view]);
  useEffect(() => { if (ctx?.pay_choice === "Handover counter") setPayAt("handover"); else if (ctx?.pay_choice === "Billing counter") setPayAt("now"); }, [ctx?.pay_choice]);

  // catalogue: server (by category) or the offline bundle
  useEffect(() => {
    if (offline) {
      const t = q.trim().toLowerCase();
      setHits((bundle?.items ?? []).filter((h) => (!cat || h.category === cat) && (!t || `${h.item_name} ${h.generic ?? ""} ${h.item_code}`.toLowerCase().includes(t))).slice(0, 120));
      return;
    }
    const h = window.setTimeout(async () => { try { setHits(await getCall<Hit[]>("hospital_vvs.api.pharmacy.search", { q, category: cat || undefined, limit: q ? 40 : 80 })); } catch (e) { if (isNetworkError(e)) sync.markOffline(); setHits([]); } }, q ? 220 : 0);
    return () => window.clearTimeout(h);
  }, [q, cat, offline, bundle]); // eslint-disable-line react-hooks/exhaustive-deps

  // pricing: the server allocates FEFO batches; offline uses the cached first batch and price
  useEffect(() => {
    if (!lines.length) { setQuote(null); return; }
    if (offline) {
      const ql = lines.map((l) => ({ item_code: l.item_code, item_name: l.item_name, uom: l.uom, qty: l.qty, batch_no: l.batch ?? "", expiry: l.expiry ?? "", near_expiry: false, days_left: 999, rate: l.prices[l.uom] ?? 0, amount: (l.prices[l.uom] ?? 0) * l.qty, rack: l.rack }));
      const rxNeed = lines.filter((l) => (l.rx || l.controlled) && !rx).map((l) => l.item_name);
      setQuote({ lines: ql, errors: [], warnings: ["Offline: prices from the last sync; batches are confirmed when the sale posts."], rx_missing: rxNeed, total: ql.reduce((s, x) => s + x.amount, 0) });
      return;
    }
    const h = window.setTimeout(async () => {
      try { setQuote(await call<Quote>("pharmacy.quote", { lines: lines.map((l) => ({ item_code: l.item_code, uom: l.uom, qty: l.qty, original_item: l.original_item })), prescription: rx?.prescription })); }
      catch (e) { if (isNetworkError(e)) sync.markOffline(); else toast.error(humanizeError(e)); }
    }, 250);
    return () => window.clearTimeout(h);
  }, [lines, rx, offline]); // eslint-disable-line react-hooks/exhaustive-deps

  const gross = quote?.total ?? 0;
  const disc = discount && ["Within Limit", "Approved"].includes(discount.status) ? discount.amount : 0;
  const net = Math.max(gross - disc, 0);
  const credit = cust.kind === "credit";
  const chooser = ctx?.pay_choice?.startsWith("Cashier") && !!ctx?.pipeline;
  const payLater = !credit && !offline && !!ctx?.pipeline && (ctx?.pay_choice === "Handover counter" || (chooser && payAt === "handover"));
  const noShift = !payLater && !credit && !ctx?.shift;

  useEffect(() => {
    if (offline) return;
    const h = window.setTimeout(() => void call("pharmacy.display_push", { state: lines.length ? { state: "cart", lines: (quote?.lines ?? []).map((l) => ({ name: l.item_name, qty: l.qty, uom: l.uom, amount: l.amount })), total: gross, discount: disc, net } : { state: "idle" } }).catch(() => undefined), 400);
    return () => window.clearTimeout(h);
  }, [quote, disc]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = useCallback((h: Hit, uom?: string) => {
    if ((h.stock?.units ?? 0) <= 0) { toast.error(`${h.item_name} is out of stock`); return; }
    const u = uom ?? (h.uoms.includes("Strip") ? "Strip" : h.uoms[0]);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item_code === h.item_code && l.uom === u && !l.original_item);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: uid(), item_code: h.item_code, item_name: h.item_name, uom: u, qty: 1, uoms: h.uoms, prices: h.prices, rx: h.rx, controlled: h.controlled, generic: h.generic,
        strength: h.strength, batch: h.batch, expiry: h.next_expiry, rack: h.rack }];
    });
  }, []);
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)).filter((l) => l.qty > 0));
  const onScanEnter = () => { const exact = hits.find((h) => h.item_code.toLowerCase() === q.trim().toLowerCase()) ?? (hits.length === 1 ? hits[0] : undefined); if (exact) { add(exact); setQ(""); } };

  const loadRx = async (code: string) => {
    try {
      const r = await getCall<{ prescription: string; patient: string; patient_name: string; doctor: string; lines: Line[] }>("hospital_vvs.api.pharmacy.prescription", { code });
      const found = await Promise.all(r.lines.map(async (l) => (await getCall<Hit[]>("hospital_vvs.api.pharmacy.search", { q: l.item_code }))[0]));
      setLines(r.lines.map((l, i) => ({ ...l, key: uid(), uoms: found[i]?.uoms ?? [l.uom], prices: found[i]?.prices ?? {}, rx: found[i]?.rx, controlled: found[i]?.controlled, generic: found[i]?.generic, strength: found[i]?.strength })));
      setRx({ prescription: r.prescription, doctor: r.doctor });
      setCust({ kind: "patient", p: { name: r.patient, patient_name: r.patient_name } });
      setDlg(null);
      toast.success(`Prescription ${r.prescription} loaded`);
    } catch (e) { toast.error(humanizeError(e)); }
  };

  const reset = () => { setLines([]); setCust({ kind: "walkin" }); setRx(null); setDiscount(null); setPriority("Normal"); setRef(uid()); if (ctx?.pay_choice?.startsWith("Cashier")) setPayAt("now"); searchRef.current?.focus(); };
  const hold = async () => {
    if (!lines.length) return;
    const h = [{ id: uid(), at: new Date().toISOString(), lines, cust, rx, priority }, ...held].slice(0, 30);
    setHeld(h); await kvSet("held", h); reset(); toast.success("Held — resume from Drafts (F8)");
  };
  const resume = async (h: Held) => {
    if (lines.length) await hold();
    setLines(h.lines); setCust(h.cust); setRx(h.rx); setPriority(h.priority);
    const left = held.filter((x) => x.id !== h.id); setHeld(left); await kvSet("held", left); setDlg(null);
  };

  const payload = (extra: Record<string, unknown> = {}) => ({ lines: lines.map((l) => ({ item_code: l.item_code, uom: l.uom, qty: l.qty, original_item: l.original_item })),
    patient: cust.kind === "patient" ? cust.p.name : undefined, customer: cust.kind === "credit" ? cust.c.name : undefined, prescription: rx?.prescription,
    discount_amount: disc || undefined, discount_authorization: disc ? discount?.auth : undefined, priority, client_ref: ref, counter, ...extra });
  const send = async (extra: Record<string, unknown>) => {
    setBusy(true);
    try { const r = await call<Receipt>("pharmacy.checkout", { data: payload(extra) }); setReceipt(r); reset(); setDlg(null); void refetchCtx(); }
    catch (e) {
      if (isNetworkError(e) || offline) await sellOffline(extra);
      else toast.error(humanizeError(e), { duration: 8000 });
    } finally { setBusy(false); }
  };
  const sellOffline = async (extra: Record<string, unknown>) => {
    if (extra.payment_mode === "On account" || extra.pay_at === "handover" || disc || quote?.rx_missing.length) { toast.error("Offline: cash / card / wallet sales without discount or prescription items only."); return; }
    const data = { ...payload(extra), pay_at: "now" };
    const tenders = (extra.payments as Tender[] | undefined) ?? [];
    const paid = tenders.reduce((s, t) => s + t.amount, 0);
    const local: Receipt = { name: `OFF-${ref.slice(0, 8).toUpperCase()}`, docstatus: 1, posting_date: new Date().toISOString().slice(0, 10), posting_time: new Date().toTimeString().slice(0, 5),
      customer: custLabel(cust), cashier: boot?.full_name ?? "", counter, pending_sync: true, items: (quote?.lines ?? []).map((l) => ({ item_name: l.item_name, qty: l.qty, uom: l.uom, rate: l.rate, amount: l.amount, batch_no: l.batch_no, expiry: l.expiry })),
      total: gross, discount: 0, grand_total: net, paid, tendered: paid, change: Math.max(paid - net, 0), mode: tenders.map((t) => t.mode_of_payment).join(" + "), clinic: { name: "Contract pharmacy" } };
    const qd: Queued = { client_ref: ref, created: new Date().toISOString(), total: net, customer: custLabel(cust), status: "pending", attempts: 0, data, receipt: local };
    await sync.enqueue(qd);
    toast("Saved offline — posts when the connection returns", { icon: "📴" });
    setReceipt(local); reset(); setDlg(null);
  };
  const checkout = () => {
    if (!lines.length || busy) return;
    if (credit) { void send({ payment_mode: "On account" }); return; }
    if (payLater) { void send({ pay_at: "handover" }); return; }
    setDlg("pay");
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "F3") { e.preventDefault(); (document.querySelector("[data-cust-search]") as HTMLInputElement | null)?.focus(); }
      else if (e.key === "F4") { e.preventDefault(); setDlg("rx"); }
      else if (e.key === "F7") { e.preventDefault(); setDlg("returns"); }
      else if (e.key === "F8") { e.preventDefault(); if (lines.length) void hold(); else setDlg("held"); }
      else if (e.key === "F9") { e.preventDefault(); checkout(); }
      else if (e.key === "F10") { e.preventDefault(); setDlg("invoices"); }
      else if (e.key === "F11") { e.preventDefault(); setDlg("shift"); }
      else if (e.key === "F12") { e.preventDefault(); window.dispatchEvent(new Event("hv-lock")); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!ctx) return <div className="flex h-[70vh] items-center justify-center">{ctxErr ? <div className="text-center"><CloudOff className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />Server unreachable and nothing cached yet.</div> : <Spinner size={28} />}</div>;
  const byLine = (l: Line) => (quote?.lines ?? []).filter((x) => x.item_code === l.item_code && (x.original_item ?? undefined) === (l.original_item ?? undefined));
  const cats = offline ? bundle?.categories ?? [] : ctx.categories ?? [];
  const lim = ctx.discount;
  const ctaLabel = credit ? `Charge to account ${rs(net)}` : payLater ? `Send to dispensing ${rs(net)}` : `Pay ${rs(net)}`;

  return (
    <div className="-mt-3 flex h-[calc(100vh-4.25rem)] min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-sky-50 via-background to-emerald-50 dark:from-sky-950/30 dark:to-emerald-950/20 sm:-mt-4">
      {/* top bar (Restaurant OS) */}
      <div className="flex flex-wrap items-center gap-2 bg-gradient-to-r from-[#08304a] to-[#06302c] px-3 py-2 text-white">
        <span className="flex items-center gap-2 font-extrabold"><ReceiptText className="h-5 w-5 text-emerald-300" />{ctx.counter?.counter_name ?? "Pharmacy"}</span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", ctx.shift ? "bg-emerald-500/25 text-emerald-100" : "bg-rose-500 text-white")}>{ctx.shift ? "SHIFT OPEN" : "NO SHIFT"}</span>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold">{chooser ? "Pay now or at handover" : ctx.pay_choice === "Handover counter" ? "Pay at handover" : "Pay at billing"}</span>
        <Clock />
        <button onClick={() => (offline ? void sync.sync() : setDlg("invoices"))} className={cn("flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", offline ? "bg-amber-400 text-amber-950" : sync.queue.length ? "bg-sky-400 text-sky-950" : "bg-emerald-500/20 text-emerald-100")}>
          {offline ? <CloudOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}{offline ? "Offline" : "Online"}{sync.queue.length ? ` · ${sync.queue.length} to sync` : ""}{sync.syncing && <RefreshCw className="h-3 w-3 animate-spin" />}</button>
        <div className="ms-auto flex flex-wrap gap-1">
          <Top icon={FileText} label="Prescription" k="F4" onClick={() => setDlg("rx")} />
          <Top icon={PauseCircle} label={`Drafts${held.length ? ` (${held.length})` : ""}`} k="F8" onClick={() => setDlg("held")} />
          <Top icon={Undo2} label="Return" k="F7" onClick={() => setDlg("returns")} />
          <Top icon={History} label="Invoices" k="F10" onClick={() => setDlg("invoices")} />
          <Top icon={Wallet} label="Shift" k="F11" onClick={() => setDlg("shift")} />
          {ctx.display_key && <a href={`/hms/display/counter/${ctx.display_key}`} target="_blank" rel="noreferrer"><Top icon={Monitor} label="Display" onClick={() => undefined} /></a>}
          <Top icon={Keyboard} label="Keys" onClick={() => setDlg("keys")} />
          <Top icon={Lock} label="Lock" k="F12" onClick={() => window.dispatchEvent(new Event("hv-lock"))} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        {/* catalogue */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1"><ScanLine className="absolute start-3 top-3 h-5 w-5 text-sky-600" />
              <input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onScanEnter()} placeholder="Scan barcode or search brand / generic  (F2)"
                className="h-11 w-full rounded-2xl border border-border bg-card ps-11 pe-10 text-base shadow-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15" />
              {q && <button onClick={() => setQ("")} className="absolute end-3 top-3 text-muted-foreground"><X className="h-5 w-5" /></button>}</div>
            <div className="flex rounded-xl border border-border bg-card p-0.5">{([["grid", LayoutGrid], ["list", List]] as const).map(([k, I]) => (
              <button key={k} onClick={() => setView(k)} className={cn("rounded-lg p-2", view === k ? "bg-sky-600 text-white" : "text-muted-foreground")} title={k === "grid" ? "Cards" : "List"}><I className="h-4 w-4" /></button>))}</div>
          </div>
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">{["", ...cats].map((c) => (
            <button key={c || "all"} onClick={() => setCat(c)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", cat === c ? "border-sky-600 bg-sky-600 text-white shadow" : "border-border bg-card hover:border-sky-400")}>{c || "All medicines"}</button>))}</div>
          {ctx.waiting_prescriptions.length > 0 && !offline && <div className="mb-2 flex gap-2 overflow-x-auto pb-1">{ctx.waiting_prescriptions.map((w) => (
            <button key={w.name} onClick={() => void loadRx(w.prescription)} className="flex shrink-0 items-center gap-2 rounded-xl border border-sky-200 bg-card px-3 py-1.5 text-start text-xs shadow-sm hover:border-sky-500 dark:border-sky-500/30">
              <ClipboardList className="h-4 w-4 text-sky-600" /><span><b className="block text-sm">{w.customer_name}</b>{w.doctor_name} · {w.creation.slice(11, 16)}</span></button>))}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {view === "grid" ? <div className="grid auto-rows-min grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{hits.map((h) => <ItemCard key={h.item_code} h={h} onAdd={add} />)}</div>
              : <div className="overflow-hidden rounded-2xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr>
                <th className="px-3 py-2 text-start">Medicine</th><th className="px-2 py-2 text-start">Rack</th><th className="px-2 py-2 text-start">Stock</th><th className="px-2 py-2 text-start">Expiry</th><th className="px-2 py-2 text-end">Add</th></tr></thead>
                <tbody>{hits.map((h) => <ItemRow key={h.item_code} h={h} onAdd={add} />)}</tbody></table></div>}
            {!hits.length && <Empty title={q ? "No medicine found" : offline ? "Nothing cached for offline yet" : "No medicines in this category"} icon={Search} />}
          </div>
        </section>

        {/* cart */}
        <aside className="flex min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-xl lg:w-[440px]">
          <CustomerBox cust={cust} setCust={(c) => { setCust(c); if (c.kind !== "patient") setRx(null); }} offline={offline} bundle={bundle} creditEnabled={ctx.credit_customers > 0} />
          {rx && <div className="flex items-center gap-2 border-b border-border bg-sky-50 px-4 py-1.5 text-xs dark:bg-sky-500/10"><FileText className="h-3.5 w-3.5 text-sky-600" />Rx <b>{rx.prescription}</b> · {rx.doctor}<button className="ms-auto font-semibold text-sky-700 underline" onClick={() => setRx(null)}>remove</button></div>}
          {noShift && !offline && <Link to="/cash/shift" className="flex items-center gap-2 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"><ShieldAlert className="h-4 w-4" />Open your cash shift to take money →</Link>}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {lines.map((l) => <CartLine key={l.key} l={l} ql={byLine(l)} onChange={(p) => setLine(l.key, p)} onSub={() => setSubFor(l)} offline={offline} />)}
            {!lines.length && <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground"><div className="text-5xl">🛒</div><div className="mt-2 text-sm">Scan or tap a medicine · load a prescription with F4</div></div>}
            {quote?.errors.map((e, i) => <div key={i} className="flex gap-2 rounded-xl bg-rose-50 p-2 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200"><AlertTriangle className="h-4 w-4 shrink-0" />{e}</div>)}
            {(quote?.rx_missing.length ?? 0) > 0 && <div className="rounded-xl bg-sky-50 p-2 text-xs font-semibold text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">Prescription needed for {quote!.rx_missing.join(", ")} — load it with F4.</div>}
            {quote?.warnings.map((w, i) => <div key={i} className="rounded-xl bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{w}</div>)}
          </div>
          <div className="space-y-2 border-t border-border p-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Items ({lines.reduce((s, l) => s + l.qty, 0)})</span><span className="tabular-nums">{rs(gross)}</span></div>
            <DiscountBox gross={gross} limit={lim} value={discount} onChange={setDiscount} disabled={offline || !gross} />
            <div className="flex items-end justify-between"><span className="text-sm font-semibold">{credit ? "To account" : payLater ? "Due at handover" : "Net payable"}</span><span className="text-3xl font-black tabular-nums text-sky-800 dark:text-sky-200">{rs(net)}</span></div>
            {chooser && !credit && !offline && <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">{([["now", "Pay now"], ["handover", "Pay at handover"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setPayAt(k)} className={cn("rounded-lg py-1.5 text-xs font-bold", payAt === k ? "bg-card text-sky-800 shadow dark:text-sky-200" : "text-muted-foreground")}>{l}</button>))}</div>}
            {ctx.pipeline ? <div className="flex gap-1">{["Normal", "Elderly", "Disabled", "Urgent"].map((p) => <button key={p} onClick={() => setPriority(p)} className={cn("flex-1 rounded-lg border py-1 text-[11px] font-semibold",
              priority === p ? `${PRIO[p]} text-white` : "border-border text-muted-foreground")}>{p}</button>)}</div> : null}
            <div className="flex gap-2"><Button variant="neutral" className="h-12" onClick={() => void hold()} disabled={!lines.length} title="Hold (F8)"><PauseCircle className="h-4 w-4" /></Button>
              <Button variant="neutral" className="h-12" onClick={reset} disabled={!lines.length} title="Clear"><Trash2 className="h-4 w-4" /></Button>
              <Button variant="submit" className="h-12 flex-1 text-base" disabled={!lines.length || !!quote?.errors.length || (noShift && !offline) || discount?.status === "Pending" || (!!quote?.rx_missing.length && offline)} loading={busy} onClick={checkout}>
                {ctaLabel} <kbd className="ms-1 rounded bg-white/20 px-1 text-[10px]">F9</kbd></Button></div>
          </div>
        </aside>
      </div>

      {dlg === "rx" && <RxDialog onClose={() => setDlg(null)} onLoad={(c) => void loadRx(c)} />}
      {dlg === "pay" && <PayDialog total={net} modes={offline ? bundle?.modes ?? ["Cash"] : ctx.modes} busy={busy} onClose={() => setDlg(null)} onPay={(payments) => void send({ pay_at: "now", payments, payment_mode: payments[0]?.mode_of_payment })} />}
      {dlg === "held" && <Dialog open onClose={() => setDlg(null)} title="Drafts on hold" description="Kept on this PC" size="md"><div className="space-y-2">{held.map((h) => (
        <div key={h.id} className="flex items-center gap-2 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><div className="font-semibold">{custLabel(h.cust)}{h.rx ? ` · ${h.rx.prescription}` : ""}</div>
          <div className="truncate text-xs text-muted-foreground">{new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {h.lines.map((l) => `${l.qty} ${l.uom} ${l.item_name}`).join(", ")}</div></div>
          <Button size="sm" variant="save" onClick={() => void resume(h)}>Resume</Button>
          <button className="text-rose-600" onClick={async () => { const left = held.filter((x) => x.id !== h.id); setHeld(left); await kvSet("held", left); }}><X className="h-4 w-4" /></button></div>))}
        {!held.length && <div className="py-6 text-center text-sm text-muted-foreground">Nothing on hold.</div>}</div></Dialog>}
      {(dlg === "invoices" || dlg === "returns") && <InvoicesDialog initialScope={dlg === "returns" ? "today" : "shift"} returnMode={dlg === "returns"} sync={sync} offline={offline} agent={!!boot} onClose={() => setDlg(null)} />}
      {dlg === "shift" && <ShiftDialog onClose={() => setDlg(null)} offline={offline} />}
      {dlg === "keys" && <Dialog open onClose={() => setDlg(null)} title="Keyboard shortcuts" size="sm"><div className="grid grid-cols-[70px_1fr] gap-2 text-sm">
        {[["F2", "Search medicine / scan"], ["F3", "Find customer"], ["F4", "Load prescription"], ["F7", "Return"], ["F8", "Hold / drafts"], ["F9", "Pay · send · charge"], ["F10", "Invoices"], ["F11", "Shift summary"], ["F12", "Lock"], ["Enter", "Add the scanned item"]]
          .flatMap(([k, v]) => [<kbd key={k} className="rounded-md border border-border bg-muted px-2 py-0.5 text-center font-mono font-bold">{k}</kbd>, <span key={`${k}t`}>{v}</span>])}</div></Dialog>}
      {subFor && <SubDialog line={subFor} onClose={() => setSubFor(null)} onPick={(s) => { setLines((ls) => ls.map((l) => (l.key === subFor.key ? { ...l, item_code: s.item_code, item_name: s.item_name, original_item: l.original_item ?? l.item_code } : l))); setSubFor(null); }} />}
      {receipt && <ReceiptDialog r={receipt} agent={!!boot} onClose={() => { setReceipt(null); searchRef.current?.focus(); }} />}
    </div>
  );
}

function Top({ icon: I, label, k, onClick }: { icon: typeof Lock; label: string; k?: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/20"><I className="h-4 w-4" /><span className="hidden xl:inline">{label}</span>{k && <kbd className="rounded bg-white/15 px-1 font-mono text-[10px]">{k}</kbd>}</button>;
}
function Clock() {
  const [n, setN] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setN(new Date()), 15_000); return () => clearInterval(t); }, []);
  return <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[11px]">{n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>;
}

function ItemCard({ h, onAdd }: { h: Hit; onAdd: (h: Hit, u?: string) => void }) {
  const out = (h.stock?.units ?? 0) <= 0;
  return (
    <button onClick={() => onAdd(h)} disabled={out} className={cn("group relative flex flex-col rounded-2xl border bg-card p-3 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-lg disabled:opacity-50", h.near_expiry ? "border-amber-300" : "border-border")}>
      <div className="flex items-start gap-2"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-xl dark:bg-sky-500/10">{FORM_EMOJI[h.form ?? ""] ?? "💊"}</span>
        <div className="min-w-0 flex-1"><div className="line-clamp-2 text-sm font-bold leading-tight">{h.item_name}</div><div className="truncate text-[11px] text-muted-foreground">{h.generic} {h.strength}</div></div></div>
      <div className="mt-2 flex flex-wrap gap-1">
        {h.rx ? <span className="rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">Rx</span> : null}
        {h.controlled ? <span className="rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-200">Controlled</span> : null}
        {h.next_expiry && <span className={cn("rounded px-1 text-[10px] font-bold", h.near_expiry ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200")}>Exp {h.next_expiry.slice(0, 7)}</span>}
        {h.rack && <span className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{h.rack}</span>}
      </div>
      <div className="mt-auto flex items-end justify-between pt-2"><span className={cn("text-[11px]", out ? "font-bold text-rose-600" : "text-muted-foreground")}>{stockText(h.stock)}</span>
        <span className="text-sm font-extrabold tabular-nums text-sky-700 dark:text-sky-300">{rs(h.prices.Pack ?? Object.values(h.prices)[0])}</span></div>
      {h.uoms.length > 1 && !out && <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>{h.uoms.map((u) => (
        <span key={u} role="button" onClick={() => onAdd(h, u)} className="flex-1 rounded-lg bg-sky-50 py-1 text-center text-[11px] font-semibold text-sky-800 hover:bg-sky-600 hover:text-white dark:bg-sky-500/15 dark:text-sky-200">+{u === "Nos" ? "Unit" : u} {rs(h.prices[u])}</span>))}</div>}
    </button>
  );
}

function ItemRow({ h, onAdd }: { h: Hit; onAdd: (h: Hit, u?: string) => void }) {
  const out = (h.stock?.units ?? 0) <= 0;
  return (
    <tr className={cn("border-t border-border hover:bg-sky-50/50 dark:hover:bg-sky-500/5", out && "opacity-50")}>
      <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="text-lg">{FORM_EMOJI[h.form ?? ""] ?? "💊"}</span><div className="min-w-0"><div className="truncate font-semibold">{h.item_name}
        {h.rx ? <span className="ms-1 rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-800">Rx</span> : null}{h.controlled ? <span className="ms-1 rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-800">C</span> : null}</div>
        <div className="truncate text-[11px] text-muted-foreground">{h.generic} {h.strength}{h.category ? ` · ${h.category}` : ""}</div></div></div></td>
      <td className="px-2 py-2 font-mono text-xs">{h.rack}</td><td className={cn("px-2 py-2 text-xs", out && "font-bold text-rose-600")}>{stockText(h.stock)}</td>
      <td className={cn("px-2 py-2 text-xs", h.near_expiry && "font-bold text-amber-700")}>{h.next_expiry?.slice(0, 7)}</td>
      <td className="px-2 py-2"><div className="flex justify-end gap-1">{h.uoms.map((u) => <button key={u} disabled={out} onClick={() => onAdd(h, u)} className="rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-600 hover:text-white disabled:opacity-40 dark:bg-sky-500/15 dark:text-sky-200">
        +{u === "Nos" ? "Unit" : u} {rs(h.prices[u])}</button>)}</div></td>
    </tr>
  );
}

function CartLine({ l, ql, onChange, onSub, offline }: { l: Line; ql: QLine[]; onChange: (p: Partial<Line>) => void; onSub: () => void; offline: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{l.item_name}</div>
        <div className="text-[11px] text-muted-foreground">{l.generic} {l.strength}{l.original_item ? " · substitute" : ""}{l.dose ? ` · ${l.dose} ${l.frequency ?? ""} ${l.duration ?? ""}` : ""}</div></div>
        <span className="text-sm font-extrabold tabular-nums">{rs(ql.reduce((s, x) => s + x.amount, 0))}</span></div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-border"><button className="px-2 py-1.5" onClick={() => onChange({ qty: l.qty - 1 })}><Minus className="h-3.5 w-3.5" /></button>
          <input className="w-10 bg-transparent text-center text-sm font-bold tabular-nums outline-none" value={l.qty} inputMode="numeric" onChange={(e) => onChange({ qty: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
          <button className="px-2 py-1.5" onClick={() => onChange({ qty: l.qty + 1 })}><Plus className="h-3.5 w-3.5" /></button></div>
        <div className="flex gap-0.5 rounded-xl bg-muted p-0.5">{l.uoms.map((u) => <button key={u} onClick={() => onChange({ uom: u })} className={cn("rounded-lg px-2 py-1 text-[11px] font-semibold", l.uom === u ? "bg-sky-600 text-white" : "text-muted-foreground")}>{u === "Nos" ? "Unit" : u}</button>)}</div>
        <div className="flex-1" />
        {!l.no_substitution && !offline && <button title="Substitute (same generic)" onClick={onSub} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><Replace className="h-4 w-4" /></button>}
        <button onClick={() => onChange({ qty: 0 })} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
      </div>
      {ql.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{ql.map((x, i) => <span key={x.batch_no + i} className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", x.near_expiry ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200")}>
        {x.qty} {x.uom === "Nos" ? "unit" : x.uom} · B {x.batch_no || "—"} · Exp {x.expiry?.slice(0, 7) || "—"}{x.rack ? ` · ${x.rack}` : ""}</span>)}</div>}
    </div>
  );
}

/** Walk-in / patient / credit customer, with search by name, MR, mobile or CNIC. */
function CustomerBox({ cust, setCust, offline, bundle, creditEnabled }: { cust: Cust; setCust: (c: Cust) => void; offline: boolean; bundle?: Bundle; creditEnabled: boolean }) {
  const [tab, setTab] = useState<"walkin" | "patient" | "credit">(cust.kind);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ patients: PatientRow[]; credit: CreditRow[] }>({ patients: [], credit: [] });
  useEffect(() => { setTab(cust.kind); }, [cust.kind]);
  useEffect(() => {
    if (tab === "walkin") return;
    if (offline) {
      const t = q.trim().toLowerCase();
      setRes({ patients: t.length < 2 ? [] : (bundle?.patients ?? []).filter((p) => `${p.name} ${p.patient_name} ${p.phone ?? ""}`.toLowerCase().includes(t)).slice(0, 8),
        credit: (bundle?.credit ?? []).filter((c) => !t || c.customer_name.toLowerCase().includes(t)).slice(0, 8) });
      return;
    }
    const h = window.setTimeout(() => void getCall<{ patients: PatientRow[]; credit: CreditRow[] }>("hospital_vvs.api.pharmacy.customers", { q }).then(setRes).catch(() => undefined), 250);
    return () => window.clearTimeout(h);
  }, [q, tab, offline, bundle]);
  const chosen = cust.kind !== "walkin";
  return (
    <div className="bg-gradient-to-br from-sky-700 to-emerald-600 p-3 text-white">
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-white/15 p-1">{([["walkin", "Walk-in"], ["patient", "Patient"], ["credit", "Credit"]] as const).map(([k, l]) => (
        <button key={k} disabled={k === "credit" && !creditEnabled} onClick={() => { setTab(k); setQ(""); if (k === "walkin") setCust({ kind: "walkin" }); }}
          className={cn("rounded-lg py-1.5 text-xs font-bold disabled:opacity-40", tab === k ? "bg-white text-sky-800 shadow" : "text-white/85")}>{l}</button>))}</div>
      {chosen ? <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2">{cust.kind === "credit" ? <BookUser className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{custLabel(cust)}</div>
          <div className="truncate text-[11px] text-white/75">{cust.kind === "patient" ? [cust.p.name, cust.p.phone, cust.p.age != null ? `${cust.p.age}y` : "", cust.p.cnic_masked].filter(Boolean).join(" · ")
            : cust.kind === "credit" ? `Balance ${rs(cust.c.balance)}${cust.c.credit_limit ? ` · limit ${rs(cust.c.credit_limit)}` : ""}` : ""}</div></div>
        <button onClick={() => setCust({ kind: "walkin" })}><X className="h-4 w-4" /></button></div>
        : tab === "walkin" ? <div className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">Walk-in customer <span className="text-xs font-normal text-white/70">· no record</span></div>
        : <div className="relative"><Search className="absolute start-3 top-2.5 h-4 w-4 text-white/70" />
          <input data-cust-search autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "patient" ? "Name, MR, mobile or CNIC  (F3)" : "Credit customer name"}
            className="h-10 w-full rounded-xl border border-white/30 bg-white/15 ps-9 text-sm text-white outline-none placeholder:text-white/60 focus:bg-white/20" />
          {(tab === "patient" ? res.patients.length : res.credit.length) > 0 && <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card text-foreground shadow-xl">
            {tab === "patient" ? res.patients.map((p) => <button key={p.name} onClick={() => setCust({ kind: "patient", p })} className="block w-full border-b border-border/60 px-3 py-2 text-start text-sm hover:bg-sky-50 dark:hover:bg-sky-500/10">
              <b>{p.patient_name}</b> <span className="text-xs text-muted-foreground">{p.name} · {p.phone}{p.age != null ? ` · ${p.age}y` : ""}{p.cnic_masked ? ` · ${p.cnic_masked}` : ""}</span></button>)
              : res.credit.map((c) => <button key={c.name} onClick={() => setCust({ kind: "credit", c })} className="flex w-full items-center justify-between border-b border-border/60 px-3 py-2 text-start text-sm hover:bg-sky-50 dark:hover:bg-sky-500/10">
                <b>{c.customer_name}</b><span className="text-xs text-muted-foreground">bal {rs(c.balance)}{c.credit_limit ? ` / ${rs(c.credit_limit)}` : ""}</span></button>)}</div>}
        </div>}
    </div>
  );
}

/** Discount in % or Rs, checked against the cashier's limit from Clinic Settings → Discount rules. */
function DiscountBox({ gross, limit, value, onChange, disabled }: { gross: number; limit: Ctx["discount"]; value: { amount: number; auth: string; status: string } | null;
  onChange: (d: { amount: number; auth: string; status: string } | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"pct" | "rs">("pct");
  const [v, setV] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = mode === "pct" ? Math.round((gross * (Number(v) || 0)) / 100) : Number(v) || 0;
  const pct = gross ? (amount / gross) * 100 : 0;
  const maxRs = Math.min(limit.max_amount ?? Infinity, (gross * limit.max_percent) / 100);
  const over = amount > maxRs + 0.5;
  const blocked = over && limit.policy === "Not allowed";
  useEffect(() => {
    if (value?.status !== "Pending") return;
    const t = window.setInterval(async () => {
      try { const r = await getCall<{ status: string }>("hospital_vvs.api.billing.discount_status", { name: value.auth });
        if (r.status !== "Pending") { onChange({ ...value, status: r.status }); toast[r.status === "Approved" ? "success" : "error"](`Discount ${r.status.toLowerCase()}`); } } catch { /* keep polling */ }
    }, 4000);
    return () => window.clearInterval(t);
  }, [value?.status, value?.auth]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = async () => {
    setBusy(true);
    try { const r = await call<{ name: string; status: string }>("pharmacy.request_discount", { gross, amount, reason }); onChange({ amount, auth: r.name, status: r.status }); setOpen(false);
      if (r.status === "Pending") toast("Above your limit — waiting for the supervisor", { icon: "⏳" }); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  const shown = value && ["Within Limit", "Approved"].includes(value.status) ? value.amount : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <button disabled={disabled} onClick={() => setOpen(!open)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"><Percent className="h-3.5 w-3.5" />Discount
          {value?.status === "Pending" && <span className="text-amber-600"> · waiting approval</span>}{value?.status === "Rejected" && <span className="text-rose-600"> · rejected</span>}</button>
        <span className="flex items-center gap-1 tabular-nums text-rose-600">{shown ? `−${rs(shown)} (${gross ? ((shown / gross) * 100).toFixed(1) : 0}%)` : "–"}{value && <button onClick={() => onChange(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}</span>
      </div>
      {open && <div className="mt-2 space-y-2 rounded-xl border border-border bg-muted/40 p-2">
        <div className="flex gap-1"><div className="flex rounded-lg bg-card p-0.5">{([["pct", "%"], ["rs", "Rs"]] as const).map(([k, l]) => <button key={k} onClick={() => { setMode(k); setV(""); }} className={cn("rounded-md px-3 py-1 text-xs font-bold", mode === k ? "bg-sky-600 text-white" : "text-muted-foreground")}>{l}</button>)}</div>
          <input className={inputCls + " h-8 text-end font-bold tabular-nums"} inputMode="decimal" autoFocus value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} placeholder={mode === "pct" ? "0 %" : "Rs 0"} />
          {mode === "pct" && [5, 10].map((p) => <button key={p} onClick={() => setV(String(p))} className="rounded-lg border border-border bg-card px-2 text-xs font-semibold">{p}%</button>)}</div>
        <div className={cn("text-[11px]", over ? (blocked ? "font-bold text-rose-600" : "font-semibold text-amber-700") : "text-muted-foreground")}>
          = {rs(amount)} · {pct.toFixed(1)}% · your limit {limit.max_percent}%{limit.max_amount ? ` / ${rs(limit.max_amount)}` : ""}{over ? (blocked ? " — not allowed above the limit" : " — goes to the supervisor") : ""}</div>
        <input className={inputCls + " h-8"} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" variant="save" className="w-full" disabled={!amount || !reason.trim() || blocked || amount > gross} loading={busy} onClick={() => void apply()}>{over ? "Request approval" : "Apply discount"}</Button>
      </div>}
    </div>
  );
}

/** Split tender keypad (Restaurant OS): cash / card / wallet / bank, transaction IDs, change only from cash. */
function PayDialog({ total, modes, busy, onClose, onPay }: { total: number; modes: string[]; busy: boolean; onClose: () => void; onPay: (p: Tender[]) => void }) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [mode, setMode] = useState(modes.includes("Cash") ? "Cash" : modes[0]);
  const [entry, setEntry] = useState(String(Math.round(total)));
  const [ref, setRef] = useState("");
  const paid = tenders.reduce((s, t) => s + t.amount, 0);
  const due = Math.max(Math.round(total) - paid, 0);
  const change = Math.max(paid - Math.round(total), 0);
  const add = (amt?: number) => {
    const v = Math.round(amt ?? (Number(entry) || 0));
    if (v <= 0) return;
    if (mode !== "Cash" && v > due) { toast.error("Card / wallet / bank cannot be more than the amount due"); return; }
    if (mode !== "Cash" && !ref.trim()) { toast.error("Enter the transaction ID"); return; }
    setTenders((ts) => [...ts, { mode_of_payment: mode, amount: v, reference_no: mode !== "Cash" ? ref.trim() : undefined }]);
    setRef(""); setEntry(String(Math.max(due - v, 0)));
  };
  const confirm = () => {
    const list = tenders.length ? tenders : [{ mode_of_payment: mode, amount: Math.round(Number(entry) || 0), reference_no: ref.trim() || undefined }];
    const sum = list.reduce((s, t) => s + t.amount, 0);
    if (sum + 0.5 < Math.round(total)) { toast.error(`Still due ${rs(Math.round(total) - sum)}`); return; }
    if (list.some((t) => t.mode_of_payment !== "Cash" && !t.reference_no)) { toast.error("Enter the transaction ID"); return; }
    onPay(list);
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "INPUT") { e.preventDefault(); confirm(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); });
  const key = (k: string) => setEntry((v) => (k === "C" ? "" : k === "⌫" ? v.slice(0, -1) : (v === "0" ? "" : v) + k));
  return (
    <Dialog open onClose={onClose} size="xl" title={<span className="flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-600" />Payment</span>}>
      <div className="grid gap-4 md:grid-cols-[1fr_290px]">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{modes.map((m) => { const I = MODE_ICON[m] ?? Wallet; return (
            <button key={m} onClick={() => { setMode(m); if (m !== "Cash") setEntry(String(due)); }} className={cn("flex h-16 flex-col items-center justify-center rounded-xl border-2 text-xs font-bold", mode === m ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-border")}><I className="h-5 w-5" />{m}</button>); })}</div>
          {mode !== "Cash" && <input className={inputCls} placeholder="Transaction ID / slip no." value={ref} onChange={(e) => setRef(e.target.value)} autoFocus />}
          <div className="flex gap-2"><input className={inputCls + " h-14 text-end text-3xl font-black tabular-nums"} inputMode="numeric" value={entry} onChange={(e) => setEntry(e.target.value.replace(/\D/g, ""))} />
            <Button variant="save" size="lg" className="h-14" onClick={() => add()}><Plus className="h-5 w-5" />Split</Button></div>
          <div className="grid grid-cols-4 gap-2">{["1", "2", "3", "C", "4", "5", "6", "⌫", "7", "8", "9", "00", "0"].map((k) => (
            <button key={k} onClick={() => key(k)} className={cn("h-11 rounded-xl border border-border text-lg font-bold hover:bg-muted", k === "0" && "col-span-2", (k === "C" || k === "⌫") && "text-rose-600")}>{k === "⌫" ? <Delete className="mx-auto h-5 w-5" /> : k}</button>))}
            <button onClick={() => add(due)} className="col-span-2 h-11 rounded-xl bg-teal-600 font-bold text-white">Exact {rs(due)}</button></div>
          {mode === "Cash" && <div className="flex gap-2">{[500, 1000, 5000].map((v) => <button key={v} onClick={() => setEntry(String(v))} className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold">{rs(v)}</button>)}</div>}
        </div>
        <div className="space-y-2">
          <div className="rounded-2xl bg-gradient-to-br from-sky-800 to-emerald-800 p-4 text-white">
            <div className="flex justify-between text-sm text-white/80"><span>Bill</span><span className="tabular-nums">{rs(total)}</span></div>
            <div className="flex justify-between text-sm text-white/80"><span>Paid</span><span className="tabular-nums">{rs(paid)}</span></div>
            <div className="mt-2 text-[10px] uppercase tracking-widest text-white/60">{change ? "Change" : "Due"}</div><div className="text-4xl font-black tabular-nums">{rs(change || due)}</div>
          </div>
          {tenders.map((t, i) => { const I = MODE_ICON[t.mode_of_payment] ?? Wallet; return (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm"><I className="h-4 w-4" /><span className="flex-1">{t.mode_of_payment}{t.reference_no ? <span className="text-xs text-muted-foreground"> · {t.reference_no}</span> : null}</span>
              <b className="tabular-nums">{rs(t.amount)}</b><button onClick={() => setTenders((ts) => ts.filter((_, j) => j !== i))} className="text-rose-600"><X className="h-4 w-4" /></button></div>); })}
          {!tenders.length && <div className="rounded-lg border border-dashed border-border p-2 text-center text-xs text-muted-foreground">One payment: press Confirm. Several: Split each part.</div>}
          <Button variant="submit" size="lg" className="h-14 w-full text-lg" loading={busy} onClick={confirm}><CheckCircle2 className="h-5 w-5" />Confirm <span className="text-xs opacity-70">Enter</span></Button>
        </div>
      </div>
    </Dialog>
  );
}

interface RxRow { name: string; patient: string; patient_name: string; doctor_name?: string; prescription_date?: string; source?: string; creation: string; medicines: number; billed?: string; draft?: string }
function RxDialog({ onClose, onLoad }: { onClose: () => void; onLoad: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<RxRow[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRows(null); return; }
    const h = window.setTimeout(() => void getCall<RxRow[]>("hospital_vvs.api.pharmacy.find_prescriptions", { q }).then(setRows).catch((e) => toast.error(humanizeError(e))), 250);
    return () => window.clearTimeout(h);
  }, [q]);
  return (
    <Dialog open onClose={onClose} title="Load prescription" description="Search by patient name, MR, mobile, CNIC or Rx number — or scan the prescription QR." size="lg">
      <div className="relative"><Search className="absolute start-3 top-3.5 h-5 w-5 text-muted-foreground" />
        <input className={inputCls + " h-12 ps-10 text-lg"} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim().toUpperCase().startsWith("RX-") && onLoad(q.trim())} placeholder="Ali Khan · MR-LHR-000012 · 0300… · 35202-… · RX-…" /></div>
      <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">{(rows ?? []).map((r) => (
        <button key={r.name} onClick={() => onLoad(r.name)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-start hover:border-sky-500 hover:bg-sky-50/50 dark:hover:bg-sky-500/5">
          <FileText className="h-5 w-5 text-sky-600" /><div className="min-w-0 flex-1"><div className="font-bold">{r.patient_name} <span className="font-mono text-xs font-normal text-muted-foreground">{r.patient}</span></div>
            <div className="text-xs text-muted-foreground">{r.name} · {r.doctor_name} · {(r.prescription_date || r.creation).slice(0, 10)} · {r.medicines} medicine(s){r.source && r.source !== "OPD" ? ` · ${r.source}` : ""}</div></div>
          {r.billed ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Billed</span> : r.draft ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Waiting</span> : null}</button>))}
        {rows && !rows.length && <Empty title="No signed prescription found" />}</div>
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

function ReceiptDialog({ r, onClose, agent }: { r: Receipt; onClose: () => void; agent: boolean }) {
  const print = () => void printDoc(receiptHtml(r), "receipt", { agent });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onClose(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <Dialog open onClose={onClose} title={r.pending_sync ? "Saved offline" : r.docstatus === 1 ? (r.mode === "On account" ? "Charged to account" : "Paid") : "Sent to dispensing"} size="sm">
      <div className="rounded-3xl bg-gradient-to-br from-sky-700 to-emerald-600 p-5 text-center text-white">
        {r.token && <><div className="text-xs uppercase tracking-[0.3em] text-white/70">Token</div><div className="text-6xl font-black tracking-wider">{r.token}</div></>}
        {r.pending_sync && <div className="text-sm font-bold">Token is given when the sale syncs</div>}
        <div className="mt-2 text-2xl font-bold tabular-nums">{rs(r.grand_total)}</div>
        {r.change > 0 && <div className="mt-1 rounded-xl bg-white/20 py-1 text-lg font-bold">Change {rs(r.change)}</div>}
        <div className="mt-1 text-xs text-white/80">{r.name} · {r.mode}</div>
      </div>
      <div className="mt-3 max-h-48 overflow-y-auto text-sm">{r.items.map((i, k) => <div key={k} className="flex justify-between border-b border-border/50 py-1"><span>{i.item_name} <span className="text-xs text-muted-foreground">{i.qty} {i.uom}</span></span><span className="tabular-nums">{rs(i.amount)}</span></div>)}</div>
      <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={print}><Printer className="h-4 w-4" />Print</Button><Button variant="primary" className="flex-1" onClick={onClose} autoFocus>Next customer</Button></div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ invoice management, returns, offline queue
interface InvRow { name: string; customer_name: string; hv_patient?: string; grand_total: number; rounded_total: number; outstanding_amount: number; docstatus: number; is_return: number; is_pos: number;
  hv_token?: string; posting_date: string; posting_time: string; hv_prescription?: string; return_against?: string; modes: string; returned: number; status: string }
const SCOPES = [["shift", "My shift"], ["today", "Today"], ["drafts", "At handover"], ["credit", "On account"], ["returns", "Returns"]] as const;
function InvoicesDialog({ initialScope, returnMode, sync, offline, agent, onClose }: { initialScope: string; returnMode: boolean; sync: ReturnType<typeof usePharmacySync>; offline: boolean; agent: boolean; onClose: () => void }) {
  const [scope, setScope] = useState(initialScope);
  const [q, setQ] = useState("");
  const { data: rows, refetch } = useApi<InvRow[]>("pharmacy.invoices", { scope, q }, { enabled: !offline });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Dialog open onClose={onClose} size="xl" title={returnMode ? "Return medicines" : "Invoices"} description={returnMode ? "Find the invoice (number, token, customer, MR) and choose what comes back. The refund is paid from your shift." : undefined}>
      {open ? <InvoiceView name={open} agent={agent} returnMode={returnMode} onBack={() => { setOpen(null); void refetch(); }} /> : <div className="space-y-3">
        {sync.queue.length > 0 && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:bg-amber-500/10"><div className="mb-1 flex items-center gap-2 text-sm font-bold"><CloudOff className="h-4 w-4" />Offline sales waiting ({sync.queue.length})
          <Button size="xs" variant="menu" className="ms-auto" disabled={sync.syncing} onClick={() => void sync.sync()}><RefreshCw className={cn("h-3 w-3", sync.syncing && "animate-spin")} />Sync now</Button></div>
          {sync.queue.map((x) => <div key={x.client_ref} className="flex items-center gap-2 border-t border-amber-200 py-1.5 text-sm"><span className="flex-1">{x.customer} · {x.created.slice(11, 16)}{x.error && <span className="block text-xs text-rose-700">{x.error}</span>}</span>
            <b className="tabular-nums">{rs(x.total)}</b>{x.status === "failed" && <button className="text-xs font-semibold text-rose-700 underline" onClick={() => void sync.discard(x.client_ref)}>Discard</button>}</div>)}</div>}
        <div className="flex flex-wrap gap-2"><input className={inputCls + " min-w-60 flex-1"} placeholder="Invoice, token, customer or MR (any day)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">{SCOPES.map(([k, l]) => <button key={k} onClick={() => setScope(k)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", scope === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>)}</div></div>
        <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted/90 text-[11px] uppercase text-muted-foreground"><tr>
          <th className="px-3 py-2 text-start">Invoice</th><th className="px-2 py-2 text-start">Customer</th><th className="px-2 py-2 text-start">Paid by</th><th className="px-2 py-2 text-end">Amount</th><th className="px-2 py-2 text-start">Status</th></tr></thead>
          <tbody>{(rows ?? []).map((r) => (
            <tr key={r.name} onClick={() => setOpen(r.name)} className="cursor-pointer border-t border-border hover:bg-sky-50/60 dark:hover:bg-sky-500/5">
              <td className="px-3 py-2"><div className="font-mono text-xs font-semibold">{r.name}</div><div className="text-[11px] text-muted-foreground">{r.posting_time?.slice(0, 5)}{r.hv_token ? ` · ${r.hv_token}` : ""}{r.hv_prescription ? ` · ${r.hv_prescription}` : ""}</div></td>
              <td className="px-2 py-2">{r.customer_name}<div className="text-[11px] text-muted-foreground">{r.hv_patient}</div></td><td className="px-2 py-2 text-xs">{r.modes}</td>
              <td className={cn("px-2 py-2 text-end font-bold tabular-nums", r.is_return && "text-rose-600")}>{rs(r.rounded_total || r.grand_total)}{r.returned ? <div className="text-[10px] font-normal text-rose-600">returned {rs(r.returned)}</div> : null}</td>
              <td className="px-2 py-2"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.docstatus === 0 ? "bg-sky-100 text-sky-800" : r.is_return ? "bg-rose-100 text-rose-700" : r.outstanding_amount > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>
                {r.docstatus === 0 ? "At handover" : r.is_return ? "Return" : r.outstanding_amount > 0 ? "Unpaid" : "Paid"}</span></td></tr>))}</tbody></table>
          {rows && !rows.length && <div className="p-6 text-center text-sm text-muted-foreground">Nothing here.</div>}{offline && <div className="p-6 text-center text-sm text-muted-foreground">Invoices need the server.</div>}</div>
      </div>}
    </Dialog>
  );
}

function InvoiceView({ name, agent, returnMode, onBack }: { name: string; agent: boolean; returnMode: boolean; onBack: () => void }) {
  const { data: r, refetch } = useApi<Receipt>("pharmacy.receipt", { name });
  const [qty, setQty] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(returnMode);
  const sel = useMemo(() => Object.entries(qty).filter(([, v]) => Number(v) > 0), [qty]);
  if (!r) return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
  const canReturn = r.docstatus === 1 && !r.is_return;
  const doReturn = async () => {
    const items: Record<string, number> = {};
    for (const [i, v] of sel) { const it = r.items[Number(i)]; if (it.item_code) items[it.item_code] = (items[it.item_code] ?? 0) + Number(v); }
    setBusy(true);
    try { const ret = await call<string>("pharmacy.refund", { invoice: name, reason, items: sel.length ? items : undefined }); toast.success(`Return ${ret} — refunded from your shift`); setQty({}); setReason(""); void refetch(); }
    catch (e) { toast.error(humanizeError(e), { duration: 8000 }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><button onClick={onBack} className="text-sm font-semibold text-sky-700">← Back</button><b className="ms-2 font-mono">{r.name}</b>
        <span className="text-sm text-muted-foreground">{r.customer} · {r.posting_date} {r.posting_time} · {r.mode}{r.token ? ` · ${r.token}` : ""}</span>
        <div className="ms-auto flex gap-2"><Button size="sm" variant="neutral" onClick={() => void printDoc(receiptHtml(r), "receipt", { agent })}><Printer className="h-4 w-4" />Reprint</Button>
          {canReturn && !show && <Button size="sm" variant="danger" onClick={() => setShow(true)}><Undo2 className="h-4 w-4" />Return</Button>}</div></div>
      <div className="divide-y divide-border rounded-xl border border-border">{r.items.map((i, k) => (
        <div key={k} className="flex items-center gap-2 p-2.5 text-sm"><div className="min-w-0 flex-1"><b>{i.item_name}</b><div className="text-[11px] text-muted-foreground">{i.qty} {i.uom} · B {i.batch_no} · Exp {i.expiry?.slice(0, 7)}{i.substitute_for ? ` · for ${i.substitute_for}` : ""}</div></div>
          <span className="w-20 text-end tabular-nums">{rs(i.amount)}</span>
          {show && canReturn && <input className={inputCls.replace("w-full", "") + " h-8 w-20 text-end"} inputMode="decimal" placeholder={`≤ ${i.qty}`} value={qty[k] ?? ""}
            onChange={(e) => setQty((x) => ({ ...x, [k]: String(Math.min(Number(e.target.value.replace(/[^\d.]/g, "")) || 0, i.qty) || "") }))} />}</div>))}</div>
      {show && canReturn && <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:bg-rose-500/5">
        <input className={inputCls} placeholder="Reason for the return (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{sel.length ? `${sel.length} line(s) selected` : "No quantity entered = return the whole invoice"} · stock goes back to the same batch
          <Button size="sm" variant="danger" className="ms-auto" disabled={!reason.trim()} loading={busy} onClick={() => void doReturn()}><Undo2 className="h-4 w-4" />Return & refund</Button></div></div>}
    </div>
  );
}

interface ShiftSum { shift: string; counter: string; opened_at: string; modes: { mode_of_payment: string; opening: number; collections: number; pay_in: number; pay_out: number; cash_drop: number; expected: number }[];
  total_expected: number; invoice_count: number; refund_count: number; sales_total: number; refund_total: number; credit_sales: number; handover_pending: number }
function ShiftDialog({ onClose, offline }: { onClose: () => void; offline: boolean }) {
  const { data: s } = useApi<ShiftSum | null>("pharmacy.shift_summary", undefined, { enabled: !offline });
  return (
    <Dialog open onClose={onClose} title="Shift summary" size="lg">
      {offline ? <div className="py-6 text-center text-sm text-muted-foreground">Needs the server.</div> : s === undefined ? <div className="flex h-32 items-center justify-center"><Spinner /></div> : !s ? <div className="py-6 text-center">No open shift. <Link className="font-semibold text-sky-700 underline" to="/cash/shift">Open one</Link></div> : (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">{s.counter} · {s.shift} · since {s.opened_at.slice(11, 16)}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Sales", rs(s.sales_total), `${s.invoice_count} bills`], ["Refunds", rs(s.refund_total), `${s.refund_count} returns`], ["On account", rs(s.credit_sales), "credit"],
            ["At handover", String(s.handover_pending), "waiting"]].map(([k, v, h]) => <div key={k} className="rounded-xl border border-border p-3"><div className="text-[11px] uppercase text-muted-foreground">{k}</div><div className="text-lg font-black tabular-nums">{v}</div><div className="text-[11px] text-muted-foreground">{h}</div></div>)}</div>
          <table className="w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="text-start">Mode</th><th className="text-end">Opening</th><th className="text-end">Collected</th><th className="text-end">In / out / drop</th><th className="text-end">Expected</th></tr></thead>
            <tbody>{s.modes.map((m) => <tr key={m.mode_of_payment} className="border-t border-border"><td className="py-1.5 font-semibold">{m.mode_of_payment}</td><td className="text-end tabular-nums">{rs(m.opening)}</td><td className="text-end tabular-nums">{rs(m.collections)}</td>
              <td className="text-end text-xs tabular-nums text-muted-foreground">{m.pay_in || m.pay_out || m.cash_drop ? `+${rs(m.pay_in)} / −${rs(m.pay_out)} / −${rs(m.cash_drop)}` : "–"}</td><td className="text-end font-bold tabular-nums">{rs(m.expected)}</td></tr>)}
              <tr className="border-t-2 border-foreground/40"><td className="py-1.5 font-bold">Total</td><td colSpan={3} /><td className="text-end text-lg font-black tabular-nums">{rs(s.total_expected)}</td></tr></tbody></table>
          <div className="flex gap-2"><Link to="/cash/shift" className="flex-1"><Button variant="neutral" className="w-full">Cash in / out</Button></Link><Link to="/cash/close" className="flex-1"><Button variant="danger" className="w-full"><Lock className="h-4 w-4" />Close shift</Button></Link></div>
        </div>)}
    </Dialog>
  );
}
