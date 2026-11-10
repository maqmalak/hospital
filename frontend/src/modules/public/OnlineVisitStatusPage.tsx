import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarClock, Check, CircleX, Clock, ImagePlus, Loader2, Lock, Pill, Printer, Stethoscope, Undo2, Video, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { esc, printHtml } from "@/lib/print";
import { cn } from "@/utils/cn";
import { PublicShell } from "./shared";

const M = (x: string) => `hospital_vvs.api.online_visit.${x}`;
interface Rx { name: string; date: string; doctor: string; qualification?: string; registration_no?: string; diagnoses: string[]; lab_tests: string[]; advice?: string; follow_up_date?: string;
  medicines: { item_name: string; dose?: string; frequency?: string; duration?: string; route?: string; instructions?: string }[] }
interface View { name: string; status: string; patient_name: string; created: string; fee: number; fee_status: string; payment_method: string; scheduled_at?: string; video_link?: string | null;
  doctor?: { doctor_name: string; doctor_name_ur?: string; specialization?: string; qualification?: string } | null; rejection_reason?: string | null; cancel_reason?: string | null;
  refund_amount?: number; refund_reference?: string; completed_at?: string; follow_up?: string; follow_up_date?: string; has_prescription: boolean; verified: boolean;
  prescription?: Rx; payment_instructions?: string; clinic: { name: string; name_ur?: string; phone?: string }; can_cancel: boolean; can_pay: boolean; methods: string[] }
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
const when = (s?: string) => (s ? new Date(s.replace(" ", "T")).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Patient's private status page for an online visit: progress, video link, fee, prescription after a 4-digit check. Polls every 20 s. */
export default function OnlineVisitStatusPage() {
  const { token = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ method: "", ref: "", proof: "" });
  const load = useCallback(() => getCall<View>(M("status"), { token }).then(setV).catch((e) => setErr(humanizeError(e))), [token]);
  useEffect(() => { void load(); const id = setInterval(() => void load(), 20_000); return () => clearInterval(id); }, [load]);
  const act = async (fn: () => Promise<View>) => { setBusy(true); try { setV(await fn()); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };

  if (err) return <PublicShell><div className="rounded-3xl bg-card p-8 text-center shadow-xl"><CircleX className="mx-auto mb-2 h-10 w-10 text-rose-500" /><div className="font-semibold">{err}</div></div></PublicShell>;
  if (!v) return <PublicShell><div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin text-white" /></div></PublicShell>;
  const steps = [["Request sent", true], ["Accepted", ["Accepted", "Completed"].includes(v.status)], ["Completed", v.status === "Completed"]] as const;
  const closed = ["Rejected", "Cancelled"].includes(v.status);
  const doc = v.doctor ? (i18n.language === "ur" && v.doctor.doctor_name_ur ? v.doctor.doctor_name_ur : v.doctor.doctor_name) : "";
  const feeLabel = v.fee_status === "Verified" ? t("Fee received") : v.fee_status === "Proof Submitted" ? t("Fee being checked") : v.fee_status === "Refunded" ? t("Refund") : t("Not paid yet");
  return (
    <PublicShell clinic={v.clinic.name} clinicUr={v.clinic.name_ur} phone={v.clinic.phone}>
      <div className="mb-4 text-white"><div className="text-sm text-teal-50/80">{t("Online consultation")} · <span className="font-mono">{v.name}</span></div><div className="text-2xl font-extrabold">{v.patient_name}</div></div>
      <div className="space-y-4">
        <div className="rounded-3xl bg-card p-5 shadow-xl">
          {closed ? <div className="flex items-start gap-3"><CircleX className="h-8 w-8 shrink-0 text-rose-500" /><div><div className="text-lg font-bold">{t(v.status)}</div>
            <div className="text-sm text-muted-foreground">{v.rejection_reason || v.cancel_reason}</div></div></div> : (
            <ol className="flex items-start justify-between">{steps.map(([s, on], i) => (
              <li key={s} className="flex flex-1 flex-col items-center text-center"><div className="flex w-full items-center">{i > 0 && <span className={cn("h-1 flex-1 rounded", on ? "bg-emerald-500" : "bg-muted")} />}
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", on ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>{on ? <Check className="h-5 w-5" /> : <Clock className="h-4 w-4" />}</span>
                {i < steps.length - 1 && <span className={cn("h-1 flex-1 rounded", steps[i + 1][1] ? "bg-emerald-500" : "bg-muted")} />}</div>
                <div className="mt-1 text-xs font-semibold">{t(s)}</div></li>))}</ol>)}
          {v.status === "Pending" && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><Clock className="me-1 inline h-4 w-4" />{t("Waiting for the clinic")}</div>}
        </div>

        {v.status === "Accepted" && <div className="rounded-3xl bg-gradient-to-br from-teal-700 to-emerald-800 p-5 text-white shadow-xl">
          <div className="flex items-center gap-3"><Stethoscope className="h-6 w-6" /><div><div className="text-xs uppercase tracking-widest text-white/70">{t("Your doctor")}</div><div className="text-lg font-bold">{doc}</div>
            <div className="text-xs text-white/70">{v.doctor?.specialization}</div></div></div>
          <div className="mt-3 flex items-center gap-2 text-sm"><CalendarClock className="h-4 w-4" />{when(v.scheduled_at)}</div>
          {v.video_link && <a href={v.video_link} target="_blank" rel="noreferrer" className="mt-4 flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-lg font-black text-teal-800"><Video className="h-6 w-6" />{t("Join video call")}</a>}
        </div>}

        <div className="rounded-3xl bg-card p-5 shadow-xl">
          <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-teal-600" /><span className="flex-1 font-bold">{t("Fee")} {rs(v.fee)}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", v.fee_status === "Verified" ? "bg-emerald-100 text-emerald-800" : v.fee_status === "Refunded" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800")}>{feeLabel}</span></div>
          {v.fee_status === "Refunded" && <div className="mt-2 flex items-center gap-1 text-sm"><Undo2 className="h-4 w-4" />{rs(v.refund_amount)} · {v.refund_reference}</div>}
          {v.can_pay && <div className="mt-3 space-y-2">
            {v.payment_instructions && <div className="whitespace-pre-wrap rounded-xl bg-muted p-3 text-sm" dir="ltr">{v.payment_instructions}</div>}
            <div className="flex flex-wrap gap-1.5">{v.methods.map((m) => <button key={m} onClick={() => setPay({ ...pay, method: m })} className={cn("rounded-lg border px-3 py-1.5 text-sm font-semibold", pay.method === m ? "border-teal-600 bg-teal-600 text-white" : "border-border")}>{m}</button>)}</div>
            {pay.method === "Card (online)" ? <button disabled={busy} onClick={async () => { try { const r = await postCall<{ url: string }>(M("pay_card"), { token }); window.location.href = r.url; } catch (er) { toast.error(humanizeError(er)); } }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 font-bold text-white"><Wallet className="h-5 w-5" />{t("Pay by card")} {rs(v.fee)}</button> : <>
            <input className="h-11 w-full rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3" dir="ltr" placeholder={t("Transaction ID")} value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} />
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><ImagePlus className="h-4 w-4" />{pay.proof ? "✓ " : ""}{t("Upload receipt")}<input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return; const data = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(f); });
              try { setPay((x) => ({ ...x, proof: "" })); const url = await postCall<string>(M("upload"), { filename: f.name, filedata: data }); setPay((x) => ({ ...x, proof: url })); } catch (er) { toast.error(humanizeError(er)); } }} /></label>
            <button disabled={!pay.method || (!pay.ref && !pay.proof) || busy} onClick={() => void act(() => postCall<View>(M("pay"), { token, payment_method: pay.method, payment_reference: pay.ref || undefined, payment_proof: pay.proof || undefined }))}
              className="h-11 w-full rounded-xl bg-teal-600 font-bold text-white disabled:opacity-40">{t("Pay now")}</button></>}</div>}
        </div>

        {v.has_prescription && <div className="rounded-3xl bg-card p-5 shadow-xl">
          <div className="mb-3 flex items-center gap-2"><Pill className="h-5 w-5 text-emerald-600" /><span className="flex-1 font-bold">{t("Prescription")}</span>
            {v.prescription && <button onClick={() => printHtml(rxHtml(v, v.prescription!))} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold"><Printer className="h-3.5 w-3.5" />Print</button>}</div>
          {!v.prescription ? <div className="space-y-2"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="h-4 w-4" />{t("Enter the last 4 digits of your mobile number")}</div>
            <div className="flex gap-2"><input className="h-12 w-full rounded-xl border border-input bg-[hsl(var(--input-bg))] text-center text-xl tracking-[0.5em]" dir="ltr" inputMode="numeric" maxLength={4} value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))} />
              <button disabled={digits.length !== 4 || busy} onClick={() => void act(() => postCall<View>(M("verify"), { token, answer: digits }))} className="h-12 shrink-0 rounded-xl bg-teal-600 px-4 font-bold text-white disabled:opacity-40">{t("Show prescription")}</button></div></div>
          : <RxView rx={v.prescription} />}
        </div>}

        {v.can_cancel && <button disabled={busy} onClick={() => { const r = prompt(t("Cancel request") + "?"); if (r !== null) void act(() => postCall<View>(M("cancel_request"), { token, reason: r || undefined })); }}
          className="w-full rounded-xl py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50">{t("Cancel request")}</button>}
      </div>
    </PublicShell>
  );
}

