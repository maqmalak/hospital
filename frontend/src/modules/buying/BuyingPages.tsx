import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Banknote, Building2, CheckCircle2, ClipboardList, FileText, PackageCheck, Plus, Receipt, Search, ShoppingCart, Trash2, Truck, Wallet } from "lucide-react";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, PageHeader, StatCard, Tabs } from "@/components/common";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

/** Buying (D-59), rebuilt in the hospital style after the real-estate Buying module: dashboard, suppliers, material requests,
 *  purchase orders (approve → receive by batch / location → bill), receipts and invoices (pay). Both companies. */
export const rs = (v?: number | null) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
const short = (c?: string) => (c ?? "").replace("VVS Pharmacy (Contract)", "Pharmacy").replace("VVS Hospital", "Hospital");
const sel = inputCls.replace("w-full", "");

function useCompany(): [string, (c: string) => void] {
  const [c, setC] = useState(() => { try { return localStorage.getItem("hv.buy.company") ?? ""; } catch { return ""; } });
  return [c, (v: string) => { setC(v); try { localStorage.setItem("hv.buy.company", v); } catch { /* ignore */ } }];
}
function CompanySwitch({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const opts = [["", "Both companies"], ["VVS Hospital", "Hospital"], ["VVS Pharmacy (Contract)", "Pharmacy"]] as const;
  return <div className="flex rounded-xl bg-muted p-1">{opts.map(([k, l]) => <button key={k} onClick={() => onChange(k)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", value === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>)}</div>;
}
const Progress = ({ v, tone = "bg-teal-500" }: { v: number; tone?: string }) => <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.min(100, v)}%` }} /></div>;
const Status = ({ s }: { s: string }) => <Badge variant={statusVariant(s)}>{s}</Badge>;
async function act<T>(fn: () => Promise<T>, ok: string, done?: (r: T) => void) { try { const r = await fn(); toast.success(ok); done?.(r); } catch (e) { toast.error(humanizeError(e)); } }

interface Ctx { companies: string[]; pharmacy_company: string; warehouses: Record<string, string[]>; suppliers: { name: string; supplier_group: string }[]; locations: string[]; cost_centers: Record<string, string[]>; modes: string[] }
const useCtx = () => useApi<Ctx>("buying.form_context", undefined, { staleTime: 60_000 });

// ------------------------------------------------------------------ dashboard
export function BuyingDashboardPage() {
  const [company, setCompany] = useCompany();
  const { data } = useApi<{ po: Record<string, { n: number; amount: number }>; unpaid: { n: number; amount: number; overdue: number }; month: { company: string; amount: number }[];
    by_supplier: { supplier: string; company: string; owed: number; bills: number }[]; by_group: { grp: string; amount: number }[]; recent: PO[]; mr_pending: number }>("buying.dashboard", company ? { company } : undefined);
  const [newPo, setNewPo] = useState(false);
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  const n = (s: string) => data.po[s]?.n ?? 0;
  const maxG = Math.max(...data.by_group.map((g) => g.amount), 1);
  return (
    <div className="space-y-5">
      <PageHeader title="Buying" icon={ShoppingCart} color="from-amber-600 to-orange-700" subtitle="Suppliers, orders, receiving by batch, supplier bills and payments — hospital and contract pharmacy"
        actions={<div className="flex flex-wrap gap-2"><CompanySwitch value={company} onChange={setCompany} /><Button variant="save" onClick={() => setNewPo(true)}><Plus className="h-4 w-4" />New purchase order</Button></div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="To receive" value={n("To Receive and Bill") + n("To Receive")} icon={Truck} tone="sky" hint="orders waiting for delivery" />
        <StatCard label="To bill" value={n("To Bill")} icon={FileText} tone="violet" hint="received, invoice not booked" />
        <StatCard label="Payable" value={rs(data.unpaid.amount)} icon={Wallet} tone="amber" hint={`${data.unpaid.n} unpaid bills`} />
        <StatCard label="Overdue" value={rs(data.unpaid.overdue)} icon={Banknote} tone="rose" />
        <StatCard label="Material requests" value={data.mr_pending} icon={ClipboardList} tone="teal" hint="waiting for an order" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-semibold">Owed to suppliers</h3>
          <ul className="space-y-2">{data.by_supplier.map((s) => <li key={s.supplier + s.company} className="flex items-center gap-2 text-sm"><Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.supplier}</span><span className="text-xs text-muted-foreground">{short(s.company)} · {s.bills} bills</span></span><b className="tabular-nums">{rs(s.owed)}</b></li>)}
            {!data.by_supplier.length && <Empty title="Nothing owed" icon={CheckCircle2} />}</ul>
        </section>
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-semibold">Spend by supplier group · 90 days</h3>
          <ul className="space-y-3">{data.by_group.map((g) => <li key={g.grp}><div className="flex justify-between text-sm"><span>{g.grp}</span><b className="tabular-nums">{rs(g.amount)}</b></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-600" style={{ width: `${(g.amount / maxG) * 100}%` }} /></div></li>)}</ul>
          <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">This month: {data.month.map((m) => `${short(m.company)} ${rs(m.amount)}`).join(" · ") || "nothing yet"}</div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 font-semibold">Latest orders</h3>
          <ul className="divide-y divide-border">{data.recent.map((p) => <li key={p.name} className="flex items-center gap-2 py-2 text-sm"><span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.supplier}</span>
            <span className="text-xs text-muted-foreground">{p.name} · {short(p.company)} · {p.transaction_date}</span></span><span className="text-end"><b className="block tabular-nums">{rs(p.grand_total)}</b><Status s={p.docstatus === 0 ? "Draft" : p.status} /></span></li>)}</ul>
        </section>
      </div>
      {newPo && <NewOrderDialog company={company} onClose={() => setNewPo(false)} onDone={() => setNewPo(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------ suppliers
interface SupRow { name: string; supplier_name: string; supplier_group: string; tax_id?: string; mobile_no?: string; owed: number; billed: number; last_bill?: string; open_po: number }
export function SuppliersPage() {
  const [q, setQ] = useState(""); const [group, setGroup] = useState("");
  const { data, refetch } = useApi<{ rows: SupRow[]; groups: string[] }>("buying.suppliers", { group: group || undefined });
  const [open, setOpen] = useState<string | null>(null); const [add, setAdd] = useState(false);
  const rows = (data?.rows ?? []).filter((r) => !q || `${r.supplier_name} ${r.tax_id ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <PageHeader title="Suppliers" icon={Building2} color="from-amber-600 to-orange-700" subtitle="Pharmaceutical companies, equipment vendors, contractors and hospital supplies"
        actions={<Button variant="save" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />New supplier</Button>} />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div><div className="font-semibold">Suppliers</div><div className="text-xs text-muted-foreground">{rows.length} suppliers · owed {rs(rows.reduce((a, r) => a + r.owed, 0))}</div></div>
          <div className="relative ms-auto min-w-56"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " h-9 ps-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or NTN" /></div>
          <select className={sel + " h-9 w-48"} value={group} onChange={(e) => setGroup(e.target.value)}><option value="">All groups</option>{data?.groups.map((g) => <option key={g}>{g}</option>)}</select>
        </div>
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Supplier", "Group", "NTN", "Open orders", "Billed", "Owed", "Last bill"].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{rows.map((r) => <tr key={r.name} onClick={() => setOpen(r.name)} className="cursor-pointer hover:bg-muted/40">
            <td className="px-3 py-2.5 font-medium">{r.supplier_name}</td><td className="px-3 py-2.5"><Badge variant="outline">{r.supplier_group}</Badge></td><td className="px-3 py-2.5 font-mono text-xs">{r.tax_id || "—"}</td>
            <td className="px-3 py-2.5">{r.open_po || "—"}</td><td className="px-3 py-2.5 tabular-nums">{rs(r.billed)}</td><td className={cn("px-3 py-2.5 font-semibold tabular-nums", r.owed > 0 && "text-amber-700 dark:text-amber-400")}>{rs(r.owed)}</td>
            <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.last_bill ?? "—"}</td></tr>)}</tbody></table>
        {!rows.length && <div className="p-6"><Empty title="No suppliers" icon={Building2} /></div>}
      </div>
      {open && <SupplierDialog name={open} onClose={() => setOpen(null)} />}
      {add && <NewSupplierDialog groups={data?.groups ?? []} onClose={() => setAdd(false)} onDone={() => { setAdd(false); void refetch(); }} />}
    </div>
  );
}
function SupplierDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const { data } = useApi<{ supplier: Record<string, string>; orders: PO[]; invoices: PI[]; payments: { name: string; posting_date: string; paid_amount: number; mode_of_payment: string; reference_no?: string; company: string }[]; owed: number }>("buying.supplier", { name });
  const [tab, setTab] = useState<"orders" | "invoices" | "payments">("orders");
  return (
    <Dialog open onClose={onClose} title={data?.supplier.supplier_name ?? name} size="xl">
      {!data ? <Skeleton className="h-64" /> : <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm"><Badge variant="outline">{data.supplier.supplier_group}</Badge>{data.supplier.tax_id && <Badge variant="secondary">NTN {data.supplier.tax_id}</Badge>}
          <span className="ms-auto">Owed <b className="text-amber-700 dark:text-amber-400">{rs(data.owed)}</b></span></div>
        <Tabs tabs={[{ key: "orders", label: "Orders", count: data.orders.length }, { key: "invoices", label: "Invoices", count: data.invoices.length }, { key: "payments", label: "Payments", count: data.payments.length }]} value={tab} onChange={setTab} />
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border">
          {tab === "orders" && <MiniTable rows={data.orders.map((o) => [o.name, short(o.company), o.transaction_date, rs(o.grand_total), <Status key="s" s={o.status} />])} head={["Order", "Company", "Date", "Amount", "Status"]} />}
          {tab === "invoices" && <MiniTable rows={data.invoices.map((i) => [i.name, i.bill_no ?? "—", i.posting_date, rs(i.grand_total), rs(i.outstanding_amount), <Status key="s" s={i.status} />])} head={["Invoice", "Bill no.", "Date", "Amount", "Owed", "Status"]} />}
          {tab === "payments" && <MiniTable rows={data.payments.map((p) => [p.name, short(p.company), p.posting_date, rs(p.paid_amount), p.mode_of_payment, p.reference_no ?? ""])} head={["Payment", "Company", "Date", "Amount", "Mode", "Reference"]} />}
        </div></div>}
    </Dialog>
  );
}
function MiniTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return <table className="w-full text-sm"><thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground"><tr>{head.map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-border">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}{!rows.length && <tr><td colSpan={head.length} className="p-4 text-center text-muted-foreground">Nothing yet</td></tr>}</tbody></table>;
}
function NewSupplierDialog({ groups, onClose, onDone }: { groups: string[]; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState({ supplier_name: "", supplier_group: groups.includes("Pharmaceutical") ? "Pharmaceutical" : groups[0] ?? "", tax_id: "", mobile_no: "", email_id: "" });
  return (
    <Dialog open onClose={onClose} title="New supplier" size="md">
      <div className="space-y-3">
        <Field label="Name" required><input className={inputCls} value={d.supplier_name} onChange={(e) => setD({ ...d, supplier_name: e.target.value })} placeholder="e.g. Getz Pharma (Pvt) Ltd" /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Group"><select className={inputCls} value={d.supplier_group} onChange={(e) => setD({ ...d, supplier_group: e.target.value })}>{groups.map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="NTN"><input className={inputCls} value={d.tax_id} onChange={(e) => setD({ ...d, tax_id: e.target.value })} placeholder="1234567-8" /></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Mobile"><input className={inputCls} value={d.mobile_no} onChange={(e) => setD({ ...d, mobile_no: e.target.value })} /></Field>
          <Field label="Email"><input className={inputCls} value={d.email_id} onChange={(e) => setD({ ...d, email_id: e.target.value })} /></Field></div>
        <Button variant="save" className="w-full" disabled={!d.supplier_name} onClick={() => void act(() => call("buying.save_supplier", { data: JSON.stringify(d) }), "Supplier saved", onDone)}>Save supplier</Button>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ purchase orders
interface PO { name: string; supplier: string; company: string; transaction_date: string; schedule_date?: string; grand_total: number; status: string; per_received: number; per_billed: number; docstatus: number }
export function PurchaseOrdersPage() {
  const [company, setCompany] = useCompany();
  const [status, setStatus] = useState<"" | "draft" | "receive" | "bill" | "done">("receive");
  const [q, setQ] = useState("");
  const { data, refetch } = useApi<{ rows: PO[]; counts: Record<string, number> }>("buying.orders", { company: company || undefined, status: status || undefined, q: q || undefined });
  const [open, setOpen] = useState<string | null>(null); const [add, setAdd] = useState(false);
  const c = data?.counts ?? {};
  return (
    <div className="space-y-4">
      <PageHeader title="Purchase orders" icon={ShoppingCart} color="from-amber-600 to-orange-700" subtitle="Order → approve → receive (batch / expiry or asset location) → bill"
        actions={<div className="flex flex-wrap gap-2"><CompanySwitch value={company} onChange={setCompany} /><Button variant="save" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />New order</Button></div>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Drafts to approve" value={c.draft ?? 0} icon={ClipboardList} tone="amber" onClick={() => setStatus("draft")} />
        <StatCard label="To receive" value={c.receive ?? 0} icon={Truck} tone="sky" onClick={() => setStatus("receive")} />
        <StatCard label="To bill" value={c.bill ?? 0} icon={FileText} tone="violet" onClick={() => setStatus("bill")} />
        <StatCard label="Completed" value={c.done ?? 0} icon={CheckCircle2} tone="teal" onClick={() => setStatus("done")} />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex rounded-xl bg-muted p-1">{([["draft", "Draft"], ["receive", "To receive"], ["bill", "To bill"], ["done", "Completed"], ["", "All"]] as const).map(([k, l]) =>
            <button key={k} onClick={() => setStatus(k)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>)}</div>
          <div className="relative ms-auto min-w-56"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " h-9 ps-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order or supplier" /></div>
        </div>
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Order", "Supplier", "Company", "Date", "Amount", "Received", "Billed", "Status"].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{(data?.rows ?? []).map((p) => <tr key={p.name} onClick={() => setOpen(p.name)} className="cursor-pointer hover:bg-muted/40">
            <td className="px-3 py-2.5 font-mono text-xs">{p.name}</td><td className="px-3 py-2.5 font-medium">{p.supplier}</td><td className="px-3 py-2.5 text-xs">{short(p.company)}</td>
            <td className="px-3 py-2.5 text-xs">{p.transaction_date}</td><td className="px-3 py-2.5 tabular-nums">{rs(p.grand_total)}</td>
            <td className="px-3 py-2.5"><Progress v={p.per_received} tone="bg-sky-500" /></td><td className="px-3 py-2.5"><Progress v={p.per_billed} tone="bg-violet-500" /></td>
            <td className="px-3 py-2.5"><Status s={p.docstatus === 0 ? "Draft" : p.status} /></td></tr>)}</tbody></table>
        {data && !data.rows.length && <div className="p-6"><Empty title="No orders here" icon={ShoppingCart} /></div>}
      </div>
      {open && <OrderDialog name={open} onClose={() => setOpen(null)} onChanged={() => void refetch()} />}
      {add && <NewOrderDialog company={company} onClose={() => setAdd(false)} onDone={(n) => { setAdd(false); void refetch(); setOpen(n); }} />}
    </div>
  );
}

interface Line { name: string; item_code: string; item_name: string; qty: number; received_qty: number; rate: number; amount: number; warehouse?: string; uom: string; units_per_pack: number; is_medicine: number; has_batch_no: number; is_fixed_asset: number }
function OrderDialog({ name, onClose, onChanged }: { name: string; onClose: () => void; onChanged: () => void }) {
  const { hasRole } = useAuth();
  const { data, refetch } = useApi<{ order: PO & { net_total: number }; lines: Line[]; receipts: { name: string; posting_date: string; grand_total: number; status: string }[]; invoices: PI[]; can_approve: boolean }>("buying.order", { name });
  const [receiving, setReceiving] = useState(false);
  const done = () => { void refetch(); onChanged(); };
  if (!data) return <Dialog open onClose={onClose} title={name} size="xl"><Skeleton className="h-64" /></Dialog>;
  const o = data.order;
  const toBill = data.receipts.find((r) => r.status !== "Completed" && r.status !== "Closed");
  return (
    <Dialog open onClose={onClose} title={`${o.name} · ${o.supplier}`} size="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="outline">{short(o.company)}</Badge><Status s={o.docstatus === 0 ? "Draft" : o.status} /><span className="text-muted-foreground">Ordered {o.transaction_date} · due {o.schedule_date}</span>
          <span className="ms-auto text-lg font-bold tabular-nums">{rs(o.grand_total)}</span></div>
        <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Item", "Ordered", "Received", "Rate", "Amount", "Into"].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{data.lines.map((l) => { const u = l.is_medicine ? l.units_per_pack : 1; const unit = l.is_medicine ? "packs" : l.uom; return (
            <tr key={l.name}><td className="px-3 py-2"><div className="font-medium">{l.item_name}</div><div className="text-[11px] text-muted-foreground">{l.item_code}{l.is_fixed_asset ? " · fixed asset" : l.has_batch_no ? " · by batch" : ""}</div></td>
              <td className="px-3 py-2 tabular-nums">{(l.qty / u).toLocaleString()} {unit}</td><td className="px-3 py-2 tabular-nums">{(l.received_qty / u).toLocaleString()}</td>
              <td className="px-3 py-2 tabular-nums">{rs(l.rate * u)}</td><td className="px-3 py-2 tabular-nums">{rs(l.amount)}</td><td className="px-3 py-2 text-xs text-muted-foreground">{l.warehouse || "—"}</td></tr>); })}</tbody></table></div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border p-3"><div className="mb-1 text-xs font-semibold text-muted-foreground">Receipts</div>{data.receipts.map((r) => <div key={r.name} className="flex justify-between text-sm"><span>{r.name} · {r.posting_date}</span><span>{rs(r.grand_total)}</span></div>)}{!data.receipts.length && <div className="text-sm text-muted-foreground">Not received yet</div>}</div>
          <div className="rounded-xl border border-border p-3"><div className="mb-1 text-xs font-semibold text-muted-foreground">Supplier invoices</div>{data.invoices.map((i) => <div key={i.name} className="flex justify-between text-sm"><span>{i.name} · {i.posting_date}</span><span>{rs(i.grand_total)} · owed {rs(i.outstanding_amount)}</span></div>)}{!data.invoices.length && <div className="text-sm text-muted-foreground">Not billed yet</div>}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {data.can_approve && <Button variant="save" onClick={() => void act(() => call("buying.approve_order", { name }), "Order approved", done)}><CheckCircle2 className="h-4 w-4" />Approve order</Button>}
          {o.docstatus === 1 && o.per_received < 100 && hasRole("PW Store Keeper") && <Button variant="primary" onClick={() => setReceiving(true)}><PackageCheck className="h-4 w-4" />Receive delivery</Button>}
          {o.docstatus === 1 && o.per_billed < 100 && toBill && <Button variant="outline" onClick={() => void act(() => call("buying.bill_order", { source_doctype: "Purchase Receipt", source_name: toBill.name }), "Supplier invoice booked", done)}><Receipt className="h-4 w-4" />Book supplier invoice</Button>}
          {o.docstatus === 1 && !["Completed", "Closed"].includes(o.status) && hasRole("PW Accountant") && <Button variant="ghost" onClick={() => void act(() => call("buying.close_order", { name }), "Order closed", done)}>Close order</Button>}
        </div>
      </div>
      {receiving && <ReceiveDialog lines={data.lines} name={name} onClose={() => setReceiving(false)} onDone={() => { setReceiving(false); done(); }} />}
    </Dialog>
  );
}

