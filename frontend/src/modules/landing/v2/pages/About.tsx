import { Link } from "react-router-dom";
import { ArrowRight, Eye, HeartHandshake, Lightbulb, ShieldCheck, Target, Users } from "lucide-react";
import { CONFIG, DEPARTMENTS, PHOTOS } from "../content";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, Counter, PageHero, Reveal, SectionHead, useTitle } from "../ui";

const VALUES: [typeof Eye, string, string][] = [
  [HeartHandshake, "Compassion", "We treat every patient the way we would want our own family treated — with patience, dignity and clear explanations."],
  [ShieldCheck, "Safety", "Checks at every step: verified lab results, signed prescriptions, triage on arrival and a single record that prevents repeated or conflicting treatment."],
  [Lightbulb, "Evidence", "Care based on current guidelines, modern diagnostics and specialists who keep learning — the reason we are a medical and research centre."],
  [Users, "Teamwork", "Consultants, nurses, technologists and pharmacists working from the same information, so care is joined up from clinic to ward."],
];

export default function About() {
  const { site } = useS2();
  useTitle("About us", "Lyallpur Medical Complex is a multi-specialty hospital and research centre in People's Colony No 1, Faisalabad.");
  const shots: [string, string][] = [[PHOTOS.building, "The hospital, People's Colony"], [PHOTOS.reception, "Reception"], [PHOTOS.lounge, "Waiting lounge"], [PHOTOS.corridor, "Clear wayfinding"], [PHOTOS.room, "Private room"], [PHOTOS.icu, "Intensive care"], [PHOTOS.pharmacy, "Pharmacy"]];
  return (
    <>
      <PageHero eyebrow="About us" title="A hospital built around the patient" sub="Lyallpur Medical Complex brings consultants, emergency care, diagnostics, surgery and inpatient wards together in People's Colony No 1, Faisalabad — one building, one team, one medical record." img={PHOTOS.building} />
      <section className="py-24">
        <Wrap className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <SectionHead eyebrow="Our story" title="Medical & Research Center for Faisalabad" />
            <div className="-mt-6 space-y-4 text-[1.05rem] leading-relaxed text-[var(--muted)]">
              <p>Faisalabad deserves specialist care close to home. Lyallpur Medical Complex was planned so families no longer need to travel to Lahore or Islamabad for consultants, advanced imaging or intensive care.</p>
              <p>The eight-floor building puts emergency, pharmacy and reception on the ground floor, clinics and diagnostics above, and theatres, critical care and wards on the upper floors — so every journey through the hospital is short and signposted.</p>
              <p>Every department works from the same electronic record. Your doctor sees your tests, scans and medicines in one place, results reach your phone, and nothing has to be repeated.</p>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {([[CONFIG.beds || site?.beds || 0, "Beds"], [8, "Floors"], [DEPARTMENTS.length, "Departments"]] as [number, string][]).map(([n, l]) => <div key={l} className={`${card} p-5 text-center`}><div className="s2-display text-4xl text-[var(--primary)]"><Counter to={n} /></div><div className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{l}</div></div>)}
            </div>
          </Reveal>
          <Reveal delay={120} className="relative">
            <img src={PHOTOS.building} alt="Lyallpur Medical Complex building" className="aspect-[4/5] w-full rounded-[32px] object-cover shadow-[0_40px_80px_-40px_rgba(8,48,58,0.7)]" loading="lazy" />
            <div className="absolute -bottom-6 start-6 max-w-xs rounded-[22px] border border-white/30 bg-white/80 p-5 shadow-xl backdrop-blur-xl dark:bg-[#0D2730]/85"><div className="s2-display text-xl">Healing with excellence</div><div className="mt-1 text-sm text-[var(--muted)]">People's Colony No 1, Faisalabad</div></div>
          </Reveal>
        </Wrap>
      </section>
      <section className="bg-[var(--soft)] py-24">
        <Wrap>
          <div className="grid gap-5 md:grid-cols-2">
            <Reveal className={`${card} p-8`}><Target className="h-9 w-9 text-[var(--accent)]" /><h3 className="s2-display mt-4 text-2xl">Our mission</h3><p className="mt-3 leading-relaxed text-[var(--muted)]">To give every patient in Faisalabad and the surrounding region safe, specialist and affordable care — explained clearly, delivered on time, and recorded once so it follows them everywhere in the hospital.</p></Reveal>
            <Reveal delay={80} className={`${card} p-8`}><Eye className="h-9 w-9 text-[var(--accent)]" /><h3 className="s2-display mt-4 text-2xl">Our vision</h3><p className="mt-3 leading-relaxed text-[var(--muted)]">To be the hospital families in central Punjab trust first — recognised for clinical quality, research and the kindness of our people.</p></Reveal>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(([I, t, d], i) => <Reveal key={t} delay={i * 70} className={`${card} p-6`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-6 w-6" /></span><h4 className="mt-4 text-lg font-bold">{t}</h4><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{d}</p></Reveal>)}
          </div>
        </Wrap>
      </section>
      {CONFIG.leadership.length > 0 && <section className="py-24"><Wrap><SectionHead eyebrow="Leadership" title="The people who lead us" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{CONFIG.leadership.map((p) => <Reveal key={p.name} className={`${card} overflow-hidden`}>{p.photo && <img src={p.photo} alt={p.name} className="aspect-square w-full object-cover" />}<div className="p-5"><div className="font-bold">{p.name}</div><div className="text-sm text-[var(--muted)]">{p.role}</div></div></Reveal>)}</div></Wrap></section>}
      {CONFIG.accreditations.length > 0 && <section className="pb-24"><Wrap><SectionHead eyebrow="Recognition" title="Accreditations" />
        <div className="flex flex-wrap gap-4">{CONFIG.accreditations.map((a) => <div key={a.name} className={`${card} flex items-center gap-3 px-6 py-4`}>{a.logo && <img src={a.logo} alt="" className="h-10" />}<span className="font-semibold">{a.name}</span></div>)}</div></Wrap></section>}
      <section id="tour" className="scroll-mt-28 py-24">
        <Wrap>
          <SectionHead eyebrow="Virtual tour" title="Walk through the hospital" sub="Architectural visualisations of the building and its spaces." />
          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {shots.map(([src, l], i) => <Reveal key={l} delay={(i % 3) * 70} className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[24px]"><img src={src} alt={l} loading="lazy" className="w-full transition duration-700 group-hover:scale-105" /><span className="absolute bottom-3 start-3 rounded-full bg-black/40 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">{l}</span></Reveal>)}
          </div>
          <div className="mt-10 flex flex-wrap gap-3"><Link to="/site/map" className={btn.teal}>Explore the floor map<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link><Link to="/site/directions" className={btn.ghost}>Get directions</Link></div>
        </Wrap>
      </section>
    </>
  );
}