function RxView({ rx }: { rx: Rx }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs text-muted-foreground">{rx.doctor}{rx.qualification ? ` · ${rx.qualification}` : ""}{rx.registration_no ? ` · PMDC ${rx.registration_no}` : ""} · {rx.date}</div>
      {rx.diagnoses.length > 0 && <div className="font-semibold">{rx.diagnoses.join(", ")}</div>}
      <div className="divide-y divide-border rounded-xl border border-border">{rx.medicines.map((m, i) => (
        <div key={i} className="p-3"><div className="font-bold">{m.item_name}</div><div className="text-muted-foreground" dir="ltr">{[m.dose, m.frequency, m.duration, m.route].filter(Boolean).join(" · ")}</div>
          {m.instructions && <div className="text-xs">{m.instructions}</div>}</div>))}</div>
      {rx.lab_tests.length > 0 && <div><b>Tests:</b> {rx.lab_tests.join(", ")}</div>}
      {rx.advice && <div><b>{t("Advice")}:</b> {rx.advice}</div>}
      {rx.follow_up_date && <div><b>{t("Follow-up")}:</b> {rx.follow_up_date}</div>}
    </div>
  );
}

function rxHtml(v: View, rx: Rx) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A5;margin:10mm}body{font:12px/1.5 Arial,sans-serif;color:#0f172a}h1{font-size:16px;margin:0}
  .m{border-bottom:1px solid #e2e8f0;padding:6px 0}.muted{color:#64748b}</style></head><body><h1>${esc(v.clinic.name)}</h1><div class="muted">Online consultation ${esc(v.name)} · ${esc(rx.date)}</div>
  <p><b>${esc(v.patient_name)}</b></p><p>${esc(rx.doctor)}${rx.qualification ? ` · ${esc(rx.qualification)}` : ""}${rx.registration_no ? ` · PMDC ${esc(rx.registration_no)}` : ""}</p>
  ${rx.diagnoses.length ? `<p><b>Diagnosis:</b> ${esc(rx.diagnoses.join(", "))}</p>` : ""}<h3>℞</h3>
  ${rx.medicines.map((m) => `<div class="m"><b>${esc(m.item_name)}</b><br>${esc([m.dose, m.frequency, m.duration, m.route].filter(Boolean).join(" · "))}${m.instructions ? `<br>${esc(m.instructions)}` : ""}</div>`).join("")}
  ${rx.lab_tests.length ? `<p><b>Tests:</b> ${esc(rx.lab_tests.join(", "))}</p>` : ""}${rx.advice ? `<p><b>Advice:</b> ${esc(rx.advice)}</p>` : ""}${rx.follow_up_date ? `<p><b>Follow-up:</b> ${esc(rx.follow_up_date)}</p>` : ""}
  <p class="muted">Prescription ${esc(rx.name)}</p></body></html>`;
}
