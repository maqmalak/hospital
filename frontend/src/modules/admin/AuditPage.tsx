import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useApi } from "@/lib/api";
import { Empty, Field, inputCls, PageHeader, Section, Tabs } from "@/components/common";
import { addDaysISO, todayISO } from "@/utils/dates";

interface Row { name: string; user?: string; owner?: string; action?: string; patient?: string; reference_doctype?: string; reference_name?: string; accessed_on?: string; ip_address?: string;
  ref_doctype?: string; docname?: string; creation?: string; changed?: string[]; values?: [string, unknown, unknown][]; added?: number; removed?: number }

export default function AuditPage() {
  const [kind, setKind] = useState<"access" | "changes">("access");
  const [user, setUser] = useState("");
  const [patient, setPatient] = useState("");
  const [from, setFrom] = useState(addDaysISO(todayISO(), -7));
  const [to, setTo] = useState(todayISO());
  const { data } = useApi<{ rows: Row[]; summary: { action: string; n: number }[] }>("admin.audit", { kind, user, patient, from_date: from, to_date: to });
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Audit log" icon={ShieldCheck} color="from-zinc-600 to-zinc-800" subtitle="Append-only: who opened patient history, prescriptions and CNIC — and every change to clinical and financial records" />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Tabs value={kind} onChange={setKind} tabs={[{ key: "access", label: "Access log" }, { key: "changes", label: "Changes" }]} />
        <Field label="User"><input className={inputCls} value={user} onChange={(e) => setUser(e.target.value)} placeholder="user@…" /></Field>
        <Field label={kind === "access" ? "Patient (MR)" : "Document"}><input className={inputCls} value={patient} onChange={(e) => setPatient(e.target.value)} /></Field>
        <Field label="From"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {kind === "access" && (data?.summary.length ?? 0) > 0 && <div className="mb-3 flex flex-wrap gap-2">{data!.summary.map((s) => <span key={s.action} className="rounded-full bg-muted px-3 py-1 text-xs"><b>{s.n}</b> {s.action} · 7 days</span>)}</div>}
      <Section>
        {data?.rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">When</th><th className="text-start">User</th><th className="text-start">{kind === "access" ? "Action" : "Document"}</th><th className="text-start">{kind === "access" ? "Patient / record" : "Changed"}</th><th className="text-start">{kind === "access" ? "IP" : ""}</th></tr></thead>
          <tbody>{data.rows.map((r) => kind === "access" ? (
            <tr key={r.name} className="border-b border-border/60"><td className="py-1.5 text-xs tabular-nums">{r.accessed_on?.slice(0, 19)}</td><td>{r.user}</td><td className="font-medium">{r.action}</td><td className="text-xs">{r.patient} <span className="text-muted-foreground">{r.reference_doctype} {r.reference_name}</span></td><td className="text-xs text-muted-foreground">{r.ip_address}</td></tr>
          ) : (
            <tr key={r.name} className="border-b border-border/60 align-top"><td className="py-1.5 text-xs tabular-nums">{r.creation?.slice(0, 19)}</td><td>{r.owner}</td><td className="text-xs"><b>{r.ref_doctype}</b> {r.docname}</td>
              <td className="text-xs">{r.values?.map((v) => <div key={v[0]}><span className="text-muted-foreground">{v[0]}:</span> <s className="text-rose-600">{String(v[1] ?? "")}</s> → <span className="text-emerald-700">{String(v[2] ?? "")}</span></div>)}{r.added ? <div>+{r.added} rows</div> : null}{r.removed ? <div>−{r.removed} rows</div> : null}</td><td /></tr>
          ))}</tbody></table></div> : <Empty title="Nothing in this range" />}
      </Section>
    </div>
  );
}
