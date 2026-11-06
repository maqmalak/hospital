import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, BedDouble, CalendarPlus, CheckCircle2, ClipboardList, IdCard, LayoutGrid, LogOut, Map as MapIcon, MonitorPlay, PlusCircle, Receipt, Sparkles, Wind, Activity, Wrench } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, humanizeError, useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { Field, inputCls, PageHeader, PatientPicker, StatCard, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { type Bed, type BedMap, fmtDT, hoursText, parseDT, STATUS_STYLE, stayState, type Ward } from "./shared";

export default function WardPage() {
  const { boot, branch } = useAuth();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [view, setView] = useState<"cards" | "map">("cards");
  const [ward, setWard] = useState("");
  const [filter, setFilter] = useState("");
  const [now, setNow] = useState(Date.now());
  const [allot, setAllot] = useState<Bed | null>(null);
  const [transfer, setTransfer] = useState<Bed | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const { data } = useApi<BedMap>("ward.bed_map", { branch }, { refetchInterval: 30_000 });
  useRealtime(boot?.site, [`hv:beds:${branch}`], () => void qc.invalidateQueries({ queryKey: ["ward.bed_map"] }));
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["ward.bed_map"] });
  const act = async (method: string, args: Record<string, unknown>, ok: string) => { try { await call(`ward.${method}`, args); toast.success(ok); refresh(); } catch (e) { toast.error(humanizeError(e)); } };

  const beds = data?.beds ?? [];
  const shown = beds.filter((b) => (!ward || b.ward === ward) && (!filter || (filter === "overdue" ? stayState(b, now) === "overdue" : filter === "soon" ? stayState(b, now) === "soon" : b.status === filter)));
  const wards = (data?.wards ?? []).filter((w) => !ward || w.name === ward);
  const overdue = beds.filter((b) => stayState(b, now) === "overdue").length;
  const soon = beds.filter((b) => stayState(b, now) === "soon").length;
  const wardName = (w: Ward) => (i18n.language === "ur" && w.ward_name_ur ? w.ward_name_ur : w.ward_name);

  const legend = [["Available", "Available"], ["Occupied", "Occupied"], ["Reserved", "Reserved"], ["Cleaning", "Cleaning"], ["Maintenance", "Maintenance"], ["soon", "Expiring soon"], ["overdue", "Overdue"]];
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader title="Wards & beds" icon={BedDouble} color="from-emerald-500 to-teal-600" subtitle={`${branch} · ${beds.length} ${t("Beds").toLowerCase()} · ${data?.occupancy ?? 0}% ${t("Occupancy").toLowerCase()}`}
        actions={<>
          <div className="flex rounded-xl bg-muted p-1">{([["cards", LayoutGrid, "Cards"], ["map", MapIcon, "Map"]] as const).map(([k, I, l]) => (
            <button key={k} onClick={() => setView(k)} className={cn("flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold", view === k ? "bg-card shadow-sm" : "text-muted-foreground")}><I className="h-4 w-4" />{l}</button>))}</div>
          <Link to="/display/ward" target="_blank"><Button variant="outline"><MonitorPlay className="h-4 w-4" />Kiosk</Button></Link>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label={t("Available")} value={data?.totals.Available ?? 0} icon={CheckCircle2} tone="teal" onClick={() => setFilter(filter === "Available" ? "" : "Available")} />
        <StatCard label={t("Occupied")} value={data?.totals.Occupied ?? 0} icon={BedDouble} tone="rose" onClick={() => setFilter(filter === "Occupied" ? "" : "Occupied")} />
        <StatCard label={t("Reserved")} value={data?.totals.Reserved ?? 0} icon={CalendarPlus} tone="blue" onClick={() => setFilter(filter === "Reserved" ? "" : "Reserved")} />
        <StatCard label={t("Cleaning")} value={data?.totals.Cleaning ?? 0} icon={Sparkles} tone="amber" onClick={() => setFilter(filter === "Cleaning" ? "" : "Cleaning")} />
        <StatCard label={t("Overdue")} value={overdue} hint={`${soon} ${t("Expiring soon").toLowerCase()}`} icon={Activity} tone="rose" onClick={() => setFilter(filter === "overdue" ? "" : "overdue")} />
        <StatCard label={t("Occupancy")} value={`${data?.occupancy ?? 0}%`} icon={ClipboardList} tone="violet" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
        <button onClick={() => setWard("")} className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", !ward ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>All wards</button>
        {(data?.wards ?? []).map((w) => <button key={w.name} onClick={() => setWard(w.name)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", ward === w.name ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{wardName(w)}</button>)}
        <div className="ms-auto flex flex-wrap gap-3 text-xs">{legend.map(([k, l]) => (
          <button key={k} onClick={() => setFilter(filter === k ? "" : k)} className={cn("flex items-center gap-1.5", filter === k && "font-bold")}>
            <span className={cn("h-3 w-3 rounded-sm border", k === "soon" ? "border-amber-500 bg-amber-200" : k === "overdue" ? "border-rose-600 bg-rose-300" : STATUS_STYLE[k].card)} />{t(l)}</button>))}</div>
      </div>

      {view === "cards" ? wards.map((w) => {
        const list = shown.filter((b) => b.ward === w.name);
        if (!list.length) return null;
        const occ = beds.filter((b) => b.ward === w.name && b.status === "Occupied").length;
        const tot = beds.filter((b) => b.ward === w.name).length;
        return (
          <section key={w.name} className="mb-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3" style={{ borderTop: `4px solid ${w.color || "#0d9488"}` }}>
              <h2 className="text-base font-bold">{wardName(w)}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{w.ward_type}</span>
              {w.gender !== "Mixed" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{w.gender}</span>}
              <span className="text-xs text-muted-foreground">{w.floor} floor · {occ}/{tot} occupied</span>
              <span className="ms-auto text-sm font-semibold tabular-nums">Rs {(w.bed_charge_per_day ?? 0).toLocaleString()}/{t("Per day").toLowerCase()}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {list.map((b) => <BedCard key={b.name} b={b} w={w} now={now} onAllot={() => setAllot(b)} onTransfer={() => setTransfer(b)}
                onAct={(m, a, ok) => void act(m, { bed: b.name, ...a }, ok)} onChart={() => b.current_patient && nav(`/pw-history/${b.current_patient}`)} />)}
            </div>
          </section>);
      }) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">{wards.map((w) => (
            <div key={w.name} className="overflow-hidden rounded-2xl border border-border">
              <div className="flex items-center gap-2 bg-card px-4 py-2"><span className="h-3 w-3 rounded-full" style={{ background: w.color || "#0d9488" }} /><b>{wardName(w)}</b><span className="text-xs text-muted-foreground">{w.ward_type}</span></div>
              <div className="relative overflow-auto bg-slate-700 dark:bg-slate-800" style={{ height: Math.max(170, Math.ceil(beds.filter((b) => b.ward === w.name).length / 6) * 130 + 30) }} onClick={() => setSel(null)}>
                <div className="absolute inset-x-0 top-0 h-5 bg-slate-600/60 text-center text-[10px] uppercase tracking-widest text-white/50">Corridor · {w.nursing_station}</div>
                {shown.filter((b) => b.ward === w.name).map((b) => <BedShape key={b.name} b={b} now={now} selected={sel === b.name} onClick={() => setSel(b.name)} />)}
              </div>
            </div>))}</div>
          <aside className="rounded-2xl border border-border bg-card p-4 xl:sticky xl:top-0 xl:self-start">
            {(() => { const b = beds.find((x) => x.name === sel); const w = data?.wards.find((x) => x.name === b?.ward);
              return b && w ? <BedCard b={b} w={w} now={now} onAllot={() => setAllot(b)} onTransfer={() => setTransfer(b)} onAct={(m, a, ok) => void act(m, { bed: b.name, ...a }, ok)} onChart={() => b.current_patient && nav(`/pw-history/${b.current_patient}`)} />
                : <div className="py-10 text-center text-sm text-muted-foreground"><BedDouble className="mx-auto mb-2 h-8 w-8" />Pick a bed on the plan</div>; })()}
          </aside>
        </div>
      )}
      {allot && <AllotDialog bed={allot} ward={data?.wards.find((w) => w.name === allot.ward)} onClose={() => setAllot(null)} onDone={() => { setAllot(null); refresh(); }} />}
      {transfer && <Dialog open onClose={() => setTransfer(null)} title={`${t("Transfer")} ${transfer.patient_name} · ${transfer.bed_no}`} size="lg">
        <div className="space-y-3">{(data?.wards ?? []).map((w) => { const free = beds.filter((b) => b.ward === w.name && b.status === "Available"); if (!free.length) return null; return (
          <div key={w.name}><div className="mb-1 text-xs font-bold text-muted-foreground">{wardName(w)}</div><div className="grid grid-cols-5 gap-2 sm:grid-cols-8">{free.map((b) => (
            <button key={b.name} onClick={async () => { await act("transfer", { bed: transfer.name, to_bed: b.name }, `Moved to ${b.bed_no}`); setTransfer(null); }} className="rounded-lg border border-emerald-400 bg-emerald-50 py-2 text-sm font-semibold hover:bg-emerald-100 dark:bg-emerald-500/10">{b.bed_no}</button>))}</div></div>); })}</div>
      </Dialog>}
    </div>
  );
}

