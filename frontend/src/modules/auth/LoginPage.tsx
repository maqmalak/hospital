import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowRight, CalendarCheck, Eye, EyeOff, Globe, KeyRound, Languages, Lock, Mail, Moon, ShieldCheck, Stethoscope, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { humanizeError } from "@/lib/api";
import { getCall } from "@/services/frappe";
import { LANGUAGES } from "@/i18n";
import { cn } from "@/utils/cn";
import { HOSPITAL_TAGLINE, HospitalLogo, Wordmark } from "@/components/brand";
import DeptOrbit from "@/modules/landing/v2/DeptOrbit";
import { ORBIT_CSS } from "@/modules/landing/v2/orbitCss";

/* Same look as website v2: Fraunces display + Plus Jakarta Sans, deep teal, mint, coral CTA. */
const V2_FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
const CSS = `${ORBIT_CSS}
  .lg2{font-family:'Plus Jakarta Sans',Inter,system-ui,sans-serif}
  .lg2 .lg2-display{font-family:Fraunces,Georgia,serif;font-weight:500;letter-spacing:-0.015em}`;

const REMEMBER = "hv.login.user";

export default function LoginPage() {
  const { boot, login } = useAuth();
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [usr, setUsr] = useState(() => { try { return localStorage.getItem(REMEMBER) || ""; } catch { return ""; } });
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(() => { try { return !!localStorage.getItem(REMEMBER); } catch { return false; } });
  const [caps, setCaps] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [verify, setVerify] = useState<{ tmp_id: string; prompt?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clinic, setClinic] = useState<{ name: string; name_ur?: string; phone?: string } | null>(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const now = useClock();
  useEffect(() => {
    if (document.querySelector(`link[href="${V2_FONTS}"]`)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = V2_FONTS; document.head.appendChild(l);
  }, []);

  useEffect(() => { void getCall<{ clinic: { name: string; name_ur?: string; phone?: string } }>("hospital_vvs.api.appointments.public_options").then((o) => setClinic(o.clinic)).catch(() => undefined); }, []);
  if (boot) return <Navigate to={loc.state?.from || "/pw-home"} replace />;

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("hv.theme", next ? "dark" : "light"); } catch { /* ignore */ }
    setDark(next);
  };

  const submit = async () => {
    setError("");
    if (!verify && (!usr.trim() || !pwd)) { setError("Enter your email or username and password."); return; }
    setBusy(true);
    try {
      const r = await login(usr.trim(), pwd, verify ? { tmp_id: verify.tmp_id, otp: otp.join("") } : undefined);
      if (r.verification) { setVerify(r.verification); setTimeout(() => otpRefs.current[0]?.focus(), 50); return; }
      try { if (remember) localStorage.setItem(REMEMBER, usr.trim()); else localStorage.removeItem(REMEMBER); } catch { /* ignore */ }
      nav(loc.state?.from || "/pw-home", { replace: true });
    } catch (e) {
      const msg = humanizeError(e);
      setError(/incorrect|invalid|not found|password/i.test(msg) ? "That email/username and password don't match. Please try again." : msg);
      if (verify) setOtp(["", "", "", "", "", ""]);
    } finally { setBusy(false); }
  };

  const setDigit = (i: number, v: string) => {
    const digits = v.replace(/\D/g, "");
    if (digits.length > 1) { const all = digits.slice(0, 6).split(""); setOtp([...all, ...Array(6 - all.length).fill("")]); otpRefs.current[Math.min(all.length, 5)]?.focus(); return; }
    setOtp((o) => o.map((x, j) => (j === i ? digits : x)));
    if (digits && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const name = clinic ? (i18n.language === "ur" && clinic.name_ur ? clinic.name_ur : clinic.name) : "Lyallpur Medical Complex";
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="lg2 relative grid min-h-full overflow-hidden bg-[#F7FAFA] text-[#14262E] dark:bg-[#071C22] dark:text-[#E7F1F2] lg:grid-cols-[1.1fr_1fr]">
      <style>{CSS}</style>
      {/* ---------------- brand side: the v2 dark teal panel with the glowing sun and departments as planets ---------------- */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-bl from-[#0E5E6F] via-[#08303A] to-[#062229] text-white lg:flex lg:flex-col">
        <span aria-hidden className="absolute -end-24 -top-24 h-80 w-80 rounded-full bg-[#FF6B66]/10 blur-3xl" />
        <span aria-hidden className="absolute -bottom-32 -start-24 h-96 w-96 rounded-full bg-[#14B8A6]/10 blur-3xl" />
        <div className="relative flex items-center gap-3 px-10 pt-9">
          <HospitalLogo onDark className="h-12 w-12" />
          <div><div className="lg2-display text-xl">{name}</div><div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9FE3DA]">{t(HOSPITAL_TAGLINE)}</div></div>
        </div>
        <div className="relative flex flex-1 flex-col items-center justify-center px-10 xl:px-14">
          <div className="w-full max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9FE3DA]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9FE3DA]" />{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <h1 className="lg2-display mt-4 text-[2.3rem] leading-[1.08] xl:text-[2.8rem] [@media(max-height:820px)]:text-[2.1rem]">Care that flows<br /><span className="italic text-[#FF8A85]">from front desk to bedside.</span></h1>
            <p className="mt-2 font-urdu text-lg leading-loose text-white/75" dir="rtl">استقبالیہ سے بستر تک — ایک پرسکون نظام</p>
          </div>
          {/* the orbit is 480 × 460; the box reserves its scaled size so short screens don't scroll */}
          {/* sizes by screen: narrow lg panel · short xl · normal xl · tall xl (ranges don't overlap) */}
          <div className="grid w-full place-items-center [@media(max-width:1279px)]:h-[330px] [@media(min-width:1280px)_and_(max-height:820px)]:h-[370px] [@media(min-width:1280px)_and_(min-height:821px)_and_(max-height:979px)]:h-[520px] [@media(min-width:1280px)_and_(min-height:980px)]:h-[640px]">
            <div className="[@media(max-width:1279px)]:scale-[0.7] [@media(min-width:1280px)_and_(max-height:820px)]:scale-[0.8] [@media(min-width:1280px)_and_(min-height:821px)_and_(max-height:979px)]:scale-[1.15] [@media(min-width:1280px)_and_(min-height:980px)]:scale-[1.38]"><DeptOrbit /></div>
          </div>
        </div>
        <div className="relative grid grid-cols-3 gap-3 px-10 pb-9 [@media(max-height:820px)]:hidden">
          {[[CalendarCheck, "Web + WhatsApp booking"], [Stethoscope, "Signed prescriptions"], [ShieldCheck, "Audit on every record"]].map(([I, l]) => {
            const Icon = I as typeof Lock;
            return <div key={l as string} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-2 text-xs font-medium text-white/85 backdrop-blur"><Icon className="h-4 w-4 shrink-0 text-[#FF8A85]" />{l as string}</div>;
          })}
        </div>
      </aside>

      {/* ---------------- form side ---------------- */}
      <main className="relative flex min-h-full flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_100%_0%,rgba(14,94,111,0.10),transparent_60%),radial-gradient(500px_400px_at_0%_100%,rgba(229,72,63,0.06),transparent_60%)]" />
        <header className="relative flex items-center justify-between gap-2 p-5">
          <div className="flex min-w-0 items-center gap-2 lg:invisible"><HospitalLogo className="h-9 w-9" /><span className="lg2-display truncate text-lg">{name}</span></div>
          <div className="flex items-center gap-2">
            <a href="/hms/site" title={t("Visit website")} className="flex items-center gap-1.5 rounded-full border border-[#E1EAEB] bg-white px-3 py-1.5 text-sm font-medium text-[#0E5E6F] transition hover:border-[#0E5E6F] dark:border-white/10 dark:bg-white/5 dark:text-[#5CC3C9]">
              <Globe className="h-4 w-4" /><span className="hidden sm:inline">{t("Visit website")}</span></a>
            <label className="flex items-center gap-1.5 rounded-full border border-[#E1EAEB] bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/5">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} className="bg-transparent outline-none">
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
            <button onClick={toggleTheme} aria-label="Theme" className="rounded-full border border-[#E1EAEB] bg-white p-2 transition hover:border-[#0E5E6F] dark:border-white/10 dark:bg-white/5">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center px-5 pb-10">
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}
            className="w-full max-w-[420px] rounded-[24px] border border-[#E1EAEB] bg-white p-7 shadow-[0_24px_50px_-34px_rgba(8,48,58,0.5)] dark:border-[#1D3C46] dark:bg-[#0D2730] sm:p-9">
            {!verify ? (
              <>
                <div className="mb-7">
                  <HospitalLogo alt={name} className="mb-5 h-16 w-16" />
                  <h2 className="lg2-display text-[2rem] leading-tight">{t(greet)}</h2>
                  <p className="mt-1 text-sm text-[#5B7079] dark:text-[#9AB2B8]">Staff sign in · {name}</p>
                  <div className="mt-4 h-0.5 w-10 rounded-full bg-[#E5483F]" />
                </div>
                {error && <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
                <InputBox icon={Mail} label={t("Email or username")}>
                  <input value={usr} onChange={(e) => setUsr(e.target.value)} autoFocus={!usr} autoComplete="username" placeholder="name@hospital.pk" className="h-12 w-full appearance-none border-0 bg-transparent text-[15px] shadow-none outline-none ring-0 placeholder:text-muted-foreground/60 focus:ring-0 dark:!border-0 dark:!bg-transparent dark:!shadow-none" />
                </InputBox>
                <InputBox icon={KeyRound} label={t("Password")} className="mt-4"
                  end={<button type="button" onClick={() => setShow((s) => !s)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}>
                  <input value={pwd} onChange={(e) => setPwd(e.target.value)} type={show ? "text" : "password"} autoFocus={!!usr} autoComplete="current-password" placeholder="••••••••"
                    onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} className="h-12 w-full appearance-none border-0 bg-transparent text-[15px] shadow-none outline-none ring-0 placeholder:text-muted-foreground/60 focus:ring-0 dark:!border-0 dark:!bg-transparent dark:!shadow-none" />
                </InputBox>
                {caps && <div className="mt-1.5 text-xs font-medium text-amber-700">Caps Lock is on</div>}
                <div className="mt-4 flex items-center justify-between text-sm">
                  <label className="flex cursor-pointer items-center gap-2 text-muted-foreground"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded accent-[#0E5E6F]" />Remember me</label>
                  <a href="/login#forgot" className="font-semibold text-[#0E5E6F] hover:underline dark:text-[#5CC3C9]">Forgot password?</a>
                </div>
              </>
            ) : (
              <>
                <div className="mb-6 text-center">
                  <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E5483F] text-white shadow-[0_10px_22px_-10px_#E5483F]"><ShieldCheck className="h-6 w-6" /></span>
                  <h2 className="lg2-display text-[2rem] leading-tight">Two-step verification</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{verify.prompt || "Enter the 6-digit code from your authenticator app."}</p>
                </div>
                {error && <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
                <div className="flex justify-between gap-2" dir="ltr">
                  {otp.map((d, i) => (
                    <input key={i} ref={(el) => { otpRefs.current[i] = el; }} value={d} inputMode="numeric" maxLength={6} aria-label={`Digit ${i + 1}`}
                      onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) otpRefs.current[i - 1]?.focus(); }}
                      className="h-14 w-12 rounded-xl border border-border bg-background text-center text-2xl font-bold tabular-nums outline-none transition-all focus:border-[#0E5E6F] focus:ring-4 focus:ring-[#0E5E6F]/20 dark:border-white/10 dark:bg-white/5" />))}
                </div>
                <button type="button" onClick={() => { setVerify(null); setOtp(["", "", "", "", "", ""]); setError(""); }} className="mt-4 block w-full text-center text-sm text-muted-foreground hover:text-foreground">← Use a different account</button>
              </>
            )}
            <button type="submit" disabled={busy || (!!verify && otp.join("").length < 6)} className="group relative mt-6 inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-[#E5483F] text-[15px] font-semibold text-white shadow-[0_14px_30px_-14px_#E5483F] transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E5483F]/30 disabled:translate-y-0 disabled:opacity-60">
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <>{verify ? t("Verify") : t("Sign in")}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" /></>}
            </button>
            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground"><span className="h-px flex-1 bg-border dark:bg-white/10" />For patients<span className="h-px flex-1 bg-border dark:bg-white/10" /></div>
            <a href="/hms/book-appointment" className="flex items-center justify-between rounded-2xl border border-[#E1EAEB] bg-[#F7FAFA] p-3 text-sm transition-colors hover:border-[#0E5E6F] dark:border-white/10 dark:bg-white/5">
              <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E5483F] text-white"><CalendarCheck className="h-4 w-4" /></span>
                <span><span className="block font-semibold">{t("Book appointment")}</span><span className="block text-xs text-muted-foreground">Choose a doctor and time online</span></span></span>
              <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
            </a>
          </form>
        </div>
        <footer className="relative pb-5 text-center text-xs text-muted-foreground">
          {clinic?.phone && <>Help desk {clinic.phone} · </>}Secured session · access is logged
          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px]">Powered by <Wordmark light={false} className="text-[10px]" /></div>
        </footer>
      </main>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id); }, []);
  return now;
}

function InputBox({ icon: I, label, children, end, className }: { icon: typeof Lock; label: string; children: React.ReactNode; end?: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2.5 rounded-2xl border border-[#E1EAEB] bg-[#F7FAFA] px-3.5 transition-all focus-within:border-[#0E5E6F] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#0E5E6F]/15 dark:border-[#1D3C46] dark:bg-white/5">
        <I className="h-4 w-4 shrink-0 text-[#0E5E6F] dark:text-[#5CC3C9]" />{children}{end}
      </span>
    </label>
  );
}
