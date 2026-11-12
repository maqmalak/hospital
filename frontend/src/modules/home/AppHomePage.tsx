/**
 * App home (/apps/<slug>, D-67): one page per app — its screens as cards with live numbers, the usual workflow, what needs attention
 * in this app, and its help. Opened from the Desktop's app icons; every screen opened from here offers "Back to <app>".
 * Data: hospital_vvs.api.dashboard.home (the same counts as the Desktop).
 */
import { Link, Navigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, BookOpen, ChevronRight, Flag, PlayCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { appBySlug, itemByRoute } from "@/lib/apps";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/utils/cn";
import { AppCharts } from "@/components/charts/AppCharts";

const CHART_APPS = new Set(["opd", "clinic", "lab", "ipd", "pharmacy", "store", "cash", "finance", "accounting", "buying", "billing", "insights", "online"]);

interface Alert { key: string; to: string; label: string; meta: string; n: number }
interface Home { alerts: Alert[]; tiles: Record<string, { value: number; label: string }> }

export default function AppHomePage() {
  const { slug } = useParams();
  const { can, branch } = useAuth();
  const { t } = useTranslation();
  const app = appBySlug(slug);
  const { data: home } = useApi<Home>("dashboard.home", { branch }, { refetchInterval: 60_000 });
  if (!app) return <Navigate to="/pw-home" replace />;
  const items = app.routes.map(itemByRoute).filter((i): i is NavItem => !!i && can(i.route));
  if (!items.length) return <Navigate to="/pw-home" replace />;
  const flow = (app.flow ?? []).map(itemByRoute).filter((i): i is NavItem => !!i && can(i.route));
  const alerts = (home?.alerts ?? []).filter((a) => app.routes.some((r) => a.to.split("?")[0] === r || a.to.startsWith(`${r}/`) || a.to.startsWith(`${r}?`)));
  const live = items.filter((i) => home?.tiles?.[i.route]);
  const Icon = app.icon;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* hero */}
      <section className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-lg sm:p-7", app.color)}>
        <span aria-hidden className="pointer-events-none absolute -end-16 -top-20 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-24 start-1/3 h-56 w-56 rounded-full bg-black/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/20 shadow-inner ring-1 ring-inset ring-white/30"><Icon className="h-8 w-8" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">{t("App")}</div>
            <h1 className="text-3xl font-bold tracking-tight">{t(app.label)}</h1>
            <p className="mt-0.5 text-sm text-white/85">{t(app.desc)} · {items.length} {t(items.length === 1 ? "screen" : "screens")}</p>
          </div>
          {live.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {live.slice(0, 4).map((i) => (
                <Link key={i.route} to={i.route} className="min-w-[110px] rounded-2xl bg-white/15 px-3.5 py-2 ring-1 ring-inset ring-white/25 backdrop-blur transition hover:bg-white/25">
                  <div className="text-2xl font-black tabular-nums leading-none">{home!.tiles[i.route].value.toLocaleString()}</div>
                  <div className="mt-1 truncate text-[11px] text-white/85">{t(home!.tiles[i.route].label)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* workflow */}
      {flow.length > 1 && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />{t(app.flowTitle ?? "Workflow")}</div>
          <ol className="flex flex-wrap items-stretch gap-2">
            {flow.map((s, i) => (
              <li key={s.route} className="flex items-center gap-2">
                <Link to={s.route} className="group flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <span className={cn("grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white shadow", app.color)}>{i === flow.length - 1 ? <Flag className="h-3.5 w-3.5" /> : i + 1}</span>
                  <span className="text-sm font-semibold group-hover:text-primary">{t(s.label)}</span>
                </Link>
                {i < flow.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />}
              </li>
            ))}
          </ol>
        </section>
      )}

      {CHART_APPS.has(app.slug) && <AppCharts app={app.slug} title="Analytics" />}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* screens */}
        <section>
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("Screens")}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{items.length}</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {items.map((i) => {
              const stat = home?.tiles?.[i.route];
              return (
                <Link key={i.route} to={i.route}
                  className="group relative flex items-start gap-3.5 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
                  <span aria-hidden className={cn("pointer-events-none absolute -end-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity group-hover:opacity-25", i.color)} />
                  <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform duration-200 group-hover:scale-110", i.color)}><i.icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="truncate font-semibold group-hover:text-primary">{t(i.label)}</span>
                      {stat && stat.value > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{stat.value > 99 ? "99+" : stat.value}</span>}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{t(i.desc)}</span>
                    {stat && <span className="mt-1.5 block text-[11px] text-muted-foreground"><b className="tabular-nums text-foreground">{stat.value.toLocaleString()}</b> {t(stat.label)}</span>}
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 rtl:rotate-180" />
                </Link>
              );
            })}
          </div>
        </section>

        {/* side: attention + help */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" />{t("Needs attention")}</div>
            {!home ? <div className="h-24 animate-pulse rounded-xl bg-muted" /> : alerts.length ? (
              <div className="space-y-1.5">
                {alerts.map((a) => (
                  <Link key={a.key} to={a.to} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60">
                    <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-amber-500/15 px-1.5 text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">{a.n}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium group-hover:text-primary">{t(a.label)}</span><span className="block truncate text-[11px] text-muted-foreground">{a.meta}</span></span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                  </Link>
                ))}
              </div>
            ) : <p className="py-3 text-center text-sm text-muted-foreground">{t("Nothing waiting in this app.")}</p>}
          </section>
          {app.manual && can("/help") && (
            <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-4 shadow-sm">
              <div className="mb-2 text-sm font-semibold">{t("Help for this app")}</div>
              <div className="flex flex-wrap gap-2">
                <Link to={`/help?m=${app.manual}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary/40 hover:text-primary"><BookOpen className="h-3.5 w-3.5" />{t("Manual")}</Link>
                <Link to="/help?tab=guides" className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary/40 hover:text-primary"><PlayCircle className="h-3.5 w-3.5" />{t("Guides & videos")}</Link>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
