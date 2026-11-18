import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck, ChevronLeft, ChevronRight, MapPin, Phone, Pill, Siren, Stethoscope, UserRound, Building2, Quote, BedDouble, Layers } from "lucide-react";
import { ARTICLES, CONFIG, DEPARTMENTS, PHOTOS, SERVICES } from "../content";
import ServiceGlobe from "../ServiceGlobe";
import DeptOrbit from "../DeptOrbit";
import { phoneOf, tel, useDoctors } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, Counter, DoctorCard, Eyebrow, ICONS, reduced, Reveal, SectionHead, Skeleton, useJsonLd, useTitle, WordReveal } from "../ui";

export default function Home() {
  const { ui, lang, site, phone } = useS2();
  useTitle(lang === "ur" ? ui.name : "Compassionate care, advanced medicine", "Lyallpur Medical Complex, People's Colony No 1, Faisalabad — consultants, 24/7 emergency, MRI, CT, laboratory, surgery and private rooms. Book an appointment online.");
  useJsonLd(site ? { "@context": "https://schema.org", "@type": ["Hospital", "MedicalOrganization"], name: ui.name, alternateName: "لائل پور میڈیکل کمپلیکس",
    url: `${location.origin}/hms/site`, image: `${location.origin}${PHOTOS.building}`, telephone: site.clinic.phone,
    address: { "@type": "PostalAddress", streetAddress: site.clinic.address, addressLocality: "Faisalabad", addressRegion: "Punjab", addressCountry: "PK" },
    medicalSpecialty: DEPARTMENTS.map((d) => d.name), availableService: ["Emergency", "MRI", "CT scan", "Laboratory", "Dialysis", "Surgery"] } : null);
  return (
    <>
      <Hero />
      <Quick />
      <Stats />
      <Departments />
      <ServicesOrbit />
      <DoctorsRail />
      <Tour />
      {CONFIG.testimonials.length > 0 && <Testimonials />}
      <News />
      <section className="pb-24">
        <Wrap>
          <Reveal className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0E5E6F] to-[#08303A] p-10 text-white sm:p-14">
            <img src={PHOTOS.lounge} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" loading="lazy" />
            <div className="relative flex flex-wrap items-center justify-between gap-8">
              <div className="max-w-xl"><h2 className="s2-display text-[2.2rem] leading-tight sm:text-[2.8rem]">{ui.cta.title}</h2><p className="mt-3 text-white/75">{ui.cta.sub}</p></div>
              <div className="flex flex-wrap gap-3"><a href="/hms/book-appointment" className={btn.primary}><CalendarCheck className="h-5 w-5" />{ui.cta.book}</a>
                {phone && <a href={tel(phone)} className={btn.glass}><Phone className="h-5 w-5" /><span dir="ltr">{phone}</span></a>}</div>
            </div>
          </Reveal>
        </Wrap>
      </section>
    </>
  );
}

function Hero() {
  const { ui, phone } = useS2();
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const f = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (img.current) img.current.style.transform = `translateY(${Math.min(window.scrollY, 700) * 0.18}px)`; }); };
    window.addEventListener("scroll", f, { passive: true });
    return () => { window.removeEventListener("scroll", f); cancelAnimationFrame(raf); };
  }, []);
  const er = phoneOf("emergency", phone);
  return (
    <section className="relative isolate overflow-hidden bg-[#08303A] text-white">
      {/* the building: full background on phones; the right ~60% on wide screens so the whole facade shows */}
      <div ref={img} className="absolute inset-y-0 end-0 -z-10 w-full will-change-transform lg:w-[62%]">
        <img src={PHOTOS.building} alt={ui.name} className="s2-kenburns h-[112%] w-full object-cover object-[70%_25%] lg:object-[50%_20%]" style={{ transformOrigin: "70% 30%" }} {...{ fetchpriority: "high" }} />
      </div>
      <div className="absolute inset-0 -z-10 bg-[#08303A]/70 lg:hidden" />
      <div className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-[#062229] from-[38%] via-[#08303A]/60 via-[55%] to-transparent lg:block rtl:bg-gradient-to-l" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[var(--bg)] to-transparent" />
      <Wrap className="flex min-h-[calc(100svh-124px)] flex-col justify-center pb-40 pt-16 lg:min-h-[720px]">
        <Reveal><Eyebrow light>{ui.hero.eyebrow}</Eyebrow></Reveal>
        <h1 className="s2-display max-w-3xl text-[2.9rem] leading-[1.02] sm:text-[4.6rem]"><WordReveal text={ui.hero.words} /></h1>
        <Reveal delay={500}><p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">{ui.hero.sub}</p></Reveal>
        <Reveal delay={650} className="mt-9 flex flex-wrap gap-3">
          <a href="/hms/book-appointment" className={btn.primary}><CalendarCheck className="h-5 w-5" />{ui.hero.book}</a>
          <Link to="/site/doctors" className={btn.glass}><UserRound className="h-5 w-5" />{ui.hero.find}</Link>
          {er && <a href={tel(er)} className={`${btn.glass} border-[#FF8A84]/50`}><Siren className="h-5 w-5 text-[#FF8A84]" />{ui.hero.emergency}: <span dir="ltr">{er}</span></a>}
        </Reveal>
      </Wrap>
    </section>
  );
}

