/**
 * Nursery & Newborn Care (D-95) — public page /hms/site/nursery (NICU at #nicu). English + Urdu (RTL), light + dark.
 * Reuses the site's hero, eyebrow pills, glass cards, stat strip, DoctorCard (live booking data), Reveal and CTA band; the nursery
 * accent is only a soft cream / powder-blue / blush tint (no gendered colours). No baby names, photos or medical data here.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Baby, BadgeCheck, Bed, CalendarCheck, Camera, ChevronDown, Droplets, Ear, HandHeart, HeartPulse, Lock, MapPin, Milk, Phone,
  ScanFace, ShieldCheck, Siren, Sparkles, Stethoscope, Sun, Syringe, Thermometer, Users, Wind, type LucideIcon,
} from "lucide-react";
import { CONFIG, PHOTOS } from "../content";
import { phoneOf, rs, tel, useDoctors } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, Counter, DoctorCard, Eyebrow, Reveal, SectionHead, Skeleton, useJsonLd, useTitle } from "../ui";
import { NURSERY, PACKAGE_PRICES, useNurseryFacts } from "../nursery";
import { UnitArt } from "../NurseryArt";

const UNIT_ICON: Record<string, LucideIcon> = { nursery: Bed, rooming: HandHeart, nicu: HeartPulse, scbu: Thermometer, kmc: Baby, feed: Milk };
const SERVICE_ICON: LucideIcon[] = [Stethoscope, BadgeCheck, Droplets, Syringe, Ear, Sun, Wind, Milk, Sparkles];
const SAFETY_ICON: LucideIcon[] = [ScanFace, Lock, ShieldCheck, Camera, HandHeart];
const STEP_ICON: LucideIcon[] = [Baby, HeartPulse, Stethoscope, Bed, Syringe, Thermometer, Users, BadgeCheck, ShieldCheck, CalendarCheck];

export default function Nursery() {
  const { lang, phone, ui } = useS2();
  const T = NURSERY[lang];
  useTitle(NURSERY.en.title, NURSERY.en.metaDesc);
  const facts = useNurseryFacts();
  const [opts, done] = useDoctors();
  const nicuPhone = phoneOf("nicu", phone);
  const er = phoneOf("emergency", phone);
  const team = useMemo(() => (opts?.doctors ?? []).filter((d) => /paediatric|pediatric|neonat|gyna|obstet/i.test(d.specialization ?? "")), [opts]);
  const gyn = team.find((d) => /gyna|obstet/i.test(d.specialization ?? ""));
  const bookMaternity = gyn ? `/hms/book-appointment?doctor=${encodeURIComponent(gyn.name)}` : "/hms/book-appointment";
  const priceOf = (k: string) => (k === "nicuDay" ? facts?.rates.nicu : k === "roomDay" ? facts?.rates.rooming : undefined) || PACKAGE_PRICES[k as keyof typeof PACKAGE_PRICES];
  useJsonLd({ "@context": "https://schema.org", "@type": "MedicalClinic", name: "Nursery & Newborn Care — Lyallpur Medical Complex", medicalSpecialty: "Pediatric",
    availableService: NURSERY.en.serviceList.map(([n, d]) => ({ "@type": "MedicalProcedure", name: n, description: d })) });
  useJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: NURSERY.en.faqList.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

  return (
    <div className="nz">
      <style>{NZ_CSS}</style>
      {/* ------------------------------------------------ hero */}
      <section className="relative overflow-hidden bg-[var(--hero)] text-white">
        <img src={PHOTOS.room} alt="" className="s2-kenburns absolute inset-0 h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--hero)] via-[color-mix(in_srgb,var(--hero)_88%,transparent)] to-[color-mix(in_srgb,var(--hero2)_55%,transparent)] rtl:bg-gradient-to-l" />
        <div className="pointer-events-none absolute -bottom-32 -end-24 h-[460px] w-[460px] rounded-full bg-[#CFE6F7]/15 blur-3xl" />
        <div className="pointer-events-none absolute -top-24 start-1/3 h-72 w-72 rounded-full bg-[#F7D6DA]/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <Reveal><Eyebrow light>{T.hero.eyebrow}</Eyebrow></Reveal>
            <Reveal delay={80}><h1 className="s2-display text-[2.6rem] leading-[1.06] sm:text-[3.9rem]">{T.hero.h1a}<br /><span className="text-[#F3DCC8]">{T.hero.h1b}</span></h1></Reveal>
            <Reveal delay={160}><p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">{T.hero.sub}</p></Reveal>
            <Reveal delay={240} className="mt-9 flex flex-wrap gap-3">
              <a href={bookMaternity} className={btn.teal}><CalendarCheck className="h-5 w-5" />{T.hero.book}</a>
              <a href="#team" className={btn.glass}><Stethoscope className="h-5 w-5" />{T.hero.find}</a>
              {nicuPhone && <a href={tel(nicuPhone)} className={btn.primary}><Phone className="h-5 w-5" />{T.hero.helpline}<span dir="ltr" className="hidden sm:inline">· {nicuPhone}</span></a>}
            </Reveal>
          </div>
          <Reveal delay={200} className="hidden justify-self-center lg:block"><CradleArt /></Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ stat strip */}
      <section className="relative z-10 -mt-10">
        <Wrap>
          <div className="s2-glass grid grid-cols-2 gap-px overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--line)] shadow-[0_30px_60px_-34px_rgba(8,48,58,0.55)] backdrop-blur-xl lg:grid-cols-4">
            {([[HeartPulse, facts?.units.nicu, T.stats.nicu], [Bed, facts?.units.nursery, T.stats.nursery], [Users, facts?.staff, T.stats.staff], [Siren, "24/7", T.stats.cover]] as [LucideIcon, number | string | undefined, string][]).map(([I, v, l], i) => (
              <Reveal key={l} delay={i * 60} className="bg-[var(--surface)] p-5 text-center sm:p-6">
                <I className="mx-auto h-6 w-6 text-[var(--accent)]" />
                <div className="s2-num mt-2 text-[2rem] font-semibold leading-none text-[var(--primary)]">{typeof v === "number" ? <Counter to={v} /> : v ?? "—"}</div>
                <div className="mt-1.5 text-[13px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">{l}</div>
              </Reveal>))}
          </div>
          <p className="mt-2 text-center text-[11px] text-[var(--muted)]">{T.placeholder}</p>
        </Wrap>
      </section>

      {/* ------------------------------------------------ care units */}
      <section className="nz-tint py-24" id="units">
        <Wrap>
          <SectionHead eyebrow={T.units[0]} title={T.units[1]} sub={T.units[2]} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {T.unitList.map(([t, d, k], i) => { const I = UNIT_ICON[k]; return (
              <Reveal key={k} delay={(i % 3) * 70} className={`${card} group overflow-hidden`}>
                <div id={k === "nicu" ? "nicu" : undefined} className="scroll-mt-28"><UnitArt kind={k} /></div>
                <div className="p-6">
                  <span className="-mt-12 relative grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent)] text-white shadow-[0_12px_24px_-10px_var(--accent)] transition duration-300 group-hover:-rotate-6 group-hover:scale-110"><I className="h-6 w-6" /></span>
                  <h3 className="mt-4 text-lg font-bold">{t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{d}</p>
                  {k === "rooming" && <Link to="/site/rooms#mother-baby" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">{ui.nav.rooms}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>}
                </div>
              </Reveal>); })}
          </div>
        </Wrap>
      </section>

      {/* ------------------------------------------------ newborn services */}
      <section className="py-24" id="services">
        <Wrap>
          <SectionHead eyebrow={T.services[0]} title={T.services[1]} sub={T.services[2]} center />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {T.serviceList.map(([t, d], i) => { const I = SERVICE_ICON[i] ?? Sparkles; return (
              <Reveal key={t} delay={(i % 3) * 60} className="nz-glass group flex gap-4 rounded-[22px] border border-[var(--line)] p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-30px_rgba(14,46,56,0.55)]">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent)]/12 text-[var(--accent)] transition group-hover:bg-[var(--accent)] group-hover:text-white"><I className="h-5 w-5" /></span>
                <div><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{d}</p></div>
              </Reveal>); })}
          </div>
        </Wrap>
      </section>

      {/* ------------------------------------------------ journey timeline */}
      <section className="nz-tint py-24" id="journey">
        <Wrap>
          <SectionHead eyebrow={T.journey[0]} title={T.journey[1]} sub={T.journey[2]} center />
          <ol className="relative grid md:grid-cols-5 md:gap-x-5 md:gap-y-12">
            <span aria-hidden className="absolute bottom-6 start-[22px] top-6 w-[2px] rounded bg-gradient-to-b from-[var(--primary)] via-[#9CC7E6] to-[var(--accent)] md:hidden" />
            {T.steps.map(([t, d], i) => { const I = STEP_ICON[i] ?? Baby; return (
              <Reveal as="li" key={t} delay={i * 80} className="nz-step relative flex gap-4 pb-8 md:block md:pb-0">
                <div className="relative z-10 flex items-center md:mb-4">
                  <span className="nz-node grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full border-2 border-[var(--primary)] bg-[var(--surface)] text-[var(--primary)]" style={{ animationDelay: `${i * 0.5}s` }}><I className="h-5 w-5" /></span>
                  {i < T.steps.length - 1 && i !== 4 && <span aria-hidden className="nz-rail ms-2 hidden h-[2px] flex-1 rounded md:block" />}
                </div>
                <div className="min-w-0 pt-1 md:pt-0">
                  <div className="s2-num text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">{String(i + 1).padStart(2, "0")}</div>
                  <h3 className="font-bold leading-snug">{t}</h3><p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{d}</p>
                </div>
              </Reveal>); })}
          </ol>
        </Wrap>
      </section>

      {/* ------------------------------------------------ safety + visiting */}
      <section className="relative overflow-hidden bg-[var(--hero)] py-24 text-white">
        <div className="pointer-events-none absolute -end-32 top-10 h-96 w-96 rounded-full bg-[#CFE6F7]/10 blur-3xl" />
        <Wrap className="relative grid gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <SectionHead light eyebrow={T.safety[0]} title={T.safety[1]} sub={T.safety[2]} />
            <div className="grid gap-4 sm:grid-cols-2">
              {T.safetyList.map(([t, d], i) => { const I = SAFETY_ICON[i] ?? ShieldCheck; return (
                <Reveal key={t} delay={i * 60} className={`group rounded-[22px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur transition hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--hero-accent)_40%,transparent)] ${i === 4 ? "sm:col-span-2" : ""}`}>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#E5483F] text-white"><I className="h-5 w-5" /></span>
                  <h3 className="mt-3 font-bold">{t}</h3><p className="mt-1 text-sm leading-relaxed text-white/70">{d}</p>
                </Reveal>); })}
            </div>
          </div>
          <div id="visiting" className="scroll-mt-28">
            <SectionHead light eyebrow={T.visiting[0]} title={T.visiting[1]} sub={T.visiting[2]} />
            <ul className="space-y-3">{T.visitList.map(([t, d], i) => (
              <Reveal as="li" key={t} delay={i * 60} className="rounded-[20px] border border-white/10 bg-white/[0.05] p-5"><h3 className="font-bold text-[#F3DCC8]">{t}</h3><p className="mt-1 text-sm leading-relaxed text-white/75">{d}</p></Reveal>))}</ul>
          </div>
        </Wrap>
      </section>

      {/* ------------------------------------------------ parent guide */}
      <section className="py-24" id="guide">
        <Wrap className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <SectionHead eyebrow={T.guide[0]} title={T.guide[1]} sub={T.guide[2]} />
            <Reveal className="-mt-4 overflow-hidden rounded-[24px] border-2 border-[var(--accent)]/40 bg-[var(--accent)]/[0.06] p-6">
              <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-white"><Siren className="h-5 w-5" /></span>
                <div><h3 className="font-bold text-[var(--accent)]">{T.danger.title}</h3>
                  <ul className="mt-3 space-y-1.5 text-[15px]">{T.danger.list.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />{x}</li>)}</ul>
                  {er && <a href={tel(er)} className={`${btn.primary} s2-pulse mt-5 px-5 py-3 text-sm`}><Phone className="h-4 w-4" />{T.danger.call} <span dir="ltr">· {er}</span></a>}</div></div>
            </Reveal>
          </div>
          <Accordion items={T.guideList.map(([t, lines]) => ({ title: t, body: <ul className="space-y-2">{lines.map((l) => <li key={l} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />{l}</li>)}</ul> }))} />
        </Wrap>
      </section>

      {/* ------------------------------------------------ packages */}
      <section className="nz-tint py-24" id="packages">
        <Wrap>
          <SectionHead eyebrow={T.packages[0]} title={T.packages[1]} sub={T.packages[2]} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {T.packageList.map(([t, d, k], i) => { const daily = k.endsWith("Day"); return (
              <Reveal key={k} delay={i * 70} className={`${card} flex flex-col p-6 ${i === 0 ? "ring-2 ring-[var(--primary)]/30" : ""}`}>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent)] text-white">{k === "nicuDay" ? <HeartPulse className="h-5 w-5" /> : k === "roomDay" ? <Bed className="h-5 w-5" /> : <Baby className="h-5 w-5" />}</span>
                <h3 className="mt-4 text-lg font-bold">{t}</h3><p className="mt-1 flex-1 text-sm leading-relaxed text-[var(--muted)]">{d}</p>
                {CONFIG.showPrices && <div className="mt-5"><span className="text-xs text-[var(--muted)]">{daily ? "" : T.from + " "}</span><span className="s2-num text-[1.8rem] font-semibold text-[var(--ink)]" dir="ltr">{rs(priceOf(k))}</span>
                  {daily && <span className="text-sm text-[var(--muted)]"> / {T.perDay}</span>}</div>}
                <Link to={`/site/contact?topic=${encodeURIComponent(NURSERY.en.packageList[i][0])}`} className={`${btn.ghost} mt-4 px-4 py-2.5 text-sm`}>{T.enquire}</Link>
              </Reveal>); })}
          </div>
        </Wrap>
      </section>

      {/* ------------------------------------------------ team (live) */}
      <section className="py-24" id="team">
        <Wrap>
          <SectionHead eyebrow={T.team[0]} title={T.team[1]} sub={T.team[2]} />
          {!done ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div> : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{team.map((d, i) => <Reveal key={d.name} delay={i * 70}><DoctorCard d={d} ur={lang === "ur"} labels={ui.common} /></Reveal>)}</div>)}
        </Wrap>
      </section>

      {/* ------------------------------------------------ FAQ + where */}
      <section className="nz-tint py-24" id="faq">
        <Wrap className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div><SectionHead eyebrow={T.faq[0]} title={T.faq[1]} /><Accordion items={T.faqList.map(([q, a]) => ({ title: q, body: <p>{a}</p> }))} /></div>
          <div className="space-y-5">
            <Reveal className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[var(--btn-from)] to-[var(--hero)] p-8 text-white">
              <div className="pointer-events-none absolute -end-14 -top-14 h-48 w-48 rounded-full border border-white/10" />
              <MapPin className="h-9 w-9 text-[#FF6B66]" /><h2 className="s2-display mt-4 text-3xl">{T.where.title}</h2><p className="mt-3 text-white/75">{T.where.text}</p>
              <div className="mt-6 flex flex-wrap gap-3"><Link to="/site/map?q=nursery" className={btn.glass}><MapPin className="h-4 w-4" />{T.where.map}</Link><Link to="/site/directions" className={btn.glass}>{T.where.dir}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></div>
            </Reveal>
            <Reveal delay={80} className={`${card} p-7`}><Baby className="h-8 w-8 text-[var(--accent)]" /><h3 className="mt-3 text-lg font-bold">{T.portal.title}</h3><p className="mt-1 text-[var(--muted)]">{T.portal.sub}</p>
              <Link to="/site/my-baby" className={`${btn.teal} mt-5 py-2.5 text-sm`}>{T.portal.go}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link></Reveal>
          </div>
        </Wrap>
      </section>

      {/* ------------------------------------------------ CTA band (as on the homepage) */}
      <section className="py-24">
        <Wrap>
          <Reveal className="relative overflow-hidden rounded-[30px] bg-[var(--primary)] px-6 py-14 text-center text-white sm:px-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_260px_at_10%_0%,rgba(255,255,255,0.18),transparent_60%),radial-gradient(500px_260px_at_100%_100%,rgba(229,72,63,0.35),transparent_60%)]" />
            <h2 className="s2-display relative text-[2.2rem] sm:text-[3rem]">{T.cta.title}</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-white/80">{T.cta.sub}</p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <a href={bookMaternity} className={btn.primary}><CalendarCheck className="h-5 w-5" />{T.cta.book}</a>
              {phone && <a href={tel(phone)} className={btn.glass}><Phone className="h-5 w-5" />{T.cta.call}</a>}
            </div>
          </Reveal>
        </Wrap>
      </section>
    </div>
  );
}

