/** Dialysis patients (D-99): active / paused / all with zone, schedule, screening and package; website slot requests to approve (with
 *  schedule — zone + screening rules apply) or reject; register a new dialysis patient from an MR record. */
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Droplets, FileUp, Plus, Search, UserPlus, X } from "lucide-react";
import { useAction, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, PageHeader, PatientPicker, type PatientHit, Tabs } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { type Ctx, Modal, RENAL_HEADER, ScreenChip, type Screening, ZoneChip } from "./shared";

interface P { name: string; patient?: string; patient_name: string; gender?: string; age?: number; status: string; request_type: string; zone: string; sched_days?: string; sched_shift?: string;
  station?: string; access_type?: string; screening: Screening; package?: number | null; payer?: string; dry_weight?: number; phone?: string; pref_days?: string; pref_shift?: string;
  current_hospital?: string; requested_at?: string }
interface Req extends P { referring_doctor?: string; external_referrer?: string; request_notes?: string; request_file?: string }

export default function PatientsPage() {
  const nav = useNavigate();
  const { hasRole } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as "active" | "requests" | "all") || "active";
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("");
  const list = useApi<P[]>("dialysis.patients", { status: tab === "active" ? "Active" : undefined, q: q.trim() || undefined, zone: zone || undefined }, { enabled: tab !== "requests" });
  const reqs = useApi<Req[]>("dialysis.requests");
  const ctx = useApi<Ctx>("dialysis.context", undefined, { staleTime: 300_000 }).data;
  const lead = hasRole("PW Nephrologist", "PW Dialysis In-charge");
  const [approve, setApprove] = useState<Req | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Dialysis patients" icon={Droplets} color={RENAL_HEADER} subtitle="Profiles, schedules, infection-control zone and screening"
        actions={<>{lead && <Button size="sm" onClick={() => setNewOpen(true)}><UserPlus className="h-4 w-4" />Register patient</Button>}<Link to="/dialysis"><Button variant="outline" size="sm">Board</Button></Link></>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs tabs={[{ key: "active", label: "Active" }, { key: "requests", label: "Slot requests", count: reqs.data?.length }, { key: "all", label: "All" }]} value={tab} onChange={(t) => setSp({ tab: t })} />
        {tab !== "requests" && <>
          <label className="relative min-w-56 flex-1"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={cn(inputCls, "ps-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, MR, DP no., phone" aria-label="Search" /></label>
          <select className={cn(inputCls, "w-40")} value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Zone"><option value="">All zones</option>{["Negative", "HBV", "HCV", "HIV"].map((z) => <option key={z}>{z}</option>)}</select></>}
      </div>

      {tab === "requests" ? (reqs.data?.length ? <div className="grid gap-3 md:grid-cols-2">{reqs.data.map((r) => (
        <div key={r.name} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><Droplets className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><div className="font-bold">{r.patient_name} <span className="text-xs font-normal text-muted-foreground">{r.age ? `${r.age}y` : ""} {r.gender ?? ""}</span></div>
              <div className="text-xs text-muted-foreground">{r.name} · {r.request_type} · {r.phone} · requested {String(r.requested_at ?? "").slice(0, 16)}</div></div></div>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">{([["Preferred", `${r.pref_days ?? "—"} · ${r.pref_shift ?? ""}`], ["Access", r.access_type ?? "—"], ["Transfer from", r.current_hospital ?? "—"], ["MR", r.patient ?? "new patient"]] as [string, string][])
            .map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
          {r.request_notes && <p className="mt-2 rounded-xl bg-muted/50 p-2 text-sm">{r.request_notes}</p>}
          <div className="mt-3 flex flex-wrap gap-2">{r.request_file && <a href={r.request_file} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><FileUp className="h-4 w-4" />Screening report</Button></a>}
            {lead && <Button size="sm" onClick={() => setApprove(r)}><Check className="h-4 w-4" />Approve &amp; schedule</Button>}</div>
        </div>))}</div> : <Empty title="No pending requests" icon={Droplets} />)
        : <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm"><table className="w-full min-w-[980px] text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{["Patient", "Zone", "Schedule", "Access", "Screening", "Package", "Status"].map((h) => <th key={h} className="px-3 py-2.5 text-start">{h}</th>)}</tr></thead>
          <tbody>{(list.data ?? []).map((r) => <tr key={r.name} onClick={() => nav(`/dialysis/patient/${r.name}`)} className="cursor-pointer border-t border-border/60 hover:bg-muted/30">
            <td className="px-3 py-2.5"><div className="font-semibold">{r.patient_name}</div><div className="text-xs text-muted-foreground">{r.name} · {r.patient ?? "no MR"} · {r.age ? `${r.age}y` : ""} {r.gender?.[0] ?? ""}</div></td>
            <td className="px-3"><ZoneChip zone={r.zone} /></td>
            <td className="px-3">{r.sched_days ? <><b>{r.sched_days}</b><div className="text-xs text-muted-foreground">{r.sched_shift} · {r.station}</div></> : <span className="text-muted-foreground">—</span>}</td>
            <td className="px-3 text-xs">{r.access_type ?? "—"}</td>
            <td className="px-3"><ScreenChip s={r.screening} /></td>
            <td className="px-3">{r.package != null && r.package > 0 ? <span className="font-semibold text-violet-700 dark:text-violet-300">{r.package} left</span> : <span className="text-muted-foreground">—</span>}{r.payer && r.payer !== "Self" && <div className="text-[11px] text-muted-foreground">{r.payer}</div>}</td>
            <td className="px-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{r.status}</span></td></tr>)}</tbody></table>
          {list.data && !list.data.length && <div className="p-6"><Empty title="No patients" icon={Droplets} /></div>}</div>}
      {approve && ctx && <ApproveModal r={approve} ctx={ctx} onClose={() => setApprove(null)} onDone={(n) => { setApprove(null); void reqs.refetch(); nav(`/dialysis/patient/${n}`); }} />}
      {newOpen && <NewModal onClose={() => setNewOpen(false)} onDone={(n) => nav(`/dialysis/patient/${n}`)} />}
    </div>
  );
}

function ApproveModal({ r, ctx, onClose, onDone }: { r: Req; ctx: Ctx; onClose: () => void; onDone: (name: string) => void }) {
  const [f, setF] = useState({ sched_days: r.pref_days ?? "Mon, Thu", sched_shift: r.pref_shift ?? "Morning", station: "", nephrologist: ctx.nephrologists[0]?.name ?? "", dry_weight: "", first_date: "", first_shift: "Morning" });
  const [mode, setMode] = useState<"recurring" | "single">(r.request_type === "Guest" || r.request_type === "Emergency" ? "single" : "recurring");
  const reject = useAction("dialysis.reject_request", { success: "Request rejected", onSuccess: () => onDone(r.name) });
  const go = useAction<{ profile: { name: string } }>("dialysis.approve_request", { success: (x) => `Approved · ${x.profile?.name ?? ""}`, onSuccess: () => onDone(r.name) });
  const days = ctx.days;
  const chosen = f.sched_days.split(/[,\s]+/).filter(Boolean);
  return (
    <Modal title={`Approve · ${r.patient_name}`} wide onClose={onClose} footer={<><Button variant="danger" disabled={reject.isPending} onClick={() => { const why = prompt("Reason for rejecting?"); if (why) reject.mutate({ name: r.name, reason: why }); }}><X className="h-4 w-4" />Reject</Button>
      <Button variant="submit" disabled={go.isPending} onClick={() => go.mutate({ name: r.name, data: { nephrologist: f.nephrologist, dry_weight: f.dry_weight ? Number(f.dry_weight) : undefined,
        ...(mode === "recurring" ? { sched_days: f.sched_days, sched_shift: f.sched_shift, station: f.station } : { first_date: f.first_date, first_shift: f.first_shift, station: f.station || undefined }) } })}><Check className="h-4 w-4" />Approve</Button></>}>
      <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">Before scheduling, record the viral screening on the profile (or a nephrologist override). A new patient's MR is created automatically if none is linked. The patient gets an SMS / WhatsApp confirmation.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nephrologist"><select className={inputCls} value={f.nephrologist} onChange={(e) => setF({ ...f, nephrologist: e.target.value })}>{ctx.nephrologists.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select></Field>
        <Field label="Dry weight (kg)"><input className={inputCls} type="number" value={f.dry_weight} onChange={(e) => setF({ ...f, dry_weight: e.target.value })} /></Field>
        <div className="md:col-span-2"><Tabs tabs={[{ key: "recurring", label: "Recurring schedule" }, { key: "single", label: "Single / guest session" }]} value={mode} onChange={setMode} /></div>
        {mode === "recurring" ? <>
          <Field label="Days" className="md:col-span-2"><div className="flex flex-wrap gap-1.5">{days.map((d) => <button key={d} type="button" onClick={() => setF({ ...f, sched_days: (chosen.includes(d) ? chosen.filter((x) => x !== d) : [...chosen, d]).sort((a, b) => days.indexOf(a) - days.indexOf(b)).join(", ") })}
            className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", chosen.includes(d) ? "border-sky-600 bg-sky-600 text-white" : "border-border")}>{d}</button>)}</div></Field>
          <Field label="Shift"><select className={inputCls} value={f.sched_shift} onChange={(e) => setF({ ...f, sched_shift: e.target.value })}>{ctx.active_shifts.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </> : <>
          <Field label="Date"><input type="date" className={inputCls} value={f.first_date} onChange={(e) => setF({ ...f, first_date: e.target.value })} /></Field>
          <Field label="Shift"><select className={inputCls} value={f.first_shift} onChange={(e) => setF({ ...f, first_shift: e.target.value })}>{ctx.active_shifts.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </>}
        <Field label="Station"><select className={inputCls} value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })}><option value="">—</option>{ctx.stations.filter((s) => s.status === "Active").map((s) => <option key={s.name} value={s.name}>{s.station_no} · {s.zone}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

function NewModal({ onClose, onDone }: { onClose: () => void; onDone: (name: string) => void }) {
  const [p, setP] = useState<PatientHit | null>(null);
  const go = useAction<{ name: string }>("dialysis.save_profile", { success: "Dialysis profile created", onSuccess: (r) => onDone(r.name) });
  return (
    <Modal title="Register a dialysis patient" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" disabled={!p || go.isPending} onClick={() => go.mutate({ data: { patient: p!.name, patient_name: p!.patient_name, gender: p!.gender, age: p!.age, phone: p!.phone, request_type: "New" } })}><Plus className="h-4 w-4" />Create profile</Button></>}>
      <Field label="Patient (MR)" required><PatientPicker value={p} onPick={setP} onClear={() => setP(null)} autoFocus placeholder="Search name, MR no., phone or CNIC" /></Field>
      <p className="mt-3 text-xs text-muted-foreground">Then record viral screening, access and prescription on the profile, and set the recurring schedule. Unregistered patients are added at Registration first.</p>
    </Modal>
  );
}

