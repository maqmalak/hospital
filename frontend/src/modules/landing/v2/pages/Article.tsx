import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck } from "lucide-react";
import { ARTICLES } from "../content";
import { Wrap } from "../SiteV2";
import { btn, card, PageHero, Reveal, useJsonLd, useTitle } from "../ui";

export default function Article() {
  const { slug } = useParams();
  const a = ARTICLES.find((x) => x.slug === slug) ?? ARTICLES[0];
  useTitle(a.title, a.excerpt);
  useJsonLd({ "@context": "https://schema.org", "@type": "MedicalWebPage", headline: a.title, about: a.tag, publisher: { "@type": "Hospital", name: "Lyallpur Medical Complex" } });
  return (
    <>
      <PageHero eyebrow={`${a.tag} · ${a.minutes} min read`} title={a.title} sub={a.excerpt} img={a.img} />
      <section className="py-16">
        <Wrap className="grid gap-10 lg:grid-cols-[1fr_300px]">
          <article className="max-w-2xl">
            <Link to="/site/news" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />All articles</Link>
            {a.body.map((p, i) => <Reveal key={i}><p className={`mb-5 text-[1.1rem] leading-[1.85] ${i === 0 ? "s2-display text-[1.35rem] leading-relaxed" : "text-[var(--muted)]"}`}>{p}</p></Reveal>)}
            <p className="mt-8 rounded-2xl bg-[var(--soft)] p-5 text-sm text-[var(--muted)]">This article is general information, not a diagnosis. Please see a doctor about your own symptoms. In an emergency, come to the hospital straight away.</p>
          </article>
          <aside className="space-y-4">
            <div className="rounded-[22px] bg-gradient-to-br from-[var(--btn-from)] to-[var(--hero)] p-6 text-white"><h3 className="s2-display text-2xl">Talk to a doctor</h3><p className="mt-2 text-sm text-white/75">Book a consultation online in under two minutes.</p><a href="/hms/book-appointment" className={`${btn.primary} mt-5 w-full`}><CalendarCheck className="h-5 w-5" />Book</a></div>
            {ARTICLES.filter((x) => x.slug !== a.slug).slice(0, 3).map((x) => <Link key={x.slug} to={`/site/news/${x.slug}`} className={`${card} block p-5`}><span className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">{x.tag}</span><div className="mt-1 font-semibold leading-snug">{x.title}</div></Link>)}
          </aside>
        </Wrap>
      </section>
    </>
  );
}
