export interface ModeRow { mode_of_payment: string; opening: number; collections: number; pay_in: number; pay_out: number; cash_drop: number; expected: number; counted?: number; difference?: number }
export interface Summary { shift: string; counter: string; branch: string; user: string; opened_at: string; modes: ModeRow[]; total_expected: number;
  movements: Record<string, number>; invoice_count: number; refund_count: number; sales_total: number; refund_total: number; max_cash_in_drawer: number }
export interface MyShift {
  counters: { name: string; counter_name: string; branch: string; counter_type: string; billing_type: string; current_user?: string; open_shift?: string; number?: number }[];
  shift: Summary | null; denominations: number[]; blind: number; tolerance: number; modes: string[];
  closing?: { name: string; status: string; decision_note?: string } | null;
  movements?: { name: string; movement_type: string; amount: number; reason: string; status: string; creation: string }[];
  invoices?: { name: string; customer_name: string; grand_total: number; is_return: number; hv_billing_type?: string; posting_time: string; mode?: string }[];
}
export const rs = (v?: number) => `Rs ${Math.round(Number(v) || 0).toLocaleString("en-PK")}`;
export const COUNTER_ICON: Record<string, string> = { Reception: "🧾", Lab: "🧪", "Pharmacy Billing": "💊", "Pharmacy Handover": "📦", "IPD Desk": "🛏️", General: "🏥" };
