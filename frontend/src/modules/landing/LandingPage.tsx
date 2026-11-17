/**
 * Lyallpur Medical Complex public website (/hms/vvsdesk, public, D-75). One page: header, hero, quick actions, about, services,
 * facilities gallery, doctors (live from the Doctor records), patients & visitors, booking call-to-action, contact, footer.
 * Look: elegant — ivory page, deep navy, the logo's teal-blue (#2B6E85) and red (#E5322F) as accents, Cormorant Garamond
 * headings, Inter body, Noto Nastaliq for اردو. Name, address and phone come from Clinic Settings; copy is in content.ts.
 * The app's automatic translator skips this folder (own language toggle).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Accessibility, Activity, Ambulance, ArrowRight, Baby, BadgeCheck, BedDouble, Bone, Brain, CalendarCheck, CalendarDays, ClipboardList, Clock3, DoorOpen, Droplet, Droplets, Ear, FileText, FlaskConical, HeartPulse, Languages, LogIn, Magnet, Mail, MapPin, Menu, Navigation, Microscope, Phone, Pill, ScanLine, ScanSearch, Scissors, ShieldCheck, Siren, Sparkles, Stethoscope, TestTubes, UserRound, Users, Waves, X, type LucideIcon } from "lucide-react";
import { COPY, CONFIG, type Copy, type Lang } from "./content";
import { Wordmark } from "@/components/brand";
import { getCall } from "@/services/frappe";

const BRAND = (f: string) => `${import.meta.env.BASE_URL}brand/${f}`;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const hasWa = !/x/i.test(CONFIG.whatsapp) && CONFIG.whatsapp.length >= 10;
const tel = (p?: string) => `tel:${(p ?? "").replace(/[^\d+]/g, "")}`;

interface Doctor { name: string; doctor_name: string; doctor_name_ur?: string; specialization?: string; default_fee?: number; photo?: string; qualification?: string;
  color?: string; consultation_room?: string; next_date?: string | null; days: { day: string; from: string; to: string }[] }
interface Opts { clinic: { name: string; name_ur?: string; phone?: string; address?: string }; specializations: { name: string; name_ur?: string }[]; doctors: Doctor[] }

// ---------------------------------------------------------------- building blocks
function WaIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.04c-.24.69-1.42 1.32-1.96 1.4-.5.08-1.13.11-1.82-.11a16.7 16.7 0 0 1-1.65-.61c-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.58.82 2.01.89 2.16.07.14.12.31.02.5-.1.19-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.59.17.29.74 1.22 1.59 1.98 1.09.97 2.01 1.27 2.3 1.41.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.65-.14.27.1 1.68.79 1.97.94.29.14.48.21.55.33.07.12.07.69-.17 1.38Z" />
    </svg>
  );
}

/** Fade-up once in view (off with reduced motion). */
function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(reduced());
  useEffect(() => {
    if (on || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [on]);
  return (
    <div ref={ref} style={{ transitionDelay: on ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${on ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}>{children}</div>
  );
}

function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`mb-4 flex items-center gap-3 text-[13px] font-semibold uppercase tracking-[0.22em] ${light ? "text-[#8FCBE0]" : "text-[#2B6E85]"}`}>
      <span className={`h-px w-8 ${light ? "bg-[#8FCBE0]/60" : "bg-[#E5322F]"}`} />{children}
    </p>
  );
}
function H2({ children, light, center }: { children: ReactNode; light?: boolean; center?: boolean }) {
  return <h2 className={`hd text-[2.3rem] font-semibold leading-[1.08] sm:text-[3.1rem] ${light ? "text-white" : "text-[#0C2431]"} ${center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}`}>{children}</h2>;
}
/** Section title in the logo's style: condensed capitals, logo red, the last words in logo teal-blue, red → teal underline. */
function BrandTitle({ text, className = "", light }: { text: string; className?: string; light?: boolean }) {
  const w = text.split(" ");
  const k = Math.max(1, w.length - 2);
  return (
    <>
      <h2 className={`svc max-w-xl text-[2.4rem] font-semibold uppercase leading-[1.08] tracking-[0.02em] sm:text-[3.2rem] ${className}`}>
        <span className={light ? "text-[#FF5A55]" : "text-[#E5322F]"}>{w.slice(0, k).join(" ")}</span>{w.length > 1 && <> <span className={`whitespace-nowrap ${light ? "text-[#8FCBE0]" : "text-[#2B6E85]"}`}>{w.slice(k).join(" ")}</span></>}
      </h2>
      <span className="mt-5 block h-1 w-16 rounded-full bg-gradient-to-r from-[#E5322F] to-[#2B6E85]" />
    </>
  );
}
const redBtn = "inline-flex items-center justify-center gap-2 rounded-full bg-[#D92F2C] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_30px_-14px_rgba(217,47,44,0.9)] transition hover:-translate-y-0.5 hover:bg-[#C42825] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E5322F]/30";
const ghostBtn = "inline-flex items-center justify-center gap-2 rounded-full border px-6 py-3.5 text-[15px] font-semibold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4";

