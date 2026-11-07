import { useState } from "react";
import { Copy, ExternalLink, KeyRound, MonitorSmartphone, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { Empty, Field, inputCls, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";

interface Dev { name: string; device_name: string; device_type: string; counter?: string; branch: string; device_key: string; location?: string; last_seen?: string; is_active: number; path: string }
interface Data { devices: Dev[]; types: string[]; branches: string[]; counters: { name: string; branch: string; counter_type: string }[] }
const ICON: Record<string, string> = { "Customer Display": "🧾", "Queue Display": "🔔", Kiosk: "🖥️", "Waiting Display": "🪑", "Ward Display": "🛏️" };

export default function DevicesPage() {
  const { data, refetch } = useApi<Data>("admin.devices");
  const [edit, setEdit] = useState<Partial<Dev> | null>(null);
  const online = (d: Dev) => d.last_seen && Date.now() - new Date(d.last_seen.replace(" ", "T")).getTime() < 2 * 60_000;
  const url = (d: Dev) => `${window.location.origin}${d.path}`;
  const rotate = async (d: Dev) => { if (!confirm(`Issue a new link for ${d.device_name}? The old link stops working immediately.`)) return; try { await call("admin.rotate_device_key", { name: d.name }); toast.success("New link issued"); void refetch(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Display devices" icon={MonitorSmartphone} color="from-indigo-600 to-sky-500" subtitle="Customer displays, token boards, waiting-room and ward screens — each opens with its own secret link"
        actions={<Button variant="primary" onClick={() => setEdit({ device_type: "Queue Display", is_active: 1, branch: data?.branches[0] })}><Plus className="h-4 w-4" />Add device</Button>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(data?.devices ?? []).map((d) => (
        <div key={d.name} className={cn("rounded-2xl border bg-card p-4 shadow-sm", d.is_active ? "border-border" : "border-dashed opacity-60")}>
          <div className="flex items-start gap-3"><span className="text-3xl">{ICON[d.device_type] ?? "🖥️"}</span>
            <div className="min-w-0 flex-1"><div className="truncate font-bold">{d.device_name}</div><div className="text-xs text-muted-foreground">{d.device_type} · {d.branch}{d.counter ? ` · ${d.counter}` : ""}</div></div>
            <span className={cn("flex items-center gap-1 text-[11px] font-semibold", online(d) ? "text-emerald-600" : "text-muted-foreground")}><span className={cn("h-2 w-2 rounded-full", online(d) ? "bg-emerald-500" : "bg-slate-300")} />{online(d) ? "online" : d.last_seen ? `seen ${d.last_seen.slice(5, 16)}` : "never"}</span></div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <a href={d.path} target="_blank" rel="noreferrer"><Button size="xs" variant="outline"><ExternalLink className="h-3 w-3" />Open</Button></a>
            <Button size="xs" variant="outline" onClick={() => { void navigator.clipboard.writeText(url(d)); toast.success("Link copied"); }}><Copy className="h-3 w-3" />Copy link</Button>
            <Button size="xs" variant="ghost" onClick={() => setEdit(d)}>Edit</Button>
            <Button size="xs" variant="danger" onClick={() => void rotate(d)}><KeyRound className="h-3 w-3" />New link</Button></div>
        </div>))}</div>
      {data && !data.devices.length && <Empty title="No devices" icon={MonitorSmartphone} />}
      {edit && data && <EditDialog d={edit} data={data} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void refetch(); }} />}
    </div>
  );
}

function EditDialog({ d, data, onClose, onDone }: { d: Partial<Dev>; data: Data; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState(d);
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await call("admin.save_device", { data: v }); toast.success("Saved"); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} title={d.name ? `Edit ${d.device_name}` : "Add display device"} size="sm">
      <Field label="Name" required><input className={inputCls} value={v.device_name ?? ""} onChange={(e) => setV({ ...v, device_name: e.target.value })} /></Field>
      <Field label="Type" className="mt-2"><select className={inputCls} value={v.device_type} onChange={(e) => setV({ ...v, device_type: e.target.value })}>{data.types.map((t) => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Branch" className="mt-2"><select className={inputCls} value={v.branch} onChange={(e) => setV({ ...v, branch: e.target.value })}>{data.branches.map((t) => <option key={t}>{t}</option>)}</select></Field>
      {v.device_type === "Customer Display" && <Field label="Counter" className="mt-2"><select className={inputCls} value={v.counter ?? ""} onChange={(e) => setV({ ...v, counter: e.target.value })}><option value="">—</option>{data.counters.filter((c) => c.branch === v.branch).map((c) => <option key={c.name}>{c.name}</option>)}</select></Field>}
      <Field label="Location" className="mt-2"><input className={inputCls} value={v.location ?? ""} onChange={(e) => setV({ ...v, location: e.target.value })} /></Field>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked ? 1 : 0 })} />Active</label>
      <Button variant="primary" className="mt-4 w-full" disabled={!v.device_name?.trim()} loading={busy} onClick={() => void save()}>Save</Button>
    </Dialog>
  );
}
