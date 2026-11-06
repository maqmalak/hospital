import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, MessageCircle, Send, Smartphone, UserCheck } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth";
import { call, humanizeError, useApi } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { Empty, PageHeader, Pill } from "@/components/common";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface Conv { name: string; phone: string; language: string; current_step?: string; handed_off: number; unread: number; last_inbound_at?: string; patients?: string }
interface Msg { name: string; direction: "In" | "Out"; body?: string; status: string; creation: string; media_url?: string; options: { id?: string; title?: string; reply?: { id: string; title: string } }[] }
interface Thread { conversation: Conv | null; messages: Msg[]; window_open: boolean }

export default function InboxPage() {
  const { boot } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [phone, setPhone] = useState<string>("");
  const [text, setText] = useState("");
  const [sim, setSim] = useState("");
  const [simPhone, setSimPhone] = useState("+923001112233");
  const list = useApi<Conv[]>("messaging.inbox", undefined, { refetchInterval: 15_000 });
  const thread = useApi<Thread>("messaging.conversation", { phone }, { enabled: !!phone, refetchInterval: 10_000 });
  useRealtime(boot?.site, ["hv:wa_inbox", "hv:message_status"], () => { void qc.invalidateQueries({ queryKey: ["messaging.inbox"] }); void qc.invalidateQueries({ queryKey: ["messaging.conversation"] }); });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [thread.data?.messages.length]);
  const testMode = boot?.message_mode !== "Live";

  const reply = async () => {
    try { await call("messaging.reply", { phone, text }); setText(""); void thread.refetch(); } catch (e) { toast.error(humanizeError(e)); }
  };
  const simulate = async (body: { text?: string; reply_id?: string; media?: string }) => {
    try { await call("messaging.simulate_inbound", { phone: simPhone, ...body }); setSim(""); setPhone(simPhone.startsWith("+") ? simPhone : simPhone); void list.refetch(); void thread.refetch(); }
    catch (e) { toast.error(humanizeError(e)); }
  };
  const convs = list.data ?? [];
  const msgs = thread.data?.messages ?? [];
  const lastOptions = [...msgs].reverse().find((m) => m.direction === "Out" && m.options?.length)?.options ?? [];
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="WhatsApp inbox" icon={MessageCircle} color="from-green-500 to-emerald-600" subtitle={testMode ? "Test mode — no messages leave the server. Use the simulator to play the patient." : "Live WhatsApp Business"} />
      <div className="grid h-[calc(100vh-12rem)] min-h-[520px] overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[300px_1fr]">
        <div className="overflow-y-auto border-e border-border">
          {convs.map((c) => (
            <button key={c.name} onClick={() => setPhone(c.phone)} className={cn("flex w-full items-center gap-3 border-b border-border/60 p-3 text-start hover:bg-muted/60", phone === c.phone && "bg-accent")}>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white"><Smartphone className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.phone}</span><span className="block truncate text-xs text-muted-foreground">{c.handed_off ? "Waiting for reception" : `Bot · ${c.current_step || "—"}`}</span></span>
              {c.unread > 0 && <span className="rounded-full bg-green-600 px-2 text-xs font-bold text-white">{c.unread}</span>}
              {c.handed_off ? <UserCheck className="h-4 w-4 text-amber-500" /> : <Bot className="h-4 w-4 text-muted-foreground" />}
            </button>))}
          {!convs.length && <div className="p-4"><Empty title="No chats yet" /></div>}
        </div>
        <div className="flex min-h-0 flex-col">
          {phone ? <>
            <div className="flex items-center gap-2 border-b border-border p-3"><b className="flex-1">{phone}</b>{thread.data?.conversation?.handed_off ? <Pill value="Pending" /> : <Pill value="Sent" className="bg-muted" />}
              {thread.data?.conversation?.handed_off ? <Button size="xs" variant="outline" onClick={async () => { await call("messaging.close_handoff", { phone }); void list.refetch(); void thread.refetch(); }}>Return to bot</Button> : null}</div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-[#e7f3ee] p-4 dark:bg-slate-900/60">
              {msgs.map((m) => (
                <div key={m.name} className={cn("flex", m.direction === "In" ? "justify-start" : "justify-end")}>
                  <div className={cn("max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm", m.direction === "In" ? "rounded-bl-sm bg-white dark:bg-slate-800" : "rounded-br-sm bg-[#d9fdd3] dark:bg-emerald-900/60")}>
                    {m.body || (m.media_url ? "📎 attachment" : "")}
                    {m.options?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{m.options.map((o, i) => <span key={i} className="rounded-full border border-emerald-600/40 px-2 py-0.5 text-[11px] text-emerald-800 dark:text-emerald-200">{o.reply?.title || o.title}</span>)}</div>}
                    <div className="mt-1 text-end text-[10px] text-muted-foreground">{m.creation.slice(11, 16)} {m.direction === "Out" && m.status}</div>
                  </div>
                </div>))}
              <div ref={end} />
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) void reply(); }} className="flex gap-2 border-t border-border p-3">
              <input value={text} onChange={(e) => setText(e.target.value)} disabled={!thread.data?.window_open} placeholder={thread.data?.window_open ? "Reply as reception…" : "24-hour window closed — templates only"} className="h-10 flex-1 rounded-full border border-input bg-[hsl(var(--input-bg))] px-4 text-sm" />
              <Button type="submit" variant="submit" disabled={!text.trim() || !thread.data?.window_open}><Send className="h-4 w-4" /></Button>
            </form>
          </> : <div className="flex flex-1 items-center justify-center"><Empty title="Choose a chat" icon={MessageCircle} /></div>}
        </div>
      </div>
      {testMode && (
        <div className="mt-4 rounded-2xl border border-dashed border-green-500/50 bg-green-50/60 p-4 dark:bg-green-500/5">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold"><Smartphone className="h-4 w-4" />Patient simulator (test mode)</div>
          <div className="flex flex-wrap gap-2">
            <input value={simPhone} onChange={(e) => setSimPhone(e.target.value)} className="h-9 w-44 rounded-lg border border-input bg-[hsl(var(--input-bg))] px-2 text-sm" />
            <input value={sim} onChange={(e) => setSim(e.target.value)} placeholder="Type as the patient (e.g. Hi, 1, Ali Raza, 34, M, reception)" className="h-9 min-w-[240px] flex-1 rounded-lg border border-input bg-[hsl(var(--input-bg))] px-2 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && sim.trim()) void simulate({ text: sim }); }} />
            <Button size="sm" variant="submit" disabled={!sim.trim()} onClick={() => void simulate({ text: sim })}>{t("Send")}</Button>
            <Button size="sm" variant="outline" onClick={() => void simulate({ media: "wa-media:test-proof.jpg" })}>Send payment screenshot</Button>
          </div>
          {phone === simPhone && lastOptions.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{lastOptions.map((o, i) => { const id = o.reply?.id || o.id; const title = o.reply?.title || o.title; return (
            <button key={i} onClick={() => void simulate({ reply_id: id, text: title })} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-green-800 shadow-sm hover:bg-green-100 dark:bg-slate-800 dark:text-green-200">{title}</button>); })}</div>}
        </div>)}
    </div>
  );
}
