import { useEffect, useState } from "react";

/** ERP colour palette (D-90): "lime" (default — black + lime, after the aaghaz.ai login look) or "gold" (the VVS gold
 *  theme, D-72). Kept per browser in localStorage, applied as <html data-palette>; globals.css holds the variables.
 *  Light / dark stays a separate choice (hv.theme). The public website and patient pages keep their own colours. */
export type Palette = "lime" | "gold";
export const PALETTES: { id: Palette; label: string; swatch: string }[] = [
  { id: "lime", label: "Lime", swatch: "linear-gradient(135deg,#0A0A0A 0 50%,#C4F01A 50% 100%)" },
  { id: "gold", label: "Gold", swatch: "linear-gradient(135deg,#14171C 0 50%,#C9A24A 50% 100%)" },
];
const KEY = "hv.palette";
const EVENT = "hv:palette";

export function getPalette(): Palette {
  try { return localStorage.getItem(KEY) === "gold" ? "gold" : "lime"; } catch { return "lime"; }
}

export function applyPalette(p: Palette = getPalette()) {
  document.documentElement.dataset.palette = p;
}

export function setPalette(p: Palette) {
  try { localStorage.setItem(KEY, p); } catch { /* storage blocked: still applies for this page */ }
  applyPalette(p);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: p }));
}

export function usePalette(): [Palette, (p: Palette) => void] {
  const [p, setP] = useState<Palette>(getPalette);
  useEffect(() => {
    const on = (e: Event) => setP((e as CustomEvent<Palette>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [p, setPalette];
}
