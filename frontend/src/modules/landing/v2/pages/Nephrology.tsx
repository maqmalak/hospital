/**
 * Nephrology & Dialysis department page (D-99) + "Reserve a dialysis slot" request form (/site/nephrology/reserve).
 * LMC look (dark teal hero over a photo, serif headings, glass cards, stat strip) with the renal accent: aqua (--accent-renal-aqua) and
 * soft violet (--accent-renal-violet); darker text shades keep WCAG AA on white and on dark. Flowing-water / droplet motif with a slow
 * gradient wave behind the hero text (disabled under prefers-reduced-motion). Live facts and doctors from the ERP; English / Urdu.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, AlertCircle, ArrowRight, Armchair, BadgeCheck, CalendarCheck, CheckCircle2, ChevronDown, ClipboardList, Droplet, Droplets, FileUp, HeartPulse, Loader2,
  MapPin, Phone, Plane, ScanLine, ShieldCheck, Siren, Stethoscope, Syringe, Upload, Users, Utensils, Waves, X, type LucideIcon,
} from "lucide-react";
import { postCall, humanizeError } from "@/services/frappe";
import { CONFIG, PHOTOS } from "../content";
import { phoneOf, rs, tel, useDoctors } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, DoctorCard, Reveal, SectionHead, useJsonLd, useTitle } from "../ui";
import { DIALYSER_POLICY, NEPH, PD_OFFERED, PHONE_DIALYSIS, TRANSPLANT_OFFERED, useNephFacts } from "../neph";

const SVC_ICON: Record<string, LucideIcon> = { clinic: Stethoscope, bp: HeartPulse, stone: Droplet, aki: Activity, hd: Droplets, icu: Siren, access: Syringe, biopsy: ScanLine, tx: ShieldCheck, diet: Utensils, guest: Plane };
const FEAT_ICON: Record<string, LucideIcon> = { machines: Activity, water: Waves, dialyser: Droplet, iso: ShieldCheck, staff: Users, comfort: Armchair };

export default function Nephrology() {
  const { lang, phone, site, ui } = useS2();
  const T = NEPH[lang];
  useTitle(`${T.title} — Lyallpur Medical Complex`, T.metaDesc);
  const facts = useNephFacts();
  const [opts] = useDoctors();
  const team = useMemo(() => (opts?.doctors ?? []).filter((d) => /nephro|kidney|dialys/i.test(`${d.specialization ?? ""} ${(d as { department?: string }).department ?? ""}`)), [opts]);
  const unit = PHONE_DIALYSIS || phoneOf("reception", phone);
  const emergency = phoneOf("emergency", phone);
  const book = team[0] ? `/hms/book-appointment?doctor=${encodeURIComponent(team[0].name)}` : "/hms/book-appointment";
  const services = T.services.filter(([k]) => k !== "tx" || TRANSPLANT_OFFERED);
  const pr = facts?.prices ?? {};
  useJsonLd({ "@context": "https://schema.org", "@type": "MedicalClinic", name: "Nephrology & Dialysis — Lyallpur Medical Complex", medicalSpecialty: "Nephrology",
    telephone: unit || undefined, address: site?.clinic.address ? { "@type": "PostalAddress", streetAddress: site.clinic.address, addressLocality: "Faisalabad", addressCountry: "PK" } : undefined,
    availableService: ["Haemodialysis", "Emergency dialysis", "CKD clinic", "Kidney biopsy", "Dialysis catheter insertion"].map((n) => ({ "@type": "MedicalProcedure", name: n })) });
  useJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: T.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

  return (
    <div className="rn-root">
      <style>{RN_CSS}</style>
      {/* ------------------------------------------------ hero */}
      <section className="relative overflow-hidden bg-[#08303A] text-white">
        <img src={PHOTOS.icu} alt="" className="s2-kenburns absolute inset-0 h-full w-full object-cover opacity-30" />{/* [confirm] replace with a photo of the LMC dialysis unit */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#08303A] via-[#08303A]/90 to-[#0B4552]/55 rtl:bg-gradient-to-l" />
        <svg className="rn-wave pointer-events-none absolute -bottom-6 left-0 h-48 w-[200%] opacity-50" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden>
          <path d="M0 120 C240 60 480 180 720 120 S1200 60 1440 120 V200 H0Z" fill="url(#rnw)" /><path d="M0 150 C260 100 520 190 780 140 S1240 100 1440 150" fill="none" stroke="var(--accent-renal-aqua)" strokeOpacity=".5" strokeWidth="2" />
          <defs><linearGradient id="rnw" x1="0" x2="1"><stop offset="0" stopColor="var(--accent-renal-aqua)" stopOpacity=".35" /><stop offset="1" stopColor="var(--accent-renal-violet)" stopOpacity=".35" /></linearGradient></defs>
        </svg>
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-24 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <Reveal><span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-renal-aqua)]/40 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--rn-aqua-on-dark)]"><Droplets className="h-3.5 w-3.5" />{T.pill}</span></Reveal>
            <Reveal delay={80}><h1 className="s2-display mt-5 text-[2.6rem] leading-[1.04] sm:text-[4rem]">{T.h1a}<br /><span className="rn-grad-text">{T.h1b}</span></h1></Reveal>
            <Reveal delay={160}><p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">{T.lead}</p></Reveal>
            <Reveal delay={240} className="mt-9 flex flex-wrap gap-3">
              <a href={book} className="rn-btn inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold"><Stethoscope className="h-5 w-5" />{T.book}</a>
              <Link to="/site/nephrology/reserve" className={btn.glass}><CalendarCheck className="h-5 w-5" />{T.reserve}</Link>
              {unit && <a href={tel(unit)} className={btn.glass}><Phone className="h-5 w-5" />{T.call}: <span dir="ltr">{unit}</span></a>}
            </Reveal>
            <Reveal delay={300} className="mt-6 text-sm text-white/70"><Link to="/site/my-dialysis" className="underline-offset-4 hover:underline">{T.myDialysis} →</Link></Reveal>
          </div>
          <Reveal delay={200} className="hidden justify-self-center lg:block"><FilterArt /></Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ stats */}
      <section className="relative z-10 -mt-10"><Wrap>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--line)] shadow-[0_30px_60px_-34px_rgba(8,48,58,0.55)] md:grid-cols-5">
          {([[facts?.stations ?? "12", T.stats.stations], [facts?.sessions_month ?? "—", T.stats.sessions], [facts?.shifts ?? "3", T.stats.shifts], [facts?.nephrologists || "—", T.stats.nephs], ["24/7", T.stats.emergency]] as [string | number, string][]).map(([v, l], i) => (
            <Reveal key={l} delay={i * 60} className={`bg-[var(--surface)] p-5 text-center ${i === 4 ? "col-span-2 md:col-span-1" : ""}`}>
              <div className="s2-num text-[1.9rem] font-semibold leading-none text-[var(--rn-aqua-ink)]">{v}</div><div className="mt-1.5 text-[13px] font-medium text-[var(--muted)]">{l}</div></Reveal>))}
        </div>
      </Wrap></section>

      {/* ------------------------------------------------ services */}
      <section className="py-24" id="services"><Wrap>
        <SectionHead eyebrow={T.title} title={T.servicesTitle} sub={T.servicesSub} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map(([k, t, d], i) => { const I = SVC_ICON[k] ?? Droplets; return (
            <Reveal key={k} delay={(i % 3) * 60} className={`${card} group p-6`}>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--rn-aqua-soft)] text-[var(--rn-aqua-ink)] transition group-hover:scale-110 group-hover:bg-[var(--rn-violet-soft)] group-hover:text-[var(--rn-violet-ink)]"><I className="h-6 w-6" /></span>
              <h3 className="mt-4 text-lg font-bold">{t}</h3><p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{d}</p>
              {k === "biopsy" && <div className="mt-3 flex gap-3 text-sm font-semibold"><Link to="/site/radiology" className="text-[var(--rn-aqua-ink)]">Radiology →</Link><Link to="/site/services" className="text-[var(--rn-aqua-ink)]">Lab →</Link></div>}
            </Reveal>); })}
          <Reveal className={`${card} p-6`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--rn-violet-soft)] text-[var(--rn-violet-ink)]"><Droplet className="h-6 w-6" /></span>
            <h3 className="mt-4 text-lg font-bold">{T.pdNote}</h3><p className="mt-1.5 text-sm text-[var(--muted)]">{PD_OFFERED ? "Training and follow-up for home peritoneal dialysis." : T.pdOff}</p></Reveal>
        </div>
      </Wrap></section>

      {/* ------------------------------------------------ unit features */}
      <section className="relative overflow-hidden bg-[#08303A] py-24 text-white"><div className="rn-drops pointer-events-none absolute inset-0 opacity-30" />
        <Wrap className="relative">
          <SectionHead light eyebrow={T.call} title={T.featuresTitle} sub={T.featuresSub} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{T.features.map(([k, t, d], i) => { const I = FEAT_ICON[k] ?? Droplets; return (
            <Reveal key={k} delay={i * 60} className="group rounded-[22px] border border-white/10 bg-white/[0.05] p-6 backdrop-blur transition hover:-translate-y-1 hover:border-[var(--accent-renal-aqua)]/50">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-renal-aqua)]/15 text-[var(--rn-aqua-on-dark)]"><I className="h-6 w-6" /></span>
              <h3 className="mt-4 text-lg font-bold">{k === "dialyser" && DIALYSER_POLICY === "reuse" ? "Dialyser reuse programme" : t}</h3><p className="mt-1.5 text-sm leading-relaxed text-white/70">{d}</p></Reveal>); })}</div>
          {facts && facts.isolation > 0 && <p className="mt-8 text-sm text-white/70"><ShieldCheck className="me-1 inline h-4 w-4 text-[var(--rn-aqua-on-dark)]" />{facts.isolation} of {facts.stations} stations are reserved for hepatitis B / C patients.</p>}
        </Wrap>
      </section>

      {/* ------------------------------------------------ process timeline */}
      <section className="py-24" id="process"><Wrap>
        <SectionHead eyebrow={T.reserve} title={T.stepsTitle} sub={T.stepsSub} center />
        <ol className="relative mx-auto max-w-3xl">
          <span aria-hidden className="rn-rail absolute bottom-4 start-[23px] top-4 w-[3px] rounded" />
          {T.steps.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 60} className="relative flex gap-5 pb-7">
              <span className="rn-node relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0B4552] text-base font-black text-[var(--rn-aqua-on-dark)] ring-4 ring-[var(--bg)]" style={{ animationDelay: `${i * 0.4}s` }}>{i + 1}</span>
              <div className="pt-1.5"><h3 className="font-bold">{t}</h3><p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">{d}</p>
                {i === 5 && <span className="mt-1 inline-block text-xs font-semibold text-[var(--rn-violet-ink)]">Slip shows station, token and sessions remaining</span>}</div>
            </Reveal>))}
        </ol>
      </Wrap></section>

      {/* ------------------------------------------------ guide + warning signs */}
      <section className="bg-[var(--soft)] py-24" id="guide"><Wrap className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div><SectionHead eyebrow={T.call} title={T.guideTitle} sub={T.guideSub} />
          <Accordion items={T.guide.map(([t, lines]) => ({ title: t, body: <ul className="space-y-2">{lines.map((l) => <li key={l} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--rn-violet-ink)]" />{l}</li>)}</ul> }))} /></div>
        <Reveal className="self-start rounded-[24px] border-2 border-rose-300 bg-rose-50 p-6 dark:border-rose-500/40 dark:bg-rose-500/10">
          <h3 className="flex items-center gap-2 text-xl font-bold text-rose-800 dark:text-rose-200"><AlertCircle className="h-6 w-6" />{T.warnTitle}</h3>
          <ul className="mt-4 space-y-2.5">{T.warn.map((w) => <li key={w} className="flex gap-2.5 text-[15px] text-rose-900 dark:text-rose-100"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-600" />{w}</li>)}</ul>
          {emergency && <a href={tel(emergency)} className="mt-6 inline-flex items-center gap-2 rounded-full bg-rose-600 px-6 py-3 font-bold text-white hover:bg-rose-700"><Siren className="h-5 w-5" />{T.callEmergency} · <span dir="ltr">{emergency}</span></a>}
        </Reveal>
      </Wrap></section>

      {/* ------------------------------------------------ packages */}
      {CONFIG.showPrices && <section className="py-24" id="packages"><Wrap>
        <SectionHead eyebrow={T.pkgTitle} title={T.pkgTitle} sub={T.pkgSub} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {([[T.pkg.single, pr["DIA-HD-SESSION"], 1, T.pkg.perSession], [T.pkg.m8, pr["DIA-PKG-8"], 8], [T.pkg.m12, pr["DIA-PKG-12"], 12, "", true], [T.pkg.m13, pr["DIA-PKG-13"], 13], [T.pkg.emergency, pr["DIA-HD-EMERGENCY"], 1, T.pkg.perSession], [T.pkg.cath, pr["DIA-CATH-TEMP"], 0]] as [string, number | undefined, number, string?, boolean?][]).map(([t, price, n, unitL, hot], i) => (
            <Reveal key={t} delay={(i % 3) * 60} className={`${card} relative p-6 ${hot ? "ring-2 ring-[var(--rn-violet-ink)]" : ""}`}>
              {hot && <span className="absolute -top-3 start-6 rounded-full bg-[var(--rn-violet-ink)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Most chosen</span>}
              <div className="text-sm font-semibold text-[var(--muted)]">{t}</div>
              <div className="s2-num mt-2 text-[2rem] font-semibold leading-none" dir="ltr">{price ? rs(price) : "—"}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{unitL || (n > 1 && price ? `${rs(price / n)} ${T.pkg.perSession} · ${n} ${T.pkg.sessions}` : "")}</div>
            </Reveal>))}
          <Reveal className={`${card} p-6 sm:col-span-2 lg:col-span-3`}><div className="flex items-start gap-4"><BadgeCheck className="h-8 w-8 shrink-0 text-[var(--rn-aqua-ink)]" /><div><h3 className="text-lg font-bold">{T.sehat}</h3><p className="mt-1 text-sm text-[var(--muted)]">{T.sehatText}</p></div></div></Reveal>
        </div>
      </Wrap></section>}

      {/* ------------------------------------------------ team, faq, location */}
      <section className="bg-[var(--soft)] py-24" id="team"><Wrap>
        <SectionHead eyebrow={T.title} title={T.teamTitle} sub={T.teamSub} />
        {team.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{team.map((d, i) => <Reveal key={d.name} delay={i * 70}><DoctorCard d={d} ur={lang === "ur"} labels={ui.common} /></Reveal>)}</div>
          : <p className="text-[var(--muted)]">Nephrologist profiles will appear here.</p>}
      </Wrap></section>
      <section className="py-24" id="faq"><Wrap className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        <div><SectionHead eyebrow="FAQ" title={T.faqTitle} /><Accordion items={T.faq.map(([q, a]) => ({ title: q, body: <p>{a}</p> }))} /></div>
        <div className="space-y-5">
          <Reveal className={`${card} p-6`}><h3 className="flex items-center gap-2 text-lg font-bold"><MapPin className="h-5 w-5 text-[var(--rn-aqua-ink)]" />{T.locTitle}</h3><p className="mt-2 text-[15px] leading-relaxed text-[var(--ink2)]">{T.locText}</p>
            <Link to="/site/directions" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--rn-aqua-ink)]">Get directions <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Reveal>
          <Reveal className="rn-cta rounded-[24px] p-7 text-white"><h3 className="s2-display text-2xl">{T.ctaTitle}</h3><p className="mt-2 text-white/85">{T.ctaText}</p>
            <div className="mt-5 flex flex-wrap gap-3"><Link to="/site/nephrology/reserve" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-semibold text-[#0c3b55]"><CalendarCheck className="h-4 w-4" />{T.reserve}</Link>
              <a href={book} className={btn.glass}><Stethoscope className="h-4 w-4" />{T.book}</a></div></Reveal>
        </div>
      </Wrap></section>
    </div>
  );
}

function Accordion({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return <div className="space-y-3">{items.map((it, i) => { const on = open === i; return (
    <div key={it.title} className={`overflow-hidden rounded-[20px] border bg-[var(--surface)] transition ${on ? "border-[var(--rn-aqua-ink)]" : "border-[var(--line)]"}`}>
      <h3><button type="button" onClick={() => setOpen(on ? null : i)} aria-expanded={on} className="flex w-full items-center gap-3 px-5 py-4 text-start text-[16px] font-bold"><span className="flex-1">{it.title}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-[var(--muted)] transition ${on ? "rotate-180 text-[var(--rn-aqua-ink)]" : ""}`} /></button></h3>
      <div className={`grid transition-all duration-300 ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}><div className="overflow-hidden"><div className="px-5 pb-5 text-[15px] leading-relaxed text-[var(--ink2)]">{it.body}</div></div></div>
    </div>); })}</div>;
}

/** Hero visual: a dialyser (hollow-fibre filter) with blood and dialysate flowing in opposite directions, and droplets. */
function FilterArt() {
  return (
    <svg viewBox="0 0 420 380" className="w-[420px] max-w-full" aria-hidden>
      <defs><linearGradient id="rnb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f87171" /><stop offset="1" stopColor="#b91c1c" /></linearGradient>
        <linearGradient id="rnd" x1="0" x2="1"><stop offset="0" stopColor="var(--accent-renal-aqua)" /><stop offset="1" stopColor="var(--accent-renal-violet)" /></linearGradient></defs>
      <rect x="150" y="40" width="120" height="300" rx="56" fill="rgba(255,255,255,.06)" stroke="url(#rnd)" strokeWidth="3" />
      {Array.from({ length: 7 }).map((_, i) => <line key={i} x1={170 + i * 13} y1="70" x2={170 + i * 13} y2="310" stroke="rgba(255,255,255,.25)" strokeWidth="2" />)}
      <path className="rn-flow" d="M210 0 V40 M210 340 V380" stroke="url(#rnb)" strokeWidth="10" strokeLinecap="round" strokeDasharray="14 12" />
      <path className="rn-flow-rev" d="M270 290 H360 M60 90 H150" stroke="url(#rnd)" strokeWidth="8" strokeLinecap="round" strokeDasharray="12 10" />
      {[[80, 220, 12], [350, 150, 9], [110, 300, 7], [330, 320, 11]].map(([x, y, r], i) => <path key={i} className="rn-drop" style={{ animationDelay: `${i * 0.8}s` }}
        d={`M${x} ${y - r * 1.6} C${x + r} ${y - r * 0.4} ${x + r} ${y + r * 0.6} ${x} ${y + r * 0.8} C${x - r} ${y + r * 0.6} ${x - r} ${y - r * 0.4} ${x} ${y - r * 1.6}Z`} fill="var(--accent-renal-aqua)" fillOpacity=".55" />)}
      <g fontFamily="monospace" fontSize="11" fill="rgba(255,255,255,.75)"><text x="290" y="282">dialysate</text><text x="40" y="80">dialysate</text><text x="222" y="24">blood</text></g>
    </svg>
  );
}

// ================================================================== reserve form (/site/nephrology/reserve)
const inp = "h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 text-[15px] text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--rn-aqua-ink)] focus:ring-4 focus:ring-[var(--accent-renal-aqua)]/25";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function NephReserve() {
  const { lang } = useS2();
  const T = NEPH[lang];
  useTitle(`${T.rTitle} — Lyallpur Medical Complex`, T.rSub);
  const [opts] = useDoctors();
  const [f, setF] = useState({ request_type: "New", patient_name: "", age: "", gender: "", phone: "", mr: "", cnic: "", referring_doctor: "", external_referrer: "", pref_days: [] as string[], pref_shift: "Morning",
    access_type: "", current_hospital: "", notes: "", consent: true });
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ ref: string } | null>(null);
  const phoneOk = /^(\+92|0092|92|0)?3\d{9}$/.test(f.phone.replace(/[\s-]/g, ""));
  const ok = f.patient_name.trim().length >= 3 && phoneOk && !!f.gender;
  const pick = (fl?: File | null) => { if (!fl) return; if (fl.size > 5 * 1024 * 1024) { setErr("The file is larger than 5 MB."); return; } const r = new FileReader(); r.onload = () => setFile({ name: fl.name, data: String(r.result) }); r.readAsDataURL(fl); };
  const submit = async () => {
    setBusy(true); setErr("");
    try { const r = await postCall<{ ref: string }>("hospital_vvs.api.dialysis.request_slot", { data: JSON.stringify({ ...f, pref_days: f.pref_days.join(", "), consent: f.consent ? 1 : 0, file_name: file?.name, file_data: file?.data }) }); setDone(r); }
    catch (e) { const m = humanizeError(e); setErr(/429|too many/i.test(m) ? "Too many requests from this connection. Please call the dialysis unit." : m); } finally { setBusy(false); }
  };
  return (
    <div className="rn-root bg-[var(--soft)] pb-24"><style>{RN_CSS}</style>
      <section className="relative overflow-hidden bg-[#08303A] pb-28 pt-12 text-white"><div className="rn-drops pointer-events-none absolute inset-0 opacity-25" />
        <Wrap className="relative"><Link to="/site/nephrology" className="text-sm text-white/70 hover:text-white">← {T.title}</Link>
          <h1 className="s2-display mt-4 text-[2.4rem] leading-tight sm:text-[3.2rem]">{T.rTitle}</h1><p className="mt-2 max-w-2xl text-white/75">{T.rSub}</p></Wrap>
      </section>
      <Wrap className="relative -mt-20">
        <div className={`${card} mx-auto max-w-3xl p-5 hover:translate-y-0 sm:p-8`}>
          {done ? <div className="py-8 text-center"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" /><h2 className="s2-display mt-4 text-3xl">{T.rDone}</h2>
            <p className="mt-2">{T.rDoneText} <b className="font-mono">{done.ref}</b></p><p className="mx-auto mt-3 max-w-md text-sm text-[var(--muted)]">{T.rDoneNext}</p>
            <Link to="/site/nephrology" className={`${btn.ghost} mt-6`}>{T.title}</Link></div> : <>
            <fieldset><legend className="mb-2 text-sm font-semibold">{T.rType}</legend>
              <div className="grid gap-2 sm:grid-cols-3">{Object.entries(T.rTypes).map(([k, l]) => <button key={k} type="button" aria-pressed={f.request_type === k} onClick={() => setF({ ...f, request_type: k })}
                className={`rounded-2xl border-2 px-3 py-3 text-start text-sm font-semibold transition ${f.request_type === k ? "border-[var(--rn-aqua-ink)] bg-[var(--rn-aqua-soft)]" : "border-[var(--line)]"}`}>{l}</button>)}</div></fieldset>
            {f.request_type === "Emergency" && <p className="mt-3 flex gap-2 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-200"><Siren className="h-5 w-5 shrink-0" />For an emergency (breathless, chest pain, very high potassium) come to Emergency now — do not wait for a call back.</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <L l={T.rName} req className="sm:col-span-2"><input className={inp} value={f.patient_name} onChange={(e) => setF({ ...f, patient_name: e.target.value })} autoComplete="name" /></L>
              <L l={T.rAge}><input className={inp} inputMode="numeric" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></L>
              <L l={T.rGender} req><div className="grid grid-cols-3 gap-2">{["Female", "Male", "Other"].map((g) => <button key={g} type="button" aria-pressed={f.gender === g} onClick={() => setF({ ...f, gender: g })}
                className={`h-12 rounded-2xl border-2 text-sm font-semibold ${f.gender === g ? "border-[var(--rn-aqua-ink)] bg-[var(--rn-aqua-ink)] text-white" : "border-[var(--line)]"}`}>{g}</button>)}</div></L>
              <L l={T.rPhone} req hint={f.phone && !phoneOk ? "e.g. 0300 1234567" : ""}><input className={inp} inputMode="tel" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="03XX XXXXXXX" /></L>
              <L l={T.rMr}><input className={inp} dir="ltr" value={f.mr} onChange={(e) => setF({ ...f, mr: e.target.value })} placeholder="MR-…" /></L>
              <L l={T.rRef}><select className={inp} value={f.referring_doctor || (f.external_referrer ? "__o" : "")} onChange={(e) => setF({ ...f, referring_doctor: e.target.value === "__o" ? "" : e.target.value, external_referrer: e.target.value === "__o" ? " " : "" })}>
                <option value="">{T.none}</option>{(opts?.doctors ?? []).map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}<option value="__o">{T.rRefOut}…</option></select></L>
              {!!f.external_referrer && <L l={T.rRefOut}><input className={inp} value={f.external_referrer.trim()} onChange={(e) => setF({ ...f, external_referrer: e.target.value || " " })} /></L>}
              <L l={T.rDays} className="sm:col-span-2"><div className="flex flex-wrap gap-2">{DAYS.map((d) => <button key={d} type="button" aria-pressed={f.pref_days.includes(d)} onClick={() => setF({ ...f, pref_days: f.pref_days.includes(d) ? f.pref_days.filter((x) => x !== d) : [...f.pref_days, d] })}
                className={`h-11 min-w-14 rounded-xl border-2 px-3 text-sm font-semibold ${f.pref_days.includes(d) ? "border-[var(--rn-violet-ink)] bg-[var(--rn-violet-ink)] text-white" : "border-[var(--line)]"}`}>{d}</button>)}</div></L>
              <L l={T.rShift}><select className={inp} value={f.pref_shift} onChange={(e) => setF({ ...f, pref_shift: e.target.value })}>{["Morning", "Afternoon", "Evening"].map((s) => <option key={s}>{s}</option>)}</select></L>
              <L l={T.rAccess}><select className={inp} value={f.access_type} onChange={(e) => setF({ ...f, access_type: e.target.value })}><option value="">{T.none}</option>{["AV fistula", "AV graft", "Permanent catheter (tunnelled)", "Temporary catheter"].map((s) => <option key={s}>{s}</option>)}</select></L>
              {(f.request_type === "Transfer in" || f.request_type === "Regular" || f.request_type === "Guest") && <L l={T.rHosp} className="sm:col-span-2"><input className={inp} value={f.current_hospital} onChange={(e) => setF({ ...f, current_hospital: e.target.value })} /></L>}
              <L l={T.rNotes} className="sm:col-span-2"><textarea rows={3} className={`${inp} h-auto py-3`} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></L>
              <div className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold">{T.rFile}</span>
                {file ? <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--soft)] p-3"><FileUp className="h-5 w-5 text-[var(--rn-aqua-ink)]" /><span className="min-w-0 flex-1 truncate text-sm">{file.name}</span><button type="button" onClick={() => setFile(null)} aria-label="Remove file"><X className="h-4 w-4" /></button></div>
                  : <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--line)] p-4 hover:border-[var(--rn-aqua-ink)]"><Upload className="h-5 w-5 text-[var(--rn-aqua-ink)]" /><span className="text-sm"><b>Upload</b><span className="block text-[var(--muted)]">{T.rFileHint}</span></span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} /></label>}</div>
              <label className="flex cursor-pointer items-start gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-0.5 h-5 w-5" />{T.rConsent}</label>
            </div>
            {err && <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="h-5 w-5 shrink-0" />{err}</p>}
            <button type="button" disabled={!ok || busy} onClick={() => void submit()} className="rn-btn mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 font-semibold disabled:opacity-50">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ClipboardList className="h-5 w-5" />}{T.rSubmit}</button>
          </>}
        </div>
      </Wrap>
    </div>
  );
}

