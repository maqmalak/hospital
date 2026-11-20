/**
 * "Download my report" (D-91, Part C3): booking ID or MR number + mobile → one-time code → the patient's scans: status, view,
 * PDF, key images, share with a doctor (secure expiring link), request a printed copy / CD, and a history timeline.
 * The portal session lives in sessionStorage only (30 minutes server-side); files are fetched by POST, never with tokens in URLs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, BellRing, Check, ChevronLeft, ChevronRight, Clock3, Copy, Disc3, Download, Eye, FileText, History, ImageIcon, KeyRound, Loader2,
  LogOut, MessageCircle, Printer, Share2, ShieldCheck, Smartphone, X,
} from "lucide-react";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { Wrap } from "../SiteV2";
import { btn, card, Reveal, useTitle } from "../ui";
import { dmy, hm12 } from "../radiology";

interface Study { name: string; booking_ref: string; procedure_name: string; modality: string; scheduled_date: string; slot_time?: string; status: string; report_status: string;
  ready: boolean; state: "Ready" | "Pending" | "Cancelled"; images: number; expected_at?: string; verified_at?: string; copy_requested?: number; report_version?: number }
interface List { patient: string; mr?: string; studies: Study[] }

const KEY = "hv.rad.portal";
const ss = { get: () => { try { return sessionStorage.getItem(KEY); } catch { return null; } }, set: (v: string | null) => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* private mode */ } } };
const inp = "h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-4 text-[15px] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-ring)]";
const M = "hospital_vvs.api.radiology.";

/** POST a file endpoint and return a blob URL (keeps the session token out of URLs and server logs). */
async function blobOf(method: string, args: Record<string, string | number>) {
  const body = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)]));
  const r = await fetch(`/api/method/${M}${method}`, { method: "POST", body, credentials: "include", headers: { "X-Frappe-CSRF-Token": (window as unknown as { csrf_token?: string }).csrf_token || "" } });
  if (!r.ok) throw new Error(r.status === 429 ? "Too many requests — try again in a few minutes." : "Could not load the file.");
  return URL.createObjectURL(await r.blob());
}

export default function RadiologyReports() {
  useTitle("Download my report — Radiology", "View and download your X-ray, ultrasound and Doppler reports from Lyallpur Medical Complex with your booking ID or MR number and mobile.");
  const [session, setSession] = useState<string | null>(ss.get);
  const [data, setData] = useState<List | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async (s: string) => {
    try { setData(await getCall<List>(`${M}portal_list`, { session: s })); }
    catch (e) { setErr(humanizeError(e)); ss.set(null); setSession(null); }
  }, []);
  useEffect(() => { if (session) void load(session); }, [session, load]);
  const out = () => { ss.set(null); setSession(null); setData(null); };

  return (
    <div className="min-h-[70vh] bg-[var(--soft)] pb-24">
      <section className="relative overflow-hidden bg-[var(--hero)] pb-28 pt-12 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_300px_at_100%_0%,rgba(92,195,201,0.25),transparent_60%)]" />
        <Wrap className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/site/radiology" className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />Radiology & Imaging</Link>
            <h1 className="s2-display mt-4 text-[2.4rem] leading-tight sm:text-[3.2rem]">{data ? `Hello, ${data.patient.split(" ")[0]}` : "Download my report"}</h1>
            <p className="mt-2 max-w-xl text-white/70">{data ? "Your scans at Lyallpur Medical Complex — newest first." : "Secure access with your booking ID or MR number and the mobile number you gave us."}</p>
          </div>
          {data && <button onClick={out} className={`${btn.glass} px-5 py-2.5 text-sm`}><LogOut className="h-4 w-4" />Sign out</button>}
        </Wrap>
      </section>
      <Wrap className="relative -mt-20">
        {!session ? <SignIn onDone={(s) => { ss.set(s); setErr(""); setSession(s); }} notice={err} />
          : !data ? <div className={`${card} flex items-center justify-center gap-2 p-16 text-[var(--muted)] hover:translate-y-0`}><Loader2 className="h-5 w-5 animate-spin" />Loading your scans…</div>
          : <Studies data={data} session={session} reload={() => load(session)} />}
      </Wrap>
    </div>
  );
}

