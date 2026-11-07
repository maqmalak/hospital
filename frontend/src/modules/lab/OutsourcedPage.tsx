import { useState } from "react";
import { PackageCheck, Send, Truck, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { uploadFile } from "@/services/frappe";
import { cn } from "@/utils/cn";
import { LabHero, rs, StatusChip, useLabLive } from "./shared";

interface O { ready: { name: string; patient_name: string; test_invoice: string; status: string; sample_type: string; tests: string[] }[];
  dispatches: { name: string; reference_lab: string; dispatch_date: string; courier?: string; expected_back?: string; status: string; total_cost: number; purchase_invoice?: string;
    samples: { sample: string; test_invoice: string; patient_name: string; tests: string; received: number; items: { name: string; template: string; status: string }[] }[] }[] }

export default function OutsourcedPage() {
  const { branch } = useAuth();
  const { data, refetch } = useApi<O>("lab.outsourced", { branch });
  const { data: ctx } = useApi<{ reference_labs: string[] }>("lab.context");
  useLabLive(["lab.outsourced"]);
  const [sel, setSel] = useState<string[]>([]);
  const [lab, setLab] = useState("");
  const [courier, setCourier] = useState("");
  const [back, setBack] = useState("");
  const [recv, setRecv] = useState<{ name: string; template: string } | null>(null);
  const dispatch = async () => {
    try { const r = await call<{ name: string }>("lab.dispatch", { samples: sel, reference_lab: lab, courier, expected_back: back || undefined }); toast.success(`Dispatch ${r.name} · purchase bill created`); setSel([]); void refetch(); }
    catch (e) { toast.error(humanizeError(e)); }
  };
  return (
    <div className="mx-auto max-w-7xl">
      <LabHero title="Outsourced tests" sub="Send samples to the reference lab, track them, attach the report when it comes back" icon={Truck} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Section title={`Ready to send · ${data?.ready.length ?? 0}`}>
          {data?.ready.length ? <div className="grid gap-2 sm:grid-cols-2">{data.ready.map((s) => { const on = sel.includes(s.name); return (
            <button key={s.name} onClick={() => setSel((x) => (on ? x.filter((y) => y !== s.name) : [...x, s.name]))} className={cn("rounded-xl border p-3 text-start", on ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500/30 dark:bg-violet-500/10" : "border-border")}>
              <div className="font-semibold">{s.patient_name}</div><div className="font-mono text-[11px] text-muted-foreground">{s.name} · {s.sample_type}</div><div className="mt-1 text-xs font-bold text-violet-700">{s.tests.join(", ")}</div></button>); })}</div> : <Empty title="No samples waiting" />}
        </Section>
        <Section title="Dispatch">
          <Field label="Reference lab"><select className={inputCls} value={lab} onChange={(e) => setLab(e.target.value)}><option value="">—</option>{ctx?.reference_labs.map((l) => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Courier / rider" className="mt-2"><input className={inputCls} value={courier} onChange={(e) => setCourier(e.target.value)} /></Field>
          <Field label="Expected back" className="mt-2"><input type="date" className={inputCls} value={back} onChange={(e) => setBack(e.target.value)} /></Field>
          <Button variant="workflow" className="mt-3 w-full" disabled={!sel.length || !lab} onClick={() => void dispatch()}><Send className="h-4 w-4" />Send {sel.length} samples</Button>
        </Section>
      </div>
      <Section title="Dispatches" className="mt-4">
        {data?.dispatches.length ? data.dispatches.map((d) => (
          <div key={d.name} className="mb-3 rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-2"><Truck className="h-5 w-5 text-violet-600" /><b>{d.reference_lab}</b><span className="font-mono text-xs text-muted-foreground">{d.name}</span><StatusChip s={d.status} />
              <span className="text-xs text-muted-foreground">sent {d.dispatch_date}{d.expected_back ? ` · back ${d.expected_back}` : ""}{d.courier ? ` · ${d.courier}` : ""}</span><span className="ms-auto text-sm font-semibold">{rs(d.total_cost)}</span>{d.purchase_invoice && <span className="font-mono text-[11px] text-muted-foreground">{d.purchase_invoice}</span>}</div>
            <div className="mt-2 divide-y divide-border/60">{d.samples.map((s) => s.items.map((i) => (
              <div key={i.name} className="flex items-center gap-2 py-2 text-sm"><span className="flex-1">{s.patient_name} <span className="text-xs text-muted-foreground">{s.sample}</span></span><span className="font-medium">{i.template}</span><StatusChip s={i.status} />
                {i.status === "Dispatched" && <Button size="xs" variant="submit" onClick={() => setRecv(i)}><PackageCheck className="h-3 w-3" />Report received</Button>}</div>)))}</div>
          </div>)) : <Empty title="No dispatches yet" />}
      </Section>
      {recv && <ReceiveDialog item={recv} onClose={() => setRecv(null)} onDone={() => { setRecv(null); void refetch(); }} />}
    </div>
  );
}

function ReceiveDialog({ item, onClose, onDone }: { item: { name: string; template: string }; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const url = file ? (await uploadFile(file, { isPrivate: true })).file_url : undefined;
      await call("lab.receive_outsourced", { invoice_item: item.name, attachment: url, text_result: text || undefined });
      toast.success("Report attached — waiting for verification"); onDone();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={`${item.template} — reference report`} size="sm">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-sm text-muted-foreground hover:border-violet-400">
        <Upload className="h-6 w-6" />{file ? file.name : "Attach the PDF / scan"}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <Field label="Summary (optional)" className="mt-3"><textarea className={inputCls + " h-20 py-2"} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <Button variant="submit" className="mt-4 w-full" disabled={!file && !text.trim()} loading={busy} onClick={() => void save()}>Save</Button>
    </Dialog>
  );
}
