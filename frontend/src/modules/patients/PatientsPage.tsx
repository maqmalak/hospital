import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { keepPreviousData } from "@tanstack/react-query";
import { BedDouble, CalendarClock, ChevronLeft, ChevronRight, CreditCard, Droplet, FilePlus2, History, LayoutGrid, List, MapPin, MessageCircle,
  Phone, Search, ShieldAlert, Stethoscope, UserPlus, Users, UserRoundCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { Empty, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import { printCard } from "./shared";

interface P { name: string; patient_name: string; patient_name_ur?: string; gender: string; age?: number; phone?: string; city?: string; category: string;
  photo?: string; branch: string; blood_group?: string | null; cnic_masked?: string; creation: string; panel?: string; insurance_provider?: string;
  whatsapp_consent: number; visits: number; last_visit?: string; allergies: number | null; next_appointment?: string; bed?: string }
interface Board { rows: P[]; total: number; stats: Record<string, number> }

const PAGE = 24;
const GRAD: Record<string, string> = {
  Male: "linear-gradient(135deg,#0ea5e9 0%,#1e3a8a 100%)", Female: "linear-gradient(135deg,#ec4899 0%,#7e22ce 100%)", Other: "linear-gradient(135deg,#14b8a6 0%,#0f3d3a 100%)",
};
const CAT: Record<string, string> = {
  Normal: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300", Panel: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  Insurance: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300", Staff: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  Welfare: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
};
const ago = (d?: string) => {
  if (!d) return "Never";
  const days = Math.round((Date.now() - new Date(d + "T00:00").getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 30 ? `${days} days ago` : days < 365 ? `${Math.round(days / 30)} mo ago` : `${Math.round(days / 365)} y ago`;
};
const initials = (n: string) => n.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function PatientsPage() {
  const { t, i18n } = useTranslation();
  const { boot, can } = useAuth();
  const nav = useNavigate();
  const [view, setView] = useState<"cards" | "list">(() => { try { return (localStorage.getItem("hv.patients.view") as "cards" | "list") || "cards"; } catch { return "cards"; } });
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  useEffect(() => { const id = setTimeout(() => { setQuery(q); setPage(0); }, 250); return () => clearTimeout(id); }, [q]);
  const { data, isLoading, isFetching } = useApi<Board>("patients.board", { q: query, category, gender, sort, start: page * PAGE, limit: PAGE }, { placeholderData: keepPreviousData });
  const rows = data?.rows ?? [];
  const s = data?.stats ?? {};
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const setV = (v: "cards" | "list") => { setView(v); try { localStorage.setItem("hv.patients.view", v); } catch { /* ignore */ } };
  const name = (p: P) => (i18n.language === "ur" && p.patient_name_ur ? p.patient_name_ur : p.patient_name);
  const go = (path: string) => (e: MouseEvent) => { e.stopPropagation(); nav(path); };
  const chip = (active: boolean) => cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors", active ? "bg-gradient-to-r from-teal-600 to-emerald-500 text-white shadow-sm" : "bg-muted hover:bg-accent");

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="relative mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-teal-800 via-teal-700 to-emerald-500 p-5 text-white shadow-lg sm:p-6">
        <div className="absolute -end-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-24 start-1/4 h-56 w-96 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><Users className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1"><h1 className="text-2xl font-extrabold">{t("Patients")}</h1><p className="text-sm text-white/80">{total.toLocaleString()} records · search by name, MR no., phone or legacy MR</p></div>
          {can("/registration") && <Link to="/registration"><Button className="bg-white text-teal-800 shadow-md hover:bg-white/90"><UserPlus className="h-4 w-4" />{t("Register patient")}</Button></Link>}
        </div>
        <label className="relative mt-4 flex items-center gap-2 rounded-2xl bg-white/95 px-4 text-slate-900 shadow-lg dark:bg-slate-900/90 dark:text-white">
          <Search className="h-5 w-5 text-teal-700 dark:text-teal-300" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search patient") + " — MR / phone / name"} className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400" />
          {isFetching && <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />}
        </label>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Patients" value={Number(s.total ?? 0).toLocaleString()} hint={`${Number(s.male ?? 0)} M · ${Number(s.female ?? 0)} F`} icon={Users} tone="teal" />
        <StatCard label="New · 30 days" value={Number(s.new30 ?? 0)} icon={UserPlus} tone="blue" />
        <StatCard label="Seen today" value={Number(s.seen_today ?? 0)} icon={Stethoscope} tone="violet" />
        <StatCard label="Admitted" value={Number(s.admitted ?? 0)} icon={BedDouble} tone="rose" />
        <StatCard label="Panel / insurance" value={Number(s.payer ?? 0)} icon={CreditCard} tone="amber" onClick={() => { setCategory(category === "Panel" ? "" : "Panel"); setPage(0); }} />
        <StatCard label="Welfare" value={Number(s.welfare ?? 0)} icon={UserRoundCheck} tone="slate" onClick={() => { setCategory(category === "Welfare" ? "" : "Welfare"); setPage(0); }} />
      </div>

      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/90 p-2 shadow-sm backdrop-blur">
        <div className="flex gap-1.5 overflow-x-auto">
          {["", "Normal", "Panel", "Insurance", "Staff", "Welfare"].map((c) => <button key={c || "all"} onClick={() => { setCategory(c); setPage(0); }} className={chip(category === c)}>{c ? t(c) : "All categories"}</button>)}
        </div>
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <div className="flex gap-1.5">{["", "Male", "Female"].map((g) => <button key={g || "any"} onClick={() => { setGender(g); setPage(0); }} className={chip(gender === g)}>{g ? t(g) : "Any gender"}</button>)}</div>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} className="ms-auto h-9 rounded-lg border border-input bg-[hsl(var(--input-bg))] px-2 text-sm">
          <option value="recent">Newest first</option><option value="visit">Last visit</option><option value="visits">Most visits</option><option value="name">Name A–Z</option></select>
        <div className="flex rounded-xl bg-muted p-1">
          {([["cards", LayoutGrid, "Cards"], ["list", List, "List"]] as const).map(([k, I, l]) => (
            <button key={k} onClick={() => setV(k)} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", view === k ? "bg-card shadow-sm" : "text-muted-foreground")}><I className="h-4 w-4" />{l}</button>))}
        </div>
      </div>

      {isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-3xl" />)}</div>
        : !rows.length ? <Empty title="No patients found" hint="Try another search or clear the filters." icon={Users} />
        : view === "cards" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {rows.map((p) => (
              <article key={p.name} onClick={() => nav(`/patients/${p.name}`)} className="group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
                <div className="relative h-16" style={{ background: GRAD[p.gender] ?? GRAD.Other }}>
                  <div className="absolute -end-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-xl" />
                  <div className="relative flex items-start justify-between p-2.5">
                    <span className="rounded-full bg-black/20 px-2 py-0.5 font-mono text-[11px] font-semibold text-white backdrop-blur">{p.name}</span>
                    <div className="flex gap-1">
                      {p.bed && <span className="flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white shadow"><BedDouble className="h-3 w-3" />{p.bed}</span>}
                      {!!p.allergies && <span title="Has allergies" className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-rose-600 shadow"><ShieldAlert className="h-3 w-3" />{p.allergies}</span>}
                    </div>
                  </div>
                </div>
                <div className="relative z-10 -mt-8 flex items-end gap-3 px-4">
                  <div className="rounded-full bg-card p-1 shadow-lg">
                    {p.photo ? <img src={p.photo} alt="" className="h-16 w-16 rounded-full object-cover" />
                      : <span className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-extrabold text-white" style={{ background: GRAD[p.gender] ?? GRAD.Other }}>{initials(p.patient_name)}</span>}
                  </div>
                  <span className={cn("mb-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", CAT[p.category] ?? CAT.Normal)}>{t(p.category)}</span>
                  {p.blood_group && <span className="mb-1 flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"><Droplet className="h-3 w-3" />{p.blood_group}</span>}
                </div>
                <div className="px-4 pt-2">
                  <h3 className="line-clamp-1 text-base font-bold">{name(p)}</h3>
                  {p.patient_name_ur && name(p) !== p.patient_name_ur && <div className="font-[Noto_Nastaliq_Urdu] text-sm leading-relaxed text-muted-foreground">{p.patient_name_ur}</div>}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{t(p.gender)}{p.age != null ? ` · ${p.age} y` : ""}</span>
                    {p.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>}
                    {p.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.city}</span>}
                  </div>
                </div>
                <div className="mx-4 mt-3 grid grid-cols-3 overflow-hidden rounded-2xl border border-border text-center">
                  <div className="bg-gradient-to-br from-teal-50 to-emerald-50 py-2 dark:from-teal-500/10 dark:to-emerald-500/5"><div className="text-lg font-extrabold tabular-nums text-teal-700 dark:text-teal-300">{p.visits}</div><div className="text-[10px] text-muted-foreground">{t("Visits")}</div></div>
                  <div className="border-s border-border py-2"><div className="text-xs font-bold">{ago(p.last_visit)}</div><div className="text-[10px] text-muted-foreground">Last visit</div></div>
                  <div className="border-s border-border py-2"><div className="text-xs font-bold">{p.next_appointment ? p.next_appointment.slice(5) : "—"}</div><div className="text-[10px] text-muted-foreground">Next booking</div></div>
                </div>
                <div className="h-3" />
                {(p.panel || p.insurance_provider) && <div className="mx-4 -mt-1 mb-2 truncate text-[11px] text-amber-700 dark:text-amber-300">{p.panel || p.insurance_provider}</div>}
                <div className="mt-auto grid grid-cols-4 gap-1 border-t border-border p-2 pt-2">
                  <Act icon={FilePlus2} label="OPD" onClick={can("/opd_slip") ? go(`/opd_slip?patient=${p.name}`) : undefined} />
                  <Act icon={History} label="History" onClick={can("/pw-history") ? go(`/pw-history/${p.name}`) : undefined} />
                  <Act icon={CalendarClock} label="Book" onClick={can("/appointments") ? go(`/appointments?patient=${p.name}`) : undefined} />
                  <Act icon={CreditCard} label="Card" onClick={boot ? (e) => { e.stopPropagation(); void printCard(p.name, boot); } : undefined} />
                </div>
              </article>))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-gradient-to-r from-teal-700 to-emerald-600 text-xs uppercase tracking-wide text-white">
                <th className="px-4 py-3 text-start">{t("Patient")}</th><th className="text-start">{t("MR No.")}</th><th className="text-start">{t("Phone")}</th>
                <th className="text-start">{t("Category")}</th><th className="text-end">{t("Visits")}</th><th className="px-3 text-start">Last visit</th><th className="text-start">Flags</th><th className="px-3" /></tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.name} onClick={() => nav(`/patients/${p.name}`)} className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-2.5"><div className="flex items-center gap-3">
                    {p.photo ? <img src={p.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
                      : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: GRAD[p.gender] ?? GRAD.Other }}>{initials(p.patient_name)}</span>}
                    <div className="min-w-0"><div className="truncate font-semibold">{name(p)}</div><div className="truncate text-xs text-muted-foreground">{t(p.gender)}{p.age != null ? ` · ${p.age} y` : ""}{p.city ? ` · ${p.city}` : ""}</div></div></div></td>
                  <td className="font-mono text-xs">{p.name}</td>
                  <td className="text-xs">{p.phone}{p.whatsapp_consent ? <MessageCircle className="ms-1 inline h-3 w-3 text-green-600" /> : null}</td>
                  <td><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", CAT[p.category] ?? CAT.Normal)}>{t(p.category)}</span></td>
                  <td className="text-end font-bold tabular-nums">{p.visits}</td>
                  <td className="px-3 text-xs text-muted-foreground">{ago(p.last_visit)}</td>
                  <td><div className="flex gap-1">
                    {p.bed && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">{p.bed}</span>}
                    {!!p.allergies && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">⚠ allergy</span>}
                    {p.next_appointment && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{p.next_appointment.slice(5)}</span>}
                    {p.blood_group && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{p.blood_group}</span>}</div></td>
                  <td className="px-3"><div className="flex justify-end gap-1">
                    {can("/opd_slip") && <Icon title="OPD slip" icon={FilePlus2} onClick={go(`/opd_slip?patient=${p.name}`)} />}
                    {can("/pw-history") && <Icon title="History" icon={History} onClick={go(`/pw-history/${p.name}`)} />}
                    {can("/appointments") && <Icon title="Book" icon={CalendarClock} onClick={go(`/appointments?patient=${p.name}`)} />}</div></td>
                </tr>))}</tbody>
            </table></div>
          </div>
        )}

      {total > PAGE && (
        <div className="mt-5 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2 text-sm shadow-sm">
          <span className="text-muted-foreground">{page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total.toLocaleString()}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" disabled={!page} onClick={() => setPage((x) => x - 1)}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
            {Array.from({ length: pages }).slice(Math.max(0, page - 2), Math.max(0, page - 2) + 5).map((_, i) => { const n = Math.max(0, page - 2) + i; return (
              <button key={n} onClick={() => setPage(n)} className={cn("h-8 min-w-8 rounded-lg px-2 text-sm font-semibold", n === page ? "bg-gradient-to-r from-teal-600 to-emerald-500 text-white" : "hover:bg-muted")}>{n + 1}</button>); })}
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((x) => x + 1)}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Act({ icon: I, label, onClick }: { icon: typeof Users; label: string; onClick?: (e: MouseEvent) => void }) {
  return (
    <button disabled={!onClick} onClick={onClick} className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30">
      <I className="h-4 w-4" />{label}</button>
  );
}

function Icon({ icon: I, title, onClick }: { icon: typeof Users; title: string; onClick: (e: MouseEvent) => void }) {
  return <button title={title} onClick={onClick} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><I className="h-4 w-4" /></button>;
}
