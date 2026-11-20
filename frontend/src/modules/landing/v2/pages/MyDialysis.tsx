/**
 * "My Dialysis" — the dialysis section of the patient portal (D-99). Sign-in like the rest of the portal: MR or dialysis number + mobile →
 * one-time code. Upcoming sessions (request a swap — the in-charge approves), session history with weights and BP, monthly lab trends,
 * package balance and receipts, monthly summary + schedule card downloads (POST, no tokens in URLs), diet & fluid guide, warning signs with
 * an emergency call button. Reminders go out through the hospital's SMS / WhatsApp. English + Urdu. Also hosts the QR verification page.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, BadgeCheck, CalendarClock, Download, Droplets, FileText, Loader2, LogOut, Phone, Receipt, Repeat2, ShieldAlert, ShieldCheck, Siren, Smartphone, X } from "lucide-react";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { LabTrends, type Trends } from "@/modules/dialysis/LabTrends";
import { phoneOf, rs, tel } from "../data";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, Reveal, useTitle } from "../ui";
import { NEPH } from "../neph";

const M = "hospital_vvs.api.dialysis.";
const KEY = "hv.dia.portal";
const ss = { get: () => { try { return sessionStorage.getItem(KEY); } catch { return null; } }, set: (v: string | null) => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* private mode */ } } };
const inp = "h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 text-[15px] outline-none transition placeholder:text-[var(--muted)] focus:border-[#0369a1] focus:ring-4 focus:ring-sky-400/25";

const L = {
  en: { title: "My Dialysis", sub: "Your sessions, results and package — secure, no password.", signIn: "Sign in to My Dialysis", signSub: "Enter your MR number or dialysis number (DP-…) and the mobile number you gave the unit.",
    ident: "MR or dialysis number", mobile: "Mobile number", send: "Send code", code: "Enter the code", sentTo: "Sent to", verify: "Verify", other: "Use a different number", out: "Sign out", hello: "Hello",
    schedule: "Your schedule", station: "Station", upcoming: "Upcoming sessions", swap: "Request a change", swapReq: "Change requested", newDate: "New date", newShift: "New shift", reason: "Reason", send2: "Send request",
    history: "Session history", weight: "Weight (pre → post)", bp: "BP", uf: "UF", labs: "Monthly lab trends", package: "Package", left: "sessions left of", receipts: "Receipts", docs: "Downloads",
    card: "Schedule card", monthly: "Monthly summary", screening: "Viral screening", due: "due", guide: "Diet & fluid guide", guideItems: ["Keep weight gain between sessions under about 2–2.5 kg — limit fluids to about 1 litre a day plus your urine.", "Less salt, no achar or packaged snacks; limit bananas, oranges, tomatoes and dried fruit (potassium).", "Take phosphate binders with meals; avoid cola and processed cheese.", "Protect your fistula arm: no BP cuff or blood tests on that arm."],
    test: "Test mode (no SMS provider): code", session: "Secure session · 30 min", unit: "Dialysis unit", none: "No sessions yet.", paid: "Payment", isolated: "You dialyse on a dedicated infection-control station." },
  ur: { title: "میرا ڈائیلاسز", sub: "آپ کے سیشن، رپورٹس اور پیکج — محفوظ، پاس ورڈ کے بغیر۔", signIn: "\"میرا ڈائیلاسز\" میں سائن ان کریں", signSub: "اپنا ایم آر یا ڈائیلاسز نمبر (DP-…) اور یونٹ کو دیا گیا موبائل نمبر درج کریں۔",
    ident: "ایم آر یا ڈائیلاسز نمبر", mobile: "موبائل نمبر", send: "کوڈ بھیجیں", code: "کوڈ درج کریں", sentTo: "بھیجا گیا", verify: "تصدیق کریں", other: "دوسرا نمبر", out: "سائن آؤٹ", hello: "خوش آمدید",
    schedule: "آپ کا شیڈول", station: "اسٹیشن", upcoming: "آنے والے سیشن", swap: "تبدیلی کی درخواست", swapReq: "تبدیلی کی درخواست دی گئی", newDate: "نئی تاریخ", newShift: "نئی شفٹ", reason: "وجہ", send2: "درخواست بھیجیں",
    history: "سیشن کی تاریخ", weight: "وزن (پہلے → بعد)", bp: "بلڈ پریشر", uf: "یو ایف", labs: "ماہانہ ٹیسٹ", package: "پیکج", left: "سیشن باقی، کل", receipts: "رسیدیں", docs: "ڈاؤن لوڈ",
    card: "شیڈول کارڈ", monthly: "ماہانہ خلاصہ", screening: "وائرل اسکریننگ", due: "مقررہ تاریخ", guide: "خوراک اور پانی", guideItems: ["سیشنوں کے درمیان وزن 2 سے 2.5 کلو سے کم بڑھنے دیں — روزانہ تقریباً ایک لیٹر پانی اور پیشاب کے برابر۔", "نمک کم، اچار اور پیک شدہ اسنیکس نہیں؛ کیلا، مالٹا، ٹماٹر اور خشک میوہ کم کریں۔", "فاسفیٹ کی دوا کھانے کے ساتھ لیں؛ کولا اور پروسیسڈ پنیر سے پرہیز۔", "فسٹولا والے بازو پر بی پی کف یا خون کا ٹیسٹ نہیں۔"],
    test: "ٹیسٹ موڈ: کوڈ", session: "محفوظ سیشن · 30 منٹ", unit: "ڈائیلاسز یونٹ", none: "ابھی کوئی سیشن نہیں۔", paid: "ادائیگی", isolated: "آپ کا ڈائیلاسز انفیکشن کنٹرول کے الگ اسٹیشن پر ہوتا ہے۔" },
};
type Tx = (typeof L)["en"];
interface Home {
  profile: { name: string; patient_name: string; mr?: string; days?: string; shift?: string; station?: string; shift_time: [string, string]; dry_weight?: number; zone_isolated: boolean; status: string; screening: { state: string; due?: string } };
  upcoming: { name: string; session_date: string; shift: string; station?: string; status: string; payment_status: string; swap_status?: string; swap_requested_date?: string; swap_requested_shift?: string }[];
  history: { name: string; session_date: string; status: string; pre_weight?: number; post_weight?: number; weight_gain?: number; pre_bp_sys?: number; pre_bp_dia?: number; post_bp_sys?: number; post_bp_dia?: number; total_uf?: number; urr?: number; ktv?: number }[];
  receipts: { name: string; posted_at: string; patient_total: number; items: string }[]; package: { remaining: number; total: number }; reviews: { name: string; month: string; status: string }[];
  labs: Trends["series"]; keys: Trends["keys"]; unit_phone?: string; shifts: Record<string, [string, string]>;
}
const fmt = (d: string, ur = false) => new Date(d.slice(0, 10) + "T00:00").toLocaleDateString(ur ? "ur-PK" : "en-PK", { weekday: "short", day: "numeric", month: "short" });

