import { useEffect, useMemo, useState } from "react";
import { AlertOctagon, CheckCircle2, History, PhoneCall, Save, Siren } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { FLAG_TONE, flagArrow, LabHero, StatusChip, useLabLive } from "./shared";

interface W { name: string; test_invoice: string; template: string; status: string; sample?: string; result?: string; outsourced: number; patient: string; patient_name: string;
  priority: string; expected_at?: string; department: string; test_code: string; has_critical?: number; critical_logged?: number; result_status?: string; send_back_reason?: string }
interface Param { parameter: string; unit: string; normal_low?: number; normal_high?: number; critical_low?: number; critical_high?: number; normal_text?: string; previous?: string }
interface Form { item: { name: string; status: string }; order: { name: string; patient: string; patient_name: string; gender: string; age?: number; priority: string };
  template: { name: string; test_code: string; department: string; result_type: string; text_template?: string; outsourced: number; method?: string };
  parameters: Param[]; previous_date: string; result: null | { name: string; values: { parameter: string; value: string; flag?: string }[]; text_result?: string; has_critical: number; critical_logged: number; send_back_reason?: string; docstatus: number };
  critical_logs: { parameter: string; notified_person: string; method: string; notified_at: string }[]; saved?: string; has_critical?: number }

function localFlag(v: string, p: Param) {
  const n = Number(v); if (v.trim() === "" || Number.isNaN(n)) return "";
  if (p.critical_low != null && p.critical_low !== 0 && n <= p.critical_low) return "Critical Low";
  if (p.critical_high != null && p.critical_high !== 0 && n >= p.critical_high) return "Critical High";
  if (p.normal_low != null && n < p.normal_low) return "Low";
  if (p.normal_high && n > p.normal_high) return "High";
  return "";
}

export default function TestsPage() {
  const { branch } = useAuth();
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data: rows, refetch } = useApi<W[]>("lab.worklist", { status, department: dept, branch }, { refetchInterval: 30_000 });
  useLabLive(["lab.worklist"]);
  const depts = useMemo(() => [...new Set((rows ?? []).map((r) => r.department))], [rows]);
  const groups = useMemo(() => { const g: Record<string, W[]> = {}; (rows ?? []).forEach((r) => (g[r.department] ??= []).push(r)); return g; }, [rows]);
  return (
    <div className="mx-auto max-w-7xl">
      <LabHero title="Result entry" sub="Worklist of received samples — enter values, flags and critical alerts are automatic" />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex gap-1 rounded-xl bg-muted p-1">{["", "Received", "Result Entered", "Report Received", "Dispatched"].map((s) => <button key={s} onClick={() => setStatus(s)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === s ? "bg-card shadow" : "text-muted-foreground")}>{s || "All open"}</button>)}</div>
        <select className={inputCls.replace("w-full", "") + " w-48"} value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
      </div>
      {Object.entries(groups).map(([d, list]) => (
        <Section key={d} title={`${d} · ${list.length}`} className="mb-4">
          <div className="divide-y divide-border/60">{list.map((r) => (
            <button key={r.name} onClick={() => setOpen(r.name)} className="flex w-full items-center gap-3 py-2.5 text-start hover:bg-muted/40">
              {r.priority === "Urgent" ? <Siren className="h-4 w-4 shrink-0 text-rose-600" /> : <span className="w-4" />}
              <span className="min-w-0 flex-1"><span className="font-semibold">{r.patient_name}</span> <span className="text-xs text-muted-foreground">{r.patient} · {r.sample}</span>
                {r.send_back_reason && r.status === "Result Entered" && <span className="block text-xs text-amber-700">Sent back: {r.send_back_reason}</span>}</span>
              <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">{r.test_code}</span>
              {r.has_critical ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold text-white", r.critical_logged ? "bg-rose-400" : "animate-pulse bg-rose-600")}>CRITICAL{r.critical_logged ? " · logged" : ""}</span> : null}
              <StatusChip s={r.status} /><span className="w-14 text-end text-xs text-muted-foreground">{r.expected_at?.slice(11, 16)}</span>
            </button>))}</div>
        </Section>))}
      {rows && !rows.length && <Empty title="Worklist is empty" hint="Samples appear here once they are received in the lab." />}
      {open && <ResultDialog item={open} onClose={() => { setOpen(null); void refetch(); }} />}
    </div>
  );
}

