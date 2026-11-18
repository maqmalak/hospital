import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";

interface Disp { doctors: { doctor: string; room?: string; now: { token: number; name?: string; status?: string; called_at: string } | null; next: { token: number; name?: string }[]; waiting: number }[]; clinic: string; clinic_ur?: string }

/* Fixed VVS gold palette (not the theme teal-* variables, which turn blue in dark mode): #2A1F08 / #EBDCAB / #E0C77E / #B8913A. */
/** Waiting-room TV: token and room (first name when Clinic Settings allows); the patient with the doctor shows token + name.
 *  Chime + Urdu/English voice on a new call. */
export default function QueueDisplayPage() {
  const { boot, branch } = useAuth();
  const qc = useQueryClient();
  const { data } = useApi<Disp>("opd.display", { branch }, { refetchInterval: 8000 });
  const [clock, setClock] = useState(new Date());
  const last = useRef<Record<string, number>>({});
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { const id = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(id); }, []);
  useRealtime(boot?.site, [`hv:queue:${branch}`], () => void qc.invalidateQueries({ queryKey: ["opd.display"] }));
  useEffect(() => {
    for (const d of data?.doctors ?? []) {
      if (d.now && last.current[d.doctor] !== undefined && last.current[d.doctor] !== d.now.token) announce(d.now.token, d.room);
      if (d.now) last.current[d.doctor] = d.now.token;
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const announce = (token: number, room?: string) => {
    setFlash(`${token}`); setTimeout(() => setFlash(null), 6000);
    try {
      const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.25, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2); o.start(); o.stop(ctx.currentTime + 1.2);
    } catch { /* audio blocked */ }
    const say = (text: string, lang: string) => { const u = new SpeechSynthesisUtterance(text); u.lang = lang; speechSynthesis.speak(u); };
    say(`Token number ${token}${room ? `, please go to room ${room}` : ""}`, "en-US");
    say(`ٹوکن نمبر ${token}${room ? `، کمرہ نمبر ${room} میں تشریف لائیں` : ""}`, "ur-PK");
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#2A1F08] to-slate-900 p-6 text-white">
      <div className="mb-6 flex items-end justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.15),0_12px_30px_-8px_rgba(0,0,0,0.6)]">
            <img src={`${import.meta.env.BASE_URL}brand/lyallpur-mark.webp`} alt="" className="h-14 w-14 object-contain" />
          </span>
          <div><div className="text-3xl font-extrabold leading-tight">{data?.clinic}</div><div className="mt-1 font-urdu text-xl leading-[2.2] text-[#EBDCAB]" dir="rtl">{data?.clinic_ur}</div></div>
        </div>
        <div className="text-end"><div className="text-4xl font-bold tabular-nums">{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div><div className="text-[#EBDCAB]">{clock.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div></div>
      </div>
      {flash && <div className="mb-6 animate-pulse rounded-3xl bg-gradient-to-r from-amber-400 to-orange-500 p-6 text-center text-slate-950"><div className="text-xl font-bold">NOW CALLING · اب باری</div><div className="text-8xl font-black">{flash}</div></div>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(data?.doctors ?? []).map((d) => (
          <div key={d.doctor} className={`relative overflow-hidden rounded-3xl border-2 bg-white/[0.12] p-6 backdrop-blur ${d.now?.status === "In Consultation" ? "border-emerald-400 shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_32px_-6px_rgba(52,211,153,0.55)]" : "border-white/25 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)]"}`}>
            <span aria-hidden className={`absolute inset-x-0 top-0 h-1.5 ${d.now?.status === "In Consultation" ? "bg-emerald-400" : "bg-gradient-to-r from-[#E0C77E] to-[#B8913A]"}`} />
            <div className="flex items-center justify-between gap-3"><div className="text-2xl font-extrabold">{d.doctor}</div><div className="shrink-0 rounded-full bg-white px-3.5 py-1 text-sm font-bold text-slate-900">Room {d.room || "–"}</div></div>
            {d.now?.status === "In Consultation" ? (
              <>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border-2 border-emerald-400 bg-emerald-400/10 px-3.5 py-0.5 text-sm font-bold uppercase tracking-widest text-emerald-300 shadow-[0_0_14px_-2px_rgba(52,211,153,0.6)]"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />With the doctor · <span className="font-urdu text-base normal-case leading-[1.9] tracking-normal text-emerald-300">ڈاکٹر کے پاس</span></div>
                <div className="mt-1 flex items-center gap-4">
                  <span className="text-7xl font-black tabular-nums">{d.now.token}</span>
                  {d.now.name && <span className="min-w-0 border-s border-white/20 ps-4 text-2xl font-bold leading-tight text-white/90 [overflow-wrap:anywhere]">{d.now.name}</span>}
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 text-sm font-semibold uppercase tracking-widest text-[#EBDCAB]">Now serving · اب باری</div>
                <div className="text-7xl font-black tabular-nums">{d.now?.token ?? "—"}</div>{d.now?.name && <div className="text-lg text-white/80">{d.now.name}</div>}
              </>
            )}
            <div className="mt-5 text-sm font-semibold uppercase tracking-widest text-white/80">Next · اگلے</div>
            <div className="mt-1 flex gap-2">{d.next.map((n) => <span key={n.token} className="rounded-xl border border-white/25 bg-white/20 px-4 py-2 text-2xl font-bold tabular-nums">{n.token}</span>)}{!d.next.length && <span className="text-white/50">—</span>}</div>
            <div className="mt-4 text-sm font-medium text-white/80">{d.waiting} waiting</div>
          </div>))}
      </div>
      {!data?.doctors.length && <div className="mt-24 text-center text-3xl text-white/60">Please wait for your token · اپنے ٹوکن کا انتظار کریں</div>}
    </div>
  );
}
