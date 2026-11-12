import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, ChevronDown, Languages, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { setShell, useShell } from "@/lib/shell";
import { loadLearned } from "@/lib/urdu";
import { getCall } from "@/lib/api";
import { LANGUAGES } from "@/i18n";
import { cn } from "@/utils/cn";
import { IdleLock } from "./IdleLock";
import { MobileDrawer, MobileTabBar, Sidebar } from "./Sidebar";
import { BackBar, useTrail } from "@/lib/trail";

export function AppShell({ children }: { children: ReactNode }) {
  const { boot, branch, setBranch, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const loc = useLocation();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const shell = useShell();
  const trail = useTrail();
  useEffect(() => { if (boot) void loadLearned(() => getCall<Record<string, string>>("hospital_vvs.api.patients.urdu_words")); }, [boot]); // English → Urdu corrections (D-51)
  useEffect(() => { if (shell.full) setShell({ full: false }); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("hv.theme", next ? "dark" : "light"); } catch { /* ignore */ }
    setDark(next);
  };
  if (!boot) return null;
  return (
    <div className="flex h-full flex-col">
      {boot.training ? <div className="no-print bg-red-600 py-1 text-center text-xs font-bold tracking-widest text-white">{t("TRAINING")} — demo data, resets nightly</div> : null}
      <div className="flex min-h-0 flex-1">
        {shell.nav && !shell.full && (
          <aside className={cn("no-print hidden shrink-0 transition-[width] duration-300 ease-out motion-reduce:transition-none lg:block", shell.rail ? "w-[76px]" : "w-64")}>
            <Sidebar variant="desktop" />
          </aside>
        )}
        {!shell.full && <MobileDrawer />}
        <div className="flex min-w-0 flex-1 flex-col">
          {!shell.full && <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur sm:px-5">
            <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setShell({ drawer: true })} aria-label={t("Menu")}><Menu className="h-5 w-5" /></button>
            <button className="hidden rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:block"
              onClick={() => (shell.nav ? setShell({ rail: !shell.rail }) : setShell({ nav: true }))}
              title={!shell.nav ? t("Show menu") : shell.rail ? `${t("Expand menu")} (Ctrl B)` : `${t("Collapse menu")} (Ctrl B)`}
              aria-label={!shell.nav ? t("Show menu") : shell.rail ? t("Expand menu") : t("Collapse menu")}>
              {shell.nav && !shell.rail ? <PanelLeftClose className="h-5 w-5 rtl:-scale-x-100" /> : <PanelLeftOpen className="h-5 w-5 rtl:-scale-x-100" />}</button>
            <div className="flex-1" />
            {boot.branches.length > 1 ? (
              <label className="flex items-center gap-1 rounded-lg border border-border px-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <select value={branch} onChange={(e) => setBranch(e.target.value)} className="h-8 bg-transparent pe-1 outline-none">
                  {boot.branches.map((b) => <option key={b}>{b}</option>)}
                </select>
              </label>
            ) : <span className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex"><Building2 className="h-4 w-4" />{branch}</span>}
            <div className="relative">
              <label className="flex items-center gap-1 rounded-lg border border-border px-2 text-sm">
                <Languages className="h-4 w-4 text-muted-foreground" />
                <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} className="h-8 bg-transparent outline-none">
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </label>
            </div>
            <button onClick={toggleTheme} className="rounded-lg border border-border p-2 hover:bg-muted" aria-label="Theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <a href="/desk" target="_blank" rel="noreferrer" className="hidden rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted md:block">Desk</a>
            <button onClick={() => void logout()} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">{t("Sign out")}</span><ChevronDown className="hidden h-3 w-3" />
            </button>
          </header>}
          <main className={cn("min-h-0 flex-1 overflow-y-auto", shell.full ? "p-0" : "p-3 pb-24 sm:p-5 sm:pb-24 lg:pb-5")}>{!shell.full && <BackBar trail={trail} />}{children}</main>
        </div>
      </div>
      {!shell.full && <MobileTabBar />}
      <IdleLock minutes={boot.idle_lock_minutes} />
    </div>
  );
}