function L({ l, req, hint, className = "", children }: { l: string; req?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  return <label className={`block ${className}`}><span className="mb-2 block text-sm font-semibold">{l}{req && <span className="text-rose-600"> *</span>}</span>{children}{hint && <span className="mt-1 block text-xs text-rose-600">{hint}</span>}</label>;
}

/** Renal accent tokens. Aqua #38BDF8 / #0EA5E9 and violet #8B5CF6 / #A78BFA are fills; text uses AA-checked shades (computed WCAG ratios):
 *  #0369A1 on white 5.9:1, #6D28D9 on white 7.1:1, #7DD3FC on the dark surface #0D2730 9.3:1, #C4B5FD on #0D2730 8.4:1;
 *  button text #0B1B2B on the gradient: 8.1:1 (aqua end) and 6.4:1 (#A78BFA end). */
const RN_CSS = `
.rn-root{--accent-renal-aqua:#38bdf8;--accent-renal-aqua-strong:#0ea5e9;--accent-renal-violet:#8b5cf6;--accent-renal-violet-soft:#a78bfa;
  --rn-aqua-ink:#0369a1;--rn-violet-ink:#6d28d9;--rn-aqua-soft:#e0f2fe;--rn-violet-soft:#ede9fe;--rn-aqua-on-dark:#7dd3fc}
.s2-dark .rn-root,.dark .rn-root{--rn-aqua-ink:#7dd3fc;--rn-violet-ink:#c4b5fd;--rn-aqua-soft:rgba(56,189,248,.14);--rn-violet-soft:rgba(139,92,246,.18)}
.rn-btn{background:linear-gradient(135deg,#38bdf8,#a78bfa);color:#0b1b2b}.rn-btn:hover{filter:brightness(1.06)}
.rn-grad-text{background:linear-gradient(90deg,#7dd3fc,#c4b5fd);-webkit-background-clip:text;background-clip:text;color:transparent}
.rn-cta{background:linear-gradient(135deg,#0c4a6e,#0369a1 50%,#6d28d9)}
.rn-wave{animation:rnwave 18s linear infinite}@keyframes rnwave{to{transform:translateX(-50%)}}
.rn-drops{background-image:radial-gradient(circle at 20% 30%,rgba(56,189,248,.35) 0 3px,transparent 4px),radial-gradient(circle at 70% 60%,rgba(139,92,246,.35) 0 2px,transparent 3px),radial-gradient(circle at 40% 80%,rgba(56,189,248,.3) 0 2px,transparent 3px);background-size:180px 160px,220px 200px,260px 240px}
.rn-rail{background:linear-gradient(180deg,#38bdf8,#8b5cf6,var(--line));background-size:100% 200%;animation:rnrail 6s ease-in-out infinite}@keyframes rnrail{0%,100%{background-position:0 100%}50%{background-position:0 0}}
.rn-node{animation:rnnode 4.4s ease-in-out infinite}@keyframes rnnode{0%,9%{box-shadow:0 0 0 0 rgba(56,189,248,.5)}4%{box-shadow:0 0 0 9px rgba(56,189,248,.18)}100%{box-shadow:0 0 0 0 transparent}}
.rn-flow{animation:rnflow 1.6s linear infinite}.rn-flow-rev{animation:rnflow 1.8s linear infinite reverse}@keyframes rnflow{to{stroke-dashoffset:-52}}
.rn-drop{animation:rndrop 3.2s ease-in-out infinite}@keyframes rndrop{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(-10px);opacity:.9}}
@media (prefers-reduced-motion: reduce){.rn-wave,.rn-rail,.rn-node,.rn-flow,.rn-flow-rev,.rn-drop{animation:none}}
`;
