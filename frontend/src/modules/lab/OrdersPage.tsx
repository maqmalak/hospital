import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Banknote, Check, ExternalLink, FilePlus2, Link2, Plus, Search, Send, ShieldOff, X, HandHelping, Printer } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useAction, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, PatientPicker, Section, StatCard, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { todayISO } from "@/utils/dates";
import { cn } from "@/utils/cn";
import { LabHero, PriorityTag, rs, StatusChip, useLabLive } from "./shared";
import { addDaysISO } from "@/utils/dates";

export interface Template { name: string; test_code: string; department: string; price: number; sample_type: string; container: string; tat_hours: number; outsourced: number }
interface Ctx { templates: Template[]; doctors: { name: string; doctor_name: string }[]; reference_labs: string[] }
interface Row { name: string; patient: string; patient_name: string; status: string; net_total: number; patient_share: number; priority: string; expected_at?: string;
  tests: string[]; progress: Record<string, number>; sales_invoice?: string; creation: string; released_at?: string }
const STATUSES = ["", "Ordered", "Paid", "In Progress", "Partially Released", "Released"];

export default function LabOrdersPage() {
  const { t } = useTranslation();
  const { branch } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [period, setPeriod] = useState<"day" | "week" | "month" | "custom">("day");
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [prio, setPrio] = useState("");
  const pick = (p: typeof period) => { setPeriod(p); const t0 = todayISO(); if (p === "day") { setFrom(t0); setTo(t0); } else if (p === "week") { setFrom(addDaysISO(t0, -6)); setTo(t0); } else if (p === "month") { setFrom(t0.slice(0, 8) + "01"); setTo(t0); } };
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(sp.get("new") === "1");
  const [open, setOpen] = useState<string | null>(sp.get("order"));
  const { data: rows } = useApi<Row[]>("lab.orders", { from_date: from, to_date: to, status, q, branch, priority: prio || undefined }, { refetchInterval: 30_000 });
  const { data: dash } = useApi<{ overdue: number; to_verify: number; critical_open: number; tat: { n: number; on_time: number } }>("lab.dashboard", { branch });
  useLabLive(["lab.orders", "lab.dashboard", "lab.order"]);
  const total = (rows ?? []).reduce((s, r) => s + (r.patient_share || 0), 0);
  return (
    <div className="mx-auto max-w-7xl">
      <LabHero title={t("Lab orders")} sub="Order tests, take payment, track every sample to the released report"
        actions={<Button className="bg-white text-violet-800 hover:bg-white/90" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New lab order</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orders" value={rows?.length ?? 0} hint={rs(total)} tone="violet" />
        <StatCard label="Overdue" value={dash?.overdue ?? 0} hint="past expected time" tone="rose" />
        <StatCard label="To verify" value={dash?.to_verify ?? 0} hint={`${dash?.critical_open ?? 0} critical not logged`} tone="amber" />
        <StatCard label="On time (30 d)" value={dash?.tat.n ? `${Math.round(((dash.tat.on_time || 0) / dash.tat.n) * 100)}%` : "–"} tone="teal" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} placeholder="Name, MR or order no." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="flex rounded-xl bg-muted p-1">{([["day", "Today"], ["week", "Week"], ["month", "Month"], ["custom", "Custom"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => pick(k)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", period === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>))}</div>
        {period === "custom" && <div className="flex items-center gap-1"><input type="date" className={inputCls.replace("w-full", "") + " w-36"} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-muted-foreground">→</span><input type="date" className={inputCls.replace("w-full", "") + " w-36"} value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)} /></div>}
        <div className="flex rounded-xl bg-muted p-1">{["", "Urgent", "Priority", "Normal"].map((p) => <button key={p || "all"} onClick={() => setPrio(p)} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-semibold", prio === p ? "bg-card shadow" : "text-muted-foreground")}>{p || "Any priority"}</button>)}</div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">{STATUSES.map((s) => <button key={s} onClick={() => setStatus(s)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === s ? "bg-card shadow" : "text-muted-foreground")}>{s || "All"}</button>)}</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(rows ?? []).map((r) => {
          const done = (r.progress.Released ?? 0) + (r.progress.Verified ?? 0);
          const late = r.expected_at && !r.released_at && new Date(r.expected_at.replace(" ", "T")) < new Date();
          return (
            <button key={r.name} onClick={() => setOpen(r.name)} className="group rounded-2xl border border-border bg-card p-4 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate font-bold">{r.patient_name}</div><div className="font-mono text-xs text-muted-foreground">{r.name} · {r.patient}{period !== "day" ? ` · ${r.creation.slice(5, 10)}` : ""}</div></div>
                <PriorityTag p={r.priority} /><StatusChip s={r.status} /></div>
              <div className="mt-2 flex flex-wrap gap-1">{r.tests.map((x, i) => <span key={i} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">{x}</span>)}</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-teal-500" style={{ width: `${(done / Math.max(r.tests.length, 1)) * 100}%` }} /></div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span className={cn(late && "font-bold text-rose-600")}>{r.expected_at ? `due ${r.expected_at.slice(11, 16)}` : ""}{late ? " · late" : ""}</span><span className="font-semibold text-foreground">{rs(r.patient_share || r.net_total)}</span></div>
            </button>);
        })}
      </div>
      {rows && !rows.length && <Empty title="No orders" hint="Change the period, priority or status filter." />}
      {creating && <NewOrderDialog onClose={() => { setCreating(false); sp.delete("new"); setSp(sp, { replace: true }); }} onDone={(n) => { setCreating(false); setOpen(n); }} />}
      {open && <OrderDialog name={open} onClose={() => { setOpen(null); sp.delete("order"); setSp(sp, { replace: true }); }} />}
    </div>
  );
}

export function NewOrderDialog({ onClose, onDone, patient: initial }: { onClose: () => void; onDone: (name: string) => void; patient?: PatientHit | null }) {
  const { data: ctx } = useApi<Ctx>("lab.context");
  const [patient, setPatient] = useState<PatientHit | null>(initial ?? null);
  const [sel, setSel] = useState<string[]>([]);
  const [dept, setDept] = useState("");
  const [q, setQ] = useState("");
  const [doctor, setDoctor] = useState("");
  const [external, setExternal] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [mode, setMode] = useState("Cash");
  const [tendered, setTendered] = useState("");
  const [busy, setBusy] = useState(false);
  const [ref] = useState(() => crypto.randomUUID());
  const depts = useMemo(() => [...new Set((ctx?.templates ?? []).map((x) => x.department))], [ctx]);
  const list = (ctx?.templates ?? []).filter((x) => (!dept || x.department === dept) && (!q || `${x.name} ${x.test_code}`.toLowerCase().includes(q.toLowerCase())));
  const chosen = (ctx?.templates ?? []).filter((x) => sel.includes(x.name));
  const total = chosen.reduce((s, x) => s + x.price, 0);
  const tat = Math.max(0, ...chosen.map((x) => x.tat_hours || 0));
  const save = async (pay: boolean) => {
    if (!patient) return;
    setBusy(true);
    try {
      const r = await call<{ name: string }>("lab.create_order", { data: { patient: patient.name, tests: sel, referring_doctor: doctor || undefined, external_referrer: external || undefined, priority, pay: pay ? 1 : 0, payment_mode: mode, cash_tendered: Number(tendered) || undefined, client_ref: ref } });
      toast.success(pay ? `Paid · ${r.name}` : `Order ${r.name} saved`); onDone(r.name);
    } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title="New lab order" size="xl">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <PatientPicker value={patient} onPick={setPatient} onClear={() => setPatient(null)} autoFocus={!patient} />
          <div className="mt-3 flex flex-wrap gap-2"><input className={inputCls + " max-w-xs"} placeholder="Search test or code" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex flex-wrap gap-1">{["", ...depts].map((d) => <button key={d} onClick={() => setDept(d)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", dept === d ? "border-violet-600 bg-violet-600 text-white" : "border-border")}>{d || "All"}</button>)}</div></div>
          <div className="mt-3 grid max-h-[46vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {list.map((x) => { const on = sel.includes(x.name); return (
              <button key={x.name} onClick={() => setSel((s) => (on ? s.filter((y) => y !== x.name) : [...s, x.name]))}
                className={cn("flex items-center gap-3 rounded-xl border p-3 text-start transition-all", on ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500/30 dark:bg-violet-500/10" : "border-border hover:border-violet-300")}>
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", on ? "border-violet-600 bg-violet-600 text-white" : "border-border")}>{on && <Check className="h-4 w-4" />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{x.name}</span><span className="text-[11px] text-muted-foreground">{x.test_code} · {x.sample_type} · {x.tat_hours}h{x.outsourced ? " · outsourced" : ""}</span></span>
                <span className="text-sm font-bold tabular-nums">{rs(x.price)}</span></button>); })}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-gradient-to-br from-violet-700 to-indigo-800 p-4 text-white">
            <div className="text-xs uppercase tracking-widest text-white/70">{chosen.length} tests · ready in ~{tat}h</div>
            <div className="text-3xl font-black tabular-nums">{rs(total)}</div>
            <div className="mt-2 space-y-1">{chosen.map((x) => <div key={x.name} className="flex justify-between text-xs"><span className="truncate">{x.name}</span><button onClick={() => setSel((s) => s.filter((y) => y !== x.name))}><X className="h-3 w-3" /></button></div>)}</div>
          </div>
          <Field label="Referring doctor"><select className={inputCls} value={doctor} onChange={(e) => setDoctor(e.target.value)}><option value="">— walk-in / external —</option>{ctx?.doctors.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select></Field>
          {!doctor && <Field label="External referrer"><input className={inputCls} value={external} onChange={(e) => setExternal(e.target.value)} /></Field>}
          <div className="flex gap-2">{["Normal", "Priority", "Urgent"].map((p) => <button key={p} onClick={() => setPriority(p)} className={cn("flex-1 rounded-xl border py-2 text-sm font-bold", priority === p ? (p === "Urgent" ? "border-rose-600 bg-rose-600 text-white" : p === "Priority" ? "border-amber-500 bg-amber-500 text-white" : "border-teal-600 bg-teal-600 text-white") : "border-border")}>{p === "Urgent" ? "⚡ Urgent" : p === "Priority" ? "▲ Priority" : "Normal"}</button>)}</div>
          <Field label="Payment"><div className="flex flex-wrap gap-1">{["Cash", "Card", "JazzCash", "Easypaisa", "Bank Transfer"].map((m) => <button key={m} onClick={() => setMode(m)} className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold", mode === m ? "border-emerald-600 bg-emerald-600 text-white" : "border-border")}>{m}</button>)}</div></Field>
          {mode === "Cash" && <Field label="Cash tendered"><input className={inputCls + " text-end tabular-nums"} inputMode="numeric" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/\D/g, ""))} />
            {Number(tendered) > total && <div className="mt-1 text-end text-sm font-bold text-emerald-600">Change {rs(Number(tendered) - total)}</div>}</Field>}
          <Button variant="submit" size="lg" className="w-full" disabled={!patient || !sel.length} loading={busy} onClick={() => void save(true)}><Banknote className="h-5 w-5" />Collect {rs(total)}</Button>
          <Button variant="outline" className="w-full" disabled={!patient || !sel.length || busy} onClick={() => void save(false)}><FilePlus2 className="h-4 w-4" />Save without payment</Button>
        </div>
      </div>
    </Dialog>
  );
}

interface Order { name: string; patient: string; patient_name: string; status: string; priority: string; gross_total: number; discount_amount: number; net_total: number; patient_share: number;
  payer_share: number; sales_invoice?: string; expected_at?: string; referring_doctor?: string; items: { name: string; template: string; status: string; price: number; sample?: string; result?: string; outsourced: number }[];
  samples: { name: string; sample_type: string; container: string; status: string; collected_at?: string; rejection_reason?: string }[];
  links: { name: string; expires_at: string; download_count: number; max_downloads: number; revoked: number; version: number; last_accessed_at?: string }[];
  messages: { name: string; event: string; status: string; channel: string; creation: string }[]; handed_over_to?: string; handed_over_at?: string; whatsapp_number?: string; whatsapp_opt_in?: number }

export function OrderDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const { data: o, refetch } = useApi<Order>("lab.order", { name });
  const [mode, setMode] = useState("Cash");
  const pay = useAction("lab.pay", { invalidate: ["lab.orders"], success: "Payment collected", onSuccess: () => void refetch() });
  const release = useAction<{ link?: string }>("lab.release", { invalidate: ["lab.orders"], success: "Report released — link sent", onSuccess: () => void refetch() });
  const resend = useAction<{ link: string }>("lab.resend_link", { success: "New link sent", onSuccess: () => void refetch() });
  const revoke = useAction("lab.revoke", { success: "All links revoked", onSuccess: () => void refetch() });
  const handOver = useAction("lab.hand_over", { success: "Hand-over recorded", onSuccess: () => void refetch() });
  const preview = async () => { try { const html = await call<string>("lab.report_preview", { name }); const w = window.open("", "_blank"); w?.document.write(html); w?.document.close(); } catch (e) { toast.error(humanizeError(e)); } };
  if (!o) return <Dialog open onClose={onClose} title={name} size="lg"><div className="h-60 animate-pulse rounded-2xl bg-muted" /></Dialog>;
  const unpaid = ["Draft", "Ordered"].includes(o.status);
  const verified = o.items.filter((i) => i.status === "Verified").length;
  return (
    <Dialog open onClose={onClose} title={`${o.patient_name} · ${o.name}`} description={`${o.patient} · ${o.priority}${o.expected_at ? ` · expected ${o.expected_at.slice(0, 16)}` : ""}`} size="lg">
      <div className="mb-3 flex flex-wrap items-center gap-2"><PriorityTag p={o.priority} /><StatusChip s={o.status} /><span className="text-sm">Bill {rs(o.net_total)}{o.payer_share ? ` · panel ${rs(o.payer_share)}` : ""}</span>{o.sales_invoice && <span className="font-mono text-xs text-muted-foreground">{o.sales_invoice}</span>}</div>
      {unpaid && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:bg-amber-500/10"><span className="flex-1 text-sm font-semibold">Payment due {rs(o.patient_share || o.net_total)}</span>
        <select className={inputCls.replace("w-full", "") + " w-36"} value={mode} onChange={(e) => setMode(e.target.value)}>{["Cash", "Card", "JazzCash", "Easypaisa", "Bank Transfer"].map((m) => <option key={m}>{m}</option>)}</select>
        <Button variant="submit" loading={pay.isPending} onClick={() => pay.mutate({ name, payment_mode: mode })}><Banknote className="h-4 w-4" />Collect</Button></div>}
      <Section title="Tests">
        {o.items.map((i) => <div key={i.name} className="flex items-center gap-2 border-b border-border/60 py-2 text-sm last:border-0"><span className="flex-1 font-medium">{i.template}{i.outsourced ? <span className="ms-1 text-xs text-violet-600">outsourced</span> : null}</span>
          <span className="text-xs text-muted-foreground">{i.sample}</span><StatusChip s={i.status} /><span className="w-20 text-end tabular-nums">{rs(i.price)}</span></div>)}
      </Section>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Section title="Samples">{o.samples.length ? o.samples.map((s) => <div key={s.name} className="flex justify-between py-1 text-sm"><span className="font-mono text-xs">{s.name}</span><span>{s.sample_type}</span><StatusChip s={s.status} /></div>) : <Empty title="Created on payment" />}</Section>
        <Section title="Report links">{o.links.length ? o.links.map((l) => <div key={l.name} className="flex justify-between py-1 text-xs"><span>v{l.version} · {l.download_count}/{l.max_downloads} downloads</span><span className={cn(l.revoked && "text-rose-600")}>{l.revoked ? "revoked" : `till ${l.expires_at.slice(0, 10)}`}</span></div>) : <Empty title="No link yet" />}</Section>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {verified > 0 && <Button variant="workflow" loading={release.isPending} onClick={() => release.mutate({ name, partial: verified < o.items.length ? 1 : 0 })}><Send className="h-4 w-4" />Release {verified < o.items.length ? "verified tests" : "report"}</Button>}
        {["Released", "Partially Released"].includes(o.status) && <>
          <Button variant="outline" onClick={() => void preview()}><ExternalLink className="h-4 w-4" />View report</Button>
          <Button variant="outline" loading={resend.isPending} onClick={() => resend.mutate({ name })}><Link2 className="h-4 w-4" />Send on WhatsApp</Button>
          <Button variant="save" onClick={() => { window.open(`/api/method/hospital_vvs.api.lab.print_pdf?name=${encodeURIComponent(name)}`, "_blank");
            setTimeout(() => { const to = prompt("Print copy handed to (name / relation):", o.patient_name); if (to) handOver.mutate({ name, to }); }, 800); }}><Printer className="h-4 w-4" />Print & hand over</Button>
          <Button variant="outline" loading={handOver.isPending} onClick={() => { const to = prompt("Printed report handed to (name / relation):", o.patient_name); if (to) handOver.mutate({ name, to }); }}><HandHelping className="h-4 w-4" />Mark handed over</Button>
          <Button variant="danger" onClick={() => { if (confirm("Revoke every link for this report?")) revoke.mutate({ name }); }}><ShieldOff className="h-4 w-4" />Revoke links</Button></>}
      </div>
      {o.handed_over_to && <div className="mt-3 rounded-xl bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">Printed report handed to <b>{o.handed_over_to}</b> · {o.handed_over_at?.slice(0, 16)}</div>}
      {o.messages.length > 0 && <div className="mt-3 text-xs text-muted-foreground">{o.messages.map((mm) => <div key={mm.name}>{mm.creation.slice(0, 16)} · {mm.event} · {mm.channel} · {mm.status}</div>)}</div>}
    </Dialog>
  );
}
