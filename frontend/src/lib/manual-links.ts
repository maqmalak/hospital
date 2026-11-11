/**
 * Links from the user manuals to the app's own pages. The manuals name screens in bold ("**Reception counter**",
 * "**Drug round**"); each bold name that matches a menu entry gets a small link icon after it that opens that page.
 * Same approach as the realestate help centre (D-63).
 */
import { NAV } from "@/lib/nav";

export interface RouteLink { label: string; to: string }

/** Names the manuals use that differ from the menu labels. */
const ALIASES: Record<string, string> = {
  desktop: "/pw-home", "help & guides": "/help", "guides & videos": "/help?tab=guides", "medication rounds": "/ipd/mar",
  "supplier invoice": "/purchase_invoice", "purchase invoices": "/purchase_invoice", "cashier shift": "/cash/shift",
};

const norm = (s: string) => s.toLowerCase().replace(/&amp;/g, "&").replace(/[:.]+$/, "").replace(/\s+/g, " ").trim();

let INDEX: Map<string, RouteLink> | null = null;
function index() {
  if (INDEX) return INDEX;
  const m = new Map<string, RouteLink>();
  for (const [k, to] of Object.entries(ALIASES)) m.set(k, { label: k, to });
  for (const item of NAV.flatMap((g) => g.items)) {
    for (const k of [norm(item.label), norm(item.label).replace(/s$/, "")]) if (!m.has(k)) m.set(k, { label: item.label, to: item.route });
  }
  INDEX = m;
  return m;
}

export function routeLabel(to: string) {
  if (to.startsWith("/help")) return "Guides & videos";
  const hit = NAV.flatMap((g) => g.items).find((i) => i.route === to);
  return hit?.label ?? to;
}

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>';

/** After each bold screen name, a small link (data-route) the help page opens with the router. */
export function linkScreens(html: string) {
  const idx = index();
  return html.replace(/<strong>([^<]{2,60})<\/strong>/g, (all, text: string) => {
    const hit = idx.get(norm(text));
    if (!hit) return all;
    return `${all}<a href="/hms${hit.to}" data-route="${hit.to}" class="route-link" title="Open ${hit.label}">${ICON}</a>`;
  });
}

/** "Open in the app" buttons at the top of each manual. */
export const MANUAL_PAGES: Record<string, string[]> = {
  "getting-started": ["/pw-home", "/help?tab=guides"],
  reception: ["/registration", "/opd_slip", "/counter", "/appointments", "/cash/shift"],
  doctor: ["/pw-prescription", "/physician-queue", "/pw-history", "/ipd", "/er"],
  nurse: ["/opd/vitals", "/ward", "/ipd/mar", "/ipd/kitchen", "/ns"],
  wards: ["/er", "/ward", "/ipd", "/ipd_slip", "/ipd/mar"],
  lab: ["/lab/orders", "/lab/samples", "/tests", "/lab/verify", "/lab/outsourced"],
  pharmacy: ["/medicine_invoice", "/pharmacy/pick", "/pharmacy/review", "/pharmacy/dispense"],
  store: ["/pharmacy/items", "/store/receive", "/buying", "/purchase_order", "/assets"],
  cash: ["/cash/shift", "/cash/close", "/cash/approvals", "/cash/reports"],
  accounts: ["/finance", "/expenses", "/doctor-share", "/claims", "/reports"],
  "online-visits": ["/ov-staff", "/ov-staff/report"],
  admin: ["/users", "/settings", "/audit", "/pw-dashboard"],
};
