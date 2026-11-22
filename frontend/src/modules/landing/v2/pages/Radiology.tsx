/**
 * Radiology & Imaging service page (D-91, Part A + the patient-process stepper of Part B). Live catalogue, prices, radiologists
 * and hours from the ERP; preparation guide, safety, timings, FAQs with schema.org MedicalClinic / MedicalProcedure / FAQPage.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Baby, BadgeCheck, Bone, CalendarCheck, ChevronDown, Clock3, ClipboardCheck, CreditCard, Download, FileCheck2, FileSignature, Flame,
  HeartPulse, Info, Lock, MapPin, MessageSquareText, Phone, ScanLine, Search, ShieldCheck, Siren, Sparkles, Stethoscope, UserCheck, UserRound,
  Users, Waves, X, Zap, type LucideIcon,
} from "lucide-react";
import { CONFIG, PHOTOS } from "../content";
import { phoneOf, rs, tel, initials } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, Counter, Eyebrow, Reveal, SectionHead, Skeleton, useJsonLd, useTitle } from "../ui";
import { FILTERS, matches, PHONE_RADIOLOGY, turnaround, useCatalogue, type Procedure } from "../radiology";

const ICON_OF = (p: Procedure): LucideIcon =>
  p.category === "Pregnancy" ? Baby : p.modality === "Doppler" ? HeartPulse : p.category === "Guided Procedure" ? Stethoscope :
  p.category === "Contrast Study" ? Flame : p.modality === "Ultrasound" ? Waves : /chest|abdomen|kub|pns|skull|opg/i.test(p.procedure_name) ? ScanLine : Bone;

export const STEPS: [LucideIcon, string, string][] = [
  [Stethoscope, "Referral or self-request", "Your doctor's slip — or ask for a scan yourself; our radiologist checks it is the right test."],
  [CalendarCheck, "Book", "Online, by phone, on WhatsApp — or walk in for X-ray, 24/7."],
  [UserCheck, "Arrive & register", "Radiology reception, 2nd floor. You get a token number on the screen."],
  [CreditCard, "Billing / insurance", "Pay at the counter or online; panel and insurance cards verified on the spot."],
  [ClipboardCheck, "Preparation & consent", "Changing room, safety and pregnancy check, consent for contrast or TVS."],
  [ScanLine, "Your scan", "A radiographer or sonographer performs it — usually 10-30 minutes."],
  [BadgeCheck, "Image quality check", "Every image is checked before you leave, so you are not called back."],
  [FileSignature, "Radiologist reports", "A PMDC-registered consultant reads the images and writes your report."],
  [Lock, "Verified & signed", "The final report is digitally signed and carries a QR code to prove it is genuine."],
  [MessageSquareText, "Report delivery", "SMS / WhatsApp alert, online download, and a printed copy with films or CD."],
  [Users, "Back to your doctor", "Your doctor sees the report in the same hospital record — or share a secure link."],
];

const PREP_GUIDE: [string, LucideIcon, string[]][] = [
  ["Abdominal ultrasound", Waves, ["Do not eat for 6-8 hours before the scan (overnight fasting for a morning slot).", "Plain water and your regular medicines are fine; diabetics, tell us when you book.", "Avoid fizzy drinks and chewing gum — gas hides the organs."]],
  ["Pelvic / KUB ultrasound", Waves, ["Drink 4-6 glasses of water 1 hour before your time.", "Do not pass urine until the scan is done — a full bladder is the window to the pelvis.", "If you are bursting, tell reception: we will move you up the queue."]],
  ["X-ray", Bone, ["Remove jewellery, hairpins, belts and anything metal over the area.", "Tell the radiographer if you are, or might be, pregnant — we will check before any X-ray.", "A gown is provided where needed; lead shields protect the rest of your body."]],
  ["Contrast studies (Barium, IVP, HSG)", Flame, ["Follow the exact fasting time given at booking (usually from midnight).", "Bring your serum creatinine report for IVP; tell us about asthma, allergies, kidney problems or metformin.", "HSG is booked on day 7-11 of your cycle; written consent is taken for every contrast study."]],
  ["Pregnancy scans", Baby, ["Early pregnancy (under 13 weeks): come with a comfortably full bladder.", "NT, anomaly and growth scans: no preparation — bring your antenatal card and previous scans.", "3D / 4D: drink extra water for 3 days before; a light snack an hour before helps the baby move."]],
  ["Guided procedures (FNAC, biopsy, drainage)", Stethoscope, ["Bring PT/INR and CBC reports from the last 7 days.", "Tell us about blood thinners (aspirin, clopidogrel, warfarin) — stop only as your doctor advises.", "Come with an attendant; biopsy patients rest 2-4 hours afterwards."]],
  ["What to bring", ClipboardCheck, ["CNIC / B-form or any photo ID, and your MR number if you have one.", "The doctor's prescription or referral slip.", "Previous reports, films or CDs — comparison makes the report more useful.", "Insurance or panel card and employee ID, if applicable."]],
];

const SAFETY: [LucideIcon, string, string][] = [
  [Zap, "Low-dose digital X-ray", "Digital radiography uses a fraction of the dose of old film X-ray, with the dose recorded for every exposure."],
  [ShieldCheck, "Lead protection", "Lead aprons, thyroid shields and gonad shields for patients and attendants; lead-lined rooms."],
  [UserRound, "Female sonographers", "Female sonographers are available on request for pelvic, breast and pregnancy scans."],
  [Lock, "Privacy & chaperone", "Private changing rooms, gowns and a chaperone for intimate examinations — always on request, never refused."],
  [BadgeCheck, "PMDC-registered radiologists", "Every report is read and signed by a consultant radiologist registered with the Pakistan Medical & Dental Council."],
  [FileCheck2, "Verified, tamper-proof reports", "Digitally signed reports with a QR code; any change after signing becomes a visible, dated addendum."],
];

const FAQ: [string, string][] = [
  ["Is an X-ray safe in pregnancy?", "Most X-rays are avoided in pregnancy unless the information is essential. We ask every woman of child-bearing age before an X-ray. If you are or may be pregnant, the radiologist decides — often an ultrasound (no radiation) can answer the question instead. Shielding is used whenever an X-ray is necessary."],
  ["How long does a scan take?", "Most X-rays take 5-10 minutes. Ultrasound takes 15-30 minutes; detailed anomaly scans and Doppler studies 30-45 minutes. Contrast studies such as IVP can take 1-2 hours because images are taken over time."],
  ["When will I get my report?", "X-ray reports are usually ready in 2-4 hours and ultrasound reports the same day. Contrast studies are reported within 24 hours and biopsy results come from the laboratory in 3-5 days. Emergencies are reported immediately."],
  ["Can I get the report online?", "Yes. When your report is signed we send an SMS / WhatsApp alert. Open “Download my report”, enter your booking ID (or MR number) and mobile number, and confirm with the code we send. You can view, download the PDF, see key images and share a secure, expiring link with your doctor."],
  ["Do I need an appointment?", "X-rays are walk-in 24/7. Ultrasound, Doppler, contrast studies and guided procedures are by appointment so the preparation is right and you are not kept waiting — book online in under two minutes. Emergencies are always seen first."],
  ["Is insurance accepted?", "Yes — corporate panels and health insurers we work with are billed directly; bring your panel / insurance card and employee or policy number. Choose “Insurance / panel” when you book and reception verifies it on arrival."],
];

export default function Radiology() {
  useTitle("Radiology & Imaging — X-ray, Ultrasound, Doppler", "Digital X-ray 24/7, 3D/4D ultrasound, Doppler and contrast studies at Lyallpur Medical Complex, Faisalabad. Book online, see preparation, prices and download your report.");
  const { site, phone } = useS2();
  const [cat, done] = useCatalogue();
  const radPhone = PHONE_RADIOLOGY || phoneOf("reception", phone);
  const procs = cat?.procedures ?? [];
  const [f, setF] = useState<string>("all");
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return procs.filter((p) => matches(p, f) && (!t || `${p.procedure_name} ${p.description ?? ""} ${p.body_region ?? ""}`.toLowerCase().includes(t)));
  }, [procs, f, q]);
  const list = showAll || q || f !== "all" ? shown : shown.slice(0, 12);
  const rads = cat?.radiologists ?? [];

  useJsonLd(cat ? {
    "@context": "https://schema.org", "@type": "MedicalClinic", name: "Radiology & Imaging — Lyallpur Medical Complex", medicalSpecialty: "Radiography",
    telephone: radPhone || undefined, address: site?.clinic.address ? { "@type": "PostalAddress", streetAddress: site.clinic.address, addressLocality: "Faisalabad", addressCountry: "PK" } : undefined,
    availableService: procs.slice(0, 40).map((p) => ({ "@type": "MedicalProcedure", name: p.procedure_name, procedureType: "https://schema.org/NoninvasiveProcedure",
      preparation: p.preparation, description: p.description, ...(CONFIG.showPrices && p.price ? { offers: { "@type": "Offer", price: p.price, priceCurrency: "PKR" } } : {}) })),
    employee: rads.map((r) => ({ "@type": "Physician", name: r.doctor_name, medicalSpecialty: "Radiography" })),
  } : null);
  useJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q2, a]) => ({ "@type": "Question", name: q2, acceptedAnswer: { "@type": "Answer", text: a } })) });

  return (
    <>
      <style>{RD_CSS}</style>
      {/* ------------------------------------------------ hero */}
      <section className="relative overflow-hidden bg-[var(--hero)] text-white">
        <img src={PHOTOS.icu} alt="" className="s2-kenburns absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--hero)] via-[color-mix(in_srgb,var(--hero)_90%,transparent)] to-[color-mix(in_srgb,var(--hero2)_60%,transparent)] rtl:bg-gradient-to-l" />
        <div className="pointer-events-none absolute -bottom-40 -start-40 h-[520px] w-[520px] rounded-full bg-[#5CC3C9]/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <Reveal><Eyebrow light>Radiology & Imaging · 2nd floor</Eyebrow></Reveal>
            <Reveal delay={80}><h1 className="s2-display text-[2.6rem] leading-[1.04] sm:text-[4rem]">Precise imaging.<br /><span className="text-[var(--hero-accent)]">Fast, reliable reports.</span></h1></Reveal>
            <Reveal delay={160}><p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">Digital X-ray around the clock, high-definition and 4D ultrasound, Doppler and contrast studies — read by consultant radiologists, signed digitally and ready on your phone.</p></Reveal>
            <Reveal delay={240} className="mt-9 flex flex-wrap gap-3">
              <Link to="/site/radiology/book" className={btn.primary}><CalendarCheck className="h-5 w-5" />Book a scan</Link>
              <Link to="/site/radiology/reports" className={btn.glass}><Download className="h-5 w-5" />Download my report</Link>
              <Link to="/site/mri-ct" className={btn.glass}><ScanLine className="h-5 w-5" />MRI & CT</Link>
              {radPhone && <a href={tel(radPhone)} className={btn.glass}><Phone className="h-5 w-5" />Call radiology <span dir="ltr" className="hidden sm:inline">· {radPhone}</span></a>}
            </Reveal>
            <Reveal delay={300} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
              <span className="flex items-center gap-2"><Siren className="h-4 w-4 text-[#FF6B66]" />Emergency imaging 24/7</span>
              <span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[var(--hero-accent)]" />X-ray walk-in, no appointment</span>
            </Reveal>
          </div>
          <Reveal delay={200} className="hidden justify-self-center lg:block"><ScanVisual /></Reveal>
        </div>
      </section>

      {/* ------------------------------------------------ highlights */}
      <section className="relative z-10 -mt-10">
        <Wrap>
          <div className="s2-glass grid grid-cols-2 gap-px overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--line)] shadow-[0_30px_60px_-34px_rgba(8,48,58,0.55)] backdrop-blur-xl md:grid-cols-3 lg:grid-cols-6">
            {([
              [ScanLine, "24/7", "Digital X-ray"], [Sparkles, "4D", "HD & 4D ultrasound"], [Clock3, "2-4 hrs", "X-ray reports"],
              [Waves, "Same day", "Ultrasound reports"], [BadgeCheck, rads.length ? String(rads.length) : "PMDC", "Consultant radiologists"], [Users, cat?.scans_year ?? 0, "Scans in the last year"],
            ] as [LucideIcon, string | number, string][]).map(([I, v, l], i) => (
              <Reveal key={l} delay={i * 60} className="bg-[var(--surface)] p-5 text-center sm:p-6">
                <I className="mx-auto h-6 w-6 text-[var(--accent)]" />
                <div className="s2-num mt-2 text-[1.9rem] font-semibold leading-none text-[var(--primary)]">{typeof v === "number" ? <Counter to={v} suffix="+" /> : v}</div>
                <div className="mt-1.5 text-[13px] font-medium text-[var(--muted)]">{l}</div>
              </Reveal>))}
          </div>
        </Wrap>
      </section>

      {/* ------------------------------------------------ process stepper (Part B) */}
      <section className="py-24" id="process">
        <Wrap>
          <SectionHead eyebrow="Your visit, step by step" title="From referral to report" sub="Eleven steps, most of them handled by us. You always know what happens next — and when your report will be ready." center />
          <ProcessStepper />
        </Wrap>
      </section>

      {/* ------------------------------------------------ catalogue */}
      <section className="bg-[var(--soft)] py-24" id="services">
        <Wrap>
          <SectionHead eyebrow="Services & prices" title="Choose your scan" sub={`${procs.length || "40+"} X-ray, ultrasound, Doppler and contrast examinations — with preparation, turnaround and price. Tap “Book” to pick a time.`} />
          <div className="sticky top-[72px] z-20 -mx-2 mb-8 flex flex-col gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--surface)]/90 p-2 shadow-sm backdrop-blur-xl lg:flex-row lg:items-center">
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0" role="tablist" aria-label="Filter scans">
              {FILTERS.map((x) => <button key={x.key} role="tab" aria-selected={f === x.key} onClick={() => setF(x.key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${f === x.key ? "bg-[var(--primary)] text-white shadow" : "text-[var(--ink2)] hover:bg-[var(--soft)]"}`}>{x.label}</button>)}
            </div>
            <label className="flex flex-1 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--primary-ring)] lg:ms-auto lg:max-w-xs">
              <Search className="h-4 w-4 text-[var(--muted)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a scan — e.g. knee, KUB, NT" aria-label="Search scans" className="h-11 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--muted)]" />
              {q && <button onClick={() => setQ("")} aria-label="Clear search"><X className="h-4 w-4 text-[var(--muted)]" /></button>}
            </label>
          </div>
          {!done ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-64" />)}</div> : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((p, i) => <ScanCard key={p.name} p={p} delay={(i % 3) * 60} />)}
              </div>
              {!shown.length && <p className="py-16 text-center text-[var(--muted)]">No scan matches “{q}”. Try another word, or call radiology — we will guide you.</p>}
              {!showAll && !q && f === "all" && shown.length > 12 && <div className="mt-10 text-center"><button onClick={() => setShowAll(true)} className={btn.ghost}>Show all {shown.length} scans<ChevronDown className="h-4 w-4" /></button></div>}
              {CONFIG.showPrices && <p className="mt-6 text-center text-xs text-[var(--muted)]">Prices in Pakistani rupees, per examination. Panel and insurance rates may differ. Contrast media and films included unless stated.</p>}
            </>)}
        </Wrap>
      </section>

      {/* ------------------------------------------------ preparation */}
      <section className="py-24" id="preparation">
        <Wrap className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionHead eyebrow="Before your scan" title="Preparation, made simple" sub="The right preparation means clearer images and no repeat visits. Your booking confirmation and reminders repeat the instructions for your scan." />
            <Reveal className="-mt-4 rounded-[22px] border border-[var(--line)] bg-[var(--mint)] p-6">
              <div className="flex items-start gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
                <p className="text-[15px] leading-relaxed text-[var(--ink)]">Not sure what applies to you? Call radiology{radPhone ? <> on <a href={tel(radPhone)} className="font-semibold text-[var(--primary)]" dir="ltr">{radPhone}</a></> : ""} — or book online and we send the exact instructions by SMS / WhatsApp, with a reminder 24 hours and 2 hours before.</p></div>
            </Reveal>
          </div>
          <Accordion items={PREP_GUIDE.map(([t, I, lines]) => ({ title: t, icon: I, body: <ul className="space-y-2">{lines.map((l) => <li key={l} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />{l}</li>)}</ul> }))} />
        </Wrap>
      </section>

      {/* ------------------------------------------------ safety */}
      <section className="relative overflow-hidden bg-[var(--hero)] py-24 text-white">
        <div className="pointer-events-none absolute -end-32 top-10 h-96 w-96 rounded-full bg-[#5CC3C9]/15 blur-3xl" />
        <Wrap className="relative">
          <SectionHead light eyebrow="Safety & quality" title="Careful with every exposure" sub="Modern equipment is only half of it. These are the commitments behind every scan we perform." />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SAFETY.map(([I, t, d], i) => (
              <Reveal key={t} delay={i * 60} className="group rounded-[22px] border border-white/10 bg-white/[0.05] p-6 backdrop-blur transition hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--hero-accent)_40%,transparent)] hover:bg-white/[0.08]">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--hero-accent)_15%,transparent)] text-[var(--hero-accent)] transition group-hover:scale-110"><I className="h-6 w-6" /></span>
                <h3 className="mt-4 text-lg font-bold">{t}</h3><p className="mt-1.5 text-sm leading-relaxed text-white/70">{d}</p>
              </Reveal>))}
          </div>
          {CONFIG.accreditations.length > 0 && <Reveal className="mt-10 flex flex-wrap items-center gap-3"><span className="text-sm font-semibold text-white/60">Accreditations</span>
            {CONFIG.accreditations.map((a) => <span key={a.name} className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm">{a.logo && <img src={a.logo} alt="" className="h-5" />}{a.name}</span>)}</Reveal>}
        </Wrap>
      </section>

      {/* ------------------------------------------------ radiologists */}
      <section className="py-24" id="radiologists">
        <Wrap>
          <SectionHead eyebrow="Meet the radiologists" title="Consultants who read your scans" sub="Every report is written and signed by a consultant — never sent out, never unsigned." />
          {!done ? <div className="grid gap-5 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div> : rads.length ? (
            <div className="grid gap-6 md:grid-cols-2">
              {rads.map((r, i) => (
                <Reveal key={r.name} delay={i * 80} className={`${card} flex flex-col gap-5 p-6 sm:flex-row`}>
                  {r.photo ? <img src={r.photo} alt={r.doctor_name} className="h-28 w-28 shrink-0 rounded-3xl object-cover" loading="lazy" />
                    : <span className="grid h-28 w-28 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-[var(--primary)] to-[var(--btn-to)] text-3xl font-bold text-white">{initials(r.doctor_name)}</span>}
                  <div className="min-w-0 flex-1">
                    <h3 className="s2-display text-2xl">{r.doctor_name}</h3>
                    <div className="mt-0.5 font-semibold text-[var(--primary)]">Consultant Radiologist</div>
                    {r.qualification && <div className="text-sm text-[var(--muted)]">{r.qualification}</div>}
                    {r.registration_no && <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--mint)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary)]"><BadgeCheck className="h-3.5 w-3.5" />{r.registration_no}</div>}
                    <div className="mt-4 flex flex-wrap gap-1.5">{r.days.map((d) => <span key={d.day} className="rounded-xl bg-[var(--soft)] px-2.5 py-1 text-xs"><b>{d.day}</b> <span className="text-[var(--muted)]" dir="ltr">{d.from}-{d.to}</span></span>)}</div>
                  </div>
                </Reveal>))}
            </div>) : <p className="text-[var(--muted)]">Our radiologists' profiles will appear here shortly.</p>}
        </Wrap>
      </section>

      {/* ------------------------------------------------ timings & location */}
      <section className="bg-[var(--soft)] py-24" id="timings">
        <Wrap className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <Reveal className={`${card} overflow-hidden`}>
            <div className="border-b border-[var(--line)] p-6"><Eyebrow>Timings</Eyebrow><h2 className="s2-display text-3xl">Department hours</h2></div>
            <ul className="divide-y divide-[var(--line)]">
              {([["Digital X-ray", "Open 24 hours, 7 days — walk in", ScanLine, true], ["Ultrasound & pregnancy scans", "Monday-Saturday, 9:00 am - 9:00 pm (by appointment)", Waves, false],
                ["Doppler studies", "Monday-Saturday, 10:00 am - 6:00 pm (by appointment)", HeartPulse, false], ["Contrast studies & guided procedures", "Monday-Saturday mornings, by appointment", Flame, false],
                ["Emergency imaging", "24/7 for emergency and admitted patients", Siren, true]] as [string, string, LucideIcon, boolean][]).map(([t, h, I, live]) => (
                <li key={t} className="flex items-center gap-4 px-6 py-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1"><div className="font-bold">{t}</div><div className="text-sm text-[var(--muted)]">{h}</div></div>
                  {live && <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 sm:flex dark:text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Open now</span>}</li>))}
            </ul>
          </Reveal>
          <Reveal delay={100} className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[var(--btn-from)] to-[var(--hero)] p-8 text-white shadow-[0_30px_60px_-30px_rgba(8,48,58,0.7)]">
            <div className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full border border-white/10" /><div className="pointer-events-none absolute -end-6 -top-6 h-36 w-36 rounded-full border border-dashed border-white/20" />
            <MapPin className="h-9 w-9 text-[#FF6B66]" />
            <h2 className="s2-display mt-4 text-3xl">Where to find us</h2>
            <p className="mt-3 text-white/75">Radiology & Imaging is on the <b className="text-white">2nd floor</b>. Take the lift from the main lobby and follow the blue Radiology signs; reception is on your right.</p>
            <p className="mt-3 text-sm text-white/60">{site?.clinic.address}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/site/map?q=radiology" className={btn.glass}><MapPin className="h-4 w-4" />Open hospital map</Link>
              <Link to="/site/directions" className={btn.glass}>Directions<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
            </div>
          </Reveal>
        </Wrap>
      </section>

      {/* ------------------------------------------------ FAQ */}
      <section className="py-24" id="faq">
        <Wrap className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead eyebrow="FAQs" title="Questions patients ask us" sub="Can't find your answer? Our radiology reception is happy to help." />
          <Accordion items={FAQ.map(([t, a]) => ({ title: t, body: <p>{a}</p> }))} />
        </Wrap>
      </section>

      {/* ------------------------------------------------ CTA */}
      <section className="pb-24">
        <Wrap>
          <Reveal className="s2-band relative overflow-hidden rounded-[30px] bg-[var(--primary)] px-6 py-14 text-center text-white sm:px-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_260px_at_10%_0%,rgba(255,255,255,0.18),transparent_60%),radial-gradient(500px_260px_at_100%_100%,rgba(229,72,63,0.35),transparent_60%)]" />
            <h2 className="s2-display relative text-[2.2rem] sm:text-[3rem]">Ready when you are</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-white/80">Book in under two minutes — we send your booking ID, preparation and a reminder before you come.</p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/site/radiology/book" className={btn.primary}><CalendarCheck className="h-5 w-5" />Book a scan</Link>
              <Link to="/site/radiology/reports" className={btn.glass}><Download className="h-5 w-5" />Download my report</Link>
            </div>
          </Reveal>
        </Wrap>
      </section>
    </>
  );
}

function ScanCard({ p, delay }: { p: Procedure; delay: number }) {
  const I = ICON_OF(p);
  const [open, setOpen] = useState(false);
  return (
    <Reveal delay={delay} className={`${card} group flex h-full flex-col p-6`}>
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)] transition duration-300 group-hover:rotate-[-6deg] group-hover:scale-110 group-hover:bg-[var(--primary)] group-hover:text-white"><I className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[1.05rem] font-bold leading-snug">{p.procedure_name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full bg-[var(--soft)] px-2 py-0.5 text-[var(--primary)]">{p.category === "X-Ray" ? "X-ray" : p.category}</span>
            {p.walk_in ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">Walk-in</span> : null}
            {p.female_only ? <span className="rounded-full bg-pink-500/10 px-2 py-0.5 text-pink-700 dark:text-pink-300">Women</span> : null}
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">{p.description}</p>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-4 flex items-start gap-2 rounded-2xl bg-[var(--soft)] p-3 text-start text-[13px] leading-relaxed text-[var(--ink2)]">
        <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" /><span className={open ? "" : "line-clamp-2"}><b className="text-[var(--ink)]">Preparation: </b>{p.preparation}</span>
      </button>
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div>
          {CONFIG.showPrices && p.price ? <div className="s2-num text-[1.5rem] font-semibold leading-none text-[var(--ink)]" dir="ltr">{rs(p.price)}</div> : null}
          <div className="mt-1 text-xs text-[var(--muted)]">{p.duration_min} min · {turnaround(p)}</div>
        </div>
        <Link to={`/site/radiology/book?scan=${encodeURIComponent(p.name)}`} className={`${btn.primary} px-5 py-2.5 text-sm`} aria-label={`Book ${p.procedure_name}`}>Book<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
      </div>
    </Reveal>
  );
}

export function ProcessStepper() {
  return (
    <div className="relative">
      {/* desktop: two rows on a timeline rail; mobile: vertical */}
      <ol className="relative grid gap-0 md:grid-cols-4 md:gap-x-5 md:gap-y-10 lg:grid-cols-6">
        <span aria-hidden className="absolute bottom-6 start-[22px] top-6 w-[2px] rounded bg-gradient-to-b from-[var(--primary)] via-[#5CC3C9] to-[var(--accent)] md:hidden" />
        {STEPS.map(([I, t, d], i) => (
          <Reveal as="li" key={t} delay={i * 70} className="rd-step relative flex gap-4 pb-8 md:block md:pb-0">
            <div className="relative z-10 flex items-center md:mb-4">
              <span className="rd-node grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full border-2 border-[var(--primary)] bg-[var(--surface)] text-[var(--primary)] shadow-[0_8px_20px_-10px_var(--primary)]" style={{ animationDelay: `${i * 0.35}s` }}>
                <I className="h-5 w-5" /></span>
              {i < STEPS.length - 1 && <span aria-hidden className="rd-rail ms-2 hidden h-[2px] flex-1 rounded md:block" style={{ animationDelay: `${i * 0.35}s` }} />}
            </div>
            <div className="min-w-0 pt-1 md:pt-0">
              <div className="s2-num text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">STEP {String(i + 1).padStart(2, "0")}</div>
              <h3 className="mt-0.5 font-bold leading-snug">{t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{d}</p>
            </div>
          </Reveal>))}
      </ol>
    </div>
  );
}

function Accordion({ items }: { items: { title: string; body: React.ReactNode; icon?: LucideIcon }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {items.map((it, i) => { const on = open === i; const I = it.icon; return (
        <Reveal key={it.title} delay={i * 40} className={`overflow-hidden rounded-[20px] border bg-[var(--surface)] transition ${on ? "border-[var(--primary)] shadow-[0_20px_40px_-28px_rgba(14,94,111,0.6)]" : "border-[var(--line)]"}`}>
          <h3><button type="button" onClick={() => setOpen(on ? null : i)} aria-expanded={on} className="flex w-full items-center gap-3 px-5 py-4 text-start text-[16px] font-bold">
            {I && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-[18px] w-[18px]" /></span>}
            <span className="flex-1">{it.title}</span><ChevronDown className={`h-5 w-5 shrink-0 text-[var(--muted)] transition ${on ? "rotate-180 text-[var(--primary)]" : ""}`} /></button></h3>
          <div className={`grid transition-all duration-300 ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}><div className="overflow-hidden"><div className="px-5 pb-5 text-[15px] leading-relaxed text-[var(--ink2)]">{it.body}</div></div></div>
        </Reveal>); })}
    </div>
  );
}