function SignIn({ onDone, notice }: { onDone: (s: string) => void; notice?: string }) {
  const [ident, setIdent] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<{ masked: string; test_code?: string } | null>(null);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice || "");
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const request = async () => {
    setBusy(true); setErr("");
    try { const r = await postCall<{ masked: string; test_code?: string }>(`${M}portal_request`, { ident, phone }); setSent(r); setTimeout(() => refs.current[0]?.focus(), 50); }
    catch (e) { const m = humanizeError(e); setErr(/429|too many/i.test(m) ? "Too many attempts. Please wait 15 minutes." : m); }
    finally { setBusy(false); }
  };
  const verify = async (c = code.join("")) => {
    setBusy(true); setErr("");
    try { const r = await postCall<{ session: string }>(`${M}portal_verify`, { ident, phone, code: c }); onDone(r.session); }
    catch (e) { setErr(humanizeError(e)); setCode(["", "", "", "", "", ""]); refs.current[0]?.focus(); }
    finally { setBusy(false); }
  };
  const digit = (i: number, v: string) => {
    const d = v.replace(/\D/g, "");
    if (d.length > 1) { const all = d.slice(0, 6).split(""); const next = [...code]; all.forEach((x, k) => { if (i + k < 6) next[i + k] = x; }); setCode(next); if (next.every(Boolean)) void verify(next.join("")); return; }
    const next = [...code]; next[i] = d; setCode(next);
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className={`${card} p-6 hover:translate-y-0 sm:p-10`}>
        {!sent ? <form onSubmit={(e) => { e.preventDefault(); void request(); }}>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><KeyRound className="h-7 w-7" /></span>
          <h2 className="s2-display mt-5 text-[1.9rem]">Sign in to your reports</h2>
          <p className="mt-1 text-[var(--muted)]">We send a 6-digit code to the mobile number on your booking.</p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-sm font-semibold">Booking ID or MR number</span><input className={inp} value={ident} onChange={(e) => setIdent(e.target.value.toUpperCase())} placeholder="IMG-7KQ2MD or MR-FSD-000123" autoFocus dir="ltr" /></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold">Mobile number</span><input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03XX XXXXXXX" autoComplete="tel" dir="ltr" /></label>
          </div>
          {err && <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="h-5 w-5 shrink-0" />{err}</p>}
          <button disabled={busy || ident.trim().length < 5 || phone.replace(/\D/g, "").length < 10} className={`${btn.primary} mt-6 w-full disabled:opacity-60 sm:w-auto`}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5" />}Send code</button>
        </form> : <div>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><ShieldCheck className="h-7 w-7" /></span>
          <h2 className="s2-display mt-5 text-[1.9rem]">Enter the code</h2>
          <p className="mt-1 text-[var(--muted)]">Sent to <b dir="ltr">{sent.masked}</b>. It expires in 5 minutes.</p>
          {sent.test_code && <p className="mt-3 inline-block rounded-xl bg-amber-500/15 px-3 py-1.5 text-sm text-amber-800 dark:text-amber-200">Test mode (no SMS provider): code <b className="tracking-widest">{sent.test_code}</b></p>}
          <div className="mt-6 flex gap-2 sm:gap-3" dir="ltr">
            {code.map((d, i) => <input key={i} ref={(el) => { refs.current[i] = el; }} value={d} inputMode="numeric" maxLength={6} aria-label={`Digit ${i + 1}`} onChange={(e) => digit(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus(); }}
              className="h-14 w-12 rounded-2xl border-2 border-[var(--line)] bg-[var(--bg)] text-center text-2xl font-semibold outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary-ring)] sm:w-14" />)}
          </div>
          {err && <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="h-5 w-5 shrink-0" />{err}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button disabled={busy || code.some((x) => !x)} onClick={() => void verify()} className={`${btn.primary} disabled:opacity-60`}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}Verify</button>
            <button onClick={() => { setSent(null); setCode(["", "", "", "", "", ""]); }} className="text-sm font-semibold text-[var(--primary)]">Use a different number</button>
          </div>
        </div>}
      </div>
      <aside className="space-y-4">
        {([[BellRing, "We tell you when it's ready", "An SMS / WhatsApp alert arrives as soon as the radiologist signs your report."], [ShieldCheck, "Private by design", "Only someone with your booking ID and your phone can open it. Messages never contain findings."],
          [Share2, "Share with your doctor", "Create a secure link that expires — revoke it any time by asking radiology."], [Printer, "Printed copy, films or CD", "Request one here and collect it from radiology reception."]] as const).map(([I, t, d], i) => (
          <Reveal key={t} delay={i * 60} className="flex gap-4 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--mint)] text-[var(--primary)]"><I className="h-5 w-5" /></span>
            <div><h3 className="font-bold">{t}</h3><p className="mt-0.5 text-sm text-[var(--muted)]">{d}</p></div></Reveal>))}
      </aside>
    </div>
  );
}

