import { CheckCircle2, HeartPulse } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDisplayState } from "./offline";

const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;

/** Customer-facing screen for the reception counter (second monitor on the same PC, Restaurant OS style). */
export default function CounterDisplayPage() {
  const s = useDisplayState();
  const { boot } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-[#06302c] text-white">
      <header className="flex items-center gap-3 px-8 py-5"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500 text-2xl font-black">V</span>
        <div className="text-2xl font-extrabold">{boot?.clinic.name ?? "VVS Hospital"}</div></header>
      <main className="flex flex-1 items-center justify-center p-8">
        {s.kind === "idle" && <div className="text-center"><HeartPulse className="mx-auto mb-4 h-20 w-20 text-teal-300" /><div className="text-4xl font-bold">Welcome</div><div className="mt-2 font-urdu text-3xl text-teal-100">خوش آمدید</div></div>}
        {s.kind === "cart" && <div className="w-full max-w-3xl"><div className="mb-3 text-xl text-teal-100">{s.patient}</div>
          <div className="divide-y divide-white/10 rounded-3xl bg-white/5 p-6">{s.lines.map((l, i) => <div key={i} className="flex justify-between py-3 text-2xl"><span>{l.label}</span><span className="tabular-nums">{rs(l.amount)}</span></div>)}</div>
          <div className="mt-6 flex justify-between text-5xl font-black"><span>Total</span><span className="tabular-nums">{rs(s.total)}</span></div></div>}
        {s.kind === "pay" && <div className="text-center"><div className="text-3xl text-teal-100">{s.patient}</div><div className="mt-4 text-7xl font-black tabular-nums">{rs(s.total)}</div>
          <div className="mt-6 text-3xl">Paid {rs(s.paid)}{s.change ? ` · Change ${rs(s.change)}` : ""}</div></div>}
        {s.kind === "done" && <div className="text-center"><CheckCircle2 className="mx-auto mb-3 h-20 w-20 text-emerald-400" /><div className="text-4xl font-bold">Thank you · شکریہ</div>
          {s.change > 0 && <div className="mt-4 text-4xl">Change {rs(s.change)}</div>}
          <div className="mt-6 flex flex-wrap justify-center gap-4">{s.tokens.map((t, i) => <div key={i} className="rounded-3xl bg-white px-8 py-4 text-teal-900"><div className="text-lg">{t.doctor}{t.room ? ` · ${t.room}` : ""}</div><div className="text-7xl font-black">{t.token || "—"}</div></div>)}</div></div>}
      </main>
    </div>
  );
}
