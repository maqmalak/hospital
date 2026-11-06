import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Merge } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError } from "@/lib/api";
import { Field, inputCls, PageHeader, PatientPicker, Section, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";

interface Preview { counts: Record<string, number> }

export default function MergePage() {
  const { t } = useTranslation();
  const [keep, setKeep] = useState<PatientHit | null>(null);
  const [dup, setDup] = useState<PatientHit | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (a = keep, b = dup) => { setPreview(null); if (a && b) try { setPreview(await call<Preview>("patients.merge_preview", { survivor: a.name, duplicate: b.name })); } catch (e) { toast.error(humanizeError(e)); } };
  const run = async () => {
    if (!keep || !dup) return;
    setBusy(true);
    try { const r = await call<{ log: string }>("patients.merge", { survivor: keep.name, duplicate: dup.name, confirm_mr: confirm }); toast.success(`Merged · ${r.log}`); setDup(null); setPreview(null); setConfirm(""); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Merge patients" icon={Merge} color="from-stone-500 to-stone-700" subtitle="All visits, appointments, prescriptions, invoices and the ERPNext customer move to the record you keep. This cannot be undone automatically." />
      <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
        <Section title="Duplicate (will be disabled)"><PatientPicker value={dup} onClear={() => { setDup(null); setPreview(null); }} onPick={(p) => { setDup(p); void load(keep, p); }} /></Section>
        <ArrowRight className="mx-auto mt-12 h-6 w-6 text-muted-foreground rtl:rotate-180" />
        <Section title="Keep (survivor)"><PatientPicker value={keep} onClear={() => { setKeep(null); setPreview(null); }} onPick={(p) => { setKeep(p); void load(p, dup); }} /></Section>
      </div>
      {preview && dup && (
        <Section title="Records that will move" className="mt-4">
          {Object.keys(preview.counts).length ? <div className="grid gap-2 sm:grid-cols-3">{Object.entries(preview.counts).map(([k, v]) => <div key={k} className="rounded-xl bg-muted p-3"><div className="text-2xl font-bold">{v}</div><div className="text-xs text-muted-foreground">{k}</div></div>)}</div>
            : <p className="text-sm text-muted-foreground">The duplicate has no linked records; only the patient and customer will be merged.</p>}
          <Field label={`Type ${dup.name} to confirm`} className="mt-4 max-w-sm"><input className={inputCls + " font-mono"} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Button variant="destructive" className="mt-3" disabled={confirm.trim().toUpperCase() !== dup.name} loading={busy} onClick={() => void run()}><Merge className="h-4 w-4" />{t("Merge patients")}</Button>
        </Section>
      )}
    </div>
  );
}
