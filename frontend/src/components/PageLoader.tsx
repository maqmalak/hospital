/** Page / route loader = the home page's glowing logo board: the round LMC mark on a white disc with a breathing warm halo,
 *  two golden rings rippling outward, a light sweep and the mark's red glow — the mark itself turns slowly as the spinner.
 *  Same look as the website hero (orbitCss / Home logo board), sized for a loading screen; still under prefers-reduced-motion. */
export function PageLoader({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  const mark = `${import.meta.env.BASE_URL}brand/lyallpur-mark.webp`;
  return (
    <div role="status" aria-live="polite" className={`flex h-full min-h-[55vh] flex-col items-center justify-center gap-8 ${className}`}>
      <style>{CSS}</style>
      <div aria-hidden className="relative h-[112px] w-[112px]">
        <span className="pl-bring absolute inset-0 rounded-full" />
        <span className="pl-bring absolute inset-0 rounded-full" style={{ animationDelay: "1.1s" }} />
        <span className="pl-halo absolute inset-0 overflow-hidden rounded-full bg-white ring-2 ring-white/80">
          <img src={mark} alt="" className="pl-mark absolute inset-[9%] h-[82%] w-[82%] object-contain" />
          <span className="pl-sweep absolute inset-y-0 -left-1/2 w-1/2 opacity-70" />
        </span>
      </div>
      <span className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">{label}<span className="pl-dots" aria-hidden /></span>
    </div>
  );
}

const CSS = `
.pl-bring{border:2px solid rgba(255,236,170,.85);box-shadow:0 0 18px 4px rgba(255,236,170,.6);animation:plbring 2.2s ease-out infinite}
@keyframes plbring{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.9)}}
.pl-halo{box-shadow:0 0 36px 10px rgba(255,236,170,.40),0 0 80px 26px rgba(159,227,218,.30);animation:plhalo 2.4s ease-in-out infinite}
@keyframes plhalo{0%,100%{box-shadow:0 0 30px 8px rgba(255,236,170,.38),0 0 70px 22px rgba(159,227,218,.28)}50%{box-shadow:0 0 52px 18px rgba(255,236,170,.62),0 0 110px 38px rgba(159,227,218,.42)}}
.pl-mark{animation:plspin 2.6s cubic-bezier(.45,.05,.55,.95) infinite,plglow 2.4s ease-in-out infinite}
@keyframes plspin{to{transform:rotate(360deg)}}
@keyframes plglow{0%,100%{filter:drop-shadow(0 0 4px rgba(255,107,102,.35))}50%{filter:drop-shadow(0 0 14px rgba(255,107,102,.7)) brightness(1.08)}}
.pl-sweep{background:linear-gradient(105deg,transparent 20%,rgba(255,255,255,.75) 50%,transparent 80%);transform:skewX(-18deg);animation:plsweep 2.6s ease-in-out infinite}
@keyframes plsweep{0%,35%{left:-60%}80%,100%{left:130%}}
.pl-dots::after{content:"";animation:pldots 1.4s steps(4,end) infinite}
@keyframes pldots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
@media (prefers-reduced-motion: reduce){.pl-bring,.pl-halo,.pl-mark,.pl-sweep,.pl-dots::after{animation:none}.pl-bring{opacity:.35}}
`;