// ---------------------------------------------------------------- data + SEO
function useHospital() {
  const [opts, setOpts] = useState<Opts | null>(null);
  useEffect(() => { void getCall<Opts>("hospital_vvs.api.appointments.public_options").then(setOpts).catch(() => setOpts(null)); }, []);
  return opts;
}

function useSeo(c: Copy, lang: Lang, h: Opts["clinic"] | undefined) {
  useEffect(() => {
    const prevTitle = document.title;
    const added: Element[] = [];
    document.title = c.meta.title;
    const meta = (attr: string, key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); added.push(el); }
      el.content = content;
    };
    const url = `${window.location.origin}/hms/vvsdesk`;
    meta("name", "description", c.meta.description);
    meta("property", "og:title", c.meta.title); meta("property", "og:description", c.meta.description); meta("property", "og:type", "website");
    meta("property", "og:url", url); meta("property", "og:image", `${window.location.origin}${BRAND("lyallpur-logo.webp")}`);
    const link = document.createElement("link"); link.rel = "canonical"; link.href = url; document.head.appendChild(link); added.push(link);
    const fonts = document.createElement("link"); fonts.rel = "stylesheet";
    fonts.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap";
    document.head.appendChild(fonts); added.push(fonts);
    const ld = document.createElement("script"); ld.type = "application/ld+json";
    ld.text = JSON.stringify({ "@context": "https://schema.org", "@type": "Hospital", name: COPY.en.name, alternateName: COPY.ur.name,
      description: COPY.en.meta.description, url, logo: `${window.location.origin}${BRAND("lyallpur-logo.webp")}`,
      ...(h?.phone ? { telephone: h.phone } : {}), ...(h?.address ? { address: { "@type": "PostalAddress", streetAddress: h.address, addressLocality: "Faisalabad", addressRegion: "Punjab", addressCountry: "PK" } } : {}) });
    document.head.appendChild(ld); added.push(ld);
    return () => { document.title = prevTitle; added.forEach((e) => e.remove()); };
  }, [c, lang, h]);
}