function ReceiveDialog({ name, lines, onClose, onDone }: { name: string; lines: Line[]; onClose: () => void; onDone: () => void }) {
  const { data: ctx } = useCtx();
  const open = lines.filter((l) => l.qty > l.received_qty);
  const [rows, setRows] = useState(() => Object.fromEntries(open.map((l) => [l.name, { qty: String((l.qty - l.received_qty) / (l.is_medicine ? l.units_per_pack : 1)), batch_no: "", expiry: "", location: "" }])));
  const [bill, setBill] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const payload = Object.fromEntries(open.map((l) => { const r = rows[l.name]; return [l.name, { qty: Number(r.qty) * (l.is_medicine ? l.units_per_pack : 1), batch_no: r.batch_no || undefined, expiry: r.expiry || undefined, location: r.location || undefined }]; }));
    await act(() => call<{ purchase_receipt: string; assets: string[] }>("buying.receive_order", { name, lines: JSON.stringify(payload), bill_no: bill || undefined }),
      "Delivery received into stock", (r) => { if (r.assets.length) toast.success(`${r.assets.length} assets registered`); onDone(); });
    setBusy(false);
  };
  const missing = open.some((l) => (l.has_batch_no && (!rows[l.name].expiry)) || (l.is_fixed_asset && !rows[l.name].location));
  return (
    <Dialog open onClose={onClose} title="Receive delivery" size="xl">
      <div className="space-y-3">
        <Field label="Supplier delivery challan / bill no."><input className={inputCls} value={bill} onChange={(e) => setBill(e.target.value)} placeholder="DC-12345" /></Field>
        <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Item", "Receive now", "Batch no.", "Expiry", "Asset location"].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{open.map((l) => { const r = rows[l.name]; const set = (k: string, v: string) => setRows({ ...rows, [l.name]: { ...r, [k]: v } }); return (
            <tr key={l.name}><td className="px-3 py-2"><div className="font-medium">{l.item_name}</div><div className="text-[11px] text-muted-foreground">open {((l.qty - l.received_qty) / (l.is_medicine ? l.units_per_pack : 1)).toLocaleString()} {l.is_medicine ? "packs" : l.uom}</div></td>
              <td className="px-3 py-2"><input className={sel + " h-9 w-24 text-end"} inputMode="decimal" value={r.qty} onChange={(e) => set("qty", e.target.value.replace(/[^\d.]/g, ""))} /></td>
              <td className="px-3 py-2">{l.has_batch_no ? <input className={sel + " h-9 w-36"} value={r.batch_no} onChange={(e) => set("batch_no", e.target.value.toUpperCase())} placeholder="auto if empty" /> : <span className="text-xs text-muted-foreground">—</span>}</td>
              <td className="px-3 py-2">{l.has_batch_no ? <input type="date" className={sel + " h-9 w-40"} value={r.expiry} onChange={(e) => set("expiry", e.target.value)} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
              <td className="px-3 py-2">{l.is_fixed_asset ? <select className={sel + " h-9 w-44"} value={r.location} onChange={(e) => set("location", e.target.value)}><option value="">Choose…</option>{ctx?.locations.map((x) => <option key={x}>{x}</option>)}</select> : <span className="text-xs text-muted-foreground">—</span>}</td></tr>); })}</tbody></table></div>
        <p className="text-xs text-muted-foreground">Batch items need an expiry; fixed assets need a location (each unit becomes an asset with monthly depreciation).</p>
        <Button variant="save" className="w-full" loading={busy} disabled={missing} onClick={() => void save()}><PackageCheck className="h-4 w-4" />Receive into stock</Button>
      </div>
    </Dialog>
  );
}

