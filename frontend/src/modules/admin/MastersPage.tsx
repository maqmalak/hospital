import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, BedDouble, Building2, CalendarOff, CalendarX, FlaskConical, HeartPulse, Pill as PillIcon, Pencil, Plus, Save, Scissors, Search, ShieldAlert, Stethoscope, Trash2, X, type LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { useAuth } from "@/lib/auth";
import { Empty, Field, inputCls, PageHeader, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/utils/cn";
import { toUrdu } from "@/lib/urdu";

type FT = "Data" | "Int" | "Float" | "Currency" | "Check" | "Select" | "Link" | "Date" | "Time" | "Small Text" | "Color";
interface Fd { f: string; label: string; t: FT; options?: string; reqd?: boolean; list?: boolean }
interface Child { field: string; label: string; doctype: string; cols: Fd[] }
interface Kind { key: string; label: string; doctype: string; icon: LucideIcon; fields: Fd[]; filters?: unknown[]; children?: Child[]; title: string; defaults?: Record<string, unknown>; roles?: string[];
  /** quick filter shown above the list (a Select or Link field) */ facet?: string; /** subtitle under the title column */ sub?: string }

const DAYS = "Monday\nTuesday\nWednesday\nThursday\nFriday\nSaturday\nSunday";
export const KINDS: Kind[] = [
  { key: "doctors", label: "Doctors", doctype: "Doctor", icon: Stethoscope, title: "doctor_name", fields: [
    { f: "doctor_name", label: "Name", t: "Data", reqd: true, list: true }, { f: "doctor_name_ur", label: "Name (Urdu)", t: "Data" },
    { f: "specialization", label: "Specialization", t: "Link", options: "Specialization", list: true }, { f: "department", label: "Department", t: "Link", options: "Medical Department" },
    { f: "doctor_type", label: "Type", t: "Select", options: "Internal\nVisiting\nExternal Referring", list: true }, { f: "branch", label: "Branch", t: "Link", options: "Branch", list: true },
    { f: "default_fee", label: "Fee", t: "Currency", list: true }, { f: "follow_up_fee", label: "Follow-up fee", t: "Currency" }, { f: "revisit_days", label: "Revisit days", t: "Int" },
    { f: "consultation_room", label: "Room", t: "Data" }, { f: "color", label: "Colour", t: "Color" }, { f: "user", label: "Login user", t: "Link", options: "User" },
    { f: "registration_no", label: "PMDC Registration No.", t: "Data" }, { f: "qualification", label: "Qualification", t: "Data" }, { f: "show_license", label: "Show license on prints", t: "Check" },
    { f: "slot_minutes", label: "Slot minutes", t: "Int" }, { f: "is_active", label: "Active", t: "Check", list: true }],
    children: [{ field: "schedule", label: "Weekly schedule", doctype: "Doctor Schedule", cols: [{ f: "day", label: "Day", t: "Select", options: DAYS }, { f: "start_time", label: "Start", t: "Time" }, { f: "end_time", label: "End", t: "Time" }, { f: "branch", label: "Branch", t: "Link", options: "Branch" }] }],
    defaults: { is_active: 1, doctor_type: "Internal", show_license: 1 } },
  { key: "leave", label: "Doctor leave", doctype: "Doctor Leave", icon: CalendarOff, title: "doctor_name", fields: [{ f: "doctor", label: "Doctor", t: "Link", options: "Doctor", reqd: true, list: true }, { f: "from_date", label: "From", t: "Date", reqd: true, list: true }, { f: "to_date", label: "To", t: "Date", reqd: true, list: true }, { f: "reason", label: "Reason", t: "Small Text" }] },
  { key: "blocked", label: "Blocked dates", doctype: "Blocked Date", icon: CalendarX, title: "blocked_date", fields: [{ f: "blocked_date", label: "Date", t: "Date", reqd: true, list: true }, { f: "branch", label: "Branch (empty = all)", t: "Link", options: "Branch", list: true }, { f: "reason", label: "Reason", t: "Data", list: true }] },
  { key: "medicines", label: "Medicines", doctype: "Item", icon: PillIcon, title: "item_name", filters: [["hv_is_medicine", "=", 1]], fields: [
    { f: "item_code", label: "Code", t: "Data", reqd: true }, { f: "item_name", label: "Brand name", t: "Data", reqd: true, list: true }, { f: "hv_generic", label: "Generic", t: "Link", options: "Generic Name", list: true },
    { f: "hv_strength", label: "Strength", t: "Data", list: true }, { f: "hv_dosage_form", label: "Form", t: "Select", options: "\nTablet\nCapsule\nSyrup\nSuspension\nInjection\nInfusion\nCream\nOintment\nDrops\nInhaler\nSachet\nSuppository\nOther", list: true },
    { f: "hv_max_daily_dose", label: "Max daily dose (units)", t: "Float" }, { f: "hv_prescription_required", label: "Prescription required", t: "Check", list: true }],
    defaults: { hv_is_medicine: 1, item_group: "Medicines", stock_uom: "Nos", is_stock_item: 1, has_batch_no: 1, create_new_batch: 1, has_expiry_date: 1, hv_billing_type: "Medicine" } },
  { key: "generics", label: "Generics", doctype: "Generic Name", icon: FlaskConical, title: "generic_name", fields: [{ f: "generic_name", label: "Generic", t: "Data", reqd: true, list: true }, { f: "drug_class", label: "Drug class", t: "Link", options: "Drug Class", list: true }] },
  { key: "classes", label: "Drug classes", doctype: "Drug Class", icon: FlaskConical, title: "class_name", fields: [{ f: "class_name", label: "Class", t: "Data", reqd: true, list: true }, { f: "duplicate_therapy", label: "Warn on duplicate therapy", t: "Check", list: true }] },
  { key: "allergies", label: "Allergies", doctype: "Allergy", icon: ShieldAlert, title: "allergy_name", fields: [{ f: "allergy_name", label: "Allergy", t: "Data", reqd: true, list: true }, { f: "allergy_type", label: "Type", t: "Select", options: "Drug\nFood\nOther", list: true }],
    children: [{ field: "generics", label: "Linked generics", doctype: "Allergy Generic", cols: [{ f: "generic", label: "Generic", t: "Link", options: "Generic Name" }] }, { field: "drug_classes", label: "Linked drug classes", doctype: "Allergy Drug Class", cols: [{ f: "drug_class", label: "Drug class", t: "Link", options: "Drug Class" }] }] },
  { key: "interactions", label: "Drug interactions", doctype: "Drug Interaction", icon: AlertTriangle, title: "generic_a", fields: [{ f: "generic_a", label: "Generic A", t: "Link", options: "Generic Name", reqd: true, list: true }, { f: "generic_b", label: "Generic B", t: "Link", options: "Generic Name", reqd: true, list: true },
    { f: "severity", label: "Severity", t: "Select", options: "Minor\nModerate\nMajor\nContraindicated", reqd: true, list: true }, { f: "clinical_note", label: "Clinical note", t: "Small Text" }, { f: "source", label: "Source list", t: "Data", list: true }] },
  { key: "diagnoses", label: "ICD-10 diagnoses", doctype: "Diagnosis", icon: HeartPulse, title: "diagnosis_name", fields: [{ f: "icd_code", label: "ICD-10 code", t: "Data", reqd: true, list: true }, { f: "diagnosis_name", label: "Diagnosis", t: "Data", reqd: true, list: true }, { f: "category", label: "Category", t: "Data", list: true }] },
  { key: "departments", label: "Departments", doctype: "Medical Department", icon: Building2, title: "department_name", fields: [{ f: "department_name", label: "Department", t: "Data", reqd: true, list: true }, { f: "department_name_ur", label: "Name (Urdu)", t: "Data", list: true }, { f: "color", label: "Colour", t: "Color" }, { f: "is_active", label: "Active", t: "Check", list: true }], defaults: { is_active: 1 } },
  { key: "specializations", label: "Specializations", doctype: "Specialization", icon: Activity, title: "specialization", fields: [{ f: "specialization", label: "Specialization", t: "Data", reqd: true, list: true }, { f: "specialization_ur", label: "Name (Urdu)", t: "Data", list: true }, { f: "department", label: "Department", t: "Link", options: "Medical Department", list: true }] },
  { key: "wards", label: "Wards", doctype: "Ward", icon: BedDouble, title: "ward_name", fields: [{ f: "ward_name", label: "Ward", t: "Data", reqd: true, list: true }, { f: "ward_name_ur", label: "Name (Urdu)", t: "Data" },
    { f: "ward_type", label: "Type", t: "Select", options: "General\nSemi-Private\nPrivate\nICU\nCCU\nNICU\nNursery\nHDU\nEmergency\nMaternity\nDay Care", list: true }, { f: "gender", label: "Gender", t: "Select", options: "Mixed\nMale\nFemale\nChildren" },
    { f: "branch", label: "Branch", t: "Link", options: "Branch", reqd: true, list: true }, { f: "floor", label: "Floor", t: "Data" }, { f: "bed_charge_per_day", label: "Bed charge / day", t: "Currency", list: true }, { f: "nursing_station", label: "Nursing station", t: "Data" }, { f: "color", label: "Colour", t: "Color", list: true }, { f: "is_active", label: "Active", t: "Check", list: true }], defaults: { is_active: 1 }, facet: "ward_type", sub: "floor" },
  { key: "beds", label: "Beds", doctype: "Hospital Bed", icon: BedDouble, title: "bed_no", fields: [{ f: "bed_no", label: "Bed no.", t: "Data", reqd: true, list: true }, { f: "ward", label: "Ward", t: "Link", options: "Ward", reqd: true, list: true }, { f: "room", label: "Room", t: "Data" },
    { f: "bed_type", label: "Bed type", t: "Select", options: "Standard\nElectric\nICU\nVentilator\nCradle\nCouch\nTrolley", list: true }, { f: "daily_rate", label: "Daily rate (empty = ward)", t: "Currency" }, { f: "has_oxygen", label: "Oxygen", t: "Check" }, { f: "has_monitor", label: "Monitor", t: "Check" },
    { f: "pos_x", label: "Map X (0–100)", t: "Int" }, { f: "pos_y", label: "Map Y (0–100)", t: "Int" }, { f: "status", label: "Status", t: "Data", list: true }, { f: "is_active", label: "Active", t: "Check", list: true }], defaults: { is_active: 1, bed_type: "Standard" }, facet: "ward", sub: "room" },
  { key: "procedures", label: "Procedures", doctype: "Procedure Type", icon: Scissors, title: "procedure_name", facet: "category", sub: "department", fields: [
    { f: "procedure_name", label: "Procedure", t: "Data", reqd: true, list: true }, { f: "department", label: "Department", t: "Link", options: "Medical Department" },
    { f: "category", label: "Category", t: "Select", options: "Minor\nMajor\nBedside\nDiagnostic\nDelivery", reqd: true, list: true }, { f: "price", label: "Procedure fee", t: "Currency", list: true },
    { f: "theatre_charge", label: "Theatre charge", t: "Currency", list: true }, { f: "anesthesia_charge", label: "Anaesthesia", t: "Currency" },
    { f: "requires_consent", label: "Consent", t: "Check", list: true }, { f: "requires_preauth", label: "Needs insurer pre-authorization", t: "Check" }, { f: "is_active", label: "Active", t: "Check", list: true }],
    defaults: { is_active: 1, category: "Minor", requires_consent: 1 } },
];

export default function MastersPage({ fixed }: { fixed?: string }) {
  const { kind: k } = useParams();
  const key = fixed || k || "";
  const kind = KINDS.find((x) => x.key === key);
  if (!kind) return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Clinical masters" icon={PillIcon} color="from-lime-500 to-green-600" subtitle="Reference data used by registration, prescriptions, appointments, wards and procedures" />
      <MasterTabs active="" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{KINDS.map((x) => <Link key={x.key} to={x.key === "doctors" ? "/doctors" : `/masters/${x.key}`} className="hover-outline flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"><x.icon className="h-5 w-5 text-primary" /><span className="font-semibold">{x.label}</span></Link>)}</div>
    </div>
  );
  return <MasterList key={kind.key} kind={kind} />;
}

