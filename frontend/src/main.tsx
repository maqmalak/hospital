import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import "@/styles/globals.css";
import "@/i18n";
import { AuthProvider } from "@/lib/auth";
import App from "@/App";

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
          <App />
          <Toaster position="top-center" toastOptions={{ duration: 3500, style: { borderRadius: 12 } }} />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
