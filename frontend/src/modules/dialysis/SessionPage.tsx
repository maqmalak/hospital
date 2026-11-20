/** Dialysis session chart (D-99) — tablet-first bedside screen: pre-dialysis, settings, intra-dialysis observations, complications, medicines,
 *  post-dialysis, adequacy (URR / Kt/V computed on the server), consumables, alerts, nurse + doctor sign-off, session sheet PDF. */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Droplets, FileText, LogIn, Pill, Play, Plus, Save, Scale, ShieldCheck, Stethoscope, Trash2 } from "lucide-react";
import { call, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Field, inputCls } from "@/components/common";
import { Button } from "@/components/ui/button";
import { humanizeError } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { fmtDate, openDoc, PayChip, ScreenChip, type Screening, useDialysisLive, ZoneChip } from "./shared";

type Row = Record<string, string | number | null | undefined>;
interface S {
  name: string; dialysis_patient: string; patient: string; patient_name: string; session_date: string; shift: string; station?: string; ward_location?: string; status: string;
  session_type: string; payment_status: string; token_no?: string; alerts_list: string[]; weight_gain?: number; urr?: number; ktv?: number; nurse_signed_by?: string;
  nurse_signed_at?: string; doctor_signed_by?: string; doctor_signed_at?: string; observations: Row[]; complications: Row[]; medicines: Row[]; consumables: Row[];
  profile: Record<string, string | number | null>; screening: Screening; prev: Row[]; package: { remaining: number; total: number };
  consumable_items: { item_code: string; item_name: string }[]; [k: string]: unknown;
}
const NUM = ["pre_weight", "pre_bp_sys", "pre_bp_dia", "pre_pulse", "pre_temp", "reuse_no", "blood_flow", "dialysate_flow", "uf_goal", "duration_hrs", "post_weight", "post_bp_sys",
  "post_bp_dia", "post_pulse", "total_uf", "pre_urea", "post_urea"];
const TXT = ["access_check", "pre_symptoms", "pre_notes", "machine_serial", "dialyser_type", "dialyser_use", "heparin", "haemostasis", "condition", "doctor_note"];
const COMPS = ["Hypotension", "Cramps", "Nausea / vomiting", "Chest pain", "Headache", "Clotting", "Fever / rigors", "Access bleeding", "Arrhythmia", "Hypertension", "Other"];
const nowHM = () => new Date().toTimeString().slice(0, 5);
/** Frappe Time values can arrive as "8:52:00" — time inputs need "08:52". */
const hhmm = (v: unknown) => { const m = String(v ?? "").match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : ""; };

