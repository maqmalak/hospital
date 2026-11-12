/**
 * VVS Hospital sidebar (D-66): collapsible navigation for every screen the signed-in person may open.
 *
 * Desktop  — expanded (256 px) or an icon rail (76 px), remembered per PC; Ctrl/⌘+B switches. In the rail each group is one icon
 *            whose fly-out lists its screens; single links show a tooltip.
 * Groups   — accordion with an animated height; the group holding the current page opens itself; open groups are remembered.
 * Search   — Ctrl/⌘+K (or "/") jumps to the filter box; ↑ ↓ Enter move through the matches; Esc clears.
 * Pinned   — star any screen (hover) to keep it at the top; pins also fill the mobile bottom bar.
 * Mobile   — a drawer that slides in over a fading backdrop (Esc, backdrop tap or a swipe closes it; page scroll is locked)
 *            and a bottom tab bar: Desktop, up to three pinned screens and Menu.
 * Motion respects prefers-reduced-motion; logical start / end classes keep Urdu (right-to-left) correct.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronsLeft, ChevronsRight, LayoutGrid, Menu, Monitor as MonitorIcon, Pin, Search, Star, X, type LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NAV, type NavGroup, type NavItem } from "@/lib/nav";
import { setShell, useShell } from "@/lib/shell";
import { appOfRoute } from "@/lib/apps";
import { cn } from "@/utils/cn";

const PINS = "hv.nav.pins";
const OPEN = "hv.nav.open";
const HOME: NavItem = { route: "/pw-home", label: "Desktop", icon: MonitorIcon, color: "from-teal-400 to-emerald-600", desc: "" };
const EXACT = new Set(["/appointments", "/patients", "/ipd", "/lab/templates", "/finance"]);

const readSet = (k: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]") as string[]); } catch { return new Set(); } };
const writeSet = (k: string, s: Set<string>) => { try { localStorage.setItem(k, JSON.stringify([...s])); } catch { /* private mode */ } };

/** Is `item` the page we are on? (exact for parents of other routes, prefix otherwise). */
function isActive(pathname: string, route: string) {
  const r = route.split("?")[0];
  if (EXACT.has(r) || r === "/pw-home") return pathname === r;
  return pathname === r || pathname.startsWith(`${r}/`);
}

function useNavModel() {
  const { can } = useAuth();
  return useMemo(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.route)) })).filter((g) => g.items.length), [can]);
}

function usePins(all: NavItem[]) {
  const [pins, setPins] = useState<Set<string>>(() => readSet(PINS));
  const toggle = useCallback((route: string) => setPins((p) => { const n = new Set(p); if (n.has(route)) n.delete(route); else n.add(route); writeSet(PINS, n); return n; }), []);
  const items = useMemo(() => all.filter((i) => pins.has(i.route)), [all, pins]);
  return { pins, toggle, items };
}

// ---------------------------------------------------------------- pieces
function Tile({ item, active, size = "md" }: { item: NavItem; active?: boolean; size?: "sm" | "md" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm ring-1 ring-white/10 transition-transform duration-200 motion-safe:group-hover:scale-110",
      item.color, size === "sm" ? "h-6 w-6" : "h-8 w-8", active && "ring-2 ring-white/40 shadow-md")}>
      <item.icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </span>
  );
}

function ItemLink({ item, active, pinned, onPin, tabIndex, highlighted, onNavigate }: {
  item: NavItem; active: boolean; pinned?: boolean; onPin?: (r: string) => void; tabIndex?: number; highlighted?: boolean; onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <NavLink to={item.route} tabIndex={tabIndex} onClick={onNavigate} title={t(item.desc || item.label)} aria-current={active ? "page" : undefined}
      className={cn("group relative flex items-center gap-3 rounded-xl py-1.5 pe-2 ps-2.5 text-[13.5px] outline-none transition-all duration-200",
        "focus-visible:ring-2 focus-visible:ring-teal-300/70",
        active ? "bg-gradient-to-r from-white/[0.14] to-white/[0.04] font-semibold text-white shadow-inner"
          : "text-sidebar-muted hover:bg-white/[0.06] hover:text-sidebar-foreground motion-safe:hover:translate-x-0.5 rtl:motion-safe:hover:-translate-x-0.5",
        highlighted && !active && "bg-white/[0.08] text-sidebar-foreground")}>
      <span className={cn("absolute inset-y-1.5 start-0 w-1 rounded-e-full bg-gradient-to-b from-teal-300 to-emerald-500 transition-all duration-300",
        active ? "opacity-100" : "scale-y-0 opacity-0")} aria-hidden />
      <Tile item={item} active={active} size="sm" />
      <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
      {onPin && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPin(item.route); }}
          aria-label={pinned ? t("Unpin") : t("Pin")} title={pinned ? t("Unpin") : t("Pin to the top")}
          className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md transition-all duration-200 hover:bg-white/10",
            pinned ? "text-amber-300 opacity-100" : "text-sidebar-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
          <Star className={cn("h-3.5 w-3.5", pinned && "fill-amber-300")} />
        </button>
      )}
    </NavLink>
  );
}

