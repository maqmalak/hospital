import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, BedDouble, CalendarClock, ClipboardList, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { NAV } from "@/lib/nav";
import { StatCard } from "@/components/common";
import { cn } from "@/utils/cn";

interface Ctx { doctors: { name: string; today: number; waiting: number; with_doctor: number }[] }

export default function HomePage() {
  const { boot, can, branch } = useAuth();
  const { t } = useTranslation();
  const counter = useApi<Ctx>("opd.counter_context", { branch }, { enabled: can("/physician-queue") });
  const beds = useApi<{ totals: Record<string, number>; occupancy: number }>("ward.bed_map", { branch }, { enabled: can("/ward") });
  const appts = useApi<{ rows: unknown[] }>("appointments.board", { branch }, { enabled: can("/appointments") });
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const docs = counter.data?.doctors ?? [];
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.route)) })).filter((g) => g.items.length);
  return (
    <div className="mx-auto max-w-7xl">
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-500 p-6 text-white shadow-lg">
        <div className="absolute -end-10 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="text-sm text-white/80">{t(greet)},</div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{boot?.full_name}</h1>
          <div className="mt-1 text-sm text-white/80">{branch} · {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can("/physician-queue") && <StatCard label={t("Visits")} value={docs.reduce((s, d) => s + d.today, 0)} hint={`${docs.reduce((s, d) => s + d.waiting, 0)} ${t("Waiting").toLowerCase()}`} icon={ClipboardList} tone="teal" />}
        {can("/physician-queue") && <StatCard label={t("In Consultation")} value={docs.reduce((s, d) => s + d.with_doctor, 0)} icon={Users} tone="violet" />}
        {can("/appointments") && <StatCard label={t("Appointments")} value={appts.data?.rows.length ?? "–"} hint={t("Today")} icon={CalendarClock} tone="blue" />}
        {can("/ward") && <StatCard label={t("Occupancy")} value={`${beds.data?.occupancy ?? 0}%`} hint={`${beds.data?.totals.Available ?? 0} ${t("Available").toLowerCase()}`} icon={BedDouble} tone="amber" />}
      </div>
      {groups.map((g) => (
        <div key={g.label} className="mb-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{t(g.label)}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.items.map((i) => (
              <Link key={i.route} to={i.route} className="hover-outline group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md", i.color)}><i.icon className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{t(i.label)}</span><span className="block truncate text-xs text-muted-foreground">{i.desc}</span></span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 rtl:rotate-180" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
