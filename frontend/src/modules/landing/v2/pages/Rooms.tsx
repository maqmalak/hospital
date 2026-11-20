import { Link } from "react-router-dom";
import { ArrowRight, BedDouble, Check, Clock3, HeartPulse, Users } from "lucide-react";
import { NZ_ART_CSS, UnitArt } from "../NurseryArt";
import { AMENITIES, CONFIG, PHOTOS } from "../content";
import { rs, type Ward } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { card, PageHero, Reveal, SectionHead, Skeleton, useTitle } from "../ui";

const KIND: Record<string, { title: string; img: string; blurb: string; amen: string[]; icon: typeof BedDouble; anchor?: string; to?: string }> = {
  Private: { title: "Private rooms", img: PHOTOS.room, blurb: "A quiet room of your own with space for an attendant — for rest, privacy and family visits.", amen: AMENITIES.private, icon: BedDouble },
  General: { title: "General wards", img: PHOTOS.lounge, blurb: "Separate wards for men, women and children, with a nurse station on every ward.", amen: AMENITIES.general, icon: Users },
  ICU: { title: "Critical care (ICU / CCU)", img: PHOTOS.icu, blurb: "Monitored beds and specialist nursing around the clock for the most seriously ill.", amen: AMENITIES.critical, icon: HeartPulse },
  Maternity: { title: "Mother & Baby Room (Rooming-in)", img: PHOTOS.room, blurb: "Your baby stays beside you day and night in a calm room with a cot, nursing support and lactation help — the way healthy newborns start best.", amen: ["Baby cot beside your bed", "Nurse call and newborn checks", "Lactation support day and night", "Attendant bed for one female attendant", "Matching mother–baby ID bands", "Private washroom"], icon: BedDouble, anchor: "mother-baby", to: "/site/nursery#units" },
  Nursery: { title: "Well-Baby Nursery", img: "", blurb: "Warm, quiet cots watched around the clock for babies who need observation, phototherapy or while mother rests.", amen: ["Newborn-trained nurses 24/7", "Phototherapy at the cot", "Infant security tags", "Restricted access"], icon: BedDouble, to: "/site/nursery#units" },
  NICU: { title: "NICU — newborn intensive care", img: PHOTOS.icu, blurb: "Incubators, CPAP, ventilators and continuous monitoring for premature and sick newborns. Parents are welcome 24/7.", amen: ["Incubators and radiant warmers", "CPAP and ventilator support", "Continuous monitoring", "Kangaroo mother care"], icon: HeartPulse, anchor: "nicu", to: "/site/nursery#nicu" },
  Emergency: { title: "Emergency bays", img: PHOTOS.corridor, blurb: "Monitored bays for assessment and stabilisation before admission or discharge.", amen: ["Monitored bays", "Resuscitation equipment", "Direct access from the ambulance bay"], icon: HeartPulse },
};
const order = ["Private", "General", "Maternity", "Nursery", "NICU", "ICU", "Emergency"];
const kindOf = (w: Ward) => (KIND[w.ward_type] ? w.ward_type : "General");

