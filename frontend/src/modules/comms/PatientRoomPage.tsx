import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Bath, BellRing, Droplets, HeartPulse, Megaphone, Mic, MicOff, Send, ShieldAlert, Stethoscope } from "lucide-react";
import { getCall, humanizeError, postCall } from "@/services/frappe";
import { cn } from "@/utils/cn";

/** Bedside patient messaging (/patient/:token) — tablet or phone at the bed, no login (08, D-44). */
interface Msg { name: string; direction: "From patient" | "To patient" | "Broadcast"; kind: string; text: string; voice: number; creation: string; sender_name?: string }
interface State { first_name: string; language: string; station: string; bed?: string; ward?: string; messages: Msg[]; quick: { kind: string; en: string; ur: string }[] }
type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void };

const ICON: Record<string, typeof BellRing> = { Nurse: BellRing, Water: Droplets, Pain: HeartPulse, Bathroom: Bath, Other: Stethoscope };
const TONE: Record<string, string> = { Nurse: "from-sky-500 to-blue-600", Water: "from-cyan-500 to-teal-600", Pain: "from-rose-500 to-red-600", Bathroom: "from-violet-500 to-indigo-600", Other: "from-amber-500 to-orange-600" };
const T = {
  en: { hi: "Hello", help: "Tap a button — the nurses' station gets it at once.", type: "Type a message…", send: "Send", talk: "Speak", listening: "Listening… tap to stop", sent: "Sent to the nurses", none: "No messages yet.", nurse: "Nurse", station: "Station", bed: "Bed", all: "To all patients", lost: "Connection lost — retrying…" },
  ur: { hi: "السلام علیکم", help: "بٹن دبائیں — نرسنگ اسٹیشن کو فوراً پیغام مل جائے گا۔", type: "پیغام لکھیں…", send: "بھیجیں", talk: "بولیں", listening: "سن رہے ہیں… روکنے کے لیے دبائیں", sent: "نرسوں کو بھیج دیا گیا", none: "ابھی کوئی پیغام نہیں۔", nurse: "نرس", station: "اسٹیشن", bed: "بستر", all: "تمام مریضوں کے لیے", lost: "رابطہ منقطع — دوبارہ کوشش…" },
};

