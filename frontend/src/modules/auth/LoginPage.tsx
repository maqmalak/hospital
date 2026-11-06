import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Activity, BedDouble, CalendarCheck, KeyRound, Languages, ShieldCheck, Stethoscope } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { humanizeError } from "@/lib/api";
import { LANGUAGES } from "@/i18n";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/common";

export default function LoginPage() {
  const { boot, login } = useAuth();
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [otp, setOtp] = useState("");
  const [verify, setVerify] = useState<{ tmp_id: string; prompt?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (boot) return <Navigate to={loc.state?.from || "/pw-home"} replace />;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await login(usr, pwd, verify ? { tmp_id: verify.tmp_id, otp } : undefined);
      if (r.verification) { setVerify(r.verification); toast(r.verification.prompt || "Enter the code from your authenticator app"); return; }
      nav(loc.state?.from || "/pw-home", { replace: true });
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-600 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -end-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 -start-20 h-[28rem] w-[28rem] rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-2xl font-black backdrop-blur">V</span>
          <div><div className="text-xl font-extrabold">VVSDesk</div><div className="text-sm text-white/70">Hospital management · Pakistan</div></div>
        </div>
        <div className="relative mt-auto">
          <h1 className="text-4xl font-extrabold leading-tight">Every patient,<br />every counter,<br />one calm system.</h1>
          <p className="mt-3 max-w-md text-white/80">OPD, appointments on web and WhatsApp, prescriptions with safety checks, wards and billing, in English and اردو.</p>
          <div className="mt-8 grid max-w-lg grid-cols-2 gap-3">
            {[[CalendarCheck, "Web + WhatsApp booking"], [Stethoscope, "Allergy & interaction alerts"], [BedDouble, "Live bed map"], [ShieldCheck, "Audit trail on every record"]].map(([Icon, label]) => {
              const I = Icon as typeof Activity;
              return <div key={label as string} className="flex items-center gap-2 rounded-xl bg-white/10 p-3 text-sm backdrop-blur"><I className="h-4 w-4" />{label as string}</div>;
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-500 text-xl font-black text-white lg:hidden">V</div>
            <label className="ms-auto flex items-center gap-1 text-sm text-muted-foreground"><Languages className="h-4 w-4" />
              <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} className="bg-transparent outline-none">
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select></label>
          </div>
          <h2 className="text-2xl font-extrabold">{t("Sign in")}</h2>
          <p className="mb-6 text-sm text-muted-foreground">Staff login for VVSDesk</p>
          {!verify ? (
            <>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("Email or username")}</label>
              <input className={inputCls + " mb-4 h-11"} value={usr} onChange={(e) => setUsr(e.target.value)} autoFocus autoComplete="username" />
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("Password")}</label>
              <input className={inputCls + " mb-6 h-11"} type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" />
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-800 dark:bg-teal-500/10 dark:text-teal-200"><KeyRound className="h-4 w-4" />{verify.prompt || "Two-factor authentication is required for your role."}</div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("Verification code")}</label>
              <input className={inputCls + " mb-6 h-11 text-center text-lg tracking-[0.4em]"} value={otp} onChange={(e) => setOtp(e.target.value)} autoFocus inputMode="numeric" />
            </>
          )}
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>{t("Sign in")}</Button>
          <a href="/hms/book-appointment" className="mt-6 block text-center text-sm font-semibold text-primary hover:underline">{t("Book appointment")} →</a>
        </form>
      </div>
    </div>
  );
}
