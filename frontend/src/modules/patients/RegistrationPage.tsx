import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Camera, CheckCircle2, CreditCard, Droplet, FilePlus2, Fingerprint, HeartPulse, Home, IdCard, MapPin, MessageCircle, Phone,
  RotateCcw, ShieldCheck, Sparkles, Trash2, Upload, User, UserPlus, Users, X, type LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, getCall, humanizeError } from "@/lib/api";
import { uploadFile } from "@/services/frappe";
import { qrSvg } from "@/lib/print";
import { PatientPicker } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { printCard } from "./shared";
import { toUrdu } from "@/lib/urdu";

interface Form { [k: string]: unknown; patient_name: string; patient_name_ur: string; relation_type: string; guardian_name: string; gender: string;
  dob: string; age: string; phone: string; alt_phone: string; cnic: string; address: string; city: string; category: string; blood_group: string;
  preferred_language: string; panel: string; employee_id: string; insurance_provider: string; policy_no: string; photo: string;
  allergies: { allergy: string; severity: string; reaction: string }[]; wa: boolean; sms: boolean; data: boolean; household: boolean }
const EMPTY: Form = { patient_name: "", patient_name_ur: "", relation_type: "S/O", guardian_name: "", gender: "", dob: "", age: "", phone: "", alt_phone: "",
  cnic: "", address: "", city: "Lahore", category: "Normal", blood_group: "", preferred_language: "ur", panel: "", employee_id: "", insurance_provider: "",
  policy_no: "", photo: "", allergies: [], wa: true, sms: true, data: true, household: true };
interface Dup { name: string; patient_name: string; phone?: string; age?: number; gender: string; last_visit?: string; reason: string; score: number; category?: string }

const CATS = [["Normal", "Self pay", "from-slate-500 to-slate-700"], ["Panel", "Corporate panel", "from-amber-500 to-orange-600"], ["Insurance", "Insurance", "from-sky-500 to-blue-600"],
  ["Staff", "Staff / family", "from-violet-500 to-indigo-600"], ["Welfare", "Welfare / zakat", "from-emerald-500 to-teal-600"]] as const;
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GRAD: Record<string, string> = { Male: "linear-gradient(135deg,#0ea5e9,#1e3a8a)", Female: "linear-gradient(135deg,#ec4899,#7e22ce)", Other: "linear-gradient(135deg,#14b8a6,#0f3d3a)" };
const inp = "h-11 w-full rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3.5 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15";

