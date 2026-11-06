# 04 — Pharmacy

## 1. Item master (ERPNext Item + custom fields)

Medicines are ERPNext **Items** (Item Group "Medicines"). Use ERPNext's **built-in** batch and expiry features; add custom fields (fixtures) only for what ERPNext lacks. Consumables, lab reagents and general store items use the same Item/batch model in their own item groups.

**Native fields (do not duplicate):** `has_batch_no` = 1, `has_expiry_date` = 1, `create_new_batch` = 0 (batch no. from the supplier label), `shelf_life_in_days`; **Batch** (`batch_id`, `manufacturing_date`, `expiry_date`, supplier); `barcodes`, `reorder_levels`, `uoms`, `stock_uom`, `brand`, `item_group`.

**Custom fields on Item** ("Pharmacy" section, shown for the Medicines group):

| Field | Type | Notes |
|---|---|---|
| `pw_generic_name` | Data | e.g. Paracetamol (also links to the generic used by allergy/interaction checks) |
| `pw_strength` | Data | e.g. 500 mg, 250 mg/5 ml |
| `pw_dosage_form` | Select | Tablet, Capsule, Syrup, Suspension, Injection, Drops, Cream, Ointment, Inhaler, Sachet, Suppository, Infusion, Other |
| `pw_route` | Select | Oral, IV, IM, SC, Topical, Inhalation, Rectal, Ophthalmic, Otic, Nasal |
| `pw_drug_class` | Link → Drug Class | |
| `pw_manufacturer` | Link → Pharma Company | |
| `pw_medicine_category` | Link → Medicine Category | e.g. Antibiotic, Analgesic |
| `pw_units_per_strip` | Int | Tablets/capsules per strip |
| `pw_strips_per_pack` | Int | Strips per box |
| `pw_units_per_pack` | Int (read-only) | units per strip × strips per pack |
| `pw_pack_volume` | Data | Liquids, e.g. 120 ml bottle |
| `pw_allow_loose_sale` | Check | Sell single tablets |
| `pw_allow_strip_sale` | Check | Sell single strips |
| `pw_drap_reg_no` | Data | DRAP registration no. |
| `pw_controlled_drug` | Check | Needs prescription + Controlled Drug Register entry |
| `pw_prescription_required` | Check | Blocked at POS without a linked prescription (Admin override per setting) |
| `pw_max_daily_dose` | Data | Optional, for dose warnings |
| `pw_storage` | Select | Room temperature, Refrigerated 2–8 °C, Frozen, Protect from light |
| `pw_rack_location` | Data | Shelf/rack code (per warehouse via child table if racks differ by branch) |
| `pw_near_expiry_days` | Int | Per-item near-expiry window override |

**Custom fields on Batch:** `pw_mrp_per_pack`, `pw_purchase_rate_per_pack`, `pw_units_per_strip`, `pw_strips_per_pack` (copied from Item, editable when a supplier changes pack size for that batch).

**Units:** `stock_uom` = Tablet/Unit (smallest saleable unit); auto-create UOM conversions **Strip** and **Pack/Box** from the pack fields (`validate` hook on Item rebuilds them). Liquids use Bottle.

**Pricing:** Pack price from batch MRP (or Item Price list); Strip and Unit prices derived (MRP ÷ strips, MRP ÷ units), rounded per setting.

## 2. Purchasing & stock operations (PW Store Keeper)

Store keepers use a **Store workspace** in Desk (native Purchase Order, Purchase Receipt, Purchase Invoice, Material Request, Stock Entry, Stock Reconciliation, Batch), plus React helpers where noted.

