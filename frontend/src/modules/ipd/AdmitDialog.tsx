import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BedDouble, CheckCircle2, ShieldCheck, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Field, inputCls, PatientPicker, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { type Ctx, rs } from "./shared";

interface PreAuth { name: string; payer: string; status: string; approved_amount: number; valid_till?: string; procedure_type?: string }

/** Admission desk: patient, bed, doctor, billing mode (self / panel / insurance with pre-auth), package, advance. */
export function AdmitDialog({ bed: presetBed, patient: presetPatient, onClose, onDone, source = "Direct" }: { bed?: string; patient?: PatientHit | null;
  onClose: () => void; onDone?: (name: string) => void; source?: string }) {
  const { branch } = useAuth();
  const nav = useNavigate();
  const { data: ctx } = useApi<Ctx>("ipd.context", { branch });
  const [patient, setPatient] = useState<PatientHit | null>(presetPatient ?? null);
  const [bed, setBed] = useState(presetBed ?? "");
  const [doctor, setDoctor] = useState("");
  const [payerType, setPayerType] = useState("Patient");
  const [payer, setPayer] = useState("");
  const [preAuth, setPreAuth] = useState("");
  const [pkg, setPkg] = useState("");
  const [days, setDays] = useState("2");
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [advance, setAdvance] = useState("");
  const [mode, setMode] = useState("Cash");
  const [busy, setBusy] = useState(false);
  const auths = useApi<PreAuth[]>("ipd.pre_auths", { patient: patient?.name }, { enabled: !!patient });

  useEffect(() => {
    if (!patient) return;
    if (patient.category === "Panel" || patient.category === "Insurance") setPayerType(patient.category);
  }, [patient]);
  const bedRow = ctx?.beds.find((b) => b.name === bed);
  const ward = ctx?.wards.find((w) => w.name === bedRow?.ward);
  const dayRate = Number(rate) || bedRow?.rate || 0;
  const estimate = useMemo(() => {
    const d = Math.max(Number(days) || 1, 1);
    return dayRate * d + (ward?.icu_surcharge_per_day || 0) * d + (ward?.nursing_charge_per_shift || 0) * 3 * d;
  }, [days, dayRate, ward]);
  const payers = (ctx?.payers ?? []).filter((p) => payerType === "Panel" ? p.customer_group === "Panels" : payerType === "Insurance" ? p.customer_group === "Insurance Providers"
    : payerType === "Welfare" ? p.customer_group === "Welfare Funds" : false);
  const approved = (auths.data ?? []).filter((a) => ["Approved", "Partially Approved"].includes(a.status) && (!payer || a.payer === payer));
  const needsAuth = payerType === "Insurance" && !!ctx?.flags.preauth;
  const wardsWithBeds = useMemo(() => [...new Set((ctx?.beds ?? []).map((b) => b.ward))], [ctx]);

  const submit = async () => {
    if (!patient || !bed || !doctor) return;
    setBusy(true);
    try {
      const r = await call<{ name: string; token: string }>("ipd.admit", { data: { patient: patient.name, bed, doctor, payer_type: payerType, payer: payer || undefined,
        pre_auth: preAuth || undefined, package: pkg || undefined, planned_days: Number(days) || 1, daily_rate: Number(rate) || undefined, reason, diagnosis, source,
        advance: Number(advance) || undefined, payment_mode: mode } });
      toast.success(`Admitted · ${r.name}`);
      onDone ? onDone(r.name) : nav(`/ipd/${r.name}?new=1`);
    } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} size="xl" title={<span className="flex items-center gap-2"><BedDouble className="h-5 w-5 text-emerald-600" />Admit patient</span>}
      description="Bed, doctor, who pays, and an optional advance — the running bill starts now">
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <Field label="Patient" required><PatientPicker value={patient} onPick={setPatient} onClear={() => setPatient(null)} autoFocus={!patient} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bed" required>
              <select className={inputCls} value={bed} onChange={(e) => setBed(e.target.value)}>
                <option value="">— choose a free bed —</option>
                {wardsWithBeds.map((w) => <optgroup key={w} label={w}>{ctx!.beds.filter((b) => b.ward === w).map((b) =>
                  <option key={b.name} value={b.name}>{b.bed_no} · {rs(b.rate)}/day{b.status === "Reserved" ? " · reserved" : ""}</option>)}</optgroup>)}
              </select>
            </Field>
            <Field label="Admitting doctor" required>
              <select className={inputCls} value={doctor} onChange={(e) => setDoctor(e.target.value)}><option value="">—</option>
                {ctx?.doctors.filter((d) => !d.branch || d.branch === branch).map((d) => <option key={d.name} value={d.name}>{d.doctor_name}{d.specialization ? ` · ${d.specialization}` : ""}</option>)}</select>
            </Field>
          </div>
          <Field label="Billing mode">
            <div className="flex flex-wrap gap-1">{["Patient", "Panel", "Insurance", "Welfare"].map((p) => (
              <button key={p} onClick={() => { setPayerType(p); setPayer(""); setPreAuth(""); }} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold",
                payerType === p ? "border-teal-600 bg-teal-600 text-white" : "border-border hover:bg-muted")}>{p === "Patient" ? "Self pay" : p}</button>))}</div>
          </Field>
          {payerType !== "Patient" && <div className="grid gap-3 sm:grid-cols-2">
            <Field label={payerType === "Insurance" ? "Insurer" : payerType === "Panel" ? "Panel" : "Fund"} required>
              <select className={inputCls} value={payer} onChange={(e) => setPayer(e.target.value)}><option value="">—</option>
                {payers.map((p) => <option key={p.name} value={p.name}>{p.name} · {p.hv_coverage_percent}%</option>)}</select></Field>
            {payerType === "Insurance" && <Field label="Pre-authorization" required={needsAuth} hint={!approved.length ? "No approved pre-auth for this patient yet" : undefined}>
              <select className={inputCls} value={preAuth} onChange={(e) => setPreAuth(e.target.value)}><option value="">—</option>
                {approved.map((a) => <option key={a.name} value={a.name}>{a.name} · {rs(a.approved_amount)}{a.valid_till ? ` · till ${a.valid_till}` : ""}</option>)}</select></Field>}
          </div>}
          <div className="grid gap-3 sm:grid-cols-3">
            {!!ctx?.flags.packages && <Field label="Package"><select className={inputCls} value={pkg} onChange={(e) => setPkg(e.target.value)}><option value="">None</option>
              {ctx?.packages.map((p) => <option key={p.name} value={p.name}>{p.name} · {rs(p.price)}</option>)}</select></Field>}
            <Field label="Planned days"><input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Agreed bed rate" hint={bedRow ? `Bed rate ${rs(bedRow.rate)}` : undefined}><input className={inputCls} inputMode="numeric" placeholder={bedRow ? String(bedRow.rate) : ""} value={rate}
              onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))} /></Field>
          </div>
          <Field label="Reason for admission"><textarea className={inputCls + " h-16 py-2"} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Chief complaint" /></Field>
          <Field label="Provisional diagnosis"><input className={inputCls} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></Field>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-emerald-800 p-4 text-white">
            <div className="text-xs uppercase tracking-widest text-white/70">Estimate · {Math.max(Number(days) || 1, 1)} day(s)</div>
            <div className="text-3xl font-black tabular-nums">{rs(estimate)}</div>
            <div className="mt-2 space-y-0.5 text-xs text-white/80">
              <div className="flex justify-between"><span>Bed</span><span>{rs(dayRate)}/day</span></div>
              {!!ward?.icu_surcharge_per_day && <div className="flex justify-between"><span>ICU surcharge</span><span>{rs(ward.icu_surcharge_per_day)}/day</span></div>}
              {!!ward?.nursing_charge_per_shift && <div className="flex justify-between"><span>Nursing</span><span>{rs(ward.nursing_charge_per_shift)}/shift</span></div>}
              <div className="pt-1 text-white/60">Medicines, labs and procedures are added as they happen.</div>
            </div>
          </div>
          {payerType === "Insurance" && needsAuth && <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs", preAuth ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
            : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200")}><ShieldCheck className="h-4 w-4 shrink-0" />
            {preAuth ? "Approved pre-auth attached." : "Insurance admissions need an approved pre-auth (Clinic Settings)."}</div>}
          <div className="rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold"><Wallet className="h-4 w-4 text-emerald-600" />Advance (optional)</div>
            <input className={inputCls + " text-end tabular-nums"} inputMode="numeric" placeholder="0" value={advance} onChange={(e) => setAdvance(e.target.value.replace(/\D/g, ""))} />
            <div className="mt-2 flex flex-wrap gap-1">{["Cash", "Card", "Bank Transfer", "JazzCash", "Easypaisa"].map((m) => <button key={m} onClick={() => setMode(m)}
              className={cn("rounded-md border px-2 py-0.5 text-[11px] font-semibold", mode === m ? "border-emerald-600 bg-emerald-600 text-white" : "border-border")}>{m}</button>)}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Taken in your cashier shift.</div>
          </div>
          <Button variant="submit" size="lg" className="w-full" disabled={!patient || !bed || !doctor || (payerType !== "Patient" && !payer) || (needsAuth && !preAuth)}
            loading={busy} onClick={() => void submit()}><CheckCircle2 className="h-5 w-5" />Admit</Button>
          <Button variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}
