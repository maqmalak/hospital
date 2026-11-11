import { useState } from "react";
import { CheckCheck, Microscope, Paperclip, Undo2 } from "lucide-react";
import { useAction, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, inputCls } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { FLAG_TONE, flagArrow, LabHero, useLabLive, PriorityTag } from "./shared";

interface R { priority?: string; name: string; test_invoice: string; test_name: string; department: string; patient: string; patient_name: string; gender: string; age?: number; has_critical: number;
  critical_logged: number; entered_by: string; entered_at: string; version_no: number; amendment_reason?: string; text_result?: string; attachment?: string;
  values: { parameter: string; value: string; unit: string; normal_range: string; flag?: string; previous_value?: string }[] }

export default function VerifyPage() {
  const { branch, hasRole } = useAuth();
  const canSign = hasRole("PW Pathologist");
  const { data: rows, refetch } = useApi<R[]>("lab.verify_list", { branch }, { refetchInterval: 30_000 });
  useLabLive(["lab.verify_list"]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const verify = useAction("lab.verify", { success: "Verified", onSuccess: () => void refetch() });
  const back = useAction("lab.send_back", { success: "Sent back to the technologist", onSuccess: () => void refetch() });
  return (
    <div className="mx-auto max-w-6xl">
      <LabHero title="Pathologist verification" sub={`${rows?.length ?? 0} results waiting · critical first`} icon={Microscope} />
      {!canSign && <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-500/10">View only — the pathologist verifies and signs these results.</div>}
      <div className="space-y-4">
        {(rows ?? []).map((r) => { const abnormal = r.values.filter((v) => v.flag).length; return (
          <div key={r.name} className={cn("overflow-hidden rounded-3xl border bg-card shadow-sm", r.has_critical ? "border-rose-300" : "border-border")}>
            <div className={cn("flex flex-wrap items-center gap-3 px-5 py-3", r.has_critical ? "bg-rose-50 dark:bg-rose-500/10" : "bg-muted/40")}>
              <div className="min-w-0 flex-1"><div className="text-lg font-bold">{r.test_name} <span className="text-sm font-normal text-muted-foreground">· {r.department}{r.version_no > 1 ? ` · amendment v${r.version_no}` : ""}</span></div>
                <div className="text-sm text-muted-foreground">{r.patient_name} · {r.patient} · {r.gender}{r.age != null ? ` · ${r.age} y` : ""} · entered by {r.entered_by} at {r.entered_at.slice(11, 16)}</div></div>
              <PriorityTag p={r.priority} />
              {r.has_critical ? <span className={cn("rounded-full px-3 py-1 text-xs font-bold text-white", r.critical_logged ? "bg-rose-500" : "animate-pulse bg-rose-700")}>CRITICAL{r.critical_logged ? " · doctor notified" : " · not notified"}</span> : null}
              {abnormal > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{abnormal} abnormal</span>}
            </div>
            <div className="px-5 py-3">
              {r.amendment_reason && <div className="mb-2 text-sm text-amber-700">Amendment: {r.amendment_reason}</div>}
              {r.values.some((v) => String(v.value ?? "").trim()) && <table className="w-full text-sm"><thead><tr className="text-xs uppercase text-muted-foreground"><th className="py-1 text-start">Parameter</th><th className="text-start">Result</th><th className="text-start">Unit</th><th className="text-start">Reference</th><th className="text-start">Previous</th></tr></thead>
                <tbody>{r.values.filter((v) => String(v.value ?? "").trim()).map((v) => <tr key={v.parameter} className="border-t border-border/50"><td className="py-1">{v.parameter}</td><td className={cn("font-bold tabular-nums", FLAG_TONE[v.flag ?? ""])}>{v.value}{flagArrow(v.flag)}</td>
                  <td className="text-xs text-muted-foreground">{v.unit}</td><td className="text-xs text-muted-foreground">{v.normal_range}</td><td className="text-xs text-muted-foreground">{v.previous_value ?? "–"}</td></tr>)}</tbody></table>}
              {r.text_result && <div className="whitespace-pre-wrap mt-2  rounded-xl bg-muted/40 p-3 text-sm ">{r.text_result}</div>}
              {r.attachment && <a href={r.attachment} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary"><Paperclip className="h-4 w-4" />Reference lab report</a>}
              {canSign && <div className="mt-3 flex flex-wrap items-center gap-2">
                <input className={inputCls + " min-w-60 flex-1"} placeholder="Interpretation / comment (optional) — or the reason when sending back" value={notes[r.name] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.name]: e.target.value }))} />
                <Button variant="outline" disabled={!notes[r.name]?.trim()} onClick={() => back.mutate({ result: r.name, reason: notes[r.name] })}><Undo2 className="h-4 w-4" />Send back</Button>
                <Button variant="submit" disabled={!!r.has_critical && !r.critical_logged} onClick={() => verify.mutate({ result: r.name, interpretation: notes[r.name] || undefined })}><CheckCheck className="h-4 w-4" />Verify & sign</Button>
              </div>}
            </div>
          </div>); })}
      </div>
      {rows && !rows.length && <Empty title="Nothing to verify" icon={Microscope} />}
    </div>
  );
}
