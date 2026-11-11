import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, EyeOff, Lock, ShieldAlert, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { call, humanizeError, useApi } from "@/lib/api";
import { Empty, Field, inputCls, Section } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Hero, ModesCard } from "./ShiftPage";
import { type ModeRow, type MyShift, rs } from "./shared";

interface Closing { name: string; status: string; total_expected: number; total_counted: number; difference: number; modes: ModeRow[]; tolerance: number; decision_note?: string; pos_closing_entry?: string; journal_entry?: string }

export default function ClosePage() {
  const { data } = useApi<MyShift>("cash.my_shift");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Closing | null>(null);
  // card / JazzCash / Easypaisa / bank are recorded by the system: prefill them, the cashier only corrects against the slip
  useEffect(() => {
    const rows = (data?.shift?.modes ?? []).filter((m) => m.mode_of_payment !== "Cash");
    if (rows.length) setOther((o) => ({ ...Object.fromEntries(rows.map((m) => [m.mode_of_payment, String(Math.round(m.expected))])), ...o }));
  }, [data?.shift?.shift]);
  const cashTotal = useMemo(() => (data?.denominations ?? []).reduce((s, d) => s + d * (Number(counts[d]) || 0), 0), [counts, data]);
  if (!data) return <div className="h-96 animate-pulse rounded-3xl bg-muted" />;
  if (!data.shift && !result) return <div className="mx-auto max-w-xl"><Empty title="No open shift" hint="Open a shift first." icon={Wallet} /><Link to="/cash/shift" className="mt-3 block text-center text-primary">Open shift →</Link></div>;
  const otherModes = (data.shift?.modes ?? []).filter((m) => m.mode_of_payment !== "Cash" && (m.collections || m.opening)).map((m) => m.mode_of_payment);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await call<Closing>("cash.close", { counts: Object.fromEntries(Object.entries(counts).filter(([, v]) => Number(v))), other_modes: Object.fromEntries(Object.entries(other).map(([k, v]) => [k, Number(v) || 0])), explanation });
      setResult(r);
      toast(r.status === "Pending Approval" ? "Waiting for the supervisor" : "Shift closed", { icon: r.status === "Pending Approval" ? "⏳" : "✅" });
    } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); }
  };

  if (result) {
    const diff = Math.round(result.difference);
    const tone = diff === 0 ? "from-emerald-600 to-teal-600" : Math.abs(diff) <= result.tolerance ? "from-sky-600 to-indigo-600" : "from-rose-600 to-orange-500";
    return (
      <div className="mx-auto max-w-4xl">
        <div className={cn("mb-5 rounded-3xl bg-gradient-to-br p-6 text-center text-white shadow-lg", tone)}>
          {result.status === "Pending Approval" ? <ShieldAlert className="mx-auto h-10 w-10" /> : <CheckCircle2 className="mx-auto h-10 w-10" />}
          <div className="mt-2 text-sm uppercase tracking-widest text-white/80">{diff === 0 ? "Balanced" : diff > 0 ? "Excess" : "Short"}</div>
          <div className="text-5xl font-black tabular-nums">{diff === 0 ? "✓" : rs(Math.abs(diff))}</div>
          <div className="mt-1 text-white/85">{result.status === "Pending Approval" ? "Beyond the tolerance — the cash supervisor must approve." : `${result.status} · POS closing ${result.pos_closing_entry ?? ""}`}</div>
        </div>
        <Section title="Expected vs counted">
          <table className="w-full text-sm"><thead><tr className="border-b border-border text-xs uppercase text-muted-foreground"><th className="py-2 text-start">Mode</th><th className="text-end">Opening</th><th className="text-end">Collections</th><th className="text-end">Pay in</th><th className="text-end">Pay out</th><th className="text-end">Drops</th><th className="text-end">Expected</th><th className="text-end">Counted</th><th className="text-end">Difference</th></tr></thead>
            <tbody>{result.modes.filter((m) => m.expected || m.counted).map((m) => <tr key={m.mode_of_payment} className="border-b border-border/60"><td className="py-2 font-semibold">{m.mode_of_payment}</td>
              {[m.opening, m.collections, m.pay_in, m.pay_out, m.cash_drop, m.expected, m.counted].map((v, i) => <td key={i} className="text-end tabular-nums">{rs(v)}</td>)}
              <td className={cn("text-end font-bold tabular-nums", (m.difference ?? 0) < 0 ? "text-rose-600" : (m.difference ?? 0) > 0 ? "text-sky-600" : "text-emerald-600")}>{rs(m.difference)}</td></tr>)}</tbody></table>
          <div className="mt-3 text-sm text-muted-foreground">Cash to hand to the safe: <b className="text-foreground">{rs(Math.max((result.modes.find((m) => m.mode_of_payment === "Cash")?.counted ?? 0) - (result.modes.find((m) => m.mode_of_payment === "Cash")?.opening ?? 0), 0))}</b> · float kept: {rs(result.modes.find((m) => m.mode_of_payment === "Cash")?.opening)}</div>
        </Section>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl">
      <Hero title={`Close ${data.shift?.counter}`} sub="Count the drawer." />
      {data.closing?.status === "Recount" && <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-500/10">The supervisor asked for a recount: {data.closing.decision_note}</div>}
      {data.shift && <ModesCard modes={data.shift.modes} className="mb-4" />}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Section title={<span className="flex items-center gap-2">Cash by denomination {data.blind ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : null}</span>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.denominations.map((d) => (
              <div key={d} className="rounded-2xl border border-border p-3">
                <div className="mb-1 flex items-center justify-between"><span className={cn("rounded-lg px-2 py-0.5 text-sm font-extrabold text-white", d >= 1000 ? "bg-emerald-700" : d >= 100 ? "bg-teal-600" : d >= 10 ? "bg-sky-600" : "bg-slate-500")}>Rs {d.toLocaleString()}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{rs(d * (Number(counts[d]) || 0))}</span></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCounts((c) => ({ ...c, [d]: String(Math.max((Number(c[d]) || 0) - 1, 0)) }))} className="h-10 w-10 rounded-lg border border-border text-lg font-bold">−</button>
                  <input className="h-10 w-full rounded-lg border border-input bg-[hsl(var(--input-bg))] text-center text-lg font-bold tabular-nums" inputMode="numeric" value={counts[d] ?? ""} placeholder="0" onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value.replace(/\D/g, "") }))} />
                  <button onClick={() => setCounts((c) => ({ ...c, [d]: String((Number(c[d]) || 0) + 1) }))} className="h-10 w-10 rounded-lg border border-border text-lg font-bold">+</button>
                </div>
              </div>))}
          </div>
        </Section>
        <div className="space-y-4">
          <div className="rounded-3xl bg-gradient-to-br from-slate-800 to-slate-950 p-5 text-white shadow-lg"><div className="text-xs uppercase tracking-widest text-white/60">Cash counted</div><div className="text-4xl font-black tabular-nums">{rs(cashTotal)}</div></div>
          {otherModes.length > 0 && <Section title="Card / online (auto-filled)">
            <p className="mb-2 text-xs text-muted-foreground">Filled from the system. Change only if the terminal / JazzCash slip differs.</p>
            {otherModes.map((m) => { const exp = Math.round(data.shift?.modes.find((x) => x.mode_of_payment === m)?.expected ?? 0); const edited = other[m] !== undefined && Number(other[m] || 0) !== exp;
              return <Field key={m} label={m} className="mb-2"><div className="flex items-center gap-2"><input className={inputCls + " text-end tabular-nums" + (edited ? " border-amber-400" : "")} inputMode="numeric" value={other[m] ?? ""} onChange={(e) => setOther((o) => ({ ...o, [m]: e.target.value.replace(/\D/g, "") }))} />
                {edited && <button type="button" className="shrink-0 text-xs text-primary" onClick={() => setOther((o) => ({ ...o, [m]: String(exp) }))}>Reset</button>}</div></Field>; })}
          </Section>}
          <Section><Field label="Explanation (if it does not balance)"><textarea className={inputCls + " h-20 py-2"} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field></Section>
          <Button variant="submit" size="lg" className="h-12 w-full" loading={busy} onClick={() => void submit()}><Lock className="h-5 w-5" />Submit count</Button>
        </div>
      </div>
    </div>
  );
}
