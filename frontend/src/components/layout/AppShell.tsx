import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, ChevronDown, Languages, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, X , Monitor as MonitorIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { setShell, useShell } from "@/lib/shell";
import { loadLearned } from "@/lib/urdu";
import { getCall } from "@/lib/api";
import { NAV } from "@/lib/nav";
import { LANGUAGES } from "@/i18n";
import { cn } from "@/utils/cn";
import { IdleLock } from "./IdleLock";

export function AppShell({ children }: { children: ReactNode }) {
  const { boot, can, branch, setBranch, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const shell = useShell();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => { if (boot) void loadLearned(() => getCall<Record<string, string>>("hospital_vvs.api.patients.urdu_words")); }, [boot]); // English → Urdu corrections (D-51)
  useEffect(() => { if (shell.full) setShell({ full: false }); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("hv.theme", next ? "dark" : "light"); } catch { /* ignore */ }
    setDark(next);
  };
  if (!boot) return null;
  const clinicName = i18n.language === "ur" && boot.clinic.name_ur ? boot.clinic.name_ur : i18n.language === "ar" && boot.clinic.name_ar ? boot.clinic.name_ar : boot.clinic.name;
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.route)) })).filter((g) => g.items.length);

  const sidebar = (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link to="/pw-home" className="flex items-center gap-3 px-4 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 text-lg font-black text-white shadow-lg shadow-teal-900/40">V</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{clinicName}</span>
          <span className="block text-[11px] text-sidebar-muted">VVSDesk</span>
        </span>
      </Link>
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        <NavLink to="/pw-home" className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm", isActive ? "bg-white/10 font-semibold" : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground")}>
          <MonitorIcon className="h-4 w-4" /> {t("Desktop")}
        </NavLink>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-sidebar-muted/80">{t(g.label)}</div>
            {g.items.map((i) => (
              <NavLink key={i.route} to={i.route} end={i.route === "/appointments" || i.route === "/patients"}
                className={({ isActive }) => cn("group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive ? "bg-white/10 font-semibold text-white" : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground")}>
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br text-white", i.color)}><i.icon className="h-3.5 w-3.5" /></span>
                <span className="truncate">{t(i.label)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3 text-xs text-sidebar-muted">
        <div className="truncate font-semibold text-sidebar-foreground">{boot.full_name}</div>
        <div className="truncate">{boot.roles.filter((r) => r !== "System Manager").join(", ") || (boot.is_admin ? "Administrator" : "")}</div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-full flex-col">
      {boot.training ? <div className="no-print bg-red-600 py-1 text-center text-xs font-bold tracking-widest text-white">{t("TRAINING")} — demo data, resets nightly</div> : null}
      <div className="flex min-h-0 flex-1">
        {shell.nav && !shell.full && <aside className="no-print hidden w-64 shrink-0 lg:block">{sidebar}</aside>}
        {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72">{sidebar}</aside></div>}
        <div className="flex min-w-0 flex-1 flex-col">
          {!shell.full && <header className="no-print flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur sm:px-5">
            <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
            <button className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:block" onClick={() => setShell({ nav: !shell.nav })}
              title={shell.nav ? "Hide menu" : "Show menu"} aria-label={shell.nav ? "Hide menu" : "Show menu"}>{shell.nav ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}</button>
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
          <main className={cn("min-h-0 flex-1 overflow-y-auto", shell.full ? "p-0" : "p-3 sm:p-5")}>{children}</main>
        </div>
      </div>
      <IdleLock minutes={boot.idle_lock_minutes} />
    </div>
  );
}
