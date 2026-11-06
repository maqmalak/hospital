import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Percent, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { useAction, useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { Empty, PageHeader, Pill, Section, Tabs } from "@/components/common";
import { Button } from "@/components/ui/button";

interface DA { name: string; billing_type: string; branch: string; patient?: string; gross_amount: number; discount_percent: number; discount_amount: number; reason: string; status: string; requested_by: string; approved_by?: string; creation: string; decision_note?: string }

export default function DiscountApprovalsPage() {
  const { boot, branch } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"Pending" | "Approved" | "Rejected" | "">("Pending");
  const { data = [] } = useApi<DA[]>("billing.discount_requests", { status }, { refetchInterval: 20_000 });
  useRealtime(boot?.site, [`hv:discount_request:${branch}`], (d) => { toast(`Discount request ${(d as { name: string }).name}`, { icon: "🔔" }); void qc.invalidateQueries({ queryKey: ["billing.discount_requests"] }); });
  const decide = useAction("billing.decide", { invalidate: ["billing.discount_requests"], success: "Decision sent to the counter" });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Discount approvals" icon={Percent} color="from-orange-500 to-amber-500" subtitle="Requests above the cashier's limit. The counter sees your decision immediately." />
      <div className="mb-3"><Tabs value={status} onChange={setStatus} tabs={[{ key: "Pending", label: "Pending" }, { key: "Approved", label: "Approved" }, { key: "Rejected", label: "Rejected" }, { key: "", label: "All" }]} /></div>
      <div className="space-y-3">
        {data.map((d) => (
          <Section key={d.name}>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white"><span className="text-lg font-extrabold">{Math.round(d.discount_percent)}%</span></div>
              <div className="min-w-0 flex-1"><div className="font-bold">Rs {d.discount_amount.toLocaleString()} <span className="font-normal text-muted-foreground">of Rs {d.gross_amount.toLocaleString()} · {d.billing_type}</span></div>
                <div className="text-sm">{d.reason}</div><div className="text-xs text-muted-foreground">{d.requested_by} · {d.creation.slice(0, 16)} · {d.branch} {d.patient && `· ${d.patient}`}</div>
                {d.approved_by && <div className="text-xs text-muted-foreground">by {d.approved_by} {d.decision_note && `— ${d.decision_note}`}</div>}</div>
              <Pill value={d.status} />
              {d.status === "Pending" && <div className="flex gap-2">
                <Button variant="submit" onClick={() => decide.mutate({ name: d.name, approve: 1 })}><Check className="h-4 w-4" />{t("Approve")}</Button>
                <Button variant="outline" onClick={() => { const n = prompt("Reason for rejecting"); if (n !== null) decide.mutate({ name: d.name, approve: 0, note: n }); }}><X className="h-4 w-4" />{t("Reject")}</Button></div>}
            </div>
          </Section>))}
        {!data.length && <Empty title="Nothing waiting" hint="New requests appear here in real time." icon={Percent} />}
      </div>
    </div>
  );
}