export default function RegistrationPage() {
  const { boot, branch } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [f, setF] = useState<Form>(EMPTY);
  const [dups, setDups] = useState<Dup[]>([]);
  const [checking, setChecking] = useState(false);
  const [showDup, setShowDup] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ name: string; patient_name: string } | null>(null);
  const [allergyList, setAllergyList] = useState<string[]>([]);
  const [payers, setPayers] = useState<{ name: string; customer_group: string }[]>([]);
  const [camera, setCamera] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [urManual, setUrManual] = useState(false);
  const setName = (v: string) => setF((p) => ({ ...p, patient_name: v, patient_name_ur: urManual ? p.patient_name_ur : toUrdu(v) }));
  const set = (k: keyof Form, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    void getCall<{ name: string }[]>("frappe.client.get_list", { doctype: "Allergy", fields: JSON.stringify(["name"]), limit_page_length: 200 }).then((r) => setAllergyList(r.map((x) => x.name)));
    void getCall<{ name: string; customer_group: string }[]>("frappe.client.get_list", { doctype: "Customer", fields: JSON.stringify(["name", "customer_group"]),
      filters: JSON.stringify([["customer_group", "in", ["Panels", "Insurance Providers", "Welfare Funds"]]]), limit_page_length: 100 }).then(setPayers).catch(() => setPayers([]));
  }, []);

  useEffect(() => {
    const id = setTimeout(async () => {
      if (!(f.patient_name.length > 2 && (f.phone.replace(/\D/g, "").length > 9 || f.cnic.replace(/\D/g, "").length === 13 || f.dob || f.age))) { setDups([]); return; }
      setChecking(true);
      try { setDups(await getCall<Dup[]>("hospital_vvs.api.patients.find_duplicates", { patient_name: f.patient_name, phone: phoneNorm(f.phone), cnic: f.cnic, dob: f.dob, age: f.age })); }
      catch { /* ignore */ } finally { setChecking(false); }
    }, 450);
    return () => clearTimeout(id);
  }, [f.patient_name, f.phone, f.cnic, f.dob, f.age]);

  const phoneNorm = (p: string) => { const d = p.replace(/\D/g, ""); return d.startsWith("92") ? "0" + d.slice(2) : d.startsWith("3") ? "0" + d : d; };
  const formatCnic = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 13); return d.length > 12 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
  const missing = [!f.patient_name.trim() && "name", !f.gender && "gender", phoneNorm(f.phone).length < 11 && "phone", !(f.dob || f.age) && "age"].filter(Boolean) as string[];
  const completeness = Math.round(([f.patient_name, f.gender, f.phone, f.dob || f.age, f.guardian_name, f.cnic, f.address, f.blood_group, f.patient_name_ur, f.photo].filter(Boolean).length / 10) * 100);

  const save = async (dupReason?: string) => {
    if (missing.length) { toast.error(`Please fill: ${missing.join(", ")}`); return; }
    if (dups.length && !dupReason) { setShowDup(true); return; }
    setSaving(true);
    try {
      const consents = [f.wa && "WhatsApp messages", f.sms && "SMS messages", f.data && "Data processing"].filter(Boolean).map((c) => ({ consent_type: c, status: "Given" }));
      const data = { ...f, phone: phoneNorm(f.phone), consents, branch, household_phone_link: f.household, allergies: f.allergies.filter((a) => a.allergy), photo: f.photo || undefined };
      const r = await call<{ name: string; patient_name: string }>("patients.register", { data, duplicate_reason: dupReason });
      setDone(r); setShowDup(false); setF(EMPTY); setDups([]); setReason(""); setPhotoPreview(""); setUrManual(false);
      toast.success(`${r.name} registered`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setSaving(false); }
  };

  const onPhoto = async (file: File) => {
    setPhotoPreview(URL.createObjectURL(file));
    try { const r = await uploadFile(file, { isPrivate: true }); set("photo", r.file_url); } catch (e) { toast.error(humanizeError(e)); setPhotoPreview(""); }
  };

  const age = f.age || (f.dob ? String(new Date().getFullYear() - new Date(f.dob).getFullYear()) : "");
  return (
    <div className="mx-auto max-w-[1400px]">
      {/* hero */}
      <div className="relative mb-5 overflow-hidden rounded-3xl bg-[#06232a] p-5 text-white shadow-lg sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_0%_0%,rgba(20,184,166,0.6),transparent_60%),radial-gradient(600px_300px_at_100%_100%,rgba(16,185,129,0.45),transparent_60%)]" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><UserPlus className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">{t("Patient registration")}</h1>
            <p className="text-sm text-teal-50/80">Search first — scan the card QR or type MR, phone, CNIC or name. Register only if the patient is new.</p></div>
        </div>
        <div className="relative mt-4 [&_input]:text-slate-900 [&>div>div]:bg-white/95 [&>div>div]:shadow-lg dark:[&>div>div]:bg-slate-900/90 dark:[&_input]:text-white"><PatientPicker autoFocus onPick={(p) => nav(`/patients/${p.name}`)} /></div>
      </div>

      {done && (
        <div className="mb-5 flex flex-wrap items-center gap-4 overflow-hidden rounded-3xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 shadow-sm dark:border-emerald-500/30 dark:from-emerald-500/10 dark:to-teal-500/5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md"><CheckCircle2 className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Registered</div>
            <div className="truncate text-lg font-bold">{done.patient_name} · <span className="font-mono">{done.name}</span></div></div>
          <Button variant="outline" onClick={() => boot && void printCard(done.name, boot)}><CreditCard className="h-4 w-4" />{t("Patient card")}</Button>
          <Button variant="outline" onClick={() => nav(`/appointments?patient=${done.name}`)}>{t("Book appointment")}</Button>
          <Button variant="primary" onClick={() => nav(`/opd_slip?patient=${done.name}`)}><FilePlus2 className="h-4 w-4" />{t("OPD slip")}</Button>
          <button onClick={() => setDone(null)} className="rounded-lg p-1 hover:bg-white/60"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card icon={User} title="Identity" subtitle="Name as on CNIC / B-form" tone="from-teal-500 to-emerald-600">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="relative h-28 w-28 overflow-hidden rounded-3xl shadow-md" style={{ background: GRAD[f.gender] ?? "linear-gradient(135deg,#cbd5e1,#94a3b8)" }}>
                  {photoPreview ? <img src={photoPreview} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-3xl font-extrabold text-white/90">{f.patient_name ? f.patient_name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() : <User className="h-10 w-10" />}</span>}
                  {photoPreview && <button onClick={() => { setPhotoPreview(""); set("photo", ""); }} className="absolute end-1 top-1 rounded-full bg-black/40 p-1 text-white"><X className="h-3 w-3" /></button>}
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setCamera(true)} className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-semibold hover:bg-accent"><Camera className="h-3.5 w-3.5" />Camera</button>
                  <label className="flex cursor-pointer items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-semibold hover:bg-accent"><Upload className="h-3.5 w-3.5" />File<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void onPhoto(e.target.files[0])} /></label>
                </div>
              </div>
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <L label="Full name" req><input className={inp + " text-base font-semibold"} value={f.patient_name} onChange={(e) => setName(e.target.value)} placeholder="Muhammad Ali Khan" /></L>
                <L label="Name (Urdu)" hint={f.patient_name_ur && !urManual ? <span className="flex items-center gap-1 text-teal-600"><Sparkles className="h-3 w-3" />Filled from the English name — correct it if needed</span> : undefined}>
                  <input lang="ur" dir="rtl" className={inp + " urdu-input"} value={f.patient_name_ur} placeholder="محمد علی خان"
                    onChange={(e) => { set("patient_name_ur", e.target.value); setUrManual(!!e.target.value); }} /></L>
                <L label="Father / husband"><div className="flex gap-2">
                  <div className="flex rounded-xl bg-muted p-1">{["S/O", "D/O", "W/O"].map((r) => <button key={r} type="button" onClick={() => set("relation_type", r)} className={cn("rounded-lg px-2 text-xs font-bold", f.relation_type === r ? "bg-card shadow-sm" : "text-muted-foreground")}>{r}</button>)}</div>
                  <input className={inp} value={f.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} /></div></L>
                <L label="Gender" req><div className="grid grid-cols-3 gap-2">{["Male", "Female", "Other"].map((g) => (
                  <button key={g} type="button" onClick={() => set("gender", g)} className={cn("h-11 rounded-xl border text-sm font-semibold transition-all", f.gender === g ? "border-transparent text-white shadow-md" : "border-input hover:border-primary/50")} style={f.gender === g ? { background: GRAD[g] } : undefined}>{t(g)}</button>))}</div></L>
                <L label="Age or date of birth" req><div className="flex gap-2">
                  <div className="relative w-28"><input className={inp + " pe-10"} inputMode="numeric" value={f.age} onChange={(e) => set("age", e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Age" /><span className="absolute end-3 top-3 text-xs text-muted-foreground">yrs</span></div>
                  <input type="date" className={inp} value={f.dob} onChange={(e) => set("dob", e.target.value)} /></div></L>
                <L label="CNIC / B-form" hint={<span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Encrypted · shown masked</span>}>
                  <div className="relative"><Fingerprint className="absolute start-3 top-3.5 h-4 w-4 text-muted-foreground" /><input className={inp + " ps-9 font-mono tracking-wider"} placeholder="35202-1234567-1" value={f.cnic} onChange={(e) => set("cnic", formatCnic(e.target.value))} /></div></L>
              </div>
            </div>
          </Card>

          <Card icon={Phone} title="Contact" subtitle="WhatsApp number for appointment and report messages" tone="from-sky-500 to-blue-600">
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Mobile / WhatsApp" req><div className="flex items-center rounded-xl border border-input bg-[hsl(var(--input-bg))] transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                <span className="border-e border-border px-3 text-sm font-semibold text-muted-foreground">+92</span>
                <input className="h-11 flex-1 bg-transparent px-3 text-base tracking-wide outline-none" inputMode="tel" placeholder="300 1234567" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div></L>
              <L label="Alternate phone"><input className={inp} inputMode="tel" value={f.alt_phone} onChange={(e) => set("alt_phone", e.target.value)} /></L>
              <L label="Address" className="sm:col-span-2"><div className="relative"><Home className="absolute start-3 top-3.5 h-4 w-4 text-muted-foreground" /><input className={inp + " ps-9"} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="House, street, area" /></div></L>
              <L label="City"><div className="relative"><MapPin className="absolute start-3 top-3.5 h-4 w-4 text-muted-foreground" /><input className={inp + " ps-9"} list="cities" value={f.city} onChange={(e) => set("city", e.target.value)} /></div>
                <datalist id="cities">{["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta", "Sialkot", "Gujranwala"].map((c) => <option key={c} value={c} />)}</datalist></L>
              <L label="Message language"><div className="grid grid-cols-3 gap-2">{[["ur", "اردو"], ["en", "English"], ["ar", "العربية"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => set("preferred_language", k)} className={cn("h-11 rounded-xl border text-sm font-semibold", f.preferred_language === k ? "border-primary bg-primary/10 text-primary" : "border-input", k === "ur" && "font-urdu text-base")}>{l}</button>))}</div></L>
            </div>
          </Card>

          <Card icon={CreditCard} title="Who pays" subtitle="Category decides the payer split on bills" tone="from-amber-500 to-orange-600">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {CATS.map(([k, l, g]) => (
                <button key={k} type="button" onClick={() => set("category", k)} className={cn("rounded-2xl border p-3 text-start transition-all", f.category === k ? "border-transparent bg-gradient-to-br text-white shadow-md " + g : "border-input hover:border-primary/40")}>
                  <div className="text-sm font-bold">{t(k)}</div><div className={cn("text-[11px]", f.category === k ? "text-white/80" : "text-muted-foreground")}>{l}</div></button>))}
            </div>
            {f.category === "Panel" && <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <L label="Panel"><select className={inp} value={f.panel} onChange={(e) => set("panel", e.target.value)}><option value="">—</option>{payers.filter((p) => p.customer_group === "Panels").map((p) => <option key={p.name}>{p.name}</option>)}</select></L>
              <L label="Employee ID"><input className={inp} value={f.employee_id} onChange={(e) => set("employee_id", e.target.value)} /></L></div>}
            {f.category === "Insurance" && <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <L label="Insurance provider"><select className={inp} value={f.insurance_provider} onChange={(e) => set("insurance_provider", e.target.value)}><option value="">—</option>{payers.filter((p) => p.customer_group === "Insurance Providers").map((p) => <option key={p.name}>{p.name}</option>)}</select></L>
              <L label="Policy no."><input className={inp} value={f.policy_no} onChange={(e) => set("policy_no", e.target.value)} /></L></div>}
          </Card>

          <Card icon={HeartPulse} title="Clinical" subtitle="Allergies show as red alerts on every prescription" tone="from-rose-500 to-pink-600">
            <L label="Blood group"><div className="flex flex-wrap gap-2">{BLOOD.map((b) => (
              <button key={b} type="button" onClick={() => set("blood_group", f.blood_group === b ? "" : b)} className={cn("flex h-10 min-w-[52px] items-center justify-center gap-1 rounded-xl border px-2 text-sm font-bold", f.blood_group === b ? "border-transparent bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-md" : "border-input")}><Droplet className="h-3.5 w-3.5" />{b}</button>))}</div></L>
            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">{t("Allergies")}</div>
              <div className="mb-2 flex flex-wrap gap-1.5">{allergyList.filter((a) => !f.allergies.some((x) => x.allergy === a)).map((a) => (
                <button key={a} type="button" onClick={() => set("allergies", [...f.allergies, { allergy: a, severity: "Moderate", reaction: "" }])} className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs hover:border-rose-400 hover:text-rose-600">+ {a}</button>))}</div>
              {f.allergies.map((a, i) => (
                <div key={a.allergy} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 p-2 dark:border-rose-500/30 dark:bg-rose-500/10">
                  <span className="flex items-center gap-1 font-semibold text-rose-700 dark:text-rose-300"><AlertTriangle className="h-4 w-4" />{a.allergy}</span>
                  <div className="flex rounded-lg bg-white/70 p-0.5 dark:bg-white/5">{["Mild", "Moderate", "Severe"].map((s) => <button key={s} type="button" onClick={() => set("allergies", f.allergies.map((x, j) => (j === i ? { ...x, severity: s } : x)))} className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", a.severity === s ? "bg-rose-600 text-white" : "text-muted-foreground")}>{s}</button>)}</div>
                  <input className="h-8 min-w-[140px] flex-1 rounded-lg border border-input bg-[hsl(var(--input-bg))] px-2 text-xs" placeholder="Reaction (rash, swelling…)" value={a.reaction} onChange={(e) => set("allergies", f.allergies.map((x, j) => (j === i ? { ...x, reaction: e.target.value } : x)))} />
                  <button type="button" onClick={() => set("allergies", f.allergies.filter((_, j) => j !== i))} className="p-1 text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>))}
            </div>
          </Card>

          <Card icon={ShieldCheck} title="Consent" subtitle="Recorded with date and your name; can be withdrawn later" tone="from-green-500 to-emerald-600">
            <div className="grid gap-2 sm:grid-cols-2">
              {([["wa", "WhatsApp messages", MessageCircle], ["sms", "SMS messages", Phone], ["data", "Data processing", ShieldCheck], ["household", "Group with family on this phone", Users]] as const).map(([k, l, I]) => (
                <button key={k} type="button" onClick={() => set(k, !f[k])} className={cn("flex items-center gap-3 rounded-2xl border p-3 text-start text-sm transition-all", f[k] ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-input")}>
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", f[k] ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}><I className="h-4 w-4" /></span>
                  <span className="flex-1 font-semibold">{l}</span>
                  <span className={cn("relative h-6 w-11 rounded-full transition-colors", f[k] ? "bg-emerald-500" : "bg-muted-foreground/30")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", f[k] ? "start-[22px]" : "start-0.5")} /></span>
                </button>))}
            </div>
          </Card>
        </div>

        {/* right: live card + duplicates + submit */}
        <aside className="space-y-4 xl:sticky xl:top-4">
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span>Card preview</span><span>{completeness}% complete</span></div>
            <div className="mx-4 mt-2 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all" style={{ width: `${completeness}%` }} /></div>
            <div className="m-4 overflow-hidden rounded-2xl border border-teal-700/30 bg-gradient-to-br from-cyan-50 to-emerald-50 shadow-md dark:from-teal-950 dark:to-emerald-950">
              <div className="flex items-center justify-between bg-gradient-to-r from-teal-700 to-emerald-500 px-3 py-1.5 text-[11px] font-extrabold text-white"><span>{boot?.clinic.name}</span><span>PATIENT CARD</span></div>
              <div className="flex gap-3 p-3">
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg" style={{ background: GRAD[f.gender] ?? "#cbd5e1" }}>{photoPreview && <img src={photoPreview} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-extrabold text-teal-700 dark:text-teal-300">MR · new</div>
                  <div className="truncate font-bold">{f.patient_name || "Patient name"}</div>
                  {f.patient_name_ur && <div className="font-urdu truncate text-sm" dir="rtl">{f.patient_name_ur}</div>}
                  <div className="truncate text-[11px] text-muted-foreground">{f.guardian_name ? `${f.relation_type} ${f.guardian_name}` : ""}</div>
                  <div className="text-[11px] text-muted-foreground">{f.gender ? t(f.gender) : "—"}{age ? ` · ${age} y` : ""}{f.blood_group ? ` · ${f.blood_group}` : ""}</div>
                  <div className="text-[11px] text-muted-foreground">{f.phone && phoneNorm(f.phone)}</div>
                </div>
                <div className="shrink-0 opacity-60" dangerouslySetInnerHTML={{ __html: qrSvg("MR-NEW", 0.5) }} />
              </div>
            </div>
          </div>

          <div className={cn("rounded-3xl border p-4 shadow-sm", dups.length ? "border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10" : "border-border bg-card")}>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold">
              {dups.length ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <IdCard className="h-4 w-4 text-emerald-600" />}
              Duplicate check {checking && <RotateCcw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {dups.length > 0 && <span className="ms-auto rounded-full bg-amber-500 px-2 text-xs text-white">{dups.length}</span>}
            </div>
            {dups.length === 0 ? <p className="text-xs text-muted-foreground">{f.patient_name.length > 2 ? "No likely duplicates so far." : "Matches by CNIC, phone + similar name, or name + age appear as you type."}</p>
              : <div className="space-y-2">{dups.map((d) => (
                <div key={d.name} className="rounded-2xl border border-amber-200 bg-white p-3 dark:border-amber-500/20 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-2"><b className="truncate">{d.patient_name}</b><span className="font-mono text-[11px]">{d.name}</span></div>
                  <div className="text-xs text-muted-foreground">{d.phone} · {d.age}y · {d.gender}{d.last_visit ? ` · last ${d.last_visit}` : ""}</div>
                  <div className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-300">{d.reason}</div>
                  <Button size="xs" variant="outline" className="mt-2" onClick={() => nav(`/patients/${d.name}`)}>{t("Use this patient")}</Button>
                </div>))}</div>}
          </div>

          <button onClick={() => void save()} disabled={saving}
            className="group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-500 text-base font-bold text-white shadow-lg shadow-teal-700/30 transition-all hover:shadow-xl disabled:opacity-60">
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            {saving ? <RotateCcw className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}{t("Register patient")}</button>
          {missing.length > 0 && <p className="text-center text-xs text-muted-foreground">Still needed: {missing.join(", ")}</p>}
          <button onClick={() => { setF(EMPTY); setDups([]); setPhotoPreview(""); setUrManual(false); }} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">Clear form</button>
        </aside>
      </div>

      <Dialog open={showDup} onClose={() => setShowDup(false)} title={t("Possible duplicate")} size="md">
        <p className="mb-3 text-sm">{dups.length} existing record(s) look like this patient. Use one of them, or give a reason to create a new record.</p>
        {dups.slice(0, 3).map((d) => <div key={d.name} className="mb-2 flex items-center gap-2 rounded-xl border border-border p-2 text-sm"><span className="flex-1"><b>{d.patient_name}</b> · {d.name}<div className="text-xs text-muted-foreground">{d.reason}</div></span>
          <Button size="xs" variant="outline" onClick={() => nav(`/patients/${d.name}`)}>{t("Use this patient")}</Button></div>)}
        <L label="Reason" req><input className={inp} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. different person, same family phone" /></L>
        <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setShowDup(false)}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={!reason.trim()} loading={saving} onClick={() => void save(reason)}>{t("Create new anyway")}</Button></div>
      </Dialog>
      {camera && <CameraDialog onClose={() => setCamera(false)} onShot={(file) => { setCamera(false); void onPhoto(file); }} />}
    </div>
  );
}

function Card({ icon: I, title, subtitle, tone, children }: { icon: LucideIcon; title: string; subtitle?: string; tone: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b border-border/70 bg-gradient-to-r from-muted/60 to-transparent px-5 py-3.5">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", tone)}><I className="h-4 w-4" /></span>
        <div><h2 className="text-sm font-bold">{title}</h2>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function L({ label, children, req, hint, className }: { label: string; children: ReactNode; req?: boolean; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}{req && <span className="text-rose-500"> *</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Webcam capture (optional photo at registration, shown on queue and prescription screens). */
function CameraDialog({ onClose, onShot }: { onClose: () => void; onShot: (f: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: 640, height: 640 } })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; void video.current.play(); } })
      .catch(() => setErr("Camera not available. Allow camera access or upload a file instead."));
    return () => stream?.getTracks().forEach((tr) => tr.stop());
  }, []);
  const shoot = () => {
    const v = video.current; if (!v) return;
    const size = Math.min(v.videoWidth, v.videoHeight);
    const c = document.createElement("canvas"); c.width = c.height = 480;
    c.getContext("2d")!.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, 480, 480);
    c.toBlob((b) => b && onShot(new File([b], `patient-${Date.now()}.jpg`, { type: "image/jpeg" })), "image/jpeg", 0.85);
  };
  return (
    <Dialog open onClose={onClose} title="Take photo" size="sm">
      {err ? <p className="text-sm text-rose-600">{err}</p> : <div className="overflow-hidden rounded-2xl bg-black"><video ref={video} playsInline muted className="aspect-square w-full object-cover" /></div>}
      <Button variant="primary" className="mt-3 w-full" disabled={!!err} onClick={shoot}><Camera className="h-4 w-4" />Capture</Button>
    </Dialog>
  );
}
