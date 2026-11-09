import { useState } from "react";
import { BarChart3, Check, Printer, ShieldCheck, Soup, X } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { printRows } from "@/utils/print";
import { Empty, Field, inputCls, PatientPicker, StatCard, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { CHARGE_TONE, ChargeDot, Chip, type Ctx, dOnly, IpdHero, rs } from "./shared";

// ------------------------------------------------------------------ kitchen diet list
interface DietRow { name: string; diet_type: string; breakfast: number; lunch: number; dinner: number; snacks: number; instructions?: string; status: string; patient_name: string; ward: string; bed_no?: string }
export function KitchenPage() {
  const { branch } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data } = useApi<DietRow[]>("ipd.kitchen", { branch, date }, { refetchInterval: 60_000 });
  const rows = data ?? [];
  const types = [...new Set(rows.map((r) => r.diet_type))];
  const count = (k: "breakfast" | "lunch" | "dinner" | "snacks") => rows.filter((r) => r[k]).length;
  return (
    <div className="mx-auto max-w-6xl">
      <IpdHero title="Diet list" icon={Soup} sub="What the kitchen sends to each bed today"
        actions={<><input type="date" className={inputCls.replace("w-full", "") + " w-40 text-foreground"} value={date} onChange={(e) => setDate(e.target.value)} />
          <Button className="bg-white text-teal-900 hover:bg-white/90" onClick={() => printRows(`Diet list ${date}`, [{ key: "ward", label: "Ward" }, { key: "bed_no", label: "Bed" },
            { key: "patient_name", label: "Patient" }, { key: "diet_type", label: "Diet" }, { key: "meals", label: "Meals" }, { key: "instructions", label: "Instructions" }],
            rows.map((r) => ({ ...r, meals: ["breakfast", "lunch", "dinner", "snacks"].filter((k) => r[k as "lunch"]).join(", ") })), branch)}><Printer className="h-4 w-4" />Print</Button></>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">{(["breakfast", "lunch", "dinner", "snacks"] as const).map((k) => <StatCard key={k} label={k} value={count(k)} tone="teal" />)}</div>
      <div className="mb-4 flex flex-wrap gap-2">{types.map((t) => <span key={t} className="rounded-full bg-lime-100 px-3 py-1 text-sm font-semibold text-lime-900 dark:bg-lime-500/15 dark:text-lime-200">{t} · {rows.filter((r) => r.diet_type === t).length}</span>)}</div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr>
        {["Ward", "Bed", "Patient", "Diet", "B", "L", "D", "S", "Instructions"].map((h) => <th key={h} className="px-3 py-2 text-start">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name} className="border-t border-border"><td className="px-3 py-2">{r.ward}</td><td className="px-3 py-2 font-bold">{r.bed_no}</td><td className="px-3 py-2">{r.patient_name}</td>
          <td className="px-3 py-2 font-semibold">{r.diet_type}</td>{(["breakfast", "lunch", "dinner", "snacks"] as const).map((k) => <td key={k} className="px-3 py-2">{r[k] ? <Check className="h-4 w-4 text-emerald-600" /> : ""}</td>)}
          <td className="px-3 py-2 text-muted-foreground">{r.instructions}</td></tr>)}</tbody></table>
        {!rows.length && <Empty title="No diet orders for this day" icon={Soup} />}</div>
    </div>
  );
}

// ------------------------------------------------------------------ insurance pre-auth
interface PA { name: string; patient: string; patient_name: string; payer: string; status: string; requested_amount: number; approved_amount: number; approval_no?: string; valid_till?: string;
  bed_allotment?: string; procedure_type?: string; creation: string }
