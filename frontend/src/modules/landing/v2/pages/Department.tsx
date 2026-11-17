import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck, CheckCircle2, Cpu, MapPin, Phone } from "lucide-react";
import { DEPARTMENTS, FLOORS } from "../content";
import { doctorsOf, tel, useDoctors } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, DoctorCard, ICONS, PageHero, Reveal, Skeleton, useJsonLd, useTitle } from "../ui";

export default function Department() {
  const { slug } = useParams();
  const { ui, phone } = useS2();
  const d = DEPARTMENTS.find((x) => x.slug === slug) ?? DEPARTMENTS[0];
  const [opts, done] = useDoctors();
  const docs = opts ? doctorsOf(d, opts.doctors) : [];
  const I = ICONS[d.icon];
  const floor = FLOORS.find((f) => f.id === d.floor);
  useTitle(d.name, `${d.name} at Lyallpur Medical Complex, Faisalabad — ${d.summary}`);
  useJsonLd({ "@context": "https://schema.org", "@type": "MedicalClinic", name: `${d.name} — Lyallpur Medical Complex`, medicalSpecialty: d.name, availableService: d.services.map((s) => ({ "@type": "MedicalProcedure", name: s })) });
  const book = docs[0] ? `/hms/book-appointment?doctor=${encodeURIComponent(docs[0].name)}` : "/hms/book-appointment";
  return (
    <>
      <PageHero eyebrow="Department" title={d.name} sub={d.summary} img={d.img}>
        <div className="flex flex-wrap gap-3"><a href={book} className={btn.primary}><CalendarCheck className="h-5 w-5" />Book with this department</a>
          {phone && <a href={tel(phone)} className={btn.glass}><Phone className="h-5 w-5" /><span dir="ltr">{phone}</span></a>}</div>
      </PageHero>
      <section className="py-20">
        <Wrap className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <Link to="/site/departments" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />All departments</Link>
            <Reveal><h2 className="s2-display text-3xl">Overview</h2><p className="mt-4 text-[1.08rem] leading-relaxed text-[var(--muted)]">{d.overview}</p></Reveal>
            <Reveal delay={80} className="mt-10"><h2 className="s2-display text-3xl">Services</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">{d.services.map((s) => <li key={s} className="flex items-start gap-3 rounded-2xl bg-[var(--soft)] p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />{s}</li>)}</ul></Reveal>
            <Reveal delay={120} className="mt-10"><h2 className="s2-display text-3xl">Technology</h2>
              <ul className="mt-5 flex flex-wrap gap-2">{d.technology.map((s) => <li key={s} className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm"><Cpu className="h-4 w-4 text-[var(--accent)]" />{s}</li>)}</ul></Reveal>
          </div>
          <aside className="space-y-5">
            <Reveal className={`${card} p-6`}><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-7 w-7" /></span>
              <h3 className="mt-4 text-lg font-bold">Where to find us</h3>
              <p className="mt-1 flex items-center gap-2 text-[var(--muted)]"><MapPin className="h-4 w-4 text-[var(--accent)]" />{floor?.label ?? "Ask at reception"}</p>
              <Link to="/site/map" className={`${btn.ghost} mt-5 w-full py-2.5 text-sm`}>Open the floor map</Link></Reveal>
            <Reveal delay={80} className="rounded-[22px] bg-gradient-to-br from-[#0E5E6F] to-[#08303A] p-6 text-white"><h3 className="s2-display text-2xl">Ready to book?</h3><p className="mt-2 text-sm text-white/75">Choose a consultant and a time — confirmation by SMS.</p><a href={book} className={`${btn.primary} mt-5 w-full`}>{ui.common.book}</a></Reveal>
          </aside>
        </Wrap>
      </section>
      <section className="bg-[var(--soft)] py-20">
        <Wrap>
          <h2 className="s2-display mb-8 text-3xl">Doctors in {d.name}</h2>
          {!done ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
            : docs.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{docs.map((x) => <DoctorCard key={x.name} d={x} labels={{ book: ui.common.book, today: ui.common.today, next: ui.common.next, fee: ui.common.fee, profile: ui.common.profile }} />)}</div>
            : <div className={`${card} p-8 text-center text-[var(--muted)]`}>Consultant clinics for this department are arranged through reception. <Link to="/site/contact" className="font-semibold text-[var(--primary)]">Contact us</Link> or <Link to="/site/doctors" className="font-semibold text-[var(--primary)]">see all doctors</Link>.</div>}
        </Wrap>
      </section>
    </>
  );
}
