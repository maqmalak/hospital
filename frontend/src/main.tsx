import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import "@/styles/globals.css";
import "@/i18n";
import { AuthProvider } from "@/lib/auth";
import App from "@/App";
import { useTranslation } from "react-i18next";

/** Screen texts are translated at render time (scripts/i18n-jsx.ts), so a language switch redraws the whole app. */
function LanguageRoot() {
  const { i18n } = useTranslation();
  return <App key={i18n.language} />;
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
});

try {
  const theme = localStorage.getItem("hv.theme");
  if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) document.documentElement.classList.add("dark");
} catch { /* storage blocked */ }

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/hms">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LanguageRoot />
          <Toaster position="top-center" toastOptions={{ duration: 3500, style: { borderRadius: 12 } }} />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