/** Hero visual: a chest film on a glowing light-box with a sweeping scan line, and an ultrasound sector card. */
function ScanVisual() {
  return (
    <div aria-hidden className="relative h-[440px] w-[440px]">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(92,195,201,0.25),transparent_65%)]" />
      <div className="s2-float absolute start-6 top-4 h-[360px] w-[290px] overflow-hidden rounded-[28px] border border-white/15 bg-[#031418]/80 p-4 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold tracking-[0.2em] text-[color-mix(in_srgb,var(--hero-accent)_80%,transparent)]"><span>CHEST · PA</span><span className="flex items-center gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FF6B66]" />LIVE</span></div>
        <svg viewBox="0 0 260 300" className="h-[300px] w-full">
          <defs>
            <radialGradient id="lung" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#0a2a30" /><stop offset="1" stopColor="#123c44" /></radialGradient>
            <linearGradient id="bone" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e8f7f6" stopOpacity=".95" /><stop offset="1" stopColor="#9FE3DA" stopOpacity=".55" /></linearGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="2.2" /></filter>
          </defs>
          <rect width="260" height="300" fill="#04161a" />
          <path d="M70 60 C 30 90, 28 190, 50 250 C 80 268, 112 262, 118 240 L 120 80 C 110 62, 90 54, 70 60 Z" fill="url(#lung)" />
          <path d="M190 60 C 230 90, 232 190, 210 250 C 180 268, 148 262, 142 240 L 140 80 C 150 62, 170 54, 190 60 Z" fill="url(#lung)" />
          <g stroke="url(#bone)" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".85" filter="url(#glow)">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <g key={i}><path d={`M126 ${78 + i * 22} C 90 ${66 + i * 22}, 52 ${76 + i * 22}, 40 ${100 + i * 22}`} /><path d={`M134 ${78 + i * 22} C 170 ${66 + i * 22}, 208 ${76 + i * 22}, 220 ${100 + i * 22}`} /></g>)}
          </g>
          <rect x="122" y="30" width="16" height="260" rx="6" fill="url(#bone)" opacity=".7" />
          <ellipse cx="148" cy="200" rx="46" ry="40" fill="#cfeeee" opacity=".32" />
          <path d="M70 46 C 100 36, 160 36, 190 46" stroke="url(#bone)" strokeWidth="6" fill="none" opacity=".8" />
        </svg>
        <div className="rd-sweep pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-[#5CC3C9]/30 to-transparent" />
        <div className="rd-sweep-line pointer-events-none absolute inset-x-4 top-12 h-[2px] bg-[var(--hero-accent)] shadow-[0_0_14px_3px_rgba(159,227,218,0.8)]" />
      </div>
      <div className="s2-float absolute bottom-2 end-0 w-[230px] rounded-[24px] border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-xl" style={{ animationDelay: "-2.5s" }}>
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold tracking-[0.2em] text-white/70"><span>ULTRASOUND</span><span>4D</span></div>
        <svg viewBox="0 0 200 120" className="w-full">
          <defs><radialGradient id="fan" cx="50%" cy="0%" r="100%"><stop offset="0" stopColor="#9FE3DA" stopOpacity=".5" /><stop offset="1" stopColor="#0E5E6F" stopOpacity=".15" /></radialGradient></defs>
          <path d="M100 6 L 186 110 A 120 120 0 0 1 14 110 Z" fill="url(#fan)" stroke="#9FE3DA" strokeOpacity=".4" />
          <ellipse className="rd-beat" cx="104" cy="74" rx="26" ry="18" fill="#e8f7f6" opacity=".55" />
          <path className="rd-ecg" d="M10 112 L 60 112 L 70 100 L 80 118 L 90 104 L 100 112 L 190 112" stroke="#FF6B66" strokeWidth="2" fill="none" />
        </svg>
        <div className="mt-2 flex items-center justify-between text-xs text-white/80"><span>FHR <b className="text-white">148</b> bpm</span><span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">Normal</span></div>
      </div>
      <div className="absolute -end-4 top-[150px] rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white shadow-xl backdrop-blur-xl">
        <div className="text-[10px] font-semibold tracking-[0.2em] text-white/60">REPORT</div>
        <div className="mt-0.5 flex items-center gap-2 text-sm font-bold"><BadgeCheck className="h-4 w-4 text-[var(--hero-accent)]" />Digitally signed</div>
      </div>
    </div>
  );
}

