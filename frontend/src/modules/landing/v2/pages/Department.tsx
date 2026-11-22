import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Baby, CalendarCheck, Cpu, MapPin, Phone } from "lucide-react";
import { DEPARTMENTS, FLOORS, SERVICES, serviceLink, type ServiceGroup } from "../content";
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
  const isRad = d.slug === "radiology";
  const isNeph = d.slug === "nephrology";  // D-99: the department page links to the Nephrology & Dialysis module  // D-91: radiology books scans, not consultations
  const book = isRad ? "/hms/site/radiology/book" : docs[0] ? `/hms/book-appointment?doctor=${encodeURIComponent(docs[0].name)}` : "/hms/book-appointment";
  return (
    <>
      <PageHero eyebrow="Department" title={d.name} sub={d.summary} img={d.img}>
        <div className="flex flex-wrap gap-3"><a href={book} className={btn.primary}><CalendarCheck className="h-5 w-5" />{isRad ? "Book a scan" : "Book with this department"}</a>
          {isRad && <Link to="/site/radiology" className={btn.glass}>Services, prices & reports</Link>}{isRad && <Link to="/site/mri-ct" className={btn.glass}>MRI & CT</Link>}{isNeph && <Link to="/site/nephrology" className={btn.glass}>Dialysis unit, packages &amp; booking</Link>}{isNeph && <Link to="/site/nephrology/reserve" className={btn.glass}>Reserve a dialysis slot</Link>}
          {(d.slug === "paediatrics" || d.slug === "gynaecology") && <Link to="/site/nursery" className={btn.glass}><Baby className="h-5 w-5" />Nursery & Newborn Care</Link>}
          {phone && <a href={tel(phone)} className={btn.glass}><Phone className="h-5 w-5" /><span dir="ltr">{phone}</span></a>}</div>
      </PageHero>
      <section className="py-20">
        <Wrap className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <Link to="/site/departments" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />All departments</Link>
            <Reveal><h2 className="s2-display text-3xl">Overview</h2><p className="mt-4 text-[1.08rem] leading-relaxed text-[var(--muted)]">{d.overview}</p></Reveal>
            <Reveal delay={80} className="dp-panel relative mt-10 overflow-hidden rounded-[28px] border border-white/10 p-6 sm:p-8">
              <div aria-hidden className="dp-glow pointer-events-none absolute inset-0" />
              <div className="relative flex flex-wrap items-end justify-between gap-4">
                <div><h2 className="dp-grad s2-display text-[2.2rem] font-semibold leading-tight sm:text-[2.6rem]">Services</h2>
                  <p className="mt-2 max-w-md text-[15px] text-white/70">{d.summary} Tap a service for details, preparation and booking.</p></div>
                <Link to="/site/services" className="dp-btn inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 text-sm font-bold">All services<ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
              </div>
              <ul className="relative mt-7 grid gap-4 sm:grid-cols-2">{d.services.map((name) => { const r = resolve(name, d.slug); return (
                <li key={name}><Link to={r.to} className="dp-card group flex h-full flex-col overflow-hidden rounded-[20px] p-5 outline-none">
                  <span aria-hidden className="dp-shine pointer-events-none absolute inset-0" />
                  <div className="flex items-start justify-between gap-3">
                    <span className="dp-tag self-start rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">{r.tag}</span>
                    <span className="dp-art -me-1 -mt-1 h-[72px] w-[72px] shrink-0"><CardArt id={r.id} /></span>
                  </div>
                  <h3 className="dp-title mt-3 text-lg font-bold leading-snug text-white transition-colors">{name}</h3>
                  <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-white/65">{r.text}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-white/85 transition group-hover:text-[#bef264] group-focus-visible:text-[#bef264]">Explore<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1 rtl:rotate-180" /></span>
                </Link></li>); })}</ul>
              {!!d.technology.length && <div className="relative mt-8"><h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">Technology</h3>
                <ul className="mt-3 flex flex-wrap gap-2">{d.technology.map((t) => <li key={t} className="flex items-center gap-2 rounded-full border border-[#bef264]/25 bg-[#bef264]/[0.06] px-3.5 py-1.5 text-sm text-white/85"><Cpu className="h-4 w-4 text-[#bef264]" />{t}</li>)}</ul></div>}
              <style>{DP_CSS}</style>
            </Reveal>
          </div>
          <aside className="space-y-5">
            <Reveal className={`${card} p-6`}><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-7 w-7" /></span>
              <h3 className="mt-4 text-lg font-bold">Where to find us</h3>
              <p className="mt-1 flex items-center gap-2 text-[var(--muted)]"><MapPin className="h-4 w-4 text-[var(--accent)]" />{floor?.label ?? "Ask at reception"}</p>
              <Link to="/site/map" className={`${btn.ghost} mt-5 w-full py-2.5 text-sm`}>Open the floor map</Link></Reveal>
            <Reveal delay={80} className="rounded-[22px] bg-gradient-to-br from-[var(--btn-from)] to-[var(--hero)] p-6 text-white"><h3 className="s2-display text-2xl">Ready to book?</h3><p className="mt-2 text-sm text-white/75">Choose a consultant and a time — confirmation by SMS.</p><a href={book} className={`${btn.primary} mt-5 w-full`}>{ui.common.book}</a></Reveal>
            {(d.slug === "paediatrics" || d.slug === "gynaecology") && <Reveal delay={120} className={`${card} p-6`}><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent)] text-white"><Baby className="h-5 w-5" /></span>
              <h3 className="mt-3 text-lg font-bold">Nursery & Newborn Care</h3><p className="mt-1 text-sm text-[var(--muted)]">Rooming-in, nursery and NICU — paediatricians present at every birth.</p>
              <Link to="/site/nursery" className={`${btn.ghost} mt-4 w-full py-2.5 text-sm`}>Visit the newborn unit</Link></Reveal>}
          </aside>
        </Wrap>
      </section>
      <section id="doctors" className="scroll-mt-28 bg-[var(--soft)] py-20">
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

