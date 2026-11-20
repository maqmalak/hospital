/**
 * MRI & CT Scan service page (D-98). Live MRI / CT catalogue from the radiology module (same Imaging Procedure master as X-ray and
 * ultrasound), with body-part and contrast filters, preparation, MRI and CT safety, visit timeline, radiologists, equipment, FAQ.
 * Accent tokens --accent-imaging-lime / --accent-imaging-gold; text colours chosen for WCAG AA on both light and dark surfaces.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, CalendarCheck, ChevronDown, Clock3, CreditCard, Download, FileSignature, Magnet, MapPin, Phone, ScanLine, Search,
  ShieldAlert, ShieldCheck, Siren, UserRound, X, type LucideIcon,
} from "lucide-react";
import { CONFIG } from "../content";
import { initials, phoneOf, rs, tel } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, Reveal, SectionHead, Skeleton, useJsonLd, useTitle } from "../ui";
import { PHONE_RADIOLOGY, turnaround, useCatalogue, type Procedure } from "../radiology";
import { EQUIPMENT, MRCT } from "../mrct";

type Tab = "MRI" | "CT";
const STEP_ICONS: LucideIcon[] = [CalendarCheck, ShieldCheck, CreditCard, UserRound, ScanLine, FileSignature];

export default function MriCt() {
  const { lang, phone, site } = useS2();
  const T = MRCT[lang];
  const ur = lang === "ur";
  useTitle(`${T.title} — Lyallpur Medical Complex`, T.metaDesc);
  const [cat, done] = useCatalogue();
  const loc = useLocation();
  const [tab, setTab] = useState<Tab>(loc.hash === "#ct" ? "CT" : "MRI");
  useEffect(() => { if (loc.hash === "#ct") setTab("CT"); }, [loc.hash]);
  const [q, setQ] = useState("");
  const [part, setPart] = useState("");
  const [con, setCon] = useState("all");
  const radPhone = PHONE_RADIOLOGY || phoneOf("reception", phone);
  const procs = useMemo(() => (cat?.procedures ?? []).filter((p) => p.modality === tab), [cat, tab]);
  const parts = useMemo(() => [...new Set(procs.map((p) => p.body_region).filter(Boolean) as string[])].sort(), [procs]);
  const shown = procs.filter((p) => (!part || p.body_region === part) && (con === "all" || (p.contrast ?? "No") === con)
    && (!q.trim() || `${p.procedure_name} ${p.description ?? ""} ${p.body_region ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  useEffect(() => { setPart(""); setCon("all"); }, [tab]);
  const rads = cat?.radiologists ?? [];
  const hours = cat?.hours as Record<string, { open: string; close: string }> | undefined;

  useJsonLd(cat ? {
    "@context": "https://schema.org", "@type": "MedicalClinic", name: "MRI & CT — Lyallpur Medical Complex", medicalSpecialty: "Radiography", telephone: radPhone || undefined,
    address: site?.clinic.address ? { "@type": "PostalAddress", streetAddress: site.clinic.address, addressLocality: "Faisalabad", addressCountry: "PK" } : undefined,
    availableService: (cat.procedures ?? []).filter((p) => p.modality === "MRI" || p.modality === "CT").slice(0, 50).map((p) => ({ "@type": "MedicalProcedure", name: p.procedure_name,
      preparation: p.preparation, ...(CONFIG.showPrices && p.price ? { offers: { "@type": "Offer", price: p.price, priceCurrency: "PKR" } } : {}) })),
  } : null);
  useJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: T.faq.map(([a, b]) => ({ "@type": "Question", name: a, acceptedAnswer: { "@type": "Answer", text: b } })) });

  return (
    <div className="mc-root">
      <style>{MC_CSS}</style>
      {/* ------------------------------------------------ hero with scan line */}
      <section className="relative overflow-hidden bg-[#0B1A12] text-white">
        <div className="mc-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute -end-40 -top-40 h-[520px] w-[520px] rounded-full bg-[var(--accent-imaging-lime)]/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <Reveal><span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-imaging-lime)]/40 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-[var(--mc-lime-on-dark)]"><Magnet className="h-3.5 w-3.5" />{T.eyebrow}</span></Reveal>
            <Reveal delay={80}><h1 className="s2-display mt-5 text-[2.5rem] leading-[1.05] sm:text-[3.8rem]">{T.h1a}<br /><span className="text-[var(--mc-lime-on-dark)]">{T.h1b}</span></h1></Reveal>
            <Reveal delay={160}><p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">{T.lead}</p></Reveal>
            <Reveal delay={240} className="mt-9 flex flex-wrap gap-3">
              <Link to={`/site/radiology/book?modality=${tab}`} className="mc-btn inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold"><CalendarCheck className="h-5 w-5" />{T.book}</Link>
              <Link to="/site/radiology/reports" className={btn.glass}><Download className="h-5 w-5" />{T.reports}</Link>
              {radPhone && <a href={tel(radPhone)} className={btn.glass}><Phone className="h-5 w-5" />{T.call}</a>}
            </Reveal>
            <Reveal delay={300} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
              <span className="flex items-center gap-2"><Siren className="h-4 w-4 text-[#FF8A85]" />{T.ctaEmergency}</span>
              <span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[var(--accent-imaging-gold)]" />{T.ctaWalkIn}</span>
            </Reveal>
          </div>
          <Reveal delay={200} className="hidden justify-self-center lg:block"><ScannerArt /></Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ stat strip */}
      <section className="relative z-10 -mt-10"><Wrap>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--line)] shadow-[0_30px_60px_-34px_rgba(11,26,18,0.55)] md:grid-cols-5">
          {T.stats.map(([v, l], i) => <Reveal key={l} delay={i * 60} className={`bg-[var(--surface)] p-5 text-center ${i === 4 ? "col-span-2 md:col-span-1" : ""}`}>
            <div className="s2-num text-[1.8rem] font-semibold leading-none text-[var(--mc-lime-ink)]">{v}</div><div className="mt-1.5 text-[13px] font-medium text-[var(--muted)]">{l}</div></Reveal>)}
        </div>
      </Wrap></section>

      {/* ------------------------------------------------ MRI / CT catalogue */}
      <section className="py-24" id="scans"><Wrap>
        <SectionHead eyebrow={`${T.tabMri} · ${T.tabCt}`} title={T.tabsTitle} sub={T.tabsSub} />
        <div className="mb-5 inline-flex rounded-full border border-[var(--line)] bg-[var(--surface)] p-1" role="tablist" aria-label="MRI or CT">
          {(["MRI", "CT"] as Tab[]).map((k) => <button key={k} id={k === "CT" ? "ct" : "mri"} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full px-6 py-2.5 text-sm font-bold transition ${tab === k ? "mc-btn shadow" : "text-[var(--ink2)] hover:bg-[var(--soft)]"}`}>{k === "MRI" ? T.tabMri : T.tabCt}
            <span className="ms-2 opacity-70">{(cat?.procedures ?? []).filter((p) => p.modality === k).length || ""}</span></button>)}
        </div>
        <div className="sticky top-[72px] z-20 mb-8 grid gap-2 rounded-[22px] border border-[var(--line)] bg-[var(--surface)]/90 p-2 shadow-sm backdrop-blur-xl md:grid-cols-[1fr_auto_auto]">
          <label className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 focus-within:border-[var(--mc-lime-ink)]">
            <Search className="h-4 w-4 text-[var(--muted)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.searchPh} aria-label={T.searchPh} className="h-11 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--muted)]" />
            {q && <button onClick={() => setQ("")} aria-label="Clear"><X className="h-4 w-4 text-[var(--muted)]" /></button>}
          </label>
          <select value={part} onChange={(e) => setPart(e.target.value)} aria-label={T.partLabel} className="h-11 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 text-sm">
            <option value="">{T.allParts}</option>{parts.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <div className="flex gap-1 overflow-x-auto" role="group" aria-label={T.contrastLabel}>{["all", "No", "Optional", "Yes"].map((c) => <button key={c} onClick={() => setCon(c)} aria-pressed={con === c}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold ${con === c ? "bg-[var(--mc-lime-ink)] text-white" : "text-[var(--ink2)] hover:bg-[var(--soft)]"}`}>{T.contrast[c]}</button>)}</div>
        </div>
        {!done ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-60" />)}</div> : <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shown.map((p, i) => <ScanCard key={p.name} p={p} delay={(i % 3) * 60} T={T} />)}</div>
          {!shown.length && <p className="py-16 text-center text-[var(--muted)]">{T.noMatch}</p>}
          {CONFIG.showPrices && <p className="mt-6 text-center text-xs text-[var(--muted)]">{T.priceNote}</p>}
        </>}
      </Wrap></section>

      {/* ------------------------------------------------ preparation */}
      <section className="bg-[var(--soft)] py-24" id="preparation"><Wrap className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionHead eyebrow={T.prepTitle} title={T.prepTitle} sub={T.prepSub} />
        <Accordion items={T.prep.map(([t, lines]) => ({ title: t, body: <ul className="space-y-2">{lines.map((l) => <li key={l} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-imaging-gold)]" />{l}</li>)}</ul> }))} />
      </Wrap></section>

      {/* ------------------------------------------------ MRI & CT safety */}
      <section className="relative overflow-hidden bg-[#0B1A12] py-24 text-white" id="safety"><Wrap className="grid gap-12 lg:grid-cols-2">
        {([[T.mriSafetyTitle, T.mriSafetySub, T.mriSafety, Magnet], [T.ctSafetyTitle, T.ctSafetySub, T.ctSafety, ScanLine]] as [string, string, [string, string][], LucideIcon][]).map(([t, s, items, I]) => (
          <div key={t}>
            <h2 className="s2-display flex items-center gap-3 text-3xl"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent-imaging-lime)]/15 text-[var(--mc-lime-on-dark)]"><I className="h-6 w-6" /></span>{t}</h2>
            <p className="mt-3 text-white/75">{s}</p>
            <div className="mt-6 space-y-3">{items.map(([h, d], i) => <Reveal key={h} delay={i * 60} className={`rounded-[18px] border p-4 ${i === 0 && I === Magnet ? "border-[#FF8A85]/50 bg-[#FF8A85]/10" : "border-white/10 bg-white/[0.05]"}`}>
              <div className="flex items-center gap-2 font-bold">{i === 0 && I === Magnet ? <ShieldAlert className="h-4 w-4 text-[#FF8A85]" /> : <ShieldCheck className="h-4 w-4 text-[var(--mc-lime-on-dark)]" />}{h}</div>
              <p className="mt-1 text-sm leading-relaxed text-white/75">{d}</p></Reveal>)}</div>
          </div>))}
      </Wrap></section>

      {/* ------------------------------------------------ timeline */}
      <section className="py-24" id="process"><Wrap>
        <SectionHead eyebrow={T.stepsTitle} title={T.stepsTitle} sub={T.stepsSub} center />
        <ol className="relative grid gap-6 md:grid-cols-3 lg:grid-cols-6">
          <span aria-hidden className="mc-rail absolute start-[10%] end-[10%] top-[23px] hidden h-[2px] rounded lg:block" />
          {T.steps.map(([h, d], i) => { const I = STEP_ICONS[i]; return (
            <Reveal as="li" key={h} delay={i * 80} className="relative text-center">
              <span className="mc-node relative z-10 mx-auto grid h-[46px] w-[46px] place-items-center rounded-full border-2 border-[var(--mc-lime-ink)] bg-[var(--surface)] text-[var(--mc-lime-ink)]" style={{ animationDelay: `${i * 0.5}s` }}><I className="h-5 w-5" /></span>
              <div className="s2-num mt-3 text-xs font-semibold tracking-[0.2em] text-[var(--mc-gold-ink)]">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="mt-0.5 font-bold">{h}</h3><p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{d}</p></Reveal>); })}
        </ol>
      </Wrap></section>

      {/* ------------------------------------------------ radiologists + equipment */}
      <section className="bg-[var(--soft)] py-24" id="team"><Wrap className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <SectionHead eyebrow={T.teamTitle} title={T.teamTitle} sub={T.teamSub} />
          {rads.length ? <div className="grid gap-4 sm:grid-cols-2">{rads.map((r) => <Reveal key={r.name} className={`${card} flex items-center gap-4 p-5`}>
            {r.photo ? <img src={r.photo} alt="" className="h-14 w-14 rounded-2xl object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--mc-lime-soft)] font-bold text-[var(--mc-lime-ink)]">{initials(r.doctor_name)}</span>}
            <div className="min-w-0"><div className="font-bold">{r.doctor_name}</div><div className="text-sm text-[var(--muted)]">{r.qualification || r.specialization || "Radiologist"}</div>
              {r.registration_no && <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--mc-lime-ink)]"><BadgeCheck className="h-3.5 w-3.5" />PMDC {r.registration_no}</div>}</div></Reveal>)}</div>
            : <p className="text-[var(--muted)]">{T.teamEmpty}</p>}
        </div>
        <div>
          <SectionHead eyebrow={T.equipTitle} title={T.equipTitle} sub={T.equipSub} />
          <div className="space-y-4">{([["MRI-1", EQUIPMENT.mri.name, EQUIPMENT.mri.bore, Magnet, hours?.MRI], ["CT-1", EQUIPMENT.ct.name, EQUIPMENT.ct.slices, ScanLine, hours?.CT]] as const).map(([m, n, d, I, h]) => (
            <Reveal key={m} className={`${card} flex gap-4 p-5`}><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--mc-gold-soft)] text-[var(--mc-gold-ink)]"><I className="h-6 w-6" /></span>
              <div><div className="text-xs font-bold tracking-wide text-[var(--mc-gold-ink)]">{m}</div><div className="font-bold">{n}</div><div className="text-sm text-[var(--muted)]">{d}</div>
                {h && <div className="mt-1 text-xs text-[var(--muted)]" dir="ltr">{T.hours}: {h.open === h.close || (h.open === "00:00" && h.close.startsWith("23:59")) ? "24/7" : `${h.open}–${h.close}`}</div>}</div></Reveal>))}</div>
        </div>
      </Wrap></section>

      {/* ------------------------------------------------ FAQ + location */}
      <section className="py-24" id="faq"><Wrap className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        <div><SectionHead eyebrow="FAQ" title={T.faqTitle} /><Accordion items={T.faq.map(([a, b]) => ({ title: a, body: <p>{b}</p> }))} /></div>
        <div className="space-y-5">
          <Reveal className={`${card} p-6`}><h3 className="flex items-center gap-2 text-lg font-bold"><MapPin className="h-5 w-5 text-[var(--mc-lime-ink)]" />{T.locTitle}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink2)]">{T.locText}</p>
            {site?.clinic.address && <p className="mt-2 text-sm text-[var(--muted)]">{site.clinic.address}</p>}
            <Link to="/site/map" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--mc-lime-ink)]">{ur ? "نقشہ" : "Hospital map"}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Reveal>
          <Reveal className="mc-cta rounded-[24px] p-7 text-white"><h3 className="s2-display text-2xl">{T.ctaTitle}</h3><p className="mt-2 text-white/85">{T.ctaText}</p>
            <div className="mt-5 flex flex-wrap gap-3"><Link to={`/site/radiology/book?modality=${tab}`} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-semibold text-[#1F3A0B]"><CalendarCheck className="h-4 w-4" />{T.book}</Link>
              {radPhone && <a href={tel(radPhone)} className={btn.glass} dir="ltr"><Phone className="h-4 w-4" />{radPhone}</a>}</div></Reveal>
        </div>
      </Wrap></section>
    </div>
  );
}