- **Receiving:** Purchase Receipt requires batch no., expiry, MRP per pack, purchase rate, qty in packs + free/bonus packs; creates new Batches; converts packs to stock units. Rejects expired stock; warns inside the near-expiry window.
- **Warehouses per branch:** Main Store, Pharmacy Retail, IPD Dispensing, Lab Store, General Store, Quarantine.
- **Transfers:** pharmacy/IPD/lab raise a **Material Request**; the store issues a **Material Transfer** Stock Entry by batch (FEFO suggested). React view `/store/transfers` lists pending requests.
- **Cycle counts (`/store/cycle-count`):** scheduled counts by rack, category or "high-value"; tablet count sheet by batch (blind — no system qty shown); variance report; variances above a threshold need Admin approval; approved counts post a **Stock Reconciliation**.
- **Expired / damaged stock:** a daily job lists newly expired batches (they're already blocked from sale). The store keeper moves them to **Quarantine**, then either a **Purchase Return** (debit note against the supplier, by batch) or a **write-off** (Material Issue to an expense account, Admin approval).
- **Supplier returns (`/store/returns`):** return against Purchase Receipt by batch; reason; debit note.
- **Reorder:** native reorder levels per warehouse → auto Material Requests (setting) and a reorder list.

## 3. Billing on ERPNext Point of Sale (`/app/point-of-sale`)

**Do NOT build a custom React POS.** Extend ERPNext's POS only through hooks, custom fields and a page script.

- **Access:** PW Pharmacy Cashier (and Admin) get Desk access limited to a **Pharmacy workspace** (Point of Sale, Item lookup, Batch lookup, pharmacy reports). Finder, Reviewer and Dispenser use only React screens. The React Pharmacy tile opens `/app/point-of-sale`.
- **Shifts:** opened and closed **only** through `/cash/shift` and `/cash/close` (`05-cash.md`), which create the native POS Opening/Closing Entry. POS picks up the user's open opening entry. The page script hides POS's own close button for cashier roles so every closing goes through the blind count.
- **POS Profile** per counter and branch: Medicines item group, branch retail warehouse, payment modes (Cash, Card, Online/wallet), "allow rate change" off, "allow discount" per role (discount authorization, `07-billing-finance.md`).
- **Batch & expiry:** Stock Settings "pick serial/batch based on" = **Expiry** (FEFO; verify the field name in v16). A `validate` hook on POS/Sales Invoice **blocks expired batches** and warns or blocks near-expiry batches (setting).
- **Pack / Strip / Unit:** native UOM in the cart; mixed quantities are separate lines; hide UOMs the item doesn't allow.
- **Search:** add `pw_generic_name` to Item search fields (brand, generic, barcode).
- **Page script** (`public/js/pos_pharmacy.js`, small and isolated; re-check after every ERPNext update): strength, rack, stock in packs/strips/units, batch expiry, near-expiry badge, **Load prescription** (pulls a prescription into the cart, keeps `pw_prescription`), **Substitutes** (below), publishes cart changes to the customer display, hides the close-shift button.
- **Prescription link:** `pw_prescription` on POS Invoice and Sales Invoice. With "auto-create medicine invoice" on, a signed prescription creates a draft invoice the cashier opens from POS drafts.
- **Prescription-required & controlled drugs:** `validate` blocks them without `pw_prescription` (Admin override per setting); `on_submit` writes the **Controlled Drug Register** (patient, prescriber, batch, qty, balance).
- **Returns:** native POS return; the hook confirms each line returns to its original batch; doctor share and payer split reverse (`07-billing-finance.md`).
- **Print:** 80 mm thermal receipt (Print Designer) with generic, batch, expiry per line and the **token number** large plus QR.

## 4. Generic substitution

- When an item is out of stock, or on request, show **alternatives**: same generic + strength + dosage form, in stock at this warehouse, with price and expiry.
- Not allowed when the prescription line is marked **no substitution**.
- For prescription-required items, a substitution needs Reviewer (pharmacist) approval; it is recorded on the invoice line (original item, substitute, approved by) and shown on the receipt.

## 5. Counters, customer displays & fulfilment pipeline

Several billing counters, each with a **customer-facing display**. After billing, each order moves through a **fulfilment pipeline**: rack picking → review & count → handover.

```
POS counter (bill saved or paid, token printed)
   → Queued → Picking (Finder) → Picked
   → Reviewing (Reviewer: check + count) → Ready
   → Called (Handover counter) → [Collect payment if due] → Handed Over
   exceptions: Not Found / Short → counter or reviewer; Recount; On Hold; Not Collected
```

**DocTypes**
- **Pharmacy Counter:** number/name, branch, type (Billing / Handover), POS Profile, display device, active, current user.
- **Dispense Ticket:** invoice link, patient/customer, **token** (daily sequence per branch, e.g. P-042), billing counter, priority (Normal / Urgent / Elderly-Disabled), status, finder, reviewer, handover counter, timestamps per stage, amount due, exception reason, notes. Created when the invoice is **submitted** (pay at billing) or when the **draft is sent to the pipeline** (pay at handover).
- **Dispense Ticket Item:** item, UOM, qty, batch (from the invoice), rack, found qty, found by/at, counted qty, reviewed flag, line status (Pending / Found / Not Found / Short / Substituted).
- **Display Device:** device key, type (Customer Display / Queue Display / Kiosk), counter, branch, location, last seen. Display pages authenticate with the device key only, read-only.

**Billing counter + customer display (`/display/counter/:deviceKey`)**
- The page script publishes cart changes (`pharmacy_counter_<id>`). The display shows counter number, items with qty/UOM and price, discount, total, paid, change; after billing, the **token** and "Please collect from the handover counter"; when idle, clinic logo and messages.

**Picking (`/pharmacy/pick`, PW Finder)**
- Tablet list of Queued tickets, Urgent first then oldest. **Start** assigns the ticket (row lock; others can't take it).
- Lines sorted by rack for one walking path: item, strength, form, UOM, qty, batch, expiry.
- **Scan item/batch barcode** (or tap Found) and confirm qty; wrong item or batch is rejected.
- **Not found / short:** reason → **Exception** → shown at the billing counter (amend via native return/new line) or to the reviewer (batch swap or substitution).
- All lines found → **Picked**.

**Review & count (`/pharmacy/review`, PW Reviewer)**
- Picked items beside invoice lines. Count each line; confirm item, strength, batch, expiry; check the prescription; see clinical alerts and doctor overrides from `02-opd.md`; for OTC sales of prescription-required or interacting items, the same allergy/interaction checks run here.
- **Approve** → Ready. **Send back** → Picking with reason.
- **Batch rule:** the batch billed must be the batch handed over. If it differs, the ticket goes to the counter to correct the invoice (return + re-bill).
- Setting: skip review when the ticket has no prescription-required/controlled items (default off).

**Handover (`/pharmacy/dispense`, PW Dispenser)**
- Ready tickets. **Call** → Called: queue display shows token + counter with chime and spoken announcement (English and Urdu, e.g. "Token P-042, counter 3").
- **Recall**; after N recalls → **Not Collected** (parked).
- **Collect payment** when the ticket has an amount due (Cash with tendered/change, Card ref, Online ref, or split), on the dispenser's own shift. Handover is blocked until paid.
- **Handover:** scan receipt QR or enter the token, confirm the patient (photo if available) → **Handed Over**. Show counselling notes from the prescription.

**Payment point (setting "Collect payment at")**
- **Billing counter** (default): invoice submitted at the counter (stock deducted); nothing due at handover.
- **Handover counter:** the counter saves a **draft** invoice (prices and batches fixed, no stock movement) and sends it to the pipeline. At handover the dispenser collects and the invoice is **submitted then** (stock deducted). Keep draft batch quantities available — evaluate ERPNext **Stock Reservation Entry**, otherwise subtract reserved draft quantities in the `validate` hook; record the choice. Uncollected drafts appear on the day-end list; a supervisor cancels or carries them over (setting).
- **Advance + balance:** partial payment at billing (invoice submitted), balance as a Payment Entry at handover.

**Queue display / kiosk (`/display/queue/:deviceKey`)**
- Columns **Preparing** (Queued/Picking/Reviewing) and **Ready – please come to counter X** (Called; newest highlighted). Token numbers only, never names or medicines.
- Optional kiosk mode: scan receipt to see order status.
- Realtime with auto-reconnect; after 30 s offline show "Reconnecting".

**Pipeline rules**
- Money and stock are settled according to the payment point setting. Apart from submitting the draft at handover, the pipeline never creates stock or accounting entries; it tracks physical fulfilment.
- Stage changes go through whitelisted methods with role checks and row locks; every change is logged with user and time.
- Dashboard: average wait per stage, tickets per finder/reviewer, exceptions, not-collected tickets.

## 6. Reports
Near-expiry (by window), expired, batch-wise stock, stock in packs/strips/units, slow-moving, reorder list, controlled drug register, substitutions, cycle count variances, supplier returns, margin by item/category.

## 7. Settings (Clinic Settings → Pharmacy)
Near-expiry window (default 90 days), block near-expiry sale, loose-sale price rounding, allow prescription override (Admin), FEFO enforced vs suggested, pipeline on/off, token prefix and daily reset, skip review rule, recall limit, announcement languages and voice, chime, idle-screen messages, collect payment at, carry over uncollected drafts, cycle count variance threshold, auto material requests.
