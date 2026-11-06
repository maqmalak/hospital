# 00 — Clinic Settings, Patients, Doctors & Masters

## Clinic Settings (Single DocType, sections)

Organize as tabs. Fields marked *(branch)* can be overridden per branch through a child table **Branch Settings Override** (branch, field, value) or a per-branch settings DocType — pick one and record it in `DECISIONS.md`.

| Section | Fields |
|---|---|
| General | Clinic names (en/ur/ar), logo, address, phone *(branch)*, clinic mode (OPD only / OPD+IPD / Full Hospital), default currency (PKR), default fee, follow-up free window (days), vitals history count, avg consultation time, voice control toggle |
| Modules | Switches: Lab, Medicine, Ward, MAR, Diet, Procedures, ICU, Consent, Packages, Insurance, Panels, Emergency, Shifts, Pharmacy pipeline, WhatsApp, SMS, Online Visit, Patient Comms, Feedback, Doctor Share, Welfare |
| Printing | Printer type per document (thermal 80 mm / A4 / label), Printer Map (counter or device → receipt printer, label printer, A4 printer) *(branch)* |
| POS & Warehouses | POS Profile per billing type *(branch)*, warehouses (main store, pharmacy retail, IPD dispensing, lab store, general store, quarantine) *(branch)* |
| IPD | MAR billing trigger, stock deduction timing, allow negative stock, diet billing mode, procedure invoice trigger, discharge clearance hold |
| Appointments | See `01-appointments-messaging.md` |
| Messaging | See `01-appointments-messaging.md` |
| Lab | See `03-lab.md` |
| Pharmacy | See `04-pharmacy.md` |
| Cash | See `05-cash.md` |
| Billing | See `07-billing-finance.md` |
| Security | See `09-security-ops.md` |
| Page access | Page Access Rule child table (route, roles) |

## Patient

Auto-creates and links an ERPNext **Customer** on insert.

**Identity**
- **MR number:** permanent medical record number from a naming series per branch (e.g. `MR-LHR-000123`). Never reused, never changed, printed on every document.
- **Names** (en/ur/ar), father/husband name, gender, DOB or age (store DOB; if only age is given, store an estimated DOB and flag it), phone (not unique), alternate phone, address, city.
- **CNIC / B-form:** stored **encrypted** (Password-type or encrypted custom field), plus a SHA-256 hash for exact-match search and the last 4 digits for display. Shown masked (`*****-*******-1`). Only Admin and Receptionist can reveal the full number; every reveal is written to the access log.
- **Photo:** optional webcam capture at registration; shown on queue, prescription workspace and handover screens to confirm identity.
- **Patient card:** printable (CR80 card or 80 mm slip) with MR no., name, photo (optional) and a **QR code containing only the MR number**. Scanning it at any counter loads the patient.

**Duplicate detection & merge**
- On registration, before saving, search for likely duplicates: same CNIC hash, same phone + similar name (fuzzy), same name + DOB/age ±1 year. Show matches with MR no. and last visit; the user must choose "use existing" or "create new (reason)".
- **Merge tool** (Admin, `/patients/merge`): pick surviving and duplicate patient → preview linked records → merge moves all visits, appointments, prescriptions, lab, IPD, invoices and the linked Customer (use ERPNext's rename-with-merge for Customer; check v16 behavior) → duplicate becomes Disabled with "merged into" link → **Patient Merge Log** stores who, when and what moved. Merges cannot be undone automatically; require typing the MR no. to confirm.

**Households**
- Several patients can share one phone (family). A **Household** groups them (head, members, relation). WhatsApp and web booking list every patient on that phone.

**Category & payer**
- Category: Normal / Panel / Insurance / Staff / Welfare. Panel → panel Customer + employee ID + relation (self/dependent). Insurance → provider, policy no., validity. Welfare → approved scheme (see `07-billing-finance.md`).

**Clinical**
- Allergies (child → Allergy master), chronic conditions (child → Diagnosis), blood group, emergency contacts (child), current long-term medicines.

**Consents** (each with date and who recorded it): WhatsApp messages, SMS messages, data processing consent. Withdrawal is recorded, not deleted.

## Doctor

Names (en/ur/ar), specialization, department, default fee, follow-up fee, color tag, linked User, photo, license/registration no. and qualification, show-license flag, signature image (for prints), availability schedule (child: day, start, end, branch), slot config override, consultation room, **doctor share rules** link (see `07-billing-finance.md`), internal/visiting/external-referring type.

## Other masters

- **Doctor Leave**, **Blocked Date** (branch-aware), **Department**, **Specialization**
- **Allergy**: name, type (drug / food / other), linked generics and drug classes (child) used for prescription alerts
- **Diagnosis**: ICD-10 code, name, category
- **Drug Interaction**: generic A, generic B, severity (Minor / Moderate / Major / Contraindicated), clinical note. Imported via the data manager; the clinic's pharmacist chooses the source list (record in `DECISIONS.md`). Do not ship an invented list.
- **Medicine** = ERPNext Item with pharmacy fields (`04-pharmacy.md`), **Pharma Company**, **Medicine Category**, **Drug Class**
- **Lab Test Template** (`03-lab.md`), **Reference Lab**
- **Service Item** (ERPNext Item for fees, procedures, nursing, diet, oxygen, ER charges)
- **Panel** (Customer in group Panel), **Insurance Provider** (Customer), **Service Package**, **Welfare Scheme**
- **Branch** (ERPNext Branch), **Pharmacy Counter**, **Display Device**
