import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowRight, BedDouble, CalendarCheck, Eye, EyeOff, KeyRound, Languages, Lock, Mail, Moon, ShieldCheck, Stethoscope, Sun, Volume2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { humanizeError } from "@/lib/api";
import { getCall } from "@/services/frappe";
import { LANGUAGES } from "@/i18n";
import { cn } from "@/utils/cn";

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

  const name = clinic ? (i18n.language === "ur" && clinic.name_ur ? clinic.name_ur : clinic.name) : "VVS Hospital";
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="relative grid min-h-full overflow-hidden bg-background lg:grid-cols-[1.15fr_1fr]">
      {/* ---------------- brand side ---------------- */}
      <aside className="relative hidden overflow-hidden bg-[#06232a] text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_0%_0%,rgba(20,184,166,0.55),transparent_60%),radial-gradient(900px_600px_at_100%_100%,rgba(16,185,129,0.45),transparent_55%),radial-gradient(700px_500px_at_80%_10%,rgba(56,189,248,0.25),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div className="absolute -start-24 top-1/3 h-72 w-72 animate-pulse rounded-full bg-teal-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3 p-10">
          <Logo />
          <div><div className="text-lg font-extrabold tracking-tight">{name}</div><div className="text-xs text-teal-100/70">VVSDesk · Hospital management</div></div>
        </div>

        <div className="relative flex flex-1 flex-col justify-center px-10 xl:px-16">
          <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-teal-50 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <h1 className="max-w-xl text-4xl font-extrabold leading-[1.1] tracking-tight xl:text-5xl">
            Care that flows<br /><span className="bg-gradient-to-r from-teal-200 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">from front desk to bedside.</span>
          </h1>
          <p className="mt-3 font-[Noto_Nastaliq_Urdu] text-xl leading-loose text-teal-100/90" dir="rtl">استقبالیہ سے بستر تک — ایک پرسکون نظام</p>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-teal-50/75">Appointments on web and WhatsApp, prescriptions with allergy and interaction checks, live wards and billing — in English and اردو.</p>

          {/* live preview cards */}
          <div className="relative mt-10 h-56 max-w-xl">
            <Glass className="absolute start-0 top-0 w-64 rotate-[-3deg]">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-teal-100/80"><Volume2 className="h-3.5 w-3.5" />Now serving · OPD-1</div>
              <div className="mt-1 flex items-end gap-3"><span className="text-5xl font-black tabular-nums">14</span><span className="mb-1.5 text-xs text-teal-50/70">Dr. Ayesha · next 15, 16</span></div>
            </Glass>
            <Glass className="absolute end-0 top-6 w-56 rotate-[3deg]">
              <div className="flex items-center gap-3">
                <Ring value={75} />
                <div><div className="flex items-center gap-1 text-xs font-semibold text-teal-100/80"><BedDouble className="h-3.5 w-3.5" />Bed occupancy</div>
                  <div className="mt-1 flex gap-1">{["bg-emerald-400", "bg-rose-400", "bg-rose-400", "bg-sky-400", "bg-emerald-400", "bg-amber-300"].map((c, i) => <span key={i} className={cn("h-3 w-3 rounded-sm", c)} />)}</div></div>
              </div>
            </Glass>
            <Glass className="absolute bottom-0 start-16 w-72">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-200"><ShieldCheck className="h-5 w-5" /></span>
                <div className="min-w-0"><div className="text-sm font-semibold">Safety check passed</div><div className="truncate text-xs text-teal-50/70">Allergy · interactions · duplicate therapy · dose</div></div>
              </div>
            </Glass>
          </div>
        </div>

        <div className="relative grid grid-cols-3 gap-3 p-10 pt-0">
          {[[CalendarCheck, "Web + WhatsApp booking"], [Stethoscope, "Signed prescriptions"], [ShieldCheck, "Audit on every record"]].map(([I, l]) => {
            const Icon = I as typeof Lock;
            return <div key={l as string} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-teal-50/85 backdrop-blur"><Icon className="h-4 w-4 shrink-0 text-emerald-300" />{l as string}</div>;
          })}
        </div>
      </aside>

      {/* ---------------- form side ---------------- */}
      <main className="relative flex min-h-full flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_100%_0%,rgba(20,184,166,0.12),transparent_60%),radial-gradient(500px_400px_at_0%_100%,rgba(16,185,129,0.10),transparent_60%)]" />
        <header className="relative flex items-center justify-between p-5">
          <div className="flex items-center gap-2 lg:invisible"><Logo small /><span className="font-bold">{name}</span></div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 text-sm backdrop-blur">
              <Languages className="h-4 w-4 text-muted-foreground" />
              <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} className="bg-transparent outline-none">
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
            <button onClick={toggleTheme} aria-label="Theme" className="rounded-full border border-border bg-card/70 p-2 backdrop-blur hover:bg-muted">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center px-5 pb-10">
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}
            className="w-full max-w-[420px] rounded-[28px] border border-border/70 bg-card/80 p-7 shadow-[0_30px_80px_-30px_rgba(13,148,136,0.45)] backdrop-blur-xl sm:p-9">
            {!verify ? (
              <>
                <div className="mb-7">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-600/30"><Lock className="h-5 w-5" /></div>
                  <h2 className="text-2xl font-extrabold tracking-tight">{t(greet)} 👋</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to {name}</p>
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
                {caps && <div className="mt-1.5 text-xs font-medium text-amber-600">Caps Lock is on</div>}
                <div className="mt-4 flex items-center justify-between text-sm">
                  <label className="flex cursor-pointer items-center gap-2 text-muted-foreground"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded accent-teal-600" />Remember me</label>
                  <a href="/login#forgot" className="font-semibold text-primary hover:underline">Forgot password?</a>
                </div>
              </>
            ) : (
              <>
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-indigo-600/30"><ShieldCheck className="h-6 w-6" /></div>
                  <h2 className="text-2xl font-extrabold tracking-tight">Two-step verification</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{verify.prompt || "Enter the 6-digit code from your authenticator app."}</p>
                </div>
                {error && <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
                <div className="flex justify-between gap-2" dir="ltr">
                  {otp.map((d, i) => (
                    <input key={i} ref={(el) => { otpRefs.current[i] = el; }} value={d} inputMode="numeric" maxLength={6} aria-label={`Digit ${i + 1}`}
                      onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) otpRefs.current[i - 1]?.focus(); }}
                      className="h-14 w-12 rounded-xl border border-input bg-[hsl(var(--input-bg))] text-center text-2xl font-bold tabular-nums outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/15" />))}
                </div>
                <button type="button" onClick={() => { setVerify(null); setOtp(["", "", "", "", "", ""]); setError(""); }} className="mt-4 block w-full text-center text-sm text-muted-foreground hover:text-foreground">← Use a different account</button>
              </>
            )}
            <button type="submit" disabled={busy || (!!verify && otp.join("").length < 6)}
              className="group relative mt-6 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-500 font-semibold text-white shadow-lg shadow-teal-700/30 transition-all hover:shadow-xl hover:shadow-teal-700/40 disabled:opacity-60">
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <>{verify ? t("Verify") : t("Sign in")}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" /></>}
            </button>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />For patients<span className="h-px flex-1 bg-border" /></div>
            <a href="/hms/book-appointment" className="flex items-center justify-between rounded-xl border border-border bg-gradient-to-r from-teal-50/80 to-emerald-50/60 p-3 text-sm transition-colors hover:border-primary/40 dark:from-teal-500/10 dark:to-emerald-500/5">
              <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm dark:bg-white/10 dark:text-teal-200"><CalendarCheck className="h-4 w-4" /></span>
                <span><span className="block font-semibold">{t("Book appointment")}</span><span className="block text-xs text-muted-foreground">Choose a doctor and time online</span></span></span>
              <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
            </a>
          </form>
        </div>
        <footer className="relative pb-5 text-center text-xs text-muted-foreground">
          {clinic?.phone && <>Help desk {clinic.phone} · </>}Secured session · access is logged
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

