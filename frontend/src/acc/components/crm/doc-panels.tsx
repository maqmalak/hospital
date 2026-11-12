/** Hospital shim (D-65): plain-text preview of an HTML field (from the sugarcane CRM panels). */
export function textPreview(html: string, max = 140): string {
  const text = (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
