import { useState } from "react";
import { Ban, Check, Printer, ScanLine, Siren, TestTube2, Truck } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useAction, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { printDoc } from "@/lib/print";
import { Empty, Field, inputCls } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { type Label, LabHero, labelsHtml, Tube, useLabLive } from "./shared";

interface S { name: string; test_invoice: string; patient: string; patient_name: string; sample_type: string; container: string; status: string; collected_at?: string;
  received_at?: string; rejection_reason?: string; recollect_of?: string; tests: string[]; priority?: string; creation: string }
const TABS = [{ k: "Pending", label: "To collect", icon: TestTube2 }, { k: "Collected", label: "To receive", icon: Truck }, { k: "Received", label: "In lab", icon: Check }, { k: "Rejected", label: "Rejected", icon: Ban }];
const REASONS = ["Hemolysed", "Clotted", "Insufficient", "Wrong container", "Unlabeled", "Other"];

export default function SamplesPage() {
  const { branch } = useAuth();
  const [tab, setTab] = useState("Pending");
  const [sel, setSel] = useState<string[]>([]);
  const [scan, setScan] = useState("");
  const [reject, setReject] = useState<S | null>(null);
  const { data: rows, refetch } = useApi<S[]>("lab.samples", { status: tab, branch }, { refetchInterval: 30_000 });
  useLabLive(["lab.samples"]);
  const act = useAction("lab.sample_action", { invalidate: ["lab.samples"], onSuccess: () => void refetch() });
  const print = async (names: string[]) => { try { const l = await call<Label[]>("lab.labels", { samples: names }); await printDoc(labelsHtml(l), "label", { agent: true }); } catch (e) { toast.error(humanizeError(e)); } };
  const onScan = async () => {
    const code = scan.trim(); if (!code) return; setScan("");
    try {
      const r = await call<{ type: string | null; sample?: S }>("lab.scan", { code });
      if (r.type !== "sample" || !r.sample) { toast.error(`${code}: not a sample`); return; }
      const next = r.sample.status === "Pending" ? "collect" : r.sample.status === "Collected" ? "receive" : null;
      if (!next) { toast(`${code} is ${r.sample.status}`); return; }
      await call("lab.sample_action", { name: code, action: next }); toast.success(`${code} ${next === "collect" ? "collected" : "received"}`); void refetch();
    } catch (e) { toast.error(humanizeError(e)); }
  };
  const bulk = async (action: "collect" | "receive") => {
    for (const n of sel) { try { await call("lab.sample_action", { name: n, action }); } catch (e) { toast.error(`${n}: ${humanizeError(e)}`); } }
    if (action === "collect") await print(sel);
    setSel([]); void refetch();
  };
  return (
    <div className="mx-auto max-w-7xl">
      <LabHero title="Samples" sub="Collect, label, receive in the lab — scan a sample barcode to move it on" icon={TestTube2}
        actions={<div className="relative"><ScanLine className="absolute start-3 top-2.5 h-4 w-4 text-white/70" /><input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void onScan()} placeholder="Scan sample barcode"
          className="h-10 w-64 rounded-xl border border-white/20 bg-white/10 ps-9 pe-3 text-sm text-white placeholder:text-white/60 outline-none focus:bg-white/20" /></div>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-2xl bg-muted p-1">{TABS.map((t) => <button key={t.k} onClick={() => { setTab(t.k); setSel([]); }} className={cn("flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold", tab === t.k ? "bg-card shadow" : "text-muted-foreground")}><t.icon className="h-4 w-4" />{t.label}</button>)}</div>
        <div className="flex-1" />
        {sel.length > 0 && <>
          <span className="text-sm text-muted-foreground">{sel.length} selected</span>
          {tab === "Pending" && <Button variant="submit" onClick={() => void bulk("collect")}><Check className="h-4 w-4" />Collect & print labels</Button>}
          {tab === "Collected" && <Button variant="workflow" onClick={() => void bulk("receive")}><Check className="h-4 w-4" />Receive in lab</Button>}
          <Button variant="outline" onClick={() => void print(sel)}><Printer className="h-4 w-4" />Labels</Button></>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(rows ?? []).map((s) => { const on = sel.includes(s.name); return (
          <div key={s.name} onClick={() => tab !== "Rejected" && setSel((x) => (on ? x.filter((y) => y !== s.name) : [...x, s.name]))}
            className={cn("relative cursor-pointer rounded-2xl border bg-card p-4 shadow-sm transition-all", on ? "border-violet-500 ring-2 ring-violet-500/30" : "border-border hover:border-violet-300", s.priority === "Urgent" && "border-s-4 border-s-rose-500")}>
            <div className="flex items-start gap-3"><Tube container={s.container} />
              <div className="min-w-0 flex-1"><div className="truncate font-bold">{s.patient_name}</div><div className="font-mono text-[11px] text-muted-foreground">{s.name}</div>
                <div className="text-xs">{s.sample_type} · {s.container}</div></div>
              {s.priority === "Urgent" && <Siren className="h-4 w-4 text-rose-600" />}</div>
            <div className="mt-2 flex flex-wrap gap-1">{s.tests.map((t) => <span key={t} className="rounded bg-violet-50 px-1.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">{t}</span>)}</div>
            {s.recollect_of && <div className="mt-1 text-[11px] font-semibold text-amber-600">Recollection of {s.recollect_of}</div>}
            {s.rejection_reason && <div className="mt-1 text-xs font-semibold text-rose-600">{s.rejection_reason}</div>}
            <div className="mt-3 flex gap-1" onClick={(e) => e.stopPropagation()}>
              {tab === "Pending" && <Button size="xs" variant="submit" onClick={() => act.mutate({ name: s.name, action: "collect" }, { onSuccess: () => void print([s.name]) })}>Collect</Button>}
              {tab === "Collected" && <Button size="xs" variant="workflow" onClick={() => act.mutate({ name: s.name, action: "receive" })}>Receive</Button>}
              {["Collected", "Received"].includes(tab) && <Button size="xs" variant="danger" onClick={() => setReject(s)}>Reject</Button>}
              <Button size="xs" variant="ghost" onClick={() => void print([s.name])}><Printer className="h-3 w-3" /></Button>
            </div>
          </div>); })}
      </div>
      {rows && !rows.length && <Empty title={`No samples ${TABS.find((t) => t.k === tab)?.label.toLowerCase()}`} icon={TestTube2} />}
      {reject && <RejectDialog s={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); void refetch(); }} />}
    </div>
  );
}

function RejectDialog({ s, onClose, onDone }: { s: S; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const act = useAction<{ recollect: string }>("lab.sample_action", { success: (r) => `Rejected — recollection ${r.recollect} queued`, onSuccess: onDone });
  return (
    <Dialog open onClose={onClose} title={`Reject ${s.name}`} description="A new sample is created for recollection and the patient is informed." size="sm">
      <div className="grid grid-cols-2 gap-2">{REASONS.map((r) => <button key={r} onClick={() => setReason(r)} className={cn("rounded-xl border py-2 text-sm font-semibold", reason === r ? "border-rose-600 bg-rose-600 text-white" : "border-border")}>{r}</button>)}</div>
      <Field label="Note" className="mt-3"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <Button variant="destructive" className="mt-4 w-full" disabled={!reason} loading={act.isPending} onClick={() => act.mutate({ name: s.name, action: "reject", reason, note })}>Reject & recollect</Button>
    </Dialog>
  );
}
