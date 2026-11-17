import { Clock3, MapPin, Pill, ShieldCheck, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { CONFIG, PHOTOS } from "../content";
import { EnquiryForm } from "../forms";
import { Wrap } from "../SiteV2";
import { card, PageHero, Reveal, SectionHead, useTitle } from "../ui";

export default function Pharmacy() {
  useTitle("Pharmacy", "In-house pharmacy at Lyallpur Medical Complex, Faisalabad — prescriptions, medicine availability enquiries and opening hours.");
  const facts: [typeof Pill, string, string][] = [[Clock3, "Opening hours", CONFIG.pharmacyHours], [MapPin, "Where", "Ground floor, next to reception — follow the green Pharmacy signs."],
    [ShieldCheck, "Genuine medicines", "Stocked from authorised distributors, batch- and expiry-tracked, stored at the right temperature."], [Truck, "Home delivery", "For repeat prescriptions in Faisalabad — ask at the counter or send an enquiry below."]];
  return (
    <>
      <PageHero eyebrow="Pharmacy" title="Your prescriptions, in the same building" sub="Collect medicines right after your consultation — your doctor's e-prescription reaches the counter before you do." img={PHOTOS.pharmacy} />
      <section className="py-20"><Wrap className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{facts.map(([I, t, d], i) => <Reveal key={t} delay={i * 70} className={`${card} p-6`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-6 w-6" /></span><h3 className="mt-4 font-bold">{t}</h3><p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{d}</p></Reveal>)}</Wrap></section>
      <section className="bg-[var(--soft)] py-20">
        <Wrap className="grid items-start gap-10 lg:grid-cols-[1fr_1.2fr]">
          <Reveal><SectionHead eyebrow="Ask the pharmacy" title="Is my medicine available?" sub="Send the medicine names (as written on your prescription) and the quantity. A pharmacist will call you back to confirm availability and price." />
            <ul className="-mt-4 space-y-2 text-[15px] text-[var(--muted)]"><li>• Prescription-only medicines are dispensed against a valid prescription — bring it, or show it on your phone.</li><li>• Controlled medicines need the original signed prescription.</li><li>• Already a patient? Your e-prescription is on file — just give your MR number.</li></ul>
            <Link to="/site/map?q=pharmacy" className="mt-6 inline-block text-sm font-semibold text-[var(--primary)]">Find the pharmacy on the map →</Link></Reveal>
          <Reveal delay={100}><EnquiryForm kind="Pharmacy" messageLabel="Medicines and quantities" submit="Send enquiry" note="A pharmacist replies during opening hours. In an emergency, come to the hospital." /></Reveal>
        </Wrap>
      </section>
    </>
  );
}
