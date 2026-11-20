/** Imaging catalogue & report templates (D-91): prices, turnaround, preparation, website visibility; the template library. */
import { useMemo, useState } from "react";
import { BookOpen, Pencil, Plus, Search } from "lucide-react";
import { useAction, useApi } from "@/lib/api";
import { Field, inputCls, PageHeader, Tabs } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Modal, rs } from "./shared";

interface P { name: string; procedure_name: string; modality: string; category: string; price: number; duration_min: number; tat_hours: number; is_active: number; show_on_website: number;
  walk_in: number; needs_consent: number; description?: string; preparation?: string; prep_group?: string; default_template?: string; sort_order?: number }
interface T { name: string; modality: string; procedure?: string; report_title?: string; is_active: number; technique?: string; findings?: string; impression?: string; recommendations?: string }

export default function CataloguePage() {
  const { data, refetch } = useApi<{ procedures: P[]; templates: T[] }>("radiology.catalogue_admin");
  const [tab, setTab] = useState<"procedures" | "templates">("procedures");
  const [q, setQ] = useState("");
  const [editP, setEditP] = useState<P | null>(null);
  const [editT, setEditT] = useState<Partial<T> | null>(null);
  const procs = useMemo(() => (data?.procedures ?? []).filter((p) => !q || p.procedure_name.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const tpls = useMemo(() => (data?.templates ?? []).filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase())), [data, q]);
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="Imaging catalogue & templates" icon={BookOpen} subtitle="What patients see on the website and book; what radiologists start their reports from"
        actions={tab === "templates" && <Button size="sm" onClick={() => setEditT({ modality: "X-Ray", is_active: 1 })}><Plus className="h-4 w-4" />New template</Button>} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs tabs={[{ key: "procedures", label: "Procedures", count: data?.procedures.length }, { key: "templates", label: "Report templates", count: data?.templates.length }]} value={tab} onChange={setTab} />
        <label className="relative ms-auto w-72"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={cn(inputCls, "ps-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></label>
      </div>
      {tab === "procedures" ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5 text-start">Procedure</th><th className="text-start">Modality</th><th className="text-end">Price</th><th className="text-end">Min</th><th className="text-end">TAT h</th><th className="px-3 text-start">Flags</th><th className="text-start">Template</th><th /></tr></thead>
            <tbody>{procs.map((p) => <tr key={p.name} className={cn("border-t border-border/60", !p.is_active && "opacity-50")}>
              <td className="px-3 py-2"><div className="font-semibold">{p.procedure_name}</div><div className="text-xs text-muted-foreground">{p.category}</div></td><td>{p.modality}</td>
              <td className="text-end font-semibold tabular-nums">{rs(p.price)}</td><td className="text-end tabular-nums">{p.duration_min}</td><td className="text-end tabular-nums">{p.tat_hours}</td>
              <td className="px-3"><div className="flex flex-wrap gap-1 text-[10px] font-semibold">{p.show_on_website ? <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">Web</span> : null}
                {p.walk_in ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">Walk-in</span> : null}{p.needs_consent ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Consent</span> : null}</div></td>
              <td className="max-w-[200px] truncate text-xs text-muted-foreground">{p.default_template || "—"}</td>
              <td className="px-2"><Button size="xs" variant="outline" onClick={() => setEditP(p)}><Pencil className="h-3.5 w-3.5" />Edit</Button></td></tr>)}</tbody></table>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{tpls.map((t) => <button key={t.name} onClick={() => setEditT(t)} className={cn("rounded-2xl border border-border bg-card p-4 text-start shadow-sm transition hover:border-primary", !t.is_active && "opacity-50")}>
          <div className="text-xs font-semibold text-muted-foreground">{t.modality}{t.procedure ? ` · ${t.procedure}` : ""}</div><div className="font-bold">{t.name}</div>
          <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">{t.impression}</div></button>)}</div>
      )}
      {editP && <ProcModal p={editP} templates={data?.templates ?? []} onClose={() => setEditP(null)} onDone={() => { setEditP(null); void refetch(); }} />}
      {editT && <TplModal t={editT} onClose={() => setEditT(null)} onDone={() => { setEditT(null); void refetch(); }} />}
    </div>
  );
}

function ProcModal({ p, templates, onClose, onDone }: { p: P; templates: T[]; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ ...p });
  const save = useAction("radiology.save_procedure", { success: "Saved", onSuccess: onDone });
  const num = (k: keyof P) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) });
  const chk = (k: keyof P, l: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked ? 1 : 0 })} className="h-4 w-4" />{l}</label>;
  return (
    <Modal title={p.procedure_name} wide onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" disabled={save.isPending} onClick={() => save.mutate({ name: p.name, data: JSON.stringify(v) })}>Save</Button></>}>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Price (Rs)"><input type="number" className={inputCls} value={v.price} onChange={num("price")} /></Field>
        <Field label="Duration (min)"><input type="number" className={inputCls} value={v.duration_min} onChange={num("duration_min")} /></Field>
        <Field label="Report TAT (hours)"><input type="number" step="0.5" className={inputCls} value={v.tat_hours} onChange={num("tat_hours")} /></Field>
        <Field label="Sort order"><input type="number" className={inputCls} value={v.sort_order ?? 100} onChange={num("sort_order")} /></Field>
        <div className="flex flex-wrap gap-4 md:col-span-4">{chk("is_active", "Active")}{chk("show_on_website", "Show on website")}{chk("walk_in", "Walk-in allowed")}{chk("needs_consent", "Needs consent")}</div>
        <Field label="Short description (website)" className="md:col-span-4"><input className={inputCls} value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <Field label="Preparation instructions (website, SMS, reminders)" className="md:col-span-4" hint="Empty = the standard text of the preparation group."><textarea className={cn(inputCls, "h-24 py-2")} value={v.preparation ?? ""} onChange={(e) => setV({ ...v, preparation: e.target.value })} /></Field>
        <Field label="Default report template" className="md:col-span-2"><select className={inputCls} value={v.default_template ?? ""} onChange={(e) => setV({ ...v, default_template: e.target.value })}><option value="">—</option>{templates.filter((t) => t.modality === p.modality).map((t) => <option key={t.name}>{t.name}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

function TplModal({ t, onClose, onDone }: { t: Partial<T>; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<Partial<T> & { template_name?: string }>({ ...t });
  const save = useAction("radiology.save_template", { success: "Template saved", onSuccess: onDone });
  const ta = (k: keyof T, l: string, rows = 3) => <Field label={l} className="md:col-span-2"><textarea rows={rows} className={cn(inputCls, "h-auto py-2")} value={(v[k] as string) ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>;
  return (
    <Modal title={t.name || "New template"} wide onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button variant="submit" disabled={save.isPending} onClick={() => save.mutate({ data: JSON.stringify(v) })}>Save</Button></>}>
      <div className="grid gap-3 md:grid-cols-2">
        {!t.name && <Field label="Template name" required><input className={inputCls} value={v.template_name ?? ""} onChange={(e) => setV({ ...v, template_name: e.target.value })} /></Field>}
        {!t.name && <Field label="Modality"><select className={inputCls} value={v.modality} onChange={(e) => setV({ ...v, modality: e.target.value })}><option>X-Ray</option><option>Ultrasound</option><option>Doppler</option></select></Field>}
        <Field label="Printed title" className="md:col-span-2"><input className={cn(inputCls, "uppercase")} value={v.report_title ?? ""} onChange={(e) => setV({ ...v, report_title: e.target.value })} /></Field>
        {ta("technique", "Technique", 2)}{ta("findings", "Findings (one line per organ: “Organ: text”)", 10)}{ta("impression", "Impression", 2)}{ta("recommendations", "Recommendations", 2)}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked ? 1 : 0 })} className="h-4 w-4" />Active</label>
      </div>
    </Modal>
  );
}
