/**
 * Lyallpur Medical Complex website v2 (/hms/site/*, D-80). Multi-page, light / dark, English / Urdu chrome + home,
 * live doctors, departments, ward rates and packages from the ERP. v1 stays at /hms/vvsdesk (git tag website-v1).
 * Design: off-white #F7FAFA, deep teal #0E5E6F, mint, coral CTA (the logo red), Fraunces display + Plus Jakarta Sans.
 */
import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ArrowUp, ChevronDown, Languages, Mail, MapPin, Menu, Moon, Phone, Search, Siren, Sun, X, LogIn, Facebook, Instagram, Youtube, Linkedin, Loader2 } from "lucide-react";
import { postCall } from "@/services/frappe";
import { CONFIG, DEPARTMENTS, FLOORS, SERVICES, UI, type Lang, type UICopy } from "./content";
import { hasWa, phoneOf, tel, useDoctors, useSite, slugDoc, type Site } from "./data";
import { ICONS, btn } from "./ui";

const Home = lazy(() => import("./pages/Home"));
const Pages = {
  About: lazy(() => import("./pages/About")), Departments: lazy(() => import("./pages/Departments")), Department: lazy(() => import("./pages/Department")),
  Services: lazy(() => import("./pages/Services")), Doctors: lazy(() => import("./pages/Doctors")), Doctor: lazy(() => import("./pages/Doctor")),
  Rooms: lazy(() => import("./pages/Rooms")), Pharmacy: lazy(() => import("./pages/Pharmacy")), Wayfinding: lazy(() => import("./pages/Wayfinding")),
  Directions: lazy(() => import("./pages/Directions")), Patients: lazy(() => import("./pages/Patients")), Careers: lazy(() => import("./pages/Careers")),
  News: lazy(() => import("./pages/News")), Article: lazy(() => import("./pages/Article")), Contact: lazy(() => import("./pages/Contact")),
};

interface Ctx { lang: Lang; ui: UICopy; site: Site | null; phone: string; dark: boolean }
const S2 = createContext<Ctx>({ lang: "en", ui: UI.en, site: null, phone: "", dark: false });
export const useS2 = () => useContext(S2);

const FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