interface Item { item_code: string; item_name: string; uom: string; last_rate: number; is_fixed_asset: number; units_per_pack?: number }
function NewOrderDialog({ company: initial, onClose, onDone }: { company: string; onClose: () => void; onDone: (name: string) => void }) {
  const { hasRole } = useAuth();
  const { data: ctx } = useCtx();
  const [company, setCompany] = useState(initial || "VVS Hospital");
  const [supplier, setSupplier] = useState(""); const [warehouse, setWarehouse] = useState(""); const [date, setDate] = useState("");
  const [lines, setLines] = useState<(Item & { qty: string; rate: string })[]>([]);
  const [q, setQ] = useState("");
  const { data: hits } = useApi<Item[]>("buying.items", { company, q }, { enabled: !!company });
  useEffect(() => { if (ctx) setWarehouse((ctx.warehouses[company] ?? []).find((w) => /Main Store|Pharmacy Store/.test(w)) ?? ctx.warehouses[company]?.[0] ?? ""); setLines([]); }, [company, ctx]);
  const total = lines.reduce((a, l) => a + Number(l.qty) * Number(l.rate), 0);
  const save = (submit: boolean) => void act(() => call<{ name: string }>("buying.save_order", { data: JSON.stringify({ company, supplier, warehouse, schedule_date: date || undefined, lines: lines.map((l) => ({ item_code: l.item_code, qty: Number(l.qty), rate: Number(l.rate), warehouse: l.is_fixed_asset ? undefined : warehouse })) }), submit: submit ? 1 : 0 }),
    submit ? "Order placed" : "Draft saved — waiting for the accountant's approval", (r) => onDone(r.name));
  const suppliers = useMemo(() => (ctx?.suppliers ?? []).filter((s) => company === ctx?.pharmacy_company ? ["Pharmaceutical", "Distributor"].includes(s.supplier_group) : !["Pharmaceutical"].includes(s.supplier_group)), [ctx, company]);
  return (
    <Dialog open onClose={onClose} title="New purchase order" size="xl">
      {!ctx ? <Skeleton className="h-64" /> : <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-4">
          <Field label="Company"><select className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)}>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Supplier" required><select className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">Choose…</option>{suppliers.map((s) => <option key={s.name}>{s.name}</option>)}</select></Field>
          <Field label="Deliver to"><select className={inputCls} value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>{(ctx.warehouses[company] ?? []).map((w) => <option key={w}>{w}</option>)}</select></Field>
          <Field label="Needed by"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <div className="relative"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder={company === ctx.pharmacy_company ? "Add medicine (brand or generic)" : "Add consumable or asset item"} />
          {q && (hits ?? []).length > 0 && <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-2xl">{(hits ?? []).map((h) =>
            <button key={h.item_code} onClick={() => { setLines((ls) => ls.some((l) => l.item_code === h.item_code) ? ls : [...ls, { ...h, qty: "1", rate: String(Math.round(h.last_rate || 0)) }]); setQ(""); }}
              className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-muted"><span><b>{h.item_name}</b> <span className="text-xs text-muted-foreground">{h.item_code}{h.is_fixed_asset ? " · asset" : ""}</span></span><span className="text-xs text-muted-foreground">last {rs(h.last_rate)} / {h.uom}</span></button>)}</div>}</div>
        <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Item", "Qty", "Rate (Rs)", "Amount", ""].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{lines.map((l, i) => <tr key={l.item_code}><td className="px-3 py-2"><div className="font-medium">{l.item_name}</div><div className="text-[11px] text-muted-foreground">per {l.uom}{l.units_per_pack ? ` (${l.units_per_pack} units)` : ""}</div></td>
            <td className="px-3 py-2"><input className={sel + " h-9 w-24 text-end"} inputMode="decimal" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, "") } : x))} /></td>
            <td className="px-3 py-2"><input className={sel + " h-9 w-32 text-end"} inputMode="decimal" value={l.rate} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, rate: e.target.value.replace(/[^\d.]/g, "") } : x))} /></td>
            <td className="px-3 py-2 tabular-nums">{rs(Number(l.qty) * Number(l.rate))}</td>
            <td className="px-3 py-2"><button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-destructive"><Trash2 className="h-4 w-4" /></button></td></tr>)}
            {!lines.length && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Search above to add items</td></tr>}</tbody></table></div>
        <div className="flex flex-wrap items-center gap-2"><span className="text-lg font-bold">Total {rs(total)}</span><span className="flex-1" />
          <Button variant="outline" disabled={!supplier || !lines.length} onClick={() => save(false)}>Save draft</Button>
          {hasRole("PW Accountant") && <Button variant="save" disabled={!supplier || !lines.length} onClick={() => save(true)}><CheckCircle2 className="h-4 w-4" />Place order</Button>}</div>
      </div>}
    </Dialog>
  );
}