function Accordion({ items }: { items: { title: string; body: React.ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-3">{items.map((it, i) => { const on = open === i; return (
      <Reveal key={it.title} delay={i * 40} className={`overflow-hidden rounded-[20px] border bg-[var(--surface)] transition ${on ? "border-[var(--primary)] shadow-[0_20px_40px_-28px_rgba(14,94,111,0.6)]" : "border-[var(--line)]"}`}>
        <h3><button type="button" onClick={() => setOpen(on ? null : i)} aria-expanded={on} className="flex w-full items-center gap-3 px-5 py-4 text-start text-[16px] font-bold">
          <span className="flex-1">{it.title}</span><ChevronDown className={`h-5 w-5 shrink-0 text-[var(--muted)] transition ${on ? "rotate-180 text-[var(--primary)]" : ""}`} /></button></h3>
        <div className={`grid transition-all duration-300 ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}><div className="overflow-hidden"><div className="px-5 pb-5 text-[15px] leading-relaxed text-[var(--ink2)]">{it.body}</div></div></div>
      </Reveal>); })}</div>
  );
}

/** Hero illustration: a cradle under a soft moon with drifting stars and a calm heartbeat line. */
function CradleArt() {
  return (
    <div aria-hidden className="relative h-[420px] w-[420px]">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(207,230,247,0.28),transparent_65%)]" />
      <div className="s2-float absolute inset-10 overflow-hidden rounded-[40px] border border-white/15 bg-white/[0.06] backdrop-blur">
        <svg viewBox="0 0 340 340" className="h-full w-full">
          <defs><linearGradient id="nzsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0E5E6F" stopOpacity=".2" /><stop offset="1" stopColor="#F3DCC8" stopOpacity=".18" /></linearGradient></defs>
          <rect width="340" height="340" fill="url(#nzsky)" />
          <circle cx="250" cy="80" r="34" fill="#F3DCC8" opacity=".9" /><circle cx="264" cy="70" r="30" fill="#0B4552" opacity=".55" />
          <g className="nz-twinkle" fill="#fff">{[[60, 60], [110, 40], [180, 70], [300, 140], [40, 150], [150, 110]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 2 : 3} />)}</g>
          <g transform="translate(70 170)"><g className="nz-rock">
            <path d="M0 40 Q100 140 200 40" fill="#F6EEE3" opacity=".95" /><path d="M0 40 h200" stroke="#CFE6F7" strokeWidth="6" strokeLinecap="round" />
            <path d="M20 30 Q100 -40 180 30" fill="none" stroke="#CFE6F7" strokeWidth="5" opacity=".8" /><circle cx="100" cy="46" r="16" fill="#F3DCC8" /><path d="M70 62 Q100 80 130 62" stroke="#F7D6DA" strokeWidth="10" strokeLinecap="round" fill="none" />
          </g></g>
          <path className="nz-ecg" d="M30 300 h90 l10 -18 l12 30 l10 -22 l8 10 h150" stroke="#FF8A84" strokeWidth="2.5" fill="none" />
        </svg>
      </div>
      <div className="absolute end-0 top-14 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white shadow-xl backdrop-blur-xl"><div className="text-[10px] font-semibold tracking-[0.2em] text-white/60">ID BAND</div>
        <div className="mt-0.5 flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-[var(--hero-accent)]" />Mother ↔ baby matched</div></div>
      <div className="absolute bottom-6 start-0 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white shadow-xl backdrop-blur-xl"><div className="text-[10px] font-semibold tracking-[0.2em] text-white/60">APGAR · 5 MIN</div>
        <div className="mt-0.5 flex items-center gap-2 text-sm font-bold"><HeartPulse className="h-4 w-4 text-[#FF8A84]" />Paediatrician at birth</div></div>
    </div>
  );
}

const NZ_CSS = `
.nz{--nz-cream:#FBF6EF;--nz-blue:#EEF5FB;--nz-blush:#FBF0F1}
.s2-dark .nz{--nz-cream:#0B2129;--nz-blue:#0C2530;--nz-blush:#122129}
.nz-tint{background:linear-gradient(180deg,var(--nz-cream),var(--nz-blue) 60%,var(--nz-blush))}
.nz-glass{background:color-mix(in srgb,var(--surface) 78%,transparent);backdrop-filter:blur(10px)}
.nz-art{background:linear-gradient(135deg,var(--a),var(--b))}
.s2-dark .nz-art{filter:saturate(.85) brightness(.68)}
.nz-twinkle circle{animation:nztw 4.5s ease-in-out infinite}.nz-twinkle circle:nth-child(2n){animation-delay:-2s}
@keyframes nztw{0%,100%{opacity:.25}50%{opacity:.95}}
.nz-rock{transform-box:fill-box;transform-origin:50% 20%;animation:nzrock 6s ease-in-out infinite}@keyframes nzrock{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
.nz-ecg{stroke-dasharray:320;stroke-dashoffset:320;animation:nzecg 4s linear infinite}@keyframes nzecg{to{stroke-dashoffset:0}}
.nz-rail{background:linear-gradient(90deg,var(--primary),#9CC7E6,var(--line));background-size:200% 100%;animation:nzrail 6s ease-in-out infinite}@keyframes nzrail{0%,100%{background-position:100% 0}50%{background-position:0 0}}
.nz-node{transition:transform .3s,background .3s,color .3s;animation:nznode 5s ease-in-out infinite}
@keyframes nznode{0%,10%{box-shadow:0 0 0 0 var(--primary-ring)}5%{box-shadow:0 0 0 9px var(--primary-ring)}100%{box-shadow:0 0 0 0 transparent}}
.nz-step:hover .nz-node{background:var(--primary);color:#fff;transform:scale(1.06)}
@media (prefers-reduced-motion: reduce){.nz-twinkle circle,.nz-rock,.nz-ecg,.nz-rail,.nz-node{animation:none}.nz-ecg{stroke-dashoffset:0}}
`;
