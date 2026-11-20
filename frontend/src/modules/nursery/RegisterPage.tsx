/** Register newborn(s) against the mother's MR (D-95): single, twins or triplets; each baby gets its own MR, ID band, security tag and cot. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Baby, BedDouble, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { call, useApi } from "@/lib/api";
import { humanizeError } from "@/services/frappe";
import { Field, inputCls, PageHeader, PatientPicker, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { UNITS } from "./shared";

interface Ctx { doctors: { name: string; doctor_name: string; department: string }[]; free: Record<string, { name: string; bed_no: string; ward: string }[]> }
interface MotherInfo { name: string; patient_name: string; phone?: string; admission?: { name: string; ward: string; bed: string } | null; babies: { name: string; baby_name: string; birth_datetime: string }[] }
interface B { sex: string; birth_weight_g: string; length_cm: string; head_circ_cm: string; apgar_1: string; apgar_5: string; blood_group: string; baby_name: string; tag_no: string; cot: string; nicu_reason: string }
const blank = (): B => ({ sex: "", birth_weight_g: "", length_cm: "", head_circ_cm: "", apgar_1: "", apgar_5: "", blood_group: "Pending", baby_name: "", tag_no: "", cot: "", nicu_reason: "" });
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function RegisterPage() {
  const nav = useNavigate();
  const { data: ctx } = useApi<Ctx>("nursery.context");
  const [mother, setMother] = useState<PatientHit | null>(null);
  const [info, setInfo] = useState<MotherInfo | null>(null);
  const [f, setF] = useState({ birth_datetime: nowLocal(), delivery_type: "Normal vaginal", place_of_birth: "This hospital", gestation_weeks: "", gestation_days: "0", unit: "Rooming-in", attending_doctor: "", obstetrician: "", father_name: "", mother_phone: "", photo_consent: false });
  const [babies, setBabies] = useState<B[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const pick = async (p: PatientHit) => { setMother(p); try { const i = await call<MotherInfo>("nursery.mother_info", { mother: p.name }); setInfo(i); setF((x) => ({ ...x, mother_phone: i.phone ?? "" })); } catch (e) { toast.error(humanizeError(e)); } };
  const setB = (i: number, k: keyof B, v: string) => setBabies((xs) => xs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const peds = (ctx?.doctors ?? []).filter((d) => d.department === "Paediatrics");
  const obs = (ctx?.doctors ?? []).filter((d) => d.department !== "Paediatrics");
  const cots = ctx?.free[f.unit] ?? [];
  const ok = !!mother && babies.every((b) => b.sex && Number(b.birth_weight_g) > 300) && !!f.birth_datetime;
  const submit = async () => {
    setBusy(true);
    try {
      const names = await call<string[]>("nursery.register", { data: JSON.stringify({ ...f, mother: mother!.name, gestation_weeks: Number(f.gestation_weeks) || null, gestation_days: Number(f.gestation_days) || 0,
        photo_consent: f.photo_consent ? 1 : 0, birth_datetime: f.birth_datetime.replace("T", " ") + ":00",
        babies: babies.map((b) => ({ ...b, birth_weight_g: Number(b.birth_weight_g), length_cm: Number(b.length_cm) || null, head_circ_cm: Number(b.head_circ_cm) || null,
          apgar_1: b.apgar_1 === "" ? null : Number(b.apgar_1), apgar_5: b.apgar_5 === "" ? null : Number(b.apgar_5), cot: b.cot || null })) }) });
      toast.success(names.length > 1 ? `${names.length} babies registered` : "Baby registered");
      nav(`/nursery/baby/${names[0]}`);
    } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Register a newborn" icon={Baby} subtitle="Linked to the mother's MR · each baby gets its own MR, ID band, security tag and cot" />
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-primary">Mother</h2>
          <PatientPicker value={mother} onPick={(p) => void pick(p)} onClear={() => { setMother(null); setInfo(null); }} autoFocus placeholder="Search mother by name, MR no., phone or CNIC" />
          {info && <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">MR</div><b>{info.name}</b></div>
            <div className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">Admission</div><b>{info.admission ? `${info.admission.ward} · ${info.admission.name}` : "Not admitted"}</b></div>
            <div className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">Earlier babies here</div><b>{info.babies.length || "None"}</b></div>
          </div>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-primary">Delivery</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Date & time of birth" required><input type="datetime-local" className={inputCls} value={f.birth_datetime} max={nowLocal()} onChange={(e) => setF({ ...f, birth_datetime: e.target.value })} /></Field>
            <Field label="Delivery type"><select className={inputCls} value={f.delivery_type} onChange={(e) => setF({ ...f, delivery_type: e.target.value })}>{["Normal vaginal", "Assisted (vacuum / forceps)", "C-section (elective)", "C-section (emergency)", "Born before arrival"].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Gestation (weeks + days)"><div className="flex gap-2"><input className={inputCls} inputMode="numeric" value={f.gestation_weeks} onChange={(e) => setF({ ...f, gestation_weeks: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="39" />
              <input className={cn(inputCls, "w-20")} inputMode="numeric" value={f.gestation_days} onChange={(e) => setF({ ...f, gestation_days: e.target.value.replace(/\D/g, "").slice(0, 1) })} placeholder="+0" /></div></Field>
            <Field label="Place of birth"><select className={inputCls} value={f.place_of_birth} onChange={(e) => setF({ ...f, place_of_birth: e.target.value })}><option>This hospital</option><option>Born outside (transferred)</option></select></Field>
            <Field label="Attending paediatrician"><select className={inputCls} value={f.attending_doctor} onChange={(e) => setF({ ...f, attending_doctor: e.target.value })}><option value="">—</option>{peds.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select></Field>
            <Field label="Obstetrician"><select className={inputCls} value={f.obstetrician} onChange={(e) => setF({ ...f, obstetrician: e.target.value })}><option value="">—</option>{obs.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select></Field>
            <Field label="Father's / husband's name"><input className={inputCls} value={f.father_name} onChange={(e) => setF({ ...f, father_name: e.target.value })} /></Field>
            <Field label="Mother's mobile (portal & reminders)"><input className={inputCls} value={f.mother_phone} onChange={(e) => setF({ ...f, mother_phone: e.target.value })} dir="ltr" /></Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className="text-xs font-semibold text-muted-foreground">Placement</span>
            {UNITS.map((u) => <button key={u} type="button" onClick={() => setF({ ...f, unit: u })} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", f.unit === u ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{u} <span className="text-xs opacity-70">({ctx?.free[u]?.length ?? 0} free)</span></button>)}
            <label className="ms-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={f.photo_consent} onChange={(e) => setF({ ...f, photo_consent: e.target.checked })} className="h-4 w-4" />Parents consent to photos in My Baby</label>
          </div>
        </section>

        {babies.map((b, i) => (
          <section key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2"><h2 className="flex-1 text-xs font-bold uppercase tracking-[0.12em] text-primary">{babies.length > 1 ? `Baby ${"ABC"[i]}` : "Baby"}</h2>
              {babies.length > 1 && <Button size="xs" variant="ghost" onClick={() => setBabies((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove baby"><Trash2 className="h-4 w-4" /></Button>}</div>
            <div className="grid gap-3 md:grid-cols-6">
              <Field label="Sex" required className="md:col-span-2"><div className="grid grid-cols-3 gap-1.5">{["Male", "Female", "Indeterminate"].map((s) => <button key={s} type="button" onClick={() => setB(i, "sex", s)} className={cn("rounded-lg border px-1 py-2 text-xs font-semibold", b.sex === s ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{s}</button>)}</div></Field>
              <Field label="Birth weight (g)" required><input className={inputCls} inputMode="numeric" value={b.birth_weight_g} onChange={(e) => setB(i, "birth_weight_g", e.target.value.replace(/\D/g, ""))} placeholder="3200" /></Field>
              <Field label="Length (cm)"><input className={inputCls} inputMode="decimal" value={b.length_cm} onChange={(e) => setB(i, "length_cm", e.target.value)} /></Field>
              <Field label="Head circ. (cm)"><input className={inputCls} inputMode="decimal" value={b.head_circ_cm} onChange={(e) => setB(i, "head_circ_cm", e.target.value)} /></Field>
              <Field label="Blood group"><select className={inputCls} value={b.blood_group} onChange={(e) => setB(i, "blood_group", e.target.value)}>{["Pending", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Apgar 1 min"><input className={inputCls} inputMode="numeric" value={b.apgar_1} onChange={(e) => setB(i, "apgar_1", e.target.value.replace(/\D/g, "").slice(0, 2))} /></Field>
              <Field label="Apgar 5 min"><input className={inputCls} inputMode="numeric" value={b.apgar_5} onChange={(e) => setB(i, "apgar_5", e.target.value.replace(/\D/g, "").slice(0, 2))} /></Field>
              <Field label="Name (optional)" className="md:col-span-2" hint={`Empty = "Baby ${babies.length > 1 ? "ABC"[i] + " " : ""}of ${mother?.patient_name ?? "mother"}"`}><input className={inputCls} value={b.baby_name} onChange={(e) => setB(i, "baby_name", e.target.value)} /></Field>
              <Field label="Security tag no."><input className={inputCls} value={b.tag_no} onChange={(e) => setB(i, "tag_no", e.target.value)} placeholder="auto" /></Field>
              <Field label="Cot"><select className={inputCls} value={b.cot} onChange={(e) => setB(i, "cot", e.target.value)}><option value="">First free</option>{cots.map((c) => <option key={c.name} value={c.name}>{c.bed_no} · {c.ward}</option>)}</select></Field>
              {f.unit === "NICU" && <Field label="NICU reason" className="md:col-span-2"><select className={inputCls} value={b.nicu_reason} onChange={(e) => setB(i, "nicu_reason", e.target.value)}><option value="">—</option>{["Prematurity", "Respiratory distress", "Neonatal jaundice", "Suspected sepsis", "Low birth weight", "Hypoglycaemia", "Birth asphyxia", "Congenital anomaly", "Other"].map((x) => <option key={x}>{x}</option>)}</select></Field>}
            </div>
          </section>))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" disabled={babies.length >= 3} onClick={() => setBabies((xs) => [...xs, blank()])}><Plus className="h-4 w-4" />Add {babies.length === 1 ? "twin" : "triplet"}</Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />ID bands and tags are applied and logged on registration · <BedDouble className="h-4 w-4" />cot admission starts the cot charges on the IPD bill</div>
          <Button variant="submit" disabled={!ok || busy} onClick={() => void submit()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Baby className="h-4 w-4" />}Register {babies.length > 1 ? `${babies.length} babies` : "baby"}</Button>
        </div>
      </div>
    </div>
  );
}