// ------------------------------------------------------------------ receipts
interface PR { name: string; supplier: string; company: string; posting_date: string; grand_total: number; status: string; per_billed: number; supplier_delivery_note?: string; set_warehouse?: string; lines: { item_name: string; qty: number; uom: string; batch_no?: string; asset_location?: string; amount: number }[] }
export function PurchaseReceiptsPage() {
  const [company, setCompany] = useCompany(); const [q, setQ] = useState("");
  const { data, refetch } = useApi<PR[]>("buying.receipts", { company: company || undefined, q: q || undefined });
  return (
    <div className="space-y-4">
      <PageHeader title="Purchase receipts" icon={PackageCheck} color="from-amber-600 to-orange-700" subtitle="Deliveries received into stock by batch and expiry, and assets received by location"
        actions={<CompanySwitch value={company} onChange={setCompany} />} />
      <div className="relative max-w-md"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search receipt or supplier" /></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(data ?? []).map((r) => (
        <div key={r.name} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className="block truncate">{r.supplier}</b><span className="text-xs text-muted-foreground">{r.name} · {r.posting_date} · {short(r.company)}</span></div>
            <div className="text-end"><div className="font-bold tabular-nums">{rs(r.grand_total)}</div><Status s={r.status} /></div></div>
          <ul className="mt-2 space-y-0.5 text-xs">{r.lines.slice(0, 5).map((l, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{l.item_name}</span><span className="shrink-0 text-muted-foreground">{l.qty} {l.uom}{l.batch_no ? ` · ${l.batch_no}` : ""}{l.asset_location ? ` · ${l.asset_location}` : ""}</span></li>)}
            {r.lines.length > 5 && <li className="text-muted-foreground">+{r.lines.length - 5} more</li>}</ul>
          <div className="mt-3 flex items-center gap-2 text-xs"><span className="text-muted-foreground">{r.supplier_delivery_note ? `DC ${r.supplier_delivery_note}` : ""}</span><span className="flex-1" />
            {r.per_billed < 100 && <Button size="sm" variant="outline" onClick={() => void act(() => call("buying.bill_order", { source_doctype: "Purchase Receipt", source_name: r.name }), "Supplier invoice booked", () => void refetch())}><Receipt className="h-4 w-4" />Book invoice</Button>}</div>
        </div>))}
        {data && !data.length && <Empty title="No receipts" icon={PackageCheck} />}</div>
    </div>
  );
}

