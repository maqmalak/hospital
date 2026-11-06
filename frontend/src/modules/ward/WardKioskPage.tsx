import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BedDouble, Sparkles, Wrench, CalendarPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/utils/cn";
import { type BedMap, hoursText, parseDT, stayState } from "./shared";

/** Ward kiosk (nursing station / corridor screen): live bed status per ward, initials only, auto-cycles through wards. */
export default function WardKioskPage() {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  const { data } = useApi<BedMap>("ward.kiosk", { branch }, { refetchInterval: 20_000 });
  useRealtime(boot?.site, [`hv:beds:${branch}`], () => void qc.invalidateQueries({ queryKey: ["ward.kiosk"] }));
  const [now, setNow] = useState(Date.now());
  const [page, setPage] = useState(0);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const wards = data?.wards ?? [];
  const perPage = 3;
  const pages = Math.max(1, Math.ceil(wards.length / perPage));
  useEffect(() => { const id = setInterval(() => setPage((p) => (p + 1) % pages), 15_000); return () => clearInterval(id); }, [pages]);
  const visible = wards.slice(page * perPage, page * perPage + perPage);
  const tot = data?.totals ?? {};
  const fill = (s: string, st: ReturnType<typeof stayState>) => s === "Occupied" ? (st === "overdue" ? "from-rose-600 to-red-700 ring-2 ring-rose-300 animate-pulse" : st === "soon" ? "from-amber-500 to-orange-600" : "from-rose-500 to-rose-700")
    : s === "Available" ? "from-emerald-500 to-teal-600" : s === "Reserved" ? "from-sky-500 to-blue-600" : s === "Cleaning" ? "from-amber-300 to-amber-500 text-slate-900" : "from-slate-500 to-slate-600";
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 p-6 text-white">
      <header className="mb-5 flex flex-wrap items-end gap-6">
        <div className="flex-1"><div className="text-3xl font-extrabold">{boot?.clinic.name} · Bed status</div><div className="font-urdu text-lg text-teal-200">{boot?.clinic.name_ur} · بستروں کی صورتحال</div></div>
        {([["Available", "خالی", "bg-emerald-500"], ["Occupied", "زیر استعمال", "bg-rose-500"], ["Reserved", "مخصوص", "bg-sky-500"], ["Cleaning", "صفائی", "bg-amber-400"]] as const).map(([k, ur, c]) => (
          <div key={k} className="text-center"><div className="text-4xl font-black tabular-nums">{tot[k] ?? 0}</div><div className="flex items-center gap-1.5 text-sm text-white/70"><span className={cn("h-3 w-3 rounded-full", c)} />{k} · {ur}</div></div>))}
        <div className="text-end"><div className="text-4xl font-black tabular-nums">{data?.occupancy ?? 0}%</div><div className="text-sm text-white/70">Occupancy</div></div>
        <div className="text-end"><div className="text-4xl font-bold tabular-nums">{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div><div className="text-sm text-teal-200">{new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</div></div>
      </header>
      <div className="grid flex-1 gap-5 xl:grid-cols-3">
        {visible.map((w) => {
          const beds = (data?.beds ?? []).filter((b) => b.ward === w.name);
          const occ = beds.filter((b) => b.status === "Occupied").length;
          return (
            <section key={w.name} className="flex flex-col rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="mb-3 flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: w.color || "#14b8a6" }} /><h2 className="flex-1 text-xl font-bold">{w.ward_name}</h2>
                <span className="font-urdu text-teal-200">{w.ward_name_ur}</span><span className="rounded-full bg-white/10 px-3 py-0.5 text-sm font-semibold tabular-nums">{occ}/{beds.length}</span></div>
              <div className="mb-3 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-teal-400 to-rose-500" style={{ width: `${beds.length ? (occ / beds.length) * 100 : 0}%` }} /></div>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {beds.map((b) => { const st = stayState(b, now); const Icon = b.status === "Cleaning" ? Sparkles : b.status === "Maintenance" ? Wrench : b.status === "Reserved" ? CalendarPlus : BedDouble; return (
                  <div key={b.name} className={cn("flex aspect-square flex-col items-center justify-center rounded-2xl bg-gradient-to-br p-1 text-center shadow-lg", fill(b.status, st))}>
                    <Icon className="h-5 w-5 opacity-80" /><div className="text-lg font-black leading-tight">{b.bed_no}</div>
                    {b.status === "Occupied" ? <><div className="text-sm font-bold">{b.label}</div>{b.occupied_since && <div className="font-mono text-[10px] opacity-90">{hoursText(now - parseDT(b.occupied_since))}</div>}
                      {st === "overdue" && <div className="text-[9px] font-bold uppercase">overdue</div>}</>
                      : <div className="text-[10px] font-bold uppercase tracking-wide">{b.status}</div>}
                  </div>); })}
              </div>
            </section>);
        })}
      </div>
      <footer className="mt-4 flex items-center justify-center gap-2">{Array.from({ length: pages }).map((_, i) => <span key={i} className={cn("h-2 rounded-full transition-all", i === page ? "w-8 bg-teal-400" : "w-2 bg-white/30")} />)}</footer>
    </div>
  );
}
