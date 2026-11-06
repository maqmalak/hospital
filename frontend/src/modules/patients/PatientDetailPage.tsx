import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CreditCard, Eye, FilePlus2, History, Home, ShieldCheck, User } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, humanizeError, useApi } from "@/lib/api";
import { Avatarish, PageHeader, Pill, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { printCard } from "./shared";

interface Patient { name: string; patient_name: string; patient_name_ur?: string; gender: string; age?: number; dob?: string; dob_estimated?: number; phone: string;
  alt_phone?: string; address?: string; city?: string; category: string; cnic_masked?: string; can_reveal_cnic: boolean; blood_group?: string; photo?: string;
  relation_type?: string; guardian_name?: string; branch: string; customer?: string; panel?: string; insurance_provider?: string; employee_id?: string; policy_no?: string;
  allergies?: { allergy: string; severity?: string; reaction?: string }[]; chronic_conditions?: { diagnosis: string; diagnosis_name: string }[];
  consents: { consent_type: string; status: string; recorded_on: string; recorded_by: string }[]; whatsapp_consent: number; sms_consent: number; data_consent: number;
  household_members: { patient: string; patient_name: string; relation: string }[]; disabled: number; merged_into?: string; creation: string; legacy_mr_no?: string }

export default function PatientDetailPage() {
  const { mr = "" } = useParams();
  const { boot, can } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: p, isLoading } = useApi<Patient>("patients.get", { name: mr });
  const [cnic, setCnic] = useState<string | null>(null);
  if (isLoading || !p) return <Skeleton className="h-96 rounded-2xl" />;

  const reveal = async () => {
    try { setCnic(await call<string>("patients.reveal_cnic", { name: mr })); toast("Reveal recorded in the access log", { icon: "🔒" }); }
    catch (e) { toast.error(humanizeError(e)); }
  };
  const consent = async (type: string, status: string) => {
    try { await call("patients.add_consent", { name: mr, consent_type: type, status }); void qc.invalidateQueries({ queryKey: ["patients.get"] }); toast.success("Consent recorded"); }
    catch (e) { toast.error(humanizeError(e)); }
  };
  const info = [["MR No.", p.name], ["Father / Husband Name", `${p.relation_type ?? ""} ${p.guardian_name ?? ""}`], ["Age", p.age != null ? `${p.age} y${p.dob_estimated ? " (estimated)" : ""}` : "–"],
    ["Phone", p.phone], ["Alternate Phone", p.alt_phone], ["Address", [p.address, p.city].filter(Boolean).join(", ")], ["Branch", p.branch], ["Blood group", p.blood_group],
    ["Legacy MR", p.legacy_mr_no], ["Customer", p.customer]].filter(([, v]) => v);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={p.patient_name} icon={User} subtitle={<span>{p.patient_name_ur} {p.patient_name_ur && "·"} <span className="font-mono">{p.name}</span> · {t(p.gender)}</span>}
        actions={<>
          {boot && <Button variant="outline" onClick={() => void printCard(p.name, boot)}><CreditCard className="h-4 w-4" />{t("Patient card")}</Button>}
          {can("/pw-history") && <Link to={`/pw-history/${p.name}`}><Button variant="outline"><History className="h-4 w-4" />{t("Patient history")}</Button></Link>}
          {can("/appointments") && <Link to={`/appointments?patient=${p.name}`}><Button variant="outline"><CalendarClock className="h-4 w-4" />{t("Appointments")}</Button></Link>}
          {can("/opd_slip") && <Link to={`/opd_slip?patient=${p.name}`}><Button variant="primary"><FilePlus2 className="h-4 w-4" />{t("OPD slip")}</Button></Link>}
        </>} />
      {p.disabled ? <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">Disabled{p.merged_into && <> — merged into <Link className="font-semibold underline" to={`/patients/${p.merged_into}`}>{p.merged_into}</Link></>}</div> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section className="lg:col-span-2">
          <div className="flex gap-4"><Avatarish name={p.patient_name} src={p.photo} size={16} />
            <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {info.map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{t(k as string)}</dt><dd className="font-medium">{v}</dd></div>)}
              <div><dt className="text-xs text-muted-foreground">CNIC</dt><dd className="flex items-center gap-2 font-mono">{cnic ?? (p.cnic_masked || "–")}
                {p.cnic_masked && p.can_reveal_cnic && !cnic && <button onClick={() => void reveal()} className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-sans text-xs hover:bg-muted"><Eye className="h-3 w-3" />{t("Reveal")}</button>}</dd></div>
              <div><dt className="text-xs text-muted-foreground">{t("Category")}</dt><dd><Pill value={p.category} /> {p.panel || p.insurance_provider} {p.employee_id || p.policy_no}</dd></div>
            </dl></div>
        </Section>
        <Section title={t("Allergies")}>
          {p.allergies === undefined ? <p className="text-sm text-muted-foreground">Clinical details are not shown for your role.</p> :
            p.allergies.length ? <div className="flex flex-wrap gap-2">{p.allergies.map((a) => <span key={a.allergy} className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">⚠ {a.allergy}{a.severity ? ` · ${a.severity}` : ""}</span>)}</div>
            : <p className="text-sm text-muted-foreground">No known allergies</p>}
          {p.chronic_conditions && p.chronic_conditions.length > 0 && <><div className="mb-1 mt-4 text-xs font-semibold text-muted-foreground">{t("Chronic conditions")}</div>
            {p.chronic_conditions.map((c) => <div key={c.diagnosis} className="text-sm">{c.diagnosis_name} <span className="text-xs text-muted-foreground">({c.diagnosis})</span></div>)}</>}
        </Section>
        <Section title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />{t("Consents")}</span>} className="lg:col-span-2">
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            {([["WhatsApp messages", p.whatsapp_consent], ["SMS messages", p.sms_consent], ["Data processing", p.data_consent]] as const).map(([type, on]) => (
              <div key={type} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"><span>{type}<div className={"text-xs font-semibold " + (on ? "text-emerald-600" : "text-muted-foreground")}>{on ? "Given" : "Not given"}</div></span>
                <Button size="xs" variant="outline" onClick={() => void consent(type, on ? "Withdrawn" : "Given")}>{on ? "Withdraw" : "Record"}</Button></div>))}
          </div>
          <div className="max-h-40 overflow-y-auto text-xs text-muted-foreground">{p.consents.slice().reverse().map((c, i) => <div key={i}>{c.recorded_on?.slice(0, 16)} · {c.consent_type}: <b>{c.status}</b> · {c.recorded_by}</div>)}</div>
        </Section>
        <Section title={<span className="flex items-center gap-2"><Home className="h-4 w-4" />{t("Household")}</span>}>
          {p.household_members.length ? p.household_members.map((m) => <Link key={m.patient} to={`/patients/${m.patient}`} className="flex justify-between border-b border-border/60 py-1.5 text-sm last:border-0 hover:text-primary"><span>{m.patient_name}</span><span className="text-xs text-muted-foreground">{m.relation} · {m.patient}</span></Link>)
            : <p className="text-sm text-muted-foreground">Not linked to a household.</p>}
        </Section>
      </div>
    </div>
  );
}
