# 05 — Cashier Shifts & Cash Reconciliation

Applies to **every** user who takes money: pharmacy cashiers, handover dispensers, reception, lab counter, IPD billing desk. Built on ERPNext's **POS Opening Entry** and **POS Closing Entry**, extended with custom fields and hooks. Shifts are opened and closed only through these screens (native close is hidden for cashier roles).

## 1. Open shift (`/cash/shift`)
- Pick counter (branch-filtered) → enter opening float per payment mode (cash by denomination optional) → creates the POS Opening Entry for the counter's POS Profile.
- No money can be collected without an open shift; one open shift per user at a time.

## 2. During the shift (`/cash/shift` live summary)
- **Collections:** every invoice or payment the user takes links to their open POS Opening Entry — pharmacy POS, handover collections, OPD/lab/IPD/general invoices, advance and balance Payment Entries.
- **Cash Movement** (DocType, linked to the shift):
  - **Pay Out** — cash refund or petty expense from the drawer (reason, receipt)
  - **Pay In** — float top-up
  - **Cash Drop** — excess cash to the safe/supervisor mid-shift (receiver confirms on `/cash/approvals`)
  Each posts a Journal Entry between the counter's cash account and the mapped account; refunds also link the credit note.
- Cash refunds reduce expected cash; card/online refunds reduce those modes.
- **Max cash in drawer** alert prompts a cash drop.

## 3. Close shift — blind count (`/cash/close`)
- Count the drawer by denomination (PKR 5000, 1000, 500, 100, 50, 20, 10, coins; configurable) and enter card/online totals from the terminal settlement slip. **Blind count on by default:** expected figures are hidden until the count is submitted.
- Per payment mode:

```
Expected = Opening float
         + Collections (sales + advance/balance payments)
         − Refunds paid
         − Pay Outs
         + Pay Ins
         − Cash Drops
Difference = Physical count − Expected      (> 0 Excess, < 0 Short, 0 Balanced)
```

- Result screen: opening, each movement total, expected, counted, **Excess / Short** per mode, cash to hand to the safe vs float kept.
- Creates the native **POS Closing Entry**; a hook sets expected amounts to include Cash Movements. Child table **Cash Denomination Count** stores the count.

## 4. Excess / short
- Within **tolerance** (e.g. ±PKR 50): closes automatically.
- Beyond tolerance: waits for **PW Cash Supervisor** with the cashier's explanation. Supervisor approves, asks for a recount (reopens the count), or records a **cashier liability** (shortage).
- On approval, the difference posts a Journal Entry to **Cash Over/Short** (excess as income, short as expense) or to a staff receivable account for cashier liability.

## 5. Reports (`/cash/reports`)
Shift summary print (80 mm and A4, signed by cashier and supervisor), day-end cash position across counters and branches, excess/short history per cashier with trend, open shifts not closed, cash drops pending confirmation, uncollected pharmacy drafts.

## Settings (Clinic Settings → Cash)
Denominations, blind count on/off, tolerance, Cash Over/Short account, staff receivable account, supervisor approval above tolerance, allow cash drops, max cash in drawer, auto-close reminder time, counter cash accounts per branch.
