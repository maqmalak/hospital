import { useEffect, useRef, useState } from "react";
import { Keyboard, RefreshCw, Sparkles } from "lucide-react";
import { call, getCall } from "@/lib/api";
import { correctionsFor, hasUrdu, loadLearned, PHONETIC, toUrdu } from "@/lib/urdu";
import { cn } from "@/utils/cn";

/**
 * Urdu twin of an English field (D-51). It follows the English as it is typed; staff can correct it — by typing with an Urdu
 * keyboard, or with the phonetic keyboard (⌨: English keys type Urdu letters) — and the corrected words are taught to the system
 * so the same English word comes out right next time, for everyone. ↻ goes back to the automatic spelling.
 */
export function UrduField({ english, value, onChange, placeholder = "اردو", className, disabled }: {
  english: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; disabled?: boolean;
}) {
  const [manual, setManual] = useState(() => !!value && value !== toUrdu(english));
  const [phonetic, setPhonetic] = useState(() => { try { return localStorage.getItem("hv.urdu.phonetic") === "1"; } catch { return false; } });
  const [, force] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { void loadLearned(() => getCall<Record<string, string>>("hospital_vvs.api.patients.urdu_words")).then(() => force((n) => n + 1)); }, []);
  // follow the English until someone corrects the Urdu by hand
  useEffect(() => { if (!manual) { const u = english.trim() ? toUrdu(english) : ""; if (u !== value) onChange(u); } }, [english, manual]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem("hv.urdu.phonetic", phonetic ? "1" : "0"); } catch { /* ignore */ } }, [phonetic]);

  const insert = (txt: string) => {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart ?? value.length, b = el.selectionEnd ?? value.length;
    const v = value.slice(0, a) + txt + value.slice(b);
    setManual(true); onChange(v);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + txt.length; });
  };
  const teach = () => {
    if (!manual || !english.trim() || !hasUrdu(value)) return;
    const pairs = correctionsFor(english, value);
    if (pairs.length) void call("patients.learn_urdu", { pairs: JSON.stringify(pairs) }).catch(() => undefined);
  };
  return (
    <div className={cn("relative", className)}>
      <input ref={ref} lang="ur" dir="rtl" disabled={disabled} value={value} placeholder={placeholder}
        className={cn("urdu-input h-11 w-full rounded-xl border border-input bg-[hsl(var(--input-bg))] ps-20 pe-3 font-urdu text-lg outline-none focus:border-primary", phonetic && "ring-2 ring-teal-500/30")}
        onKeyDown={(e) => { if (phonetic && !e.ctrlKey && !e.metaKey && !e.altKey && PHONETIC[e.key]) { e.preventDefault(); insert(PHONETIC[e.key]); } }}
        onChange={(e) => { setManual(!!e.target.value); onChange(e.target.value); }} onBlur={teach} />
      <div className="absolute start-1.5 top-1.5 flex gap-1" dir="ltr">
        <button type="button" disabled={disabled} title={phonetic ? "Phonetic Urdu keyboard ON — English keys type Urdu (s=س, x=ش, k=ک, K=خ …)" : "Type Urdu with English keys"}
          onClick={() => { setPhonetic(!phonetic); ref.current?.focus(); }} className={cn("rounded-lg p-1.5", phonetic ? "bg-teal-600 text-white" : "text-muted-foreground hover:bg-muted")}><Keyboard className="h-4 w-4" /></button>
        <button type="button" disabled={disabled || !english.trim()} title="Spell again from the English" onClick={() => { setManual(false); onChange(toUrdu(english)); }}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {value && !manual && <div className="mt-1 flex items-center gap-1 text-[11px] text-teal-600"><Sparkles className="h-3 w-3" />From the English — click the Urdu to correct it; corrections are remembered</div>}
      {manual && english.trim() && <div className="mt-1 text-[11px] text-muted-foreground">Corrected by hand · ↻ to spell again from the English</div>}
    </div>
  );
}