function ScanCard({ p, delay, T }: { p: Procedure; delay: number; T: (typeof MRCT)["en"] }) {
  const [open, setOpen] = useState(false);
  const c = p.contrast ?? "No";
  return (
    <Reveal delay={delay} className={`${card} group flex h-full flex-col p-6`}>
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--mc-lime-soft)] text-[var(--mc-lime-ink)] transition group-hover:scale-110">{p.modality === "MRI" ? <Magnet className="h-6 w-6" /> : <ScanLine className="h-6 w-6" />}</span>
        <div className="min-w-0 flex-1"><h3 className="text-[1.05rem] font-bold leading-snug">{p.procedure_name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {p.body_region && <span className="rounded-full bg-[var(--soft)] px-2 py-0.5 text-[var(--ink2)]">{p.body_region}</span>}
            {c !== "No" && <span className="rounded-full bg-[var(--mc-gold-soft)] px-2 py-0.5 text-[var(--mc-gold-ink)]">{T.contrast[c]}</span>}
            {p.walk_in ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">Walk-in</span> : null}
          </div></div>
      </div>
      {p.description && <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">{p.description}</p>}
      {p.preparation && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-4 flex items-start gap-2 rounded-2xl bg-[var(--soft)] p-3 text-start text-[13px] leading-relaxed text-[var(--ink2)]">
        <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--mc-gold-ink)] transition ${open ? "rotate-180" : ""}`} /><span className={open ? "" : "line-clamp-2"}><b className="text-[var(--ink)]">{T.prepTitle}: </b>{p.preparation}</span></button>}
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div>
          {CONFIG.showPrices && p.price ? <div className="s2-num text-[1.45rem] font-semibold leading-none" dir="ltr">{rs(p.price)}</div> : null}
          {CONFIG.showPrices && c === "Optional" && p.contrast_surcharge ? <div className="mt-0.5 text-xs text-[var(--mc-gold-ink)]" dir="ltr">{T.withContrast} {rs(p.contrast_surcharge)}</div> : null}
          <div className="mt-1 text-xs text-[var(--muted)]">{p.duration_min} {T.min} · {turnaround(p)}</div>
        </div>
        <Link to={`/site/radiology/book?scan=${encodeURIComponent(p.name)}`} className="mc-btn inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold" aria-label={`Book ${p.procedure_name}`}>Book<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
      </div>
    </Reveal>
  );
}

function Accordion({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return <div className="space-y-3">{items.map((it, i) => { const on = open === i; return (
    <div key={it.title} className={`overflow-hidden rounded-[20px] border bg-[var(--surface)] transition ${on ? "border-[var(--mc-lime-ink)]" : "border-[var(--line)]"}`}>
      <h3><button type="button" onClick={() => setOpen(on ? null : i)} aria-expanded={on} className="flex w-full items-center gap-3 px-5 py-4 text-start text-[16px] font-bold">
        <span className="flex-1">{it.title}</span><ChevronDown className={`h-5 w-5 shrink-0 text-[var(--muted)] transition ${on ? "rotate-180 text-[var(--mc-lime-ink)]" : ""}`} /></button></h3>
      <div className={`grid transition-all duration-300 ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}><div className="overflow-hidden"><div className="px-5 pb-5 text-[15px] leading-relaxed text-[var(--ink2)]">{it.body}</div></div></div>
    </div>); })}</div>;
}

