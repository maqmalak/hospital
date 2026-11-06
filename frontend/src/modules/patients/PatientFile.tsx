import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BedDouble, CalendarClock, CheckCircle2, ClipboardList, Clock, CreditCard, ExternalLink, FileText, Receipt, Scissors, Wallet } from "lucide-react";
import { useApi } from "@/lib/api";
import { Empty, Pill, Tabs } from "@/components/common";
import { cn } from "@/utils/cn";
import { exportToCsv } from "@/utils/export";

interface Visit { name: string; posting_date: string; posting_time: string; doctor_name: string; purpose: string; token_no: number; branch: string; net_total: number;
  patient_share: number; payer_share: number; payer_type: string; discount_amount: number; is_free_follow_up: number; sales_invoice?: string; payment_mode: string;
  chief_complaint?: string | null; appointment?: string; booking_ref?: string; source_channel?: string; appt_time?: string; appt_status?: string; checkup: string; prescription?: string }
interface Invoice { name: string; posting_date: string; customer: string; billing_type?: string; ref_doctype?: string; ref_name?: string; grand_total: number; paid_amount: number;
  outstanding_amount: number; status: string; is_return: number; is_pos: number; payer: number }
interface FileData {
  visits: Visit[]; appointments: { name: string; booking_ref: string; appointment_date: string; start_time: string; doctor_name: string; status: string; source_channel: string; fee: number; payment_status: string; opd_slip?: string }[];
  invoices: Invoice[]; payments: { invoice: string; date: string; mode: string; amount: number; source: string; reference?: string }[];
  costs: { billing_type: string; item_name: string; qty: number; amount: number }[]; procedures: { date: string; item_name: string; qty: number; amount: number; doctor_name: string; source: string }[];
  beds: { bed: string; ward: string; from_status: string; to_status: string; changed_on: string; changed_by: string; note?: string }[];
  totals: Record<string, number>; customer?: string;
}
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
const CHECK: Record<string, string> = { Seen: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300", "With doctor": "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  Waiting: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300", Skipped: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300" };