async function download(args: Record<string, string>, fname: string) {
  const r = await fetch(`/api/method/${M}portal_pdf`, { method: "POST", body: new URLSearchParams(args), credentials: "include" });
  if (!r.ok) throw new Error("Could not load the file.");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function MyDialysis() {
  const { lang, phone } = useS2();
  const T = L[lang];
  useTitle("My Dialysis — patient portal", "Secure portal for dialysis patients at Lyallpur Medical Complex: schedule, sessions, lab trends, package balance and documents.");
  const [session, setSession] = useState<string | null>(ss.get);
  const [data, setData] = useState<Home | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async (s: string) => { try { setData(await postCall<Home>(`${M}portal_home`, { session: s })); } catch (e) { setErr(humanizeError(e)); ss.set(null); setSession(null); } }, []);
  useEffect(() => { if (session) void load(session); }, [session, load]);
  const emergency = phoneOf("emergency", phone);
  return (
    <div className="min-h-[70vh] bg-[var(--soft)] pb-24">
      <section className="relative overflow-hidden bg-[var(--hero)] pb-28 pt-12 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_300px_at_100%_0%,rgba(56,189,248,0.22),transparent_60%),radial-gradient(500px_260px_at_0%_100%,rgba(139,92,246,0.2),transparent_60%)]" />
        <Wrap className="relative flex flex-wrap items-end justify-between gap-4">
          <div><Link to="/site/nephrology" className="text-sm text-white/70 hover:text-white">← {NEPH[lang].title}</Link>
            <h1 className="s2-display mt-3 text-[2.4rem] leading-tight sm:text-[3.2rem]">{data ? `${T.hello}, ${data.profile.patient_name.split(" ")[0]}` : T.title}</h1>
            <p className="mt-2 max-w-xl text-white/75">{T.sub}</p></div>
          {data && <button onClick={() => { ss.set(null); setSession(null); setData(null); }} className={`${btn.glass} px-5 py-2.5 text-sm`}><LogOut className="h-4 w-4" />{T.out}</button>}
        </Wrap>
      </section>
      <Wrap className="relative -mt-20">
        {!session ? <SignIn T={T} notice={err} onDone={(s) => { ss.set(s); setErr(""); setSession(s); }} />
          : !data ? <div className={`${card} flex items-center justify-center gap-2 p-16 text-[var(--muted)] hover:translate-y-0`}><Loader2 className="h-5 w-5 animate-spin" /></div>
          : <Dashboard d={data} T={T} session={session} lang={lang} onReload={() => void load(session)} emergency={emergency} />}
      </Wrap>
    </div>
  );
}

