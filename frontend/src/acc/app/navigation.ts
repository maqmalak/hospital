/**
 * Navigation for the accounting and buying screens ported from sugarcane (D-65). The hospital's own sidebar and top bar
 * wrap these pages; this file keeps the shape the ported screens read (titles for breadcrumbs / the Back trail, and the
 * finance / buying groups for the Finance page's "Manage finance" cards).
 */
import { FINANCE_NAV, STORE_NAV } from "@/acc/app/erp-navigation";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon?: LucideIcon;
  /** Roles allowed to see this entry. Empty = everyone (server still enforces). */
  roles?: string[];
}
export interface NavGroup {
  /** Group heading; omitted for standalone links. */
  title?: string;
  items: NavItem[];
}

export const APP_NAVIGATION: Record<string, NavGroup[]> = {
  accounting: FINANCE_NAV,
  purchase: STORE_NAV,
};

export const APP_LABELS: Record<string, string> = {
  accounting: "Accounting",
  purchase: "Buying",
  import: "Buying",
  masters: "Masters",
  finance: "Finance",
};

/** First path segment (`"/accounting/journal-entries"` -> `"accounting"`). */
export function appSegmentForPath(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "";
}

export const NAVIGATION: NavGroup[] = Object.values(APP_NAVIGATION).flat();

export const ROUTE_TITLES: Record<string, string> = {
  "": "Desktop",
  home: "Desktop",
  "pw-home": "Desktop",
  d: "Records",
  accounting: "Accounting",
  finance: "Finance",
  purchase: "Buying",
  import: "Buying",
  masters: "Masters",
  "chart-of-accounts": "Chart of Accounts",
  "journal-entries": "Journal Entries",
  "payment-entries": "Payment Entries",
  "general-ledger": "General Ledger",
  "trial-balance": "Trial Balance",
  "profit-and-loss": "Profit and Loss",
  "balance-sheet": "Balance Sheet",
  "cash-flow": "Cash Flow",
  "purchase-orders": "Purchase Orders",
  receipts: "Purchase Receipts",
  invoices: "Purchase Invoices",
  "landed-costs": "Landed Costs",
  "material-requests": "Material Requests",
  rfqs: "Requests for Quotation",
  "supplier-quotations": "Supplier Quotations",
  suppliers: "Suppliers",
  "supplier-groups": "Supplier Groups",
  new: "New",
  edit: "Edit",
};

export function titleForSegment(segment: string): string {
  return ROUTE_TITLES[segment] ?? segment.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}
