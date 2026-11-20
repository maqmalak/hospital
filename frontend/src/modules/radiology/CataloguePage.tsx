/** Imaging catalogue & report templates (D-91): prices, turnaround, preparation, website visibility; the template library. */
import { useMemo, useState } from "react";
import { ArrowRight, Ban, Bone, BookOpen, ClipboardList, Clock3, EyeOff, FileSignature, FileText, Footprints, Globe, HeartPulse, Timer, UserRound, Waves, LayoutGrid, List, Pencil, Plus, Search } from "lucide-react";
import { useAction, useApi } from "@/lib/api";
import { Field, inputCls, PageHeader, Tabs } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Modal, rs } from "./shared";

interface P { name: string; procedure_name: string; code?: string; female_only?: number; body_region?: string; modality: string; category: string; price: number; duration_min: number; tat_hours: number; is_active: number; show_on_website: number;
  walk_in: number; needs_consent: number; description?: string; preparation?: string; prep_group?: string; default_template?: string; sort_order?: number }
interface T { name: string; modality: string; procedure?: string; report_title?: string; is_active: number; technique?: string; findings?: string; impression?: string; recommendations?: string }

export default function CataloguePage() {
  const { data, refetch } = useApi<{ procedures: P[]; templates: T[] }>("radiology.catalogue_admin");
  const [tab, setTab] = useState<"procedures" | "templates">("procedures");
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("");
  const [view, setViewS] = useState<"list" | "card">(() => { try { return localStorage.getItem("hv.rad.catview") === "card" ? "card" : "list"; } catch { return "list"; } });
  const setView = (v: "list" | "card") => { setViewS(v); try { localStorage.setItem("hv.rad.catview", v); } catch { /* storage blocked */ } };
  const [newP, setNewP] = useState(false);
  const [editP, setEditP] = useState<P | null>(null);
  const [editT, setEditT] = useState<Partial<T> | null>(null);
  const procs = useMemo(() => (data?.procedures ?? []).filter((p) => (!mod || p.modality === mod) && (!q || p.procedure_name.toLowerCase().includes(q.toLowerCase()))), [data, q, mod]);
  const tpls = useMemo(() => (data?.templates ?? []).filter((t) => (!mod || t.modality === mod) && (!q || t.name.toLowerCase().includes(q.toLowerCase()))), [data, q, mod]);
  const count = (m: string) => (tab === "procedures" ? data?.procedures ?? [] : data?.templates ?? []).filter((x) => !m || x.modality === m).length;
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="Imaging catalogue & templates" icon={BookOpen} subtitle="What patients see on the website and book; what radiologists start their reports from"
        actions={tab === "templates" ? <Button size="sm" onClick={() => setEditT({ modality: mod || "X-Ray", is_active: 1 })}><Plus className="h-4 w-4" />New template</Button>
          : <Button size="sm" onClick={() => setNewP(true)}><Plus className="h-4 w-4" />New procedure</Button>} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs tabs={[{ key: "procedures", label: "Procedures", count: data?.procedures.length }, { key: "templates", label: "Report templates", count: data?.templates.length }]} value={tab} onChange={setTab} />
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1" role="radiogroup" aria-label="Modality">
          {["", "X-Ray", "Ultrasound", "Doppler", "MRI", "CT"].map((m) => <button key={m || "all"} role="radio" aria-checked={mod === m} onClick={() => setMod(m)}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold transition", mod === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {m || "All"} <span className="ms-1 text-xs opacity-70 tabular-nums">{count(m)}</span></button>)}
        </div>
        <div className="ms-auto flex rounded-xl border border-border bg-card p-1" role="radiogroup" aria-label="View">
          {([["list", List, "List view"], ["card", LayoutGrid, "Card view"]] as const).map(([k, I, l]) => <button key={k} role="radio" aria-checked={view === k} title={l} aria-label={l} onClick={() => setView(k)}
            className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><I className="h-4 w-4" /><span className="hidden sm:inline">{k === "list" ? "List" : "Cards"}</span></button>)}
        </div>
        <label className="relative w-72"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={cn(inputCls, "ps-9")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></label>
      </div>
      {tab === "procedures" && view === "card" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{procs.map((p) => { const M = MOD_STYLE[p.modality] ?? MOD_STYLE["X-Ray"]; return (
          <button key={p.name} type="button" onClick={() => setEditP(p)} className={cn("lx-card group flex flex-col rounded-2xl border border-border bg-card p-5 text-start shadow-sm", !p.is_active && "opacity-60")}>
            <div className="flex items-start gap-3">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", M.tile)}><M.icon className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5"><span className="lx-badge">{p.category === "X-Ray" ? "X-ray" : p.category}</span>{p.code && <span className="lx-muted font-mono text-[10.5px] text-muted-foreground">{p.code}</span>}</div>
                <div className="lx-title mt-1 text-[1.02rem] font-bold leading-snug">{p.procedure_name}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Flag tone={M.flag} icon={M.icon}>{p.modality}</Flag>
              {p.walk_in ? <Flag tone="emerald" icon={Footprints}>Walk-in</Flag> : null}
              {p.needs_consent ? <Flag tone="amber" icon={FileSignature}>Consent</Flag> : null}
              {p.female_only ? <Flag tone="pink" icon={UserRound}>Women only</Flag> : null}
              {p.show_on_website ? <Flag tone="sky" icon={Globe}>On website</Flag> : <Flag tone="slate" icon={EyeOff}>Hidden</Flag>}
              {!p.is_active ? <Flag tone="rose" icon={Ban}>Inactive</Flag> : null}
            </div>
            {p.description && <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{p.description}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {([[Clock3, "Duration", `${p.duration_min} min`], [Timer, "Report", p.tat_hours >= 24 ? `${Math.round(p.tat_hours / 24)} day${p.tat_hours >= 48 ? "s" : ""}` : `${p.tat_hours} h`],
                [ClipboardList, "Preparation", p.prep_group || "None"], [FileText, "Template", p.default_template || "—"]] as const).map(([I, k, val]) => (
                <div key={k} className="min-w-0 rounded-lg bg-muted/50 px-2.5 py-1.5"><dt className="lx-muted flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><I className="h-3 w-3" />{k}</dt>
                  <dd className="truncate font-semibold" title={String(val)}>{val}</dd></div>))}
            </dl>
            <div className="mt-auto flex items-end justify-between gap-2 pt-4">
              <span className="lx-link">Edit procedure<ArrowRight className="h-4 w-4" /></span>
              <span className="lx-title text-xl font-extrabold tabular-nums">{rs(p.price)}</span>
            </div>
          </button>); })}</div>
      ) : tab === "procedures" ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5 text-start">Procedure</th><th className="text-start">Modality</th><th className="text-end">Price</th><th className="text-end">Min</th><th className="text-end">TAT h</th><th className="px-3 text-start">Flags</th><th className="text-start">Template</th><th /></tr></thead>
            <tbody>{procs.map((p) => <tr key={p.name} className={cn("border-t border-border/60", !p.is_active && "opacity-50")}>
              <td className="px-3 py-2"><div className="font-semibold">{p.procedure_name}</div><div className="text-xs text-muted-foreground">{p.category}</div></td><td>{(() => { const M = MOD_STYLE[p.modality] ?? MOD_STYLE["X-Ray"]; return <Flag tone={M.flag} icon={M.icon}>{p.modality}</Flag>; })()}</td>
              <td className="text-end font-semibold tabular-nums">{rs(p.price)}</td><td className="text-end tabular-nums">{p.duration_min}</td><td className="text-end tabular-nums">{p.tat_hours}</td>
              <td className="px-3"><div className="flex flex-wrap gap-1">{p.show_on_website ? <Flag tone="sky" icon={Globe}>Web</Flag> : <Flag tone="slate" icon={EyeOff}>Hidden</Flag>}
                {p.walk_in ? <Flag tone="emerald" icon={Footprints}>Walk-in</Flag> : null}{p.needs_consent ? <Flag tone="amber" icon={FileSignature}>Consent</Flag> : null}
                {p.female_only ? <Flag tone="pink" icon={UserRound}>Women</Flag> : null}{!p.is_active ? <Flag tone="rose" icon={Ban}>Inactive</Flag> : null}</div></td>
              <td className="max-w-[200px] truncate text-xs text-muted-foreground">{p.default_template || "—"}</td>
              <td className="px-2"><Button size="xs" variant="outline" onClick={() => setEditP(p)}><Pencil className="h-3.5 w-3.5" />Edit</Button></td></tr>)}</tbody></table>
        </div>
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[800px] text-sm"><thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5 text-start">Template</th><th className="text-start">Modality</th><th className="text-start">Procedure</th><th className="text-start">Impression</th><th className="px-3 text-start">Status</th><th /></tr></thead>
            <tbody>{tpls.map((t) => <tr key={t.name} className={cn("border-t border-border/60", !t.is_active && "opacity-50")}>
              <td className="px-3 py-2"><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.report_title}</div></td><td>{t.modality}</td>
              <td className="max-w-[200px] truncate text-xs text-muted-foreground">{t.procedure || "—"}</td><td className="max-w-[320px] truncate text-xs text-muted-foreground">{t.impression}</td>
              <td className="px-3 text-xs font-semibold">{t.is_active ? "Active" : "Inactive"}</td>
              <td className="px-2"><Button size="xs" variant="outline" onClick={() => setEditT(t)}><Pencil className="h-3.5 w-3.5" />Edit</Button></td></tr>)}</tbody></table>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{tpls.map((t) => (
          <button key={t.name} type="button" onClick={() => setEditT(t)} className={cn("lx-card group flex flex-col rounded-2xl border border-border bg-card p-5 text-start shadow-sm", !t.is_active && "opacity-50")}>
            <div className="flex items-center gap-2"><span className="lx-badge">{t.modality}</span>{!t.is_active ? <span className="lx-badge">Inactive</span> : null}</div>
            <div className="lx-title mt-3 text-[1.05rem] font-bold leading-snug">{t.name}</div>
            {t.report_title && <div className="lx-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.report_title}</div>}
            <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{t.impression || t.findings}</p>
            <span className="lx-link mt-auto pt-4">Edit template<ArrowRight className="h-4 w-4" /></span>
          </button>))}</div>
      )}
      {newP && <NewProcModal mod={mod} templates={data?.templates ?? []} onClose={() => setNewP(false)} onDone={() => { setNewP(false); void refetch(); }} />}
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
        {!t.name && <Field label="Modality"><select className={inputCls} value={v.modality} onChange={(e) => setV({ ...v, modality: e.target.value })}><option>X-Ray</option><option>Ultrasound</option><option>Doppler</option><option>MRI</option><option>CT</option></select></Field>}
        <Field label="Printed title" className="md:col-span-2"><input className={cn(inputCls, "uppercase")} value={v.report_title ?? ""} onChange={(e) => setV({ ...v, report_title: e.target.value })} /></Field>
        {ta("technique", "Technique", 2)}{ta("findings", "Findings (one line per organ: “Organ: text”)", 10)}{ta("impression", "Impression", 2)}{ta("recommendations", "Recommendations", 2)}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked ? 1 : 0 })} className="h-4 w-4" />Active</label>
      </div>
    </Modal>
  );
}

