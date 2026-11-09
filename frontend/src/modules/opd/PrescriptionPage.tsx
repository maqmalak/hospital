import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertOctagon, AlertTriangle, Copy, FileText, Mic, MicOff, PenLine, Plus, Printer, Save, Search, ShieldAlert, Stethoscope, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, getCall, humanizeError, useApi } from "@/lib/api";
import { printDoc } from "@/lib/print";
import { prescriptionHtml, type RxPrint } from "@/lib/templates";
import { Field, inputCls, PatientPicker, Pill, Section, Avatarish, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";

interface Med { item: string; item_name: string; generic?: string; strength?: string; form?: string; dose: string; frequency: string; route: string; duration: string; qty: number | string; instructions: string; no_substitution: number; override_reason?: string }
interface Alert { type: string; severity: string; message: string }
interface WS {
  patient: { name: string; patient_name: string; patient_name_ur?: string; gender: string; age?: number; phone: string; photo?: string; blood_group?: string; category: string;
    allergies: { allergy: string; severity?: string; reaction?: string }[]; conditions: { diagnosis: string; diagnosis_name: string }[]; long_term_medicines: { item: string; dose?: string }[] };
  queue: { name: string; token_no: number; status: string } | null;
  slip: Record<string, number | string> | null; vitals: Record<string, number | string>[];
  online_visit?: { name: string; complaint: string; symptoms?: string; duration?: string; conditions?: string; current_meds?: string; allergies_text?: string; video_link?: string; photos: string[] } | null;
  previous: { name: string; prescription_date: string; doctor_name: string; medicines: { item_name: string; dose?: string; frequency?: string; duration?: string }[]; diagnoses: string[] }[];
  prescription: (Record<string, unknown> & { name: string; docstatus: number; status: string; version_no: number; medicines: Med[]; diagnoses: { diagnosis: string; diagnosis_name: string }[]; lab_tests: { test_name: string; urgent?: number }[] }) | null;
  doctor: { name: string; doctor_name: string; revisit_days?: number } | null; templates: { name: string; template_name: string }[];
  favorites: (Med & { n: number })[];
}
const FREQS = ["1+0+1", "1+1+1", "1+0+0", "0+0+1", "0+1+0", "1+1+1+1", "SOS", "STAT"];
const ROUTES = ["Oral", "IV", "IM", "SC", "Topical", "Inhalation", "Eye", "Ear", "Nasal", "Rectal", "Sublingual"];
const LABS = ["CBC", "LFT", "RFT", "Blood sugar (fasting)", "HbA1c", "Lipid profile", "Urine R/E", "Typhidot", "Dengue NS1", "Malaria parasite", "TSH"];
const IMAGING = ["Chest X-ray", "ECG", "Ultrasound abdomen"];

export default function PrescriptionPage() {
  const [params, setParams] = useSearchParams();
  const queue = params.get("queue") || undefined;
  const rxParam = params.get("rx") || undefined;
  const ov = params.get("ov") || undefined;
  const [patientPick, setPatientPick] = useState<PatientHit | null>(null);
  const patient = params.get("patient") || patientPick?.name;
  if (!queue && !rxParam && !patient && !ov) {
    return <div className="mx-auto max-w-2xl"><Section title="Choose a patient"><PatientPicker autoFocus onPick={(p) => { setPatientPick(p); setParams({ patient: p.name }); }} /></Section></div>;
  }
  return <Workspace key={`${queue}-${rxParam}-${patient}-${ov}`} queue={queue} rx={rxParam} ov={ov} patient={queue || rxParam || ov ? undefined : patient} />;
}

function Workspace({ queue, rx, patient, ov }: { queue?: string; rx?: string; patient?: string; ov?: string }) {
  const { boot } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const { data: ws, refetch } = useApi<WS>("prescription.workspace", { queue_entry: queue, prescription: rx, patient, online_visit: ov }, { staleTime: 0 });
  const [name, setName] = useState<string | undefined>();
  const [meds, setMeds] = useState<Med[]>([]);
  const [alerts, setAlerts] = useState<{ alerts: Alert[]; blocking: boolean }[]>([]);
  const [dx, setDx] = useState<{ diagnosis: string; diagnosis_name: string }[]>([]);
  const [labs, setLabs] = useState<{ test_name: string; urgent?: number }[]>([]);
  // chips come from the lab's active test templates (signing turns them into a lab order)
  const { data: labCtx } = useApi<{ templates: { name: string; test_code: string; price: number }[] }>("lab.context", undefined, { retry: false, staleTime: 300_000 });
  const labChoices = [...(labCtx?.templates.map((x) => x.name) ?? LABS), ...IMAGING];
  const [notes, setNotes] = useState("");
  const [advice, setAdvice] = useState("");
  const [fuDays, setFuDays] = useState<string>("");
  const [signed, setSigned] = useState(false);
  const [amendFrom, setAmendFrom] = useState<{ name: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [amendDlg, setAmendDlg] = useState(false);

  useEffect(() => {
    if (!ws) return;
    const p = ws.prescription;
    setName(p?.name); setSigned(!!p && p.docstatus === 1);
    setMeds((p?.medicines ?? []).map((m) => ({ ...m, qty: m.qty ?? "" })));
    setDx(p?.diagnoses ?? []); setLabs(p?.lab_tests ?? []);
    setNotes(String(p?.examination_notes ?? "")); setAdvice(String(p?.advice ?? "")); setFuDays(String(p?.follow_up_days ?? ws.doctor?.revisit_days ?? ""));
  }, [ws]);

  // live safety check whenever the medicine list changes
  useEffect(() => {
    if (!ws || !meds.length) { setAlerts([]); return; }
    const id = setTimeout(() => void call<{ alerts: Alert[]; blocking: boolean }[]>("prescription.check", { patient: ws.patient.name, lines: meds, prescription: name }).then(setAlerts).catch(() => undefined), 200);
    return () => clearTimeout(id);
  }, [meds.map((m) => m.item + m.dose + m.frequency).join("|"), ws?.patient.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const addMed = (m: Partial<Med> & { item: string; item_name: string }) =>
    setMeds((ls) => [...ls, { dose: "1", frequency: "1+0+1", route: m.form === "Injection" ? "IV" : m.form === "Inhaler" ? "Inhalation" : m.form === "Cream" || m.form === "Ointment" ? "Topical" : "Oral",
      duration: "5 days", qty: "", instructions: "", no_substitution: 0, ...m } as Med]);
  const upd = (i: number, patch: Partial<Med>) => setMeds((ls) => ls.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const save = useCallback(async (sign: boolean) => {
    if (!ws) return;
    const blocked = alerts.findIndex((a, i) => a.blocking && !meds[i]?.override_reason?.trim());
    if (sign && blocked >= 0) { toast.error(`Line ${blocked + 1}: enter an override reason for the safety alert`); return; }
    setBusy(true);
    try {
      const doc = await call<{ name: string; docstatus: number }>("prescription.save", { sign: sign ? 1 : 0, data: {
        name, queue_entry: queue, online_visit: ov, patient: ws.patient.name, medicines: meds, diagnoses: dx, lab_tests: labs, examination_notes: notes, advice,
        follow_up_days: Number(fuDays) || undefined, amended_from: amendFrom?.name, amendment_reason: amendFrom?.reason } });
      setName(doc.name);
      if (sign) {
        toast.success(`Signed · ${doc.name}`); setSigned(true);
        await printRx(doc.name);
        if (queue) setTimeout(() => nav("/physician-queue"), 600);
        if (ov) setTimeout(() => nav("/ov-staff"), 600);
      } else toast.success("Draft saved");
    } catch (e) { toast.error(humanizeError(e), { duration: 8000 }); } finally { setBusy(false); }
  }, [ws, alerts, meds, dx, labs, notes, advice, fuDays, name, queue, ov, amendFrom, nav]);

  const printRx = async (rxName: string) => {
    const d = await getCall<Omit<RxPrint, "mr">>("hospital_vvs.api.prescription.print_data", { name: rxName });
    await printDoc(prescriptionHtml({ ...d, mr: ws!.patient.name }, boot?.print.prescription === "A5" ? "A5" : "A4"), "a4", { agent: !!boot?.print.agent });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !signed) { e.preventDefault(); void save(true); } if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); void save(false); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [save, signed]);

  if (!ws) return <div className="p-10 text-center text-muted-foreground">{t("Loading…")}</div>;
  const p = ws.patient;
  const v = ws.slip;
  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[320px_1fr]">
      {/* patient summary */}
      <aside className="space-y-3">
        <Section>
          <div className="flex items-center gap-3"><Avatarish name={p.patient_name} src={p.photo} size={14} />
            <div className="min-w-0"><div className="truncate text-lg font-bold">{p.patient_name}</div><div className="font-urdu text-sm text-muted-foreground">{p.patient_name_ur}</div>
              <div className="text-xs text-muted-foreground">{p.name} · {p.age}y · {t(p.gender)}{p.blood_group ? ` · ${p.blood_group}` : ""}</div></div></div>
          {ws.online_visit && <div className="mt-2 space-y-1 rounded-xl bg-indigo-50 p-2 text-xs dark:bg-indigo-500/10"><div className="font-bold text-indigo-800 dark:text-indigo-200">Online visit {ws.online_visit.name}</div>
            <div>{ws.online_visit.complaint}</div>{ws.online_visit.symptoms && <div className="text-muted-foreground">{ws.online_visit.symptoms}{ws.online_visit.duration ? ` · ${ws.online_visit.duration}` : ""}</div>}
            {ws.online_visit.current_meds && <div><b>Taking:</b> {ws.online_visit.current_meds}</div>}{ws.online_visit.allergies_text && <div className="text-rose-700"><b>Says allergic to:</b> {ws.online_visit.allergies_text}</div>}
            {ws.online_visit.video_link && <a href={ws.online_visit.video_link} target="_blank" rel="noreferrer" className="inline-block rounded-lg bg-indigo-600 px-2 py-1 font-semibold text-white">Open video call</a>}</div>}
          {ws.queue && <div className="mt-2 flex items-center gap-2 text-sm"><span className="rounded-lg bg-primary/10 px-2 py-0.5 font-bold text-primary">Token {ws.queue.token_no}</span><Pill value={ws.queue.status} /></div>}
        </Section>
        <Section title={<span className="flex items-center gap-1 text-rose-700 dark:text-rose-300"><ShieldAlert className="h-4 w-4" />{t("Allergies")}</span>}>
          {p.allergies.length ? <div className="flex flex-wrap gap-1.5">{p.allergies.map((a) => <span key={a.allergy} className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">{a.allergy}{a.severity ? ` · ${a.severity}` : ""}</span>)}</div> : <span className="text-sm text-muted-foreground">NKDA — no known drug allergies</span>}
          {p.conditions.length > 0 && <div className="mt-3 text-sm"><div className="text-xs font-semibold text-muted-foreground">{t("Chronic conditions")}</div>{p.conditions.map((c) => <div key={c.diagnosis}>{c.diagnosis_name}</div>)}</div>}
          {p.long_term_medicines.length > 0 && <div className="mt-3 text-sm"><div className="text-xs font-semibold text-muted-foreground">{t("Long-term medicines")}</div>{p.long_term_medicines.map((m) => <div key={m.item}>{m.item} {m.dose}</div>)}</div>}
        </Section>
        {v && <Section title={t("Vitals")}>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([["BP", v.bp_systolic ? `${v.bp_systolic}/${v.bp_diastolic}` : ""], ["Pulse", v.pulse], ["Temp", v.temperature ? `${v.temperature}°` : ""], ["SpO₂", v.spo2 ? `${v.spo2}%` : ""], ["Wt", v.weight], ["RBS", v.rbs]] as const).filter(([, x]) => x).map(([k, x]) => (
              <div key={k} className="rounded-lg bg-muted p-2"><div className="text-[10px] uppercase text-muted-foreground">{k}</div><div className="font-bold tabular-nums">{x}</div></div>))}
          </div>
          {v.chief_complaint && <div className="mt-2 text-sm"><span className="text-xs text-muted-foreground">{t("Chief complaint")}: </span>{v.chief_complaint}</div>}
        </Section>}
        <Section title="Previous prescriptions">
          {ws.previous.length ? ws.previous.map((r) => (
            <div key={r.name} className="mb-2 rounded-xl border border-border p-2 text-xs">
              <div className="flex justify-between font-semibold"><span>{r.prescription_date}</span><span className="text-muted-foreground">{r.doctor_name}</span></div>
              {r.diagnoses.length > 0 && <div className="text-muted-foreground">{r.diagnoses.join(", ")}</div>}
              {r.medicines.map((m, i) => <div key={i}>• {m.item_name} {m.frequency} {m.duration}</div>)}
            </div>)) : <p className="text-sm text-muted-foreground">First visit.</p>}
        </Section>
      </aside>

      {/* prescription */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 text-white"><Stethoscope className="h-5 w-5" /></span>
          <h1 className="flex-1 text-xl font-bold">{t("Prescription workspace")} {name && <span className="font-mono text-sm text-muted-foreground">{name}</span>}
            {ws.prescription && ws.prescription.version_no > 1 && <Pill value={`v${ws.prescription.version_no}`} className="ms-2 bg-orange-100 text-orange-800" />}
            {amendFrom && <Pill value="Draft" className="ms-2" />}</h1>
          {!signed && <>
            <select className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm" value="" onChange={async (e) => {
              const tpl = await getCall<{ medicines: Med[]; diagnoses: { diagnosis: string; diagnosis_name: string }[]; advice?: string }>("hospital_vvs.api.prescription.get_template", { name: e.target.value });
              setMeds((m) => [...m, ...tpl.medicines]); setDx((d) => [...d, ...tpl.diagnoses]); if (tpl.advice) setAdvice(tpl.advice); }}>
              <option value="">Templates…</option>{ws.templates.map((x) => <option key={x.name} value={x.name}>{x.template_name}</option>)}</select>
            <Button size="sm" variant="outline" disabled={!ws.previous.length} onClick={async () => {
              const r = await getCall<{ medicines: Med[]; diagnoses: { diagnosis: string; diagnosis_name: string }[]; advice?: string }>("hospital_vvs.api.prescription.copy_previous", { patient: p.name });
              setMeds(r.medicines.map((m) => ({ ...m, qty: m.qty ?? "" }))); setDx(r.diagnoses); setAdvice(r.advice ?? ""); toast.success("Copied the previous prescription"); }}><Copy className="h-4 w-4" />Copy previous</Button>
            <Button size="sm" variant="outline" onClick={async () => { const n = prompt("Template name"); if (n) { await call("prescription.save_template", { template_name: n, data: { medicines: meds, diagnoses: dx, advice } }); toast.success("Template saved"); void refetch(); } }}><FileText className="h-4 w-4" />Save as template</Button>
          </>}
        </div>

        {signed && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <PenLine className="h-4 w-4 text-emerald-700" /><span className="flex-1">Signed — this prescription can no longer be edited. Corrections are made as an amended version.</span>
          <Button size="sm" variant="outline" onClick={() => name && void printRx(name)}><Printer className="h-4 w-4" />{t("Print")}</Button>
          <Button size="sm" variant="workflow" onClick={() => setAmendDlg(true)}>{t("Amend")}</Button></div>}

        <Section title={t("Medicines")}>
          {!signed && <MedicineSearch onAdd={addMed} favorites={ws.favorites} />}
          <div className="mt-3 space-y-2">
            {meds.map((m, i) => {
              const a = alerts[i];
              return (
                <div key={i} className={cn("rounded-xl border p-3", a?.blocking ? "border-rose-400 bg-rose-50/60 dark:bg-rose-500/10" : a?.alerts.length ? "border-amber-300 bg-amber-50/60 dark:bg-amber-500/10" : "border-border")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                    <div className="min-w-[180px] flex-1"><div className="font-semibold">{m.item_name}</div><div className="text-xs text-muted-foreground">{m.generic} {m.strength}</div></div>
                    <input disabled={signed} className="h-9 w-16 rounded-md border border-input bg-transparent px-2 text-sm" value={m.dose} onChange={(e) => upd(i, { dose: e.target.value })} title={t("Dose")} />
                    <input disabled={signed} list="freqs" className="h-9 w-24 rounded-md border border-input bg-transparent px-2 text-sm" value={m.frequency} onChange={(e) => upd(i, { frequency: e.target.value })} title={t("Frequency")} />
                    <select disabled={signed} className="h-9 rounded-md border border-input bg-transparent px-1 text-sm" value={m.route} onChange={(e) => upd(i, { route: e.target.value })}>{ROUTES.map((r) => <option key={r}>{r}</option>)}</select>
                    <input disabled={signed} className="h-9 w-24 rounded-md border border-input bg-transparent px-2 text-sm" value={m.duration} onChange={(e) => upd(i, { duration: e.target.value })} title={t("Duration")} />
                    <input disabled={signed} className="h-9 w-16 rounded-md border border-input bg-transparent px-2 text-sm" placeholder="Qty" value={m.qty} onChange={(e) => upd(i, { qty: e.target.value })} />
                    {!signed && <button onClick={() => setMeds((ls) => ls.filter((_, j) => j !== i))} className="p-1 text-destructive"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input disabled={signed} className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-xs" placeholder={t("Instructions") + " (e.g. after meals)"} value={m.instructions} onChange={(e) => upd(i, { instructions: e.target.value })} />
                    <label className="flex items-center gap-1 text-xs"><input disabled={signed} type="checkbox" checked={!!m.no_substitution} onChange={(e) => upd(i, { no_substitution: e.target.checked ? 1 : 0 })} className="accent-teal-600" />No substitution</label>
                  </div>
                  {a?.alerts.length ? (
                    <div className="mt-2 space-y-1">
                      {a.alerts.map((x, k) => <div key={k} className={cn("flex items-start gap-1.5 text-xs font-medium", a.blocking && (x.type === "Allergy" || ["Major", "Contraindicated"].includes(x.severity)) ? "text-rose-700 dark:text-rose-300" : "text-amber-800 dark:text-amber-300")}>
                        {x.type === "Allergy" || ["Major", "Contraindicated"].includes(x.severity) ? <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span><b>{x.type}{x.severity !== x.type && x.severity !== "Allergy" ? ` · ${x.severity}` : ""}:</b> {x.message}</span></div>)}
                      {a.blocking && <input disabled={signed} className="h-8 w-full rounded-md border border-rose-300 bg-white px-2 text-xs dark:bg-transparent" placeholder={`${t("Override reason")} (required to sign)`} value={m.override_reason ?? ""} onChange={(e) => upd(i, { override_reason: e.target.value })} />}
                    </div>) : null}
                </div>);
            })}
            {!meds.length && <p className="py-4 text-center text-sm text-muted-foreground">Type a brand or generic name above. ↑↓ to choose, Enter to add.</p>}
          </div>
          <datalist id="freqs">{FREQS.map((f) => <option key={f} value={f} />)}</datalist>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title={t("Diagnosis") + " (ICD-10)"}>
            {!signed && <DiagnosisSearch onAdd={(d) => setDx((x) => (x.some((y) => y.diagnosis === d.diagnosis) ? x : [...x, d]))} />}
            <div className="mt-2 flex flex-wrap gap-1.5">{dx.map((d) => <span key={d.diagnosis} className="flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">{d.diagnosis_name} <span className="opacity-60">{d.diagnosis}</span>
              {!signed && <button onClick={() => setDx((x) => x.filter((y) => y.diagnosis !== d.diagnosis))}><X className="h-3 w-3" /></button>}</span>)}</div>
          </Section>
          <Section title={t("Lab tests")}>
            {!signed && <div className="flex flex-wrap gap-1.5">{labChoices.filter((l) => !labs.some((x) => x.test_name === l)).map((l) => <button key={l} onClick={() => setLabs((x) => [...x, { test_name: l }])} className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs hover:border-primary hover:text-primary">+ {l}</button>)}</div>}
            <div className="mt-2 flex flex-wrap gap-1.5">{labs.map((l) => <span key={l.test_name} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", l.urgent ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" : "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200")}>{l.test_name}
              {!signed && <button title="Urgent" onClick={() => setLabs((x) => x.map((y) => (y.test_name === l.test_name ? { ...y, urgent: y.urgent ? 0 : 1 } : y)))} className="rounded px-1 text-[10px] font-bold">{l.urgent ? "URGENT" : "routine"}</button>}
              {!signed && <button onClick={() => setLabs((x) => x.filter((y) => y.test_name !== l.test_name))}><X className="h-3 w-3" /></button>}</span>)}</div>
          </Section>
        </div>

        <Section>
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Examination notes"><Dictate value={notes} onChange={setNotes} disabled={signed} /></Field>
            <Field label="Advice"><Dictate value={advice} onChange={setAdvice} disabled={signed} /></Field>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Follow-up (days)"><div className="flex gap-1">{[3, 5, 7, 14, 30].map((d) => <button key={d} disabled={signed} onClick={() => setFuDays(String(d))} className={cn("h-9 rounded-lg border px-3 text-sm", fuDays === String(d) ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>{d}</button>)}
              <input disabled={signed} className="h-9 w-16 rounded-lg border border-input bg-transparent px-2 text-sm" value={fuDays} onChange={(e) => setFuDays(e.target.value.replace(/\D/g, ""))} /></div></Field>
            <div className="flex-1" />
            {!signed && <>
              <Button variant="outline" loading={busy} onClick={() => void save(false)}><Save className="h-4 w-4" />{t("Save draft")} <kbd className="text-[10px] opacity-60">Ctrl+S</kbd></Button>
              <Button variant="submit" size="lg" loading={busy} onClick={() => void save(true)}><PenLine className="h-4 w-4" />{t("Sign & print")} <kbd className="text-[10px] opacity-70">Ctrl+↵</kbd></Button>
            </>}
          </div>
        </Section>
      </section>

      <AmendDialog open={amendDlg} onClose={() => setAmendDlg(false)} onAmend={async (reason) => {
        try {
          const doc = await call<{ name: string }>("prescription.amend", { name, reason });
          setAmendDlg(false); setAmendFrom(null); toast.success(`Amendment draft ${doc.name} — edit and sign`);
          nav(`/pw-prescription?rx=${doc.name}`);
        } catch (e) { toast.error(humanizeError(e)); }
      }} />
    </div>
  );
}

function MedicineSearch({ onAdd, favorites }: { onAdd: (m: Med) => void; favorites: (Med & { n: number })[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Med[]>([]);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const id = setTimeout(() => void getCall<Med[]>("hospital_vvs.api.prescription.search_medicines", { q }).then((r) => { setHits(r); setActive(0); }), 150);
    return () => clearTimeout(id);
  }, [q]);
  const add = (m: Med) => { onAdd(m); setQ(""); setHits([]); ref.current?.focus(); };
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input ref={ref} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Medicine — brand or generic"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); } if (e.key === "Enter" && hits[active]) { e.preventDefault(); add(hits[active]); } }}
          className="h-11 flex-1 bg-transparent text-sm outline-none" />
      </div>
      {hits.length > 0 && <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-xl">
        {hits.map((h, i) => <button key={h.item} onMouseDown={(e) => { e.preventDefault(); add(h); }} className={cn("flex w-full items-center justify-between px-3 py-2 text-start text-sm", i === active && "bg-accent")}>
          <span><b>{h.item_name}</b> <span className="text-muted-foreground">{h.generic} · {h.form}</span></span>{(h as unknown as { rx_required?: number }).rx_required ? <span className="text-[10px] font-bold text-rose-600">Rx</span> : null}</button>)}</div>}
      {favorites.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{favorites.slice(0, 10).map((f) => (
        <button key={f.item} onClick={() => add({ ...f, qty: "", instructions: "", no_substitution: 0 })} className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-200"><Plus className="inline h-3 w-3" /> {f.item_name}</button>))}</div>}
    </div>
  );
}

function DiagnosisSearch({ onAdd }: { onAdd: (d: { diagnosis: string; diagnosis_name: string }) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ name: string; diagnosis_name: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const id = setTimeout(() => void getCall<{ name: string; diagnosis_name: string }[]>("hospital_vvs.api.prescription.search_diagnoses", { q }).then(setHits), 150);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <div className="relative">
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ICD-10 code or name"
        onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { onAdd({ diagnosis: hits[0].name, diagnosis_name: hits[0].diagnosis_name }); setQ(""); } }} />
      {hits.length > 0 && <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-xl">
        {hits.map((h) => <button key={h.name} onMouseDown={(e) => { e.preventDefault(); onAdd({ diagnosis: h.name, diagnosis_name: h.diagnosis_name }); setQ(""); }} className="block w-full px-3 py-2 text-start text-sm hover:bg-accent"><b>{h.name}</b> {h.diagnosis_name}</button>)}</div>}
    </div>
  );
}

/** Textarea with browser voice dictation (Web Speech API; English or Urdu by UI language). */
function Dictate({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { i18n } = useTranslation();
  const [on, setOn] = useState(false);
  const rec = useRef<{ stop: () => void } | null>(null);
  const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition
    || (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
  const toggle = () => {
    if (on) { rec.current?.stop(); setOn(false); return; }
    if (!SR) { toast.error("Voice dictation is not supported in this browser"); return; }
    const r = new SR() as { lang: string; continuous: boolean; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string }; isFinal: boolean }[] & { length: number }; resultIndex: number }) => void; onend: () => void; start: () => void; stop: () => void };
    r.lang = i18n.language === "ur" ? "ur-PK" : "en-PK"; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onChange((value ? value + " " : "") + e.results[i][0].transcript); };
    r.onend = () => setOn(false);
    r.start(); rec.current = r; setOn(true);
  };
  return (
    <div className="relative">
      <textarea disabled={disabled} className={inputCls + " h-24 py-2 pe-10"} value={value} onChange={(e) => onChange(e.target.value)} />
      {!disabled && <button type="button" onClick={toggle} className={cn("absolute end-2 top-2 rounded-md p-1.5", on ? "animate-pulse bg-rose-600 text-white" : "text-muted-foreground hover:bg-muted")} title="Dictate">{on ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>}
    </div>
  );
}

function AmendDialog({ open, onClose, onAmend }: { open: boolean; onClose: () => void; onAmend: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title="Amend prescription" description="The signed version is kept as Superseded. The new version prints “Amended — version N”." size="sm">
      <Field label="Reason" required><textarea className={inputCls + " h-20 py-2"} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Button variant="workflow" className="mt-3 w-full" disabled={!reason.trim()} onClick={() => onAmend(reason)}>Create amended version</Button>
    </Dialog>
  );
}
