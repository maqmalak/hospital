import { useState } from "react";
import toast from "react-hot-toast";
import { ArrowRightLeft, Building2, Factory, MapPin, Minus, PackageMinus, Plus, Search, TrendingDown, Trash2, Wrench } from "lucide-react";
import { call, humanizeError, useApi } from "@/lib/api";
import { Empty, Field, inputCls, PageHeader, StatCard, Tabs } from "@/components/common";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { rs } from "./BuyingPages";

/** Fixed assets and consumption (D-59), after the real-estate Assets module: register with book values by category and location,
 *  asset detail (depreciation schedule, movements, repairs), and consumables issued to departments. */
interface Row { name: string; asset_name: string; asset_category: string; location: string; status: string; gross: number; book_value: number; accumulated: number; purchase_date: string; supplier?: string }
interface AssetsRes { rows: Row[]; categories: { category: string; n: number; gross: number; book: number }[]; locations: Record<string, number>; gross: number; book: number; month_depreciation: number;
  repairs: { name: string; asset: string; asset_name: string; repair_status: string; failure_date: string; description: string }[]; all_locations: string[] }
const CAT_TONE: Record<string, string> = { "Medical Equipment": "from-sky-500 to-blue-600", "Laboratory Equipment": "from-violet-500 to-purple-600", "Hospital Furniture": "from-amber-500 to-orange-600",
  "Electrical & Mechanical Plant": "from-emerald-500 to-teal-600", "Building & Infrastructure": "from-stone-500 to-stone-700", "IT Equipment": "from-indigo-500 to-violet-600" };
async function act<T>(fn: () => Promise<T>, ok: string, done?: () => void) { try { await fn(); toast.success(ok); done?.(); } catch (e) { toast.error(humanizeError(e)); } }

