import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Clock, CreditCard, FilePlus2, Percent, Plus, Printer, Smartphone, Trash2, Users } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, getCall, humanizeError, useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { mappedPrinter, printDoc } from "@/lib/print";
import { opdSlipHtml, type SlipPrint } from "@/lib/templates";
import { Field, inputCls, PatientPicker, Pill, Section, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";

interface Doctor { name: string; doctor_name: string; doctor_name_ur?: string; specialization?: string; default_fee: number; follow_up_fee: number; consultation_room?: string; color?: string; today: number; waiting: number; with_doctor: number; branch?: string }
interface Ctx { doctors: Doctor[]; items: { item_code: string; item_name: string; rate: number }[]; modes: string[]; consultation_item: string; follow_up_item: string; follow_up_free_days: number }
interface Line { item_code: string; item_name: string; qty: number; rate: number }
interface Totals { gross_total: number; discount_amount: number; net_total: number; payer_type: string; payer?: string; payer_share: number; patient_share: number; is_free_follow_up: number; purpose: string; items: (Line & { amount: number })[] }
const MODE_ICON: Record<string, typeof Banknote> = { Cash: Banknote, Card: CreditCard, JazzCash: Smartphone, Easypaisa: Smartphone, "Bank Transfer": CreditCard };
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;

export default function OpdSlipPage() {
  const { boot, branch } = useAuth();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { data: ctx } = useApi<Ctx>("opd.counter_context", { branch }, { refetchInterval: 30_000 });
  const recent = useApi<{ name: string; patient_name: string; doctor_name: string; token_no: number; patient_share: number; payment_mode: string; posting_time: string; is_free_follow_up: number }[]>("opd.recent_slips", { branch });
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [purpose, setPurpose] = useState("Consultation");
  const [lines, setLines] = useState<Line[]>([]);
  const [vitals, setVitals] = useState<Record<string, string>>({});
  const [complaint, setComplaint] = useState("");
  const [mode, setMode] = useState("Cash");
  const [tendered, setTendered] = useState("");
  const [discount, setDiscount] = useState({ amount: 0, reason: "", auth: "", status: "" });
  const [discDlg, setDiscDlg] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [saving, setSaving] = useState(false);
  const clientRef = useRef(crypto.randomUUID());

  useEffect(() => {
    const mr = params.get("patient");
    if (mr) void getCall<PatientHit[]>("hospital_vvs.api.patients.search", { q: mr }).then((r) => r[0] && setPatient(r[0]));
  }, [params]);

  const pickDoctor = (d: Doctor) => {
    setDoctor(d);
    if (!ctx) return;
    const follow = purpose === "Follow-up";
    const item = ctx.items.find((i) => i.item_code === (follow ? ctx.follow_up_item : ctx.consultation_item));
    setLines((ls) => [{ item_code: item?.item_code ?? ctx.consultation_item, item_name: item?.item_name ?? "Consultation", qty: 1, rate: follow && d.follow_up_fee ? d.follow_up_fee : d.default_fee },
      ...ls.filter((l) => l.item_code !== ctx.consultation_item && l.item_code !== ctx.follow_up_item)]);
  };
  useEffect(() => { if (doctor) pickDoctor(doctor); }, [purpose]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = useMemo(() => ({
    patient: patient?.name, doctor: doctor?.name, branch, purpose, items: lines, chief_complaint: complaint, payment_mode: mode,
    cash_tendered: Number(tendered) || 0, discount_amount: discount.status && ["Within Limit", "Approved"].includes(discount.status) ? discount.amount : 0,
    discount_reason: discount.reason, discount_authorization: discount.auth || undefined,
    ...Object.fromEntries(Object.entries(vitals).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])),
  }), [patient, doctor, branch, purpose, lines, complaint, mode, tendered, discount, vitals]);

  // server-computed totals (free follow-up window, payer split)
  useEffect(() => {
    if (!patient || !doctor || !lines.length) { setTotals(null); return; }
    const id = setTimeout(() => void call<Totals>("opd.preview", { data: payload }).then(setTotals).catch(() => setTotals(null)), 250);
    return () => clearTimeout(id);
  }, [payload, patient, doctor, lines.length]);

  // discount decision arrives in realtime; polling fallback
  useRealtime(boot?.site, [`hv:discount_decided:${branch}`], (d) => {
    const x = d as { name: string; status: string };
    if (x.name === discount.auth) { setDiscount((s) => ({ ...s, status: x.status })); toast(x.status === "Approved" ? "Discount approved" : "Discount rejected", { icon: x.status === "Approved" ? "✅" : "⛔" }); }
  });
  useEffect(() => {
    if (discount.status !== "Pending") return;
    const id = setInterval(async () => {
      const r = await getCall<{ status: string }>("hospital_vvs.api.billing.discount_status", { name: discount.auth });
      if (r.status !== "Pending") setDiscount((s) => ({ ...s, status: r.status }));
    }, 4000);
    return () => clearInterval(id);
  }, [discount.status, discount.auth]);

  const requestDiscount = async (amount: number, reason: string) => {
    try {
      const r = await call<{ name: string; status: string }>("opd.request_discount", { data: { ...payload, discount_amount: amount, discount_reason: reason } });
      setDiscount({ amount, reason, auth: r.name, status: r.status }); setDiscDlg(false);
      toast(r.status === "Within Limit" ? "Discount applied" : "Sent for approval", { icon: r.status === "Within Limit" ? "✅" : "⏳" });
    } catch (e) { toast.error(humanizeError(e)); }
  };

  const reset = () => { setPatient(null); setLines([]); setVitals({}); setComplaint(""); setTendered(""); setDiscount({ amount: 0, reason: "", auth: "", status: "" }); setPurpose("Consultation"); clientRef.current = crypto.randomUUID(); };

  const save = async () => {
    if (!patient || !doctor) return toast.error("Choose the patient and the doctor");
    if (discount.status === "Pending") return toast.error("The discount is waiting for approval");
    setSaving(true);
    try {
      const slip = await call<SlipPrint>("opd.create_slip", { data: { ...payload, client_ref: clientRef.current } });
      toast.success(`Token ${slip.token_no} · ${slip.name}`);
      if (boot) await printDoc(opdSlipHtml(slip), "receipt", { agent: !!boot.print.agent, printer: mappedPrinter(boot.print.printers, "receipt") });
      reset();
      void qc.invalidateQueries({ queryKey: ["opd.counter_context"] }); void qc.invalidateQueries({ queryKey: ["opd.recent_slips"] });
    } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setSaving(false); }
  };

  const due = totals?.patient_share ?? lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const change = Math.max((Number(tendered) || 0) - due, 0);
  const docName = (d: Doctor) => (i18n.language === "ur" && d.doctor_name_ur ? d.doctor_name_ur : d.doctor_name);
  const doctors = (ctx?.doctors ?? []).filter((d) => !d.branch || d.branch === branch);

  return (
    <div className="-m-3 grid min-h-[calc(100vh-3.5rem)] grid-cols-1 sm:-m-5 xl:grid-cols-[300px_1fr_380px]">
      {/* doctors */}
      <aside className="border-e border-border bg-card/60 p-3">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold">{t("Doctor")}</h2><span className="text-xs text-muted-foreground">{doctors.length}</span></div>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
          {doctors.map((d) => (
            <button key={d.name} onClick={() => pickDoctor(d)} className={cn("relative overflow-hidden rounded-xl border p-3 text-start transition-all hover:shadow-md",
              doctor?.name === d.name ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border bg-card")}>
              <span className="absolute inset-y-0 start-0 w-1.5" style={{ background: d.color || "#0d9488" }} />
              <div className="ps-1.5"><div className="truncate text-sm font-semibold">{docName(d)}</div>
                <div className="truncate text-xs text-muted-foreground">{d.specialization}{d.consultation_room ? ` · ${d.consultation_room}` : ""}</div>
                <div className="mt-1.5 flex items-center justify-between text-xs"><span className="font-bold text-primary">{rs(d.default_fee)}</span>
                  <span className="flex items-center gap-2 text-muted-foreground"><span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{d.waiting}</span><span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{d.today}</span></span></div></div>
            </button>))}
        </div>
      </aside>

      {/* patient + vitals */}
      <section className="space-y-4 p-3 sm:p-5">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white"><FilePlus2 className="h-5 w-5" /></span>
          <h1 className="flex-1 text-xl font-bold">{t("OPD slip")}</h1>
          <div className="flex rounded-xl bg-muted p-1">{["Consultation", "Follow-up", "Procedure"].map((p) => (
            <button key={p} onClick={() => setPurpose(p)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", purpose === p ? "bg-card shadow-sm" : "text-muted-foreground")}>{t(p)}</button>))}</div></div>
        <Section><PatientPicker autoFocus value={patient} onPick={setPatient} onClear={() => setPatient(null)} /></Section>
        <Section title={t("Vitals")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([["bp_systolic", "BP sys", "120"], ["bp_diastolic", "BP dia", "80"], ["pulse", "Pulse", "72"], ["temperature", "Temp °F", "98.6"],
              ["spo2", "SpO₂ %", "98"], ["weight", "Weight kg", ""], ["height", "Height cm", ""], ["rbs", "RBS mg/dL", ""]] as const).map(([k, l, ph]) => (
              <Field key={k} label={l}><input className={inputCls} inputMode="decimal" placeholder={ph} value={vitals[k] ?? ""} onChange={(e) => setVitals((v) => ({ ...v, [k]: e.target.value }))} /></Field>))}
          </div>
          {vitals.weight && vitals.height && <div className="mt-2 text-xs text-muted-foreground">BMI {(Number(vitals.weight) / (Number(vitals.height) / 100) ** 2).toFixed(1)}</div>}
          <Field label="Chief complaint" className="mt-3"><textarea className={inputCls + " h-16 py-2"} value={complaint} onChange={(e) => setComplaint(e.target.value)} /></Field>
        </Section>
        <Section title="Today's slips">
          <div className="max-h-72 overflow-y-auto">{(recent.data ?? []).map((s) => (
            <div key={s.name} className="flex items-center gap-3 border-b border-border/60 py-2 text-sm last:border-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary">{s.token_no}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.patient_name}</span><span className="block truncate text-xs text-muted-foreground">{s.doctor_name} · {s.posting_time?.slice(0, 5)}</span></span>
              {s.is_free_follow_up ? <Pill value="Follow-up" className="bg-teal-100 text-teal-800" /> : null}
              <span className="text-end text-xs"><b className="block tabular-nums">{rs(s.patient_share)}</b>{s.payment_mode}</span>
              <button title="Reprint" onClick={async () => boot && printDoc(opdSlipHtml(await getCall<SlipPrint>("hospital_vvs.api.opd.slip_print", { name: s.name })), "receipt", { agent: !!boot.print.agent })} className="rounded-md p-1.5 hover:bg-muted"><Printer className="h-4 w-4" /></button>
            </div>))}
            {!recent.data?.length && <p className="py-4 text-center text-sm text-muted-foreground">No slips yet today.</p>}</div>
        </Section>
      </section>

      {/* bill */}
      <aside className="flex flex-col border-s border-border bg-card">
        <div className="border-b border-border p-4"><div className="text-xs font-semibold uppercase text-muted-foreground">Bill</div>
          <div className="font-semibold">{doctor ? docName(doctor) : "Choose a doctor"}</div></div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-border p-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.item_name}</span>
              <input className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-end text-sm tabular-nums" value={l.rate} inputMode="numeric"
                onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
              <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="p-1 text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>))}
          <select value="" onChange={(e) => { const it = ctx?.items.find((x) => x.item_code === e.target.value); if (it) setLines((ls) => [...ls, { item_code: it.item_code, item_name: it.item_name, qty: 1, rate: it.rate }]); }}
            className={inputCls + " text-muted-foreground"}><option value="">+ Add service…</option>{ctx?.items.map((i) => <option key={i.item_code} value={i.item_code}>{i.item_name} · {rs(i.rate)}</option>)}</select>
          {totals?.is_free_follow_up ? <div className="flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-sm font-semibold text-teal-800 dark:bg-teal-500/10 dark:text-teal-200"><CheckCircle2 className="h-4 w-4" />{t("Free follow-up")} (within {ctx?.follow_up_free_days} days)</div> : null}
          {totals && totals.payer_share > 0 && <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10"><b>{totals.payer_type}</b> {totals.payer}: covers {rs(totals.payer_share)}</div>}
          {discount.status && <div className={cn("flex items-center gap-2 rounded-xl p-3 text-sm", discount.status === "Pending" ? "bg-amber-50 dark:bg-amber-500/10" : discount.status === "Rejected" ? "bg-rose-50 dark:bg-rose-500/10" : "bg-emerald-50 dark:bg-emerald-500/10")}>
            <Percent className="h-4 w-4" /><span className="flex-1">Discount {rs(discount.amount)} · <Pill value={discount.status} /></span>
            <button className="text-xs underline" onClick={() => setDiscount({ amount: 0, reason: "", auth: "", status: "" })}>{t("Remove")}</button></div>}
          <button disabled={!lines.length || !patient} onClick={() => setDiscDlg(true)} className="flex items-center gap-1 text-sm font-semibold text-primary disabled:opacity-40"><Plus className="h-4 w-4" />{t("Discount")}</button>
        </div>
        <div className="space-y-3 border-t border-border p-4">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("Total")}</span><span className="tabular-nums">{rs(totals?.gross_total ?? due)}</span></div>
            {!!totals?.discount_amount && <div className="flex justify-between"><span className="text-muted-foreground">{t("Discount")}</span><span className="tabular-nums">−{rs(totals.discount_amount)}</span></div>}
            {!!totals?.payer_share && <div className="flex justify-between"><span className="text-muted-foreground">{t("Payer share")}</span><span className="tabular-nums">−{rs(totals.payer_share)}</span></div>}
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-500 p-4 text-white shadow-lg">
            <div className="text-xs uppercase tracking-wide text-white/75">{t("Payable")}</div><div className="text-3xl font-extrabold tabular-nums">{rs(due)}</div></div>
          <div className="grid grid-cols-3 gap-2">{(ctx?.modes ?? ["Cash"]).map((m) => { const I = MODE_ICON[m] ?? Banknote; return (
            <button key={m} onClick={() => setMode(m)} className={cn("flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold", mode === m ? "border-primary bg-primary/10 text-primary" : "border-border")}><I className="h-4 w-4" />{m}</button>); })}</div>
          {mode === "Cash" && <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label="Cash tendered"><input className={inputCls + " h-11 text-end text-lg tabular-nums"} inputMode="numeric" value={tendered} placeholder={String(Math.round(due))} onChange={(e) => setTendered(e.target.value.replace(/\D/g, ""))} /></Field>
            <div className="pb-2 text-end text-sm"><div className="text-xs text-muted-foreground">{t("Change")}</div><div className="font-bold tabular-nums text-emerald-600">{rs(change)}</div></div>
            <div className="col-span-2 flex gap-1">{[500, 1000, 2000, 5000].map((n) => <button key={n} onClick={() => setTendered(String(n))} className="flex-1 rounded-lg border border-border py-1 text-xs font-semibold hover:bg-muted">{n}</button>)}</div>
          </div>}
          <Button variant="submit" size="lg" className="h-12 w-full text-base" loading={saving} disabled={!patient || !doctor || !lines.length} onClick={() => void save()}>
            <Printer className="h-5 w-5" />{t("Save & print")}</Button>
        </div>
      </aside>

      <DiscountDialog open={discDlg} onClose={() => setDiscDlg(false)} gross={totals?.gross_total ?? due} onRequest={requestDiscount} />
    </div>
  );
}

function DiscountDialog({ open, onClose, gross, onRequest }: { open: boolean; onClose: () => void; gross: number; onRequest: (amount: number, reason: string) => void }) {
  const { t } = useTranslation();
  const [pct, setPct] = useState("");
  const [amt, setAmt] = useState("");
  const [reason, setReason] = useState("");
  const amount = amt ? Number(amt) : Math.round((gross * (Number(pct) || 0)) / 100);
  return (
    <Dialog open={open} onClose={onClose} title={t("Discount")} description="Within your limit it applies at once; above it, a supervisor approves on their screen." size="sm">
      <div className="mb-3 flex gap-2">{[5, 10, 20, 50].map((p) => <button key={p} onClick={() => { setPct(String(p)); setAmt(""); }} className={cn("flex-1 rounded-lg border py-2 text-sm font-semibold", pct === String(p) && !amt ? "border-primary bg-primary/10 text-primary" : "border-border")}>{p}%</button>)}</div>
      <div className="grid grid-cols-2 gap-2"><Field label="Percent"><input className={inputCls} value={pct} onChange={(e) => { setPct(e.target.value); setAmt(""); }} inputMode="decimal" /></Field>
        <Field label="Amount"><input className={inputCls} value={amt || (amount ? String(amount) : "")} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ""))} inputMode="numeric" /></Field></div>
      <Field label="Reason" required className="mt-3"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. poor patient, staff family" /></Field>
      <Button variant="primary" className="mt-4 w-full" disabled={!amount || !reason.trim()} onClick={() => onRequest(amount, reason)}>{t("Request approval")} · {rs(amount)}</Button>
    </Dialog>
  );
}
