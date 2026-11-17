import { Link } from "react-router-dom";
import { ARTICLES, PHOTOS } from "../content";
import { Wrap } from "../SiteV2";
import { card, PageHero, Reveal, useTitle } from "../ui";

export default function News() {
  useTitle("Health blog", "Health advice from the clinicians at Lyallpur Medical Complex, Faisalabad.");
  const [first, ...rest] = ARTICLES;
  return (
    <>
      <PageHero eyebrow="Health blog" title="Advice from our clinicians" sub="Practical, trustworthy guidance for you and your family." img={PHOTOS.lounge} />
      <section className="py-20">
        <Wrap>
          <Reveal><Link to={`/site/news/${first.slug}`} className={`${card} group grid overflow-hidden md:grid-cols-2`}>
            <div className="h-64 overflow-hidden md:h-auto"><img src={first.img} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></div>
            <div className="p-8 sm:p-10"><span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">{first.tag} · {first.minutes} min read</span><h2 className="s2-display mt-3 text-3xl leading-tight">{first.title}</h2><p className="mt-3 text-[var(--muted)]">{first.excerpt}</p><span className="mt-6 inline-block font-semibold text-[var(--primary)]">Read article →</span></div>
          </Link></Reveal>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {rest.map((a, i) => <Reveal key={a.slug} delay={i * 70}><Link to={`/site/news/${a.slug}`} className={`${card} group flex h-full flex-col overflow-hidden`}><div className="h-44 overflow-hidden"><img src={a.img} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></div>
              <div className="p-6"><span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">{a.tag} · {a.minutes} min</span><h3 className="s2-display mt-2 text-xl leading-snug">{a.title}</h3><p className="mt-2 text-sm text-[var(--muted)]">{a.excerpt}</p></div></Link></Reveal>)}
          </div>
        </Wrap>
      </section>
    </>
  );
}
