import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ICONS } from "./ui";

/**
 * A centre object (logo, globe…) with items circling it as planets on two tilted orbits — hero art for lg screens.
 * Positions are computed per frame (requestAnimationFrame, transforms written straight to the DOM — no re-render):
 * planets in front of the centre grow, brighten and show their name; those behind shrink and fade. Hover pauses the
 * motion so a planet can be clicked. Reduced motion → planets rest in place.
 */
export interface Planet { key: string; label: string; icon: string; to: string }
const W = 480, H = 460, CX = W / 2, CY = H / 2, TILT = (-12 * Math.PI) / 180, SQUASH = 0.44;

export default function Orbit({ items, split, center, rings = [128, 212], periods = [34, 56], glow = 300 }: {
  items: Planet[]; split: number; center: ReactNode; rings?: [number, number]; periods?: [number, number]; glow?: number;
}) {
  const inner = items.slice(0, split), outer = items.slice(split);
  const planets = [...inner.map((p, i) => ({ p, ring: 0, phase: (i / inner.length) * Math.PI * 2 })),
    ...outer.map((p, i) => ({ p, ring: 1, phase: (i / outer.length) * Math.PI * 2 + 0.3 }))];
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const paused = useRef(false);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0, last = performance.now(), raf = 0;
    const place = () => {
      planets.forEach((pl, i) => {
        const el = refs.current[i]; if (!el) return;
        const rx = rings[pl.ring], a = pl.phase + (t / periods[pl.ring]) * Math.PI * 2;
        const x0 = rx * Math.cos(a), y0 = rx * SQUASH * Math.sin(a);
        const x = x0 * Math.cos(TILT) - y0 * Math.sin(TILT), y = x0 * Math.sin(TILT) + y0 * Math.cos(TILT);
        const depth = Math.sin(a); // +1 front (nearest), −1 behind the centre
        const s = 0.72 + 0.28 * ((depth + 1) / 2);
        el.style.transform = `translate(${CX + x}px, ${CY + y}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
        el.style.opacity = (0.45 + 0.55 * ((depth + 1) / 2)).toFixed(2);
        el.style.zIndex = depth > 0 ? "30" : "5";
        el.dataset.front = pl.ring === 1 && depth > 0.9 ? "1" : "0"; // one name at a time: the outer planet nearest the viewer
      });
    };
    const tick = (now: number) => {
      if (!paused.current) t += (now - last) / 1000;
      last = now; place(); raf = requestAnimationFrame(tick);
    };
    place();
    if (!still) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ring = (rx: number, front?: boolean) => {
    const ry = rx * SQUASH;
    return front ? <path d={`M ${CX - rx} ${CY} A ${rx} ${ry} 0 0 0 ${CX + rx} ${CY}`} /> : <ellipse cx={CX} cy={CY} rx={rx} ry={ry} />;
  };
  const rot = `rotate(${(TILT * 180) / Math.PI} ${CX} ${CY})`;

  return (
    <div className="relative" style={{ width: W, height: H }} onMouseEnter={() => (paused.current = true)} onMouseLeave={() => (paused.current = false)}>
      <span aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#14B8A6]/20 blur-3xl" style={{ width: glow, height: glow }} />
      <svg aria-hidden className="absolute inset-0 z-[1]" width={W} height={H} fill="none"><g transform={rot} stroke="rgba(159,227,218,.28)" strokeWidth="1.2">{rings.map((r) => <g key={r}>{ring(r)}</g>)}</g></svg>
      <div aria-hidden className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">{center}</div>
      <svg aria-hidden className="pointer-events-none absolute inset-0 z-20" width={W} height={H} fill="none"><g transform={rot} stroke="rgba(159,227,218,.45)" strokeWidth="1.4">{rings.map((r) => <g key={r}>{ring(r, true)}</g>)}</g></svg>
      {planets.map(({ p, ring: r }, i) => {
        const I = ICONS[p.icon] ?? ICONS.stethoscope;
        const cls = "group absolute left-0 top-0 flex flex-col items-center will-change-transform focus:outline-none";
        const body = (<>
          <span className={`grid place-items-center rounded-full shadow-[0_12px_28px_-10px_rgba(0,0,0,0.7)] ring-1 ring-white/30 transition-colors group-hover:bg-[#FF6B66] group-hover:text-white group-focus-visible:ring-4 group-focus-visible:ring-[#9FE3DA] ${r ? "h-12 w-12 bg-white text-[#0E5E6F]" : "h-11 w-11 bg-[#9FE3DA] text-[#08303A]"}`}>
            <I className="h-5 w-5" />
          </span>
          <span className="mt-1.5 whitespace-nowrap rounded-full bg-[#062229]/70 px-2.5 py-0.5 text-[11px] font-semibold text-white opacity-0 backdrop-blur transition-opacity duration-500 group-hover:opacity-100 group-data-[front=1]:opacity-100">{p.label}</span>
        </>);
        const set = (el: HTMLAnchorElement | null) => { refs.current[i] = el; };
        return p.to.startsWith("#")
          ? <a key={p.key} ref={set} href={p.to} title={p.label} aria-label={p.label} className={cls}>{body}</a>
          : <Link key={p.key} ref={set} to={p.to} title={p.label} aria-label={p.label} className={cls}>{body}</Link>;
      })}
    </div>
  );
}
