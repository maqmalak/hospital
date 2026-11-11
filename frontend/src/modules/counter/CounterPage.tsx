import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle, Banknote, ClipboardPlus, BedDouble, CheckCircle2, CloudOff, CreditCard, Delete, FlaskConical, Globe, HandCoins, History, Keyboard, Landmark, Lock,
  MonitorSmartphone, PauseCircle, Percent, Plus, Printer, ReceiptText, RefreshCw, Search, Smartphone, Stethoscope, Trash2, Undo2, User, UserPlus, Wallet, Wifi, X,
} from "lucide-react";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { printDoc } from "@/lib/print";
import { inputCls, PatientPicker, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { type Bundle, type Doctor, isNetworkError, kvGet, kvSet, type LabT, loadBundle, publishDisplay, refreshBundle, type Service, useCounterSync, uuid } from "./offline";
import { type Receipt, receiptHtml } from "./receipt";

type Kind = "Consultation" | "Service" | "Lab" | "Lab Order" | "IPD Advance" | "IPD Settlement" | "Online Fee" | "Dues";
interface Line { key: string; kind: Kind; label: string; doctor?: string; item_code?: string; template?: string; target?: string; qty: number; rate: number; discount: number;
  amount: number; priority?: string; free?: number; payer_share?: number }
interface Ctx { branch: string; shift: { name: string; opened_at: string; counter: string; expected: number; stale: boolean; closing: boolean } | null; counter?: string;
  modes?: string[]; doctors: Doctor[]; services: Service[]; labs: LabT[]; counters?: { name: string; current_user?: string }[] }
interface Panel { patient: { name: string; patient_name: string; gender: string; age?: number; phone?: string; category?: string; temporary_record?: number };
  admission?: { name: string; ward: string; bed_no?: string; running: number; advances: number; balance: number; final_invoice?: string; outstanding: number } | null;
  online: { name: string; fee: number; fee_status: string; payment_method: string; payment_reference?: string }[];
  dues: { name: string; posting_date: string; hv_billing_type?: string; grand_total: number; outstanding_amount: number }[]; lab_orders?: LabOrder[] }
/** A lab order made in the lab, waiting for payment here (D-60). */
interface LabOrder { name: string; patient: string; patient_name: string; gross_total: number; patient_share: number; priority: string; creation: string; tests: string[]; ordered_by?: string }
type Limits = Record<string, { percent: number; amount: number | null }>;
const LIMIT_BT: Partial<Record<Kind, string>> = { Consultation: "OPD Slip", Lab: "Lab", "Lab Order": "Lab", Service: "General" };
interface Tender { mode_of_payment: string; amount: number; reference_no?: string }
interface Held { id: string; at: string; patient?: PatientHit | null; newPatient?: NewP | null; lines: Line[] }
interface NewP { patient_name: string; gender: string; age: string; phone: string }

const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
const KIND_STYLE: Record<Kind, { icon: typeof Stethoscope; tone: string }> = {
  Consultation: { icon: Stethoscope, tone: "from-teal-500 to-emerald-600" }, Service: { icon: HandCoins, tone: "from-sky-500 to-blue-600" },
  Lab: { icon: FlaskConical, tone: "from-violet-500 to-indigo-600" }, "Lab Order": { icon: FlaskConical, tone: "from-purple-600 to-fuchsia-600" }, "IPD Advance": { icon: BedDouble, tone: "from-amber-500 to-orange-600" },
  "IPD Settlement": { icon: BedDouble, tone: "from-orange-500 to-red-600" }, "Online Fee": { icon: Globe, tone: "from-fuchsia-500 to-purple-600" },
  Dues: { icon: ReceiptText, tone: "from-rose-500 to-pink-600" },
};
const MODE_ICON: Record<string, typeof Banknote> = { Cash: Banknote, Card: CreditCard, "Bank Transfer": Landmark, JazzCash: Smartphone, Easypaisa: Wallet };
const PRIORITIES = ["Normal", "Elderly", "Disabled", "Urgent"];
const PRIO_TONE: Record<string, string> = { Normal: "border-slate-300", Elderly: "border-amber-500 bg-amber-500 text-white", Disabled: "border-sky-600 bg-sky-600 text-white", Urgent: "border-rose-600 bg-rose-600 text-white" };
const lineTotal = (l: Line) => Math.max(l.rate * l.qty - l.discount, 0);

export default function CounterPage() {
  const { branch, boot } = useAuth();
  const live = useApi<Ctx>("counter.context", { branch }, { retry: false, refetchInterval: 60_000 });
  const [cached, setCached] = useState<Ctx>();
  const [bundle, setBundle] = useState<Bundle>();
  const sync = useCounterSync(() => void live.refetch());
  useEffect(() => { void kvGet<Ctx>(`ctx:${branch}`).then(setCached); void loadBundle(branch).then(setBundle); }, [branch]);
  useEffect(() => { if (live.data) void kvSet(`ctx:${branch}`, live.data); }, [live.data, branch]);
  useEffect(() => { if (live.error && isNetworkError(live.error)) sync.markOffline(); }, [live.error]); // eslint-disable-line react-hooks/exhaustive-deps
  const offline = !sync.online;
  const ctx = live.data ?? (offline ? cached : undefined);
  const pullBundle = useCallback(async () => { try { setBundle(await refreshBundle(branch)); } catch (e) { if (isNetworkError(e)) sync.markOffline(); } }, [branch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (live.data?.shift && sync.online) void pullBundle(); }, [live.data?.shift?.name, sync.online]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<"doctors" | "services" | "lab" | "bills" | "fromlab">("doctors");
  const fromLab = useApi<LabOrder[]>("counter.pending_lab", { branch }, { enabled: sync.online, refetchInterval: 15_000 });
  const limits = useApi<Limits>("counter.discount_limits", undefined, { enabled: sync.online, staleTime: 300_000 });
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [newP, setNewP] = useState<NewP | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [priced, setPriced] = useState<{ total: number; payer: number; amounts: Record<string, number>; free: Record<string, number> } | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [dlg, setDlg] = useState<"pay" | "held" | "receipts" | "keys" | "done" | null>(null);
  const [done, setDone] = useState<Receipt | null>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void kvGet<Held[]>("held").then((h) => setHeld(h ?? [])); }, []);

  const doctors = (offline ? bundle?.doctors : ctx?.doctors) ?? [];
  const services = (offline ? bundle?.services : ctx?.services) ?? [];
  const labs = (offline ? bundle?.labs : ctx?.labs) ?? [];
  const modes = (offline ? bundle?.modes : ctx?.modes) ?? ["Cash"];
  const term = q.trim().toLowerCase();

  // patient panel (admission, online fees, dues) — online only
  useEffect(() => {
    setPanel(null);
    if (!patient || offline) return;
    void call<Panel>("counter.patient", { name: patient.name }).then((p) => { setPanel(p); if (p.lab_orders?.length) toast(`${p.lab_orders.length} lab order(s) waiting for payment — see Patient bills`, { icon: "🧪" }); }).catch(() => undefined);
  }, [patient?.name, offline]); // eslint-disable-line react-hooks/exhaustive-deps

  // server pricing (free follow-up, panel share) whenever the cart or patient changes
  useEffect(() => {
    if (offline || !lines.length) { setPriced(null); return; }
    const t = setTimeout(() => {
      void call<{ lines: (Line & { amount: number; free?: number })[]; total: number; payer_share: number }>("counter.price", { data: { patient: patient?.name, branch, lines: lines.map(strip) } })
        .then((r) => setPriced({ total: r.total, payer: r.payer_share, amounts: Object.fromEntries(r.lines.map((x, i) => [lines[i].key, x.amount])), free: Object.fromEntries(r.lines.map((x, i) => [lines[i].key, x.free ?? 0])) }))
        .catch(() => setPriced(null));
    }, 250);
    return () => clearTimeout(t);
  }, [lines, patient?.name, offline, branch]);
  const amountOf = (l: Line) => priced?.amounts[l.key] ?? lineTotal(l);
  const total = priced?.total ?? lines.reduce((s, l) => s + lineTotal(l), 0);
  const discount = lines.reduce((s, l) => s + l.discount, 0);

  // customer display
  useEffect(() => { publishDisplay(lines.length ? { kind: "cart", patient: patient?.patient_name ?? newP?.patient_name, lines: lines.map((l) => ({ label: l.label, amount: amountOf(l) })), total } : { kind: "idle" }); },
    [lines, total, patient?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (l: Omit<Line, "key" | "amount" | "qty" | "discount"> & { qty?: number; discount?: number }) => {
    if (l.kind === "Consultation" && lines.some((x) => x.kind === "Consultation" && x.doctor === l.doctor)) { toast("Already in the cart", { icon: "ℹ️" }); return; }
    if (l.kind === "Lab" && lines.some((x) => x.kind === "Lab" && x.template === l.template)) { toast("Already in the cart", { icon: "ℹ️" }); return; }
    if (l.kind === "Lab Order" && lines.some((x) => x.kind === "Lab Order" && x.target === l.target)) { toast("Already in the cart", { icon: "ℹ️" }); return; }
    if (l.kind === "Service") { const ex = lines.find((x) => x.kind === "Service" && x.item_code === l.item_code); if (ex) { upd(ex.key, { qty: ex.qty + 1 }); return; } }
    setLines((ls) => [...ls, { qty: 1, discount: 0, ...l, key: uuid(), amount: 0 } as Line]);
  };
  const upd = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const clear = () => { setLines([]); setPatient(null); setNewP(null); setPriced(null); };
  const hold = async () => {
    if (!lines.length) return;
    const h = [{ id: uuid(), at: new Date().toISOString(), patient, newPatient: newP, lines }, ...held].slice(0, 30);
    setHeld(h); await kvSet("held", h); clear(); toast.success("Sale held — resume it from Held (F8)");
  };
  const resume = async (h: Held) => {
    if (lines.length) await hold();
    setPatient(h.patient ?? null); setNewP(h.newPatient ?? null); setLines(h.lines);
    const left = held.filter((x) => x.id !== h.id); setHeld(left); await kvSet("held", left); setDlg(null);
  };

  // keyboard shortcuts (Restaurant OS style)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); (document.querySelector("[data-patient-search] input") as HTMLInputElement | null)?.focus(); }
      else if (e.key === "F3") { e.preventDefault(); setTab("doctors"); searchRef.current?.focus(); }
      else if (e.key === "F4") { e.preventDefault(); if (lines.length && (patient || newP)) setDlg("pay"); }
      else if (e.key === "F8") { e.preventDefault(); if (lines.length) void hold(); else setDlg("held"); }
      else if (e.key === "F9") { e.preventDefault(); setDlg("receipts"); }
      else if (e.key === "F12") { e.preventDefault(); window.dispatchEvent(new Event("hv-lock")); }
      else if (e.key === "Escape" && dlg) setDlg(null);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  if (!ctx) return <div className="flex h-[70vh] items-center justify-center">{live.isLoading ? <Spinner size={28} /> : <div className="text-center"><CloudOff className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />Server unreachable and nothing cached yet.</div>}</div>;
  if (!ctx.shift) return <NoShift ctx={ctx} />;

  const shopDoctors = doctors.filter((d) => !term || `${d.doctor_name} ${d.specialization ?? ""}`.toLowerCase().includes(term));
  const shopServices = services.filter((s) => !term || `${s.item_name} ${s.item_code}`.toLowerCase().includes(term));
  const depts = [...new Set(labs.map((l) => l.department).filter(Boolean))] as string[];
  const shopLabs = labs.filter((l) => (!dept || l.department === dept) && (!term || `${l.name} ${l.test_code}`.toLowerCase().includes(term)));
  const ready = lines.length > 0 && (patient || (newP?.patient_name.trim() && newP.gender));
  return (
    <div className="-mt-4 flex h-[calc(100vh-72px)] flex-col overflow-hidden rounded-2xl bg-muted/40 sm:-mt-6">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 bg-[#06302c] px-4 py-2 text-white">
        <span className="flex items-center gap-2 text-lg font-extrabold"><ReceiptText className="h-5 w-5" />Reception counter</span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{ctx.shift.counter} · shift since {ctx.shift.opened_at.slice(11, 16)}{ctx.shift.stale ? " · OLD SHIFT" : ""}</span>
        <Clock12 />
        <button onClick={() => (offline ? void sync.sync() : setDlg("receipts"))} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold", offline ? "bg-amber-400 text-amber-950" : sync.queue.length ? "bg-sky-400 text-sky-950" : "bg-emerald-500/20 text-emerald-200")}>
          {offline ? <CloudOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}{offline ? "Offline" : "Online"}{sync.queue.length ? ` · ${sync.queue.length} to sync` : ""}{sync.syncing && <RefreshCw className="h-3 w-3 animate-spin" />}</button>
        <div className="ms-auto flex flex-wrap gap-1.5">
          <TopBtn icon={PauseCircle} label={`Held${held.length ? ` (${held.length})` : ""}`} onClick={() => setDlg("held")} k="F8" />
          <TopBtn icon={History} label="Receipts" onClick={() => setDlg("receipts")} k="F9" />
          <TopBtn icon={MonitorSmartphone} label="Display" onClick={() => window.open(`${import.meta.env.BASE_URL}counter/display`, "hv-counter-display", "width=900,height=600")} />
          <TopBtn icon={Keyboard} label="Keys" onClick={() => setDlg("keys")} />
          <TopBtn icon={Lock} label="Lock" onClick={() => window.dispatchEvent(new Event("hv-lock"))} k="F12" />
          <Link to="/cash/close"><TopBtn icon={Wallet} label="Close shift" onClick={() => undefined} /></Link>
        </div>
      </div>
      {ctx.shift.stale && <div className="bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white"><AlertTriangle className="me-1 inline h-4 w-4" />This shift is from {ctx.shift.opened_at.slice(0, 10)}. Close it and open today's shift before billing.</div>}

      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[1fr_440px]">
        {/* catalogue */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="relative min-w-48 flex-1"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input ref={searchRef} className={inputCls + " ps-9"} placeholder="Search doctor, service or test (F3)" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="flex gap-1 rounded-xl bg-muted p-1">{([["doctors", "Doctors", Stethoscope], ["services", "Services", HandCoins], ["lab", "Lab tests", FlaskConical], ["fromlab", "From the lab", ClipboardPlus], ["bills", "Patient bills", BedDouble]] as const).map(([k, l, I]) => {
              const billsN = panel ? panel.dues.length + panel.online.length + (panel.admission ? 1 : 0) + (panel.lab_orders?.length ?? 0) : 0;
              const n = k === "bills" ? billsN : k === "fromlab" ? (fromLab.data?.length ?? 0) : 0;
              return (
              <button key={k} onClick={() => setTab(k)} disabled={(k === "bills" && (!patient || offline)) || (k === "fromlab" && offline)} className={cn("flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40", tab === k ? "bg-card shadow" : "text-muted-foreground")}>
                <I className="h-4 w-4" />{l}{n ? <span className={cn("rounded-full px-1.5 text-[10px] text-white", k === "fromlab" ? "bg-fuchsia-600" : "bg-rose-600")}>{n}</span> : null}</button>); })}</div>
          </div>
          {tab === "lab" && <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">{["", ...depts].map((d) => <button key={d} onClick={() => setDept(d)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", dept === d ? "border-violet-600 bg-violet-600 text-white" : "border-border")}>{d || "All"}</button>)}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === "doctors" && <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{shopDoctors.map((d) => (
              <button key={d.name} onClick={() => add({ kind: "Consultation", label: `Consultation · ${d.doctor_name}`, doctor: d.name, rate: d.fee, priority: "Normal" })}
                className="group overflow-hidden rounded-2xl border border-border bg-card text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <div className="h-2" style={{ background: d.color || "#0d9488" }} />
                <div className="p-3"><div className="truncate font-bold">{d.doctor_name}</div><div className="truncate text-xs text-muted-foreground">{d.specialization}{d.consultation_room ? ` · ${d.consultation_room}` : ""}</div>
                  <div className="mt-2 flex items-end justify-between"><span className="text-lg font-black tabular-nums">{rs(d.fee)}</span>{!offline && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{d.waiting ?? 0} waiting</span>}</div></div>
              </button>))}</div>}
            {tab === "services" && <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">{shopServices.map((s) => (
              <button key={s.item_code} onClick={() => add({ kind: "Service", label: s.item_name, item_code: s.item_code, rate: s.rate })} className="rounded-xl border border-border bg-card p-3 text-start shadow-sm hover:border-sky-400 hover:shadow">
                <div className="line-clamp-2 text-sm font-semibold">{s.item_name}</div><div className="mt-1 font-black tabular-nums text-sky-700 dark:text-sky-300">{rs(s.rate)}</div></button>))}</div>}
            {tab === "lab" && <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">{shopLabs.map((l) => { const on = lines.some((x) => x.template === l.name); return (
              <button key={l.name} onClick={() => add({ kind: "Lab", label: l.name, template: l.name, rate: l.price })} className={cn("rounded-xl border p-3 text-start shadow-sm", on ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10" : "border-border bg-card hover:border-violet-400")}>
                <div className="line-clamp-2 text-sm font-semibold">{l.name}</div><div className="text-[11px] text-muted-foreground">{l.test_code} · {l.sample_type}{l.tat_hours ? ` · ${l.tat_hours}h` : ""}</div>
                <div className="mt-1 font-black tabular-nums text-violet-700 dark:text-violet-300">{rs(l.price)}</div></button>); })}</div>}
            {tab === "bills" && panel && <Bills panel={panel} onAdd={add} inCart={lines} />}
            {tab === "fromlab" && <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Orders the lab made for walk-in patients. Collect here, give the receipt, then the lab takes the sample.</p>
              {(fromLab.data ?? []).map((o) => { const inCart = lines.some((x) => x.kind === "Lab Order" && x.target === o.name); return (
                <button key={o.name} disabled={inCart} onClick={() => { if (patient?.name !== o.patient) { setPatient({ name: o.patient, patient_name: o.patient_name, gender: "" } as PatientHit); setNewP(null); setLines((ls) => ls.filter((x) => !x.target || x.kind !== "Lab Order")); }
                  add({ kind: "Lab Order", label: `Lab order ${o.name} · ${o.tests.join(", ")}`, target: o.name, rate: o.gross_total }); }}
                  className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-start shadow-sm", inCart ? "border-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-500/10" : "border-border bg-card hover:border-fuchsia-400")}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white"><FlaskConical className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><b className="truncate">{o.patient_name}</b>{o.priority !== "Normal" && <span className="rounded-full bg-rose-600 px-2 text-[10px] font-bold text-white">{o.priority}</span>}</span>
                    <span className="block truncate text-xs text-muted-foreground">{o.name} · {o.patient} · {o.tests.join(", ")}</span><span className="block text-[11px] text-muted-foreground">by {o.ordered_by} · {o.creation.slice(11, 16)}</span></span>
                  <span className="text-end font-black tabular-nums">{rs(o.gross_total)}<span className="block text-[11px] font-normal text-muted-foreground">{inCart ? "in cart" : "tap to collect"}</span></span></button>); })}
              {fromLab.data && !fromLab.data.length && <div className="py-10 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />No lab orders waiting for payment.</div>}</div>}
          </div>
        </section>

        {/* cart */}
        <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-3" data-patient-search>
            {offline ? <OfflinePatient bundle={bundle} value={patient} onPick={(p) => { setPatient(p); setNewP(null); }} onClear={() => setPatient(null)} />
              : <PatientPicker value={patient} onPick={(p) => { setPatient(p); setNewP(null); }} onClear={() => setPatient(null)} placeholder="Patient: MR, phone, name (F2)" />}
            {!patient && (newP ? <div className="mt-2 grid grid-cols-6 gap-1.5">
              <input className={inputCls + " col-span-6 h-9"} placeholder="New patient name" value={newP.patient_name} onChange={(e) => setNewP({ ...newP, patient_name: e.target.value })} />
              <input className={inputCls + " col-span-3 h-9"} placeholder="Phone" value={newP.phone} onChange={(e) => setNewP({ ...newP, phone: e.target.value })} />
              <input className={inputCls + " col-span-1 h-9"} placeholder="Age" value={newP.age} onChange={(e) => setNewP({ ...newP, age: e.target.value.replace(/\D/g, "") })} />
              <div className="col-span-2 flex gap-1">{["Male", "Female"].map((g) => <button key={g} onClick={() => setNewP({ ...newP, gender: g })} className={cn("h-9 flex-1 rounded-lg border text-xs font-bold", newP.gender === g ? "border-teal-600 bg-teal-600 text-white" : "border-border")}>{g[0]}</button>)}</div>
            </div> : <button onClick={() => setNewP({ patient_name: "", gender: "", age: "", phone: "" })} className="mt-2 flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-300"><UserPlus className="h-3.5 w-3.5" />New patient</button>)}
            {patient && panel?.patient.category && panel.patient.category !== "Normal" && <div className="mt-1 text-xs font-semibold text-violet-700 dark:text-violet-300">{panel.patient.category} patient — the payer's share is billed to them</div>}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {!lines.length && <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground"><ReceiptText className="mb-2 h-10 w-10 opacity-40" />Pick a doctor, service or test.<br />Admission advances, online fees and dues are under Patient bills.</div>}
            {lines.map((l) => <CartLine key={l.key} l={l} amount={amountOf(l)} free={priced?.free[l.key]} offline={offline} limit={LIMIT_BT[l.kind] ? limits.data?.[LIMIT_BT[l.kind]!] : undefined} onChange={(p) => upd(l.key, p)} onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />)}
          </div>
          <div className="space-y-1 border-t border-border p-3">
            {!offline && lines.some((l) => LIMIT_BT[l.kind]) && <div className="flex items-center gap-1 pb-1 text-xs"><Percent className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">Discount all</span>
              {[5, 10, 15, 20].map((p) => <button key={p} onClick={() => setLines((ls) => ls.map((x) => LIMIT_BT[x.kind] ? { ...x, discount: Math.round(x.rate * x.qty * p / 100) } : x))} className="rounded-md border border-border px-2 py-0.5 font-semibold hover:bg-muted">{p}%</button>)}
              {discount > 0 && <button onClick={() => setLines((ls) => ls.map((x) => ({ ...x, discount: 0 })))} className="ms-auto text-muted-foreground underline">clear</button>}</div>}
            {discount > 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Discount</span><span className="tabular-nums">−{rs(discount)}</span></div>}
            {!!priced?.payer && <div className="flex justify-between text-sm text-violet-700 dark:text-violet-300"><span>Panel / insurer pays</span><span className="tabular-nums">{rs(priced.payer)}</span></div>}
            <div className="flex items-end justify-between"><span className="text-sm font-semibold text-muted-foreground">Total</span><span className="text-3xl font-black tabular-nums">{rs(total)}</span></div>
            <div className="grid grid-cols-[auto_auto_1fr] gap-2 pt-1">
              <Button variant="neutral" onClick={() => void hold()} disabled={!lines.length}><PauseCircle className="h-4 w-4" />Hold</Button>
              <Button variant="neutral" onClick={clear} disabled={!lines.length && !patient}><Trash2 className="h-4 w-4" /></Button>
              <Button variant="submit" size="lg" disabled={!ready || ctx.shift.stale} onClick={() => setDlg("pay")}><Banknote className="h-5 w-5" />Pay {rs(total)} <span className="text-xs opacity-70">F4</span></Button>
            </div>
          </div>
        </section>
      </div>

      {dlg === "pay" && <PayDialog total={total} modes={modes} offline={offline} lines={lines} patient={patient} newP={newP} branch={branch} counter={ctx.shift.counter}
        cashier={boot?.full_name} clinic={bundle?.clinic} onClose={() => setDlg(null)} enqueue={sync.enqueue}
        onDone={(r) => { setDone(r); setDlg("done"); clear(); void live.refetch(); publishDisplay({ kind: "done", patient: r.patient_name, receipt: r.name, total: r.patient_total, change: r.change_amount, tokens: r.tokens.map((t) => ({ ...t, token: Number(t.token) || 0 })) }); }} />}
      {dlg === "done" && done && <DoneDialog r={done} onClose={() => { setDlg(null); publishDisplay({ kind: "idle" }); }} />}
      {dlg === "held" && <Dialog open onClose={() => setDlg(null)} title="Held sales" size="md"><div className="space-y-2">{held.map((h) => (
        <div key={h.id} className="flex items-center gap-2 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><div className="font-semibold">{h.patient?.patient_name || h.newPatient?.patient_name || "No patient yet"}</div>
          <div className="truncate text-xs text-muted-foreground">{new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {h.lines.map((l) => l.label).join(", ")}</div></div>
          <span className="font-bold tabular-nums">{rs(h.lines.reduce((s, l) => s + lineTotal(l), 0))}</span>
          <Button size="sm" variant="save" onClick={() => void resume(h)}>Resume</Button>
          <button className="text-rose-600" onClick={async () => { const left = held.filter((x) => x.id !== h.id); setHeld(left); await kvSet("held", left); }}><X className="h-4 w-4" /></button></div>))}
        {!held.length && <div className="py-6 text-center text-sm text-muted-foreground">Nothing on hold.</div>}</div></Dialog>}
      {dlg === "receipts" && <ReceiptsDialog sync={sync} offline={offline} onClose={() => setDlg(null)} />}
      {dlg === "keys" && <Dialog open onClose={() => setDlg(null)} title="Keyboard shortcuts" size="sm"><div className="grid grid-cols-[80px_1fr] gap-2 text-sm">
        {[["F2", "Find patient"], ["F3", "Search doctors / services / tests"], ["F4", "Pay"], ["F8", "Hold sale / open held"], ["F9", "Receipts and refunds"], ["F12", "Lock the counter"],
          ["Enter", "Confirm payment / next sale"], ["Esc", "Close a window"]].flatMap(([k, v]) => [<kbd key={k} className="rounded-md border border-border bg-muted px-2 py-0.5 text-center font-mono font-bold">{k}</kbd>, <span key={`${k}-t`}>{v}</span>])}</div></Dialog>}
    </div>
  );
}

const strip = (l: Line) => ({ kind: l.kind, label: l.label, doctor: l.doctor, item_code: l.item_code, template: l.template, target: l.target, qty: l.qty, discount: l.discount,
  amount: l.kind === "IPD Advance" || l.kind === "IPD Settlement" || l.kind === "Dues" ? l.rate : undefined, priority: l.priority !== "Normal" ? l.priority : undefined });

function TopBtn({ icon: I, label, onClick, k }: { icon: typeof Lock; label: string; onClick: () => void; k?: string }) {
  return <button onClick={onClick} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/20"><I className="h-4 w-4" />{label}{k && <kbd className="rounded bg-white/15 px-1 font-mono text-[10px]">{k}</kbd>}</button>;
}

function Clock12() {
  const [n, setN] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setN(new Date()), 15_000); return () => clearInterval(t); }, []);
  return <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs">{n.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>;
}

