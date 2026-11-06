import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck, ChevronLeft, Clock, Stethoscope, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/common";
import { cn } from "@/utils/cn";
import { PublicShell } from "./shared";

const M = (x: string) => `hospital_vvs.api.appointments.${x}`;
interface Opts { clinic: { name: string; name_ur?: string; phone?: string }; branches: { name: string }[]; specializations: { name: string; name_ur?: string }[];
  doctors: { name: string; doctor_name: string; doctor_name_ur?: string; specialization: string; default_fee: number; qualification?: string; branch?: string }[]; payment_channels: string[]; hold_minutes: number }
type Step = "spec" | "doctor" | "date" | "time" | "details" | "pay" | "done";

export default function BookPage() {
  const { t, i18n } = useTranslation();
  const ur = i18n.language === "ur";
  const [opts, setOpts] = useState<Opts | null>(null);
  const [step, setStep] = useState<Step>("spec");
  const [spec, setSpec] = useState("");
  const [doctor, setDoctor] = useState<Opts["doctors"][number] | null>(null);
  const [dates, setDates] = useState<{ date: string; free: number }[]>([]);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<{ name: string; time: string }[]>([]);
  const [slot, setSlot] = useState<{ name: string; time: string } | null>(null);
  const [expires, setExpires] = useState<number>(0);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState({ sent: false, code: "", token: "", test: "" });
  const [members, setMembers] = useState<{ name: string; patient_name: string }[] | null>(null);
  const [patient, setPatient] = useState("");
  const [nm, setNm] = useState({ name: "", age: "", gender: "" });
  const [pay, setPay] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ booking_ref: string; status: string; manage_token: string; date: string; time: string; doctor: string; fee: number } | null>(null);
  const holdKey = useMemo(() => crypto.randomUUID().replace(/-/g, ""), []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { void getCall<Opts>(M("public_options")).then((o) => { setOpts(o); setPay(o.payment_channels[0] ?? "At Clinic"); }).catch((e) => toast.error(humanizeError(e))); }, []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, Math.round((expires - now) / 1000));

  const run = async <T,>(fn: () => Promise<T>) => { setBusy(true); try { return await fn(); } catch (e) { toast.error(humanizeError(e)); return undefined; } finally { setBusy(false); } };
  const chooseDoctor = (d: Opts["doctors"][number]) => run(async () => { setDoctor(d); setDates(await getCall(M("public_dates"), { doctor: d.name })); setStep("date"); });
  const chooseDate = (d: string) => run(async () => { setDate(d); setSlots(await getCall(M("public_slots"), { doctor: doctor!.name, date: d })); setStep("time"); });
  const chooseSlot = (s: { name: string; time: string }) => run(async () => {
    if (slot) await postCall(M("public_release"), { slot: slot.name, hold_key: holdKey }).catch(() => undefined);
    const r = await postCall<{ expires_at: string }>(M("public_hold"), { slot: s.name, hold_key: holdKey });
    setSlot(s); setExpires(Date.now() + (opts?.hold_minutes ?? 10) * 60_000); void r; setStep("details");
  });
  const sendOtp = () => run(async () => {
    const r = await postCall<{ existing: boolean; test_code?: string }>(M("request_otp"), { phone });
    if (!r.existing) { setMembers([]); return; }
    setOtp((o) => ({ ...o, sent: true, test: r.test_code ?? "" }));
  });
  const verifyOtp = () => run(async () => {
    const r = await postCall<{ verified_token: string; patients: { name: string; patient_name: string }[] }>(M("verify_otp"), { phone, code: otp.code });
    setOtp((o) => ({ ...o, token: r.verified_token })); setMembers(r.patients); setPatient(r.patients[0]?.name ?? "");
  });
  const upload = (file: File) => run(async () => {
    const data = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(file); });
    setProof(await postCall<string>(M("upload_proof"), { filename: file.name, filedata: data }));
  });
  const confirm = () => run(async () => {
    const r = await postCall<typeof done>(M("public_book"), { data: JSON.stringify({ doctor: doctor!.name, slot: slot!.name, hold_key: holdKey, phone, verified_token: otp.token || undefined,
      patient: patient || undefined, patient_name: patient ? undefined : nm.name, age: nm.age, gender: nm.gender, payment_channel: pay, payment_proof: proof || undefined }) });
    setDone(r); setStep("done");
  });

  const back: Partial<Record<Step, Step>> = { doctor: "spec", date: "doctor", time: "date", details: "time", pay: "details" };
  const docs = (opts?.doctors ?? []).filter((d) => d.specialization === spec);
  const steps: Step[] = ["spec", "doctor", "date", "time", "details", "pay"];
  return (
    <PublicShell clinic={opts?.clinic.name} clinicUr={opts?.clinic.name_ur}>
      <div className="rounded-3xl bg-card p-5 shadow-xl">
        {step !== "done" && <div className="mb-4 flex items-center gap-2">
          {back[step] && <button onClick={() => setStep(back[step]!)} className="rounded-full p-1 hover:bg-muted"><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></button>}
          <div className="flex flex-1 gap-1">{steps.map((s, i) => <span key={s} className={cn("h-1.5 flex-1 rounded-full", steps.indexOf(step) >= i ? "bg-primary" : "bg-muted")} />)}</div>
          {slot && step !== "time" && left > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-amber-700"><Clock className="h-3 w-3" />{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>}
        </div>}
        {step === "spec" && <><h1 className="mb-3 text-xl font-extrabold">{t("Choose a speciality")}</h1>
          <div className="grid grid-cols-2 gap-2">{(opts?.specializations ?? []).map((s) => <button key={s.name} onClick={() => { setSpec(s.name); setStep("doctor"); }} className="rounded-2xl border border-border p-4 text-start hover:border-primary hover:bg-primary/5">
            <Stethoscope className="mb-2 h-5 w-5 text-primary" /><div className="font-semibold">{ur && s.name_ur ? s.name_ur : s.name}</div></button>)}</div></>}
        {step === "doctor" && <><h1 className="mb-3 text-xl font-extrabold">{t("Choose a doctor")}</h1>
          <div className="space-y-2">{docs.map((d) => <button key={d.name} disabled={busy} onClick={() => void chooseDoctor(d)} className="flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-start hover:border-primary">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 font-bold text-white">{d.doctor_name.replace("Dr. ", "").slice(0, 1)}</span>
            <span className="flex-1"><b>{ur && d.doctor_name_ur ? d.doctor_name_ur : d.doctor_name}</b><span className="block text-xs text-muted-foreground">{d.qualification} · {d.branch}</span></span><span className="font-bold text-primary">Rs {d.default_fee.toLocaleString()}</span></button>)}</div></>}
        {step === "date" && <><h1 className="mb-3 text-xl font-extrabold">{t("Choose a date")}</h1>
          <div className="grid grid-cols-4 gap-2">{dates.map((d) => { const dt = new Date(d.date + "T00:00"); return (
            <button key={d.date} onClick={() => void chooseDate(d.date)} className="rounded-2xl border border-border p-2 text-center hover:border-primary"><div className="text-[11px] uppercase text-muted-foreground">{dt.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className="text-2xl font-extrabold">{dt.getDate()}</div><div className="text-[10px] text-muted-foreground">{dt.toLocaleDateString(undefined, { month: "short" })}</div></button>); })}</div>
          {!dates.length && <p className="text-sm text-muted-foreground">No free times in the next days. Please choose another doctor.</p>}</>}
        {step === "time" && <><h1 className="mb-3 text-xl font-extrabold">{t("Choose a time")}</h1>
          <div className="grid grid-cols-4 gap-2">{slots.map((s) => <button key={s.name} disabled={busy} onClick={() => void chooseSlot(s)} className="rounded-xl border border-border py-3 font-bold tabular-nums hover:border-primary hover:bg-primary hover:text-primary-foreground">{s.time}</button>)}</div>
          {!slots.length && <p className="text-sm text-muted-foreground">This day just filled up. Please go back and pick another date.</p>}</>}
        {step === "details" && <><h1 className="mb-1 text-xl font-extrabold">{t("Your details")}</h1>
          <p className="mb-4 text-sm text-muted-foreground">{doctor?.doctor_name} · {date} · {slot?.time}</p>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("Phone")}</label>
          <div className="flex gap-2"><input className={inputCls + " h-11"} inputMode="tel" placeholder="03XX XXXXXXX" value={phone} onChange={(e) => { setPhone(e.target.value); setMembers(null); setOtp({ sent: false, code: "", token: "", test: "" }); }} />
            <Button variant="outline" className="h-11" disabled={phone.replace(/\D/g, "").length < 10 || busy} onClick={() => void sendOtp()}>{t("Next")}</Button></div>
          {otp.sent && !otp.token && <div className="mt-3 rounded-2xl bg-teal-50 p-3 dark:bg-teal-500/10"><p className="mb-2 text-sm">This number is registered with us. Enter the code we sent on WhatsApp / SMS.{otp.test && <b className="ms-1">(test code {otp.test})</b>}</p>
            <div className="flex gap-2"><input className={inputCls + " h-11 text-center tracking-[0.4em]"} inputMode="numeric" value={otp.code} onChange={(e) => setOtp((o) => ({ ...o, code: e.target.value }))} /><Button variant="primary" className="h-11" onClick={() => void verifyOtp()}>{t("Verify")}</Button></div></div>}
          {members && members.length > 0 && <div className="mt-3 space-y-2"><div className="text-xs font-semibold text-muted-foreground">Who is the appointment for?</div>
            {members.map((m) => <label key={m.name} className={cn("flex items-center gap-2 rounded-xl border p-3", patient === m.name ? "border-primary bg-primary/5" : "border-border")}><input type="radio" checked={patient === m.name} onChange={() => setPatient(m.name)} className="accent-teal-600" />{m.patient_name}</label>)}
            <label className={cn("flex items-center gap-2 rounded-xl border p-3", patient === "" ? "border-primary bg-primary/5" : "border-border")}><input type="radio" checked={patient === ""} onChange={() => setPatient("")} className="accent-teal-600" />Someone else (new patient)</label></div>}
          {members && patient === "" && <div className="mt-3 grid grid-cols-[1fr_80px] gap-2"><input className={inputCls + " h-11"} placeholder={t("Name")} value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} />
            <input className={inputCls + " h-11"} placeholder={t("Age")} inputMode="numeric" value={nm.age} onChange={(e) => setNm({ ...nm, age: e.target.value })} />
            <div className="col-span-2 grid grid-cols-3 gap-2">{["Male", "Female", "Other"].map((g) => <button key={g} onClick={() => setNm({ ...nm, gender: g })} className={cn("h-10 rounded-lg border text-sm font-semibold", nm.gender === g ? "border-primary bg-primary/10 text-primary" : "border-border")}>{t(g)}</button>)}</div></div>}
          <Button variant="primary" size="lg" className="mt-4 w-full" disabled={!members || (patient === "" && (!nm.name || !nm.gender))} onClick={() => setStep("pay")}>{t("Next")}</Button></>}
        {step === "pay" && <><h1 className="mb-3 text-xl font-extrabold">Fee & payment</h1>
          <div className="mb-3 rounded-2xl bg-gradient-to-br from-teal-700 to-emerald-500 p-4 text-white"><div className="text-xs uppercase text-white/75">{t("Fee")}</div><div className="text-3xl font-extrabold">Rs {doctor?.default_fee.toLocaleString()}</div></div>
          <div className="space-y-2">{(opts?.payment_channels ?? []).map((c) => <label key={c} className={cn("flex items-center gap-2 rounded-xl border p-3", pay === c ? "border-primary bg-primary/5" : "border-border")}><input type="radio" checked={pay === c} onChange={() => setPay(c)} className="accent-teal-600" />{c === "At Clinic" ? t("Pay at clinic") : c === "Payment Proof" ? t("Payment proof") : c}</label>)}</div>
          {pay === "Payment Proof" && <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-sm"><Upload className="h-4 w-4" />{proof ? "Uploaded ✓" : "Upload the payment screenshot"}<input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} /></label>}
          <Button variant="submit" size="lg" className="mt-4 w-full" loading={busy} disabled={pay === "Payment Proof" && !proof} onClick={() => void confirm()}><CalendarCheck className="h-5 w-5" />{t("Confirm")}</Button></>}
        {step === "done" && done && <div className="py-4 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CalendarCheck className="h-8 w-8" /></div>
          <h1 className="text-2xl font-extrabold">{done.status === "Confirmed" ? t("Booking confirmed") : "Booking received"}</h1>
          <p className="text-muted-foreground">{done.doctor} · {done.date} · {done.time}</p>
          <div className="my-4 rounded-2xl bg-muted p-4"><div className="text-xs uppercase text-muted-foreground">{t("Booking reference")}</div><div className="font-mono text-3xl font-extrabold tracking-widest">{done.booking_ref}</div></div>
          <a href={`/hms/my-appointment/${done.manage_token}`} className="font-semibold text-primary hover:underline">Manage this booking →</a></div>}
      </div>
    </PublicShell>
  );
}
