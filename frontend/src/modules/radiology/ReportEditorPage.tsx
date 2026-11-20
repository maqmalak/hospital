/**
 * Radiology report editor (D-91 C1): auto-filled patient & study header, template library, structured obstetric biometry,
 * organ measurements, key images, critical-finding alert, Draft → Preliminary → Final (digital signature), addenda with audit
 * trail, A4 preview / PDF, prior studies for comparison.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertOctagon, ArrowLeft, Baby, CheckCheck, Eye, FilePlus2, FileSignature, History, ImagePlus, Loader2, Lock, Paperclip, Plus, Printer, Save, ShieldCheck, Trash2, Wand2,
} from "lucide-react";
import toast from "react-hot-toast";
import { call, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { humanizeError } from "@/services/frappe";
import { Field, inputCls } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Modal, openPdf, PriorityTag, StatusBadge, TatDot } from "./shared";

interface Meas { label: string; value?: string; unit?: string; reference?: string }
interface KeyImg { image: string; caption?: string }
interface Study {
  name: string; booking_ref: string; patient?: string; patient_name: string; gender?: string; age?: number; phone?: string; procedure: string; procedure_name: string; modality: string;
  priority: string; status: string; report_status: string; scheduled_date: string; slot_time?: string; scanned_at?: string; expected_at?: string; verified_at?: string; token_no?: string;
  clinical_notes?: string; prescription_file?: string; pregnancy_status?: string; lmp?: string; referring_name?: string; radiologist_name?: string; qc_note?: string; films?: string;
  report_title?: string; clinical_history?: string; technique?: string; findings?: string; impression?: string; recommendations?: string; report_template?: string; report_version: number;
  critical_finding: number; critical_note?: string; critical_notified_at?: string; measurements: Meas[]; key_images: KeyImg[];
  addenda: { text: string; added_by: string; added_at: string }[]; events: { status: string; note?: string; by_name?: string; at: string }[]; verify_url?: string;
  procedure_info: { report_kind: string; category: string; preparation: string; needs_consent: number; tat_hours: number }; templates: { name: string; procedure?: string }[];
  history: { name: string; procedure_name: string; modality: string; scheduled_date: string; impression?: string }[];
  [k: string]: unknown;
}
const OB: [string, string, string][] = [["ob_ga", "Gestational age", "24 weeks 1 day"], ["ob_edd", "EDD", ""], ["ob_fhr", "FHR (bpm)", "148"], ["ob_presentation", "Presentation", "Cephalic"],
  ["ob_number", "Fetal number", "Single"], ["ob_bpd", "BPD", "59 mm"], ["ob_hc", "HC", "218 mm"], ["ob_ac", "AC", "196 mm"], ["ob_fl", "FL", "44 mm"], ["ob_efw", "EFW", "640 g"],
  ["ob_placenta", "Placenta", "Posterior, upper segment"], ["ob_afi", "Liquor (AFI)", "14.2 cm"]];
const TEXT = ["report_title", "clinical_history", "technique", "findings", "impression", "recommendations", "report_template", ...OB.map((o) => o[0])];

export default function ReportEditorPage() {
  const { name = "" } = useParams();
  const { hasRole } = useAuth();
  const isRad = hasRole("PW Radiologist");
  const { data: s, refetch } = useApi<Study>("radiology.study", { name });
  const [f, setF] = useState<Record<string, string>>({});
  const [meas, setMeas] = useState<Meas[]>([]);
  const [imgs, setImgs] = useState<KeyImg[]>([]);
  const [crit, setCrit] = useState({ on: false, note: "" });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmSign, setConfirmSign] = useState(false);
  const [add, setAdd] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!s) return;
    const v: Record<string, string> = {};
    TEXT.forEach((k) => { v[k] = (s[k] as string) ?? ""; });
    if (!v.clinical_history && s.clinical_notes) v.clinical_history = s.clinical_notes;
    if (!v.report_title) v.report_title = s.procedure_name.toUpperCase();
    setF(v); setMeas(s.measurements.map((m) => ({ label: m.label, value: m.value, unit: m.unit, reference: m.reference }))); setImgs(s.key_images.map((k) => ({ image: k.image, caption: k.caption })));
    setCrit({ on: !!s.critical_finding, note: s.critical_note ?? "" }); setDirty(false);
  }, [s]);
  useEffect(() => { const f2 = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", f2); return () => window.removeEventListener("beforeunload", f2); }, [dirty]);

  const final = s?.report_status === "Final";
  const canEdit = !!s && !final && !["Booked", "Registered", "Cancelled", "No Show"].includes(s.status) && hasRole("PW Radiographer", "PW Sonographer", "PW Radiologist");
  const ob = s?.procedure_info.report_kind === "Obstetric";
  const set = (k: string, v: string) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };
  const payload = () => ({ ...f, measurements: meas.filter((m) => m.label.trim()), key_images: imgs, critical_finding: crit.on ? 1 : 0, critical_note: crit.note });

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); setDirty(false); await refetch(); } catch (e) { toast.error(humanizeError(e), { duration: 6000 }); } finally { setBusy(""); }
  };
  const save = (stage: "Draft" | "Preliminary") => run(stage, () => call("radiology.save_report", { name, data: JSON.stringify(payload()), stage }), stage === "Draft" ? "Draft saved" : "Preliminary report issued");
  const sign = () => run("Final", () => call("radiology.finalize", { name, data: JSON.stringify(payload()) }), "Final report signed — patient notified");
  const applyTpl = async (t: string) => {
    if (!t) return;
    if ((f.findings || f.impression) && !confirm("Replace the current text with this template?")) return;
    try {
      const r = await call<Record<string, unknown>>("radiology.apply_template", { name, template: t });
      setF((x) => ({ ...x, report_template: t, report_title: (r.report_title as string) || x.report_title, technique: (r.technique as string) || "", findings: (r.findings as string) || "",
        impression: (r.impression as string) || "", recommendations: (r.recommendations as string) || "" }));
      setMeas((r.measurements as Meas[]) ?? []); setDirty(true);
    } catch (e) { toast.error(humanizeError(e)); }
  };
  const upload = async (files: FileList | null) => {
    if (!files) return;
    for (const fl of Array.from(files).slice(0, 6 - imgs.length)) {
      const data = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(fl); });
      try { const r = await call<{ file_url: string }>("radiology.upload_image", { name, filename: fl.name, filedata: data }); setImgs((x) => [...x, { image: r.file_url, caption: "" }]); setDirty(true); }
      catch (e) { toast.error(humanizeError(e)); }
    }
  };
  const openPreview = async () => {
    if (dirty && canEdit) await call("radiology.save_report", { name, data: JSON.stringify(payload()), stage: "Draft" }).then(() => { setDirty(false); void refetch(); }).catch(() => {});
    try { setPreview((await call<{ html: string }>("radiology.preview", { name })).html); } catch (e) { toast.error(humanizeError(e)); }
  };
  const tpls = useMemo(() => (s?.templates ?? []).sort((a, b) => Number(b.procedure === s?.procedure) - Number(a.procedure === s?.procedure)), [s]);

  if (!s) return <div className="flex items-center justify-center gap-2 p-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading study…</div>;
  return (
    <div className="mx-auto max-w-[1400px]">
      {/* header */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <Link to="/radiology" className="rounded-lg p-1.5 hover:bg-muted" aria-label="Back to worklist"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1"><h1 className="vvs-serif truncate text-xl font-semibold">{s.procedure_name}</h1>
            <div className="text-xs text-muted-foreground">{s.name} · <span className="font-mono">{s.booking_ref}</span>{s.token_no ? ` · token ${s.token_no}` : ""}</div></div>
          <PriorityTag p={s.priority} /><StatusBadge s={s.status} />
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", final ? "bg-emerald-600 text-white" : s.report_status === "Preliminary" ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground")}>{final ? `FINAL v${s.report_version}` : s.report_status.toUpperCase()}</span>
          {!final && <TatDot t={s.expected_at ? (new Date(s.expected_at.replace(" ", "T")) < new Date() ? "red" : "green") : null} due={s.expected_at} />}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm md:grid-cols-4 xl:grid-cols-8">
          {([["Patient", s.patient_name], ["Age / gender", [s.age ? `${s.age} y` : "", s.gender].filter(Boolean).join(" / ")], ["MR no.", s.patient || "—"], ["Referring", s.referring_name || "Self"],
            ["Modality", s.modality], ["Scanned", s.scanned_at?.slice(0, 16) || "—"], ["Pregnancy", s.pregnancy_status || "—"], ["Radiologist", s.radiologist_name || "—"]] as [string, string][]).map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="truncate font-semibold">{v}</dd></div>))}
        </dl>
        {(s.clinical_notes || s.prescription_file || s.qc_note) && <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border bg-muted/30 px-4 py-2 text-sm">
          {s.clinical_notes && <span><b>Indication:</b> {s.clinical_notes}</span>}{s.qc_note && <span><b>Technologist:</b> {s.qc_note}</span>}
          {s.prescription_file && <a href={s.prescription_file} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary"><Paperclip className="h-4 w-4" />Prescription</a>}</div>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {final && <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-500/40 dark:bg-emerald-500/10">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" /><div className="flex-1"><b>Signed {s.verified_at?.slice(0, 16)} by {s.radiologist_name}.</b> The report is locked; corrections are added as dated addenda and re-signed.
              {s.verify_url && <a href={s.verify_url} target="_blank" rel="noreferrer" className="ms-2 font-semibold text-primary">QR check page ↗</a>}</div></div>}

          {/* template + title */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
              <Field label="Template"><div className="flex gap-2"><select className={inputCls} disabled={!canEdit} value={f.report_template ?? ""} onChange={(e) => void applyTpl(e.target.value)}>
                <option value="">— choose a template —</option>{tpls.map((t) => <option key={t.name} value={t.name}>{t.name}{t.procedure === s.procedure ? " ★" : ""}</option>)}</select>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary" title="Fills technique, findings, impression and measurements"><Wand2 className="h-4 w-4" /></span></div></Field>
              <Field label="Report title (printed)"><input className={cn(inputCls, "font-semibold uppercase tracking-wide")} disabled={!canEdit} value={f.report_title ?? ""} onChange={(e) => set("report_title", e.target.value)} /></Field>
            </div>
          </div>

          <Section title="Clinical history / indication"><textarea rows={2} className={ta} disabled={!canEdit} value={f.clinical_history ?? ""} onChange={(e) => set("clinical_history", e.target.value)} /></Section>
          <Section title="Technique"><textarea rows={2} className={ta} disabled={!canEdit} value={f.technique ?? ""} onChange={(e) => set("technique", e.target.value)} /></Section>

          {ob && <Section title={<span className="flex items-center gap-2"><Baby className="h-4 w-4 text-primary" />Obstetric biometry</span>}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{OB.map(([k, l, ph]) => <Field key={k} label={l}><input type={k === "ob_edd" ? "date" : "text"} className={inputCls} disabled={!canEdit} value={f[k] ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} /></Field>)}</div>
            {s.lmp && <p className="mt-2 text-xs text-muted-foreground">LMP given at booking: {s.lmp}</p>}
          </Section>}

          <Section title="Findings" hint="One line per organ as “Organ: finding” prints as an aligned organ-by-organ table.">
            <textarea rows={12} className={cn(ta, "font-[450] leading-relaxed")} disabled={!canEdit} value={f.findings ?? ""} onChange={(e) => set("findings", e.target.value)} placeholder={"Liver: normal in size and echotexture…\nGallbladder: …"} />
          </Section>

          <Section title="Measurements" action={canEdit && <Button size="xs" variant="outline" onClick={() => { setMeas((m) => [...m, { label: "" }]); setDirty(true); }}><Plus className="h-3.5 w-3.5" />Row</Button>}>
            {meas.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="pb-1 text-start">Parameter</th><th className="text-start">Value</th><th className="text-start">Unit</th><th className="text-start">Normal / reference</th><th /></tr></thead>
              <tbody>{meas.map((m, i) => <tr key={i}>{(["label", "value", "unit", "reference"] as const).map((k) => <td key={k} className="py-1 pe-2"><input className={cn(inputCls, "h-9", k === "value" && "font-semibold")} disabled={!canEdit} value={m[k] ?? ""}
                onChange={(e) => { const v = e.target.value; setMeas((x) => x.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setDirty(true); }} /></td>)}
                <td>{canEdit && <button onClick={() => { setMeas((x) => x.filter((_, j) => j !== i)); setDirty(true); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-600" aria-label="Remove row"><Trash2 className="h-4 w-4" /></button>}</td></tr>)}</tbody></table></div>
              : <p className="text-sm text-muted-foreground">No measurements. Choose a template or add rows (liver span, kidney sizes, CBD…).</p>}
          </Section>

          <Section title="Impression" hint="Printed in bold in a highlighted box."><textarea rows={3} className={cn(ta, "font-semibold")} disabled={!canEdit} value={f.impression ?? ""} onChange={(e) => set("impression", e.target.value)} /></Section>
          <Section title="Recommendations"><textarea rows={2} className={ta} disabled={!canEdit} value={f.recommendations ?? ""} onChange={(e) => set("recommendations", e.target.value)} /></Section>

          <Section title="Key images" hint="JPEG / PNG exported from the modality or PACS — up to 4 print on the report, 6 for the patient viewer."
            action={canEdit && imgs.length < 6 && <><input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
              <Button size="xs" variant="outline" onClick={() => fileRef.current?.click()}><ImagePlus className="h-3.5 w-3.5" />Add image</Button></>}>
            {imgs.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{imgs.map((k, i) => <div key={k.image} className="overflow-hidden rounded-xl border border-border bg-black">
              <a href={k.image} target="_blank" rel="noreferrer"><img src={k.image} alt={k.caption || `Key image ${i + 1}`} className="h-36 w-full object-cover" /></a>
              <div className="flex gap-1 bg-card p-1.5"><input className={cn(inputCls, "h-8 text-xs")} disabled={!canEdit} placeholder="Caption" value={k.caption ?? ""} onChange={(e) => { const v = e.target.value; setImgs((x) => x.map((r, j) => (j === i ? { ...r, caption: v } : r))); setDirty(true); }} />
                {canEdit && <button onClick={() => { setImgs((x) => x.filter((_, j) => j !== i)); setDirty(true); }} className="rounded p-1.5 text-muted-foreground hover:text-rose-600" aria-label="Remove image"><Trash2 className="h-4 w-4" /></button>}</div></div>)}</div>
              : <p className="text-sm text-muted-foreground">No key images attached.</p>}
          </Section>

          <div className={cn("rounded-2xl border p-4 shadow-sm", crit.on ? "border-rose-400 bg-rose-50 dark:border-rose-500/50 dark:bg-rose-500/10" : "border-border bg-card")}>
            <label className="flex cursor-pointer items-center gap-3"><input type="checkbox" disabled={!canEdit} checked={crit.on} onChange={(e) => { setCrit({ ...crit, on: e.target.checked }); setDirty(true); }} className="h-5 w-5 accent-rose-600" />
              <AlertOctagon className={cn("h-5 w-5", crit.on ? "text-rose-600" : "text-muted-foreground")} /><span className="font-bold">Critical finding</span>
              <span className="text-sm text-muted-foreground">— alerts the referring doctor and the radiology team immediately on save</span></label>
            {crit.on && <input className={cn(inputCls, "mt-3")} disabled={!canEdit} value={crit.note} onChange={(e) => { setCrit({ ...crit, note: e.target.value }); setDirty(true); }} placeholder="e.g. Large right pneumothorax with mediastinal shift" />}
            {s.critical_notified_at && <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">Alert sent {s.critical_notified_at.slice(0, 16)}</p>}
          </div>

          {final && <Section title={<span className="flex items-center gap-2"><FilePlus2 className="h-4 w-4 text-primary" />Addenda</span>}>
            {s.addenda.map((a, i) => <div key={i} className="mb-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm dark:bg-amber-500/10"><div className="text-xs font-semibold text-muted-foreground">{a.added_at?.slice(0, 16)} · {a.added_by}</div><div className="whitespace-pre-wrap">{a.text}</div></div>)}
            {isRad ? <><textarea rows={3} className={ta} value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Addendum — e.g. comparison with prior films received later…" />
              <Button className="mt-2" variant="submit" disabled={add.trim().length < 5 || busy === "add"} onClick={() => void run("add", () => call("radiology.addendum", { name, text: add }), "Addendum added and re-signed").then(() => setAdd(""))}><FileSignature className="h-4 w-4" />Add addendum & re-sign</Button></>
              : !s.addenda.length && <p className="text-sm text-muted-foreground">None.</p>}
          </Section>}
        </div>

        {/* side */}
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-2">
              {canEdit && <Button variant="outline" disabled={!!busy} onClick={() => void save("Draft")}>{busy === "Draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save draft{dirty ? " •" : ""}</Button>}
              {canEdit && isRad && <Button variant="outline" disabled={!!busy} onClick={() => void save("Preliminary")}><CheckCheck className="h-4 w-4" />Issue preliminary</Button>}
              {canEdit && isRad && <Button variant="submit" disabled={!!busy || !f.findings?.trim() || !f.impression?.trim()} onClick={() => setConfirmSign(true)}><ShieldCheck className="h-4 w-4" />Sign final report</Button>}
              {canEdit && !isRad && <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">Technologists can draft text and measurements; a radiologist issues and signs the report.</p>}
              <Button variant="outline" onClick={() => void openPreview()}><Eye className="h-4 w-4" />Preview A4</Button>
              <Button variant="outline" onClick={() => openPdf(s.name)}><Printer className="h-4 w-4" />PDF</Button>
            </div>
          </div>
          {!!s.history.length && <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold"><History className="h-4 w-4 text-primary" />Prior studies</h3>
            <ul className="space-y-2">{s.history.map((h) => <li key={h.name}><Link to={`/radiology/report/${h.name}`} className="block rounded-xl border border-border p-2.5 hover:border-primary">
              <div className="text-xs text-muted-foreground">{h.scheduled_date} · {h.modality}</div><div className="text-sm font-semibold">{h.procedure_name}</div>{h.impression && <div className="line-clamp-2 text-xs text-muted-foreground">{h.impression}</div>}</Link></li>)}</ul>
          </div>}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold">Timeline & audit</h3>
            <ol className="relative space-y-3 border-s-2 border-border ps-4">{[...s.events].reverse().map((e, i) => <li key={i} className="relative"><span className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-card" />
              <div className="text-xs text-muted-foreground">{e.at?.slice(0, 16)} · {e.by_name || "System"}</div><div className="text-sm font-semibold">{e.status}</div>{e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}</li>)}</ol>
          </div>
        </aside>
      </div>

      {preview !== null && <Modal title="A4 preview" wide onClose={() => setPreview(null)} footer={<Button onClick={() => openPdf(s.name)}><Printer className="h-4 w-4" />Open PDF</Button>}>
        <iframe title="Report preview" srcDoc={preview} className="h-[72vh] w-full rounded-lg border border-border bg-white" /></Modal>}
      {confirmSign && <Modal title="Sign the final report?" onClose={() => setConfirmSign(false)} footer={<><Button variant="outline" onClick={() => setConfirmSign(false)}>Review again</Button>
        <Button variant="submit" disabled={busy === "Final"} onClick={() => { setConfirmSign(false); void sign(); }}><ShieldCheck className="h-4 w-4" />Sign as {s.radiologist_name || "me"}</Button></>}>
        <p className="text-sm">Signing locks the report, adds your digital signature and QR code, marks the study <b>Verified</b> and sends the patient the report-ready message. Later changes become dated addenda.</p>
        {crit.on && <p className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-700 dark:text-rose-300">Critical finding: the referring doctor is alerted now if not already.</p>}
      </Modal>}
    </div>
  );
}

const ta = "w-full rounded-lg border border-input bg-[hsl(var(--input-bg))] px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-80";
function Section({ title, hint, action, children }: { title: React.ReactNode; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2"><h2 className="flex-1 text-xs font-bold uppercase tracking-[0.12em] text-primary">{title}</h2>{action}</div>
      {hint && <p className="-mt-1 mb-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}
