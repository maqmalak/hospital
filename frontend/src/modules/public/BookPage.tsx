import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Baby, Bone, CalendarCheck, CalendarDays, CalendarPlus, Check, ChevronLeft, Clock, Copy, Ear, HeartPulse, Loader2, MessageCircle, Moon, Phone,
  Search, ShieldCheck, Sparkles, Stethoscope, Sun, Sunrise, Upload, User, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { PublicShell } from "./shared";

const M = (x: string) => `hospital_vvs.api.appointments.${x}`;
interface Doctor { name: string; doctor_name: string; doctor_name_ur?: string; specialization: string; default_fee: number; qualification?: string; branch?: string;
  color?: string; photo?: string; consultation_room?: string; next_date?: string | null; free_slots: number; days: { day: string; from: string; to: string }[] }
interface Opts { clinic: { name: string; name_ur?: string; phone?: string; address?: string }; branches: { name: string; address?: string }[];
  specializations: { name: string; name_ur?: string }[]; doctors: Doctor[]; payment_channels: string[]; hold_minutes: number }
interface Slot { name: string; time: string; end?: string }
interface Done { booking_ref: string; status: string; manage_token: string; date: string; time: string; doctor: string; fee: number; phone?: string }
type Step = 1 | 2 | 3 | 4 | 5;

const SPEC_ICON: Record<string, LucideIcon> = { Cardiologist: HeartPulse, Paediatrician: Baby, "Orthopaedic Surgeon": Bone, "ENT Specialist": Ear, Dermatologist: Sparkles,
  Gynaecologist: HeartPulse, "General Physician": Stethoscope };
