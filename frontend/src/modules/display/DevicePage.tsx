import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { BedDouble, Clock, Pill, ShoppingBag, Volume2 } from "lucide-react";
import { getCall, humanizeError } from "@/services/frappe";
import { cn } from "@/utils/cn";

/** Public screens keyed by a device key only (no login). Read-only, polled every few seconds. */
interface Base { type: string; name: string; branch: string; clinic: string; clinic_ur?: string }
interface CustomerD extends Base { counter: { counter_name?: string; number?: number }; state: { state: string; lines?: { name: string; qty: number; uom: string; amount: number }[]; total?: number; discount?: number; net?: number; token?: string; change?: number } }
interface QueueD extends Base { preparing: { token: string; status: string }[]; ready: { token: string; counter: string | number; called_at: string }[] }
interface WaitD extends Base { opd: { doctors: { doctor: string; room?: string; now: null | { token: number; name?: string; status: string }; next: { token: number; name?: string }[]; waiting: number }[] } }
interface WardD extends Base { ward: { wards: { name: string; ward_name: string; ward_name_ur?: string; color?: string }[]; beds: { name: string; bed_no: string; ward: string; status: string; label?: string | null }[]; totals: Record<string, number> } }
type D = CustomerD & QueueD & WaitD & WardD;
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;

function useClock() { const [n, setN] = useState(new Date()); useEffect(() => { const t = setInterval(() => setN(new Date()), 15_000); return () => clearInterval(t); }, []); return n; }

