import { useEffect, useId } from "react";

/** VVS brand pieces shared by the landing page, the login page and the app shell (gold on ink, see deliverables/vvs-brand). */
export const GOLD = "#B8913A";
export const INK = "#14171C";
export const goldText = "bg-[linear-gradient(110deg,#B8913A,#F1DE9C_45%,#C9A24A_70%,#E6CF8F)] bg-clip-text text-transparent";
export const goldBtn = "inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#A88536,#E6CF8F_50%,#B8913A)] font-bold text-[#14171C] shadow-[0_12px_28px_-12px_rgba(184,145,58,0.9)] ring-1 ring-inset ring-white/30 transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#B8913A]/40 disabled:translate-y-0 disabled:opacity-60";

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
  return <span dir="ltr" className={`vvs-brand tracking-[0.28em] ${light ? "text-white" : "text-[#14171C] dark:text-white"} ${className}`}>VVS<span className={goldText}>DESK</span></span>;
}

const FONTS = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,600&family=Cinzel:wght@600&display=swap";
/** Loads the brand display faces (Cinzel, Cormorant Garamond) once; adds .vvs-brand and .vvs-serif classes. */
export function useBrandFonts() {
  useEffect(() => {
    if (document.getElementById("vvs-brand-fonts")) return;
    const l = document.createElement("link"); l.id = "vvs-brand-fonts"; l.rel = "stylesheet"; l.href = FONTS; document.head.appendChild(l);
    const s = document.createElement("style"); s.id = "vvs-brand-css";
    s.textContent = ".vvs-brand{font-family:'Cinzel',Georgia,serif;font-weight:600}.vvs-serif{font-family:'Cormorant Garamond',Georgia,serif}";
    document.head.appendChild(s);
  }, []);
}
