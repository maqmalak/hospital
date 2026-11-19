import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, ChevronDown, ExternalLink, Globe, Languages, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatarish } from "@/components/common";
import { useBrandFonts } from "@/components/brand";
import { useAuth } from "@/lib/auth";
import { setShell, useShell } from "@/lib/shell";
import { loadLearned } from "@/lib/urdu";
import { getCall } from "@/lib/api";
import { LANGUAGES } from "@/i18n";
import { cn } from "@/utils/cn";
import { IdleLock } from "./IdleLock";
import { MobileDrawer, MobileTabBar, Sidebar } from "./Sidebar";
import { BackBar, useTrail } from "@/lib/trail";
import { PALETTES, usePalette } from "@/lib/palette";

export function AppShell({ children }: { children: ReactNode }) {
  const { boot, branch, setBranch, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const loc = useLocation();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const shell = useShell();
  const trail = useTrail();
  useBrandFonts();
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
          {!shell.full && <header className="no-print relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur sm:px-5">
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
            <a href="/hms/site" target="_blank" rel="noreferrer" title={t("Visit website")} aria-label={t("Visit website")}
              className="rounded-lg border border-border p-2 text-teal-700 hover:border-teal-500/60 hover:bg-teal-500/10 dark:text-teal-300"><Globe className="h-4 w-4" /></a>
            <a href="/desk" target="_blank" rel="noreferrer" className="hidden rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted md:block">Desk</a>
            <UserMenu name={boot.full_name} user={boot.user} image={boot.image} onLogout={() => void logout()} />
          </header>}
          <main className={cn("min-h-0 flex-1 overflow-y-auto", shell.full ? "p-0" : "p-3 pb-24 sm:p-5 sm:pb-24 lg:pb-5")}>{!shell.full && <BackBar trail={trail} />}{children}</main>
        </div>
      </div>
      {!shell.full && <MobileTabBar />}
      <IdleLock minutes={boot.idle_lock_minutes} />
    </div>
  );
}

/** Account menu: who is signed in, My account, Visit site, Sign out. */
function UserMenu({ name, user, image, onLogout }: { name: string; user: string; image?: string; onLogout: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest("[data-user-menu]")) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-muted";
  return (
    <div className="relative" data-user-menu>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-1.5 rounded-full border border-border py-0.5 pe-2 ps-0.5 hover:bg-muted">
        <Avatarish name={name} src={image} size={7} /><span className="hidden max-w-[120px] truncate text-xs font-semibold sm:inline">{name.split(" ")[0]}</span><ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-card p-1.5 shadow-xl">
          <div className="flex items-center gap-3 border-b border-border px-3 pb-3 pt-2">
            <Avatarish name={name} src={image} size={10} />
            <div className="min-w-0"><div className="truncate text-sm font-semibold">{name}</div><div className="truncate text-xs text-muted-foreground">{user}</div></div>
          </div>
          <div className="py-1">
            <Link role="menuitem" to="/account" className={item}><UserRound className="h-4 w-4 text-muted-foreground" />{t("My account")}</Link>
            <a role="menuitem" href="/hms/site" target="_blank" rel="noreferrer" className={item}><Globe className="h-4 w-4 text-muted-foreground" />{t("Visit site")}<ExternalLink className="ms-auto h-3.5 w-3.5 text-muted-foreground" /></a>
          </div>
          <PalettePicker />
          <div className="border-t border-border pt-1">
            <button role="menuitem" onClick={onLogout} className={cn(item, "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10")}><LogOut className="h-4 w-4" />{t("Sign out")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Colour theme choice in the account menu (D-90): Lime (default) or the VVS Gold. Per browser; light / dark is separate. */
function PalettePicker() {
  const { t } = useTranslation();
  const [palette, setPalette] = usePalette();
  return (
    <div className="border-t border-border px-3 py-2.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("Colour theme")}</div>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t("Colour theme")}>
        {PALETTES.map((p) => (
          <button key={p.id} role="radio" aria-checked={palette === p.id} onClick={() => setPalette(p.id)}
            className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
              palette === p.id ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted")}>
            <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20" style={{ background: p.swatch }} />{t(p.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
