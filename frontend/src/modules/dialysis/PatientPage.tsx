/** Dialysis patient profile (D-99): clinical profile + prescription, vascular access, viral screening (+ nephrologist override), recurring
 *  schedule with future sessions (move / cancel / extra), session history, lab trends, monthly reviews, consents and documents, audit timeline. */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { CalendarClock, ClipboardList, Droplets, FileSignature, FileText, FlaskConical, History, Plus, Save, ShieldAlert, ShieldCheck, Syringe } from "lucide-react";
import { call, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Field, inputCls, PageHeader, Tabs } from "@/components/common";
import { Button } from "@/components/ui/button";
import { humanizeError } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { LabTrends, type Trends } from "./LabTrends";
import { type Ctx, fmtDate, Modal, openDoc, PayChip, RENAL_HEADER, ScreenChip, type Screening, SigPad, type SigHandle, todayPk, ZoneChip } from "./shared";

type R = Record<string, unknown>;
interface Profile extends R {
  name: string; patient?: string; patient_name: string; status: string; zone: string; screening: Screening; package: { remaining: number; total: number; rows: R[] };
  accesses: R[]; screenings: R[]; upcoming: R[]; history: R[]; reviews: R[]; consents: R[]; timeline: { content: string; creation: string; owner: string }[];
  sched_days?: string; sched_shift?: string; station?: string; override_until?: string; override_reason?: string;
}
const PROF = [["diagnosis", "Diagnosis", "text"], ["ckd_stage", "CKD stage", ["", "1", "2", "3a", "3b", "4", "5", "5D", "AKI"]], ["ckd_cause", "Cause", ["", "Diabetic", "Hypertensive", "Glomerulonephritis", "Obstructive", "Polycystic", "AKI", "Unknown", "Other"]],
  ["dialysis_start", "Dialysis start", "date"], ["comorbidities", "Comorbidities", "text"], ["allergies_note", "Allergies", "text"], ["payer", "Payer", ["Self", "Panel", "Sehat Card"]], ["panel_ref", "Approval / card ref.", "text"],
  ["ec_name", "Emergency contact", "text"], ["ec_relation", "Relation", "text"], ["ec_phone", "Contact phone", "text"], ["phone", "Patient mobile", "text"]] as const;
const RX = [["dry_weight", "Dry weight (kg)", "number"], ["rx_duration_hrs", "Duration (h)", "number"], ["dialyser", "Dialyser", "text"], ["blood_flow", "Blood flow (mL/min)", "number"],
  ["dialysate_flow", "Dialysate flow", "number"], ["dialysate", "Dialysate (K / Ca / HCO3)", "text"], ["heparin", "Anticoagulation", "text"], ["uf_guidance", "UF goal guidance", "text"],
  ["epo", "EPO", "text"], ["iron", "Iron", "text"], ["other_meds", "Vitamins / other medicines", "text"]] as const;

