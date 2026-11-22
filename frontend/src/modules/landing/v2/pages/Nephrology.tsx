/**
 * Nephrology & Dialysis department page (D-99) + "Reserve a dialysis slot" request form (/site/nephrology/reserve).
 * LMC look (serif headings, glass cards, stat strip); hero from the design canvas; colours from the MRI & CT page's lime / gold theme
 * (--accent-renal-aqua = lime, --accent-renal-violet = gold;
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
import { CONFIG } from "../content";
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
      {/* ------------------------------------------------ hero (design: "Nephrology · Dialysis Unit" canvas) */}
      <section className="rn-hero relative overflow-hidden text-[#f1f7ec]">
        <div aria-hidden className="rn-dots pointer-events-none absolute inset-0" />
        <div className="relative z-[2] mx-auto grid max-w-7xl items-center gap-10 px-4 pb-32 pt-14 sm:px-6 sm:pt-[72px] lg:grid-cols-2">
          <div className="flex flex-col items-start gap-[26px]">
            <span className="rn-rise inline-flex items-center gap-2.5 rounded-full border border-[#bef264]/25 bg-[#bef264]/[0.07] px-3.5 py-2 text-xs font-semibold tracking-[0.16em] text-[#d9f99d]">
              <span className="rn-live h-[7px] w-[7px] rounded-full bg-[#bef264]" />{T.pill.toUpperCase()}</span>
            <h1 className="rn-rise s2-display m-0 text-[clamp(46px,5.8vw,80px)] leading-[1.02] tracking-[-0.025em] rtl:text-[clamp(32px,4vw,54px)] rtl:leading-[1.9]" style={{ animationDelay: ".08s" }}>{T.h1a}<br /><span className="rn-grad-text italic" style={{ fontWeight: 400 }}>{T.h1b}</span></h1>
            <p className="rn-rise m-0 max-w-[540px] text-lg leading-[1.65] text-[rgba(232,240,226,.8)]" style={{ animationDelay: ".18s" }}>{T.lead}</p>
            <div className="rn-rise flex flex-wrap gap-3" style={{ animationDelay: ".28s" }}>
              <a href={book} className="rn-b rn-btn-primary inline-flex min-h-[52px] items-center gap-2.5 rounded-full px-[26px] text-base font-semibold"><Stethoscope className="h-[18px] w-[18px]" />{T.book}</a>
              <Link to="/site/nephrology/reserve" className="rn-b rn-btn-ghost inline-flex min-h-[52px] items-center gap-2.5 rounded-full border border-white/20 bg-white/[0.04] px-6 text-base font-medium text-[#f1f7ec]"><CalendarCheck className="h-[18px] w-[18px]" />{T.reserve}</Link>
            </div>
            <div className="rn-rise flex flex-wrap items-center gap-x-7 gap-y-3.5" style={{ animationDelay: ".38s" }}>
              {unit && <a href={tel(unit)} className="inline-flex min-h-[44px] items-center gap-2.5 text-[15px] text-[#f1f7ec]">
                <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15"><Phone className="h-4 w-4" /></span>
                <span><span className="text-[rgba(232,240,226,.65)]">{T.call}</span> <span dir="ltr" className="font-semibold tracking-[0.02em]">{unit}</span></span></a>}
              <Link to="/site/my-dialysis" className="rn-portal inline-flex min-h-[44px] items-center gap-1.5 border-b border-[#d9f99d]/30 text-sm text-[#d9f99d]">{T.myDialysis} <span className="rn-arrow rtl:rotate-180">→</span></Link>
            </div>
          </div>
          <figure className="rn-rise m-0 flex flex-col items-center gap-[18px]" style={{ animationDelay: ".2s" }}>
            <div dir="ltr" className="rn-hover-float w-full max-w-[560px]" style={{ direction: "ltr" }}><Dialyser /></div>
            <figcaption className="flex flex-wrap justify-center gap-x-[22px] gap-y-2.5 font-mono text-xs tracking-[0.06em] text-[rgba(232,240,226,.72)]">
              {([["#ff8fa3", T.legend[0]], ["#bef264", T.legend[1]], ["#f2cf6b", T.legend[2]]] as [string, string][]).map(([c, l]) => <span key={l} className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>)}
            </figcaption>
          </figure>
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[96px] h-[130px] overflow-hidden">
          <svg className="rn-wave-slow absolute left-0 top-0 h-[130px] w-[200%]" viewBox="0 0 2880 130" preserveAspectRatio="none"><path d="M0 80 C360 40 1080 120 1440 80 C1800 40 2520 120 2880 80 V130 H0 Z" fill="rgba(212,167,44,.05)" /></svg>
          <svg className="rn-wave absolute left-0 top-0 h-[130px] w-[200%]" viewBox="0 0 2880 130" preserveAspectRatio="none"><path d="M0 70 C360 20 1080 120 1440 70 C1800 20 2520 120 2880 70 V130 H0 Z" fill="rgba(163,230,53,.06)" />
            <path d="M0 70 C360 20 1080 120 1440 70 C1800 20 2520 120 2880 70" fill="none" stroke="rgba(163,230,53,.28)" strokeWidth="1.5" /></svg>
        </div>
        {/* stat strip (live facts from the ERP) */}
        <div className="relative z-[2] mx-auto -mt-16 max-w-7xl px-4 pb-[72px] sm:px-6" aria-label="Unit at a glance">
          <div className="rn-rise grid grid-cols-2 gap-px overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.08] shadow-[0_30px_60px_-30px_rgba(0,0,0,.6)] md:grid-cols-5" style={{ animationDelay: ".45s" }}>
            {([[facts?.stations ?? "—", T.stats.stations], [facts?.sessions_month ?? "—", T.stats.sessions], [facts?.shifts ?? "—", T.stats.shifts], [facts?.nephrologists || "—", T.stats.nephs], ["24/7", T.stats.emergency]] as [string | number, string][]).map(([v, l], i) => (
              <div key={l} className={`rn-stat flex flex-col items-center gap-1.5 bg-[#132219] px-4 py-7 ${i === 4 ? "col-span-2 md:col-span-1" : ""}`}>
                <span className="rn-num text-[40px] font-semibold leading-none text-[#d9f99d]">{v}</span><span className="text-sm text-[rgba(232,240,226,.75)]">{l}</span></div>))}
          </div>
        </div>
      </section>

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
      <section className="relative overflow-hidden bg-[#0B1A12] py-24 text-white"><div className="rn-drops pointer-events-none absolute inset-0 opacity-30" />
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
              <span className="rn-node relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#1a2e1f] text-base font-black text-[var(--rn-aqua-on-dark)] ring-4 ring-[var(--bg)]" style={{ animationDelay: `${i * 0.4}s` }}>{i + 1}</span>
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
              {hot && <span className="absolute -top-3 start-6 rounded-full bg-[var(--rn-violet-ink)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--rn-on-ink)]">Most chosen</span>}
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
            <div className="mt-5 flex flex-wrap gap-3"><Link to="/site/nephrology/reserve" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-semibold text-[#1F3A0B]"><CalendarCheck className="h-4 w-4" />{T.reserve}</Link>
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

/** Hero visual (from the design canvas): a hollow-fibre dialyser — blood flows down the fibres, dialysate flows up around them (counter-current),
 *  toxins drift across the membrane. Speed follows --flow; all motion stops under prefers-reduced-motion. */
function Dialyser() {
  return (
    <svg viewBox="0 0 560 600" width="100%" direction="ltr" role="img" aria-label="Animated dialyzer: blood flows down through hollow fibres while dialysate flows up around them, drawing toxins across the membrane">
            <defs>
              <linearGradient id="rn-shellStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#d4a72c"/>
                <stop offset="1" stopColor="#a3e635"/>
              </linearGradient>
              <linearGradient id="rn-glass" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#ffffff" stopOpacity=".13"/>
                <stop offset=".45" stopColor="#ffffff" stopOpacity=".03"/>
                <stop offset="1" stopColor="#ffffff" stopOpacity=".08"/>
              </linearGradient>
              <radialGradient id="rn-glow" cx=".5" cy=".5" r=".5">
                <stop offset="0" stopColor="#a3e635" stopOpacity=".38"/>
                <stop offset=".6" stopColor="#d4a72c" stopOpacity=".12"/>
                <stop offset="1" stopColor="#d4a72c" stopOpacity="0"/>
              </radialGradient>
              <clipPath id="rn-core"><rect x="215" y="115" width="130" height="370" rx="65"/></clipPath>
            </defs>

            <ellipse className="rn-glow" cx="280" cy="300" rx="200" ry="270" fill="url(#rn-glow)"/>
            <circle className="rn-ring" cx="280" cy="300" r="252" fill="none" stroke="rgba(255,255,255,.08)" strokeDasharray="1 9"/>
            <circle className="rn-ring-rev" cx="280" cy="300" r="214" fill="none" stroke="rgba(163,230,53,.12)" strokeDasharray="40 14 4 14"/>

            <g fill="none" stroke="#bef264" strokeWidth="1">
              <circle className="rn-drift" cx="96" cy="430" r="5" style={{ animationDelay: "0s" } as React.CSSProperties}/>
              <circle className="rn-drift" cx="470" cy="300" r="3.5" style={{ animationDelay: "-4s" } as React.CSSProperties}/>
              <circle className="rn-drift" cx="150" cy="300" r="2.5" style={{ animationDelay: "-8s" } as React.CSSProperties}/>
              <circle className="rn-drift" cx="430" cy="500" r="4" style={{ animationDelay: "-2s" } as React.CSSProperties}/>
              <circle className="rn-drift" cx="120" cy="560" r="3" style={{ animationDelay: "-6s" } as React.CSSProperties}/>
            </g>

            <g fill="none" strokeLinecap="round">
              <path d="M24 60 H196 C246 60 280 74 280 114" stroke="rgba(255,122,144,.16)" strokeWidth="9"/>
              <path className="rn-flow rn-f-tube" d="M24 60 H196 C246 60 280 74 280 114" stroke="#ff8fa3" strokeWidth="2.4"/>
              <path d="M280 486 C280 526 314 540 364 540 H536" stroke="rgba(255,122,144,.16)" strokeWidth="9"/>
              <path className="rn-flow rn-f-tube" d="M280 486 C280 526 314 540 364 540 H536" stroke="#ff8fa3" strokeWidth="2.4"/>
              <path d="M536 420 H348" stroke="rgba(163,230,53,.16)" strokeWidth="9"/>
              <path className="rn-flow rn-f-tube" d="M536 420 H348" stroke="#bef264" strokeWidth="2.4"/>
              <path d="M212 180 H24" stroke="rgba(163,230,53,.16)" strokeWidth="9"/>
              <path className="rn-flow rn-f-tube" d="M212 180 H24" stroke="#bef264" strokeWidth="2.4"/>
            </g>

            <rect x="212" y="112" width="136" height="376" rx="68" fill="rgba(11,26,18,.55)"/>

            <g clipPath="url(#rn-core)">
              <rect x="212" y="112" width="136" height="64" fill="rgba(255,143,163,.07)"/>
              <rect x="212" y="424" width="136" height="64" fill="rgba(255,143,163,.07)"/>
              <line x1="212" y1="176" x2="348" y2="176" stroke="rgba(255,255,255,.12)"/>
              <line x1="212" y1="424" x2="348" y2="424" stroke="rgba(255,255,255,.12)"/>

              <g stroke="rgba(255,255,255,.17)" strokeWidth="1.2">
                <line x1="238" y1="114" x2="238" y2="486"/>
                <line x1="250" y1="114" x2="250" y2="486"/>
                <line x1="262" y1="114" x2="262" y2="486"/>
                <line x1="274" y1="114" x2="274" y2="486"/>
                <line x1="286" y1="114" x2="286" y2="486"/>
                <line x1="298" y1="114" x2="298" y2="486"/>
                <line x1="310" y1="114" x2="310" y2="486"/>
                <line x1="322" y1="114" x2="322" y2="486"/>
              </g>
              <g stroke="#ff8fa3" strokeWidth="1.7" strokeLinecap="round">
                <line className="rn-flow rn-f-fibre" x1="238" y1="114" x2="238" y2="486" style={{ animationDelay: "-.2s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-fibre" x1="250" y1="114" x2="250" y2="486" style={{ animationDelay: "-.9s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-fibre" x1="262" y1="114" x2="262" y2="486" style={{ animationDelay: "-.5s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-fibre" x1="274" y1="114" x2="274" y2="486" style={{ animationDelay: "-1.3s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-fibre" x1="286" y1="114" x2="286" y2="486" style={{ animationDelay: "-.1s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-fibre" x1="298" y1="114" x2="298" y2="486" style={{ animationDelay: "-1.1s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-fibre" x1="310" y1="114" x2="310" y2="486" style={{ animationDelay: "-.7s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-fibre" x1="322" y1="114" x2="322" y2="486" style={{ animationDelay: "-1.5s" } as React.CSSProperties}/>
              </g>
              <g stroke="#bef264" strokeOpacity=".7" strokeWidth="1.2" strokeLinecap="round">
                <line className="rn-flow rn-f-dial" x1="226" y1="424" x2="226" y2="176" style={{ animationDelay: "-.4s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-dial" x1="244" y1="424" x2="244" y2="176" style={{ animationDelay: "-1.6s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-dial" x1="268" y1="424" x2="268" y2="176" style={{ animationDelay: "-.9s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-dial" x1="292" y1="424" x2="292" y2="176" style={{ animationDelay: "-2s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-dial" x1="316" y1="424" x2="316" y2="176" style={{ animationDelay: "-1.2s" } as React.CSSProperties}/>
                <line className="rn-flow rn-f-dial" x1="334" y1="424" x2="334" y2="176" style={{ animationDelay: "-.2s" } as React.CSSProperties}/>
              </g>
              <g fill="#f2cf6b">
                <circle className="rn-tox" cx="250" cy="390" r="2.2" style={{ "--dx": "-6px", animationDelay: "0s" } as React.CSSProperties}/>
                <circle className="rn-tox" cx="274" cy="340" r="1.8" style={{ "--dx": "-6px", animationDelay: "-1.1s" } as React.CSSProperties}/>
                <circle className="rn-tox" cx="298" cy="300" r="2.2" style={{ "--dx": "6px", animationDelay: "-2.4s" } as React.CSSProperties}/>
                <circle className="rn-tox" cx="322" cy="370" r="1.8" style={{ "--dx": "6px", animationDelay: "-3.3s" } as React.CSSProperties}/>
                <circle className="rn-tox" cx="238" cy="270" r="2" style={{ "--dx": "-6px", animationDelay: "-4.1s" } as React.CSSProperties}/>
                <circle className="rn-tox" cx="286" cy="410" r="2" style={{ "--dx": "6px", animationDelay: "-1.8s" } as React.CSSProperties}/>
                <circle className="rn-tox" cx="310" cy="250" r="1.8" style={{ "--dx": "6px", animationDelay: "-2.9s" } as React.CSSProperties}/>
                <circle className="rn-tox" cx="262" cy="230" r="2" style={{ "--dx": "6px", animationDelay: "-4.6s" } as React.CSSProperties}/>
                <circle className="rn-tox" cx="250" cy="320" r="1.6" style={{ "--dx": "-6px", animationDelay: "-3.7s" } as React.CSSProperties}/>
                <circle className="rn-tox" cx="298" cy="380" r="1.6" style={{ "--dx": "-6px", animationDelay: "-0.6s" } as React.CSSProperties}/>
              </g>
              <rect x="224" y="140" width="5" height="320" rx="2.5" fill="#ffffff" fillOpacity=".09"/>
            </g>

            <rect x="212" y="112" width="136" height="376" rx="68" fill="url(#rn-glass)" stroke="url(#rn-shellStroke)" strokeWidth="2.4"/>

            <circle cx="280" cy="114" r="5" fill="#0B1A12" stroke="#ff8fa3" strokeWidth="2"/>
            <circle cx="280" cy="486" r="5" fill="#0B1A12" stroke="#ff8fa3" strokeWidth="2"/>
            <circle cx="348" cy="420" r="4" fill="#0B1A12" stroke="#bef264" strokeWidth="2"/>
            <circle cx="212" cy="180" r="4" fill="#0B1A12" stroke="#bef264" strokeWidth="2"/>

            <g fontFamily="JetBrains Mono, monospace" fontSize="10.5" letterSpacing="1.6" fill="rgba(232,240,226,.72)">
              <text x="24" y="44">BLOOD IN</text>
              <text x="24" y="166">DIALYSATE OUT</text>
              <text x="536" y="404" textAnchor="end">DIALYSATE IN</text>
              <text x="536" y="564" textAnchor="end">BLOOD OUT</text>
            </g>
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
      <section className="relative overflow-hidden bg-[#0B1A12] pb-28 pt-12 text-white"><div className="rn-drops pointer-events-none absolute inset-0 opacity-25" />
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
                className={`h-12 rounded-2xl border-2 text-sm font-semibold ${f.gender === g ? "border-[var(--rn-aqua-ink)] bg-[var(--rn-aqua-ink)] text-[var(--rn-on-ink)]" : "border-[var(--line)]"}`}>{g}</button>)}</div></L>
              <L l={T.rPhone} req hint={f.phone && !phoneOk ? "e.g. 0300 1234567" : ""}><input className={inp} inputMode="tel" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="03XX XXXXXXX" /></L>
              <L l={T.rMr}><input className={inp} dir="ltr" value={f.mr} onChange={(e) => setF({ ...f, mr: e.target.value })} placeholder="MR-…" /></L>
              <L l={T.rRef}><select className={inp} value={f.referring_doctor || (f.external_referrer ? "__o" : "")} onChange={(e) => setF({ ...f, referring_doctor: e.target.value === "__o" ? "" : e.target.value, external_referrer: e.target.value === "__o" ? " " : "" })}>
                <option value="">{T.none}</option>{(opts?.doctors ?? []).map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}<option value="__o">{T.rRefOut}…</option></select></L>
              {!!f.external_referrer && <L l={T.rRefOut}><input className={inp} value={f.external_referrer.trim()} onChange={(e) => setF({ ...f, external_referrer: e.target.value || " " })} /></L>}
              <L l={T.rDays} className="sm:col-span-2"><div className="flex flex-wrap gap-2">{DAYS.map((d) => <button key={d} type="button" aria-pressed={f.pref_days.includes(d)} onClick={() => setF({ ...f, pref_days: f.pref_days.includes(d) ? f.pref_days.filter((x) => x !== d) : [...f.pref_days, d] })}
                className={`h-11 min-w-14 rounded-xl border-2 px-3 text-sm font-semibold ${f.pref_days.includes(d) ? "border-[var(--rn-violet-ink)] bg-[var(--rn-violet-ink)] text-[var(--rn-on-ink)]" : "border-[var(--line)]"}`}>{d}</button>)}</div></L>
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

/** Accent tokens — the MRI & CT page's lime / gold theme (mrct: --accent-imaging-lime #A3E635, --accent-imaging-gold #D4A72C), kept under the
 *  --accent-renal-* / --rn-* names. Text shades, computed WCAG ratios: #3F6212 on white 7.1:1, #7C5A06 on white 6.3:1, #3F6212 on #ECFCCB 6.5:1,
 *  #BEF264 on the dark surface #0D2730 11.9:1, #F2CF6B on #0D2730 10.3:1, #D9F99D on the hero #0B1A12 15.4:1; button text #14260A on the
 *  gradient 12.3:1 (#BEF264 end) and 5.2:1 (#65A30D end); white on the CTA band #3F6212 7.1:1. */
const RN_CSS = `
[dir=rtl] .rn-grad-text{background:none;-webkit-background-clip:border-box;background-clip:border-box;color:#f2cf6b;font-style:normal!important;font-weight:inherit!important}
[dir=rtl] .rn-hero h1{text-wrap:balance;padding-block:.15em}
[dir=rtl] .rn-hero p{text-wrap:pretty;line-height:2}
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&family=JetBrains+Mono:wght@400&display=swap');
.rn-hero{background:radial-gradient(1100px 620px at 78% 30%,rgba(163,230,53,.16) 0%,rgba(163,230,53,0) 70%),radial-gradient(800px 500px at 10% 0%,rgba(212,167,44,.10) 0%,rgba(212,167,44,0) 70%),#0B1A12;--flow:1}
.rn-dots{background-image:linear-gradient(rgba(163,230,53,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(163,230,53,.07) 1px,transparent 1px);background-size:36px 36px}
.rn-hero .s2-display{font-weight:500}
.rn-num{font-family:'Barlow Condensed',Oswald,'Arial Narrow',sans-serif}
.rn-btn-primary{background:linear-gradient(135deg,#bef264,#65a30d);color:#14260a}
.rn-b{transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s,background .35s,border-color .35s}.rn-b:hover{transform:translateY(-2px)}
.rn-btn-primary:hover{box-shadow:0 14px 34px -12px rgba(163,230,53,.65)}.rn-btn-ghost:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.32)}
.rn-portal .rn-arrow{display:inline-block;transition:transform .35s}.rn-portal:hover .rn-arrow{transform:translateX(4px)}
.rn-rise{animation:rnrise 1s cubic-bezier(.2,.7,.2,1) both}@keyframes rnrise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.rn-live{animation:rnlive 2.4s ease-out infinite}@keyframes rnlive{0%{box-shadow:0 0 0 0 rgba(163,230,53,.55)}80%,100%{box-shadow:0 0 0 7px rgba(163,230,53,0)}}
.rn-flow{animation:rndash linear infinite}.rn-f-tube{stroke-dasharray:4 12;animation-duration:calc(var(--flow,1)*1.1s)}
.rn-f-fibre{stroke-dasharray:2 14;animation-duration:calc(var(--flow,1)*1.7s)}.rn-f-dial{stroke-dasharray:1 15;animation-duration:calc(var(--flow,1)*2.3s)}
@keyframes rndash{to{stroke-dashoffset:-32}}
.rn-tox{animation:rntox calc(var(--flow,1)*5.2s) ease-in-out infinite;opacity:0}@keyframes rntox{0%{transform:translate(0,0);opacity:0}18%{opacity:1}72%{opacity:.85}100%{transform:translate(var(--dx),-52px);opacity:0}}
.rn-ring{transform-box:view-box;transform-origin:280px 300px;animation:rnspin 70s linear infinite}
.rn-ring-rev{transform-box:view-box;transform-origin:280px 300px;animation:rnspin 110s linear infinite reverse}@keyframes rnspin{to{transform:rotate(360deg)}}
.rn-glow{transform-box:view-box;transform-origin:280px 300px;animation:rnbreathe 7s ease-in-out infinite}@keyframes rnbreathe{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.95;transform:scale(1.05)}}
.rn-drift{animation:rndrift 13s ease-in-out infinite;opacity:0}@keyframes rndrift{0%{transform:translateY(0);opacity:0}25%{opacity:.9}100%{transform:translateY(-90px);opacity:0}}
.rn-hover-float{animation:rnhfloat 9s ease-in-out infinite}@keyframes rnhfloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.rn-wave-slow{animation:rnwave 52s linear infinite reverse}
.rn-stat{transition:background .35s}.rn-stat:hover{background:#1a2e1f}
@media (prefers-reduced-motion: reduce){.rn-rise,.rn-live,.rn-flow,.rn-tox,.rn-ring,.rn-ring-rev,.rn-glow,.rn-drift,.rn-hover-float,.rn-wave-slow{animation:none!important}.rn-tox,.rn-drift{opacity:.8}}
.rn-root{--rn-on-ink:#ffffff;--accent-renal-aqua:#a3e635;--accent-renal-aqua-strong:#84cc16;--accent-renal-violet:#d4a72c;--accent-renal-violet-soft:#f2cf6b;
  --rn-aqua-ink:#3f6212;--rn-violet-ink:#7c5a06;--rn-aqua-soft:#ecfccb;--rn-violet-soft:#fdf3d6;--rn-aqua-on-dark:#d9f99d}
.s2-dark .rn-root,.dark .rn-root{--rn-on-ink:#14260a;--rn-aqua-ink:#bef264;--rn-violet-ink:#f2cf6b;--rn-aqua-soft:rgba(163,230,53,.14);--rn-violet-soft:rgba(212,167,44,.16)}
.rn-btn{background:linear-gradient(135deg,#bef264,#65a30d);color:#14260a}.rn-btn:hover{filter:brightness(1.06)}
.rn-grad-text{background:linear-gradient(90deg,#d9f99d,#f2cf6b);-webkit-background-clip:text;background-clip:text;color:transparent}
.rn-cta{background:linear-gradient(135deg,#365314,#3f6212 55%,#7c5a06)}
.rn-wave{animation:rnwave 34s linear infinite}@keyframes rnwave{to{transform:translateX(-50%)}}
.rn-drops{background-image:radial-gradient(circle at 20% 30%,rgba(163,230,53,.35) 0 3px,transparent 4px),radial-gradient(circle at 70% 60%,rgba(212,167,44,.35) 0 2px,transparent 3px),radial-gradient(circle at 40% 80%,rgba(163,230,53,.3) 0 2px,transparent 3px);background-size:180px 160px,220px 200px,260px 240px}
.rn-rail{background:linear-gradient(180deg,#a3e635,#d4a72c,var(--line));background-size:100% 200%;animation:rnrail 6s ease-in-out infinite}@keyframes rnrail{0%,100%{background-position:0 100%}50%{background-position:0 0}}
.rn-node{animation:rnnode 4.4s ease-in-out infinite}@keyframes rnnode{0%,9%{box-shadow:0 0 0 0 rgba(163,230,53,.5)}4%{box-shadow:0 0 0 9px rgba(163,230,53,.18)}100%{box-shadow:0 0 0 0 transparent}}
.rn-flow{animation:rnflow 1.6s linear infinite}.rn-flow-rev{animation:rnflow 1.8s linear infinite reverse}@keyframes rnflow{to{stroke-dashoffset:-52}}
.rn-drop{animation:rndrop 3.2s ease-in-out infinite}@keyframes rndrop{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(-10px);opacity:.9}}
@media (prefers-reduced-motion: reduce){.rn-wave,.rn-rail,.rn-node,.rn-flow,.rn-flow-rev,.rn-drop{animation:none}}
`;