export default function PatientRoomPage() {
  const { token = "" } = useParams();
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [lang, setLang] = useState<"en" | "ur">("ur");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const rec = useRef<SR | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const t = T[lang];

  const load = async () => {
    try { const r = await getCall<State>("hospital_vvs.api.comms.portal", { token }); setS((old) => { if (!old) setLang(r.language === "en" ? "en" : "ur"); return r; }); setErr(""); }
    catch (e) { setErr(humanizeError(e)); }
  };
  useEffect(() => { void load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [s?.messages.length]);

  const send = async (kind: string, body?: string, isVoice = false) => {
    if (busy) return;
    setBusy(true);
    try { await postCall("hospital_vvs.api.comms.portal_send", { token, kind, text: body, voice: isVoice ? 1 : 0, language: lang }); setText(""); setVoice(false); setToast(t.sent); setTimeout(() => setToast(""), 2500); void load(); }
    catch (e) { setToast(humanizeError(e)); setTimeout(() => setToast(""), 4000); } finally { setBusy(false); }
  };
  const talk = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!C) { setToast("Voice is not supported on this device"); setTimeout(() => setToast(""), 3000); return; }
    if (listening) { rec.current?.stop(); return; }
    const r = new C();
    r.lang = lang === "ur" ? "ur-PK" : "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => { let out = ""; for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript; setText(out); setVoice(true); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  if (err && !s) return <div dir={lang === "ur" ? "rtl" : "ltr"} className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center text-white"><ShieldAlert className="h-12 w-12 text-amber-300" /><div className="text-xl">{err}</div></div>;
  if (!s) return <div className="min-h-screen bg-gradient-to-br from-sky-950 to-emerald-950" />;
  return (
    <div dir={lang === "ur" ? "rtl" : "ltr"} className={cn("flex min-h-screen flex-col bg-gradient-to-br from-[#06213a] via-[#062c33] to-[#04281f] text-white", lang === "ur" && "font-urdu")}>
      <header className="flex items-center gap-3 px-5 pb-3 pt-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-500 text-[#04281f]"><HeartPulse className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><div className="text-2xl font-bold leading-snug">{t.hi}, {s.first_name}</div>
          <div className="text-sm text-white/60">{t.bed} {s.bed ?? "—"} · {s.ward} · {t.station} {s.station}</div></div>
        <button onClick={() => setLang(lang === "ur" ? "en" : "ur")} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold ring-1 ring-white/20">{lang === "ur" ? "English" : "اردو"}</button>
      </header>
      <p className="px-5 text-base text-white/70">{t.help}</p>
      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">{s.quick.filter((q) => q.kind !== "Other").map((q) => { const I = ICON[q.kind]; return (
        <button key={q.kind} disabled={busy} onClick={() => void send(q.kind)} className={cn("flex flex-col items-center gap-2 rounded-3xl bg-gradient-to-br p-5 text-center shadow-xl ring-1 ring-white/20 transition-transform active:scale-95 disabled:opacity-60", TONE[q.kind])}>
          <I className="h-10 w-10" /><span className="text-lg font-bold leading-tight">{lang === "ur" ? q.ur : q.en}</span></button>); })}</div>
      <div className="mx-5 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-3xl bg-white/5 p-4 ring-1 ring-white/10" style={{ maxHeight: "42vh" }}>
        {s.messages.map((m) => { const mine = m.direction === "From patient"; return (
          <div key={m.name} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-lg", mine ? "bg-emerald-500/90 text-white" : m.direction === "Broadcast" ? "bg-amber-400 text-amber-950" : "bg-white text-slate-900")}>
              {m.direction === "Broadcast" && <div className="mb-0.5 flex items-center gap-1 text-xs font-bold"><Megaphone className="h-3.5 w-3.5" />{t.all}</div>}
              {!mine && m.direction !== "Broadcast" && <div className="text-xs font-bold text-sky-700">{m.sender_name ?? t.nurse}</div>}
              <div>{m.voice ? <Mic className="me-1 inline h-4 w-4 opacity-70" /> : null}{m.text}</div>
              <div className={cn("mt-0.5 text-[11px]", mine ? "text-white/70" : "text-slate-500")}>{m.creation.slice(11, 16)}</div></div></div>); })}
        {!s.messages.length && <div className="py-6 text-center text-white/50">{t.none}</div>}
        <div ref={end} />
      </div>
      <div className="flex items-center gap-2 p-5">
        <button onClick={talk} className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/20", listening ? "animate-pulse bg-rose-500" : "bg-white/10")} aria-label={t.talk}>{listening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}</button>
        <input value={text} onChange={(e) => { setText(e.target.value); if (!e.target.value) setVoice(false); }} onKeyDown={(e) => e.key === "Enter" && text.trim() && void send("Message", text, voice)}
          placeholder={listening ? t.listening : t.type} className="h-14 min-w-0 flex-1 rounded-2xl bg-white px-4 text-lg text-slate-900 outline-none" />
        <button disabled={!text.trim() || busy} onClick={() => void send("Message", text, voice)} className="flex h-14 items-center gap-2 rounded-2xl bg-emerald-500 px-5 text-lg font-bold disabled:opacity-50"><Send className="h-5 w-5" />{t.send}</button>
      </div>
      {toast && <div className="fixed inset-x-0 bottom-24 mx-auto w-fit rounded-full bg-white px-5 py-2 text-base font-bold text-emerald-800 shadow-2xl">{toast}</div>}
      {err && <div className="bg-rose-600 px-4 py-1 text-center text-sm">{t.lost}</div>}
    </div>
  );
}