export default function SiteV2() {
  const [lang, setLang] = useState<Lang>(() => (store.get("hv.site.lang") as Lang) || "en");
  const [dark, setDark] = useState(() => store.get("hv.site2.theme") === "dark");
  const [site] = useSite();
  const ui = UI[lang];
  const phone = site?.clinic.phone || "";
  const loc = useLocation();
  useEffect(() => {
    if (!document.querySelector(`link[href="${FONTS}"]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = FONTS; document.head.appendChild(l); }
    const had = document.documentElement.classList.contains("dark"); document.documentElement.classList.remove("dark");
    return () => { if (had) document.documentElement.classList.add("dark"); };
  }, []);
  // New page → top, or to the #section a link asked for (e.g. a Home planet → /site/services#mri) once it has rendered.
  useEffect(() => {
    if (!loc.hash) { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); return; }
    let n = 0; const id = decodeURIComponent(loc.hash.slice(1));
    const go = () => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); else if (n++ < 20) setTimeout(go, 100); };
    go();
  }, [loc.pathname, loc.hash]);
  const rtl = lang === "ur";
  const ctx = useMemo(() => ({ lang, ui, site, phone, dark }), [lang, ui, site, phone, dark]);
  return (
    <S2.Provider value={ctx}>
      <div className={`s2 min-h-screen bg-[var(--bg)] text-[var(--ink)] antialiased ${dark ? "dark s2-dark" : ""}`} dir={rtl ? "rtl" : "ltr"} lang={lang} translate="no">
        <style>{CSS(rtl)}</style>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-[var(--ink)]">Skip to content</a>
        <TopBar setLang={(l) => { setLang(l); store.set("hv.site.lang", l); }} dark={dark} setDark={(d) => { setDark(d); store.set("hv.site2.theme", d ? "dark" : "light"); }} />
        <NavBar />
        <main id="main" key={loc.pathname} className="s2-page">
          <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-24"><div className="s2-skel h-72 rounded-3xl" /></div>}>
            <Routes>
              <Route index element={<Home />} />
              <Route path="about" element={<Pages.About />} />
              <Route path="departments" element={<Pages.Departments />} />
              <Route path="departments/:slug" element={<Pages.Department />} />
              <Route path="services" element={<Pages.Services />} />
              <Route path="doctors" element={<Pages.Doctors />} />
              <Route path="doctors/:id" element={<Pages.Doctor />} />
              <Route path="rooms" element={<Pages.Rooms />} />
              <Route path="pharmacy" element={<Pages.Pharmacy />} />
              <Route path="map" element={<Pages.Wayfinding />} />
              <Route path="directions" element={<Pages.Directions />} />
              <Route path="patients" element={<Pages.Patients />} />
              <Route path="careers" element={<Pages.Careers />} />
              <Route path="news" element={<Pages.News />} />
              <Route path="news/:slug" element={<Pages.Article />} />
              <Route path="contact" element={<Pages.Contact />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
        <Floating />
      </div>
    </S2.Provider>
  );
}

// ------------------------------------------------------------------ chrome
function TopBar({ setLang, dark, setDark }: { setLang: (l: Lang) => void; dark: boolean; setDark: (d: boolean) => void }) {
  const { ui, lang, phone } = useS2();
  const er = phoneOf("emergency", phone);
  const [q, setQ] = useState(false);
  useEffect(() => { const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setQ(true); } }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, []);
  return (
    <div className="bg-[#08303A] text-[13px] text-white/85">
      <div className="mx-auto flex h-10 max-w-7xl items-center gap-4 px-4 sm:px-6">
        {er && <a href={tel(er)} className="flex items-center gap-1.5 font-semibold text-white"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF6B66] opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#FF5A55]" /></span>{ui.top.emergency}<span dir="ltr" className="hidden sm:inline">· {er}</span></a>}
        {CONFIG.email && <a href={`mailto:${CONFIG.email}`} className="hidden items-center gap-1.5 hover:text-white md:flex"><Mail className="h-3.5 w-3.5" />{CONFIG.email}</a>}
        <div className="ms-auto flex items-center gap-1">
          <button type="button" onClick={() => setQ(true)} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:bg-white/10" aria-label={ui.top.search}><Search className="h-3.5 w-3.5" /><span className="hidden sm:inline">{ui.top.search}</span><kbd className="hidden rounded border border-white/20 px-1 text-[10px] lg:inline">Ctrl K</kbd></button>
          <button type="button" onClick={() => setLang(lang === "en" ? "ur" : "en")} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:bg-white/10" aria-label="Language"><Languages className="h-3.5 w-3.5" />{ui.top.lang}</button>
          <button type="button" onClick={() => setDark(!dark)} className="rounded-full p-1.5 hover:bg-white/10" aria-label={ui.top.theme} aria-pressed={dark}>{dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}</button>
        </div>
      </div>
      {q && <SearchDialog onClose={() => setQ(false)} />}
    </div>
  );
}

function Logo({ small }: { small?: boolean }) {
  const { ui, dark } = useS2();
  return (
    <Link to="/site" className="flex min-w-0 items-center gap-3" aria-label={ui.name}>
      <img src={`${import.meta.env.BASE_URL}brand/${dark ? "lyallpur-mark-dark.webp" : "lyallpur-mark.webp"}`} alt="" className={`shrink-0 transition-all ${small ? "h-10 w-10" : "h-12 w-12"}`} />
      <span className="min-w-0 leading-tight">
        <span className="s2-display block truncate text-[18px] font-semibold text-[var(--ink)]">{ui.name}</span>
        <span className="block truncate text-[10.5px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">{ui.tagline}</span>
      </span>
    </Link>
  );
}

function NavBar() {
  const { ui } = useS2();
  const [small, setSmall] = useState(false);
  const [open, setOpen] = useState(false);
  const [mega, setMega] = useState<"" | "depts" | "services">("");
  const loc = useLocation();
  useEffect(() => { const f = () => setSmall(window.scrollY > 40); f(); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  useEffect(() => { setOpen(false); setMega(""); }, [loc.pathname]);
  const link = (to: string, label: string) => <NavLink to={to} end={to === "/site"} className={({ isActive }) => `rounded-full px-3 py-2 text-[14.5px] font-medium transition ${isActive ? "text-[var(--primary)]" : "text-[var(--ink2)] hover:text-[var(--ink)]"}`}>{label}</NavLink>;
  const megaBtn = (k: "depts" | "services", label: string) => (
    <div className="relative" onMouseEnter={() => setMega(k)} onMouseLeave={() => setMega("")}>
      <button type="button" aria-expanded={mega === k} onClick={() => setMega(mega === k ? "" : k)} className="flex items-center gap-1 rounded-full px-3 py-2 text-[14.5px] font-medium text-[var(--ink2)] hover:text-[var(--ink)]">{label}<ChevronDown className={`h-4 w-4 transition ${mega === k ? "rotate-180" : ""}`} /></button>
      {mega === k && <div className="absolute start-1/2 top-full z-50 w-[min(860px,90vw)] -translate-x-1/2 pt-3 rtl:translate-x-1/2"><div className="s2-pop rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_40px_80px_-30px_rgba(8,48,58,0.45)]">
        {k === "depts" ? <div className="grid grid-cols-2 gap-1 md:grid-cols-3">{DEPARTMENTS.map((d) => { const I = ICONS[d.icon]; return (
          <Link key={d.slug} to={`/site/departments/${d.slug}`} className="flex items-start gap-3 rounded-2xl p-3 hover:bg-[var(--soft)]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-[18px] w-[18px]" /></span>
            <span><span className="block text-sm font-semibold">{d.name}</span><span className="line-clamp-1 text-xs text-[var(--muted)]">{d.summary}</span></span></Link>); })}</div>
          : <div className="grid grid-cols-2 gap-1 md:grid-cols-3">{SERVICES.map((s) => { const I = ICONS[s.icon]; return (
          <Link key={s.id} to={`/site/services#${s.id}`} className="flex items-start gap-3 rounded-2xl p-3 hover:bg-[var(--soft)]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-[18px] w-[18px]" /></span>
            <span><span className="block text-sm font-semibold">{s.title}</span><span className="line-clamp-1 text-xs text-[var(--muted)]">{s.text}</span></span></Link>); })}</div>}
        <div className="mt-3 flex justify-end border-t border-[var(--line)] pt-3"><Link to={k === "depts" ? "/site/departments" : "/site/services"} className="text-sm font-semibold text-[var(--primary)]">{ui.nav.all} →</Link></div>
      </div></div>}
    </div>
  );
  const mobile: [string, string][] = [["/site", ui.nav.home], ["/site/about", ui.nav.about], ["/site/departments", ui.nav.departments], ["/site/services", ui.nav.services], ["/site/doctors", ui.nav.doctors],
    ["/site/rooms", ui.nav.rooms], ["/site/pharmacy", ui.nav.pharmacy], ["/site/map", ui.nav.map], ["/site/directions", ui.nav.directions], ["/site/patients", ui.nav.patients], ["/site/news", ui.nav.news], ["/site/careers", ui.nav.careers], ["/site/contact", ui.nav.contact]];
  return (
    <header className={`sticky top-0 z-40 border-b transition-all duration-300 ${small ? "border-[var(--line)] s2-glass shadow-[0_10px_30px_-20px_rgba(8,48,58,0.5)] backdrop-blur-xl" : "border-transparent bg-[var(--bg)]"}`}>
      <div className={`mx-auto flex max-w-7xl items-center gap-3 px-4 transition-all duration-300 sm:px-6 ${small ? "h-16" : "h-[84px]"}`}>
        <Logo small={small} />
        <nav aria-label="Main" className="ms-auto hidden items-center xl:flex">
          {link("/site/about", ui.nav.about)}{megaBtn("depts", ui.nav.departments)}{megaBtn("services", ui.nav.services)}{link("/site/doctors", ui.nav.doctors)}{link("/site/rooms", ui.nav.rooms)}{link("/site/patients", ui.nav.patients)}{link("/site/contact", ui.nav.contact)}
        </nav>
        <div className="ms-auto flex items-center gap-2 xl:ms-3">
          <a href="/hms/book-appointment" className={`${btn.primary} hidden px-5 py-2.5 text-sm sm:inline-flex`}>{ui.nav.book}</a>
          <button type="button" onClick={() => setOpen(true)} className="rounded-full p-2.5 hover:bg-[var(--soft)] xl:hidden" aria-label={ui.nav.menu}><Menu className="h-6 w-6" /></button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-[#08303A]/60 backdrop-blur-sm xl:hidden" onClick={() => setOpen(false)}>
          <div className="s2-drawer absolute inset-y-0 end-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-[var(--surface)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={ui.nav.menu}>
            <div className="mb-4 flex items-center justify-between"><Logo small /><button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-[var(--soft)]" aria-label={ui.nav.close}><X className="h-6 w-6" /></button></div>
            <nav className="flex flex-col">{mobile.map(([to, l]) => <NavLink key={to} to={to} end={to === "/site"} className={({ isActive }) => `border-b border-[var(--line)] py-3 text-[17px] font-medium ${isActive ? "text-[var(--primary)]" : ""}`}>{l}</NavLink>)}</nav>
            <a href="/hms/book-appointment" className={`${btn.primary} mt-6 w-full`}>{ui.nav.book}</a>
          </div>
        </div>
      )}
    </header>
  );
}