export default function PatientPage() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { hasRole } = useAuth();
  const { data, refetch } = useApi<Profile>("dialysis.profile", { name });
  const ctx = useApi<Ctx>("dialysis.context", undefined, { staleTime: 300_000 }).data;
  const labs = useApi<Trends>("dialysis.lab_trends", { patient: data?.patient, months: 12 }, { enabled: !!data?.patient });
  const [tab, setTab] = useState<"profile" | "access" | "schedule" | "history" | "labs" | "reviews" | "docs">("schedule");
  const [f, setF] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<"screen" | "access" | "override" | "schedule" | "extra" | "consent" | "status" | null>(null);
  const lead = hasRole("PW Nephrologist", "PW Dialysis In-charge");
  const neph = hasRole("PW Nephrologist");
  useEffect(() => { if (data) setF(Object.fromEntries([...PROF, ...RX].map(([k]) => [k, data[k] == null ? "" : String(data[k])]))); }, [data]);
  const run = async (m: string, a: R, ok: string, after?: () => void) => {
    try { await call(m, a); toast.success(ok); await refetch(); after?.(); } catch (e) { toast.error(humanizeError(e), { duration: 8000 }); }
  };
  if (!data) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title={data.patient_name} icon={Droplets} color={RENAL_HEADER}
        subtitle={<span className="flex flex-wrap items-center gap-1.5">{data.name} · {data.patient ?? "no MR"} · {String(data.access_type ?? "no access")} · <ZoneChip zone={data.zone} /> <ScreenChip s={data.screening} />
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">{data.status}</span>{data.package.total ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">Package {data.package.remaining}/{data.package.total}</span> : null}</span>}
        actions={<>
          <Button variant="outline" size="sm" onClick={() => openDoc("card", data.name)}><FileText className="h-4 w-4" />Schedule card</Button>
          <Button variant="outline" size="sm" onClick={() => openDoc("transfer", data.name)}><FileText className="h-4 w-4" />Transfer letter</Button>
          {data.patient && <Link to={`/nephrology/clinic?patient=${data.patient}`}><Button variant="outline" size="sm"><ClipboardList className="h-4 w-4" />CKD clinic</Button></Link>}
          {lead && <Button variant="outline" size="sm" onClick={() => setModal("status")}>Status</Button>}
        </>} />
      <div className="mb-4"><Tabs value={tab} onChange={setTab} tabs={[{ key: "schedule", label: "Schedule", count: data.upcoming.length }, { key: "profile", label: "Profile & prescription" },
        { key: "access", label: "Access & screening" }, { key: "history", label: "Sessions", count: data.history.length }, { key: "labs", label: "Labs" }, { key: "reviews", label: "Monthly reviews", count: data.reviews.length },
        { key: "docs", label: "Consent & documents" }]} /></div>

      {tab === "schedule" && <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Box title="Recurring schedule" icon={CalendarClock}>
          {data.sched_days ? <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 p-4 text-white"><div className="text-2xl font-black">{data.sched_days}</div>
            <div className="text-sm opacity-90">{data.sched_shift} shift {ctx?.shifts[data.sched_shift ?? ""]?.join("–")} · station {data.station}</div></div> : <p className="text-sm text-muted-foreground">No recurring schedule yet.</p>}
          <div className="mt-3 flex flex-wrap gap-2">{lead && data.status === "Active" && <Button size="sm" onClick={() => setModal("schedule")}><CalendarClock className="h-4 w-4" />{data.sched_days ? "Change schedule" : "Set schedule"}</Button>}
            {(lead || hasRole("PW Dialysis Nurse", "PW Receptionist")) && <Button size="sm" variant="outline" onClick={() => setModal("extra")}><Plus className="h-4 w-4" />Extra / emergency</Button>}</div>
          <p className="mt-3 text-xs text-muted-foreground">Sessions are generated four weeks ahead and extended every night. Holidays are flagged to re-book. Zone and screening are checked by the server.</p>
        </Box>
        <Box title="Upcoming sessions" icon={CalendarClock}>
          <table className="w-full text-sm"><tbody>{data.upcoming.map((s) => <tr key={String(s.name)} className="border-t border-border/60">
            <td className="py-2"><button className="font-semibold hover:text-sky-700" onClick={() => nav(`/dialysis/session/${s.name}`)}>{fmtDate(String(s.session_date))}</button><div className="text-xs text-muted-foreground">{String(s.shift)} · {String(s.station ?? "no station")} · {String(s.session_type)}</div></td>
            <td><PayChip status={String(s.payment_status)} /> {s.swap_status ? <span className="text-[11px] text-amber-700">swap {String(s.swap_status)}</span> : null}</td>
            <td className="text-xs text-rose-700 dark:text-rose-300">{(JSON.parse(String(s.alerts || "[]")) as string[]).join(" · ")}</td>
            <td className="text-end">{lead && s.status === "Scheduled" && <Button size="sm" variant="ghost" onClick={() => { const why = prompt("Cancel this session — reason?"); if (why) void run("dialysis.cancel_session", { name: s.name, reason: why }, "Cancelled"); }}>Cancel</Button>}</td></tr>)}</tbody></table>
        </Box>
      </div>}

      {tab === "profile" && <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Clinical profile" icon={ClipboardList} action={<Button size="sm" variant="save" onClick={() => void run("dialysis.save_profile", { name, data: Object.fromEntries(PROF.map(([k]) => [k, f[k] || null])) }, "Saved")}><Save className="h-4 w-4" />Save</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">{PROF.map(([k, l, t]) => <FieldIn key={k} k={k} l={l} t={t} f={f} setF={setF} />)}</div>
          {f.payer !== "Self" && <Field label="Panel / insurer" className="mt-3"><select className={inputCls} value={String(data.panel ?? "")} onChange={(e) => void run("dialysis.save_profile", { name, data: { panel: e.target.value } }, "Saved")}><option value="">—</option>{ctx?.panels.map((p) => <option key={p}>{p}</option>)}</select></Field>}
        </Box>
        <Box title="Dialysis prescription" icon={Syringe} action={lead ? <Button size="sm" variant="save" onClick={() => void run("dialysis.save_profile", { name, data: Object.fromEntries(RX.map(([k, , t]) => [k, f[k] === "" ? null : t === "number" ? Number(f[k]) : f[k]])) }, "Prescription saved")}><Save className="h-4 w-4" />Save</Button> : undefined}>
          {!lead && <p className="mb-2 text-xs text-muted-foreground">Only the nephrologist / in-charge can change the prescription.</p>}
          <div className="grid gap-3 sm:grid-cols-2">{RX.map(([k, l, t]) => <FieldIn key={k} k={k} l={l} t={t} f={f} setF={setF} disabled={!lead} />)}</div>
        </Box>
      </div>}

      {tab === "access" && <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Vascular access" icon={Syringe} action={<Button size="sm" onClick={() => setModal("access")}><Plus className="h-4 w-4" />Add</Button>}>
          <p className="mb-2 text-sm">Current: <b>{String(data.access_type ?? "—")}</b> {String(data.access_site ?? "")} · {String(data.access_status ?? "")}</p>
          <table className="w-full text-sm"><tbody>{data.accesses.map((a, i) => <tr key={i} className="border-t border-border/60"><td className="py-1.5">{String(a.access_type)}<div className="text-xs text-muted-foreground">{String(a.site ?? "")}</div></td><td>{fmtDate(String(a.created_on ?? ""), { day: "numeric", month: "short", year: "numeric" })}</td><td>{String(a.status)}</td></tr>)}</tbody></table>
        </Box>
        <Box title="Viral screening (HBsAg / Anti-HCV / HIV)" icon={ShieldCheck} action={<div className="flex gap-2"><Button size="sm" onClick={() => setModal("screen")}><Plus className="h-4 w-4" />Result</Button>{neph && <Button size="sm" variant="outline" onClick={() => setModal("override")}><ShieldAlert className="h-4 w-4" />Override</Button>}</div>}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm"><ZoneChip zone={data.zone} /><ScreenChip s={data.screening} />{data.override_until && <span className="text-xs text-muted-foreground">Override until {data.override_until}: {data.override_reason}</span>}</div>
          <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="text-start">Date</th><th>HBsAg</th><th>Anti-HCV</th><th>HIV</th></tr></thead><tbody>{[...data.screenings].reverse().map((s, i) => <tr key={i} className="border-t border-border/60 text-center">
            <td className="py-1.5 text-start">{String(s.tested_on)}</td>{(["hbsag", "anti_hcv", "hiv"] as const).map((k) => <td key={k} className={s[k] === "Positive" ? "font-bold text-rose-600" : ""}>{String(s[k] ?? "—")}</td>)}</tr>)}</tbody></table>
          <p className="mt-2 text-xs text-muted-foreground">Every 3 months for negative patients [confirm]. A positive result moves the patient to the matching zone and releases future wrong-zone sessions.</p>
        </Box>
      </div>}

      {tab === "history" && <Box title="Session history" icon={History}>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="text-xs text-muted-foreground"><tr>{["Date", "Status", "Pre / post wt", "Gain", "Pre BP", "Post BP", "UF", "URR / Kt/V", "Alerts", ""].map((h) => <th key={h} className="px-2 py-1 text-start">{h}</th>)}</tr></thead>
          <tbody>{data.history.map((s) => <tr key={String(s.name)} className="border-t border-border/60"><td className="px-2 py-1.5"><button className="font-semibold hover:text-sky-700" onClick={() => nav(`/dialysis/session/${s.name}`)}>{fmtDate(String(s.session_date))}</button></td>
            <td className="px-2">{String(s.status)}</td><td className="px-2">{String(s.pre_weight ?? "—")} / {String(s.post_weight ?? "—")}</td><td className={cn("px-2", Number(s.weight_gain) > 3 && "font-bold text-rose-600")}>{String(s.weight_gain ?? "—")}</td>
            <td className="px-2">{String(s.pre_bp_sys ?? "")}/{String(s.pre_bp_dia ?? "")}</td><td className="px-2">{String(s.post_bp_sys ?? "")}/{String(s.post_bp_dia ?? "")}</td><td className="px-2">{String(s.total_uf ?? "—")}</td>
            <td className="px-2">{s.urr ? `${s.urr}% / ${s.ktv}` : "—"}</td><td className="px-2 text-xs text-rose-700 dark:text-rose-300">{(JSON.parse(String(s.alerts || "[]")) as string[]).slice(0, 2).join(" · ")}</td>
            <td className="px-2">{s.status === "Completed" && <button className="text-xs font-semibold text-sky-700 dark:text-sky-300" onClick={() => openDoc("session", String(s.name))}>Sheet</button>}</td></tr>)}</tbody></table></div>
      </Box>}

      {tab === "labs" && <Box title="Lab trends (Lab module)" icon={FlaskConical} action={lead ? <Button size="sm" onClick={() => void run("dialysis.order_monthly_labs", { name }, "Monthly panel ordered — pay at the counter / lab")}><FlaskConical className="h-4 w-4" />Order monthly panel</Button> : undefined}>
        <LabTrends data={labs.data} /></Box>}

      {tab === "reviews" && <Reviews p={data} lead={lead} neph={neph} onChange={() => void refetch()} />}

      {tab === "docs" && <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Consents" icon={FileSignature} action={<Button size="sm" onClick={() => setModal("consent")}><Plus className="h-4 w-4" />Sign consent</Button>}>
          {data.consents.length ? <ul className="space-y-1.5 text-sm">{data.consents.map((c) => <li key={String(c.name)} className="flex items-center gap-2 rounded-xl border border-border p-2"><FileSignature className="h-4 w-4 text-violet-600" />
            <span className="flex-1"><b>{String(c.consent_type)}</b><span className="block text-xs text-muted-foreground">{String(c.signer_name)} · {String(c.signed_at ?? "").slice(0, 16)}</span></span>
            <Button size="sm" variant="outline" onClick={() => openDoc("consent", String(c.name))}>PDF</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No consent on file — haemodialysis consent is needed before the first session.</p>}
        </Box>
        <Box title="Timeline (audit)" icon={History}>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto text-sm">{data.timeline.map((t, i) => <li key={i} className="border-s-2 border-sky-400 ps-2"><div dangerouslySetInnerHTML={{ __html: t.content }} /><div className="text-[11px] text-muted-foreground">{t.creation.slice(0, 16)} · {t.owner}</div></li>)}</ul>
        </Box>
      </div>}

      {modal === "screen" && <ScreenModal name={name} onClose={() => setModal(null)} onDone={() => { setModal(null); void refetch(); }} />}
      {modal === "access" && <AccessModal name={name} onClose={() => setModal(null)} onDone={() => { setModal(null); void refetch(); }} />}
      {modal === "override" && <SimpleModal title="Screening override (nephrologist)" fields={[["until", "Valid until (max 30 days)", "date"], ["reason", "Reason", "text"]]} onClose={() => setModal(null)}
        onSubmit={(v) => run("dialysis.override_screening", { name, until: v.until, reason: v.reason }, "Override recorded", () => setModal(null))} />}
      {modal === "schedule" && ctx && <ScheduleModal p={data} ctx={ctx} onClose={() => setModal(null)} onDone={() => { setModal(null); void refetch(); }} />}
      {modal === "extra" && ctx && <ExtraModal p={data} ctx={ctx} onClose={() => setModal(null)} onDone={() => { setModal(null); void refetch(); }} />}
      {modal === "consent" && <ConsentModal p={data} onClose={() => setModal(null)} onDone={() => { setModal(null); void refetch(); }} />}
      {modal === "status" && <SimpleModal title="Change status" fields={[["status", "Status", ["Active", "Paused", "Transferred out", "Discharged", "Deceased"]], ["reason", "Reason", "text"]]} onClose={() => setModal(null)}
        onSubmit={(v) => run("dialysis.set_status", { name, status: v.status, reason: v.reason }, "Status changed", () => setModal(null))} />}
    </div>
  );
}

