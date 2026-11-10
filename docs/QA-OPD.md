# OPD QA / QC — live audit (2026-11-10)

Run as the real demo users through the API the screens use: **reception@ / reception2@** (shifts, registration, OPD slips), **nurse@** (queue priority), **dr.ayesha@ / dr.usman@** (queue, prescriptions), **supervisor@** (shift recount). Runner: `bench --site hospital execute hospital_vvs.devtools.qa_opd.run` (keeps its data). Raw: `docs/qa-opd-run.json`. Regression tests: `tests/test_opd_qa.py`.

**Final run: 52 checks, 52 pass, 0 fail** (first run 51 checks, 45 pass).

## Defects found and fixed

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | Prescription quantity was whatever the doctor typed; blank went to the pharmacy as **1 unit** | Panadol 1+1+1 × 5 days sold as one tablet; whole courses under-dispensed | Quantity worked out from dose × frequency × duration (patterns 1+0+1, ½+0+½, 2+0+2, OD/BD/TDS/QID/HS/SOS/stat/weekly/q8h; days / weeks / months); syrups in bottles (Clinic Settings → syrup bottle ml, 120), creams / drops / inhalers 1 pack; shown live in the workspace ("auto", re-calc), filled on the server when blank; a typed quantity is kept |
| 2 | Shift closing accepted a cash total typed as a key ("Cash: 5500") and counted it as zero | A false Rs 8,200 shortage went to the supervisor (live SC-2026-00004) | Closing accepts only the configured note denominations; SC-2026-00004 was sent back for recount by supervisor@ and recounted by reception2@ → Balanced |
| 3 | (tests) the Phase 1 helper needed a free reception counter | Tests failed whenever both counters had real shifts | Helper borrows a counter inside the rolled-back test transaction |

## Built on request during the audit
- **Pending patients** on `/pw-prescription`: today's Waiting / Called / In-consultation patients of the signed-in doctor (doctor picker for others), urgent and elderly first, waiting minutes, *Call next*; inside the workspace a **Next patients** panel to move to the next one.
- **English → Urdu typing** (Urdu name field): follows the English live; correct it with an Urdu keyboard or the **phonetic keyboard** (⌨ — English keys type Urdu: s س, x ش, k ک, K خ, g گ, G غ, t ت, T ٹ, d د, D ڈ, r ر, R ڑ, n ن, N ں …); ↻ spells again from the English; corrected words are **learned site-wide** (Urdu Word list) and used by every English → Urdu field.
- **Daily demo data**: `scripts/opd_demo.sh` (NEW / VISITS / SITE) — shifts, new + returning patients with Urdu names, slips with vitals, nurse priorities, doctors' prescriptions with lab tests, a few left waiting.

## Scenarios and checks

### O01 Cashier shift before money
- ✅ **O01-3** shift open at Reception 2 with the opening float
- ✅ **O01-4** receptionist cannot open a second shift
- ✅ **O01-5** reception@ has an open shift at Reception 1

### O02 Register a new patient
- ✅ **O02-1** name and gender are required
- ✅ **O02-2** MR number given in the branch series (MR-LHR-…)
- ✅ **O02-3** phone stored in +92 format
- ✅ **O02-4** CNIC kept masked and hashed, never in clear
- ✅ **O02-5** customer created for billing
- ✅ **O02-6** age converted to an estimated date of birth
- ✅ **O02-7** same name + phone again is caught as a possible duplicate
- ✅ **O02-8** a genuine namesake can be registered with a reason
- ✅ **O02-9** duplicate finder lists the existing record

### O03 Find an existing patient
- ✅ **O03-MR** search by MR finds the patient
- ✅ **O03-phone** search by phone finds the patient
- ✅ **O03-name** search by name finds the patient
- ✅ **O03-CNIC** search by CNIC finds the patient
- ✅ **O03-5** patient file opens with history

### O04 OPD slip and token
- ✅ **O04-1** consultation fee = the doctor's fee (Rs 1,500)
- ✅ **O04-2** change worked out from cash tendered (Rs 500)
- ✅ **O04-3** invoice submitted in the receptionist's shift
- ✅ **O04-4** next token for this doctor today
- ✅ **O04-5** queue entry Waiting for Dr. Ayesha in her room
- ✅ **O04-6** slip print carries token, room, doctor and amount
- ✅ **O04-7** vitals saved on the slip
- ✅ **O04-8** a doctor cannot issue OPD slips (counter only)

### O05 Follow-up visit fee
- ✅ **O05-1** second visit within 7 days is a free follow-up
- ✅ **O05-2** free follow-up still gets a token (no invoice)

### O06 Physician queue
- ✅ **O06-1** waiting list: Urgent first, then Elderly, then by token
- ✅ **O06-2** Call next calls an urgent patient first (oldest urgent token)
- ✅ **O06-3** waiting-room display shows the called token and room
- ✅ **O06-4** a skipped patient can be put back in the queue
- ✅ **O06-5** unknown queue status refused

### O07 Prescription
- ✅ **O07-1** workspace opens the queued patient with today's vitals
- ✅ **O07-2** saving the draft moves the patient to In Consultation
- ✅ **O07-3** Panadol 1+1+1 × 5 days → quantity 15 calculated
- ✅ **O07-4** Amoxil 1+0+1 × 7 days → quantity 14 calculated
- ✅ **O07-5** signing marks the queue entry Done
- ✅ **O07-6** follow-up date set from 7 days
- ✅ **O07-7** pharmacy gets a draft medicine bill
- ✅ **O07-8** pharmacy draft carries the full course (15 Panadol), not 1
- ✅ **O07-8b** syrup 5 ml × 3 × 5 days = 75 ml → 1 bottle
- ✅ **O07-9** lab order created from the prescription
- ✅ **O07-10** a signed prescription cannot be edited (amend instead)
- ✅ **O07-11** prescription print data ready (doctor, medicines, advice)

### O08 Safety alerts
- ✅ **O08-1** penicillin allergy raises a blocking alert for Amoxil
- ✅ **O08-2** cannot sign without an override reason
- ✅ **O08-3** signed with the override reason recorded

### O09 Amendment and roles
- ✅ **O09-1** receptionist cannot write prescriptions
- ✅ **O09-2** amendment needs a reason
- ✅ **O09-3** amendment opens a new draft linked to the original

### O10 Doctor's pending list
- ✅ **O10-1** doctor sees today's pending patients with tokens
- ✅ **O10-2** each pending row links to its draft prescription if one exists

## Notes for the owner
- Open shifts after the audit: reception@ (Reception 1), reception2@ (Reception 2, opened after the recount), lab@ (Lab Counter) — close at `/cash/close`.
- The transliteration is rule-based with a dictionary of common Pakistani names; uncommon spellings (e.g. *Zohaib* → زوہایب) need one correction, after which the system remembers it.