function Logo({ small }: { small?: boolean }) {
  return (
    <span className={cn("relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300 via-teal-500 to-emerald-600 font-black text-white shadow-lg shadow-teal-900/40", small ? "h-9 w-9 text-base" : "h-12 w-12 text-xl")}>
      <span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/30" />V
    </span>
  );
}

function Glass({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl transition-transform duration-500 hover:rotate-0 hover:scale-[1.02]", className)}>{children}</div>;
}

function Ring({ value }: { value: number }) {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" className="-rotate-90">
      <circle cx="29" cy="29" r={r} stroke="rgba(255,255,255,0.15)" strokeWidth="6" fill="none" />
      <circle cx="29" cy="29" r={r} stroke="url(#g)" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stopColor="#5eead4" /><stop offset="1" stopColor="#34d399" /></linearGradient></defs>
      <text x="29" y="33" textAnchor="middle" className="rotate-90" style={{ transformOrigin: "29px 29px" }} fill="white" fontSize="13" fontWeight="800">{value}%</text>
    </svg>
  );
}

function InputBox({ icon: I, label, children, end, className }: { icon: typeof Lock; label: string; children: React.ReactNode; end?: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2.5 rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3.5 transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
        <I className="h-4 w-4 shrink-0 text-muted-foreground" />{children}{end}
      </span>
    </label>
  );
}
