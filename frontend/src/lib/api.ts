import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { getCall, humanizeError, postCall } from "@/services/frappe";

export { getCall, postCall, humanizeError };

/** Whitelisted method shortcut: "opd.queue" → hospital_vvs.api.opd.queue */
export const m = (path: string) => (path.includes(".api.") || path.startsWith("frappe.") ? path : `hospital_vvs.api.${path}`);

export function useApi<T>(method: string, params?: Record<string, unknown>, opts?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({
    queryKey: [method, params ?? {}],
    queryFn: () => getCall<T>(m(method), clean(params)),
    ...opts,
  });
}

export function useAction<T = unknown, A extends Record<string, unknown> = Record<string, unknown>>(method: string,
  opts?: { success?: string | ((r: T) => string); invalidate?: string[]; onSuccess?: (r: T) => void; silent?: boolean }) {
  const qc = useQueryClient();
  return useMutation<T, unknown, A>({
    mutationFn: (args: A) => postCall<T>(m(method), serialize(args)),
    onSuccess: (r) => {
      if (opts?.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      opts?.invalidate?.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      opts?.onSuccess?.(r);
    },
    onError: (e) => { if (!opts?.silent) toast.error(humanizeError(e), { duration: 6000 }); },
  });
}

export async function call<T>(method: string, args?: Record<string, unknown>): Promise<T> {
  return postCall<T>(m(method), serialize(args ?? {}));
}

function clean(p?: Record<string, unknown>) {
  if (!p) return p;
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

/** Objects/arrays are sent as JSON strings (Frappe parses them with frappe.parse_json). */
function serialize(a: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v]));
}
