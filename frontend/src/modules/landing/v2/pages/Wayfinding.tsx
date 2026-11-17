import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpDown, Download, MapPin, Search, X } from "lucide-react";
import { printHtml, esc } from "@/lib/print";
import { lhCss, lhPage } from "@/lib/letterhead";
import { FLOORS, PHOTOS, ZONES, type Floor, type Place } from "../content";
import { useS2, Wrap } from "../SiteV2";
import { btn, card, PageHero, Reveal, useTitle } from "../ui";

/** Floor-plan geometry: one corridor, lifts at the start, rooms alternate above / below it. */
const W = 800, H = 360, CY0 = 158, CY1 = 202, LIFT = { x: 30, w: 80 };
function layout(f: Floor) {
  const n = Math.max(1, Math.ceil(f.places.length / 2));
  const cw = (W - 30 - (LIFT.x + LIFT.w + 16)) / n;
  return f.places.map((p, i) => {
    const top = i % 2 === 0; const col = Math.floor(i / 2);
    const x = LIFT.x + LIFT.w + 16 + col * cw + 6;
    return { p, top, x, y: top ? 34 : CY1 + 14, w: cw - 12, h: CY0 - 48, cx: x + (cw - 12) / 2 };
  });
}

export default function Wayfinding() {
  const { site } = useS2();
  useTitle("Hospital map", "Floor-by-floor map of Lyallpur Medical Complex — find departments, the laboratory, pharmacy, ICU, wards, prayer room, ATM and parking.");
  const [params, setParams] = useSearchParams();
  const [floorId, setFloorId] = useState("G");
  const [sel, setSel] = useState<string>("");
  const [q, setQ] = useState("");
  const all = useMemo(() => FLOORS.flatMap((f) => f.places.map((p) => ({ f, p }))), []);
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); return t ? all.filter(({ p }) => `${p.name} ${p.keywords ?? ""}`.toLowerCase().includes(t)).slice(0, 8) : []; }, [q, all]);
  const pick = (f: Floor, p?: Place) => { setFloorId(f.id); setSel(p?.id ?? ""); if (p) setParams({ q: p.id }, { replace: true }); };
  useEffect(() => {
    const id = params.get("q");
    if (!id) return;
    const hit = all.find(({ p }) => p.id === id) ?? all.find(({ p }) => `${p.name} ${p.keywords ?? ""}`.toLowerCase().includes(id.toLowerCase()));
    if (hit) { setFloorId(hit.f.id); setSel(hit.p.id); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const floor = FLOORS.find((f) => f.id === floorId)!;
  const rooms = layout(floor);
  const target = rooms.find((r) => r.p.id === sel);
  const route = target ? `M ${LIFT.x + LIFT.w} ${(CY0 + CY1) / 2} L ${target.cx} ${(CY0 + CY1) / 2} L ${target.cx} ${target.top ? target.y + target.h : target.y}` : "";
  const directions = target ? (floor.id === "G" ? `From the main entrance, walk along the ground-floor corridor — ${target.p.name} is on your ${target.top ? "left" : "right"}.`
    : `From the main entrance, take the lifts to the ${floor.label.toLowerCase()}. Walk along the corridor — ${target.p.name} is on your ${target.top ? "left" : "right"}.`) : "";

  const download = () => {
    const rows = [...FLOORS].reverse().map((f) => `<tr><td class="fl">${esc(f.label)}</td><td>${f.places.map((p) => `<span class="pl" style="border-color:${ZONES[p.zone].color}"><i style="background:${ZONES[p.zone].color}"></i>${esc(p.name)}</span>`).join("")}</td></tr>`).join("");
    const legend = Object.values(ZONES).map((z) => `<span class="pl"><i style="background:${z.color}"></i>${esc(z.label)}</span>`).join("");
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><style>${lhCss("A4")}body{font:11px/1.5 Arial,sans-serif;color:#14262E}
      table.fg{width:100%;border-collapse:collapse}table.fg td{border-bottom:1px solid #E1EAEB;padding:7px 6px;vertical-align:top}.fl{width:110px;font-weight:700;color:#0E5E6F}
      .pl{display:inline-flex;align-items:center;gap:5px;border:1px solid #E1EAEB;border-left-width:3px;border-radius:6px;padding:2px 7px;margin:2px 4px 2px 0}.pl i{width:7px;height:7px;border-radius:50%;display:inline-block}
      .lg{margin:6px 0 10px}</style></head><body>${lhPage(`<div class="lg">${legend}</div><table class="fg">${rows}</table>
      <p style="margin-top:10px;color:#5B7083">Emergency is on the ground floor with its own entrance. Lifts and stairs serve every floor. Ask any staff member if you need help.</p>`, site?.clinic, { title: "Hospital floor guide", footRight: "Floor guide" })}</body></html>`);
  };

  return (
    <>
      <PageHero eyebrow="Wayfinding" title="Find your way around" sub="Pick a floor, or search for a department or facility — we'll show you where it is and how to get there." img={PHOTOS.corridor}>
        <div className="relative max-w-lg">
          <label className="flex items-center gap-3 rounded-full border border-white/25 bg-white/10 px-5 backdrop-blur-md focus-within:ring-4 focus-within:ring-white/20">
            <Search className="h-5 w-5 text-white/70" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where is… radiology, pharmacy, ATM" aria-label="Search the hospital map" className="h-[52px] flex-1 bg-transparent text-white outline-none placeholder:text-white/60" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Clear"><X className="h-5 w-5 text-white/70" /></button>}
          </label>
          {hits.length > 0 && <ul className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl">
            {hits.map(({ f, p }) => <li key={p.id}><button type="button" onClick={() => { pick(f, p); setQ(""); }} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-start hover:bg-[var(--soft)]">
              <span className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ZONES[p.zone].color }} />{p.name}</span><span className="text-sm text-[var(--muted)]">{f.label}</span></button></li>)}</ul>}
        </div>
      </PageHero>
      <section className="py-14">
        <Wrap className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Reveal className={`${card} h-fit p-4 hover:translate-y-0`}>
            <div className="mb-3 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]"><ArrowUpDown className="h-4 w-4" />Floors</div>
            <div className="flex flex-col gap-1.5" role="tablist" aria-label="Floors">
              {[...FLOORS].reverse().map((f) => { const has = f.places.some((p) => p.id === sel); return (
                <button key={f.id} type="button" role="tab" aria-selected={f.id === floorId} onClick={() => pick(f)}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition ${f.id === floorId ? "bg-[var(--primary)] text-white shadow-lg" : "hover:bg-[var(--soft)]"}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${f.id === floorId ? "bg-white/20" : "bg-[var(--mint)] text-[var(--primary)]"}`}>{f.id}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{f.label}</span><span className={`block truncate text-xs ${f.id === floorId ? "text-white/70" : "text-[var(--muted)]"}`}>{f.places.slice(0, 2).map((p) => p.name).join(", ")}</span></span>
                  {has && <MapPin className="h-4 w-4 text-[var(--accent)]" />}
                </button>); })}
            </div>
          </Reveal>
          <div className="min-w-0 space-y-5">
            <Reveal className={`${card} overflow-hidden p-4 hover:translate-y-0 sm:p-6`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="s2-display text-2xl">{floor.label}</h2>
                <button type="button" onClick={download} className={`${btn.ghost} py-2.5 text-sm`}><Download className="h-4 w-4" />Download map (PDF)</button>
              </div>
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label={`${floor.label} plan`}>
                  <rect x="10" y="14" width={W - 20} height={H - 28} rx="22" fill="var(--soft)" stroke="var(--line)" />
                  <rect x={LIFT.x} y={CY0} width={W - 50} height={CY1 - CY0} rx="10" fill="var(--surface)" stroke="var(--line)" />
                  <text x={W / 2 + 40} y={(CY0 + CY1) / 2 + 4} textAnchor="middle" fontSize="11" fill="var(--muted)" letterSpacing="3">MAIN CORRIDOR</text>
                  <rect x={LIFT.x} y={CY0 - 34} width={LIFT.w} height={CY1 - CY0 + 68} rx="12" fill="#0E5E6F" />
                  <text x={LIFT.x + LIFT.w / 2} y={(CY0 + CY1) / 2 - 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">LIFTS</text>
                  <text x={LIFT.x + LIFT.w / 2} y={(CY0 + CY1) / 2 + 12} textAnchor="middle" fontSize="10" fill="#cfe9ea">& stairs</text>
                  {rooms.map((r) => { const z = ZONES[r.p.zone]; const on = r.p.id === sel; return (
                    <g key={r.p.id} onClick={() => pick(floor, r.p)} className="cursor-pointer" role="button" tabIndex={0} aria-label={r.p.name} onKeyDown={(e) => e.key === "Enter" && pick(floor, r.p)}>
                      <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="14" fill={on ? z.color : "var(--surface)"} stroke={z.color} strokeWidth={on ? 3 : 1.5} />
                      <rect x={r.x} y={r.top ? r.y + r.h - 6 : r.y} width={r.w} height="6" fill={z.color} opacity={on ? 0 : 0.85} />
                      <foreignObject x={r.x + 6} y={r.y + 10} width={r.w - 12} height={r.h - 20}>
                        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, color: on ? "#fff" : "var(--ink)", fontFamily: "inherit" }}>{r.p.name}</div>
                      </foreignObject>
                    </g>); })}
                  {route && <path d={route} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 8" className="s2-route" />}
                  {target && <circle cx={target.cx} cy={target.top ? target.y + target.h : target.y} r="7" fill="var(--accent)" stroke="#fff" strokeWidth="3" />}
                </svg>
              </div>
              <style>{`.s2-route{animation:s2dash 1.2s linear infinite}@keyframes s2dash{to{stroke-dashoffset:-36}}@media (prefers-reduced-motion: reduce){.s2-route{animation:none}}`}</style>
              {directions && <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[var(--mint)] p-4" role="status"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" /><p className="text-[15px]">{directions}</p></div>}
            </Reveal>
            <Reveal className="flex flex-wrap gap-2">{Object.values(ZONES).map((z) => <span key={z.label} className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color }} />{z.label}</span>)}</Reveal>
            <p className="text-xs text-[var(--muted)]">Simplified floor guide — not to scale. Staff at reception and on every floor are happy to help.</p>
          </div>
        </Wrap>
      </section>
    </>
  );
}
