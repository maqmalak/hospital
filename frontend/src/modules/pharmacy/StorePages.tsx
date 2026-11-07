import { useMemo, useState } from "react";
import { AlertTriangle, ArchiveRestore, ArrowRightLeft, Boxes, CalendarX2, ClipboardList, EyeOff, PackageCheck, PackageOpen, Plus, Search, ShieldAlert, Trash2, Truck, Undo2 } from "lucide-react";
import toast from "react-hot-toast";
import { call, getCall, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, Section, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { addDaysISO, todayISO } from "@/utils/dates";
import { cn } from "@/utils/cn";
import { PharmHero, rs, type Split, stockText } from "./shared";

interface Ctx { warehouses: Record<string, string>; suppliers: string[]; near_expiry_days: number; categories: string[] }
interface Batch { batch_no: string; qty: number; expiry: string; days_left: number; expired: boolean; near_expiry: boolean; mrp: number; split: Split }
interface StockRow { name: string; item_name: string; hv_generic?: string; hv_strength?: string; hv_dosage_form?: string; hv_rack_location?: string; hv_controlled_drug: number; upp: number; stock: Split; batches: Batch[]; expired: boolean; near_expiry: boolean; reorder: number }

function useStoreCtx() { const { branch } = useAuth(); return useApi<Ctx>("store.context", { branch }); }
function WarehousePicker({ ctx, value, onChange, only }: { ctx?: Ctx; value: string; onChange: (v: string) => void; only?: string[] }) {
  return <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">{Object.entries(ctx?.warehouses ?? {}).filter(([k]) => !only || only.includes(k)).map(([k, w]) =>
    <button key={w} onClick={() => onChange(w)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", value === w ? "bg-card shadow" : "text-muted-foreground")}>{k}</button>)}</div>;
}

// ------------------------------------------------------------------ medicine stock (/pharmacy/items)
export function ItemsPage() {
  const { data: ctx } = useStoreCtx();
  const [wh, setWh] = useState("");
  const [q, setQ] = useState("");
  const [flags, setFlags] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const w = wh || ctx?.warehouses["Pharmacy Retail"] || "";
  const { data: rows } = useApi<StockRow[]>("store.stock", { warehouse: w, q, only_flags: flags ? 1 : 0 }, { enabled: !!w });
  const low = (rows ?? []).filter((r) => r.reorder && r.stock.units <= r.reorder).length;
  return (
    <div className="mx-auto max-w-7xl">
      <PharmHero title="Medicine stock" sub="Batch-wise stock in packs, strips and units with expiry flags" icon={Boxes} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Medicines" value={rows?.length ?? 0} tone="blue" />
        <StatCard label="Out of stock" value={(rows ?? []).filter((r) => r.stock.units <= 0).length} tone="rose" />
        <StatCard label="Below reorder" value={low} tone="amber" />
        <StatCard label="Expired / near expiry" value={(rows ?? []).filter((r) => r.expired || r.near_expiry).length} tone="violet" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <WarehousePicker ctx={ctx} value={w} onChange={setWh} />
        <div className="relative min-w-56 flex-1"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} placeholder="Brand or generic" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={flags} onChange={(e) => setFlags(e.target.checked)} />Only problems</label>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Medicine</th><th className="text-start">Rack</th><th className="text-start">Stock</th><th className="text-end">Units</th><th className="text-start ps-4">Next expiry</th><th className="text-start">Flags</th></tr></thead>
        <tbody>{(rows ?? []).map((r) => (<>
          <tr key={r.name} onClick={() => setOpen(open === r.name ? null : r.name)} className="cursor-pointer border-t border-border/60 hover:bg-muted/30">
            <td className="px-3 py-2"><b>{r.item_name}</b><div className="text-xs text-muted-foreground">{r.hv_generic} {r.hv_strength} · {r.hv_dosage_form} · {r.upp}/pack</div></td>
            <td className="text-xs">{r.hv_rack_location}</td><td className={cn("text-xs", r.stock.units <= 0 && "font-bold text-rose-600")}>{stockText(r.stock)}</td><td className="text-end tabular-nums">{r.stock.units}</td>
            <td className="ps-4 text-xs">{r.batches[0]?.expiry ?? "–"}</td>
            <td className="space-x-1">{r.expired && <span className="rounded bg-rose-100 px-1.5 text-[10px] font-bold text-rose-700">EXPIRED</span>}{r.near_expiry && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">NEAR EXPIRY</span>}
              {r.hv_controlled_drug ? <span className="rounded bg-violet-100 px-1.5 text-[10px] font-bold text-violet-700">CONTROLLED</span> : null}{r.reorder > 0 && r.stock.units <= r.reorder && <span className="rounded bg-sky-100 px-1.5 text-[10px] font-bold text-sky-700">REORDER</span>}</td></tr>
          {open === r.name && <tr key={r.name + "b"}><td colSpan={6} className="bg-muted/30 px-6 py-2">{r.batches.length ? r.batches.map((b) => (
            <div key={b.batch_no} className="flex gap-4 py-0.5 text-xs"><span className="w-28 font-mono">{b.batch_no}</span><span className={cn("w-24", b.expired ? "font-bold text-rose-600" : b.near_expiry ? "font-bold text-amber-600" : "")}>{b.expiry}</span><span className="w-32">{stockText(b.split)}</span><span>MRP {rs(b.mrp)}/pack</span></div>)) : "No batches"}</td></tr>}
        </>))}</tbody></table>
        {rows && !rows.length && <Empty title="Nothing here" />}</div>
    </div>
  );
}

// ------------------------------------------------------------------ receive stock (/store/receive)
interface RLine { key: string; item_code: string; item_name: string; batch_no: string; expiry: string; packs: string; free_packs: string; rate_per_pack: string; mrp_per_pack: string }
export function ReceivePage() {
  const { branch } = useAuth();
  const { data: ctx } = useStoreCtx();
  const [supplier, setSupplier] = useState("");
  const [wh, setWh] = useState("");
  const [bill, setBill] = useState("");
  const [lines, setLines] = useState<RLine[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ item_code: string; item_name: string; generic?: string; strength?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const w = wh || ctx?.warehouses["Main Store"] || "";
  const search = async (v: string) => { setQ(v); if (v.length < 2) { setHits([]); return; } try { setHits(await getCall("hospital_vvs.api.pharmacy.search", { q: v })); } catch { setHits([]); } };
  const set = (k: string, p: Partial<RLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...p } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.packs) || 0) * (Number(l.rate_per_pack) || 0), 0);
  const near = (e: string) => e && e < addDaysISO(todayISO(), ctx?.near_expiry_days ?? 90);
  const save = async () => {
    setBusy(true);
    try { const r = await call<{ purchase_receipt: string; warnings: string[] }>("store.receive", { supplier, warehouse: w, bill_no: bill, branch, lines: lines.map((l) => ({ ...l, packs: Number(l.packs), free_packs: Number(l.free_packs) || 0, rate_per_pack: Number(l.rate_per_pack), mrp_per_pack: Number(l.mrp_per_pack) })) });
      toast.success(`Received · ${r.purchase_receipt}`); r.warnings.forEach((x) => toast(x, { icon: "⚠️" })); setLines([]); setBill(""); }
    catch (e) { toast.error(humanizeError(e), { duration: 8000 }); } finally { setBusy(false); }
  };
  const ok = supplier && lines.length && lines.every((l) => l.batch_no && l.expiry && Number(l.packs) > 0 && Number(l.mrp_per_pack) > 0);
  return (
    <div className="mx-auto max-w-7xl">
      <PharmHero title="Receive stock" sub="Purchase receipt by batch — expired stock is refused, near-expiry is flagged" icon={PackageCheck} />
      <Section className="mb-4"><div className="grid gap-3 sm:grid-cols-3">
        <Field label="Supplier" required><select className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">—</option>{ctx?.suppliers.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Supplier bill no."><input className={inputCls} value={bill} onChange={(e) => setBill(e.target.value)} /></Field>
        <Field label="Into"><WarehousePicker ctx={ctx} value={w} onChange={setWh} only={["Main Store", "Pharmacy Retail", "Lab Store"]} /></Field></div></Section>
      <Section title="Lines" actions={<span className="text-lg font-black tabular-nums">{rs(total)}</span>}>
        <div className="relative mb-3"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} placeholder="Add medicine…" value={q} onChange={(e) => void search(e.target.value)} />
          {hits.length > 0 && <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-xl">{hits.map((h) => (
            <button key={h.item_code} className="block w-full px-3 py-2 text-start text-sm hover:bg-muted" onClick={() => { setLines((ls) => [...ls, { key: crypto.randomUUID(), item_code: h.item_code, item_name: h.item_name, batch_no: "", expiry: "", packs: "", free_packs: "", rate_per_pack: "", mrp_per_pack: "" }]); setHits([]); setQ(""); }}>
              <b>{h.item_name}</b> <span className="text-xs text-muted-foreground">{h.generic} {h.strength}</span></button>))}</div>}</div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs uppercase text-muted-foreground"><th className="text-start">Medicine</th><th>Batch</th><th>Expiry</th><th>Packs</th><th>Free</th><th>Rate/pack</th><th>MRP/pack</th><th /></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.key} className="border-t border-border/60 [&_input]:h-9"><td className="py-1.5 pe-2 font-semibold">{l.item_name}</td>
              <td className="px-1"><input className={inputCls.replace("w-full", "") + " w-28 font-mono"} value={l.batch_no} onChange={(e) => set(l.key, { batch_no: e.target.value.toUpperCase() })} /></td>
              <td className="px-1"><input type="date" className={cn(inputCls, "w-36", l.expiry && l.expiry < todayISO() ? "border-rose-500 text-rose-600" : near(l.expiry) ? "border-amber-500" : "")} value={l.expiry} onChange={(e) => set(l.key, { expiry: e.target.value })} /></td>
              {(["packs", "free_packs", "rate_per_pack", "mrp_per_pack"] as const).map((k) => <td key={k} className="px-1"><input className={inputCls.replace("w-full", "") + " w-20 text-end tabular-nums"} inputMode="decimal" value={l[k]} onChange={(e) => set(l.key, { [k]: e.target.value.replace(/[^\d.]/g, "") })} /></td>)}
              <td><button onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="p-1 text-rose-500"><Trash2 className="h-4 w-4" /></button></td></tr>))}</tbody></table></div>
        {!lines.length && <Empty title="Add the medicines on the supplier bill" />}
        <Button variant="submit" size="lg" className="mt-4 w-full" disabled={!ok} loading={busy} onClick={() => void save()}><PackageCheck className="h-5 w-5" />Post receipt</Button>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ transfers (/store/transfers)