export function ResultDialog({ item, onClose }: { item: string; onClose: () => void }) {
  const { data, refetch } = useApi<Form>("lab.result_form", { invoice_item: item });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [critical, setCritical] = useState(false);
  useEffect(() => {
    if (!data) return;
    setVals(Object.fromEntries((data.result?.values ?? []).map((v) => [v.parameter, v.value ?? ""])));
    setText(data.result?.text_result ?? data.template.text_template ?? "");
  }, [data]);
  if (!data) return <Dialog open onClose={onClose} title="Result" size="lg"><div className="h-60 animate-pulse rounded-2xl bg-muted" /></Dialog>;
  const locked = data.result?.docstatus === 1;
  const numeric = data.template.result_type !== "Text";
  const textual = data.template.result_type !== "Numeric";
  const save = async () => {
    setBusy(true);
    try {
      const r = await call<Form>("lab.save_result", { invoice_item: item, values: vals, text_result: textual ? text : undefined });
      if (r.has_critical && !r.result?.critical_logged) { setCritical(true); toast.error("Critical value — notify the doctor now", { duration: 8000 }); }
      else { toast.success("Result saved for verification"); onClose(); }
      void refetch();
    } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); }
  };
  const anyCritical = data.parameters.some((p) => localFlag(vals[p.parameter] ?? "", p).startsWith("Critical"));
  return (
    <Dialog open onClose={onClose} title={`${data.template.name} · ${data.order.patient_name}`} description={`${data.order.patient} · ${data.order.gender}${data.order.age != null ? ` · ${data.order.age} y` : ""} · ${data.order.name}${data.template.method ? ` · ${data.template.method}` : ""}`} size="xl">
      {data.result?.send_back_reason && <div className="mb-3 rounded-xl bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Sent back by the pathologist: {data.result.send_back_reason}</div>}
      {locked && <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 p-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />Verified — the pathologist must amend it to change values.</div>}
      {numeric && data.parameters.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Parameter</th><th className="w-40 text-start">Result</th><th className="text-start">Unit</th><th className="text-start">Reference</th><th className="text-start"><History className="inline h-3 w-3" /> Previous {data.previous_date && <span className="normal-case">({data.previous_date})</span>}</th></tr></thead>
          <tbody>{data.parameters.map((p, i) => { const v = vals[p.parameter] ?? ""; const f = localFlag(v, p); return (
            <tr key={p.parameter} className={cn("border-t border-border/60", f.startsWith("Critical") && "bg-rose-50 dark:bg-rose-500/10")}>
              <td className="px-3 py-1.5 font-medium">{p.parameter}</td>
              <td><input disabled={locked} autoFocus={i === 0} className={cn(inputCls, "h-9 font-bold tabular-nums", FLAG_TONE[f])} value={v}
                onChange={(e) => setVals((x) => ({ ...x, [p.parameter]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const inputs = (e.currentTarget.closest("tbody")?.querySelectorAll("input") ?? []) as NodeListOf<HTMLInputElement>; inputs[i + 1]?.focus(); } }} /></td>
              <td className="ps-2 text-xs text-muted-foreground">{p.unit}</td>
              <td className="text-xs text-muted-foreground">{p.normal_text || (p.normal_high ? `${p.normal_low ?? 0} – ${p.normal_high}` : "")}{f && <b className={cn("ms-2", FLAG_TONE[f])}>{f}{flagArrow(f)}</b>}</td>
              <td className="text-xs text-muted-foreground">{p.previous ?? "–"}</td></tr>); })}</tbody></table></div>)}
      {textual && <Field label="Report text" className="mt-3"><textarea disabled={locked} className={inputCls + " h-40 py-2 font-mono text-xs"} value={text} onChange={(e) => setText(e.target.value)} /></Field>}
      {data.critical_logs.length > 0 && <div className="mt-3 rounded-xl bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">{data.critical_logs.map((c, i) => <div key={i}>Notified {c.notified_person} by {c.method} · {c.notified_at.slice(0, 16)}{c.parameter ? ` · ${c.parameter}` : ""}</div>)}</div>}
      {!locked && <div className="mt-4 flex items-center gap-2">
        {anyCritical && <span className="flex items-center gap-1 text-sm font-bold text-rose-600"><AlertOctagon className="h-4 w-4" />Critical value</span>}
        <div className="flex-1" />
        {data.result?.has_critical && !data.result.critical_logged ? <Button variant="danger" onClick={() => setCritical(true)}><PhoneCall className="h-4 w-4" />Log doctor notified</Button> : null}
        <Button variant="save" loading={busy} onClick={() => void save()}><Save className="h-4 w-4" />Save result</Button></div>}
      {critical && data.result && <CriticalDialog result={data.result.name} params={data.parameters.filter((p) => localFlag(vals[p.parameter] ?? "", p).startsWith("Critical")).map((p) => p.parameter)}
        onDone={() => { setCritical(false); onClose(); }} />}
    </Dialog>
  );
}

function CriticalDialog({ result, params, onDone }: { result: string; params: string[]; onDone: () => void }) {
  const [person, setPerson] = useState("");
  const [method, setMethod] = useState("Phone");
  const [readBack, setReadBack] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await call("lab.critical_log", { result, notified_person: person, method, read_back: readBack ? 1 : 0, note, parameter: params.join(", ") }); toast.success("Critical notification logged"); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={() => undefined} title="Critical value — notify now" description="The result cannot be verified until a notification is logged." size="sm">
      <div className="mb-3 rounded-2xl bg-gradient-to-br from-rose-600 to-orange-500 p-3 text-white"><Siren className="mb-1 h-6 w-6" /><b>{params.join(", ") || "Critical value"}</b></div>
      <Field label="Doctor / nurse informed" required><input className={inputCls} value={person} onChange={(e) => setPerson(e.target.value)} autoFocus /></Field>
      <div className="mt-3 flex gap-1">{["Phone", "In person", "Message"].map((x) => <button key={x} onClick={() => setMethod(x)} className={cn("flex-1 rounded-xl border py-2 text-sm font-semibold", method === x ? "border-rose-600 bg-rose-600 text-white" : "border-border")}>{x}</button>)}</div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={readBack} onChange={(e) => setReadBack(e.target.checked)} />The value was read back to me</label>
      <Field label="Note" className="mt-2"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <Button variant="destructive" className="mt-4 w-full" disabled={!person.trim()} loading={busy} onClick={() => void save()}><PhoneCall className="h-4 w-4" />Log notification</Button>
    </Dialog>
  );
}
