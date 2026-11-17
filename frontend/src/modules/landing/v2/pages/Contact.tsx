import { Ambulance, CalendarCheck, Clock3, Mail, MapPin, Navigation, Phone, PhoneCall, Siren } from "lucide-react";
import { CONFIG, PHOTOS } from "../content";
import { EnquiryForm } from "../forms";
import { mapQuery, phoneOf, tel } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, PageHero, Reveal, useTitle } from "../ui";

export default function Contact() {
  const { site, phone } = useS2();
  useTitle("Contact us", "Phone numbers, address, map and contact form for Lyallpur Medical Complex, People's Colony No 1, Faisalabad.");
  const q = mapQuery(site?.clinic.address);
  const lines: [typeof Phone, string, string, boolean][] = [[Siren, "Emergency (24/7)", phoneOf("emergency", phone), true], [PhoneCall, "Reception", phoneOf("reception", phone), false],
    [CalendarCheck, "Appointments", phoneOf("appointments", phone), false], [Ambulance, "Ambulance", phoneOf("ambulance", phone), true]];
  return (
    <>
      <PageHero eyebrow="Contact us" title="We're here to help" sub="Call, message or visit — and in an emergency, come straight to the hospital." img={PHOTOS.reception} />
      <section className="py-16">
        <Wrap>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {lines.map(([I, t, p, red], i) => <Reveal key={t} delay={i * 60}><a href={p ? tel(p) : undefined} className={`${card} flex items-center gap-4 p-5`}>
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${red ? "bg-[var(--accent)] text-white" : "bg-[var(--mint)] text-[var(--primary)]"}`}><I className="h-6 w-6" /></span>
              <span><span className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{t}</span><span className="text-lg font-bold" dir="ltr">{p || "—"}</span></span></a></Reveal>)}
          </div>
          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[1.1fr_1fr]">
            <Reveal><EnquiryForm kind="Contact" /></Reveal>
            <div className="space-y-4">
              <Reveal className={`${card} space-y-4 p-6 hover:translate-y-0`}>
                {site?.clinic.address && <p className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-[var(--accent)]" />{site.clinic.address}</p>}
                {CONFIG.email && <a href={`mailto:${CONFIG.email}`} className="flex gap-3"><Mail className="h-5 w-5 shrink-0 text-[var(--accent)]" />{CONFIG.email}</a>}
                <p className="flex gap-3"><Clock3 className="h-5 w-5 shrink-0 text-[var(--accent)]" /><span>Emergency: 24 hours, every day<br />OPD: {CONFIG.opdHours}<br />Pharmacy: {CONFIG.pharmacyHours}</span></p>
              </Reveal>
              <Reveal delay={80} className="overflow-hidden rounded-[24px] border border-[var(--line)]"><iframe title="Map" src={`https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-72 w-full border-0" /></Reveal>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`} target="_blank" rel="noopener noreferrer" className={`${btn.primary} w-full`}><Navigation className="h-5 w-5" />Get directions</a>
            </div>
          </div>
        </Wrap>
      </section>
    </>
  );
}