function Quick() {
  const { ui } = useS2();
  const items: [typeof Stethoscope, string, boolean][] = [[Building2, "/site/departments", false], [Pill, "/site/pharmacy", false], [MapPin, "/site/directions", false], [Stethoscope, "/site/patients#portal", false]];
  return (
    <Wrap className="relative z-10 -mt-28">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ui.quick.map(([t, d], i) => { const [I, to] = items[i]; return (
          <Reveal key={t} delay={i * 70}>
            <Link to={to} className="group flex h-full flex-col gap-3 rounded-[22px] border border-white/40 s2-glass p-5 shadow-[0_24px_50px_-28px_rgba(8,48,58,0.55)] backdrop-blur-xl transition hover:-translate-y-1 dark:border-white/10">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent)] text-white shadow-[0_10px_22px_-10px_var(--accent)] transition group-hover:bg-[var(--primary)] group-hover:shadow-[0_10px_22px_-10px_var(--primary)]"><I className="h-5 w-5" /></span>
              <span><span className="block font-bold">{t}</span><span className="block text-sm text-[var(--muted)]">{d}</span></span>
            </Link>
          </Reveal>); })}
      </div>
    </Wrap>
  );
}

const STAT_ICONS = [BedDouble, Stethoscope, Building2, Layers];

function Stats() {
  const { ui, site } = useS2();
  const stats: [number, string][] = [[CONFIG.beds || site?.beds || 0, ui.stats.beds], [site?.doctors ?? 0, ui.stats.doctors], [DEPARTMENTS.length, ui.stats.departments], [8, ui.stats.floors]];
  return (
    <section className="py-16 sm:py-20">
      <Wrap>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
          {stats.map(([n, l], i) => { const I = STAT_ICONS[i]; return (
            <Reveal key={l} delay={i * 80}>
              <div className="group relative h-full overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] px-5 pb-7 pt-6 text-center shadow-[0_22px_48px_-30px_rgba(8,48,58,0.55)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-28px_rgba(8,48,58,0.6)] sm:px-6">
                <span aria-hidden className="absolute inset-x-0 top-0 z-[1] h-1 bg-gradient-to-r from-[var(--primary)] via-[var(--accent)] to-[var(--primary)]" />
                <span aria-hidden className="pointer-events-none absolute -end-10 -top-10 h-32 w-32 rounded-full bg-[var(--mint)] opacity-70 transition duration-500 group-hover:scale-125" />
                <span className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent)] text-white shadow-[0_10px_22px_-10px_var(--accent)]"><I className="h-6 w-6" /></span>
                <div className="s2-display relative mt-4 text-[2.6rem] leading-none text-[var(--primary)] sm:text-[3.2rem]">{site || i > 1 ? <Counter to={n} /> : <Skeleton className="mx-auto h-12 w-20" />}</div>
                <div className="relative mx-auto mt-3 h-0.5 w-8 rounded-full bg-[var(--accent)]" />
                <div className="relative mt-3 text-[13px] font-bold uppercase tracking-[0.16em] text-[var(--ink)] opacity-80">{l}</div>
              </div>
            </Reveal>); })}
        </div>
      </Wrap>
    </section>
  );
}

/** Departments on a dark panel, laid out like the Departments page hero: copy and every department as a link on the left,
 *  the logo with departments orbiting on the right (lg). */
