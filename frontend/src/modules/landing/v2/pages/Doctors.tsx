import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { DEPARTMENTS, PHOTOS } from "../content";
import { deptOf, todayISO, useDoctors } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { DoctorCard, PageHero, Reveal, Skeleton, useTitle } from "../ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export default function Doctors() {
  const { ui, lang } = useS2();
  useTitle("Find a doctor", "Search consultants at Lyallpur Medical Complex, Faisalabad by name, department and clinic day. See fees and the next free slot, and book online.");
  const [opts, done] = useDoctors();
  const [q, setQ] = useState(""); const [dept, setDept] = useState(""); const [day, setDay] = useState(""); const [avail, setAvail] = useState<"" | "today" | "week">("");
  const list = useMemo(() => {
    const now = new Date(); const week = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10);
    return (opts?.doctors ?? []).filter((d) => (!q || `${d.doctor_name} ${d.doctor_name_ur ?? ""} ${d.specialization ?? ""} ${d.qualification ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      && (!dept || deptOf(d)?.slug === dept) && (!day || d.days.some((x) => x.day === day))
      && (!avail || (avail === "today" ? d.next_date === todayISO() : !!d.next_date && d.next_date <= week)));
  }, [opts, q, dept, day, avail]);
  const depts = DEPARTMENTS.filter((x) => (opts?.doctors ?? []).some((d) => deptOf(d)?.slug === x.slug));
  const active = !!(q || dept || day || avail);
  const sel = "h-12 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-medium outline-none focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-ring)]";
  return (
    <>
      <PageHero eyebrow="Doctors" title="Find the right consultant" sub="Live clinic days, fees and the next free appointment — straight from our booking system." img={PHOTOS.reception} />
      <section className="py-14">
        <Wrap>
          <Reveal className="sticky top-[72px] z-20 -mx-2 mb-10 rounded-[24px] border border-[var(--line)] s2-glass p-3 shadow-[0_20px_40px_-30px_rgba(8,48,58,0.5)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-12 min-w-[220px] flex-1 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-4 focus-within:border-[var(--primary)] focus-within:ring-4 focus-within:ring-[var(--primary-ring)]">
                <Search className="h-4 w-4 text-[var(--muted)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Doctor name or specialty" aria-label="Search doctors" className="flex-1 bg-transparent text-sm outline-none" /></label>
              <SlidersHorizontal className="mx-1 hidden h-4 w-4 text-[var(--muted)] sm:block" />
              <select className={sel} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">All departments</option>{depts.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}</select>
              <select className={sel} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Clinic day"><option value="">Any day</option>{DAYS.map((x) => <option key={x}>{x}</option>)}</select>
              <select className={sel} value={avail} onChange={(e) => setAvail(e.target.value as typeof avail)} aria-label="Availability"><option value="">Any availability</option><option value="today">Free slots today</option><option value="week">Free this week</option></select>
              {active && <button type="button" onClick={() => { setQ(""); setDept(""); setDay(""); setAvail(""); }} className="flex h-12 items-center gap-1 rounded-full px-4 text-sm font-semibold text-[var(--accent)]"><X className="h-4 w-4" />Clear</button>}
            </div>
          </Reveal>
          <div className="mb-5 text-sm text-[var(--muted)]" aria-live="polite">{done ? `${list.length} doctor${list.length === 1 ? "" : "s"}` : "Loading doctors…"}</div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {!done ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-72" />)
              : list.map((d, i) => <Reveal key={d.name} delay={(i % 3) * 60}><DoctorCard d={d} ur={lang === "ur"} labels={{ book: ui.common.book, today: ui.common.today, next: ui.common.next, fee: ui.common.fee, profile: ui.common.profile }} /></Reveal>)}
          </div>
          {done && !list.length && <p className="py-16 text-center text-[var(--muted)]">No doctor matches these filters.</p>}
        </Wrap>
      </section>
    </>
  );
}
