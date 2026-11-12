/**
 * Dashboard → App analytics (D-68): one tab per app the signed-in person may use (hospital_vvs.api.analytics.apps), each with its
 * animated charts. The chosen tab is remembered on this PC; the active-tab underline slides between tabs.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { useApi } from "@/lib/api";
import { appBySlug } from "@/lib/apps";
import { AppCharts } from "@/components/charts/AppCharts";
import { cn } from "@/utils/cn";

const KEY = "hv.dash.app";

export function AppAnalytics() {
  const { t } = useTranslation();
  const { data: apps } = useApi<string[]>("analytics.apps");
  const [tab, setTab] = useState<string>(() => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } });
  const bar = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState({ left: 0, width: 0 });
  const list = (apps ?? []).map((s) => appBySlug(s)).filter((a): a is NonNullable<typeof a> => !!a);
  const active = list.find((a) => a.slug === tab) ?? list[0];
  useEffect(() => { if (active) { try { localStorage.setItem(KEY, active.slug); } catch { /* private mode */ } } }, [active]);
  useLayoutEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>(`[data-tab="${active?.slug}"]`);
    if (el) { setInk({ left: el.offsetLeft, width: el.offsetWidth }); el.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }, [active?.slug, list.length]);
  if (!apps) return <div className="mb-6 h-80 animate-pulse rounded-3xl bg-muted" />;
  if (!active) return null;
  const Icon = active.icon;
  return (
    <section className="mb-8 rounded-3xl border border-border bg-gradient-to-b from-card to-background p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow"><Sparkles className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><h2 className="font-semibold tracking-tight">{t("App analytics")}</h2>
          <p className="text-xs text-muted-foreground">{t("Live charts for the apps you use — hover a chart for details, or switch it to a table.")}</p></div>
      </div>
      <div ref={bar} role="tablist" aria-label={t("Apps")} className="relative -mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-2 scrollbar-thin">
        {list.map((a) => (
          <button key={a.slug} data-tab={a.slug} role="tab" aria-selected={a.slug === active.slug} type="button" onClick={() => setTab(a.slug)}
            className={cn("group flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
              a.slug === active.slug ? "text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
            <span className={cn("grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br text-white shadow-sm transition-transform group-hover:scale-110", a.color)}><a.icon className="h-3.5 w-3.5" /></span>
            {t(a.label)}
          </button>
        ))}
        <span aria-hidden className="absolute bottom-0 h-0.5 rounded-full bg-primary transition-all duration-300 ease-out motion-reduce:transition-none" style={{ left: ink.left, width: ink.width }} />
      </div>
      <div key={active.slug} className="motion-safe:animate-[hvFade_.35s_ease-out]">
        <div className="mb-3 flex items-center gap-3">
          <span className={cn("grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md", active.color)}><Icon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><div className="font-semibold">{t(active.label)}</div><div className="truncate text-xs text-muted-foreground">{t(active.desc)}</div></div>
          <Link to={`/apps/${active.slug}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">
            {t("Open app")} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
        </div>
        <AppCharts app={active.slug} />
      </div>
    </section>
  );
}
