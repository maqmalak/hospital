import { DEPARTMENTS } from "./content";
import Orbit from "./Orbit";

/** Departments hero: the hospital logo as the sun, every department a planet (opens its page). */
export default function DeptOrbit() {
  return (
    <Orbit split={5} items={DEPARTMENTS.map((d) => ({ key: d.slug, label: d.name.replace(/ \(.*\)$/, ""), icon: d.icon, to: `/site/departments/${d.slug}` }))}
      center={
        <div className="relative grid h-[156px] w-[156px] place-items-center rounded-full bg-white shadow-[0_0_0_10px_rgba(255,255,255,0.08),0_0_60px_10px_rgba(159,227,218,0.35),0_30px_60px_-20px_rgba(0,0,0,0.6)]">
          <span className="s2-pulse-soft absolute -inset-[22px] rounded-full border border-white/15" />
          <img src={`${import.meta.env.BASE_URL}brand/lyallpur-mark.webp`} alt="" width={256} height={256} className="h-[108px] w-[108px]" />
        </div>
      } />
  );
}