/** Hero visual: a scanner gantry with an axial brain slice and a sweeping lime scan line. */
function ScannerArt() {
  return (
    <svg viewBox="0 0 420 380" className="w-[420px] max-w-full" aria-hidden>
      <defs><radialGradient id="mcg" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#1a2e1f" /><stop offset="1" stopColor="#07120b" /></radialGradient>
        <linearGradient id="mcl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent-imaging-lime)" stopOpacity="0" /><stop offset=".5" stopColor="var(--accent-imaging-lime)" stopOpacity=".9" /><stop offset="1" stopColor="var(--accent-imaging-lime)" stopOpacity="0" /></linearGradient>
        <clipPath id="mcc"><circle cx="210" cy="180" r="118" /></clipPath></defs>
      <circle cx="210" cy="180" r="168" fill="none" stroke="var(--accent-imaging-gold)" strokeOpacity=".5" strokeWidth="2" strokeDasharray="4 10" className="mc-spin" />
      <circle cx="210" cy="180" r="148" fill="#132219" stroke="#2b4a33" strokeWidth="18" />
      <circle cx="210" cy="180" r="118" fill="url(#mcg)" />
      <g clipPath="url(#mcc)" stroke="#d9f99d" fill="none" strokeOpacity=".75">
        <ellipse cx="210" cy="180" rx="78" ry="96" strokeWidth="3" /><ellipse cx="210" cy="180" rx="66" ry="84" strokeWidth="1.2" strokeOpacity=".4" />
        <path d="M210 92v176" strokeWidth="1.5" strokeOpacity=".5" />
        <path d="M168 140c14-10 26 6 42-2s26 10 40 0M164 186c18-8 28 8 46 0s30 8 44 0M170 226c14 8 26-6 40 2s24-6 38 0" strokeWidth="1.6" strokeOpacity=".55" />
        <ellipse cx="190" cy="176" rx="10" ry="18" strokeWidth="1.5" /><ellipse cx="230" cy="176" rx="10" ry="18" strokeWidth="1.5" />
        <rect x="80" y="0" width="260" height="40" fill="url(#mcl)" stroke="none" className="mc-sweep" />
      </g>
      <g fontFamily="monospace" fontSize="11" fill="#d9f99d" fillOpacity=".8"><text x="40" y="350">MRI-1 · T2 AX</text><text x="300" y="350">CT-1 · 128</text></g>
    </svg>
  );
}

