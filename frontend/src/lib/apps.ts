/**
 * Apps of the hospital (D-67): the Desktop shows one icon per app; each app has a home page (/apps/<slug>) listing its screens.
 * An app is a set of menu routes (lib/nav.ts) — a person sees an app when they may open at least one of its screens.
 * Apps with a single screen open that screen straight away.
 */
import {
  BarChart3, BedDouble, BookOpen, Boxes, FlaskConical, HandCoins, LayoutDashboard, LifeBuoy, Percent, Pill, Settings, ShoppingCart, Stethoscope,
  UserPlus, Video, Wallet, type LucideIcon,
} from "lucide-react";
import { NAV, type NavItem } from "@/lib/nav";

export interface App {
  slug: string; label: string; desc: string; icon: LucideIcon; hue: string; color: string; routes: string[];
  /** the usual order of work in this app (shown as a workflow strip on its home page) */
  flow?: string[]; flowTitle?: string;
  /** help centre manual for this app */
  manual?: string;
}

const ALL: NavItem[] = NAV.flatMap((g) => g.items);
const group = (label: string) => NAV.find((g) => g.label === label)?.items.map((i) => i.route) ?? [];

export const APPS: App[] = [
  { slug: "dashboard", label: "Dashboard", desc: "The day at a glance", icon: LayoutDashboard, hue: "blue", color: "from-blue-500 to-indigo-600", routes: ["/pw-dashboard"] },
  { slug: "opd", label: "OPD", desc: "Registration, slips, appointments, counter", icon: UserPlus, hue: "teal", color: "from-teal-500 to-emerald-600", routes: group("OPD"),
    flow: ["/appointments", "/registration", "/opd_slip", "/counter"], flowTitle: "Booking to token", manual: "reception" },
  { slug: "clinic", label: "Clinic", desc: "Vitals, queue, prescriptions, history", icon: Stethoscope, hue: "rose", color: "from-rose-500 to-pink-600", routes: group("Clinical"),
    flow: ["/opd/vitals", "/physician-queue", "/pw-prescription", "/pw-history"], flowTitle: "Token to prescription", manual: "doctor" },
  { slug: "lab", label: "Laboratory", desc: "Orders, samples, results, verification", icon: FlaskConical, hue: "violet", color: "from-violet-500 to-purple-600", routes: group("Laboratory"),
    flow: ["/lab/orders", "/lab/samples", "/tests", "/lab/verify"], flowTitle: "Order to report", manual: "lab" },
  { slug: "ipd", label: "IPD & Emergency", desc: "ER, beds, admissions, drug round, IPD bill", icon: BedDouble, hue: "sky", color: "from-cyan-500 to-sky-600", routes: group("Inpatient"),
    flow: ["/er", "/ward", "/ipd", "/ipd/mar", "/ipd_slip"], flowTitle: "Arrival to discharge", manual: "wards" },
  { slug: "pharmacy", label: "Pharmacy", desc: "POS, pick, review, handover", icon: Pill, hue: "emerald", color: "from-emerald-500 to-green-600", routes: group("Pharmacy"),
    flow: ["/medicine_invoice", "/pharmacy/pick", "/pharmacy/review", "/pharmacy/dispense"], flowTitle: "Bill to handover", manual: "pharmacy" },
  { slug: "store", label: "Store", desc: "Receive, transfer, count, returns", icon: Boxes, hue: "slate", color: "from-slate-500 to-slate-700", routes: group("Store"),
    flow: ["/store/receive", "/store/transfers", "/store/cycle-count", "/store/returns"], flowTitle: "Supplier to shelf", manual: "store" },
  { slug: "cash", label: "Cash", desc: "Shifts, closing, approvals", icon: Wallet, hue: "indigo", color: "from-indigo-500 to-violet-600", routes: group("Cash"),
    flow: ["/cash/shift", "/cash/close", "/cash/approvals", "/cash/reports"], flowTitle: "Shift to close", manual: "cash" },
  { slug: "finance", label: "Finance", desc: "Overview, panels, claims, expenses, FBR", icon: HandCoins, hue: "pink", color: "from-pink-500 to-rose-600", routes: group("Finance"), manual: "accounts" },
  { slug: "accounting", label: "Accounting", desc: "Chart of accounts, vouchers, ledgers, statements", icon: BookOpen, hue: "blue", color: "from-blue-500 to-indigo-600", routes: group("Accounting"),
    flow: ["/accounting/journal-entries", "/accounting/payment-entries", "/accounting/reports/general-ledger", "/accounting/reports/trial-balance", "/accounting/reports/balance-sheet"], flowTitle: "Voucher to statement", manual: "accounts" },
  { slug: "buying", label: "Buying & Assets", desc: "Requests, orders, receipts, invoices, assets", icon: ShoppingCart, hue: "orange", color: "from-orange-500 to-amber-600", routes: group("Buying & Assets"),
    flow: ["/import/material-requests", "/import/rfqs", "/import/purchase-orders", "/purchase/receipts", "/purchase/invoices"], flowTitle: "Request to invoice", manual: "store" },
  { slug: "billing", label: "Billing", desc: "Doctor share, discounts, messages", icon: Percent, hue: "amber", color: "from-amber-500 to-orange-600", routes: group("Billing") },
  { slug: "insights", label: "Insights", desc: "Reports and patient feedback", icon: BarChart3, hue: "purple", color: "from-purple-500 to-fuchsia-600", routes: ["/reports", "/feedback"] },
  { slug: "online", label: "Online visits", desc: "Video consultations and their report", icon: Video, hue: "fuchsia", color: "from-fuchsia-500 to-pink-600", routes: ["/ov-staff", "/ov-staff/report"], manual: "online-visits" },
  { slug: "setup", label: "Setup", desc: "Users, settings, doctors, audit, devices", icon: Settings, hue: "stone", color: "from-stone-500 to-stone-700", routes: group("Admin"), manual: "admin" },
  { slug: "help", label: "Help & guides", desc: "Manuals, guides, videos, DFD", icon: LifeBuoy, hue: "green", color: "from-lime-500 to-green-600", routes: group("Help"), manual: "getting-started" },
];

export const appBySlug = (slug?: string) => APPS.find((a) => a.slug === slug);
export const itemByRoute = (route: string) => ALL.find((i) => i.route === route);
/** The app a route belongs to (first match), for the Back trail and the sidebar. */
export const appOfRoute = (route: string) => APPS.find((a) => a.routes.some((r) => route === r || route.startsWith(`${r}/`)));
/** Where an app opens: its home page, or its only screen. */
export const appHref = (a: App, visible: string[]) => (visible.length === 1 ? visible[0] : `/apps/${a.slug}`);
