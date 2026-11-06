import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserPlus, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getCall } from "@/services/frappe";
import { inputCls, PageHeader, PatientPicker, Pill, Section } from "@/components/common";
import { Button } from "@/components/ui/button";

interface P { name: string; patient_name: string; patient_name_ur?: string; gender: string; phone: string; category: string; city: string; creation: string; cnic_masked?: string }

export default function PatientsPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const { data = [], isFetching } = useQuery({
    queryKey: ["patients", category, page],
    queryFn: () => getCall<P[]>("frappe.client.get_list", { doctype: "Patient", fields: JSON.stringify(["name", "patient_name", "patient_name_ur", "gender", "phone", "category", "city", "creation", "cnic_masked"]),
      filters: JSON.stringify([["disabled", "=", 0], ...(category ? [["category", "=", category]] : [])]), order_by: "creation desc", limit_start: page * 50, limit_page_length: 50 }),
  });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Patients" icon={Users} color="from-slate-500 to-slate-700" actions={<Link to="/registration"><Button variant="primary"><UserPlus className="h-4 w-4" />{t("Register patient")}</Button></Link>} />
      <Section className="mb-4"><div className="grid gap-3 sm:grid-cols-[1fr_200px]"><PatientPicker onPick={(p) => nav(`/patients/${p.name}`)} />
        <select className={inputCls + " h-11"} value={category} onChange={(e) => { setCategory(e.target.value); setPage(0); }}><option value="">All categories</option>{["Normal", "Panel", "Insurance", "Staff", "Welfare"].map((c) => <option key={c}>{c}</option>)}</select></div></Section>
      <Section>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">{t("MR No.")}</th><th className="text-start">{t("Name")}</th><th className="text-start">{t("Gender")}</th><th className="text-start">{t("Phone")}</th><th className="text-start">CNIC</th><th className="text-start">{t("Category")}</th><th className="text-start">Registered</th></tr></thead>
          <tbody>{data.map((p) => (
            <tr key={p.name} onClick={() => nav(`/patients/${p.name}`)} className="cursor-pointer border-b border-border/60 hover:bg-muted/50">
              <td className="py-2 font-mono text-xs">{p.name}</td><td className="font-medium">{p.patient_name} <span className="text-muted-foreground">{p.patient_name_ur}</span></td>
              <td>{t(p.gender)}</td><td>{p.phone}</td><td className="font-mono text-xs">{p.cnic_masked}</td><td><Pill value={p.category} /></td><td className="text-xs text-muted-foreground">{p.creation.slice(0, 10)}</td></tr>))}</tbody>
        </table></div>
        <div className="mt-3 flex items-center justify-between text-sm"><span className="text-muted-foreground">{isFetching ? "…" : `${page * 50 + 1}–${page * 50 + data.length}`}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>{t("Back")}</Button><Button size="sm" variant="outline" disabled={data.length < 50} onClick={() => setPage((p) => p + 1)}>{t("Next")}</Button></div></div>
      </Section>
    </div>
  );
}
