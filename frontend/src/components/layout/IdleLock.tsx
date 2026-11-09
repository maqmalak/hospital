import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, humanizeError } from "@/lib/api";
import { Button } from "@/components/ui/button";

/** Idle session lock (09-security-ops.md): keeps the page underneath, asks for the password to resume. */
export function IdleLock({ minutes }: { minutes: number }) {
  const { boot, logout } = useAuth();
  const { t } = useTranslation();
  const [locked, setLocked] = useState(() => { try { return sessionStorage.getItem("hv.locked") === "1"; } catch { return false; } });
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const last = useRef(Date.now());

  useEffect(() => {
    const bump = () => { last.current = Date.now(); };
    const evs = ["mousemove", "keydown", "mousedown", "touchstart", "wheel"];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (!locked && minutes > 0 && Date.now() - last.current > minutes * 60_000) {
        setLocked(true);
        try { sessionStorage.setItem("hv.locked", "1"); } catch { /* ignore */ }
      }
    }, 10_000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, [locked, minutes]);

  // manual lock (reception counter "Lock" button / F12)
  useEffect(() => {
    const lock = () => { setLocked(true); try { sessionStorage.setItem("hv.locked", "1"); } catch { /* ignore */ } };
    window.addEventListener("hv-lock", lock);
    return () => window.removeEventListener("hv-lock", lock);
  }, []);

  if (!locked) return null;
  const unlock = async () => {
    setBusy(true);
    try {
      await call("session.unlock", { password: pwd });
      setLocked(false); setPwd(""); last.current = Date.now();
      try { sessionStorage.removeItem("hv.locked"); } catch { /* ignore */ }
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xl">
      <form onSubmit={(e) => { e.preventDefault(); void unlock(); }} className="w-full max-w-sm rounded-2xl border border-white/10 bg-card p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white"><Lock className="h-6 w-6" /></div>
        <h2 className="text-lg font-bold">{t("Screen locked")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{boot?.full_name} · {t("Enter your password to continue")}</p>
        <input type="password" autoFocus value={pwd} onChange={(e) => setPwd(e.target.value)} className="mb-3 h-11 w-full rounded-lg border border-input bg-[hsl(var(--input-bg))] px-3" placeholder={t("Password")} />
        <Button type="submit" variant="primary" className="w-full" loading={busy}>{t("Unlock")}</Button>
        <button type="button" onClick={() => { try { sessionStorage.removeItem("hv.locked"); } catch { /* ignore */ } void logout(); }} className="mt-3 text-xs text-muted-foreground hover:underline">{t("Sign out")}</button>
      </form>
    </div>
  );
}
