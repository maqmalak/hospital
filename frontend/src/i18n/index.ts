import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ur } from "./ur";
import { ar } from "./ar";

export const LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ur", label: "اردو", dir: "rtl" },
  { code: "ar", label: "العربية", dir: "rtl" },
] as const;

function applyDir(lng: string) {
  const dir = LANGUAGES.find((l) => l.code === lng)?.dir ?? "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
}

const saved = (() => { try { return localStorage.getItem("hv.lang") || "en"; } catch { return "en"; } })();

// Keys are the English strings themselves: anything not yet translated shows in English.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: {} }, ur: { translation: ur }, ar: { translation: ar } },
  lng: saved, fallbackLng: "en", keySeparator: false, nsSeparator: false, interpolation: { escapeValue: false },
  returnEmptyString: false,
});
applyDir(saved);
i18n.on("languageChanged", (lng) => { applyDir(lng); try { localStorage.setItem("hv.lang", lng); } catch { /* ignore */ } });

export default i18n;
