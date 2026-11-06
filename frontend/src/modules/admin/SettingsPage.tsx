import { useEffect, useState } from "react";
import { Plus, Save, Settings, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Field, inputCls, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface F { fieldname: string; label: string; fieldtype: string; options?: string; description?: string }
interface S { doc: Record<string, unknown>; tabs: { label: string; fieldname: string; fields: F[] }[] }
const TABLE_COLS: Record<string, string[]> = {
  page_access: ["route", "label", "roles", "module_switch"], discount_rules: ["role", "billing_type", "max_percent", "max_amount"], discount_approvers: ["role"],
  pos_profiles: ["billing_type", "branch", "pos_profile"], printer_map: ["branch", "device", "receipt_printer", "label_printer", "a4_printer"], branch_overrides: ["branch", "setting", "value"],
};

export default function SettingsPage() {
  const { reload } = useAuth();
  const { data, refetch } = useApi<S>("admin.get_settings");
  const [doc, setDoc] = useState<Record<string, unknown>>({});
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setDoc(data.doc); }, [data]);
  if (!data) return null;
  const set = (k: string, v: unknown) => setDoc((d) => ({ ...d, [k]: v }));
  const save = async () => { setBusy(true); try { await call("admin.save_settings", { data: doc }); toast.success("Settings saved"); void refetch(); void reload(); } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); } };
  const t = data.tabs[tab];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Clinic settings" icon={Settings} color="from-gray-500 to-gray-700" subtitle="Every business rule lives here; branch overrides on the General tab" actions={<Button variant="save" loading={busy} onClick={() => void save()}><Save className="h-4 w-4" />Save</Button>} />
      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">{data.tabs.map((x, i) => <button key={x.fieldname} onClick={() => setTab(i)} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-start text-sm font-semibold", tab === i ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{x.label}</button>)}</nav>
        <Section>
          <div className="grid gap-4 sm:grid-cols-2">
            {t.fields.map((f) => f.fieldtype === "Table" ? (
              <div key={f.fieldname} className="sm:col-span-2"><TableEditor label={f.label} cols={TABLE_COLS[f.fieldname] ?? []} rows={(doc[f.fieldname] as Record<string, unknown>[]) ?? []} onChange={(r) => set(f.fieldname, r)} /></div>
            ) : f.fieldtype === "Check" ? (
              <label key={f.fieldname} className="flex items-start gap-3 rounded-xl border border-border p-3"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-teal-600" checked={!!doc[f.fieldname]} onChange={(e) => set(f.fieldname, e.target.checked ? 1 : 0)} />
                <span><span className="block text-sm font-semibold">{f.label}</span>{f.description && <span className="text-xs text-muted-foreground">{f.description}</span>}</span></label>
            ) : (
              <Field key={f.fieldname} label={f.label} hint={f.description} className={["Small Text", "Text"].includes(f.fieldtype) ? "sm:col-span-2" : ""}>
                {f.fieldtype === "Select" ? <select className={inputCls} value={String(doc[f.fieldname] ?? "")} onChange={(e) => set(f.fieldname, e.target.value)}>{(f.options ?? "").split("\n").map((o) => <option key={o}>{o}</option>)}</select>
                  : ["Small Text", "Text"].includes(f.fieldtype) ? <textarea className={inputCls + " h-20 py-2"} value={String(doc[f.fieldname] ?? "")} onChange={(e) => set(f.fieldname, e.target.value)} />
                  : <input className={inputCls} type={["Int", "Float", "Currency", "Percent"].includes(f.fieldtype) ? "number" : f.fieldtype === "Time" ? "time" : "text"} value={String(doc[f.fieldname] ?? "")}
                    onChange={(e) => set(f.fieldname, ["Int", "Float", "Currency", "Percent"].includes(f.fieldtype) ? Number(e.target.value) : e.target.value)} />}
              </Field>))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function TableEditor({ label, cols, rows, onChange }: { label: string; cols: string[]; rows: Record<string, unknown>[]; onChange: (r: Record<string, unknown>[]) => void }) {
  return (
    <div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">{label}</span><button onClick={() => onChange([...rows, {}])} className="flex items-center gap-1 text-xs font-semibold text-primary"><Plus className="h-3 w-3" />Add row</button></div>
      <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-sm"><thead><tr className="bg-muted text-xs text-muted-foreground">{cols.map((c) => <th key={c} className="px-2 py-1.5 text-start">{c.replace(/_/g, " ")}</th>)}<th /></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{cols.map((c) => <td key={c} className="p-1"><input className="h-8 w-full rounded border border-transparent bg-transparent px-2 hover:border-input focus:border-primary" value={String(r[c] ?? "")} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c]: e.target.value } : x)))} /></td>)}
          <td className="w-8"><button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="p-1 text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>)}</tbody></table></div></div>
  );
}