export function PreAuthPage() {
  const { branch, hasRole } = useAuth();
  const [status, setStatus] = useState("");
  const { data, refetch } = useApi<PA[]>("ipd.pre_auths", { status });
  const { data: ctx } = useApi<Ctx>("ipd.context", { branch });
  const [adding, setAdding] = useState(false);
  const [deciding, setDeciding] = useState<PA | null>(null);
  return (
    <div className="mx-auto max-w-6xl">
      <IpdHero title="Insurance pre-authorization" icon={ShieldCheck} tone="indigo" sub="Approval from the insurer before an admission or procedure. Claims come with Finance (Phase 6)."
        actions={<Button className="bg-white text-indigo-900 hover:bg-white/90" onClick={() => setAdding(true)}>New request</Button>} />
      <div className="mb-3 flex gap-1 rounded-xl bg-muted p-1">{["", "Requested", "Approved", "Partially Approved", "Rejected", "Expired"].map((s) => <button key={s} onClick={() => setStatus(s)}
        className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === s ? "bg-card shadow" : "text-muted-foreground")}>{s || "All"}</button>)}</div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr>
        {["Request", "Patient", "Insurer", "For", "Requested", "Approved", "Approval no.", "Valid till", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-start">{h}</th>)}</tr></thead>
        <tbody>{(data ?? []).map((r) => <tr key={r.name} className="border-t border-border"><td className="px-3 py-2 font-mono text-xs">{r.name}</td><td className="px-3 py-2">{r.patient_name}<div className="text-[11px] text-muted-foreground">{r.patient}</div></td>
          <td className="px-3 py-2">{r.payer}</td><td className="px-3 py-2">{r.procedure_type || (r.bed_allotment ? "Admission" : "—")}</td><td className="px-3 py-2 tabular-nums">{rs(r.requested_amount)}</td>
          <td className="px-3 py-2 font-semibold tabular-nums">{r.approved_amount ? rs(r.approved_amount) : "—"}</td><td className="px-3 py-2">{r.approval_no}</td><td className="px-3 py-2">{dOnly(r.valid_till)}</td>
          <td className="px-3 py-2"><Chip s={r.status} className={r.status === "Approved" ? "bg-emerald-100 text-emerald-800" : r.status === "Rejected" ? "bg-rose-100 text-rose-800" : ""} /></td>
          <td className="px-3 py-2">{hasRole("PW Accountant") && r.status === "Requested" && <Button size="xs" variant="workflow" onClick={() => setDeciding(r)}>Decide</Button>}</td></tr>)}</tbody></table>
        {data && !data.length && <Empty title="No pre-auth requests" icon={ShieldCheck} />}</div>
      {adding && <NewPreAuth ctx={ctx} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void refetch(); }} />}
      {deciding && <DecidePreAuth pa={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); void refetch(); }} />}
    </div>
  );
}

