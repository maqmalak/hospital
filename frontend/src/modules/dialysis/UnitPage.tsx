/** Dialysis unit operations (D-99): machine / station register (zone, service dates, out of service), disinfection after each session,
 *  RO water plant log (daily checks, culture, chemical), consumables stock in the Dialysis Store with low-stock alerts. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Boxes, Droplets, Plus, ShieldCheck, Waves, Wrench } from "lucide-react";
import { useAction, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Field, inputCls, PageHeader, StatCard, Tabs } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Modal, RENAL_HEADER, ZoneChip } from "./shared";

interface Unit {
  stations: { name: string; station_no: string; zone: string; status: string; machine_serial?: string; machine_model?: string; machine_installed?: string; last_service?: string; next_service?: string; out_of_service_reason?: string }[];
  logs: { name: string; log_type: string; log_at: string; station?: string; session?: string; method?: string; result?: string; readings?: string; notes?: string; recorded_by?: string }[];
  water: Record<string, { log_at: string; result?: string; readings?: string } | null>;
  stock: { item_code: string; item_name: string; qty: number; per_session: number; used_30d: number; low: boolean; days_left?: number | null }[];
  warehouse?: string; pending_disinfection: { name: string; station: string; patient_name: string; shift: string }[];
}
const TYPES = ["Disinfection", "Water daily check", "Water culture", "Water chemical", "Machine service", "Breakdown", "Back in service"];

export default function UnitPage() {
  const { hasRole } = useAuth();
  const { data, refetch } = useApi<Unit>("dialysis.unit");
  const [tab, setTab] = useState<"machines" | "water" | "stock" | "log">("machines");
  const [log, setLog] = useState<{ log_type: string; station?: string; session?: string } | null>(null);
  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const dueSoon = (d?: string) => !!d && d <= new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const lowCount = data?.stock.filter((s) => s.low).length ?? 0;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Machines, water & stock" icon={Wrench} color={RENAL_HEADER} subtitle={`Dialysis unit · ${data?.warehouse ?? "Dialysis Store"}`}
        actions={<><Button size="sm" onClick={() => setLog({ log_type: "Water daily check" })}><Plus className="h-4 w-4" />Log entry</Button><Link to="/dialysis"><Button variant="outline" size="sm"><Droplets className="h-4 w-4" />Board</Button></Link></>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stations active" value={`${data?.stations.filter((s) => s.status === "Active").length ?? 0}/${data?.stations.length ?? 0}`} icon={Droplets} tone="blue" />
        <StatCard label="Disinfection pending" value={data?.pending_disinfection.length ?? 0} icon={ShieldCheck} tone="amber" onClick={() => setTab("machines")} />
        <StatCard label="Water today" value={data?.water["Water daily check"]?.log_at.slice(0, 10) === today ? (data.water["Water daily check"]!.result ?? "—") : "Not logged"} icon={Waves} tone={data?.water["Water daily check"]?.log_at.slice(0, 10) === today ? "teal" : "rose"} onClick={() => setTab("water")} />
        <StatCard label="Low stock items" value={lowCount} icon={Boxes} tone={lowCount ? "rose" : "teal"} onClick={() => setTab("stock")} />
      </div>
      <div className="mb-3"><Tabs value={tab} onChange={setTab} tabs={[{ key: "machines", label: "Machines & stations" }, { key: "water", label: "RO water plant" }, { key: "stock", label: "Consumables", count: lowCount || undefined }, { key: "log", label: "All logs" }]} /></div>

      {tab === "machines" && <div className="space-y-4">
        {!!data?.pending_disinfection.length && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10"><div className="mb-2 flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" />Disinfect after these sessions</div>
          <div className="flex flex-wrap gap-2">{data.pending_disinfection.map((s) => <Button key={s.name} size="sm" variant="outline" onClick={() => setLog({ log_type: "Disinfection", station: s.station, session: s.name })}>{s.station} · {s.shift} · {s.patient_name}</Button>)}</div></div>}
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm"><table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{["Station", "Zone", "Machine", "Installed", "Last service", "Next service", "Status", ""].map((h) => <th key={h} className="px-3 py-2.5 text-start">{h}</th>)}</tr></thead>
          <tbody>{data?.stations.map((s) => <tr key={s.name} className="border-t border-border/60"><td className="px-3 py-2 font-black">{s.station_no}</td><td className="px-3"><ZoneChip zone={s.zone} /></td>
            <td className="px-3"><div>{s.machine_model}</div><div className="font-mono text-xs text-muted-foreground">{s.machine_serial}</div></td><td className="px-3">{s.machine_installed ?? "—"}</td><td className="px-3">{s.last_service ?? "—"}</td>
            <td className={cn("px-3", dueSoon(s.next_service) && "font-bold text-amber-700 dark:text-amber-300")}>{s.next_service ?? "—"}</td>
            <td className="px-3">{s.status === "Active" ? <span className="text-emerald-700 dark:text-emerald-400">Active</span> : <span className="font-bold text-rose-600">{s.status}<div className="text-xs font-normal">{s.out_of_service_reason}</div></span>}</td>
            <td className="px-3 text-end"><div className="flex justify-end gap-1">{s.status === "Active" ? <Button size="sm" variant="outline" onClick={() => setLog({ log_type: "Breakdown", station: s.name })}><AlertTriangle className="h-4 w-4" />Breakdown</Button>
              : <Button size="sm" variant="outline" onClick={() => setLog({ log_type: "Back in service", station: s.name })}>Back in service</Button>}
              <Button size="sm" variant="ghost" onClick={() => setLog({ log_type: "Machine service", station: s.name })}><Wrench className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>
        <p className="text-xs text-muted-foreground">HBV / HCV machines stay in their zone. A station's zone can only change when it has no future sessions{hasRole("PW Dialysis In-charge") ? "" : " (in-charge)"}.</p>
      </div>}

      {tab === "water" && <div className="grid gap-4 lg:grid-cols-3">
        {(["Water daily check", "Water culture", "Water chemical"] as const).map((t) => { const w = data?.water[t]; return (
          <div key={t} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="flex items-center gap-2"><Waves className="h-5 w-5 text-sky-600" /><b className="flex-1">{t}</b><Button size="sm" variant="outline" onClick={() => setLog({ log_type: t })}><Plus className="h-4 w-4" /></Button></div>
            {w ? <><div className={cn("mt-2 text-2xl font-black", w.result === "Fail" ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400")}>{w.result ?? "—"}</div><div className="text-xs text-muted-foreground">{w.log_at.slice(0, 16)}</div><p className="mt-1 text-sm">{w.readings}</p></>
              : <p className="mt-2 text-sm text-rose-600">Never logged</p>}
            <p className="mt-2 text-[11px] text-muted-foreground">{t === "Water daily check" ? "Every morning before the first shift: chlorine, hardness, conductivity, TDS." : t === "Water culture" ? "Monthly culture + endotoxin (action level 50 CFU/mL) [confirm]." : "Chemical analysis every 6 months [confirm]."}</p></div>); })}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-3"><b>Recent water logs</b>
          <table className="mt-2 w-full text-sm"><tbody>{data?.logs.filter((l) => l.log_type.startsWith("Water")).slice(0, 20).map((l) => <tr key={l.name} className="border-t border-border/60"><td className="py-1.5">{l.log_at.slice(0, 16)}</td><td>{l.log_type}</td><td className={l.result === "Fail" ? "font-bold text-rose-600" : ""}>{l.result}</td><td className="text-xs">{l.readings}</td></tr>)}</tbody></table></div>
      </div>}

      {tab === "stock" && <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm"><table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{["Item", "In store", "Per session", "Used (30 days)", "Days left", ""].map((h) => <th key={h} className="px-3 py-2.5 text-start">{h}</th>)}</tr></thead>
        <tbody>{data?.stock.map((s) => <tr key={s.item_code} className={cn("border-t border-border/60", s.low && "bg-rose-50/70 dark:bg-rose-500/[0.07]")}><td className="px-3 py-2"><div className="font-semibold">{s.item_name}</div><div className="font-mono text-xs text-muted-foreground">{s.item_code}</div></td>
          <td className="px-3 font-bold tabular-nums">{s.qty}</td><td className="px-3">{s.per_session || "as needed"}</td><td className="px-3">{s.used_30d}</td><td className="px-3">{s.days_left ?? "—"}</td>
          <td className="px-3">{s.low && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">Low — reorder</span>}</td></tr>)}</tbody></table>
        <p className="p-3 text-xs text-muted-foreground">Deducted automatically from the Dialysis Store when a session is completed (ERPNext Material Issue). Receive stock through the usual purchase / transfer screens.</p></div>}

      {tab === "log" && <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm"><table className="w-full min-w-[860px] text-sm"><tbody>{data?.logs.map((l) => <tr key={l.name} className="border-t border-border/60">
        <td className="px-3 py-1.5">{l.log_at.slice(0, 16)}</td><td className="px-3 font-semibold">{l.log_type}</td><td className="px-3">{l.station ?? ""}</td><td className={cn("px-3", l.result === "Fail" && "font-bold text-rose-600")}>{l.result}</td><td className="px-3 text-xs">{l.method} {l.readings} {l.notes}</td><td className="px-3 text-xs text-muted-foreground">{l.recorded_by}</td></tr>)}</tbody></table></div>}

      {log && <LogModal init={log} stations={data?.stations ?? []} onClose={() => setLog(null)} onDone={() => { setLog(null); void refetch(); }} />}
    </div>
  );
}

function LogModal({ init, stations, onClose, onDone }: { init: { log_type: string; station?: string; session?: string }; stations: Unit["stations"]; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ log_type: init.log_type, station: init.station ?? "", session: init.session ?? "", method: init.log_type === "Disinfection" ? "Heat disinfection + surface wipe (1000 ppm chlorine)" : "", result: init.log_type === "Breakdown" ? "Fail" : "Pass", readings: "", notes: "" });
  const go = useAction("dialysis.add_log", { success: "Logged", onSuccess: onDone });
  return (
    <Modal title="Unit log" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" disabled={go.isPending} onClick={() => go.mutate({ data: { ...v, station: v.station || undefined, session: v.session || undefined } })}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type"><select className={inputCls} value={v.log_type} onChange={(e) => setV({ ...v, log_type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Station / machine"><select className={inputCls} value={v.station} onChange={(e) => setV({ ...v, station: e.target.value })}><option value="">— (plant / unit)</option>{stations.map((s) => <option key={s.name} value={s.name}>{s.station_no}</option>)}</select></Field>
        <Field label="Method / agent"><input className={inputCls} value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })} /></Field>
        <Field label="Result"><select className={inputCls} value={v.result} onChange={(e) => setV({ ...v, result: e.target.value })}>{["Pass", "Fail", "Pending"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Readings" className="sm:col-span-2"><input className={inputCls} value={v.readings} onChange={(e) => setV({ ...v, readings: e.target.value })} placeholder="Chlorine 0.03 mg/L · hardness 0 · conductivity 6 µS/cm · TDS 5 ppm" /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className={inputCls} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
