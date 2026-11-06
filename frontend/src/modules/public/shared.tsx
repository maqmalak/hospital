import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Languages, MapPin, Phone } from "lucide-react";
import { LANGUAGES } from "@/i18n";

export function PublicShell({ clinic, clinicUr, phone, address, children, wide }: { clinic?: string; clinicUr?: string; phone?: string; address?: string; children: ReactNode; wide?: boolean }) {
  const { i18n } = useTranslation();
  return (
    <div className="relative min-h-full bg-background pb-12">
      <div className="absolute inset-x-0 top-0 h-[340px] overflow-hidden bg-[#06232a]">
        <div className="absolute inset-0 bg-[radial-gradient(900px_400px_at_0%_0%,rgba(20,184,166,0.65),transparent_60%),radial-gradient(800px_400px_at_100%_20%,rgba(16,185,129,0.5),transparent_60%),radial-gradient(600px_300px_at_60%_100%,rgba(56,189,248,0.25),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:40px_40px]" />
      </div>
      <header className={`relative mx-auto flex items-center gap-3 px-4 py-5 text-white ${wide ? "max-w-6xl" : "max-w-xl"}`}>
        <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300 via-teal-500 to-emerald-600 text-xl font-black shadow-lg shadow-black/30"><span className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/30" />V</span>
        <div className="min-w-0 flex-1"><div className="truncate text-lg font-extrabold">{clinic || "VVS Hospital"}</div>{clinicUr && <div className="font-urdu text-sm leading-relaxed text-teal-100/80">{clinicUr}</div>}</div>
        {phone && <a href={`tel:${phone}`} className="hidden items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm backdrop-blur hover:bg-white/20 sm:flex"><Phone className="h-4 w-4" />{phone}</a>}
        <label className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-sm backdrop-blur"><Languages className="h-4 w-4" />
          <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} className="bg-transparent outline-none [&>option]:text-black">{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
      </header>
      <main className={`relative mx-auto px-4 ${wide ? "max-w-6xl" : "max-w-xl"}`}>{children}</main>
      {address && <footer className="relative mx-auto mt-8 flex max-w-6xl items-center justify-center gap-1.5 px-4 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{address}</footer>}
    </div>
  );
}