function BedCard({ b, w, now, onAllot, onTransfer, onAct, onChart }: { b: Bed; w: Ward; now: number; onAllot: () => void; onTransfer: () => void;
  onAct: (method: string, args: Record<string, unknown>, ok: string) => void; onChart: () => void }) {
  const { t } = useTranslation();
  const st = STATUS_STYLE[b.status] ?? STATUS_STYLE.Available;
  const stay = stayState(b, now);
  const rate = b.agreed_rate || b.daily_rate || w.bed_charge_per_day || 0;
  if (b.status !== "Occupied") {
    const Icon = b.status === "Cleaning" ? Sparkles : b.status === "Maintenance" ? Wrench : b.status === "Reserved" ? CalendarPlus : BedDouble;
    return (
      <div className={cn("group flex min-h-[150px] flex-col items-center justify-center rounded-2xl border-2 p-3 text-center transition-shadow hover:shadow-md", st.card)}>
        <Icon className={cn("mb-1 h-7 w-7", st.text)} />
        <div className="font-bold">{b.bed_no}</div>
        <div className="text-[11px] text-muted-foreground">{[w.floor && `${w.floor} floor`, b.room, b.bed_type !== "Standard" && b.bed_type].filter(Boolean).join(" · ")}</div>
        <div className="mt-1 flex gap-1 text-muted-foreground">{b.has_oxygen ? <span title="Oxygen"><Wind className="h-3.5 w-3.5" /></span> : null}{b.has_monitor ? <span title="Monitor"><Activity className="h-3.5 w-3.5" /></span> : null}</div>
        <div className={cn("mt-1 text-xs font-bold uppercase tracking-wide", st.text)}>{t(b.status)}</div>
        {b.status_note && <div className="text-[11px] text-muted-foreground">{b.status_note}</div>}
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {(b.status === "Available" || b.status === "Reserved") && <Chip tone="green" icon={PlusCircle} label={t("Allot bed")} onClick={onAllot} />}
          {b.status === "Available" && <Chip tone="sky" icon={CalendarPlus} label={t("Reserved")} onClick={() => onAct("set_status", { status: "Reserved", note: "Reserved at the desk" }, "Bed reserved")} />}
          {b.status === "Reserved" && <Chip tone="slate" icon={CheckCircle2} label="Release" onClick={() => onAct("set_status", { status: "Available" }, "Reservation released")} />}
          {b.status === "Cleaning" && <Chip tone="green" icon={CheckCircle2} label="Ready" onClick={() => onAct("set_status", { status: "Available" }, `${b.bed_no} is ready`)} />}
          {b.status === "Maintenance" && <Chip tone="green" icon={CheckCircle2} label="Fixed" onClick={() => onAct("set_status", { status: "Available" }, `${b.bed_no} is back in service`)} />}
          {b.status === "Available" && <Chip tone="slate" icon={Wrench} label={t("Maintenance")} onClick={() => { const n = prompt("What needs fixing?"); if (n) onAct("set_status", { status: "Maintenance", note: n }, "Marked for maintenance"); }} />}
        </div>
      </div>
    );
  }
  const left = parseDT(b.expected_discharge) - now;
  return (
    <div className={cn("flex flex-col rounded-2xl border-2 p-3 shadow-sm", stay === "overdue" ? "border-rose-500 bg-rose-50 dark:bg-rose-500/10" : stay === "soon" ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10" : st.card)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold"><BedDouble className="h-4 w-4 text-rose-600" />Bed {b.bed_no}</div>
        {stay === "overdue" ? <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">{hoursText(left)} {t("Overdue").toLowerCase()}</span>
          : stay === "soon" ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">{hoursText(left)} left</span>
          : <span className="text-xs font-semibold text-muted-foreground">Rs {rate.toLocaleString()}/day</span>}
      </div>
      <div className="mt-2 text-base font-bold">{b.patient_name}</div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground"><IdCard className="h-3.5 w-3.5" />{b.current_patient}{b.age != null && ` · ${b.age}y`}{b.gender && ` · ${b.gender[0]}`}</div>
      <dl className="mt-2 grid grid-cols-[34px_1fr] gap-y-0.5 text-xs"><dt className="font-semibold text-muted-foreground">IN</dt><dd className="font-semibold tabular-nums">{fmtDT(b.occupied_since)}</dd>
        <dt className="font-semibold text-muted-foreground">OUT</dt><dd className="font-semibold tabular-nums">{fmtDT(b.expected_discharge)}</dd></dl>
      {(b.doctor_name || b.admission_reason) && <div className="mt-1 truncate text-xs text-muted-foreground">{b.doctor_name}{b.admission_reason && ` · ${b.admission_reason}`}</div>}
      <div className="mt-3 flex flex-wrap gap-1">
        <Chip tone="sky" icon={ClipboardList} label="IPD Chart" onClick={onChart} />
        <Chip tone="violet" icon={CalendarPlus} label={t("Extend")} onClick={() => { const d = prompt("Extend by how many days?", "1"); if (d) onAct("extend", { days: Number(d) || 1 }, "Stay extended"); }} />
        <Chip tone="amber" icon={ArrowRightLeft} label={t("Transfer")} onClick={onTransfer} />
        <Chip tone="rose" icon={LogOut} label={t("Discharge")} onClick={() => { if (confirm(`Discharge ${b.patient_name} from ${b.bed_no}? The bed goes to cleaning.`)) onAct("release", { note: "Discharged" }, `${b.bed_no} → cleaning`); }} />
        <Chip tone="green" icon={Receipt} label="IPD Slip" onClick={() => toast("IPD billing arrives in Phase 3", { icon: "🧾" })} />
      </div>
    </div>
  );
}

const CHIP: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200", sky: "bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-200",
  violet: "bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-200", amber: "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-200",
  rose: "bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-200", slate: "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-500/20 dark:text-slate-200",
};
function Chip({ tone, icon: I, label, onClick }: { tone: string; icon: typeof BedDouble; label: string; onClick: () => void }) {
  return <button onClick={(e) => { e.stopPropagation(); onClick(); }} className={cn("flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold", CHIP[tone])}><I className="h-3 w-3" />{label}</button>;
}

/** Floor-plan bed (Restaurant OS table-map style): coloured by status, live stay timer when occupied. */
function BedShape({ b, now, selected, onClick }: { b: Bed; now: number; selected: boolean; onClick: () => void }) {
  const stay = stayState(b, now);
  const x = 16 + (b.pos_x ?? 0) * 9;
  const y = 34 + (b.pos_y ?? 0) * 3.6;
  const fill = b.status === "Occupied" ? (stay === "overdue" ? "bg-rose-600 text-white" : stay === "soon" ? "bg-amber-500 text-white" : "bg-rose-500/90 text-white")
    : b.status === "Available" ? "bg-emerald-500 text-white" : b.status === "Reserved" ? "bg-sky-400 text-slate-900" : b.status === "Cleaning" ? "bg-amber-200 text-slate-900" : "bg-slate-400 text-slate-900";
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} className="absolute" style={{ left: x, top: y, width: 92, height: 104 }} title={`${b.bed_no} · ${b.status}`}>
      <span className="absolute left-[18px] top-0 h-3 w-14 rounded-t-lg bg-white/70" />
      <span className={cn("absolute left-2 top-2.5 flex h-[86px] w-[76px] flex-col items-center justify-center rounded-xl shadow-lg transition-colors", fill, selected && "outline outline-4 outline-offset-2 outline-emerald-300/80")}>
        <span className="text-sm font-extrabold">{b.bed_no}</span>
        {b.status === "Occupied" && <span className="max-w-[70px] truncate text-[10px] font-semibold">{(b.patient_name || "").split(" ")[0]}</span>}
        {b.status === "Occupied" && b.occupied_since && <span className="font-mono text-[10px]">{hoursText(now - parseDT(b.occupied_since))}</span>}
        {b.status !== "Occupied" && <span className="text-[10px] font-semibold uppercase">{b.status.slice(0, 5)}</span>}
      </span>
    </button>
  );
}

