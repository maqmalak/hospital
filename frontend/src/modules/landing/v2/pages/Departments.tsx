import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { DEPARTMENTS, PHOTOS } from "../content";
import { doctorsOf, useDoctors } from "../data";
import { Wrap } from "../SiteV2";
import DeptOrbit from "../DeptOrbit";
import { card, ICONS, PageHero, Reveal, useTitle } from "../ui";

export default function Departments() {
  useTitle("Departments", "Specialist departments at Lyallpur Medical Complex, Faisalabad: cardiology, emergency, neurology, nephrology & dialysis, orthopaedics, gynaecology, paediatrics, surgery, radiology and laboratory.");
  const [q, setQ] = useState("");
  const [opts] = useDoctors();
  const list = useMemo(() => DEPARTMENTS.filter((d) => `${d.name} ${d.summary} ${d.services.join(" ")}`.toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <>
      <PageHero eyebrow="Departments" title="Specialist care, under one roof" sub={`${DEPARTMENTS.length} departments sharing one medical record — so your consultant, the lab, radiology and the pharmacy all see the same information.`} img={PHOTOS.corridor} aside={<DeptOrbit />}>
        <label className="flex max-w-md items-center gap-3 rounded-full border border-white/25 bg-white/10 px-5 backdrop-blur-md focus-within:ring-4 focus-within:ring-white/20">
          <Search className="h-5 w-5 text-white/70" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search departments or services" aria-label="Search departments" className="h-[52px] flex-1 bg-transparent text-white outline-none placeholder:text-white/60" />
        </label>
      </PageHero>
      <section className="py-20">
        <Wrap>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d, i) => { const I = ICONS[d.icon]; const n = opts ? doctorsOf(d, opts.doctors).length : 0; return (
              <Reveal key={d.slug} delay={(i % 3) * 70}>
                <Link to={`/site/departments/${d.slug}`} className={`${card} group flex h-full flex-col overflow-hidden`}>
                  <div className="relative h-44 overflow-hidden"><img src={d.img} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_srgb,var(--hero)_75%,transparent)] to-transparent" />
                    <span className="absolute bottom-4 start-4 grid h-12 w-12 place-items-center rounded-2xl bg-white/90 text-[var(--primary)] shadow-lg"><I className="h-6 w-6" /></span>
                    {n > 0 && <span className="absolute end-4 top-4 rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white backdrop-blur">{n} consultant{n > 1 ? "s" : ""}</span>}</div>
                  <div className="flex flex-1 flex-col p-6"><h2 className="text-lg font-bold">{d.name}</h2><p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--muted)]">{d.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">{d.services.slice(0, 3).map((s) => <span key={s} className="rounded-full bg-[var(--soft)] px-2.5 py-1 text-xs">{s}</span>)}</div>
                    <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">View department<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1 rtl:rotate-180" /></span></div>
                </Link>
              </Reveal>); })}
          </div>
          {!list.length && <p className="py-16 text-center text-[var(--muted)]">No department matches “{q}”.</p>}
        </Wrap>
      </section>
    </>
  );
}