const STEPS = ["Speciality", "Doctor", "Date & time", "Your details", "Confirm"];
const band = (c?: string) => `linear-gradient(135deg, ${c || "#0d9488"} 0%, color-mix(in srgb, ${c || "#0d9488"} 55%, #0b2530) 100%)`;
const initials = (n: string) => n.replace(/^Dr\.?\s*/i, "").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + "T00:00").toLocaleDateString(undefined, opts);
const rel = (d?: string | null) => {
  if (!d) return "No free time soon";
  const days = Math.round((new Date(d + "T00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Tomorrow" : fmtDay(d, { weekday: "short", day: "numeric", month: "short" });
};
const to12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

export default function BookPage() {
  const { t, i18n } = useTranslation();
  const ur = i18n.language === "ur";
  const [opts, setOpts] = useState<Opts | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("");
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [dates, setDates] = useState<{ date: string; free: number }[]>([]);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [expires, setExpires] = useState(0);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState({ sent: false, code: "", token: "", test: "" });
  const [members, setMembers] = useState<{ name: string; patient_name: string }[] | null>(null);
  const [patient, setPatient] = useState("");
  const [nm, setNm] = useState({ name: "", age: "", gender: "" });
  const [consent, setConsent] = useState(true);
  const [pay, setPay] = useState("");
  const [proof, setProof] = useState<{ url: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const holdKey = useMemo(() => crypto.randomUUID().replace(/-/g, ""), []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { void getCall<Opts>(M("public_options")).then((o) => { setOpts(o); setPay(o.payment_channels[0] ?? "At Clinic"); }).catch((e) => toast.error(humanizeError(e))); }, []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, Math.round((expires - now) / 1000));
  useEffect(() => { if (slot && expires && left === 0 && step > 3 && step < 6 && !done) { toast.error("Your held time expired. Please pick a time again."); setSlot(null); setStep(3); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async <T,>(fn: () => Promise<T>) => { setBusy(true); try { return await fn(); } catch (e) { toast.error(humanizeError(e)); return undefined; } finally { setBusy(false); } };
  const chooseDoctor = (d: Doctor) => run(async () => {
    setDoctor(d); setSpec(d.specialization); setSlot(null); setSlots(null);
    const ds = await getCall<{ date: string; free: number }[]>(M("public_dates"), { doctor: d.name });
    setDates(ds); setStep(3);
    if (ds[0]) await loadSlots(d, ds[0].date);
  });
  const loadSlots = async (d: Doctor, day: string) => { setDate(day); setSlots(null); setSlots(await getCall<Slot[]>(M("public_slots"), { doctor: d.name, date: day })); };
  const chooseSlot = (s: Slot) => run(async () => {
    if (slot) await postCall(M("public_release"), { slot: slot.name, hold_key: holdKey }).catch(() => undefined);
    await postCall(M("public_hold"), { slot: s.name, hold_key: holdKey });
    setSlot(s); setExpires(Date.now() + (opts?.hold_minutes ?? 10) * 60_000); setStep(4);
  });
  const normPhone = phone.replace(/\D/g, "").replace(/^92/, "0").replace(/^3/, "03");
  const sendOtp = () => run(async () => {
    const r = await postCall<{ existing: boolean; test_code?: string }>(M("request_otp"), { phone: normPhone });
    if (!r.existing) { setMembers([]); setPatient(""); return; }
    setOtp((o) => ({ ...o, sent: true, test: r.test_code ?? "" }));
  });
  const verifyOtp = () => run(async () => {
    const r = await postCall<{ verified_token: string; patients: { name: string; patient_name: string }[] }>(M("verify_otp"), { phone: normPhone, code: otp.code });
    setOtp((o) => ({ ...o, token: r.verified_token })); setMembers(r.patients); setPatient(r.patients[0]?.name ?? "");
  });
  const upload = (file: File) => run(async () => {
    const data = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(file); });
    setProof({ url: await postCall<string>(M("upload_proof"), { filename: file.name, filedata: data }), preview: file.type.startsWith("image/") ? data : "" });
  });
  const confirm = () => run(async () => {
    const r = await postCall<Done>(M("public_book"), { data: JSON.stringify({ doctor: doctor!.name, slot: slot!.name, hold_key: holdKey, phone: normPhone,
      verified_token: otp.token || undefined, patient: patient || undefined, patient_name: patient ? undefined : nm.name, age: nm.age, gender: nm.gender,
      payment_channel: pay, payment_proof: proof?.url, messages_allowed: consent ? 1 : 0 }) });
    setDone(r);
  });

  const detailsOk = !!members && (patient !== "" || (!!nm.name.trim() && !!nm.gender && !!nm.age));
  const ql = q.toLowerCase();
  const doctors = (opts?.doctors ?? []).filter((d) => (!spec || d.specialization === spec) && (!ql || `${d.doctor_name} ${d.specialization} ${d.doctor_name_ur ?? ""}`.toLowerCase().includes(ql)));
  const specCount = (s: string) => (opts?.doctors ?? []).filter((d) => d.specialization === s).length;
  const groups = slots ? [
    { label: "Morning", icon: Sunrise, list: slots.filter((s) => Number(s.time.slice(0, 2)) < 12) },
    { label: "Afternoon", icon: Sun, list: slots.filter((s) => { const h = Number(s.time.slice(0, 2)); return h >= 12 && h < 17; }) },
    { label: "Evening", icon: Moon, list: slots.filter((s) => Number(s.time.slice(0, 2)) >= 17) },
  ].filter((g) => g.list.length) : [];
  const docName = (d: Doctor) => (ur && d.doctor_name_ur ? d.doctor_name_ur : d.doctor_name);
  const memberName = members?.find((m) => m.name === patient)?.patient_name || nm.name;

  if (done) return (
    <PublicShell clinic={opts?.clinic.name} clinicUr={opts?.clinic.name_ur} phone={opts?.clinic.phone} address={opts?.clinic.address}>
      <DoneCard done={done} doctor={doctor} clinic={opts?.clinic} onAgain={() => window.location.reload()} />
    </PublicShell>
  );

  return (
    <PublicShell clinic={opts?.clinic.name} clinicUr={opts?.clinic.name_ur} phone={opts?.clinic.phone} address={opts?.clinic.address} wide>
      <div className="mb-6 pt-2 text-white">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("Book appointment")}</h1>
        <p className="mt-1 text-teal-50/80">Pick a doctor and a time — confirmation comes on WhatsApp. <span className="font-urdu">آن لائن اپوائنٹمنٹ</span></p>
      </div>
      <ol className="mb-5 grid grid-cols-5 gap-2">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step; const active = step === n; const passed = step > n;
          return (
            <li key={label}><button disabled={!passed} onClick={() => setStep(n)} className="w-full text-start">
              <div className={cn("h-1.5 rounded-full transition-all", passed ? "bg-emerald-400" : active ? "bg-white" : "bg-white/25")} />
              <div className={cn("mt-1.5 hidden items-center gap-1.5 text-xs font-semibold sm:flex", active ? "text-white" : passed ? "text-emerald-200" : "text-white/50")}>
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px]", passed ? "bg-emerald-400 text-emerald-950" : active ? "bg-white text-teal-800" : "bg-white/20")}>{passed ? <Check className="h-3 w-3" /> : n}</span>{label}</div>
            </button></li>);
        })}
      </ol>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <section className="min-h-[420px] min-w-0 rounded-[28px] border border-border/60 bg-card p-5 shadow-[0_30px_80px_-40px_rgba(13,148,136,0.5)] sm:p-7">
          {step > 1 && <button onClick={() => setStep((step - 1) as Step)} className="mb-3 flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t("Back")}</button>}

          {!opts && <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}

          {opts && step === 1 && <>
            <h2 className="text-xl font-extrabold">What do you need help with?</h2>
            <p className="mb-4 text-sm text-muted-foreground">Choose a speciality, or search a doctor by name.</p>
            <label className="mb-5 flex items-center gap-2 rounded-2xl border border-input bg-[hsl(var(--input-bg))] px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
              <Search className="h-5 w-5 text-muted-foreground" /><input value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value) { setSpec(""); setStep(2); } }} placeholder="Doctor or speciality" className="h-12 flex-1 bg-transparent outline-none" />
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {opts.specializations.map((s) => { const I = SPEC_ICON[s.name] ?? Stethoscope; return (
                <button key={s.name} onClick={() => { setSpec(s.name); setQ(""); setStep(2); }}
                  className="group rounded-2xl border border-border p-4 text-start transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg">
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-600/30 transition-transform group-hover:scale-110"><I className="h-5 w-5" /></span>
                  <div className="font-semibold">{ur && s.name_ur ? s.name_ur : s.name}</div>
                  <div className="text-xs text-muted-foreground">{specCount(s.name)} doctor{specCount(s.name) !== 1 ? "s" : ""}</div>
                </button>); })}
            </div>
          </>}

          {opts && step === 2 && <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-xl font-extrabold">{spec ? (ur ? opts.specializations.find((s) => s.name === spec)?.name_ur || spec : spec) : "All doctors"}</h2>
              <label className="flex w-full items-center gap-2 rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3 sm:w-56"><Search className="h-4 w-4 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-10 flex-1 bg-transparent text-sm outline-none" /></label>
            </div>
            <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
              <button onClick={() => setSpec("")} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", !spec ? "bg-gradient-to-r from-teal-600 to-emerald-500 text-white" : "bg-muted")}>All</button>
              {opts.specializations.map((s) => <button key={s.name} onClick={() => setSpec(s.name)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", spec === s.name ? "bg-gradient-to-r from-teal-600 to-emerald-500 text-white" : "bg-muted")}>{ur && s.name_ur ? s.name_ur : s.name}</button>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {doctors.map((d) => (
                <button key={d.name} disabled={busy || !d.next_date} onClick={() => void chooseDoctor(d)}
                  className={cn("group overflow-hidden rounded-2xl border border-border text-start transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-50", doctor?.name === d.name && "ring-2 ring-primary")}>
                  <div className="flex items-center gap-3 p-4" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${d.color || "#0d9488"} 12%, transparent), transparent)` }}>
                    {d.photo ? <img src={d.photo} alt="" className="h-14 w-14 rounded-full object-cover" />
                      : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-extrabold text-white shadow-md" style={{ background: band(d.color) }}>{initials(d.doctor_name)}</span>}
                    <div className="min-w-0 flex-1"><div className="truncate font-bold">{docName(d)}</div><div className="truncate text-xs text-muted-foreground">{d.qualification} · {d.specialization}</div>
                      <div className="mt-1 text-sm font-extrabold text-teal-700 dark:text-teal-300">Rs {d.default_fee.toLocaleString()}</div></div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs">
                    <div className="flex gap-1">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <span key={x} className={cn("flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold", d.days.some((s) => s.day === x) ? "text-white" : "bg-muted text-muted-foreground/60")} style={d.days.some((s) => s.day === x) ? { background: band(d.color) } : undefined}>{x[0]}</span>)}</div>
                    <span className={cn("rounded-full px-2 py-0.5 font-semibold", d.next_date ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>{d.next_date ? `Next: ${rel(d.next_date)}` : "Fully booked"}</span>
                  </div>
                </button>))}
            </div>
            {!doctors.length && <p className="py-10 text-center text-sm text-muted-foreground">No doctor matches. Try another speciality.</p>}
          </>}

          {opts && step === 3 && doctor && <>
            <h2 className="text-xl font-extrabold">Choose a day and time</h2>
            <p className="mb-4 text-sm text-muted-foreground">{docName(doctor)} · {doctor.days.map((s) => `${s.day} ${to12(s.from)}–${to12(s.to)}`).slice(0, 2).join(" · ")}{doctor.days.length > 2 ? " …" : ""}</p>
            <div className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-2">
              {dates.map((d) => (
                <button key={d.date} onClick={() => void loadSlots(doctor, d.date)} className={cn("min-w-[78px] rounded-2xl border p-2.5 text-center transition-all", date === d.date ? "border-transparent bg-gradient-to-br from-teal-600 to-emerald-500 text-white shadow-lg shadow-teal-600/30" : "border-border hover:border-primary/50")}>
                  <div className={cn("text-[11px] font-semibold uppercase", date === d.date ? "text-white/80" : "text-muted-foreground")}>{rel(d.date) === "Today" || rel(d.date) === "Tomorrow" ? rel(d.date) : fmtDay(d.date, { weekday: "short" })}</div>
                  <div className="text-2xl font-extrabold leading-tight">{new Date(d.date + "T00:00").getDate()}</div>
                  <div className={cn("text-[10px]", date === d.date ? "text-white/80" : "text-muted-foreground")}>{fmtDay(d.date, { month: "short" })} · {d.free} free</div>
                </button>))}
              {!dates.length && <p className="text-sm text-muted-foreground">No free times in the next days. Please choose another doctor.</p>}
            </div>
            {slots === null && date ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              : groups.map((g) => (
                <div key={g.label} className="mb-4">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><g.icon className="h-4 w-4" />{g.label} <span className="font-normal normal-case">· {g.list.length}</span></div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {g.list.map((s) => <button key={s.name} disabled={busy} onClick={() => void chooseSlot(s)}
                      className={cn("rounded-xl border py-2.5 text-sm font-bold tabular-nums transition-all", slot?.name === s.name ? "border-transparent bg-primary text-primary-foreground" : "border-border hover:border-primary hover:bg-primary/5")}>{to12(s.time)}</button>)}
                  </div>
                </div>))}
            {slots && !slots.length && <p className="text-sm text-muted-foreground">This day just filled up. Please pick another date.</p>}
          </>}

          {opts && step === 4 && <>
            <h2 className="text-xl font-extrabold">{t("Your details")}</h2>
            <p className="mb-4 text-sm text-muted-foreground">We send the booking request and the confirmation to this WhatsApp number.</p>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">WhatsApp / mobile number</label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-xl border border-input bg-[hsl(var(--input-bg))] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
                <span className="flex items-center gap-1 border-e border-border px-3 text-sm font-semibold text-muted-foreground"><Phone className="h-4 w-4" />+92</span>
                <input inputMode="tel" placeholder="300 1234567" value={phone} onChange={(e) => { setPhone(e.target.value); setMembers(null); setOtp({ sent: false, code: "", token: "", test: "" }); }} className="h-12 flex-1 bg-transparent px-3 text-lg tracking-wide outline-none" />
              </div>
              <button disabled={normPhone.length < 11 || busy || !!members} onClick={() => void sendOtp()} className="rounded-xl bg-gradient-to-r from-teal-700 to-emerald-500 px-5 font-semibold text-white shadow-md disabled:opacity-40">{busy && !members ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Next")}</button>
            </div>
            {otp.sent && !otp.token && <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 dark:border-teal-500/30 dark:bg-teal-500/10">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-teal-600" />This number is registered with us</div>
              <p className="mb-3 text-sm text-muted-foreground">Enter the 6-digit code we sent on WhatsApp / SMS.{otp.test && <b className="ms-1 text-foreground">(test code {otp.test})</b>}</p>
              <div className="flex gap-2"><input inputMode="numeric" maxLength={6} value={otp.code} onChange={(e) => setOtp((o) => ({ ...o, code: e.target.value.replace(/\D/g, "") }))} className="h-12 flex-1 rounded-xl border border-input bg-[hsl(var(--input-bg))] text-center text-xl font-bold tracking-[0.5em] outline-none focus:border-primary" />
                <button disabled={otp.code.length < 6 || busy} onClick={() => void verifyOtp()} className="rounded-xl bg-gradient-to-r from-teal-700 to-emerald-500 px-5 font-semibold text-white disabled:opacity-40">{t("Verify")}</button></div>
            </div>}
            {members && members.length > 0 && <div className="mt-5"><div className="mb-2 text-xs font-semibold text-muted-foreground">Who is the appointment for?</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {members.map((m) => <button key={m.name} onClick={() => setPatient(m.name)} className={cn("flex items-center gap-3 rounded-2xl border p-3 text-start", patient === m.name ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border")}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white">{initials(m.patient_name)}</span><span className="font-semibold">{m.patient_name}</span>{patient === m.name && <Check className="ms-auto h-4 w-4 text-primary" />}</button>)}
                <button onClick={() => setPatient("")} className={cn("flex items-center gap-3 rounded-2xl border border-dashed p-3 text-start", patient === "" ? "border-primary bg-primary/5" : "border-border")}><UserPlus className="h-5 w-5 text-primary" /><span className="font-semibold">Someone else</span></button>
              </div></div>}
            {members && patient === "" && <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_110px]">
              <div><label className="mb-1 block text-xs font-semibold text-muted-foreground">Patient name</label><div className="flex items-center gap-2 rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3 focus-within:border-primary"><User className="h-4 w-4 text-muted-foreground" /><input value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} className="h-11 flex-1 bg-transparent outline-none" /></div></div>
              <div><label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("Age")}</label><input inputMode="numeric" value={nm.age} onChange={(e) => setNm({ ...nm, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} className="h-11 w-full rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3 outline-none focus:border-primary" /></div>
              <div className="grid grid-cols-3 gap-2 sm:col-span-2">{["Male", "Female", "Other"].map((g) => <button key={g} onClick={() => setNm({ ...nm, gender: g })} className={cn("h-11 rounded-xl border text-sm font-semibold", nm.gender === g ? "border-transparent bg-gradient-to-r from-teal-600 to-emerald-500 text-white" : "border-border")}>{t(g)}</button>)}</div>
            </div>}
            {members && <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-green-200 bg-green-50/70 p-3 text-sm dark:border-green-500/30 dark:bg-green-500/10">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-green-600" />
              <span><span className="flex items-center gap-1.5 font-semibold"><MessageCircle className="h-4 w-4 text-green-600" />Send me booking updates on WhatsApp / SMS</span>
                <span className="text-xs text-muted-foreground">Request received, confirmation and reminders only — never medical details.</span></span></label>}
            <button disabled={!detailsOk} onClick={() => setStep(5)} className="mt-6 h-12 w-full rounded-xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-500 font-semibold text-white shadow-lg shadow-teal-700/25 disabled:opacity-40">{t("Next")}</button>
          </>}

          {opts && step === 5 && doctor && slot && <>
            <h2 className="text-xl font-extrabold">Review & payment</h2>
            <p className="mb-4 text-sm text-muted-foreground">Check the details and choose how to pay the consultation fee.</p>
            <div className="mb-5 grid gap-2">
              {(opts.payment_channels).map((c) => { const meta = c === "At Clinic" ? { I: Wallet, l: t("Pay at clinic"), d: "Pay at reception when you arrive" } : c === "Payment Proof" ? { I: Upload, l: t("Payment proof"), d: "Send to the clinic account, upload the screenshot" } : { I: Wallet, l: c, d: "Pay online now" };
                return <button key={c} onClick={() => setPay(c)} className={cn("flex items-center gap-3 rounded-2xl border p-4 text-start", pay === c ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border")}>
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", pay === c ? "bg-gradient-to-br from-teal-600 to-emerald-500 text-white" : "bg-muted")}><meta.I className="h-5 w-5" /></span>
                  <span className="flex-1"><span className="block font-semibold">{meta.l}</span><span className="block text-xs text-muted-foreground">{meta.d}</span></span>{pay === c && <Check className="h-5 w-5 text-primary" />}</button>; })}
            </div>
            {pay === "Payment Proof" && <label className="mb-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-5 text-center text-sm hover:border-primary">
              {proof?.preview ? <img src={proof.preview} alt="" className="max-h-40 rounded-lg" /> : <Upload className="h-6 w-6 text-primary" />}
              <span className="font-semibold">{proof ? "Uploaded — tap to change" : "Upload payment screenshot"}</span><span className="text-xs text-muted-foreground">JPG, PNG or PDF · max 5 MB</span>
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} /></label>}
            <button disabled={busy || (pay === "Payment Proof" && !proof)} onClick={() => void confirm()} className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-700/25 disabled:opacity-40">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarCheck className="h-5 w-5" />}Send booking request</button>
            <p className="mt-2 text-center text-xs text-muted-foreground">Reception reviews your request and confirms it on WhatsApp.</p>
          </>}
        </section>

        {/* summary */}
        <aside className="rounded-[28px] border border-border/60 bg-card p-5 shadow-sm lg:sticky lg:top-4">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Your booking</h3>
            {slot && left > 0 && <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums", left < 120 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800")}><Clock className="h-3.5 w-3.5" />Held {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>}</div>
          {doctor ? <div className="flex items-center gap-3 rounded-2xl p-3 text-white" style={{ background: band(doctor.color) }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 font-extrabold">{initials(doctor.doctor_name)}</span>
            <div className="min-w-0"><div className="truncate font-bold">{docName(doctor)}</div><div className="truncate text-xs text-white/80">{doctor.specialization}{doctor.consultation_room ? ` · Room ${doctor.consultation_room}` : ""}</div></div></div>
            : <div className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Choose a doctor to start</div>}
          <dl className="mt-4 space-y-3 text-sm">
            <Row icon={CalendarDays} label="Date" value={date && slot ? fmtDay(date, { weekday: "long", day: "numeric", month: "long" }) : "—"} />
            <Row icon={Clock} label="Time" value={slot ? to12(slot.time) : "—"} />
            <Row icon={User} label="Patient" value={memberName || "—"} />
            <Row icon={Phone} label="WhatsApp" value={normPhone.length >= 11 ? normPhone : "—"} />
          </dl>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-gradient-to-r from-teal-50 to-emerald-50 p-4 dark:from-teal-500/10 dark:to-emerald-500/5">
            <span className="text-sm font-semibold text-muted-foreground">{t("Fee")}</span><span className="text-2xl font-extrabold tabular-nums text-teal-700 dark:text-teal-300">Rs {(doctor?.default_fee ?? 0).toLocaleString()}</span></div>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-green-600" />Request and confirmation on WhatsApp</div>
            <div className="flex items-center gap-2"><CalendarPlus className="h-4 w-4 text-teal-600" />Reschedule or cancel from your booking link</div>
          </div>
        </aside>
      </div>
    </PublicShell>
  );
}

function Row({ icon: I, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted"><I className="h-4 w-4 text-muted-foreground" /></span><dt className="w-16 text-muted-foreground">{label}</dt><dd className="flex-1 truncate text-end font-semibold">{value}</dd></div>;
}

function DoneCard({ done, doctor, clinic, onAgain }: { done: Done; doctor: Doctor | null; clinic?: Opts["clinic"]; onAgain: () => void }) {
  const pending = done.status !== "Confirmed";
  const link = `${window.location.origin}/hms/my-appointment/${done.manage_token}`;
  const ics = () => {
    const start = `${done.date.replace(/-/g, "")}T${done.time.replace(":", "")}00`;
    const [h, m] = done.time.split(":").map(Number);
    const endT = new Date(2000, 0, 1, h, m + 15);
    const end = `${done.date.replace(/-/g, "")}T${String(endT.getHours()).padStart(2, "0")}${String(endT.getMinutes()).padStart(2, "0")}00`;
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VVSDesk//EN", "BEGIN:VEVENT", `UID:${done.booking_ref}@vvsdesk`, `DTSTART:${start}`, `DTEND:${end}`,
      `SUMMARY:Appointment ${done.booking_ref} — ${done.doctor}`, `LOCATION:${clinic?.name ?? ""} ${clinic?.address ?? ""}`, `DESCRIPTION:Manage: ${link}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" })); a.download = `${done.booking_ref}.ics`; a.click();
  };
  return (
    <div className="overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-[0_30px_80px_-40px_rgba(13,148,136,0.6)]">
      <div className={cn("relative p-7 text-center text-white", pending ? "bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500" : "bg-gradient-to-br from-teal-600 via-emerald-500 to-green-500")}>
        <div className="absolute -end-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="relative mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur">{pending ? <Clock className="h-8 w-8" /> : <CalendarCheck className="h-8 w-8" />}</div>
        <h1 className="relative text-2xl font-extrabold">{pending ? "Request sent!" : "Appointment confirmed!"}</h1>
        <p className="relative mt-1 text-sm text-white/90">{pending ? "Reception will review it and confirm on WhatsApp." : "See you at the clinic."}</p>
      </div>
      <div className="p-6">
        <div className="mb-4 rounded-2xl border border-dashed border-border p-4 text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Booking reference</div>
          <div className="mt-1 flex items-center justify-center gap-2 font-mono text-3xl font-extrabold tracking-[0.2em]">{done.booking_ref}
            <button onClick={() => { void navigator.clipboard.writeText(done.booking_ref); toast.success("Copied"); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><Copy className="h-4 w-4" /></button></div>
        </div>
        <dl className="space-y-3 text-sm">
          <Row icon={Stethoscope} label="Doctor" value={done.doctor} />
          <Row icon={CalendarDays} label="Date" value={fmtDay(done.date, { weekday: "long", day: "numeric", month: "long" })} />
          <Row icon={Clock} label="Time" value={to12(done.time)} />
          <Row icon={Wallet} label="Fee" value={`Rs ${done.fee.toLocaleString()}`} />
        </dl>
        {done.phone && <div className="mt-4 flex items-start gap-3 rounded-2xl bg-green-50 p-3 text-sm dark:bg-green-500/10">
          <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <span>We sent a WhatsApp message to <b>{done.phone}</b>{pending ? " confirming we received your request. You'll get another message when reception confirms." : " with your confirmation."}</span></div>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={ics} className="flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-semibold hover:bg-muted"><CalendarPlus className="h-4 w-4" />Add to calendar</button>
          <a href={link} className="flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-semibold hover:bg-muted"><CalendarDays className="h-4 w-4" />Manage booking</a>
        </div>
        <button onClick={onAgain} className="mt-2 w-full rounded-xl bg-gradient-to-r from-teal-700 to-emerald-500 py-3 text-sm font-semibold text-white">Book another appointment</button>
        {doctor && clinic?.phone && <p className="mt-4 text-center text-xs text-muted-foreground">Questions? Call {clinic.phone}</p>}
      </div>
    </div>
  );
}
