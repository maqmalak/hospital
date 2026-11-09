import { useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Crown, Plus, UserCheck, X } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { IpdHero } from "./shared";

interface Week { start: string; days: string[]; shifts: { name: string; start: string; end: string }[]; wards: { name: string; ward_name: string; color?: string; ward_type: string }[];
  assignments: { name: string; employee_name: string; shift_type: string; start_date: string; hv_ward: string; hv_is_head_nurse: number; user_id: string }[]; nurses: { name: string; full_name: string }[] }
const addDays = (iso: string, n: number) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const SHIFT_TONE = ["bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200", "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200", "bg-indigo-100 text-indigo-900 dark:bg-indigo-500/20 dark:text-indigo-200"];

/** Nurse duty roster on HRMS shifts: wards × days × shifts. */
export default function RosterPage() {
  const { branch } = useAuth();
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); });
  const { data: w, refetch } = useApi<Week>("roster.week", { branch, start });
  const [cell, setCell] = useState<{ ward: string; day: string; shift: string } | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const act = async (method: string, args: Record<string, unknown>, ok: string) => { try { await call(method, args); toast.success(ok); void refetch(); return true; } catch (e) { toast.error(humanizeError(e)); return false; } };
  return (
    <div className="mx-auto max-w-[1600px]">
      <IpdHero title="Nurse roster" icon={UserCheck} sub="Who is on which ward, each shift · HRMS shift assignments"
        actions={<>
          <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setStart(addDays(start, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold">{new Date(start).toLocaleDateString([], { day: "2-digit", month: "short" })} – {new Date(addDays(start, 6)).toLocaleDateString([], { day: "2-digit", month: "short" })}</span>
          <Button className="bg-white/15 text-white hover:bg-white/25" onClick={() => setStart(addDays(start, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <Button className="bg-white text-teal-900 hover:bg-white/90" onClick={() => void act("roster.copy_week", { branch, start, to_start: addDays(start, 7) }, "Copied to next week")}><Copy className="h-4 w-4" />Repeat next week</Button>
        </>} />
      <div className="mb-3 flex flex-wrap gap-2 text-xs">{w?.shifts.map((s, i) => <span key={s.name} className={cn("rounded-full px-3 py-1 font-semibold", SHIFT_TONE[i % 3])}>{s.name.replace("Nursing ", "")} {s.start}–{s.end}</span>)}</div>
      {w && !w.wards.length && <Empty title="No wards" />}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[1000px] text-sm">
        <thead><tr className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><th className="sticky start-0 bg-muted px-3 py-2 text-start">Ward</th>
          {w?.days.map((d) => <th key={d} className={cn("px-2 py-2 text-start", d === today && "bg-teal-100 text-teal-900 dark:bg-teal-500/20 dark:text-teal-100")}>{new Date(d).toLocaleDateString([], { weekday: "short", day: "2-digit" })}</th>)}</tr></thead>
        <tbody>{w?.wards.map((ward) => <tr key={ward.name} className="border-t border-border align-top">
          <td className="sticky start-0 bg-card px-3 py-2"><div className="flex items-center gap-2 font-bold"><span className="h-3 w-3 rounded-full" style={{ background: ward.color || "#0d9488" }} />{ward.ward_name}</div><div className="text-[11px] text-muted-foreground">{ward.ward_type}</div></td>
          {w.days.map((d) => <td key={d} className={cn("px-1.5 py-1.5", d === today && "bg-teal-50/60 dark:bg-teal-500/5")}><div className="space-y-1">{w.shifts.map((s, i) => {
            const list = w.assignments.filter((a) => a.hv_ward === ward.name && a.start_date === d && a.shift_type === s.name);
            return (<div key={s.name} className={cn("group rounded-lg px-1.5 py-1", SHIFT_TONE[i % 3])}>
              <div className="flex items-center text-[10px] font-bold uppercase opacity-70">{s.name.replace("Nursing ", "")}<button className="ms-auto opacity-0 group-hover:opacity-100" onClick={() => setCell({ ward: ward.name, day: d, shift: s.name })}><Plus className="h-3 w-3" /></button></div>
              {list.map((a) => <div key={a.name} className="flex items-center gap-1 text-xs font-semibold">{a.hv_is_head_nurse ? <Crown className="h-3 w-3 text-violet-600" /> : null}<span className="truncate">{a.employee_name}</span>
                <button className="ms-auto opacity-0 group-hover:opacity-100" title="Remove" onClick={() => void act("roster.unassign", { name: a.name }, "Removed")}><X className="h-3 w-3" /></button></div>)}
              {!list.length && <button onClick={() => setCell({ ward: ward.name, day: d, shift: s.name })} className="text-[11px] italic opacity-60">— add —</button>}
            </div>); })}</div></td>)}
        </tr>)}</tbody></table></div>
      {cell && <Dialog open onClose={() => setCell(null)} title={`${cell.shift.replace("Nursing ", "")} · ${cell.ward}`} description={new Date(cell.day).toDateString()} size="sm">
        <div className="space-y-1">{w?.nurses.map((n) => <div key={n.name} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted"><span className="flex-1 text-sm font-semibold">{n.full_name}</span>
          <Button size="xs" variant="save" onClick={async () => { if (await act("roster.assign", { user: n.name, ward: cell.ward, date: cell.day, shift_type: cell.shift }, `${n.full_name} on duty`)) setCell(null); }}>Assign</Button>
          <Button size="xs" variant="menu" title="Assign as nurse in charge" onClick={async () => { if (await act("roster.assign", { user: n.name, ward: cell.ward, date: cell.day, shift_type: cell.shift, head: 1 }, `${n.full_name} in charge`)) setCell(null); }}><Crown className="h-3 w-3" /></Button></div>)}
          {!w?.nurses.length && <div className="text-sm text-muted-foreground">No users with the PW Nurse role.</div>}</div>
      </Dialog>}
    </div>
  );
}
