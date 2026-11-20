import { useEffect, useRef, useState, type ReactNode } from "react";
import { LmcMark } from "@/components/brand";
import { Link } from "react-router-dom";
import {
  Activity, Ambulance, ArrowRight, Baby, Bone, Brain, CalendarCheck, Clock3, Droplets, Ear, FlaskConical, HeartPulse, Pill, ScanLine, Scissors, Siren,
  Sparkles, Stethoscope, Video, Magnet, Microscope, AudioWaveform, type LucideIcon,
} from "lucide-react";
import type { Doctor } from "./data";
import { fmtDate, initials, todayISO, rs, slugDoc } from "./data";

export const ICONS: Record<string, LucideIcon> = {
  stethoscope: Stethoscope, heart: HeartPulse, siren: Siren, brain: Brain, droplets: Droplets, bone: Bone, baby: Baby, scissors: Scissors, ear: Ear,
  sparkles: Sparkles, scan: ScanLine, flask: FlaskConical, clock: Clock3, activity: Activity, video: Video, pill: Pill, ambulance: Ambulance, magnet: Magnet, microscope: Microscope, waves: AudioWaveform,
};

export const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Fade-up when scrolled into view. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !("IntersectionObserver" in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref as never} style={{ transitionDelay: `${delay}ms` }} className={`s2-reveal ${on ? "is-in" : ""} ${className}`}>{children}</Tag>;
}

/** Headline that reveals word by word. */
export function WordReveal({ text, className = "" }: { text: string; className?: string }) {
  return <span className={className} aria-label={text}>{text.split(" ").map((w, i) => <span key={i} aria-hidden className="s2-word" style={{ animationDelay: `${120 + i * 90}ms` }}>{w}&nbsp;</span>)}</span>;
}

/** Number that counts up the first time it is seen. */
export function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !to) { setN(to); return; }
    if (reduced()) { setN(to); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => { const p = Math.min(1, (t - t0) / 1400); setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref} dir="ltr">{n.toLocaleString("en-PK")}{suffix}</span>;
}

