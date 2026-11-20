/** Nursery & NICU ward board (D-95): visual cot map per unit with status colours, live alerts, quick actions. */
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Baby, BarChart3, Bed, HeartPulse, Plus, RefreshCw, ShieldCheck, Sun, Wind } from "lucide-react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, PageHeader, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { ageLabel, SEVERITY, STATUS_STYLE, StatusChip, UNITS, useNurseryLive, type Alert } from "./shared";

interface BabyLite { name: string; baby_name: string; sex?: string; status: string; unit: string; birth_weight_g?: number; current_weight_g?: number; gestation_weeks?: number; last_bilirubin?: number;
  phototherapy_on?: number; resp_support?: string; tag_active?: number; mother_name?: string; age_hours?: number; multiple_birth?: string; birth_order?: number; band_no?: string }
interface Cot { cot: string; bed_no: string; ward: string; bed_status: string; baby?: BabyLite }
interface Board { units: Record<string, Cot[]>; unplaced: BabyLite[]; alerts: Alert[] }

const UNIT_ICON = { "Rooming-in": Bed, Nursery: Baby, NICU: HeartPulse } as const;

export default function BoardPage() {
  const { hasRole } = useAuth();
  const nav = useNavigate();
  const { data, refetch, isFetching } = useApi<Board>("nursery.board", undefined, { refetchInterval: 60_000 });
  useNurseryLive(["nursery.board"]);
  const security = hasRole("PW Security") && !hasRole("PW Nursery Nurse", "PW NICU Nurse", "PW Neonatologist", "PW Ward Admin");
  const all = Object.values(data?.units ?? {}).flat().filter((c) => c.baby);
  const count = (s: string) => all.filter((c) => c.baby?.status === s).length;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Nursery & NICU" icon={Baby} subtitle={`${all.length} babies in care · ${data?.alerts.length ?? 0} alerts`}
        actions={<>
          <Link to="/nursery/security"><Button variant="outline" size="sm"><ShieldCheck className="h-4 w-4" />Security log</Button></Link>
          {hasRole("PW Neonatologist", "PW Ward Admin") && <Link to="/nursery/reports"><Button variant="outline" size="sm"><BarChart3 className="h-4 w-4" />Reports</Button></Link>}
          <Button variant="outline" size="sm" onClick={() => void refetch()} aria-label="Refresh"><RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /></Button>
          {!security && <Link to="/nursery/register"><Button size="sm"><Plus className="h-4 w-4" />Register baby</Button></Link>}
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="In care" value={all.length} icon={Baby} />
        <StatCard label="Stable" value={count("Stable")} icon={Bed} />
        <StatCard label="Observation" value={count("Observation")} icon={AlertTriangle} tone="amber" />
        <StatCard label="Critical" value={count("Critical")} icon={HeartPulse} tone="rose" />
        <StatCard label="Phototherapy" value={count("Phototherapy")} icon={Sun} tone="blue" />
        <StatCard label="Ready to go" value={count("Ready for discharge")} icon={ShieldCheck} tone="violet" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {UNITS.map((u) => { const cots = data?.units[u] ?? []; const I = UNIT_ICON[u]; const occ = cots.filter((c) => c.baby).length; return (
            <section key={u} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><I className="h-5 w-5" /></span>
                <h2 className="flex-1 font-bold">{u}</h2><span className="text-sm text-muted-foreground">{occ}/{cots.length} cots</span></div>
              {cots.length ? <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {cots.map((c) => { const b = c.baby; const S = b ? STATUS_STYLE[b.status] : null; return (
                  <button key={c.cot} type="button" disabled={!b || security} onClick={() => b && nav(`/nursery/baby/${b.name}`)}
                    className={cn("relative min-h-[112px] rounded-xl border-2 p-2.5 text-start transition", b ? cn(S?.tile, !security && "hover:-translate-y-0.5 hover:shadow-md") : "border-dashed border-border bg-muted/20")}>
                    <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground"><span>{c.bed_no}</span>{b && <span className={cn("h-2.5 w-2.5 rounded-full", S?.dot)} />}</div>
                    {b ? <>
                      <div className="mt-1 line-clamp-2 text-sm font-bold leading-tight">{b.baby_name}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{b.sex?.[0]} · {ageLabel(b.age_hours)}{b.gestation_weeks ? ` · ${b.gestation_weeks} wk` : ""}{b.current_weight_g ? ` · ${b.current_weight_g} g` : ""}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {b.phototherapy_on ? <span className="inline-flex items-center gap-0.5 rounded bg-sky-500 px-1 text-[10px] font-bold text-white"><Sun className="h-3 w-3" />Photo</span> : null}
                        {b.resp_support && b.resp_support !== "Room air" ? <span className="inline-flex items-center gap-0.5 rounded bg-indigo-500 px-1 text-[10px] font-bold text-white"><Wind className="h-3 w-3" />{b.resp_support}</span> : null}
                        {b.multiple_birth && b.multiple_birth !== "Single" ? <span className="rounded bg-pink-500 px-1 text-[10px] font-bold text-white">{b.multiple_birth} {"ABC"[(b.birth_order ?? 1) - 1]}</span> : null}
                        {!b.tag_active ? <span className="rounded bg-rose-600 px-1 text-[10px] font-bold text-white">NO TAG</span> : null}
                      </div>
                    </> : <div className="mt-6 text-center text-xs text-muted-foreground">{c.bed_status === "Available" ? "Free" : c.bed_status === "Occupied" ? "Discharged · bill pending" : c.bed_status}</div>}
                  </button>); })}
              </div> : <p className="text-sm text-muted-foreground">No cots set up for this unit.</p>}
            </section>); })}
          {!!data?.unplaced.length && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-500/10"><b>Without a cot:</b> {data.unplaced.map((b) => <Link key={b.name} to={`/nursery/baby/${b.name}`} className="ms-2 font-semibold text-primary">{b.baby_name}</Link>)}</section>}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{Object.entries(STATUS_STYLE).filter(([k]) => k !== "Discharged").map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full", v.dot)} />{k}</span>)}</div>
        </div>
        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 font-bold"><AlertTriangle className="h-5 w-5 text-rose-500" />Alerts</h2>
            {data?.alerts.length ? <ul className="max-h-[70vh] space-y-2 overflow-y-auto pe-1">{data.alerts.map((a, i) => (
              <li key={i}><button type="button" disabled={security} onClick={() => nav(`/nursery/baby/${a.name}`)} className={cn("w-full rounded-xl border px-3 py-2 text-start text-sm", SEVERITY[a.severity])}>
                <div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wide opacity-70">{a.kind}</span>{a.at && <span className="ms-auto text-[10px] opacity-70">{a.at.slice(11)}</span>}</div>
                <div className="font-semibold">{a.baby}</div><div className="text-xs">{a.text}</div></button></li>))}</ul>
              : <Empty title="No alerts" icon={ShieldCheck} />}
          </div>
          {security && <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">Security view: cots, names and tags only — clinical details are hidden.</p>}
          <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground"><b className="text-foreground">Legend</b><div className="mt-2 flex flex-wrap gap-2">{["Stable", "Observation", "Critical", "Phototherapy", "Ready for discharge"].map((s) => <StatusChip key={s} s={s} />)}</div></div>
        </aside>
      </div>
    </div>
  );
}