function Departments() {
  const { ui } = useS2();
  const [e, t, s] = ui.sections.depts;
  return (
    <section className="pb-24">
      <Wrap>
        <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-bl from-[#0E5E6F] via-[#08303A] to-[#062229] px-6 py-12 text-white sm:px-12 lg:py-6">
          <span aria-hidden className="absolute -end-24 -top-24 h-72 w-72 rounded-full bg-[#FF6B66]/10 blur-3xl" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div className="lg:py-10">
              <Reveal><Eyebrow light>{e}</Eyebrow></Reveal>
              <Reveal delay={80}><h2 className="s2-display max-w-xl text-[2.2rem] leading-[1.08] sm:text-[3rem]">{t}</h2></Reveal>
              <Reveal delay={140}><p className="mt-4 max-w-lg text-[17px] leading-relaxed text-white/75">{s}</p></Reveal>
              <Reveal delay={200}><ul className="mt-7 flex max-w-xl flex-wrap gap-2">
                {DEPARTMENTS.map((d) => { const I = ICONS[d.icon] ?? Stethoscope; return (
                  <li key={d.slug}><Link to={`/site/departments/${d.slug}`} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-2 text-sm font-medium text-white/90 backdrop-blur transition hover:border-[#FF6B66]/70 hover:bg-white/15">
                    <I className="h-4 w-4 text-[#FF8A85]" />{d.name.replace(/ \(.*\)$/, "")}</Link></li>); })}
              </ul></Reveal>
              <Reveal delay={260}><Link to="/site/departments" className={`${btn.primary} mt-8`}>{ui.nav.all}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Reveal>
            </div>
            <Reveal delay={150} className="hidden lg:block"><DeptOrbit /></Reveal>
          </div>
        </div>
      </Wrap>
    </section>
  );
}

/** Services on a dark panel, mirrored from Departments above: the logo globe with services orbiting on the left (lg), copy and links on the right. */
function ServicesOrbit() {
  const { ui } = useS2();
  const [e, t, s] = ui.sections.services;
  return (
    <section className="pb-24">
      <Wrap>
        <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#0E5E6F] via-[#08303A] to-[#062229] px-6 py-12 text-white sm:px-12 lg:py-6">
          <span aria-hidden className="absolute -start-24 -top-24 h-72 w-72 rounded-full bg-[#9FE3DA]/10 blur-3xl" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[auto_1fr]">
            <Reveal delay={150} className="hidden lg:block"><ServiceGlobe base="/site/services#" /></Reveal>
            <div className="lg:py-10">
              <Reveal><Eyebrow light>{e}</Eyebrow></Reveal>
              <Reveal delay={80}><h2 className="s2-display max-w-xl text-[2.2rem] leading-[1.08] sm:text-[3rem]">{t}</h2></Reveal>
              <Reveal delay={140}><p className="mt-4 max-w-lg text-[17px] leading-relaxed text-white/75">{s}</p></Reveal>
              <Reveal delay={200}><ul className="mt-7 flex max-w-xl flex-wrap gap-2">
                {SERVICES.map((sv) => { const I = ICONS[sv.icon] ?? Stethoscope; return (
                  <li key={sv.id}><Link to={`/site/services#${sv.id}`} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-2 text-sm font-medium text-white/90 backdrop-blur transition hover:border-[#9FE3DA]/60 hover:bg-white/15">
                    <I className="h-4 w-4 text-[#9FE3DA]" />{sv.title}</Link></li>); })}
              </ul></Reveal>
              <Reveal delay={260}><Link to="/site/services" className={`${btn.primary} mt-8`}>{ui.nav.all}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Reveal>
            </div>
          </div>
        </div>
      </Wrap>
    </section>
  );
}

function DoctorsRail() {
  const { ui, lang } = useS2();
  const [opts, done] = useDoctors();
  const rail = useRef<HTMLDivElement>(null);
  const [e, t, s] = ui.sections.doctors;
  const by = (dir: number) => rail.current?.scrollBy({ left: dir * (lang === "ur" ? -1 : 1) * 340, behavior: reduced() ? "auto" : "smooth" });
  return (
    <section className="bg-[var(--soft)] py-24">
      <Wrap>
        <SectionHead eyebrow={e} title={t} sub={s} action={<div className="flex gap-2">
          <button type="button" onClick={() => by(-1)} aria-label="Previous" className="grid h-11 w-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--primary)]"><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></button>
          <button type="button" onClick={() => by(1)} aria-label="Next" className="grid h-11 w-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--primary)]"><ChevronRight className="h-5 w-5 rtl:rotate-180" /></button>
          <Link to="/site/doctors" className={btn.ghost}>{ui.nav.all}</Link></div>} />
        <div ref={rail} className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] sm:-mx-6 sm:px-6">
          {!done ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[300px] w-[300px] shrink-0" />)
            : (opts?.doctors ?? []).map((d) => <div key={d.name} className="w-[300px] shrink-0 snap-start"><DoctorCard d={d} ur={lang === "ur"} labels={{ book: ui.common.book, today: ui.common.today, next: ui.common.next, fee: ui.common.fee, profile: ui.common.profile }} /></div>)}
        </div>
      </Wrap>
    </section>
  );
}

function Tour() {
  const { ui } = useS2();
  const [e, t, s] = ui.sections.tour;
  const shots: [string, string, string][] = [[PHOTOS.reception, "Reception", "lg:col-span-2 lg:row-span-2"], [PHOTOS.lounge, "Waiting lounge", ""], [PHOTOS.room, "Private room", ""], [PHOTOS.icu, "Intensive care", ""], [PHOTOS.pharmacy, "Pharmacy", ""]];
  return (
    <section className="py-24">
      <Wrap>
        <SectionHead eyebrow={e} title={t} sub={s} action={<Link to="/site/about#tour" className={btn.ghost}>{ui.nav.all}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>} />
        <div className="grid auto-rows-[200px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shots.map(([src, label, span], i) => (
            <Reveal key={label} delay={i * 60} className={`group relative overflow-hidden rounded-[24px] ${span}`}>
              <img src={src} alt={label} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#08303A]/80 via-transparent to-transparent" />
              <span className="absolute bottom-4 start-4 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-md">{label}</span>
            </Reveal>
          ))}
        </div>
      </Wrap>
    </section>
  );
}

