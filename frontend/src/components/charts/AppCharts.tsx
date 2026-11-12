/**
 * Animated app charts (D-68): the charts of one app (hospital_vvs.api.analytics.app_charts) as cards — used on the Dashboard's
 * App analytics tabs and on each app home.
 *
 * Built to the dataviz rules: the validated categorical palette in fixed order (lib/viz), one axis, thin marks with 4 px rounded
 * data ends and a 2 px surface gap between stacked segments, 2 px lines, recessive grid / axes, a legend for 2+ series, direct
 * value labels on horizontal bars only, text in text tokens. Every chart has a hover tooltip and a table view (the light palette's
 * 3rd / 4th slots are below 3:1 contrast, so the table is the required relief). Cards fade / rise in as they scroll into view and
 * the marks grow in, staggered; prefers-reduced-motion turns all of it off. Responsive: one to three columns.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { axisProps, Legend, TipBox, useViz } from "@/lib/viz";
import { cn } from "@/utils/cn";

export interface ChartSpec {
  id: string; title: string; sub: string; kind: "area" | "line" | "bar" | "stack" | "hbar"; x: string; unit: "count" | "rs" | "min";
  series: { key: string; label: string }[]; data: Record<string, string | number>[];
}
interface Resp { app: string; days: number; from: string; to: string; charts: ChartSpec[] }

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const compact = (v: number) => {
  const a = Math.abs(v);
  return a >= 1e7 ? `${(v / 1e7).toFixed(1)} Cr` : a >= 1e5 ? `${(v / 1e5).toFixed(1)} L` : a >= 1e3 ? `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : `${Math.round(v * 10) / 10}`;
};
export const fmt = (unit: ChartSpec["unit"], v: number, full = false) =>
  unit === "rs" ? `Rs ${full ? Math.round(v).toLocaleString("en-PK") : compact(v)}` : unit === "min" ? `${Math.round(v)} min` : full ? Math.round(v).toLocaleString() : compact(v);
const tick = (x: string, v: string | number) => {
  const s = String(v);
  if (x === "date" && /^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (x === "month" && /^\d{4}-\d{2}$/.test(s)) return new Date(`${s}-01T00:00`).toLocaleDateString(undefined, { month: "short" });
  return s.length > 20 ? `${s.slice(0, 19)}…` : s;
};

/** Fade / rise in once the card scrolls into view. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(reduced());
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return { ref, shown };
}

export function AnimatedChart({ spec, index = 0, height = 240 }: { spec: ChartSpec; index?: number; height?: number }) {
  const { t } = useTranslation();
  const v = useViz();
  const { ref, shown } = useReveal<HTMLDivElement>();
  const [table, setTable] = useState(false);
  const anim = { isAnimationActive: shown && !reduced(), animationBegin: 120 + index * 90, animationDuration: 900, animationEasing: "ease-out" as const };
  const colors = spec.series.map((_s, i) => v.series[i % v.series.length]);  // fixed order; at most 4 series per chart
  const empty = !spec.data.length || spec.data.every((r) => spec.series.every((s) => !Number(r[s.key])));
  const total = spec.series.length === 1 ? spec.data.reduce((n, r) => n + (Number(r[spec.series[0].key]) || 0), 0) : null;
  const tip = ({ active, payload, label }: TooltipProps<number, string>) =>
    active && payload?.length ? (
      <TipBox title={tick(spec.x, String(label ?? ""))} rows={payload.map((p) => ({
        label: t(spec.series.find((s) => s.key === p.dataKey)?.label ?? String(p.dataKey)), value: fmt(spec.unit, Number(p.value) || 0, true),
        color: colors[spec.series.findIndex((s) => s.key === p.dataKey)],
      }))} />
    ) : null;
  const common = { data: spec.data, margin: { top: 8, right: 12, left: 0, bottom: 0 } };
  const xAxis = <XAxis dataKey={spec.x} {...axisProps(v.axis)} tickFormatter={(x) => tick(spec.x, x)} minTickGap={16} />;
  const yAxis = <YAxis {...axisProps(v.axis)} width={48} tickFormatter={(x: number) => (spec.unit === "min" ? `${Math.round(x)}` : compact(x))} allowDecimals={false} />;
  const grid = <CartesianGrid stroke={v.grid} vertical={false} />;
  const cursor = { fill: v.cursor, stroke: v.axis, strokeWidth: 1, strokeDasharray: "3 3" };

  let chart: React.ReactNode = null;
  if (spec.kind === "area") {
    chart = (
      <AreaChart {...common}>
        <defs>{spec.series.map((s, i) => (
          <linearGradient key={s.key} id={`g-${spec.id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors[i]} stopOpacity={0.28} /><stop offset="100%" stopColor={colors[i]} stopOpacity={0.02} />
          </linearGradient>))}</defs>
        {grid}{xAxis}{yAxis}
        <Tooltip content={tip} cursor={{ stroke: v.axis, strokeWidth: 1, strokeDasharray: "3 3" }} />
        {spec.series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} stroke={colors[i]} strokeWidth={2} fill={`url(#g-${spec.id}-${s.key})`}
          activeDot={{ r: 5, stroke: v.surface, strokeWidth: 2 }} dot={false} {...anim} />)}
      </AreaChart>
    );
  } else if (spec.kind === "line") {
    chart = (
      <LineChart {...common}>
        {grid}{xAxis}{yAxis}
        <Tooltip content={tip} cursor={{ stroke: v.axis, strokeWidth: 1, strokeDasharray: "3 3" }} />
        {spec.series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} stroke={colors[i]} strokeWidth={2} dot={false}
          activeDot={{ r: 5, stroke: v.surface, strokeWidth: 2 }} {...anim} animationBegin={anim.animationBegin + i * 120} />)}
      </LineChart>
    );
  } else if (spec.kind === "hbar") {
    const s = spec.series[0];
    chart = (
      <BarChart {...common} layout="vertical" margin={{ top: 4, right: 72, left: 4, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey={spec.x} {...axisProps(v.axis)} width={136} interval={0}
          tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
            <text x={x - 4} y={y} dy={4} textAnchor="end" fill={v.axis} fontSize={11}><title>{payload.value}</title>{tick("label", payload.value).slice(0, 20)}</text>)} />
        <Tooltip content={tip} cursor={cursor} />
        <Bar dataKey={s.key} fill={colors[0]} radius={[0, 4, 4, 0]} maxBarSize={18} {...anim}>
          <LabelList dataKey={s.key} content={({ x, y, width, height, value }) => {
            const nx = Number(x), w = Number(width), neg = Number(value) < 0;
            // negative bars grow left of the zero line, so their label sits just right of it (clear of the category names)
            return <text x={neg ? nx + 6 : nx + w + 6} y={Number(y) + Number(height) / 2} dy={4} textAnchor="start" fill={v.axis} fontSize={11}>{fmt(spec.unit, Number(value))}</text>;
          }} />
        </Bar>
      </BarChart>
    );
  } else {
    const stacked = spec.kind === "stack";
    chart = (
      <BarChart {...common} barGap={2}>
        {grid}{xAxis}{yAxis}
        <Tooltip content={tip} cursor={cursor} />
        {spec.series.map((s, i) => <Bar key={s.key} dataKey={s.key} fill={colors[i]} stackId={stacked ? "a" : undefined} maxBarSize={stacked ? 22 : 18}
          radius={stacked ? (i === spec.series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
          stroke={stacked ? v.surface : undefined} strokeWidth={stacked ? 2 : 0} {...anim} animationBegin={anim.animationBegin + i * 120} />)}
      </BarChart>
    );
  }

  return (
    <div ref={ref} className={cn("flex flex-col rounded-2xl border border-border bg-card shadow-sm transition-all duration-700 ease-out motion-reduce:transition-none",
      shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0")} style={{ transitionDelay: shown ? `${index * 70}ms` : "0ms" }}>
      <header className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold tracking-tight">{t(spec.title)}</h3>
          <p className="truncate text-xs text-muted-foreground">{t(spec.sub)}{total !== null && <> · <b className="tabular-nums text-foreground">{fmt(spec.unit, total, true)}</b> {t("total")}</>}</p>
        </div>
        <button type="button" onClick={() => setTable((x) => !x)} aria-pressed={table} title={table ? t("Show chart") : t("Show table")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          {table ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
        </button>
      </header>
      {spec.series.length > 1 && !table && <div className="px-4 pt-2"><Legend items={spec.series.map((s, i) => ({ label: t(s.label), color: colors[i] }))} /></div>}
      <div className="px-2 pb-3 pt-2" style={{ height: table ? undefined : height }}>
        {empty ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">{t("No data in this period.")}</div>
        ) : table ? (
          <div className="max-h-[260px] overflow-auto px-2">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card"><tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 text-start font-medium">{spec.x === "date" ? t("Date") : spec.x === "month" ? t("Month") : ""}</th>
                {spec.series.map((s) => <th key={s.key} className="py-1.5 text-end font-medium">{t(s.label)}</th>)}</tr></thead>
              <tbody>{spec.data.map((r, i) => (
                <tr key={i} className="border-b border-border/50"><td className="py-1">{tick(spec.x, r[spec.x])}</td>
                  {spec.series.map((s) => <td key={s.key} className="py-1 text-end tabular-nums">{fmt(spec.unit, Number(r[s.key]) || 0, true)}</td>)}</tr>))}</tbody>
            </table>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">{chart as React.ReactElement}</ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** All charts of one app, with a 7 / 14 / 30-day range. */
export function AppCharts({ app, title }: { app: string; title?: string }) {
  const { branch } = useAuth();
  const { t } = useTranslation();
  const [days, setDays] = useState(14);
  const { data, isLoading, error } = useApi<Resp>("analytics.app_charts", { app, branch, days }, { refetchInterval: 120_000 });
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {title && <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t(title)}</h2>}
        <span className="h-px flex-1 bg-border" aria-hidden />
        <div className="inline-flex rounded-xl border border-border bg-card p-0.5 text-xs" role="group" aria-label={t("Period")}>
          {[7, 14, 30].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              className={cn("rounded-lg px-2.5 py-1 font-semibold transition-colors", days === d ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
              {d} {t("days")}</button>))}
        </div>
      </div>
      {error ? <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("Charts are not available for your role.")}</p>
        : isLoading || !data ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-[300px] animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {data.charts.map((c, i) => <AnimatedChart key={`${c.id}-${days}`} spec={c} index={i} />)}
          </div>
        )}
    </section>
  );
}
