# 06 — IPD, Emergency & Nurse Roster

## IPD DocTypes
- **Ward** (code, type, color, head doctor, nurse ratio, branch), **Floor**, **Room** (type, bed count, ICU flag, daily rate), **Bed** (Available / Occupied / Reserved / Cleaning / Out of service, current allotment, notes).
- **Bed Allotment** (admission record): patient, admitting doctor, consultant(s), bed/room/floor, admit datetime, source (OPD / ER / direct / transfer), reason, provisional diagnosis, planned days, billing mode, payer (self / panel / insurance with pre-auth link, `07-billing-finance.md`), service package, daily rate, nursing charge per shift, status, bed transfers (child: from, to, datetime, reason), actual release datetime, readmission link.
- **IPD Note** (configurable note types: progress, nursing, consultant visit; signed record), **Ward Round** (round number, doctor, notes, orders), **MAR Entry** (medicine, dose, route, scheduled time, administered by/at, approval status if gate enabled, billed flag, stock entry link, missed/refused reason), **Diet Order** (date, diet type, meals, charge), **IPD Procedure** (scheduled datetime, theatre/room type, team child table, anesthesia, status, invoice link, consent link), **Ad-hoc Service Charge**, **Consumable Usage**, **Vitals Chart** (time-series), **Intake/Output** (optional), **Discharge Summary** (final diagnosis, treatment summary, procedures, discharge medicines, follow-up plan; signed record), **Consent Form** (type, signed by patient/attendant, witness, scanned copy; signed record).

## Rules
- Admission creates the Patient Comms profile and token (`08-online-visit-comms.md`), marks the bed Occupied, and starts a running bill.
- MAR deducts IPD dispensing stock immediately or at discharge (setting); billing per MAR trigger setting. Medicines come from the IPD dispensing warehouse, replenished via Material Requests (`04-pharmacy.md`). Allergy/interaction checks apply to IPD orders (`02-opd.md`).
- **IPD billing (aggregated final invoice):** bed days (per bed transfer segment), ICU surcharge, nursing per shift, MAR medicines, procedures, labs, consumables, diet, oxygen, ad-hoc charges; package price overrides included items; payer split; advances allocated; discounts via authorization.
- **Running bill** visible at any time on `/ipd_slip`; interim bills and advance requests printable.
- **Discharge:** summary signed → clearance check (pharmacy returns, pending labs, dues; hold if enabled) → final invoice → bed → Cleaning → Available; comms profile deactivated; feedback request (if enabled). Discharge types: Normal, LAMA (left against medical advice, with signed form), Referred, Expired (death details recorded; no feedback message).

## Emergency module (module switch "Emergency")
- **ER Visit:** quick registration with minimal data; **unknown patient** allowed ("Unknown Male ~40", temporary MR) and merged later with the patient merge tool; arrival mode; brought by; medico-legal flag (record only — workflow per hospital policy).
- **Triage:** level (5-level scale or Red / Yellow / Green — setting), vitals, chief complaint, triage nurse, time.
- **ER Board (`/er`):** live list by triage level and waiting time, bay/bed, assigned doctor, status.
- ER notes, orders (labs, medicines from IPD dispensing, procedures), MAR as in IPD.
- **Disposition:** discharge home, admit (creates Bed Allotment with ER charges carried over), refer out, LAMA, expired.
- **ER billing:** running bill like IPD, or OPD-style slip for short visits (setting).

## Nurse duty roster
- If ERPNext **HRMS** is installed, use **Shift Type** and **Shift Assignment**; otherwise a simple **Nurse Duty Roster** DocType (ward, date, shift, nurses). Record which in `DECISIONS.md`.
- Nursing station shows on-duty nurses; nursing charges per shift and MAR "administered by" suggestions use the roster.
- Roster screen `/roster` (Admin, head nurse).

## Build decisions (Phase 3)
See `DECISIONS.md` D-28 … D-34: one IPD Charge ledger + one final invoice per stay, bed days by midnight census, nursing per started shift, advances as Payment Entries in the cashier shift, package and pre-auth caps, temporary MR for unknown ER patients, HRMS roster, and Floor/Room/ad-hoc/consumable folded into existing DocTypes.
