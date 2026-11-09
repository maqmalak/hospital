import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, BedDouble, CalendarPlus, CheckCircle2, ClipboardCheck, FileText, IdCard, LogOut, Plus, Printer, Receipt, Smartphone, Soup, Users, X } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { printDoc } from "@/lib/print";
import { Empty, Field, inputCls, Tabs } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { ChargeDialog, ChargesTable, LabsPanel, type LabOrder, MedicationPanel, NotesPanel, type Note, type Order, type Dose, type Proc, ProceduresPanel, type Vital, VitalsPanel } from "./panels";
import { type SummaryPrint, summaryHtml, wristbandHtml } from "./prints";
import { type Bill, Chip, type Ctx, dOnly, dt, IpdHero, rs, useIpdLive } from "./shared";

interface Chart {
  name: string; patient: string; patient_name: string; status: string; branch: string; bed: string; bed_no?: string; ward: string; admit_datetime: string; expected_discharge?: string;
  release_datetime?: string; admitting_doctor: string; doctor_name?: string; source: string; reason?: string; provisional_diagnosis?: string; payer_type: string; payer?: string;
  pre_auth?: string; service_package?: string; coverage_percent?: number; final_invoice?: string; discharge_type?: string; discharge_summary?: string; days: number; er_visit?: string;
  segments: { bed: string; bed_no?: string; ward: string; ward_type?: string; from_time: string; to_time?: string; daily_rate: number; icu_surcharge?: number; reason?: string }[];
  patient_info: { name: string; patient_name: string; patient_name_ur?: string; gender: string; age?: number; phone?: string; photo?: string; category?: string; blood_group?: string;
    temporary_record?: number; allergies: { allergy: string; severity?: string; reaction?: string }[] };
  notes: Note[]; rounds: { name: string; round_no: number; doctor: string; round_at: string; findings?: string; plan?: string; orders?: string }[];
  orders: Order[]; mar: Dose[]; vitals: Vital[]; diet: { name: string; diet_date: string; diet_type: string; breakfast: number; lunch: number; dinner: number; snacks: number; status: string; charge: number; instructions?: string }[];
  procedures: Proc[]; consents: { name: string; consent_type: string; signer_name: string; witness_name: string; signed_at: string }[]; labs: LabOrder[];
  summary?: Record<string, unknown> | null; comms_active: number; on_duty: { employee_name: string; hv_is_head_nurse: number; shift: string }[];
}
type TabKey = "overview" | "notes" | "meds" | "vitals" | "diet" | "procedures" | "labs" | "charges" | "discharge";

