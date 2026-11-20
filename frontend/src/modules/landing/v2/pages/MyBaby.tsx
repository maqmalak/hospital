/**
 * "My Baby" — the parents' section of the patient portal (D-95). Mother signs in the way the portal works today: MR number (hers or the
 * baby's) + her mobile → one-time code. Shows baby profile & location, approved nurse updates, consent-based photo of the day, NICU
 * visiting, papers (birth slip, EPI card, discharge summary, NICU daily report), vaccine reminders, care guide and danger signs.
 * English + Urdu. Session in sessionStorage only; files fetched by POST (no tokens in URLs). Also hosts the QR verification page.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, Baby, BadgeCheck, CalendarClock, Check, Clock3, Download, FileText, Heart, ImageIcon, Loader2, LogOut, MapPin, Phone, ShieldAlert, ShieldCheck, Siren, Smartphone, Syringe, X } from "lucide-react";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { phoneOf, tel } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, Eyebrow, Reveal, useTitle } from "../ui";
import { NURSERY } from "../nursery";

const M = "hospital_vvs.api.nursery.";
const KEY = "hv.nb.portal";
const ss = { get: () => { try { return sessionStorage.getItem(KEY); } catch { return null; } }, set: (v: string | null) => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* private mode */ } } };
const inp = "h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 text-[15px] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-ring)]";

const L = {
  en: { title: "My Baby", sub: "Updates, papers and vaccine reminders for your newborn — secure, no password.", signIn: "Sign in to My Baby", signSub: "Enter your MR number (or your baby's) and the mobile number you gave the hospital.",
    mr: "MR number (mother or baby)", mobile: "Mobile number", send: "Send code", code: "Enter the code", sentTo: "Sent to", verify: "Verify", other: "Use a different number", out: "Sign out",
    hello: "Hello", born: "Born", weight: "Weight", birthW: "birth", where: "Where your baby is", visiting: "Visiting", updates: "Updates from the care team", none: "No updates yet — your nurse will post here.",
    photo: "Photo of the day", papers: "Papers", paper: { birth: "Birth record slip (for NADRA / union council)", epi: "Vaccination card (EPI)", discharge: "Discharge summary", nicu: "NICU daily progress report" },
    vaccines: "Vaccines", next: "Next vaccine", given: "Given", due: "Due", reminders: "We send an SMS / WhatsApp reminder the day before each vaccine.", guide: "Care guide", guideLink: "Feeding, cord care and safe sleep",
    danger: "Danger signs — come to emergency now", call: "Call emergency", followUp: "Follow-up visit", test: "Test mode (no SMS provider): code", session: "Secure session · 30 min", consentOff: "Photos are shared only with your consent — ask the nurse." },
  ur: { title: "میرا بچہ", sub: "نومولود کی اپ ڈیٹس، کاغذات اور ویکسین کی یاد دہانی — محفوظ، پاس ورڈ کے بغیر۔", signIn: "\"میرا بچہ\" میں سائن ان کریں", signSub: "اپنا (یا بچے کا) ایم آر نمبر اور ہسپتال کو دیا گیا موبائل نمبر درج کریں۔",
    mr: "ایم آر نمبر (والدہ یا بچہ)", mobile: "موبائل نمبر", send: "کوڈ بھیجیں", code: "کوڈ درج کریں", sentTo: "بھیجا گیا", verify: "تصدیق کریں", other: "دوسرا نمبر استعمال کریں", out: "سائن آؤٹ",
    hello: "خوش آمدید", born: "پیدائش", weight: "وزن", birthW: "پیدائشی", where: "بچہ کہاں ہے", visiting: "ملاقات", updates: "نگہداشت ٹیم کی اپ ڈیٹس", none: "ابھی کوئی اپ ڈیٹ نہیں — نرس یہاں معلومات دیں گی۔",
    photo: "آج کی تصویر", papers: "کاغذات", paper: { birth: "پیدائشی ریکارڈ پرچی (نادرا / یونین کونسل)", epi: "ویکسین کارڈ (ای پی آئی)", discharge: "ڈسچارج خلاصہ", nicu: "این آئی سی یو روزانہ رپورٹ" },
    vaccines: "ویکسین", next: "اگلی ویکسین", given: "لگ گئی", due: "باقی", reminders: "ہر ویکسین سے ایک دن پہلے ایس ایم ایس / واٹس ایپ یاد دہانی بھیجی جاتی ہے۔", guide: "دیکھ بھال کی رہنمائی", guideLink: "دودھ، ناف کی دیکھ بھال اور محفوظ نیند",
    danger: "خطرے کی علامات — فوراً ایمرجنسی آئیں", call: "ایمرجنسی کال کریں", followUp: "فالو اپ", test: "ٹیسٹ موڈ (ایس ایم ایس نہیں): کوڈ", session: "محفوظ سیشن · 30 منٹ", consentOff: "تصاویر صرف آپ کی اجازت سے دکھائی جاتی ہیں — نرس سے بات کریں۔" },
};

