import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, ClipboardList, MonitorPlay, PhoneCall, Printer, SkipForward, Stethoscope } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { humanizeError, useAction, useApi } from "@/lib/api";
import { printPrescription } from "@/lib/rxprint";
import { useRealtime } from "@/lib/realtime";
import { Avatarish, Empty, PageHeader, Pill } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export interface QRow { name: string; doctor: string; doctor_name: string; patient: string; patient_name: string; token_no: number; status: string; priority?: string;
  is_follow_up: number; room?: string; creation: string; called_at?: string; started_at?: string; completed_at?: string; photo?: string; prescription?: string }
interface QData { rows: QRow[]; doctors: { name: string; doctor_name: string; consultation_room?: string; color?: string; specialization?: string }[] }

const mins = (from?: string) => (from ? Math.max(0, Math.round((Date.now() - new Date(from.replace(" ", "T")).getTime()) / 60000)) : 0);

export default function QueuePage() {
  const { boot, branch, hasRole } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [doctor, setDoctor] = useState<string>(boot?.doctor?.name ?? "");
  const { data } = useApi<QData>("opd.queue", { branch, doctor: doctor || undefined }, { refetchInterval: 20_000 });
  useRealtime(boot?.site, [`hv:queue:${branch}`], () => void qc.invalidateQueries({ queryKey: ["opd.queue"] }));
  const setStatus = useAction("opd.set_queue_status", { invalidate: ["opd.queue"] });
  const next = useAction<QRow>("opd.call_next", { invalidate: ["opd.queue"], success: (r) => `Token ${r.token_no} called` });
  const rows = data?.rows ?? [];
  const isDoctor = hasRole("PW Doctor");
  const col = (s: string[]) => rows.filter((r) => s.includes(r.status));
  const columns = [
    { key: "Vitals", list: col(["Vitals"]), tone: "border-rose-400" },
    { key: "Waiting", list: col(["Waiting"]), tone: "border-amber-400" },
    { key: "Called", list: col(["Called", "In Consultation"]), tone: "border-violet-400" },
    { key: "Done", list: col(["Done", "Skipped"]), tone: "border-emerald-400" },
  ];
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Physician queue" icon={ClipboardList} color="from-amber-500 to-orange-500" subtitle={`${branch} · ${rows.filter((r) => r.status === "Waiting").length} ${t("Waiting").toLowerCase()}`}
        actions={<>
          <select value={doctor} onChange={(e) => setDoctor(e.target.value)} className="h-10 rounded-lg border border-input bg-[hsl(var(--input-bg))] px-3 text-sm">
            <option value="">All doctors</option>{data?.doctors.map((d) => <option key={d.name} value={d.name}>{d.doctor_name}</option>)}</select>
          {doctor && <Button variant="primary" loading={next.isPending} onClick={() => next.mutate({ doctor, branch })}><BellRing className="h-4 w-4" />{t("Call next")}</Button>}
          <Link to="/display/queue" target="_blank"><Button variant="outline"><MonitorPlay className="h-4 w-4" />Display</Button></Link>
        </>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((c) => (
          <div key={c.key} className={cn("rounded-2xl border-t-4 bg-card p-3 shadow-sm", c.tone)}>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-bold">{c.key === "Vitals" ? "With the nurse (vitals)" : c.key === "Waiting" ? "Waiting for the doctor" : c.key === "Called" ? "With the doctor" : t(c.key)}</h2><span className="rounded-full bg-muted px-2 text-xs font-semibold">{c.list.length}</span></div>
            <div className="space-y-2">
              {c.list.map((r) => (
                <div key={r.name} className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 text-lg font-extrabold text-white">{r.token_no}</span>
                    <Avatarish name={r.patient_name} src={r.photo} />
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold">{r.patient_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.patient} · {r.doctor_name}{r.room ? ` · ${r.room}` : ""}</div></div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Pill value={r.status} />{r.priority && <Pill value={r.priority} />}{r.is_follow_up ? <Pill value="Follow-up" className="bg-teal-100 text-teal-800" /> : null}
                    {r.status === "Waiting" && <span className="text-xs text-muted-foreground">{mins(r.creation)} min</span>}
                    {r.prescription && r.status !== "Done" && <Pill value="Draft" className="bg-sky-100 text-sky-800" />}
                    <div className="ms-auto flex gap-1">
                      {r.status === "Waiting" && <>
                        <select value={r.priority ?? ""} onChange={(e) => setStatus.mutate({ name: r.name, status: r.status, priority: e.target.value })} className="h-7 rounded-md border border-border bg-transparent px-1 text-xs"><option value="">Normal</option><option>Urgent</option><option>Elderly</option><option>Disabled</option></select>
                        <Button size="xs" variant="outline" onClick={() => setStatus.mutate({ name: r.name, status: "Called" })}><PhoneCall className="h-3 w-3" />{t("Called")}</Button>
                        <Button size="xs" variant="ghost" onClick={() => setStatus.mutate({ name: r.name, status: "Skipped" })}><SkipForward className="h-3 w-3" /></Button></>}
                      {["Called", "In Consultation", "Waiting"].includes(r.status) && isDoctor && <Button size="xs" variant="primary" onClick={() => nav(`/pw-prescription?queue=${r.name}`)}><Stethoscope className="h-3 w-3" />Rx</Button>}
                      {r.status === "Skipped" && <Button size="xs" variant="outline" onClick={() => setStatus.mutate({ name: r.name, status: "Waiting" })}>Return</Button>}
                      {r.status === "Vitals" && <Button size="xs" variant="outline" onClick={() => nav("/opd/vitals")}>Vitals</Button>}
                      {r.status === "Done" && r.prescription && <Button size="xs" variant="outline" title="Reprint prescription" onClick={() => void printPrescription(r.prescription!, r.patient, boot).catch((e) => toast.error(humanizeError(e)))}><Printer className="h-3 w-3" />Print Rx</Button>}
                    </div>
                  </div>
                </div>))}
              {!c.list.length && <Empty title="Empty" />}
            </div>
          </div>))}
      </div>
    </div>
  );
}
