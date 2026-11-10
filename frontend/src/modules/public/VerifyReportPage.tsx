import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, FlaskConical, ShieldAlert } from "lucide-react";
import { getCall, humanizeError } from "@/services/frappe";

interface R { valid: boolean; status?: string; report?: string; version?: number; patient?: string; mr?: string; gender?: string; registered?: string; released_at?: string;
  tests?: { test: string; status: string; verified_at: string }[]; clinic?: string; phone?: string }

/** /verify-report/:name/:sig — the QR on a printed lab report. Confirms it is genuine; no results are shown. */
export default function VerifyReportPage() {
  const { name = "", sig = "" } = useParams();
  const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { getCall<R>("hospital_vvs.api.lab.verify_report", { name, sig }).then(setR).catch((e) => setErr(humanizeError(e))); }, [name, sig]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-sky-100 p-4 dark:from-slate-950 dark:to-teal-950">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-card shadow-2xl">
        {!r && !err && <div className="p-10 text-center text-muted-foreground">Checking…</div>}
        {(err || (r && !r.valid && !r.report)) && <div className="p-8 text-center"><ShieldAlert className="mx-auto h-14 w-14 text-rose-500" /><div className="mt-3 text-xl font-bold">Not a valid report</div>
          <p className="mt-1 text-sm text-muted-foreground">This QR code does not match any report issued by the laboratory. Please contact the laboratory.</p></div>}
        {r?.report && <>
          <div className={r.valid ? "bg-gradient-to-r from-teal-600 to-sky-600 p-6 text-white" : "bg-amber-500 p-6 text-white"}>
            <div className="flex items-center gap-2 text-sm opacity-90"><FlaskConical className="h-4 w-4" />{r.clinic} · Laboratory</div>
            <div className="mt-2 flex items-center gap-2 text-2xl font-black">{r.valid ? <BadgeCheck className="h-7 w-7" /> : <ShieldAlert className="h-7 w-7" />}{r.valid ? "Genuine report" : `Report ${r.status?.toLowerCase()}`}</div>
            <div className="mt-1 font-mono text-sm opacity-90">{r.report} · version {r.version}</div></div>
          <div className="space-y-3 p-6 text-sm">
            <div className="grid grid-cols-2 gap-2">{[["Patient", r.patient], ["MR", r.mr], ["Sex", r.gender], ["Registered", r.registered], ["Reported", r.released_at]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-muted/60 p-2"><div className="text-[10px] uppercase text-muted-foreground">{k}</div><b>{v || "—"}</b></div>))}</div>
            <div><div className="mb-1 text-xs font-bold uppercase text-muted-foreground">Tests on this report</div>
              {r.tests?.map((t, i) => <div key={i} className="flex justify-between border-b border-border/60 py-1.5"><span>{t.test}</span><span className="text-xs text-muted-foreground">{t.status}{t.verified_at ? ` · ${t.verified_at}` : ""}</span></div>)}</div>
            <p className="text-xs text-muted-foreground">Results are not shown here. If the printed values look altered, call {r.phone}. If a newer version exists, the printed version number will be lower than above.</p>
          </div></>}
      </div>
    </div>
  );
}