export default function DevicePage() {
  const { key = "" } = useParams();
  const [d, setD] = useState<D | null>(null);
  const [err, setErr] = useState("");
  const lastReady = useRef<string>("");
  const [flash, setFlash] = useState<string | null>(null);
  const now = useClock();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await getCall<D>("hospital_vvs.api.pharmacy.display", { key });
        if (!alive) return;
        setD(r); setErr("");
        const top = r.ready?.[0]?.token;
        if (top && top !== lastReady.current) {
          if (lastReady.current) { setFlash(top); chime(); setTimeout(() => setFlash(null), 6000); }
          lastReady.current = top;
        }
      } catch (e) { if (alive) setErr(humanizeError(e)); }
    };
    void load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [key]);
  if (err && !d) return <div className="flex h-screen items-center justify-center bg-slate-950 text-xl text-white/70">{err}</div>;
  if (!d) return <div className="h-screen bg-slate-950" />;
  const header = (
    <div className="flex items-center gap-4 px-8 py-5">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-3xl">🏥</div>
      <div className="min-w-0 flex-1"><div className="text-3xl font-black tracking-tight">{d.clinic}</div>{d.clinic_ur && <div className="urdu py-1 text-xl leading-[2.2] text-white/70">{d.clinic_ur}</div>}</div>
      <div className="text-end"><div className="text-4xl font-black tabular-nums">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div><div className="text-sm text-white/60">{now.toDateString()}</div></div>
    </div>
  );
  const shell = (body: React.ReactNode, tone: string) => <div className={cn("flex h-screen flex-col overflow-hidden text-white", tone)}>{header}<div className="min-h-0 flex-1 px-8 pb-8">{body}</div>{err && <div className="bg-rose-600 px-4 py-1 text-center text-sm">Connection lost — retrying…</div>}</div>;

  if (d.type === "Customer Display") {
    const s = d.state;
    return shell(
      s.state === "done" ? <div className="flex h-full flex-col items-center justify-center text-center"><div className="text-3xl text-white/70">Thank you!</div>
        {s.token && <><div className="mt-6 text-2xl uppercase tracking-[0.4em] text-white/60">Your token</div><div className="text-[12rem] font-black leading-none tracking-wider">{s.token}</div></>}
        <div className="mt-6 text-4xl font-bold">{rs(s.total)}{s.change ? <span className="ms-6 text-emerald-300">Change {rs(s.change)}</span> : null}</div></div>
      : s.state === "cart" && s.lines?.length ? <div className="grid h-full grid-cols-[1fr_420px] gap-6">
        <div className="overflow-hidden rounded-3xl bg-white/5 p-6"><div className="mb-3 flex items-center gap-2 text-xl text-white/70"><ShoppingBag className="h-6 w-6" />{d.counter?.counter_name}</div>
          <div className="space-y-2 overflow-y-auto">{s.lines.map((l, i) => <div key={i} className="flex items-center justify-between rounded-2xl bg-white/5 px-5 py-3 text-2xl"><span>{l.name} <span className="text-lg text-white/60">× {l.qty} {l.uom}</span></span><span className="font-bold tabular-nums">{rs(l.amount)}</span></div>)}</div></div>
        <div className="flex flex-col justify-end rounded-3xl bg-gradient-to-br from-sky-600 to-emerald-600 p-8"><div className="text-2xl text-white/80">Items {rs(s.total)}</div>{s.discount ? <div className="text-2xl text-white/80">Discount -{rs(s.discount)}</div> : null}
          <div className="mt-4 text-xl uppercase tracking-widest text-white/70">To pay</div><div className="text-8xl font-black tabular-nums">{rs(s.net)}</div></div></div>
      : <div className="flex h-full flex-col items-center justify-center text-center"><Pill className="h-24 w-24 text-white/30" /><div className="mt-6 text-5xl font-bold">Welcome</div><div className="urdu mt-2 text-4xl text-white/70">خوش آمدید</div><div className="mt-4 text-xl text-white/50">{d.counter?.counter_name}</div></div>,
      "bg-gradient-to-br from-[#062a3a] via-slate-950 to-[#04281f]");
  }

  if (d.type === "Queue Display" || d.type === "Kiosk") return shell(
    <div className="grid h-full grid-cols-[1.3fr_1fr] gap-6">
      <div className="flex flex-col rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3 text-3xl font-black"><Volume2 className="h-8 w-8" />Please collect <span className="urdu ms-auto text-3xl font-normal">دوائی وصول کریں</span></div>
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-4">{d.ready.slice(0, 8).map((r) => (
          <div key={r.token} className={cn("flex items-center justify-between rounded-2xl bg-white/15 px-6 py-5", flash === r.token && "animate-pulse bg-white text-emerald-800")}>
            <span className="text-6xl font-black tracking-wider">{r.token}</span><span className="text-end"><span className="block text-sm uppercase text-current opacity-70">Counter</span><span className="text-5xl font-black">{r.counter}</span></span></div>))}
          {!d.ready.length && <div className="col-span-2 pt-16 text-center text-3xl text-white/60">—</div>}</div>
      </div>
      <div className="flex flex-col rounded-3xl bg-white/5 p-6"><div className="mb-4 flex items-center gap-3 text-3xl font-black text-white/80"><Clock className="h-8 w-8" />Preparing <span className="urdu ms-auto text-2xl font-normal">تیار ہو رہی ہے</span></div>
        <div className="grid auto-rows-min grid-cols-3 gap-3">{d.preparing.slice(0, 24).map((p) => <div key={p.token} className="rounded-xl bg-white/10 py-3 text-center text-3xl font-bold tracking-wide">{p.token}</div>)}</div></div>
      {flash && <div className="pointer-events-none fixed inset-0 flex items-center justify-center bg-emerald-700/90"><div className="text-center"><div className="text-4xl uppercase tracking-[0.4em]">Token</div><div className="text-[14rem] font-black leading-none">{flash}</div><div className="text-5xl">Counter {d.ready[0]?.counter}</div></div></div>}
    </div>, "bg-gradient-to-br from-slate-950 via-[#062a3a] to-slate-950");

  if (d.type === "Waiting Display") return shell(
    <div className="grid h-full auto-rows-fr grid-cols-2 gap-5 xl:grid-cols-3">{d.opd.doctors.map((x, i) => (
      <div key={i} className="flex flex-col rounded-3xl bg-white/5 p-5"><div className="text-2xl font-bold">{x.doctor}</div><div className="text-white/60">Room {x.room ?? "—"} · {x.waiting} waiting</div>
        <div className="mt-3 flex flex-1 items-center gap-6 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-700 px-6"><span className="text-xl uppercase text-white/70">Now</span><span className="text-8xl font-black">{x.now?.token ?? "—"}</span>{x.now?.name && <span className="text-2xl">{x.now.name}</span>}</div>
        <div className="mt-3 flex gap-2">{x.next.map((n) => <span key={n.token} className="rounded-xl bg-white/10 px-4 py-2 text-2xl font-bold">{n.token}</span>)}</div></div>))}
      {!d.opd.doctors.length && <div className="col-span-full pt-24 text-center text-3xl text-white/50">No clinics running</div>}</div>, "bg-gradient-to-br from-slate-950 to-[#04281f]");

  if (d.type === "Ward Display") {
    const tone: Record<string, string> = { Available: "bg-emerald-500", Occupied: "bg-rose-500", Reserved: "bg-amber-500", Cleaning: "bg-sky-500", Maintenance: "bg-slate-500" };
    return shell(
      <div className="flex h-full flex-col gap-4 overflow-y-auto">
        <div className="flex flex-wrap gap-3">{Object.entries(d.ward.totals ?? {}).map(([k, v]) => <span key={k} className="rounded-2xl bg-white/10 px-4 py-2 text-xl"><b className="text-3xl">{v}</b> {k}</span>)}</div>
        {d.ward.wards.map((w) => (
          <div key={w.name} className="rounded-3xl bg-white/5 p-4"><div className="mb-3 flex items-center gap-2 text-2xl font-bold"><BedDouble className="h-6 w-6" />{w.ward_name}{w.ward_name_ur && <span className="urdu ms-3 text-xl font-normal text-white/60">{w.ward_name_ur}</span>}</div>
            <div className="grid grid-cols-6 gap-3 xl:grid-cols-10">{d.ward.beds.filter((b) => b.ward === w.name).map((b) => (
              <div key={b.name} className={cn("rounded-2xl p-3 text-center", tone[b.status] ?? "bg-slate-600")}><div className="text-2xl font-black">{b.bed_no}</div><div className="text-sm font-semibold">{b.label ?? b.status}</div></div>))}</div></div>))}
      </div>, "bg-gradient-to-br from-slate-950 to-[#1e1147]");
  }
  return shell(<div className="pt-24 text-center text-3xl">{d.name}</div>, "bg-slate-950");
}

function chime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    [880, 1320].forEach((f, i) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = f; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.25); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.6); o.start(ctx.currentTime + i * 0.25); o.stop(ctx.currentTime + i * 0.25 + 0.6); });
  } catch { /* audio blocked until the screen is tapped once */ }
}