const BED_TONE: Record<string, string> = { Available: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200", Occupied: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  Reserved: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200", Cleaning: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200", Maintenance: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300" };

/** Tabs across every master — always visible above the list. */
function MasterTabs({ active }: { active: string }) {
  return (
    <nav aria-label="Masters" className="mb-4">
      <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-sm" role="tablist">
        {KINDS.map((x) => { const on = x.key === active; return (
          <Link key={x.key} to={x.key === "doctors" ? "/doctors" : `/masters/${x.key}`} role="tab" aria-selected={on}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition", on ? "tab-gold" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <x.icon className="h-4 w-4" />{x.label}</Link>); })}
      </div>
    </nav>
  );
}

function Cell({ f, r }: { f: Fd; r: Record<string, unknown> }) {
  const v = r[f.f];
  if (f.t === "Check") return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold", v ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400")}>
    {f.f === "is_active" ? (v ? "Active" : "Inactive") : v ? "Yes" : "No"}</span>;
  if (f.t === "Currency") return <span className="tabular-nums font-semibold">{v ? `Rs ${Number(v).toLocaleString("en-PK")}` : "—"}</span>;
  if (f.t === "Color") return v ? <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded-full ring-2 ring-white shadow dark:ring-white/10" style={{ background: String(v) }} /><span className="font-mono text-xs text-muted-foreground">{String(v)}</span></span> : <span className="text-muted-foreground">—</span>;
  if (f.f === "status") return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold", BED_TONE[String(v)] ?? "bg-muted")}>{String(v ?? "—")}</span>;
  if (f.t === "Select") return v ? <span className="inline-flex rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{String(v)}</span> : <span className="text-muted-foreground">—</span>;
  if (f.f.endsWith("_ur")) return <span className="font-urdu text-base" dir="rtl">{String(v ?? "")}</span>;
  return <span>{String(v ?? "")}</span>;
}

function MasterList({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [q, setQ] = useState("");
  const [facet, setFacet] = useState("");
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [del, setDel] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const cols = kind.fields.filter((f) => f.list);
  const titleF = cols.find((f) => f.f === kind.title) ?? cols[0];
  const rest = cols.filter((f) => f !== titleF);
  const listFields = Array.from(new Set(["name", kind.title, ...(kind.sub ? [kind.sub] : []), ...(kind.facet ? [kind.facet] : []), ...cols.map((f) => f.f), ...(kind.doctype === "Ward" ? ["color"] : [])]));
  const facetF = kind.fields.find((f) => f.f === kind.facet);
  const { data = [], isLoading } = useQuery({ queryKey: ["master", kind.doctype, q, facet], queryFn: () => getCall<Record<string, unknown>[]>("frappe.client.get_list", {
    doctype: kind.doctype, fields: JSON.stringify(listFields), filters: JSON.stringify([...(kind.filters ?? []), ...(facet && kind.facet ? [[kind.facet, "=", facet]] : [])]),
    or_filters: q ? JSON.stringify([[kind.title, "like", `%${q}%`], ["name", "like", `%${q}%`]]) : undefined, limit_page_length: 500, order_by: kind.doctype === "Hospital Bed" ? "ward asc, bed_no asc" : "modified desc" }) });
  const { data: facetOpts = [] } = useQuery({ enabled: facetF?.t === "Link", queryKey: ["facet", facetF?.options], queryFn: () => getCall<{ value: string }[]>("frappe.desk.search.search_link", { doctype: facetF!.options, txt: "", page_length: 200 }).then((r) => r.map((x) => x.value)) });
  const facetList = facetF?.t === "Select" ? (facetF.options ?? "").split("\n").filter(Boolean) : facetOpts;
  const canDelete = hasRole("PW Admin");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["master", kind.doctype] });
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await postCall("frappe.client.delete", { doctype: kind.doctype, name: String(del.name) });
      toast.success(`${String(del[kind.title] ?? del.name)} deleted`); if (open === del.name) setOpen(null); setDel(null); refresh();
    } catch (e) {
      const m = humanizeError(e);
      toast.error(/link|linked|cannot delete|LinkExists/i.test(m) ? `${String(del[kind.title] ?? del.name)} is used by other records — open it and untick "Active" instead.` : m, { duration: 7000 });
      setDel(null);
    } finally { setBusy(false); }
  };
  const Icon = kind.icon;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={kind.label} icon={kind.icon} color="from-lime-500 to-green-600" subtitle={<span><Link to="/masters" className="text-primary">Masters</Link> · {data.length} {data.length === 1 ? "record" : "records"}</span>}
        actions={<Button variant="primary" onClick={() => setOpen("new")}><Plus className="h-4 w-4" />New {kind.label.replace(/s$/, "").toLowerCase()}</Button>} />
      <MasterTabs active={kind.key} />
      <div className={cn("grid gap-4", open && "lg:grid-cols-[minmax(0,1fr)_440px]")}>
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl border border-input bg-[hsl(var(--input-bg))] px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <Search className="h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind.label.toLowerCase()}`} className="h-10 flex-1 bg-transparent text-sm outline-none" />
              {q && <button onClick={() => setQ("")} aria-label="Clear search"><X className="h-4 w-4 text-muted-foreground" /></button>}</label>
            {facetF && <select aria-label={facetF.label} className={cn(inputCls, "w-auto min-w-44")} value={facet} onChange={(e) => setFacet(e.target.value)}>
              <option value="">All {facetF.label.toLowerCase()}s</option>{facetList.map((o) => <option key={o}>{o}</option>)}</select>}
          </div>
          {isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/60" />)}</div>
            : data.length ? <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur"><tr>
                <th className="px-4 py-2.5 text-start">{titleF?.label}</th>{rest.map((f) => <th key={f.f} className={cn("px-3 text-start", f.t === "Currency" && "text-end")}>{f.label}</th>)}<th className="w-24 px-3 text-end">Actions</th></tr></thead>
              <tbody>{data.map((r) => { const on = open === r.name; const occupied = kind.doctype === "Hospital Bed" && r.status === "Occupied"; return (
                <tr key={String(r.name)} onClick={() => setOpen(String(r.name))} className={cn("group cursor-pointer border-t border-border/60 transition", on ? "bg-primary/[0.07]" : "hover:bg-muted/40", r.is_active === 0 && "opacity-60")}>
                  <td className="px-4 py-2.5"><div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: String(r.color || "") || undefined }}>
                      {r.color ? <Icon className="h-4 w-4" /> : <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>}</span>
                    <div className="min-w-0"><div className="truncate font-semibold">{String(r[kind.title] ?? r.name)}</div>
                      {kind.sub && r[kind.sub] ? <div className="truncate text-xs text-muted-foreground">{String(r[kind.sub!] ?? "")}</div> : null}</div></div></td>
                  {rest.map((f) => <td key={f.f} className={cn("px-3 py-2.5", f.t === "Currency" && "text-end")}><Cell f={f} r={r} /></td>)}
                  <td className="px-3 py-2.5"><div className="flex justify-end gap-1 opacity-70 transition group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); setOpen(String(r.name)); }} className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary" aria-label={`Edit ${String(r[kind.title] ?? r.name)}`} title="Edit"><Pencil className="h-4 w-4" /></button>
                    {canDelete && <button onClick={(e) => { e.stopPropagation(); if (occupied) { toast.error("This bed is occupied — discharge or transfer the patient first."); return; } setDel(r); }}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600" aria-label={`Delete ${String(r[kind.title] ?? r.name)}`} title="Delete"><Trash2 className="h-4 w-4" /></button>}
                  </div></td></tr>); })}</tbody></table></div>
            : <div className="p-6"><Empty title={q || facet ? "No match" : `No ${kind.label.toLowerCase()} yet`} hint={q || facet ? "Change the search or filter." : `Add the first one with “New”.`} icon={kind.icon} /></div>}
        </div>
        {open && <Editor kind={kind} name={open} onClose={() => setOpen(null)} onSaved={refresh} onDelete={canDelete && open !== "new" ? () => setDel(data.find((r) => r.name === open) ?? { name: open }) : undefined} />}
      </div>
      <ConfirmDialog open={!!del} destructive loading={busy} title={`Delete ${String(del?.[kind.title] ?? del?.name ?? "")}?`} confirmLabel="Delete"
        description={`This permanently removes the ${kind.label.replace(/s$/, "").toLowerCase()}. If it is already used by admissions, bills or other records, it cannot be deleted — mark it inactive instead.`}
        onConfirm={() => void remove()} onClose={() => setDel(null)} />
    </div>
  );
}

