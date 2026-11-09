# Pharmacy QA / acceptance — contract pharmacy, billing at handover

Date: 2026-11-09 · Site `hospital` · Mode: **Clinic Settings → Pharmacy → Collect payment at = Handover counter** (pay at dispensing).
Books: **VVS Pharmacy (Contract)** (D-38). Automated suite: `hospital_vvs/tests/test_pharmacy_qa.py` (7 cases, every step as the real demo user through the API the screens use). Full app suite: 52 green.

## Process tested

| Step | Who | Screen | What was checked | Result |
|---|---|---|---|---|
| 1 Cart | cashier@ | `/medicine_invoice` | Pack / strip / unit price from batch MRP (pack 200 → strip 100 → unit 10); FEFO picks the shortest-dated batch; near-expiry warning; expired never sold; rack + expiry on each line; priority **Normal / Elderly / Disabled / Urgent** | Pass |
| 1a Rules | cashier@ | POS | Prescription-only and controlled items blocked without a prescription; more than stock refused | Pass |
| 1b Discount | cashier@ | POS | ≤ limit (5 % / Rs 500) applied at once; above limit pending until the supervisor approves; unapproved discount refused at checkout | Pass |
| 1c Send | cashier@ | POS | Draft invoice in the contractor's company, **no money, no stock moved**; token (P-001) with amount due; reserved units cannot be sold again | Pass |
| 2 Find | finder@ | `/pharmacy/pick` | Take next ticket (priority order); second finder cannot take the same ticket; list in **rack order**; wrong batch and unknown code refused; all lines found → sent for review | Pass |
| 2a Exception | finder@ | pick | "Not found" → ticket to Exception for the pharmacist | Pass |
| 3 Review | pharmacist@ | `/pharmacy/review` | Counted ≠ billed blocks approval; **substitute** only with same generic / strength / form, bill re-priced; **partial supply** (new): line removed from the unpaid bill, amount due lowered, reason kept; approve → Ready; cashier cannot review | Pass |
| 4 Handover + billing | dispenser@ | `/pharmacy/dispense` | Own shift at Handover 3 (contractor's counter only); call / recall; cannot hand over before payment; **split payment** (new) with transaction ID for card / wallet / bank, change only from cash; invoice submitted, stock deducted from the contractor's retail store by the picked batch, GL only in the contractor's books; collection counted in the **dispenser's shift**; scan token to hand over | Pass |
| 4a Not collected | dispenser@ | handover | After the recall limit (3) → Not Collected; bill stays a draft, stock untouched | Pass |
| 5 Controlled / returns | dispenser@ | handover | Controlled drug never skips review; Controlled Drug Register written on payment; refund returns the same batch to stock | Pass |

Browser walkthrough with the four demo users (cashier → finder → pharmacist → dispenser): token P-001, Panadol 1 strip + Brufen 1 pack (Elderly) → Brufen "not supplied" at review → Rs 107 collected as Rs 100 cash (Rs 50 change) + Rs 57 JazzCash (JC-QA-7781) → handed over in 3½ minutes. Invoice ACC-SINV-2026-00421 in VVS Pharmacy (Contract), stock −10 units of batch PANADO-A714 from Pharmacy Retail LHR - VVSP, dispenser's shift shows Cash 50 / JazzCash 57.

## Defects found and fixed

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | Sales paid at handover were missing from the dispenser's shift (ERPNext counts a POS invoice in its creator's shift; the cashier created the draft) | Dispenser's expected cash and POS closing wrong; cash would show "excess" | On payment the invoice belongs to the collector (`collect_payment`) |
| 2 | No partial supply: an item that could not be supplied could only be substituted | Patient charged for an item not given, or whole ticket stuck | Pharmacist "Not supplied" button (`drop_line`) removes the line from the unpaid bill |
| 3 | Handover payment single-mode, no transaction ID | No split cash + JazzCash; no audit of wallet / card references | Split payment, transaction ID required for non-cash, change only from cash; IDs saved on the invoice |
| 4 | Priority only Normal / Elderly-Disabled / Urgent | Owner wants four levels | Normal / Elderly / Disabled / Urgent (old tickets keep "Elderly-Disabled") |
| 5 | Token card said "Cash" for an unpaid draft | Cashier may think it was paid | Shows "Pay at handover" until paid |
| 6 | Review: removing / substituting did not refresh the ticket list, and a double click submitted twice | Stale amount on the list; "Line not found" error | List refreshes after every action; buttons lock while saving |

## Before the run (demo clean-up)
- Removed 16 lab test orders left by earlier test runs (LAB-2026-00008 … 00019, 00021 … 00023, 00025), with their samples, results, outsourced dispatches and purchase bills, and the lab shift those runs left open; removed the browser test online visit OV-2026-00013 and the patient/test documents a test run hung on it. LAB-2026-00001 (demo seeder) kept.
- Closed the three demo shifts open since 7 Nov (Pharmacy 1, Pharmacy 2, Reception 1) at their expected amounts (difference 0); Pharmacy 1 and 2 then moved to the contractor's company.

## Open shifts left by this QA
- dispenser@ at Handover 3 (POS-OPE-2026-00007, float Rs 1,000, collected Rs 50 cash + Rs 57 JazzCash) and reception2@ at Reception 2 (from the counter test). Close them at `/cash/close` when done.

## Not covered / notes for the owner
- Thermal printing tested with the browser print dialog stubbed (no physical printer).
- The pharmacy's own day-end and supervisor approvals still use the hospital's Cash Supervisor role; the contractor may want its own supervisor user.
