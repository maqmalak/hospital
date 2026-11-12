/**
 * Lists every screen text (literal JSX text, title / label / … props, t("…") calls) that has no Urdu (and Arabic) translation.
 *   npm run i18n:check            # counts + first missing keys
 *   npm run i18n:check -- --json  # writes scripts/i18n-missing.json (all missing keys per language)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import { ATTRS, core, translatable } from "./i18n-jsx";
import { ur } from "../src/i18n/ur";
import { ar } from "../src/i18n/ar";

const traverse = ((_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse) as typeof _traverse;
const keys = new Map<string, Set<string>>();
const add = (k: string, file: string) => { if (!translatable(k)) return; const c = core(k); if (!keys.has(c)) keys.set(c, new Set()); keys.get(c)!.add(file); };
const looksUi = (v: string) => /^[\s.·(—-]*[A-Z]/.test(v) && /[a-z]{2}/.test(v) && !/[=&?{}]|\bpx\b|\b[a-z]+-[a-z0-9]+\b.*\b[a-z]+-[a-z0-9]+\b/.test(v);
const PROP_KEYS = new Set(["label", "title", "desc", "subtitle", "hint", "placeholder", "help", "text", "empty"]);
const uiWord = (v: string) => v.length <= 80 && /^[A-Z]/.test(v) && /[a-z]/.test(v) && !/[/_]|\.(tsx?|png|pdf)$|^[A-Z][a-z]+[A-Z]|^hospital/.test(v);
// values shown from lists / constants (rendered through __tx at run time)
for (const file of globSync("src/**/*.{ts,tsx}")) {
  if (file.includes("/i18n/") || file.endsWith("urdu.ts") || file.endsWith(".d.ts") || file.includes("/modules/landing/")) continue;
  const ast = parse(readFileSync(file, "utf8"), { sourceType: "module", plugins: ["typescript", "jsx"] });
  traverse(ast, {
    StringLiteral(p) {
      const v = p.node.value, par = p.parent;
      if (par.type === "ArrayExpression" && uiWord(v)) add(v, file);
      else if (par.type === "ObjectProperty" && par.value === p.node && par.key.type === "Identifier" && PROP_KEYS.has(par.key.name) && translatable(v) && !/^[a-z0-9_]+$|dark:|^text-/.test(v)) add(v, file);
    },
  });
}
// status / option values from the DocType schemas and the route labels (menu)
for (const py of [...globSync("../hospital_vvs/devtools/schema_*.py"), "../hospital_vvs/routes.py"]) {
  const src = readFileSync(py, "utf8");
  for (const m of src.matchAll(/"Select",\s*\[([^\]]*)\]/g)) for (const o of m[1].matchAll(/"([^"]+)"/g)) if (uiWord(o[1])) add(o[1], py);
  if (py.endsWith("routes.py")) for (const m of src.matchAll(/\("\/[^"]*",\s*"([^"]+)"/g)) add(m[1], py);
}
for (const file of globSync("src/**/*.tsx")) {
  if (file.includes("/i18n/") || file.includes("/modules/landing/")) continue;  // own English / Urdu copy (D-69)
  const ast = parse(readFileSync(file, "utf8"), { sourceType: "module", plugins: ["typescript", "jsx"] });
  traverse(ast, {
    JSXText(p) { add(p.node.value, file); },
    JSXAttribute(p) { const n = p.node; if (n.name.type === "JSXIdentifier" && ATTRS.has(n.name.name) && n.value?.type === "StringLiteral") add(n.value.value, file); },
    StringLiteral(p) {
      // a string shown from inside {…}: walk up to the nearest {…}; a call on the way (cn(), format()) means it is not screen text
      let x = p.parentPath, shown = false;
      while (x) {
        if (x.isJSXExpressionContainer()) { shown = true; break; }
        if (x.isCallExpression() && !(x.node.callee.type === "Identifier" && ["t", "__tx"].includes(x.node.callee.name))) break;
        if (x.isJSXAttribute() || x.isJSXElement()) break;
        x = x.parentPath;
      }
      if (shown && looksUi(p.node.value)) add(p.node.value, file);
    },
    TemplateLiteral(p) { if (p.parent.type === "JSXExpressionContainer") for (const q of p.node.quasis) { const c = (q.value.cooked ?? "").replace(/^[\s·:,()—-]*|[\s·:,()—-]*$/g, ""); if (c && looksUi(c)) add(c, file); } },
    CallExpression(p) { const c = p.node.callee; const a = p.node.arguments[0]; if (c.type === "Identifier" && c.name === "t" && a?.type === "StringLiteral") add(a.value, file); },
  });
}
const out: Record<string, string[]> = {};
for (const [lang, dict] of [["ur", ur], ["ar", ar]] as const) {
  const miss = [...keys.keys()].filter((k) => !dict[k]).sort();
  out[lang] = miss;
  console.log(`${lang}: ${keys.size - miss.length}/${keys.size} translated, ${miss.length} missing`);
}
if (process.argv.includes("--json")) writeFileSync("scripts/i18n-missing.json", JSON.stringify(out, null, 1));
else console.log(out.ur.slice(0, 40).map((k) => `  - ${k}`).join("\n"));
if (process.argv.includes("--strict") && out.ur.length) process.exit(1);
