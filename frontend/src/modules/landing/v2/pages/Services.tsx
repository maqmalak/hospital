import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { CalendarCheck, Check, Phone, Video } from "lucide-react";
import { CONFIG, PHOTOS, SERVICES } from "../content";
import { rs, tel } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, ICONS, PageHero, Reveal, SectionHead, Skeleton, useTitle } from "../ui";

export default function Services() {
  const { site, phone } = useS2();
  const loc = useLocation();
  useTitle("Services", "Diagnostics, MRI, CT, X-ray, ultrasound, surgery, day care, 24/7 emergency, ICU/CCU, dialysis, online consultation and pharmacy at Lyallpur Medical Complex.");
  useEffect(() => { if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 250); }, [loc.hash]);
  return (
    <>
      <PageHero eyebrow="Services" title="Everything you need, in one building" sub="From a blood test to major surgery — diagnostics, treatment and recovery without moving between hospitals." img={PHOTOS.icu} />
      <section className="py-20">
        <Wrap className="space-y-6">
          {SERVICES.map((s, i) => { const I = ICONS[s.icon]; return (
            <Reveal key={s.id}>
              <article id={s.id} className={`${card} grid scroll-mt-28 overflow-hidden hover:translate-y-0 ${i % 2 ? "md:grid-cols-[1fr_320px]" : "md:grid-cols-[320px_1fr]"}`}>
                <div className={`relative h-56 md:h-auto ${i % 2 ? "md:order-2" : ""}`}><img src={s.img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /></div>
                <div className="p-7 sm:p-9">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-6 w-6" /></span>
                  <h2 className="s2-display mt-4 text-[1.9rem]">{s.title}</h2><p className="mt-2 text-[var(--muted)]">{s.text}</p>
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">{s.items.map((x) => <li key={x} className="flex items-center gap-2 text-[15px]"><Check className="h-4 w-4 text-[var(--accent)]" />{x}</li>)}</ul>
                  {s.id === "telemedicine" && <a href="/hms/online-visit" className={`${btn.teal} mt-6`}><Video className="h-5 w-5" />Request an online consultation</a>}
                </div>
              </article>
            </Reveal>); })}
        </Wrap>
      </section>
      <section id="packages" className="scroll-mt-28 bg-[var(--soft)] py-24">
        <Wrap>
          <SectionHead eyebrow="Packages" title="Fixed-price packages" sub="One price for a planned procedure — room, nursing and the listed services included. Medicines and extra days outside the package are billed separately." />
          {!site ? <div className="grid gap-5 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div> : site.packages.length ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {site.packages.map((p, i) => (
                <Reveal key={p.package_name} delay={i * 80} className={`${card} relative flex flex-col p-8 ${i === 0 ? "ring-2 ring-[var(--primary)]" : ""}`}>
                  {i === 0 && <span className="absolute -top-3 start-8 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-bold text-white">Most requested</span>}
                  <h3 className="text-xl font-bold">{p.package_name}</h3>
                  {CONFIG.showPrices && p.price ? <div className="mt-4 flex items-baseline gap-2"><span className="s2-display text-4xl text-[var(--primary)]" dir="ltr">{rs(p.price)}</span>{p.days ? <span className="text-sm text-[var(--muted)]">· {p.days} day{p.days > 1 ? "s" : ""} stay</span> : null}</div>
                    : <div className="mt-4 text-[var(--muted)]">Ask for the current rate</div>}
                  {p.description && <p className="mt-3 text-sm text-[var(--muted)]">{p.description}</p>}
                  <ul className="mt-5 flex-1 space-y-2 text-[15px]">{(p.inclusions.length ? p.inclusions : ["Room and nursing", "Surgeon and anaesthesia", "Theatre charges", "Routine post-operative care"]).map((x) => <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-[var(--accent)]" />{x}</li>)}</ul>
                  <div className="mt-7 flex gap-2"><a href="/hms/book-appointment" className={`${btn.primary} flex-1 py-3 text-sm`}><CalendarCheck className="h-4 w-4" />Book consultation</a>{phone && <a href={tel(phone)} className={`${btn.ghost} py-3 text-sm`} aria-label="Call"><Phone className="h-4 w-4" /></a>}</div>
                </Reveal>
              ))}
            </div>) : <p className="text-[var(--muted)]">Package details are available from our billing desk.</p>}
          <p className="mt-6 text-xs text-[var(--muted)]">Prices are current hospital rates and may change. Your consultant confirms whether a package suits your case.</p>
        </Wrap>
      </section>
    </>
  );
}