// ------------------------------------------------------------------ search
interface Hit { group: string; label: string; sub?: string; to: string }
function SearchDialog({ onClose }: { onClose: () => void }) {
  const { ui } = useS2();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const [opts] = useDoctors();
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); const f = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [onClose]);
  const all = useMemo<Hit[]>(() => {
    const pages: [string, string][] = [["/site/about", ui.nav.about], ["/site/departments", ui.nav.departments], ["/site/services", ui.nav.services], ["/site/doctors", ui.nav.doctors], ["/site/rooms", ui.nav.rooms],
      ["/site/pharmacy", ui.nav.pharmacy], ["/site/map", ui.nav.map], ["/site/directions", ui.nav.directions], ["/site/patients", ui.nav.patients], ["/site/news", ui.nav.news], ["/site/careers", ui.nav.careers], ["/site/contact", ui.nav.contact]];
    return [
      ...pages.map(([to, label]) => ({ group: ui.search.pages, label, to })),
      ...DEPARTMENTS.map((d) => ({ group: ui.search.depts, label: d.name, sub: d.summary, to: `/site/departments/${d.slug}` })),
      ...SERVICES.flatMap((s) => [{ group: ui.search.services, label: s.title, sub: s.items.join(", "), to: `/site/services#${s.id}` }]),
      ...(opts?.doctors ?? []).map((d) => ({ group: ui.search.doctors, label: d.doctor_name, sub: d.specialization, to: `/site/doctors/${slugDoc(d)}` })),
      ...FLOORS.flatMap((f) => f.places.map((p) => ({ group: ui.search.places, label: p.name, sub: `${f.label} · ${p.keywords ?? ""}`, to: `/site/map?q=${encodeURIComponent(p.id)}` }))),
    ];
  }, [opts, ui]);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return all.filter((h) => h.group === ui.search.pages).slice(0, 8);
    return all.filter((h) => `${h.label} ${h.sub ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [q, all, ui]);
  const go = (h: Hit) => { onClose(); nav(h.to); };
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-[#08303A]/60 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div className="s2-pop w-full max-w-xl overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={ui.top.search}>
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-5"><Search className="h-5 w-5 text-[var(--muted)]" />
          <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder={ui.search.ph} aria-label={ui.search.ph}
            onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, hits.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); } if (e.key === "Enter" && hits[i]) go(hits[i]); }}
            className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[var(--muted)]" />
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-[var(--soft)]" aria-label={UI.en.nav.close}><X className="h-5 w-5" /></button></div>
        <ul className="max-h-[55vh] overflow-y-auto p-2" role="listbox">
          {hits.length ? hits.map((h, k) => (
            <li key={h.group + h.to + h.label} role="option" aria-selected={k === i}>
              <button type="button" onMouseEnter={() => setI(k)} onClick={() => go(h)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start ${k === i ? "bg-[var(--soft)]" : ""}`}>
                <span className="w-24 shrink-0 text-[11px] font-bold uppercase tracking-wider text-[var(--primary)]">{h.group}</span>
                <span className="min-w-0"><span className="block truncate font-semibold">{h.label}</span>{h.sub && <span className="block truncate text-xs text-[var(--muted)]">{h.sub}</span>}</span>
              </button></li>)) : <li className="p-6 text-center text-sm text-[var(--muted)]">{ui.search.none}</li>}
        </ul>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ footer & floating
