import { useEffect } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Globe, Languages, ShieldCheck } from "lucide-react";
import { HospitalLogo, LmcMark } from "@/components/brand";
import { LANGUAGES } from "@/i18n";
import { PALETTES, usePalette } from "@/lib/palette";
import { cn } from "@/utils/cn";
import type { useLogin } from "./LoginPage";

/* Lime login (D-90), after the aaghaz.ai sign-in: black page, green glow from the bottom-left, one centred dark card,
   pill fields, a lime pill button. Our own brand, copy and font (Outfit) — only the look is borrowed. Always dark. */
const FONT = "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap";
const LIME = "#C4F01A";

export default function LimeLogin({ L }: { L: ReturnType<typeof useLogin> }) {
  const { t, i18n, usr, setUsr, pwd, setPwd, show, setShow, remember, setRemember, caps, setCaps, otp, setOtp, verify, setVerify,
    busy, error, setError, clinic, otpRefs, submit, setDigit, name } = L;
  const [palette, setPalette] = usePalette();
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT}"]`)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = FONT; document.head.appendChild(l);
  }, []);

  const field = "h-11 w-full rounded-full !border !border-[#262626] !bg-[#0B0B0B] !shadow-none px-4 text-[14px] text-white outline-none transition placeholder:text-[#6B6B6B] hover:!border-[#3A3A3A] focus:!border-[#C4F01A]/70 focus:ring-4 focus:ring-[#C4F01A]/15 [color-scheme:dark]";
  const chip = "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] text-white/80 backdrop-blur transition hover:border-white/25 hover:text-white";

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-black text-white" style={{ fontFamily: "Outfit, Inter, system-ui, sans-serif" }}>
      {/* the green glow rising from the bottom-left corner */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_760px_at_0%_100%,rgba(12,150,12,0.75),rgba(6,70,6,0.35)_38%,transparent_68%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_420px_at_100%_0%,rgba(196,240,26,0.06),transparent_60%)]" />

      <header className="relative flex flex-wrap items-center justify-end gap-2 p-5">
        <a href="/hms/site" className={chip}><Globe className="h-4 w-4" /><span className="hidden sm:inline">{t("Visit website")}</span></a>
        <label className={chip}>
          <Languages className="h-4 w-4" />
          <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} className="bg-transparent text-white outline-none [&>option]:bg-[#111]">
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1" role="radiogroup" aria-label={t("Colour theme")}>
          {PALETTES.map((p) => (
            <button key={p.id} role="radio" aria-checked={palette === p.id} onClick={() => setPalette(p.id)} title={t(p.label)}
              className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition", palette === p.id ? "bg-white/10 text-white" : "text-white/60 hover:text-white")}>
              <span className="h-3 w-3 rounded-full ring-1 ring-white/25" style={{ background: p.swatch }} />{t(p.label)}
            </button>
          ))}
        </div>
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center px-4 pb-14">
        <div className="mb-8 flex items-center gap-3">
          <HospitalLogo onDark className="h-11 w-11" />
          <div className="leading-tight">
            <div className="text-[22px] font-semibold tracking-tight">{name}</div>
            <LmcMark color="#E5E5E5" accent={LIME} size={11} className="mt-1" />
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void submit(); }}
          className="w-full max-w-[382px] rounded-2xl border border-[#262626] bg-[#0A0A0A]/70 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-sm">
          {!verify ? (
            <>
              <h1 className="text-2xl font-semibold text-[#C2C2C2]">{t("Staff sign in")}</h1>
              <p className="mt-1 text-sm text-[#8A8A8A]">{t("Enter your email or username to sign in to your account")}</p>
              {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
              <label className="mt-6 block">
                <span className="mb-2 block text-sm font-medium">{t("Email")}</span>
                <input value={usr} onChange={(e) => setUsr(e.target.value)} autoFocus={!usr} autoComplete="username" placeholder="name@lyallpurhospital.pk" className={field} />
              </label>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">{t("Password")}</span>
                  <a href="/login#forgot" className="text-white/85 transition hover:text-[#C4F01A]">{t("Forgot your password?")}</a>
                </div>
                <div className="relative">
                  <input value={pwd} onChange={(e) => setPwd(e.target.value)} type={show ? "text" : "password"} autoFocus={!!usr} autoComplete="current-password" aria-label={t("Password")}
                    onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)} className={cn(field, "pe-12")} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
                    className="absolute end-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#C4F01A] text-black transition hover:brightness-110">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {caps && <div className="mt-1.5 text-xs font-medium text-amber-300">Caps Lock is on</div>}
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded accent-[#C4F01A]" />{t("Remember me")}
              </label>
            </>
          ) : (
            <>
              <div className="text-center">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#C4F01A] text-black"><ShieldCheck className="h-6 w-6" /></span>
                <h1 className="text-2xl font-semibold text-[#C2C2C2]">{t("Two-step verification")}</h1>
                <p className="mt-1 text-sm text-[#8A8A8A]">{verify.prompt || t("Enter the 6-digit code from your authenticator app.")}</p>
              </div>
              {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
              <div className="mt-6 flex justify-between gap-2" dir="ltr">
                {otp.map((d, i) => (
                  <input key={i} ref={(el) => { otpRefs.current[i] = el; }} value={d} inputMode="numeric" maxLength={6} aria-label={`Digit ${i + 1}`}
                    onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) otpRefs.current[i - 1]?.focus(); }}
                    className="h-12 w-11 rounded-xl !border !border-[#262626] !bg-[#0B0B0B] !shadow-none text-center text-xl font-semibold tabular-nums text-white outline-none focus:border-[#C4F01A]/70 focus:ring-4 focus:ring-[#C4F01A]/15" />))}
              </div>
              <button type="button" onClick={() => { setVerify(null); setOtp(["", "", "", "", "", ""]); setError(""); }} className="mt-4 block w-full text-center text-sm text-white/60 hover:text-white">← {t("Use a different account")}</button>
            </>
          )}
          <button type="submit" disabled={busy || (!!verify && otp.join("").length < 6)}
            className="group mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(90deg,#4D7C0F,#65A30D_48%,#84CC16)] text-[15px] font-bold text-white shadow-[0_10px_26px_-10px_rgba(132,204,22,0.65)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C4F01A]/30 disabled:opacity-60">
            {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <>{verify ? t("Verify") : t("Sign in")}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" /></>}
          </button>
          {!verify && (
            <p className="mt-5 text-center text-sm text-white/80">
              {t("Patient?")} <a href="/hms/book-appointment" className="underline underline-offset-4 transition hover:text-[#C4F01A]">{t("Book an appointment")}</a>
            </p>
          )}
        </form>
      </main>

      <footer className="relative pb-5 text-center text-xs text-white/45">
        {clinic?.phone && <>{t("Help desk")} {clinic.phone} · </>}{t("Secured session · access is logged")}
      </footer>
    </div>
  );
}
