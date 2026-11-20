import { useEffect, useId } from "react";

/** VVS brand pieces shared by the landing page, the login page and the app shell (gold on ink, see deliverables/vvs-brand). */
export const GOLD = "#B8913A";
export const INK = "#14171C";
export const goldText = "bg-[linear-gradient(110deg,#B8913A,#F1DE9C_45%,#C9A24A_70%,#E6CF8F)] bg-clip-text text-transparent";
export const goldBtn = "btn-gold inline-flex items-center justify-center gap-2 rounded-xl font-bold transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40 disabled:translate-y-0 disabled:opacity-60";

/** The VVS diamond mark (roof · cross · double check), gold. */
export function VvsMark({ className = "h-9 w-9" }: { className?: string }) {
  const id = "vm" + useId().replace(/:/g, "");
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

/** "VVSDESK" in Cinzel, DESK in gold. */
export function Wordmark({ className = "text-[17px]", light = true }: { className?: string; light?: boolean }) {
  return <span dir="ltr" className={`vvs-brand tracking-[0.28em] ${light ? "text-white" : "text-ink dark:text-white"} ${className}`}>VVS<span className="vvs-gold-text">DESK</span></span>;
}

const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,600&family=Cinzel:wght@600&display=swap";
/** Loads the brand display faces (Cinzel, Cormorant Garamond) once; adds .vvs-brand and .vvs-serif classes. */
export function useBrandFonts() {
  useEffect(() => {
    if (document.getElementById("vvs-brand-fonts")) return;
    const l = document.createElement("link"); l.id = "vvs-brand-fonts"; l.rel = "stylesheet"; l.href = FONTS; document.head.appendChild(l);
    const s = document.createElement("style"); s.id = "vvs-brand-css";
    s.textContent = ".vvs-brand{font-family:'Cinzel',Georgia,serif;font-weight:600}.vvs-serif{font-family:'Outfit',Inter,system-ui,sans-serif;font-weight:600;letter-spacing:-0.01em}"
      + "[dir=rtl] .vvs-serif,[lang=ur] .vvs-serif,[lang=ar] .vvs-serif{font-family:inherit;font-weight:700}";
    document.head.appendChild(s);
  }, []);
}

const BRAND = (f: string) => `${import.meta.env.BASE_URL}brand/${f}`;
/** The hospital's own logo (Lyallpur Medical Complex, D-73): the symbol ("mark") or the full logo with name; a lighter cut in dark mode. */
export function HospitalLogo({ variant = "mark", className = "h-10 w-10", alt = "", onDark = false }: { variant?: "mark" | "full"; className?: string; alt?: string; onDark?: boolean }) {
  const f = variant === "mark" ? "lyallpur-mark" : "lyallpur-logo";
  if (onDark) return <img src={BRAND(`${f}-dark.webp`)} alt={alt} className={`shrink-0 object-contain ${className}`} draggable={false} />;
  return (
    <span className={`relative inline-block shrink-0 ${className}`} role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      <img src={BRAND(`${f}.webp`)} alt="" className="h-full w-full object-contain dark:hidden" draggable={false} />
      <img src={BRAND(`${f}-dark.webp`)} alt="" className="hidden h-full w-full object-contain dark:block" draggable={false} />
    </span>
  );
}

/** Second line under the hospital name. */
export const HOSPITAL_TAGLINE = "LMC";

/** The LMC monogram under the hospital name: serif capitals, wide tracking, between two fine hairlines that fade out.
 *  color = letters, accent = hairlines (website: teal + coral; ERP: inherits the text colour + the palette accent). */
export function LmcMark({ color = "currentColor", accent = "rgb(var(--tl-500))", size = 11, className = "" }: { color?: string; accent?: string; size?: number; className?: string }) {
  const line = (dir: "r" | "l") => (
    <span aria-hidden className="h-px w-5 shrink-0" style={{ background: `linear-gradient(to ${dir === "r" ? "right" : "left"}, transparent, ${accent})` }} />
  );
  return (
    <span dir="ltr" className={`inline-flex items-center gap-2 ${className}`} aria-label={HOSPITAL_TAGLINE}>
      {line("r")}
      <span style={{ fontFamily: "'Fraunces', 'Cormorant Garamond', Georgia, serif", fontSize: size, letterSpacing: "0.5em", marginRight: "-0.5em", color }}
        className="font-semibold leading-none">L<span style={{ color: accent }}>·</span>M<span style={{ color: accent }}>·</span>C</span>
      {line("l")}
    </span>
  );
}
