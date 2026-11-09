import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, BarChart3, CalendarClock, Check, CheckCircle2, CircleX, Clock, ExternalLink, FileSignature, Image as ImageIcon, Pill, Receipt,
  Search, Undo2, UserRound, Video, Wallet, X } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { Empty, Field, inputCls, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { IpdHero } from "../ipd/shared";

interface Row { name: string; patient?: string; patient_name: string; phone: string; gender?: string; age?: number; language: string; city?: string; complaint: string; status: string;
  fee: number; fee_status: string; payment_method: string; assigned_doctor?: string; doctor_name?: string; scheduled_at?: string; video_link?: string; prescription?: string; creation: string;
  specialization?: string }
interface Q { rows: Row[]; counts: Record<string, number>; my_doctor?: string; is_staff: boolean; is_cashier: boolean; fee_modes: string[]; doctors: { name: string; doctor_name: string; specialization?: string }[] }
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
const dt = (s?: string) => (s ? new Date(s.replace(" ", "T")).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");
const ago = (s: string) => { const m = Math.round((Date.now() - new Date(s.replace(" ", "T")).getTime()) / 60000); return m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`; };
const FEE_TONE: Record<string, string> = { Verified: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200", "Proof Submitted": "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  Unpaid: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200", Refunded: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200", Waived: "bg-slate-100 text-slate-700" };
const COLS = [["Pending", "New requests", "bg-amber-500"], ["Accepted", "Accepted", "bg-teal-600"], ["Completed", "Completed", "bg-emerald-600"], ["closed", "Cancelled / rejected", "bg-slate-500"]] as const;

export default function OvStaffPage() {
  const { boot, branch, can } = useAuth();
  const qc = useQueryClient();
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useApi<Q>("online_visit.queue", { mine: mine ? 1 : 0 }, { refetchInterval: 20_000 });
  useRealtime(boot?.site, [`hv:ov:${branch}`, "hv:ov"], () => { void qc.invalidateQueries({ queryKey: ["online_visit.queue"] }); void qc.invalidateQueries({ queryKey: ["online_visit.get"] }); });
  const rows = (data?.rows ?? []).filter((r) => !q || `${r.patient_name} ${r.phone} ${r.name} ${r.patient ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-[1600px]">
      <IpdHero tone="indigo" icon={Video} title="Online visits" sub="Requests from the website · check the fee, accept, video call, prescription"
        actions={<>
          {data?.my_doctor && <Button className={cn(mine ? "bg-white text-indigo-900" : "bg-white/15 text-white hover:bg-white/25")} onClick={() => setMine(!mine)}><UserRound className="h-4 w-4" />My consultations</Button>}
          {can("/ov-staff/report") && <Link to="/ov-staff/report"><Button className="bg-white/15 text-white hover:bg-white/25"><BarChart3 className="h-4 w-4" />Report</Button></Link>}
          <a href={`${import.meta.env.BASE_URL}online-visit`} target="_blank" rel="noreferrer"><Button className="bg-white text-indigo-900 hover:bg-white/90"><ExternalLink className="h-4 w-4" />Public form</Button></a>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="New" value={data?.counts.Pending ?? 0} icon={Clock} tone="amber" />
        <StatCard label="Accepted" value={data?.counts.Accepted ?? 0} icon={CalendarClock} tone="teal" />
        <StatCard label="Done today" value={data?.counts.today_done ?? 0} icon={CheckCircle2} tone="blue" />
        <StatCard label="Fees to check" value={data?.counts.fee_to_check ?? 0} icon={Wallet} tone="violet" />
        <StatCard label="Refunds due" value={data?.counts.refunds_due ?? 0} icon={Undo2} tone="rose" />
      </div>
      <div className="relative mb-3 max-w-md"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} placeholder="Name, phone, MR or request no." value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{COLS.map(([k, label, tone]) => {
        const list = rows.filter((r) => (k === "closed" ? ["Cancelled", "Rejected"].includes(r.status) : r.status === k));
        return (
          <section key={k} className="min-w-0 rounded-2xl border border-border bg-card/60">
            <div className={cn("flex items-center rounded-t-2xl px-3 py-2 text-sm font-black text-white", tone)}>{label}<span className="ms-auto rounded-full bg-white/25 px-2">{list.length}</span></div>
            <div className="max-h-[68vh] space-y-2 overflow-y-auto p-2">{list.map((r) => (
              <button key={r.name} onClick={() => setOpen(r.name)} className="block w-full rounded-xl border border-border bg-card p-3 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate font-bold">{r.patient_name}</div><div className="truncate text-[11px] text-muted-foreground" dir="ltr">{r.phone} · {r.name}</div></div>
                  <span className="text-xs font-semibold text-muted-foreground">{ago(r.creation)}</span></div>
                <div className="mt-1 line-clamp-2 text-xs">{r.complaint}</div>
                <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold">
                  <span className={cn("rounded px-1.5 py-0.5", FEE_TONE[r.fee_status])}>{r.fee_status} · {r.payment_method}</span>
                  {r.language !== "en" && <span className="rounded bg-muted px-1.5 py-0.5 uppercase">{r.language}</span>}
                  {r.doctor_name && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200">{r.doctor_name}</span>}
                  {r.scheduled_at && r.status === "Accepted" && <span className="rounded bg-teal-100 px-1.5 py-0.5 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200">{dt(r.scheduled_at)}</span>}
                  {r.prescription && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">℞ {r.prescription}</span>}
                </div>
              </button>))}
              {!list.length && <div className="py-6 text-center text-xs text-muted-foreground">—</div>}</div>
          </section>);
      })}</div>
      {data && !data.rows.length && <Empty title="No online visits yet" hint="Share the public form link with patients." icon={Video} />}
      {open && <VisitDialog name={open} doctors={data?.doctors ?? []} isStaff={!!data?.is_staff} isCashier={!!data?.is_cashier} feeModes={data?.fee_modes ?? []} onClose={() => setOpen(null)} />}
    </div>
  );
}

interface Detail extends Row { symptoms?: string; duration?: string; conditions?: string; current_meds?: string; allergies_text?: string; photos: { file_url: string; caption?: string }[];
  payment_proof?: string; payment_reference?: string; sales_invoice?: string; payment_entry?: string; refund_amount?: number; refund_reference?: string; refund_notes?: string;
  credit_note?: string; rejection_reason?: string; cancel_reason?: string; doctor_notes?: string; follow_up?: string; follow_up_date?: string; phone_verified: number;
  prescription_data?: { name: string; medicines: { item_name: string; dose?: string; frequency?: string; duration?: string }[]; advice?: string; diagnoses: string[] } | null;
  draft_prescription?: string; history?: { name: string; status: string; complaint: string; creation: string }[]; allergies?: string[] }

function VisitDialog({ name, doctors, isStaff, isCashier, feeModes, onClose }: { name: string; doctors: Q["doctors"]; isStaff: boolean; isCashier: boolean; feeModes: string[];
  onClose: () => void }) {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const { data: v, refetch } = useApi<Detail>("online_visit.get", { name });
  const [doctor, setDoctor] = useState("");
  const [when, setWhen] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [fu, setFu] = useState("Not needed");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("");
  const [txn, setTxn] = useState("");
  const act = async (method: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try { await call(`online_visit.${method}`, { name, ...args }); toast.success(ok); void refetch(); void qc.invalidateQueries({ queryKey: ["online_visit.queue"] }); return true; }
    catch (e) { toast.error(humanizeError(e), { duration: 7000 }); return false; } finally { setBusy(false); }
  };
  if (!v) return <Dialog open onClose={onClose} size="xl"><div className="flex h-40 items-center justify-center"><Spinner /></div></Dialog>;
  const isDoctor = hasRole("OV Doctor");
  const local = (s: string) => (s ? s.replace("T", " ") + ":00" : undefined);
  return (
    <Dialog open onClose={onClose} size="xl" title={<span className="flex flex-wrap items-center gap-2">{v.patient_name}<span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{v.status}</span>
      {v.phone_verified ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"><BadgeCheck className="h-3 w-3" />verified patient</span> : null}</span>}
      description={`${v.name} · ${v.phone} · ${v.gender ?? ""} ${v.age ? `${v.age}y` : ""} · ${v.city ?? ""} · ${v.patient ?? "new patient"} · sent ${dt(v.creation)}`}>
      <div className="grid max-h-[70vh] gap-4 overflow-y-auto pe-1 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {(v.allergies?.length ?? 0) > 0 && <div className="flex items-center gap-2 rounded-xl border-2 border-rose-400 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertTriangle className="h-4 w-4" />Allergies on file: {v.allergies!.join(", ")}</div>}
          <section className="rounded-2xl border border-border p-3 text-sm">
            <div className="mb-2 font-bold">Complaint</div><div className="whitespace-pre-wrap">{v.complaint}</div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">{[["Symptoms", v.symptoms], ["Since", v.duration], ["Conditions", v.conditions], ["Current medicines", v.current_meds],
              ["Allergies (patient says)", v.allergies_text], ["Speciality", v.specialization]].map(([k, x]) => x ? <div key={k}><dt className="font-semibold text-muted-foreground">{k}</dt><dd>{x}</dd></div> : null)}</dl>
            {v.photos.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{v.photos.map((ph) => <a key={ph.file_url} href={ph.file_url} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-xl border border-border">
              <img src={ph.file_url} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} /><ImageIcon className="m-8 h-6 w-6 text-muted-foreground" /></a>)}</div>}
          </section>
          {v.prescription_data && <section className="rounded-2xl border border-emerald-300 bg-emerald-50/50 p-3 text-sm dark:bg-emerald-500/5"><div className="mb-1 flex items-center gap-2 font-bold"><Pill className="h-4 w-4 text-emerald-600" />Prescription {v.prescription_data.name}</div>
            {v.prescription_data.diagnoses.length > 0 && <div className="text-xs text-muted-foreground">{v.prescription_data.diagnoses.join(", ")}</div>}
            {v.prescription_data.medicines.map((m, i) => <div key={i}>• <b>{m.item_name}</b> {[m.dose, m.frequency, m.duration].filter(Boolean).join(" · ")}</div>)}
            {v.prescription_data.advice && <div className="mt-1 text-xs">{v.prescription_data.advice}</div>}</section>}
          {(v.history?.length ?? 0) > 0 && <section className="rounded-2xl border border-border p-3 text-xs"><div className="mb-1 font-bold">Earlier online visits</div>{v.history!.map((h) => <div key={h.name}>{h.name} · {h.status} · {h.complaint}</div>)}</section>}
          {(v.rejection_reason || v.cancel_reason) && <div className="rounded-xl bg-muted p-3 text-sm"><CircleX className="me-1 inline h-4 w-4 text-rose-500" />{v.rejection_reason || v.cancel_reason}</div>}
        </div>

        <div className="space-y-3">
          <section className="space-y-2 rounded-2xl border border-border p-3">
            <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-violet-600" /><b className="flex-1">Fee {rs(v.fee)}</b><span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", FEE_TONE[v.fee_status])}>{v.fee_status}</span></div>
            <div className="text-xs text-muted-foreground">{v.payment_method}{v.payment_reference ? ` · ${v.payment_reference}` : ""}</div>
            {v.payment_proof && <a href={v.payment_proof} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-700 underline">Open payment receipt</a>}
            {v.sales_invoice && <div className="flex items-center gap-1 text-xs"><Receipt className="h-3 w-3" />{v.sales_invoice} · {v.payment_entry}</div>}
            {isCashier && ["Unpaid", "Proof Submitted"].includes(v.fee_status) && !["Cancelled", "Rejected"].includes(v.status) && <div className="space-y-2 rounded-xl bg-muted/50 p-2">
              <div className="text-[11px] font-semibold text-muted-foreground">Take the fee in your cashier shift</div>
              <div className="flex flex-wrap gap-1">{feeModes.map((m) => <button key={m} onClick={() => setMode(m)} className={cn("rounded-lg border px-2 py-1 text-xs font-semibold",
                (mode || ({ JazzCash: "JazzCash", Easypaisa: "Easypaisa" } as Record<string, string>)[v.payment_method] || "Bank Transfer") === m ? "border-emerald-600 bg-emerald-600 text-white" : "border-border")}>{m}</button>)}</div>
              {(mode || "x") !== "Cash" && <input className={inputCls + " h-9"} placeholder="Transaction ID" value={txn || v.payment_reference || ""} onChange={(e) => setTxn(e.target.value)} />}
              <Button size="sm" variant="submit" className="w-full" disabled={busy} onClick={() => void act("verify_fee", { ok: 1, payment_mode: mode || ({ JazzCash: "JazzCash", Easypaisa: "Easypaisa" } as Record<string, string>)[v.payment_method] || "Bank Transfer",
                payment_reference: txn || v.payment_reference || undefined }, "Fee received in your shift")}><Check className="h-4 w-4" />Receive {rs(v.fee)}</Button></div>}
            {(isStaff || isCashier) && v.fee_status === "Proof Submitted" && !["Cancelled", "Rejected"].includes(v.status) && <Button size="sm" variant="danger" disabled={busy}
              onClick={() => { const n = prompt("What was wrong with the payment?"); if (n) void act("verify_fee", { ok: 0, note: n }, "Patient asked to pay again"); }}><X className="h-4 w-4" />Transfer not found</Button>}
            {!isCashier && ["Unpaid", "Proof Submitted"].includes(v.fee_status) && !["Cancelled", "Rejected"].includes(v.status) && <div className="text-[11px] text-muted-foreground">Reception takes the fee in their shift.</div>}
            {isCashier && ["Cancelled", "Rejected"].includes(v.status) && ["Verified", "Proof Submitted"].includes(v.fee_status) && <Button size="sm" variant="danger" className="w-full" disabled={busy}
              onClick={() => { const r = prompt("Refund transaction ID (empty for cash)") ?? ""; void act("refund", { refund_reference: r || undefined, refund_notes: prompt("Notes (optional)") || undefined }, "Refunded from your shift"); }}><Undo2 className="h-4 w-4" />Refund from my shift</Button>}
            {v.fee_status === "Refunded" && <div className="text-xs">Refunded {rs(v.refund_amount)} · {v.refund_reference}{v.credit_note ? ` · ${v.credit_note}` : ""}</div>}
          </section>

          {v.status === "Pending" && isStaff && <section className="space-y-2 rounded-2xl border border-border p-3">
            <div className="font-bold">Accept</div>
            <Field label="Doctor"><select className={inputCls} value={doctor} onChange={(e) => setDoctor(e.target.value)}><option value="">—</option>{doctors.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}{d.specialization ? ` · ${d.specialization}` : ""}</option>)}</select></Field>
            <Field label="When" hint="Empty = in 30 minutes"><input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
            <Field label="Video link" hint="Empty = a new Jitsi room"><input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></Field>
            <Button variant="submit" className="w-full" disabled={!doctor || busy} onClick={() => void act("accept", { doctor, scheduled_at: local(when), video_link: link || undefined }, "Accepted — patient notified")}><CheckCircle2 className="h-4 w-4" />Accept</Button>
            <Button variant="danger" className="w-full" disabled={busy} onClick={() => { const r = prompt("Why can't the clinic take it?"); if (r) void act("reject", { reason: r }, "Rejected"); }}><CircleX className="h-4 w-4" />Reject</Button>
          </section>}

          {v.status === "Accepted" && <section className="space-y-2 rounded-2xl border border-teal-300 bg-teal-50/50 p-3 dark:bg-teal-500/5">
            <div className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4" /><b>{v.doctor_name}</b> · {dt(v.scheduled_at)}</div>
            {v.video_link && <a href={v.video_link} target="_blank" rel="noreferrer"><Button variant="workflow" className="w-full"><Video className="h-4 w-4" />Open video call</Button></a>}
            {(isDoctor || hasRole("PW Doctor")) && <Link to={`/pw-prescription?ov=${v.name}`}><Button variant="save" className="mt-2 w-full"><FileSignature className="h-4 w-4" />{v.prescription ? "View prescription" : v.draft_prescription ? "Continue prescription" : "Write prescription"}</Button></Link>}
            <Field label="Doctor notes"><textarea className={inputCls + " h-16 py-2"} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            <Field label="Follow-up"><select className={inputCls} value={fu} onChange={(e) => setFu(e.target.value)}>{["Not needed", "Online", "Visit the clinic"].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Button variant="submit" className="w-full" disabled={busy || (!v.prescription && !(fu === "Visit the clinic" && notes.trim()))} onClick={() => void act("complete", { doctor_notes: notes || undefined, follow_up: fu }, "Completed — patient can see the prescription")}>
              <CheckCircle2 className="h-4 w-4" />Complete</Button>
            {!v.prescription && <div className="text-[11px] text-muted-foreground">Sign the prescription first, or choose "Visit the clinic" with a note.</div>}
            {isStaff && <div className="flex gap-2 pt-1">
              <Button size="sm" variant="neutral" onClick={() => { const l = prompt("New video link (empty = keep)", v.video_link ?? ""); const w = prompt("New time (YYYY-MM-DD HH:MM, empty = keep)", ""); if (l || w) void act("update_visit", { video_link: l || undefined, scheduled_at: w ? `${w}:00` : undefined }, "Updated — patient notified"); }}>Change time / link</Button>
              <Button size="sm" variant="danger" onClick={() => { const r = prompt("Why cancel?"); if (r) void act("cancel", { reason: r }, "Cancelled"); }}>Cancel</Button></div>}
          </section>}
          {v.status === "Completed" && <div className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"><CheckCircle2 className="me-1 inline h-4 w-4" />Completed{v.follow_up ? ` · follow-up: ${v.follow_up}` : ""}{v.doctor_notes ? <div className="mt-1 text-xs">{v.doctor_notes}</div> : null}</div>}
        </div>
      </div>
    </Dialog>
  );
}

interface Rep { from: string; to: string; by_status: { status: string; n: number; fees: number; refunds: number; wait: number }[]; by_doctor: { doctor_name: string; n: number; done: number }[] }
export function OvReportPage() {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { data } = useApi<Rep>("online_visit.report", { from_date: from, to_date: to });
  const total = (data?.by_status ?? []).reduce((s, r) => s + r.n, 0);
  return (
    <div className="mx-auto max-w-5xl">
      <IpdHero tone="indigo" icon={BarChart3} title="Online visit report" sub="Requests, fees, refunds and doctors"
        actions={<div className="flex gap-2"><input type="date" className={inputCls.replace("w-full", "") + " w-40 text-foreground"} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className={inputCls.replace("w-full", "") + " w-40 text-foreground"} value={to} onChange={(e) => setTo(e.target.value)} /></div>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Requests" value={total} tone="violet" />
        <StatCard label="Fees received" value={rs((data?.by_status ?? []).reduce((s, r) => s + (r.fees || 0), 0))} tone="teal" />
        <StatCard label="Refunded" value={rs((data?.by_status ?? []).reduce((s, r) => s + (r.refunds || 0), 0))} tone="rose" />
        <StatCard label="Completed" value={data?.by_status.find((r) => r.status === "Completed")?.n ?? 0} tone="blue" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4"><div className="mb-2 text-sm font-bold">By status</div>
          <table className="w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="text-start">Status</th><th className="text-end">Requests</th><th className="text-end">Avg wait to accept</th></tr></thead>
            <tbody>{data?.by_status.map((r) => <tr key={r.status} className="border-t border-border"><td className="py-1.5">{r.status}</td><td className="text-end">{r.n}</td><td className="text-end tabular-nums">{Math.round(r.wait || 0)} min</td></tr>)}</tbody></table></section>
        <section className="rounded-2xl border border-border bg-card p-4"><div className="mb-2 text-sm font-bold">By doctor</div>
          {data?.by_doctor.map((d) => <div key={d.doctor_name} className="flex justify-between border-t border-border py-1.5 text-sm"><span>{d.doctor_name}</span><span><b>{d.done}</b> / {d.n} done</span></div>)}
          {!data?.by_doctor.length && <div className="text-sm text-muted-foreground">No accepted visits in this period.</div>}</section>
      </div>
    </div>
  );
}
