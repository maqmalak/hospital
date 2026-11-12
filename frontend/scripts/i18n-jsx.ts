/**
 * Babel plugin (build time): every literal screen text and the common string props (title, label, subtitle, hint, placeholder,
 * aria-label) go through the dictionary — `<b>Save draft</b>` becomes `<b>{__t("Save draft")}</b>`. English stays English;
 * Urdu / Arabic come from src/i18n/*.ts (keys are the English text). `npm run i18n:check` lists text with no translation.
 * Values shown as `{label}` / `{row.status}` go through __tx: a plain string that has a dictionary entry is translated,
 * anything else (names, numbers, elements) is returned unchanged. Skip a subtree with translate="no".
 */
import type { PluginObj, types as T } from "@babel/core";

export const ATTRS = new Set(["title", "label", "subtitle", "hint", "placeholder", "aria-label", "tooltip"]);
const SKIP_TAGS = new Set(["code", "pre", "style", "script", "kbd", "datalist"]);
export const translatable = (s: string) => /[A-Za-z]{2}/.test(s) && !/^(https?:|\/|#|[A-Z0-9_-]+$)/.test(s.trim());
export const core = (s: string) => s.replace(/\s+/g, " ").trim();
/** Files with their own language handling (the public VVSDesk landing page, D-69) are left alone. */
export const OWN_LANG = /[\\/]modules[\\/]landing[\\/]/;
const skipFile = (state: unknown) => OWN_LANG.test((state as { filename?: string; file?: { opts?: { filename?: string } } }).filename ?? (state as { file?: { opts?: { filename?: string } } }).file?.opts?.filename ?? "");

export default function i18nJsx({ types: t }: { types: typeof T }): PluginObj {
  return {
    name: "hv-i18n-jsx",
    visitor: {
      Program: {
        exit(path, state) {
          if (!(state as { used?: boolean }).used) return;
          path.unshiftContainer("body", t.importDeclaration([t.importSpecifier(t.identifier("__t"), t.identifier("__t")), t.importSpecifier(t.identifier("__tx"), t.identifier("__tx")), t.importSpecifier(t.identifier("__tpart"), t.identifier("__tpart"))], t.stringLiteral("@/i18n/tx")));
        },
      },
      JSXText(path, state) {
        if (skipFile(state)) return;
        const raw = path.node.value;
        if (!translatable(raw)) return;
        const el = path.parentPath.node as T.JSXElement;
        if (t.isJSXElement(el)) {
          const name = el.openingElement.name;
          if (t.isJSXIdentifier(name) && SKIP_TAGS.has(name.name)) return;
        }
        if (path.findParent((p) => p.isJSXElement() && p.node.openingElement.attributes.some((a) => t.isJSXAttribute(a) && a.name.name === "translate" && t.isStringLiteral(a.value) && a.value.value === "no"))) return;
        const lead = raw.match(/^\s*/)![0], trail = raw.match(/\s*$/)![0];
        const keep = (w: string) => (w.includes("\n") ? "" : w);  // JSX drops whitespace that contains a line break
        const nodes: (T.JSXText | T.JSXExpressionContainer)[] = [];
        if (keep(lead)) nodes.push(t.jsxText(keep(lead)));
        nodes.push(t.jsxExpressionContainer(t.callExpression(t.identifier("__t"), [t.stringLiteral(core(raw))])));
        if (keep(trail)) nodes.push(t.jsxText(keep(trail)));
        (state as { used?: boolean }).used = true;
        path.replaceWithMultiple(nodes);
        path.skip();
      },
      JSXExpressionContainer(path, state) {
        if (skipFile(state)) return;
        const e = path.node.expression;
        const value = t.isIdentifier(e) || t.isMemberExpression(e) || t.isLogicalExpression(e) || t.isConditionalExpression(e);
        if (!value && !t.isTemplateLiteral(e)) return;
        const parent = path.parentPath;
        const inChildren = parent.isJSXElement() || parent.isJSXFragment();
        const inAttr = parent.isJSXAttribute() && t.isJSXIdentifier(parent.node.name) && ATTRS.has(parent.node.name.name);
        if (!inChildren && !inAttr) return;
        if (t.isIdentifier(e) && (e.name === "children" || e.name.startsWith("__"))) return;
        if (path.findParent((p) => p.isJSXElement() && p.node.openingElement.attributes.some((a) => t.isJSXAttribute(a) && a.name.name === "translate" && t.isStringLiteral(a.value) && a.value.value === "no"))) return;
        (state as { used?: boolean }).used = true;
        if (t.isTemplateLiteral(e)) {
          // `${n} patients waiting` → `${n}${__t(" patients waiting")}`: each fixed part is looked up on its own
          const exprs: T.Expression[] = [];
          e.quasis.forEach((q, i) => {
            const txt = q.value.cooked ?? "";
            if (txt) exprs.push(translatable(txt) ? t.callExpression(t.identifier("__tpart"), [t.stringLiteral(txt)]) : t.stringLiteral(txt));
            if (i < e.expressions.length) exprs.push(e.expressions[i] as T.Expression);
          });
          path.node.expression = t.templateLiteral(Array.from({ length: exprs.length + 1 }, (_, i) => t.templateElement({ raw: "", cooked: "" }, i === exprs.length)), exprs);
        } else path.node.expression = t.callExpression(t.identifier("__tx"), [e]);
        // no path.skip(): JSX inside the expression (e.g. {cond && <p>Text</p>}) must still be visited
      },
      JSXAttribute(path, state) {
        if (skipFile(state)) return;
        const n = path.node;
        if (!t.isJSXIdentifier(n.name) || !ATTRS.has(n.name.name) || !t.isStringLiteral(n.value) || !translatable(n.value.value)) return;
        (state as { used?: boolean }).used = true;
        n.value = t.jsxExpressionContainer(t.callExpression(t.identifier("__t"), [t.stringLiteral(core(n.value.value))]));
      },
    },
  };
}
