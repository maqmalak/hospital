import { useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, HeartPulse, MessageSquareHeart, Send, Star } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { getCall, postCall } from "@/services/frappe";
import { useEffect } from "react";
import { Empty, Field, inputCls, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { addDaysISO, todayISO } from "@/utils/dates";

interface FbRow { name: string; patient: string; patient_name: string; source: string; status: string; doctor?: string; doctor_name?: string; department?: string; rating_value?: number; comment?: string;
  channel?: string; requested_at?: string; received_at?: string; follow_up?: string; follow_up_note?: string; followed_up_at?: string; branch?: string }
interface Rep { by_doctor: { doctor?: string; doctor_name?: string; n: number; avg: number }[]; by_department: { department: string; n: number; avg: number }[]; by_month: { month: string; n: number; avg: number }[];
  by_source: { source: string; n: number; avg: number }[]; distribution: number[]; received: number; average: number | null; requested: number; open_follow_ups: number }

const Stars = ({ v, size = 4 }: { v?: number; size?: number }) => <span className="inline-flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn(`h-${size} w-${size}`, i <= (v ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />)}</span>;
const avg = (v?: number | null) => (v == null ? "—" : Number(v).toFixed(1));

/** /feedback — admin: ratings, low-rating follow-ups, averages by doctor / department / month (W16). */
export default function FeedbackAdminPage() {
  const [tab, setTab] = useState<"follow" | "all" | "report">("follow");
  const [from, setFrom] = useState(addDaysISO(todayISO(), -89));
  const [to, setTo] = useState(todayISO());
  const { data: rows, refetch } = useApi<FbRow[]>("comms.feedback_list", tab === "follow" ? { follow_up: "Open" } : { status: "Received" }, { enabled: tab !== "report" });
  const { data: rep } = useApi<Rep>("comms.feedback_report", { from_date: from, to_date: to });
  const [open, setOpen] = useState<FbRow | null>(null);
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-[#3a0b2a] p-5 text-white shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_0%_0%,rgba(244,114,182,0.4),transparent_60%),radial-gradient(600px_300px_at_100%_100%,rgba(251,191,36,0.3),transparent_60%)]" />
        <div className="relative flex flex-wrap items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><MessageSquareHeart className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">Patient feedback</h1><p className="text-sm text-white/75">Ratings after OPD visits, discharges and pharmacy handovers</p></div>
          <Button className="bg-white/15 text-white hover:bg-white/25" onClick={async () => { try { const r = await call<{ requested: number }>("comms.feedback_send_now"); toast.success(`${r.requested} request(s) sent`); } catch (e) { toast.error(humanizeError(e)); } }}><Send className="h-4 w-4" />Send due requests</Button></div>
        <div className="relative mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{[["Average", avg(rep?.average), "★"], ["Answers", String(rep?.received ?? "–"), `of ${rep?.requested ?? "–"} asked`], ["Follow-ups open", String(rep?.open_follow_ups ?? "–"), "low ratings"],
          ["Answer rate", rep?.requested ? `${Math.round((100 * rep.received) / rep.requested)}%` : "—", "last 90 days"]].map(([l, v, h]) => (
          <div key={l} className="rounded-2xl bg-white/10 p-3 ring-1 ring-inset ring-white/15"><div className="text-[11px] uppercase tracking-wider text-white/60">{l}</div><div className="text-2xl font-black">{v}</div><div className="text-[11px] text-white/60">{h}</div></div>))}</div>
      </div>
      <div className="flex rounded-xl bg-muted p-1 sm:w-fit">{([["follow", `Follow-ups${rep?.open_follow_ups ? ` (${rep.open_follow_ups})` : ""}`], ["all", "All answers"], ["report", "Report"]] as const).map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold", tab === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>))}</div>
      {tab !== "report" ? (rows ? (rows.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((r) => (
        <button key={r.name} onClick={() => setOpen(r)} className={cn("rounded-2xl border bg-card p-4 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg", r.follow_up === "Open" ? "border-rose-300" : "border-border")}>
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className="block truncate">{r.patient_name}</b><span className="text-xs text-muted-foreground">{r.source} · {r.doctor_name ?? r.department ?? "—"}</span></div><Stars v={r.rating_value} /></div>
          {r.comment && <p className="mt-2 line-clamp-3 text-sm">“{r.comment}”</p>}
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span>{r.received_at?.slice(0, 16)} · {r.channel}</span>
            {r.follow_up && <span className={cn("rounded-full px-2 py-0.5 font-bold", r.follow_up === "Open" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700")}>{r.follow_up === "Open" ? "Follow up" : "Followed up"}</span>}</div>
        </button>))}</div> : <Empty title={tab === "follow" ? "No open follow-up" : "No answers yet"} icon={MessageSquareHeart} />) : <div className="flex h-40 items-center justify-center"><Spinner /></div>)
        : <div className="space-y-4">
          <div className="flex flex-wrap gap-2"><Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-5">{(rep?.distribution ?? [0, 0, 0, 0, 0]).map((n, i) => <StatCard key={i} label={`${i + 1} star${i ? "s" : ""}`} value={n} tone={i < 2 ? "rose" : i === 2 ? "amber" : "teal"} />)}</div>
          <div className="grid gap-4 lg:grid-cols-3">
            <ReportList title="By doctor" rows={(rep?.by_doctor ?? []).map((d) => ({ label: d.doctor_name ?? "No doctor", n: d.n, avg: d.avg }))} />
            <ReportList title="By department" rows={(rep?.by_department ?? []).map((d) => ({ label: d.department, n: d.n, avg: d.avg }))} />
            <ReportList title="By month" rows={(rep?.by_month ?? []).map((d) => ({ label: d.month, n: d.n, avg: d.avg }))} />
          </div></div>}
      {open && <FollowUpDialog r={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); void refetch(); }} />}
    </div>
  );
}

