/** Pharmacy POS offline store (Restaurant OS pattern): IndexedDB "hv-pharmacy" — catalogue bundle, held carts, queued sales. */
import { useCallback, useEffect, useRef, useState } from "react";
import { getCall, humanizeError, postCall } from "@/services/frappe";

let dbp: Promise<IDBDatabase> | null = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open("hv-pharmacy", 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); if (!d.objectStoreNames.contains("queue")) d.createObjectStore("queue", { keyPath: "client_ref" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) {
  return db().then((d) => new Promise<T>((res, rej) => { const q = fn(d.transaction(store, mode).objectStore(store)); q.onsuccess = () => res(q.result as T); q.onerror = () => rej(q.error); }));
}
export const kvGet = <T,>(k: string) => run<T | undefined>("kv", "readonly", (s) => s.get(k)).catch(() => undefined);
export const kvSet = (k: string, v: unknown) => run("kv", "readwrite", (s) => s.put(v, k)).catch(() => undefined);
export interface Queued { client_ref: string; created: string; total: number; customer: string; status: "pending" | "failed"; error?: string; attempts: number; data: Record<string, unknown>; receipt: unknown }
const all = () => run<Queued[]>("queue", "readonly", (s) => s.getAll()).catch(() => [] as Queued[]);
const put = (q: Queued) => run("queue", "readwrite", (s) => s.put(q));
const del = (id: string) => run("queue", "readwrite", (s) => s.delete(id));
export const isNetworkError = (e: unknown) => {
  const err = e as { response?: unknown; code?: string; message?: string };
  return !navigator.onLine || (!err?.response && (err?.code === "ERR_NETWORK" || err?.code === "ECONNABORTED" || /network|timeout|failed to fetch/i.test(err?.message ?? "")));
};
export const loadBundle = <T,>(counter: string) => kvGet<T>(`bundle:${counter}`);
export async function refreshBundle<T>(counter: string) { const b = await getCall<T>("hospital_vvs.api.pharmacy.offline_bundle", { counter }); await kvSet(`bundle:${counter}`, b); return b; }

export interface SyncState { online: boolean; syncing: boolean; queue: Queued[]; lastError?: string; sync: () => Promise<void>; markOffline: () => void; enqueue: (q: Queued) => Promise<void>; discard: (id: string) => Promise<void> }
export function usePharmacySync(onSynced?: () => void): SyncState {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [lastError, setLastError] = useState<string>();
  const busy = useRef(false);
  const refresh = useCallback(async () => setQueue((await all()).sort((a, b) => a.created.localeCompare(b.created))), []);
  const sync = useCallback(async () => {
    if (busy.current) return;
    const items = (await all()).sort((a, b) => a.created.localeCompare(b.created));
    if (!items.length) { await refresh(); return; }
    busy.current = true; setSyncing(true);
    try {
      const res = await postCall<{ client_ref: string; ok: number; error?: string }[]>("hospital_vvs.api.pharmacy.sync", { sales: JSON.stringify(items.map((q) => q.data)) });
      for (const r of res) { const q = items.find((i) => i.client_ref === r.client_ref); if (!q) continue; if (r.ok) await del(q.client_ref); else await put({ ...q, status: "failed", error: r.error, attempts: q.attempts + 1 }); }
      setLastError(undefined); setOnline(true); onSynced?.();
    } catch (e) { if (isNetworkError(e)) setOnline(false); setLastError(humanizeError(e)); } finally { busy.current = false; setSyncing(false); await refresh(); }
  }, [refresh, onSynced]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const up = () => { setOnline(true); void sync(); }; const down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [sync]);
  useEffect(() => {
    const t = setInterval(() => {
      if (online) { if (queue.some((q) => q.status === "pending")) void sync(); return; }
      getCall("frappe.auth.get_logged_user").then(() => { setOnline(true); void sync(); }).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(t);
  }, [online, queue, sync]);
  return { online, syncing, queue, lastError, sync, markOffline: useCallback(() => setOnline(false), []),
    enqueue: useCallback(async (q: Queued) => { await put(q); await refresh(); }, [refresh]), discard: useCallback(async (id: string) => { await del(id); await refresh(); }, [refresh]) };
}
