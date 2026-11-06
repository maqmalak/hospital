import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, CalendarPlus, Check, ExternalLink, FilePlus2, Paperclip, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, getCall, humanizeError, useAction, useApi } from "@/lib/api";
import { Empty, Field, inputCls, PageHeader, PatientPicker, Pill, Section, Tabs, type PatientHit } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { todayISO } from "@/utils/dates";
import { cn } from "@/utils/cn";

interface Appt { name: string; patient?: string; patient_name: string; phone: string; doctor: string; doctor_name: string; start_time: string; status: string; source_channel: string;
  booking_ref: string; fee: number; payment_channel: string; payment_status: string; payment_proof?: string; opd_slip?: string; is_new_patient: number; message_failed: boolean;
  new_patient_age?: number; new_patient_gender?: string }

export default function AppointmentsPage() {
  const { branch } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [date, setDate] = useState(todayISO());
  const [channel, setChannel] = useState<"" | "Reception" | "Web" | "WhatsApp">("");
  const [book, setBook] = useState(!!params.get("patient"));
  const { data } = useApi<{ rows: Appt[]; stats: { source_channel: string; status: string; n: number }[] }>("appointments.board", { date, branch, channel: channel || undefined }, { refetchInterval: 30_000 });
  const status = useAction("appointments.set_status", { invalidate: ["appointments.board"], success: "Updated" });
  const rows = data?.rows ?? [];
  const count = (c: string) => (data?.stats ?? []).filter((s) => s.source_channel === c).reduce((a, s) => a + s.n, 0);
  const arrive = async (a: Appt) => {
    try {
      await call("appointments.set_status", { name: a.name, status: "Arrived" });
      void qc.invalidateQueries({ queryKey: ["appointments.board"] });
      if (a.patient) nav(`/opd_slip?patient=${a.patient}`); else nav(`/registration`);
    } catch (e) { toast.error(humanizeError(e)); }
  };
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Appointments" icon={CalendarClock} color="from-violet-500 to-indigo-500" subtitle={`${rows.length} on ${date}`}
        actions={<>
          <input type="date" className={inputCls + " w-40"} value={date} onChange={(e) => setDate(e.target.value)} />
          <Link to="/appointments/inbox"><Button variant="outline">{t("WhatsApp inbox")}</Button></Link>
          <a href="/hms/book-appointment" target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink className="h-4 w-4" />Web portal</Button></a>
          <Button variant="primary" onClick={() => setBook(true)}><CalendarPlus className="h-4 w-4" />{t("Book appointment")}</Button>
        </>} />
      <div className="mb-3"><Tabs value={channel} onChange={setChannel} tabs={[{ key: "", label: "All", count: (data?.stats ?? []).reduce((a, s) => a + s.n, 0) },
        { key: "Reception", label: "Reception", count: count("Reception") }, { key: "Web", label: "Web", count: count("Web") }, { key: "WhatsApp", label: "WhatsApp", count: count("WhatsApp") }]} /></div>
      <Section>
        {rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Time</th><th className="text-start">{t("Patient")}</th><th className="text-start">{t("Doctor")}</th><th className="text-start">Channel</th><th className="text-start">Payment</th><th className="text-start">Status</th><th /></tr></thead>
          <tbody>{rows.map((a) => (
            <tr key={a.name} className="border-b border-border/60 last:border-0">
              <td className="py-2.5 font-semibold tabular-nums">{a.start_time?.slice(0, 5) || "walk-in"}</td>
              <td><div className="font-medium">{a.patient_name} {a.is_new_patient ? <span className="rounded bg-sky-100 px-1 text-[10px] font-bold text-sky-800">NEW</span> : null}</div><div className="text-xs text-muted-foreground">{a.phone} · {a.booking_ref}</div></td>
              <td>{a.doctor_name}</td><td><Pill value={a.source_channel} /></td>
              <td className="text-xs">{a.payment_channel}<div><Pill value={a.payment_status === "Proof Submitted" ? "Pending" : a.payment_status === "Paid" ? "Approved" : undefined} />{a.payment_proof && <a href={a.payment_proof} target="_blank" rel="noreferrer" className="ms-1 inline-flex items-center text-primary"><Paperclip className="h-3 w-3" />proof</a>}</div></td>
              <td><Pill value={a.status} />{a.message_failed && <span title="A message failed — see Message log" className="ms-1 inline-flex text-rose-600"><AlertCircle className="h-4 w-4" /></span>}</td>
              <td className="text-end"><div className="flex justify-end gap-1">
                {a.status === "Pending" && <><Button size="xs" variant="submit" onClick={() => status.mutate({ name: a.name, status: "Confirmed" })}><Check className="h-3 w-3" />{t("Confirm")}</Button>
                  <Button size="xs" variant="outline" onClick={() => status.mutate({ name: a.name, status: "Rejected" })}>{t("Reject")}</Button></>}
                {a.status === "Confirmed" && <Button size="xs" variant="primary" onClick={() => void arrive(a)}><FilePlus2 className="h-3 w-3" />{t("Arrived")}</Button>}
                {["Pending", "Confirmed"].includes(a.status) && <Button size="xs" variant="ghost" onClick={() => { const r = prompt("Reason for cancelling"); if (r !== null) status.mutate({ name: a.name, status: "Cancelled", reason: r }); }}><X className="h-3 w-3" /></Button>}
                {a.status === "Arrived" && !a.opd_slip && a.patient && <Button size="xs" variant="outline" onClick={() => nav(`/opd_slip?patient=${a.patient}`)}>{t("OPD slip")}</Button>}
              </div></td>
            </tr>))}</tbody></table></div> : <Empty title="No appointments" hint="Bookings from reception, the web portal and WhatsApp appear here." icon={CalendarClock} />}
      </Section>
      <BookDialog open={book} onClose={() => setBook(false)} initialPatient={params.get("patient") || undefined} onBooked={() => { setBook(false); void qc.invalidateQueries({ queryKey: ["appointments.board"] }); }} />
    </div>
  );
}

