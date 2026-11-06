import qrcode from "qrcode-generator";

/** QR code as inline SVG (crisp on thermal paper, works offline). Patient cards carry only the MR number. */
export function qrSvg(value: string, cellMm = 0.75) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  const size = (n + 2) * cellMm;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" width="${size}mm" height="${size}mm" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

type Kind = "receipt" | "a4" | "label";
interface QZ { websocket: { isActive(): boolean; connect(): Promise<void> }; configs: { create(p: string, o?: unknown): unknown }; print(c: unknown, d: unknown[]): Promise<void>; printers: { getDefault(): Promise<string> } }

/** Printer for this PC from Clinic Settings → Printer Map (device name saved once per PC in localStorage "hv.device"). */
export function mappedPrinter(map: Record<string, string>[] | undefined, kind: Kind): string | undefined {
  let device = "";
  try { device = localStorage.getItem("hv.device") || ""; } catch { /* ignore */ }
  const row = map?.find((r) => r.device === device);
  if (!row) return undefined;
  return kind === "receipt" ? row.receipt_printer : kind === "label" ? row.label_printer : row.a4_printer;
}

/** Silent print through the local print agent (QZ Tray) when it is running; browser print dialog otherwise. */
export async function printDoc(html: string, kind: Kind = "receipt", opts: { agent?: boolean; printer?: string; copies?: number } = {}) {
  const qz = (window as unknown as { qz?: QZ }).qz;
  if (opts.agent && qz) {
    try {
      if (!qz.websocket.isActive()) await qz.websocket.connect();
      const printer = opts.printer || (await qz.printers.getDefault());
      const cfg = qz.configs.create(printer, { copies: opts.copies ?? 1, size: kind === "receipt" ? { width: 80 } : undefined, units: "mm" });
      await qz.print(cfg, [{ type: "pixel", format: "html", flavor: "plain", data: html }]);
      return;
    } catch { /* agent not running → browser print */ }
  }
  printHtml(html, opts.copies ?? 1);
}

export function printHtml(html: string, copies = 1) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const n = Math.max(1, Math.min(5, copies));
  const multi = n > 1 ? html.replace(/<body>([\s\S]*)<\/body>/, (_m, b: string) => `<body>${Array.from({ length: n }, () => b).join('<div style="page-break-after:always"></div>')}</body>`) : html;
  doc.open(); doc.write(multi); doc.close();
  const go = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 60_000); };
  if (doc.readyState === "complete") setTimeout(go, 80); else frame.onload = go;
}

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const money = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
