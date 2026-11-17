import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { DEPARTMENTS } from "./content";
import { ICONS } from "./ui";

/**
 * Departments hero (lg and up): the hospital logo as the sun, every department a planet on one of two tilted orbits.
 * Positions are computed per frame (requestAnimationFrame, transforms written straight to the DOM — no re-render):
 * planets in front of the logo grow, brighten and show their name; those behind shrink and fade. Hover pauses the
 * motion so a planet can be clicked (each opens its department). Reduced motion → planets rest in place.
 */
const W = 480, H = 460, CX = W / 2, CY = H / 2, TILT = (-12 * Math.PI) / 180, SQUASH = 0.44;
const RINGS = [{ rx: 128, period: 34 }, { rx: 212, period: 56 }];

export default function DeptOrbit() {
  const inner = DEPARTMENTS.slice(0, 5), outer = DEPARTMENTS.slice(5);
  const planets = [...inner.map((d, i) => ({ d, ring: 0, phase: (i / inner.length) * Math.PI * 2 })),
    ...outer.map((d, i) => ({ d, ring: 1, phase: (i / outer.length) * Math.PI * 2 + 0.3 }))];
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const paused = useRef(false);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0, last = performance.now(), raf = 0;
    const place = () => {
      planets.forEach((p, i) => {
        const el = refs.current[i]; if (!el) return;
        const { rx, period } = RINGS[p.ring];
        const a = p.phase + (t / period) * Math.PI * 2;
        const x0 = rx * Math.cos(a), y0 = rx * SQUASH * Math.sin(a);
        const x = x0 * Math.cos(TILT) - y0 * Math.sin(TILT), y = x0 * Math.sin(TILT) + y0 * Math.cos(TILT);
        const depth = Math.sin(a); // +1 front (nearest), −1 behind the logo
        const s = 0.72 + 0.28 * ((depth + 1) / 2);
        el.style.transform = `translate(${CX + x}px, ${CY + y}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
        el.style.opacity = (0.45 + 0.55 * ((depth + 1) / 2)).toFixed(2);
        el.style.zIndex = depth > 0 ? "30" : "5";
        el.dataset.front = p.ring === 1 && depth > 0.9 ? "1" : "0"; // one name at a time: the outer planet nearest the viewer
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

  const ring = (rx: number, half?: "front") => {
    const ry = rx * SQUASH;
    return half ? <path d={`M ${CX - rx} ${CY} A ${rx} ${ry} 0 0 0 ${CX + rx} ${CY}`} /> : <ellipse cx={CX} cy={CY} rx={rx} ry={ry} />;
  };
  const rot = `rotate(${(TILT * 180) / Math.PI} ${CX} ${CY})`;

  return (
    <div className="relative" style={{ width: W, height: H }} onMouseEnter={() => (paused.current = true)} onMouseLeave={() => (paused.current = false)}>
      <span aria-hidden className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#14B8A6]/20 blur-3xl" />
      {/* full orbits, behind the sun */}
      <svg aria-hidden className="absolute inset-0 z-[1]" width={W} height={H} fill="none"><g transform={rot} stroke="rgba(159,227,218,.28)" strokeWidth="1.2">{RINGS.map((r) => <g key={r.rx}>{ring(r.rx)}</g>)}</g></svg>
      {/* the sun: hospital logo */}
      <div aria-hidden className="absolute left-1/2 top-1/2 z-10 grid h-[156px] w-[156px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-[0_0_0_10px_rgba(255,255,255,0.08),0_0_60px_10px_rgba(159,227,218,0.35),0_30px_60px_-20px_rgba(0,0,0,0.6)]">
        <span className="s2-pulse-soft absolute -inset-[22px] rounded-full border border-white/15" />
        <img src={`${import.meta.env.BASE_URL}brand/lyallpur-mark.webp`} alt="" width={256} height={256} className="h-[108px] w-[108px]" />
      </div>
      {/* front halves of the orbits pass over the sun */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 z-20" width={W} height={H} fill="none"><g transform={rot} stroke="rgba(159,227,218,.45)" strokeWidth="1.4">{RINGS.map((r) => <g key={r.rx}>{ring(r.rx, "front")}</g>)}</g></svg>
      {planets.map((p, i) => {
        const I = ICONS[p.d.icon] ?? ICONS.stethoscope;
        return (
          <Link key={p.d.slug} ref={(el) => { refs.current[i] = el; }} to={`/site/departments/${p.d.slug}`} title={p.d.name} aria-label={p.d.name}
            className="group absolute left-0 top-0 flex flex-col items-center will-change-transform focus:outline-none">
            <span className={`grid place-items-center rounded-full shadow-[0_12px_28px_-10px_rgba(0,0,0,0.7)] ring-1 ring-white/30 transition-colors group-hover:bg-[#FF6B66] group-hover:text-white group-focus-visible:ring-4 group-focus-visible:ring-[#9FE3DA] ${p.ring ? "h-12 w-12 bg-white text-[#0E5E6F]" : "h-11 w-11 bg-[#9FE3DA] text-[#08303A]"}`}>
              <I className="h-5 w-5" />
            </span>
            <span className="mt-1.5 whitespace-nowrap rounded-full bg-[#062229]/70 px-2.5 py-0.5 text-[11px] font-semibold text-white opacity-0 backdrop-blur transition-opacity duration-500 group-hover:opacity-100 group-data-[front=1]:opacity-100">
              {p.d.name.replace(/ \(.*\)$/, "")}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
