import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, BedDouble, CheckCircle2, ChevronRight, ClipboardList, Eye, FileText, Flag, FlaskConical, HandCoins,
  HeartPulse, Inbox, ListTodo, Percent, Pill, Receipt, RefreshCw, Siren, Stethoscope, Syringe, Video, Wallet,
  MessageSquareHeart, ShieldPlus, Banknote, TestTube, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { call, humanizeError, useApi } from "@/lib/api";
import { NAV, type NavItem } from "@/lib/nav";
import { APPS, appHref, itemByRoute } from "@/lib/apps";
import { GlossyIcon, hueOf, ICON_GRADIENT } from "@/components/common/app-icon";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

/** /pw-home — the Desktop (real-estate style home, D-57): glossy app icons per menu group with a hover playbook, what needs
 *  attention, quick links, and a live activity panel. Data: hospital_vvs.api.dashboard.home (only screens the user can open). */
interface Alert { key: string; to: string; label: string; meta: string; n: number; amount?: number | null }
interface Approval { doctype: string; name: string; title: string; amount?: number; state: string; since: string; can_approve: boolean; to: string }
interface Act { doctype: string; name: string; category: string; title: string; amount?: number | null; status: string; owner_name: string; at: string; to: string }
interface Home {
  branch: string; alerts: Alert[]; approvals: Approval[]; activity: Act[]; days: { date: string; count: number }[];
  module_mix: { counts: Record<string, Record<string, number>> }; tiles: Record<string, { value: number; label: string }>;
  stats: { visits_today: number; in_hospital: number; collected_today: number | null; lab_today: number }; todos: { open: number; overdue: number };
}

const rs = (v?: number | null) => (v ? `Rs ${v >= 100000 ? `${(v / 100000).toFixed(1)}L` : Math.round(v).toLocaleString("en-PK")}` : "");
const isoDaysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("en-CA"); };
function ago(iso: string) {
  const t = new Date(String(iso).replace(" ", "T")).getTime();
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}
const dayLabel = (iso: string) => (iso.slice(0, 10) === isoDaysAgo(0) ? "Today" : iso.slice(0, 10) === isoDaysAgo(1) ? "Yesterday" : "Earlier");