const RD_CSS = `
.rd-sweep{animation:rdsweep 4.2s cubic-bezier(.6,.1,.4,.9) infinite}
.rd-sweep-line{animation:rdline 4.2s cubic-bezier(.6,.1,.4,.9) infinite}
@keyframes rdsweep{0%{transform:translateY(-30%)}50%{transform:translateY(330px)}100%{transform:translateY(-30%)}}
@keyframes rdline{0%{transform:translateY(0)}50%{transform:translateY(300px)}100%{transform:translateY(0)}}
.rd-beat{animation:rdbeat 1.3s ease-in-out infinite;transform-origin:104px 74px}@keyframes rdbeat{0%,100%{transform:scale(1)}40%{transform:scale(1.08)}}
.rd-ecg{stroke-dasharray:240;stroke-dashoffset:240;animation:rdecg 2.4s linear infinite}@keyframes rdecg{to{stroke-dashoffset:0}}
.rd-rail{background:linear-gradient(90deg,var(--primary),var(--line));background-size:200% 100%;animation:rdrail 4s ease-in-out infinite}
@keyframes rdrail{0%,100%{background-position:100% 0}50%{background-position:0 0}}
.rd-step:hover .rd-node{background:var(--primary);color:#fff;transform:scale(1.08)}
.rd-node{transition:transform .25s,background .25s,color .25s;animation:rdnode 3.85s ease-in-out infinite}
@keyframes rdnode{0%,8%{box-shadow:0 0 0 0 var(--primary-ring)}4%{box-shadow:0 0 0 10px var(--primary-ring)}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion: reduce){.rd-sweep,.rd-sweep-line,.rd-beat,.rd-ecg,.rd-rail,.rd-node{animation:none}.rd-ecg{stroke-dashoffset:0}}
`;
