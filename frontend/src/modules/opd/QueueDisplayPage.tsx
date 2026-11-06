import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";

interface Disp { doctors: { doctor: string; room?: string; now: { token: number; name?: string; called_at: string } | null; next: { token: number; name?: string }[]; waiting: number }[]; clinic: string; clinic_ur?: string }

/** Waiting-room TV: token and room only (first name when Clinic Settings allows). Chime + Urdu/English voice on a new call. */
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-slate-900 p-6 text-white">
      <div className="mb-6 flex items-end justify-between">
        <div><div className="text-3xl font-extrabold">{data?.clinic}</div><div className="font-urdu text-xl text-teal-200">{data?.clinic_ur}</div></div>
        <div className="text-end"><div className="text-4xl font-bold tabular-nums">{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div><div className="text-teal-200">{clock.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div></div>
      </div>
      {flash && <div className="mb-6 animate-pulse rounded-3xl bg-gradient-to-r from-amber-400 to-orange-500 p-6 text-center text-slate-950"><div className="text-xl font-bold">NOW CALLING · اب باری</div><div className="text-8xl font-black">{flash}</div></div>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(data?.doctors ?? []).map((d) => (
          <div key={d.doctor} className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center justify-between"><div className="text-xl font-bold">{d.doctor}</div><div className="rounded-full bg-teal-500/20 px-3 py-1 text-sm font-semibold text-teal-200">Room {d.room || "–"}</div></div>
            <div className="mt-4 text-sm uppercase tracking-widest text-teal-300">Now serving · اب باری</div>
            <div className="text-7xl font-black tabular-nums">{d.now?.token ?? "—"}</div>{d.now?.name && <div className="text-lg text-white/80">{d.now.name}</div>}
            <div className="mt-4 text-sm uppercase tracking-widest text-white/60">Next · اگلے</div>
            <div className="mt-1 flex gap-2">{d.next.map((n) => <span key={n.token} className="rounded-xl bg-white/10 px-4 py-2 text-2xl font-bold tabular-nums">{n.token}</span>)}{!d.next.length && <span className="text-white/50">—</span>}</div>
            <div className="mt-3 text-sm text-white/60">{d.waiting} waiting</div>
          </div>))}
      </div>
      {!data?.doctors.length && <div className="mt-24 text-center text-3xl text-white/60">Please wait for your token · اپنے ٹوکن کا انتظار کریں</div>}
    </div>
  );
}
