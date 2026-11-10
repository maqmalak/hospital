# Lab QA / QC — live audit (2026-11-10)

Run as the real demo users through the same API the screens use — **reception@** (orders, payment, discounts, refunds), **lab@** (samples, results, release, hand-over, own Lab Counter shift), **pathologist@** (verification, send back, amendment, critical values), **dr.ayesha@** (prescriptions, viewing results), **supervisor@** (discount approval), and *Guest* for the patient portal.
Runner: `bench --site hospital execute hospital_vvs.devtools.qa_lab.run` (keeps its data). Raw results: `docs/qa-lab-run.json`. Regression tests: `tests/test_lab_qa.py`.

**Final run: 81 checks, 81 pass, 0 fail · 20 lab orders created** (first run: 72 checks, 63 pass, 9 fail — 3 defects, 4 wrong expectations in the checks, 2 scenario aborts).

## Defects found and fixed

| # | Defect | Impact | Fix |
|---|---|---|---|
| 1 | Rejecting a sample after a result was typed left that draft result in the pathologist's queue | The pathologist could verify a result from the rejected (haemolysed / clotted) sample | Rejection withdraws the draft result (status Cancelled, reason kept); rejecting a sample whose test is already verified is refused (amend instead) |
| 2 | A lab user could amend (reopen) a verified result | Verified, signed results could be changed without the pathologist | Amendment is pathologist only |
| 3 | Refunding a lab bill did not touch the lab order | Refunded tests stayed *Ordered*, the sample stayed in the collection queue and could still be processed and released | Credit note against a lab bill cancels the refunded tests that have no verified result, their draft results and empty samples; the order becomes Cancelled when nothing is left; verified tests stay on the report |
| 4 | (test data) a few orders and shifts leaked into the site from earlier test runs | Stray Administrator shift at Reception 1 | Phase 1 / Phase 3 test modules now block commits like the others; the stray shift was closed (no bills in it) |

## Changes made during the audit (owner requests)
- **Priority tags Normal / Priority / Urgent** on new orders (old *Routine* = Normal), shown as coloured tags on lab orders, the collection queue, the result worklist and the verification list; queues sort Urgent → Priority → Normal (critical values first for the pathologist).
- **Lab orders search: Today / Week / Month / Custom range**, plus a priority filter; searching by name / MR / order no. looks at all dates.
- FBR day-end trigger compares times as times (not text).

## Scenarios and checks

### S01 Routine order → report (CBC + LFT, cash)
- ✅ **S01-1** order created as Ordered with 2 tests and the right total
- ✅ **S01-2** payment: POS invoice submitted in the collector's shift, status Paid, expected time set
- ✅ **S01-3** lab income booked on the Lab POS profile income account
- ✅ **S01-4** one sample per sample type / container (EDTA for CBC, serum for LFT)
- ✅ **S01-5** thank-you message queued
- ✅ **S01-6** barcode labels carry MR, name, tests, container
- ✅ **S01-7** barcode scan finds the sample and its tests
- ✅ **S01-8** result entry refused before the sample reaches the lab
- ✅ **S01-9** both tests on the result worklist after receiving
- ✅ **S01-10** order In Progress, tests Result Entered
- ✅ **S01-11** lab user cannot verify
- ✅ **S01-12** release refused before anything is verified
- ✅ **S01-13** released: status Released, WhatsApp report link queued
- ✅ **S01-14** portal asks for the last 4 digits first (no data before verification)
- ✅ **S01-15** wrong digits refused
- ✅ **S01-16** right digits show both tests with values and interpretation
- ✅ **S01-17** patient PDF downloads
- ✅ **S01-18** printed copy handed over and recorded
- ✅ **S01-19** referring doctor can view the report (access logged)

### S02 Urgent order with a critical value
- ✅ **S02-1** urgent sample listed before routine ones
- ✅ **S02-2** urgent test first on the worklist
- ✅ **S02-3** potassium 6.9 flagged Critical High
- ✅ **S02-4** verification blocked until the critical value is phoned to the doctor
- ✅ **S02-5** critical value log written (who, how, read back)
- ✅ **S02-6** urgent report released
- ✅ **S02-7** dashboard shows today's tests and TAT figures

### S03 Rejected sample → recollection
- ✅ **S03-1** rejection needs a reason
- ✅ **S03-2** rejected sample keeps the reason; a new sample is waiting for collection
- ✅ **S03-3** test moved to the new sample
- ✅ **S03-4** report released after recollection

### S04 Reject after a result was entered
- ✅ **S04-1** the draft result of a rejected sample is withdrawn (not left waiting for verification)
- ✅ **S04-2** pathologist no longer sees the old result to verify