function AllotDialog({ bed, ward, onClose, onDone }: { bed: Bed; ward?: Ward; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { branch } = useAuth();
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [doctor, setDoctor] = useState("");
  const [days, setDays] = useState("1");
  const defaultRate = bed.daily_rate || ward?.bed_charge_per_day || 0;
  const [rate, setRate] = useState(String(defaultRate));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const docs = useApi<{ doctors: { name: string; doctor_name: string; branch?: string }[] }>("opd.counter_context", { branch });
  const total = useMemo(() => (Number(rate) || 0) * Math.max(Number(days) || 1, 1), [rate, days]);
  const submit = async () => {
    setBusy(true);
    try { await call("ward.assign", { bed: bed.name, patient: patient!.name, doctor: doctor || undefined, days: Number(days) || 1, rate: Number(rate) || undefined, reason }); toast.success(`${bed.bed_no} allotted to ${patient!.patient_name}`); onDone(); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={<span className="flex items-center gap-2"><PlusCircle className="h-5 w-5 text-emerald-600" />{t("Allot bed")} <span className="text-emerald-600">— Bed {bed.bed_no}</span></span>}
      description="Fill in patient details to assign this bed" size="md">
      <div className="space-y-4">
        <Field label="Patient" required><PatientPicker autoFocus value={patient} onPick={setPatient} onClear={() => setPatient(null)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Attending doctor"><select className={inputCls} value={doctor} onChange={(e) => setDoctor(e.target.value)}><option value="">—</option>{docs.data?.doctors.filter((d) => !d.branch || d.branch === branch).map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select></Field>
          <Field label="Expected stay (days)"><input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></Field>
        </div>
        <Field label="Rate per day" hint={`${ward?.ward_type ?? "Ward"} default: ${defaultRate.toLocaleString()}/day`}><input className={inputCls} inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))} /></Field>
        <div><div className="text-xs font-semibold text-muted-foreground">{t("Estimated total")}</div><div className="text-2xl font-extrabold tabular-nums text-emerald-600">{total.toLocaleString()}</div></div>
        <Field label="Reason for admission"><textarea className={inputCls + " h-20 py-2"} placeholder="Chief complaint / diagnosis…" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="submit" disabled={!patient} loading={busy} onClick={() => void submit()}><CheckCircle2 className="h-4 w-4" />{t("Allot bed")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
