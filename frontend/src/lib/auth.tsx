import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import i18n from "i18next";
import { getCall, http, refreshCSRFToken } from "@/services/frappe";
import { setActiveCurrency } from "@/utils/currency";

export interface Boot {
  user: string; full_name: string; image?: string; language?: string; roles: string[]; is_admin: boolean;
  doctor?: { name: string; doctor_name: string } | null; branches: string[]; branch: string | null;
  routes: { route: string; label: string }[]; modules: Record<string, number>;
  clinic: { name: string; name_ur?: string; name_ar?: string; logo?: string; address?: string; phone?: string; mode?: string; currency: string };
  shifts?: { day_start: string; night_start: string };
  training: number; idle_lock_minutes: number; show_first_name_on_display: number; message_mode: string; site: string; csrf_token: string;
  print: { receipt: string; prescription: string; card: string; agent: number; printers: Record<string, string>[] };
}

interface AuthCtx {
  boot: Boot | null; loading: boolean; branch: string; setBranch: (b: string) => void;
  login: (usr: string, pwd: string, otp?: { tmp_id: string; otp: string }) => Promise<{ verification?: { tmp_id: string; method?: string; prompt?: string } }>;
  logout: () => Promise<void>; reload: () => Promise<void>; can: (route: string) => boolean; hasRole: (...r: string[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

/** The screens ported from sugarcane (D-65) share one page-access rule each: /accounting, or /purchase for the buying documents. */
export function guardRoute(route: string) {
  const path = route.split("?")[0];
  if (path.startsWith("/accounting")) return "/accounting";
  if (path.startsWith("/apps/")) return "/apps";
  if (/^\/(purchase\/|import\/|masters\/supplier)/.test(path)) return "/purchase";
  return path;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [loading, setLoading] = useState(true);
  const [branch, setBranchState] = useState<string>(() => { try { return localStorage.getItem("hv.branch") || ""; } catch { return ""; } });
  const qc = useQueryClient();

  const reload = useCallback(async () => {
    try {
      await refreshCSRFToken();
      const b = await getCall<Boot>("hospital_vvs.api.session.boot");
      (window as unknown as { csrf_token?: string }).csrf_token = b.csrf_token;
      setBoot(b);
      setActiveCurrency(b.clinic.currency);
      setBranchState((cur) => (cur && b.branches.includes(cur) ? cur : b.branch || b.branches[0] || ""));
      const lang = (() => { try { return localStorage.getItem("hv.lang"); } catch { return null; } })() || b.language;
      if (lang && ["en", "ur", "ar"].includes(lang) && lang !== i18n.language) void i18n.changeLanguage(lang);
    } catch {
      setBoot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const onExpired = () => setBoot(null);
    window.addEventListener("micromax:session-expired", onExpired);
    return () => window.removeEventListener("micromax:session-expired", onExpired);
  }, []);

  const setBranch = (b: string) => { setBranchState(b); try { localStorage.setItem("hv.branch", b); } catch { /* ignore */ } qc.invalidateQueries(); };

  const login: AuthCtx["login"] = async (usr, pwd, otp) => {
    await refreshCSRFToken();
    const body = otp ? { cmd: "login", otp: otp.otp, tmp_id: otp.tmp_id } : { usr, pwd };
    const res = await http.post("/api/method/login", body);
    const data = res.data as { verification?: { setup?: boolean; method?: string; prompt?: string }; tmp_id?: string };
    if (data.verification && data.tmp_id) return { verification: { tmp_id: data.tmp_id, method: data.verification.method, prompt: data.verification.prompt } };
    setLoading(true);
    await reload();
    return {};
  };

  const logout = async () => {
    try { await http.post("/api/method/logout"); } catch { /* already out */ }
    qc.clear();
    setBoot(null);
  };

  const value = useMemo<AuthCtx>(() => ({
    boot, loading, branch, setBranch, login, logout, reload,
    can: (route: string) => { const k = guardRoute(route); return !!boot && (boot.is_admin || boot.routes.some((r) => r.route === k)); },
    hasRole: (...r: string[]) => !!boot && (boot.is_admin || r.some((x) => boot.roles.includes(x))),
  }), [boot, loading, branch]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