export function AssetsPage() {
  const [cat, setCat] = useState(""); const [loc, setLoc] = useState(""); const [q, setQ] = useState("");
  const { data, refetch } = useApi<AssetsRes>("buying.assets", { category: cat || undefined, location: loc || undefined, q: q || undefined });
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  return (
    <div className="space-y-5">
      <PageHeader title="Fixed assets" icon={Factory} color="from-emerald-600 to-teal-700" subtitle="Hospital machinery, lab analysers, furniture, plant, building works and IT — book value after monthly depreciation" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Assets" value={Object.values(data.locations).reduce((a, b) => a + b, 0)} icon={Building2} tone="teal" />
        <StatCard label="Cost" value={rs(data.gross)} icon={Factory} tone="sky" />
        <StatCard label="Book value" value={rs(data.book)} hint={`${rs(data.gross - data.book)} depreciated`} icon={TrendingDown} tone="violet" />
        <StatCard label="Depreciation this month" value={rs(data.month_depreciation)} icon={Minus} tone="amber" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.categories.map((c) => (
        <button key={c.category} onClick={() => setCat(cat === c.category ? "" : c.category)} className={cn("rounded-2xl border bg-card p-4 text-start shadow-sm transition-all hover:-translate-y-0.5", cat === c.category ? "border-primary ring-2 ring-primary/30" : "border-border")}>
          <div className="flex items-center gap-3"><span className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow", CAT_TONE[c.category] ?? "from-slate-500 to-slate-600")}><Factory className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><div className="truncate font-semibold">{c.category}</div><div className="text-xs text-muted-foreground">{c.n} assets</div></div><b className="tabular-nums">{rs(c.book)}</b></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full bg-gradient-to-r", CAT_TONE[c.category] ?? "from-slate-400 to-slate-600")} style={{ width: `${c.gross ? (c.book / c.gross) * 100 : 0}%` }} /></div>
          <div className="mt-1 text-[11px] text-muted-foreground">cost {rs(c.gross)} · {c.gross ? Math.round((c.book / c.gross) * 100) : 0}% book value left</div>
        </button>))}</div>
      <div className="flex flex-wrap gap-1.5">{Object.entries(data.locations).sort((a, b) => b[1] - a[1]).map(([l, n]) => (
        <button key={l} onClick={() => setLoc(loc === l ? "" : l)} className={cn("flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold", loc === l ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}><MapPin className="h-3 w-3" />{l} <span className="opacity-70">{n}</span></button>))}</div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3"><div><div className="font-semibold">Asset register</div><div className="text-xs text-muted-foreground">{data.rows.length} assets{cat ? ` · ${cat}` : ""}{loc ? ` · ${loc}` : ""}</div></div>
          <div className="relative ms-auto min-w-56"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " h-9 ps-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search asset, code or supplier" /></div></div>
        <div className="max-h-[60vh] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-card text-xs text-muted-foreground shadow-[0_1px_0_hsl(var(--border))]"><tr>{["Asset", "Category", "Location", "Bought", "Cost", "Depreciated", "Book value", "Status"].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{data.rows.map((r) => <tr key={r.name} onClick={() => setOpen(r.name)} className="cursor-pointer hover:bg-muted/40">
            <td className="px-3 py-2.5"><div className="font-medium">{r.asset_name}</div><div className="font-mono text-[11px] text-muted-foreground">{r.name}</div></td><td className="px-3 py-2.5 text-xs">{r.asset_category}</td>
            <td className="px-3 py-2.5 text-xs">{r.location}</td><td className="px-3 py-2.5 text-xs">{r.purchase_date}</td><td className="px-3 py-2.5 tabular-nums">{rs(r.gross)}</td>
            <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{rs(r.accumulated)}</td><td className="px-3 py-2.5 font-semibold tabular-nums">{rs(r.book_value)}</td><td className="px-3 py-2.5"><Badge variant={statusVariant(r.status)}>{r.status}</Badge></td></tr>)}</tbody></table></div>
        {!data.rows.length && <div className="p-6"><Empty title="No assets match" icon={Factory} /></div>}
      </div>
      {data.repairs.length > 0 && <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h3 className="mb-2 font-semibold">Recent repairs and services</h3>
        <ul className="divide-y divide-border text-sm">{data.repairs.map((r) => <li key={r.name} className="flex gap-2 py-2"><Wrench className="mt-0.5 h-4 w-4 text-muted-foreground" /><span className="flex-1"><b>{r.asset_name}</b> — {r.description}</span><Badge variant={statusVariant(r.repair_status)}>{r.repair_status}</Badge></li>)}</ul></section>}
      {open && <AssetDialog name={open} locations={data.all_locations} onClose={() => setOpen(null)} onChanged={() => void refetch()} />}
    </div>
  );
}