/** Patient file (reception orders, appointments, billing, procedures) — the tabs under the patient record. */
export function PatientFile({ mr }: { mr: string }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"visits" | "appointments" | "billing" | "procedures">("visits");
  const { data } = useApi<FileData>("patients.file", { name: mr });
  if (!data) return <div className="mt-4 h-60 animate-pulse rounded-3xl bg-muted" />;
  const tt = data.totals;
  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="relative overflow-hidden bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-600 p-5 text-white">
        <div className="absolute -end-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-3"><FileText className="h-5 w-5" /><h2 className="flex-1 text-lg font-extrabold">Patient file</h2>
          <span className="text-xs text-white/75">Every open of this file is recorded in the audit log</span></div>
        <div className="relative mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {([["Visits", `${tt.seen}/${tt.visits} seen`, ClipboardList], ["Billed", rs(tt.billed), Receipt], ["Paid", rs(tt.paid), Wallet],
            ["Patient owes", rs(tt.owed), CreditCard], ["Payer owes", rs(tt.payer_owed), CreditCard]] as const).map(([l, v, I]) => (
            <div key={l} className={cn("rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur", l === "Patient owes" && Number(tt.owed) > 0 && "bg-rose-500/30 ring-2 ring-rose-300")}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/75"><I className="h-3.5 w-3.5" />{l}</div>
              <div className="mt-0.5 text-lg font-extrabold tabular-nums">{v}</div></div>))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ key: "visits", label: "Reception visits", count: data.visits.length }, { key: "appointments", label: "Appointments", count: data.appointments.length },
          { key: "billing", label: "Invoices & payments", count: data.invoices.length }, { key: "procedures", label: "Procedures & stays", count: data.procedures.length + data.beds.length }]} />
      </div>
      <div className="p-4">
        {tab === "visits" && (data.visits.length ? (
          <div className="space-y-2">{data.visits.map((v) => (
            <div key={v.name} className="grid gap-3 rounded-2xl border border-border p-3 transition-colors hover:bg-muted/40 md:grid-cols-[90px_1fr_1fr_auto]">
              <div className="flex flex-col items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 py-2 dark:from-teal-500/10 dark:to-emerald-500/5">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Token</span><span className="text-2xl font-extrabold text-teal-700 dark:text-teal-300">{v.token_no}</span>
                <span className="text-[10px] text-muted-foreground">{v.posting_date.slice(5)} · {v.posting_time}</span></div>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><b>{v.doctor_name}</b><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", CHECK[v.checkup])}>{v.checkup === "Seen" ? <CheckCircle2 className="me-0.5 inline h-3 w-3" /> : <Clock className="me-0.5 inline h-3 w-3" />}{v.checkup}</span>
                {v.is_free_follow_up ? <Pill value="Follow-up" className="bg-teal-100 text-teal-800" /> : null}</div>
                <div className="text-xs text-muted-foreground">{t(v.purpose)} · {v.branch} · <span className="font-mono">{v.name}</span></div>
                {v.chief_complaint && <div className="mt-1 truncate text-xs">{v.chief_complaint}</div>}
                {v.prescription && <div className="mt-1 text-xs text-rose-600">Prescription {v.prescription}</div>}</div>
              <div className="text-xs">{v.booking_ref ? <><div className="flex items-center gap-1 font-semibold"><CalendarClock className="h-3.5 w-3.5 text-indigo-500" />Appointment {v.booking_ref}</div>
                <div className="mt-0.5 flex items-center gap-1 text-muted-foreground"><Pill value={v.source_channel} />{v.appt_time} · {v.appt_status}</div></> : <span className="text-muted-foreground">Walk-in (no appointment)</span>}</div>
              <div className="text-end text-sm"><div className="font-extrabold tabular-nums">{rs(v.patient_share)}</div><div className="text-[11px] text-muted-foreground">{v.payment_mode}{v.payer_share ? ` · ${v.payer_type} ${rs(v.payer_share)}` : ""}</div>
                {v.discount_amount ? <div className="text-[11px] text-amber-600">−{rs(v.discount_amount)} discount</div> : null}{v.sales_invoice && <div className="font-mono text-[10px] text-muted-foreground">{v.sales_invoice}</div>}</div>
            </div>))}</div>) : <Empty title="No visits yet" icon={ClipboardList} />)}

        {tab === "appointments" && (data.appointments.length ? (
          <table className="w-full text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Ref</th><th className="text-start">Date</th><th className="text-start">{t("Doctor")}</th><th className="text-start">Channel</th><th className="text-start">Payment</th><th className="text-start">Status</th><th className="text-start">Visit</th></tr></thead>
            <tbody>{data.appointments.map((a) => <tr key={a.name} className="border-b border-border/60"><td className="py-2 font-mono text-xs">{a.booking_ref}</td><td>{a.appointment_date} {a.start_time}</td><td>{a.doctor_name}</td>
              <td><Pill value={a.source_channel} /></td><td className="text-xs">{rs(a.fee)} · {a.payment_status}</td><td><Pill value={a.status} /></td><td className="font-mono text-xs">{a.opd_slip ?? "—"}</td></tr>)}</tbody></table>
        ) : <Empty title="No appointments" icon={CalendarClock} />)}

        {tab === "billing" && <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="flex items-center justify-between bg-muted/60 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><span>Invoices</span>
                <button onClick={() => exportToCsv([{ key: "name", label: "Invoice" }, { key: "posting_date", label: "Date" }, { key: "customer", label: "Billed to" }, { key: "billing_type", label: "Type" }, { key: "grand_total", label: "Total" }, { key: "outstanding_amount", label: "Outstanding" }, { key: "status", label: "Status" }], data.invoices as unknown as Record<string, unknown>[], `${mr}-invoices`)} className="normal-case text-primary">Export CSV</button></div>
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-3 py-2 text-start">Invoice</th><th className="text-start">Date</th><th className="text-start">Billed to</th><th className="text-start">For</th><th className="text-end">Total</th><th className="text-end">Owed</th><th className="px-3 text-start">Status</th></tr></thead>
                <tbody>{data.invoices.map((i) => (
                  <tr key={i.name} className="border-b border-border/60"><td className="px-3 py-2"><a href={`/app/sales-invoice/${i.name}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-mono text-xs text-primary hover:underline">{i.name}<ExternalLink className="h-3 w-3" /></a></td>
                    <td className="text-xs">{i.posting_date}</td><td className="text-xs">{i.payer ? <span className="font-semibold text-amber-700 dark:text-amber-300">{i.customer}</span> : "Patient"}</td>
                    <td className="text-xs">{i.billing_type} {i.is_return ? <span className="text-rose-600">(refund)</span> : null}</td><td className="text-end tabular-nums">{rs(i.grand_total)}</td>
                    <td className={cn("text-end font-semibold tabular-nums", i.outstanding_amount > 0 && "text-rose-600")}>{rs(i.outstanding_amount)}</td>
                    <td className="px-3"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", i.status === "Paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : i.status === "Overdue" || i.status === "Unpaid" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" : "bg-muted text-muted-foreground")}>{i.status}</span></td></tr>))}</tbody></table></div>
              {!data.invoices.length && <p className="p-4 text-center text-sm text-muted-foreground">No invoices.</p>}
            </div>
            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="bg-muted/60 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Payments received</div>
              <table className="w-full text-sm"><tbody>{data.payments.map((p, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0"><td className="px-3 py-2 text-xs">{p.date}</td><td className="text-xs">{p.mode}</td><td className="text-xs text-muted-foreground">{p.source} · <span className="font-mono">{p.invoice}</span></td>
                  <td className="px-3 text-end font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">{rs(p.amount)}</td></tr>))}</tbody></table>
              {!data.payments.length && <p className="p-4 text-center text-sm text-muted-foreground">No payments.</p>}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Treatment costs</div>
              {data.costs.map((c) => { const max = Math.max(...data.costs.map((x) => x.amount), 1); return (
                <div key={c.item_name + c.billing_type} className="mb-2.5"><div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate">{c.item_name} <span className="text-muted-foreground">× {c.qty}</span></span><span className="font-semibold tabular-nums">{rs(c.amount)}</span></div>
                  <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${(c.amount / max) * 100}%` }} /></div></div>); })}
              {!data.costs.length && <p className="text-sm text-muted-foreground">Nothing billed yet.</p>}
            </div>
            <div className="rounded-2xl border border-border p-4 text-sm">
              {([["Billed to patient", tt.patient_billed], ["Billed to payer", tt.payer_billed], ["Discounts given", tt.discount], ["Paid", tt.paid]] as const).map(([l, v]) => (
                <div key={l} className="flex justify-between py-1"><span className="text-muted-foreground">{l}</span><span className="font-semibold tabular-nums">{rs(v)}</span></div>))}
              <div className={cn("mt-2 flex items-center justify-between rounded-xl p-3", Number(tt.owed) > 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300")}>
                <span className="font-semibold">Patient owes</span><span className="text-xl font-extrabold tabular-nums">{rs(tt.owed)}</span></div>
              {Number(tt.payer_owed) > 0 && <div className="mt-2 flex justify-between rounded-xl bg-amber-50 p-3 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"><span className="font-semibold">Panel / insurer owes</span><span className="font-extrabold tabular-nums">{rs(tt.payer_owed)}</span></div>}
            </div>
          </div>
        </div>}

        {tab === "procedures" && <div className="grid gap-4 lg:grid-cols-2">
          <div><div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Scissors className="h-4 w-4" />Procedures</div>
            {data.procedures.length ? <ol className="relative space-y-2 border-s-2 border-border ps-5">{data.procedures.map((p, i) => (
              <li key={i} className="relative rounded-xl border border-border p-3 text-sm"><span className="absolute -start-[27px] top-4 h-3 w-3 rounded-full bg-violet-500 ring-4 ring-card" />
                <div className="flex justify-between"><b>{p.item_name}</b><span className="tabular-nums">{rs(p.amount)}</span></div>
                <div className="text-xs text-muted-foreground">{p.date} · {p.doctor_name} · <span className="font-mono">{p.source}</span></div></li>))}</ol>
              : <Empty title="No procedures" icon={Scissors} />}</div>
          <div><div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground"><BedDouble className="h-4 w-4" />Ward / bed log</div>
            {data.beds.length ? <ol className="relative space-y-2 border-s-2 border-border ps-5">{data.beds.map((b, i) => (
              <li key={i} className="relative rounded-xl border border-border p-3 text-sm"><span className={cn("absolute -start-[27px] top-4 h-3 w-3 rounded-full ring-4 ring-card", b.to_status === "Occupied" ? "bg-rose-500" : "bg-amber-400")} />
                <div className="flex justify-between"><b>{b.ward} · {b.bed.split("-").slice(-2).join("-")}</b><span className="text-xs">{b.from_status} → {b.to_status}</span></div>
                <div className="text-xs text-muted-foreground">{b.changed_on.slice(0, 16)} · {b.changed_by}{b.note ? ` · ${b.note}` : ""}</div></li>))}</ol>
              : <Empty title="No ward stays" icon={BedDouble} />}</div>
        </div>}
      </div>
    </section>
  );
}
