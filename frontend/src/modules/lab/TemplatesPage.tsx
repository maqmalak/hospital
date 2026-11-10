import { useMemo, useState } from "react";
import { CheckCircle2, FlaskConical, Plus, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";

interface Row { name: string; test_name: string; test_code: string; department: string; sample_type: string; price: number; tat_hours: number; is_active: number; outsourced: number; result_type: string; parameters: number }
interface Param { parameter: string; unit?: string; gender?: string; age_from?: number | null; age_to?: number | null; normal_low?: number | null; normal_high?: number | null; critical_low?: number | null; critical_high?: number | null; normal_text?: string; decimals?: number }
interface Tpl { name?: string; test_name: string; test_code: string; department: string; sample_type: string; container?: string; volume?: string; tat_hours: number; price: number; is_active: number; result_type: string; method?: string;
  text_template?: string; outsourced: number; reference_lab?: string; outsource_cost?: number; auto_verify: number; parameters: Param[] }
interface Ctx { rows: Row[]; departments: string[]; sample_types: string[]; containers: string[]; labs: { name: string; supplier_name: string }[] }
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;

/** /lab/templates — test catalogue: code, sample, price, turnaround, parameters with normal / critical ranges (pathologist edits). */
export default function TemplatesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("PW Pathologist");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const { data, refetch } = useApi<Ctx>("lab.templates");
  const [edit, setEdit] = useState<string | "new" | null>(null);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => (!dept || r.department === dept) && (!q || `${r.test_name} ${r.test_code}`.toLowerCase().includes(q.toLowerCase()))), [data, q, dept]);
  if (!data) return <div className="flex h-60 items-center justify-center"><Spinner size={26} /></div>;
  return (
    <div className="space-y-4">
      <PageHeader title="Lab test templates" icon={FlaskConical} color="from-fuchsia-600 to-purple-700" subtitle={`${data.rows.length} tests · parameters, normal and critical ranges, price, turnaround`}
        actions={canEdit && <Button variant="save" onClick={() => setEdit("new")}><Plus className="h-4 w-4" />New test</Button>} />
      <div className="flex flex-wrap gap-2"><div className="relative min-w-60 flex-1"><Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" /><input className={inputCls + " ps-9"} placeholder="Test name or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">{["", ...data.departments.filter(Boolean)].map((d) => <button key={d || "all"} onClick={() => setDept(d)} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", dept === d ? "bg-card shadow" : "text-muted-foreground")}>{d || "All"}</button>)}</div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map((r) => (
        <button key={r.name} onClick={() => setEdit(r.name)} className={cn("flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg", !r.is_active && "opacity-50")}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-xs font-black text-white">{r.test_code.slice(0, 4)}</span>
          <span className="min-w-0 flex-1"><b className="block truncate">{r.test_name}</b><span className="text-xs text-muted-foreground">{r.department} · {r.sample_type} · {r.tat_hours} h · {r.parameters} parameter{r.parameters === 1 ? "" : "s"}{r.outsourced ? " · outsourced" : ""}</span></span>
          <b className="tabular-nums">{rs(r.price)}</b></button>))}</div>
      {!rows.length && <Empty title="No test found" icon={FlaskConical} />}
      {edit && <TemplateDialog name={edit === "new" ? undefined : edit} ctx={data} canEdit={canEdit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void refetch(); }} />}
    </div>
  );
}

const blank: Tpl = { test_name: "", test_code: "", department: "Chemistry", sample_type: "Serum", tat_hours: 24, price: 0, is_active: 1, result_type: "Numeric", outsourced: 0, auto_verify: 0, parameters: [{ parameter: "", gender: "All", decimals: 1 }] };
const num = (v: string) => (v === "" ? null : Number(v));

