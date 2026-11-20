/**
 * Shift control (admin, D-97): every counter of the branch — open a shift for any cash staff member, close any open shift (counted cash or
 * the system figure), close all open shifts at day end, open all idle counters for their last cashier. Differences beyond tolerance go to
 * Cash approvals as usual. Every admin closing records who closed it and why.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Lock, LockOpen, RefreshCw, ShieldCheck, Unlock, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { call, useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { humanizeError } from "@/services/frappe";
import { Empty, Field, inputCls, PageHeader, StatCard } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Modal } from "@/modules/radiology/shared";

interface Mode { mode_of_payment: string; expected: number; opening: number; collections: number }
interface Counter { name: string; counter_name: string; counter_type?: string; number?: string; staff: { user: string; name: string }[]; last_user?: string | null;
  shift?: { name: string; user: string; user_name?: string; opened_at: string; old: boolean; expected: number; cash_expected: number; modes: Mode[]; invoices: number;
    pending?: { name: string; status: string; difference: number } | null } }
interface Board { branch: string; counters: Counter[]; tolerance: number; pending: { name: string; counter: string; user: string; difference: number }[] }
type Res = { shift?: string; counter?: string; ok: boolean; status?: string; message?: string };
const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;

export default function ControlPage() {
  const { branch } = useAuth();
  const { data, refetch, isFetching } = useApi<Board>("cash.shift_board", { branch }, { refetchInterval: 30_000 });
  const [openFor, setOpenFor] = useState<Counter | null>(null);
  const [closeFor, setCloseFor] = useState<Counter | null>(null);
  const [bulk, setBulk] = useState<"open" | "close" | null>(null);
  const list = data?.counters ?? [];
  const open = list.filter((c) => c.shift);
  const k = useMemo(() => ({ open: open.length, idle: list.length - open.length, cash: open.reduce((a, c) => a + (c.shift?.cash_expected ?? 0), 0), old: open.filter((c) => c.shift?.old).length }), [list, open]);
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="Shift control" icon={ShieldCheck} subtitle={`Admin · open and close cashier shifts on every counter · ${data?.branch ?? ""}`}
        actions={<>
          <Button variant="outline" size="sm" onClick={() => void refetch()} aria-label="Refresh"><RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /></Button>
          <Button variant="outline" size="sm" disabled={!k.idle} onClick={() => setBulk("open")}><Unlock className="h-4 w-4" />Open all idle</Button>
          <Button variant="danger" size="sm" disabled={!k.open} onClick={() => setBulk("close")}><Lock className="h-4 w-4" />Close all open</Button>
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open shifts" value={k.open} icon={LockOpen} />
        <StatCard label="Idle counters" value={k.idle} icon={Lock} tone="slate" />
        <StatCard label="Cash expected in drawers" value={rs(k.cash)} icon={Wallet} tone="blue" />
        <StatCard label="Left open from an earlier day" value={k.old} icon={Clock3} tone="rose" hint={k.old ? "close these first" : undefined} />
      </div>
      {!!data?.pending.length && <Link to="/cash/approvals" className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />{data.pending.length} closing{data.pending.length > 1 ? "s" : ""} waiting for approval (difference beyond tolerance) — open Cash approvals →</Link>}
      {list.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map((c) => { const s = c.shift; return (
        <div key={c.name} className={cn("flex flex-col rounded-2xl border bg-card p-4 shadow-sm", s ? (s.old ? "border-rose-300 dark:border-rose-500/40" : "border-emerald-300 dark:border-emerald-500/40") : "border-border")}>
          <div className="flex items-start gap-3">
            <span className={cn("grid h-11 w-11 place-items-center rounded-xl", s ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>{s ? <LockOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1"><div className="font-bold">{c.counter_name}</div><div className="text-xs text-muted-foreground">{c.counter_type}{c.number ? ` · #${c.number}` : ""}</div></div>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", s ? (s.old ? "bg-rose-600 text-white" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200") : "bg-muted text-muted-foreground")}>
              {s ? (s.old ? "Open · old day" : "Open") : "Idle"}</span>
          </div>
          {s ? <div className="mt-3 space-y-1 text-sm">
            <div><b>{s.user_name || s.user}</b> <span className="text-muted-foreground">since {s.opened_at.slice(5)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cash expected</span><b className="tabular-nums">{rs(s.cash_expected)}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">All modes · {s.invoices} bills</span><span className="tabular-nums">{rs(s.expected)}</span></div>
            {s.pending && <div className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Count {s.pending.status} · difference {rs(s.pending.difference)}</div>}
          </div> : <div className="mt-3 text-sm text-muted-foreground">{c.last_user ? <>Last cashier: <b className="text-foreground">{c.staff.find((x) => x.user === c.last_user)?.name ?? c.last_user}</b></> : "No shift yet"}</div>}
          <div className="mt-auto pt-4">{s ? <Button className="w-full" variant="outline" disabled={!!s.pending && s.pending.status === "Pending Approval"} onClick={() => setCloseFor(c)}><Lock className="h-4 w-4" />Close shift</Button>
            : <Button className="w-full" onClick={() => setOpenFor(c)}><Unlock className="h-4 w-4" />Open shift</Button>}</div>
        </div>); })}</div> : data && <Empty title="No counters" hint="Add counters in Settings → Counters." icon={Wallet} />}

      {openFor && <OpenModal c={openFor} onClose={() => setOpenFor(null)} onDone={() => { setOpenFor(null); void refetch(); }} />}
      {closeFor?.shift && <CloseModal c={closeFor} tolerance={data?.tolerance ?? 0} onClose={() => setCloseFor(null)} onDone={() => { setCloseFor(null); void refetch(); }} />}
      {bulk && <BulkModal kind={bulk} counters={list} onClose={() => setBulk(null)} onDone={() => { setBulk(null); void refetch(); }} />}
    </div>
  );
}

function OpenModal({ c, onClose, onDone }: { c: Counter; onClose: () => void; onDone: () => void }) {
  const [user, setUser] = useState(c.last_user || c.staff[0]?.user || "");
  const [float, setFloat] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await call("cash.admin_open", { counter: c.name, user, cash_float: Number(float) || 0 }); toast.success(`${c.counter_name} opened`); onDone(); } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); } };
  return (
    <Modal title={`Open ${c.counter_name}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!user || busy} onClick={() => void go()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}Open shift</Button></>}>
      <Field label="Cashier"><select className={inputCls} value={user} onChange={(e) => setUser(e.target.value)}><option value="">Choose…</option>{c.staff.map((s) => <option key={s.user} value={s.user}>{s.name}{s.user === c.last_user ? " (last on this counter)" : ""}</option>)}</select></Field>
      <Field label="Opening cash float (Rs)" className="mt-3"><input className={inputCls} inputMode="numeric" value={float} onChange={(e) => setFloat(e.target.value.replace(/\D/g, ""))} placeholder="0" /></Field>
      <p className="mt-3 text-xs text-muted-foreground">The shift belongs to the chosen cashier — their bills post to it and they close it with a blind count (or you close it here).</p>
    </Modal>
  );
}

function CloseModal({ c, tolerance, onClose, onDone }: { c: Counter; tolerance: number; onClose: () => void; onDone: () => void }) {
  const s = c.shift!;
  const [mode, setMode] = useState<"counted" | "system">("counted");
  const [cash, setCash] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const diff = mode === "counted" && cash !== "" ? Number(cash) - s.cash_expected : 0;
  const go = async () => {
    setBusy(true);
    try {
      const r = await call<{ status: string; difference: number }>("cash.admin_close", { shift: s.name, cash_total: mode === "counted" ? Number(cash) : undefined, explanation: why });
      if (r.status === "Pending Approval") toast(`Difference ${rs(r.difference)} is beyond tolerance — sent to Cash approvals`, { icon: "⚠️", duration: 7000 }); else toast.success(`${c.counter_name} closed (${r.status})`);
      onDone();
    } catch (e) { toast.error(humanizeError(e), { duration: 7000 }); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Close ${c.counter_name} · ${s.user_name || s.user}`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={busy || !why.trim() || (mode === "counted" && cash === "")} onClick={() => void go()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}Close shift</Button></>}>
      <div className="mb-3 rounded-xl bg-muted/50 p-3 text-sm">{s.modes.map((m) => <div key={m.mode_of_payment} className="flex justify-between"><span>{m.mode_of_payment}</span><b className="tabular-nums">{rs(m.expected)}</b></div>)}</div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setMode("counted")} className={cn("rounded-xl border-2 p-3 text-start text-sm", mode === "counted" ? "border-primary bg-primary/10" : "border-border")}><b className="block">Cash was counted</b><span className="text-xs text-muted-foreground">Enter the drawer total</span></button>
        <button type="button" onClick={() => setMode("system")} className={cn("rounded-xl border-2 p-3 text-start text-sm", mode === "system" ? "border-primary bg-primary/10" : "border-border")}><b className="block">Use the system figure</b><span className="text-xs text-muted-foreground">Recorded as not counted</span></button>
      </div>
      {mode === "counted" && <Field label="Cash counted (Rs)" className="mt-3"><input className={inputCls} inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(Math.round(s.cash_expected))} autoFocus />
        {cash !== "" && <span className={cn("mt-1 block text-xs font-semibold", Math.abs(diff) < 0.01 ? "text-emerald-600" : Math.abs(diff) <= tolerance ? "text-amber-600" : "text-rose-600")}>
          {Math.abs(diff) < 0.01 ? "Balanced" : `${diff > 0 ? "Excess" : "Short"} ${rs(Math.abs(diff))}${Math.abs(diff) > tolerance ? " — beyond tolerance, goes to Cash approvals" : " — within tolerance"}`}</span>}</Field>}
      <Field label="Reason (recorded on the closing)" className="mt-3"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Cashier left early / end of day / forgot to close" /></Field>
      {s.old && <p className="mt-3 flex gap-2 text-xs text-rose-700 dark:text-rose-300"><AlertTriangle className="h-4 w-4 shrink-0" />This shift was opened on an earlier day — the cashier cannot bill until it is closed.</p>}
    </Modal>
  );
}

function BulkModal({ kind, counters, onClose, onDone }: { kind: "open" | "close"; counters: Counter[]; onClose: () => void; onDone: () => void }) {
  const idle = counters.filter((c) => !c.shift);
  const open = counters.filter((c) => c.shift && !(c.shift.pending?.status === "Pending Approval"));
  const [assign, setAssign] = useState<Record<string, string>>(() => Object.fromEntries(idle.map((c) => [c.name, c.last_user || ""])));
  const [why, setWhy] = useState("");
  const [float, setFloat] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res[] | null>(null);
  const go = async () => {
    setBusy(true);
    try {
      const r = kind === "close" ? await call<Res[]>("cash.admin_close_all", { explanation: why }) : await call<Res[]>("cash.admin_open_all", { assignments: JSON.stringify(assign), cash_float: Number(float) || 0 });
      setRes(r); const ok = r.filter((x) => x.ok).length; toast.success(`${ok} of ${r.length} ${kind === "close" ? "closed" : "opened"}`);
    } catch (e) { toast.error(humanizeError(e)); } finally { setBusy(false); }
  };
  if (res) return (
    <Modal title={kind === "close" ? "Close all — result" : "Open all — result"} onClose={onDone} footer={<Button onClick={onDone}>Done</Button>}>
      <ul className="space-y-1.5 text-sm">{res.map((r, i) => <li key={i} className="flex items-start gap-2">{r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-600" />}
        <span><b>{counters.find((c) => c.name === r.counter || c.shift?.name === r.shift)?.counter_name ?? r.counter ?? r.shift}</b> — {r.ok ? (r.status ?? "opened") : r.message}</span></li>)}</ul>
    </Modal>
  );
  return (
    <Modal title={kind === "close" ? `Close all ${open.length} open shifts` : `Open ${idle.length} idle counters`} onClose={onClose} wide={kind === "open"}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={kind === "close" ? "danger" : "default"} disabled={busy || (kind === "close" ? !why.trim() || !open.length : !Object.values(assign).some(Boolean))} onClick={() => void go()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : kind === "close" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}{kind === "close" ? "Close all" : "Open selected"}</Button></>}>
      {kind === "close" ? <>
        <p className="text-sm">Each shift is closed <b>at its system figure</b> — the drawer is taken as holding exactly what the system expects, and the closing is marked “closed by admin, not counted by the cashier”. Count the drawers first if you can, or close them one by one with the counted cash.</p>
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-xl bg-muted/40 p-3 text-sm">{open.map((c) => <li key={c.name} className="flex justify-between"><span>{c.counter_name} · {c.shift?.user_name}</span><b className="tabular-nums">{rs(c.shift?.cash_expected)}</b></li>)}</ul>
        <Field label="Reason (recorded on every closing)" className="mt-3"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Day end — cashiers left without closing" autoFocus /></Field>
      </> : <>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">{idle.map((c) => <div key={c.name} className="grid grid-cols-[1fr_1.2fr] items-center gap-3 rounded-xl border border-border p-2.5 text-sm">
          <b>{c.counter_name}</b><select className={inputCls} value={assign[c.name] ?? ""} onChange={(e) => setAssign({ ...assign, [c.name]: e.target.value })}><option value="">— leave closed —</option>
            {c.staff.map((s) => <option key={s.user} value={s.user}>{s.name}{s.user === c.last_user ? " (last)" : ""}</option>)}</select></div>)}</div>
        <Field label="Opening cash float for each (Rs)" className="mt-3"><input className={inputCls} inputMode="numeric" value={float} onChange={(e) => setFloat(e.target.value.replace(/\D/g, ""))} placeholder="0" /></Field>
        <p className="mt-2 text-xs text-muted-foreground">A cashier who already has an open shift on another counter is skipped with a message.</p>
      </>}
    </Modal>
  );
}
