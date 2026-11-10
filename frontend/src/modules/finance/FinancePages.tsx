import { useState } from "react";
import { BadgeCheck, Banknote, Building2, CheckCircle2, ClipboardList, FileCheck2, FileText, HandHeart, Landmark, PiggyBank, Plus, Receipt, ShieldCheck, ShoppingCart, TrendingUp, Upload, Wallet, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { uploadFile } from "@/services/frappe";
import { Empty, Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { todayISO } from "@/utils/dates";

const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
const Loading = () => <div className="flex h-60 items-center justify-center"><Spinner size={26} /></div>;
const pill = (s: string) => ({ Approved: "bg-emerald-100 text-emerald-800", Settled: "bg-emerald-100 text-emerald-800", Pending: "bg-amber-100 text-amber-800", "Pending Approval": "bg-amber-100 text-amber-800",
  Submitted: "bg-sky-100 text-sky-800", "Under Query": "bg-violet-100 text-violet-800", "Partially Approved": "bg-orange-100 text-orange-800", Rejected: "bg-rose-100 text-rose-700",
  Draft: "bg-muted text-muted-foreground", Expired: "bg-muted text-muted-foreground" } as Record<string, string>)[s] ?? "bg-muted text-muted-foreground";
const Pill = ({ s }: { s: string }) => <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", pill(s))}>{s}</span>;
const BT = ["OPD Slip", "Lab", "IPD Slip", "Fee", "General"];

async function act<T>(fn: () => Promise<T>, ok: string, done?: (r: T) => void) {
  try { const r = await fn(); toast.success(ok); done?.(r); } catch (e) { toast.error(humanizeError(e), { duration: 8000 }); }
}

function TypeChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const sel = value.split("\n").map((x) => x.trim()).filter(Boolean);
  return <div className="flex flex-wrap gap-1.5">{BT.map((t) => { const on = sel.includes(t); return (
    <button key={t} type="button" onClick={() => onChange((on ? sel.filter((x) => x !== t) : [...sel, t]).join("\n"))} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-teal-600 bg-teal-600 text-white" : "border-border")}>{t}</button>); })}
    <span className="self-center text-[11px] text-muted-foreground">{sel.length ? "" : "none ticked = all"}</span></div>;
}

// ------------------------------------------------------------------ /welfare
interface Fund { name: string; fund_type: string; coverage_percent: number; is_active: number; fund_customer?: string; cap_per_visit?: number; cap_per_month?: number; donations: number; used: number; balance: number; patients: number; approved: number; pending: number }
interface Appr { name: string; patient: string; patient_name: string; scheme: string; status: string; valid_from?: string; valid_till?: string; notes?: string; requested_by?: string; approved_by?: string }
export function WelfarePage() {
  const { data, refetch } = useApi<{ funds: Fund[]; approvals: Appr[]; modes: string[]; can_approve: boolean }>("finance.welfare");
  const [scheme, setScheme] = useState<Partial<Fund> | null>(null);
  const [donate, setDonate] = useState<string | null>(null);
  const [req, setReq] = useState(false);
  if (!data) return <Loading />;
  const tot = data.funds.reduce((a, f) => ({ d: a.d + f.donations, u: a.u + f.used, b: a.b + f.balance }), { d: 0, u: 0, b: 0 });
  return (
    <div className="space-y-5">
      <PageHeader title="Welfare & zakat" icon={HandHeart} color="from-emerald-600 to-teal-700" subtitle="Schemes, patient approvals, donations and fund balances"
        actions={<><Button variant="neutral" onClick={() => setReq(true)}><Plus className="h-4 w-4" />Patient request</Button>{data.can_approve && <Button variant="save" onClick={() => setScheme({ fund_type: "Welfare", coverage_percent: 100, is_active: 1 })}><Plus className="h-4 w-4" />Scheme</Button>}</>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Fund balance" value={rs(tot.b)} icon={PiggyBank} tone="teal" /><StatCard label="Donations" value={rs(tot.d)} icon={HandHeart} tone="blue" />
        <StatCard label="Used for patients" value={rs(tot.u)} icon={TrendingUp} tone="violet" /><StatCard label="Waiting approval" value={data.approvals.filter((a) => a.status === "Pending").length} icon={ClipboardList} tone="amber" /></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.funds.map((f) => (
        <div key={f.name} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <span className={cn("block h-1 bg-gradient-to-r", f.balance > 0 ? "from-emerald-400 to-teal-500" : "from-rose-400 to-red-500")} />
          <div className="p-4"><div className="flex items-start justify-between gap-2"><div><b className="text-lg">{f.name}</b><div className="text-xs text-muted-foreground">{f.fund_type} · covers {f.coverage_percent}%{f.cap_per_visit ? ` · cap ${rs(f.cap_per_visit)}/visit` : ""}{f.cap_per_month ? ` · ${rs(f.cap_per_month)}/month` : ""}</div></div>
            <div className="text-end"><div className="text-[10px] uppercase text-muted-foreground">Balance</div><div className={cn("text-xl font-black tabular-nums", f.balance < 0 ? "text-rose-600" : "text-emerald-600")}>{rs(f.balance)}</div></div></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">{[["Donated", rs(f.donations)], ["Used", rs(f.used)], ["Patients", `${f.patients} · ${f.approved} ok`]].map(([l, v]) => <div key={l} className="rounded-xl bg-muted/50 p-2"><div className="text-[10px] uppercase text-muted-foreground">{l}</div><b>{v}</b></div>)}</div>
            <div className="mt-3 flex gap-2"><Button size="sm" variant="save" className="flex-1" onClick={() => setDonate(f.name)}><HandHeart className="h-4 w-4" />Donation</Button>
              {data.can_approve && <Button size="sm" variant="neutral" onClick={() => setScheme(f)}>Edit</Button>}</div></div></div>))}
        {!data.funds.length && <Empty title="No scheme yet" hint="Create a welfare or zakat scheme first." icon={HandHeart} />}</div>
      <section className="rounded-2xl border border-border bg-card"><div className="border-b border-border px-4 py-3 font-bold">Patient approvals</div>
        <div className="divide-y divide-border">{data.approvals.map((a) => (
          <div key={a.name} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><div className="min-w-0 flex-1"><b>{a.patient_name}</b> <span className="text-xs text-muted-foreground">{a.patient} · {a.scheme}</span>
            {a.notes && <div className="truncate text-xs text-muted-foreground">{a.notes}</div>}</div>
            <span className="text-xs text-muted-foreground">{a.valid_till ? `till ${a.valid_till}` : ""}</span><Pill s={a.status} />
            {a.status === "Pending" && data.can_approve && <><Button size="sm" variant="save" onClick={() => void act(() => call("finance.decide_welfare", { name: a.name, approve: 1 }), "Approved", () => void refetch())}><BadgeCheck className="h-4 w-4" />Approve</Button>
              <Button size="sm" variant="danger" onClick={() => void act(() => call("finance.decide_welfare", { name: a.name, approve: 0 }), "Rejected", () => void refetch())}><XCircle className="h-4 w-4" /></Button></>}</div>))}
          {!data.approvals.length && <div className="p-6 text-center text-sm text-muted-foreground">No requests.</div>}</div></section>
      {scheme && <SchemeDialog s={scheme} onClose={() => setScheme(null)} onDone={() => { setScheme(null); void refetch(); }} />}
      {donate && <DonateDialog scheme={donate} modes={data.modes} onClose={() => setDonate(null)} onDone={() => { setDonate(null); void refetch(); }} />}
      {req && <RequestDialog funds={data.funds.filter((f) => f.is_active)} onClose={() => setReq(false)} onDone={() => { setReq(false); void refetch(); }} />}
    </div>
  );
}
function SchemeDialog({ s, onClose, onDone }: { s: Partial<Fund> & { covered_billing_types?: string; approval_required?: number; scheme_name?: string }; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState({ scheme_name: s.name ?? "", fund_type: s.fund_type ?? "Welfare", coverage_percent: s.coverage_percent ?? 100, covered_billing_types: s.covered_billing_types ?? "OPD Slip\nLab\nIPD Slip",
    cap_per_visit: s.cap_per_visit ?? 0, cap_per_month: s.cap_per_month ?? 0, approval_required: s.approval_required ?? 1, is_active: s.is_active ?? 1, name: s.name });
  return (
    <Dialog open onClose={onClose} size="md" title={s.name ? `Edit ${s.name}` : "New welfare scheme"}>
      <div className="space-y-3">
        {!s.name && <Field label="Name" required><input className={inputCls} value={d.scheme_name} onChange={(e) => setD({ ...d, scheme_name: e.target.value })} /></Field>}
        <div className="grid grid-cols-2 gap-2"><Field label="Fund type"><select className={inputCls} value={d.fund_type} onChange={(e) => setD({ ...d, fund_type: e.target.value })}>{["Welfare", "Zakat", "Donor-specific"].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Covers %"><input className={inputCls} inputMode="decimal" value={d.coverage_percent} onChange={(e) => setD({ ...d, coverage_percent: Number(e.target.value) || 0 })} /></Field></div>
        <Field label="Services covered"><TypeChips value={d.covered_billing_types} onChange={(v) => setD({ ...d, covered_billing_types: v })} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Cap per visit (Rs)"><input className={inputCls} inputMode="numeric" value={d.cap_per_visit || ""} onChange={(e) => setD({ ...d, cap_per_visit: Number(e.target.value) || 0 })} /></Field>
          <Field label="Cap per month (Rs)"><input className={inputCls} inputMode="numeric" value={d.cap_per_month || ""} onChange={(e) => setD({ ...d, cap_per_month: Number(e.target.value) || 0 })} /></Field></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.approval_required} onChange={(e) => setD({ ...d, approval_required: e.target.checked ? 1 : 0 })} />Patient needs an approval first</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.is_active} onChange={(e) => setD({ ...d, is_active: e.target.checked ? 1 : 0 })} />Active</label>
        <Button variant="save" className="w-full" disabled={!d.scheme_name} onClick={() => void act(() => call("finance.save_scheme", { data: JSON.stringify(d) }), "Scheme saved", onDone)}><CheckCircle2 className="h-4 w-4" />Save</Button>
      </div>
    </Dialog>
  );
}
function DonateDialog({ scheme, modes, onClose, onDone }: { scheme: string; modes: string[]; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState({ amount: "", mode: modes.includes("Cash") ? "Cash" : modes[0], donor: "", ref: "" });
  return (
    <Dialog open onClose={onClose} size="sm" title={`Donation to ${scheme}`}>
      <div className="space-y-3"><Field label="Amount" required><input className={inputCls + " text-end text-2xl font-black"} inputMode="numeric" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value.replace(/\D/g, "") })} autoFocus /></Field>
        <Field label="Received by"><select className={inputCls} value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value })}>{modes.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Donor"><input className={inputCls} value={d.donor} onChange={(e) => setD({ ...d, donor: e.target.value })} /></Field>
        <Field label="Receipt / transaction no."><input className={inputCls} value={d.ref} onChange={(e) => setD({ ...d, ref: e.target.value })} /></Field>
        <Button variant="save" className="w-full" disabled={!Number(d.amount)} onClick={() => void act(() => call("finance.donate", { scheme, amount: Number(d.amount), mode_of_payment: d.mode, donor: d.donor, reference_no: d.ref }), "Donation recorded", onDone)}><HandHeart className="h-4 w-4" />Record donation</Button></div>
    </Dialog>
  );
}
function RequestDialog({ funds, onClose, onDone }: { funds: Fund[]; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const { data: pats } = useApi<{ patients: { name: string; patient_name: string; phone?: string }[] }>("pharmacy.customers", { q }, { enabled: q.length >= 2 });
  const [d, setD] = useState({ patient: "", label: "", scheme: funds[0]?.name ?? "", notes: "" });
  return (
    <Dialog open onClose={onClose} size="md" title="Welfare request for a patient" description="The scheme pays only after approval (if the scheme asks for it).">
      <div className="space-y-3">
        {d.patient ? <div className="flex items-center justify-between rounded-xl bg-muted p-3 text-sm"><b>{d.label}</b><button className="text-xs underline" onClick={() => setD({ ...d, patient: "" })}>change</button></div>
          : <Field label="Patient (name, MR, mobile, CNIC)"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <div className="mt-1 max-h-40 overflow-y-auto">{(pats?.patients ?? []).map((p) => <button key={p.name} onClick={() => setD({ ...d, patient: p.name, label: `${p.patient_name} · ${p.name}` })} className="block w-full rounded-lg px-2 py-1.5 text-start text-sm hover:bg-muted">{p.patient_name} <span className="text-xs text-muted-foreground">{p.name} · {p.phone}</span></button>)}</div></Field>}
        <Field label="Scheme"><select className={inputCls} value={d.scheme} onChange={(e) => setD({ ...d, scheme: e.target.value })}>{funds.map((f) => <option key={f.name}>{f.name}</option>)}</select></Field>
        <Field label="Why the patient qualifies"><textarea className={inputCls + " min-h-20"} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
        <Button variant="save" className="w-full" disabled={!d.patient || !d.scheme} onClick={() => void act(() => call("finance.request_welfare", { patient: d.patient, scheme: d.scheme, notes: d.notes }), "Request sent", onDone)}><CheckCircle2 className="h-4 w-4" />Send for approval</Button></div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ /panels
interface PayerRow { name: string; customer_name: string; customer_group: string; kind?: string; hv_coverage_percent: number; hv_covered_billing_types?: string; hv_contract_valid_till?: string; disabled: number; credit_limit: number; members: number; outstanding: number;
  ageing?: { d0_30: number; d31_60: number; d61_90: number; d90: number; total: number } }
export function PanelsPage() {
  const { data, refetch } = useApi<{ payers: PayerRow[]; modes: string[] }>("finance.payer_list");
  const [edit, setEdit] = useState<Partial<PayerRow> | null>(null);
  const [st, setSt] = useState<string | null>(null);
  if (!data) return <Loading />;
  return (
    <div className="space-y-5">
      <PageHeader title="Panels & insurers" icon={Building2} color="from-indigo-600 to-sky-600" subtitle="Coverage, contracts, statements, payments and ageing" actions={<Button variant="save" onClick={() => setEdit({ customer_group: "Panel", hv_coverage_percent: 100 })}><Plus className="h-4 w-4" />Panel / insurer</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{(["d0_30", "d31_60", "d61_90", "d90"] as const).map((k, i) => <StatCard key={k} label={["0–30 days", "31–60 days", "61–90 days", "Over 90 days"][i]} value={rs(data.payers.reduce((a, p) => a + (p.ageing?.[k] ?? 0), 0))} icon={Wallet} tone={i < 2 ? "blue" : i === 2 ? "amber" : "rose"} />)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.payers.map((p) => (
        <div key={p.name} className={cn("rounded-2xl border bg-card p-4 shadow-sm", p.disabled ? "opacity-60" : "border-border")}>
          <div className="flex items-start gap-3"><span className={cn("flex h-11 w-11 items-center justify-center rounded-xl text-white", p.kind === "Panel" ? "bg-indigo-600" : "bg-sky-600")}>{p.kind === "Panel" ? <Building2 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1"><b className="block truncate">{p.customer_name}</b><span className="text-xs text-muted-foreground">{p.kind} · covers {p.hv_coverage_percent}% · {p.members} members</span>
              <div className="text-[11px] text-muted-foreground">{(p.hv_covered_billing_types || "All services").replace(/\n/g, ", ")}{p.hv_contract_valid_till ? ` · until ${p.hv_contract_valid_till}` : ""}</div></div>
            <div className="text-end"><div className="text-[10px] uppercase text-muted-foreground">Owes</div><div className="text-lg font-black tabular-nums">{rs(p.outstanding)}</div></div></div>
          <div className="mt-3 flex gap-2"><Button size="sm" variant="save" className="flex-1" onClick={() => setSt(p.name)}><FileText className="h-4 w-4" />Statement & payment</Button><Button size="sm" variant="neutral" onClick={() => setEdit(p)}>Edit</Button></div></div>))}
        {!data.payers.length && <Empty title="No panel or insurer yet" icon={Building2} />}</div>
      {edit && <PayerDialog p={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void refetch(); }} />}
      {st && <StatementDialog payer={st} modes={data.modes} onClose={() => { setSt(null); void refetch(); }} />}
    </div>
  );
}
function PayerDialog({ p, onClose, onDone }: { p: Partial<PayerRow>; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState({ name: p.name, customer_name: p.customer_name ?? "", customer_group: p.kind ?? "Panel", hv_coverage_percent: p.hv_coverage_percent ?? 100,
    hv_covered_billing_types: p.hv_covered_billing_types ?? "", hv_contract_valid_till: p.hv_contract_valid_till ?? "", credit_limit: p.credit_limit ?? 0, disabled: p.disabled ?? 0 });
  return (
    <Dialog open onClose={onClose} size="md" title={p.name ? p.customer_name! : "New panel / insurer"}>
      <div className="space-y-3">
        {!p.name && <><Field label="Name" required><input className={inputCls} value={d.customer_name} onChange={(e) => setD({ ...d, customer_name: e.target.value })} /></Field>
          <Field label="Type"><div className="flex rounded-xl bg-muted p-1">{["Panel", "Insurance"].map((g) => <button key={g} onClick={() => setD({ ...d, customer_group: g })} className={cn("flex-1 rounded-lg py-1.5 text-sm font-semibold", d.customer_group === g ? "bg-card shadow" : "text-muted-foreground")}>{g}</button>)}</div></Field></>}
        <div className="grid grid-cols-2 gap-2"><Field label="Covers %"><input className={inputCls} inputMode="decimal" value={d.hv_coverage_percent} onChange={(e) => setD({ ...d, hv_coverage_percent: Number(e.target.value) || 0 })} /></Field>
          <Field label="Credit limit (Rs)"><input className={inputCls} inputMode="numeric" value={d.credit_limit || ""} onChange={(e) => setD({ ...d, credit_limit: Number(e.target.value) || 0 })} /></Field></div>
        <Field label="Services covered"><TypeChips value={d.hv_covered_billing_types} onChange={(v) => setD({ ...d, hv_covered_billing_types: v })} /></Field>
        <Field label="Contract valid till"><input type="date" className={inputCls} value={d.hv_contract_valid_till} onChange={(e) => setD({ ...d, hv_contract_valid_till: e.target.value })} /></Field>
        {p.name && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.disabled} onChange={(e) => setD({ ...d, disabled: e.target.checked ? 1 : 0 })} />Disabled</label>}
        <Button variant="save" className="w-full" disabled={!d.customer_name} onClick={() => void act(() => call("finance.save_payer", { data: JSON.stringify(d) }), "Saved", onDone)}><CheckCircle2 className="h-4 w-4" />Save</Button></div>
    </Dialog>
  );
}
interface StRow { name: string; posting_date: string; patient_name?: string; hv_patient?: string; employee_id?: string; relation?: string; policy_no?: string; hv_billing_type: string; grand_total: number; outstanding_amount: number }
function StatementDialog({ payer, modes, onClose }: { payer: string; modes: string[]; onClose: () => void }) {
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const { data, refetch } = useApi<{ customer_name: string; rows: StRow[]; billed: number; outstanding: number; balance: number }>("finance.payer_statement", { payer, from_date: from, to_date: to });
  const [pay, setPay] = useState(false);
  const csv = () => { if (!data) return; const lines = [["Invoice", "Date", "Patient", "MR", "Employee / policy", "Service", "Amount", "Outstanding"], ...data.rows.map((r) => [r.name, r.posting_date, r.patient_name, r.hv_patient, r.employee_id || r.policy_no || "", r.hv_billing_type, r.grand_total, r.outstanding_amount])];
    const blob = new Blob([lines.map((l) => l.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${payer}-${from}-${to}.csv`; a.click(); };
  return (
    <Dialog open onClose={onClose} size="xl" className="max-w-5xl" title={`${data?.customer_name ?? payer} — statement`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2"><Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="flex-1" /><Button variant="neutral" onClick={csv}><FileText className="h-4 w-4" />Excel (CSV)</Button><Button variant="neutral" onClick={() => window.print()}>Print / PDF</Button><Button variant="save" onClick={() => setPay(true)} disabled={!data?.balance}><Banknote className="h-4 w-4" />Receive payment</Button></div>
        {data ? <><div className="grid grid-cols-3 gap-2"><StatCard label="Billed in period" value={rs(data.billed)} tone="blue" /><StatCard label="Unpaid in period" value={rs(data.outstanding)} tone="amber" /><StatCard label="Total balance" value={rs(data.balance)} tone="rose" /></div>
          <div className="max-h-[48vh] overflow-y-auto rounded-xl border border-border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Bill</th><th className="text-start">Patient</th><th className="text-start">Employee / policy</th><th className="text-start">Service</th><th className="text-end">Amount</th><th className="px-3 text-end">Unpaid</th></tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.name} className="border-t border-border"><td className="px-3 py-2 font-mono text-xs">{r.name}<div className="font-sans text-[10px] text-muted-foreground">{r.posting_date}</div></td><td className="text-xs">{r.patient_name}<div className="text-[10px] text-muted-foreground">{r.hv_patient}{r.relation ? ` · ${r.relation}` : ""}</div></td>
              <td className="text-xs">{r.employee_id || r.policy_no}</td><td className="text-xs">{r.hv_billing_type}</td><td className="text-end tabular-nums">{rs(r.grand_total)}</td><td className={cn("px-3 text-end tabular-nums", r.outstanding_amount > 0 && "font-bold text-rose-600")}>{rs(r.outstanding_amount)}</td></tr>)}</tbody></table>
            {!data.rows.length && <div className="p-6 text-center text-sm text-muted-foreground">No bills in this period.</div>}</div></> : <Loading />}
        {pay && <ReceiveDialog payer={payer} due={data?.balance ?? 0} modes={modes} onClose={() => setPay(false)} onDone={() => { setPay(false); void refetch(); }} />}
      </div>
    </Dialog>
  );
}
function ReceiveDialog({ payer, due, modes, onClose, onDone }: { payer: string; due: number; modes: string[]; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState({ amount: String(Math.round(due)), deduction: "", reason: "", mode: modes.includes("Bank Transfer") ? "Bank Transfer" : modes[0], ref: "" });
  return (
    <Dialog open onClose={onClose} size="sm" title="Receive payment" description={`Applied to the oldest unpaid bills first · owes ${rs(due)}`}>
      <div className="space-y-3"><Field label="Amount received"><input className={inputCls + " text-end text-xl font-black"} inputMode="numeric" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value.replace(/\D/g, "") })} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Deduction (Rs)"><input className={inputCls} inputMode="numeric" value={d.deduction} onChange={(e) => setD({ ...d, deduction: e.target.value.replace(/\D/g, "") })} placeholder="tax / disallowed" /></Field>
          <Field label="By"><select className={inputCls} value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value })}>{modes.map((m) => <option key={m}>{m}</option>)}</select></Field></div>
        {Number(d.deduction) > 0 && <Field label="Reason for deduction" required><input className={inputCls} value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} /></Field>}
        <Field label="Cheque / transaction no."><input className={inputCls} value={d.ref} onChange={(e) => setD({ ...d, ref: e.target.value })} /></Field>
        <Button variant="save" className="w-full" disabled={!(Number(d.amount) + Number(d.deduction)) || (Number(d.deduction) > 0 && !d.reason.trim())}
          onClick={() => void act(() => call("finance.payer_receive", { payer, amount: Number(d.amount), mode_of_payment: d.mode, deduction: Number(d.deduction) || 0, deduction_reason: d.reason, reference_no: d.ref }), "Payment recorded", onDone)}><Banknote className="h-4 w-4" />Record payment</Button></div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ /claims
interface Claim { name: string; insurer: string; patient: string; patient_name: string; status: string; claim_no?: string; claimed_amount: number; approved_amount?: number; received_amount?: number; deduction_amount?: number; submitted_on?: string; settled_on?: string; source_doctype?: string; source_name?: string; age_days: number; rejected_to_patient?: number }
const FLOW = ["Draft", "Submitted", "Under Query", "Approved", "Partially Approved", "Rejected", "Settled"];
export function ClaimsPage() {
  const [status, setStatus] = useState("");
  const { data, refetch } = useApi<{ claims: Claim[]; ready: { name: string; patient_name: string; payer: string; grand_total: number }[]; modes: string[]; bill_rejected_to_patient: number }>("finance.claims", status ? { status } : undefined);
  const [open, setOpen] = useState<Claim | null>(null);
  if (!data) return <Loading />;
  const open_amt = data.claims.filter((c) => !["Settled", "Rejected"].includes(c.status)).reduce((a, c) => a + c.claimed_amount, 0);
  return (
    <div className="space-y-5">
      <PageHeader title="Insurance claims" icon={FileCheck2} color="from-sky-600 to-indigo-700" subtitle="Draft → submitted → query → decision → settled, with deductions" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Open claims" value={rs(open_amt)} icon={FileCheck2} tone="blue" /><StatCard label="Under query" value={data.claims.filter((c) => c.status === "Under Query").length} icon={ClipboardList} tone="violet" />
        <StatCard label="Deductions" value={rs(data.claims.reduce((a, c) => a + (c.deduction_amount ?? 0), 0))} icon={XCircle} tone="rose" /><StatCard label="Ready to claim" value={data.ready.length} icon={Plus} tone="amber" /></div>
      {data.ready.length > 0 && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:bg-amber-500/10"><b className="text-sm">Admissions billed to an insurer without a claim</b>
        <div className="mt-2 flex flex-wrap gap-2">{data.ready.map((r) => <Button key={r.name} size="sm" variant="neutral" onClick={() => void act(() => call("finance.make_claim", { source_doctype: "Bed Allotment", source_name: r.name }), "Claim created", () => void refetch())}>
          <Plus className="h-4 w-4" />{r.patient_name} · {r.payer} · {rs(r.grand_total)}</Button>)}</div></section>}
      <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1 sm:w-fit">{["", ...FLOW].map((s) => <button key={s || "all"} onClick={() => setStatus(s)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", status === s ? "bg-card shadow" : "text-muted-foreground")}>{s || "All"}</button>)}</div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Claim</th><th className="text-start">Patient · insurer</th><th className="text-end">Claimed</th><th className="text-end">Approved</th><th className="text-end">Age</th><th className="px-3 text-start">Status</th></tr></thead>
        <tbody>{data.claims.map((c) => <tr key={c.name} onClick={() => setOpen(c)} className="cursor-pointer border-t border-border hover:bg-sky-500/5"><td className="px-3 py-2 font-mono text-xs">{c.name}<div className="font-sans text-[10px] text-muted-foreground">{c.claim_no}</div></td>
          <td className="text-xs">{c.patient_name}<div className="text-[10px] text-muted-foreground">{c.insurer} · {c.source_name}</div></td><td className="text-end tabular-nums">{rs(c.claimed_amount)}</td><td className="text-end tabular-nums">{c.approved_amount ? rs(c.approved_amount) : "—"}</td>
          <td className={cn("text-end text-xs", c.age_days > 60 && "font-bold text-rose-600")}>{c.age_days} d</td><td className="px-3"><Pill s={c.status} /></td></tr>)}</tbody></table>
        {!data.claims.length && <div className="p-6 text-center text-sm text-muted-foreground">No claims.</div>}</div>
      {open && <ClaimDialog c={open} modes={data.modes} toPatient={!!data.bill_rejected_to_patient} onClose={() => setOpen(null)} onDone={() => { setOpen(null); void refetch(); }} />}
    </div>
  );
}
function ClaimDialog({ c, modes, toPatient, onClose, onDone }: { c: Claim; modes: string[]; toPatient: boolean; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ claim_no: c.claim_no ?? "", note: "", approved: String(c.approved_amount ?? c.claimed_amount), reason: "", received: String(c.approved_amount ?? c.claimed_amount), mode: modes.includes("Bank Transfer") ? "Bank Transfer" : modes[0], ref: "" });
  const go = (action: string, extra: Record<string, unknown>) => void act(() => call("finance.claim_action", { name: c.name, action, ...extra }), `Claim ${action}`, onDone);
  const step = FLOW.indexOf(c.status);
  return (
    <Dialog open onClose={onClose} size="lg" title={`${c.name} · ${c.patient_name}`} description={`${c.insurer} · ${c.source_doctype} ${c.source_name}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">{["Draft", "Submitted", "Approved", "Settled"].map((s, i) => <span key={s} className={cn("flex-1 rounded-full py-1 text-center text-[11px] font-bold", i <= Math.min(step, 3) || (i === 2 && step >= 3) ? "bg-sky-600 text-white" : "bg-muted text-muted-foreground")}>{s}</span>)}</div>
        <div className="grid grid-cols-3 gap-2"><StatCard label="Claimed" value={rs(c.claimed_amount)} tone="blue" /><StatCard label="Approved" value={c.approved_amount != null ? rs(c.approved_amount) : "—"} tone="teal" /><StatCard label="Deduction" value={rs(c.deduction_amount)} tone="rose" /></div>
        {(c.status === "Draft" || c.status === "Under Query") && <div className="space-y-2"><Field label="Insurer claim no."><input className={inputCls} value={v.claim_no} onChange={(e) => setV({ ...v, claim_no: e.target.value })} /></Field>
          <Button variant="save" className="w-full" onClick={() => go("submit", { claim_no: v.claim_no })}><Upload className="h-4 w-4" />{c.status === "Draft" ? "Submit to insurer" : "Re-submit"}</Button></div>}
        {["Submitted", "Under Query"].includes(c.status) && <div className="space-y-2 rounded-xl border border-border p-3">
          {c.status === "Submitted" && <div className="flex gap-2"><input className={inputCls} placeholder="Insurer query" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /><Button variant="neutral" disabled={!v.note} onClick={() => go("query", { note: v.note })}>Query</Button></div>}
          <div className="grid grid-cols-2 gap-2"><Field label="Approved amount"><input className={inputCls + " text-end font-bold"} inputMode="numeric" value={v.approved} onChange={(e) => setV({ ...v, approved: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Reason for any deduction"><input className={inputCls} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field></div>
          <Button variant="save" className="w-full" onClick={() => go("decide", { approved_amount: Number(v.approved), reason: v.reason })}><CheckCircle2 className="h-4 w-4" />Record insurer's decision</Button></div>}
        {["Approved", "Partially Approved", "Rejected"].includes(c.status) && <div className="space-y-2 rounded-xl border border-border p-3">
          <div className="grid grid-cols-2 gap-2"><Field label="Amount received"><input className={inputCls + " text-end font-bold"} inputMode="numeric" value={v.received} onChange={(e) => setV({ ...v, received: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="By"><select className={inputCls} value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>{modes.map((m) => <option key={m}>{m}</option>)}</select></Field></div>
          <Field label="Cheque / transaction no."><input className={inputCls} value={v.ref} onChange={(e) => setV({ ...v, ref: e.target.value })} /></Field>
          <div className="text-xs text-muted-foreground">The rest of the insurer's bill is {toPatient ? "moved to the patient's account (Clinic Settings)" : "written off as a deduction"}.</div>
          <Button variant="save" className="w-full" onClick={() => go("settle", { received_amount: Number(v.received), mode_of_payment: v.mode, reference_no: v.ref })}><Banknote className="h-4 w-4" />Settle claim</Button></div>}
        {c.status === "Settled" && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">Settled {c.settled_on} · received {rs(c.received_amount)}{c.rejected_to_patient ? " · rejected part billed to the patient" : ""}</div>}
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ /expenses
interface Exp { name: string; category: string; amount: number; posting_date: string; payee: string; mode_of_payment: string; reference_no?: string; status: string; current_level?: number; description: string; receipt?: string; requested_by: string; journal_entry?: string;
  approvals: { level: number; role: string; approver?: string; action?: string; acted_on?: string; note?: string }[]; can_act: boolean }
export function ExpensesPage() {
  const [tab, setTab] = useState<"todo" | "all" | "mine">("todo");
  const { data, refetch } = useApi<{ rows: Exp[]; categories: { name: string }[]; modes: string[]; month: { category: string; amount: number; n: number }[]; levels: { level: number; role: string; min_amount: number }[] }>("finance.expenses", tab === "mine" ? { mine: 1 } : undefined);
  const [form, setForm] = useState(false);
  const [rej, setRej] = useState<string | null>(null);
  if (!data) return <Loading />;
  const rows = data.rows.filter((r) => tab !== "todo" || r.can_act);
  return (
    <div className="space-y-5">
      <PageHeader title="Expenses" icon={Receipt} color="from-orange-500 to-rose-600" subtitle={`Approvals: ${data.levels.map((l) => `${l.role.replace("PW ", "")} from ${rs(l.min_amount)}`).join(" → ")}`} actions={<Button variant="save" onClick={() => setForm(true)}><Plus className="h-4 w-4" />New expense</Button>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Waiting for you" value={data.rows.filter((r) => r.can_act).length} icon={ClipboardList} tone="amber" />
        <StatCard label="Approved this month" value={rs(data.month.reduce((a, m) => a + m.amount, 0))} icon={CheckCircle2} tone="teal" />{data.month.slice(0, 2).map((m) => <StatCard key={m.category} label={m.category} value={rs(m.amount)} hint={`${m.n} bills`} icon={Landmark} tone="blue" />)}</div>
      <div className="flex rounded-xl bg-muted p-1 sm:w-fit">{([["todo", "To approve"], ["all", "All"], ["mine", "Mine"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold", tab === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((e) => (
        <div key={e.name} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className="block truncate">{e.payee}</b><span className="text-xs text-muted-foreground">{e.category} · {e.posting_date} · {e.mode_of_payment}</span></div><div className="text-end"><div className="text-lg font-black tabular-nums">{rs(e.amount)}</div><Pill s={e.status} /></div></div>
          <p className="mt-2 line-clamp-2 text-sm">{e.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">{e.approvals.map((a) => <span key={a.level} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", a.action === "Approved" ? "bg-emerald-100 text-emerald-800" : a.action === "Rejected" ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground")} title={a.note}>{a.level}. {a.role.replace("PW ", "")}{a.action ? ` ✓ ${a.approver?.split("@")[0]}` : ""}</span>)}</div>
          <div className="mt-3 flex items-center gap-2 text-xs">{e.receipt && <a href={e.receipt} target="_blank" rel="noreferrer" className="font-semibold text-sky-700 underline">Receipt</a>}{e.journal_entry && <span className="text-muted-foreground">{e.journal_entry}</span>}<div className="flex-1" />
            {e.can_act && <><Button size="sm" variant="save" onClick={() => void act(() => call("finance.expense_action", { name: e.name, approve: 1 }), "Approved", () => void refetch())}><BadgeCheck className="h-4 w-4" />Approve</Button>
              <Button size="sm" variant="danger" onClick={() => setRej(e.name)}><XCircle className="h-4 w-4" /></Button></>}</div></div>))}
        {!rows.length && <Empty title={tab === "todo" ? "Nothing waiting for you" : "No expenses"} icon={Receipt} />}</div>
      {form && <ExpenseForm cats={data.categories.map((c) => c.name)} modes={data.modes} onClose={() => setForm(false)} onDone={() => { setForm(false); void refetch(); }} />}
      {rej && <RejectDialog onClose={() => setRej(null)} onReject={(note) => void act(() => call("finance.expense_action", { name: rej, approve: 0, note }), "Rejected", () => { setRej(null); void refetch(); })} />}
    </div>
  );
}
function ExpenseForm({ cats, modes, onClose, onDone }: { cats: string[]; modes: string[]; onClose: () => void; onDone: () => void }) {
  const [d, setD] = useState({ category: cats[0] ?? "", amount: "", payee: "", mode_of_payment: modes.includes("Cash") ? "Cash" : modes[0], reference_no: "", description: "", receipt: "", posting_date: todayISO() });
  const [busy, setBusy] = useState(false);
  const up = async (f?: File) => { if (!f) return; setBusy(true); try { const r = await uploadFile(f, { isPrivate: true }); setD((x) => ({ ...x, receipt: r.file_url })); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  return (
    <Dialog open onClose={onClose} size="md" title="New expense">
      <div className="space-y-3"><div className="grid grid-cols-2 gap-2"><Field label="Category"><select className={inputCls} value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Amount" required><input className={inputCls + " text-end font-bold"} inputMode="numeric" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value.replace(/\D/g, "") })} /></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Paid to" required><input className={inputCls} value={d.payee} onChange={(e) => setD({ ...d, payee: e.target.value })} /></Field>
          <Field label="Paid by"><select className={inputCls} value={d.mode_of_payment} onChange={(e) => setD({ ...d, mode_of_payment: e.target.value })}>{modes.map((m) => <option key={m}>{m}</option>)}</select></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Date"><input type="date" className={inputCls} value={d.posting_date} onChange={(e) => setD({ ...d, posting_date: e.target.value })} /></Field><Field label="Bill no."><input className={inputCls} value={d.reference_no} onChange={(e) => setD({ ...d, reference_no: e.target.value })} /></Field></div>
        <Field label="What for" required><textarea className={inputCls + " min-h-16"} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
        <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-3 text-sm", d.receipt ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" : "border-border")}><Upload className="h-5 w-5" /><span className="flex-1">{d.receipt ? "Receipt attached" : "Attach receipt / bill (required)"}</span>{busy && <Spinner />}
          <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => void up(e.target.files?.[0])} /></label>
        <Button variant="save" className="w-full" disabled={!Number(d.amount) || !d.payee || !d.description || !d.receipt || busy} onClick={() => void act(() => call("finance.save_expense", { data: JSON.stringify({ ...d, amount: Number(d.amount) }), submit: 1 }), "Sent for approval", onDone)}><CheckCircle2 className="h-4 w-4" />Send for approval</Button></div>
    </Dialog>
  );
}
function RejectDialog({ onClose, onReject }: { onClose: () => void; onReject: (note: string) => void }) {
  const [note, setNote] = useState("");
  return <Dialog open onClose={onClose} size="sm" title="Reject expense"><div className="space-y-3"><textarea className={inputCls + " min-h-20"} placeholder="Reason (required)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
    <Button variant="danger" className="w-full" disabled={!note.trim()} onClick={() => onReject(note)}><XCircle className="h-4 w-4" />Reject</Button></div></Dialog>;
}

// ------------------------------------------------------------------ /purchase_order, /purchase_invoice
interface PRow { name: string; supplier_name: string; transaction_date?: string; posting_date?: string; grand_total: number; status: string; docstatus: number; outstanding_amount?: number; bill_no?: string; due_date?: string; per_received?: number; per_billed?: number; items: { item_name: string; qty: number; uom: string; rate: number; amount: number }[] }
export function PurchasingPage({ doctype }: { doctype: "Purchase Order" | "Purchase Invoice" }) {
  const [filter, setFilter] = useState("");
  const { data, refetch } = useApi<{ rows: PRow[]; can_approve: boolean }>("finance.purchasing", { doctype, status: filter || undefined });
  const [open, setOpen] = useState<PRow | null>(null);
  if (!data) return <Loading />;
  const po = doctype === "Purchase Order";
  return (
    <div className="space-y-5">
      <PageHeader title={po ? "Purchase orders" : "Purchase invoices"} icon={po ? ShoppingCart : Receipt} color="from-amber-600 to-orange-700" subtitle={po ? "Orders to suppliers — approve drafts, track receiving and billing" : "Supplier bills — approve drafts, see what is unpaid"}
        actions={<a href={`/desk/${po ? "purchase-order" : "purchase-invoice"}/new`} target="_blank" rel="noreferrer"><Button variant="save"><Plus className="h-4 w-4" />New in desk</Button></a>} />
      <div className="flex rounded-xl bg-muted p-1 sm:w-fit">{([["", "All"], ["draft", "Waiting approval"], ...(po ? [] : [["unpaid", "Unpaid"]])] as [string, string][]).map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold", filter === k ? "bg-card shadow" : "text-muted-foreground")}>{l}</button>)}</div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card"><table className="w-full text-sm"><thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2 text-start">Document</th><th className="text-start">Supplier</th><th className="text-start">Date</th><th className="text-end">Total</th>
        <th className="text-end">{po ? "Received / billed" : "Unpaid"}</th><th className="px-3 text-start">Status</th><th /></tr></thead>
        <tbody>{data.rows.map((r) => <tr key={r.name} className="border-t border-border"><td className="px-3 py-2"><button className="font-mono text-xs font-semibold hover:underline" onClick={() => setOpen(r)}>{r.name}</button>{r.bill_no && <div className="text-[10px] text-muted-foreground">Bill {r.bill_no}</div>}</td>
          <td className="text-xs">{r.supplier_name}</td><td className="text-xs">{r.transaction_date ?? r.posting_date}</td><td className="text-end tabular-nums">{rs(r.grand_total)}</td>
          <td className="text-end text-xs tabular-nums">{po ? `${Math.round(r.per_received ?? 0)}% / ${Math.round(r.per_billed ?? 0)}%` : rs(r.outstanding_amount)}</td><td className="px-3"><Pill s={r.docstatus === 0 ? "Draft" : r.status} /></td>
          <td className="px-2">{r.docstatus === 0 && data.can_approve && <Button size="sm" variant="save" onClick={() => void act(() => call("finance.approve_purchase", { doctype, name: r.name }), "Approved", () => void refetch())}><BadgeCheck className="h-4 w-4" />Approve</Button>}</td></tr>)}</tbody></table>
        {!data.rows.length && <div className="p-6 text-center text-sm text-muted-foreground">Nothing here.</div>}</div>
      {open && <Dialog open onClose={() => setOpen(null)} size="lg" title={`${open.name} · ${open.supplier_name}`}><table className="w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="text-start">Item</th><th className="text-end">Qty</th><th className="text-end">Rate</th><th className="text-end">Amount</th></tr></thead>
        <tbody>{open.items.map((i, k) => <tr key={k} className="border-t border-border"><td className="py-1.5">{i.item_name}</td><td className="text-end">{i.qty} {i.uom}</td><td className="text-end tabular-nums">{rs(i.rate)}</td><td className="text-end tabular-nums">{rs(i.amount)}</td></tr>)}
          <tr className="border-t-2"><td className="py-1.5 font-bold" colSpan={3}>Total</td><td className="text-end font-black tabular-nums">{rs(open.grand_total)}</td></tr></tbody></table>
        <a className="mt-3 inline-block text-sm font-semibold text-sky-700 underline" href={`/desk/${po ? "purchase-order" : "purchase-invoice"}/${open.name}`} target="_blank" rel="noreferrer">Open in desk</a></Dialog>}
    </div>
  );
}

// ------------------------------------------------------------------ /finance (MIS)
interface KV { k: string; v: number; n?: number }
interface Ov { revenue_by_type: KV[]; revenue_by_doctor: KV[]; revenue_by_service: KV[]; refunds: KV[]; discounts: KV[]; expenses: KV[]; doctor_share: { earned: number; paid: number; unpaid: number };
  payer_ageing: { customer: string; group: string; d0_30: number; d31_60: number; d61_90: number; d90: number; total: number }[]; funds: Fund[]; claims: KV[] }
export function FinanceOverviewPage() {
  const [from, setFrom] = useState(todayISO().slice(0, 8) + "01");
  const [to, setTo] = useState(todayISO());
  const { data } = useApi<Ov>("finance.overview", { from_date: from, to_date: to });
  const sum = (a?: KV[]) => (a ?? []).reduce((s, x) => s + (x.v || 0), 0);
  return (
    <div className="space-y-5">
      <PageHeader title="Finance overview" icon={TrendingUp} color="from-indigo-600 to-violet-700" subtitle="Revenue, refunds, discounts, expenses, payers, funds and doctor share"
        actions={<div className="flex gap-2"><input type="date" className={inputCls + " h-9"} value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" className={inputCls + " h-9"} value={to} onChange={(e) => setTo(e.target.value)} /></div>} />
      {!data ? <Loading /> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Net revenue" value={rs(sum(data.revenue_by_type))} icon={TrendingUp} tone="teal" /><StatCard label="Refunds" value={rs(sum(data.refunds))} icon={XCircle} tone="rose" />
          <StatCard label="Expenses" value={rs(sum(data.expenses))} icon={Receipt} tone="amber" /><StatCard label="Payers owe" value={rs(data.payer_ageing.reduce((a, p) => a + p.total, 0))} icon={Building2} tone="blue" /></div>
        <div className="grid gap-4 lg:grid-cols-3"><Bars title="Revenue by billing type" rows={data.revenue_by_type} /><Bars title="Revenue by doctor" rows={data.revenue_by_doctor} /><Bars title="Top services" rows={data.revenue_by_service} /></div>
        <div className="grid gap-4 lg:grid-cols-3"><Bars title="Expenses by category" rows={data.expenses} tone="bg-orange-500" /><Bars title="Discounts" rows={data.discounts} tone="bg-amber-500" /><Bars title="Refunds" rows={data.refunds} tone="bg-rose-500" /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-4"><b>Payer ageing</b><table className="mt-2 w-full text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="text-start">Payer</th><th className="text-end">0–30</th><th className="text-end">31–60</th><th className="text-end">61–90</th><th className="text-end">90+</th><th className="text-end">Total</th></tr></thead>
            <tbody>{data.payer_ageing.map((p) => <tr key={p.customer} className="border-t border-border"><td className="py-1.5 text-xs">{p.customer}<div className="text-[10px] text-muted-foreground">{p.group}</div></td>{[p.d0_30, p.d31_60, p.d61_90, p.d90, p.total].map((v, i) => <td key={i} className={cn("text-end text-xs tabular-nums", i === 4 && "font-bold", i === 3 && v > 0 && "text-rose-600")}>{v ? rs(v) : "—"}</td>)}</tr>)}</tbody></table>
            {!data.payer_ageing.length && <div className="py-4 text-center text-sm text-muted-foreground">Nothing outstanding.</div>}</section>
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4"><b>Doctor share</b><div className="grid grid-cols-3 gap-2"><StatCard label="Earned" value={rs(data.doctor_share.earned)} tone="teal" /><StatCard label="Paid" value={rs(data.doctor_share.paid)} tone="blue" /><StatCard label="Owed" value={rs(data.doctor_share.unpaid)} tone="amber" /></div>
            <b>Welfare funds</b><div className="space-y-1">{data.funds.map((f) => <div key={f.name} className="flex justify-between text-sm"><span>{f.name}</span><span className="tabular-nums">used {rs(f.used)} · balance <b className={f.balance < 0 ? "text-rose-600" : ""}>{rs(f.balance)}</b></span></div>)}{!data.funds.length && <div className="text-sm text-muted-foreground">No funds.</div>}</div>
            <b>Claims</b><div className="flex flex-wrap gap-1.5">{data.claims.map((c) => <span key={c.k} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", pill(c.k))}>{c.k} {c.n} · {rs(c.v)}</span>)}</div></section></div>
      </>}
    </div>
  );
}
function Bars({ title, rows, tone = "bg-indigo-500" }: { title: string; rows: KV[]; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.v || 0));
  return <section className="rounded-2xl border border-border bg-card p-4"><b>{title}</b><div className="mt-3 space-y-2">{rows.map((r) => (
    <div key={r.k}><div className="flex justify-between text-xs"><span className="truncate">{r.k || "—"}</span><span className="font-semibold tabular-nums">{rs(r.v)}</span></div><div className="mt-1 h-2 rounded-full bg-muted"><div className={cn("h-full rounded-full", tone)} style={{ width: `${(100 * (r.v || 0)) / max}%` }} /></div></div>))}
    {!rows.length && <div className="text-sm text-muted-foreground">No data.</div>}</div></section>;
}