/** Where a department's service card goes: the module page when there is one (MRI & CT, Radiology, Nephrology, Nursery), else its section
 *  on the Services page. Description and tag come from the matching service group. */
const RULES: [RegExp, string][] = [[/\bmri\b/i, "mri"], [/\bct\b/i, "ct-scan"], [/x-?ray|radiograph/i, "x-ray"], [/ultrasound|doppler|echo/i, "ultrasound"],
  [/dialys|kidney|electrolyte|access follow/i, "dialysis"], [/newborn|nursery|neonat/i, "nursery"], [/blood test|urine|stool|culture|hormone|sample|laborator|test/i, "laboratory"],
  [/ccu|icu|critical|coronary care/i, "critical"], [/triage|trauma|resuscitation|ambulance|poison|emergency|stroke path/i, "emergency"],
  [/surgery|surgical|hernia|appendectomy|caesarean|theatre|wound|tonsil/i, "surgery"], [/day-care|day care/i, "daycare"], [/vaccin/i, "nursery"], [/delivery|antenatal/i, "nursery"]];
const MODULE: Record<string, string> = { dialysis: "/site/nephrology", nursery: "/site/nursery", "x-ray": "/site/radiology", ultrasound: "/site/radiology" };

function resolve(name: string, dept: string): { to: string; text: string; tag: string; id: string } {
  const id = RULES.find(([re]) => re.test(name))?.[1];
  const g: ServiceGroup | undefined = id ? SERVICES.find((x) => x.id === id) : undefined;
  if (g) return { to: MODULE[g.id] ?? serviceLink(g), text: g.text, tag: g.title, id: g.id };
  return { to: dept === "nephrology" ? "/site/nephrology" : `/site/departments/${dept}#doctors`, text: "Consultant clinic in this department — see the doctors and book a time.", tag: "Clinic", id: dept === "nephrology" ? "dialysis" : "clinic" };
}