function Box({ title, icon: I, children, action }: { title: string; icon: typeof Droplets; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"><I className="h-4 w-4" /></span><h2 className="flex-1 font-bold">{title}</h2>{action}</div>{children}</section>;
}
function FieldIn({ k, l, t, f, setF, disabled }: { k: string; l: string; t: string | readonly string[]; f: Record<string, string>; setF: (x: Record<string, string>) => void; disabled?: boolean }) {
  return <Field label={l}>{Array.isArray(t) ? <select disabled={disabled} className={inputCls} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{(t as string[]).map((o) => <option key={o} value={o}>{o || "—"}</option>)}</select>
    : <input disabled={disabled} type={t as string} className={inputCls} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>;
}

function SimpleModal({ title, fields, onClose, onSubmit }: { title: string; fields: [string, string, string | string[]][]; onClose: () => void; onSubmit: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(fields.map(([k, , t]) => [k, Array.isArray(t) ? t[0] : ""])));
  return <Modal title={title} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" onClick={() => onSubmit(v)}>Save</Button></>}>
    <div className="space-y-3">{fields.map(([k, l, t]) => <FieldIn key={k} k={k} l={l} t={t} f={v} setF={setV} />)}</div></Modal>;
}

function ScreenModal({ name, onClose, onDone }: { name: string; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ tested_on: todayPk(), hbsag: "Negative", anti_hcv: "Negative", hiv: "Negative", source: "LMC laboratory", notes: "" });
  const save = async () => { try { await call("dialysis.add_screening", { name, row: v }); toast.success("Screening recorded"); onDone(); } catch (e) { toast.error(humanizeError(e), { duration: 8000 }); } };
  return <Modal title="Viral screening result" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" onClick={() => void save()}>Save</Button></>}>
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Test date"><input type="date" className={inputCls} value={v.tested_on} max={todayPk()} onChange={(e) => setV({ ...v, tested_on: e.target.value })} /></Field>
      <Field label="Source"><input className={inputCls} value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} /></Field>
      {(["hbsag", "anti_hcv", "hiv"] as const).map((k) => <Field key={k} label={{ hbsag: "HBsAg", anti_hcv: "Anti-HCV", hiv: "HIV" }[k]}><div className="grid grid-cols-2 gap-1">{["Negative", "Positive"].map((o) => <button key={o} type="button" onClick={() => setV({ ...v, [k]: o })}
        className={cn("rounded-lg border px-2 py-2 text-sm font-semibold", v[k] === o ? (o === "Positive" ? "border-rose-600 bg-rose-600 text-white" : "border-emerald-600 bg-emerald-600 text-white") : "border-border")}>{o}</button>)}</div></Field>)}
    </div></Modal>;
}