interface MR { name: string; transaction_date: string; set_warehouse: string; set_from_warehouse: string; status: string; per_ordered: number; owner: string; items: { item_code: string; item_name: string; qty: number; ordered_qty: number; uom: string }[] }
export function TransfersPage() {
  const { branch } = useAuth();
  const { data: ctx } = useStoreCtx();
  const { data: rows, refetch } = useApi<MR[]>("store.requests", { branch });
  const [creating, setCreating] = useState(false);
  const issue = async (name: string) => { try { const se = await call<string>("store.transfer", { material_request: name }); toast.success(`Issued by earliest expiry · ${se}`); void refetch(); } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } };
  return (
    <div className="mx-auto max-w-6xl">
      <PharmHero title="Store transfers" sub="Requests from pharmacy, wards and lab — issued batch by batch, earliest expiry first" icon={ArrowRightLeft}
        actions={<Button className="bg-white text-sky-800 hover:bg-white/90" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New request</Button>} />
      <div className="space-y-3">{(rows ?? []).map((r) => (
        <div key={r.name} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2"><Truck className="h-5 w-5 text-sky-600" /><b>{r.set_from_warehouse?.split(" - ")[0]} → {r.set_warehouse.split(" - ")[0]}</b><span className="font-mono text-xs text-muted-foreground">{r.name} · {r.transaction_date} · {r.owner.split("@")[0]}</span>
            <span className="ms-auto rounded-full bg-sky-100 px-2 text-xs font-semibold text-sky-800">{r.status} · {Math.round(r.per_ordered)}%</span><Button size="sm" variant="primary" onClick={() => void issue(r.name)}>Issue</Button></div>
          <div className="mt-2 flex flex-wrap gap-1.5">{r.items.map((i) => <span key={i.item_code} className="rounded-lg bg-muted px-2 py-1 text-xs">{i.item_name} <b>{i.qty - i.ordered_qty}</b> {i.uom}</span>)}</div>
        </div>))}</div>
      {rows && !rows.length && <Empty title="No open requests" icon={ArrowRightLeft} />}
      {creating && ctx && <RequestDialog ctx={ctx} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void refetch(); }} />}
    </div>
  );
}

