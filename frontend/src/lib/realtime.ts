import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Frappe realtime (socket.io namespace = site name). Falls back to the caller's polling when the socket is down. */
export function getSocket(site?: string): Socket | null {
  if (socket || !site) return socket;
  try {
    socket = io(`${window.location.origin}/${site}`, { path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"],
      reconnectionDelayMax: 10_000 });
  } catch {
    socket = null;
  }
  return socket;
}

export function useRealtime(site: string | undefined, events: string[], handler: (data: unknown, event: string) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  const key = events.join("|");
  useEffect(() => {
    const s = getSocket(site);
    if (!s) return;
    const fns = events.map((ev) => {
      const fn = (d: unknown) => ref.current(d, ev);
      s.on(ev, fn);
      return [ev, fn] as const;
    });
    return () => { fns.forEach(([ev, fn]) => s.off(ev, fn)); };
  }, [site, key]); // eslint-disable-line react-hooks/exhaustive-deps
}
