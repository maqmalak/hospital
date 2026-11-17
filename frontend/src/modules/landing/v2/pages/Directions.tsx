import { Ambulance, Bus, Car, MapPin, Navigation, Phone } from "lucide-react";
import { PHOTOS } from "../content";
import { mapQuery, phoneOf, tel } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, PageHero, Reveal, useTitle } from "../ui";

export default function Directions() {
  const { site, phone } = useS2();
  useTitle("Get directions", "How to reach Lyallpur Medical Complex, 671A Peoples Colony No 1, Canal Road, Faisalabad — map, parking and ambulance entrance.");
  const q = mapQuery(site?.clinic.address);
  const er = phoneOf("ambulance", phone);
  const info: [typeof Car, string, string][] = [
    [Car, "By car & parking", "Canal Road, Peoples Colony No 1. Visitor parking is at the front of the building and in the basement — follow the blue P signs."],
    [Bus, "Rickshaw, taxi & ride-hailing", "Ask for “Lyallpur Medical Complex, Canal Road, Peoples Colony”. Drop-off is at the main entrance, in front of reception."],
    [Ambulance, "Ambulance & emergency entrance", "The emergency entrance is on the ground floor, marked in red. Please keep the ambulance bay clear at all times."],
  ];
  return (
    <>
      <PageHero eyebrow="Get directions" title="Find us on Canal Road" sub={site?.clinic.address ?? "Canal Road, Faisalabad"} img={PHOTOS.building}>
        <div className="flex flex-wrap gap-3"><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`} target="_blank" rel="noopener noreferrer" className={btn.primary}><Navigation className="h-5 w-5" />Start navigation</a>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`} target="_blank" rel="noopener noreferrer" className={btn.glass}><MapPin className="h-5 w-5" />Open in Google Maps</a></div>
      </PageHero>
      <section className="py-16">
        <Wrap className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Reveal className="overflow-hidden rounded-[28px] border border-[var(--line)] shadow-[0_30px_60px_-40px_rgba(8,48,58,0.6)]">
            <iframe title="Map: Lyallpur Medical Complex, Faisalabad" src={`https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-[460px] w-full border-0" />
          </Reveal>
          <div className="space-y-4">
            {info.map(([I, t, d], i) => <Reveal key={t} delay={i * 70} className={`${card} flex gap-4 p-5`}><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-6 w-6" /></span><div><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{d}</p></div></Reveal>)}
            {er && <Reveal delay={220}><a href={tel(er)} className="flex items-center gap-4 rounded-[22px] bg-[var(--accent)] p-5 text-white"><Phone className="h-6 w-6" /><span><span className="block text-sm opacity-80">Ambulance & emergency</span><span className="text-lg font-bold" dir="ltr">{er}</span></span></a></Reveal>}
          </div>
        </Wrap>
      </section>
    </>
  );
}