const MC_CSS = `
.mc-root{--accent-imaging-lime:#a3e635;--accent-imaging-gold:#d4a72c;--mc-lime-on-dark:#d9f99d;--mc-lime-ink:#3f6212;--mc-gold-ink:#7c5a06;--mc-lime-soft:#ecfccb;--mc-gold-soft:#fdf3d6}
.dark .mc-root,[data-theme="dark"] .mc-root{--mc-lime-ink:#bef264;--mc-gold-ink:#f2cf6b;--mc-lime-soft:rgba(163,230,53,.14);--mc-gold-soft:rgba(212,167,44,.16)}
.mc-btn{background:linear-gradient(135deg,#bef264,#65a30d);color:#14260a}.mc-btn:hover{filter:brightness(1.05)}
.mc-cta{background:linear-gradient(135deg,#365314,#3f6212 55%,#7c5a06)}
.mc-grid{background-image:linear-gradient(rgba(163,230,53,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(163,230,53,.08) 1px,transparent 1px);background-size:36px 36px}
.mc-sweep{animation:mcsweep 3.6s cubic-bezier(.6,.1,.4,.9) infinite}@keyframes mcsweep{0%{transform:translateY(40px)}50%{transform:translateY(300px)}100%{transform:translateY(40px)}}
.mc-spin{transform-origin:210px 180px;animation:mcspin 40s linear infinite}@keyframes mcspin{to{transform:rotate(360deg)}}
.mc-rail{background:linear-gradient(90deg,var(--mc-lime-ink),var(--accent-imaging-gold),var(--line));background-size:200% 100%;animation:mcrail 5s ease-in-out infinite}@keyframes mcrail{0%,100%{background-position:100% 0}50%{background-position:0 0}}
.mc-node{animation:mcnode 3s ease-in-out infinite}@keyframes mcnode{0%,10%{box-shadow:0 0 0 0 rgba(163,230,53,.5)}5%{box-shadow:0 0 0 10px rgba(163,230,53,.25)}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion: reduce){.mc-sweep,.mc-spin,.mc-rail,.mc-node{animation:none}}
`;