### S05 Sent back by the pathologist
- ✅ **S05-1** sent back: test returns to the worklist with the reason
- ✅ **S05-2** corrected value is flagged High (6.5 > 5.6)

### S06 Amendment after release
- ✅ **S06-1** a lab user cannot amend a verified result (pathologist only)
- ✅ **S06-2** amendment needs a reason
- ✅ **S06-3** old version Superseded, new version 2
- ✅ **S06-4** old report link stops working; 'report updated' message sent
- ✅ **S06-5** report marks the test AMENDED v2

### S07 Partial release
- ✅ **S07-1** full release refused while one test is pending
- ✅ **S07-2** partial release: status Partially Released
- ✅ **S07-3** patient report shows the pending test as pending
- ✅ **S07-4** qualitative 'Positive' against 'Negative' flagged Abnormal
- ✅ **S07-5** second release completes the report

### S08 Outsourced test with a scanned report
- ✅ **S08-1** dispatch creates the outsourced batch and a purchase bill to the reference lab
- ✅ **S08-2** dispatched samples listed as awaiting results
- ✅ **S08-3** patient sees a downloadable report file for both outsourced tests
- ✅ **S08-4** patient downloads the original reference-lab PDF
- ✅ **S08-5** full report PDF includes the reference-lab pages

### S09 Panel patient — split bill
- ✅ **S09-1** panel share computed on the order (Pakistan Telecom 80 %)
- ✅ **S09-2** patient pays 20 % at the counter; 80 % credit invoice to the panel

### S10 Discounts within and above the limit
- ✅ **S10-1** small discount within the receptionist's limit is approved at once
- ✅ **S10-2** discount without a reason refused
- ✅ **S10-3** large discount waits for a supervisor
- ✅ **S10-4** cannot pay with a pending discount
- ✅ **S10-5** paid with the approved discount; invoice net reduced
- ✅ **S10-6** discount authorization marked used on this order

### S11 Doctor's prescription orders the tests
- ✅ **S11-1** signing the prescription creates the lab order for reception
- ✅ **S11-2** order carries the referring doctor and both tests
- ✅ **S11-3** doctor sees the result with previous-value column

### S12 Refund of a lab order
- ✅ **S12-1** refunded order is cancelled (tests and samples stop)
- ✅ **S12-2** its pending sample leaves the collection queue

### S13 Roles and access
- ✅ **S13-1** receptionist cannot open the verification list
- ✅ **S13-2** receptionist cannot enter results
- ✅ **S13-3** pharmacy cashier cannot see lab orders
- ✅ **S13-4** lab user cannot edit test templates (pathologist only)
- ✅ **S13-5** pathologist can open a template for editing

### S14 Portal security
- ✅ **S14-1** made-up link refused
- ✅ **S14-2** 5 wrong tries lock the link for 15 minutes
- ✅ **S14-3** revoked links stop working

### S15 Previous results and TAT
- ✅ **S15-1** result form shows the previous CBC values and date
- ✅ **S15-2** expected report time falls inside lab hours

### S16 Repeat submit and template price change
- ✅ **S16-1** same client reference does not create a second order (double click / offline retry)
- ✅ **S16-2** new price applies to new orders; existing order keeps its price

### S17 Priority tags and date filters
- ✅ **S17-1** order keeps its priority tag (Normal / Priority / Urgent)
- ✅ **S17-2** collection queue: Urgent, then Priority, then Normal
- ✅ **S17-3** day ⊆ week ⊆ month filters
- ✅ **S17-4** priority filter returns only urgent orders
- ✅ **S17-5** legacy 'Routine' requests are stored as Normal

### S18 Partial refund keeps verified tests
- ✅ **S18-1** refunding TSH cancels only TSH; the verified CBC stays
- ✅ **S18-2** order can still be released with the remaining test

## Data now on the site
20 new lab orders from this run (plus the first run's), covering: routine and urgent, a critical potassium with the doctor-notified log, a rejected and recollected sample, a reject after result entry, a sent-back result, an amended released report (v2), a partial release, outsourced Vitamin D + histopathology with the reference lab's PDF, a panel patient (80 % to Pakistan Telecom), approved and pending discounts, a prescription-ordered dengue panel, full and partial refunds, priority-tagged orders, repeat-submit protection and a temporary template price change (restored).

## Notes for the owner
- Portal links: 5 wrong tries lock a link for 15 minutes; one demo link was deliberately locked and then revoked.
- One verified *Urine R/E* result (LR-2026-000029 on LAB-2026-00004) was created by an earlier test run at 01:17; it is demo data and was left in place.
- Lab and Reception 1 shifts for lab@ / reception@ were opened for this audit and are still open — close them at `/cash/close`.