function NoShift({ ctx }: { ctx: Ctx }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-lg">
      <Wallet className="mx-auto mb-3 h-12 w-12 text-teal-600" /><h2 className="text-xl font-bold">Open your cashier shift</h2>
      <p className="mt-1 text-sm text-muted-foreground">All money is collected inside a shift. Open one at a reception or IPD desk counter, then come back.</p>
      <Link to="/cash/shift"><Button variant="submit" size="lg" className="mt-4 w-full">Open shift</Button></Link>
      {ctx.counters && <div className="mt-3 text-xs text-muted-foreground">Free counters: {ctx.counters.filter((c) => !c.current_user).map((c) => c.name).join(", ") || "none"}</div>}
    </div>
  );
}

function CartLine({ l, amount, free, offline, limit, onChange, onRemove }: { l: Line; amount: number; free?: number; offline: boolean; limit?: { percent: number; amount: number | null };
  onChange: (p: Partial<Line>) => void; onRemove: () => void }) {
  const st = KIND_STYLE[l.kind];
  const [open, setOpen] = useState(l.kind === "IPD Advance");
  const [unit, setUnit] = useState<"Rs" | "%">("Rs");
  const isCharge = ["Consultation", "Service", "Lab", "Lab Order"].includes(l.kind);
  const gross = l.rate * l.qty;
  const pct = gross ? Math.round((l.discount / gross) * 1000) / 10 : 0;
  const over = !!limit && limit.percent < 100 && (pct > limit.percent || (limit.amount != null && limit.amount > 0 && l.discount > limit.amount));
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
      <div className="flex items-start gap-2">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white", st.tone)}><st.icon className="h-4 w-4" /></span>
        <button className="min-w-0 flex-1 text-start" onClick={() => setOpen(!open)}><div className="truncate text-sm font-semibold">{l.label}</div>
          <div className="text-[11px] text-muted-foreground">{l.kind}{l.qty !== 1 ? ` · ${l.qty} × ${rs(l.rate)}` : ""}{l.discount ? ` · −${rs(l.discount)}` : ""}{free ? " · free follow-up" : ""}{l.priority && l.priority !== "Normal" ? ` · ${l.priority}` : ""}</div></button>
        {l.kind === "Service" && <div className="flex items-center rounded-lg border border-border"><button className="px-2 py-1 font-bold" onClick={() => (l.qty > 1 ? onChange({ qty: l.qty - 1 }) : onRemove())}>−</button>
          <span className="w-6 text-center text-sm font-bold tabular-nums">{l.qty}</span><button className="px-2 py-1 font-bold" onClick={() => onChange({ qty: l.qty + 1 })}>+</button></div>}
        <div className="w-20 text-end font-black tabular-nums">{rs(amount)}</div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-rose-600"><X className="h-4 w-4" /></button>
      </div>
      {l.kind === "Consultation" && <div className="mt-2 flex gap-1">{PRIORITIES.map((p) => <button key={p} onClick={() => onChange({ priority: p })} className={cn("flex-1 rounded-md border py-1 text-[11px] font-bold",
        (l.priority ?? "Normal") === p ? PRIO_TONE[p] || "border-teal-600 bg-teal-600 text-white" : "border-border text-muted-foreground")}>{p}</button>)}</div>}
      {open && isCharge && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-2 text-xs"><Percent className="h-3.5 w-3.5" />Discount
        <div className="flex rounded-md bg-card p-0.5">{(["Rs", "%"] as const).map((u) => <button key={u} onClick={() => setUnit(u)} className={cn("rounded px-2 py-0.5 font-bold", unit === u ? "bg-teal-600 text-white" : "text-muted-foreground")}>{u}</button>)}</div>
        <input disabled={offline} className={inputCls.replace("w-full", "") + " h-8 w-20 text-end"} inputMode="decimal" value={unit === "Rs" ? (l.discount || "") : (pct || "")}
          onChange={(e) => { const v = Number(e.target.value.replace(/[^\d.]/g, "")) || 0; onChange({ discount: Math.min(unit === "Rs" ? Math.round(v) : Math.round(gross * Math.min(v, 100) / 100), gross) }); }} />
        {l.discount > 0 && <span className="font-semibold tabular-nums">{unit === "Rs" ? `${pct}%` : rs(l.discount)}</span>}
        {offline ? <span className="text-amber-700">needs the server</span> : <span className={cn(over ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
          {limit ? `your limit ${limit.percent >= 100 ? "none" : `${limit.percent}%${limit.amount ? ` / ${rs(limit.amount)}` : ""}`}${over ? " — needs supervisor approval" : ""}` : "above your limit it goes to the supervisor"}</span>}</div>}
      {open && !isCharge && (l.kind === "IPD Advance" || l.kind === "Dues" || l.kind === "IPD Settlement") && <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/60 p-2 text-xs">Amount Rs
        <input className={inputCls.replace("w-full", "") + " h-8 w-28 text-end"} inputMode="numeric" value={l.rate || ""} onChange={(e) => onChange({ rate: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></div>}
    </div>
  );
}

function Bills({ panel, onAdd, inCart }: { panel: Panel; onAdd: (l: Omit<Line, "key" | "amount" | "qty" | "discount">) => void; inCart: Line[] }) {
  const a = panel.admission;
  const has = (target: string, kind: Kind) => inCart.some((l) => l.target === target && l.kind === kind);
  return (
    <div className="space-y-3">
      {a && <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-3 dark:bg-amber-500/5">
        <div className="flex items-center gap-2 font-bold"><BedDouble className="h-5 w-5 text-amber-600" />Admitted · {a.ward} · bed {a.bed_no} <span className="text-xs font-normal text-muted-foreground">{a.name}</span></div>
        <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-card p-2">Running<div className="text-base font-black">{rs(a.running)}</div></div>
          <div className="rounded-lg bg-card p-2">Advances<div className="text-base font-black">{rs(a.advances)}</div></div><div className="rounded-lg bg-card p-2">{a.final_invoice ? "Due" : "Balance"}<div className="text-base font-black">{rs(a.final_invoice ? a.outstanding : a.balance)}</div></div></div>
        <div className="mt-2 flex gap-2">{!a.final_invoice ? <Button size="sm" variant="save" disabled={has(a.name, "IPD Advance")} onClick={() => onAdd({ kind: "IPD Advance", label: `IPD advance · ${a.name}`, target: a.name, rate: Math.max(Math.round(a.balance / 1000) * 1000, 5000) })} title="Change the amount on the cart line"><Plus className="h-4 w-4" />Advance</Button>
          : <Button size="sm" variant="submit" disabled={!a.outstanding || has(a.name, "IPD Settlement")} onClick={() => onAdd({ kind: "IPD Settlement", label: `IPD final bill · ${a.name}`, target: a.name, rate: a.outstanding })}><Plus className="h-4 w-4" />Settle {rs(a.outstanding)}</Button>}</div></div>}
      {(panel.lab_orders ?? []).map((o) => <div key={o.name} className="flex items-center gap-2 rounded-2xl border border-purple-300 bg-purple-50/50 p-3 dark:bg-purple-500/5"><FlaskConical className="h-5 w-5 text-purple-600" />
        <div className="min-w-0 flex-1"><div className="font-bold">Lab order · {o.name}</div><div className="truncate text-xs text-muted-foreground">{o.tests.join(", ")} · by {o.ordered_by}</div></div>
        <Button size="sm" variant="save" disabled={has(o.name, "Lab Order")} onClick={() => onAdd({ kind: "Lab Order", label: `Lab order ${o.name} · ${o.tests.join(", ")}`, target: o.name, rate: o.gross_total })}>{rs(o.gross_total)}</Button></div>)}
      {panel.online.map((o) => <div key={o.name} className="flex items-center gap-2 rounded-2xl border border-fuchsia-300 bg-fuchsia-50/50 p-3 dark:bg-fuchsia-500/5"><Globe className="h-5 w-5 text-fuchsia-600" />
        <div className="min-w-0 flex-1"><div className="font-bold">Online visit fee · {o.name}</div><div className="text-xs text-muted-foreground">{o.fee_status} · {o.payment_method}{o.payment_reference ? ` · ${o.payment_reference}` : ""}</div></div>
        <Button size="sm" variant="save" disabled={has(o.name, "Online Fee")} onClick={() => onAdd({ kind: "Online Fee", label: `Online visit fee · ${o.name}`, target: o.name, rate: o.fee })}>{rs(o.fee)}</Button></div>)}
      {panel.dues.map((d) => <div key={d.name} className="flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50/50 p-3 dark:bg-rose-500/5"><ReceiptText className="h-5 w-5 text-rose-600" />
        <div className="min-w-0 flex-1"><div className="font-bold">{d.hv_billing_type || "Invoice"} · {d.name}</div><div className="text-xs text-muted-foreground">{d.posting_date} · of {rs(d.grand_total)}</div></div>
        <Button size="sm" variant="save" disabled={has(d.name, "Dues")} onClick={() => onAdd({ kind: "Dues", label: `Dues · ${d.name}`, target: d.name, rate: d.outstanding_amount })}>{rs(d.outstanding_amount)}</Button></div>)}
      {!a && !panel.online.length && !panel.dues.length && !(panel.lab_orders ?? []).length && <div className="py-10 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />Nothing outstanding for this patient.</div>}
    </div>
  );
}

function OfflinePatient({ bundle, value, onPick, onClear }: { bundle?: Bundle; value: PatientHit | null; onPick: (p: PatientHit) => void; onClear: () => void }) {
  const [q, setQ] = useState("");
  if (value) return <div className="flex items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 p-2 dark:bg-teal-500/10"><User className="h-4 w-4 text-teal-600" /><b className="flex-1">{value.patient_name}</b><span className="text-xs">{value.name}</span><button onClick={onClear}><X className="h-4 w-4" /></button></div>;
  const t = q.trim().toLowerCase();
  const hits = t.length < 2 ? [] : (bundle?.patients ?? []).filter((p) => p.name.toLowerCase().includes(t) || p.patient_name.toLowerCase().includes(t) || (p.phone ?? "").includes(t)).slice(0, 8);
  return (
    <div className="relative"><CloudOff className="absolute start-3 top-2.5 h-4 w-4 text-amber-600" /><input className={inputCls + " ps-9"} placeholder="Offline: search saved patients" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-card shadow-lg">{hits.map((p) => <button key={p.name} onClick={() => onPick({ name: p.name, patient_name: p.patient_name, gender: p.gender ?? "", age: p.age, phone: p.phone, category: p.category })}
        className="block w-full px-3 py-2 text-start text-sm hover:bg-muted"><b>{p.patient_name}</b> <span className="text-xs text-muted-foreground">{p.name} · {p.phone}</span></button>)}</div>}</div>
  );
}

// ------------------------------------------------------------------ pay
function PayDialog({ total, modes, offline, lines, patient, newP, branch, counter, cashier, clinic, onClose, onDone, enqueue }: { total: number; modes: string[]; offline: boolean; lines: Line[];
  patient: PatientHit | null; newP: NewP | null; branch: string; counter: string; cashier?: string; clinic?: Bundle["clinic"]; onClose: () => void; onDone: (r: Receipt) => void;
  enqueue: (q: import("./offline").Queued) => Promise<void> }) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [mode, setMode] = useState(modes.includes("Cash") ? "Cash" : modes[0]);
  const [entry, setEntry] = useState(String(Math.round(total)));
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [auths, setAuths] = useState<Record<string, { name: string; status: string }> | null>(null);
  const [reason, setReason] = useState("");
  const clientRef = useMemo(() => uuid(), []);
  const paid = tenders.reduce((s, t) => s + t.amount, 0);
  const due = Math.max(Math.round(total) - paid, 0);
  const change = Math.max(paid - Math.round(total), 0);
  const needsDiscount = lines.some((l) => l.discount > 0);
  const pending = auths ? Object.values(auths).filter((a) => !["Approved", "Within Limit"].includes(a.status)) : [];
  useEffect(() => { publishDisplay({ kind: "pay", patient: patient?.patient_name ?? newP?.patient_name, total, paid, change }); }, [paid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // wait for the supervisor while a discount is pending
    if (!pending.length) return;
    const t = setInterval(() => void call<Record<string, string>>("counter.discount_status", { names: pending.map((p) => p.name) }).then((s) =>
      setAuths((a) => a && Object.fromEntries(Object.entries(a).map(([k, v]) => [k, { ...v, status: s[v.name] ?? v.status }])))), 3000);
    return () => clearInterval(t);
  }, [pending.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTender = (amt?: number) => {
    const v = Math.round(amt ?? (Number(entry) || 0));
    if (v <= 0) return;
    if (mode !== "Cash" && v > due) { toast.error("Card / wallet / bank cannot be more than the amount due"); return; }
    if (mode !== "Cash" && !ref.trim()) { toast.error("Enter the transaction ID"); return; }
    setTenders((ts) => [...ts, { mode_of_payment: mode, amount: v, reference_no: mode !== "Cash" ? ref.trim() : undefined }]);
    setRef(""); setEntry(String(Math.max(due - v, 0)));
  };
  const payload = () => ({ client_ref: clientRef, branch, counter, patient: patient?.name, new_patient: patient ? undefined : { ...newP, age: Number(newP?.age) || undefined },
    lines: lines.map(strip), tenders: tenders.length ? tenders : [{ mode_of_payment: mode, amount: Math.round(Number(entry) || 0), reference_no: ref || undefined }],
    auths: auths ? Object.fromEntries(Object.entries(auths).map(([k, v]) => [k, v.name])) : undefined, discount_reason: reason || undefined });
  const finish = async () => {
    const data = payload();
    const sum = (data.tenders as Tender[]).reduce((s, t) => s + t.amount, 0);
    if (sum + 0.5 < Math.round(total)) { toast.error(`Still due ${rs(Math.round(total) - sum)}`); return; }
    if (needsDiscount && !offline && !auths) {
      if (!reason.trim()) { toast.error("Enter the discount reason"); return; }
      setBusy(true);
      try { const a = await call<Record<string, { name: string; status: string }>>("counter.request_discounts", { data: { ...data } }); setAuths(a);
        if (Object.values(a).some((x) => !["Approved", "Within Limit"].includes(x.status))) { toast("Discount sent to the supervisor — waiting for approval", { icon: "⏳" }); setBusy(false); return; } }
      catch (e) { toast.error(humanizeError(e)); setBusy(false); return; }
    }
    setBusy(true);
    try {
      const r = await call<Receipt>("counter.checkout", { data: { ...payload(), tenders: data.tenders } });
      void printDoc(receiptHtml(r), "receipt");
      onDone(r);
    } catch (e) {
      if (isNetworkError(e) || offline) {
        if (lines.some((l) => !["Consultation", "Service", "Lab"].includes(l.kind)) || needsDiscount) { toast.error("Offline: only consultations, services and lab tests without discount can be sold."); setBusy(false); return; }
        const local: Receipt = { name: `OFF-${clientRef.slice(0, 8).toUpperCase()}`, posted_at: new Date().toISOString().replace("T", " ").slice(0, 19), patient: patient?.name ?? "NEW", patient_name: patient?.patient_name ?? newP?.patient_name ?? "",
          lines: lines.map((l) => ({ kind: l.kind, label: l.label, qty: l.qty, rate: l.rate, discount: 0, amount: lineTotal(l) })), tenders: data.tenders as Tender[], gross_total: total, discount_total: 0,
          patient_total: total, tendered: sum, change_amount: Math.max(sum - Math.round(total), 0), tokens: lines.filter((l) => l.kind === "Consultation").map((l) => ({ doctor: l.label.replace("Consultation · ", ""), token: "—" })),
          cashier, counter, offline: true, pending_sync: true, clinic: clinic ?? { name: "VVS Hospital" } };
        await enqueue({ client_ref: clientRef, created: new Date().toISOString(), total, patient_name: local.patient_name, status: "pending", attempts: 0,
          data: { ...data, offline: 1, offline_created: local.posted_at }, receipt: local });
        void printDoc(receiptHtml(local), "receipt");
        toast("Saved offline — it posts when the connection returns", { icon: "📴" });
        onDone(local);
      } else toast.error(humanizeError(e), { duration: 8000 });
    } finally { setBusy(false); }
  };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Enter" && !busy && (e.target as HTMLElement).tagName !== "INPUT") { e.preventDefault(); void finish(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); });
  const key = (k: string) => setEntry((v) => (k === "C" ? "" : k === "⌫" ? v.slice(0, -1) : (v === "0" ? "" : v) + k));
  return (
    <Dialog open onClose={onClose} size="xl" title={<span className="flex items-center gap-2"><Banknote className="h-5 w-5 text-emerald-600" />Payment{offline && <span className="rounded-full bg-amber-400 px-2 text-xs font-bold text-amber-950">OFFLINE</span>}</span>}>
      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{modes.map((m) => { const I = MODE_ICON[m] ?? Wallet; return (
            <button key={m} onClick={() => { setMode(m); if (m !== "Cash") setEntry(String(due)); }} className={cn("flex h-16 flex-col items-center justify-center rounded-xl border-2 text-sm font-bold", mode === m ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-border")}>
              <I className="h-5 w-5" />{m}</button>); })}</div>
          {mode !== "Cash" && <input className={inputCls} placeholder="Transaction ID / slip no." value={ref} onChange={(e) => setRef(e.target.value)} />}
          <div className="flex items-center gap-2"><input className={inputCls + " h-14 text-end text-3xl font-black tabular-nums"} inputMode="numeric" value={entry} onChange={(e) => setEntry(e.target.value.replace(/\D/g, ""))} />
            <Button variant="save" size="lg" className="h-14" onClick={() => addTender()}><Plus className="h-5 w-5" />Add</Button></div>
          <div className="grid grid-cols-4 gap-2">{["1", "2", "3", "C", "4", "5", "6", "⌫", "7", "8", "9", "00", "0"].map((k) => (
            <button key={k} onClick={() => key(k)} className={cn("h-12 rounded-xl border border-border text-lg font-bold hover:bg-muted", k === "0" && "col-span-2", (k === "C" || k === "⌫") && "text-rose-600")}>{k === "⌫" ? <Delete className="mx-auto h-5 w-5" /> : k}</button>))}
            <button onClick={() => addTender(due)} className="col-span-2 h-12 rounded-xl bg-teal-600 font-bold text-white">Exact {rs(due)}</button></div>
          {mode === "Cash" && <div className="flex flex-wrap gap-2">{[500, 1000, 5000].map((v) => <button key={v} onClick={() => addTender(v)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold">+{rs(v)}</button>)}</div>}
          {needsDiscount && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-500/10"><div className="mb-1 font-semibold"><Percent className="me-1 inline h-4 w-4" />Discount {rs(lines.reduce((s, l) => s + l.discount, 0))}</div>
            <input className={inputCls + " h-9"} placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!!auths} />
            {auths && <div className="mt-2 space-y-0.5 text-xs">{Object.entries(auths).map(([k, v]) => <div key={k}>{k.replace("Consultation:", "Consultation ")} · <b>{v.status}</b> ({v.name})</div>)}</div>}</div>}
        </div>
        <div className="space-y-2">
          <div className="rounded-2xl bg-gradient-to-br from-teal-800 to-emerald-900 p-4 text-white">
            <div className="flex justify-between text-sm text-white/80"><span>Total</span><span className="tabular-nums">{rs(total)}</span></div>
            <div className="flex justify-between text-sm text-white/80"><span>Paid</span><span className="tabular-nums">{rs(paid)}</span></div>
            <div className="mt-2 text-[10px] uppercase tracking-widest text-white/60">{change ? "Change" : "Due"}</div><div className="text-4xl font-black tabular-nums">{rs(change || due)}</div>
          </div>
          <div className="space-y-1">{tenders.map((t, i) => { const I = MODE_ICON[t.mode_of_payment] ?? Wallet; return (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-sm"><I className="h-4 w-4" /><span className="flex-1">{t.mode_of_payment}{t.reference_no ? <span className="text-xs text-muted-foreground"> · {t.reference_no}</span> : null}</span>
              <b className="tabular-nums">{rs(t.amount)}</b><button onClick={() => setTenders((ts) => ts.filter((_, j) => j !== i))} className="text-rose-600"><X className="h-4 w-4" /></button></div>); })}
            {!tenders.length && <div className="rounded-lg border border-dashed border-border p-2 text-center text-xs text-muted-foreground">One payment? Just press Confirm — the amount above is used. Split: Add each part.</div>}</div>
          <Button variant="submit" size="lg" className="h-14 w-full text-lg" loading={busy} disabled={pending.length > 0} onClick={() => void finish()}><CheckCircle2 className="h-5 w-5" />{pending.length ? "Waiting for approval…" : "Confirm"} <span className="text-xs opacity-70">Enter</span></Button>
        </div>
      </div>
    </Dialog>
  );
}

function DoneDialog({ r, onClose }: { r: Receipt; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onClose(); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <Dialog open onClose={onClose} size="md" title={<span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" />{r.pending_sync ? "Saved offline" : "Paid"} · {r.name}</span>}>
      <div className="space-y-3 text-center">
        {r.change_amount > 0 && <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-500/10"><div className="text-xs uppercase text-muted-foreground">Give change</div><div className="text-5xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">{rs(r.change_amount)}</div></div>}
        {r.tokens.length > 0 && <div className="flex flex-wrap justify-center gap-2">{r.tokens.map((t, i) => <div key={i} className="rounded-2xl border-2 border-teal-600 px-5 py-2"><div className="text-xs text-muted-foreground">{t.doctor}{t.room ? ` · ${t.room}` : ""}</div><div className="text-4xl font-black">{t.token}</div></div>)}</div>}
        <div className="flex gap-2"><Button variant="neutral" className="flex-1" onClick={() => void printDoc(receiptHtml(r), "receipt")}><Printer className="h-4 w-4" />Reprint</Button>
          <Button variant="submit" className="flex-1" onClick={onClose}>Next sale <span className="text-xs opacity-70">Enter</span></Button></div>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ receipts, refunds, offline queue
interface Row { name: string; patient: string; patient_name: string; posted_at: string; patient_total: number; change_amount: number; status: string; offline: number; kinds: string[]; modes: string[] }
function ReceiptsDialog({ sync, offline, onClose }: { sync: ReturnType<typeof useCounterSync>; offline: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const { data: rows, refetch } = useApi<Row[]>("counter.receipts", { q }, { enabled: !offline });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Dialog open onClose={onClose} size="xl" title="Receipts · this shift">
      {open ? <ReceiptView name={open} onBack={() => { setOpen(null); void refetch(); }} /> : <div className="space-y-3">
        {sync.queue.length > 0 && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:bg-amber-500/10"><div className="mb-2 flex items-center gap-2 text-sm font-bold"><CloudOff className="h-4 w-4" />Waiting to sync ({sync.queue.length})
          <Button size="xs" variant="menu" className="ms-auto" disabled={sync.syncing} onClick={() => void sync.sync()}><RefreshCw className={cn("h-3 w-3", sync.syncing && "animate-spin")} />Sync now</Button></div>
          {sync.queue.map((x) => <div key={x.client_ref} className="flex items-center gap-2 border-t border-amber-200 py-1.5 text-sm"><span className="flex-1">{x.patient_name} · {x.created.slice(11, 16)}{x.error ? <span className="block text-xs text-rose-700">{x.error}</span> : null}</span>
            <b className="tabular-nums">{rs(x.total)}</b>{x.status === "failed" && <button className="text-xs font-semibold text-rose-700 underline" onClick={() => { if (confirm("Discard this offline sale? The money must be handled by hand.")) void sync.discard(x.client_ref); }}>Discard</button>}</div>)}</div>}
        <input className={inputCls} placeholder="Search patient, MR or RCPT no. (any day)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">{(rows ?? []).map((r) => (
          <button key={r.name} onClick={() => setOpen(r.name)} className="flex w-full items-center gap-3 p-3 text-start hover:bg-muted/60"><div className="min-w-0 flex-1"><div className="font-semibold">{r.patient_name} <span className="font-mono text-xs text-muted-foreground">{r.name}</span></div>
            <div className="text-xs text-muted-foreground">{r.posted_at.slice(11, 16)} · {r.kinds.join(", ")} · {r.modes.join(" + ")}{r.offline ? " · synced from offline" : ""}</div></div>
            {r.status !== "Paid" && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">{r.status}</span>}<b className="tabular-nums">{rs(r.patient_total)}</b></button>))}
          {rows && !rows.length && <div className="p-6 text-center text-sm text-muted-foreground">No receipts yet.</div>}{offline && <div className="p-6 text-center text-sm text-muted-foreground">Receipts need the server.</div>}</div>
      </div>}
    </Dialog>
  );
}

function ReceiptView({ name, onBack }: { name: string; onBack: () => void }) {
  const { data: r, refetch } = useApi<Receipt>("counter.receipt", { name });
  const [sel, setSel] = useState<number[]>([]);
  if (!r) return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
  const refund = async () => {
    const reason = prompt(`Refund ${sel.length ? `${sel.length} line(s)` : "the whole receipt"} — reason?`);
    if (!reason) return;
    try { await call("counter.refund", { name, rows: sel.length ? sel : undefined, reason }); toast.success("Refunded from your shift"); setSel([]); void refetch(); }
    catch (e) { toast.error(humanizeError(e), { duration: 8000 }); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><button onClick={onBack} className="text-sm font-semibold text-teal-700">← Back</button><b className="ms-2">{r.name}</b><span className="text-sm text-muted-foreground">{r.patient_name} · {r.posted_at.slice(0, 16)}</span>
        <span className="ms-auto rounded-full bg-muted px-2 text-xs font-semibold">{r.status}</span></div>
      <div className="divide-y divide-border rounded-xl border border-border">{r.lines.map((l) => (
        <label key={l.idx} className={cn("flex items-center gap-2 p-2.5 text-sm", l.refunded && "opacity-50")}><input type="checkbox" disabled={!!l.refunded || l.kind === "Online Fee"} checked={sel.includes(l.idx!)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, l.idx!] : s.filter((x) => x !== l.idx)))} />
          <span className="flex-1">{l.label}{l.token_no ? <span className="ms-1 rounded bg-teal-100 px-1 text-xs font-bold text-teal-800">token {l.token_no}</span> : null}{l.refunded ? <span className="ms-1 text-xs text-rose-600">refunded</span> : null}</span>
          <b className="tabular-nums">{rs(l.amount)}</b></label>))}</div>
      <div className="text-sm text-muted-foreground">{r.tenders.map((t) => `${t.mode_of_payment} ${rs(t.amount)}${t.reference_no ? ` (${t.reference_no})` : ""}`).join(" + ")}{r.change_amount ? ` · change ${rs(r.change_amount)}` : ""}</div>
      <div className="flex gap-2"><Button variant="neutral" onClick={() => void printDoc(receiptHtml(r), "receipt")}><Printer className="h-4 w-4" />Reprint</Button>
        <Button variant="danger" disabled={r.status === "Refunded"} onClick={() => void refund()}><Undo2 className="h-4 w-4" />Refund {sel.length ? `${sel.length} line(s)` : "all"}</Button></div>
      <div className="text-xs text-muted-foreground">Refunds are paid back from your shift in the receipt's own payment method. Online fees are refunded from the online visit.</div>
    </div>
  );
}