function Footer() {
  const { ui, site } = useS2();
  const [done, setDone] = useState(false);
  const [mail, setMail] = useState("");
  const [busy, setBusy] = useState(false);
  const [subErr, setSubErr] = useState("");
  /** Footer newsletter → Email Group "Website Health Tips" (api.public.site_subscribe). */
  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setSubErr("");
    try { await postCall("hospital_vvs.api.public.site_subscribe", { email: mail }); setDone(true); }
    catch (x) { const m = (x as { message?: string })?.message || ""; setSubErr(/429|too many/i.test(m) ? ui.footer.subBusy : ui.footer.subFail); }
    finally { setBusy(false); }
  };
  const c = site?.clinic;
  const social: [string, typeof Facebook][] = [["facebook", Facebook], ["instagram", Instagram], ["youtube", Youtube], ["linkedin", Linkedin]];
  const quick: [string, string][] = [["/site/about", ui.nav.about], ["/site/doctors", ui.nav.doctors], ["/site/rooms", ui.nav.rooms], ["/site/pharmacy", ui.nav.pharmacy], ["/site/map", ui.nav.map], ["/site/patients", ui.nav.patients], ["/site/news", ui.nav.news], ["/site/careers", ui.nav.careers]];
  return (
    <footer className="relative overflow-hidden bg-[#08303A] text-white/75">
      <div className="pointer-events-none absolute -end-24 -top-24 h-96 w-96 rounded-full bg-[#0E5E6F]/40 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-3"><img src={`${import.meta.env.BASE_URL}brand/lyallpur-mark-dark.webp`} alt="" className="h-12 w-12" /><div><div className="s2-display text-lg font-semibold text-white">{ui.name}</div><div className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#9FE3DA]">{ui.tagline}</div></div></div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed">{ui.footer.about}</p>
          <div className="mt-6 flex gap-2">{social.filter(([k]) => CONFIG.social[k]).map(([k, I]) => <a key={k} href={CONFIG.social[k]} target="_blank" rel="noopener noreferrer" aria-label={k} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"><I className="h-4 w-4" /></a>)}</div>
          {CONFIG.accreditations.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{CONFIG.accreditations.map((a) => <span key={a.name} className="rounded-full border border-white/15 px-3 py-1 text-xs">{a.name}</span>)}</div>}
        </div>
        <div><h3 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-white">{ui.footer.quick}</h3><ul className="space-y-2.5 text-sm">{quick.map(([to, l]) => <li key={to}><Link to={to} className="hover:text-white">{l}</Link></li>)}</ul></div>
        <div><h3 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-white">{ui.footer.depts}</h3><ul className="space-y-2.5 text-sm">{DEPARTMENTS.slice(0, 8).map((d) => <li key={d.slug}><Link to={`/site/departments/${d.slug}`} className="hover:text-white">{d.name}</Link></li>)}</ul></div>
        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-white">{ui.footer.contact}</h3>
          <ul className="space-y-3 text-sm">
            {c?.address && <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B66]" />{c.address}</li>}
            {c?.phone && <li><a href={tel(c.phone)} className="flex gap-2 hover:text-white"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B66]" /><span dir="ltr">{c.phone}</span></a></li>}
            {CONFIG.email && <li><a href={`mailto:${CONFIG.email}`} className="flex gap-2 hover:text-white"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B66]" />{CONFIG.email}</a></li>}
          </ul>
          <form className="mt-6" onSubmit={subscribe}>
            <div className="text-sm font-semibold text-white">{ui.footer.newsletter}</div><div className="text-xs">{ui.footer.newsSub}</div>
            {done ? <div className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white">{ui.footer.thanks}</div> : (
              <div className="mt-3 flex overflow-hidden rounded-full bg-white/10 p-1 focus-within:ring-2 focus-within:ring-[#9FE3DA]/50">
                <input type="email" required value={mail} onChange={(e) => setMail(e.target.value)} placeholder={ui.footer.emailPh} aria-label={ui.footer.emailPh} className="min-w-0 flex-1 bg-transparent px-4 text-sm text-white outline-none placeholder:text-white/50" />
                <button disabled={busy} className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : ui.footer.subscribe}</button></div>)}
            {subErr && <p className="mt-2 text-xs text-[#FFB4B1]" role="alert">{subErr}</p>}
          </form>
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-xs sm:px-6">
          <span>© {new Date().getFullYear()} {ui.name}. {ui.footer.rights}</span>
          <Link to="/site/patients#rights" className="hover:text-white">{ui.footer.privacy}</Link><Link to="/site/patients#rights" className="hover:text-white">{ui.footer.terms}</Link>
          <a href="/hms/login" className="ms-auto flex items-center gap-1.5 hover:text-white"><LogIn className="h-3.5 w-3.5" />{ui.footer.staff}</a>
          <span className="text-white/40">Hospital system by VVSDESK</span>
        </div>
      </div>
    </footer>
  );
}

