/**
 * Online imaging booking (D-91, Part B): modality → scan → date & slot (live availability, X-ray walk-in) → patient details →
 * payment option → confirmation with booking ID, QR, preparation, map, add-to-calendar and SMS / WhatsApp confirmation.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, ArrowRight, Bone, CalendarPlus, Check, CheckCircle2, ClipboardCheck, Clock3, CreditCard, FileUp, HeartPulse, Landmark,
  Loader2, MapPin, MessageCircle, Search, ShieldCheck, Sparkles, Upload, Wallet, Waves, X, type LucideIcon,
} from "lucide-react";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { qrSvg } from "@/lib/print";
import { CONFIG } from "../content";
import { rs, useDoctors } from "../data";
import { Wrap } from "../SiteV2";
import { btn, card, Eyebrow, Reveal, useTitle } from "../ui";
import { dmy, hm12, turnaround, useCatalogue, type Modality, type Procedure } from "../radiology";

const STEP_LABELS = ["Modality", "Scan", "Date & time", "Patient", "Payment", "Confirmed"];
const MODS: { key: Modality; title: string; text: string; icon: LucideIcon; note: string }[] = [
  { key: "X-Ray", title: "X-ray", text: "Digital X-ray of chest, bones, spine, abdomen and dental OPG; contrast studies.", icon: Bone, note: "Walk-in 24/7" },
  { key: "Ultrasound", title: "Ultrasound", text: "Abdomen, pelvis, KUB, thyroid, breast and pregnancy scans including 3D / 4D.", icon: Waves, note: "Mon-Sat 9 am - 9 pm" },
  { key: "Doppler", title: "Doppler", text: "Blood-flow studies: carotid, arterial, venous, renal and obstetric Doppler.", icon: HeartPulse, note: "Mon-Sat 10 am - 6 pm" },
];

interface Slot { time: string; free: number }
interface Summary { name: string; booking_ref: string; procedure: string; modality: string; date: string; time: string | null; walk_in: number; duration: number; price: number;
  preparation: string; payment_option: string; payment_status: string; patient_name: string; portal: string; location: string; pay?: { url: string } | null }

const inp = "h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-ring)]";
const store = { get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } } };

export default function RadiologyBook() {
  useTitle("Book a scan — Radiology & Imaging", "Book an X-ray, ultrasound or Doppler scan online at Lyallpur Medical Complex, Faisalabad: live availability, preparation and instant confirmation.");
  const [cat] = useCatalogue();
  const [opts] = useDoctors();
  const [sp] = useSearchParams();
  const [step, setStep] = useState(0);
  const [mod, setMod] = useState<Modality | null>(null);
  const [scan, setScan] = useState<Procedure | null>(null);
  const [q, setQ] = useState("");
  const [dates, setDates] = useState<{ date: string; free: number; closed: boolean }[]>([]);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<{ slots: Slot[]; walk_in: number; closed: boolean } | null>(null);
  const [time, setTime] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  const [f, setF] = useState({ patient_name: "", age: "", gender: "", phone: "", cnic: "", mr: "", referring_doctor: "", external_referrer: "", pregnancy_status: "", lmp: "", clinical_notes: "", consent: true });
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [pay, setPay] = useState("Pay at counter");
  const [panel, setPanel] = useState({ panel: "", policy_no: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Summary | null>(() => { const s = store.get("hv.rad.booked"); return s && sp.get("done") ? JSON.parse(s) : null; });
  const top = useRef<HTMLDivElement>(null);

  // deep link: /site/radiology/book?scan=<procedure>
  useEffect(() => {
    if (!cat || scan) return;
    const want = sp.get("scan");
    const p = want ? cat.procedures.find((x) => x.name === want) : null;
    if (p) { setMod(p.modality); setScan(p); setStep(2); }
  }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (done) setStep(5); }, [done]);
  useEffect(() => { top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [step]);
  useEffect(() => {
    if (!scan) return;
    setDates([]); setDate(""); setTime(""); setWalkIn(false);
    getCall<{ date: string; free: number; closed: boolean }[]>("hospital_vvs.api.radiology.dates", { procedure: scan.name }).then((d) => { setDates(d); setDate(d.find((x) => x.free > 0)?.date || d[0]?.date || ""); }).catch(() => {});
  }, [scan]);
  useEffect(() => {
    if (!scan || !date) return;
    setSlots(null); setTime("");
    getCall<{ slots: Slot[]; walk_in: number; closed: boolean }>("hospital_vvs.api.radiology.slots", { procedure: scan.name, date }).then(setSlots).catch(() => setSlots({ slots: [], walk_in: 0, closed: true }));
  }, [scan, date]);

  const scans = useMemo(() => (cat?.procedures ?? []).filter((p) => p.modality === mod && (!q.trim() || p.procedure_name.toLowerCase().includes(q.trim().toLowerCase()))), [cat, mod, q]);
  const female = f.gender === "Female";
  const isOb = scan?.category === "Pregnancy" || /obstetric/i.test(scan?.procedure_name ?? "");
  const phoneOk = /^(\+92|0092|92|0)?3\d{9}$/.test(f.phone.replace(/[\s-]/g, ""));
  const canNext = [
    !!mod, !!scan, walkIn || !!time,
    f.patient_name.trim().length >= 3 && !!f.gender && !!f.age && phoneOk && (!female || !!f.pregnancy_status) && !(scan?.female_only && f.gender === "Male"),
    pay !== "Insurance / Panel" || (!!panel.panel && !!panel.policy_no.trim()), true,
  ][step];

  const pickFile = (fl?: File | null) => {
    if (!fl) return;
    if (fl.size > 5 * 1024 * 1024) { setErr("The prescription file is larger than 5 MB."); return; }
    const r = new FileReader(); r.onload = () => setFile({ name: fl.name, data: String(r.result) }); r.readAsDataURL(fl);
  };

  const submit = async () => {
    if (!scan) return;
    setBusy(true); setErr("");
    try {
      const out = await postCall<Summary>("hospital_vvs.api.radiology.book", { data: JSON.stringify({
        procedure: scan.name, date, time: walkIn ? null : time, walk_in: walkIn ? 1 : 0, ...f, age: Number(f.age) || null,
        payment_option: pay, panel: panel.panel, policy_no: panel.policy_no, file_name: file?.name, file_data: file?.data, consent: f.consent ? 1 : 0 }) });
      store.set("hv.rad.booked", JSON.stringify(out));
      setDone(out); setStep(5);
      if (out.pay?.url) window.location.href = out.pay.url;
    } catch (e) {
      const m = humanizeError(e);
      setErr(/429|too many/i.test(m) ? "Too many bookings from this connection. Please call radiology or try again later." : m);
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-[var(--soft)] pb-24">
      <section className="relative overflow-hidden bg-[#08303A] pb-28 pt-12 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_300px_at_0%_0%,rgba(92,195,201,0.25),transparent_60%),radial-gradient(600px_300px_at_100%_100%,rgba(229,72,63,0.2),transparent_60%)]" />
        <Wrap className="relative">
          <Link to="/site/radiology" className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />Radiology & Imaging</Link>
          <h1 className="s2-display mt-4 text-[2.4rem] leading-tight sm:text-[3.2rem]">Book a scan</h1>
          <p className="mt-2 max-w-xl text-white/70">Six short steps. You get a booking ID straight away, your preparation on SMS / WhatsApp, and a reminder 24 hours and 2 hours before.</p>
        </Wrap>
      </section>

      <Wrap className="relative -mt-20">
        <div ref={top} className="scroll-mt-24" />
        {/* progress */}
        <div className={`${card} mb-6 p-4 hover:translate-y-0 sm:p-5`}>
          <ol className="flex items-center gap-1 sm:gap-2" aria-label="Booking progress">
            {STEP_LABELS.map((l, i) => (
              <li key={l} className="flex flex-1 items-center gap-1 sm:gap-2" aria-current={i === step ? "step" : undefined}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition ${i < step ? "bg-[var(--primary)] text-white" : i === step ? "bg-[var(--accent)] text-white ring-4 ring-[var(--accent-ring)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}</span>
                <span className={`hidden text-[13px] font-semibold lg:inline ${i === step ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>{l}</span>
                {i < STEP_LABELS.length - 1 && <span className={`h-[2px] flex-1 rounded transition-colors ${i < step ? "bg-[var(--primary)]" : "bg-[var(--line)]"}`} />}
              </li>))}
          </ol>
          <div className="mt-3 text-sm font-semibold text-[var(--ink)] lg:hidden">Step {step + 1} of 6 · {STEP_LABELS[step]}</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className={`${card} min-w-0 p-5 hover:translate-y-0 sm:p-8`}>
            {step === 0 && <>
              <H t="What kind of scan do you need?" s="Not sure? Your doctor's slip usually says X-ray, ultrasound (USG) or Doppler." />
              <div className="grid gap-4 md:grid-cols-3">
                {MODS.map((m) => { const on = mod === m.key; const I = m.icon; return (
                  <button key={m.key} type="button" onClick={() => { setMod(m.key); setScan(null); setStep(1); }} aria-pressed={on}
                    className={`group rounded-[22px] border-2 p-5 text-start transition hover:-translate-y-1 ${on ? "border-[var(--primary)] bg-[var(--mint)]" : "border-[var(--line)] hover:border-[var(--primary)]"}`}>
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--primary)] text-white transition group-hover:scale-110"><I className="h-7 w-7" /></span>
                    <div className="s2-display mt-4 text-2xl">{m.title}</div><p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{m.text}</p>
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--soft)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]"><Clock3 className="h-3.5 w-3.5" />{m.note}</span>
                  </button>); })}
              </div>
            </>}

            {step === 1 && <>
              <H t={`Choose your ${mod === "X-Ray" ? "X-ray" : mod?.toLowerCase()} scan`} s="Price, time on the table and preparation are shown for each." />
              <label className="mb-4 flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--primary-ring)]">
                <Search className="h-4 w-4 text-[var(--muted)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search scans" className="h-12 flex-1 bg-transparent outline-none" /></label>
              <div className="max-h-[560px] space-y-2.5 overflow-y-auto pe-1">
                {scans.map((p) => { const on = scan?.name === p.name; return (
                  <button key={p.name} type="button" onClick={() => setScan(p)} aria-pressed={on}
                    className={`w-full rounded-2xl border-2 p-4 text-start transition ${on ? "border-[var(--primary)] bg-[var(--mint)]" : "border-[var(--line)] hover:border-[var(--primary)]/60"}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)]"}`}>{on && <Check className="h-3 w-3" />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-bold">{p.procedure_name}</span>
                          {CONFIG.showPrices && p.price ? <span className="s2-num text-lg font-semibold text-[var(--primary)]" dir="ltr">{rs(p.price)}</span> : null}</div>
                        <div className="mt-0.5 text-sm text-[var(--muted)]">{p.description}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-[var(--soft)] px-2 py-0.5"><Clock3 className="me-1 inline h-3 w-3" />{p.duration_min} min</span>
                          <span className="rounded-full bg-[var(--soft)] px-2 py-0.5">{turnaround(p)}</span>
                          {p.walk_in ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">Walk-in</span> : null}
                          {p.needs_consent ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">Consent needed</span> : null}
                        </div>
                        {on && <div className="mt-3 flex gap-2 rounded-xl bg-[var(--surface)] p-3 text-[13px] leading-relaxed"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" /><span><b>Preparation: </b>{p.preparation}</span></div>}
                      </div>
                    </div>
                  </button>); })}
              </div>
            </>}

            {step === 2 && scan && <>
              <H t="Pick a date and time" s={slots?.walk_in ? "X-ray is open 24/7 — you can also just walk in today without a time." : "Times shown are live. A slot is held for you as soon as you book."} />
              {!!slots?.walk_in && (
                <button type="button" onClick={() => { setWalkIn(!walkIn); setTime(""); }} aria-pressed={walkIn}
                  className={`mb-5 flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-start transition ${walkIn ? "border-[var(--primary)] bg-[var(--mint)]" : "border-dashed border-[var(--line)] hover:border-[var(--primary)]"}`}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><Sparkles className="h-5 w-5" /></span>
                  <span className="flex-1"><b className="block">Walk in — no fixed time</b><span className="text-sm text-[var(--muted)]">Come any time on the chosen day; you get a token at radiology reception.</span></span>
                  <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${walkIn ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)]"}`}>{walkIn && <Check className="h-3.5 w-3.5" />}</span>
                </button>)}
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-3" role="listbox" aria-label="Dates">
                {dates.map((d) => { const dt = new Date(d.date + "T00:00"); const on = d.date === date; return (
                  <button key={d.date} type="button" role="option" aria-selected={on} disabled={d.closed && !slots?.walk_in} onClick={() => setDate(d.date)}
                    className={`flex w-[74px] shrink-0 flex-col items-center rounded-2xl border-2 py-3 transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)] hover:border-[var(--primary)]"}`}>
                    <span className="text-[11px] font-semibold uppercase opacity-80">{dt.toLocaleDateString("en-PK", { weekday: "short" })}</span>
                    <span className="s2-num text-2xl font-semibold leading-tight">{dt.getDate()}</span>
                    <span className="text-[11px] opacity-80">{dt.toLocaleDateString("en-PK", { month: "short" })}</span>
                    <span className={`mt-1 h-1.5 w-1.5 rounded-full ${d.closed ? "bg-transparent" : d.free > 10 ? "bg-emerald-500" : d.free > 0 ? "bg-amber-500" : "bg-rose-500"}`} />
                  </button>); })}
                {!dates.length && Array.from({ length: 7 }).map((_, i) => <div key={i} className="s2-skel h-[92px] w-[74px] shrink-0 rounded-2xl" />)}
              </div>
              {!walkIn && <div className="mt-4">
                {!slots ? <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" />Checking availability…</div>
                  : slots.closed || !slots.slots.length ? <p className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--muted)]">{slots.closed ? "The department does not take bookings for this scan on this day." : "This day is fully booked — please choose another date."}</p>
                  : (["Morning", "Afternoon", "Evening"] as const).map((part) => { const list = slots.slots.filter((s) => { const h = Number(s.time.slice(0, 2)); return part === "Morning" ? h < 12 : part === "Afternoon" ? h >= 12 && h < 17 : h >= 17; });
                    return list.length ? <div key={part} className="mb-5"><div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--muted)]">{part}</div>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">{list.map((s) => <button key={s.time} type="button" disabled={!s.free} onClick={() => setTime(s.time)} aria-pressed={time === s.time}
                        className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[var(--soft)] disabled:text-[var(--muted)] disabled:line-through ${time === s.time ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)] hover:border-[var(--primary)]"}`} dir="ltr">{hm12(s.time)}</button>)}</div></div> : null; })}
              </div>}
            </>}

            {step === 3 && scan && <>
              <H t="Patient details" s="As on the CNIC / B-form. We use the mobile number for your confirmation, reminders and to unlock your report." />
              <div className="grid gap-4 sm:grid-cols-2">
                <L l="Patient's full name" req className="sm:col-span-2"><input className={inp} value={f.patient_name} onChange={(e) => setF({ ...f, patient_name: e.target.value })} autoComplete="name" /></L>
                <L l="Age (years)" req><input className={inp} inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></L>
                <L l="Gender" req group><div className="grid grid-cols-3 gap-2">{["Female", "Male", "Other"].map((g) => <button key={g} type="button" aria-pressed={f.gender === g} onClick={() => setF({ ...f, gender: g, pregnancy_status: g === "Female" ? f.pregnancy_status : "" })}
                  className={`h-12 rounded-2xl border-2 text-sm font-semibold transition ${f.gender === g ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)] hover:border-[var(--primary)]"}`}>{g}</button>)}</div></L>
                <L l="Mobile number" req hint={f.phone && !phoneOk ? "Enter a Pakistani mobile, e.g. 0300 1234567" : ""}><input className={inp} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="03XX XXXXXXX" autoComplete="tel" dir="ltr" /></L>
                <L l="CNIC / B-form (optional)"><input className={inp} value={f.cnic} onChange={(e) => setF({ ...f, cnic: e.target.value })} placeholder="33100-0000000-0" dir="ltr" /></L>
                <L l="MR number, if you have one"><input className={inp} value={f.mr} onChange={(e) => setF({ ...f, mr: e.target.value })} placeholder="MR-FSD-000123" dir="ltr" /></L>
                <L l="Referring doctor">
                  <select className={inp} value={f.referring_doctor || (f.external_referrer ? "__other" : "")} onChange={(e) => setF({ ...f, referring_doctor: e.target.value === "__other" ? "" : e.target.value, external_referrer: e.target.value === "__other" ? f.external_referrer || " " : "" })}>
                    <option value="">Self-referred / not sure</option>
                    {(opts?.doctors ?? []).map((d) => <option key={d.name} value={d.name}>{d.doctor_name} — {d.specialization}</option>)}
                    <option value="__other">A doctor outside this hospital…</option>
                  </select></L>
                {!!f.external_referrer && <L l="Outside doctor's name" className="sm:col-span-2"><input className={inp} value={f.external_referrer.trim()} onChange={(e) => setF({ ...f, external_referrer: e.target.value || " " })} placeholder="Dr. …" /></L>}
                {female && <L l="Pregnancy status" req group className="sm:col-span-2">
                  <div className="grid gap-2 sm:grid-cols-3">{["Not pregnant", "Pregnant", "Possibly pregnant"].map((s) => <button key={s} type="button" aria-pressed={f.pregnancy_status === s} onClick={() => setF({ ...f, pregnancy_status: s })}
                    className={`h-12 rounded-2xl border-2 text-sm font-semibold transition ${f.pregnancy_status === s ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)] hover:border-[var(--primary)]"}`}>{s}</button>)}</div>
                  {scan.modality === "X-Ray" && f.pregnancy_status && f.pregnancy_status !== "Not pregnant" && <p className="mt-2 flex gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Thank you for telling us. The radiologist will review before any X-ray — an ultrasound may be offered instead.</p>}</L>}
                {female && (isOb || f.pregnancy_status === "Pregnant") && <L l="First day of last period (LMP)"><input type="date" className={inp} value={f.lmp} onChange={(e) => setF({ ...f, lmp: e.target.value })} max={new Date().toISOString().slice(0, 10)} /></L>}
                <L l="Symptoms / reason for the scan (optional)" className="sm:col-span-2"><textarea rows={3} className={`${inp} h-auto py-3`} value={f.clinical_notes} onChange={(e) => setF({ ...f, clinical_notes: e.target.value })} placeholder="e.g. right-side tummy pain for 2 weeks" /></L>
                <div className="sm:col-span-2">
                  <span className="mb-2 block text-sm font-semibold">Doctor's prescription (optional)</span>
                  {file ? <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--soft)] p-3"><FileUp className="h-5 w-5 text-[var(--primary)]" /><span className="min-w-0 flex-1 truncate text-sm">{file.name}</span><button type="button" onClick={() => setFile(null)} aria-label="Remove file" className="rounded-full p-1 hover:bg-[var(--surface)]"><X className="h-4 w-4" /></button></div>
                    : <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--line)] p-4 transition hover:border-[var(--primary)]"><Upload className="h-5 w-5 text-[var(--primary)]" />
                      <span className="text-sm"><b>Upload a photo or PDF</b><span className="block text-[var(--muted)]">Up to 5 MB — seen only by radiology staff.</span></span>
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} /></label>}
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[var(--primary)]" />
                  <span>Send my confirmation, preparation, reminders and report alert by SMS / WhatsApp. <span className="text-[var(--muted)]">Messages never contain medical findings.</span></span></label>
              </div>
            </>}

            {step === 4 && scan && <>
              <H t="How would you like to pay?" s={`${scan.procedure_name}${CONFIG.showPrices && scan.price ? ` · ${rs(scan.price)}` : ""}`} />
              <div className="space-y-3">
                {([["Pay at counter", Wallet, "Cash or card at radiology reception when you arrive."], ["Pay online", CreditCard, "Card payment now — skip the queue at the counter."],
                  ["Insurance / Panel", Landmark, "Corporate panel or health insurance, verified at reception."]] as [string, LucideIcon, string][]).map(([k, I, d]) => (
                  <button key={k} type="button" onClick={() => setPay(k)} aria-pressed={pay === k} className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-start transition ${pay === k ? "border-[var(--primary)] bg-[var(--mint)]" : "border-[var(--line)] hover:border-[var(--primary)]"}`}>
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--primary)] shadow-sm"><I className="h-6 w-6" /></span>
                    <span className="flex-1"><b className="block">{k}</b><span className="text-sm text-[var(--muted)]">{d}</span></span>
                    <span className={`grid h-6 w-6 place-items-center rounded-full border-2 ${pay === k ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)]"}`}>{pay === k && <Check className="h-3.5 w-3.5" />}</span>
                  </button>))}
              </div>
              {pay === "Insurance / Panel" && <div className="mt-4 grid gap-4 rounded-2xl bg-[var(--soft)] p-4 sm:grid-cols-2">
                <L l="Panel / insurer" req><select className={inp} value={panel.panel} onChange={(e) => setPanel({ ...panel, panel: e.target.value })}><option value="">Choose…</option>{(cat?.panels ?? []).map((p) => <option key={p}>{p}</option>)}</select></L>
                <L l="Employee / policy number" req><input className={inp} value={panel.policy_no} onChange={(e) => setPanel({ ...panel, policy_no: e.target.value })} /></L>
                <p className="text-xs text-[var(--muted)] sm:col-span-2">Bring the panel / insurance card. If cover cannot be confirmed you can pay at the counter.</p></div>}
              {pay === "Pay online" && <p className="mt-4 flex gap-2 rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--muted)]"><ShieldCheck className="h-5 w-5 shrink-0 text-[var(--primary)]" />You will be taken to the secure card page after confirming. If online payment is unavailable, your booking stands and you pay at the counter.</p>}
              {err && <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="h-5 w-5 shrink-0" />{err}</p>}
            </>}

            {step === 5 && done && <Confirmation s={done} />}

            {step < 5 && (
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-6">
                <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className={`${btn.ghost} px-5 py-3 text-sm disabled:invisible`}><ArrowLeft className="h-4 w-4 rtl:rotate-180" />Back</button>
                {step < 4 ? <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className={`${btn.teal} px-6 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0`}>Continue<ArrowRight className="h-4 w-4 rtl:rotate-180" /></button>
                  : <button type="button" disabled={!canNext || busy} onClick={submit} className={`${btn.primary} px-6 py-3 text-sm disabled:opacity-60`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirm booking</button>}
              </div>)}
          </div>

          {/* summary */}
          {step < 5 && <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className={`${card} overflow-hidden hover:translate-y-0`}>
              <div className="bg-[var(--primary)] px-5 py-4 text-white"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Your booking</div><div className="s2-display text-xl">{scan?.procedure_name || "Choose a scan"}</div></div>
              <dl className="divide-y divide-[var(--line)] text-sm">
                {([["Modality", mod ?? "—"], ["Date", date ? dmy(date) : "—"], ["Time", walkIn ? "Walk-in" : time ? hm12(time) : "—"], ["Duration", scan ? `${scan.duration_min} min` : "—"],
                  ["Report", scan ? turnaround(scan) : "—"], ["Price", scan && CONFIG.showPrices && scan.price ? rs(scan.price) : "—"]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 px-5 py-3"><dt className="text-[var(--muted)]">{k}</dt><dd className="text-end font-semibold">{v}</dd></div>))}
              </dl>
              {scan && <div className="border-t border-[var(--line)] bg-[var(--soft)] p-5 text-[13px] leading-relaxed"><div className="mb-1 flex items-center gap-1.5 font-bold text-[var(--primary)]"><ClipboardCheck className="h-4 w-4" />Preparation</div>{scan.preparation}</div>}
            </div>
          </aside>}
        </div>
      </Wrap>
    </div>
  );
}

function H({ t, s }: { t: string; s?: string }) {
  return <div className="mb-6"><h2 className="s2-display text-[1.8rem] leading-tight">{t}</h2>{s && <p className="mt-1 text-[var(--muted)]">{s}</p>}</div>;
}
function L({ l, req, hint, className = "", group, children }: { l: string; req?: boolean; hint?: string; className?: string; group?: boolean; children: React.ReactNode }) {
  if (group) return <div role="group" aria-label={l} className={className}><span className="mb-2 block text-sm font-semibold">{l}{req && <span className="text-[var(--accent)]"> *</span>}</span>{children}</div>;
  return <label className={`block ${className}`}><span className="mb-2 block text-sm font-semibold">{l}{req && <span className="text-[var(--accent)]"> *</span>}</span>{children}{hint && <span className="mt-1 block text-xs text-[var(--accent)]">{hint}</span>}</label>;
}

function ics(s: Summary) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [y, m, d] = s.date.split("-").map(Number);
  const [hh, mm] = (s.time || "09:00").split(":").map(Number);
  const start = new Date(y, m - 1, d, hh, mm);
  const end = new Date(start.getTime() + Math.max(30, s.duration || 20) * 60000);
  const f = (x: Date) => `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00Z`;
  const text = `${s.procedure} (${s.booking_ref})`;
  const desc = `Booking ID ${s.booking_ref}. Preparation: ${s.preparation}`;
  const loc = `Radiology & Imaging, 2nd floor, Lyallpur Medical Complex, Faisalabad`;
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LMC//Radiology//EN", "BEGIN:VEVENT", `UID:${s.booking_ref}@lmc`, `DTSTAMP:${f(new Date())}`,
    s.time ? `DTSTART:${f(start)}` : `DTSTART;VALUE=DATE:${s.date.replace(/-/g, "")}`, s.time ? `DTEND:${f(end)}` : "", `SUMMARY:${text}`, `DESCRIPTION:${desc.replace(/[,;]/g, "\\$&")}`,
    `LOCATION:${loc.replace(/,/g, "\\,")}`, "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Imaging appointment", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&details=${encodeURIComponent(desc)}&location=${encodeURIComponent(loc)}&dates=${s.time ? `${f(start)}/${f(end)}` : `${s.date.replace(/-/g, "")}/${s.date.replace(/-/g, "")}`}`;
  return { url: URL.createObjectURL(new Blob([body], { type: "text/calendar" })), google };
}

function Confirmation({ s }: { s: Summary }) {
  const cal = useMemo(() => ics(s), [s]);
  const qr = useMemo(() => qrSvg(`${s.booking_ref}`, 1.1), [s]);
  const wa = `https://wa.me/?text=${encodeURIComponent(`My imaging appointment at Lyallpur Medical Complex: ${s.procedure}, ${dmy(s.date)} ${s.time ? hm12(s.time) : "(walk-in)"}. Booking ID ${s.booking_ref}.`)}`;
  return (
    <Reveal>
      <div className="flex flex-col items-center text-center">
        <span className="rd-ok grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_18px_40px_-14px_rgba(16,185,129,0.8)]"><Check className="h-10 w-10" /></span>
        <Eyebrow>Booking confirmed</Eyebrow>
        <h2 className="s2-display text-[2rem] leading-tight">See you {s.walk_in ? "on " + dmy(s.date) : `${dmy(s.date)}, ${hm12(s.time)}`}</h2>
        <p className="mt-1 text-[var(--muted)]">{s.patient_name} · {s.procedure}</p>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-[auto_1fr]">
        <div className="mx-auto flex flex-col items-center rounded-[22px] border border-[var(--line)] bg-white p-4 text-[#0f172a]">
          <div className="[&>svg]:h-[150px] [&>svg]:w-[150px]" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Booking ID</div>
          <div className="s2-num text-2xl font-semibold tracking-wider">{s.booking_ref}</div>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-[var(--mint)] p-4"><div className="mb-1 flex items-center gap-2 font-bold text-[var(--primary)]"><ClipboardCheck className="h-5 w-5" />Before you come</div><p className="text-[15px] leading-relaxed">{s.preparation}</p></div>
          <div className="flex gap-3 rounded-2xl bg-[var(--soft)] p-4 text-sm"><MapPin className="h-5 w-5 shrink-0 text-[var(--accent)]" /><span>{s.location}. Show this booking ID at radiology reception; arrive 15 minutes early.</span></div>
          <div className="flex gap-3 rounded-2xl bg-[var(--soft)] p-4 text-sm"><MessageCircle className="h-5 w-5 shrink-0 text-[var(--primary)]" /><span>A confirmation is on its way by SMS / WhatsApp, with reminders 24 hours and 2 hours before. Payment: <b>{s.payment_option}</b>{s.payment_status === "Paid" ? " (paid)" : ""}.</span></div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href={cal.url} download={`${s.booking_ref}.ics`} className={`${btn.teal} px-5 py-3 text-sm`}><CalendarPlus className="h-4 w-4" />Add to calendar</a>
        <a href={cal.google} target="_blank" rel="noopener noreferrer" className={`${btn.ghost} px-5 py-3 text-sm`}>Google Calendar</a>
        <a href={wa} target="_blank" rel="noopener noreferrer" className={`${btn.ghost} px-5 py-3 text-sm`}><MessageCircle className="h-4 w-4" />Send to WhatsApp</a>
        <Link to="/site/map?q=radiology" className={`${btn.ghost} px-5 py-3 text-sm`}><MapPin className="h-4 w-4" />Location map</Link>
        <button type="button" onClick={() => window.print()} className={`${btn.ghost} px-5 py-3 text-sm`}>Print</button>
      </div>
      <p className="mt-6 text-center text-sm text-[var(--muted)]">After the scan, get your report at <Link to="/site/radiology/reports" className="font-semibold text-[var(--primary)]">Download my report</Link> with this booking ID and your mobile.</p>
      <style>{`.rd-ok{animation:rdok .6s cubic-bezier(.2,1.4,.4,1) both}@keyframes rdok{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}@media (prefers-reduced-motion: reduce){.rd-ok{animation:none}}`}</style>
    </Reveal>
  );
}
