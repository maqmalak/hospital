import { Briefcase, GraduationCap, HeartHandshake, Sparkles } from "lucide-react";
import { CAREERS, PHOTOS } from "../content";
import { EnquiryForm } from "../forms";
import { Wrap } from "../SiteV2";
import { card, PageHero, Reveal, SectionHead, useTitle } from "../ui";

export default function Careers() {
  useTitle("Careers", "Work at Lyallpur Medical Complex, Faisalabad — nursing, medical officers, allied health, pharmacy and administration.");
  return (
    <>
      <PageHero eyebrow="Careers" title="Build your career where care comes first" sub={CAREERS.intro} img={PHOTOS.corridor} />
      <section className="py-20">
        <Wrap>
          <div className="grid gap-5 md:grid-cols-3">
            {([[HeartHandshake, "A caring team", "Colleagues who support each other and patients who notice."], [GraduationCap, "Keep learning", "Training, clinical meetings and a research culture."], [Sparkles, "Modern systems", "One electronic record and good equipment — less paperwork, more patient time."]] as [typeof Briefcase, string, string][]).map(([I, t, d], i) =>
              <Reveal key={t} delay={i * 70} className={`${card} p-7`}><I className="h-8 w-8 text-[var(--accent)]" /><h3 className="mt-4 text-lg font-bold">{t}</h3><p className="mt-2 text-sm text-[var(--muted)]">{d}</p></Reveal>)}
          </div>
        </Wrap>
      </section>
      <section className="bg-[var(--soft)] py-20">
        <Wrap className="grid items-start gap-10 lg:grid-cols-[1fr_1.2fr]">
          <Reveal><SectionHead eyebrow="Where we hire" title="Areas we recruit in" />
            <div className="-mt-4 space-y-3">{CAREERS.areas.map(([t, d]) => <div key={t} className="flex gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><Briefcase className="h-6 w-6 shrink-0 text-[var(--primary)]" /><div><div className="font-bold">{t}</div><div className="text-sm text-[var(--muted)]">{d}</div></div></div>)}</div></Reveal>
          <Reveal delay={100}><EnquiryForm kind="Careers" extra={{ label: "Area of interest", options: CAREERS.areas.map(([t]) => t) }} messageLabel="Qualifications, experience and the role you want" submit="Send application"
            upload={{ label: "Attach your CV (optional)", hint: "PDF or Word, up to 5 MB.", accept: ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" }} note="Our HR team keeps your details on file and contacts you when a suitable post opens." /></Reveal>
        </Wrap>
      </section>
    </>
  );
}
