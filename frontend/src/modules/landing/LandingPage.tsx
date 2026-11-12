/**
 * VVSDesk marketing landing page (/hms/vvsdesk, public, D-69). React + Tailwind, one page, component per section.
 * Brand: deep teal #0F4C5C, warm off-white #FAF7F2, coral #FF6B4A (CTAs), WhatsApp green #25D366 (WhatsApp only), slate #1E293B.
 * Fonts: Plus Jakarta Sans (headings), Inter (body), Noto Nastaliq Urdu (اردو). Real VVSDesk screenshots in browser frames.
 * SEO: title / description / Open Graph / canonical set on mount, one H1, FAQPage + SoftwareApplication JSON-LD.
 * Accessibility: AA contrast (coral buttons carry slate text — white on coral is under 4.5:1), keyboard accordion and toggles,
 * alt text, focus rings, reduced-motion respected. Copy lives in content.ts (English / Urdu) and is kept out of the app's
 * automatic translation (translate="no") because this page has its own language toggle.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowRight, BadgeCheck, BarChart3, BedDouble, Boxes, Building2, CalendarClock, Check, ChevronDown, ClipboardList, Cloud, Database,
  FileCheck2, FileText, FlaskConical, Globe2, HardDrive, HeartPulse, KeyRound, Languages, LayoutGrid, Lock, Mail, MapPin, Menu, MonitorSmartphone, Phone, Pill,
  Receipt, ScanLine, ShieldCheck, Siren, Star, Stethoscope, Timer, UserCog, UserPlus, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { COPY, CONFIG, type Copy, type Lang } from "./content";

const C = { teal: "#0F4C5C", tealDeep: "#0A3743", cream: "#FAF7F2", coral: "#FF6B4A", wa: "#25D366", waInk: "#075E35", slate: "#1E293B" };
const IMG = (f: string) => `${import.meta.env.BASE_URL}landing/${f}`;
const waLink = (text = CONFIG.whatsappText) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- small building blocks
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

function Counter({ value }: { value: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value == null || !ref.current) return;
    if (reduced()) { setN(value); return; }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 1400;
      const step = (t: number) => { const k = Math.min(1, (t - t0) / dur); setN(Math.round(value * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref} className="tabular-nums">{value == null ? "[X]" : `${n.toLocaleString("en-PK")}+`}</span>;
}

function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <p className={`mb-3 text-sm font-semibold uppercase tracking-[0.16em] ${light ? "text-[#9FE3D4]" : "text-[#0F4C5C]"}`}>{children}</p>;
}
function H2({ children, light, center }: { children: ReactNode; light?: boolean; center?: boolean }) {
  return <h2 className={`hd text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl ${light ? "text-white" : "text-[#1E293B]"} ${center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}`}>{children}</h2>;
}
const coralBtn = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF6B4A] px-6 py-3.5 text-base font-bold text-[#1E293B] shadow-[0_10px_24px_-10px_rgba(255,107,74,0.8)] transition hover:-translate-y-0.5 hover:bg-[#FF7D60] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B4A]/40";
const waBtn = "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#25D366] bg-white px-6 py-3 text-base font-bold text-[#075E35] transition hover:-translate-y-0.5 hover:bg-[#25D366]/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40";

function BrowserFrame({ src, alt, url = "hospital.vvsdesk.pk", eager = false, className = "" }: { src: string; alt: string; url?: string; eager?: boolean; className?: string }) {
  return (
    <figure className={`overflow-hidden rounded-2xl border border-[#0F4C5C]/10 bg-white shadow-[0_30px_60px_-30px_rgba(15,76,92,0.45)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" /><span className="h-3 w-3 rounded-full bg-[#FEBC2E]" /><span className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="ms-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-center text-xs text-slate-500 ring-1 ring-slate-200" dir="ltr"><Lock className="me-1 inline h-3 w-3" />{url}</span>
      </div>
      <img src={src} alt={alt} width={1600} height={1000} loading={eager ? "eager" : "lazy"} decoding="async" {...(eager ? { fetchPriority: "high" as const } : {})} className="block h-auto w-full" />
    </figure>
  );
}

/** A WhatsApp chat on a phone (HTML, not an image). `mine[i]` = line i is the patient's (right, green). */
function PhoneChat({ lines, mine: sides, name, status, className = "", file }: { lines: string[]; mine: boolean[]; name: string; status: string; className?: string; file?: string }) {
  return (
    <div className={`w-[260px] rounded-[2.4rem] border-[10px] border-[#111827] bg-[#111827] shadow-[0_30px_60px_-20px_rgba(15,23,42,0.55)] ${className}`} aria-label={`WhatsApp chat: ${lines.join(" — ")}`} role="img">
      <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#111827]" />
      <div className="overflow-hidden rounded-[1.8rem] bg-[#ECE5DD]" aria-hidden>
        <div className="flex items-center gap-2 bg-[#075E54] px-3 pb-2.5 pt-6 text-white">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#25D366] text-sm font-black text-[#075E35]">V</span>
          <div className="min-w-0"><div className="truncate text-[13px] font-semibold">{name}</div><div className="text-[10px] text-white/75">{status}</div></div>
        </div>
        <div className="space-y-1.5 px-2.5 py-3 text-[12.5px] leading-snug text-[#1E293B]" style={{ minHeight: 300 }}>
          {lines.map((l, i) => {
            const mine = !!sides[i];
            const isFile = /\.pdf/i.test(l) || (file && l === file);
            return (
              <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-2.5 py-1.5 shadow-sm ${mine ? "rounded-tr-sm bg-[#DCF8C6]" : "rounded-tl-sm bg-white"}`}>
                  {isFile ? <span className="flex items-center gap-2"><span className="grid h-8 w-7 place-items-center rounded bg-[#FF6B4A]/15 text-[9px] font-bold text-[#B23A1E]">PDF</span><span className="font-medium">{l}</span></span> : l}
                  <span className="ms-2 inline-block align-bottom text-[9px] text-slate-500">10:4{i}{mine ? " ✓✓" : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- SEO
function useSeo(c: Copy, lang: Lang) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = c.meta.title;
    document.documentElement.lang = lang === "ur" ? "ur" : "en";
    const added: Element[] = [];
    const meta = (attr: "name" | "property", key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); added.push(el); }
      el.content = content;
    };
    const url = `${window.location.origin}/hms/vvsdesk`;
    meta("name", "description", c.meta.description);
    meta("name", "keywords", "hospital management system Pakistan, HMIS software, hospital software with WhatsApp, lab management software Pakistan, EMR software Pakistan");
    meta("property", "og:title", c.meta.title); meta("property", "og:description", c.meta.description); meta("property", "og:type", "website");
    meta("property", "og:url", url); meta("property", "og:image", `${window.location.origin}${IMG("og.jpg")}`); meta("name", "twitter:card", "summary_large_image");
    const link = document.createElement("link"); link.rel = "canonical"; link.href = url; document.head.appendChild(link); added.push(link);
    const fonts = document.createElement("link"); fonts.rel = "stylesheet";
    fonts.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap";
    document.head.appendChild(fonts); added.push(fonts);
    const ld = document.createElement("script"); ld.type = "application/ld+json";
    ld.text = JSON.stringify([
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: COPY.en.faq.items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "VVSDesk", applicationCategory: "BusinessApplication", operatingSystem: "Web, on-premise",
        description: COPY.en.meta.description, areaServed: "PK", inLanguage: ["en", "ur"] },
    ]);
    document.head.appendChild(ld); added.push(ld);
    return () => { document.title = prevTitle; added.forEach((e) => e.remove()); };
  }, [c, lang]);
}

// ---------------------------------------------------------------- sections
function Header({ c, lang, setLang }: { c: Copy; lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 8); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  const links: [string, string][] = [["#modules", c.nav.features], ["#whatsapp", c.nav.whatsapp], ["#pricing", c.nav.pricing], ["#why", c.nav.why], ["#faq", c.nav.faq]];
  return (
    <header className={`sticky top-0 z-40 transition-all ${scrolled ? "border-b border-[#0F4C5C]/10 bg-[#FAF7F2]/90 shadow-sm backdrop-blur" : "bg-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5" aria-label="VVSDesk home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0F4C5C] font-black text-white shadow-md">V</span>
          <span className="hd text-lg font-extrabold tracking-tight text-[#0F4C5C]" dir="ltr">VVSDesk</span>
        </a>
        <nav aria-label="Main" className="ms-6 hidden items-center gap-1 lg:flex">
          {links.map(([h, l]) => <a key={h} href={h} className="rounded-lg px-3 py-2 text-[15px] font-medium text-[#1E293B]/80 transition hover:bg-[#0F4C5C]/5 hover:text-[#0F4C5C]">{l}</a>)}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <button type="button" onClick={() => setLang(lang === "en" ? "ur" : "en")} aria-label={lang === "en" ? "اردو میں دیکھیں" : "View in English"}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-[#0F4C5C] hover:bg-[#0F4C5C]/5"><Languages className="h-4 w-4" /><span className={lang === "en" ? "ur" : ""}>{c.nav.lang}</span></button>
          <a href={waLink()} target="_blank" rel="noopener noreferrer" aria-label={c.nav.chat} className="grid h-10 w-10 place-items-center rounded-xl border-2 border-[#25D366] text-[#075E35] transition hover:bg-[#25D366]/10"><WaIcon /></a>
          <a href="#demo" className={`${coralBtn} hidden px-4 py-2.5 text-sm sm:inline-flex`}>{c.nav.demo}</a>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-[#0F4C5C] hover:bg-[#0F4C5C]/5 lg:hidden" aria-expanded={open} aria-controls="mnav" aria-label={open ? c.nav.close : c.nav.menu} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      <div id="mnav" className={`overflow-hidden border-t border-[#0F4C5C]/10 bg-[#FAF7F2] transition-[max-height] duration-300 lg:hidden ${open ? "max-h-96" : "max-h-0 border-t-0"}`}>
        <nav aria-label="Mobile" className="flex flex-col px-4 py-2">
          {links.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 font-medium text-[#1E293B] hover:bg-[#0F4C5C]/5">{l}</a>)}
          <a href="#demo" onClick={() => setOpen(false)} className={`${coralBtn} my-2`}>{c.nav.demo}</a>
        </nav>
      </div>
    </header>
  );
}

function Hero({ c }: { c: Copy }) {
  const h = c.hero;
  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-10 sm:pt-16">
      <div aria-hidden className="pointer-events-none absolute -top-40 end-[-10%] h-[520px] w-[520px] rounded-full bg-[#0F4C5C]/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 start-[-10%] h-[420px] w-[420px] rounded-full bg-[#FF6B4A]/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#0F4C5C]/15 bg-white/70 px-3 py-1.5 text-sm font-semibold text-[#0F4C5C]"><span className="h-2 w-2 rounded-full bg-[#25D366]" />{h.eyebrow}</p>
          <h1 className="hd text-4xl font-extrabold leading-[1.08] tracking-tight text-[#1E293B] sm:text-5xl xl:text-[3.6rem] [.vvsl-ur_&]:text-3xl [.vvsl-ur_&]:sm:text-4xl [.vvsl-ur_&]:xl:text-[2.6rem]">
            {h.h1a} <span className="text-[#0F4C5C]">{h.h1b}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#1E293B]/75">{h.sub}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#demo" className={coralBtn}>{h.cta}<ArrowRight className="h-5 w-5 rtl:rotate-180" /></a>
            <a href={waLink()} target="_blank" rel="noopener noreferrer" className={waBtn}><WaIcon />{h.cta2}</a>
          </div>
        </Reveal>
        <Reveal delay={150} className="relative">
          <BrowserFrame src={IMG("desktop.webp")} alt={h.shotAlt} eager className="lg:translate-x-6 rtl:lg:-translate-x-6" />
          <PhoneChat name={h.chat.name} status={h.chat.status} file={h.chat.file} lines={[h.chat.m1, h.chat.m2, h.chat.file, h.chat.m3, h.chat.m4]} mine={[false, false, false, true, false]}
            className="absolute -bottom-16 end-[-8px] hidden origin-bottom-right scale-[0.78] sm:block lg:end-[-36px] rtl:origin-bottom-left" />
        </Reveal>
      </div>
      <div className="relative mx-auto mt-20 max-w-7xl px-4 sm:px-6">
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-y border-[#0F4C5C]/10 py-5 text-sm font-semibold text-[#0F4C5C]">
          {h.trust.map((t, i) => {
            const I = [Cloud, Languages, FileCheck2, HardDrive][i];
            return <li key={t} className="flex items-center gap-2"><I className="h-4 w-4" />{t}</li>;
          })}
        </ul>
      </div>
    </section>
  );
}

function Problems({ c }: { c: Copy }) {
  const icons: LucideIcon[] = [Timer, Phone, Receipt];
  const sol: LucideIcon[] = [CalendarClock, FileText, Wallet];
  return (
    <section className="py-16 sm:py-20" aria-labelledby="problems-h">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal><h2 id="problems-h" className="hd mx-auto max-w-3xl text-center text-3xl font-extrabold tracking-tight text-[#1E293B] sm:text-4xl">{c.problems.title}</h2></Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {c.problems.items.map((it, i) => {
            const P = icons[i], S = sol[i];
            return (
              <Reveal key={it.p} delay={i * 100}>
                <article className="h-full rounded-2xl border border-[#0F4C5C]/10 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3 text-[#B23A1E]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#FF6B4A]/12"><P className="h-5 w-5" /></span><h3 className="hd text-lg font-bold">{it.p}</h3></div>
                  <div className="my-4 flex items-center gap-2 text-[#0F4C5C]/40" aria-hidden><span className="h-px flex-1 bg-current" /><ArrowRight className="h-4 w-4 rotate-90" /><span className="h-px flex-1 bg-current" /></div>
                  <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0F4C5C] text-white"><S className="h-5 w-5" /></span><p className="leading-relaxed text-[#1E293B]/80">{it.s}</p></div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Which chat lines are the patient's, per WhatsApp feature (booking, reminder, report, discharge). */
const WA_SIDES = [[true, false, true, false], [false, false, true, false], [false, false, true, false], [false, false, false, true]];

function WhatsAppSpotlight({ c }: { c: Copy }) {
  return (
    <section id="whatsapp" className="scroll-mt-20 bg-[#0F4C5C] py-20 text-white sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal><Eyebrow light>{c.wa.eyebrow}</Eyebrow><H2 light>{c.wa.title}</H2><p className="mt-4 max-w-2xl text-lg text-white/80">{c.wa.sub}</p></Reveal>
        <div className="mt-16 space-y-20">
          {c.wa.items.map((it, i) => (
            <div key={it.t} className={`grid items-center gap-10 md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
              <Reveal>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#25D366]/15 px-3 py-1 text-sm font-semibold text-[#9FF0C0]"><WaIcon className="h-4 w-4" />0{i + 1}</div>
                <h3 className="hd text-2xl font-bold sm:text-3xl">{it.t}</h3>
                <p className="mt-4 max-w-lg text-lg leading-relaxed text-white/80">{it.d}</p>
              </Reveal>
              <Reveal delay={120} className="flex justify-center">
                <PhoneChat name={c.hero.chat.name} status={c.hero.chat.status} lines={it.chat} mine={WA_SIDES[i]} className="relative" />
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const MODULE_ICONS: LucideIcon[][] = [
  [UserPlus, CalendarClock, Globe2], [Stethoscope, BedDouble, ClipboardList, HeartPulse, Siren, Activity], [FlaskConical, ScanLine],
  [Pill, Boxes, BadgeCheck], [Receipt, ShieldCheck, Database, FileCheck2], [Users, Wallet, BarChart3, UserCog],
];
function Modules({ c }: { c: Copy }) {
  return (
    <section id="modules" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal><Eyebrow>{c.modules.eyebrow}</Eyebrow><H2>{c.modules.title}</H2></Reveal>
        <div className="mt-12 space-y-12">
          {c.modules.groups.map((g, gi) => (
            <div key={g.g}>
              <Reveal><div className="mb-5 flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#0F4C5C] text-xs font-bold text-white">{gi + 1}</span>
                <h3 className="hd text-xl font-bold text-[#0F4C5C]">{g.g}</h3><span className="h-px flex-1 bg-[#0F4C5C]/15" /></div></Reveal>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map(([t, d], i) => {
                  const I = MODULE_ICONS[gi][i] ?? LayoutGrid;
                  return (
                    <Reveal key={t} delay={i * 60}>
                      <article className="group flex h-full flex-col rounded-2xl border border-[#0F4C5C]/10 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(15,76,92,0.5)]">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0F4C5C]/8 text-[#0F4C5C] transition group-hover:bg-[#0F4C5C] group-hover:text-white"><I className="h-5 w-5" /></span>
                        <h4 className="hd mt-4 text-lg font-bold text-[#1E293B]">{t}</h4>
                        <p className="mt-1.5 flex-1 text-[15px] leading-relaxed text-[#1E293B]/70">{d}</p>
                        <a href="#demo" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#0F4C5C] hover:underline" aria-label={`${c.modules.learn}: ${t}`}>
                          {c.modules.learn}<ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5 rtl:rotate-180" /></a>
                      </article>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <Reveal className="mt-14 grid gap-5 lg:grid-cols-2">
          <BrowserFrame src={IMG("lab.webp")} alt="VVSDesk lab orders: each order shows Paid or Unpaid before the sample is collected" />
          <BrowserFrame src={IMG("analytics.webp")} alt="VVSDesk dashboard with live charts for the OPD app" />
        </Reveal>
      </div>
    </section>
  );
}

function Why({ c }: { c: Copy }) {
  return (
    <section id="why" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Reveal><Eyebrow>{c.why.eyebrow}</Eyebrow><H2>{c.why.title}</H2></Reveal>
        <Reveal delay={100}>
          <div className="mt-10 overflow-hidden rounded-2xl border border-[#0F4C5C]/12">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{c.why.title}</caption>
              <thead><tr className="bg-[#FAF7F2]"><th scope="col" className="w-1/2 px-5 py-4 text-start text-sm font-semibold text-[#1E293B]/60">{c.why.typical}</th>
                <th scope="col" className="w-1/2 bg-[#0F4C5C] px-5 py-4 text-start text-sm font-bold text-white">{c.why.ours}</th></tr></thead>
              <tbody>{c.why.rows.map(([a, b]) => (
                <tr key={a} className="border-t border-[#0F4C5C]/10">
                  <td className="px-5 py-4 align-top text-[15px] text-[#1E293B]/65"><span className="flex gap-2.5"><X className="mt-0.5 h-4 w-4 shrink-0 text-[#B23A1E]" aria-label="—" />{a}</span></td>
                  <td className="bg-[#0F4C5C]/[0.04] px-5 py-4 align-top text-[15px] font-medium text-[#1E293B]"><span className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F4C5C]" aria-label="✓" />{b}</span></td>
                </tr>))}</tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function How({ c }: { c: Copy }) {
  const icons: LucideIcon[] = [MonitorSmartphone, Database, Users, BadgeCheck];
  return (
    <section className="py-20 sm:py-24" aria-labelledby="how-h">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal><Eyebrow>{c.how.eyebrow}</Eyebrow><h2 id="how-h" className="hd text-3xl font-extrabold tracking-tight text-[#1E293B] sm:text-4xl">{c.how.title}</h2></Reveal>
        <ol className="relative mt-12 grid gap-8 md:grid-cols-4">
          <span aria-hidden className="absolute start-6 top-6 hidden h-0.5 w-[calc(100%-3rem)] bg-gradient-to-r from-[#0F4C5C] via-[#0F4C5C]/40 to-[#FF6B4A] md:block rtl:bg-gradient-to-l" />
          {c.how.steps.map(([t, d], i) => {
            const I = icons[i];
            return (
              <Reveal key={t} delay={i * 120}>
                <li className="relative">
                  <span className="relative z-10 grid h-12 w-12 place-items-center rounded-2xl bg-[#0F4C5C] text-white shadow-lg ring-4 ring-[#FAF7F2]"><I className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm font-semibold text-[#B23A1E]">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="hd mt-1 text-lg font-bold text-[#1E293B]">{t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#1E293B]/70">{d}</p>
                </li>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Stats({ c }: { c: Copy }) {
  const items: [keyof typeof CONFIG.stats, string, LucideIcon][] = [["hospitals", c.stats.hospitals, Building2], ["patients", c.stats.patients, Users], ["reports", c.stats.reports, FileText], ["cities", c.stats.cities, MapPin]];
  return (
    <section className="bg-[#0A3743] py-16 text-white" aria-labelledby="stats-h">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 id="stats-h" className="sr-only">{c.stats.title}</h2>
        <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {items.map(([k, l, I], i) => (
            <Reveal key={k} delay={i * 80}>
              <div className="text-center">
                <I className="mx-auto h-6 w-6 text-[#9FE3D4]" aria-hidden />
                <dd className="hd mt-3 text-4xl font-extrabold sm:text-5xl"><Counter value={CONFIG.stats[k]} /></dd>
                <dt className="mt-2 text-sm text-white/75">{l}</dt>
              </div>
            </Reveal>
          ))}
        </dl>
        {Object.values(CONFIG.stats).some((v) => v == null) && <p className="mt-8 text-center text-xs text-white/50">{c.stats.note}</p>}
      </div>
    </section>
  );
}

function Pricing({ c }: { c: Copy }) {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="pricing" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="text-center"><Eyebrow>{c.pricing.eyebrow}</Eyebrow><H2 center>{c.pricing.title}</H2>
          <div role="radiogroup" aria-label={`${c.pricing.monthly} / ${c.pricing.yearly}`} className="mx-auto mt-8 inline-flex rounded-xl border border-[#0F4C5C]/15 bg-white p-1">
            {[false, true].map((y) => (
              <button key={String(y)} type="button" role="radio" aria-checked={yearly === y} onClick={() => setYearly(y)}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F4C5C] ${yearly === y ? "bg-[#0F4C5C] text-white shadow" : "text-[#1E293B]/70 hover:text-[#0F4C5C]"}`}>
                {y ? c.pricing.yearly : c.pricing.monthly}</button>))}
          </div>
        </Reveal>
        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {c.pricing.tiers.map((t, i) => {
            const pop = t.k === "hospital";
            return (
              <Reveal key={t.k} delay={i * 100}>
                <article className={`relative flex h-full flex-col rounded-2xl p-7 ${pop ? "bg-[#0F4C5C] text-white shadow-[0_30px_60px_-28px_rgba(15,76,92,0.8)] lg:-translate-y-3" : "border border-[#0F4C5C]/12 bg-white"}`}>
                  {pop && <span className="absolute -top-3 start-7 rounded-full bg-[#FF6B4A] px-3 py-1 text-xs font-bold text-[#1E293B]">{c.pricing.popular}</span>}
                  <h3 className="hd text-xl font-bold">{t.n}</h3>
                  <p className={`mt-1 text-sm ${pop ? "text-white/75" : "text-[#1E293B]/65"}`}>{t.d}</p>
                  <p className="mt-6 flex items-baseline gap-1"><span className="hd text-4xl font-extrabold" dir="ltr">PKR {CONFIG.prices[t.k as keyof typeof CONFIG.prices]}</span>
                    <span className={pop ? "text-white/70" : "text-[#1E293B]/60"}>{yearly ? c.pricing.perYear : c.pricing.perMonth}</span></p>
                  <ul className="mt-6 flex-1 space-y-3">{t.f.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[15px]"><Check className={`mt-0.5 h-5 w-5 shrink-0 ${pop ? "text-[#9FE3D4]" : "text-[#0F4C5C]"}`} aria-hidden />{f}</li>))}</ul>
                  <a href="#demo" className={pop ? `${coralBtn} mt-8 w-full` : "mt-8 inline-flex w-full items-center justify-center rounded-xl border-2 border-[#0F4C5C] px-6 py-3 font-bold text-[#0F4C5C] transition hover:bg-[#0F4C5C] hover:text-white"}>{c.pricing.cta}</a>
                </article>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-8 text-center text-[15px] text-[#1E293B]/70">{c.pricing.custom}</p>
        <p className="mt-2 text-center text-xs text-[#1E293B]/45">{c.pricing.note}</p>
      </div>
    </section>
  );
}

function Testimonials({ c }: { c: Copy }) {
  return (
    <section className="bg-white py-20 sm:py-24" aria-labelledby="t-h">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal><Eyebrow>{c.testimonials.eyebrow}</Eyebrow><h2 id="t-h" className="hd text-3xl font-extrabold tracking-tight text-[#1E293B] sm:text-4xl">{c.testimonials.title}</h2>
          <p className="mt-2 text-xs text-[#1E293B]/45">{c.testimonials.note}</p></Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {c.testimonials.items.map((t, i) => (
            <Reveal key={i} delay={i * 100}>
              <figure className="flex h-full flex-col rounded-2xl border border-[#0F4C5C]/10 bg-[#FAF7F2] p-6">
                <div className="flex gap-0.5 text-[#E8A317]" role="img" aria-label="5 out of 5 stars">{Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-4 w-4 fill-current" aria-hidden />)}</div>
                <blockquote className="mt-4 flex-1 text-[15px] italic leading-relaxed text-[#1E293B]/80">{t.q}</blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-[#0F4C5C]/10 pt-4">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0F4C5C] text-sm font-bold text-white" aria-hidden>{i + 1}</span>
                  <span><span className="block font-semibold text-[#1E293B]">{t.n}</span><span className="block text-sm text-[#1E293B]/60">{t.r} · {t.h}, {t.c}</span></span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4" aria-label={c.testimonials.logos}>
          {Array.from({ length: 6 }).map((_, i) => <span key={i} className="grid h-12 w-32 place-items-center rounded-xl border border-dashed border-[#0F4C5C]/20 text-xs text-[#1E293B]/40">{c.testimonials.logos}</span>)}
        </div>
      </div>
    </section>
  );
}

function Security({ c }: { c: Copy }) {
  const icons: LucideIcon[] = [KeyRound, FileText, HardDrive, FileCheck2, Building2];
  return (
    <section className="py-20 sm:py-24" aria-labelledby="sec-h">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <Reveal><Eyebrow>{c.security.eyebrow}</Eyebrow><h2 id="sec-h" className="hd text-3xl font-extrabold tracking-tight text-[#1E293B] sm:text-4xl">{c.security.title}</h2></Reveal>
          <ul className="mt-8 space-y-5">
            {c.security.items.map(([t, d], i) => {
              const I = icons[i];
              return (
                <Reveal key={t} delay={i * 70}>
                  <li className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0F4C5C] text-white"><I className="h-5 w-5" /></span>
                    <div><h3 className="hd font-bold text-[#1E293B]">{t}</h3><p className="mt-1 text-[15px] leading-relaxed text-[#1E293B]/70">{d}</p></div></li>
                </Reveal>
              );
            })}
          </ul>
          <p className="mt-6 text-sm text-[#1E293B]/55">{c.security.note}</p>
        </div>
        <Reveal delay={150}><BrowserFrame src={IMG("beds.webp")} alt="VVSDesk wards and beds: the live bed map by ward" /></Reveal>
      </div>
    </section>
  );
}

function Faq({ c }: { c: Copy }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal className="text-center"><Eyebrow>{c.faq.eyebrow}</Eyebrow><H2 center>{c.faq.title}</H2></Reveal>
        <div className="mt-10 divide-y divide-[#0F4C5C]/10 rounded-2xl border border-[#0F4C5C]/12">
          {c.faq.items.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={q}>
                <h3>
                  <button type="button" id={`faq-b-${i}`} aria-expanded={isOpen} aria-controls={`faq-p-${i}`} onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center gap-4 px-5 py-5 text-start text-base font-semibold text-[#1E293B] transition hover:bg-[#FAF7F2] focus-visible:bg-[#FAF7F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F4C5C]">
                    <span className="flex-1">{q}</span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-[#0F4C5C] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                </h3>
                <div id={`faq-p-${i}`} role="region" aria-labelledby={`faq-b-${i}`}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden"><p className="px-5 pb-5 text-[15px] leading-relaxed text-[#1E293B]/75">{a}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DemoCta({ c, lang }: { c: Copy; lang: Lang }) {
  const [state, setState] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    if (!f.name?.trim() || !f.hospital?.trim() || !f.city?.trim() || !f.beds || !f.whatsapp?.trim()) { setState("err"); setMsg(c.cta.required); return; }
    setState("sending");
    try {
      const r = await fetch(CONFIG.demoEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...f, language: lang }) });
      if (!r.ok) throw new Error(String(r.status));
      setState("ok"); setMsg(c.cta.ok); e.currentTarget?.reset?.();
    } catch { setState("err"); setMsg(c.cta.err); }
  };
  const field = "h-12 w-full rounded-xl border border-white/25 bg-white/95 px-4 text-[15px] text-[#1E293B] placeholder:text-[#1E293B]/45 focus:border-[#FF6B4A] focus:outline-none focus:ring-4 focus:ring-[#FF6B4A]/30";
  return (
    <section id="demo" className="scroll-mt-20 bg-[#0F4C5C] py-20 text-white sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center"><h2 className="hd mx-auto max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">{c.cta.title}</h2><p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">{c.cta.sub}</p></Reveal>
        <Reveal delay={120}>
          <form onSubmit={(e) => void submit(e)} noValidate className="mx-auto mt-10 grid max-w-5xl gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.8fr_0.9fr_1fr_auto] lg:p-5">
            <label className="sr-only" htmlFor="d-name">{c.cta.name}</label><input id="d-name" name="name" autoComplete="name" placeholder={c.cta.name} className={field} required />
            <label className="sr-only" htmlFor="d-hosp">{c.cta.hospital}</label><input id="d-hosp" name="hospital" autoComplete="organization" placeholder={c.cta.hospital} className={field} required />
            <label className="sr-only" htmlFor="d-city">{c.cta.city}</label><input id="d-city" name="city" autoComplete="address-level2" placeholder={c.cta.city} className={field} required />
            <label className="sr-only" htmlFor="d-beds">{c.cta.beds}</label>
            <select id="d-beds" name="beds" defaultValue="" className={field} required><option value="" disabled>{c.cta.beds}</option>{c.cta.bedOptions.map((o) => <option key={o}>{o}</option>)}</select>
            <label className="sr-only" htmlFor="d-wa">{c.cta.wa}</label><input id="d-wa" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder={`${c.cta.wa} (${c.cta.phoneHint})`} className={field} dir="ltr" required />
            <button type="submit" disabled={state === "sending"} className={`${coralBtn} h-12 py-0 disabled:opacity-60 sm:col-span-2 lg:col-span-1`}>{state === "sending" ? c.cta.sending : c.cta.submit}</button>
          </form>
          <p role="status" aria-live="polite" className={`mt-4 text-center text-[15px] font-medium ${state === "ok" ? "text-[#9FF0C0]" : "text-[#FFC2B4]"}`}>{state === "ok" || state === "err" ? msg : ""}</p>
        </Reveal>
      </div>
    </section>
  );
}

function Footer({ c }: { c: Copy }) {
  const cols: [string, string[], string[]][] = [
    [c.footer.product, c.footer.links.product, ["#modules", "#whatsapp", "#pricing", "#modules"]],
    [c.footer.company, c.footer.links.company, ["#why", "#demo", "#demo", "#demo"]],
    [c.footer.resources, c.footer.links.resources, ["/hms/help", "/hms/help?tab=guides", "#why", "#faq"]],
  ];
  return (
    <footer className="bg-[#0A3743] text-white/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.3fr]">
        <div>
          <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white font-black text-[#0F4C5C]">V</span><span className="hd text-lg font-extrabold text-white" dir="ltr">VVSDesk</span></div>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed">{c.footer.tagline}</p>
          <div className="mt-5 flex gap-2">
            {(["facebook", "linkedin", "youtube", "instagram"] as const).map((s) => (
              <a key={s} href={CONFIG.social[s]} aria-label={s} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-xs font-bold uppercase text-white transition hover:bg-white/20">{s[0]}</a>))}
          </div>
        </div>
        {cols.map(([h, items, hrefs]) => (
          <nav key={h} aria-label={h}><h2 className="hd text-sm font-bold uppercase tracking-wider text-white">{h}</h2>
            <ul className="mt-4 space-y-2.5 text-[15px]">{items.map((l, i) => <li key={l}><a href={hrefs[i]} className="hover:text-white">{l}</a></li>)}</ul></nav>))}
        <div><h2 className="hd text-sm font-bold uppercase tracking-wider text-white">{c.footer.contact}</h2>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span dir="ltr">{CONFIG.phone}</span></li>
            <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span dir="ltr">{CONFIG.email}</span></li>
            <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{CONFIG.address}</span></li>
            <li className="flex gap-2"><WaIcon className="mt-0.5 h-4 w-4 shrink-0" /><a href={waLink()} target="_blank" rel="noopener noreferrer" className="hover:text-white">WhatsApp</a></li>
          </ul></div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-sm text-white/60">© {new Date().getFullYear()} <span dir="ltr">VVSDesk</span>. {c.footer.rights}</div>
    </footer>
  );
}

// ---------------------------------------------------------------- page
export default function LandingPage() {
  const [lang, setLang] = useState<Lang>(() => { try { return (localStorage.getItem("vvsdesk.lang") as Lang) || "en"; } catch { return "en"; } });
  const c = COPY[lang];
  useEffect(() => { try { localStorage.setItem("vvsdesk.lang", lang); } catch { /* private mode */ } }, [lang]);
  useSeo(c, lang);
  const rtl = lang === "ur";
  const style = useMemo(() => ({ fontFamily: rtl ? "'Noto Nastaliq Urdu', 'Inter', system-ui, sans-serif" : "'Inter', system-ui, sans-serif", background: C.cream, color: C.slate }), [rtl]);
  return (
    <div translate="no" lang={rtl ? "ur" : "en"} dir={rtl ? "rtl" : "ltr"} style={style} className={`vvsl min-h-screen scroll-smooth antialiased ${rtl ? "vvsl-ur" : ""}`}>
      <style>{`
        .vvsl .hd { font-family: ${rtl ? "'Noto Nastaliq Urdu', serif" : "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"}; }
        .vvsl-ur { line-height: 2.05; } .vvsl-ur h1, .vvsl-ur h2, .vvsl-ur h3 { line-height: 1.9 !important; letter-spacing: 0 !important; }
        .vvsl .ur { font-family: 'Noto Nastaliq Urdu', serif; }
        html:has(.vvsl) { scroll-behavior: smooth; } @media (prefers-reduced-motion: reduce) { html:has(.vvsl) { scroll-behavior: auto; } }
      `}</style>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-[#0F4C5C]">Skip to content</a>
      <Header c={c} lang={lang} setLang={setLang} />
      <main id="main">
        <Hero c={c} />
        <Problems c={c} />
        <WhatsAppSpotlight c={c} />
        <Modules c={c} />
        <Why c={c} />
        <How c={c} />
        <Stats c={c} />
        <Pricing c={c} />
        <Testimonials c={c} />
        <Security c={c} />
        <Faq c={c} />
        <DemoCta c={c} lang={lang} />
      </main>
      <Footer c={c} />
      <a href={waLink()} target="_blank" rel="noopener noreferrer" aria-label={c.float} title={c.float}
        className="fixed bottom-5 end-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-[#073B22] shadow-[0_12px_28px_-8px_rgba(7,59,34,0.6)] ring-4 ring-white transition hover:scale-105 focus-visible:outline-none focus-visible:ring-[#0F4C5C] motion-safe:animate-[vvsPulse_2.4s_ease-in-out_infinite]">
        <WaIcon className="h-7 w-7" />
      </a>
      <style>{`@keyframes vvsPulse { 0%,100% { box-shadow: 0 12px 28px -8px rgba(7,59,34,.6), 0 0 0 0 rgba(37,211,102,.45); } 50% { box-shadow: 0 12px 28px -8px rgba(7,59,34,.6), 0 0 0 10px rgba(37,211,102,0); } }`}</style>
    </div>
  );
}

