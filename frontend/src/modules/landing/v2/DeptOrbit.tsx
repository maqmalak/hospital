import { DEPARTMENTS } from "./content";
import Orbit from "./Orbit";

/** Departments hero: the hospital logo as the sun, every department a planet (opens its page). */
export default function DeptOrbit({ to = (slug: string) => `/site/departments/${slug}` }: { to?: (slug: string) => string }) {
  return (
    <Orbit split={5} items={DEPARTMENTS.map((d) => ({ key: d.slug, label: d.name.replace(/ \(.*\)$/, ""), icon: d.icon, to: to(d.slug) }))}
      center={
        <div className="relative grid h-[156px] w-[156px] place-items-center">
          {/* corona: soft turning rays + breathing halo behind the sun */}
          <span className="s2-corona absolute -inset-[70px] rounded-full" />
          <span className="s2-halo absolute -inset-[6px] rounded-full" />
          <span className="s2-pulse-soft absolute -inset-[24px] rounded-full border border-white/20" />
          {/* the sun: white disc with a light sweep and the glowing mark */}
          <span className="relative grid h-full w-full place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_35%_30%,#FFFFFF_0%,#F4FBFA_55%,#D9F1EE_100%)] shadow-[0_0_0_5px_rgba(255,255,255,0.55),0_0_0_12px_rgba(255,236,170,0.22),0_0_30px_14px_rgba(255,236,170,0.35)]">
            <img src={`${import.meta.env.BASE_URL}brand/lyallpur-mark.webp`} alt="" width={256} height={256} className="s2-logo-glow relative h-[108px] w-[108px]" />
            <span className="s2-sweep pointer-events-none absolute inset-y-0 -left-1/2 w-1/2" />
          </span>
        </div>
      } />
  );
}
