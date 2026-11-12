/**
 * Process flow & DFD (/dfd): the hospital's data flow diagrams — level 0 (context), level 1 (whole hospital and each area) and the
 * patient-journey process flow — drawn by tools/guides/dfd_book.py in the sugarcane house style (D-64). Same diagrams as the PDF.
 */
import { useEffect, useState } from "react";
import { Download, Maximize2, Network, X } from "lucide-react";
import { cn } from "@/utils/cn";

interface D { n: number; title: string; sub: string; caption: string; level: number; file: string }
const BASE = "/assets/hospital_vvs/help";

export default function DfdPage() {
  const [list, setList] = useState<D[] | null>(null);
  const [level, setLevel] = useState<"all" | 0 | 1>("all");
  const [big, setBig] = useState<D | null>(null);
  useEffect(() => { void fetch(`${BASE}/dfd/index.json`, { cache: "no-cache" }).then((r) => r.json()).then(setList).catch(() => setList([])); }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setBig(null); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, []);
  const shown = (list ?? []).filter((d) => level === "all" || d.level === level);
  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#13213a] to-[#0f4c5c] p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Network className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-200">Start here</div>
            <h1 className="text-2xl font-bold tracking-tight">Process flow &amp; DFD</h1>
            <p className="text-sm text-white/80">The whole hospital as data flow diagrams — level 0 (who is outside the system and what passes between them), level 1 (the processes and their data stores) — and the patient journey.</p>
          </div>
          <a href={`${BASE}/process-flow-dfd.pdf`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 shadow hover:bg-white/90"><Download className="h-4 w-4" />PDF book</a>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {([["all", "All diagrams"], [0, "Level 0 · context"], [1, "Level 1 · processes"]] as const).map(([k, l]) => (
            <button key={String(k)} onClick={() => setLevel(k)} className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1", level === k ? "bg-white text-slate-900 ring-white" : "bg-white/10 text-white ring-white/25 hover:bg-white/20")}>{l}</button>))}
          <span className="ms-auto text-xs text-white/70">Circles = processes · blue boxes = outside the ERP · green open boxes = data stores · arrows = data flows</span>
        </div>
      </section>
      {!list && <div className="h-96 animate-pulse rounded-3xl bg-muted" />}
      {list && !list.length && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">The diagrams are not on this server yet (python3 tools/guides/dfd_book.py).</div>}
      <div className="grid gap-5 xl:grid-cols-2">
        {shown.map((d) => (
          <figure key={d.n} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-3 bg-[#13213a] px-4 py-2.5 text-white">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-xs font-bold">{d.n}</span>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{d.title}</div><div className="truncate text-[11px] text-slate-300">{d.sub}</div></div>
              <button onClick={() => setBig(d)} className="rounded-lg p-1.5 hover:bg-white/10" title="Full screen"><Maximize2 className="h-4 w-4" /></button>
            </div>
            <button onClick={() => setBig(d)} className="block w-full bg-white p-3"><img src={`${BASE}/dfd/${d.file}`} alt={d.title} className="w-full" loading="lazy" /></button>
            <figcaption className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{d.caption}</figcaption>
          </figure>))}
      </div>
      {big && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-black/85 p-4 backdrop-blur-sm" onClick={() => setBig(null)}>
          <div className="mb-2 flex items-center gap-3 text-white"><b className="flex-1">{big.n} · {big.title}</b><button className="rounded-lg p-1.5 hover:bg-white/10"><X className="h-5 w-5" /></button></div>
          <div className="flex-1 overflow-auto rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}><img src={`${BASE}/dfd/${big.file}`} alt={big.title} className="mx-auto w-full max-w-[1800px]" /></div>
          <p className="mt-2 text-center text-sm text-white/70">{big.caption}</p>
        </div>)}
    </div>
  );
}