const STATE_TONE = { Ready: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", Pending: "bg-amber-500/12 text-amber-700 dark:text-amber-300", Cancelled: "bg-slate-500/10 text-[var(--muted)]" };

function Studies({ data, session, reload }: { data: List; session: string; reload: () => void }) {
  const [view, setView] = useState<Study | null>(null);
  const [share, setShare] = useState<Study | null>(null);
  const [copy, setCopy] = useState<Study | null>(null);
  const [gallery, setGallery] = useState<Study | null>(null);
  const [busy, setBusy] = useState("");
  const pdf = async (s: Study) => {
    setBusy(s.name);
    try { const u = await blobOf("portal_pdf", { session, name: s.name }); const a = document.createElement("a"); a.href = u; a.download = `${s.booking_ref}-report.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 30000); reload(); }
    catch (e) { alert((e as Error).message); } finally { setBusy(""); }
  };
  const ready = data.studies.filter((s) => s.ready).length;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div className={`${card} flex flex-wrap items-center gap-4 p-5 hover:translate-y-0`}>
          <div className="min-w-0 flex-1"><div className="text-sm text-[var(--muted)]">{data.mr ? <>MR <b className="text-[var(--ink)]" dir="ltr">{data.mr}</b> · </> : null}{data.studies.length} scan{data.studies.length === 1 ? "" : "s"}</div>
            <div className="text-lg font-bold">{ready} report{ready === 1 ? "" : "s"} ready</div></div>
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--mint)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)]"><ShieldCheck className="h-4 w-4" />Secure session · 30 min</span>
        </div>
        {data.studies.map((s, i) => (
          <Reveal key={s.name} delay={i * 50} className={`${card} p-5 hover:translate-y-0 sm:p-6`}>
            <div className="flex flex-wrap items-start gap-4">
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${s.ready ? "bg-[var(--primary)] text-white" : "bg-[var(--soft)] text-[var(--muted)]"}`}><FileText className="h-6 w-6" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-[1.1rem] font-bold">{s.procedure_name}</h3><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATE_TONE[s.state]}`}>{s.state}</span>
                  {(s.report_version ?? 0) > 1 && <span className="rounded-full bg-[var(--soft)] px-2 py-0.5 text-[11px] font-semibold">Updated v{s.report_version}</span>}</div>
                <div className="mt-0.5 text-sm text-[var(--muted)]">{dmy(s.scheduled_date)}{s.slot_time ? ` · ${hm12(s.slot_time)}` : ""} · {s.modality} · <span dir="ltr">{s.booking_ref}</span></div>
                {!s.ready && s.state === "Pending" && <div className="mt-2 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300"><Clock3 className="h-4 w-4" />{s.expected_at ? `Expected by ${new Date(s.expected_at.replace(" ", "T")).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : s.status === "Booked" ? "Scan not done yet" : "Being reported — we'll message you when it's ready"}</div>}
                {s.ready && s.verified_at && <div className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" />Signed {new Date(s.verified_at.replace(" ", "T")).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>}
                {!!s.copy_requested && <div className="mt-1 text-xs text-[var(--muted)]">Printed copy / CD requested — collect from radiology reception.</div>}
              </div>
            </div>
            {s.ready && <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
              <button onClick={() => setView(s)} className={`${btn.teal} px-4 py-2.5 text-sm`}><Eye className="h-4 w-4" />View</button>
              <button onClick={() => void pdf(s)} disabled={busy === s.name} className={`${btn.ghost} px-4 py-2.5 text-sm`}>{busy === s.name ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download PDF</button>
              {s.images > 0 && <button onClick={() => setGallery(s)} className={`${btn.ghost} px-4 py-2.5 text-sm`}><ImageIcon className="h-4 w-4" />Images ({s.images})</button>}
              <button onClick={() => setShare(s)} className={`${btn.ghost} px-4 py-2.5 text-sm`}><Share2 className="h-4 w-4" />Share with doctor</button>
              <button onClick={() => setCopy(s)} className={`${btn.ghost} px-4 py-2.5 text-sm`}><Disc3 className="h-4 w-4" />Printed copy / CD</button>
            </div>}
          </Reveal>))}
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className={`${card} p-6 hover:translate-y-0`}>
          <div className="mb-4 flex items-center gap-2"><History className="h-5 w-5 text-[var(--primary)]" /><h3 className="font-bold">Scan history</h3></div>
          <ol className="relative space-y-5 border-s-2 border-[var(--line)] ps-5">
            {data.studies.map((s) => <li key={s.name} className="relative"><span className={`absolute -start-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-[var(--surface)] ${s.ready ? "bg-[var(--primary)]" : "bg-amber-400"}`} />
              <div className="text-xs font-semibold text-[var(--muted)]">{dmy(s.scheduled_date)}</div><div className="text-sm font-bold leading-snug">{s.procedure_name}</div>
              {s.ready && <button onClick={() => setView(s)} className="text-xs font-semibold text-[var(--primary)]">Open for comparison →</button>}</li>)}
          </ol>
        </div>
      </aside>
      {view && <ReportModal s={view} session={session} onClose={() => { setView(null); reload(); }} onPdf={() => void pdf(view)} />}
      {share && <ShareModal s={share} session={session} onClose={() => setShare(null)} />}
      {copy && <CopyModal s={copy} session={session} onClose={() => { setCopy(null); reload(); }} />}
      {gallery && <Gallery s={gallery} session={session} onClose={() => setGallery(null)} />}
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", f); document.body.style.overflow = "hidden"; return () => { window.removeEventListener("keydown", f); document.body.style.overflow = ""; }; }, [onClose]);
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-[color-mix(in_srgb,var(--hero)_70%,transparent)] p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()} className={`s2-pop flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[26px] bg-[var(--surface)] text-[var(--ink)] shadow-2xl sm:rounded-[26px] ${wide ? "max-w-4xl" : "max-w-lg"}`}>
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-4"><h2 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-[var(--soft)]"><X className="h-5 w-5" /></button></div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function ReportModal({ s, session, onClose, onPdf }: { s: Study; session: string; onClose: () => void; onPdf: () => void }) {
  const [html, setHtml] = useState("");
  const [err, setErr] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => { getCall<{ html: string }>(`${M}portal_report`, { session, name: s.name }).then((r) => setHtml(r.html)).catch((e) => setErr(humanizeError(e))); }, [s, session]);
  return (
    <Modal title={s.procedure_name} onClose={onClose} wide>
      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] bg-[var(--soft)] px-5 py-3">
        <button onClick={onPdf} className={`${btn.teal} px-4 py-2 text-sm`}><Download className="h-4 w-4" />PDF</button>
        <button onClick={() => frame.current?.contentWindow?.print()} disabled={!html} className={`${btn.ghost} px-4 py-2 text-sm`}><Printer className="h-4 w-4" />Print</button>
      </div>
      {err ? <p className="p-8 text-center text-rose-600">{err}</p> : !html ? <div className="flex items-center justify-center gap-2 p-16 text-[var(--muted)]"><Loader2 className="h-5 w-5 animate-spin" />Loading…</div>
        : <iframe ref={frame} title="Report" srcDoc={html} sandbox="allow-same-origin allow-modals" className="h-[72vh] w-full bg-white" />}
    </Modal>
  );
}

function ShareModal({ s, session, onClose }: { s: Study; session: string; onClose: () => void }) {
  const [hours, setHours] = useState(72);
  const [who, setWho] = useState("");
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setBusy(true); setErr("");
    try { setLink(await postCall(`${M}portal_share`, { session, name: s.name, hours, recipient: who })); } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Share with your doctor" onClose={onClose}>
      <div className="p-5 sm:p-6">
        {!link ? <>
          <p className="text-sm text-[var(--muted)]">Creates a private link to <b className="text-[var(--ink)]">{s.procedure_name}</b> that stops working after the time you choose. Anyone with the link can view the report, so send it only to your doctor.</p>
          <div className="mt-5 grid grid-cols-4 gap-2">{[[24, "1 day"], [72, "3 days"], [168, "7 days"], [336, "14 days"]].map(([h, l]) => <button key={h} onClick={() => setHours(Number(h))} aria-pressed={hours === h}
            className={`rounded-xl border-2 py-2.5 text-sm font-semibold ${hours === h ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)]"}`}>{l}</button>)}</div>
          <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">Doctor's name (optional, for your records)</span><input className={inp} value={who} onChange={(e) => setWho(e.target.value)} placeholder="Dr. …" /></label>
          {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
          <button onClick={() => void make()} disabled={busy} className={`${btn.primary} mt-5 w-full`}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />}Create secure link</button>
        </> : <>
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><Check className="h-5 w-5" />Link ready — expires {new Date(link.expires_at.replace(" ", "T")).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>
          <div className="mt-4 flex gap-2"><input readOnly value={link.url} className={`${inp} font-mono text-xs`} onFocus={(e) => e.target.select()} />
            <button onClick={() => { void navigator.clipboard?.writeText(link.url); setCopied(true); }} className={`${btn.ghost} shrink-0 px-4`} aria-label="Copy link">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div>
          <a href={`https://wa.me/?text=${encodeURIComponent(`My ${s.procedure_name} report from Lyallpur Medical Complex: ${link.url}`)}`} target="_blank" rel="noopener noreferrer" className={`${btn.teal} mt-4 w-full`}><MessageCircle className="h-5 w-5" />Send on WhatsApp</a>
        </>}
      </div>
    </Modal>
  );
}

function CopyModal({ s, session, onClose }: { s: Study; session: string; onClose: () => void }) {
  const [kind, setKind] = useState("Printed copy");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); try { await postCall(`${M}portal_copy`, { session, name: s.name, kind, note }); setDone(true); } catch (e) { alert(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <Modal title="Printed copy / CD" onClose={onClose}>
      <div className="p-5 sm:p-6">
        {done ? <div className="text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-7 w-7" /></span><p className="mt-4 font-semibold">Request sent</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Collect it from radiology reception (2nd floor) with your booking ID. We'll message you if anything is needed.</p><button onClick={onClose} className={`${btn.teal} mt-5`}>Done</button></div> : <>
          <div className="space-y-2">{["Printed copy", "Printed copy + films", "CD with images"].map((k) => <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
            className={`flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-start font-semibold ${kind === k ? "border-[var(--primary)] bg-[var(--mint)]" : "border-[var(--line)]"}`}>
            <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${kind === k ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)]"}`}>{kind === k && <Check className="h-3 w-3" />}</span>{k}</button>)}</div>
          <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">Note (optional)</span><textarea rows={2} className={`${inp} h-auto py-3`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. collecting on Saturday" /></label>
          <button onClick={() => void send()} disabled={busy} className={`${btn.primary} mt-5 w-full`}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}Request</button>
        </>}
      </div>
    </Modal>
  );
}

function Gallery({ s, session, onClose }: { s: Study; session: string; onClose: () => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [inv, setInv] = useState(false);
  useEffect(() => {
    let on = true; const made: string[] = [];
    (async () => { for (let k = 0; k < s.images; k++) { try { const u = await blobOf("portal_image", { session, name: s.name, index: k }); made.push(u); if (on) setUrls([...made]); } catch { /* skip */ } } })();
    return () => { on = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [s, session]);
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, urls.length - 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0)); }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [urls.length]);
  return (
    <Modal title={`Key images · ${s.procedure_name}`} onClose={onClose} wide>
      <div className="bg-black">
        <div className="relative flex h-[60vh] items-center justify-center overflow-hidden">
          {urls[i] ? <img src={urls[i]} alt={`Key image ${i + 1}`} style={{ transform: `scale(${zoom})`, filter: inv ? "invert(1)" : undefined }} className="max-h-full max-w-full object-contain transition-transform" />
            : <Loader2 className="h-8 w-8 animate-spin text-white/60" />}
          {i > 0 && <button onClick={() => setI(i - 1)} aria-label="Previous" className="absolute start-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"><ChevronLeft className="h-6 w-6 rtl:rotate-180" /></button>}
          {i < urls.length - 1 && <button onClick={() => setI(i + 1)} aria-label="Next" className="absolute end-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"><ChevronRight className="h-6 w-6 rtl:rotate-180" /></button>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3 text-white">
          <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="rounded-full bg-white/10 px-3 py-1.5 text-sm">−</button><span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} className="rounded-full bg-white/10 px-3 py-1.5 text-sm">+</button>
          <button onClick={() => setInv(!inv)} aria-pressed={inv} className="rounded-full bg-white/10 px-3 py-1.5 text-sm">Invert</button>
          <span className="ms-auto text-sm text-white/60">{urls.length ? `${i + 1} / ${s.images}` : ""}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 pb-4">{urls.map((u, k) => <button key={k} onClick={() => setI(k)} className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${k === i ? "border-[var(--hero-accent)]" : "border-transparent opacity-60"}`}><img src={u} alt="" className="h-full w-full object-cover" /></button>)}</div>
      </div>
      <p className="px-5 py-3 text-xs text-[var(--muted)]">Key images chosen by the radiologist. For the full study (all images) request a CD from radiology.</p>
    </Modal>
  );
}