/** Accordion group: header + animated body (grid 0fr → 1fr). */
function Group({ group, open, onToggle, pathname, pins, onPin, onNavigate }: {
  group: NavGroup; open: boolean; onToggle: () => void; pathname: string; pins: Set<string>; onPin: (r: string) => void; onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const hasActive = group.items.some((i) => isActive(pathname, i.route));
  const app = appOfRoute(group.items[0].route);
  const appHome = app && group.items.length > 1 ? `/apps/${app.slug}` : null;
  return (
    <div>
      <div className="group/gh flex items-center">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className={cn("group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors",
          hasActive ? "text-teal-200" : "text-sidebar-muted/80 hover:text-sidebar-foreground")}>
        <span className="flex-1 truncate text-start">{t(group.label)}</span>
        {hasActive && !open && <span className="h-1.5 w-1.5 rounded-full bg-teal-300 shadow-[0_0_8px] shadow-teal-300" aria-hidden />}
        <span className="rounded-full bg-white/[0.06] px-1.5 text-[9.5px] font-semibold tabular-nums tracking-normal text-sidebar-muted">{group.items.length}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", !open && "-rotate-90 rtl:rotate-90")} />
      </button>
      {appHome && <Link to={appHome} onClick={onNavigate} title={t("App home")} aria-label={`${t(group.label)} · ${t("App home")}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-sidebar-muted opacity-0 transition-all hover:bg-white/10 hover:text-white group-hover/gh:opacity-100 focus-visible:opacity-100"><LayoutGrid className="h-3.5 w-3.5" /></Link>}
      </div>
      <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-0.5 pb-1 pt-0.5">
            {group.items.map((i) => (
              <ItemLink key={i.route} item={i} active={isActive(pathname, i.route)} pinned={pins.has(i.route)} onPin={onPin} tabIndex={open ? 0 : -1} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fly-out (rail mode): a group's screens, or one screen's name, beside the rail. Rendered in a portal so the rail's scroll box does not clip it. */
function Flyout({ anchor, rtl, onEnter, onLeave, children }: { anchor: DOMRect; rtl: boolean; onEnter: () => void; onLeave: () => void; children: React.ReactNode }) {
  const top = Math.max(8, Math.min(anchor.top - 6, window.innerHeight - 80));
  const style: React.CSSProperties = rtl ? { top, right: window.innerWidth - anchor.left + 10 } : { top, left: anchor.right + 10 };
  return createPortal(
    <div style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}
      className="fixed z-[120] max-h-[70vh] min-w-[220px] overflow-y-auto rounded-2xl border border-white/10 bg-sidebar p-1.5 text-sidebar-foreground shadow-2xl shadow-black/40 motion-safe:animate-[hvFly_.16s_ease-out]">
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- the sidebar
export function Sidebar({ variant }: { variant: "desktop" | "drawer" }) {
  const { boot } = useAuth();
  const { t, i18n } = useTranslation();
  const shell = useShell();
  const loc = useLocation();
  const navigate = useNavigate();
  const groups = useNavModel();
  const all = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const { pins, toggle: togglePin, items: pinned } = usePins(all);
  const rail = variant === "desktop" && shell.rail;
  const rtl = i18n.dir() === "rtl";
  const closeDrawer = variant === "drawer" ? () => setShell({ drawer: false }) : undefined;

  // open groups: remembered, plus the one holding the current page
  const [open, setOpen] = useState<Set<string>>(() => readSet(OPEN));
  useEffect(() => {
    const g = groups.find((x) => x.items.some((i) => isActive(loc.pathname, i.route)));
    if (g && !open.has(g.label)) setOpen((o) => { const n = new Set(o).add(g.label); writeSet(OPEN, n); return n; });
  }, [loc.pathname, groups]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleGroup = (label: string) => setOpen((o) => { const n = new Set(o); if (n.has(label)) n.delete(label); else n.add(label); writeSet(OPEN, n); return n; });
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.label));
  const setAll = (on: boolean) => { const n = new Set(on ? groups.map((g) => g.label) : []); writeSet(OPEN, n); setOpen(n); };

  // search
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const query = q.trim().toLowerCase();
  const matches = useMemo(() => (query ? all.filter((i) => `${t(i.label)} ${i.label} ${i.desc} ${t(i.desc)}`.toLowerCase().includes(query)) : []), [query, all, t]);
  useEffect(() => setHi(0), [query]);
  const onSearchKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    if (e.key === "Enter" && matches[hi]) { navigate(matches[hi].route); setQ(""); searchRef.current?.blur(); closeDrawer?.(); }
    if (e.key === "Escape") { setQ(""); searchRef.current?.blur(); }
  };

  // keyboard: Ctrl/⌘+B rail, Ctrl/⌘+K or "/" search (desktop sidebar only, so the drawer copy does not double up)
  useEffect(() => {
    if (variant !== "desktop") return;
    const h = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); setShell({ rail: !shell.rail }); }
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        if (shell.rail) setShell({ rail: false });
        setTimeout(() => searchRef.current?.focus(), shell.rail ? 320 : 0);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [variant, shell.rail]);

  // rail fly-outs
  const [fly, setFly] = useState<{ key: string; rect: DOMRect } | null>(null);
  const flyTimer = useRef<number>();
  const showFly = (key: string, el: HTMLElement) => { window.clearTimeout(flyTimer.current); setFly({ key, rect: el.getBoundingClientRect() }); };
  const hideFly = () => { window.clearTimeout(flyTimer.current); flyTimer.current = window.setTimeout(() => setFly(null), 140); };
  const keepFly = () => window.clearTimeout(flyTimer.current);
  useEffect(() => setFly(null), [loc.pathname, shell.rail]);

  if (!boot) return null;
  const clinicName = i18n.language === "ur" && boot.clinic.name_ur ? boot.clinic.name_ur : i18n.language === "ar" && boot.clinic.name_ar ? boot.clinic.name_ar : boot.clinic.name;
  const initials = (boot.full_name || boot.user).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const role = boot.roles.filter((r) => r !== "System Manager").map((r) => r.replace(/^PW /, "")).join(", ") || (boot.is_admin ? "Administrator" : "");

  const RailButton = ({ k, icon: I, color, active, label, onClick, to }: { k: string; icon: LucideIcon; color: string; active: boolean; label: string; onClick?: () => void; to?: string }) => {
    const cls = cn("group relative mx-auto grid h-11 w-11 place-items-center rounded-xl outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-teal-300/70",
      active ? "bg-white/[0.12]" : "hover:bg-white/[0.07]");
    const inner = <>
      <span className={cn("absolute inset-y-2 -start-[14px] w-1 rounded-e-full bg-gradient-to-b from-teal-300 to-emerald-500 transition-all duration-300", active ? "opacity-100" : "scale-y-0 opacity-0")} aria-hidden />
      <span className={cn("grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm transition-transform duration-200 motion-safe:group-hover:scale-110", color, active && "ring-2 ring-white/40")}><I className="h-4 w-4" /></span>
    </>;
    const ev = { onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showFly(k, e.currentTarget), onMouseLeave: hideFly,
      onFocus: (e: React.FocusEvent<HTMLElement>) => showFly(k, e.currentTarget), onBlur: hideFly, "aria-label": label };
    return to ? <Link to={to} className={cls} {...ev}>{inner}</Link> : <button type="button" onClick={onClick} className={cls} {...ev}>{inner}</button>;
  };

  return (
    <nav aria-label={t("Main menu")} className={cn("relative flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
      "bg-[radial-gradient(120%_60%_at_0%_0%,rgba(45,212,191,0.10),transparent_60%)]", variant === "drawer" && "shadow-2xl")}>
      {/* brand */}
      <div className={cn("flex items-center gap-3 px-4 pb-3 pt-4", rail && "justify-center px-0")}>
        <Link to="/pw-home" onClick={closeDrawer} className="group flex min-w-0 items-center gap-3" aria-label={clinicName}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 text-lg font-black text-white shadow-lg shadow-teal-900/40 transition-transform duration-300 motion-safe:group-hover:rotate-[-6deg] motion-safe:group-hover:scale-105">V</span>
          {!rail && <span className="min-w-0"><span className="block truncate text-sm font-bold">{clinicName}</span><span className="block text-[11px] text-sidebar-muted">VVSDesk</span></span>}
        </Link>
        {variant === "drawer" && <button type="button" onClick={closeDrawer} className="ms-auto grid h-9 w-9 place-items-center rounded-lg text-sidebar-muted hover:bg-white/10 hover:text-white" aria-label={t("Close menu")}><X className="h-5 w-5" /></button>}
      </div>

      {/* search */}
      {!rail ? (
        <div className="px-3 pb-2">
          <label className="group flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 transition-colors focus-within:border-teal-300/50 focus-within:bg-white/[0.08]">
            <Search className="h-4 w-4 shrink-0 text-sidebar-muted group-focus-within:text-teal-200" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder={t("Find a screen…")} aria-label={t("Find a screen")}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-sidebar-foreground outline-none placeholder:text-sidebar-muted/70" />
            {q ? <button type="button" onClick={() => setQ("")} className="text-sidebar-muted hover:text-white" aria-label={t("Clear")}><X className="h-3.5 w-3.5" /></button>
              : variant === "desktop" && <kbd className="rounded border border-white/15 px-1 font-sans text-[10px] text-sidebar-muted">Ctrl K</kbd>}
          </label>
        </div>
      ) : (
        <button type="button" onClick={() => { setShell({ rail: false }); setTimeout(() => searchRef.current?.focus(), 320); }} aria-label={t("Find a screen")} title={`${t("Find a screen")} (Ctrl K)`}
          className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl text-sidebar-muted transition-colors hover:bg-white/[0.07] hover:text-white"><Search className="h-4 w-4" /></button>
      )}

      {/* body */}
      <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3", rail ? "space-y-1 px-0" : "space-y-3 px-2")}>
        {rail ? (
          <>
            <RailButton k="home" to="/pw-home" icon={MonitorIcon} color={HOME.color} active={isActive(loc.pathname, "/pw-home")} label={t("Desktop")} />
            {pinned.map((p) => <RailButton key={p.route} k={`pin:${p.route}`} to={p.route} icon={p.icon} color={p.color} active={isActive(loc.pathname, p.route)} label={t(p.label)} />)}
            {pinned.length > 0 && <div className="mx-auto my-1 h-px w-8 bg-white/10" />}
            {groups.map((g) => (
              <RailButton key={g.label} k={`group:${g.label}`} icon={g.items[0].icon} color={g.items[0].color} active={g.items.some((i) => isActive(loc.pathname, i.route))} label={t(g.label)}
                onClick={() => { setShell({ rail: false }); if (!open.has(g.label)) toggleGroup(g.label); }} />
            ))}
          </>
        ) : query ? (
          <div className="space-y-0.5" role="listbox" aria-label={t("Matching screens")}>
            <div className="px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-sidebar-muted/80">{matches.length} {t("matches")}</div>
            {matches.map((i, idx) => <ItemLink key={i.route} item={i} active={isActive(loc.pathname, i.route)} highlighted={idx === hi} pinned={pins.has(i.route)} onPin={togglePin} onNavigate={() => { setQ(""); closeDrawer?.(); }} />)}
            {!matches.length && <div className="px-3 py-6 text-center text-xs text-sidebar-muted">{t("No screen matches")} “{q}”</div>}
          </div>
        ) : (
          <>
            <ItemLink item={HOME} active={isActive(loc.pathname, "/pw-home")} onNavigate={closeDrawer} />
            {pinned.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-amber-200/90"><Pin className="h-3 w-3" />{t("Pinned")}</div>
                <div className="space-y-0.5">{pinned.map((i) => <ItemLink key={i.route} item={i} active={isActive(loc.pathname, i.route)} pinned onPin={togglePin} onNavigate={closeDrawer} />)}</div>
              </div>
            )}
            <div className="flex justify-end px-1">
              <button type="button" onClick={() => setAll(!allOpen)} className="rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold text-sidebar-muted transition-colors hover:bg-white/[0.06] hover:text-white">
                {allOpen ? t("Collapse all") : t("Expand all")}</button>
            </div>
            {groups.map((g) => <Group key={g.label} group={g} open={open.has(g.label)} onToggle={() => toggleGroup(g.label)} pathname={loc.pathname} pins={pins} onPin={togglePin} onNavigate={closeDrawer} />)}
          </>
        )}
      </div>

      {/* footer: who is signed in + collapse */}
      <div className={cn("flex items-center gap-2.5 border-t border-white/10 p-3", rail && "flex-col px-0")}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 text-xs font-bold text-white ring-2 ring-white/10" title={`${boot.full_name} · ${role}`}>{initials}</span>
        {!rail && <div className="min-w-0 flex-1 text-xs"><div className="truncate font-semibold text-sidebar-foreground">{boot.full_name}</div><div className="truncate text-sidebar-muted">{role}</div></div>}
        {variant === "desktop" && (
          <button type="button" onClick={() => setShell({ rail: !shell.rail })} title={`${rail ? t("Expand menu") : t("Collapse menu")} (Ctrl B)`} aria-label={rail ? t("Expand menu") : t("Collapse menu")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white">
            {rail !== rtl ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* rail fly-outs */}
      {rail && fly && (() => {
        if (fly.key === "home" || fly.key.startsWith("pin:")) {
          const label = fly.key === "home" ? t("Desktop") : t(pinned.find((p) => `pin:${p.route}` === fly.key)?.label ?? "");
          return <Flyout anchor={fly.rect} rtl={rtl} onEnter={keepFly} onLeave={hideFly}><div className="whitespace-nowrap px-3 py-1.5 text-sm font-semibold">{label}</div></Flyout>;
        }
        const g = groups.find((x) => `group:${x.label}` === fly.key);
        if (!g) return null;
        return (
          <Flyout anchor={fly.rect} rtl={rtl} onEnter={keepFly} onLeave={hideFly}>
            <div className="px-2.5 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-teal-200">{t(g.label)}</div>
            <div className="space-y-0.5">{g.items.map((i) => <ItemLink key={i.route} item={i} active={isActive(loc.pathname, i.route)} pinned={pins.has(i.route)} onPin={togglePin} onNavigate={() => setFly(null)} />)}</div>
          </Flyout>
        );
      })()}
    </nav>
  );
}

// ---------------------------------------------------------------- mobile drawer + bottom bar
export function MobileDrawer() {
  const shell = useShell();
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const loc = useLocation();
  const panel = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const rtl = i18n.dir() === "rtl";
  const open = shell.drawer;
  useEffect(() => { setShell({ drawer: false }); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setShell({ drawer: false }); };
    window.addEventListener("keydown", k);
    setTimeout(() => panel.current?.querySelector<HTMLElement>("input, a, button")?.focus(), 250);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [open]);
  const onStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onMove = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.touches[0].clientX - touch.current.x, dy = e.touches[0].clientY - touch.current.y;
    if (Math.abs(dy) > Math.abs(dx)) return;
    setDrag(rtl ? Math.max(0, dx) : Math.min(0, dx));
  };
  const onEnd = () => { if (Math.abs(drag) > 80) setShell({ drawer: false }); setDrag(0); touch.current = null; };
  return (
    <div className={cn("fixed inset-0 z-50 lg:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
      <div onClick={() => setShell({ drawer: false })} className={cn("absolute inset-0 bg-slate-950/55 backdrop-blur-[2px] transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={t("Main menu")} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
        style={drag ? { transform: `translateX(${drag}px)`, transition: "none" } : undefined}
        className={cn("absolute inset-y-0 start-0 w-[84vw] max-w-[320px] transition-transform duration-300 ease-out motion-reduce:transition-none",
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full")}>
        <Sidebar variant="drawer" />
      </div>
    </div>
  );
}

export function MobileTabBar() {
  const { t } = useTranslation();
  const loc = useLocation();
  const groups = useNavModel();
  const all = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const { items: pinned } = usePins(all);
  const tabs = [HOME, ...(pinned.length ? pinned : all).slice(0, 3)];
  return (
    <nav aria-label={t("Quick menu")} className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map((i) => {
          const active = isActive(loc.pathname, i.route);
          return (
            <Link key={i.route} to={i.route} aria-current={active ? "page" : undefined}
              className={cn("relative flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[10.5px] font-medium transition-colors", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
              <span className={cn("absolute top-0 h-0.5 w-8 rounded-full bg-primary transition-all duration-300", active ? "opacity-100" : "scale-x-0 opacity-0")} aria-hidden />
              <span className={cn("grid h-8 w-8 place-items-center rounded-xl transition-all duration-200", active ? "bg-gradient-to-br text-white shadow " + i.color : "")}><i.icon className="h-4 w-4" /></span>
              <span className="w-full truncate text-center">{t(i.label)}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setShell({ drawer: true })} className="flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[10.5px] font-medium text-muted-foreground hover:text-foreground">
          <span className="grid h-8 w-8 place-items-center rounded-xl"><Menu className="h-4 w-4" /></span>{t("Menu")}
        </button>
      </div>
    </nav>
  );
}