// ---------------------------------------------------------------- sections
function Header({ c, lang, setLang }: { c: Copy; lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 8); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  const links: [string, string][] = [["#services", c.nav.services], ["#departments", c.nav.departments], ["#doctors", c.nav.doctors], ["#patients", c.nav.patients], ["#about", c.nav.about], ["#contact", c.nav.contact]];
  return (
    <header className={`sticky top-0 z-40 transition-all ${scrolled ? "bg-white/90 shadow-[0_8px_30px_-18px_rgba(12,36,49,0.45)] backdrop-blur-xl" : "bg-[#FAF8F4]"}`}>
      <div className="mx-auto flex h-[76px] max-w-7xl items-center gap-4 px-4 sm:px-6">
        <a href="#top" className="flex min-w-0 items-center gap-3" aria-label={c.name}>
          <img src={BRAND("lyallpur-mark.webp")} alt="" className="h-12 w-12 shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[17px] font-bold tracking-wide text-[#0C2431]">{c.name}</span>
            <span className="block truncate text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#2B6E85]">{c.tagline}</span>
          </span>
        </a>
        <nav aria-label="Main" className="ms-auto hidden items-center gap-1 lg:flex">
          {links.map(([h, l]) => <a key={h} href={h} className="rounded-full px-3.5 py-2 text-[14.5px] font-medium text-[#0C2431]/75 transition hover:bg-[#2B6E85]/8 hover:text-[#0C2431]">{l}</a>)}
        </nav>
        <div className="ms-auto flex items-center gap-2 lg:ms-2">
          <button type="button" onClick={() => setLang(lang === "en" ? "ur" : "en")} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-[#0C2431]/80 hover:bg-[#2B6E85]/8" aria-label="Language">
            <Languages className="h-4 w-4" />{c.nav.lang}</button>
          <a href="/hms/book-appointment" className={`${redBtn} hidden px-5 py-2.5 text-sm sm:inline-flex`}><CalendarCheck className="h-4 w-4" />{c.nav.book}</a>
          <button type="button" onClick={() => setOpen(true)} className="rounded-full p-2.5 text-[#0C2431] hover:bg-[#2B6E85]/8 lg:hidden" aria-label={c.nav.menu}><Menu className="h-6 w-6" /></button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-[#0C2431]/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-y-0 end-0 w-[82%] max-w-sm bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between"><img src={BRAND("lyallpur-mark.webp")} alt="" className="h-11 w-11" />
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-[#0C2431]/5" aria-label={c.nav.close}><X className="h-6 w-6" /></button></div>
            <nav className="flex flex-col">{links.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)} className="border-b border-[#0C2431]/8 py-3.5 text-lg font-medium text-[#0C2431]">{l}</a>)}</nav>
            <a href="/hms/book-appointment" className={`${redBtn} mt-6 w-full`}><CalendarCheck className="h-4 w-4" />{c.nav.book}</a>
            <a href="/hms/login" className="mt-3 flex items-center justify-center gap-2 py-2 text-sm font-medium text-[#0C2431]/70"><LogIn className="h-4 w-4" />{c.nav.staff}</a>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero({ c, lang, opts, phone }: { c: Copy; lang: Lang; opts: Opts | null; phone?: string }) {
  const next = useMemo(() => (opts?.doctors ?? []).map((d) => d.next_date).filter(Boolean).sort()[0], [opts]);
  const fmt = (d?: string | null) => (d ? new Date(d + "T00:00").toLocaleDateString(lang === "ur" ? "ur-PK" : "en-PK", { weekday: "short", day: "numeric", month: "short" }) : "");
  const nextCard = (
    <div className="w-56 rounded-2xl border border-white/20 bg-[#0C2431]/70 p-4 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8FCBE0]"><CalendarDays className="h-4 w-4" />{next ? c.hero.cards.next : c.hero.cards.nextNone}</div>
      <div className="hd mt-1 text-2xl font-semibold">{next ? fmt(next) : c.nav.book}</div>
      <div className="text-xs text-white/65">{c.hero.cards.nextSub}</div>
    </div>
  );
  const erCard = phone && (
    <a href={tel(phone)} className="flex w-64 items-center gap-3 rounded-2xl bg-white p-3.5 text-[#0C2431] shadow-2xl transition hover:-translate-y-0.5">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#E5322F] text-white shadow-[0_10px_20px_-10px_rgba(229,50,47,0.9)]"><Siren className="h-5 w-5" /></span>
      <span className="min-w-0"><span className="block text-sm font-bold">{c.hero.cards.er} · 24/7</span><span className="block truncate text-xs text-[#0C2431]/60" dir="ltr">{phone}</span></span>
    </a>
  );
  return (
    <section id="top" className="relative overflow-hidden bg-[#0C2431] text-white">
      {/* the building behind the whole hero, every screen size; navy overlay keeps the text readable */}
      <div className="pointer-events-none absolute inset-0">
        <img src={BRAND("site/building.webp")} alt={c.hero.photo} className="h-full w-full object-cover object-[62%_30%] lg:object-[50%_30%]" {...{ fetchpriority: "high" }} />
        <div className="absolute inset-0 bg-[#0C2431]/75 lg:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-[#0C2431] via-[#0C2431]/80 to-[#0C2431]/10 lg:block rtl:bg-gradient-to-l" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#0C2431] to-transparent" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_520px_at_0%_0%,rgba(43,110,133,0.5),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:26px_26px] lg:w-1/2" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-32 pt-14 sm:px-6 lg:min-h-[640px] lg:grid-cols-[1fr_1fr] lg:pb-44 lg:pt-20">
        <div>
          <Reveal><Eyebrow light>{c.hero.eyebrow}</Eyebrow></Reveal>
          <Reveal delay={80}>
            <h1 className="hd text-[2.9rem] font-semibold leading-[1.02] sm:text-[4.2rem]">
              {c.hero.h1a}<br /><span className="bg-[linear-gradient(100deg,#FF6B66,#F2A28E_40%,#8FCBE0_75%)] bg-clip-text italic text-transparent">{c.hero.h1b}</span>
            </h1>
          </Reveal>
          <Reveal delay={160}><p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">{c.hero.sub}</p></Reveal>
          <Reveal delay={240} className="mt-9 flex flex-wrap gap-3">
            <a href="/hms/book-appointment" className={redBtn}><CalendarCheck className="h-5 w-5" />{c.hero.book}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></a>
            {phone && <a href={tel(phone)} className={`${ghostBtn} border-white/25 text-white hover:bg-white/10 focus-visible:ring-white/30`}><Phone className="h-5 w-5" /><span dir="ltr">{phone}</span></a>}
          </Reveal>
          <Reveal delay={320} className="mt-10 flex max-w-md divide-x divide-white/15 rtl:divide-x-reverse">
            {c.hero.facts.map(([n, l]) => (
              <div key={l} className="flex-1 px-5 first:ps-0 last:pe-0">
                <div className="svc text-[2.1rem] font-semibold leading-none text-white" dir="ltr">{n}</div>
                <div className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8FCBE0]">{l}</div>
              </div>
            ))}
          </Reveal>
        </div>
        {/* phone / tablet: emergency card under the text (the photo is the hero background) */}
        {erCard && <Reveal delay={200} className="lg:hidden">{erCard}</Reveal>}
        {/* lg+: floating cards over the photo */}
        <div className="relative hidden h-full lg:block">
          <Reveal delay={260} className="absolute end-2 top-2">
            <div className="flex items-center gap-3 rounded-full border border-white/25 bg-white/90 py-2 pe-5 ps-2 text-[#0C2431] shadow-2xl backdrop-blur">
              <img src={BRAND("lyallpur-mark.webp")} alt="" className="h-10 w-10" />
              <span className="svc text-[13px] font-semibold uppercase tracking-[0.2em] text-[#2B6E85]">{c.hero.badge}</span>
            </div>
          </Reveal>
          <Reveal delay={340} className="absolute start-2 top-[42%]">{nextCard}</Reveal>
          {erCard && <Reveal delay={420} className="absolute bottom-0 start-24">{erCard}</Reveal>}
        </div>
      </div>
    </section>
  );
}

/** Inside the hospital: a bento gallery of the facility renders. */
const FACILITY_IMGS = ["reception", "lounge", "corridor", "room", "icu", "pharmacy"];
function Facilities({ c }: { c: Copy }) {
  const f = c.facilities;
  const span = ["sm:col-span-2 sm:row-span-2", "", "", "lg:col-span-2", "lg:col-span-2", "sm:col-span-2"];
  return (
    <section id="facilities" className="scroll-mt-24 bg-[#0C2431] py-24 text-white sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="grid items-end gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div><Eyebrow light>{f.eyebrow}</Eyebrow><BrandTitle text={f.title} light /></div>
          <p className="max-w-md text-lg leading-relaxed text-white/70 lg:justify-self-end">{f.sub}</p>
        </Reveal>
        <div className="mt-12 grid auto-rows-[220px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {f.items.map(([t, d], i) => (
            <Reveal key={t} delay={(i % 4) * 70} className={`group relative overflow-hidden rounded-3xl ${span[i]}`}>
              <img src={BRAND(`site/${FACILITY_IMGS[i]}.webp`)} alt={t} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0C2431]/95 via-[#0C2431]/25 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="flex items-center gap-2"><span className="h-0.5 w-6 rounded-full bg-[#E5322F]" /><h3 className="svc text-[1.15rem] font-semibold uppercase tracking-[0.06em]">{t}</h3></div>
                <p className={`mt-1.5 text-sm leading-relaxed text-white/75 ${i === 0 ? "" : "line-clamp-2"}`}>{d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-5 text-end text-xs text-white/40">{f.note}</p>
      </div>
    </section>
  );
}

const QUICK_ICONS = [CalendarCheck, UserRound, Stethoscope, Siren];
function QuickActions({ c, phone }: { c: Copy; phone?: string }) {
  const hrefs = ["/hms/book-appointment", "#doctors", "#services", phone ? tel(phone) : "#contact"];
  return (
    <div className="relative z-10 mx-auto -mt-20 max-w-7xl px-4 sm:px-6">
      <div className="grid gap-px overflow-hidden rounded-3xl bg-[#0C2431]/8 shadow-[0_30px_70px_-35px_rgba(12,36,49,0.55)] sm:grid-cols-2 lg:grid-cols-4">
        {c.quick.map(([t, d], i) => {
          const I = QUICK_ICONS[i];
          const er = i === 3;
          return (
            <a key={t} href={hrefs[i]} className={`group flex items-center gap-4 p-6 transition ${er ? "bg-[#0C2431] text-white hover:bg-[#123446]" : "bg-white hover:bg-[#F3F8FA]"}`}>
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${er ? "bg-[#E5322F] text-white" : "bg-[#2B6E85]/10 text-[#2B6E85]"}`}><I className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">{t}</span><span className={`block text-sm ${er ? "text-white/65" : "text-[#0C2431]/60"}`}>{d}</span></span>
              <ArrowRight className={`h-4 w-4 shrink-0 transition group-hover:translate-x-1 rtl:rotate-180 ${er ? "text-white/60" : "text-[#0C2431]/30"}`} />
            </a>
          );
        })}
      </div>
    </div>
  );
}

const ABOUT_ICONS = [BadgeCheck, FileText, Microscope, ShieldCheck];
function About({ c, opts }: { c: Copy; opts: Opts | null }) {
  const stats: [number, string][] = [[opts?.doctors.length ?? 0, c.about.doctors], [opts?.specializations.length ?? 0, c.about.specialties], [c.departments.items.length, c.about.departments]];
  return (
    <section id="about" className="scroll-mt-24 py-24 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <Eyebrow>{c.about.eyebrow}</Eyebrow>
          <BrandTitle text={c.about.title} />
          <p className="mt-6 border-s-2 border-[#2B6E85]/25 ps-5 text-lg leading-relaxed text-[#0C2431]/70">{c.about.body}</p>
          {opts && <div className="mt-10 grid grid-cols-3 divide-x divide-[#0C2431]/10 rtl:divide-x-reverse">
            {stats.map(([n, l]) => <div key={l} className="px-4 first:ps-0"><div className="svc text-5xl font-semibold text-[#2B6E85]" dir="ltr">{n}</div><div className="mt-1 text-sm text-[#0C2431]/60">{l}</div></div>)}
          </div>}
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {c.about.points.map(([t, d], i) => {
            const I = ABOUT_ICONS[i];
            return (
              <Reveal key={t} delay={i * 80}>
                <div className="h-full rounded-3xl border border-[#0C2431]/8 bg-white p-7 shadow-[0_20px_50px_-35px_rgba(12,36,49,0.5)]">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#E5322F] text-white shadow-[0_12px_24px_-12px_rgba(229,50,47,0.9)]"><I className="h-6 w-6" /></span>
                  <h3 className="svc mt-5 text-[1.3rem] font-semibold uppercase leading-tight tracking-[0.04em] text-[#2B6E85]">{t}</h3>
                  <span className="mt-2 block h-0.5 w-10 rounded-full bg-[#E5322F]" />
                  <p className="mt-2 leading-relaxed text-[#0C2431]/65">{d}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** A titled grid of feature cards in the website style: red icon tile, condensed teal title, red underline, number watermark. */
function FeatureSection({ id, block, icons, className = "" }: { id: string; block: Copy["services"]; icons: LucideIcon[]; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-24 py-24 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div><Eyebrow>{block.eyebrow}</Eyebrow><BrandTitle text={block.title} /></div>
          <p className="max-w-md text-[17px] leading-relaxed text-[#0C2431]/65">{block.sub}</p>
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {block.items.map(([t, d], i) => {
            const I = icons[i] ?? Stethoscope;
            return (
              <Reveal key={t} delay={(i % 4) * 60}>
                <article className="group relative h-full overflow-hidden rounded-3xl bg-gradient-to-b from-[#F3F8FA] to-white p-7 ring-1 ring-[#0C2431]/8 transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-34px_rgba(12,36,49,0.6)] hover:ring-[#2B6E85]/30">
                  <span className="hd pointer-events-none absolute -end-1 -top-3 text-[5.5rem] font-semibold leading-none text-[#2B6E85]/[0.07]" dir="ltr">{String(i + 1).padStart(2, "0")}</span>
                  <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-[#E5322F] text-white shadow-[0_14px_28px_-14px_rgba(229,50,47,0.9)] transition group-hover:bg-[#C42825]"><I className="h-7 w-7" /></span>
                  <h3 className="svc relative mt-6 text-[1.35rem] font-semibold uppercase leading-tight tracking-[0.04em] text-[#2B6E85]">{t}</h3>
                  <span className="relative mt-2 block h-0.5 w-10 rounded-full bg-[#E5322F] transition-all duration-500 group-hover:w-16" />
                  <p className="relative mt-3 text-[14.5px] leading-relaxed text-[#0C2431]/65">{d}</p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const SERVICE_ICONS: LucideIcon[] = [Stethoscope, HeartPulse, Siren, Scissors, Magnet, ScanSearch, ScanLine, TestTubes, Droplets, Waves, Pill, BedDouble];
const DEPT_ICONS: LucideIcon[] = [Stethoscope, HeartPulse, Activity, Brain, Droplet, Bone, Baby, Accessibility, Scissors, Ear, Sparkles, Ambulance];
const Services = ({ c }: { c: Copy }) => <FeatureSection id="services" block={c.services} icons={SERVICE_ICONS} className="bg-white" />;
const Departments = ({ c }: { c: Copy }) => <FeatureSection id="departments" block={c.departments} icons={DEPT_ICONS} />;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function Doctors({ c, lang, opts }: { c: Copy; lang: Lang; opts: Opts | null }) {
  const [spec, setSpec] = useState("");
  if (!opts || !opts.doctors.length) return null;
  const list = opts.doctors.filter((d) => !spec || d.specialization === spec);
  const specName = (s?: string) => (lang === "ur" ? opts.specializations.find((x) => x.name === s)?.name_ur : undefined) || s || "";
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayISO = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const chip = (on: boolean) => `rounded-full px-4 py-2 text-sm font-medium transition ${on ? "bg-[#E5322F] text-white shadow-[0_10px_22px_-10px_rgba(229,50,47,0.9)]" : "bg-white text-[#2B6E85] ring-1 ring-[#2B6E85]/20 hover:ring-[#E5322F]/50"}`;
  return (
    <section id="doctors" className="scroll-mt-24 bg-white py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="flex flex-wrap items-end justify-between gap-6"><div><Eyebrow>{c.doctors.eyebrow}</Eyebrow><BrandTitle text={c.doctors.title} /></div><p className="max-w-md text-[17px] leading-relaxed text-[#0C2431]/65">{c.doctors.sub}</p></Reveal>
        <Reveal className="mt-8 flex flex-wrap gap-2">
          <button type="button" className={chip(!spec)} onClick={() => setSpec("")} aria-pressed={!spec}>{c.doctors.all}</button>
          {opts.specializations.map((s) => <button key={s.name} type="button" className={chip(spec === s.name)} onClick={() => setSpec(s.name)} aria-pressed={spec === s.name}>{specName(s.name)}</button>)}
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.slice(0, 8).map((d, i) => {
            const initials = d.doctor_name.replace(/^Dr\.?\s*/i, "").split(" ").slice(0, 2).map((w) => w[0]).join("");
            const isToday = d.next_date === todayISO;
            const avail = d.next_date ? new Date(d.next_date + "T00:00").toLocaleDateString(lang === "ur" ? "ur-PK" : "en-PK", { weekday: "short", day: "numeric", month: "short" }) : "";
            const slot = d.days.find((x) => x.day === DAYS[todayIdx]) ?? d.days[0];
            const hours = slot ? `${slot.day === DAYS[todayIdx] ? (lang === "ur" ? "آج" : "Today") : slot.day} ${slot.from}–${slot.to}` : "";
            return (
              <Reveal key={d.name} delay={(i % 4) * 60}>
                <article className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-[#0C2431]/8 shadow-[0_24px_50px_-36px_rgba(12,36,49,0.65)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_34px_64px_-34px_rgba(12,36,49,0.6)]">
                  <div className="flex flex-1 flex-col items-center px-5 pb-5 pt-7 text-center">
                    {d.photo ? <img src={d.photo} alt="" className="h-24 w-24 rounded-full object-cover shadow-lg ring-4 ring-white" loading="lazy" />
                      : <span className="svc grid h-24 w-24 place-items-center rounded-full bg-[#E5322F] text-4xl font-semibold text-white shadow-[0_16px_30px_-14px_rgba(229,50,47,0.9)] ring-4 ring-white" dir="ltr">{initials}</span>}
                    {avail && <span className={`mt-3 rounded-full px-3 py-1 text-xs font-semibold ${isToday ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-[#2B6E85]/8 text-[#2B6E85] ring-1 ring-[#2B6E85]/15"}`}>{isToday ? c.doctors.today : `${c.doctors.nextOn} · ${avail}`}</span>}
                    <h3 className="svc mt-3 text-[1.3rem] font-semibold uppercase leading-tight tracking-[0.03em] text-[#2B6E85]">{d.doctor_name}</h3>
                    {d.doctor_name_ur && <p className="font-urdu mt-1 text-sm leading-loose text-[#0C2431]/60" dir="rtl">{d.doctor_name_ur}</p>}
                    <p className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-xs font-semibold">
                      <span className="rounded-full bg-[#2B6E85]/10 px-2.5 py-1 text-[#2B6E85]">{specName(d.specialization)}</span>
                      {d.consultation_room && <span className="flex items-center gap-1 rounded-full bg-[#0C2431]/[0.05] px-2.5 py-1 text-[#0C2431]/60" dir="ltr"><DoorOpen className="h-3.5 w-3.5" />{d.consultation_room}</span>}
                    </p>
                    {d.qualification && <p className="mt-1 text-sm text-[#0C2431]/55" dir="ltr">{d.qualification}</p>}
                    {d.default_fee ? <div className="mt-4 w-full rounded-2xl bg-[#F3F8FA] py-3 ring-1 ring-[#2B6E85]/15">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0C2431]/50">{c.doctors.fee}</div>
                      <div className="svc text-2xl font-semibold text-[#2B6E85]" dir="ltr">Rs {Math.round(d.default_fee).toLocaleString("en-PK")}</div>
                    </div> : null}
                    <div className="mt-4 flex w-full justify-between gap-1" dir="ltr" aria-label={c.doctors.days}>
                      {DAYS.map((dd, di) => {
                        const on = d.days.some((x) => x.day === dd);
                        const now = di === todayIdx;
                        return <span key={dd} title={dd} className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${on ? "bg-[#2B6E85] text-white" : "bg-[#0C2431]/[0.05] text-[#0C2431]/35"} ${now ? "ring-2 ring-[#E5322F] ring-offset-2" : ""}`}>{dd[0]}</span>;
                      })}
                    </div>
                    <p className="mb-4 mt-3 min-h-[1.25rem] text-[13px] text-[#0C2431]/65" dir="ltr">{hours ? <><Clock3 className="me-1 inline h-3.5 w-3.5 align-[-2px] text-[#E5322F]" />{hours}</> : d.days.length ? null : c.doctors.none}</p>
                    <a href={`/hms/book-appointment?doctor=${encodeURIComponent(d.name)}`} className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-[#E5322F] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(229,50,47,0.9)] transition hover:bg-[#C42825]">
                      <CalendarCheck className="h-4 w-4" />{c.doctors.book2}</a>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-10 text-center"><a href="/hms/book-appointment" className={`${ghostBtn} border-[#2B6E85]/30 text-[#2B6E85] hover:border-[#E5322F] hover:text-[#E5322F] focus-visible:ring-[#2B6E85]/20`}>{c.doctors.more}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></a></Reveal>
      </div>
    </section>
  );
}

const PATIENT_ICONS = [CalendarCheck, ClipboardList, FlaskConical, ShieldCheck, Users, BadgeCheck];
function Patients({ c }: { c: Copy }) {
  return (
    <section id="patients" className="scroll-mt-24 bg-[#0C2431] py-24 text-white sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal><Eyebrow light>{c.patients.eyebrow}</Eyebrow><H2 light>{c.patients.title}</H2></Reveal>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {c.patients.items.map(([t, d], i) => {
            const I = PATIENT_ICONS[i];
            return (
              <Reveal key={t} delay={(i % 3) * 70} className="bg-[#0C2431]">
                <div className="h-full p-8 transition hover:bg-white/[0.03]">
                  <div className="flex items-center gap-3"><span className="hd text-3xl font-semibold text-[#E5322F]/80" dir="ltr">0{i + 1}</span><I className="h-5 w-5 text-[#8FCBE0]" /></div>
                  <h3 className="hd mt-4 text-2xl font-semibold">{t}</h3>
                  <p className="mt-2 leading-relaxed text-white/65">{d}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Cta({ c, phone }: { c: Copy; phone?: string }) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2B6E85] via-[#225869] to-[#0C2431] px-8 py-14 text-white sm:px-14">
            <img src={BRAND("lyallpur-mark-dark.webp")} alt="" className="pointer-events-none absolute -end-16 -top-16 h-80 w-80 opacity-10" />
            <div className="relative flex flex-wrap items-center justify-between gap-8">
              <div><h2 className="hd text-4xl font-semibold sm:text-5xl">{c.cta.title}</h2><p className="mt-3 max-w-xl text-lg text-white/75">{c.cta.sub}</p></div>
              <div className="flex flex-wrap gap-3">
                <a href="/hms/book-appointment" className={redBtn}><CalendarCheck className="h-5 w-5" />{c.cta.book}</a>
                {phone && <a href={tel(phone)} className={`${ghostBtn} border-white/30 text-white hover:bg-white/10 focus-visible:ring-white/30`}><Phone className="h-5 w-5" />{c.cta.call}</a>}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Contact({ c, h }: { c: Copy; h?: Opts["clinic"] }) {
  const er = CONFIG.emergencyPhone || h?.phone;
  const mapQ = CONFIG.mapQuery || (h?.address ? `${h.address}, Pakistan` : "");
  const rows: [LucideIcon, string, ReactNode, string?][] = [
    ...(h?.address ? [[MapPin, c.contact.address, h.address] as [LucideIcon, string, ReactNode]] : []),
    ...(h?.phone ? [[Phone, c.contact.phone, <span dir="ltr">{h.phone}</span>, tel(h.phone)] as [LucideIcon, string, ReactNode, string]] : []),
    ...(er ? [[Siren, c.contact.emergency, <span dir="ltr">{er}</span>, tel(er)] as [LucideIcon, string, ReactNode, string]] : []),
    ...(hasWa ? [[WaIcon as unknown as LucideIcon, c.contact.whatsapp, <span dir="ltr">+{CONFIG.whatsapp}</span>, `https://wa.me/${CONFIG.whatsapp}`] as [LucideIcon, string, ReactNode, string]] : []),
    ...(CONFIG.email ? [[Mail, c.contact.email, CONFIG.email, `mailto:${CONFIG.email}`] as [LucideIcon, string, ReactNode, string]] : []),
  ];
  return (
    <section id="contact" className="scroll-mt-24 pb-24">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <Eyebrow>{c.contact.eyebrow}</Eyebrow><BrandTitle text={c.contact.title} />
          <ul className="mt-10 space-y-5">
            {rows.map(([I, l, v, href]) => (
              <li key={l} className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#E5322F] text-white shadow-[0_12px_24px_-12px_rgba(229,50,47,0.9)]"><I className="h-5 w-5" /></span>
                <span><span className="svc block text-[13px] font-semibold uppercase tracking-[0.12em] text-[#2B6E85]">{l}</span>
                  {href ? <a href={href} className="text-lg font-medium text-[#0C2431] hover:text-[#2B6E85]">{v}</a> : <span className="text-lg font-medium text-[#0C2431]">{v}</span>}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-[#0C2431]/55">{c.contact.hours}</p>
        </Reveal>
        <Reveal delay={120}>
          <div className="relative h-full min-h-[440px] overflow-hidden rounded-[2rem] bg-[#0C2431] shadow-[0_30px_70px_-35px_rgba(12,36,49,0.6)]">
            {mapQ ? (
              <iframe title={c.contact.mapTitle} src={`https://www.google.com/maps?q=${encodeURIComponent(mapQ)}&z=16&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                className="absolute inset-0 h-full w-full border-0 grayscale-[0.25]" />
            ) : <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:38px_38px]" />}
            <div className="absolute inset-x-4 bottom-4 rounded-3xl bg-white/95 p-5 text-[#0C2431] shadow-2xl backdrop-blur sm:inset-x-6 sm:bottom-6 sm:p-6">
              <div className="flex items-start gap-4">
                <img src={BRAND("lyallpur-mark.webp")} alt="" className="h-14 w-14 shrink-0" />
                <div className="min-w-0">
                  <div className="svc text-lg font-semibold uppercase tracking-[0.04em] text-[#2B6E85]">{c.name}</div>
                  {h?.address && <p className="mt-1 flex items-start gap-1.5 text-[15px] text-[#0C2431]/75"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#E5322F]" />{h.address}</p>}
                  {h?.phone && <a href={tel(h.phone)} className="mt-1 flex items-center gap-1.5 text-[15px] font-medium text-[#0C2431] hover:text-[#2B6E85]"><Phone className="h-4 w-4 text-[#E5322F]" /><span dir="ltr">{h.phone}</span></a>}
                </div>
              </div>
              {mapQ && <div className="mt-5 flex flex-wrap gap-2">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQ)}`} target="_blank" rel="noopener noreferrer" className={`${redBtn} px-5 py-3 text-sm`}><Navigation className="h-4 w-4" />{c.contact.directions}</a>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQ)}`} target="_blank" rel="noopener noreferrer" className={`${ghostBtn} border-[#0C2431]/15 px-5 py-3 text-sm text-[#0C2431] hover:bg-[#0C2431]/5 focus-visible:ring-[#2B6E85]/20`}><MapPin className="h-4 w-4" />{c.contact.openMap}</a>
              </div>}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer({ c, h }: { c: Copy; h?: Opts["clinic"] }) {
  const links: [string, string][] = [["#services", c.nav.services], ["#departments", c.nav.departments], ["#doctors", c.nav.doctors], ["#patients", c.nav.patients], ["#about", c.nav.about], ["#contact", c.nav.contact], ["/hms/book-appointment", c.nav.book]];
  return (
    <footer className="bg-[#081A24] text-white/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3"><img src={BRAND("lyallpur-mark-dark.webp")} alt="" className="h-12 w-12" />
            <span><span className="block text-lg font-bold text-white">{c.name}</span><span className="block text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#8FCBE0]">{c.tagline}</span></span></div>
          {h?.address && <p className="mt-6 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{h.address}</p>}
          {h?.phone && <a href={tel(h.phone)} className="mt-2 flex items-center gap-2 text-sm hover:text-white"><Phone className="h-4 w-4" /><span dir="ltr">{h.phone}</span></a>}
        </div>
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-white">{c.footer.links}</h3>
          <ul className="space-y-2 text-sm">{links.map(([hr, l]) => <li key={hr}><a href={hr} className="hover:text-white">{l}</a></li>)}</ul>
        </div>
        <div>
          <a href="/hms/login" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/85 hover:bg-white/5"><LogIn className="h-4 w-4" />{c.nav.staff}</a>
          {Object.entries(CONFIG.social).filter(([, u]) => u).length > 0 && <div className="mt-5 flex gap-3 text-sm">{Object.entries(CONFIG.social).filter(([, u]) => u).map(([k, u]) => <a key={k} href={u} target="_blank" rel="noopener noreferrer" className="capitalize hover:text-white">{k}</a>)}</div>}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs sm:px-6">
          <span>© {new Date().getFullYear()} {c.name}. {c.footer.rights}</span>
          <span className="flex items-center gap-2">{c.footer.powered} <Wordmark className="text-[10px]" /></span>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------- page
export default function LandingPage() {
  const [lang, setLangState] = useState<Lang>(() => { try { return (localStorage.getItem("hv.site.lang") as Lang) || "en"; } catch { return "en"; } });
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem("hv.site.lang", l); } catch { /* private mode */ } };
  const c = COPY[lang];
  const opts = useHospital();
  const h = opts?.clinic;
  const phone = CONFIG.emergencyPhone || h?.phone;
  useSeo(c, lang, h);
  useEffect(() => { const prev = document.documentElement.classList.contains("dark"); document.documentElement.classList.remove("dark"); return () => { if (prev) document.documentElement.classList.add("dark"); }; }, []);
  const rtl = lang === "ur";
  return (
    <div className="vvsl min-h-screen bg-[#FAF8F4] text-[#0C2431] antialiased" dir={rtl ? "rtl" : "ltr"} lang={lang} translate="no">
      <style>{`
        .vvsl { font-family: ${rtl ? "'Noto Nastaliq Urdu', serif" : "Inter, system-ui, sans-serif"}; }
        .vvsl .svc { font-family: ${rtl ? "'Noto Nastaliq Urdu', serif" : "Oswald, 'Arial Narrow', sans-serif"}; ${rtl ? "text-transform:none;letter-spacing:0;line-height:1.7;" : ""} }
        .vvsl .hd { font-family: ${rtl ? "'Noto Nastaliq Urdu', serif" : "'Cormorant Garamond', Georgia, serif"}; ${rtl ? "line-height:1.6;" : ""} }
        ${rtl ? ".vvsl p, .vvsl li { line-height: 2.1; }" : ""}
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
      `}</style>
      <Header c={c} lang={lang} setLang={setLang} />
      <main>
        <Hero c={c} lang={lang} opts={opts} phone={phone} />
        <QuickActions c={c} phone={phone} />
        <About c={c} opts={opts} />
        <Facilities c={c} />
        <Services c={c} />
        <Departments c={c} />
        <Doctors c={c} lang={lang} opts={opts} />
        <Patients c={c} />
        <Cta c={c} phone={phone} />
        <Contact c={c} h={h} />
      </main>
      <Footer c={c} h={h} />
      {hasWa ? (
        <a href={`https://wa.me/${CONFIG.whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label={c.contact.whatsapp}
          className="fixed bottom-5 end-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-[#073B22] shadow-xl ring-4 ring-white transition hover:scale-105"><WaIcon className="h-7 w-7" /></a>
      ) : phone ? (
        <a href={tel(phone)} aria-label={c.cta.call} className="fixed bottom-5 end-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#D92F2C] text-white shadow-[0_14px_30px_-10px_rgba(217,47,44,0.8)] ring-4 ring-white transition hover:scale-105 sm:hidden"><Phone className="h-6 w-6" /></a>
      ) : null}
    </div>
  );
}

