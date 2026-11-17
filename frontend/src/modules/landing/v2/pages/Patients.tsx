import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { BadgeCheck, ChevronDown, ClipboardList, CreditCard, FileText, FlaskConical, Scale, ShieldCheck, Video } from "lucide-react";
import { CONFIG, FAQS, PHOTOS } from "../content";
import { Wrap } from "../SiteV2";
import { btn, card, PageHero, Reveal, SectionHead, useJsonLd, useTitle } from "../ui";

const STEPS: [string, string][] = [
  ["Registration", "At reception with the patient's CNIC or B-form. You receive an MR number and patient card that stay the same for every visit."],
  ["Consultant decision", "Your consultant explains why admission is advised, what is planned and the expected length of stay."],
  ["Estimate & deposit", "The billing desk gives an estimate (or confirms panel / insurance cover) and takes the admission deposit."],
  ["Bed allocation", "A nurse takes you to your room or ward, explains the call bell and visiting rules, and records your vitals."],
  ["Discharge", "You receive a discharge summary, home medicines, follow-up date and the final bill. Reports stay available on your phone."],
];
const RIGHTS = ["Be treated with respect, privacy and dignity, regardless of gender, religion, background or ability to pay.", "Receive clear information about your illness, treatment options, risks and costs, in a language you understand.",
  "Give or refuse consent before any procedure, and ask for a second opinion.", "Have your records kept confidential and receive copies of your reports.", "Raise a concern or complaint and receive a response, without it affecting your care."];

export default function Patients() {
  const loc = useLocation();
  const [open, setOpen] = useState(0);
  useTitle("Patients & visitors", "Admission, visiting hours, insurance and panels, billing, patient rights and FAQs at Lyallpur Medical Complex, Faisalabad.");
  useJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQS.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
  useEffect(() => { if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 250); }, [loc.hash]);
  return (
    <>
      <PageHero eyebrow="Patients & visitors" title="Everything you need to know before you come" sub="Admission, visiting, payments and your rights — explained simply." img={PHOTOS.lounge} />
      <section id="portal" className="scroll-mt-28 py-20">
        <Wrap>
          <SectionHead eyebrow="Patient portal" title="Your care, on your phone" sub="No app or password needed — secure links arrive by SMS or WhatsApp." />
          <div className="grid gap-5 md:grid-cols-3">
            {([[FlaskConical, "Lab reports", "A secure link with a QR code anyone can scan to confirm the report is genuine.", "", ""], [ClipboardList, "Appointments", "Book online and manage or cancel from the link in your confirmation SMS.", "/hms/book-appointment", "Book now"],
              [Video, "Online consultation", "Request a video follow-up and receive an e-prescription.", "/hms/online-visit", "Request a visit"]] as [typeof Video, string, string, string, string][]).map(([I, t, d, href, cta], i) => (
              <Reveal key={t} delay={i * 70} className={`${card} flex flex-col p-7`}><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-6 w-6" /></span><h3 className="mt-4 text-lg font-bold">{t}</h3><p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--muted)]">{d}</p>
                {href && <a href={href} className={`${btn.teal} mt-5 py-2.5 text-sm`}>{cta}</a>}</Reveal>))}
          </div>
        </Wrap>
      </section>
      <section className="bg-[var(--soft)] py-20">
        <Wrap className="grid gap-10 lg:grid-cols-2">
          <Reveal><SectionHead eyebrow="Admission" title="How admission works" />
            <ol className="relative -mt-4 space-y-5 border-s-2 border-[var(--line)] ps-8">{STEPS.map(([t, d], i) => <li key={t} className="relative"><span className="absolute -start-[45px] grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">{i + 1}</span><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{d}</p></li>)}</ol></Reveal>
          <div className="space-y-5">
            <Reveal className={`${card} p-7`}><BadgeCheck className="h-8 w-8 text-[var(--accent)]" /><h3 className="mt-3 text-lg font-bold">Visiting hours</h3><p className="mt-1 text-[var(--muted)]">{CONFIG.visitingHours}. One attendant may stay with each patient; critical-care visits are arranged with the nurse in charge.</p></Reveal>
            <Reveal delay={70} className={`${card} p-7`}><ShieldCheck className="h-8 w-8 text-[var(--accent)]" /><h3 className="mt-3 text-lg font-bold">Insurance & corporate panels</h3><p className="mt-1 text-[var(--muted)]">We treat patients under the panels and insurers we work with. Bring your panel card or authorisation letter — billing confirms your cover before planned treatment.</p></Reveal>
            <Reveal delay={140} className={`${card} p-7`}><CreditCard className="h-8 w-8 text-[var(--accent)]" /><h3 className="mt-3 text-lg font-bold">Billing</h3><p className="mt-1 text-[var(--muted)]">Pay by cash or card at the billing desk, or by the bank and mobile-wallet options on your bill. Admitted patients receive interim bills and a final itemised bill at discharge.</p></Reveal>
          </div>
        </Wrap>
      </section>
      <section id="rights" className="scroll-mt-28 py-20">
        <Wrap className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <Reveal><SectionHead eyebrow="Your rights" title="Patient rights & privacy" />
            <ul className="-mt-4 space-y-3">{RIGHTS.map((r) => <li key={r} className="flex gap-3"><Scale className="mt-1 h-5 w-5 shrink-0 text-[var(--primary)]" /><span className="text-[15px] leading-relaxed">{r}</span></li>)}</ul>
            <p className="mt-6 flex gap-3 text-sm text-[var(--muted)]"><FileText className="h-5 w-5 shrink-0" />We use your information only for your care, billing and legal requirements, and never sell it. This website stores your language and theme choice in your browser only.</p></Reveal>
          <Reveal delay={100}><h2 className="s2-display mb-5 text-3xl">Frequently asked questions</h2>
            <div className="space-y-3">{FAQS.map(([q, a], i) => (
              <div key={q} className={`overflow-hidden rounded-[20px] border bg-[var(--surface)] transition ${open === i ? "border-[var(--primary)]" : "border-[var(--line)]"}`}>
                <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-4 p-5 text-start font-semibold">{q}<ChevronDown className={`h-5 w-5 shrink-0 transition ${open === i ? "rotate-180 text-[var(--primary)]" : ""}`} /></button>
                <div className={`grid transition-all duration-300 ${open === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}><div className="overflow-hidden"><p className="px-5 pb-5 text-[15px] leading-relaxed text-[var(--muted)]">{a}</p></div></div>
              </div>))}</div></Reveal>
        </Wrap>
      </section>
    </>
  );
}