function AccessModal({ name, onClose, onDone }: { name: string; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<Record<string, string>>({ access_type: "AV fistula", site: "", created_on: todayPk(), status: "Working", notes: "" });
  const save = async () => { try { await call("dialysis.add_access", { name, row: { ...v, replaces_current: 1 } }); toast.success("Access recorded"); onDone(); } catch (e) { toast.error(humanizeError(e)); } };
  return <Modal title="Vascular access" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" onClick={() => void save()}>Save</Button></>}>
    <div className="grid gap-3 sm:grid-cols-2">
      <FieldIn k="access_type" l="Type" t={["AV fistula", "AV graft", "Permanent catheter (tunnelled)", "Temporary catheter"]} f={v} setF={setV} />
      <FieldIn k="site" l="Site" t="text" f={v} setF={setV} /><FieldIn k="created_on" l="Created on" t="date" f={v} setF={setV} />
      <FieldIn k="status" l="Status" t={["Working", "Maturing", "Problem", "Failed"]} f={v} setF={setV} /><FieldIn k="notes" l="Notes" t="text" f={v} setF={setV} /></div></Modal>;
}

function ScheduleModal({ p, ctx, onClose, onDone }: { p: Profile; ctx: Ctx; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState<string[]>((p.sched_days ?? "Mon, Thu").split(/[,\s]+/).filter(Boolean));
  const [shift, setShift] = useState(p.sched_shift ?? "Morning");
  const [station, setStation] = useState(p.station ?? "");
  const [start, setStart] = useState(todayPk());
  const save = async () => {
    try { const r = await call<{ generated: number }>("dialysis.set_schedule", { name: p.name, days: days.join(", "), shift, station, start }); toast.success(`Schedule saved · ${r.generated} sessions generated`); onDone(); }
    catch (e) { toast.error(humanizeError(e), { duration: 9000 }); }
  };
  return <Modal title="Recurring schedule" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" disabled={!days.length || !station} onClick={() => void save()}>Save &amp; generate</Button></>}>
    <Field label="Days"><div className="flex flex-wrap gap-1.5">{ctx.days.map((d) => <button key={d} type="button" onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]).sort((a, b) => ctx.days.indexOf(a) - ctx.days.indexOf(b)))}
      className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", days.includes(d) ? "border-sky-600 bg-sky-600 text-white" : "border-border")}>{d}</button>)}</div></Field>
    <div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Shift"><select className={inputCls} value={shift} onChange={(e) => setShift(e.target.value)}>{ctx.active_shifts.map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Station"><select className={inputCls} value={station} onChange={(e) => setStation(e.target.value)}><option value="">—</option>{ctx.stations.filter((s) => s.status === "Active").map((s) => <option key={s.name} value={s.name} disabled={s.zone !== p.zone}>{s.station_no} · {s.zone}{s.zone !== p.zone ? " (wrong zone)" : ""}</option>)}</select></Field>
      <Field label="From"><input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} /></Field></div>
    <p className="mt-3 text-xs text-muted-foreground">Patient zone: <ZoneChip zone={p.zone} />. Unpaid future sessions from the old schedule are cancelled and regenerated.</p>
  </Modal>;
}