function Testimonials() {
  const { ui } = useS2();
  const [i, setI] = useState(0);
  const list = CONFIG.testimonials;
  useEffect(() => { if (reduced() || list.length < 2) return; const t = setInterval(() => setI((x) => (x + 1) % list.length), 7000); return () => clearInterval(t); }, [list.length]);
  const q = list[i];
  const [e, t] = ui.sections.testimonials;
  return (
    <section className="bg-[var(--soft)] py-24"><Wrap><SectionHead eyebrow={e} title={t} center />
      <Reveal className="mx-auto max-w-3xl text-center"><Quote className="mx-auto h-10 w-10 text-[var(--accent)]" /><p className="s2-display mt-6 text-2xl leading-relaxed">“{q.quote}”</p>
        <div className="mt-6 font-bold">{q.name}</div>{q.detail && <div className="text-sm text-[var(--muted)]">{q.detail}</div>}
        <div className="mt-6 flex justify-center gap-2">{list.map((_, k) => <button key={k} type="button" aria-label={`Story ${k + 1}`} onClick={() => setI(k)} className={`h-2 rounded-full transition-all ${k === i ? "w-8 bg-[var(--primary)]" : "w-2 bg-[var(--line)]"}`} />)}</div></Reveal>
    </Wrap></section>
  );
}

function News() {
  const { ui } = useS2();
  const [e, t, s] = ui.sections.news;
  return (
    <section className="pb-24">
      <Wrap>
        <SectionHead eyebrow={e} title={t} sub={s} action={<Link to="/site/news" className={btn.ghost}>{ui.nav.all}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>} />
        <div className="grid gap-5 md:grid-cols-3">
          {ARTICLES.slice(0, 3).map((a, i) => (
            <Reveal key={a.slug} delay={i * 80}>
              <Link to={`/site/news/${a.slug}`} className={`${card} group flex h-full flex-col overflow-hidden`}>
                <div className="h-44 overflow-hidden"><img src={a.img} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></div>
                <div className="flex flex-1 flex-col p-6"><span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">{a.tag} · {a.minutes} min read</span>
                  <h3 className="s2-display mt-2 text-[1.35rem] leading-snug">{a.title}</h3><p className="mt-2 flex-1 text-sm text-[var(--muted)]">{a.excerpt}</p></div>
              </Link>
            </Reveal>
          ))}
        </div>
      </Wrap>
    </section>
  );
}