export default function Rooms() {
  const { site } = useS2();
  useTitle("Rooms & accommodation", "Private rooms, general wards and ICU / CCU at Lyallpur Medical Complex, Faisalabad — amenities, visiting hours and daily rates.");
  const groups = order.map((k) => ({ k, wards: (site?.wards ?? []).filter((w) => kindOf(w) === k) })).filter((g) => g.wards.length);
  const day = (w: Ward) => (w.bed_charge_per_day || 0) + (w.icu_surcharge_per_day || 0);
  return (
    <>
      <PageHero eyebrow="Rooms & accommodation" title="Comfortable rooms, careful nursing" sub="Choose the room that suits you — every bed has a nurse call, round-the-clock nursing and the same doctors behind it." img={PHOTOS.room} />
      <section className="py-20">
        <Wrap className="space-y-8">
          {!site ? [0, 1].map((i) => <Skeleton key={i} className="h-80" />) : groups.map(({ k, wards }, i) => { const K = KIND[k]; const I = K.icon; return (
            <Reveal key={k}>
              <article id={K.anchor} className={`${card} grid scroll-mt-28 overflow-hidden hover:translate-y-0 lg:grid-cols-2`}>
                <div className={`relative min-h-[280px] ${i % 2 ? "lg:order-2" : ""}`}>{K.img ? <img src={K.img} alt={K.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  : <><style>{NZ_ART_CSS}</style><UnitArt kind="nursery" className="absolute inset-0 h-full" /></>}</div>
                <div className="p-8 sm:p-10">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-6 w-6" /></span>
                  <h2 className="s2-display mt-4 text-[2rem]">{K.title}</h2><p className="mt-2 text-[var(--muted)]">{K.blurb}</p>
                  {K.to && <Link to={K.to} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">Nursery & Newborn Care<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>}
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">{K.amen.map((a) => <li key={a} className="flex items-center gap-2 text-[15px]"><Check className="h-4 w-4 text-[var(--accent)]" />{a}</li>)}</ul>
                  <div className="mt-6 space-y-2">{wards.map((w) => (
                    <div key={w.ward_name} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--soft)] px-4 py-3">
                      <span className="font-semibold">{w.ward_name}{w.beds ? <span className="ms-2 text-sm font-normal text-[var(--muted)]">· {w.beds} beds</span> : null}</span>
                      {CONFIG.showPrices && day(w) ? <span className="text-sm"><b className="text-[var(--primary)]" dir="ltr">{rs(day(w))}</b> / day</span> : <span className="text-sm text-[var(--muted)]">Rate on request</span>}
                    </div>))}</div>
                </div>
              </article>
            </Reveal>); })}
        </Wrap>
      </section>
      {site && site.wards.length > 0 && (
        <section className="bg-[var(--soft)] py-20">
          <Wrap>
            <SectionHead eyebrow="Compare" title="Room types at a glance" />
            <Reveal className="overflow-x-auto rounded-[24px] border border-[var(--line)] bg-[var(--surface)]">
              <table className="w-full min-w-[640px] text-start text-[15px]">
                <thead className="bg-[var(--mint)] text-xs uppercase tracking-wider text-[var(--primary)]"><tr><th className="p-4 text-start">Room</th><th className="p-4 text-start">Type</th><th className="p-4 text-start">For</th><th className="p-4 text-end">Beds</th><th className="p-4 text-end">Bed / day</th><th className="p-4 text-end">Nursing / shift</th></tr></thead>
                <tbody>{site.wards.map((w) => <tr key={w.ward_name} className="border-t border-[var(--line)]"><td className="p-4 font-semibold">{w.ward_name}</td><td className="p-4">{KIND[kindOf(w)].title}</td><td className="p-4">{w.gender || "—"}</td><td className="p-4 text-end">{w.beds || "—"}</td>
                  <td className="p-4 text-end" dir="ltr">{CONFIG.showPrices && day(w) ? rs(day(w)) : "—"}</td><td className="p-4 text-end" dir="ltr">{CONFIG.showPrices && w.nursing_charge_per_shift ? rs(w.nursing_charge_per_shift) : "—"}</td></tr>)}</tbody>
              </table>
            </Reveal>
            <p className="mt-4 text-xs text-[var(--muted)]">Current hospital rates. Medicines, tests, procedures and consultant visits are billed separately; packages are on the Services page.</p>
          </Wrap>
        </section>
      )}
      <section className="py-20">
        <Wrap className="grid gap-5 md:grid-cols-3">
          {([[Clock3, "Visiting hours", CONFIG.visitingHours + ". One attendant may stay with each patient."], [HeartPulse, "Critical-care visits", "Short visits, arranged with the nurse in charge. A family waiting area is next to the unit."], [Users, "Children", "Children under 12 should not visit wards, to protect them and our patients from infection."]] as [typeof Clock3, string, string][]).map(([I, t, d], i) => (
            <Reveal key={t} delay={i * 70} className={`${card} p-7`}><I className="h-8 w-8 text-[var(--accent)]" /><h3 className="mt-4 text-lg font-bold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{d}</p></Reveal>))}
        </Wrap>
      </section>
    </>
  );
}