/** Per alert: icon, badge gradient, pill — urgent ones get a red bar and come first. */
const ALERT_STYLE: Record<string, { icon: LucideIcon; dot: string; pill: string; tag: string; urgent?: boolean }> = {
  critical: { icon: AlertCircle, dot: "from-rose-500 to-red-600", pill: "bg-rose-500/15 text-rose-600 ring-rose-500/30 dark:text-rose-300", tag: "Critical", urgent: true },
  stale_shifts: { icon: Wallet, dot: "from-red-500 to-rose-600", pill: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-300", tag: "Overdue", urgent: true },
  doses: { icon: Syringe, dot: "from-rose-500 to-pink-600", pill: "bg-rose-500/15 text-rose-600 ring-rose-500/30 dark:text-rose-300", tag: "Overdue", urgent: true },
  er: { icon: Siren, dot: "from-red-500 to-orange-600", pill: "bg-red-500/15 text-red-600 ring-red-500/30 dark:text-red-300", tag: "Triage", urgent: true },
  discounts: { icon: Percent, dot: "from-blue-500 to-indigo-600", pill: "bg-blue-500/15 text-blue-600 ring-blue-500/30 dark:text-blue-300", tag: "Approval", urgent: true },
  closings: { icon: Banknote, dot: "from-indigo-500 to-violet-600", pill: "bg-indigo-500/15 text-indigo-600 ring-indigo-500/30 dark:text-indigo-300", tag: "Approval" },
  drops: { icon: Banknote, dot: "from-cyan-500 to-sky-600", pill: "bg-cyan-500/15 text-cyan-600 ring-cyan-500/30 dark:text-cyan-300", tag: "Confirm" },
  vitals: { icon: HeartPulse, dot: "from-pink-500 to-rose-500", pill: "bg-pink-500/15 text-pink-600 ring-pink-500/30 dark:text-pink-300", tag: "Waiting" },
  waiting: { icon: Stethoscope, dot: "from-amber-400 to-orange-500", pill: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300", tag: "Waiting" },
  verify: { icon: FlaskConical, dot: "from-violet-500 to-purple-600", pill: "bg-violet-500/15 text-violet-600 ring-violet-500/30 dark:text-violet-300", tag: "Verify" },
  samples: { icon: TestTube, dot: "from-sky-500 to-blue-600", pill: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-300", tag: "Collect" },
  discharge: { icon: BedDouble, dot: "from-teal-500 to-cyan-600", pill: "bg-teal-500/15 text-teal-600 ring-teal-500/30 dark:text-teal-300", tag: "Pending" },
  preauth: { icon: ShieldPlus, dot: "from-indigo-500 to-blue-600", pill: "bg-indigo-500/15 text-indigo-600 ring-indigo-500/30 dark:text-indigo-300", tag: "Decide" },
  expenses: { icon: Receipt, dot: "from-orange-400 to-rose-500", pill: "bg-orange-500/15 text-orange-600 ring-orange-500/30 dark:text-orange-300", tag: "Approval" },
  pharmacy: { icon: Pill, dot: "from-emerald-500 to-green-600", pill: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300", tag: "In progress" },
  ov: { icon: Video, dot: "from-violet-500 to-fuchsia-600", pill: "bg-violet-500/15 text-violet-600 ring-violet-500/30 dark:text-violet-300", tag: "New" },
  feedback: { icon: MessageSquareHeart, dot: "from-pink-500 to-rose-600", pill: "bg-pink-500/15 text-pink-600 ring-pink-500/30 dark:text-pink-300", tag: "Follow-up" },
};
const alertStyle = (k: string) => ALERT_STYLE[k] ?? { icon: AlertTriangle, dot: "from-slate-500 to-slate-600", pill: "bg-slate-500/15 text-slate-600 ring-slate-500/30", tag: "Info" };

/** Each area's usual flow, shown when hovering its icon; other icons show the rest of their menu group. */
const PLAYBOOKS: Record<string, { title: string; steps: string[] }> = {
  "/registration": { title: "Patient to doctor", steps: ["/registration", "/opd_slip", "/opd/vitals", "/physician-queue", "/pw-prescription"] },
  "/opd_slip": { title: "Slip to prescription", steps: ["/opd_slip", "/opd/vitals", "/physician-queue", "/pw-prescription", "/medicine_invoice"] },
  "/physician-queue": { title: "Token to done", steps: ["/opd/vitals", "/physician-queue", "/pw-prescription", "/pw-history"] },
  "/pw-prescription": { title: "Consultation", steps: ["/physician-queue", "/pw-prescription", "/pw-history", "/lab/orders"] },
  "/lab/orders": { title: "Order to report", steps: ["/lab/orders", "/lab/samples", "/tests", "/lab/verify", "/lab/outsourced"] },
  "/medicine_invoice": { title: "Bill to handover", steps: ["/medicine_invoice", "/pharmacy/pick", "/pharmacy/review", "/pharmacy/dispense", "/pharmacy/reports"] },
  "/ipd": { title: "Admission to discharge", steps: ["/ward", "/ipd", "/ipd/mar", "/ipd/kitchen", "/ipd_slip", "/ipd_report"] },
  "/er": { title: "Arrival to disposition", steps: ["/er", "/ward", "/ipd", "/ipd_slip"] },
  "/counter": { title: "Shift to close", steps: ["/cash/shift", "/counter", "/cash/close", "/cash/approvals"] },
  "/finance": { title: "Money in and out", steps: ["/finance", "/panels", "/claims", "/expenses", "/doctor-share", "/reports"] },
  "/store/receive": { title: "Supplier to shelf", steps: ["/purchase_order", "/store/receive", "/store/transfers", "/store/cycle-count", "/store/returns"] },
};
const ALL_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);
const itemOf = (route: string) => ALL_ITEMS.find((i) => i.route === route);


export default function DesktopPage() {
  const { boot, can, branch } = useAuth();
  const { t } = useTranslation();
  const { data: home, isLoading, isFetching, refetch } = useApi<Home>("dashboard.home", { branch }, { refetchInterval: 60_000 });
  const [tab, setTab] = useState("all");
  const name = boot?.full_name || "there";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const apps = APPS.map((app) => ({ app, items: app.routes.map(itemByRoute).filter((i): i is NavItem => !!i && can(i.route)) })).filter((a) => a.items.length);
  const pending = home?.approvals.length ?? 0;
  const subtitle = !home ? "Loading your day…" : pending ? `${pending} request${pending === 1 ? " is" : "s are"} waiting for your approval.`
    : home.alerts.length ? `${home.alerts.length} thing${home.alerts.length === 1 ? " needs" : "s need"} attention today.` : "Everything is up to date.";

  return (
    <div className="flex flex-wrap items-start gap-6">
      <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-300 via-teal-500 to-emerald-600 text-lg font-black text-white shadow-lg shadow-teal-900/30">
              <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/30" />V</span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t(greet)}, {name.split(" ")[0]}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{branch} · {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}><RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh</Button>
          </div>
        </div>

        <span id="all-modules" className="-mb-6 block scroll-mt-20" />
        <div>
          <SectionTitle count={apps.length}>{t("Apps")}</SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-x-2 gap-y-5 sm:grid-cols-[repeat(auto-fill,128px)]">
            {apps.map(({ app, items }) => {
              const total = items.reduce((n, i) => n + (home?.tiles?.[i.route]?.value ?? 0), 0);
              const tile: NavItem = { route: appHref(app, items.map((i) => i.route)), label: app.label, icon: app.icon, color: app.color, desc: app.desc };
              return <AppTile key={app.slug} item={tile} stat={total ? { value: total, label: items.length === 1 ? (home?.tiles?.[items[0].route]?.label ?? "") : "open items" } : undefined}
                siblings={items} screens={items.length} />;
            })}
          </div>
        </div>

        <NeedsAttention alerts={home?.alerts} loading={isLoading} />
      </main>
      <ActivityPanel home={home} loading={isLoading} tab={tab} setTab={setTab} onChanged={() => void refetch()} />
    </div>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      {count !== undefined && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">{count}</span>}
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}


function AppTile({ item, stat, siblings, screens }: { item: NavItem; stat?: { value: number; label: string }; siblings: NavItem[]; screens?: number }) {
  const { can } = useAuth();
  const { t } = useTranslation();
  const hue = hueOf(item.color);
  const curated = screens ? undefined : PLAYBOOKS[item.route];
  const steps = (curated ? curated.steps.map(itemOf).filter((x): x is NavItem => !!x) : siblings.filter((s) => s.route !== item.route).slice(0, screens ? 9 : 5)).filter((s) => can(s.route));
  const title = curated?.title ?? item.desc;
  const [align, setAlign] = useState<"center" | "start" | "end">("center");
  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect(), box = (el.closest("main") ?? document.body).getBoundingClientRect(), mid = r.left + r.width / 2;
    setAlign(mid - 160 < box.left + 8 ? "start" : mid + 160 > box.right - 8 ? "end" : "center");
  };
  return (
    <div className="group/tile relative" onMouseEnter={(e) => place(e.currentTarget)} onFocus={(e) => place(e.currentTarget)}>
      <Link to={item.route} className="group flex w-full flex-col items-center gap-1.5 rounded-2xl p-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-primary">
        <GlossyIcon icon={item.icon} hue={hue} badge={stat && stat.value > 0 ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow ring-2 ring-background">{stat.value > 99 ? "99+" : stat.value}</span> : undefined} />
        <span className="w-full truncate text-[13px] font-semibold leading-tight">{t(item.label)}</span>
        {stat ? <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground"><span className="font-semibold tabular-nums text-foreground">{stat.value.toLocaleString()}</span> {stat.label}</span>
          : <span className="-mt-1 w-full truncate text-[10px] text-muted-foreground">{item.desc}</span>}
      </Link>
      {steps.length > 0 && (
        <div className={cn("invisible absolute top-full z-30 w-80 translate-y-1 pt-2 opacity-0 transition-all delay-150 duration-200 group-hover/tile:visible group-hover/tile:translate-y-0 group-hover/tile:opacity-100 group-focus-within/tile:visible group-focus-within/tile:opacity-100",
          align === "start" ? "start-0" : align === "end" ? "end-0" : "left-1/2 -translate-x-1/2")}>
          <div className="relative overflow-hidden rounded-2xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur">
            <div className={cn("relative overflow-hidden bg-gradient-to-br px-4 py-3 text-white", ICON_GRADIENT[hue] ?? ICON_GRADIENT.slate)}>
              <span aria-hidden className="pointer-events-none absolute -end-6 -top-10 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-inner ring-1 ring-inset ring-white/30"><item.icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold leading-tight">{item.label}</div><div className="truncate text-[11px] text-white/80">{title}</div></div>
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ring-white/30">{screens ? `${screens} ${t(screens === 1 ? "screen" : "screens")}` : `${steps.length} steps`}</span>
              </div>
            </div>
            <ol className="relative p-2">
              {steps.map((st, i) => {
                const last = i === steps.length - 1;
                return (
                  <li key={st.route} className="relative">
                    {!last && <span aria-hidden className="absolute start-[23px] top-9 h-[calc(100%-22px)] w-px bg-gradient-to-b from-border to-border/30" />}
                    <Link to={st.route} className="group/step flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/70">
                      <span className={cn("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white shadow-md ring-2 ring-popover transition-transform group-hover/step:scale-110", ICON_GRADIENT[hue] ?? ICON_GRADIENT.slate)}>
                        {screens ? <st.icon className="h-3.5 w-3.5" /> : last ? <Flag className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold leading-tight group-hover/step:text-primary">{st.label}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{st.desc}</span></span>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover/step:bg-primary/10 group-hover/step:text-primary"><st.icon className="h-3.5 w-3.5" /></span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />
                    </Link>
                  </li>
                );
              })}
            </ol>
            <Link to={item.route} className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-primary">
              {t("Open")} {t(item.label)} <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NeedsAttention({ alerts, loading }: { alerts?: Alert[]; loading: boolean }) {
  const [all, setAll] = useState(false);
  const sorted = [...(alerts ?? [])].sort((a, b) => Number(!!alertStyle(b.key).urgent) - Number(!!alertStyle(a.key).urgent));
  const shown = all ? sorted : sorted.slice(0, 6);
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-lg shadow-sky-500/30 ring-1 ring-inset ring-white/20">
          <Activity className="h-5 w-5" />
          {sorted.some((a) => alertStyle(a.key).urgent) && <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500 ring-2 ring-card" />}
        </span>
        <div className="min-w-0"><h2 className="text-lg font-semibold leading-tight">Needs Attention</h2>
          <p className="truncate text-xs text-muted-foreground">{loading ? "Checking your day…" : sorted.length ? `${sorted.length} thing${sorted.length === 1 ? "" : "s"} waiting on you` : "Nothing waiting — all clear"}</p></div>
        {sorted.length > 6 && <button type="button" onClick={() => setAll((v) => !v)} className="ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary">
          {all ? "Show less" : `View all ${sorted.length}`} <ArrowRight className={cn("h-3.5 w-3.5 transition-transform", all && "-rotate-90")} /></button>}
      </div>
      {loading ? <Skeleton className="h-64 rounded-xl" /> : !sorted.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-sm text-muted-foreground"><CheckCircle2 className="h-8 w-8 text-emerald-500" /> Everything is up to date.</div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/40">
          {shown.map((a) => {
            const st = alertStyle(a.key);
            return (
              <li key={a.key} className="relative">
                {st.urgent && <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-rose-500 to-red-600" />}
                <Link to={a.to} className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/50">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-md ring-1 ring-inset ring-white/20", st.dot)}><st.icon className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold group-hover:text-primary">{a.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.meta}{a.amount ? ` · ${rs(a.amount)}` : ""}</span></span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground"><b className="text-sm tabular-nums text-foreground">{a.n}</b> {a.n === 1 ? "item" : "items"}</span>
                    <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", st.pill)}>{st.tag}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}


// ------------------------------------------------------------------ right panel
const CATEGORY: Record<string, string> = { opd: "OPD", lab: "Lab", ipd: "IPD & ER", finance: "Finance" };
const CAT_GRADIENT: Record<string, string> = { opd: "from-teal-500 to-cyan-600", lab: "from-violet-500 to-purple-600", ipd: "from-sky-500 to-blue-600", finance: "from-rose-500 to-red-600" };
const DOC_ICON: Record<string, LucideIcon> = { "OPD Slip": ClipboardList, Prescription: Stethoscope, "Test Invoice": FlaskConical, "Bed Allotment": BedDouble, "ER Visit": Siren, Expense: Receipt };
const MODULE_STYLE: Record<string, { g: string; icon: LucideIcon }> = {
  OPD: { g: "from-teal-400 to-cyan-600", icon: Stethoscope }, Lab: { g: "from-violet-400 to-purple-600", icon: FlaskConical }, IPD: { g: "from-sky-400 to-blue-600", icon: BedDouble },
  ER: { g: "from-red-400 to-orange-600", icon: Siren }, Pharmacy: { g: "from-emerald-400 to-green-600", icon: Pill }, Finance: { g: "from-pink-400 to-rose-600", icon: HandCoins },
  Appointments: { g: "from-indigo-400 to-violet-600", icon: ListTodo },
};
const statusPill = (s: string) => /cancel|reject|overdue|unpaid|expired|lama/i.test(s) ? "bg-rose-500/15 text-rose-600 ring-rose-500/30 dark:text-rose-300"
  : /draft|pending|open|waiting|ordered|requested|progress/i.test(s) ? "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300"
    : /paid|complete|submitted|approved|released|discharged|disposed|signed|admitted/i.test(s) ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300"
      : "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-300";

function ActivityPanel({ home, loading, tab, setTab, onChanged }: { home?: Home; loading: boolean; tab: string; setTab: (t: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (loading) return <aside className="w-full flex-[1_1_340px] xl:max-w-[400px]"><Skeleton className="h-[640px] rounded-2xl" /></aside>;
  if (!home) return null;
  const week = home.days, today = isoDaysAgo(0), peak = Math.max(...week.map((d) => d.count), 0);
  const dayName = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
  const total = week.reduce((a, d) => a + d.count, 0);
  const cats = Object.keys(CATEGORY).filter((c) => home.activity.some((a) => a.category === c));
  const tabs = [{ key: "all", label: "All" }, ...(home.approvals.length ? [{ key: "approvals", label: `Approvals ${home.approvals.length}` }] : []), ...cats.map((c) => ({ key: c, label: CATEGORY[c] }))];
  const feed = tab === "approvals" ? [] : home.activity.filter((a) => tab === "all" || a.category === tab);
  const days = ["Today", "Yesterday", "Earlier"].map((label) => ({ label, items: feed.filter((a) => dayLabel(a.at) === label) })).filter((d) => d.items.length);
  const approve = async (a: Approval) => {
    setBusy(a.name);
    try { await call("billing.decide", { name: a.name, approve: 1, note: "Approved from the Desktop" }); toast.success(`${a.name} approved`); onChanged(); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(null); }
  };
  const s = home.stats;
  return (
    <aside className="w-full flex-[1_1_340px] xl:sticky xl:top-20 xl:max-w-[400px]">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div aria-hidden className="pointer-events-none absolute -end-16 -top-20 h-48 w-48 rounded-full bg-teal-500/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -start-20 top-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative space-y-4 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-700 text-white shadow-lg shadow-teal-500/30 ring-1 ring-inset ring-white/20"><Activity className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h2 className="text-lg font-semibold leading-tight">Recent Activity</h2><p className="truncate text-xs text-muted-foreground">Latest updates from the hospital</p></div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>Live</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <PanelTile href="/desk/todo" icon={ListTodo} g="from-violet-500 to-purple-600 shadow-violet-500/30" label="To-dos" count={home.todos.open} sub={home.todos.overdue ? `${home.todos.overdue} overdue` : "none overdue"} warn={home.todos.overdue > 0} />
            <PanelTile to={home.approvals[0]?.to ?? "/billing/discount-approvals"} icon={Inbox} g="from-amber-400 to-orange-500 shadow-amber-500/30" label="Approvals" count={home.approvals.length} sub={home.approvals.length ? "waiting for you" : "all clear"} warn={home.approvals.length > 0} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[{ v: String(s.visits_today), l: "OPD today", c: "text-foreground", g: "from-teal-500/15" }, { v: String(s.in_hospital), l: "In hospital", c: "text-sky-600 dark:text-sky-400", g: "from-sky-500/15" },
              s.collected_today != null ? { v: rs(s.collected_today) || "0", l: "Collected today", c: "text-emerald-600 dark:text-emerald-400", g: "from-emerald-500/15" }
                : { v: String(s.lab_today), l: "Lab orders today", c: "text-violet-600 dark:text-violet-400", g: "from-violet-500/15" }].map((x) => (
              <div key={x.l} className={cn("rounded-xl border border-border bg-gradient-to-b to-transparent p-2.5 text-center", x.g)}>
                <div className={cn("text-lg font-bold leading-tight tabular-nums", x.c)}>{x.v}</div><div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{x.l}</div>
              </div>))}
          </div>

          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="mb-2 flex items-baseline justify-between"><span className="text-xs font-semibold">OPD visits · last 7 days</span>
              <span className="text-[11px] text-muted-foreground">{total ? <><b className="tabular-nums text-foreground">{total}</b> visits</> : "None yet"}</span></div>
            <div className="flex h-16 items-end gap-2">
              {week.map((d) => (
                <div key={d.date} className="group/bar relative flex h-full flex-1 flex-col justify-end">
                  <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-foreground px-1 text-[9px] font-semibold tabular-nums text-background opacity-0 group-hover/bar:opacity-100">{d.count}</span>
                  <span title={`${dayName(d.date)} ${d.date} · ${d.count}`} className={cn("w-full rounded-md bg-gradient-to-t", d.date === today ? "from-teal-600 to-emerald-400 shadow-md shadow-teal-500/30" : "from-teal-500/40 to-teal-400/20 group-hover/bar:from-teal-500/70")}
                    style={{ height: `${peak ? Math.max(8, (d.count / peak) * 100) : 8}%` }} />
                </div>))}
            </div>
            <div className="mt-1.5 flex gap-2 text-[10px] text-muted-foreground">{week.map((d) => <span key={d.date} className={cn("flex-1 text-center", d.date === today && "font-semibold text-teal-600 dark:text-teal-400")}>{dayName(d.date)}</span>)}</div>
          </div>

          <ModuleMix counts={home.module_mix.counts} />

          <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 scrollbar-thin">
            {tabs.map((x) => <button key={x.key} type="button" onClick={() => setTab(x.key)} className={cn("shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all", tab === x.key ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>{x.label}</button>)}
          </div>

          <div className="-mx-1 max-h-[560px] space-y-4 overflow-y-auto px-1 scrollbar-thin">
            {(tab === "all" || tab === "approvals") && home.approvals.length > 0 && (
              <div className="space-y-2"><GroupLabel>Waiting for you</GroupLabel>
                {home.approvals.map((a) => (
                  <div key={a.name} className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
                    <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-amber-400 to-orange-500" />
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md"><AlertTriangle className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-semibold">{a.name}</span><span className="shrink-0 text-[10px] text-muted-foreground">{ago(a.since)}</span></div>
                        <div className="truncate text-xs text-muted-foreground">{a.title}{a.amount ? ` · ${rs(a.amount)}` : ""}</div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-500/30 dark:text-amber-300">{a.state}</span>
                          <span className="ms-auto flex gap-1.5">
                            {a.can_approve && a.doctype === "Discount Authorization" && <button type="button" disabled={busy === a.name} onClick={() => void approve(a)}
                              className="inline-flex h-7 items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 px-3 text-xs font-semibold text-white shadow-md disabled:opacity-60">
                              {busy === a.name ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve</button>}
                            <Link to={a.to} className="inline-flex h-7 items-center gap-1 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-3 text-xs font-semibold text-white shadow-md"><Eye className="h-3.5 w-3.5" /> Review</Link>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>))}
              </div>)}
            {days.map((d) => (
              <div key={d.label}><GroupLabel>{d.label}</GroupLabel>
                <ol className="relative mt-1 space-y-1 before:absolute before:bottom-3 before:start-[19px] before:top-3 before:w-px before:bg-gradient-to-b before:from-border before:to-transparent">
                  {d.items.map((a) => { const Icon = DOC_ICON[a.doctype] ?? FileText; return (
                    <li key={`${a.doctype}-${a.name}`}>
                      <Link to={a.to} className="group relative flex items-start gap-3 rounded-xl p-1.5 transition-colors hover:bg-muted/50">
                        <span className={cn("relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-md ring-4 ring-card", CAT_GRADIENT[a.category] ?? "from-slate-400 to-slate-600")}><Icon className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2"><span className="truncate text-[13px] font-semibold group-hover:text-primary">{a.title || a.name}</span><span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{ago(a.at)}</span></span>
                          <span className="block truncate text-[11px] text-muted-foreground">{a.doctype} · {a.name}</span>
                          <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            {a.status && <span className={cn("rounded-md px-1.5 py-px font-semibold ring-1 ring-inset", statusPill(a.status))}>{a.status}</span>}
                            {a.amount ? <span className="font-medium tabular-nums text-foreground">{rs(a.amount)}</span> : null}
                            <span className="ms-auto flex min-w-0 items-center gap-1"><Avatar name={a.owner_name} size="sm" className="!h-4 !w-4 !text-[8px]" /><span className="truncate">{a.owner_name}</span></span>
                          </span>
                        </span>
                      </Link>
                    </li>); })}
                </ol>
              </div>))}
            {!home.approvals.length && !days.length && <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-sm text-muted-foreground"><Activity className="h-7 w-7 opacity-50" /> No activity in the last 7 days.</div>}
          </div>
        </div>
      </div>
    </aside>
  );
}

function PanelTile({ to, href, icon: Icon, g, label, count, sub, warn }: { to?: string; href?: string; icon: LucideIcon; g: string; label: string; count: number; sub: string; warn: boolean }) {
  const inner = (
    <>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md ring-1 ring-inset ring-white/20", g)}><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="flex items-baseline gap-1.5"><span className="text-lg font-bold leading-none tabular-nums">{count}</span><span className="truncate text-[11px] font-medium text-muted-foreground">{label}</span></span>
        <span className={cn("mt-0.5 block truncate text-[10px] font-medium", warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{sub}</span></span>
    </>
  );
  const cls = "group flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-background/50 p-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md";
  return href ? <a href={href} className={cls}>{inner}</a> : <Link to={to ?? "/pw-home"} className={cls}>{inner}</Link>;
}

const PERIODS = [["today", "Today"], ["week", "7 days"], ["month", "30 days"]] as const;
function ModuleMix({ counts }: { counts: Record<string, Record<string, number>> }) {
  const first = PERIODS.find(([p]) => Object.keys(counts[p] ?? {}).length)?.[0] ?? "week";
  const [period, setPeriod] = useState<string | null>(null);
  const active = period ?? first;
  const [hover, setHover] = useState<string | null>(null);
  const rows = Object.entries(counts[active] ?? {}).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, [, n]) => a + n, 0), max = rows[0]?.[1] ?? 0;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div><div className="text-xs font-semibold">Share by module</div><div className="text-[10px] text-muted-foreground">{total ? <><b className="tabular-nums text-foreground">{total.toLocaleString()}</b> records</> : "Nothing yet"}</div></div>
        <div className="flex rounded-lg bg-muted/70 p-0.5">{PERIODS.map(([k, l]) => <button key={k} type="button" onClick={() => setPeriod(k)} className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold", active === k ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>{l}</button>)}</div>
      </div>
      {!total ? <div className="flex h-10 items-center justify-center rounded-full border border-dashed border-border text-[11px] text-muted-foreground">Nothing in this period yet</div> : (
        <>
          <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full bg-muted/60 p-[2px]">
            {rows.map(([m, n]) => <span key={m} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} title={`${m} · ${n} (${pct(n).toFixed(1)}%)`}
              className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", MODULE_STYLE[m]?.g ?? "from-slate-400 to-slate-600", hover && hover !== m && "opacity-35")} style={{ width: `${Math.max(pct(n), 1.5)}%` }} />)}
          </div>
          <ul className="mt-3 space-y-1.5">
            {rows.map(([m, n]) => { const st = MODULE_STYLE[m] ?? { g: "from-slate-400 to-slate-600", icon: FileText }; return (
              <li key={m} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} className={cn("rounded-lg px-1.5 py-1 transition-colors", hover === m && "bg-muted/60")}>
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm", st.g)}><st.icon className="h-3.5 w-3.5" /></span>
                  <span className="w-[84px] shrink-0 truncate text-[11px] font-semibold">{m}</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className={cn("absolute inset-y-0 start-0 rounded-full bg-gradient-to-r", st.g)} style={{ width: `${max ? (n / max) * 100 : 0}%` }} /></span>
                  <span className="w-9 shrink-0 text-end text-[11px] font-semibold tabular-nums">{n.toLocaleString()}</span>
                  <span className="w-9 shrink-0 text-end text-[10px] tabular-nums text-muted-foreground">{pct(n) < 1 ? "<1" : Math.round(pct(n))}%</span>
                </div>
              </li>); })}
          </ul>
        </>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</span><span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" /></div>;
}
