/** Hospital shim (D-65): the stat tile the payment-entry insights use (from the sugarcane production panels). */
import type { ReactNode } from "react";
import { Card } from "@/acc/components/ui/card";
import { cn } from "@/acc/utils/cn";

export function Tile({ icon, label, value, sub, tone = "primary" }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: "primary" | "emerald" | "amber" | "rose" | "sky" | "violet" }) {
  const tones = {
    primary: "bg-primary/10 text-primary", emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400", sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400", violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tones[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-bold tabular-nums">{value}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}