function BookDialog({ open, onClose, onBooked, initialPatient }: { open: boolean; onClose: () => void; onBooked: () => void; initialPatient?: string }) {
  const { t } = useTranslation();
  const { branch } = useAuth();
  const [patient, setPatient] = useState<PatientHit | null>(null);
  const [doctor, setDoctor] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [busy, setBusy] = useState(false);
  const docs = useApi<{ doctors: { name: string; doctor_name: string; specialization?: string; default_fee: number; branch?: string }[] }>("opd.counter_context", { branch }, { enabled: open });
  const dates = useApi<{ slot_date: string; n: number }[]>("appointments.dates", { doctor, branch }, { enabled: !!doctor });
  const slots = useApi<{ name: string; start_time: string }[]>("appointments.slots", { doctor, date, branch }, { enabled: !!doctor && !!date });
  useEffect(() => { if (initialPatient && open) void getCall<PatientHit[]>("hospital_vvs.api.patients.search", { q: initialPatient }).then((r) => r[0] && setPatient(r[0])); }, [initialPatient, open]);
  const submit = async () => {
    setBusy(true);
    try { const a = await call<{ booking_ref: string }>("appointments.book", { data: { patient: patient?.name, doctor, slot, branch } }); toast.success(`Booked · ${a.booking_ref}`); onBooked(); setSlot(""); }
    catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={t("Book appointment")} size="lg">
      <div className="space-y-3">
        <PatientPicker value={patient} onPick={setPatient} onClear={() => setPatient(null)} />
        <Field label="Doctor"><select className={inputCls} value={doctor} onChange={(e) => { setDoctor(e.target.value); setDate(""); setSlot(""); }}><option value="">—</option>
          {(docs.data?.doctors ?? []).filter((d) => !d.branch || d.branch === branch).map((d) => <option key={d.name} value={d.name}>{d.doctor_name} · {d.specialization} · Rs {d.default_fee}</option>)}</select></Field>
        {doctor && <div><div className="mb-1 text-xs font-semibold text-muted-foreground">{t("Choose a date")}</div><div className="flex gap-2 overflow-x-auto pb-1">
          {(dates.data ?? []).map((d) => { const dt = new Date(d.slot_date + "T00:00"); return (
            <button key={d.slot_date} onClick={() => { setDate(d.slot_date); setSlot(""); }} className={cn("min-w-[72px] rounded-xl border p-2 text-center", date === d.slot_date ? "border-primary bg-primary/10 text-primary" : "border-border")}>
              <div className="text-[10px] uppercase">{dt.toLocaleDateString(undefined, { weekday: "short" })}</div><div className="text-lg font-bold">{dt.getDate()}</div><div className="text-[10px] text-muted-foreground">{d.n} free</div></button>); })}
          {dates.data && !dates.data.length && <span className="text-sm text-muted-foreground">No free slots in the booking window.</span>}</div></div>}
        {date && <div><div className="mb-1 text-xs font-semibold text-muted-foreground">{t("Choose a time")}</div><div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {(slots.data ?? []).map((s) => <button key={s.name} onClick={() => setSlot(s.name)} className={cn("rounded-lg border py-2 text-sm font-semibold tabular-nums", slot === s.name ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>{s.start_time.slice(0, 5)}</button>)}</div></div>}
        <Button variant="primary" className="w-full" disabled={!patient || !slot} loading={busy} onClick={() => void submit()}>{t("Confirm")}</Button>
      </div>
    </Dialog>
  );
}
