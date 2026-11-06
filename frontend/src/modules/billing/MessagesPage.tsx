import { useState } from "react";
import { MessagesSquare, RotateCcw } from "lucide-react";
import { useAction, useApi } from "@/lib/api";
import { Empty, inputCls, PageHeader, Pill, Section, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";

interface Row { name: string; patient?: string; phone: string; channel: string; event?: string; language?: string; status: string; retry_count: number; error?: string; reference_doctype?: string; reference_name?: string; creation: string; body?: string }

export default function MessagesPage() {
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [phone, setPhone] = useState("");
  const { data } = useApi<{ rows: Row[]; stats: { status: string; channel: string; n: number }[] }>("messaging.log", { status, channel, phone }, { refetchInterval: 30_000 });
  const resend = useAction("messaging.resend", { invalidate: ["messaging.log"], success: "Queued again" });
  const s = data?.stats ?? [];
  const sum = (f: (x: { status: string }) => boolean) => s.filter(f).reduce((a, x) => a + x.n, 0);
  const total = sum(() => true);
  const ok = sum((x) => ["Sent", "Delivered", "Read"].includes(x.status));
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Message log" icon={MessagesSquare} color="from-green-600 to-teal-600" subtitle="WhatsApp and SMS to patients — no medical data is ever included" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Sent · 7 days" value={ok} tone="teal" /><StatCard label="Failed" value={sum((x) => x.status === "Failed")} tone="rose" />
        <StatCard label="Skipped (no consent / off)" value={sum((x) => x.status === "Skipped")} tone="slate" /><StatCard label="Success rate" value={`${total ? Math.round((ok * 100) / Math.max(total - sum((x) => x.status === "Skipped"), 1)) : 0}%`} tone="blue" />
      </div>
      <Section>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{["Queued", "Sent", "Delivered", "Read", "Failed", "Skipped"].map((x) => <option key={x}>{x}</option>)}</select>
          <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All channels</option><option>WhatsApp</option><option>SMS</option></select>
          <input className={inputCls} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {data?.rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">When</th><th className="text-start">Phone</th><th className="text-start">Event</th><th className="text-start">Channel</th><th className="text-start">Status</th><th className="text-start">Text</th><th /></tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.name} className="border-b border-border/60 align-top">
              <td className="py-2 text-xs tabular-nums">{r.creation.slice(5, 16)}</td><td className="text-xs">{r.phone}<div className="text-muted-foreground">{r.patient}</div></td>
              <td className="text-xs">{r.event || "free text"}<div className="text-muted-foreground">{r.reference_doctype} {r.reference_name}</div></td><td><Pill value={r.channel} /></td>
              <td><Pill value={r.status} />{r.error && <div className="max-w-[180px] text-[11px] text-rose-600">{r.error}</div>}</td>
              <td className="max-w-sm text-xs text-muted-foreground">{r.body}</td>
              <td>{["Failed", "Skipped"].includes(r.status) && <Button size="xs" variant="outline" onClick={() => resend.mutate({ name: r.name })}><RotateCcw className="h-3 w-3" />Resend</Button>}</td>
            </tr>))}</tbody></table></div> : <Empty title="No messages" />}
      </Section>
    </div>
  );
}
