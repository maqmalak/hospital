# 02 — OPD: Slip, Queue, Prescription, Clinical Safety & Signed Records

## OPD Slip
Patient, doctor, branch, datetime, purpose (Consultation / Follow-up / Procedure), chief complaint, notes, vitals (BP, pulse, temp, weight, height/BMI, SpO₂, RBS optional), line items, discount (through discount authorization, `07-billing-finance.md`), payer split (patient / panel / insurance), payment method, cash tendered/change, token number, linked invoice, cashier shift.

- Invoice auto-created on the OPD POS Profile; skipped when fee is 0; free inside the follow-up window.
- Scan the patient card QR to load the patient.

## Queue Entry
Doctor, patient, branch, room, token, status (Waiting / Called / In Consultation / Done / Skipped), priority flag (urgent, elderly, disabled), follow-up flag, timestamps. Live updates; full-screen waiting-room display (token and room only, no names unless setting allows first name).

## Prescription
Patient, doctor, OPD slip or Bed Allotment or ER visit, round number (IPD), medicines (child: medicine, dose, frequency, route, duration, quantity, instructions, **no substitution** flag), diagnoses (child, ICD), lab tests (child), examination notes, advice, follow-up date (auto from revisit days), status.

**Speed-first workspace (`/pw-prescription`):** keyboard-driven medicine autocomplete (brand or generic) with structured dosing, recent/favorite medicines and templates per doctor, copy previous prescription, voice dictation toggle, one-key sign + print. A typical prescription should take under a minute.

## Clinical safety alerts

Run on every medicine line as it's added, and again on save:

1. **Allergy:** compare the medicine's generic and drug class against the patient's allergies (Allergy master's linked generics/classes). Show a red blocking alert; the doctor can continue only with an **override reason**.
2. **Drug interactions:** check each pair of lines in this prescription, plus the patient's active medicines (current IPD MAR, long-term medicines, prescriptions in the last N days — setting), against the **Drug Interaction** master. Minor/Moderate → amber warning; Major/Contraindicated → blocking alert with override reason.
3. **Duplicate therapy:** same generic twice, or two drugs of the same class flagged as duplicate.
4. **Optional dose check:** if the Item has max daily dose, warn when exceeded.

All overrides are stored on the line (alert type, severity, reason, user, time) and shown to the pharmacy reviewer. The same checks run on the pharmacy review screen (`04-pharmacy.md`) for over-the-counter sales.

## Signed records (immutable)

- Prescription, IPD Note, Discharge Summary, Consent Form and verified Lab Results are **submittable** DocTypes.
- **Signing** = submit: records user and timestamp; the print shows the doctor's name, registration no. and optional signature image.
- After signing, no field can change. Corrections use **Amend** (Frappe amend) with a mandatory reason; the old version is cancelled-and-kept, marked "Superseded", and stays visible in history. Prints show "Amended — version N".
- Downstream effects of an amended prescription: an unpaid draft medicine invoice is updated; a paid one is flagged for the pharmacy to review (no automatic stock changes).

## Patient History (`/pw-history`)
Timeline across branches: visits, vitals trends (chart), prescriptions (with versions), lab results (with previous values side by side), IPD stays, ER visits, documents. Every open of a patient's history is written to the access log (`09-security-ops.md`).
