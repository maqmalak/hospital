import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck, Clock3, DoorOpen, GraduationCap, Stethoscope, Wallet } from "lucide-react";
import { PHOTOS } from "../content";
import { deptOf, fmtDate, initials, rs, slugDoc, todayISO, useDoctors } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, PageHero, Reveal, Skeleton, useJsonLd, useTitle } from "../ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export default function Doctor() {
  const { id } = useParams();
  const { lang } = useS2();
  const [opts, done] = useDoctors();
  const d = opts?.doctors.find((x) => slugDoc(x) === id);
  const dept = d ? deptOf(d) : undefined;
  useTitle(d?.doctor_name ?? "Doctor", d ? `${d.doctor_name}, ${d.specialization} at Lyallpur Medical Complex, Faisalabad. Clinic days, fee and online booking.` : undefined);
  useJsonLd(d ? { "@context": "https://schema.org", "@type": "Physician", name: d.doctor_name, medicalSpecialty: d.specialization, worksFor: { "@type": "Hospital", name: "Lyallpur Medical Complex" },
    ...(d.photo ? { image: d.photo } : {}) } : null);
  if (!done) return <Wrap className="py-24"><Skeleton className="h-80" /></Wrap>;
  if (!d) return <Wrap className="py-24 text-center"><p className="text-[var(--muted)]">We couldn't find that doctor.</p><Link to="/site/doctors" className={`${btn.teal} mt-6`}>See all doctors</Link></Wrap>;
  const today = d.next_date === todayISO();
  const book = `/hms/book-appointment?doctor=${encodeURIComponent(d.name)}`;
  return (
    <>
      <PageHero eyebrow={d.specialization ?? "Consultant"} title={d.doctor_name} sub={[d.qualification, dept?.name].filter(Boolean).join(" · ")} img={dept?.img ?? PHOTOS.reception}>
        <a href={book} className={btn.primary}><CalendarCheck className="h-5 w-5" />Book appointment</a>
      </PageHero>
      <section className="py-16">
        <Wrap className="grid gap-8 lg:grid-cols-[340px_1fr]">
          <Reveal className={`${card} h-fit p-7 text-center hover:translate-y-0`}>
            {d.photo ? <img src={d.photo} alt={d.doctor_name} className="mx-auto h-36 w-36 rounded-[28px] object-cover" /> : <span className="mx-auto grid h-36 w-36 place-items-center rounded-[28px] bg-gradient-to-br from-[var(--primary)] to-[#178A8F] text-5xl font-bold text-white">{initials(d.doctor_name)}</span>}
            <h2 className="mt-5 text-xl font-bold">{d.doctor_name}</h2>{d.doctor_name_ur && <div className="text-[var(--muted)]">{d.doctor_name_ur}</div>}
            <div className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${today ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
              <span className={`h-2 w-2 rounded-full ${today ? "bg-emerald-500" : "bg-[var(--muted)]"}`} />{today ? "Available today" : d.next_date ? `Next available ${fmtDate(d.next_date, lang === "ur")}` : "No open slots — call to ask"}</div>
            <ul className="mt-6 space-y-3 text-start text-[15px]">
              <li className="flex gap-3"><Stethoscope className="h-5 w-5 text-[var(--primary)]" />{d.specialization}</li>
              {d.qualification && <li className="flex gap-3"><GraduationCap className="h-5 w-5 text-[var(--primary)]" />{d.qualification}</li>}
              {d.consultation_room && <li className="flex gap-3"><DoorOpen className="h-5 w-5 text-[var(--primary)]" />Room {d.consultation_room}</li>}
              {d.default_fee ? <li className="flex gap-3"><Wallet className="h-5 w-5 text-[var(--primary)]" /><span dir="ltr">{rs(d.default_fee)}</span> consultation</li> : null}
            </ul>
            <a href={book} className={`${btn.primary} mt-7 w-full`}>Book appointment</a>
          </Reveal>
          <div className="space-y-6">
            <Link to="/site/doctors" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />All doctors</Link>
            <Reveal className={`${card} p-7 hover:translate-y-0`}><h3 className="s2-display text-2xl">About</h3>
              <p className="mt-3 leading-relaxed text-[var(--muted)]">{d.doctor_name} is a {d.specialization?.toLowerCase()} at Lyallpur Medical Complex{d.qualification ? ` (${d.qualification})` : ""}{dept ? `, part of our ${dept.name} department` : ""}. {dept?.overview ?? ""}</p></Reveal>
            <Reveal delay={80} className={`${card} p-7 hover:translate-y-0`}><h3 className="s2-display flex items-center gap-2 text-2xl"><Clock3 className="h-6 w-6 text-[var(--accent)]" />Clinic schedule</h3>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">{DAYS.map((x) => { const s = d.days.filter((y) => y.day === x); return (
                <div key={x} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${s.length ? "bg-[var(--mint)]" : "bg-[var(--soft)] opacity-60"}`}><span className="font-semibold">{x}</span><span className="text-sm" dir="ltr">{s.length ? s.map((y) => `${y.from}–${y.to}`).join(", ") : "No clinic"}</span></div>); })}</div></Reveal>
            {dept && <Reveal delay={120} className={`${card} p-7 hover:translate-y-0`}><h3 className="s2-display text-2xl">Services</h3><div className="mt-4 flex flex-wrap gap-2">{dept.services.map((s) => <span key={s} className="rounded-full bg-[var(--soft)] px-3 py-1.5 text-sm">{s}</span>)}</div>
              <Link to={`/site/departments/${dept.slug}`} className="mt-5 inline-block text-sm font-semibold text-[var(--primary)]">About {dept.name} →</Link></Reveal>}
          </div>
        </Wrap>
      </section>
    </>
  );
}
