import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarClock, MapPin, Phone } from "lucide-react";
import toast from "react-hot-toast";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/common";
import { cn } from "@/utils/cn";
import { PublicShell } from "./shared";

const M = (x: string) => `hospital_vvs.api.appointments.${x}`;
interface B { booking_ref: string; patient_name: string; doctor: string; doctor_name: string; date: string; time: string; status: string; fee: number; payment_status: string; address?: string; phone?: string; can_change: boolean; clinic: string }

export default function ManagePage() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const [b, setB] = useState<B | null>(null);
  const [err, setErr] = useState("");
  const [move, setMove] = useState(false);
  const [dates, setDates] = useState<{ date: string }[]>([]);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<{ name: string; time: string }[]>([]);
  useEffect(() => { void getCall<B>(M("manage_get"), { token }).then(setB).catch((e) => setErr(humanizeError(e))); }, [token]);
  const act = async (fn: () => Promise<B>, ok: string) => { try { setB(await fn()); toast.success(ok); setMove(false); } catch (e) { toast.error(humanizeError(e)); } };
  if (err) return <PublicShell><div className="rounded-3xl bg-card p-8 text-center shadow-xl">{err}</div></PublicShell>;
  if (!b) return <PublicShell><div className="rounded-3xl bg-card p-8 text-center shadow-xl">{t("Loading…")}</div></PublicShell>;
  return (
    <PublicShell clinic={b.clinic}>
      <div className="rounded-3xl bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between"><span className="font-mono text-2xl font-extrabold tracking-widest">{b.booking_ref}</span><Pill value={b.status} /></div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /><b>{b.date} · {b.time}</b></div>
          <div>{b.patient_name} · {b.doctor_name}</div>
          {b.address && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{b.address}</div>}
          {b.phone && <a href={`tel:${b.phone}`} className="flex items-center gap-2 text-primary"><Phone className="h-4 w-4" />{b.phone}</a>}
          <div className="text-muted-foreground">{t("Fee")}: Rs {b.fee.toLocaleString()} · {b.payment_status}</div>
        </div>
        {b.can_change && !move && <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={async () => { setMove(true); setDates(await getCall(M("public_dates"), { doctor: b.doctor })); }}>{t("Reschedule")}</Button>
          <Button variant="destructive" onClick={() => { if (confirm("Cancel this booking?")) void act(() => postCall<B>(M("manage_cancel"), { token }), "Booking cancelled"); }}>{t("Cancel booking")}</Button></div>}
        {move && <div className="mt-5">
          <div className="mb-2 flex gap-2 overflow-x-auto">{dates.map((d) => <button key={d.date} onClick={async () => { setDate(d.date); setSlots(await getCall(M("public_slots"), { doctor: b.doctor, date: d.date })); }}
            className={cn("min-w-[64px] rounded-xl border p-2 text-center text-sm", date === d.date ? "border-primary bg-primary/10" : "border-border")}>{d.date.slice(5)}</button>)}</div>
          <div className="grid grid-cols-4 gap-2">{slots.map((s) => <button key={s.name} onClick={() => void act(() => postCall<B>(M("manage_reschedule"), { token, slot: s.name }), "Booking moved")} className="rounded-lg border border-border py-2 font-semibold hover:border-primary">{s.time}</button>)}</div>
          <button onClick={() => setMove(false)} className="mt-3 text-sm text-muted-foreground">{t("Cancel")}</button></div>}
      </div>
    </PublicShell>
  );
}