function Floating() {
  const { ui, phone } = useS2();
  const [up, setUp] = useState(false);
  useEffect(() => { const f = () => setUp(window.scrollY > 700); window.addEventListener("scroll", f, { passive: true }); return () => window.removeEventListener("scroll", f); }, []);
  const er = phoneOf("emergency", phone);
  return (
    <div className="fixed bottom-5 end-5 z-50 flex flex-col items-end gap-3">
      {up && <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label={ui.float.top} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-lg"><ArrowUp className="h-5 w-5" /></button>}
      {hasWa && <a href={`https://wa.me/${CONFIG.whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label={ui.float.whatsapp} className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[#25D366] p-3.5 text-[#073B22] shadow-xl ring-4 ring-white/80"><Phone className="h-6 w-6" /></a>}
      {er && <a href={tel(er)} aria-label={ui.float.emergency} className="s2-pulse flex items-center gap-2 rounded-full bg-[var(--accent)] p-2.5 font-semibold sm:py-3 sm:pe-5 sm:ps-3 text-white shadow-[0_16px_34px_-12px_var(--accent)]">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20"><Siren className="h-[18px] w-[18px]" /></span><span className="hidden text-sm sm:inline">{ui.float.emergency}</span></a>}
    </div>
  );
}

/** Small layout helpers shared by pages. */
export const Wrap = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${className}`}>{children}</div>;

function CSS(rtl: boolean) {
  return `
  .s2{--bg:#F7FAFA;--surface:#FFFFFF;--soft:#EEF5F5;--mint:#DDF3EF;--ink:#14262E;--muted:#5B7079;--line:#E1EAEB;--primary:#0E5E6F;--accent:#E5483F;--ink2:rgba(20,38,46,.75);--primary-ring:rgba(14,94,111,.18);--accent-ring:rgba(229,72,63,.3);
    font-family:${rtl ? "'Noto Nastaliq Urdu',serif" : "'Plus Jakarta Sans',Inter,system-ui,sans-serif"};}
  .s2.s2-dark{--bg:#071C22;--surface:#0D2730;--soft:#12313B;--mint:#11393F;--ink:#E7F1F2;--muted:#9AB2B8;--line:#1D3C46;--primary:#5CC3C9;--accent:#F0574E;--ink2:rgba(231,241,242,.78);--primary-ring:rgba(92,195,201,.25);--accent-ring:rgba(240,87,78,.35);}
  .s2-glass{background:color-mix(in srgb,var(--surface) 82%,transparent)}
  .s2 .s2-display{font-family:${rtl ? "'Noto Nastaliq Urdu',serif" : "Fraunces,Georgia,serif"};font-weight:500;letter-spacing:-0.015em;${rtl ? "line-height:1.7;letter-spacing:0;" : ""}}
  ${rtl ? ".s2 p,.s2 li{line-height:2.05}" : ""}
  .s2-reveal{opacity:0;transform:translateY(22px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1)}
  .s2-reveal.is-in{opacity:1;transform:none}
  .s2-word{display:inline-block;opacity:0;transform:translateY(.45em);animation:s2word .7s cubic-bezier(.2,.7,.2,1) forwards}
  @keyframes s2word{to{opacity:1;transform:none}}
  .s2-kenburns{animation:s2kb 22s ease-in-out infinite alternate;transform-origin:60% 40%}
  @keyframes s2kb{from{transform:scale(1.02)}to{transform:scale(1.12)}}
  .s2-spin{animation:s2spin 40s linear infinite}.s2-spin-rev{animation:s2spin 28s linear infinite reverse}@keyframes s2spin{to{transform:rotate(360deg)}}
  .s2-globe{animation:s2globe 26s linear infinite}@keyframes s2globe{to{transform:rotateY(360deg)}}
  .s2-orbit{animation:s2spin 14s linear infinite}
  .s2-sign{animation:s2sign 7s ease-in-out infinite}@keyframes s2sign{0%,100%{transform:rotateY(-32deg) rotateX(6deg)}50%{transform:rotateY(32deg) rotateX(-4deg)}}
  .s2-float{animation:s2float 5.5s ease-in-out infinite}@keyframes s2float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
  .s2-pulse-soft{animation:s2ps 3.2s ease-in-out infinite}@keyframes s2ps{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.08);opacity:.25}}
  .s2-corona{background:repeating-conic-gradient(from 0deg,rgba(255,236,170,.0) 0deg 9deg,rgba(255,236,170,.22) 12deg,rgba(255,236,170,0) 15deg 24deg);
    -webkit-mask:radial-gradient(circle,#000 30%,transparent 70%);mask:radial-gradient(circle,#000 30%,transparent 70%);filter:blur(1.5px);animation:s2spin 18s linear infinite}
  .s2-halo{box-shadow:0 0 40px 12px rgba(255,236,170,.45),0 0 90px 30px rgba(159,227,218,.35);animation:s2halo 3.6s ease-in-out infinite}
  @keyframes s2halo{0%,100%{box-shadow:0 0 36px 10px rgba(255,236,170,.40),0 0 80px 26px rgba(159,227,218,.30)}50%{box-shadow:0 0 60px 20px rgba(255,236,170,.65),0 0 130px 46px rgba(159,227,218,.45)}}
  .s2-logo-glow{animation:s2lg 3.6s ease-in-out infinite}@keyframes s2lg{0%,100%{filter:drop-shadow(0 0 4px rgba(255,107,102,.35))}50%{filter:drop-shadow(0 0 14px rgba(255,107,102,.7)) brightness(1.08)}}
  .s2-logo-glow-dark{animation:s2lgd 3.6s ease-in-out infinite}@keyframes s2lgd{0%,100%{filter:drop-shadow(0 0 10px rgba(159,227,218,.5))}50%{filter:drop-shadow(0 0 22px rgba(159,227,218,.95)) drop-shadow(0 0 8px rgba(255,107,102,.6)) brightness(1.15)}}
  .s2-core{background:radial-gradient(circle,rgba(159,227,218,.55),rgba(159,227,218,0) 70%);animation:s2core 3.6s ease-in-out infinite}@keyframes s2core{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}
  .s2-shine{background:linear-gradient(105deg,transparent 20%,rgba(255,255,255,.75) 50%,transparent 80%);transform:skewX(-18deg);animation:s2shine 3.8s ease-in-out infinite}
  @keyframes s2shine{0%,40%{left:-60%}80%,100%{left:130%}}
  .s2-page{animation:s2fade .45s ease both}@keyframes s2fade{from{opacity:0}to{opacity:1}}
  .s2-pop{animation:s2pop .22s cubic-bezier(.2,.7,.2,1) both}@keyframes s2pop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
  .s2-drawer{animation:s2drawer .3s cubic-bezier(.2,.7,.2,1) both}@keyframes s2drawer{from{transform:translateX(${rtl ? "-" : ""}100%)}to{transform:none}}
  .s2-shine{position:relative;overflow:hidden}.s2-shine::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.35) 50%,transparent 65%);transform:translateX(-120%);transition:transform .8s ease}
  .s2-shine:hover::after{transform:translateX(120%)}
  .s2-skel{background:linear-gradient(90deg,var(--soft) 25%,var(--line) 50%,var(--soft) 75%);background-size:200% 100%;animation:s2sk 1.3s linear infinite}@keyframes s2sk{to{background-position:-200% 0}}
  .s2-pulse{animation:s2pl 2.4s ease-in-out infinite}@keyframes s2pl{0%,100%{box-shadow:0 0 0 0 rgba(229,72,63,.45)}50%{box-shadow:0 0 0 12px rgba(229,72,63,0)}}
  .s2 input,.s2 select,.s2 textarea{transition:border-color .2s,box-shadow .2s}
  html{scroll-behavior:smooth}
  @media (prefers-reduced-motion: reduce){.s2-reveal{opacity:1;transform:none;transition:none}.s2-word{animation:none;opacity:1;transform:none}.s2-kenburns,.s2-pulse,.s2-spin,.s2-spin-rev,.s2-globe,.s2-orbit,.s2-sign,.s2-corona,.s2-halo,.s2-logo-glow,.s2-logo-glow-dark,.s2-core,.s2-shine,.s2-pulse-soft,.s2-float,.s2-skel,.s2-page,.s2-pop,.s2-drawer{animation:none}html{scroll-behavior:auto}}
  `;
}