function Dashboard({ d, T, session, lang, onReload, emergency }: { d: Home; T: Tx; session: string; lang: "en" | "ur"; onReload: () => void; emergency?: string }) {
  const [swap, setSwap] = useState<Home["upcoming"][number] | null>(null);
  const [err, setErr] = useState("");
  const p = d.profile;
  const ur = lang === "ur";
  const dl = (args: Record<string, string>, f: string) => download({ session, ...args }, f).catch((e) => setErr(String(e.message || e)));
  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-3">
        <Reveal className={`${card} overflow-hidden p-0 hover:translate-y-0 lg:col-span-2`}>
          <div className="bg-gradient-to-br from-[#0369a1] to-[#6d28d9] p-6 text-white"><div className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">{T.schedule}</div>
            <div className="s2-display mt-1 text-3xl">{p.days ?? "—"}</div><div className="mt-1 text-white/85">{p.shift ? `${p.shift} · ${p.shift_time.join("–")}` : ""}{p.station ? ` · ${T.station} ${p.station}` : ""}</div>
            {p.zone_isolated && <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs"><ShieldCheck className="h-3.5 w-3.5" />{T.isolated}</div>}</div>
          <div className="p-5"><h2 className="mb-3 flex items-center gap-2 font-bold"><CalendarClock className="h-5 w-5 text-[#0369a1] dark:text-sky-300" />{T.upcoming}</h2>
            {d.upcoming.length ? <ul className="divide-y divide-[var(--line)]">{d.upcoming.map((s) => <li key={s.name} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1"><b>{fmt(s.session_date, ur)}</b> · {s.shift} {d.shifts[s.shift]?.[0] ?? ""}<span className="block text-xs text-[var(--muted)]">{T.station} {s.station ?? "—"} · {T.paid}: {s.payment_status === "Unpaid" ? "pay at the counter" : s.payment_status}</span></span>
              {s.swap_status === "Requested" ? <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200">{T.swapReq}: {s.swap_requested_date} {s.swap_requested_shift}</span>
                : s.status === "Scheduled" && <button onClick={() => setSwap(s)} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-sm font-semibold hover:border-[#0369a1]"><Repeat2 className="h-4 w-4" />{T.swap}</button>}</li>)}</ul>
              : <p className="text-sm text-[var(--muted)]">{T.none}</p>}</div>
        </Reveal>
        <div className="space-y-5">
          <Reveal className={`${card} p-5 hover:translate-y-0`}><div className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{T.package}</div>
            <div className="s2-num mt-1 text-4xl font-semibold text-[#6d28d9] dark:text-violet-300">{d.package.remaining}</div><div className="text-sm text-[var(--muted)]">{T.left} {d.package.total}</div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--soft)]"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500" style={{ width: `${d.package.total ? (d.package.remaining / d.package.total) * 100 : 0}%` }} /></div></Reveal>
          <Reveal className={`${card} p-5 hover:translate-y-0`}><div className="flex items-center gap-2 text-sm font-bold">{p.screening.state === "ok" ? <BadgeCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}{T.screening}</div>
            <p className="mt-1 text-sm text-[var(--muted)]">{p.screening.state}{p.screening.due ? ` · ${T.due} ${p.screening.due}` : ""}</p></Reveal>
          <Reveal className={`${card} p-5 hover:translate-y-0`}><div className="mb-2 text-sm font-bold">{T.docs}</div>
            <div className="flex flex-col gap-2"><button onClick={() => void dl({ kind: "card" }, `schedule-card-${p.name}.pdf`)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold hover:border-[#0369a1]"><Download className="h-4 w-4" />{T.card}</button>
              {d.reviews.filter((r) => r.status === "Signed").slice(0, 3).map((r) => <button key={r.name} onClick={() => void dl({ kind: "monthly", name: r.name }, `monthly-${r.month.slice(0, 7)}.pdf`)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold hover:border-[#0369a1]"><FileText className="h-4 w-4" />{T.monthly} · {new Date(r.month + "T00:00").toLocaleDateString(ur ? "ur-PK" : "en-PK", { month: "long", year: "numeric" })}</button>)}</div>
            {err && <p className="mt-2 text-xs text-rose-600">{err}</p>}</Reveal>
        </div>
      </div>

      <Reveal className={`${card} p-5 hover:translate-y-0`}><h2 className="mb-3 font-bold">{T.history}</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="text-xs text-[var(--muted)]"><tr><th className="py-1 text-start">Date</th><th className="text-start">{T.weight}</th><th className="text-start">{T.bp}</th><th className="text-start">{T.uf}</th><th className="text-start">URR / Kt/V</th></tr></thead>
          <tbody>{d.history.map((s) => <tr key={s.name} className="border-t border-[var(--line)]"><td className="py-2">{fmt(s.session_date, ur)}{s.status === "Missed" && <span className="ms-1 text-xs font-bold text-rose-600">missed</span>}</td>
            <td>{s.pre_weight ?? "—"} → {s.post_weight ?? "—"}{s.weight_gain && s.weight_gain > 3 ? <span className="ms-1 text-xs font-bold text-rose-600">+{s.weight_gain}</span> : null}</td><td>{s.pre_bp_sys ?? ""}/{s.pre_bp_dia ?? ""} → {s.post_bp_sys ?? ""}/{s.post_bp_dia ?? ""}</td><td>{s.total_uf ?? "—"}</td><td>{s.urr ? `${s.urr}% / ${s.ktv}` : "—"}</td></tr>)}</tbody></table></div></Reveal>

      <Reveal className={`${card} p-5 hover:translate-y-0`}><h2 className="mb-3 font-bold">{T.labs}</h2><LabTrends data={{ series: d.labs, keys: d.keys }} height={130} /></Reveal>

      <div className="grid gap-5 lg:grid-cols-3">
        <Reveal className={`${card} p-5 hover:translate-y-0`}><h2 className="mb-2 flex items-center gap-2 font-bold"><Receipt className="h-5 w-5" />{T.receipts}</h2>
          <ul className="space-y-1.5 text-sm">{d.receipts.map((r) => <li key={r.name} className="flex justify-between gap-2"><span className="min-w-0 truncate">{r.posted_at.slice(0, 10)} · {r.items}</span><b className="tabular-nums">{rs(r.patient_total)}</b></li>)}</ul>
          {!d.receipts.length && <p className="text-sm text-[var(--muted)]">—</p>}</Reveal>
        <Reveal className={`${card} p-5 hover:translate-y-0`}><h2 className="mb-2 flex items-center gap-2 font-bold"><Droplets className="h-5 w-5 text-[#0369a1] dark:text-sky-300" />{T.guide}</h2>
          <ul className="space-y-2 text-sm">{T.guideItems.map((g) => <li key={g} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />{g}</li>)}</ul></Reveal>
        <Reveal className="rounded-[22px] border-2 border-rose-300 bg-rose-50 p-5 dark:border-rose-500/40 dark:bg-rose-500/10"><h2 className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-200"><AlertCircle className="h-5 w-5" />{NEPH[lang].warnTitle}</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-rose-900 dark:text-rose-100">{NEPH[lang].warn.map((w) => <li key={w}>• {w}</li>)}</ul>
          <div className="mt-4 flex flex-wrap gap-2">{emergency && <a href={tel(emergency)} className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white"><Siren className="h-4 w-4" />{NEPH[lang].callEmergency}</a>}
            {d.unit_phone && <a href={tel(d.unit_phone)} className="inline-flex items-center gap-2 rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold"><Phone className="h-4 w-4" />{T.unit}</a>}</div></Reveal>
      </div>
      {swap && <SwapDialog s={swap} T={T} session={session} shifts={d.shifts} onClose={() => setSwap(null)} onDone={() => { setSwap(null); onReload(); }} />}
    </div>
  );
}

function SwapDialog({ s, T, session, shifts, onClose, onDone }: { s: Home["upcoming"][number]; T: Tx; session: string; shifts: Record<string, [string, string]>; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(s.session_date);
  const [shift, setShift] = useState(s.shift);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); setErr(""); try { await postCall(`${M}portal_swap`, { session, name: s.name, date, shift, reason }); onDone(); } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); } };
  const min = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={T.swap} onClick={(e) => e.stopPropagation()} className={`${card} w-full max-w-md rounded-b-none p-6 hover:translate-y-0 sm:rounded-[22px]`}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{T.swap}</h2><button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        <p className="mb-3 text-sm text-[var(--muted)]">{s.session_date} · {s.shift}</p>
        <label className="block"><span className="mb-1 block text-sm font-semibold">{T.newDate}</span><input type="date" min={min} className={inp} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="mt-3 block"><span className="mb-1 block text-sm font-semibold">{T.newShift}</span><select className={inp} value={shift} onChange={(e) => setShift(e.target.value)}>{Object.entries(shifts).map(([k, t]) => <option key={k} value={k}>{k} · {t.join("–")}</option>)}</select></label>
        <label className="mt-3 block"><span className="mb-1 block text-sm font-semibold">{T.reason}</span><input className={inp} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
        <button disabled={busy || reason.trim().length < 3} onClick={() => void send()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-violet-400 px-5 py-3 font-semibold text-[#0b1b2b] disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{T.send2}</button>
      </div>
    </div>
  );
}

function SignIn({ T, onDone, notice }: { T: Tx; onDone: (s: string) => void; notice?: string }) {
  const [ident, setIdent] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<{ masked: string; test_code?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice ?? "");
  const request = async () => { setBusy(true); setErr(""); try { setSent(await postCall(`${M}portal_request`, { ident, phone })); } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); } };
  const verify = async () => { setBusy(true); setErr(""); try { const r = await postCall<{ session: string }>(`${M}portal_verify`, { ident, phone, code }); onDone(r.session); } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <div className={`${card} mx-auto max-w-lg p-6 hover:translate-y-0 sm:p-8`}>
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-violet-500 text-white"><Smartphone className="h-7 w-7" /></span>
      <h2 className="s2-display mt-4 text-2xl">{T.signIn}</h2><p className="mt-1 text-sm text-[var(--muted)]">{T.signSub}</p>
      {!sent ? <div className="mt-5 space-y-3">
        <input className={inp} value={ident} onChange={(e) => setIdent(e.target.value)} placeholder={T.ident} aria-label={T.ident} dir="ltr" />
        <input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={T.mobile} aria-label={T.mobile} inputMode="tel" dir="ltr" />
        <button disabled={busy || !ident.trim() || phone.replace(/\D/g, "").length < 10} onClick={() => void request()} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-violet-400 px-5 py-3 font-semibold text-[#0b1b2b] disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{T.send}</button>
      </div> : <div className="mt-5 space-y-3">
        <p className="text-sm">{T.sentTo} <b dir="ltr">{sent.masked}</b>{sent.test_code && <span className="ms-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{T.test} {sent.test_code}</span>}</p>
        <input className={`${inp} text-center text-2xl tracking-[0.5em]`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" aria-label={T.code} inputMode="numeric" autoFocus />
        <button disabled={busy || code.length !== 6} onClick={() => void verify()} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-violet-400 px-5 py-3 font-semibold text-[#0b1b2b] disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{T.verify}</button>
        <button onClick={() => { setSent(null); setCode(""); }} className="w-full text-sm text-[var(--muted)] hover:underline">{T.other}</button>
      </div>}
      {err && <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">{err}</p>}
      <p className="mt-4 text-center text-xs text-[var(--muted)]">{T.session}</p>
    </div>
  );
}

/** QR verification of dialysis documents: /site/my-dialysis/verify/:kind/:name/:sig — confirms authenticity without showing clinical data. */
export function MyDialysisVerify() {
  const { kind = "", name = "", sig = "" } = useParams();
  const [r, setR] = useState<{ valid: boolean; document?: string; reference?: string; patient?: string; clinic?: string; phone?: string } | null>(null);
  useTitle("Verify a dialysis document", "Check that a Lyallpur Medical Complex dialysis document is genuine.");
  useEffect(() => { getCall<typeof r>(`${M}verify`, { kind, name, sig }).then(setR).catch(() => setR({ valid: false })); }, [kind, name, sig]);
  return (
    <div className="bg-[var(--soft)] py-24"><Wrap><div className={`${card} mx-auto max-w-lg p-8 text-center hover:translate-y-0`}>
      {!r ? <Loader2 className="mx-auto h-8 w-8 animate-spin" /> : r.valid ? <>
        <BadgeCheck className="mx-auto h-16 w-16 text-emerald-500" /><h1 className="s2-display mt-4 text-3xl">Genuine document</h1>
        <p className="mt-2 text-[var(--muted)]">{r.document} · <span className="font-mono">{r.reference}</span></p><p className="mt-1 text-sm">Patient initials: <b>{r.patient}</b></p>
        <p className="mt-4 text-xs text-[var(--muted)]">Issued by {r.clinic}. Clinical details are not shown here — call {r.phone} to confirm more.</p></> : <>
        <ShieldAlert className="mx-auto h-16 w-16 text-rose-500" /><h1 className="s2-display mt-4 text-3xl">Not verified</h1><p className="mt-2 text-[var(--muted)]">This code does not match a document issued by the dialysis unit.</p></>}
    </div></Wrap></div>
  );
}