function ExtraModal({ p, ctx, onClose, onDone }: { p: Profile; ctx: Ctx; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<Record<string, string>>({ date: todayPk(), shift: "Morning", station: "", session_type: "Extra", ward_location: "" });
  const save = async () => { try { await call("dialysis.extra_session", { name: p.name, ...v, station: v.station || undefined, ward_location: v.ward_location || undefined }); toast.success("Session booked"); onDone(); } catch (e) { toast.error(humanizeError(e), { duration: 9000 }); } };
  return <Modal title="Extra / emergency session" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" onClick={() => void save()}>Book</Button></>}>
    <div className="grid gap-3 sm:grid-cols-2"><FieldIn k="session_type" l="Type" t={["Extra", "Emergency", "ICU bedside", "Guest"]} f={v} setF={setV} /><FieldIn k="date" l="Date" t="date" f={v} setF={setV} />
      <FieldIn k="shift" l="Shift" t={[...ctx.active_shifts, "Night"]} f={v} setF={setV} />
      {v.session_type === "ICU bedside" ? <FieldIn k="ward_location" l="Ward / bed" t="text" f={v} setF={setV} /> : <Field label="Station"><select className={inputCls} value={v.station} onChange={(e) => setV({ ...v, station: e.target.value })}><option value="">—</option>{ctx.stations.filter((s) => s.status === "Active" && s.zone === p.zone).map((s) => <option key={s.name} value={s.name}>{s.station_no}</option>)}</select></Field>}</div></Modal>;
}

function ConsentModal({ p, onClose, onDone }: { p: Profile; onClose: () => void; onDone: () => void }) {
  const sig = useRef<SigHandle>(null);
  const [v, setV] = useState<Record<string, string>>({ consent_type: "Haemodialysis", signer_name: p.patient_name, relation: "", witness_name: "" });
  const save = async () => {
    try { await call("dialysis.save_consent", { name: p.name, ...v, relation: v.relation || undefined, signature: sig.current?.dataUrl() || undefined }); toast.success("Consent signed"); onDone(); }
    catch (e) { toast.error(humanizeError(e), { duration: 8000 }); }
  };
  return <Modal title="Consent" wide onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" disabled={!v.signer_name || !v.witness_name} onClick={() => void save()}><FileSignature className="h-4 w-4" />Sign</Button></>}>
    <div className="grid gap-3 sm:grid-cols-2"><FieldIn k="consent_type" l="Consent" t={["Haemodialysis", "Catheter Insertion"]} f={v} setF={setV} /><FieldIn k="signer_name" l="Signed by" t="text" f={v} setF={setV} />
      <FieldIn k="relation" l="Relation (if attendant)" t="text" f={v} setF={setV} /><FieldIn k="witness_name" l="Witness" t="text" f={v} setF={setV} /></div>
    <p className="my-3 rounded-xl bg-muted/50 p-3 text-xs">The standard {v.consent_type.toLowerCase()} consent text (English + Urdu) is printed on the form. Explain it in the patient's language before signing.</p>
    <div className="mb-1 flex justify-between text-xs font-semibold text-muted-foreground"><span>Signature</span><button className="text-primary" onClick={() => sig.current?.clear()}>Clear</button></div><SigPad ref={sig} />
  </Modal>;
}

function Reviews({ p, lead, neph, onChange }: { p: Profile; lead: boolean; neph: boolean; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const create = async () => { try { const r = await call<{ name: string }>("dialysis.create_review", { name: p.name }); setOpen(r.name); onChange(); } catch (e) { toast.error(humanizeError(e)); } };
  return <Box title="Monthly reviews" icon={ClipboardList} action={lead ? <Button size="sm" onClick={() => void create()}><Plus className="h-4 w-4" />This month</Button> : undefined}>
    <table className="w-full text-sm"><tbody>{p.reviews.map((r) => <tr key={String(r.name)} className="border-t border-border/60"><td className="py-2 font-semibold">{fmtDate(String(r.month), { month: "long", year: "numeric" })}</td>
      <td>{String(r.sessions_done ?? 0)} done · {String(r.sessions_missed ?? 0)} missed</td><td>URR {String(r.urr ?? "—")} · Kt/V {String(r.ktv ?? "—")} · Hb {String(r.hb ?? "—")}</td><td>{String(r.status)}</td>
      <td className="text-end"><Button size="sm" variant="outline" onClick={() => setOpen(String(r.name))}>Open</Button> <Button size="sm" variant="outline" onClick={() => openDoc("monthly", String(r.name))}>PDF</Button></td></tr>)}</tbody></table>
    {open && <ReviewModal name={open} neph={neph} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onChange(); }} />}
  </Box>;
}

