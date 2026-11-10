import i18n from "@/i18n";

/** Used by the build-time JSX translation (scripts/i18n-jsx.ts). Keys are the English text; missing ones stay English. */
export function __t(s: string): string {
  return i18n.language === "en" ? s : i18n.t(s);
}

/** Values rendered from variables: translate only plain strings that are in the dictionary. */
export function __tx<T>(v: T): T {
  if (typeof v !== "string" || i18n.language === "en" || !v) return v;
  return (i18n.exists(v) ? i18n.t(v) : v) as unknown as T;
}

/** A fixed part of a template string: keeps its surrounding spaces / separators, translates the words. */
export function __tpart(s: string): string {
  if (i18n.language === "en") return s;
  const lead = s.match(/^[\s·:,()—-]*/)![0], trail = s.match(/[\s·:,()—-]*$/)![0];
  const core = s.slice(lead.length, s.length - trail.length).replace(/\s+/g, " ");
  return core && i18n.exists(core) ? lead + i18n.t(core) + trail : s;
}
