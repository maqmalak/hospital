/** Hospital shim (D-65): the one helper the ported charts use from the sugarcane analytics kit — a legend whose items show / hide series. */
import { cloneElement, useState, type ReactElement } from "react";
import { Legend } from "recharts";
import { cn } from "@/acc/utils/cn";

type LegendItem = { dataKey?: unknown; value?: string; color?: string };

export function ToggleLegend({ payload, hidden, onToggle }: { payload?: LegendItem[]; hidden: Set<string>; onToggle: (k: string) => void }) {
  const items = (payload ?? []).filter((p) => p.dataKey !== undefined);
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-xs">
      {items.map((p) => {
        const k = String(p.dataKey), off = hidden.has(k);
        return (
          <button key={k} type="button" onClick={() => onToggle(k)} aria-pressed={!off} title={off ? "Show" : "Hide"}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 transition", off ? "border-dashed text-muted-foreground line-through opacity-60" : "bg-card shadow-sm hover:border-primary/40")}>
            <span className="size-2.5 rounded-full" style={{ background: off ? "transparent" : p.color, boxShadow: off ? `inset 0 0 0 1.5px ${p.color}` : undefined }} />
            {p.value}
          </button>
        );
      })}
    </div>
  );
}

export function useLegendToggle() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setHidden((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return {
    hidden,
    toggle,
    legend: <Legend content={<ToggleLegend hidden={hidden} onToggle={toggle} />} />,
    series: (els: ReactElement<{ dataKey?: unknown; hide?: boolean }>[]) =>
      els.map((el, i) => cloneElement(el, { key: el.key ?? String(el.props.dataKey ?? i), hide: hidden.has(String(el.props.dataKey)) })),
  };
}