// ------------------------------------------------------------------ invoices
interface PI { name: string; supplier: string; company: string; posting_date: string; due_date?: string; bill_no?: string; grand_total: number; outstanding_amount: number; status: string }
export function PurchaseInvoicesPage() {
  const [company, setCompany] = useCompany(); const [tab, setTab] = useState<"unpaid" | "overdue" | "paid" | "">("unpaid"); const [q, setQ] = useState("");
  const { data, refetch } = useApi<{ rows: PI[]; totals: { unpaid: number; overdue: number; drafts: number } }>("buying.invoices", { company: company || undefined, status: tab || undefined, q: q || undefined });
  const [pay, setPay] = useState<PI | null>(null);
  const { hasRole } = useAuth();
  return (
    <div className="space-y-4">
      <PageHeader title="Supplier invoices" icon={Receipt} color="from-amber-700 to-red-700" subtitle="Bills from suppliers, what is owed and paying them" actions={<CompanySwitch value={company} onChange={setCompany} />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3"><StatCard label="Payable" value={rs(data?.totals.unpaid)} icon={Wallet} tone="amber" /><StatCard label="Overdue" value={rs(data?.totals.overdue)} icon={Banknote} tone="rose" />
        <StatCard label="Draft invoices" value={data?.totals.drafts ?? 0} icon={FileText} tone="slate" /></div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex rounded-xl bg-muted p-1">{([["unpaid", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"], ["", "All"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", tab === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>)}</div>
          <div className="relative ms-auto min-w-56"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " h-9 ps-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice, bill no. or supplier" /></div>
        </div>
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["Invoice", "Supplier", "Company", "Bill no.", "Date", "Due", "Amount", "Owed", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{(data?.rows ?? []).map((i) => <tr key={i.name} className="hover:bg-muted/30">
            <td className="px-3 py-2.5 font-mono text-xs">{i.name}</td><td className="px-3 py-2.5 font-medium">{i.supplier}</td><td className="px-3 py-2.5 text-xs">{short(i.company)}</td><td className="px-3 py-2.5 text-xs">{i.bill_no ?? "—"}</td>
            <td className="px-3 py-2.5 text-xs">{i.posting_date}</td><td className="px-3 py-2.5 text-xs">{i.due_date}</td><td className="px-3 py-2.5 tabular-nums">{rs(i.grand_total)}</td>
            <td className={cn("px-3 py-2.5 font-semibold tabular-nums", i.outstanding_amount > 0 && "text-amber-700 dark:text-amber-400")}>{rs(i.outstanding_amount)}</td><td className="px-3 py-2.5"><Status s={i.status} /></td>
            <td className="px-3 py-2.5">{i.outstanding_amount > 0 && hasRole("PW Accountant") && <Button size="sm" variant="save" onClick={() => setPay(i)}><Banknote className="h-4 w-4" />Pay</Button>}</td></tr>)}</tbody></table>
        {data && !data.rows.length && <div className="p-6"><Empty title="Nothing here" icon={Receipt} /></div>}
      </div>
      {pay && <PayDialog inv={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); void refetch(); }} />}
    </div>
  );
}
function PayDialog({ inv, onClose, onDone }: { inv: PI; onClose: () => void; onDone: () => void }) {
  const { data: ctx } = useCtx();
  const [d, setD] = useState({ amount: String(Math.round(inv.outstanding_amount)), mode: "Bank Transfer", ref: "" });
  return (
    <Dialog open onClose={onClose} title={`Pay ${inv.supplier}`} size="md">
      <div className="space-y-3">
        <div className="rounded-xl bg-muted/60 p-3 text-sm">{inv.name} · bill {inv.bill_no ?? "—"} · owed <b>{rs(inv.outstanding_amount)}</b></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Amount (Rs)"><input className={inputCls + " text-end font-bold"} inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
          <Field label="Paid by"><select className={inputCls} value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value })}>{(ctx?.modes ?? ["Bank Transfer", "Cash"]).map((m) => <option key={m}>{m}</option>)}</select></Field></div>
        <Field label="Cheque / transfer reference"><input className={inputCls} value={d.ref} onChange={(e) => setD({ ...d, ref: e.target.value })} placeholder="e.g. IBFT 123456" /></Field>
        <Button variant="save" className="w-full" disabled={!Number(d.amount)} onClick={() => void act(() => call("buying.pay_invoice", { name: inv.name, amount: Number(d.amount), mode_of_payment: d.mode, reference_no: d.ref || undefined }), "Payment recorded", onDone)}>Record payment</Button>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ material requests
