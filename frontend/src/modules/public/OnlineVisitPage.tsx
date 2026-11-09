import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ClipboardList, Copy, ImagePlus, Loader2, Phone, ShieldCheck, Stethoscope, User, UserPlus, Video, Wallet, X } from "lucide-react";
import toast from "react-hot-toast";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { PublicShell } from "./shared";

const M = (x: string) => `hospital_vvs.api.online_visit.${x}`;
interface Ctx { fee: number; methods: string[]; instructions?: string; specializations: string[]; clinic: { name: string; name_ur?: string; phone?: string };
  doctors: { doctor_name: string; doctor_name_ur?: string; specialization?: string; qualification?: string; photo?: string }[] }
const SYMPTOMS = ["Fever", "Cough", "Headache", "Body ache", "Sore throat", "Runny nose", "Stomach pain", "Vomiting", "Diarrhoea", "Rash", "Dizziness", "Breathing difficulty"];
const DURATIONS = ["Today", "1–3 days", "A week", "More than a month"];
const STEPS = ["Patient", "Problem", "Payment", "Review"];
const inp = "h-12 w-full rounded-xl border border-input bg-[hsl(var(--input-bg))] px-4 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;

async function readFile(file: File) {
  return new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(file); });
}

/** Public 4-step telemedicine request (en / ur / ar, mobile first). No login: the result is a private status link. */
export default function OnlineVisitPage() {
  const { t, i18n } = useTranslation();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState({ sent: false, code: "", token: "", test: "" });
  const [members, setMembers] = useState<{ name: string; patient_name: string }[] | null>(null);
  const [patient, setPatient] = useState("");
  const [p, setP] = useState({ name: "", age: "", gender: "", city: "" });
  const [c, setC] = useState({ complaint: "", symptoms: [] as string[], duration: "", conditions: "", meds: "", allergies: "", specialization: "" });
  const [photos, setPhotos] = useState<{ url: string; preview: string }[]>([]);
  const [pay, setPay] = useState({ method: "", reference: "", proof: "", proofPreview: "", later: false });
  const [consent, setConsent] = useState(true);
  const [done, setDone] = useState<{ name: string; token: string } | null>(null);
  const ref = useMemo(() => crypto.randomUUID(), []);
  useEffect(() => { void getCall<Ctx>(M("form_context")).then((x) => { setCtx(x); setPay((v) => ({ ...v, method: x.methods[0] ?? "" })); }).catch((e) => toast.error(humanizeError(e))); }, []);
  const run = async <T,>(fn: () => Promise<T>) => { setBusy(true); try { return await fn(); } catch (e) { toast.error(humanizeError(e)); return undefined; } finally { setBusy(false); } };
  const normPhone = phone.replace(/\D/g, "").replace(/^92/, "0").replace(/^3/, "03");
  const phoneOk = /^03\d{9}$/.test(normPhone);

  const checkPhone = () => run(async () => {
    const r = await postCall<{ existing: boolean; test_code?: string }>(M("request_otp"), { phone: normPhone });
    if (!r.existing) { setMembers([]); setPatient(""); return; }
    setOtp((o) => ({ ...o, sent: true, test: r.test_code ?? "" }));
  });
  const verifyOtp = () => run(async () => {
    const r = await postCall<{ verified_token: string; patients: { name: string; patient_name: string }[] }>(M("verify_otp"), { phone: normPhone, code: otp.code });
    setOtp((o) => ({ ...o, token: r.verified_token })); setMembers(r.patients); setPatient(r.patients[0]?.name ?? "");
  });
  const addPhoto = (f?: File) => f && run(async () => {
    const data = await readFile(f);
    const url = await postCall<string>(M("upload"), { filename: f.name, filedata: data });
    setPhotos((x) => [...x, { url, preview: data }].slice(0, 5));
  });
  const addProof = (f?: File) => f && run(async () => {
    const data = await readFile(f);
    const url = await postCall<string>(M("upload"), { filename: f.name, filedata: data });
    setPay((v) => ({ ...v, proof: url, proofPreview: f.type.startsWith("image/") ? data : "" }));
  });
  const submit = () => run(async () => {
    const r = await postCall<{ name: string; token: string }>(M("submit"), { data: {
      phone: normPhone, patient: patient || undefined, verified_token: otp.token || undefined, patient_name: p.name, age: Number(p.age) || undefined,
      gender: p.gender || undefined, city: p.city, language: i18n.language, complaint: c.complaint, symptoms: c.symptoms.map((s) => t(s)), duration: c.duration ? t(c.duration) : undefined,
      conditions: c.conditions, current_meds: c.meds, allergies: c.allergies, specialization: c.specialization || undefined, photos: photos.map((x) => x.url),
      payment_method: pay.method, payment_reference: pay.later ? undefined : pay.reference || undefined, payment_proof: pay.later ? undefined : pay.proof || undefined,
      messages_allowed: consent ? 1 : 0, client_ref: ref } });
    setDone(r);
  });

  const patientReady = phoneOk && members !== null && (patient || (p.name.trim() && p.gender));
  const problemReady = c.complaint.trim().length >= 5;
  const payReady = pay.later || pay.reference.trim() || pay.proof;
  const pname = patient ? members?.find((m) => m.name === patient)?.patient_name : p.name;
  const url = done ? `${window.location.origin}/hms/online-visit/${done.token}` : "";

  if (done) return (
    <PublicShell clinic={ctx?.clinic.name} clinicUr={ctx?.clinic.name_ur} phone={ctx?.clinic.phone}>
      <div className="rounded-3xl bg-card p-6 text-center shadow-xl">
        <span className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"><Check className="h-8 w-8" /></span>
        <h1 className="text-2xl font-extrabold">{t("Request sent")}</h1>
        <div className="mt-1 font-mono text-sm text-muted-foreground">{done.name}</div>
        <p className="mt-3 text-sm text-muted-foreground">{t("Save this link")}</p>
        <div className="mt-2 break-all rounded-xl bg-muted p-3 text-start font-mono text-xs" dir="ltr">{url}</div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border font-semibold" onClick={() => { void navigator.clipboard.writeText(url); toast.success("Copied"); }}><Copy className="h-4 w-4" />{t("Copy link")}</button>
          <a href={url} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-teal-600 font-bold text-white">{t("Open my request")}</a>
        </div>
      </div>
    </PublicShell>
  );

  return (
    <PublicShell clinic={ctx?.clinic.name} clinicUr={ctx?.clinic.name_ur} phone={ctx?.clinic.phone}>
      <div className="mb-4 text-white">
        <div className="flex items-center gap-2 text-2xl font-extrabold"><Video className="h-6 w-6" />{t("Online consultation")}</div>
        <div className="text-sm text-teal-50/80">{t("See a doctor by video from home")} · {t("Consultation fee")} {rs(ctx?.fee)}</div>
      </div>
      <div className="mb-4 grid grid-cols-4 gap-1.5">{STEPS.map((s, i) => (
        <div key={s} className="text-center"><div className={cn("h-1.5 rounded-full", i + 1 <= step ? "bg-emerald-400" : "bg-white/25")} />
          <div className={cn("mt-1 text-[11px] font-semibold", i + 1 === step ? "text-white" : "text-white/60")}>{t(s)}</div></div>))}</div>

      <div className="rounded-3xl bg-card p-5 shadow-xl">
        {step === 1 && <div className="space-y-4">
          <label className="block text-sm font-bold">{t("Mobile number")}<div className="relative mt-1"><Phone className="absolute start-4 top-3.5 h-5 w-5 text-muted-foreground" />
            <input className={inp + " ps-12 text-lg tracking-wider"} dir="ltr" inputMode="tel" placeholder="03XX XXXXXXX" value={phone} onChange={(e) => { setPhone(e.target.value); setMembers(null); setOtp({ sent: false, code: "", token: "", test: "" }); }} /></div></label>
          {members === null && !otp.sent && <button disabled={!phoneOk || busy} onClick={() => void checkPhone()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 font-bold text-white disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{t("Continue")}</button>}
          {otp.sent && !otp.token && <div className="space-y-2 rounded-2xl bg-teal-50 p-3 dark:bg-teal-500/10">
            <div className="text-sm">{t("We sent a code to this number")}{otp.test && <span className="ms-2 rounded bg-amber-200 px-1 font-mono text-xs text-amber-900">test: {otp.test}</span>}</div>
            <div className="flex gap-2"><input className={inp + " text-center text-xl tracking-[0.5em]"} dir="ltr" inputMode="numeric" maxLength={6} value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value.replace(/\D/g, "") })} placeholder={t("Verification code")} />
              <button disabled={otp.code.length !== 6 || busy} onClick={() => void verifyOtp()} className="h-12 shrink-0 rounded-xl bg-teal-600 px-5 font-bold text-white disabled:opacity-50">{t("Verify")}</button></div>
            <button className="text-xs font-semibold text-teal-700 underline" onClick={() => { setMembers([]); setOtp({ sent: false, code: "", token: "", test: "" }); }}>{t("Someone new")}</button></div>}
          {members !== null && <div className="space-y-3">
            {members.length > 0 && <div><div className="mb-1 text-sm font-bold">{t("Who is the patient?")}</div><div className="grid gap-2">{[...members, { name: "", patient_name: t("Someone new") }].map((m) => (
              <button key={m.name || "new"} onClick={() => setPatient(m.name)} className={cn("flex items-center gap-3 rounded-xl border-2 p-3 text-start", patient === m.name ? "border-teal-600 bg-teal-50 dark:bg-teal-500/10" : "border-border")}>
                {m.name ? <User className="h-5 w-5 text-teal-600" /> : <UserPlus className="h-5 w-5 text-teal-600" />}<span className="flex-1 font-semibold">{m.patient_name}</span>{patient === m.name && <Check className="h-5 w-5 text-teal-600" />}</button>))}</div></div>}
            {!patient && <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-sm font-bold">{t("Patient name")}<input className={inp + " mt-1"} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
              <label className="text-sm font-bold">{t("Age")}<input className={inp + " mt-1"} inputMode="numeric" value={p.age} onChange={(e) => setP({ ...p, age: e.target.value.replace(/\D/g, "") })} /></label>
              <label className="text-sm font-bold">{t("City")}<input className={inp + " mt-1"} value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></label>
              <div className="col-span-2"><div className="mb-1 text-sm font-bold">{t("Sex")}</div><div className="grid grid-cols-3 gap-2">{["Male", "Female", "Other"].map((g) => (
                <button key={g} onClick={() => setP({ ...p, gender: g })} className={cn("h-12 rounded-xl border-2 font-semibold", p.gender === g ? "border-teal-600 bg-teal-600 text-white" : "border-border")}>{t(g)}</button>))}</div></div>
            </div>}
          </div>}
          {members !== null && <Nav next={() => setStep(2)} disabled={!patientReady} />}
        </div>}

        {step === 2 && <div className="space-y-4">
          <label className="block text-sm font-bold">{t("What is the problem?")}<textarea className={inp + " mt-1 h-28 py-3"} value={c.complaint} onChange={(e) => setC({ ...c, complaint: e.target.value })} /></label>
          <div><div className="mb-1 text-sm font-bold">{t("Symptoms")}</div><div className="flex flex-wrap gap-2">{SYMPTOMS.map((s) => { const on = c.symptoms.includes(s); return (
            <button key={s} onClick={() => setC({ ...c, symptoms: on ? c.symptoms.filter((x) => x !== s) : [...c.symptoms, s] })} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", on ? "border-teal-600 bg-teal-600 text-white" : "border-border")}>{t(s)}</button>); })}</div></div>
          <div><div className="mb-1 text-sm font-bold">{t("Since when?")}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{DURATIONS.map((d) => (
            <button key={d} onClick={() => setC({ ...c, duration: d })} className={cn("h-11 rounded-xl border-2 text-sm font-semibold", c.duration === d ? "border-teal-600 bg-teal-50 dark:bg-teal-500/10" : "border-border")}>{t(d)}</button>))}</div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">{t("Known conditions")}<input className={inp + " mt-1"} value={c.conditions} onChange={(e) => setC({ ...c, conditions: e.target.value })} placeholder="BP, sugar, asthma…" /></label>
            <label className="text-sm font-bold">{t("Medicines you take now")}<input className={inp + " mt-1"} value={c.meds} onChange={(e) => setC({ ...c, meds: e.target.value })} /></label>
            <label className="text-sm font-bold">{t("Allergies")}<input className={inp + " mt-1"} value={c.allergies} onChange={(e) => setC({ ...c, allergies: e.target.value })} /></label>
            {!!ctx?.specializations.length && <label className="text-sm font-bold">{t("Preferred speciality")}<select className={inp + " mt-1"} value={c.specialization} onChange={(e) => setC({ ...c, specialization: e.target.value })}>
              <option value="">{t("Any doctor")}</option>{ctx.specializations.map((s) => <option key={s}>{s}</option>)}</select></label>}
          </div>
          <div><div className="mb-1 text-sm font-bold">{t("Photos (optional)")}</div><div className="flex flex-wrap gap-2">{photos.map((ph, i) => (
            <span key={ph.url} className="relative h-20 w-20 overflow-hidden rounded-xl border border-border"><img src={ph.preview} alt="" className="h-full w-full object-cover" />
              <button className="absolute end-1 top-1 rounded-full bg-black/60 p-0.5 text-white" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button></span>))}
            {photos.length < 5 && <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground"><ImagePlus className="h-5 w-5" />{t("Add photo")}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void addPhoto(e.target.files?.[0])} /></label>}</div></div>
          <Nav back={() => setStep(1)} next={() => setStep(3)} disabled={!problemReady} />
        </div>}

        {step === 3 && <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-teal-700 to-emerald-800 p-4 text-white"><span className="font-semibold">{t("Consultation fee")}</span><span className="text-3xl font-black tabular-nums">{rs(ctx?.fee)}</span></div>
          {ctx?.instructions && <div className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm" dir="ltr">{ctx.instructions}</div>}
          <div><div className="mb-1 text-sm font-bold">{t("How will you pay?")}</div><div className="grid grid-cols-2 gap-2">{ctx?.methods.map((m) => (
            <button key={m} onClick={() => setPay({ ...pay, method: m, later: false })} className={cn("flex h-12 items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold", pay.method === m && !pay.later ? "border-teal-600 bg-teal-50 dark:bg-teal-500/10" : "border-border")}><Wallet className="h-4 w-4" />{m}</button>))}</div></div>
          {!pay.later && <>
            <label className="block text-sm font-bold">{t("Transaction ID")}<input className={inp + " mt-1"} dir="ltr" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-border p-3">{pay.proofPreview ? <img src={pay.proofPreview} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
              <span className="text-sm font-semibold">{pay.proof ? "✓ " : ""}{t("Upload receipt")}</span><input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void addProof(e.target.files?.[0])} /></label>
          </>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pay.later} onChange={(e) => setPay({ ...pay, later: e.target.checked })} />{t("Pay later from your link")}</label>
          <Nav back={() => setStep(2)} next={() => setStep(4)} disabled={!payReady} />
        </div>}

        {step === 4 && <div className="space-y-3">
          <Row icon={User} k={t("Patient")} v={`${pname}${!patient && p.age ? ` · ${p.age}` : ""} · ${normPhone}`} />
          <Row icon={ClipboardList} k={t("Problem")} v={[c.complaint, c.symptoms.map((s) => t(s)).join("، "), c.duration && t(c.duration)].filter(Boolean).join(" · ")} />
          <Row icon={Stethoscope} k={t("Preferred speciality")} v={c.specialization || t("Any doctor")} />
          <Row icon={Wallet} k={t("Payment")} v={pay.later ? t("Pay later from your link") : `${pay.method} · ${rs(ctx?.fee)}${pay.reference ? ` · ${pay.reference}` : ""}`} />
          <label className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t("I agree to receive WhatsApp / SMS messages about this consultation")}</label>
          <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Only you and the clinic can open your link. Medical details are never sent in messages.</div>
          <div className="flex gap-2"><button onClick={() => setStep(3)} className="flex h-12 items-center gap-1 rounded-xl border border-border px-4 font-semibold"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t("Back")}</button>
            <button disabled={busy} onClick={() => void submit()} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-lg font-bold text-white disabled:opacity-60">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{t("Send request")}</button></div>
        </div>}
      </div>
      {!!ctx?.doctors.length && <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{ctx.doctors.map((d) => (
        <div key={d.doctor_name} className="min-w-[180px] rounded-2xl bg-card p-3 shadow-sm"><div className="font-bold">{i18n.language === "ur" && d.doctor_name_ur ? d.doctor_name_ur : d.doctor_name}</div>
          <div className="text-xs text-muted-foreground">{d.specialization}{d.qualification ? ` · ${d.qualification}` : ""}</div></div>))}</div>}
    </PublicShell>
  );
}

function Nav({ back, next, disabled }: { back?: () => void; next: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 pt-2">{back && <button onClick={back} className="flex h-12 items-center gap-1 rounded-xl border border-border px-4 font-semibold"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t("Back")}</button>}
      <button disabled={disabled} onClick={next} className="h-12 flex-1 rounded-xl bg-teal-600 font-bold text-white disabled:opacity-40">{t("Continue")}</button></div>
  );
}

function Row({ icon: Icon, k, v }: { icon: typeof User; k: string; v?: string }) {
  return <div className="flex gap-3 rounded-xl border border-border p-3"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" /><div className="min-w-0"><div className="text-xs font-semibold text-muted-foreground">{k}</div><div className="break-words font-medium">{v}</div></div></div>;
}
