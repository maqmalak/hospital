/**
 * VVSDesk marketing landing page (/hms/vvsdesk, public, D-69). React + Tailwind, one page, component per section.
 * Brand: deep teal #0F4C5C, warm off-white #FBFAF7, coral #B8913A (CTAs), WhatsApp green #25D366 (WhatsApp only), slate #1B1D21.
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
  LogIn, Receipt, ScanLine, ShieldCheck, Siren, Star, Stethoscope, Timer, UserCog, UserPlus, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { COPY, CONFIG, type Copy, type Lang } from "./content";

const C = { teal: "#0F4C5C", tealDeep: "#0E1013", cream: "#FBFAF7", coral: "#B8913A", wa: "#25D366", waInk: "#075E35", slate: "#1B1D21" };
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
  return <p className={`mb-3 text-sm font-semibold uppercase tracking-[0.16em] ${light ? "text-[#E6CF8F]" : "text-[#7A5C1A]"}`}>{children}</p>;
}
function H2({ children, light, center }: { children: ReactNode; light?: boolean; center?: boolean }) {
  return <h2 className={`hd text-[2.15rem] font-semibold leading-[1.1] tracking-[-0.01em] sm:text-[2.9rem] ${light ? "text-white" : "text-[#1B1D21]"} ${center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}`}>{children}</h2>;
}
const coralBtn = "inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#A88536,#E6CF8F_50%,#B8913A)] px-6 py-3.5 text-base font-bold text-[#14171C] shadow-[0_12px_28px_-12px_rgba(184,145,58,0.9)] ring-1 ring-inset ring-white/30 transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B8913A]/40";

function BrowserFrame({ src, alt, url = "hospital.vvsdesk.pk", eager = false, className = "" }: { src: string; alt: string; url?: string; eager?: boolean; className?: string }) {
  return (
    <figure className={`overflow-hidden rounded-2xl border border-[#B8913A]/10 bg-white shadow-[0_30px_60px_-30px_rgba(20,23,28,0.45)] ${className}`}>
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
        <div className="space-y-1.5 px-2.5 py-3 text-[12.5px] leading-snug text-[#1B1D21]" style={{ minHeight: 300 }}>
          {lines.map((l, i) => {
            const mine = !!sides[i];
            const isFile = /\.pdf/i.test(l) || (file && l === file);
            return (
              <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-2.5 py-1.5 shadow-sm ${mine ? "rounded-tr-sm bg-[#DCF8C6]" : "rounded-tl-sm bg-white"}`}>
                  {isFile ? <span className="flex items-center gap-2"><span className="grid h-8 w-7 place-items-center rounded bg-[#B8913A]/15 text-[9px] font-bold text-[#8E5A1E]">PDF</span><span className="font-medium">{l}</span></span> : l}
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
    fonts.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,600&family=Cinzel:wght@600&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap";
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
/** The VVS diamond mark (roof · cross · double check), gold — same geometry as the brand files in deliverables/vvs-brand. */
function VvsMark({ className = "h-9 w-9", id = "vm" }: { className?: string; id?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="120" y2="120">
        <stop offset="0" stopColor="#A88536" /><stop offset=".32" stopColor="#C9A24A" /><stop offset=".5" stopColor="#F1DE9C" /><stop offset=".68" stopColor="#C9A24A" /><stop offset="1" stopColor="#A88536" />
      </linearGradient></defs>
      <g fill="none" stroke={`url(#${id})`} strokeLinejoin="miter">
        <path d="M60 3.5 L116.5 60 L60 116.5 L3.5 60 Z" strokeWidth="5" />
        <path d="M60 15.5 L104.5 60 L60 104.5 L15.5 60 Z" strokeWidth="1.4" opacity=".55" />
        <path d="M32.5 54 L60 87 L87.5 54" strokeWidth="7" /><path d="M44.5 54 L60 72.6 L75.5 54" strokeWidth="7" />
        <path d="M60 25 V45 M50 35 H70" strokeWidth="6" />
      </g>
    </svg>
  );
}
const goldText = "bg-[linear-gradient(110deg,#B8913A,#F1DE9C_45%,#C9A24A_70%,#E6CF8F)] bg-clip-text text-transparent";