export default function SessionPage() {
  const { name = "" } = useParams();
  const { hasRole } = useAuth();
  const { data, refetch } = useApi<S>("dialysis.session", { name });
  useDialysisLive(["dialysis.session"]);
  const [f, setF] = useState<Record<string, string>>({});
  const [obs, setObs] = useState<Row[]>([]);
  const [comps, setComps] = useState<Row[]>([]);
  const [meds, setMeds] = useState<Row[]>([]);
  const [cons, setCons] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data || dirty) return;
    // empty Int / Float come back from Frappe as 0 — no chart value here is meaningfully 0, so show them blank
    setF(Object.fromEntries([...NUM, ...TXT].map((k) => [k, data[k] == null || data[k] === 0 ? "" : String(data[k])])));
    setObs(data.observations.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === 0 && k !== "arterial_p" ? "" : v])))); setComps(data.complications); setMeds(data.medicines); setCons(data.consumables);
  }, [data, dirty]);
  const locked = !!data?.nurse_signed_by && !hasRole("PW Nephrologist");
  const neph = hasRole("PW Nephrologist");
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };
  const payload = () => ({ ...Object.fromEntries(NUM.map((k) => [k, f[k] === "" ? null : Number(f[k])])), ...Object.fromEntries(TXT.map((k) => [k, f[k] || null])),
    observations: obs, complications: comps, medicines: meds, consumables: cons });

  const run = async (method: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await call(method, args); toast.success(ok); setDirty(false); await refetch(); }
    catch (e) { toast.error(humanizeError(e), { duration: 8000 }); } finally { setBusy(false); }
  };
  const save = (extra: Record<string, unknown> = {}) => run("dialysis.chart", { name, data: { ...payload(), ...extra } }, extra.start ? "Session started" : "Saved");
  const liveGain = useMemo(() => {
    const last = data?.prev?.[0]?.post_weight as number | undefined;
    const pre = Number(f.pre_weight);
    return pre && last ? Math.round((pre - last) * 10) / 10 : null;
  }, [f.pre_weight, data]);

  if (!data) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const p = data.profile;
  const st = data.status;
  return (
    <div className="mx-auto max-w-[1200px] pb-24">
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/dialysis" className="rounded-lg p-1.5 hover:bg-muted" aria-label="Back to the board"><ArrowLeft className="h-5 w-5" /></Link>
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 text-white"><Droplets className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <Link to={`/dialysis/patient/${data.dialysis_patient}`} className="block truncate text-lg font-black hover:text-sky-700">{data.patient_name}</Link>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{fmtDate(data.session_date)} · {data.shift} · {data.station || data.ward_location || "no station"} · {data.session_type}
              <ZoneChip zone={String(p.zone || "Negative")} /><PayChip status={data.payment_status} /><ScreenChip s={data.screening} />
              {data.package.total ? <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">Package {data.package.remaining}/{data.package.total}</span> : null}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold">{st}{data.token_no ? ` · ${data.token_no}` : ""}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {st === "Scheduled" && <Button disabled={busy} onClick={() => void run("dialysis.checkin", { name }, "Checked in")}><LogIn className="h-4 w-4" />Check in</Button>}
            {st === "Checked-in" && <Button disabled={busy} onClick={() => void save({ start: 1 })}><Play className="h-4 w-4" />Start</Button>}
            {!locked && st !== "Cancelled" && st !== "Missed" && <Button variant="save" disabled={busy || !dirty} onClick={() => void save()}><Save className="h-4 w-4" />Save</Button>}
            {(st === "In Session" || st === "Checked-in") && <Button variant="submit" disabled={busy} onClick={async () => { if (dirty) await save(); void run("dialysis.complete", { name }, "Session completed — consumables deducted"); }}><CheckCircle2 className="h-4 w-4" />Complete</Button>}
            {st === "Completed" && !data.nurse_signed_by && <Button variant="submit" disabled={busy} onClick={() => void run("dialysis.sign", { name }, "Signed")}><ShieldCheck className="h-4 w-4" />Nurse sign</Button>}
            {st === "Completed" && neph && !data.doctor_signed_by && <Button variant="workflow" disabled={busy} onClick={() => void run("dialysis.sign", { name, as_doctor: 1, note: f.doctor_note || undefined }, "Doctor signed")}><Stethoscope className="h-4 w-4" />Doctor sign</Button>}
            <Button variant="outline" onClick={() => openDoc("session", name)}><FileText className="h-4 w-4" />Sheet</Button>
          </div>
        </div>
        {!!data.alerts_list.length && <div className="mt-2 flex flex-wrap gap-1.5" role="alert">{data.alerts_list.map((a) => <span key={a} className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white"><AlertTriangle className="h-3.5 w-3.5" />{a}</span>)}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Card title="Pre-dialysis" icon={Scale}>
            <Grid>
              <Num label="Weight (kg)" k="pre_weight" f={f} set={set} dis={locked} hint={liveGain != null ? `Gain since last: ${liveGain} kg${liveGain > 3 ? " — HIGH" : ""}` : p.dry_weight ? `Dry weight ${p.dry_weight} kg` : undefined} warn={liveGain != null && liveGain > 3} />
              <Num label="BP systolic" k="pre_bp_sys" f={f} set={set} dis={locked} warn={!!f.pre_bp_sys && (Number(f.pre_bp_sys) < 90 || Number(f.pre_bp_sys) > 180)} />
              <Num label="BP diastolic" k="pre_bp_dia" f={f} set={set} dis={locked} />
              <Num label="Pulse" k="pre_pulse" f={f} set={set} dis={locked} />
              <Num label="Temp (°C)" k="pre_temp" f={f} set={set} dis={locked} step="0.1" warn={Number(f.pre_temp) >= 37.8} />
              <Sel label="Access check" k="access_check" f={f} set={set} dis={locked} opts={["Good thrill / bruit", "Weak thrill", "No thrill", "Catheter site clean", "Catheter site red / discharge", "Catheter flow poor"]} />
            </Grid>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><Txt label="Symptoms" k="pre_symptoms" f={f} set={set} dis={locked} /><Txt label="Nurse notes" k="pre_notes" f={f} set={set} dis={locked} /></div>
          </Card>

          <Card title="Settings" icon={ClipboardCheck}>
            <Grid>
              <TextIn label="Machine" k="machine_serial" f={f} set={set} dis={locked} />
              <TextIn label="Dialyser" k="dialyser_type" f={f} set={set} dis={locked} />
              <Sel label="New / reuse" k="dialyser_use" f={f} set={set} dis={locked} opts={["New", "Reuse"]} />
              {f.dialyser_use === "Reuse" && <Num label="Reuse no." k="reuse_no" f={f} set={set} dis={locked} />}
              <Num label="Blood flow (mL/min)" k="blood_flow" f={f} set={set} dis={locked} />
              <Num label="Dialysate flow" k="dialysate_flow" f={f} set={set} dis={locked} />
              <Num label="UF goal (L)" k="uf_goal" f={f} set={set} dis={locked} step="0.1" />
              <TextIn label="Heparin" k="heparin" f={f} set={set} dis={locked} />
              <Num label="Duration (h)" k="duration_hrs" f={f} set={set} dis={locked} step="0.25" />
            </Grid>
          </Card>

          <Card title="Intra-dialysis observations" icon={Activity} action={!locked && <Button size="sm" onClick={() => { setObs((o) => [...o, { obs_time: nowHM(), bp_sys: "", bp_dia: "", pulse: "", venous_p: "", arterial_p: "", blood_flow: f.blood_flow, uf_removed: "" }]); setDirty(true); }}><Plus className="h-4 w-4" />Add reading</Button>}>
            {obs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="text-xs text-muted-foreground">{["Time", "BP sys", "BP dia", "Pulse", "VP", "AP", "QB", "UF (L)", "Note", ""].map((h) => <th key={h} className="px-1 py-1 text-start">{h}</th>)}</tr></thead>
              <tbody>{obs.map((o, i) => <tr key={i}>{(["obs_time", "bp_sys", "bp_dia", "pulse", "venous_p", "arterial_p", "blood_flow", "uf_removed", "note"] as const).map((k) => (
                <td key={k} className="px-1 py-1"><input disabled={locked} type={k === "obs_time" ? "time" : k === "note" ? "text" : "number"} step={k === "uf_removed" ? "0.1" : undefined} inputMode={k === "note" || k === "obs_time" ? undefined : "decimal"}
                  className={cn(inputCls, "h-11 min-w-[64px] px-2 text-base", k === "bp_sys" && o.bp_sys !== "" && o.bp_sys != null && (Number(o.bp_sys) < 90 || Number(o.bp_sys) > 180) && "border-rose-500 bg-rose-50 dark:bg-rose-500/10")}
                  value={k === "obs_time" ? hhmm(o[k]) : String(o[k] ?? "")} onChange={(e) => { const v = e.target.value; setObs((xs) => xs.map((x, j) => j === i ? { ...x, [k]: v } : x)); setDirty(true); }} /></td>))}
                <td>{!locked && <button aria-label="Remove reading" className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={() => { setObs((xs) => xs.filter((_x, j) => j !== i)); setDirty(true); }}><Trash2 className="h-4 w-4" /></button>}</td></tr>)}</tbody></table></div>
              : <p className="text-sm text-muted-foreground">Record BP, pulse, pressures and UF every 30–60 minutes.</p>}
          </Card>

          <Card title="Complications & medicines" icon={Pill}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Complications</div>
                <div className="mb-2 flex flex-wrap gap-1.5">{COMPS.map((c) => <button key={c} disabled={locked} onClick={() => { setComps((x) => [...x, { comp_time: nowHM(), complication: c, action: "" }]); setDirty(true); }}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">{c}</button>)}</div>
                {comps.map((c, i) => <div key={i} className="mb-2 rounded-xl border border-rose-300 bg-rose-50 p-2 dark:border-rose-500/40 dark:bg-rose-500/10">
                  <div className="flex items-center gap-2 text-sm font-bold"><span className="flex-1">{String(c.complication)} · {hhmm(c.comp_time)}</span>{!locked && <button aria-label="Remove" onClick={() => { setComps((x) => x.filter((_y, j) => j !== i)); setDirty(true); }}><Trash2 className="h-4 w-4" /></button>}</div>
                  <input disabled={locked} className={cn(inputCls, "mt-1")} placeholder="Action taken (e.g. UF stopped, 200 mL saline)" value={String(c.action ?? "")} onChange={(e) => { const v = e.target.value; setComps((x) => x.map((y, j) => j === i ? { ...y, action: v } : y)); setDirty(true); }} /></div>)}
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted-foreground">Medicines given{!locked && <span className="flex gap-1">{["Erythropoietin|4000 IU|IV", "Iron sucrose|100 mg|Via circuit", "Antibiotic|—|IV"].map((m) => { const [n, d, r] = m.split("|"); return (
                  <button key={n} className="rounded-full border border-border px-2 py-0.5 normal-case hover:bg-muted" onClick={() => { setMeds((x) => [...x, { medicine: n, dose: d, route: r, batch_no: "", given_at: nowHM() }]); setDirty(true); }}>+ {n.split(" ")[0]}</button>); })}</span>}</div>
                {meds.map((m, i) => <div key={i} className="mb-2 grid grid-cols-2 gap-1.5 rounded-xl border border-border p-2 sm:grid-cols-4">
                  {(["medicine", "dose", "route", "batch_no"] as const).map((k) => <input key={k} disabled={locked} className={inputCls} placeholder={k === "batch_no" ? "Batch no." : k} value={String(m[k] ?? "")} onChange={(e) => { const v = e.target.value; setMeds((x) => x.map((y, j) => j === i ? { ...y, [k]: v } : y)); setDirty(true); }} />)}</div>)}
                {!meds.length && <p className="text-sm text-muted-foreground">EPO, iron, antibiotics — with batch number.</p>}
              </div>
            </div>
          </Card>

          <Card title="Post-dialysis" icon={CheckCircle2}>
            <Grid>
              <Num label="Weight (kg)" k="post_weight" f={f} set={set} dis={locked} hint={f.pre_weight && f.post_weight ? `Removed ${(Number(f.pre_weight) - Number(f.post_weight)).toFixed(1)} kg` : undefined} />
              <Num label="BP systolic" k="post_bp_sys" f={f} set={set} dis={locked} warn={!!f.post_bp_sys && (Number(f.post_bp_sys) < 90 || Number(f.post_bp_sys) > 180)} />
              <Num label="BP diastolic" k="post_bp_dia" f={f} set={set} dis={locked} />
              <Num label="Pulse" k="post_pulse" f={f} set={set} dis={locked} />
              <Num label="Total UF (L)" k="total_uf" f={f} set={set} dis={locked} step="0.1" />
              <Sel label="Access haemostasis" k="haemostasis" f={f} set={set} dis={locked} opts={["Good", "Prolonged bleeding", "Catheter locked"]} />
              <Sel label="Condition at discharge" k="condition" f={f} set={set} dis={locked} opts={["Stable", "Unwell — observed", "Admitted", "Referred"]} />
            </Grid>
          </Card>

          <Card title="Adequacy (monthly)" icon={Droplets}>
            <Grid>
              <Num label="Pre urea (mg/dL)" k="pre_urea" f={f} set={set} dis={locked} />
              <Num label="Post urea (mg/dL)" k="post_urea" f={f} set={set} dis={locked} />
              <div className="rounded-xl bg-sky-50 p-3 dark:bg-sky-500/10"><div className="text-xs text-muted-foreground">URR (target ≥ 65 %)</div><div className={cn("text-2xl font-black", data.urr && data.urr < 65 ? "text-rose-600" : "text-sky-800 dark:text-sky-200")}>{data.urr ? `${data.urr}%` : "—"}</div></div>
              <div className="rounded-xl bg-violet-50 p-3 dark:bg-violet-500/10"><div className="text-xs text-muted-foreground">spKt/V (target ≥ 1.2)</div><div className={cn("text-2xl font-black", data.ktv && data.ktv < 1.2 ? "text-rose-600" : "text-violet-800 dark:text-violet-200")}>{data.ktv ?? "—"}</div></div>
            </Grid>
            <p className="mt-2 text-xs text-muted-foreground">Calculated on save: URR = (1 − post/pre) × 100; Kt/V by Daugirdas II using time, UF and post weight.</p>
          </Card>

          {neph && <Card title="Doctor note" icon={Stethoscope}><Txt label="Nephrologist note" k="doctor_note" f={f} set={set} dis={false} /></Card>}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-36 lg:self-start">
          <Card title="Prescription" icon={ClipboardCheck}>
            <dl className="space-y-1 text-sm">{([["Dry weight", p.dry_weight && `${p.dry_weight} kg`], ["Access", `${p.access_type ?? "—"} ${p.access_site ?? ""}`], ["Dialyser", p.dialyser], ["QB / QD", `${p.blood_flow ?? "—"} / ${p.dialysate_flow ?? "—"}`],
              ["Dialysate", p.dialysate], ["Heparin", p.heparin], ["Duration", p.rx_duration_hrs && `${p.rx_duration_hrs} h`], ["UF guidance", p.uf_guidance], ["EPO / iron", `${p.epo ?? "—"} · ${p.iron ?? "—"}`], ["Allergies", p.allergies_note || "None known"]] as [string, unknown][])
              .map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-end font-medium">{String(v || "—")}</dd></div>)}</dl>
          </Card>
          <Card title="Last sessions" icon={Scale}>
            <table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-start">Date</th><th>Pre</th><th>Post</th><th>BP</th><th>UF</th></tr></thead>
              <tbody>{data.prev.map((x) => <tr key={String(x.name)} className="border-t border-border"><td className="py-1">{fmtDate(String(x.session_date), { day: "numeric", month: "short" })}</td><td className="text-center">{x.pre_weight ?? "—"}</td><td className="text-center">{x.post_weight ?? "—"}</td><td className="text-center">{x.pre_bp_sys}/{x.pre_bp_dia}</td><td className="text-center">{x.total_uf ?? "—"}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Consumables" icon={Pill}>
            {cons.length ? <ul className="space-y-1 text-sm">{cons.map((c, i) => <li key={i} className="flex items-center gap-2"><span className="flex-1">{String(c.item_name || c.item_code)}</span>
              <input disabled={locked || st === "Completed"} type="number" className={cn(inputCls, "h-8 w-16")} value={String(c.qty ?? 1)} onChange={(e) => { const v = e.target.value; setCons((x) => x.map((y, j) => j === i ? { ...y, qty: v } : y)); setDirty(true); }} /></li>)}</ul>
              : <p className="text-xs text-muted-foreground">The standard set is deducted from the Dialysis Store on completion.{st !== "Completed" && <button className="ms-1 font-semibold text-sky-700 dark:text-sky-300" onClick={() => { setCons(data.consumable_items.slice(0, 7).map((x) => ({ ...x, qty: 1 }))); setDirty(true); }}>Edit list</button>}</p>}
          </Card>
          {data.nurse_signed_by && <p className="rounded-xl bg-emerald-50 p-3 text-xs dark:bg-emerald-500/10">Nurse signed {String(data.nurse_signed_at).slice(0, 16)}{data.doctor_signed_at ? ` · doctor signed ${String(data.doctor_signed_at).slice(0, 16)}` : ""}. {locked ? "Locked — the nephrologist can amend." : ""}</p>}
        </aside>
      </div>
    </div>
  );
}

function Card({ title, icon: I, children, action }: { title: string; icon: typeof Droplets; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><I className="h-4 w-4" /></span><h2 className="flex-1 font-bold">{title}</h2>{action}</div>{children}</section>;
}
const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
type FP = { label: string; k: string; f: Record<string, string>; set: (k: string, v: string) => void; dis: boolean };
function Num({ label, k, f, set, dis, step, hint, warn }: FP & { step?: string; hint?: string; warn?: boolean }) {
  return <Field label={label} hint={hint ? <span className={warn ? "font-bold text-rose-600" : ""}>{hint}</span> : undefined}><input disabled={dis} type="number" inputMode="decimal" step={step} className={cn(inputCls, "h-12 text-lg font-semibold", warn && "border-rose-500 bg-rose-50 dark:bg-rose-500/10")} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>;
}
function TextIn({ label, k, f, set, dis }: FP) {
  return <Field label={label}><input disabled={dis} className={cn(inputCls, "h-12")} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>;
}
function Sel({ label, k, f, set, dis, opts }: FP & { opts: string[] }) {
  return <Field label={label}><select disabled={dis} className={cn(inputCls, "h-12")} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}</select></Field>;
}
function Txt({ label, k, f, set, dis }: FP) {
  return <Field label={label}><textarea disabled={dis} className={cn(inputCls, "h-20 py-2")} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>;
}