function AssetDialog({ name, locations, onClose, onChanged }: { name: string; locations: string[]; onClose: () => void; onChanged: () => void }) {
  const { data, refetch } = useApi<{ asset: Record<string, string | number>; schedule: { schedule_date: string; depreciation_amount: number; accumulated_depreciation_amount: number; journal_entry?: string }[];
    movements: { name: string; transaction_date: string; source_location?: string; target_location: string }[]; repairs: { name: string; repair_status: string; failure_date: string; description: string }[];
    posted: number; next?: { schedule_date: string; depreciation_amount: number } }>("buying.asset", { name });
  const [tab, setTab] = useState<"schedule" | "moves" | "repairs">("schedule");
  const [move, setMove] = useState(""); const [reason, setReason] = useState(""); const [fault, setFault] = useState("");
  const done = () => { void refetch(); onChanged(); };
  if (!data) return <Dialog open onClose={onClose} title={name} size="xl"><Skeleton className="h-64" /></Dialog>;
  const a = data.asset;
  return (
    <Dialog open onClose={onClose} title={String(a.asset_name)} size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {([["Code", a.name], ["Category", a.asset_category], ["Location", a.location], ["Status", a.status], ["Supplier", a.supplier], ["Bought", a.purchase_date], ["Cost", rs(Number(a.net_purchase_amount))], ["Book value", rs(Number(a.value_after_depreciation))]] as const).map(([k, v]) =>
            <div key={k} className="rounded-xl bg-muted/50 p-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div><div className="truncate font-semibold">{String(v ?? "—")}</div></div>)}
        </div>
        <div className="text-sm text-muted-foreground">Depreciation booked {rs(data.posted)}{data.next ? ` · next ${rs(data.next.depreciation_amount)} on ${data.next.schedule_date}` : ""}</div>
        <Tabs tabs={[{ key: "schedule", label: "Depreciation", count: data.schedule.length }, { key: "moves", label: "Movements", count: data.movements.length }, { key: "repairs", label: "Repairs", count: data.repairs.length }]} value={tab} onChange={setTab} />
        {tab === "schedule" && <div className="max-h-64 overflow-y-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground"><tr>{["Date", "Depreciation", "Accumulated", "Booked"].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{data.schedule.slice(0, 36).map((s) => <tr key={s.schedule_date} className={s.journal_entry ? "" : "text-muted-foreground"}><td className="px-3 py-1.5">{s.schedule_date}</td><td className="px-3 py-1.5 tabular-nums">{rs(s.depreciation_amount)}</td>
            <td className="px-3 py-1.5 tabular-nums">{rs(s.accumulated_depreciation_amount)}</td><td className="px-3 py-1.5 text-xs">{s.journal_entry ?? "due"}</td></tr>)}</tbody></table></div>}
        {tab === "moves" && <div className="space-y-3"><ul className="divide-y divide-border rounded-xl border border-border text-sm">{data.movements.map((m) => <li key={m.name} className="flex items-center gap-2 px-3 py-2"><ArrowRightLeft className="h-4 w-4 text-muted-foreground" />{m.source_location ?? "—"} → <b>{m.target_location}</b><span className="ms-auto text-xs text-muted-foreground">{String(m.transaction_date).slice(0, 16)}</span></li>)}
          {!data.movements.length && <li className="p-3 text-center text-muted-foreground">Not moved since purchase</li>}</ul>
          <div className="flex flex-wrap gap-2"><select className={inputCls.replace("w-full", "") + " w-48"} value={move} onChange={(e) => setMove(e.target.value)}><option value="">Move to…</option>{locations.filter((l) => l !== a.location).map((l) => <option key={l}>{l}</option>)}</select>
            <input className={inputCls.replace("w-full", "") + " min-w-48 flex-1"} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. extra ventilator for ICU)" />
            <Button variant="primary" disabled={!move} onClick={() => void act(() => call("buying.move_asset", { name, location: move, reason: reason || undefined }), `Moved to ${move}`, () => { setMove(""); setReason(""); done(); })}><ArrowRightLeft className="h-4 w-4" />Move</Button></div></div>}
        {tab === "repairs" && <div className="space-y-3"><ul className="divide-y divide-border rounded-xl border border-border text-sm">{data.repairs.map((r) => <li key={r.name} className="flex gap-2 px-3 py-2"><Wrench className="mt-0.5 h-4 w-4 text-muted-foreground" /><span className="flex-1">{r.description}<span className="block text-xs text-muted-foreground">{String(r.failure_date).slice(0, 16)}</span></span><Badge variant={statusVariant(r.repair_status)}>{r.repair_status}</Badge></li>)}
          {!data.repairs.length && <li className="p-3 text-center text-muted-foreground">No repairs logged</li>}</ul>
          <div className="flex gap-2"><input className={inputCls} value={fault} onChange={(e) => setFault(e.target.value)} placeholder="Fault or service done (e.g. 250-hour service, filters replaced)" />
            <Button variant="primary" disabled={!fault} onClick={() => void act(() => call("buying.repair_asset", { name, description: fault }), "Repair logged", () => { setFault(""); done(); })}><Wrench className="h-4 w-4" />Log</Button></div></div>}
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ consumption
interface ConsRes { by_dept: { cost_center: string; amount: number }[]; by_item: { item_code: string; item_name: string; cost_center: string; qty: number; uom: string; amount: number }[];
  issues: { name: string; posting_date: string; total_outgoing_value: number; remarks?: string; from_warehouse: string }[]; stock: { item_code: string; item_name: string; uom: string; actual_qty: number; stock_value: number; warehouse: string }[];
  from_date: string; to_date: string; cost_centers: string[]; warehouses: string[] }
export function ConsumptionPage() {
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const { data, refetch } = useApi<ConsRes>("buying.consumption", { from_date: range.from, to_date: range.to });
  const [tab, setTab] = useState<"dept" | "items" | "stock">("dept"); const [issue, setIssue] = useState(false);
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  const total = data.by_dept.reduce((a, d) => a + d.amount, 0), max = Math.max(...data.by_dept.map((d) => d.amount), 1);
  const dept = (cc: string) => cc.replace(/ - VVSH$/, "");
  return (
    <div className="space-y-5">
      <PageHeader title="Consumption" icon={PackageMinus} color="from-teal-600 to-emerald-700" subtitle="Consumables issued from the store to OPD, Lab, IPD, OT and Emergency — charged to each department"
        actions={<div className="flex flex-wrap items-center gap-2"><input type="date" className={inputCls.replace("w-full", "") + " w-40"} value={range.from ?? data.from_date} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className="text-muted-foreground">→</span><input type="date" className={inputCls.replace("w-full", "") + " w-40"} value={range.to ?? data.to_date} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          <Button variant="save" onClick={() => setIssue(true)}><Plus className="h-4 w-4" />Issue to department</Button></div>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Consumed" value={rs(total)} icon={PackageMinus} tone="teal" hint={`${data.from_date} → ${data.to_date}`} />
        <StatCard label="Issues" value={data.issues.length} icon={ArrowRightLeft} tone="sky" />
        <StatCard label="Top department" value={data.by_dept[0] ? dept(data.by_dept[0].cost_center) : "—"} hint={data.by_dept[0] ? rs(data.by_dept[0].amount) : ""} icon={Building2} tone="violet" />
        <StatCard label="Stock on hand" value={rs(data.stock.reduce((a, s) => a + s.stock_value, 0))} hint={`${data.stock.length} consumables`} icon={Factory} tone="amber" />
      </div>
      <Tabs tabs={[{ key: "dept", label: "By department" }, { key: "items", label: "By item", count: data.by_item.length }, { key: "stock", label: "Store stock", count: data.stock.length }]} value={tab} onChange={setTab} />
      {tab === "dept" && <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h3 className="mb-3 font-semibold">Cost by department</h3>
          <ul className="space-y-3">{data.by_dept.map((d) => <li key={d.cost_center}><div className="flex justify-between text-sm"><span>{dept(d.cost_center)}</span><b className="tabular-nums">{rs(d.amount)}</b></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-600" style={{ width: `${(d.amount / max) * 100}%` }} /></div></li>)}
            {!data.by_dept.length && <Empty title="Nothing issued in this period" icon={PackageMinus} />}</ul></section>
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h3 className="mb-3 font-semibold">Latest issues</h3>
          <ul className="divide-y divide-border text-sm">{data.issues.slice(0, 12).map((i) => <li key={i.name} className="flex gap-2 py-2"><span className="flex-1"><b>{i.remarks || i.name}</b><span className="block text-xs text-muted-foreground">{i.name} · {i.posting_date}</span></span><b className="tabular-nums">{rs(i.total_outgoing_value)}</b></li>)}</ul></section>
      </div>}
      {tab === "items" && <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Item", "Department", "Qty", "Cost"].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{data.by_item.map((r, i) => <tr key={i}><td className="px-3 py-2">{r.item_name}</td><td className="px-3 py-2 text-xs">{dept(r.cost_center)}</td><td className="px-3 py-2 tabular-nums">{r.qty} {r.uom}</td><td className="px-3 py-2 tabular-nums">{rs(r.amount)}</td></tr>)}</tbody></table></div>}
      {tab === "stock" && <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Item", "Store", "On hand", "Value"].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{data.stock.map((s) => <tr key={s.item_code + s.warehouse}><td className="px-3 py-2">{s.item_name}</td><td className="px-3 py-2 text-xs">{s.warehouse}</td><td className="px-3 py-2 tabular-nums">{s.actual_qty} {s.uom}</td><td className="px-3 py-2 tabular-nums">{rs(s.stock_value)}</td></tr>)}</tbody></table></div>}
      {issue && <IssueDialog data={data} onClose={() => setIssue(false)} onDone={() => { setIssue(false); void refetch(); }} />}
    </div>
  );
}

function IssueDialog({ data, onClose, onDone }: { data: ConsRes; onClose: () => void; onDone: () => void }) {
  const [wh, setWh] = useState(data.warehouses.find((w) => w.startsWith("Main Store")) ?? data.warehouses[0]);
  const [cc, setCc] = useState(data.cost_centers.find((c) => c.startsWith("IPD")) ?? data.cost_centers[0]);
  const [lines, setLines] = useState<{ item_code: string; item_name: string; uom: string; qty: string; max: number }[]>([]);
  const stock = data.stock.filter((s) => s.warehouse === wh && !lines.some((l) => l.item_code === s.item_code));
  return (
    <Dialog open onClose={onClose} title="Issue consumables to a department" size="lg">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2"><Field label="From store"><select className={inputCls} value={wh} onChange={(e) => { setWh(e.target.value); setLines([]); }}>{data.warehouses.map((w) => <option key={w}>{w}</option>)}</select></Field>
          <Field label="To department"><select className={inputCls} value={cc} onChange={(e) => setCc(e.target.value)}>{data.cost_centers.map((c) => <option key={c} value={c}>{c.replace(/ - VVSH$/, "")}</option>)}</select></Field></div>
        <select className={inputCls} value="" onChange={(e) => { const s = data.stock.find((x) => x.item_code === e.target.value && x.warehouse === wh); if (s) setLines([...lines, { item_code: s.item_code, item_name: s.item_name, uom: s.uom, qty: "1", max: s.actual_qty }]); }}>
          <option value="">+ Add item from this store…</option>{stock.map((s) => <option key={s.item_code} value={s.item_code}>{s.item_name} — {s.actual_qty} {s.uom}</option>)}</select>
        <ul className="divide-y divide-border rounded-xl border border-border">{lines.map((l, i) => <li key={l.item_code} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="flex-1">{l.item_name}<span className="block text-[11px] text-muted-foreground">{l.max} {l.uom} in store</span></span>
          <input className={cn(inputCls.replace("w-full", ""), "h-9 w-24 text-end", Number(l.qty) > l.max && "border-rose-500")} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, "") } : x))} />
          <span className="w-12 text-xs text-muted-foreground">{l.uom}</span><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-destructive"><Trash2 className="h-4 w-4" /></button></li>)}
          {!lines.length && <li className="p-3 text-center text-sm text-muted-foreground">Add the items handed over</li>}</ul>
        <Button variant="save" className="w-full" disabled={!lines.length || lines.some((l) => !Number(l.qty) || Number(l.qty) > l.max)}
          onClick={() => void act(() => call("buying.issue", { warehouse: wh, cost_center: cc, lines: JSON.stringify(lines.map((l) => ({ item_code: l.item_code, qty: Number(l.qty) }))), remarks: `Issue to ${cc.replace(/ - VVSH$/, "")}` }), "Issued — charged to the department", onDone)}>Issue</Button>
      </div>
    </Dialog>
  );
}
