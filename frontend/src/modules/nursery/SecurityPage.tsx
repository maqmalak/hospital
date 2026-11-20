/** Infant security log (D-95): tag on/off, in/out of ward, band match at each hand-over, alarms — for nurses and security staff. */
import { useState } from "react";
import { Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { call, useApi } from "@/lib/api";
import { humanizeError } from "@/services/frappe";
import { Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { useNurseryLive } from "./shared";

interface Ev { name: string; newborn: string; baby_name?: string; band_no?: string; unit?: string; event: string; at: string; by_name?: string; staff_id?: string; with_whom?: string; band_match?: number; tag_no?: string; note?: string }
interface Lite { name: string; baby_name: string; band_no: string; tag_no?: string; tag_active: number; unit: string }

export default function SecurityPage() {
  const { data, refetch } = useApi<{ events: Ev[]; babies: Lite[] }>("nursery.security_log", {}, { refetchInterval: 30_000 });
  useNurseryLive(["nursery.security_log"]);
  const [v, setV] = useState({ name: "", event: "Band check at hand-over", with_whom: "", staff_id: "", band_match: true, note: "", tag_no: "" });
  const babies = data?.babies ?? [];
  const ev = data?.events ?? [];
  const sel = babies.find((b) => b.name === v.name);
  const save = async () => { try { await call("nursery.security_event", { ...v, band_match: v.band_match ? 1 : 0 }); toast.success("Logged"); setV({ ...v, with_whom: "", note: "" }); void refetch(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="Infant security log" icon={ShieldCheck} subtitle="Tags, movements in and out of the unit, and band checks at every hand-over (last 7 days)" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Babies in unit" value={babies.length} icon={ShieldCheck} />
        <StatCard label="Without active tag" value={babies.filter((b) => !b.tag_active).length} icon={ShieldAlert} tone="rose" />
        <StatCard label="Band checks (7 d)" value={ev.filter((e) => e.event === "Band check at hand-over").length} icon={Lock} tone="blue" />
        <StatCard label="Alarms (7 d)" value={ev.filter((e) => e.event === "Tag alarm").length} icon={ShieldAlert} tone="amber" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Time</th><th className="text-start">Baby / band</th><th className="text-start">Event</th><th className="text-start">With</th><th className="text-start">Bands</th><th className="text-start">By</th><th className="text-start">Note</th></tr></thead>
            <tbody>{ev.map((e) => <tr key={e.name} className={cn("border-t border-border/60", e.event === "Tag alarm" && "bg-rose-50 dark:bg-rose-500/10")}>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums">{e.at.slice(5)}</td><td><b>{e.baby_name}</b><div className="font-mono text-[11px] text-muted-foreground">{e.band_no}</div></td>
              <td className={cn("font-semibold", e.event === "Tag alarm" && "text-rose-600")}>{e.event}</td><td>{e.with_whom}</td>
              <td>{e.event === "Band check at hand-over" ? (e.band_match ? <span className="font-bold text-emerald-600">✓</span> : <span className="font-bold text-rose-600">✗ NO MATCH</span>) : ""}</td>
              <td className="text-xs">{e.staff_id ? `${e.staff_id} · ` : ""}{e.by_name}</td><td className="text-xs">{e.note}</td></tr>)}</tbody></table>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-20 lg:self-start">
          <h3 className="mb-3 text-sm font-bold">Log an event</h3>
          <div className="space-y-3">
            <Field label="Baby"><select className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, tag_no: babies.find((b) => b.name === e.target.value)?.tag_no ?? "" })}><option value="">Choose…</option>
              {babies.map((b) => <option key={b.name} value={b.name}>{b.baby_name} · {b.unit} · {b.band_no}</option>)}</select></Field>
            <Field label="Event"><select className={inputCls} value={v.event} onChange={(e) => setV({ ...v, event: e.target.value })}>{["Band check at hand-over", "Left ward", "Returned to ward", "Tag applied", "Tag removed", "Tag alarm", "Alarm resolved"].map((x) => <option key={x}>{x}</option>)}</select></Field>
            {v.event === "Band check at hand-over" && sel && <label className="flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-sm"><input type="checkbox" checked={v.band_match} onChange={(e) => setV({ ...v, band_match: e.target.checked })} className="h-4 w-4" />Mother's band matches <span className="font-mono">{sel.band_no}</span></label>}
            {v.event === "Tag applied" && <Field label="Tag no."><input className={inputCls} value={v.tag_no} onChange={(e) => setV({ ...v, tag_no: e.target.value })} /></Field>}
            <Field label="Handed to / with"><input className={inputCls} value={v.with_whom} onChange={(e) => setV({ ...v, with_whom: e.target.value })} placeholder="Mother (verified) / Radiology / OT" /></Field>
            <Field label="Staff ID"><input className={inputCls} value={v.staff_id} onChange={(e) => setV({ ...v, staff_id: e.target.value })} /></Field>
            <Field label="Note"><input className={inputCls} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
            <Button className="w-full" disabled={!v.name} onClick={() => void save()}><Lock className="h-4 w-4" />Log event</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
