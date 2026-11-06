import { useEffect, useState, type ReactNode } from "react";

/** Reference categorical palette (dataviz skill, validated): fixed order, light / dark steps. Never cycled. */
const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };

export function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function useViz() {
  const dark = useDark();
  return {
    dark,
    series: dark ? DARK : LIGHT,
    grid: dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)",
    axis: dark ? "#9aa7ad" : "#5b6b72",
    surface: dark ? "hsl(198 30% 10%)" : "#ffffff",
    cursor: dark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
  };
}

export const axisProps = (color: string) => ({ tick: { fill: color, fontSize: 11 }, tickLine: false, axisLine: false });

/** Tooltip body: text in text tokens, the swatch carries identity. */
export function TipBox({ title, rows }: { title?: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      {title && <div className="mb-1 font-semibold text-foreground">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-muted-foreground">
          {r.color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />}
          <span className="flex-1">{r.label}</span><span className="font-semibold tabular-nums text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map((i) => <span key={i.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.label}</span>)}
    </div>
  );
}