export function Editor({ kind, name, onClose, onSaved, onDelete }: { kind: Kind; name: string; onClose: () => void; onSaved: () => void; onDelete?: () => void }) {
  const { hasRole } = useAuth();
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (name === "new") setDoc({ doctype: kind.doctype, ...(kind.defaults ?? {}) });
    else void getCall<Record<string, unknown>>("frappe.client.get", { doctype: kind.doctype, name }).then(setDoc).catch((e) => toast.error(humanizeError(e)));
  }, [name, kind]);
  if (!doc) return <Section>Loading…</Section>;
  const set = (k: string, v: unknown) => setDoc((d) => {
    const next: Record<string, unknown> = { ...d!, [k]: v };
    // English name → Urdu name, while the Urdu field is empty or still the auto-filled value
    const ur = `${k}_ur`;
    if (typeof v === "string" && kind.fields.some((f) => f.f === ur)) {
      const cur = String(d?.[ur] ?? "");
      if (!cur || cur === toUrdu(String(d?.[k] ?? ""))) next[ur] = toUrdu(v);
    }
    return next;
  });
  const save = async () => {
    setBusy(true);
    try {
      const saved = await postCall<Record<string, unknown>>(name === "new" ? "frappe.client.insert" : "frappe.client.save", { doc: JSON.stringify(doc) });
      setDoc(saved); toast.success("Saved"); onSaved();
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Section title={name === "new" ? `New ${kind.label.replace(/s$/, "").toLowerCase()}` : String(doc[kind.title] ?? name)} actions={<button onClick={onClose} className="p-1"><X className="h-4 w-4" /></button>} className="lg:sticky lg:top-0 lg:self-start">
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pe-1">
        {kind.fields.filter((f) => !(f.f === "status" && kind.doctype === "Hospital Bed")).map((f) => <FieldInput key={f.f} fd={f} value={doc[f.f]} onChange={(v) => set(f.f, v)} disabled={name !== "new" && (f.f === "item_code" || f.f === "icd_code")} />)}
        {kind.children?.map((c) => {
          const rows = (doc[c.field] as Record<string, unknown>[]) ?? [];
          return (
            <div key={c.field}><div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">{c.label}<button onClick={() => set(c.field, [...rows, { doctype: c.doctype }])} className="flex items-center gap-1 text-primary"><Plus className="h-3 w-3" />Add</button></div>
              {rows.map((r, i) => <div key={i} className="mb-1.5 flex items-end gap-1.5">{c.cols.map((col) => <div key={col.f} className="flex-1"><FieldInput fd={col} compact value={r[col.f]} onChange={(v) => set(c.field, rows.map((x, j) => (j === i ? { ...x, [col.f]: v } : x)))} /></div>)}
                <button onClick={() => set(c.field, rows.filter((_, j) => j !== i))} className="pb-2 text-destructive"><Trash2 className="h-4 w-4" /></button></div>)}</div>);
        })}
      </div>
      {kind.doctype === "Drug Interaction" && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Interaction data must come from the reference list the clinic's pharmacist chose. Demo rows are marked "DEMO DATA".</p>}
      <div className="mt-4 flex gap-2">
        {onDelete && <Button variant="danger" onClick={onDelete} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>}
        <Button variant="save" className="flex-1" loading={busy} disabled={!hasRole("PW Admin", "PW Doctor", "PW Reviewer", "PW Receptionist", "PW Store Keeper")} onClick={() => void save()}><Save className="h-4 w-4" />Save</Button>
      </div>
    </Section>
  );
}

function FieldInput({ fd, value, onChange, disabled, compact }: { fd: Fd; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; compact?: boolean }) {
  const [opts, setOpts] = useState<string[]>([]);
  useEffect(() => {
    if (fd.t !== "Link") return;
    void getCall<{ value: string; description?: string }[]>("frappe.desk.search.search_link", { doctype: fd.options, txt: "", page_length: 200 }).then((r) => setOpts(r.map((x) => x.value))).catch(() => setOpts([]));
  }, [fd]);
  const label = compact ? undefined : fd.label;
  const input = fd.t === "Check" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={!!value} onChange={(e) => onChange(e.target.checked ? 1 : 0)} className="h-4 w-4 accent-teal-600" />{fd.label}</label>
    : fd.t === "Select" ? <select disabled={disabled} className={inputCls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>{(fd.options ?? "").split("\n").map((o) => <option key={o}>{o}</option>)}</select>
    : fd.t === "Link" ? <><input list={`l-${fd.f}-${fd.options}`} disabled={disabled} className={inputCls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={compact ? fd.label : undefined} /><datalist id={`l-${fd.f}-${fd.options}`}>{opts.map((o) => <option key={o} value={o} />)}</datalist></>
    : fd.t === "Small Text" ? <textarea disabled={disabled} className={inputCls + " h-20 py-2"} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    : fd.t === "Color" ? <input type="color" disabled={disabled} className="h-10 w-20 rounded-lg border border-input" value={String(value || "#0d9488")} onChange={(e) => onChange(e.target.value)} />
    : fd.f.endsWith("_ur") ? <input disabled={disabled} lang="ur" dir="rtl" className={inputCls + " urdu-input"} placeholder="اردو میں لکھیں" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    : <input disabled={disabled} className={inputCls} placeholder={compact ? fd.label : undefined} type={["Int", "Float", "Currency"].includes(fd.t) ? "number" : fd.t === "Date" ? "date" : fd.t === "Time" ? "time" : "text"} value={String(value ?? "")}
      onChange={(e) => onChange(["Int", "Float", "Currency"].includes(fd.t) ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />;
  if (fd.t === "Check" || !label) return input;
  return <Field label={label} required={fd.reqd}>{input}</Field>;
}
