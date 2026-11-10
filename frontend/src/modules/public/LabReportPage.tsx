import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, FlaskConical, Lock, Phone, ShieldCheck } from "lucide-react";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { PublicShell } from "./shared";

const M = (x: string) => `hospital_vvs.api.lab.${x}`;
interface V { parameter: string; value: string; unit?: string; normal_range?: string; flag?: string; previous_value?: string }
interface T { test_name: string; status: string; pending: boolean; department?: string; attachment_kind?: string | null; values?: V[]; text_result?: string; interpretation?: string; verified_by?: string; verified_at?: string; version?: number; amended?: boolean }
interface Report { name: string; status: string; posting_date: string; released_at: string; patient: { mr: string; name: string; name_ur?: string; gender: string; age?: number };
  referring_doctor?: string; clinic: { name: string; name_ur?: string; address?: string; phone?: string }; tests: T[] }
interface Open { error?: string; clinic: string; phone?: string; needs_verification?: boolean; method?: string; downloads_left?: number; expires_at?: string; report?: Report }
const TONE: Record<string, string> = { Low: "text-amber-600", High: "text-amber-600", Abnormal: "text-amber-600", "Critical Low": "text-rose-600", "Critical High": "text-rose-600" };

export default function LabReportPage() {
  const { token = "" } = useParams();
  const [o, setO] = useState<Open | null>(null);
  const [err, setErr] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void getCall<Open>(M("report_open"), { token }).then(setO).catch((e) => setErr(humanizeError(e))); }, [token]);
  const verify = async () => {
    setBusy(true); setErr("");
    try { const r = await postCall<{ report: Report; downloads_left: number }>(M("report_verify"), { token, answer }); setO((x) => x && { ...x, needs_verification: false, report: r.report, downloads_left: r.downloads_left }); }
    catch (e) { setErr(humanizeError(e)); } finally { setBusy(false); }
  };
  if (!o) return <PublicShell><div className="rounded-3xl bg-card p-8 text-center shadow-xl">{err || "Loading…"}</div></PublicShell>;
  if (o.error) return (
    <PublicShell clinic={o.clinic} phone={o.phone}><div className="rounded-3xl bg-card p-8 text-center shadow-xl"><Lock className="mx-auto mb-3 h-10 w-10 text-amber-500" /><h1 className="text-lg font-bold">{o.error}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Please contact the lab for a new link.</p>{o.phone && <a href={`tel:${o.phone}`} className="mt-3 inline-flex items-center gap-2 text-primary"><Phone className="h-4 w-4" />{o.phone}</a>}</div></PublicShell>);
  if (o.needs_verification) return (
    <PublicShell clinic={o.clinic} phone={o.phone}>
      <div className="rounded-3xl bg-card p-6 shadow-xl">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-teal-500 text-white"><ShieldCheck className="h-7 w-7" /></div>
        <h1 className="text-center text-xl font-extrabold">Your lab report is ready</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">To protect your privacy, enter the {o.method === "Year of birth" ? "patient's year of birth" : "last 4 digits of the phone number registered with us"}.</p>
        <input className="mx-auto mt-5 block h-14 w-48 rounded-2xl border border-input bg-[hsl(var(--input-bg))] text-center font-mono text-3xl font-bold tracking-[0.4em] outline-none focus:border-primary" inputMode="numeric" maxLength={4}
          value={answer} onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && answer.length === 4 && void verify()} autoFocus />
        {err && <p className="mt-2 text-center text-sm text-rose-600">{err}</p>}
        <Button variant="primary" size="lg" className="mt-4 w-full" disabled={answer.length !== 4} loading={busy} onClick={() => void verify()}>View report</Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">Link valid till {o.expires_at?.slice(0, 16)}</p>
      </div>
    </PublicShell>);
  const r = o.report!;
  return (
    <PublicShell clinic={r.clinic.name} clinicUr={r.clinic.name_ur} phone={r.clinic.phone} address={r.clinic.address} wide>
      <div className="overflow-hidden rounded-3xl bg-card shadow-xl">
        <div className="bg-gradient-to-br from-violet-700 via-indigo-700 to-teal-600 p-5 text-white">
          <div className="flex flex-wrap items-center gap-3"><FlaskConical className="h-8 w-8" /><div className="min-w-0 flex-1"><div className="text-xl font-extrabold">{r.patient.name} {r.patient.name_ur && <span className="urdu ms-2 font-normal">{r.patient.name_ur}</span>}</div>
            <div className="text-sm text-white/80">{r.patient.mr} · {r.patient.gender}{r.patient.age != null ? ` · ${r.patient.age} y` : ""} · {r.name} · {r.posting_date}{r.referring_doctor ? ` · Ref: ${r.referring_doctor}` : ""}</div></div>
            <a href={`/api/method/${M("report_pdf")}?token=${encodeURIComponent(token)}`} className={cn("inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-violet-800", !o.downloads_left && "pointer-events-none opacity-50")}><Download className="h-4 w-4" />PDF ({o.downloads_left ?? 0} left)</a></div>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          {r.tests.map((t, i) => (
            <div key={i} className="rounded-2xl border border-border p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold">{t.test_name}</h2>{t.department && <span className="text-xs text-muted-foreground">{t.department}</span>}{t.amended && <span className="rounded-full bg-rose-100 px-2 text-xs font-bold text-rose-700">Amended v{t.version}</span>}</div>
              {t.pending ? <p className="text-sm text-muted-foreground">Result pending ({t.status}) — you will get a new link when it is ready.</p> : <>
                {t.values?.some((v) => String(v.value ?? "").trim()) && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Test</th><th className="text-start">Result</th><th className="text-start">Unit</th><th className="text-start">Reference</th></tr></thead>
                  <tbody>{t.values.filter((v) => String(v.value ?? "").trim()).map((v) => <tr key={v.parameter} className="border-b border-border/50"><td className="py-1.5">{v.parameter}</td><td className={cn("font-bold tabular-nums", TONE[v.flag ?? ""])}>{v.value}{v.flag?.includes("High") ? " ▲" : v.flag?.includes("Low") ? " ▼" : ""}</td><td className="text-xs text-muted-foreground">{v.unit}</td><td className="text-xs text-muted-foreground">{v.normal_range}</td></tr>)}</tbody></table></div>}
                {t.text_result && <div className="whitespace-pre-wrap mt-2  ">{t.text_result}</div>}
                {t.attachment_kind && <a href={`/api/method/${M("report_file")}?token=${encodeURIComponent(token)}&index=${i}`} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white"><Download className="h-4 w-4" />{t.attachment_kind === "image" ? "Download report (photo)" : "Download report document"}</a>}
                {t.interpretation && <p className="mt-2 text-sm"><b>Interpretation:</b> {t.interpretation}</p>}
                <p className="mt-2 text-xs text-muted-foreground">Verified by {t.verified_by} · {t.verified_at?.slice(0, 16)}</p></>}
            </div>))}
          <p className="text-center text-xs text-muted-foreground">This report is for the patient's own use. Please discuss abnormal values with your doctor.</p>
        </div>
      </div>
    </PublicShell>
  );
}
