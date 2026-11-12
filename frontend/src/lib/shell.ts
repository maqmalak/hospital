import { useSyncExternalStore } from "react";

/** Layout switches shared by the shell and full-screen pages (POS):
 * nav    — left menu shown (remembered on this PC);
 * rail   — left menu collapsed to an icon rail (remembered on this PC);
 * drawer — the mobile menu drawer is open;
 * full   — page takes the whole window: no left menu, no header (POS "Full page"). */
interface Shell { nav: boolean; rail: boolean; drawer: boolean; full: boolean }
const KEY = "hv.shell.nav";
const RAIL = "hv.shell.rail";
const read = (k: string, dflt: boolean) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v === "1"; } catch { return dflt; } };
let state: Shell = { nav: (() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } })(), rail: read(RAIL, false), drawer: false, full: false };
const subs = new Set<() => void>();

export function setShell(patch: Partial<Shell>) {
  state = { ...state, ...patch };
  if (patch.nav !== undefined) { try { localStorage.setItem(KEY, patch.nav ? "1" : "0"); } catch { /* private mode */ } }
  if (patch.rail !== undefined) { try { localStorage.setItem(RAIL, patch.rail ? "1" : "0"); } catch { /* private mode */ } }
  subs.forEach((f) => f());
}

export function useShell(): Shell {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
}

/** Browser full screen as well (F11-like), where allowed. */
export async function toggleBrowserFullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* not allowed */ }
}