function RequestDialog({ ctx, onClose, onDone }: { ctx: Ctx; onClose: () => void; onDone: () => void }) {
  const [target, setTarget] = useState(ctx.warehouses["Pharmacy Retail"]);
  const [items, setItems] = useState<{ item_code: string; item_name: string; qty: string }[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ item_code: string; item_name: string; upp: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const search = async (v: string) => { setQ(v); if (v.length < 2) { setHits([]); return; } try { setHits(await getCall("hospital_vvs.api.pharmacy.search", { q: v })); } catch { setHits([]); } };
  const save = async () => { setBusy(true); try { const n = await call<string>("store.create_request", { target, items: items.map((i) => ({ item_code: i.item_code, qty: Number(i.qty) })) }); toast.success(`Request ${n} sent`); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} title="Request stock from the main store" size="md">
      <Field label="For"><WarehousePicker ctx={ctx} value={target} onChange={setTarget} only={["Pharmacy Retail", "IPD Dispensing", "Lab Store", "General Store"]} /></Field>
      <div className="relative mt-3"><input className={inputCls} placeholder="Add medicine…" value={q} onChange={(e) => void search(e.target.value)} />
        {hits.length > 0 && <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-xl">{hits.map((h) => <button key={h.item_code} className="block w-full px-3 py-2 text-start text-sm hover:bg-muted" onClick={() => { setItems((x) => [...x, { item_code: h.item_code, item_name: h.item_name, qty: String(h.upp) }]); setHits([]); setQ(""); }}>{h.item_name}</button>)}</div>}</div>
      <div className="mt-3 space-y-1">{items.map((i, k) => <div key={k} className="flex items-center gap-2 text-sm"><span className="flex-1">{i.item_name}</span><input className={inputCls.replace("w-full", "") + " h-8 w-24 text-end"} value={i.qty} onChange={(e) => setItems((x) => x.map((y, j) => (j === k ? { ...y, qty: e.target.value.replace(/\D/g, "") } : y)))} /><span className="text-xs text-muted-foreground">units</span></div>)}</div>
      <Button variant="primary" className="mt-4 w-full" disabled={!items.length} loading={busy} onClick={() => void save()}>Send request</Button>
    </Dialog>
  );
}

// ------------------------------------------------------------------ expiry & returns (/store/returns)
interface ExpRow extends Batch { item_code: string; item_name: string; warehouse: string; location: string; value: number }
export function ReturnsPage() {
  const { branch, boot } = useAuth();
  const [window_, setWindow] = useState(0);
  const { data, refetch } = useApi<{ rows: ExpRow[]; window: number; quarantine: string }>("store.expiry", { branch, window: window_ || undefined });
  const [ret, setRet] = useState<ExpRow | null>(null);
  const isAdmin = (boot?.is_admin || boot?.roles?.includes("PW Admin"));
  const rows = data?.rows ?? [];
  const expired = rows.filter((r) => r.expired && r.location !== "Quarantine");
  const quarantine = async () => { try { const r = await call<unknown>("store.quarantine", { branch }); toast.success(r ? "Expired stock moved to quarantine" : "Nothing to move"); void refetch(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="mx-auto max-w-7xl">
      <PharmHero title="Expiry & returns" sub="Near-expiry watch, quarantine expired stock, return to supplier or write off" icon={CalendarX2}
        actions={<Button className="bg-white text-rose-700 hover:bg-white/90" disabled={!expired.length} onClick={() => void quarantine()}><ShieldAlert className="h-4 w-4" />Quarantine {expired.length} expired</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Expired (on shelf)" value={expired.length} hint={rs(expired.reduce((s, r) => s + r.value, 0))} tone="rose" />
        <StatCard label="In quarantine" value={rows.filter((r) => r.location === "Quarantine").length} tone="slate" />
        <StatCard label={`Expiring ≤ ${data?.window ?? 90} d`} value={rows.filter((r) => !r.expired).length} hint={rs(rows.filter((r) => !r.expired).reduce((s, r) => s + r.value, 0))} tone="amber" />
        <div className="flex items-center gap-1 rounded-2xl border border-border p-2">{[30, 60, 90, 180].map((d) => <button key={d} onClick={() => setWindow(d)} className={cn("flex-1 rounded-lg py-2 text-xs font-bold", (window_ || data?.window) === d ? "bg-primary text-white" : "")}>{d} d</button>)}</div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Medicine</th><th className="text-start">Batch</th><th className="text-start">Where</th><th className="text-start">Expiry</th><th className="text-end">Qty</th><th className="text-end">Value</th><th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.batch_no + r.warehouse} className={cn("border-t border-border/60", r.expired && "bg-rose-50/60 dark:bg-rose-500/10")}>
            <td className="px-3 py-2 font-semibold">{r.item_name}</td><td className="font-mono text-xs">{r.batch_no}</td><td className="text-xs">{r.location}</td>
            <td className={cn("text-xs font-semibold", r.expired ? "text-rose-600" : r.days_left < 30 ? "text-amber-600" : "")}>{r.expiry} <span className="font-normal text-muted-foreground">({r.expired ? "expired" : `${r.days_left} d`})</span></td>
            <td className="text-end text-xs tabular-nums">{r.split ? stockText(r.split) : `${Math.round(r.qty)} units`}</td><td className="text-end tabular-nums">{rs(r.value)}</td>
            <td className="space-x-1 px-2 text-end"><Button size="xs" variant="outline" onClick={() => setRet(r)}><Undo2 className="h-3 w-3" />Return</Button>
              {isAdmin && r.expired && <Button size="xs" variant="danger" onClick={async () => { const reason = prompt("Write-off reason"); if (!reason) return; try { await call("store.write_off", { batch_no: r.batch_no, qty: r.qty, warehouse: r.warehouse, reason }); toast.success("Written off"); void refetch(); } catch (e) { toast.error(humanizeError(e)); } }}>Write off</Button>}</td></tr>))}</tbody></table>
        {data && !rows.length && <Empty title="No expiry problems" icon={ArchiveRestore} />}</div>
      {ret && <ReturnDialog r={ret} onClose={() => setRet(null)} onDone={() => { setRet(null); void refetch(); }} />}
    </div>
  );
}

function ReturnDialog({ r, onClose, onDone }: { r: ExpRow; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState(String(r.qty));
  const [reason, setReason] = useState(r.expired ? "Expired" : "Near expiry");
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { const x = await call<string>("store.supplier_return", { batch_no: r.batch_no, qty: Number(qty), warehouse: r.warehouse, reason }); toast.success(`Supplier return ${x}`); onDone(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} title={`Return ${r.item_name}`} description={`Batch ${r.batch_no} · ${r.location}`} size="sm">
      <Field label="Units"><input className={inputCls + " text-end"} value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} /></Field>
      <Field label="Reason" className="mt-2"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Button variant="primary" className="mt-4 w-full" disabled={!Number(qty)} loading={busy} onClick={() => void save()}>Return to supplier</Button>
    </Dialog>
  );
}

// ------------------------------------------------------------------ cycle count (/store/cycle-count)
interface CC { name: string; warehouse: string; count_date: string; scope: string; status: string; total_variance_value?: number; counted_by?: string; approved_by?: string; stock_reconciliation?: string }
interface Sheet extends CC { items: { name: string; item_code: string; item_name: string; batch_no?: string; rack?: string; system_qty?: number; counted_qty?: number; variance?: number; variance_value?: number }[] }
export function CycleCountPage() {
  const { branch, boot } = useAuth();
  const { data: ctx } = useStoreCtx();
  const { data: rows, refetch } = useApi<CC[]>("store.counts", { branch });
  const [wh, setWh] = useState("");
  const [scope, setScope] = useState("All");
  const [rack, setRack] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const create = async () => { try { const n = await call<string>("store.count_create", { warehouse: wh || ctx?.warehouses["Pharmacy Retail"], scope, rack: rack || undefined, branch }); toast.success(`Count ${n} created`); setOpen(n); void refetch(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <div className="mx-auto max-w-6xl">
      <PharmHero title="Cycle count" sub="Blind count — system quantities stay hidden until you submit; variances above the limit need approval" icon={ClipboardList} />
      <Section title="New count" className="mb-4"><div className="flex flex-wrap items-end gap-3">
        <WarehousePicker ctx={ctx} value={wh || ctx?.warehouses["Pharmacy Retail"] || ""} onChange={setWh} />
        <div className="flex gap-1 rounded-xl bg-muted p-1">{["All", "Rack", "Controlled"].map((s) => <button key={s} onClick={() => setScope(s)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", scope === s ? "bg-card shadow" : "text-muted-foreground")}>{s}</button>)}</div>
        {scope === "Rack" && <input className={inputCls.replace("w-full", "") + " w-32"} placeholder="Rack e.g. A1" value={rack} onChange={(e) => setRack(e.target.value.toUpperCase())} />}
        <Button variant="primary" onClick={() => void create()}><Plus className="h-4 w-4" />Start count</Button></div></Section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(rows ?? []).map((c) => (
        <button key={c.name} onClick={() => setOpen(c.name)} className="rounded-2xl border border-border bg-card p-4 text-start shadow-sm hover:shadow-lg">
          <div className="flex justify-between"><b>{c.warehouse.split(" - ")[0]}</b><span className={cn("rounded-full px-2 text-xs font-semibold", c.status === "Draft" ? "bg-slate-100 text-slate-700" : c.status === "Pending Approval" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>{c.status}</span></div>
          <div className="mt-1 text-xs text-muted-foreground">{c.name} · {c.count_date} · {c.scope}</div>
          {c.total_variance_value != null && c.status !== "Draft" && <div className={cn("mt-2 text-lg font-black tabular-nums", (c.total_variance_value ?? 0) < 0 ? "text-rose-600" : "text-emerald-600")}>{rs(c.total_variance_value)}</div>}
        </button>))}</div>
      {open && <CountDialog name={open} admin={!!(boot?.is_admin || boot?.roles?.includes("PW Admin"))} onClose={() => { setOpen(null); void refetch(); }} />}
    </div>
  );
}

function CountDialog({ name, admin, onClose }: { name: string; admin: boolean; onClose: () => void }) {
  const { data, refetch } = useApi<Sheet>("store.count_sheet", { name });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const draft = data?.status === "Draft";
  const filled = useMemo(() => (data?.items ?? []).filter((i) => counts[i.name] !== undefined && counts[i.name] !== "").length, [counts, data]);
  if (!data) return <Dialog open onClose={onClose} title={name} size="lg"><div className="h-60 animate-pulse rounded-2xl bg-muted" /></Dialog>;
  const submit = async () => { setBusy(true); try { const r = await call<Sheet>("store.count_submit", { name, counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v) || 0])) }); toast.success(r.status === "Pending Approval" ? "Variance above the limit — sent for approval" : "Count posted"); void refetch(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  const decide = async (approve: number) => { try { await call("store.count_approve", { name, approve }); toast.success(approve ? "Approved — stock adjusted" : "Rejected"); void refetch(); } catch (e) { toast.error(humanizeError(e)); } };
  return (
    <Dialog open onClose={onClose} title={`${data.warehouse.split(" - ")[0]} · ${data.name}`} description={`${data.scope} · ${data.status}`} size="xl">
      {draft && <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-100 p-2 text-sm dark:bg-white/5"><EyeOff className="h-4 w-4" />Blind count: enter what you see on the shelf, in units. {filled}/{data.items.length} done.</div>}
      <div className="max-h-[60vh] overflow-y-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-card text-xs uppercase text-muted-foreground"><tr><th className="py-2 text-start">Rack</th><th className="text-start">Medicine</th><th className="text-start">Batch</th>{!draft && <><th className="text-end">System</th></>}<th className="w-28 text-end">Counted</th>{!draft && <><th className="text-end">Variance</th><th className="text-end">Value</th></>}</tr></thead>
        <tbody>{data.items.map((i) => (
          <tr key={i.name} className="border-t border-border/60"><td className="py-1.5 text-xs font-bold">{i.rack}</td><td>{i.item_name}</td><td className="font-mono text-xs">{i.batch_no}</td>
            {!draft && <td className="text-end tabular-nums">{i.system_qty}</td>}
            <td className="ps-2">{draft ? <input className={inputCls + " h-8 text-end tabular-nums"} inputMode="numeric" value={counts[i.name] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [i.name]: e.target.value.replace(/\D/g, "") }))} /> : <div className="text-end tabular-nums">{i.counted_qty}</div>}</td>
            {!draft && <><td className={cn("text-end font-bold tabular-nums", (i.variance ?? 0) < 0 ? "text-rose-600" : (i.variance ?? 0) > 0 ? "text-sky-600" : "")}>{i.variance}</td><td className="text-end tabular-nums">{rs(i.variance_value)}</td></>}</tr>))}</tbody></table></div>
      {!draft && <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/50 p-3"><span className="text-sm">Total variance</span><span className={cn("text-xl font-black tabular-nums", (data.total_variance_value ?? 0) < 0 ? "text-rose-600" : "text-emerald-600")}>{rs(data.total_variance_value)}</span></div>}
      <div className="mt-4 flex justify-end gap-2">
        {draft && <Button variant="submit" disabled={filled < data.items.length} loading={busy} onClick={() => void submit()}>Submit count</Button>}
        {data.status === "Pending Approval" && admin && <><Button variant="outline" onClick={() => void decide(0)}>Reject</Button><Button variant="submit" onClick={() => void decide(1)}>Approve & adjust stock</Button></>}
        {data.status === "Pending Approval" && !admin && <span className="flex items-center gap-1 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />Waiting for the administrator</span>}
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ reports (/pharmacy/reports)
const REPORTS = [{ k: "margin", label: "Sales & margin", icon: PackageOpen }, { k: "controlled", label: "Controlled drug register", icon: ShieldAlert }, { k: "substitutions", label: "Substitutions", icon: ArrowRightLeft },
  { k: "slow", label: "Slow-moving", icon: Boxes }, { k: "returns", label: "Supplier returns", icon: Undo2 }];
export function PharmacyReportsPage() {
  const { branch } = useAuth();
  const [kind, setKind] = useState("margin");
  const [from, setFrom] = useState(addDaysISO(todayISO(), -29));
  const [to, setTo] = useState(todayISO());
  const { data: rows } = useApi<Record<string, unknown>[]>("store.reports", { kind, branch, from_date: from, to_date: to });
  const cols = rows?.[0] ? Object.keys(rows[0]) : [];
  const money = new Set(["sales", "cost", "margin", "grand_total"]);
  const totals = kind === "margin" && rows ? { sales: rows.reduce((s, r) => s + Number(r.sales || 0), 0), margin: rows.reduce((s, r) => s + Number(r.margin || 0), 0) } : null;
  const csv = () => { if (!rows?.length) return; const body = [cols.join(","), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = `${kind}-${from}-${to}.csv`; a.click(); };
  return (
    <div className="mx-auto max-w-7xl">
      <PharmHero title="Pharmacy reports" sub={`${branch} · ${from} → ${to}`} actions={<><input type="date" className="h-10 rounded-xl px-2 text-sm text-slate-900" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" className="h-10 rounded-xl px-2 text-sm text-slate-900" value={to} onChange={(e) => setTo(e.target.value)} /><Button className="bg-white/15 text-white" onClick={csv}>CSV</Button></>} />
      <div className="mb-4 flex flex-wrap gap-2">{REPORTS.map((r) => <button key={r.k} onClick={() => setKind(r.k)} className={cn("flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold", kind === r.k ? "border-transparent bg-gradient-to-br from-sky-600 to-emerald-600 text-white shadow" : "border-border")}><r.icon className="h-4 w-4" />{r.label}</button>)}</div>
      {totals && <div className="mb-4 grid grid-cols-3 gap-3"><StatCard label="Sales" value={rs(totals.sales)} tone="blue" /><StatCard label="Margin" value={rs(totals.margin)} tone="teal" /><StatCard label="Margin %" value={totals.sales ? `${((totals.margin / totals.sales) * 100).toFixed(1)}%` : "–"} tone="violet" /></div>}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">{rows?.length ? <table className="w-full text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr>{cols.map((c) => <th key={c} className="px-3 py-2 text-start">{c.replace(/_/g, " ")}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border/60">{cols.map((c) => <td key={c} className={cn("px-3 py-1.5", money.has(c) && "text-end tabular-nums")}>{money.has(c) ? rs(Number(r[c])) : typeof r[c] === "number" ? Math.round(Number(r[c]) * 100) / 100 : String(r[c] ?? "")}</td>)}</tr>)}</tbody></table> : <Empty title="No rows for this period" />}</div>
    </div>
  );
}