/** Small animated imaging illustrations for the service cards (lime strokes on black; always gentle, livelier on hover). */
function CardArt({ id }: { id: string }) {
  const L = "#bef264", D = "#65a30d";
  const svg = (children: React.ReactNode) => <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden fill="none" stroke={L} strokeWidth="1.6" strokeLinecap="round">{children}</svg>;
  if (id === "mri") return svg(<>
    <circle cx="36" cy="36" r="30" stroke={D} strokeDasharray="2 5" className="dp-spin" />
    <ellipse cx="36" cy="37" rx="15" ry="19" /><path d="M36 18v38M27 30c4-3 6 2 9 0s6 3 9 0M26 42c4 3 6-2 10 0s6-3 10 0" strokeOpacity=".6" />
    <ellipse cx="31" cy="36" rx="2.6" ry="4.6" /><ellipse cx="41" cy="36" rx="2.6" ry="4.6" />
    <rect x="18" y="16" width="36" height="5" fill={L} stroke="none" className="dp-scan" opacity=".55" /></>);
  if (id === "ct-scan") return svg(<>
    <circle cx="36" cy="36" r="27" strokeWidth="5" stroke={D} strokeOpacity=".55" /><circle cx="36" cy="36" r="27" strokeDasharray="10 160" strokeWidth="5" className="dp-spin-fast" />
    <circle cx="36" cy="36" r="17" strokeOpacity=".5" /><path d="M10 52h52" strokeOpacity=".7" /><rect x="22" y="49" width="28" height="5" rx="2" fill={D} stroke="none" className="dp-slide" /></>);
  if (id === "x-ray") return svg(<>
    <rect x="12" y="10" width="48" height="52" rx="6" stroke={D} />
    <path d="M36 16v40" strokeOpacity=".7" />{[22, 29, 36, 43].map((y) => <path key={y} d={`M35 ${y}c-6-3-12 0-15 4M37 ${y}c6-3 12 0 15 4`} strokeOpacity=".75" />)}
    <rect x="12" y="10" width="48" height="6" fill={L} stroke="none" className="dp-scan-x" opacity=".35" /></>);
  if (id === "ultrasound") return svg(<>
    <path d="M36 14 L14 52 A26 26 0 0 0 58 52 Z" stroke={D} />
    {[0, 1, 2].map((i) => <path key={i} d="M22 44 A16 16 0 0 1 50 44" className="dp-echo" style={{ animationDelay: `${i * 0.6}s` }} />)}
    <rect x="31" y="8" width="10" height="8" rx="2" fill={L} stroke="none" /></>);
  if (id === "dialysis") return svg(<>
    <rect x="27" y="10" width="18" height="52" rx="9" />{[31, 36, 41].map((x) => <path key={x} d={`M${x} 16v40`} stroke={D} strokeDasharray="2 5" className="dp-flow" />)}
    <path d="M10 22h17M45 50h17" strokeDasharray="3 4" className="dp-flow" /></>);
  if (id === "laboratory") return svg(<>
    <path d="M28 12h16M31 12v18L19 54a5 5 0 0 0 4 7h26a5 5 0 0 0 4-7L41 30V12" /><path d="M23 46h26" stroke={D} />
    {[0, 1, 2].map((i) => <circle key={i} cx={30 + i * 6} cy="52" r="1.8" fill={L} stroke="none" className="dp-bubble" style={{ animationDelay: `${i * 0.7}s` }} />)}</>);
  if (id === "nursery") return svg(<>
    <path d="M14 40a22 14 0 0 0 44 0Z" /><circle cx="44" cy="28" r="7" /><path d="M14 40h44M22 54l-4 6M50 54l4 6" strokeOpacity=".7" />
    <path d="M20 22l2 2M22 18l1 3" stroke={D} className="dp-twinkle" /></>);
  if (id === "emergency" || id === "critical") return svg(<>
    <path d="M8 38h14l5-12 7 24 6-18 4 6h20" className="dp-ecg" strokeWidth="2" /><circle cx="36" cy="36" r="30" stroke={D} strokeOpacity=".5" /></>);
  if (id === "surgery" || id === "daycare") return svg(<>
    <circle cx="36" cy="30" r="14" stroke={D} /><circle cx="36" cy="30" r="6" className="dp-pulse-o" /><path d="M36 44v14M24 62h24" /></>);
  return svg(<><path d="M36 58s-20-12-20-26a10 10 0 0 1 20-4 10 10 0 0 1 20 4c0 14-20 26-20 26Z" className="dp-beat" /><path d="M18 36h10l4-7 5 12 4-5h13" stroke={D} /></>);
}

