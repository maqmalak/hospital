/** Hospital shim for the sugarcane DocType registry (D-65): no generated mill DocTypes here — every ported screen has its own route. */
import type { LucideIcon } from "lucide-react";

export type ScApp = "accounts" | "purchase" | "finance";
export interface ScDoc { doctype: string; label: string; app: ScApp; group: string; icon: LucideIcon }
export const SC_DOCS: ScDoc[] = [];
export const docBase = (doctype: string) => `/accounting/d/${doctype.toLowerCase().replace(/ /g, "-")}`;