interface Vac { vaccine: string; due: string; age: string; given_at?: string | null }
interface BabyRow { name: string; baby_name: string; sex: string; birth_datetime: string; birth_weight_g: number; current_weight_g?: number; unit: string; status: string; location: string; visiting?: string | null;
  updates: { name: string; text: string; has_photo: boolean; posted_at: string }[]; notes: { text: string; at: string }[]; epi: Vac[]; next_vaccine?: Vac | null; documents: string[]; photo_consent: number; follow_up_date?: string | null }

async function blobOf(method: string, args: Record<string, string>) {
  const r = await fetch(`/api/method/${M}${method}`, { method: "POST", body: new URLSearchParams(args), credentials: "include" });
  if (!r.ok) throw new Error(r.status === 429 ? "Too many requests — try again shortly." : "Could not load the file.");
  return URL.createObjectURL(await r.blob());
}
const fmt = (d?: string | null, ur = false) => (d ? new Date(d.replace(" ", "T")).toLocaleDateString(ur ? "ur-PK" : "en-PK", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function MyBaby() {
  const { lang } = useS2();
  const T = L[lang];
  useTitle("My Baby — parent portal", "Secure parent portal for newborns at Lyallpur Medical Complex: updates, papers and vaccine reminders.");
  const [session, setSession] = useState<string | null>(ss.get);
  const [data, setData] = useState<{ mother: string; babies: BabyRow[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async (s: string) => { try { setData(await getCall(`${M}portal_home`, { session: s })); } catch (e) { setErr(humanizeError(e)); ss.set(null); setSession(null); } }, []);
  useEffect(() => { if (session) void load(session); }, [session, load]);
  return (
    <div className="min-h-[70vh] bg-[var(--soft)] pb-24">
      <section className="relative overflow-hidden bg-[#08303A] pb-28 pt-12 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_300px_at_100%_0%,rgba(207,230,247,0.22),transparent_60%),radial-gradient(500px_260px_at_0%_100%,rgba(247,214,218,0.14),transparent_60%)]" />
        <Wrap className="relative flex flex-wrap items-end justify-between gap-4">
          <div><Eyebrow light>{NURSERY[lang].hero.eyebrow}</Eyebrow>
            <h1 className="s2-display text-[2.4rem] leading-tight sm:text-[3.2rem]">{data ? `${T.hello}, ${data.mother.split(" ")[0]}` : T.title}</h1>
            <p className="mt-2 max-w-xl text-white/70">{T.sub}</p></div>
          {data && <button onClick={() => { ss.set(null); setSession(null); setData(null); }} className={`${btn.glass} px-5 py-2.5 text-sm`}><LogOut className="h-4 w-4" />{T.out}</button>}
        </Wrap>
      </section>
      <Wrap className="relative -mt-20">
        {!session ? <SignIn T={T} notice={err} onDone={(s) => { ss.set(s); setErr(""); setSession(s); }} />
          : !data ? <div className={`${card} flex items-center justify-center gap-2 p-16 text-[var(--muted)] hover:translate-y-0`}><Loader2 className="h-5 w-5 animate-spin" /></div>
          : <div className="space-y-6">{data.babies.map((b) => <BabyCard key={b.name} b={b} session={session} T={T} />)}<DangerCard T={T} /></div>}
      </Wrap>
    </div>
  );
}

function SignIn({ T, onDone, notice }: { T: (typeof L)["en"]; onDone: (s: string) => void; notice?: string }) {
  const [ident, setIdent] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<{ masked: string; test_code?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice || "");
  const request = async () => { setBusy(true); setErr(""); try { setSent(await postCall(`${M}portal_request`, { ident, phone })); } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); } };
  const verify = async () => { setBusy(true); setErr(""); try { onDone((await postCall<{ session: string }>(`${M}portal_verify`, { phone, code })).session); } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <div className={`${card} mx-auto max-w-2xl p-6 hover:translate-y-0 sm:p-10`}>
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--accent)] text-white"><Baby className="h-7 w-7" /></span>
      {!sent ? <form onSubmit={(e) => { e.preventDefault(); void request(); }}>
        <h2 className="s2-display mt-5 text-[1.9rem]">{T.signIn}</h2><p className="mt-1 text-[var(--muted)]">{T.signSub}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-semibold">{T.mr}</span><input className={inp} value={ident} onChange={(e) => setIdent(e.target.value.toUpperCase())} placeholder="MR-FSD-000123" dir="ltr" autoFocus /></label>
          <label><span className="mb-2 block text-sm font-semibold">{T.mobile}</span><input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03XX XXXXXXX" dir="ltr" /></label>
        </div>
        {err && <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="h-5 w-5 shrink-0" />{err}</p>}
        <button disabled={busy || ident.length < 5 || phone.replace(/\D/g, "").length < 10} className={`${btn.teal} mt-6 disabled:opacity-60`}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5" />}{T.send}</button>
      </form> : <form onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <h2 className="s2-display mt-5 text-[1.9rem]">{T.code}</h2><p className="mt-1 text-[var(--muted)]">{T.sentTo} <b dir="ltr">{sent.masked}</b></p>
        {sent.test_code && <p className="mt-3 inline-block rounded-xl bg-amber-500/15 px-3 py-1.5 text-sm text-amber-800 dark:text-amber-200">{T.test} <b className="tracking-widest" data-testcode>{sent.test_code}</b></p>}
        <input className={`${inp} mt-5 max-w-xs text-center text-2xl tracking-[0.5em]`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoFocus aria-label={T.code} dir="ltr" />
        {err && <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="h-5 w-5 shrink-0" />{err}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3"><button disabled={busy || code.length < 6} className={`${btn.teal} disabled:opacity-60`}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{T.verify}</button>
          <button type="button" onClick={() => { setSent(null); setCode(""); }} className="text-sm font-semibold text-[var(--primary)]">{T.other}</button></div>
      </form>}
    </div>
  );
}

function BabyCard({ b, session, T }: { b: BabyRow; session: string; T: (typeof L)["en"] }) {
  const { lang } = useS2();
  const ur = lang === "ur";
  const [busy, setBusy] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const pdf = async (kind: string) => { setBusy(kind); try { const u = await blobOf("portal_pdf", { session, name: b.name, kind }); const a = document.createElement("a"); a.href = u; a.download = `${b.name}-${kind}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000); } catch (e) { alert((e as Error).message); } finally { setBusy(""); } };
  const showPhoto = async (id: string) => { try { setPhoto(await blobOf("portal_photo", { session, update: id })); } catch (e) { alert((e as Error).message); } };
  const home = b.status === "Discharged";
  return (
    <Reveal className={`${card} overflow-hidden hover:translate-y-0`}>
      <div className="relative flex flex-wrap items-center gap-5 bg-gradient-to-r from-[#FBF6EF] via-[#EEF5FB] to-[#FBF0F1] p-6 dark:from-[#0B2129] dark:via-[#0C2530] dark:to-[#122129] sm:p-8">
        <span className="grid h-16 w-16 place-items-center rounded-3xl bg-[var(--accent)] text-white shadow-[0_14px_30px_-12px_var(--accent)]"><Baby className="h-8 w-8" /></span>
        <div className="min-w-0 flex-1"><h2 className="s2-display text-[1.8rem] leading-tight">{b.baby_name}</h2>
          <div className="text-sm text-[var(--muted)]">{T.born} {fmt(b.birth_datetime, ur)} · {T.weight} {b.current_weight_g ?? b.birth_weight_g} g ({T.birthW} {b.birth_weight_g} g)</div></div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${home ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-[var(--primary)]/12 text-[var(--primary)]"}`}>{b.status}</span>
      </div>
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info icon={MapPin} label={T.where} value={b.location} />
            {b.visiting ? <Info icon={Clock3} label={T.visiting} value={b.visiting} /> : b.follow_up_date ? <Info icon={CalendarClock} label={T.followUp} value={fmt(b.follow_up_date, ur)} /> : null}
          </div>
          <section><h3 className="mb-3 flex items-center gap-2 font-bold"><Heart className="h-5 w-5 text-[var(--accent)]" />{T.updates}</h3>
            {!b.updates.length && !b.notes.length ? <p className="text-sm text-[var(--muted)]">{T.none}</p> : (
              <ol className="relative space-y-4 border-s-2 border-[var(--line)] ps-5">
                {b.updates.map((u) => <li key={u.name} className="relative"><span className="absolute -start-[27px] top-1 h-3 w-3 rounded-full bg-[var(--accent)] ring-4 ring-[var(--surface)]" />
                  <div className="text-xs font-semibold text-[var(--muted)]">{u.posted_at}</div><p className="text-[15px] leading-relaxed">{u.text}</p>
                  {u.has_photo && <button onClick={() => void showPhoto(u.name)} className={`${btn.ghost} mt-2 px-4 py-2 text-sm`}><ImageIcon className="h-4 w-4" />{T.photo}</button>}</li>)}
                {b.notes.map((n, i) => <li key={i} className="relative"><span className="absolute -start-[27px] top-1 h-3 w-3 rounded-full bg-[var(--primary)] ring-4 ring-[var(--surface)]" />
                  <div className="text-xs font-semibold text-[var(--muted)]">{n.at}</div><p className="text-[15px] leading-relaxed">{n.text}</p></li>)}
              </ol>)}
            {!b.photo_consent && <p className="mt-3 text-xs text-[var(--muted)]">{T.consentOff}</p>}
          </section>
        </div>
        <div className="space-y-5">
          <section className="rounded-[20px] border border-[var(--line)] p-5"><h3 className="mb-3 flex items-center gap-2 font-bold"><FileText className="h-5 w-5 text-[var(--primary)]" />{T.papers}</h3>
            <div className="space-y-2">{b.documents.map((k) => <button key={k} onClick={() => void pdf(k)} disabled={busy === k} className="flex w-full items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 text-start text-sm font-semibold transition hover:bg-[var(--mint)]">
              {busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-[var(--primary)]" />}<span className="flex-1">{T.paper[k as keyof typeof T.paper]}</span><span className="text-xs text-[var(--muted)]">PDF</span></button>)}</div></section>
          <section className="rounded-[20px] border border-[var(--line)] p-5"><h3 className="mb-3 flex items-center gap-2 font-bold"><Syringe className="h-5 w-5 text-[var(--accent)]" />{T.vaccines}</h3>
            {b.next_vaccine && <div className="mb-3 rounded-2xl bg-[var(--mint)] p-3 text-sm"><b>{T.next}:</b> {b.next_vaccine.vaccine} · {fmt(b.next_vaccine.due, ur)}</div>}
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pe-1 text-sm">{b.epi.map((v) => <li key={v.vaccine} className="flex items-center justify-between gap-2"><span>{v.vaccine} <span className="text-xs text-[var(--muted)]">· {v.age}</span></span>
              <span className={`shrink-0 text-xs font-semibold ${v.given_at ? "text-emerald-600" : "text-[var(--muted)]"}`}>{v.given_at ? `✓ ${T.given}` : `${T.due} ${fmt(v.due, ur)}`}</span></li>)}</ul>
            <p className="mt-3 text-xs text-[var(--muted)]">{T.reminders}</p></section>
          <Link to="/site/nursery#guide" className="flex items-center gap-3 rounded-[20px] border border-[var(--line)] p-5 transition hover:border-[var(--primary)]"><BadgeCheck className="h-6 w-6 text-[var(--primary)]" /><span><b className="block">{T.guide}</b><span className="text-sm text-[var(--muted)]">{T.guideLink}</span></span></Link>
        </div>
      </div>
      {photo && <div className="fixed inset-0 z-[95] grid place-items-center bg-black/80 p-4" onClick={() => { URL.revokeObjectURL(photo); setPhoto(null); }}>
        <img src={photo} alt={T.photo} className="max-h-[85vh] max-w-full rounded-2xl" /><button aria-label="Close" className="absolute end-4 top-4 rounded-full bg-white/15 p-2 text-white"><X className="h-6 w-6" /></button></div>}
    </Reveal>
  );
}

function Info({ icon: I, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return <div className="flex gap-3 rounded-2xl bg-[var(--soft)] p-4"><I className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" /><div><div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</div><div className="font-semibold">{value}</div></div></div>;
}

function DangerCard({ T }: { T: (typeof L)["en"] }) {
  const { lang, phone } = useS2();
  const er = phoneOf("emergency", phone);
  return (
    <Reveal className="rounded-[24px] border-2 border-[var(--accent)]/40 bg-[var(--accent)]/[0.06] p-6">
      <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-white"><Siren className="h-5 w-5" /></span>
        <div className="flex-1"><h3 className="font-bold text-[var(--accent)]">{T.danger}</h3>
          <ul className="mt-2 grid gap-1.5 text-[15px] sm:grid-cols-2">{NURSERY[lang].danger.list.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />{x}</li>)}</ul>
          {er && <a href={tel(er)} className={`${btn.primary} mt-4 px-5 py-3 text-sm`}><Phone className="h-4 w-4" />{T.call} <span dir="ltr">· {er}</span></a>}</div></div>
    </Reveal>
  );
}

/** QR check of a printed newborn document (no clinical data shown). */
export function MyBabyVerify() {
  useTitle("Verify a newborn document");
  const { kind = "", name = "", sig = "" } = useParams();
  const [c, setC] = useState<{ valid: boolean; document?: string; reference?: string; mother?: string; birth_date?: string; sex?: string; discharged?: string; clinic?: string; phone?: string } | null>(null);
  const once = useRef(false);
  useEffect(() => { if (once.current) return; once.current = true; getCall<typeof c>(`${M}verify`, { kind, name, sig }).then(setC).catch(() => setC({ valid: false })); }, [kind, name, sig]);
  return (
    <section className="min-h-[60vh] bg-[var(--soft)] py-16"><Wrap className="max-w-2xl">
      {!c ? <div className={`${card} flex justify-center p-16`}><Loader2 className="h-6 w-6 animate-spin text-[var(--muted)]" /></div> : (
        <div className={`${card} overflow-hidden hover:translate-y-0`}>
          <div className={`px-6 py-10 text-center text-white ${c.valid ? "bg-gradient-to-br from-emerald-600 to-[#0E5E6F]" : "bg-gradient-to-br from-rose-600 to-rose-800"}`}>
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/15">{c.valid ? <ShieldCheck className="h-10 w-10" /> : <ShieldAlert className="h-10 w-10" />}</span>
            <h1 className="s2-display mt-5 text-[2rem]">{c.valid ? "Genuine document" : "Not verified"}</h1>
            <p className="mt-2 text-white/80">{c.valid ? "Issued and signed by Lyallpur Medical Complex." : "This code does not match a document we issued. Please contact the hospital."}</p></div>
          {c.valid && <dl className="grid gap-px bg-[var(--line)] sm:grid-cols-2">{([["Document", c.document], ["Reference", c.reference], ["Mother", c.mother], ["Date of birth", c.birth_date], ["Sex", c.sex], ["Discharged", c.discharged]] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="bg-[var(--surface)] px-6 py-4"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{k}</dt><dd className="font-semibold">{v}</dd></div>))}</dl>}
          <p className="border-t border-[var(--line)] px-6 py-4 text-sm text-[var(--muted)]">{c.clinic}{c.phone ? ` · ${c.phone}` : ""}</p>
        </div>)}
    </Wrap></section>
  );
}