/** Lime card look (black cards, lime top edge, lime tag, green glow), the same in every site theme. */
const DP_CSS = `
.dp-panel{background:#070a08}
.dp-glow{background:radial-gradient(700px 380px at 0% 100%,rgba(101,163,13,.38),transparent 65%),radial-gradient(520px 300px at 100% 0%,rgba(190,242,100,.08),transparent 70%)}
.dp-grad{background:linear-gradient(90deg,#d9f99d,#a3e635 45%,#65a30d);-webkit-background-clip:text;background-clip:text;color:transparent}
[dir=rtl] .dp-grad{background:none;color:#bef264}
.dp-btn{background:#bef264;color:#14260a;transition:transform .25s,box-shadow .25s}.dp-btn:hover{transform:translateY(-2px);box-shadow:0 12px 28px -12px rgba(190,242,100,.7)}
.dp-card{position:relative;background:linear-gradient(160deg,#1b2618 0%,#111611 45%,#090b09 100%);border:1px solid rgba(255,255,255,.08);transition:transform .3s cubic-bezier(.2,.7,.2,1),border-color .3s,box-shadow .3s}
.dp-card::before{content:"";position:absolute;inset:0 18px auto;height:3px;border-radius:0 0 3px 3px;background:linear-gradient(90deg,#65a30d,#bef264,#65a30d);opacity:.85}
.dp-card:hover,.dp-card:focus-visible{transform:translateY(-4px);border-color:rgba(190,242,100,.6);box-shadow:0 24px 50px -28px rgba(132,204,22,.55)}
.dp-card:hover .dp-title,.dp-card:focus-visible .dp-title{color:#bef264}
.dp-tag{background:rgba(190,242,100,.12);color:#d9f99d;border:1px solid rgba(190,242,100,.25)}
@media (prefers-reduced-motion: reduce){.dp-card,.dp-btn{transition:none}.dp-card:hover{transform:none}}
.dp-shine{background:linear-gradient(115deg,transparent 30%,rgba(190,242,100,.10) 45%,rgba(255,255,255,.06) 50%,transparent 65%);transform:translateX(-120%);transition:transform .9s cubic-bezier(.2,.7,.2,1)}
.dp-card:hover .dp-shine,.dp-card:focus-visible .dp-shine{transform:translateX(120%)}
.dp-art{opacity:.75;filter:drop-shadow(0 0 0 rgba(190,242,100,0));transition:opacity .35s,transform .45s cubic-bezier(.2,.7,.2,1),filter .35s}
.dp-card:hover .dp-art,.dp-card:focus-visible .dp-art{opacity:1;transform:scale(1.1) rotate(-3deg);filter:drop-shadow(0 0 10px rgba(190,242,100,.55))}
.dp-card:hover .dp-tag,.dp-card:focus-visible .dp-tag{background:#bef264;color:#14260a}
.dp-card:hover{background:linear-gradient(160deg,#25361e 0%,#141c13 45%,#0a0d0a 100%)}
.dp-spin{transform-origin:36px 36px;animation:dpspin 14s linear infinite}.dp-spin-fast{transform-origin:36px 36px;animation:dpspin 3.2s linear infinite}
@keyframes dpspin{to{transform:rotate(360deg)}}
.dp-scan{animation:dpscan 3.4s ease-in-out infinite}@keyframes dpscan{0%,100%{transform:translateY(0)}50%{transform:translateY(34px)}}
.dp-scan-x{animation:dpscanx 3s ease-in-out infinite}@keyframes dpscanx{0%,100%{transform:translateY(0)}50%{transform:translateY(46px)}}
.dp-slide{animation:dpslide 3.6s ease-in-out infinite}@keyframes dpslide{0%,100%{transform:translateX(-6px)}50%{transform:translateX(6px)}}
.dp-echo{transform-origin:36px 14px;animation:dpecho 1.8s ease-out infinite;opacity:0}@keyframes dpecho{0%{transform:scale(.5);opacity:0}30%{opacity:1}100%{transform:scale(1.25);opacity:0}}
.dp-flow{animation:dpflow 1.2s linear infinite}@keyframes dpflow{to{stroke-dashoffset:-14}}
.dp-bubble{animation:dpbub 2.1s ease-in infinite}@keyframes dpbub{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-22px);opacity:0}}
.dp-twinkle{animation:dptw 1.6s ease-in-out infinite}@keyframes dptw{50%{opacity:.2}}
.dp-ecg{stroke-dasharray:90;animation:dpecg 2.2s linear infinite}@keyframes dpecg{from{stroke-dashoffset:90}to{stroke-dashoffset:-90}}
.dp-pulse-o{transform-origin:36px 30px;animation:dppo 2s ease-in-out infinite}@keyframes dppo{50%{transform:scale(1.4);opacity:.4}}
.dp-beat{transform-origin:36px 40px;animation:dpbeat 1.3s ease-in-out infinite}@keyframes dpbeat{30%{transform:scale(1.08)}}
.dp-card:hover .dp-spin{animation-duration:5s}.dp-card:hover .dp-spin-fast{animation-duration:1.4s}.dp-card:hover .dp-scan,.dp-card:hover .dp-scan-x{animation-duration:1.6s}
@media (prefers-reduced-motion: reduce){.dp-shine,.dp-art{transition:none}.dp-spin,.dp-spin-fast,.dp-scan,.dp-scan-x,.dp-slide,.dp-echo,.dp-flow,.dp-bubble,.dp-twinkle,.dp-ecg,.dp-pulse-o,.dp-beat{animation:none}.dp-echo{opacity:.6}}

`;
