import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Languages, MapPin, Phone } from "lucide-react";
import { LANGUAGES } from "@/i18n";

export function PublicShell({ clinic, clinicUr, phone, address, children, wide }: { clinic?: string; clinicUr?: string; phone?: string; address?: string; children: ReactNode; wide?: boolean }) {
  const { i18n } = useTranslation();
  return (
    <div className="site-theme relative min-h-full bg-background pb-12">
      <div className="absolute inset-x-0 top-0 h-[340px] overflow-hidden bg-[#0C2431]">
        <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_0%_0%,rgba(43,110,133,0.6),transparent_60%),radial-gradient(700px_380px_at_100%_100%,rgba(229,50,47,0.22),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:26px_26px]" />
      </div>
      <header className={`relative mx-auto flex items-center gap-3 px-4 py-5 text-white ${wide ? "max-w-6xl" : "max-w-xl"}`}>
        <a href="/hms/site" className="flex min-w-0 flex-1 items-center gap-3" aria-label={clinic || "Lyallpur Medical Complex"}>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white shadow-lg shadow-black/30"><img src={`${import.meta.env.BASE_URL}brand/lyallpur-mark.webp`} alt="" className="h-9 w-9 object-contain" /></span>
          <span className="min-w-0"><span className="block truncate text-lg font-extrabold tracking-wide">{clinic || "Lyallpur Medical Complex"}</span>
            <span className="block truncate text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#8FCBE0]">{clinicUr ? <span className="font-urdu normal-case tracking-normal text-sm">{clinicUr}</span> : "Medical & Research Center"}</span></span>
        </a>
        {phone && <a href={`tel:${phone}`} className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm backdrop-blur hover:bg-white/20 sm:flex"><Phone className="h-4 w-4" />{phone}</a>}
        <label className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm backdrop-blur"><Languages className="h-4 w-4" />
          <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} className="bg-transparent outline-none [&>option]:text-black">{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
      </header>
      <main className={`relative mx-auto px-4 ${wide ? "max-w-6xl" : "max-w-xl"}`}>{children}</main>
      {address && <footer className="relative mx-auto mt-8 flex max-w-6xl items-center justify-center gap-1.5 px-4 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{address}</footer>}
    </div>
  );
}
