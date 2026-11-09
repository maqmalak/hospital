import { useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, BedDouble, CalendarClock, Pill, Plus, Receipt, Search, ShieldCheck, Soup, Users } from "lucide-react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, inputCls, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { AdmitDialog } from "./AdmitDialog";
import { Chip, dt, IpdHero, rs, useIpdLive } from "./shared";

interface Row { name: string; patient: string; patient_name: string; gender?: string; status: string; bed?: string; bed_no?: string; ward: string; admit_datetime: string;
  expected_discharge?: string; release_datetime?: string; doctor_name?: string; payer_type: string; payer?: string; charges_total: number; advance_total: number;
  service_package?: string; source: string; days: number; overdue: boolean; discharge_type?: string; final_invoice?: string }

export default function AdmissionsPage() {
  const { branch, can } = useAuth();
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const [ward, setWard] = useState("");
  const [admit, setAdmit] = useState(false);
  const { data: rows } = useApi<Row[]>("ipd.admissions", { branch, status, q, ward }, { refetchInterval: 60_000 });
  useIpdLive(["ipd.admissions"]);
  const list = rows ?? [];
  const wards = [...new Set(list.map((r) => r.ward))];
  const open = list.filter((r) => r.status !== "Discharged");
  return (
    <div className="mx-auto max-w-[1500px]">
      <IpdHero title="Admissions" sub={`${branch} · inpatients, their charts and running bills`}
        actions={<>
          {can("/ipd/mar") && <Link to="/ipd/mar"><Button className="bg-white/15 text-white hover:bg-white/25"><Pill className="h-4 w-4" />Drug round</Button></Link>}
          {can("/ipd/kitchen") && <Link to="/ipd/kitchen"><Button className="bg-white/15 text-white hover:bg-white/25"><Soup className="h-4 w-4" />Diet list</Button></Link>}
          {can("/ipd/pre-auth") && <Link to="/ipd/pre-auth"><Button className="bg-white/15 text-white hover:bg-white/25"><ShieldCheck className="h-4 w-4" />Pre-auth</Button></Link>}
          <Button className="bg-white text-teal-900 hover:bg-white/90" onClick={() => setAdmit(true)}><Plus className="h-4 w-4" />Admit patient</Button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="In hospital" value={open.length} icon={BedDouble} tone="teal" />
        <StatCard label="Past expected discharge" value={open.filter((r) => r.overdue).length} icon={AlarmClock} tone="rose" />
        <StatCard label="Discharge pending" value={open.filter((r) => r.status === "Discharge Pending").length} icon={CalendarClock} tone="amber" />
        <StatCard label="Panel / insurance" value={open.filter((r) => r.payer_type !== "Patient").length} icon={Users} tone="violet" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} placeholder="Name, MR or admission no." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className={inputCls.replace("w-full", "") + " w-48"} value={ward} onChange={(e) => setWard(e.target.value)}><option value="">All wards</option>{wards.map((w) => <option key={w}>{w}</option>)}</select>
        <div className="flex gap-1 rounded-xl bg-muted p-1">{[["open", "In hospital"], ["Discharged", "Discharged"], ["", "All"]].map(([k, l]) => <button key={k} onClick={() => setStatus(k)}
          className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>)}</div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <Link key={r.name} to={`/ipd/${r.name}`} className={cn("group rounded-2xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg", r.overdue ? "border-rose-300" : "border-border")}>
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white"><BedDouble className="h-4 w-4" /><span className="text-xs font-black">{r.bed_no}</span></span>
              <div className="min-w-0 flex-1"><div className="truncate font-bold">{r.patient_name}</div><div className="truncate text-xs text-muted-foreground">{r.patient} · {r.name}</div>
                <div className="truncate text-xs text-muted-foreground">{r.ward} · {r.doctor_name}</div></div>
              <Chip s={r.status} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold">Day {Math.max(r.days, 1)}</span>
              {r.payer_type !== "Patient" && <span className="rounded-md bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">{r.payer_type}{r.payer ? ` · ${r.payer}` : ""}</span>}
              {r.service_package && <span className="rounded-md bg-fuchsia-100 px-1.5 py-0.5 font-semibold text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-200">{r.service_package}</span>}
              {r.source !== "Direct" && <span className="rounded-md bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">from {r.source}</span>}
              {r.overdue && <span className="rounded-md bg-rose-600 px-1.5 py-0.5 font-bold text-white">past expected discharge</span>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs"><span className="text-muted-foreground">In {dt(r.admit_datetime)}{r.release_datetime ? ` · out ${dt(r.release_datetime)}` : ""}</span>
              <span className="flex items-center gap-1 font-semibold"><Receipt className="h-3.5 w-3.5" />{rs(r.charges_total)}{r.advance_total ? <span className="text-emerald-600"> · adv {rs(r.advance_total)}</span> : null}</span></div>
          </Link>))}
      </div>
      {rows && !rows.length && <Empty title="No admissions" hint="Admit a patient from here or from the bed map." icon={BedDouble} />}
      {admit && <AdmitDialog onClose={() => setAdmit(false)} />}
    </div>
  );
}
