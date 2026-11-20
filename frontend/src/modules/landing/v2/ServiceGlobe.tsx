import { SERVICES } from "./content";
import Orbit from "./Orbit";

/**
 * Services hero: a 3D wireframe globe (pure CSS preserve-3d — six meridians and five parallels spinning on a tilted
 * axis around a shaded teal sphere) holding a 3D hospital-logo sign that slowly swings, with every service orbiting as
 * a planet (click → that service's section). Motion stops under prefers-reduced-motion.
 */
const R = 104, D = R * 2;
const MARK = `${import.meta.env.BASE_URL}brand/lyallpur-mark-dark.webp`;

function Globe() {
  return (
    <div className="relative grid place-items-center" style={{ width: D, height: D }}>
      <span className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 32% 28%, #2C8C99 0%, #0E5E6F 38%, #062229 78%)", boxShadow: "inset -22px -28px 56px rgba(0,0,0,.55), inset 16px 14px 36px rgba(159,227,218,.18), 0 40px 80px -30px rgba(0,0,0,.7)" }} />
      {/* 3D logo sign: stacked darker layers behind the coloured face give it thickness; it swings on Y */}
      <span className="s2-core absolute h-[120px] w-[120px] rounded-full" />
      <div className="absolute inset-0 grid place-items-center" style={{ perspective: 600 }}>
        <div className="s2-sign relative h-[104px] w-[104px]" style={{ transformStyle: "preserve-3d" }}>
          {[7, 6, 5, 4, 3, 2, 1].map((z) => <img key={z} src={MARK} alt="" className="absolute inset-0 h-full w-full" style={{ transform: `translateZ(${-z * 1.6}px)`, filter: `brightness(${0.25 + z * 0.02}) saturate(.6)` }} />)}
          <img src={MARK} alt="" className="s2-logo-glow-dark absolute inset-0 h-full w-full" style={{ transform: "translateZ(1px)" }} />
        </div>
      </div>
      {/* wireframe in front of the sign, so it sits inside the globe */}
      <div className="absolute inset-0" style={{ perspective: 900 }}>
        <div className="h-full w-full" style={{ transformStyle: "preserve-3d", transform: "rotateX(-16deg) rotateZ(14deg)" }}>
          <div className="s2-globe relative h-full w-full" style={{ transformStyle: "preserve-3d" }}>
            {[0, 30, 60, 90, 120, 150].map((a) => <span key={a} className="absolute inset-0 rounded-full border border-[#9FE3DA]/35" style={{ transform: `rotateY(${a}deg)` }} />)}
            {[-60, -30, 0, 30, 60].map((lat) => {
              const r = Math.cos((lat * Math.PI) / 180) * R, y = Math.sin((lat * Math.PI) / 180) * R;
              return <span key={lat} className={`absolute rounded-full border ${lat === 0 ? "border-[#9FE3DA]/55" : "border-[#9FE3DA]/25"}`}
                style={{ width: r * 2, height: r * 2, left: R - r, top: R - r, transform: `translateY(${-y}px) rotateX(90deg)` }} />;
            })}
            {[[20, 25, "#FF6B66"], [110, -15, "#9FE3DA"], [200, 40, "#FF6B66"], [290, 5, "#FFFFFF"], [160, -45, "#9FE3DA"]].map(([lon, lat, c], i) => (
              <span key={i} className="absolute left-1/2 top-1/2 -ml-1 -mt-1 h-2 w-2 rounded-full" style={{ background: c as string, boxShadow: `0 0 12px 3px ${c}99`, transform: `rotateY(${lon}deg) rotateX(${lat}deg) translateZ(${R}px)` }} />
            ))}
          </div>
        </div>
      </div>
      <span className="pointer-events-none absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle at 30% 22%, rgba(255,255,255,.26), transparent 40%)" }} />
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"><span className="s2-sweep absolute inset-y-0 -left-1/2 w-1/2" /></span>
    </div>
  );
}

/** `base`: where a planet links — "#" on the Services page itself, "/site/services#" elsewhere. */
export default function ServiceGlobe({ base = "#" }: { base?: string }) {
  return <Orbit split={5} rings={[150, 222]} periods={[30, 50]} glow={340} center={<Globe />}
    items={SERVICES.map((s) => ({ key: s.id, label: s.title, icon: s.icon, to: s.href ?? `${base}${s.id}` }))} />;
}