function ReportList({ title, rows }: { title: string; rows: { label: string; n: number; avg: number }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4"><b>{title}</b>
      <div className="mt-2 space-y-2">{rows.map((r) => (
        <div key={r.label}><div className="flex items-center justify-between text-sm"><span className="truncate">{r.label}</span><span className="font-bold tabular-nums">{avg(r.avg)} <span className="text-xs font-normal text-muted-foreground">({r.n})</span></span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", r.avg < 3 ? "bg-rose-500" : r.avg < 4 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${(r.avg / 5) * 100}%` }} /></div></div>))}
        {!rows.length && <div className="text-sm text-muted-foreground">No answers.</div>}</div></div>
  );
}

function FollowUpDialog({ r, onClose, onDone }: { r: FbRow; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState(r.follow_up_note ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} size="md" title={r.patient_name} description={`${r.source} · ${r.doctor_name ?? r.department ?? ""} · ${r.received_at?.slice(0, 16) ?? ""}`}>
      <div className="space-y-3"><div className="flex items-center gap-2"><Stars v={r.rating_value} size={6} />{(r.rating_value ?? 5) <= 2 && <span className="flex items-center gap-1 text-sm font-bold text-rose-600"><AlertTriangle className="h-4 w-4" />Low rating</span>}</div>
        {r.comment && <blockquote className="rounded-xl bg-muted p-3 text-sm">“{r.comment}”</blockquote>}
        <Field label="Follow-up note" required><textarea className={inputCls + " min-h-24"} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Called the patient, what was found, what was changed" /></Field>
        <Button variant="save" className="w-full" disabled={!note.trim()} loading={busy} onClick={async () => { setBusy(true); try { await call("comms.feedback_follow_up", { name: r.name, note, done: 1 }); toast.success("Follow-up recorded"); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } }}>
          <CheckCircle2 className="h-4 w-4" />Save — follow-up done</Button></div>
    </Dialog>
  );
}

/** /feedback/:token — public 1-5 rating page from the WhatsApp / SMS link. */
export function FeedbackFormPage() {
  const { token = "" } = useParams();
  const [f, setF] = useState<{ first_name: string; source: string; doctor?: string; status: string; rating?: number; clinic?: string; clinic_ur?: string } | null>(null);
  const [err, setErr] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getCall<typeof f>("hospital_vvs.api.comms.feedback_form", { token }).then((r) => { setF(r); if (r?.status === "Received") setDone(true); }).catch((e) => setErr(humanizeError(e))); }, [token]);
  if (err) return <Shell><AlertTriangle className="mx-auto h-10 w-10 text-amber-300" /><div className="mt-3 text-lg">{err}</div></Shell>;
  if (!f) return <Shell><Spinner /></Shell>;
  if (done) return <Shell><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-300" /><div className="mt-4 text-3xl font-bold">Thank you · شکریہ</div><div className="mt-2 text-white/70">Your feedback helps us care better.</div></Shell>;
  const where = f.source === "IPD" ? "your stay" : f.source === "Pharmacy" ? "the pharmacy" : f.doctor ? `your visit to ${f.doctor}` : "your visit";
  return (
    <Shell>
      <div className="text-sm uppercase tracking-[0.3em] text-white/50">{f.clinic}</div>
      <div className="mt-3 text-3xl font-bold">{f.first_name}, how was {where}?</div>
      <div className="mt-1 font-urdu text-2xl text-white/70">آپ کا تجربہ کیسا رہا؟</div>
      <div className="mt-8 flex justify-center gap-2">{[1, 2, 3, 4, 5].map((i) => (
        <button key={i} onClick={() => setRating(i)} className="transition-transform active:scale-90" aria-label={`${i} stars`}><Star className={cn("h-12 w-12", i <= rating ? "fill-amber-400 text-amber-400" : "text-white/30")} /></button>))}</div>
      <div className="mt-2 h-6 text-white/70">{["", "Very poor · بہت برا", "Poor · برا", "Okay · ٹھیک", "Good · اچھا", "Excellent · بہترین"][rating]}</div>
      <textarea className="mt-6 min-h-28 w-full rounded-2xl bg-white p-4 text-slate-900 outline-none" placeholder="Anything to tell us? (optional) · کچھ کہنا چاہیں؟" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button disabled={!rating || busy} onClick={async () => { setBusy(true); try { await postCall("hospital_vvs.api.comms.feedback_submit", { token, rating, comment }); setDone(true); } catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); } }}
        className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-lg font-bold disabled:opacity-50">Send · بھیجیں</button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#06213a] via-[#062c33] to-[#04281f] p-6 text-center text-white"><div className="w-full max-w-md">
    <HeartPulse className="mx-auto mb-6 h-10 w-10 text-emerald-300" />{children}</div></div>;
}
