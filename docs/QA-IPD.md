# IPD & Emergency QA / QC — live audit (2026-11-11)

Run as the real demo users through the API the screens use: **reception@** (admission desk, advances, settlement, refunds, final bill), **dr.ayesha@** (rounds, medicine orders, procedures, discharge summary, ER disposition), **nurse@** (vitals, notes, MAR, transfers, diet, consent, triage), **accounts@** (pre-auth decision, reports), **supervisor@** (discount approval, charge cancel), **admin@** (identify unknown ER patient), plus cashier@ / lab@ for access checks. Runner: `bench --site hospital execute hospital_vvs.devtools.qa_ipd.run` (keeps its data). Raw: `docs/qa-ipd-run.json`. Regression tests: `tests/test_ipd_qa.py`.

**Final run: 70 checks, 70 pass, 0 fail** (first run 58 checks, 49 pass — some first-run failures were the runner's own wrong expectations, listed separately below).

## Defects found and fixed

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | IPD vitals chart and ER triage accepted impossible readings (pulse 900, temperature 150 °F) | Typing slips stored on the chart and shown to doctors as real trends | One shared range check (`utils.check_vitals`) used by OPD nurse, IPD chart and ER triage |
| 2 | Discharge went through when the advance was **more** than the bill | Patient (or family) leaves without the extra advance; refund never recorded | New clearance item *Extra advance refunded*; discharge waits until the refund is paid from the shift (refund above the extra amount is refused) |
| 3 | Final bill crashed for a stay covered 100 % by an insurer / panel (empty patient invoice → ERPNext total error) | Fully covered patients could not be discharged at all | No patient invoice when the patient share is 0: only the payer invoice; running bill shows 0 due; patient payments never go into the insurer's invoice; cancel-final-bill handles the single invoice |
| 4 | *Identify unknown ER patient* failed for the clinic admin (Customer rename needed ERPNext write permission) | Temporary ER records (TMP-…) could not be merged into the real patient | Merge (already PW Admin only) renames the Customer without the extra permission check |
| 5 | (tests) Phase 3 tests needed a free ICU bed | Failed whenever live demo data filled the ICU | Test helper frees a bed being cleaned inside the rolled-back test |

Runner corrections (not app defects): MAR statuses are Administered / Missed / Refused / Held; ER dispositions are Discharged Home / Admitted / Referred Out / LAMA / Expired; a same-day transfer adds no bed day (midnight census) so the audit checks the bed segments; charges are cancelled by reception / accounts / supervisor, not nurses.

## Data left for the demo

- Discharged with final bill, discount and refund: **ADM-2026-00019** (invoice ACC-SINV-2026-00703).
- Insurance stay, fully covered, discharged: **ADM-2026-00020**.
- Admitted from ER (head injury, identified and merged): **ADM-2026-00021**.
- ER visits discharged home (with ER fee invoice), referred out, and an identified unknown patient; ward round, vitals, MAR doses (given / refused), diet, procedure with consent, oxygen, nebulisation and lab charges.
- Earlier audit runs also left admitted patients (e.g. ADM-2026-00013 in ICU) — normal demo admissions.

## Scenarios and checks

### I01 Admission desk — admit, advance, bed and bedside link
- ✅ **I01-1** admission needs a bed
- ✅ **I01-2** an occupied bed cannot be given to a second patient
- ✅ **I01-3** admission created and the bed is Occupied
- ✅ **I01-4** advance Rs 10,000 taken in the receptionist's shift
- ✅ **I01-5** the same patient cannot be admitted twice
- ✅ **I01-6** bedside link opens the patient's room page (first name and bed only)
- ✅ **I01-7** lab user cannot admit a patient
- ✅ **I01-8** pharmacy cashier cannot open the IPD chart

### I02 Insurance admission — pre-auth required, payer share
- ✅ **I02-0** an insurer is set up
- ✅ **I02-1** insurance admission without an approved pre-auth is refused
- ✅ **I02-2** admitted on the approved pre-auth with the insurer's coverage

### I03 Ward work — round, vitals, notes, medicine orders, MAR
- ✅ **I03-1** doctor's ward round saved and signed
- ✅ **I03-2** nurse charts vitals
- ✅ **I03-3** impossible vitals are refused (pulse 900, temp 150 °F)
- ✅ **I03-4** nursing note saved
- ✅ **I03-5** a nurse cannot order medicines
- ✅ **I03-6** BD × 3 days makes 6 doses on the MAR
- ✅ **I03-7** ward order goes to the contract pharmacy as a signed prescription
- ✅ **I03-8** nurse charts the first dose
- ✅ **I03-9** the same dose cannot be charted twice
- ✅ **I03-10** a refused dose needs a reason
- ✅ **I03-11** MAR board lists this patient's due doses

### I04 Transfer — ICU, old bed to cleaning, bed segments on the bill
- ✅ **I04-0** a free ICU bed
- ✅ **I04-1** cannot transfer into an occupied bed
- ✅ **I04-2** old bed goes to Cleaning, ICU bed Occupied
- ✅ **I04-3** housekeeping marks the old bed Available
- ✅ **I04-4** a bed cannot be set Occupied without an admission
- ✅ **I04-5** the stay keeps one segment per bed (bed days are counted at midnight per segment)
- ✅ **I04-6** bed history records the move

### I05 Diet, procedure with consent, charges, labs
- ✅ **I05-1** diet order reaches the kitchen list
- ✅ **I05-2** procedure cannot start without signed consent
- ✅ **I05-3** procedure completed after consent
- ✅ **I05-4a** a nurse cannot cancel a charge
- ✅ **I05-4** cancelling a charge needs a reason
- ✅ **I05-5** ward lab order is billed to the admission (no payment at the lab counter)
- ✅ **I05-6** running bill has bed, nursing, oxygen, ad-hoc, lab and diet lines

### I06 Money — advances, discount approval, who may take payment
- ✅ **I06-1** a nurse cannot take payment
- ✅ **I06-2** second advance by JazzCash in the shift
- ✅ **I06-3** a large IPD discount waits for supervisor approval
- ✅ **I06-4** the requester cannot approve their own discount
- ✅ **I06-5** approved discount attached to the admission

### I07 Discharge — clearance, summary, final bill, settlement, bed and bedside link
- ✅ **I07-1** clearance blocks: summary not signed / labs pending
- ✅ **I07-2** final bill is held while clearance is open
- ✅ **I07-3** doctor signs the discharge summary
- ✅ **I07-4** final invoice posted, GL balanced
- ✅ **I07-5** discount and advances applied on the final bill
- ✅ **I07-6** final bill matches the running bill (less discount)
- ✅ **I07-7** discharge waits until the extra advance (Rs 10,250) is refunded
- ✅ **I07-7b** cannot refund more than the extra advance
- ✅ **I07-7c** refund paid from the shift; nothing left owed either way
- ✅ **I07-8** patient discharged, ICU bed to Cleaning
- ✅ **I07-9** bedside link stops working after discharge
- ✅ **I07-10** discharge summary print data ready (diagnosis, medicines, follow-up)

### I08 Insurance discharge — patient and insurer invoices
- ✅ **I08-1** bill split into patient share and insurer invoice (no empty patient invoice when fully covered)
- ✅ **I08-2** insurer invoice is on the insurer's account
- ✅ **I08-2b** patient owes nothing on a fully covered stay
- ✅ **I08-3** insurance patient discharged

### I09 Emergency — register, triage, treat, dispose (home, admit, LAMA, referral)
- ✅ **I09-1** board puts Red above Yellow above Green
- ✅ **I09-2** unknown patient gets a temporary MR
- ✅ **I09-3** an Expired disposition needs time and cause of death
- ✅ **I09-3b** impossible triage vitals are refused
- ✅ **I09-4** LAMA needs the signed LAMA form
- ✅ **I09-5** discharged from ER with the ER fee billed
- ✅ **I09-6** admitted from ER: admission carries the ER charges
- ✅ **I09-7** referral recorded with the receiving hospital
- ✅ **I09-8** identified patient: temporary record merged into the real one

### I10 Reports and access
- ✅ **I10-1** IPD report counts today's discharges
- ✅ **I10-2** a nurse cannot make a final bill
- ✅ **I10-3** pharmacy cashier cannot see the bed map
- ✅ **I10-4** every open admission has an occupied bed on the map
