/**
 * Wrapper for the screens ported from sugarcane (D-65): frappe-react-sdk's provider (SWR cache, same-origin cookies, no socket —
 * the hospital app has its own realtime), the sugarcane auth and company context, and the sugarcane look for these pages.
 */
import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { FrappeProvider } from "frappe-react-sdk";
import { AuthProvider } from "@/acc/hooks/useAuth";
import { CompanyProvider } from "@/acc/hooks/useCompanyContext";
import { refreshCSRFToken } from "@/acc/services/frappe";

const SWR_CONFIG = {
  revalidateOnFocus: true, revalidateOnReconnect: true, shouldRetryOnError: true, errorRetryCount: 3, errorRetryInterval: 3000,
  dedupingInterval: 5000, keepPreviousData: true,
} as const;

export default function AccLayout() {
  useEffect(() => { void refreshCSRFToken(); }, []);
  return (
    <FrappeProvider url={import.meta.env.VITE_FRAPPE_URL || undefined} enableSocket={false} swrConfig={SWR_CONFIG}>
      <AuthProvider>
        <CompanyProvider>
          <div className="acc-root"><Outlet /></div>
        </CompanyProvider>
      </AuthProvider>
    </FrappeProvider>
  );
}
