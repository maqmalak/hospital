# 07 — Billing & Finance

## POS Profiles & invoice types
Six billing types (Fee, Medicine, Lab, General, OPD Slip, IPD Slip), each with its own income account and cost center, per branch (and per counter for the pharmacy). Invoices from React go through `services/billing.py`; pharmacy uses native POS (`04-pharmacy.md`). Every invoice/payment attaches to the collector's open shift (`05-cash.md`).

- **Tax** on the original price **before** discount (tested).
- **Refunds** → return invoice / Credit Note linked to the original, paid from the shift (Pay Out) or to card/online; reverses doctor share and payer split.
- **Advances/partial payments** → Payment Entry against the Customer, allocated at discharge/handover.

## Discount authorization
- **Discount Rule** per role (and optionally per department/billing type): max % and max amount per invoice.
- Above the limit → **Discount Request** to an approver role (realtime on `/billing/discount-approvals`; approver approves on their own screen or enters a PIN at the counter). Reason is mandatory for every discount.
- Discount Log (who requested, approved, amount, invoice); report by user, reason, department.
- Panel/insurance contractual discounts come from price lists, not this flow.

## Patient categories, welfare & zakat
- **Welfare Scheme:** name, fund type (Welfare / Zakat / Donor-specific), coverage (% or full, services covered, cap per visit/month), eligibility approval required (approved by Admin or social worker role, with notes and validity).
- Billing a welfare patient: the patient pays their share; the covered share is invoiced to the scheme's fund Customer (or settled by a Journal Entry from the fund account), so revenue is recorded and the fund balance reduces.
- Donations received → Payment Entry into the fund. Fund balance and utilization reports.
- Zakat eligibility rules are defined by the clinic; the system only records approvals.
- **Staff** category: staff/family discount via price list or discount rule.

## Panels (corporate clients)
- **Panel** = ERPNext Customer (group Panel) with price list, credit limit, contract validity, coverage rules (services covered, % covered, self/dependents, pre-approval required for listed services), employee list import (optional).
- Billing **splits** each bill: patient share (collected at the counter) + panel share (credit Sales Invoice to the panel Customer, referencing the patient bill).
- Monthly **panel statement** (PDF/Excel) per panel; AR aging; receive payments; record deductions/write-offs (Journal Entry, reason).

## Insurance
- Same split as panels, plus:
- **Insurance Pre-Auth** (admissions/procedures): requested amount, documents, status (Requested / Approved / Partially Approved / Rejected / Expired), approval no., approved amount, validity. Admission/procedure can require an approved pre-auth (setting).
- **Insurance Claim:** groups the payer-share invoices of a visit/admission; documents (discharge summary, lab reports, bills); status Draft → Submitted → Under Query → Approved / Partially Approved / Rejected → Settled. Deductions posted by Journal Entry with reason; rejected amounts can be billed to the patient (setting). Aging and claims status reports.

## Doctor share & referral commission
- **Doctor Share Rule:** doctor (or external referring doctor), service/item group/billing type, type (% or fixed), basis (gross or net of discount), effective dates.
- On invoice submit, each qualifying line creates a **Doctor Share Ledger** entry and an accrual Journal Entry (doctor share expense → doctor payable; doctor as Supplier or Employee — record choice). Refunds reverse it.
- Setting: accrue at invoice, or only when payment is received (useful for panel/insurance credit bills).
- **Payout run** (`/doctor-share`, PW Accountant): period + doctor(s) → statement → approve → Payment Entry. Doctors see their own statement (read-only).

## Expenses
**Expense** (category, amount, payee, method, receipt, recurring template, multi-level approvals child table, branch, Journal Entry link), **Expense Category** (→ expense account + cost center). Journal Entry on final approval. Petty cash from a drawer is a Cash Movement (`05-cash.md`).

## Purchasing
Use ERPNext Purchase Order / Purchase Receipt / Purchase Invoice (store keeper workspace, `04-pharmacy.md`); React screens `/purchase_order`, `/purchase_invoice` for approvals and lists.

## FBR / tax compliance (check before building)
Ask the clinic's tax advisor whether **FBR POS integration** (real-time reporting of retail invoices) applies to the pharmacy or other counters, and whether provincial sales tax on services applies. If required, add an adapter that reports each submitted invoice after commit, stores the FBR invoice number, and prints it with its QR on the receipt; queue and retry when offline. **Do not build until I confirm**; record in `DECISIONS.md`.

## Settings (Clinic Settings → Billing)
Discount rules, approver roles, panel/insurance switches, pre-auth required services, rejected-claim billing rule, doctor share accrual basis, welfare approval role, refund rules per department.