function NewPreAuth({ ctx, onClose, onDone }: { ctx?: Ctx; onClose: () => void; onDone: () => void }) {
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [f, setF] = useState({ payer: "", policy_no: "", procedure_type: "", requested_amount: "", notes: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open onClose={onClose} title="Pre-auth request" size="md"><div className="space-y-3">
      <Field label="Patient" required><PatientPicker value={patient} onPick={setPatient} onClear={() => setPatient(null)} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Insurer" required><select className={inputCls} value={f.payer} onChange={set("payer")}><option value="">—</option>
        {ctx?.payers.filter((p) => p.customer_group === "Insurance Providers").map((p) => <option key={p.name}>{p.name}</option>)}</select></Field>
        <Field label="Policy no."><input className={inputCls} value={f.policy_no} onChange={set("policy_no")} /></Field></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Procedure (optional)"><select className={inputCls} value={f.procedure_type} onChange={set("procedure_type")}><option value="">Admission</option>
        {ctx?.procedure_types.map((p) => <option key={p.name}>{p.name}</option>)}</select></Field>
        <Field label="Amount requested" required><input className={inputCls} inputMode="numeric" value={f.requested_amount} onChange={set("requested_amount")} /></Field></div>
      <Field label="Notes"><input className={inputCls} value={f.notes} onChange={set("notes")} /></Field>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="submit" disabled={!patient || !f.payer || !Number(f.requested_amount)}
        onClick={async () => { try { await call("ipd.save_pre_auth", { data: { ...f, patient: patient!.name } }); toast.success("Request saved"); onDone(); } catch (e) { toast.error(humanizeError(e)); } }}>Save</Button></div>
    </div></Dialog>
  );
}

function DecidePreAuth({ pa, onClose, onDone }: { pa: PA; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ approved_amount: String(pa.requested_amount), approval_no: "", valid_till: "", notes: "" });
  const decide = async (status: string) => { try { await call("ipd.decide_pre_auth", { name: pa.name, status, ...f, approved_amount: Number(f.approved_amount) || 0 }); toast.success(status); onDone(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <Dialog open onClose={onClose} title={`${pa.name} · ${pa.patient_name}`} description={`${pa.payer} · requested ${rs(pa.requested_amount)}`} size="sm"><div className="space-y-3">
      <Field label="Approved amount"><input className={inputCls} inputMode="numeric" value={f.approved_amount} onChange={(e) => setF({ ...f, approved_amount: e.target.value })} /></Field>
      <Field label="Approval no."><input className={inputCls} value={f.approval_no} onChange={(e) => setF({ ...f, approval_no: e.target.value })} /></Field>
      <Field label="Valid till"><input type="date" className={inputCls} value={f.valid_till} onChange={(e) => setF({ ...f, valid_till: e.target.value })} /></Field>
      <div className="grid grid-cols-3 gap-2"><Button variant="submit" onClick={() => void decide(Number(f.approved_amount) < pa.requested_amount ? "Partially Approved" : "Approved")}><Check className="h-4 w-4" />Approve</Button>
        <Button variant="danger" onClick={() => void decide("Rejected")}><X className="h-4 w-4" />Reject</Button><Button variant="neutral" onClick={() => void decide("Expired")}>Expired</Button></div>
    </div></Dialog>
  );
}

// ------------------------------------------------------------------ IPD reports
interface Report { beds: number; occupied: number; occupancy: number; census: { ward: string; ward_type: string; beds: number; occupied: number }[]; admissions: { d: string; n: number }[];
  discharges: { d: string; n: number }[]; alos: number; discharged: number; revenue: { charge_type: string; amount: number }[]; days: number;
  outstanding: { name: string; patient: string; patient_name: string; payer_type: string; payer?: string; patient_due: number; payer_due: number; release_datetime?: string }[];
  discharge_types: Record<string, number>; doctors: { doctor: string; n: number }[]; er: { level: string; disposition: string; n: number; minutes: number }[] }

export function ReportPage() {
  const { branch } = useAuth();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { data: r } = useApi<Report>("ipd.report", { branch, from_date: from, to_date: to });
  const days: string[] = [];
  for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const adm = Object.fromEntries((r?.admissions ?? []).map((x) => [String(x.d), x.n]));
  const dis = Object.fromEntries((r?.discharges ?? []).map((x) => [String(x.d), x.n]));
  const peak = Math.max(1, ...days.map((d) => Math.max(adm[d] ?? 0, dis[d] ?? 0)));
  const revTotal = (r?.revenue ?? []).reduce((s, x) => s + x.amount, 0);
  const W = 720, H = 160;
  return (
    <div className="mx-auto max-w-[1400px]">
      <IpdHero title="IPD reports" icon={BarChart3} sub="Census, admissions, length of stay, revenue and dues"
        actions={<div className="flex gap-2"><input type="date" className={inputCls.replace("w-full", "") + " w-40 text-foreground"} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className={inputCls.replace("w-full", "") + " w-40 text-foreground"} value={to} onChange={(e) => setTo(e.target.value)} /></div>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Occupancy now" value={`${r?.occupancy ?? 0}%`} hint={`${r?.occupied ?? 0} of ${r?.beds ?? 0} beds`} tone="teal" />
        <StatCard label="Admissions" value={(r?.admissions ?? []).reduce((s, x) => s + x.n, 0)} tone="blue" />
        <StatCard label="Discharges" value={r?.discharged ?? 0} tone="violet" />
        <StatCard label="Average stay" value={`${r?.alos ?? 0} d`} tone="amber" />
        <StatCard label="IPD revenue" value={rs(revTotal)} tone="rose" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
          <div className="mb-2 flex items-center gap-4 text-sm font-bold">Admissions and discharges per day<span className="ms-auto flex items-center gap-3 text-xs font-semibold"><span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-teal-500" />Admitted</span>
            <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-slate-400" />Discharged</span></span></div>
          <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full">{days.map((d, i) => { const bw = (W / days.length) / 2 - 2; const x = (i * W) / days.length; const ha = ((adm[d] ?? 0) / peak) * H; const hd = ((dis[d] ?? 0) / peak) * H;
            return <g key={d}><rect x={x + 1} y={H - ha} width={Math.max(bw, 2)} height={ha} rx={3} className="fill-teal-500"><title>{`${d}: ${adm[d] ?? 0} admitted`}</title></rect>
              <rect x={x + bw + 3} y={H - hd} width={Math.max(bw, 2)} height={hd} rx={3} className="fill-slate-400"><title>{`${d}: ${dis[d] ?? 0} discharged`}</title></rect>
              {i % Math.ceil(days.length / 8) === 0 && <text x={x} y={H + 14} className="fill-muted-foreground text-[10px]">{d.slice(5)}</text>}</g>; })}
            <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" /></svg>
        </section>
        <section className="rounded-2xl border border-border bg-card p-4"><div className="mb-3 text-sm font-bold">Revenue by charge type</div>
          {(r?.revenue ?? []).map((x) => <div key={x.charge_type} className="mb-1.5 grid grid-cols-[100px_1fr_90px] items-center gap-2 text-sm"><span className="flex items-center gap-1.5"><ChargeDot t={x.charge_type} />{x.charge_type}</span>
            <span className="h-2 rounded-full bg-muted"><span className={cn("block h-full rounded-full", CHARGE_TONE[x.charge_type] ?? "bg-slate-400")} style={{ width: `${(x.amount / Math.max(revTotal, 1)) * 100}%` }} /></span>
            <span className="text-end tabular-nums">{rs(x.amount)}</span></div>)}
          {!r?.revenue.length && <div className="text-sm text-muted-foreground">No billed stays in this period.</div>}</section>
        <section className="rounded-2xl border border-border bg-card p-4"><div className="mb-3 text-sm font-bold">Census by ward</div>
          {(r?.census ?? []).map((c) => <div key={c.ward} className="mb-2"><div className="flex justify-between text-sm"><span>{c.ward}</span><b className="tabular-nums">{c.occupied ?? 0}/{c.beds}</b></div>
            <div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-teal-500" style={{ width: `${((c.occupied ?? 0) / Math.max(c.beds, 1)) * 100}%` }} /></div></div>)}</section>
        <section className="rounded-2xl border border-border bg-card p-4"><div className="mb-3 text-sm font-bold">Discharges by type · by doctor</div>
          <div className="mb-3 flex flex-wrap gap-2">{Object.entries(r?.discharge_types ?? {}).map(([k, v]) => <span key={k} className="rounded-full bg-muted px-3 py-1 text-sm"><b>{v}</b> {k}</span>)}</div>
          {(r?.doctors ?? []).slice(0, 8).map((d) => <div key={d.doctor} className="flex justify-between border-t border-border py-1 text-sm"><span>{d.doctor}</span><b>{d.n}</b></div>)}</section>
        <section className="rounded-2xl border border-border bg-card p-4"><div className="mb-3 text-sm font-bold">Emergency visits</div>
          <table className="w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="text-start">Triage</th><th className="text-start">Outcome</th><th className="text-end">Visits</th><th className="text-end">Avg min</th></tr></thead>
            <tbody>{(r?.er ?? []).map((e, i) => <tr key={i} className="border-t border-border"><td>{e.level}</td><td>{e.disposition}</td><td className="text-end">{e.n}</td><td className="text-end tabular-nums">{Math.round(e.minutes)}</td></tr>)}</tbody></table></section>
        <section className="rounded-2xl border border-border bg-card p-4 lg:col-span-3"><div className="mb-3 text-sm font-bold">Outstanding after discharge</div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr>{["Admission", "Patient", "Billing", "Released", "Patient owes", "Payer owes"].map((h) => <th key={h} className="px-2 py-1 text-start">{h}</th>)}</tr></thead>
            <tbody>{(r?.outstanding ?? []).map((o) => <tr key={o.name} className="border-t border-border"><td className="px-2 py-1.5 font-mono text-xs">{o.name}</td><td className="px-2 py-1.5">{o.patient_name}</td>
              <td className="px-2 py-1.5">{o.payer_type}{o.payer ? ` · ${o.payer}` : ""}</td><td className="px-2 py-1.5">{dOnly(o.release_datetime)}</td><td className="px-2 py-1.5 tabular-nums">{rs(o.patient_due)}</td>
              <td className="px-2 py-1.5 tabular-nums">{rs(o.payer_due)}</td></tr>)}</tbody></table>
            {!r?.outstanding.length && <div className="p-4 text-center text-sm text-muted-foreground">Nothing outstanding.</div>}</div></section>
      </div>
    </div>
  );
}