const CATS: Record<string, string[]> = { "X-Ray": ["X-Ray", "Contrast Study"], Ultrasound: ["Ultrasound", "Pregnancy", "Guided Procedure"], Doppler: ["Doppler"], MRI: ["MRI"], CT: ["CT", "CT Angiography"] };
const PREPS = ["None", "Fasting", "Full Bladder", "Fasting + Full Bladder", "Metal Removal", "Contrast", "Pregnancy"];

function NewProcModal({ mod, templates, onClose, onDone }: { mod: string; templates: T[]; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ procedure_name: "", code: "", modality: mod || "X-Ray", category: CATS[mod || "X-Ray"][0], body_region: "", price: 0, duration_min: 15, tat_hours: 4,
    prep_group: "None", preparation: "", description: "", report_kind: "General", default_template: "", walk_in: 0, needs_consent: 0, female_only: 0, show_on_website: 1, is_active: 1, sort_order: 500, contrast: "No", contrast_surcharge: 0, urgent_surcharge: 0 });
  const save = useAction("radiology.create_procedure", { success: "Procedure added to the catalogue", onSuccess: onDone });
  const set = (k: string, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  const chk = (k: keyof typeof v, l: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v[k]} onChange={(e) => set(k, e.target.checked ? 1 : 0)} className="h-4 w-4" />{l}</label>;
  return (
    <Modal title="New procedure" wide onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Close</Button>
      <Button variant="submit" disabled={save.isPending || v.procedure_name.trim().length < 3} onClick={() => save.mutate({ data: JSON.stringify(v) })}><Plus className="h-4 w-4" />Add to catalogue</Button></>}>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Procedure name" required className="md:col-span-3"><input className={inputCls} value={v.procedure_name} onChange={(e) => set("procedure_name", e.target.value)} placeholder="e.g. X-Ray Elbow AP & Lateral" autoFocus /></Field>
        <Field label="Code"><input className={cn(inputCls, "uppercase")} value={v.code} onChange={(e) => set("code", e.target.value)} placeholder="XR-ELBOW" /></Field>
        <Field label="Modality" required><select className={inputCls} value={v.modality} onChange={(e) => setV((x) => ({ ...x, modality: e.target.value, category: CATS[e.target.value][0], default_template: "" }))}>{Object.keys(CATS).map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Category"><select className={inputCls} value={v.category} onChange={(e) => set("category", e.target.value)}>{CATS[v.modality].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Body region"><input className={inputCls} value={v.body_region} onChange={(e) => set("body_region", e.target.value)} placeholder="Elbow" /></Field>
        <Field label="Report kind"><select className={inputCls} value={v.report_kind} onChange={(e) => set("report_kind", e.target.value)}><option>General</option><option>Abdomen</option><option>Obstetric</option></select></Field>
        <Field label="Price (Rs)" required><input type="number" className={inputCls} value={v.price} onChange={(e) => set("price", Number(e.target.value))} /></Field>
        <Field label="Duration (min)"><input type="number" className={inputCls} value={v.duration_min} onChange={(e) => set("duration_min", Number(e.target.value))} /></Field>
        <Field label="Report TAT (hours)"><input type="number" step="0.5" className={inputCls} value={v.tat_hours} onChange={(e) => set("tat_hours", Number(e.target.value))} /></Field>
        <Field label="Sort order"><input type="number" className={inputCls} value={v.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} /></Field>
        {["MRI", "CT"].includes(v.modality) && <>
          <Field label="Contrast"><select className={inputCls} value={v.contrast} onChange={(e) => set("contrast", e.target.value)}><option>No</option><option>Optional</option><option>Yes</option></select></Field>
          <Field label="Contrast surcharge (Rs)"><input type="number" className={inputCls} value={v.contrast_surcharge} onChange={(e) => set("contrast_surcharge", Number(e.target.value))} /></Field>
          <Field label="Urgent surcharge (Rs)"><input type="number" className={inputCls} value={v.urgent_surcharge} onChange={(e) => set("urgent_surcharge", Number(e.target.value))} /></Field></>}
        <div className="flex flex-wrap gap-4 md:col-span-4">{chk("is_active", "Active")}{chk("show_on_website", "Show on website")}{chk("walk_in", "Walk-in allowed")}{chk("needs_consent", "Needs consent")}{chk("female_only", "Female patients only")}</div>
        <Field label="Short description (website)" className="md:col-span-4"><input className={inputCls} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="Elbow pain, injury or fracture follow-up." /></Field>
        <Field label="Preparation group"><select className={inputCls} value={v.prep_group} onChange={(e) => set("prep_group", e.target.value)}>{PREPS.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Preparation instructions" className="md:col-span-3" hint="Empty = the standard text of the preparation group (shown on the website, booking SMS and reminders)."><textarea className={cn(inputCls, "h-20 py-2")} value={v.preparation} onChange={(e) => set("preparation", e.target.value)} /></Field>
        <Field label="Default report template" className="md:col-span-2"><select className={inputCls} value={v.default_template} onChange={(e) => set("default_template", e.target.value)}><option value="">—</option>{templates.filter((t) => t.modality === v.modality).map((t) => <option key={t.name}>{t.name}</option>)}</select></Field>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">It appears on the website, in online booking and in New study straight away (if active). The billing item is created automatically the first time it is billed.</p>
    </Modal>
  );
}

const MOD_STYLE: Record<string, { icon: typeof Bone; tile: string; flag: string }> = {
  "X-Ray": { icon: Bone, tile: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", flag: "sky" },
  Ultrasound: { icon: Waves, tile: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", flag: "violet" },
  Doppler: { icon: HeartPulse, tile: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", flag: "rose" },
};
const FLAG_TONE: Record<string, string> = {
  sky: "bg-sky-100 text-sky-800 ring-sky-300/60 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-400/30",
  violet: "bg-violet-100 text-violet-800 ring-violet-300/60 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-400/30",
  rose: "bg-rose-100 text-rose-800 ring-rose-300/60 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-400/30",
  emerald: "bg-emerald-100 text-emerald-800 ring-emerald-300/60 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/30",
  amber: "bg-amber-100 text-amber-800 ring-amber-300/60 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30",
  pink: "bg-pink-100 text-pink-800 ring-pink-300/60 dark:bg-pink-500/15 dark:text-pink-200 dark:ring-pink-400/30",
  slate: "bg-slate-100 text-slate-700 ring-slate-300/60 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15",
};
function Flag({ tone, icon: I, children }: { tone: string; icon: typeof Bone; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ring-inset", FLAG_TONE[tone])}><I className="h-3 w-3" />{children}</span>;
}