function ReviewModal({ name, neph, onClose, onDone }: { name: string; neph: boolean; onClose: () => void; onDone: () => void }) {
  const { data } = useApi<R & { stats: R; status: string; review_note?: string; rx_changes?: string }>("dialysis.review", { name });
  const [note, setNote] = useState("");
  const [rx, setRx] = useState("");
  useEffect(() => { if (data) { setNote(String(data.review_note ?? "")); setRx(String(data.rx_changes ?? "")); } }, [data]);
  const sign = async () => { try { await call("dialysis.sign_review", { name, review_note: note, rx_changes: rx || undefined }); toast.success("Review signed"); onDone(); } catch (e) { toast.error(humanizeError(e)); } };
  const st = (data?.stats ?? {}) as { done?: number; missed?: number; avg_weight_gain?: number; urr?: number; ktv?: number; labs?: Record<string, { v: number; unit?: string } | null> };
  return <Modal title={`Monthly review · ${name}`} wide onClose={onClose} footer={<><Button variant="outline" onClick={() => openDoc("monthly", name)}>PDF</Button>{neph && data?.status !== "Signed" && <Button variant="submit" disabled={note.trim().length < 5} onClick={() => void sign()}>Sign review</Button>}</>}>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{([["Done", st.done], ["Missed", st.missed], ["Avg gain (kg)", st.avg_weight_gain], ["URR %", st.urr], ["Kt/V", st.ktv]] as [string, unknown][]).map(([k, v]) => <div key={k} className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="text-xl font-black">{String(v ?? "—")}</div></div>)}</div>
    <div className="mt-3 flex flex-wrap gap-2 text-xs">{Object.entries(st.labs ?? {}).filter(([, v]) => v).map(([k, v]) => <span key={k} className="rounded-full bg-sky-100 px-2 py-1 font-semibold text-sky-900 dark:bg-sky-500/15 dark:text-sky-100">{k}: {v!.v} {v!.unit ?? ""}</span>)}</div>
    <Field label="Nephrologist review" className="mt-3"><textarea disabled={!neph || data?.status === "Signed"} className={cn(inputCls, "h-28 py-2")} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    <Field label="Prescription changes" className="mt-3"><textarea disabled={!neph || data?.status === "Signed"} className={cn(inputCls, "h-20 py-2")} value={rx} onChange={(e) => setRx(e.target.value)} /></Field>
  </Modal>;
}
