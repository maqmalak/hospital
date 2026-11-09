import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, HeartPulse, Maximize2, Pill, ShieldCheck } from "lucide-react";
import { cn } from "@/utils/cn";

/** One customer-facing screen for every counter (pharmacy, reception, display devices), in the Restaurant OS style:
 * glass panels, serif display numbers, the last line highlighted, totals that glide, a thank-you that returns to idle. */
export interface CfLine { name: string; sub?: string; qty?: number; uom?: string; amount: number }
export type CfState =
  | { kind: "idle" }
  | { kind: "cart"; customer?: string; lines: CfLine[]; subtotal: number; discount?: number; total: number; note?: string }
  | { kind: "pay"; customer?: string; total: number; paid: number; change: number }
  | { kind: "done"; customer?: string; total: number; change: number; tokens?: { label?: string; token: string | number; sub?: string }[]; note?: string; at?: number };

const DONE_SECONDS = 15;
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@300;400;500;600;700&display=swap');
.cfd { font-family: Inter, system-ui, sans-serif; font-feature-settings: "tnum" 1; }
.cfd .serif { font-family: Fraunces, Georgia, serif; letter-spacing: -0.01em; }
.cfd .glass { background: linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.03)); backdrop-filter: blur(22px) saturate(140%);
  border: 1px solid rgba(255,255,255,.10); box-shadow: 0 30px 80px -30px rgba(0,0,0,.6); }
