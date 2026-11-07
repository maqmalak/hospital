import { useQueryClient } from "@tanstack/react-query";
import { Check, HandCoins, PiggyBank, RotateCcw, UserX, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAction, useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { Empty, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Hero } from "./ShiftPage";
import { rs } from "./shared";

interface A { closings: { name: string; counter: string; branch: string; user_name: string; difference: number; total_expected: number; total_counted: number; explanation?: string; creation: string }[];
  drops: { name: string; counter: string; user_name: string; amount: number; reason: string; creation: string }[] }

export default function ApprovalsPage() {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  const { data } = useApi<A>("cash.approvals", { branch }, { refetchInterval: 20_000 });
  useRealtime(boot?.site, [`hv:shift_closing:${branch}`, `hv:cash_drop:${branch}`], () => void qc.invalidateQueries({ queryKey: ["cash.approvals"] }));
  const decide = useAction("cash.decide", { invalidate: ["cash.approvals"], success: "Decision recorded" });
  const drop = useAction("cash.confirm_drop", { invalidate: ["cash.approvals"], success: "Cash drop updated" });
  return (
    <div className="mx-auto max-w-5xl">
      <Hero title="Cash approvals" sub="Shift closings beyond the tolerance and cash drops waiting for you" />
      <Section title={<span className="flex items-center gap-2"><HandCoins className="h-4 w-4" />Shift closings</span>} className="mb-4">
        {data?.closings.length ? data.closings.map((c) => (
          <div key={c.name} className="mb-3 flex flex-wrap items-center gap-4 rounded-2xl border border-border p-4">
            <div className={cn("flex h-16 w-24 flex-col items-center justify-center rounded-2xl text-white", c.difference < 0 ? "bg-gradient-to-br from-rose-600 to-orange-500" : "bg-gradient-to-br from-sky-600 to-indigo-600")}>
              <span className="text-[10px] uppercase">{c.difference < 0 ? "Short" : "Excess"}</span><span className="text-lg font-black tabular-nums">{rs(Math.abs(c.difference))}</span></div>
            <div className="min-w-0 flex-1"><div className="font-bold">{c.counter} · {c.user_name}</div><div className="text-xs text-muted-foreground">Expected {rs(c.total_expected)} · counted {rs(c.total_counted)} · {c.creation.slice(0, 16)}</div>
              {c.explanation && <div className="mt-1 text-sm">“{c.explanation}”</div>}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="submit" onClick={() => decide.mutate({ name: c.name, action: "approve" })}><Check className="h-4 w-4" />Approve</Button>
              <Button variant="outline" onClick={() => { const n = prompt("What should be recounted?"); if (n !== null) decide.mutate({ name: c.name, action: "recount", note: n }); }}><RotateCcw className="h-4 w-4" />Recount</Button>
              {c.difference < 0 && <Button variant="outline" onClick={() => { const n = prompt("Note for the cashier liability"); if (n !== null) decide.mutate({ name: c.name, action: "liability", note: n }); }}><UserX className="h-4 w-4" />Cashier liability</Button>}
            </div>
          </div>)) : <Empty title="No closings waiting" />}
      </Section>
      <Section title={<span className="flex items-center gap-2"><PiggyBank className="h-4 w-4" />Cash drops to confirm</span>}>
        {data?.drops.length ? data.drops.map((d) => (
          <div key={d.name} className="flex items-center gap-3 border-b border-border/60 py-3 last:border-0">
            <span className="text-xl font-black tabular-nums">{rs(d.amount)}</span><span className="flex-1 text-sm">{d.counter} · {d.user_name} · {d.reason}<div className="text-xs text-muted-foreground">{d.creation.slice(0, 16)}</div></span>
            <Button size="sm" variant="submit" onClick={() => drop.mutate({ name: d.name, accept: 1 })}><Check className="h-4 w-4" />Received</Button>
            <Button size="sm" variant="outline" onClick={() => drop.mutate({ name: d.name, accept: 0 })}><X className="h-4 w-4" /></Button>
          </div>)) : <Empty title="No cash drops waiting" />}
      </Section>
    </div>
  );
}
