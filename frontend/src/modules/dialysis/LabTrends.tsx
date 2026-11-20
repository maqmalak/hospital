/** Renal lab trends from the Lab module (D-99): small multiples, one series each (aqua line, 2px), the normal range as a soft band,
 *  out-of-range points ringed in red with the value in text, hover tooltip. Used by the dialysis profile and the CKD clinic. */
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, TipBox, useViz } from "@/lib/viz";

export interface Pt { d: string; v: number; unit?: string; flag?: string; lo?: number | null; hi?: number | null }
export interface Trends { series: Record<string, Pt[]>; keys: { key: string; label: string }[] }

export function LabTrends({ data, only, height = 150 }: { data?: Trends; only?: string[]; height?: number }) {
  const v = useViz();
  const aqua = v.dark ? "#38bdf8" : "#0284c7";
  const keys = (data?.keys ?? []).filter((k) => (!only || only.includes(k.key)) && (data?.series[k.key]?.length ?? 0) > 0);
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!keys.length) return <p className="text-sm text-muted-foreground">No renal results in the Lab module yet.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {keys.map((k) => {
        const s = data.series[k.key].map((p) => ({ ...p, x: p.d.slice(5) }));
        const last = s[s.length - 1];
        const lo = last.lo ?? undefined, hi = last.hi ?? undefined;
        const out = (p: Pt) => (lo != null && p.v < lo) || (hi != null && p.v > hi);
        return (
          <div key={k.key} className="rounded-xl border border-border p-3">
            <div className="mb-1 flex items-baseline justify-between gap-2"><span className="text-sm font-semibold">{k.label}</span>
              <span className={`text-sm font-bold tabular-nums ${out(last) ? "text-rose-600 dark:text-rose-400" : ""}`}>{last.v}{last.unit ? ` ${last.unit}` : ""}{out(last) ? (last.v < (lo ?? 0) ? " ↓" : " ↑") : ""}</span></div>
            <ResponsiveContainer width="100%" height={height}>
              <LineChart data={s} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke={v.grid} />
                {(lo != null || hi != null) && <ReferenceArea y1={lo ?? undefined} y2={hi ?? undefined} fill={aqua} fillOpacity={0.08} stroke="none" />}
                <XAxis dataKey="x" {...axisProps(v.axis)} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...axisProps(v.axis)} width={40} domain={["auto", "auto"]} />
                <Tooltip cursor={{ stroke: v.axis, strokeDasharray: "3 3" }} content={({ active, payload }) => active && payload?.length
                  ? <TipBox title={String((payload[0].payload as Pt).d)} rows={[{ label: k.label, value: `${(payload[0].payload as Pt).v}${last.unit ? ` ${last.unit}` : ""}`, color: aqua }]} /> : null} />
                <Line type="monotone" dataKey="v" stroke={aqua} strokeWidth={2} isAnimationActive={false}
                  dot={(p: { cx?: number; cy?: number; payload?: Pt; index?: number }) => <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload && out(p.payload) ? 4.5 : 3} fill={p.payload && out(p.payload) ? "#dc2626" : aqua} stroke={v.surface} strokeWidth={2} />} />
              </LineChart>
            </ResponsiveContainer>
            <div className="text-[10px] text-muted-foreground">{s.length} result{s.length > 1 ? "s" : ""}{lo != null || hi != null ? ` · normal ${lo ?? ""}–${hi ?? ""}` : ""}{last.flag === "calc" ? " · eGFR calculated (CKD-EPI 2021)" : ""}</div>
          </div>
        );
      })}
    </div>
  );
}
