import { useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, Check, CheckCheck, Pill, Syringe, Users } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Chip, IpdHero, tm, useIpdLive } from "./shared";

interface Due { name: string; bed_allotment?: string; er_visit?: string; patient: string; patient_name: string; item_name: string; dose: string; route: string; qty_units: number;
  scheduled_at: string; status: string; bed?: string; ward: string; overdue: boolean }
interface Board { doses: Due[]; wards: { name: string; ward_name: string; color?: string }[]; gate: number; on_duty: { employee_name: string; hv_ward?: string; hv_is_head_nurse: number; shift: string }[] }

/** Nurse drug round: every dose due in the next hours across the wards, one tap to chart. */
export default function MarPage() {
  const { branch } = useAuth();
  const [ward, setWard] = useState("");
  const [hours, setHours] = useState(2);
  const { data, refetch } = useApi<Board>("ipd.mar_board", { branch, ward, hours }, { refetchInterval: 30_000 });
  useIpdLive(["ipd.mar_board"]);
  const doses = data?.doses ?? [];
  const chart = async (d: Due, status: string) => {
    let reason: string | undefined;
    if (status !== "Administered") { reason = prompt(`Why was the dose ${status.toLowerCase()}?`) || undefined; if (!reason) return; }
    try { await call("ipd.chart_dose", { name: d.name, status, reason }); toast.success(status === "Administered" ? `${d.item_name} given · ${d.patient_name}` : `Marked ${status.toLowerCase()}`); void refetch(); }
    catch (e) { toast.error(humanizeError(e)); }
  };
  const pending = doses.filter((d) => d.status === "Pending Approval");
  const groups = [...new Set(doses.map((d) => `${d.ward}|${d.bed ?? ""}|${d.patient_name}|${d.bed_allotment ?? d.er_visit}`))];
  return (
    <div className="mx-auto max-w-6xl">
      <IpdHero title="Drug round" icon={Pill} sub="Doses due now and in the next hours · overdue doses first"
        actions={data?.gate && pending.length ? <Button className="bg-white text-teal-900 hover:bg-white/90" onClick={async () => { try { await call("ipd.approve_dose", { names: pending.map((p) => p.name) });
          toast.success(`${pending.length} approved`); void refetch(); } catch (e) { toast.error(humanizeError(e)); } }}><CheckCheck className="h-4 w-4" />Approve {pending.length}</Button> : undefined} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Due" value={doses.length} icon={Syringe} tone="teal" />
        <StatCard label="Overdue" value={doses.filter((d) => d.overdue).length} icon={AlarmClock} tone="rose" />
        <StatCard label="Waiting approval" value={pending.length} icon={CheckCheck} tone="amber" />
        <StatCard label="Nurses on duty" value={data?.on_duty.length ?? 0} hint={data?.on_duty.map((n) => n.employee_name.split(" ")[0]).join(", ")} icon={Users} tone="violet" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setWard("")} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", !ward ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>All wards</button>
        {data?.wards.map((w) => <button key={w.name} onClick={() => setWard(w.name)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", ward === w.name ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{w.ward_name}</button>)}
        <div className="ms-auto flex gap-1 rounded-xl bg-muted p-1">{[1, 2, 4, 8].map((h) => <button key={h} onClick={() => setHours(h)} className={cn("rounded-lg px-3 py-1 text-xs font-semibold", hours === h ? "bg-card shadow" : "text-muted-foreground")}>next {h}h</button>)}</div>
      </div>
      <div className="space-y-3">{groups.map((g) => {
        const [w, bed, pname, ref] = g.split("|");
        const list = doses.filter((d) => (d.bed_allotment ?? d.er_visit) === ref);
        return (
          <section key={g} className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <div className="mb-2 flex items-center gap-2"><span className="rounded-lg bg-teal-600 px-2 py-1 text-xs font-black text-white">{bed || "ER"}</span><b>{pname}</b><span className="text-xs text-muted-foreground">{w}</span>
              {list[0]?.bed_allotment && <Link className="ms-auto text-xs font-semibold text-teal-700 dark:text-teal-300" to={`/ipd/${list[0].bed_allotment}?tab=meds`}>Chart →</Link>}</div>
            <div className="divide-y divide-border">{list.map((d) => (
              <div key={d.name} className="flex flex-wrap items-center gap-2 py-2">
                <span className={cn("w-14 text-center text-sm font-black tabular-nums", d.overdue ? "text-rose-600" : "")}>{tm(d.scheduled_at)}</span>
                <div className="min-w-0 flex-1"><div className="font-semibold">{d.item_name}</div><div className="text-xs text-muted-foreground">{d.dose} · {d.route} · {d.qty_units} unit(s)</div></div>
                <Chip s={d.overdue && d.status === "Scheduled" ? "Missed" : d.status} className={d.overdue && d.status === "Scheduled" ? "animate-pulse" : ""} />
                <Button size="sm" variant="submit" disabled={d.status === "Pending Approval"} onClick={() => void chart(d, "Administered")}><Check className="h-4 w-4" />Given</Button>
                {["Missed", "Refused", "Held"].map((s) => <Button key={s} size="sm" variant="neutral" onClick={() => void chart(d, s)}>{s}</Button>)}
              </div>))}</div>
          </section>);
      })}</div>
      {data && !doses.length && <Empty title="Nothing due" hint="All doses for this window are charted." icon={CheckCheck} />}
    </div>
  );
}
