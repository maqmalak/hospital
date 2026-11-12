/**
 * Navigation trail (per browser tab, D-67): where the person came from, so every page offers "Back to <that page>" — the exact
 * page with its filters / query — instead of a fixed parent. Ported idea from the sugarcane shell (app/trail.ts).
 *
 * - Moving to another page pushes it; changing only the query of the same page (filters, tabs) updates the current step.
 * - Going back to the previous step (the Back bar or the browser's back button) pops the trail.
 * - The Desktop and the login page start a new trail.
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Home } from "lucide-react";
import { appBySlug, itemByRoute } from "@/lib/apps";

export interface Step { path: string; label: string }
const KEY = "hv.trail";
const MAX = 12;
const RESET = new Set(["/", "/pw-home", "/login"]);

const read = (): Step[] => { try { return JSON.parse(sessionStorage.getItem(KEY) || "[]") as Step[]; } catch { return []; } };
const write = (t: Step[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(t.slice(-MAX))); } catch { /* private mode */ } };
const pathOnly = (p: string) => p.split("?")[0].replace(/\/+$/, "") || "/";

/** A readable name for a page: the app or menu screen it is, else its last path segment (record pages show the record). */
export function labelFor(path: string): string {
  const p = pathOnly(path);
  if (p === "/pw-home") return "Desktop";
  if (p.startsWith("/apps/")) return appBySlug(p.split("/")[2])?.label ?? "App";
  const exact = itemByRoute(p);
  if (exact) return exact.label;
  const segs = p.split("/").filter(Boolean);
  for (let i = segs.length - 1; i > 0; i--) {  // a record under a menu screen: "Journal entries · ACC-JV-…"
    const parent = itemByRoute(`/${segs.slice(0, i).join("/")}`);
    if (parent) return `${parent.label} · ${decodeURIComponent(segs[segs.length - 1])}`;
  }
  const last = decodeURIComponent(segs[segs.length - 1] ?? "");
  return last ? last.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Desktop";
}

/** Record every move (call once, in the shell). Returns the trail. */
export function useTrail(): Step[] {
  const loc = useLocation();
  const [trail, setTrail] = useState<Step[]>(read);
  useEffect(() => {
    const full = loc.pathname + loc.search;
    const here = pathOnly(loc.pathname);
    let t = read();
    if (RESET.has(here)) t = [];
    const step = { path: full, label: labelFor(full) };
    const j = t.map((x) => pathOnly(x.path)).lastIndexOf(here);
    if (j >= 0) t = [...t.slice(0, j), step];  // same page (new query) or back to an earlier step: cut the trail there
    else t = [...t, step];
    write(t);
    setTrail(t);
  }, [loc.pathname, loc.search]);
  return trail;
}

/** "← Back to <origin>" with the Desktop shortcut; hidden on the Desktop itself. */
export function BackBar({ trail }: { trail: Step[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loc = useLocation();
  if (RESET.has(pathOnly(loc.pathname))) return null;
  const prev = trail[trail.length - 2];
  const crumbs = trail.slice(0, -1).filter((c) => !RESET.has(pathOnly(c.path))).slice(-3);  // the Desktop is always the first crumb
  return (
    <div className="no-print mb-3 flex min-w-0 items-center gap-2 text-sm">
      <button type="button" onClick={() => (prev ? navigate(prev.path) : navigate("/pw-home"))}
        className="group inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 font-semibold shadow-sm transition-all hover:-translate-x-0.5 hover:border-primary/40 hover:text-primary rtl:hover:translate-x-0.5">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5" />
        {t("Back to")} {t(prev ? prev.label : "Desktop")}
      </button>
      <nav aria-label={t("Where you came from")} className="hidden min-w-0 items-center gap-1 truncate text-xs text-muted-foreground md:flex">
        <Link to="/pw-home" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-muted hover:text-foreground"><Home className="h-3.5 w-3.5" />{t("Desktop")}</Link>
        {crumbs.map((c, i) => (
          <span key={`${c.path}-${i}`} className="inline-flex min-w-0 items-center gap-1">
            <span aria-hidden>/</span>
            <Link to={c.path} className="truncate rounded-md px-1.5 py-1 hover:bg-muted hover:text-foreground">{t(c.label)}</Link>
          </span>
        ))}
        <span aria-hidden>/</span><span className="truncate px-1.5 font-medium text-foreground">{t(trail[trail.length - 1]?.label ?? "")}</span>
      </nav>
    </div>
  );
}
