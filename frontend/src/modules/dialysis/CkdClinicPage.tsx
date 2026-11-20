/** Nephrology OPD / CKD clinic (D-99): pick a patient, see renal lab trends from the Lab module and previous CKD visits, record a nephrology
 *  consultation (saved on the hospital's Prescription with its CKD section), print the CKD follow-up summary, and "Start dialysis". */
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Droplets, FileText, Save, Stethoscope } from "lucide-react";
import { call, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, PageHeader, PatientPicker, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { humanizeError } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { LabTrends, type Trends } from "./LabTrends";
import { fmtDate, openDoc, RENAL_HEADER } from "./shared";

interface Clinic { patient: { name: string; patient_name: string; gender?: string; phone?: string }; age?: number; labs: Trends; dialysis?: { name: string; status: string; sched_days?: string; sched_shift?: string } | null;
  visits: { name: string; prescription_date: string; doctor_name?: string; ckd_stage?: string; ckd_cause?: string; neph_bp?: string; neph_weight?: number; neph_oedema?: string; neph_urine_output?: string; advice?: string; follow_up_date?: string }[] }

export default function CkdClinicPage() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { hasRole } = useAuth();
  const patient = sp.get("patient") ?? "";
  const [pick, setPick] = useState<PatientHit | null>(null);
  const { data, refetch } = useApi<Clinic>("dialysis.ckd_clinic", { patient }, { enabled: !!patient });
  const last = data?.visits[0];
  const [f, setF] = useState<Record<string, string>>({ ckd_stage: "", ckd_cause: "", bp: "", weight: "", oedema: "", urine_output: "", comorbidities: "", notes: "", plan: "", follow_up_days: "30" });
  const canWrite = hasRole("PW Nephrologist", "PW Doctor");
  const save = async () => {
    try { const r = await call<{ name: string }>("dialysis.save_ckd_visit", { patient, data: f }); toast.success(`Consultation saved · ${r.name}`); void refetch(); }
    catch (e) { toast.error(humanizeError(e), { duration: 8000 }); }
  };
  const start = async () => {
    try { const r = await call<{ name: string }>("dialysis.start_from_opd", { patient, prescription: last?.name }); toast.success("Dialysis profile created"); nav(`/dialysis/patient/${r.name}`); }
    catch (e) { toast.error(humanizeError(e), { duration: 8000 }); }
  };
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Nephrology · CKD clinic" icon={Stethoscope} color={RENAL_HEADER} subtitle="Kidney function trends, CKD staging and the decision to start dialysis"
        actions={<Link to="/dialysis"><Button variant="outline" size="sm"><Droplets className="h-4 w-4" />Dialysis board</Button></Link>} />
      <div className="mb-4 max-w-xl"><PatientPicker value={pick} onPick={(p) => { setPick(p); setSp({ patient: p.name }); }} onClear={() => { setPick(null); setSp({}); }} placeholder="Search patient by name, MR, phone or CNIC" /></div>
      {!patient ? <Empty title="Choose a patient" hint="Lab trends come straight from the Lab module." icon={Stethoscope} /> : !data ? <p className="text-sm text-muted-foreground">Loading…</p> : <>
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="min-w-0 flex-1"><div className="text-lg font-black">{data.patient.patient_name}</div><div className="text-sm text-muted-foreground">{data.patient.name} · {data.age ?? "—"}y {data.patient.gender ?? ""}{last?.ckd_stage ? ` · CKD stage ${last.ckd_stage}` : ""}{last?.ckd_cause ? ` (${last.ckd_cause})` : ""}</div></div>
          <Button variant="outline" onClick={() => openDoc("ckd", patient)}><FileText className="h-4 w-4" />CKD summary</Button>
          {data.dialysis ? <Link to={`/dialysis/patient/${data.dialysis.name}`}><Button variant="workflow"><Droplets className="h-4 w-4" />On dialysis · {data.dialysis.sched_days ?? data.dialysis.status}</Button></Link>
            : hasRole("PW Nephrologist", "PW Dialysis In-charge") && <Button variant="workflow" onClick={() => void start()}><Droplets className="h-4 w-4" />Start dialysis</Button>}
        </div>
        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="mb-3 font-bold">Renal lab trends</h2><LabTrends data={data.labs} /></section>
          <div className="space-y-4">
            {canWrite && <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-3 font-bold">Nephrology consultation</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="CKD stage"><select className={inputCls} value={f.ckd_stage} onChange={(e) => set("ckd_stage", e.target.value)}>{["", "1", "2", "3a", "3b", "4", "5", "5D", "AKI"].map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select></Field>
                <Field label="Cause"><select className={inputCls} value={f.ckd_cause} onChange={(e) => set("ckd_cause", e.target.value)}>{["", "Diabetic", "Hypertensive", "Glomerulonephritis", "Obstructive", "Polycystic", "AKI", "Unknown", "Other"].map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select></Field>
                <Field label="BP"><input className={inputCls} value={f.bp} onChange={(e) => set("bp", e.target.value)} placeholder="150/90" /></Field>
                <Field label="Weight (kg)"><input className={inputCls} type="number" value={f.weight} onChange={(e) => set("weight", e.target.value)} /></Field>
                <Field label="Oedema"><select className={inputCls} value={f.oedema} onChange={(e) => set("oedema", e.target.value)}>{["", "None", "Mild (ankle)", "Moderate (leg)", "Severe / anasarca"].map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select></Field>
                <Field label="Urine output / day"><input className={inputCls} value={f.urine_output} onChange={(e) => set("urine_output", e.target.value)} placeholder="~800 mL" /></Field>
                <Field label="Comorbidities" className="col-span-2"><input className={inputCls} value={f.comorbidities} onChange={(e) => set("comorbidities", e.target.value)} placeholder="Diabetes, hypertension, IHD" /></Field>
                <Field label="Findings / medicines" className="col-span-2"><textarea className={cn(inputCls, "h-20 py-2")} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
                <Field label="Plan" className="col-span-2"><textarea className={cn(inputCls, "h-20 py-2")} value={f.plan} onChange={(e) => set("plan", e.target.value)} placeholder="e.g. RFTs + electrolytes in 4 weeks; AV fistula referral; low-salt diet" /></Field>
                <Field label="Follow-up (days)"><input className={inputCls} type="number" value={f.follow_up_days} onChange={(e) => set("follow_up_days", e.target.value)} /></Field>
              </div>
              <Button variant="save" className="mt-3 w-full" onClick={() => void save()}><Save className="h-4 w-4" />Save consultation</Button>
              <p className="mt-2 text-xs text-muted-foreground">Saved as a prescription (CKD section) — medicines are added in the usual prescription screen and print on the existing prescription pad.</p>
            </section>}
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="mb-2 font-bold">Previous visits</h2>
              {data.visits.length ? <ul className="space-y-2 text-sm">{data.visits.map((v) => <li key={v.name} className="rounded-xl border border-border p-2"><div className="flex justify-between"><b>{fmtDate(v.prescription_date, { day: "numeric", month: "short", year: "numeric" })}</b><span className="text-xs text-muted-foreground">{v.doctor_name}</span></div>
                <div className="text-xs">{v.ckd_stage ? `Stage ${v.ckd_stage}` : ""} {v.ckd_cause ?? ""} {v.neph_bp ? `· BP ${v.neph_bp}` : ""} {v.neph_oedema ? `· oedema ${v.neph_oedema}` : ""}</div>{v.advice && <div className="mt-1 text-xs text-muted-foreground">{v.advice}</div>}</li>)}</ul>
                : <p className="text-sm text-muted-foreground">No visits yet.</p>}
            </section>
          </div>
        </div>
      </>}
    </div>
  );
}