export default function ChartPage() {
  const { name = "" } = useParams();
  const [sp] = useSearchParams();
  const qc = useQueryClient();
  const { hasRole, branch } = useAuth();
  const [tab, setTab] = useState<TabKey>((sp.get("tab") as TabKey) || "overview");
  const [dlg, setDlg] = useState<"transfer" | "charge" | "token" | null>(sp.get("new") ? "token" : null);
  const [token, setToken] = useState<string | null>(null);
  const { data: c, refetch } = useApi<Chart>("ipd.chart", { name });
  const { data: bill, refetch: rebill } = useApi<Bill>("ipd.bill", { name }, { enabled: !!name });
  const { data: ctx } = useApi<Ctx>("ipd.context", { branch });
  useIpdLive(["ipd.chart", "ipd.bill"]);
  const refresh = () => { void refetch(); void rebill(); void qc.invalidateQueries({ queryKey: ["ward.bed_map"] }); };
  const isDoctor = hasRole("PW Doctor");
  const isNurse = hasRole("PW Nurse");
  const open = c && ["Admitted", "Discharge Pending"].includes(c.status);
  const dueNow = useMemo(() => (c?.mar ?? []).filter((d) => ["Scheduled", "Approved", "Pending Approval"].includes(d.status) && d.scheduled_at <= new Date(Date.now() + 3600_000).toISOString().replace("T", " ")).length, [c]);
  if (!c) return <div className="flex h-64 items-center justify-center"><Spinner size={28} /></div>;
  const p = c.patient_info;
  const wristband = () => void printDoc(wristbandHtml({ name: p.name, patient_name: p.patient_name, gender: p.gender, age: p.age, admission: c.name, ward: c.ward, bed_no: c.bed_no,
    doctor: c.doctor_name, allergies: p.allergies.map((a) => a.allergy), blood_group: p.blood_group }), "label");
  const tabs: { key: TabKey; label: string; count?: number }[] = [{ key: "overview", label: "Overview" }, { key: "notes", label: "Notes & rounds", count: c.notes.length + c.rounds.length },
    { key: "meds", label: "Medication", count: dueNow || undefined }, { key: "vitals", label: "Vitals", count: c.vitals.length }, { key: "diet", label: "Diet" },
    { key: "procedures", label: "Procedures", count: c.procedures.length || undefined }, { key: "labs", label: "Labs", count: c.labs.length || undefined },
    { key: "charges", label: "Charges" }, { key: "discharge", label: "Discharge" }];
  return (
    <div className="mx-auto max-w-[1500px]">
      <IpdHero title={<span className="flex flex-wrap items-center gap-2">{p.patient_name}{p.temporary_record ? <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">TEMPORARY MR</span> : null}
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", c.status === "Admitted" ? "bg-emerald-400 text-emerald-950" : c.status === "Discharged" ? "bg-white/20" : "bg-amber-400 text-amber-950")}>{c.status}</span></span>}
        sub={<span className="flex flex-wrap items-center gap-x-3"><span className="flex items-center gap-1"><IdCard className="h-3.5 w-3.5" />{p.name}</span><span>{p.age}y · {p.gender}</span>
          <span>{c.name}</span><span>{c.ward} · bed {c.bed_no}</span><span>Day {Math.max(c.days, 1)}</span><span>{c.doctor_name}</span></span>}
        actions={<>
          <Button size="sm" className="bg-white/15 text-white hover:bg-white/25" onClick={wristband}><Printer className="h-4 w-4" />Wristband</Button>
          {open && <Button size="sm" className="bg-white/15 text-white hover:bg-white/25" onClick={() => setDlg("transfer")}><ArrowRightLeft className="h-4 w-4" />Transfer</Button>}
          {open && <Button size="sm" className="bg-white/15 text-white hover:bg-white/25" onClick={async () => { const d = prompt("Extend the stay by how many days?", "1"); if (!d) return;
            try { await call("ipd.extend", { name: c.name, days: Number(d) || 1 }); toast.success("Stay extended"); refresh(); } catch (e) { toast.error(humanizeError(e)); } }}><CalendarPlus className="h-4 w-4" />Extend</Button>}
          <Link to={`/ipd_slip?adm=${c.name}`}><Button size="sm" className="bg-white text-teal-900 hover:bg-white/90"><Receipt className="h-4 w-4" />Bill {rs(bill?.patient_share)}</Button></Link>
        </>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {[["Billing", `${c.payer_type}${c.payer ? ` · ${c.payer}` : ""}`], ["Running bill", rs((bill?.patient_share ?? 0) + (bill?.payer_share ?? 0))], ["Advances", rs(bill?.advances)],
            ["Balance", rs(bill?.balance)], ["Admitted", dt(c.admit_datetime)], ["Expected out", dt(c.expected_discharge)]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur"><div className="text-[10px] uppercase tracking-widest text-white/60">{k}</div><div className="truncate text-sm font-bold">{v}</div></div>))}
        </div>
      </IpdHero>
      {p.allergies.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-rose-400 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
        <AlertTriangle className="h-5 w-5" />Allergies: {p.allergies.map((a) => `${a.allergy}${a.severity ? ` (${a.severity})` : ""}`).join(", ")}</div>}
      <div className="mb-4 overflow-x-auto"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>

      {tab === "overview" && <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Admission">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {[["Source", c.source + (c.er_visit ? ` · ${c.er_visit}` : "")], ["Reason", c.reason], ["Provisional diagnosis", c.provisional_diagnosis], ["Package", c.service_package],
                ["Pre-auth", c.pre_auth], ["Coverage", c.coverage_percent ? `${c.coverage_percent}%` : "—"]].map(([k, v]) => <div key={k}><dt className="text-[11px] font-semibold uppercase text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>)}
            </dl>
          </Card>
          <Card title="Bed history">
            <ol className="relative ms-3 border-s-2 border-teal-200 dark:border-teal-500/30">{c.segments.map((s, i) => (
              <li key={i} className="mb-3 ms-4"><span className="absolute -start-[9px] mt-1 h-4 w-4 rounded-full border-2 border-card bg-teal-500" />
                <div className="text-sm font-bold">{s.ward} · bed {s.bed_no} <span className="font-normal text-muted-foreground">{rs(s.daily_rate)}/day{s.icu_surcharge ? ` + ICU ${rs(s.icu_surcharge)}` : ""}</span></div>
                <div className="text-xs text-muted-foreground">{dt(s.from_time)} → {s.to_time ? dt(s.to_time) : "now"} · {s.reason}</div></li>))}</ol>
          </Card>
          <Card title="Latest notes">{c.notes.slice(0, 3).map((n) => <div key={n.name} className="mb-2 border-b border-border pb-2 text-sm last:border-0"><div className="text-xs text-muted-foreground">{n.note_type} · {dt(n.recorded_at)}</div>{n.note}</div>)}
            {!c.notes.length && <div className="text-sm text-muted-foreground">No notes yet.</div>}</Card>
        </div>
        <div className="space-y-4">
          <Card title="Latest vitals">{c.vitals[0] ? <div className="grid grid-cols-3 gap-2 text-center">{([["BP", c.vitals[0].bp_systolic ? `${c.vitals[0].bp_systolic}/${c.vitals[0].bp_diastolic}` : "—"],
            ["Pulse", c.vitals[0].pulse], ["SpO₂", c.vitals[0].spo2], ["Temp", c.vitals[0].temperature], ["Resp", c.vitals[0].resp_rate], ["Pain", c.vitals[0].pain_score]] as const).map(([k, v]) =>
            <div key={k} className="rounded-xl bg-muted/60 p-2"><div className="text-[10px] uppercase text-muted-foreground">{k}</div><div className="text-lg font-black tabular-nums">{v || "—"}</div></div>)}
            <div className="col-span-3 text-xs text-muted-foreground">{dt(c.vitals[0].recorded_at)}</div></div> : <div className="text-sm text-muted-foreground">None yet.</div>}</Card>
          <Card title="Doses due (next hour)"><div className="text-3xl font-black">{dueNow}</div><button className="text-sm font-semibold text-teal-700 dark:text-teal-300" onClick={() => setTab("meds")}>Open the drug chart →</button></Card>
          <Card title="On duty"><div className="space-y-1">{c.on_duty.map((n, i) => <div key={i} className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-muted-foreground" />{n.employee_name}
            {n.hv_is_head_nurse ? <span className="rounded bg-violet-100 px-1.5 text-[10px] font-bold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">IN CHARGE</span> : null}<span className="text-xs text-muted-foreground">{n.shift}</span></div>)}
            {!c.on_duty.length && <div className="text-sm text-muted-foreground">No nurse on the roster for this ward now.</div>}</div></Card>
          <Card title="Bedside messaging"><div className="flex items-center gap-2 text-sm"><Smartphone className="h-4 w-4" />{c.comms_active ? "Active" : "Off"}</div>
            {open && <Button size="sm" variant="neutral" className="mt-2" onClick={() => setDlg("token")}>Bedside link</Button>}</Card>
        </div>
      </div>}

      {tab === "notes" && <NotesPanel target={{ bed_allotment: c.name }} notes={c.notes} rounds={c.rounds} refresh={refresh} canWrite={!!open && (isDoctor || isNurse || hasRole("PW DEO"))} isDoctor={isDoctor} />}
      {tab === "meds" && !!ctx?.flags.pharmacy_bills && <div className="mb-3 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
        Ward medicines are dispensed and billed by the contract pharmacy: each order goes to the pharmacy as a prescription and the attendant pays at the pharmacy counter. The drug chart here is for nursing only.</div>}
      {tab === "meds" && <MedicationPanel target={{ bed_allotment: c.name }} patient={c.patient} orders={c.orders} mar={c.mar} refresh={refresh} gate={!!ctx?.flags.mar_gate}
        canOrder={!!open && isDoctor} canChart={!!open && (isNurse || isDoctor)} />}
      {tab === "vitals" && <VitalsPanel target={{ bed_allotment: c.name }} vitals={c.vitals} refresh={refresh} canAdd={!!open && (isNurse || isDoctor || hasRole("PW DEO"))} />}
      {tab === "diet" && <DietTab c={c} ctx={ctx} refresh={refresh} canWrite={!!open && (isNurse || isDoctor)} />}
      {tab === "procedures" && <ProceduresPanel target={{ bed_allotment: c.name }} procs={c.procedures} ctx={ctx} refresh={refresh} canWrite={!!open && (isNurse || isDoctor)} />}
      {tab === "labs" && <LabsPanel target={{ bed_allotment: c.name }} labs={c.labs} ctx={ctx} refresh={refresh} canOrder={!!open && (isDoctor || isNurse || hasRole("PW Receptionist"))} />}
      {tab === "charges" && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><div className="flex-1 text-sm text-muted-foreground">Bed, ICU and nursing are counted from the bed history until the final bill.</div>
          {open && !c.final_invoice && <Button size="sm" variant="save" onClick={() => setDlg("charge")}><Plus className="h-4 w-4" />Add charge</Button>}</div>
        <ChargesTable lines={bill?.lines ?? []} onCancel={hasRole("PW Receptionist", "PW Accountant", "PW Cash Supervisor") && !c.final_invoice ? async (n) => { const r = prompt("Why cancel this charge?"); if (!r) return;
          try { await call("ipd.cancel_charge", { name: n, reason: r }); toast.success("Charge cancelled"); refresh(); } catch (e) { toast.error(humanizeError(e)); } } : undefined} />
      </div>}
      {tab === "discharge" && <DischargeTab c={c} bill={bill} refresh={refresh} />}

      {dlg === "transfer" && <TransferDialog c={c} ctx={ctx} onClose={() => setDlg(null)} onDone={() => { setDlg(null); refresh(); }} />}
      {dlg === "charge" && <ChargeDialog target={{ bed_allotment: c.name }} ctx={ctx} onClose={() => setDlg(null)} onDone={() => { setDlg(null); refresh(); }} />}
      {dlg === "token" && <Dialog open onClose={() => setDlg(null)} title="Admission done — bedside items" size="sm">
        <div className="space-y-3 text-sm">
          <Button variant="save" className="w-full" onClick={wristband}><Printer className="h-4 w-4" />Print wristband</Button>
          <Button variant="neutral" className="w-full" onClick={async () => { try { const r = await call<{ token: string; bedside_url: string }>("ipd.new_comms_token", { name: c.name }); setToken(r.bedside_url); }
            catch (e) { toast.error(humanizeError(e)); } }}><Smartphone className="h-4 w-4" />Show bedside messaging link</Button>
          {token && <div className="break-all rounded-lg bg-muted p-2 font-mono text-xs">{window.location.origin}{token}</div>}
          <div className="text-xs text-muted-foreground">A new link replaces the old one. Bedside messaging screens arrive with Patient Comms (Phase 5).</div>
        </div>
      </Dialog>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>{children}</section>;
}

function TransferDialog({ c, ctx, onClose, onDone }: { c: Chart; ctx?: Ctx; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const wards = [...new Set((ctx?.beds ?? []).map((b) => b.ward))];
  return (
    <Dialog open onClose={onClose} title={`Transfer ${c.patient_name}`} description={`Now in ${c.ward} · bed ${c.bed_no}. The new bed's rate applies from now.`} size="lg">
      <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Step-down, needs ICU, patient request…" /></Field>
      <div className="mt-3 max-h-[50vh] space-y-3 overflow-y-auto">{wards.map((w) => (
        <div key={w}><div className="mb-1 text-xs font-bold text-muted-foreground">{w}</div><div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{ctx!.beds.filter((b) => b.ward === w).map((b) => (
          <button key={b.name} onClick={async () => { try { await call("ipd.transfer", { name: c.name, to_bed: b.name, reason }); toast.success(`Moved to ${b.bed_no}`); onDone(); } catch (e) { toast.error(humanizeError(e)); } }}
            className="rounded-lg border border-emerald-400 bg-emerald-50 py-2 text-sm font-semibold hover:bg-emerald-100 dark:bg-emerald-500/10"><div>{b.bed_no}</div><div className="text-[10px] font-normal text-muted-foreground">{rs(b.rate)}</div></button>))}</div></div>))}
        {!wards.length && <Empty title="No free bed" icon={BedDouble} />}</div>
    </Dialog>
  );
}

function DietTab({ c, ctx, refresh, canWrite }: { c: Chart; ctx?: Ctx; refresh: () => void; canWrite: boolean }) {
  const [type, setType] = useState("");
  const [meals, setMeals] = useState({ breakfast: 1, lunch: 1, dinner: 1, snacks: 0 });
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const order = async () => { try { await call("ipd.order_diet", { data: { bed_allotment: c.name, diet_type: type, diet_date: date, meals, instructions: notes } }); toast.success("Diet ordered"); setNotes(""); refresh(); }
    catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {canWrite && <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Soup className="h-4 w-4 text-lime-600" />Order diet <span className="font-normal text-muted-foreground">· billed {ctx?.flags.diet_mode.toLowerCase()}</span></h3>
        <div className="grid grid-cols-2 gap-2">{ctx?.diet_types.map((d) => <button key={d.name} onClick={() => setType(d.name)} className={cn("rounded-xl border p-2 text-start text-sm",
          type === d.name ? "border-lime-600 bg-lime-50 ring-2 ring-lime-500/30 dark:bg-lime-500/10" : "border-border")}><b>{d.name}</b><div className="text-[11px] text-muted-foreground">{rs(d.per_day_rate)}/day · {rs(d.per_meal_rate)}/meal</div></button>)}</div>
        <div className="flex flex-wrap gap-2">{(Object.keys(meals) as (keyof typeof meals)[]).map((k) => <label key={k} className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-sm capitalize">
          <input type="checkbox" checked={!!meals[k]} onChange={(e) => setMeals((m) => ({ ...m, [k]: e.target.checked ? 1 : 0 }))} />{k}</label>)}</div>
        <div className="grid grid-cols-2 gap-2"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /><input className={inputCls} placeholder="Instructions" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <Button variant="submit" className="w-full" disabled={!type} onClick={() => void order()}><CheckCircle2 className="h-4 w-4" />Order</Button>
      </section>}
      <div className="space-y-2">{c.diet.map((d) => (
        <div key={d.name} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm"><b className="w-28">{dOnly(d.diet_date)}</b><span className="font-semibold">{d.diet_type}</span>
          <span className="text-muted-foreground">{["breakfast", "lunch", "dinner", "snacks"].filter((k) => d[k as "lunch"]).join(" · ")}</span>{d.instructions && <span className="text-xs italic text-muted-foreground">{d.instructions}</span>}
          <span className="ms-auto tabular-nums">{rs(d.charge)}</span><Chip s={d.status} />
          {d.status === "Ordered" && canWrite && <button className="text-rose-600" title="Cancel" onClick={async () => { const r = prompt("Why cancel?"); if (!r) return; try { await call("ipd.cancel_diet", { name: d.name, reason: r }); refresh(); } catch (e) { toast.error(humanizeError(e)); } }}><X className="h-4 w-4" /></button>}</div>))}
        {!c.diet.length && <Empty title="No diet orders" icon={Soup} />}</div>
    </div>
  );
}

interface Clearance { checks: { key: string; label: string; ok: boolean; warn?: boolean; items?: string[]; amount?: number }[]; hold: number; ready_for_bill: boolean; ready: boolean }

function DischargeTab({ c, bill, refresh }: { c: Chart; bill?: Bill; refresh: () => void }) {
  const { hasRole } = useAuth();
  const { data: cl, refetch } = useApi<Clearance>("ipd.clearance", { name: c.name });
  const [type, setType] = useState(c.discharge_type || "Normal");
  const [f, setF] = useState<Record<string, string>>({ final_diagnosis: c.provisional_diagnosis || "", condition_at_discharge: "Improved" });
  const [meds, setMeds] = useState<{ medicine: string; dose: string; frequency: string; days: string; instructions: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const open = ["Admitted", "Discharge Pending"].includes(c.status);
  const go = async (method: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await call(method, args); toast.success(ok); refresh(); void refetch(); }
    catch (e) { const msg = humanizeError(e); toast.error(msg, { duration: 8000 }); if (/hold/i.test(msg) && hasRole("PW Doctor", "PW Cash Supervisor")) { const r = prompt(`${msg}\n\nOverride with a reason?`); if (r) await go(method, { ...args, override_reason: r }, ok); } }
    finally { setBusy(false); }
  };
  const printSummary = async () => { try { printDoc(summaryHtml(await call<SummaryPrint>("ipd.summary_print", { name: c.name })), "a4"); } catch (e) { toast.error(humanizeError(e)); } };
  const signed = !!c.discharge_summary;
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2"><FileText className="h-5 w-5 text-teal-600" /><h3 className="flex-1 font-bold">Discharge summary</h3>
          {signed && <><Chip s="Completed" className="bg-emerald-100 text-emerald-800" /><Button size="sm" variant="neutral" onClick={() => void printSummary()}><Printer className="h-4 w-4" />Print</Button></>}</div>
        {signed ? <div className="space-y-2 text-sm">{(["final_diagnosis", "treatment_summary", "procedures_done", "condition_at_discharge", "follow_up_plan", "follow_up_date"] as const).map((k) =>
          c.summary?.[k] ? <div key={k}><div className="text-[11px] font-semibold uppercase text-muted-foreground">{k.replace(/_/g, " ")}</div><div className="whitespace-pre-wrap">{String(c.summary[k])}</div></div> : null)}
          {!c.summary && <div className="text-muted-foreground">Signed ({c.discharge_summary}).</div>}</div>
        : !hasRole("PW Doctor") ? <div className="text-sm text-muted-foreground">The doctor writes and signs the summary.</div> : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">{["Normal", "LAMA", "Referred", "Expired"].map((t) => <button key={t} onClick={() => setType(t)} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold",
              type === t ? (t === "Expired" ? "border-slate-800 bg-slate-800 text-white" : t === "LAMA" ? "border-amber-600 bg-amber-600 text-white" : "border-teal-600 bg-teal-600 text-white") : "border-border")}>{t}</button>)}</div>
            <Field label="Final diagnosis" required><textarea className={inputCls + " h-16 py-2"} value={f.final_diagnosis ?? ""} onChange={set("final_diagnosis")} /></Field>
            <Field label="Treatment given"><textarea className={inputCls + " h-20 py-2"} value={f.treatment_summary ?? ""} onChange={set("treatment_summary")} /></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Procedures"><input className={inputCls} value={f.procedures_done ?? c.procedures.filter((p) => p.status === "Completed").map((p) => p.procedure_type).join(", ")} onChange={set("procedures_done")} /></Field>
              <Field label="Condition"><select className={inputCls} value={f.condition_at_discharge} onChange={set("condition_at_discharge")}>{["Improved", "Stable", "Unchanged", "Deteriorated"].map((x) => <option key={x}>{x}</option>)}</select></Field></div>
            {type === "LAMA" && <Field label="Signed LAMA form (file URL)" required hint="Upload the scan in the desk and paste its link"><input className={inputCls} value={f.lama_form ?? ""} onChange={set("lama_form")} /></Field>}
            {type === "Referred" && <Field label="Referred to" required><input className={inputCls} value={f.referred_to ?? ""} onChange={set("referred_to")} /></Field>}
            {type === "Expired" && <div className="grid gap-3 sm:grid-cols-2"><Field label="Date & time of death" required><input type="datetime-local" className={inputCls} value={f.death_datetime ?? ""} onChange={set("death_datetime")} /></Field>
              <Field label="Cause of death"><input className={inputCls} value={f.cause_of_death ?? ""} onChange={set("cause_of_death")} /></Field></div>}
            {type !== "Expired" && <>
              <div className="flex items-center justify-between"><div className="text-sm font-bold">Medicines at home</div><Button size="xs" variant="menu" onClick={() => setMeds((m) => [...m, { medicine: "", dose: "1", frequency: "BD", days: "5", instructions: "" }])}><Plus className="h-3 w-3" />Add</Button></div>
              {meds.map((m, i) => <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] gap-1.5">{(["medicine", "dose", "frequency", "days", "instructions"] as const).map((k) => <input key={k} className={inputCls + " h-9"} placeholder={k}
                value={m[k]} onChange={(e) => setMeds((x) => x.map((r, j) => j === i ? { ...r, [k]: e.target.value } : r))} />)}<button onClick={() => setMeds((x) => x.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button></div>)}
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr]"><Field label="Follow-up plan"><input className={inputCls} value={f.follow_up_plan ?? ""} onChange={set("follow_up_plan")} /></Field>
                <Field label="Follow-up date"><input type="date" className={inputCls} value={f.follow_up_date ?? ""} onChange={set("follow_up_date")} /></Field></div></>}
            <Button variant="workflow" disabled={!open || !f.final_diagnosis?.trim()} loading={busy} onClick={() => void go("ipd.sign_summary", { name: c.name, data: { ...f, discharge_type: type,
              death_datetime: f.death_datetime ? f.death_datetime.replace("T", " ") + ":00" : undefined, medicines: meds.filter((m) => m.medicine).map((m) => ({ ...m, days: Number(m.days) || 0 })) } }, "Summary signed")}>
              <ClipboardCheck className="h-4 w-4" />Sign summary</Button>
          </div>)}
      </section>
      <div className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><ClipboardCheck className="h-5 w-5 text-teal-600" />Clearance{cl?.hold ? <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">HOLD ON</span> : null}</h3>
          <ul className="space-y-2">{cl?.checks.map((ch) => <li key={ch.key} className="flex items-start gap-2 text-sm">{ch.ok && !ch.warn ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />}<div><div className={cn("font-semibold", (!ch.ok || ch.warn) && "text-amber-800 dark:text-amber-200")}>{ch.label}{ch.warn ? " (contractor's — does not hold discharge)" : ""}{ch.key === "dues" && ch.amount ? ` · ${rs(ch.amount)}` : ""}</div>
            {ch.items?.map((x) => <div key={x} className="text-xs text-muted-foreground">{x}</div>)}</div></li>)}</ul>
        </section>
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex justify-between text-sm"><span>Patient share</span><b className="tabular-nums">{rs(bill?.patient_share)}</b></div>
          <div className="flex justify-between text-sm"><span>Balance</span><b className="tabular-nums">{rs(bill?.balance)}</b></div>
          {!c.final_invoice ? <Link to={`/ipd_slip?adm=${c.name}`}><Button variant="save" className="mt-2 w-full"><Receipt className="h-4 w-4" />Go to final bill</Button></Link>
            : <div className="text-xs text-muted-foreground">Final bill {c.final_invoice}</div>}
          {open && c.final_invoice && <Button variant="submit" size="lg" className="w-full" loading={busy} onClick={() => void go("ipd.complete_discharge", { name: c.name }, "Discharged — the bed goes to cleaning")}>
            <LogOut className="h-5 w-5" />Complete discharge</Button>}
          {c.status === "Discharged" && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">Discharged {dt(c.release_datetime)} · {c.discharge_type}</div>}
        </section>
      </div>
    </div>
  );
}
