import { useEffect, useState } from "react";
import type { CfState } from "@/modules/display/CustomerFacing";

/** Pharmacy POS → customer screen on a second monitor of the same PC (Restaurant OS style). The last state is kept in
 * localStorage so a display opened late, or reloaded, shows the current bill at once. */
const NAME = "hv-pharmacy-display";
const KEY = "hv.pharmacy.display";

let chan: BroadcastChannel | null = null;
const channel = () => { try { return (chan ??= new BroadcastChannel(NAME)); } catch { return null; } };

export function postDisplay(s: CfState) {
  const v = s.kind === "done" ? { ...s, at: s.at ?? Date.now() } : s;
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ }
  channel()?.postMessage(v);
}

export function usePharmacyDisplay(): CfState {
  const [s, setS] = useState<CfState>(() => { try { return JSON.parse(localStorage.getItem(KEY) || "") as CfState; } catch { return { kind: "idle" }; } });
  useEffect(() => {
    const c = channel();
    const on = (e: MessageEvent<CfState>) => setS(e.data);
    c?.addEventListener("message", on);
    const st = (e: StorageEvent) => { if (e.key === KEY && e.newValue) { try { setS(JSON.parse(e.newValue)); } catch { /* ignore */ } } };
    window.addEventListener("storage", st);
    return () => { c?.removeEventListener("message", on); window.removeEventListener("storage", st); };
  }, []);
  return s;
}
