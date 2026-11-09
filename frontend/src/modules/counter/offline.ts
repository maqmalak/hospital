/**
 * Reception counter offline store and sync (adapted from Restaurant OS pos-offline).
 * IndexedDB "hv-counter": `kv` (offline bundle, held carts) and `queue` (sales rung up without the server).
 * Each queued sale carries a client_ref; the server posts it once, so a retry never double-posts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getCall, humanizeError, postCall } from "@/services/frappe";

const DB = "hv-counter";
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); if (!d.objectStoreNames.contains("queue")) d.createObjectStore("queue", { keyPath: "client_ref" }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest) {
  return db().then((d) => new Promise<T>((res, rej) => { const req = fn(d.transaction(store, mode).objectStore(store)); req.onsuccess = () => res(req.result as T); req.onerror = () => rej(req.error); }));
}
export const kvGet = <T,>(k: string) => run<T | undefined>("kv", "readonly", (s) => s.get(k)).catch(() => undefined);
export const kvSet = (k: string, v: unknown) => run("kv", "readwrite", (s) => s.put(v, k)).catch(() => undefined);

export interface Doctor { name: string; doctor_name: string; doctor_name_ur?: string; specialization?: string; fee: number; follow_up_fee?: number; consultation_room?: string; color?: string; photo?: string; waiting?: number }
export interface Service { item_code: string; item_name: string; rate: number; hv_billing_type?: string }
export interface LabT { name: string; test_code: string; department?: string; price: number; sample_type?: string; tat_hours?: number }
export interface Bundle { doctors: Doctor[]; services: Service[]; labs: LabT[]; patients: { name: string; patient_name: string; phone?: string; gender?: string; age?: number; category?: string }[];
  modes: string[]; generated_at: string; branch: string; clinic: { name: string; name_ur?: string; phone?: string; address?: string } }
export interface Queued { client_ref: string; created: string; total: number; patient_name: string; status: "pending" | "failed"; error?: string; attempts: number; data: Record<string, unknown>; receipt: unknown }

export const queueAll = () => run<Queued[]>("queue", "readonly", (s) => s.getAll()).catch(() => [] as Queued[]);
const queuePut = (q: Queued) => run("queue", "readwrite", (s) => s.put(q));
const queueDel = (id: string) => run("queue", "readwrite", (s) => s.delete(id));
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const isNetworkError = (e: unknown) => {
  const err = e as { response?: unknown; code?: string; message?: string; httpStatus?: number };
  return !navigator.onLine || (!err?.response && !err?.httpStatus && (err?.code === "ERR_NETWORK" || err?.code === "ECONNABORTED" || /network|timeout|failed to fetch/i.test(err?.message ?? "")));
};
export async function refreshBundle(branch: string) { const b = await getCall<Bundle>("hospital_vvs.api.counter.offline_bundle", { branch }); await kvSet(`bundle:${branch}`, b); return b; }
export const loadBundle = (branch: string) => kvGet<Bundle>(`bundle:${branch}`);

export interface SyncState { online: boolean; syncing: boolean; queue: Queued[]; lastSync?: string; lastError?: string; sync: () => Promise<void>; markOffline: () => void;
  enqueue: (q: Queued) => Promise<void>; discard: (id: string) => Promise<void> }

/** Online / offline tracking; pending sales sync on reconnect and every 30 s. */
export function useCounterSync(onSynced?: () => void): SyncState {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [lastSync, setLastSync] = useState<string>();
  const [lastError, setLastError] = useState<string>();
  const busy = useRef(false);
  const refresh = useCallback(async () => { setQueue((await queueAll()).sort((a, b) => a.created.localeCompare(b.created))); setLastSync(await kvGet<string>("lastSync")); }, []);
  const sync = useCallback(async () => {
    if (busy.current) return;
    const items = (await queueAll()).sort((a, b) => a.created.localeCompare(b.created));
    if (!items.length) { await refresh(); return; }
    busy.current = true; setSyncing(true);
    try {
      const res = await postCall<{ client_ref: string; ok: number; name?: string; error?: string }[]>("hospital_vvs.api.counter.sync", { receipts: JSON.stringify(items.map((q) => q.data)) });
      for (const r of res) {
        const q = items.find((i) => i.client_ref === r.client_ref);
        if (!q) continue;
        if (r.ok) await queueDel(q.client_ref); else await queuePut({ ...q, status: "failed", error: r.error, attempts: q.attempts + 1 });
      }
      await kvSet("lastSync", new Date().toISOString());
      setLastError(undefined); setOnline(true); onSynced?.();
    } catch (e) { if (isNetworkError(e)) setOnline(false); setLastError(humanizeError(e)); }
    finally { busy.current = false; setSyncing(false); await refresh(); }
  }, [refresh, onSynced]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const up = () => { setOnline(true); void sync(); };
    const down = () => setOnline(false);
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
  return { online, syncing, queue, lastSync, lastError, sync, markOffline: useCallback(() => setOnline(false), []),
    enqueue: useCallback(async (q: Queued) => { await queuePut(q); await refresh(); }, [refresh]), discard: useCallback(async (id: string) => { await queueDel(id); await refresh(); }, [refresh]) };
}

// ------------------------------------------------------------------ customer display (same PC, second screen)
export type DisplayState = { kind: "idle" } | { kind: "cart"; patient?: string; lines: { label: string; amount: number }[]; total: number }
  | { kind: "pay"; patient?: string; total: number; paid: number; change: number } | { kind: "done"; patient?: string; receipt: string; total: number; change: number; tokens: { doctor: string; token: number; room?: string }[] };
const CH = "hv-counter-display";
const KEY = "hv.counter.display";
let chan: BroadcastChannel | null = null;
export function publishDisplay(s: DisplayState) {
  const msg = { ...s, at: Date.now() };
  try { (chan ??= new BroadcastChannel(CH)).postMessage(msg); } catch { /* no channel */ }
  try { localStorage.setItem(KEY, JSON.stringify(msg)); } catch { /* private */ }
}
export function useDisplayState() {
  const [s, setS] = useState<DisplayState & { at?: number }>(() => { try { return JSON.parse(localStorage.getItem(KEY) || '{"kind":"idle"}'); } catch { return { kind: "idle" }; } });
  useEffect(() => {
    let c: BroadcastChannel | null = null;
    try { c = new BroadcastChannel(CH); c.onmessage = (e) => setS(e.data); } catch { /* none */ }
    const onStore = (e: StorageEvent) => { if (e.key === KEY && e.newValue) setS(JSON.parse(e.newValue)); };
    window.addEventListener("storage", onStore);
    return () => { c?.close(); window.removeEventListener("storage", onStore); };
  }, []);
  return s;
}