function TemplateDialog({ name, ctx, canEdit, onClose, onSaved }: { name?: string; ctx: Ctx; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const { data } = useApi<Tpl>("lab.template", { name }, { enabled: !!name });
  const [t, setT] = useState<Tpl | null>(name ? null : blank);
  const [busy, setBusy] = useState(false);
  const cur = t ?? (data ? { ...blank, ...data, parameters: data.parameters?.length ? data.parameters : blank.parameters } : null);
  if (!cur) return <Dialog open onClose={onClose} size="xl" title="Test template"><div className="flex h-40 items-center justify-center"><Spinner /></div></Dialog>;
  const set = (p: Partial<Tpl>) => setT({ ...cur, ...p });
  const setP = (i: number, p: Partial<Param>) => set({ parameters: cur.parameters.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const save = async () => { setBusy(true); try { await call("lab.save_template", { data: JSON.stringify(cur) }); toast.success("Template saved"); onSaved(); } catch (e) { toast.error(humanizeError(e), { duration: 8000 }); } finally { setBusy(false); } };
  const ro = !canEdit;
  const numCell = (i: number, k: keyof Param, w = "w-16") => <input disabled={ro} className={inputCls + ` h-8 ${w} px-1 text-end text-xs`} inputMode="decimal" value={(cur.parameters[i][k] as number | null | undefined) ?? ""} onChange={(e) => setP(i, { [k]: num(e.target.value.replace(/[^\d.-]/g, "")) } as Partial<Param>)} />;
  return (
    <Dialog open onClose={onClose} size="xl" className="max-w-6xl" title={name ? cur.test_name : "New test"} description={ro ? "Read only — the pathologist edits templates." : "Price and range changes apply to new orders; reports already verified keep their values."}>
      <fieldset disabled={ro} className="space-y-4">
        <div className="grid gap-2 md:grid-cols-4">
          <Field label="Test name" required><input className={inputCls} disabled={!!name || ro} value={cur.test_name} onChange={(e) => set({ test_name: e.target.value })} /></Field>
          <Field label="Code" required><input className={inputCls} value={cur.test_code} onChange={(e) => set({ test_code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Department"><select className={inputCls} value={cur.department} onChange={(e) => set({ department: e.target.value })}>{ctx.departments.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Result"><select className={inputCls} value={cur.result_type} onChange={(e) => set({ result_type: e.target.value })}>{["Numeric", "Text", "Both"].map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Sample"><select className={inputCls} value={cur.sample_type} onChange={(e) => set({ sample_type: e.target.value })}>{ctx.sample_types.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Container"><select className={inputCls} value={cur.container ?? ""} onChange={(e) => set({ container: e.target.value })}><option value="" />{ctx.containers.map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="Price (Rs)"><input className={inputCls + " text-end font-bold"} inputMode="numeric" value={cur.price || ""} onChange={(e) => set({ price: Number(e.target.value) || 0 })} /></Field>
          <Field label="Turnaround (hours)"><input className={inputCls + " text-end"} inputMode="decimal" value={cur.tat_hours || ""} onChange={(e) => set({ tat_hours: Number(e.target.value) || 0 })} /></Field>
        </div>
        {cur.result_type !== "Text" && <section className="rounded-2xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2"><b className="text-sm">Parameters & reference ranges</b>{!ro && <Button size="xs" variant="menu" onClick={() => set({ parameters: [...cur.parameters, { parameter: "", gender: "All", decimals: 1 }] })}><Plus className="h-3 w-3" />Parameter</Button>}</div>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-muted/60 text-[10px] uppercase text-muted-foreground"><tr><th className="px-2 py-1.5 text-start">Parameter</th><th className="text-start">Unit</th><th>Sex</th><th>Age from–to</th><th>Normal low–high</th><th>Critical low–high</th><th className="text-start">Normal text</th><th>Dec.</th><th /></tr></thead>
            <tbody>{cur.parameters.map((p, i) => <tr key={i} className="border-t border-border">
              <td className="px-2 py-1"><input className={inputCls + " h-8 min-w-36 text-xs"} value={p.parameter} onChange={(e) => setP(i, { parameter: e.target.value })} /></td>
              <td><input className={inputCls + " h-8 w-20 text-xs"} value={p.unit ?? ""} onChange={(e) => setP(i, { unit: e.target.value })} /></td>
              <td><select className={inputCls + " h-8 w-24 text-xs"} value={p.gender ?? "All"} onChange={(e) => setP(i, { gender: e.target.value })}>{["All", "Male", "Female"].map((g) => <option key={g}>{g}</option>)}</select></td>
              <td><div className="flex gap-1">{numCell(i, "age_from", "w-12")}{numCell(i, "age_to", "w-12")}</div></td>
              <td><div className="flex gap-1">{numCell(i, "normal_low")}{numCell(i, "normal_high")}</div></td>
              <td><div className="flex gap-1">{numCell(i, "critical_low")}{numCell(i, "critical_high")}</div></td>
              <td><input className={inputCls + " h-8 w-28 text-xs"} value={p.normal_text ?? ""} onChange={(e) => setP(i, { normal_text: e.target.value })} placeholder="e.g. Negative" /></td>
              <td>{numCell(i, "decimals", "w-10")}</td>
              <td>{!ro && <button type="button" className="p-1 text-rose-600" onClick={() => set({ parameters: cur.parameters.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>}</td></tr>)}</tbody></table></div>
          <div className="px-3 py-2 text-[11px] text-muted-foreground">Add one row per sex / age band when ranges differ (e.g. Hb: Male 13–17, Female 12–15). Values outside the critical range alert the pathologist.</div></section>}
        {cur.result_type !== "Numeric" && <Field label="Starting text for the report"><textarea className={inputCls + " min-h-24"} value={cur.text_template ?? ""} onChange={(e) => set({ text_template: e.target.value })} /></Field>}
        <div className="grid gap-2 md:grid-cols-4">
          <Field label="Method"><input className={inputCls} value={cur.method ?? ""} onChange={(e) => set({ method: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!cur.outsourced} onChange={(e) => set({ outsourced: e.target.checked ? 1 : 0 })} />Outsourced</label>
          {!!cur.outsourced && <><Field label="Reference lab"><select className={inputCls} value={cur.reference_lab ?? ""} onChange={(e) => set({ reference_lab: e.target.value })}><option value="" />{ctx.labs.map((l) => <option key={l.name} value={l.name}>{l.supplier_name}</option>)}</select></Field>
            <Field label="Lab's charge (Rs)"><input className={inputCls + " text-end"} inputMode="numeric" value={cur.outsource_cost || ""} onChange={(e) => set({ outsource_cost: Number(e.target.value) || 0 })} /></Field></>}
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!cur.auto_verify} onChange={(e) => set({ auto_verify: e.target.checked ? 1 : 0 })} />Auto-verify when all normal</label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={!!cur.is_active} onChange={(e) => set({ is_active: e.target.checked ? 1 : 0 })} />Active</label>
        </div>
      </fieldset>
      {!ro && <Button variant="save" className="mt-4 w-full" disabled={!cur.test_name || !cur.test_code} loading={busy} onClick={() => void save()}><CheckCircle2 className="h-4 w-4" />Save template</Button>}
    </Dialog>
  );
}