export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return <div className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.18em] ${light ? "bg-white/10 text-[var(--hero-accent)]" : "bg-[var(--mint)] text-[var(--primary)]"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${light ? "bg-[var(--hero-accent)]" : "bg-[var(--accent)]"}`} />{children}</div>;
}

export function SectionHead({ eyebrow, title, sub, center, light, action }: { eyebrow: string; title: string; sub?: string; center?: boolean; light?: boolean; action?: ReactNode }) {
  return (
    <Reveal className={`mb-12 flex flex-wrap items-end justify-between gap-6 ${center ? "flex-col items-center text-center" : ""}`}>
      <div className={center ? "mx-auto max-w-2xl" : "max-w-2xl"}>
        <Eyebrow light={light}>{eyebrow}</Eyebrow>
        <h2 className={`s2-display text-[2.2rem] leading-[1.1] sm:text-[3rem] ${light ? "text-white" : "text-[var(--ink)]"}`}>{title}</h2>
        {sub && <p className={`mt-4 text-[1.05rem] leading-relaxed ${light ? "text-white/70" : "text-[var(--muted)]"}`}>{sub}</p>}
      </div>
      {action}
    </Reveal>
  );
}

export const btn = {
  primary: "s2-shine inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_30px_-14px_var(--accent)] transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)]",
  teal: "s2-shine inline-flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_30px_-16px_var(--primary)] transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-ring)]",
  ghost: "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-6 py-3.5 text-[15px] font-semibold text-[var(--ink)] transition hover:-translate-y-0.5 hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-ring)]",
  glass: "inline-flex items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3.5 text-[15px] font-semibold text-white backdrop-blur-md transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30",
};
export const card = "rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_44px_-30px_rgba(14,46,56,0.45)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(14,46,56,0.55)]";

/** Page banner for inner pages. */
/** Hospital logo on a white disc inside thin concentric rings, for the right side of a page hero (lg and up). */
export function LogoMedallion() {
  return (
    <div aria-hidden className="pointer-events-none relative grid h-[380px] w-[380px] place-items-center">
      <span className="absolute inset-0 rounded-full border border-white/10" />
      <span className="s2-spin absolute inset-[22px] rounded-full border border-dashed border-white/25" />
      <span className="absolute inset-[48px] rounded-full border border-[color-mix(in_srgb,var(--hero-accent)_30%,transparent)] bg-white/[0.04] backdrop-blur-[2px]" />
      <span className="s2-spin-rev absolute inset-[22px]"><span className="absolute -top-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#FF6B66] shadow-[0_0_14px_3px_rgba(255,107,102,0.6)]" /></span>
      <span className="s2-spin absolute inset-0"><span className="absolute -bottom-[4px] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--hero-accent)] shadow-[0_0_12px_3px_rgba(159,227,218,0.55)]" /></span>
      <span className="relative grid h-[236px] w-[236px] place-items-center rounded-full bg-white shadow-[0_30px_70px_-20px_rgba(0,0,0,0.6),0_0_0_10px_rgba(255,255,255,0.08)]">
        <span className="flex flex-col items-center">
          {/* the logo without its small baked-in L·M·C line (rows below 376 of 403), which is redrawn larger underneath */}
          <span className="block h-[126px] w-[174px] overflow-hidden"><img src={`${import.meta.env.BASE_URL}brand/lyallpur-logo.webp`} alt="" width={520} height={403} className="w-[174px] max-w-none" /></span>
          <LmcMark color="#0E5E6F" accent="#E5483F" size={17} className="mt-2.5" />
        </span>
      </span>
    </div>
  );
}

export function PageHero({ eyebrow, title, sub, img, children, aside }: { eyebrow: string; title: string; sub?: string; img: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-[var(--hero)] text-white">
      <img src={img} alt="" className="s2-kenburns absolute inset-0 h-full w-full object-cover opacity-45" />
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--hero)] via-[color-mix(in_srgb,var(--hero)_85%,transparent)] to-[color-mix(in_srgb,var(--hero)_30%,transparent)] rtl:bg-gradient-to-l" />
      <div className={`relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20 ${aside ? "lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12" : ""}`}>
        <div>
        <Reveal><Eyebrow light>{eyebrow}</Eyebrow></Reveal>
        <Reveal delay={80}><h1 className="s2-display max-w-3xl text-[2.6rem] leading-[1.05] sm:text-[3.8rem]">{title}</h1></Reveal>
        {sub && <Reveal delay={160}><p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/75">{sub}</p></Reveal>}
        {children && <Reveal delay={220} className="mt-8">{children}</Reveal>}
        </div>
        {aside && <Reveal delay={200} className="hidden lg:block">{aside}</Reveal>}
      </div>
    </section>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`s2-skel rounded-2xl ${className}`} />;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Doctor card used on home, department and directory pages. */
export function DoctorCard({ d, ur = false, labels }: { d: Doctor; ur?: boolean; labels: { book: string; today: string; next: string; fee: string; profile: string } }) {
  const today = d.next_date === todayISO();
  const ti = (new Date().getDay() + 6) % 7;
  const on = new Set(d.days.map((x) => x.day));
  return (
    <div className={`${card} group flex h-full flex-col overflow-hidden`}>
      <div className="relative flex items-center gap-4 p-5 pb-4">
        {d.photo ? <img src={d.photo} alt={d.doctor_name} className="h-16 w-16 rounded-2xl object-cover" loading="lazy" />
          : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--btn-to)] text-xl font-bold text-white">{initials(d.doctor_name)}</span>}
        <div className="min-w-0">
          <Link to={`/site/doctors/${slugDoc(d)}`} className="block truncate text-[1.05rem] font-bold text-[var(--ink)] hover:text-[var(--primary)]">{d.doctor_name}</Link>
          {ur && d.doctor_name_ur && <div className="text-sm text-[var(--muted)]">{d.doctor_name_ur}</div>}
          <div className="truncate text-sm font-medium text-[var(--primary)]">{d.specialization}</div>
          {d.qualification && <div className="truncate text-xs text-[var(--muted)]">{d.qualification}</div>}
        </div>
      </div>
      <div className="mx-5 flex items-center justify-between gap-2 rounded-2xl bg-[var(--soft)] px-4 py-2.5 text-sm">
        <span className={`inline-flex items-center gap-1.5 font-semibold ${today ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--muted)]"}`}>
          <span className={`h-2 w-2 rounded-full ${today ? "bg-emerald-500" : "bg-[var(--line)]"}`} />{today ? labels.today : d.next_date ? `${labels.next} · ${fmtDate(d.next_date, ur)}` : "—"}</span>
        {d.default_fee ? <span className="shrink-0 whitespace-nowrap font-bold text-[var(--ink)]" dir="ltr">{rs(d.default_fee)}</span> : null}
      </div>
      <div className="flex justify-between gap-1 px-5 pt-4" aria-label="Clinic days">
        {DAYS.map((x, i) => <span key={x} title={x} className={`grid h-7 w-7 place-items-center rounded-full text-[10.5px] font-bold ${on.has(x) ? "bg-[var(--primary)] text-white" : "bg-[var(--soft)] text-[var(--muted)]"} ${i === ti ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]" : ""}`}>{x[0]}</span>)}
      </div>
      <div className="mt-auto flex gap-2 p-5">
        <a href={`/hms/book-appointment?doctor=${encodeURIComponent(d.name)}`} className={`${btn.primary} flex-1 whitespace-nowrap px-3 py-2.5 text-sm`}><CalendarCheck className="h-4 w-4 shrink-0" />{labels.book}</a>
        <Link to={`/site/doctors/${slugDoc(d)}`} className={`${btn.ghost} px-4 py-2.5 text-sm`} aria-label={`${labels.profile}: ${d.doctor_name}`}><ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
      </div>
    </div>
  );
}

export function useTitle(title: string, description?: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Lyallpur Medical Complex, Faisalabad`;
    let m = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const had = !!m; const prevD = m?.content;
    if (description) { if (!m) { m = document.createElement("meta"); m.name = "description"; document.head.appendChild(m); } m.content = description; }
    return () => { document.title = prev; if (m) { if (had) m.content = prevD ?? ""; else m.remove(); } };
  }, [title, description]);
}

/** JSON-LD block for the page (removed on unmount). */
export function useJsonLd(data: object | null) {
  const s = JSON.stringify(data);
  useEffect(() => {
    if (!data) return;
    const el = document.createElement("script"); el.type = "application/ld+json"; el.text = s; document.head.appendChild(el);
    return () => el.remove();
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
}