.cfd .mint { background: linear-gradient(120deg, #d1fae5 0%, #6ee7b7 45%, #22d3ee 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
@keyframes cfd-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes cfd-slide { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: none; } }
@keyframes cfd-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
@keyframes cfd-ring { from { stroke-dashoffset: 302; } to { stroke-dashoffset: 0; } }
@keyframes cfd-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
.cfd .rise { animation: cfd-rise .7s cubic-bezier(.2,.7,.2,1) both; }
.cfd .slide { animation: cfd-slide .6s cubic-bezier(.2,.7,.2,1) both; }
.cfd .pop { animation: cfd-pop .7s cubic-bezier(.2,.7,.2,1) both; }
.cfd .ring { stroke-dasharray: 302; animation: cfd-ring .9s .2s ease-out both; }
.cfd .float { animation: cfd-float 6s ease-in-out infinite; }
.cfd ::-webkit-scrollbar { width: 0; }
@media (prefers-reduced-motion: reduce) { .cfd * { animation-duration: .01ms !important; } }
`;

function useTween(value: number, ms = 450) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value;
    let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - start) / ms); setShown(a + (b - a) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); else from.current = b; };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [value, ms]);
  return shown;
}

export function CustomerFacing({ state, clinic, clinicUr, place, idleIcon = "pill", banner }: { state: CfState; clinic: string; clinicUr?: string; place?: string; idleIcon?: "pill" | "heart"; banner?: ReactNode }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s: CfState = state.kind === "done" && state.at && now - state.at > DONE_SECONDS * 1000 ? { kind: "idle" } : state;
  const [hint, setHint] = useState(true);
  const goFull = () => { void document.documentElement.requestFullscreen?.().catch(() => undefined); setHint(false); };
  const t = new Date(now);
  return (
    <div className="cfd relative h-screen w-screen select-none overflow-hidden bg-[#04110f] text-[#ecfdf5]" onDoubleClick={goFull}>
      <style>{STYLE}</style>
      <div className="pointer-events-none absolute -left-40 -top-40 h-[42rem] w-[42rem] rounded-full bg-emerald-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-52 right-0 h-[38rem] w-[38rem] rounded-full bg-sky-500/10 blur-[130px]" />
      <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-4 px-10 pt-7">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-500 text-[#04110f] shadow-lg"><HeartPulse className="h-6 w-6" /></span>
        <div className="min-w-0"><div className="serif text-2xl font-semibold leading-tight">{clinic}</div>
          <div className="truncate text-xs uppercase tracking-[0.25em] text-white/45">{place}{clinicUr ? <span className="ms-3 font-urdu normal-case tracking-normal">{clinicUr}</span> : null}</div></div>
        <div className="ms-auto text-end"><div className="text-3xl font-light tabular-nums">{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="text-xs uppercase tracking-[0.25em] text-white/40">{t.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</div></div>
      </header>
      <main className="relative z-10 h-full">
        {s.kind === "cart" && <Cart s={s} />}
        {s.kind === "pay" && <Pay s={s} />}
        {s.kind === "done" && <Done key={String(s.at)} s={s} />}
        {s.kind === "idle" && <Idle icon={idleIcon} />}
      </main>
      {banner}
      {hint && s.kind === "idle" && <button onClick={goFull} className="absolute bottom-6 end-8 z-30 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-widest text-white/50 backdrop-blur hover:bg-white/10">
        <Maximize2 className="h-3.5 w-3.5" /> Full screen · double-click</button>}
    </div>
  );
}

function Cart({ s }: { s: Extract<CfState, { kind: "cart" }> }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [s.lines.length]);
  const total = useTween(s.total);
  const count = s.lines.reduce((a, l) => a + (l.qty ?? 1), 0);
  return (
    <div className="relative grid h-full grid-cols-[1fr_32rem] gap-10 px-10 pb-10 pt-32">
      <section className="flex min-h-0 flex-col">
        <div className="rise mb-6 flex items-end justify-between">
          <div><div className="text-xs uppercase tracking-[0.3em] text-white/40">Your bill</div>
            <div className="serif mt-1 text-4xl font-semibold">{s.customer && !/walk-in/i.test(s.customer) ? <>Get well soon, <span className="mint">{s.customer.split(" ")[0]}</span></> : "Get well soon"}</div></div>
          <div className="text-end text-sm text-white/45">{count} item{count === 1 ? "" : "s"}</div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pe-2">
          {s.lines.map((l, i) => (
            <div key={`${i}-${l.name}`} className={cn("slide flex items-center gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 pe-6 transition-colors duration-700",
              i === s.lines.length - 1 && "border-emerald-300/30 bg-emerald-300/[0.07]")}>
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/40"><Pill className="h-7 w-7" /></div>
              <div className="min-w-0 flex-1"><div className="truncate text-2xl font-medium">{l.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-base text-white/45">{l.qty != null && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-semibold text-white/80 tabular-nums">× {l.qty}{l.uom && l.uom !== "Nos" ? ` ${l.uom}` : ""}</span>}{l.sub && <span className="truncate">{l.sub}</span>}</div></div>
              <div className="text-2xl font-semibold tabular-nums">{rs(l.amount)}</div>
            </div>))}
          <div ref={end} />
        </div>
      </section>
      <aside className="glass rise flex flex-col rounded-[2rem] p-8" style={{ animationDelay: ".1s" }}>
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-emerald-300/15 to-transparent px-4 py-3 text-lg"><ShieldCheck className="h-5 w-5 text-emerald-300" />Checked by our pharmacist · batch and expiry on your receipt</div>
        {s.note && <div className="mt-2 rounded-xl bg-white/5 px-4 py-3 text-base text-white/70">{s.note}</div>}
        <div className="mt-auto space-y-3 text-lg">
          <Row label="Subtotal" value={rs(s.subtotal)} />
          {s.discount ? <Row label="You save" value={`− ${rs(s.discount)}`} tone="text-emerald-300" /> : null}
        </div>
        <div className="mt-6 border-t border-white/10 pt-6"><div className="text-xs uppercase tracking-[0.3em] text-white/40">Total · کل رقم</div>
          <div className="serif mt-1 text-[5.5rem] font-semibold leading-none tabular-nums"><span className="mint">{rs(total)}</span></div></div>
      </aside>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={cn("flex items-baseline justify-between", tone ?? "text-white/60")}><span>{label}</span><span className="tabular-nums text-white/85">{value}</span></div>;
}

function Pay({ s }: { s: Extract<CfState, { kind: "pay" }> }) {
  const due = useTween(s.total);
  const left = Math.max(0, s.total - s.paid);
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 pt-16 text-center">
      <div className="rise text-sm uppercase tracking-[0.35em] text-white/45">Amount to pay · ادائیگی</div>
      <div className="serif rise mt-3 text-[10rem] font-semibold leading-none tabular-nums" style={{ animationDelay: ".08s" }}><span className="mint">{rs(due)}</span></div>
      <div className="rise mt-12 grid grid-cols-2 gap-6" style={{ animationDelay: ".2s" }}>
        <Tile label="Paid" value={rs(s.paid)} />
        {s.change > 0 ? <Tile label="Your change" value={rs(s.change)} accent="text-emerald-300" /> : <Tile label="Remaining" value={rs(left)} accent={left ? "text-amber-300" : "text-emerald-300"} />}
      </div>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return <div className="glass min-w-[18rem] rounded-3xl px-10 py-7"><div className="text-xs uppercase tracking-[0.3em] text-white/45">{label}</div><div className={cn("serif mt-2 text-6xl font-semibold tabular-nums", accent)}>{value}</div></div>;
}

function Done({ s }: { s: Extract<CfState, { kind: "done" }> }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 pt-16 text-center">
      <svg viewBox="0 0 110 110" className="pop h-28 w-28"><circle cx="55" cy="55" r="48" fill="none" stroke="rgba(110,231,183,.18)" strokeWidth="6" />
        <circle cx="55" cy="55" r="48" fill="none" stroke="#6ee7b7" strokeWidth="6" strokeLinecap="round" className="ring" transform="rotate(-90 55 55)" />
        <path d="M36 57 l13 13 l25 -28" fill="none" stroke="#6ee7b7" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div className="serif rise mt-6 text-6xl font-semibold">Thank you <span className="font-urdu text-5xl font-normal text-white/70">· شکریہ</span></div>
      <div className="rise mt-3 text-2xl text-white/60" style={{ animationDelay: ".1s" }}>{rs(s.total)}{s.change > 0 && <span className="ms-4 text-emerald-300">Change {rs(s.change)}</span>}</div>
      {s.tokens?.length ? <div className="rise mt-10 flex flex-wrap justify-center gap-5" style={{ animationDelay: ".2s" }}>{s.tokens.map((t, i) => (
        <div key={i} className="glass rounded-[2rem] px-12 py-6"><div className="text-sm uppercase tracking-[0.35em] text-white/50">{t.label ?? "Your token"}</div>
          <div className="serif text-[8rem] font-semibold leading-none tracking-wider"><span className="mint">{t.token || "—"}</span></div>{t.sub && <div className="text-lg text-white/60">{t.sub}</div>}</div>))}</div> : null}
      {s.note && <div className="rise mt-8 inline-flex items-center gap-2 rounded-full bg-white/5 px-5 py-2 text-lg text-white/70" style={{ animationDelay: ".3s" }}><BadgeCheck className="h-5 w-5 text-emerald-300" />{s.note}</div>}
    </div>
  );
}

function Idle({ icon }: { icon: "pill" | "heart" }) {
  const I = icon === "heart" ? HeartPulse : Pill;
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="float flex h-40 w-40 items-center justify-center rounded-[2.5rem] bg-gradient-to-br from-emerald-400/20 to-sky-500/20 ring-1 ring-white/10"><I className="h-20 w-20 text-emerald-200" /></div>
      <div className="serif rise mt-10 text-7xl font-semibold">Welcome</div>
      <div className="rise mt-2 font-urdu text-5xl text-white/70" style={{ animationDelay: ".1s" }}>خوش آمدید</div>
      <div className="rise mt-8 text-lg uppercase tracking-[0.3em] text-white/35" style={{ animationDelay: ".2s" }}>Your health, our care</div>
    </div>
  );
}
