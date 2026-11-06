import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { LANGUAGES } from "@/i18n";

export function PublicShell({ clinic, clinicUr, children }: { clinic?: string; clinicUr?: string; children: ReactNode }) {
  const { i18n } = useTranslation();
  return (
    <div className="min-h-full bg-gradient-to-b from-teal-700 via-teal-600 to-background pb-10">
      <header className="mx-auto flex max-w-xl items-center gap-3 px-4 py-5 text-white">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-xl font-black backdrop-blur">V</span>
        <div className="min-w-0 flex-1"><div className="truncate text-lg font-extrabold">{clinic || "VVS Hospital"}</div>{clinicUr && <div className="font-[Noto_Nastaliq_Urdu] text-sm text-white/80">{clinicUr}</div>}</div>
        <label className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-sm"><Languages className="h-4 w-4" />
          <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} className="bg-transparent outline-none [&>option]:text-black">{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
      </header>
      <main className="mx-auto max-w-xl px-4">{children}</main>
    </div>
  );
}