interface MR { name: string; company: string; transaction_date: string; schedule_date: string; status: string; per_ordered: number; set_warehouse?: string; owner: string; docstatus: number; lines: { item_code: string; item_name: string; qty: number; uom: string; ordered_qty: number }[] }
export function MaterialRequestsPage() {
  const [company, setCompany] = useCompany(); const [status, setStatus] = useState<"pending" | "">("pending");
  const { data, refetch } = useApi<MR[]>("buying.material_requests", { company: company || undefined, status: status || undefined });
  const { data: ctx } = useCtx(); const { hasRole } = useAuth();
  const [add, setAdd] = useState(false); const [order, setOrder] = useState<MR | null>(null); const [supplier, setSupplier] = useState("");
  return (
    <div className="space-y-4">
      <PageHeader title="Material requests" icon={ClipboardList} color="from-amber-600 to-orange-700" subtitle="Wards, lab and pharmacy ask the store to buy; the store turns requests into purchase orders"
        actions={<div className="flex flex-wrap gap-2"><CompanySwitch value={company} onChange={setCompany} /><Button variant="save" onClick={() => setAdd(true)}><Plus className="h-4 w-4" />New request</Button></div>} />
      <div className="flex rounded-xl bg-muted p-1 sm:w-fit">{([["pending", "Waiting for an order"], ["", "All"]] as const).map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold", status === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(data ?? []).map((m) => (
        <div key={m.name} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2"><div><b>{m.name}</b><div className="text-xs text-muted-foreground">{short(m.company)} · {m.transaction_date} · into {m.set_warehouse}</div></div><Status s={m.docstatus === 0 ? "Draft" : m.status} /></div>
          <ul className="mt-2 space-y-0.5 text-xs">{m.lines.map((l) => <li key={l.item_code} className="flex justify-between"><span className="truncate">{l.item_name}</span><span className="text-muted-foreground">{l.qty} {l.uom}{l.ordered_qty ? ` · ordered ${l.ordered_qty}` : ""}</span></li>)}</ul>
          {m.docstatus === 1 && m.per_ordered < 100 && (hasRole("PW Store Keeper") || hasRole("PW Accountant")) && <Button size="sm" variant="primary" className="mt-3" onClick={() => setOrder(m)}><ShoppingCart className="h-4 w-4" />Make purchase order</Button>}
        </div>))}
        {data && !data.length && <Empty title="No requests" icon={ClipboardList} />}</div>
      {add && <NewRequestDialog onClose={() => setAdd(false)} onDone={() => { setAdd(false); void refetch(); }} />}
      {order && <Dialog open onClose={() => setOrder(null)} title={`Order for ${order.name}`} size="md"><div className="space-y-3">
        <Field label="Supplier"><select className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">Choose…</option>{ctx?.suppliers.map((s) => <option key={s.name}>{s.name}</option>)}</select></Field>
        <Button variant="save" className="w-full" disabled={!supplier} onClick={() => void act(() => call("buying.order_from_request", { name: order.name, supplier }), "Purchase order made", () => { setOrder(null); void refetch(); })}>Make order</Button></div></Dialog>}
    </div>
  );
}
function NewRequestDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { data: ctx } = useCtx();
  const [company, setCompany] = useState("VVS Hospital"); const [warehouse, setWarehouse] = useState(""); const [q, setQ] = useState(""); const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ item_code: string; item_name: string; uom: string; qty: string }[]>([]);
  const { data: hits } = useApi<Item[]>("buying.items", { company, q }, { enabled: !!q });
  useEffect(() => { if (ctx) setWarehouse(ctx.warehouses[company]?.find((w) => /Main Store|Pharmacy Store/.test(w)) ?? ""); setLines([]); }, [company, ctx]);
  return (
    <Dialog open onClose={onClose} title="New material request" size="lg">
      {!ctx ? <Skeleton className="h-48" /> : <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2"><Field label="Company"><select className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)}>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Needed in"><select className={inputCls} value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>{(ctx.warehouses[company] ?? []).map((w) => <option key={w}>{w}</option>)}</select></Field></div>
        <div className="relative"><Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add item" />
          {q && (hits ?? []).length > 0 && <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-2xl">{(hits ?? []).filter((h) => !h.is_fixed_asset).map((h) =>
            <button key={h.item_code} onClick={() => { setLines((ls) => [...ls, { item_code: h.item_code, item_name: h.item_name, uom: h.uom === "Pack" ? "Nos" : h.uom, qty: "1" }]); setQ(""); }} className="block w-full px-3 py-2 text-start text-sm hover:bg-muted">{h.item_name}</button>)}</div>}</div>
        <ul className="divide-y divide-border rounded-xl border border-border">{lines.map((l, i) => <li key={l.item_code} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="flex-1">{l.item_name}</span>
          <input className={sel + " h-9 w-24 text-end"} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, "") } : x))} /><span className="w-12 text-xs text-muted-foreground">{l.uom}</span>
          <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-destructive"><Trash2 className="h-4 w-4" /></button></li>)}{!lines.length && <li className="p-3 text-center text-sm text-muted-foreground">Search above to add items</li>}</ul>
        <Field label="Why"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ICU stock running low" /></Field>
        <Button variant="save" className="w-full" disabled={!lines.length || !warehouse} onClick={() => void act(() => call("buying.create_material_request", { company, warehouse, lines: JSON.stringify(lines.map((l) => ({ item_code: l.item_code, qty: Number(l.qty) }))), remarks: note || undefined }), "Request sent to the store", onDone)}>Send request</Button>
      </div>}
    </Dialog>
  );
}