function Header({ c, lang, setLang }: { c: Copy; lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const f = () => setScrolled(window.scrollY > 8); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  const links: [string, string][] = [["#modules", c.nav.features], ["#whatsapp", c.nav.whatsapp], ["#pricing", c.nav.pricing], ["#why", c.nav.why], ["#faq", c.nav.faq]];
  return (
    <header className={`sticky top-0 z-40 text-white transition-all duration-300 ${scrolled ? "border-b border-white/10 bg-[#0E1013]/85 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl" : "bg-[#0E1013]"}`}>
      <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-4 px-4 sm:px-6">
        <a href="#top" className="group flex items-center gap-3" aria-label="VVSDesk home">
          <VvsMark className="h-9 w-9 transition-transform duration-500 group-hover:rotate-[8deg]" id="vm-h" />
          <span className="leading-none" dir="ltr"><span className="brand block text-[17px] tracking-[0.28em] text-white">VVS<span className={goldText}>DESK</span></span>
            <span className="mt-1 block text-[9.5px] font-medium uppercase tracking-[0.32em] text-white/45">Hospital management</span></span>
        </a>
        <nav aria-label="Main" className="ms-6 hidden items-center gap-1 lg:flex">
          {links.map(([h, l]) => <a key={h} href={h} className="relative rounded-lg px-3 py-2 text-[14.5px] font-medium text-white/70 transition hover:text-white after:absolute after:inset-x-3 after:bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-[#C9A24A] after:transition-transform hover:after:scale-x-100">{l}</a>)}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <button type="button" onClick={() => setLang(lang === "en" ? "ur" : "en")} aria-label={lang === "en" ? "اردو میں دیکھیں" : "View in English"}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-white/80 hover:bg-white/5 hover:text-white"><Languages className="h-4 w-4" /><span className={lang === "en" ? "ur" : ""}>{c.nav.lang}</span></button>
          <a href="/hms/login" className="hidden items-center gap-1.5 rounded-xl border border-[#C9A24A]/60 px-3.5 py-2 text-sm font-semibold text-[#E6CF8F] transition hover:border-[#E6CF8F] hover:bg-[#C9A24A]/10 md:inline-flex"><LogIn className="h-4 w-4 rtl:rotate-180" />{c.nav.login}</a>
          <a href={waLink()} target="_blank" rel="noopener noreferrer" aria-label={c.nav.chat} className="grid h-10 w-10 place-items-center rounded-xl bg-[#25D366] text-[#073B22] transition hover:brightness-110"><WaIcon /></a>
          <a href="#demo" className={`${coralBtn} hidden px-4 py-2.5 text-sm sm:inline-flex`}>{c.nav.demo}</a>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-xl text-white/85 hover:bg-white/5 lg:hidden" aria-expanded={open} aria-controls="mnav" aria-label={open ? c.nav.close : c.nav.menu} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      <div id="mnav" className={`overflow-hidden border-t border-white/10 bg-[#0E1013] transition-[max-height] duration-300 lg:hidden ${open ? "max-h-[28rem]" : "max-h-0 border-t-0"}`}>
        <nav aria-label="Mobile" className="flex flex-col px-4 py-2">
          {links.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 font-medium text-white/85 hover:bg-white/5">{l}</a>)}
          <a href="/hms/login" className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl border border-[#C9A24A]/60 px-6 py-3 font-semibold text-[#E6CF8F]"><LogIn className="h-5 w-5 rtl:rotate-180" />{c.nav.login}</a>
          <a href="#demo" onClick={() => setOpen(false)} className={`${coralBtn} my-2`}>{c.nav.demo}</a>
        </nav>
      </div>
    </header>
  );
}

function Hero({ c }: { c: Copy }) {
  const h = c.hero;
  return (
    <section id="top" className="relative overflow-hidden bg-[#0E1013] pb-20 pt-12 text-white sm:pt-20">
      {/* soft gold light + a faint diamond lattice */}
      <div aria-hidden className="pointer-events-none absolute -top-56 end-[-12%] h-[640px] w-[640px] rounded-full bg-[#C9A24A]/20 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-64 start-[-10%] h-[520px] w-[520px] rounded-full bg-[#7A5C1A]/25 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(45deg,#E6CF8F_1px,transparent_1px),linear-gradient(-45deg,#E6CF8F_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#C9A24A]/35 bg-white/[0.04] px-3.5 py-1.5 text-[13px] font-medium tracking-wide text-[#E6CF8F] backdrop-blur"><span className="h-1.5 w-1.5 rounded-full bg-[#25D366] shadow-[0_0_10px] shadow-[#25D366]" />{h.eyebrow}</p>
          <h1 className="hd text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.01em] text-white sm:text-6xl xl:text-[4.4rem] [.vvsl-ur_&]:text-3xl [.vvsl-ur_&]:sm:text-[2.9rem] [.vvsl-ur_&]:xl:text-[2.6rem]">
            {h.h1a} <span className={`${goldText} italic`}>{h.h1b}</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/70">{h.sub}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#demo" className={coralBtn}>{h.cta}<ArrowRight className="h-5 w-5 rtl:rotate-180" /></a>
            <a href={waLink()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#25D366]/70 bg-[#25D366]/10 px-6 py-3 text-base font-semibold text-[#9FF0C0] transition hover:-translate-y-0.5 hover:bg-[#25D366]/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40"><WaIcon />{h.cta2}</a>
          </div>
        </Reveal>
        <Reveal delay={150} className="relative">
          <div aria-hidden className="absolute -inset-6 rounded-[2rem] bg-[linear-gradient(135deg,rgba(201,162,74,0.35),transparent_45%,rgba(201,162,74,0.15))] blur-2xl" />
          <BrowserFrame src={IMG("desktop.webp")} alt={h.shotAlt} eager className="relative ring-1 ring-[#C9A24A]/30 lg:translate-x-6 rtl:lg:-translate-x-6" />
          <PhoneChat name={h.chat.name} status={h.chat.status} file={h.chat.file} lines={[h.chat.m1, h.chat.m2, h.chat.file, h.chat.m3, h.chat.m4]} mine={[false, false, false, true, false]}
            className="absolute -bottom-16 end-[-8px] hidden origin-bottom-right scale-[0.78] sm:block lg:end-[-36px] rtl:origin-bottom-left" />
        </Reveal>
      </div>
      <div className="relative mx-auto mt-24 max-w-7xl px-4 sm:px-6">
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 border-y border-white/10 py-5 text-[13.5px] font-medium tracking-wide text-[#E6CF8F]/90">
          {h.trust.map((t, i) => {
            const I = [Cloud, Languages, FileCheck2, HardDrive][i];
            return <li key={t} className="flex items-center gap-2"><I className="h-4 w-4 text-[#C9A24A]" />{t}</li>;
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
        <Reveal><h2 id="problems-h" className="hd mx-auto max-w-3xl text-center text-[2.15rem] font-semibold leading-[1.1] tracking-[-0.01em] text-[#1B1D21] sm:text-[2.9rem]">{c.problems.title}</h2></Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {c.problems.items.map((it, i) => {
            const P = icons[i], S = sol[i];
            return (
              <Reveal key={it.p} delay={i * 100}>
                <article className="h-full rounded-2xl border border-[#B8913A]/10 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3 text-[#8E5A1E]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#B8913A]/12"><P className="h-5 w-5" /></span><h3 className="hd text-[1.4rem] font-semibold">{it.p}</h3></div>
                  <div className="my-4 flex items-center gap-2 text-[#7A5C1A]/40" aria-hidden><span className="h-px flex-1 bg-current" /><ArrowRight className="h-4 w-4 rotate-90" /><span className="h-px flex-1 bg-current" /></div>
                  <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#14171C] text-white"><S className="h-5 w-5" /></span><p className="leading-relaxed text-[#1B1D21]/80">{it.s}</p></div>
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
    <section id="whatsapp" className="scroll-mt-20 bg-[#14171C] py-20 text-white sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal><Eyebrow light>{c.wa.eyebrow}</Eyebrow><H2 light>{c.wa.title}</H2><p className="mt-4 max-w-2xl text-lg text-white/80">{c.wa.sub}</p></Reveal>
        <div className="mt-16 space-y-20">
          {c.wa.items.map((it, i) => (
            <div key={it.t} className={`grid items-center gap-10 md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
              <Reveal>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#25D366]/15 px-3 py-1 text-sm font-semibold text-[#9FF0C0]"><WaIcon className="h-4 w-4" />0{i + 1}</div>
                <h3 className="hd text-[2rem] font-semibold sm:text-[2.4rem]">{it.t}</h3>
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
              <Reveal><div className="mb-5 flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#14171C] text-xs font-bold text-white">{gi + 1}</span>
                <h3 className="hd text-2xl font-semibold text-[#7A5C1A]">{g.g}</h3><span className="h-px flex-1 bg-[#14171C]/15" /></div></Reveal>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map(([t, d], i) => {
                  const I = MODULE_ICONS[gi][i] ?? LayoutGrid;
                  return (
                    <Reveal key={t} delay={i * 60}>
                      <article className="group flex h-full flex-col rounded-2xl border border-[#B8913A]/10 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(20,23,28,0.5)]">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#14171C]/8 text-[#7A5C1A] transition group-hover:bg-[#14171C] group-hover:text-white"><I className="h-5 w-5" /></span>
                        <h4 className="hd mt-4 text-[1.4rem] font-semibold text-[#1B1D21]">{t}</h4>
                        <p className="mt-1.5 flex-1 text-[15px] leading-relaxed text-[#1B1D21]/70">{d}</p>
                        <a href="#demo" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#7A5C1A] hover:underline" aria-label={`${c.modules.learn}: ${t}`}>
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
          <div className="mt-10 overflow-hidden rounded-2xl border border-[#B8913A]/12">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{c.why.title}</caption>
              <thead><tr className="bg-[#FBFAF7]"><th scope="col" className="w-1/2 px-5 py-4 text-start text-sm font-semibold text-[#1B1D21]/60">{c.why.typical}</th>
                <th scope="col" className="w-1/2 bg-[#14171C] px-5 py-4 text-start text-sm font-bold text-white">{c.why.ours}</th></tr></thead>
              <tbody>{c.why.rows.map(([a, b]) => (
                <tr key={a} className="border-t border-[#B8913A]/10">
                  <td className="px-5 py-4 align-top text-[15px] text-[#1B1D21]/65"><span className="flex gap-2.5"><X className="mt-0.5 h-4 w-4 shrink-0 text-[#8E5A1E]" aria-label="—" />{a}</span></td>
                  <td className="bg-[#14171C]/[0.04] px-5 py-4 align-top text-[15px] font-medium text-[#1B1D21]"><span className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7A5C1A]" aria-label="✓" />{b}</span></td>
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
        <Reveal><Eyebrow>{c.how.eyebrow}</Eyebrow><h2 id="how-h" className="hd text-[2.15rem] font-semibold leading-[1.1] tracking-[-0.01em] text-[#1B1D21] sm:text-[2.9rem]">{c.how.title}</h2></Reveal>
        <ol className="relative mt-12 grid gap-8 md:grid-cols-4">
          <span aria-hidden className="absolute start-6 top-6 hidden h-0.5 w-[calc(100%-3rem)] bg-gradient-to-r from-[#B8913A] via-[#B8913A]/40 to-[#B8913A] md:block rtl:bg-gradient-to-l" />
          {c.how.steps.map(([t, d], i) => {
            const I = icons[i];
            return (
              <Reveal key={t} delay={i * 120}>
                <li className="relative">
                  <span className="relative z-10 grid h-12 w-12 place-items-center rounded-2xl bg-[#14171C] text-white shadow-lg ring-4 ring-[#FBFAF7]"><I className="h-5 w-5" /></span>
                  <p className="mt-4 text-sm font-semibold text-[#8E5A1E]">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="hd mt-1 text-[1.4rem] font-semibold text-[#1B1D21]">{t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#1B1D21]/70">{d}</p>
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
  const items: [string, string, LucideIcon][] = [["hospitals", c.stats.hospitals, Building2], ["patients", c.stats.patients, Users], ["reports", c.stats.reports, FileText], ["cities", c.stats.cities, MapPin]];
  return (
    <section className="bg-[#0E1013] py-16 text-white" aria-labelledby="stats-h">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 id="stats-h" className="sr-only">{c.stats.title}</h2>
        <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {items.map(([k, l, I], i) => (
            <Reveal key={k} delay={i * 80}>
              <div className="text-center">
                <I className="mx-auto h-6 w-6 text-[#E6CF8F]" aria-hidden />
                <dd className="hd mt-3 text-5xl font-semibold sm:text-6xl"><Counter value={CONFIG.stats[k] ?? null} /></dd>
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
          <div role="radiogroup" aria-label={`${c.pricing.monthly} / ${c.pricing.yearly}`} className="mx-auto mt-8 inline-flex rounded-xl border border-[#B8913A]/15 bg-white p-1">
            {[false, true].map((y) => (
              <button key={String(y)} type="button" role="radio" aria-checked={yearly === y} onClick={() => setYearly(y)}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8913A] ${yearly === y ? "bg-[#14171C] text-white shadow" : "text-[#1B1D21]/70 hover:text-[#7A5C1A]"}`}>
                {y ? c.pricing.yearly : c.pricing.monthly}</button>))}
          </div>
        </Reveal>
        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
          {c.pricing.tiers.map((t, i) => {
            const pop = t.k === "hospital";
            return (
              <Reveal key={t.k} delay={i * 100}>
                <article className={`relative flex h-full flex-col rounded-2xl p-7 ${pop ? "bg-[#14171C] text-white shadow-[0_30px_60px_-28px_rgba(20,23,28,0.8)] lg:-translate-y-3" : "border border-[#B8913A]/12 bg-white"}`}>
                  {pop && <span className="absolute -top-3 start-7 rounded-full bg-[linear-gradient(135deg,#A88536,#E6CF8F_50%,#B8913A)] px-3 py-1 text-xs font-bold text-[#14171C]">{c.pricing.popular}</span>}
                  <h3 className="hd text-2xl font-semibold">{t.n}</h3>
                  <p className={`mt-1 text-sm ${pop ? "text-white/75" : "text-[#1B1D21]/65"}`}>{t.d}</p>
                  <p className="mt-6 flex flex-wrap items-baseline gap-x-1.5">
                    {t.k === "enterprise" && <span className={`text-sm font-semibold ${pop ? "text-white/75" : "text-[#1B1D21]/60"}`}>{c.pricing.from}</span>}
                    <span className="hd text-[2.6rem] font-semibold tabular-nums" dir="ltr">PKR {((CONFIG.prices[t.k] ?? 0) * (yearly ? 12 : 1)).toLocaleString("en-PK")}</span>
                    <span className={pop ? "text-white/70" : "text-[#1B1D21]/60"}>{yearly ? c.pricing.perYear : c.pricing.perMonth}</span></p>
                  <ul className="mt-6 flex-1 space-y-3">{t.f.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[15px]"><Check className={`mt-0.5 h-5 w-5 shrink-0 ${pop ? "text-[#E6CF8F]" : "text-[#7A5C1A]"}`} aria-hidden />{f}</li>))}</ul>
                  <a href="#demo" className={pop ? `${coralBtn} mt-8 w-full` : "mt-8 inline-flex w-full items-center justify-center rounded-xl border-2 border-[#B8913A] px-6 py-3 font-bold text-[#7A5C1A] transition hover:bg-[#14171C] hover:text-white"}>{c.pricing.cta}</a>
                </article>
              </Reveal>
            );
          })}
        </div>
        <p className="mt-8 text-center text-[15px] text-[#1B1D21]/70">{c.pricing.custom}</p>
        <p className="mt-2 text-center text-sm text-[#1B1D21]/60">{c.pricing.note}</p>
      </div>
    </section>
  );
}

function Testimonials({ c }: { c: Copy }) {
  return (
    <section className="bg-white py-20 sm:py-24" aria-labelledby="t-h">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal><Eyebrow>{c.testimonials.eyebrow}</Eyebrow><h2 id="t-h" className="hd text-[2.15rem] font-semibold leading-[1.1] tracking-[-0.01em] text-[#1B1D21] sm:text-[2.9rem]">{c.testimonials.title}</h2>
          <p className="mt-2 text-xs text-[#1B1D21]/45">{c.testimonials.note}</p></Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {c.testimonials.items.map((t, i) => (
            <Reveal key={i} delay={i * 100}>
              <figure className="flex h-full flex-col rounded-2xl border border-[#B8913A]/10 bg-[#FBFAF7] p-6">
                <div className="flex gap-0.5 text-[#E8A317]" role="img" aria-label="5 out of 5 stars">{Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-4 w-4 fill-current" aria-hidden />)}</div>
                <blockquote className="mt-4 flex-1 text-[15px] italic leading-relaxed text-[#1B1D21]/80">{t.q}</blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-[#B8913A]/10 pt-4">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#14171C] text-sm font-bold text-white" aria-hidden>{i + 1}</span>
                  <span><span className="block font-semibold text-[#1B1D21]">{t.n}</span><span className="block text-sm text-[#1B1D21]/60">{t.r} · {t.h}, {t.c}</span></span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4" aria-label={c.testimonials.logos}>
          {Array.from({ length: 6 }).map((_, i) => <span key={i} className="grid h-12 w-32 place-items-center rounded-xl border border-dashed border-[#B8913A]/20 text-xs text-[#1B1D21]/40">{c.testimonials.logos}</span>)}
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
          <Reveal><Eyebrow>{c.security.eyebrow}</Eyebrow><h2 id="sec-h" className="hd text-[2.15rem] font-semibold leading-[1.1] tracking-[-0.01em] text-[#1B1D21] sm:text-[2.9rem]">{c.security.title}</h2></Reveal>
          <ul className="mt-8 space-y-5">
            {c.security.items.map(([t, d], i) => {
              const I = icons[i];
              return (
                <Reveal key={t} delay={i * 70}>
                  <li className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#14171C] text-white"><I className="h-5 w-5" /></span>
                    <div><h3 className="hd text-xl font-semibold text-[#1B1D21]">{t}</h3><p className="mt-1 text-[15px] leading-relaxed text-[#1B1D21]/70">{d}</p></div></li>
                </Reveal>
              );
            })}
          </ul>
          <p className="mt-6 text-sm text-[#1B1D21]/55">{c.security.note}</p>
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
        <div className="mt-10 divide-y divide-[#B8913A]/10 rounded-2xl border border-[#B8913A]/12">
          {c.faq.items.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={q}>
                <h3>
                  <button type="button" id={`faq-b-${i}`} aria-expanded={isOpen} aria-controls={`faq-p-${i}`} onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center gap-4 px-5 py-5 text-start text-base font-semibold text-[#1B1D21] transition hover:bg-[#FBFAF7] focus-visible:bg-[#FBFAF7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B8913A]">
                    <span className="flex-1">{q}</span>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-[#7A5C1A] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                </h3>
                <div id={`faq-p-${i}`} role="region" aria-labelledby={`faq-b-${i}`}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden"><p className="px-5 pb-5 text-[15px] leading-relaxed text-[#1B1D21]/75">{a}</p></div>
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
  const field = "h-12 w-full rounded-xl border border-white/25 bg-white/95 px-4 text-[15px] text-[#1B1D21] placeholder:text-[#1B1D21]/45 focus:border-[#B8913A] focus:outline-none focus:ring-4 focus:ring-[#B8913A]/30";
  return (
    <section id="demo" className="scroll-mt-20 bg-[#14171C] py-20 text-white sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center"><h2 className="hd mx-auto max-w-3xl text-[2.15rem] font-semibold leading-[1.1] tracking-[-0.01em] sm:text-[2.9rem]">{c.cta.title}</h2><p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">{c.cta.sub}</p></Reveal>
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
    <footer className="bg-[#0E1013] text-white/80">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.3fr]">
        <div>
          <div className="flex items-center gap-3"><VvsMark className="h-10 w-10" id="vm-f" /><span className="brand text-[17px] tracking-[0.28em] text-white" dir="ltr">VVS<span className={goldText}>DESK</span></span></div>
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed">{c.footer.tagline}</p>
          <div className="mt-5 flex gap-2">
            {(["facebook", "linkedin", "youtube", "instagram"] as const).map((s) => (
              <a key={s} href={CONFIG.social[s]} aria-label={s} className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-xs font-bold uppercase text-white transition hover:bg-white/20">{s[0]}</a>))}
          </div>
        </div>
        {cols.map(([h, items, hrefs]) => (
          <nav key={h} aria-label={h}><h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E6CF8F]">{h}</h2>
            <ul className="mt-4 space-y-2.5 text-[15px]">{items.map((l, i) => <li key={l}><a href={hrefs[i]} className="hover:text-white">{l}</a></li>)}</ul></nav>))}
        <div><h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[#E6CF8F]">{c.footer.contact}</h2>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span dir="ltr">{CONFIG.phone}</span></li>
            <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span dir="ltr">{CONFIG.email}</span></li>
            <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{CONFIG.address}</span></li>
            <li className="flex gap-2"><LogIn className="mt-0.5 h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden /><a href="/hms/login" className="font-semibold text-white hover:underline">{c.nav.login}</a></li>
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
        .vvsl .hd { font-family: ${rtl ? "'Noto Nastaliq Urdu', serif" : "'Cormorant Garamond', Georgia, serif"}; }
        .vvsl .brand { font-family: 'Cinzel', Georgia, serif; font-weight: 600; }
        .vvsl:not(.vvsl-ur) h2.hd, .vvsl:not(.vvsl-ur) h3.hd, .vvsl:not(.vvsl-ur) h4.hd { letter-spacing: -0.005em; }
        .vvsl-ur { line-height: 2.05; } .vvsl-ur h1, .vvsl-ur h2, .vvsl-ur h3 { line-height: 1.9 !important; letter-spacing: 0 !important; }
        .vvsl .ur { font-family: 'Noto Nastaliq Urdu', serif; }
        html:has(.vvsl) { scroll-behavior: smooth; } @media (prefers-reduced-motion: reduce) { html:has(.vvsl) { scroll-behavior: auto; } }
      `}</style>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-[#7A5C1A]">Skip to content</a>
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
        className="fixed bottom-5 end-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-[#073B22] shadow-[0_12px_28px_-8px_rgba(7,59,34,0.6)] ring-4 ring-white transition hover:scale-105 focus-visible:outline-none focus-visible:ring-[#B8913A] motion-safe:animate-[vvsPulse_2.4s_ease-in-out_infinite]">
        <WaIcon className="h-7 w-7" />
      </a>
      <style>{`@keyframes vvsPulse { 0%,100% { box-shadow: 0 12px 28px -8px rgba(7,59,34,.6), 0 0 0 0 rgba(37,211,102,.45); } 50% { box-shadow: 0 12px 28px -8px rgba(7,59,34,.6), 0 0 0 10px rgba(37,211,102,0); } }`}</style>
    </div>
  );
}

