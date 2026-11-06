import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CreditCard, FilePlus2, Plus, Trash2, UserPlus, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, getCall, humanizeError } from "@/lib/api";
import { Field, inputCls, PageHeader, PatientPicker, Pill, Section, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { printCard } from "./shared";

interface Form { [k: string]: unknown; patient_name: string; patient_name_ur: string; relation_type: string; guardian_name: string; gender: string;
  dob: string; age: string; phone: string; alt_phone: string; cnic: string; address: string; city: string; category: string; blood_group: string;
  preferred_language: string; panel: string; employee_id: string; insurance_provider: string; policy_no: string;
  allergies: { allergy: string; severity: string; reaction: string }[]; wa: boolean; sms: boolean; data: boolean; household: boolean }

const EMPTY: Form = { patient_name: "", patient_name_ur: "", relation_type: "S/O", guardian_name: "", gender: "", dob: "", age: "", phone: "", alt_phone: "",
  cnic: "", address: "", city: "Lahore", category: "Normal", blood_group: "", preferred_language: "ur", panel: "", employee_id: "", insurance_provider: "",
  policy_no: "", allergies: [], wa: true, sms: true, data: true, household: true };

interface Dup extends PatientHit { reason: string; score: number }

export default function RegistrationPage() {
  const { boot, branch } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [f, setF] = useState<Form>(EMPTY);
  const [dups, setDups] = useState<Dup[]>([]);
  const [showDup, setShowDup] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ name: string; patient_name: string } | null>(null);
  const [allergyList, setAllergyList] = useState<string[]>([]);
  const [payers, setPayers] = useState<{ name: string; customer_group: string }[]>([]);
  const set = (k: keyof Form, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    void getCall<{ name: string }[]>("frappe.client.get_list", { doctype: "Allergy", fields: JSON.stringify(["name"]), limit_page_length: 200 }).then((r) => setAllergyList(r.map((x) => x.name)));
    void getCall<{ name: string; customer_group: string }[]>("frappe.client.get_list", { doctype: "Customer", fields: JSON.stringify(["name", "customer_group"]),
      filters: JSON.stringify([["customer_group", "in", ["Panels", "Insurance Providers", "Welfare Funds"]]]), limit_page_length: 100 }).then(setPayers).catch(() => setPayers([]));
  }, []);

  // live duplicate check as identity fields are typed
  useEffect(() => {
    const id = setTimeout(async () => {
      if (!(f.patient_name.length > 2 && (f.phone.length > 6 || f.cnic.replace(/\D/g, "").length === 13 || f.dob || f.age))) { setDups([]); return; }
      try {
        setDups(await getCall<Dup[]>("hospital_vvs.api.patients.find_duplicates", { patient_name: f.patient_name, phone: f.phone, cnic: f.cnic, dob: f.dob, age: f.age }));
      } catch { /* ignore */ }
    }, 450);
    return () => clearTimeout(id);
  }, [f.patient_name, f.phone, f.cnic, f.dob, f.age]);

  const save = async (dupReason?: string) => {
    if (!f.patient_name || !f.gender || !f.phone || !(f.dob || f.age)) return toast.error("Name, gender, phone and age/DOB are required");
    if (dups.length && !dupReason) { setShowDup(true); return; }
    setSaving(true);
    try {
      const consents = [f.wa && "WhatsApp messages", f.sms && "SMS messages", f.data && "Data processing"].filter(Boolean).map((c) => ({ consent_type: c, status: "Given" }));
      const data = { ...f, consents, branch, household_phone_link: f.household, allergies: f.allergies.filter((a) => a.allergy) };
      const r = await call<{ name: string; patient_name: string }>("patients.register", { data, duplicate_reason: dupReason });
      setDone(r); setShowDup(false); setF(EMPTY); setDups([]); setReason("");
      toast.success(`${r.name} registered`);
    } catch (e) { toast.error(humanizeError(e)); } finally { setSaving(false); }
  };

  const formatCnic = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 13); return d.length > 12 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Patient registration" icon={UserPlus} subtitle="Search first — scan the card QR, or type MR, phone, CNIC or name" />
      <Section className="mb-4"><PatientPicker autoFocus onPick={(p) => nav(`/patients/${p.name}`)} /></Section>

      {done && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="flex-1"><div className="text-xs text-emerald-700 dark:text-emerald-300">Registered</div>
            <div className="text-lg font-bold">{done.patient_name} · <span className="font-mono">{done.name}</span></div></div>
          <Button variant="outline" onClick={() => boot && void printCard(done.name, boot)}><CreditCard className="h-4 w-4" />{t("Patient card")}</Button>
          <Button variant="primary" onClick={() => nav(`/opd_slip?patient=${done.name}`)}><FilePlus2 className="h-4 w-4" />{t("OPD slip")}</Button>
          <button onClick={() => setDone(null)} className="p-1"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t("Register patient")} className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required><input className={inputCls} value={f.patient_name} onChange={(e) => set("patient_name", e.target.value)} /></Field>
            <Field label="Name (Urdu)"><input dir="rtl" className={inputCls + " font-[Noto_Nastaliq_Urdu]"} value={f.patient_name_ur} onChange={(e) => set("patient_name_ur", e.target.value)} /></Field>
            <Field label="Father / Husband Name">
              <div className="flex gap-2"><select className={inputCls + " w-24"} value={f.relation_type} onChange={(e) => set("relation_type", e.target.value)}>{["S/O", "D/O", "W/O", "C/O"].map((x) => <option key={x}>{x}</option>)}</select>
                <input className={inputCls} value={f.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} /></div></Field>
            <Field label="Gender" required>
              <div className="grid grid-cols-3 gap-2">{["Male", "Female", "Other"].map((g) => (
                <button key={g} type="button" onClick={() => set("gender", g)} className={"h-10 rounded-lg border text-sm font-semibold " + (f.gender === g ? "border-primary bg-primary/10 text-primary" : "border-input")}>{t(g)}</button>))}</div></Field>
            <Field label="Age" hint="Or the date of birth"><div className="flex gap-2">
              <input className={inputCls + " w-24"} inputMode="numeric" placeholder="Years" value={f.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, ""))} />
              <input type="date" className={inputCls} value={f.dob} onChange={(e) => set("dob", e.target.value)} /></div></Field>
            <Field label="Phone" required><input className={inputCls} inputMode="tel" placeholder="03XX XXXXXXX" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="CNIC / B-form" hint="Stored encrypted; shown masked"><input className={inputCls + " font-mono"} placeholder="35202-1234567-1" value={f.cnic} onChange={(e) => set("cnic", formatCnic(e.target.value))} /></Field>
            <Field label="Alternate Phone"><input className={inputCls} value={f.alt_phone} onChange={(e) => set("alt_phone", e.target.value)} /></Field>
            <Field label="Address" className="sm:col-span-2"><input className={inputCls} value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label="City"><input className={inputCls} value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="Blood group"><select className={inputCls} value={f.blood_group} onChange={(e) => set("blood_group", e.target.value)}>{["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Category"><select className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)}>{["Normal", "Panel", "Insurance", "Staff", "Welfare"].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Language"><select className={inputCls} value={f.preferred_language} onChange={(e) => set("preferred_language", e.target.value)}><option value="ur">اردو</option><option value="en">English</option><option value="ar">العربية</option></select></Field>
            {f.category === "Panel" && <>
              <Field label="Panel"><select className={inputCls} value={f.panel} onChange={(e) => set("panel", e.target.value)}><option />{payers.filter((p) => p.customer_group === "Panels").map((p) => <option key={p.name}>{p.name}</option>)}</select></Field>
              <Field label="Employee ID"><input className={inputCls} value={f.employee_id} onChange={(e) => set("employee_id", e.target.value)} /></Field></>}
            {f.category === "Insurance" && <>
              <Field label="Insurance provider"><select className={inputCls} value={f.insurance_provider} onChange={(e) => set("insurance_provider", e.target.value)}><option />{payers.filter((p) => p.customer_group === "Insurance Providers").map((p) => <option key={p.name}>{p.name}</option>)}</select></Field>
              <Field label="Policy no."><input className={inputCls} value={f.policy_no} onChange={(e) => set("policy_no", e.target.value)} /></Field></>}
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{t("Allergies")}</span>
              <button type="button" onClick={() => set("allergies", [...f.allergies, { allergy: "", severity: "Moderate", reaction: "" }])} className="flex items-center gap-1 text-xs font-semibold text-primary"><Plus className="h-3 w-3" />{t("Add")}</button></div>
            {f.allergies.map((a, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_120px_1fr_auto] gap-2">
                <select className={inputCls} value={a.allergy} onChange={(e) => set("allergies", f.allergies.map((x, j) => (j === i ? { ...x, allergy: e.target.value } : x)))}><option value="">—</option>{allergyList.map((x) => <option key={x}>{x}</option>)}</select>
                <select className={inputCls} value={a.severity} onChange={(e) => set("allergies", f.allergies.map((x, j) => (j === i ? { ...x, severity: e.target.value } : x)))}>{["Mild", "Moderate", "Severe"].map((x) => <option key={x}>{x}</option>)}</select>
                <input className={inputCls} placeholder="Reaction" value={a.reaction} onChange={(e) => set("allergies", f.allergies.map((x, j) => (j === i ? { ...x, reaction: e.target.value } : x)))} />
                <button type="button" onClick={() => set("allergies", f.allergies.filter((_, j) => j !== i))} className="px-2 text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 rounded-xl bg-muted/60 p-3 text-sm">
            {([["wa", "WhatsApp messages"], ["sms", "SMS messages"], ["data", "Data processing"], ["household", "Group with family on this phone"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={f[k] as boolean} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 accent-teal-600" />{l}</label>))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setF(EMPTY); setDups([]); }}>{t("Cancel")}</Button>
            <Button variant="save" loading={saving} onClick={() => void save()}><UserPlus className="h-4 w-4" />{t("Register patient")}</Button>
          </div>
        </Section>

        <Section title={<span className="flex items-center gap-2">{t("Possible duplicate")}{dups.length > 0 && <span className="rounded-full bg-amber-500 px-2 text-xs text-white">{dups.length}</span>}</span>}>
          {dups.length === 0 ? <p className="text-sm text-muted-foreground">No likely duplicates. Matches by CNIC, phone + similar name, or name + age appear here as you type.</p> :
            <div className="space-y-2">{dups.map((d) => (
              <div key={d.name} className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                <div className="flex items-center justify-between"><b>{d.patient_name}</b><span className="font-mono text-xs">{d.name}</span></div>
                <div className="text-xs text-muted-foreground">{d.phone} · {d.age}y · {d.gender}{d.last_visit ? ` · last ${d.last_visit}` : ""}</div>
                <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300"><AlertTriangle className="h-3 w-3" />{d.reason}</div>
                <Button size="xs" variant="outline" className="mt-2" onClick={() => nav(`/patients/${d.name}`)}>{t("Use this patient")}</Button>
              </div>))}</div>}
        </Section>
      </div>

      <Dialog open={showDup} onClose={() => setShowDup(false)} title={t("Possible duplicate")} size="md">
        <p className="mb-3 text-sm">{dups.length} existing record(s) look like this patient. Use one of them, or give a reason to create a new record.</p>
        {dups.slice(0, 3).map((d) => <div key={d.name} className="mb-2 flex items-center gap-2 rounded-lg border border-border p-2 text-sm"><span className="flex-1"><b>{d.patient_name}</b> · {d.name}<div className="text-xs text-muted-foreground">{d.reason}</div></span><Pill value={d.category} />
          <Button size="xs" variant="outline" onClick={() => nav(`/patients/${d.name}`)}>{t("Use this patient")}</Button></div>)}
        <Field label="Reason" required><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. different person, same family phone" /></Field>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowDup(false)}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={!reason.trim()} loading={saving} onClick={() => void save(reason)}>{t("Create new anyway")}</Button></div>
      </Dialog>
    </div>
  );
}
