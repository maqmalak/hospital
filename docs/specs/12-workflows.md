# 12 — Key Workflows (Acceptance Criteria)

Each workflow needs an automated E2E test (Playwright) unless marked *manual*. Mock WhatsApp, SMS, payment gateway and print agent in tests; use recorded webhook payloads.

**W1. OPD walk-in → pharmacy → lab:** register patient (duplicate check runs, MR assigned, card printed) → ERPNext Customer exists → OPD slip with vitals → invoice on the OPD POS Profile in the receptionist's open shift (skipped when fee is 0; free inside follow-up window) → queue token → doctor writes and signs prescription (meds, diagnoses, labs, follow-up) → prints → draft medicine invoice created → pharmacy cashier loads it in ERPNext POS and bills → Dispense Ticket goes through pick → review → handover → stock reduced by batch → lab Test Invoice created for ordered tests.

**W2. Web appointment:** booking on an available slot → slot held → payment (online or proof) → confirmed (auto or staff) → WhatsApp confirmation → reminder on schedule → reschedule via `/my-appointment/:token` → no-show releases slot after N minutes; leave/blocked dates hide slots; two users racing for one slot → only one succeeds; existing patient's phone requires OTP.

**W2a. WhatsApp appointment:** inbound "Hi" in Urdu → language → book → specialization → doctor → date → slot → household member picked → confirm → payment-proof image accepted → appointment (source WhatsApp) → confirmation template; unknown reply re-prompts; "reception" hands off to the inbox; 30 minutes idle releases the hold. WhatsApp send failure → SMS fallback when enabled.

**W3. Lab:** order → paid → thank-you message with TAT → sample collected, barcode label printed → received → one sample rejected (hemolysed) → recollect → results entered → a critical value alerts the doctor and blocks release until the Critical Value Log is filled → pathologist verifies and signs → report **Released** → report-ready WhatsApp with `/lab-report/:token` → patient verifies and downloads → link stops after expiry, max downloads or revoke → amend a verified result → old link revoked, `lab_report_updated` sent → visible in `/pw-history` with previous values. With WhatsApp disabled or no opt-in, nothing is sent and the rest works. Outsourced test: dispatch → PDF attached → verified → released.

**W4. IPD admission to discharge:** admit (bed Occupied, comms token) → panel payer with pre-auth → rounds → MAR (gate approval, stock and billing per settings) → bed transfer → diet → procedure with consent → ad-hoc charges → advance payment → discharge summary signed → clearance hold → **aggregated final invoice** (bed days per segment, ICU, nursing per shift, MAR, procedures, labs, consumables, diet, oxygen, ad-hoc; package overrides; payer split; advances allocated) → bed Cleaning → Available, comms profile deactivated.

**W5. Online visit:** 4-step form in Urdu → token → OV Staff accepts and assigns doctor → video link → signed prescription linked → Completed on the token page; cancelled → refund recorded.

**W6. Nursing comms:** patient sends voice-to-text from `/patient/:token` → appears at `/ns/:station` with unread count → nurse replies → patient sees it live; broadcast reaches all station patients.

**W6a. Pharmacy batch & pack:** purchase 10 packs (10 tabs × 3 strips) of batch A (expires in 6 months) and batch B (2 years) → 600 units → in ERPNext POS, 1 pack + 2 strips + 5 tabs (three lines) picks batch A (FEFO) and deducts 55 units at correct derived prices → expired batch blocked, near-expiry warns → prescription-required item blocked without prescription → return restores the same batch → near-expiry report lists batch A.

**W6b. Pharmacy pipeline:** two cashiers bill on counters 1 and 2 → each customer display shows its own cart, then the token → P-001 and P-002 in `/pharmacy/pick` → finder scans P-001 in rack order, wrong batch rejected → Picked → reviewer counts and approves → Ready → dispenser calls P-001 → queue display shows it under counter 3 with chime and Urdu/English announcement → receipt QR scanned → Handed Over. P-002 line Not Found → Exception at counter 2 → substitute (same generic/strength/form) approved by reviewer → continues. Two finders tapping Start on one ticket → only one gets it. Stage timings on the dashboard.

**W6c. Pay at handover:** setting = handover → cashier saves draft, no stock moved → pick and review → another sale can't take the reserved quantity → dispenser collects PKR 1,000 for a PKR 870 bill (change 130) on their own shift → invoice submitted, stock deducted → Handed Over. An uncollected draft appears on the day-end list.

**W7. Cashier shift:** open with PKR 5,000 float → cash sales 42,000, card 8,000 → cash refund 500 → Pay Out 1,200 → Cash Drop 30,000 → expected cash = 5,000 + 42,000 − 500 − 1,200 − 30,000 = **15,300** → blind count 15,100 → **Short 200** shown only after submit → beyond tolerance (50) → supervisor approves → Journal Entry to Cash Over/Short → POS Closing Entry matches; card 8,000 = 8,000 Balanced. Second test: count 15,330 → Excess 30 within tolerance → closes automatically.

**W8. Expense:** submit with receipt → multi-level approval → Journal Entry to the mapped account and cost center.

**W9. Clinical safety & signed records:** patient allergic to penicillin → doctor adds amoxicillin → blocking alert → override with reason saved → two interacting medicines → Major alert → override reason → reviewer sees both overrides → signed prescription cannot be edited → amend with reason → version 2 printed "Amended", version 1 kept as Superseded.

**W10. Patient identity:** register a patient whose phone and similar name match an existing record → duplicate warning → create anyway with reason → Admin merges the two → all visits, invoices and Customer move to the survivor → merge log written. CNIC shown masked; Receptionist reveal is logged; a cashier cannot reveal it.

**W11. Discounts & welfare:** cashier applies 10% within their limit (reason required) → applies 40% → approval request → supervisor approves on their screen → logged. Welfare patient (80% coverage, approved) → patient pays 20% → 80% charged to the welfare fund → fund balance reduced.

**W12. Panel & insurance:** panel employee OPD visit → split into patient share (paid) + panel credit invoice → monthly panel statement → payment with deduction recorded. Insurance admission requires approved pre-auth → claim submitted → partially approved → deduction posted → settled → aging updates.

**W13. Doctor share:** consultation and procedure invoices accrue shares per rules → refund reverses one → payout run for the month → Payment Entry → doctor sees own statement only. Panel credit invoice accrues only on payment when that setting is on.

**W14. Stock operations:** pharmacy raises a material request → store transfers by batch → cycle count finds a variance above threshold → Admin approves → Stock Reconciliation posted → expired batch moved to Quarantine → supplier return creates a debit note.

**W15. Security:** cashier opens a bill — API response contains no diagnosis or results → Admin without 2FA is forced to set it up → idle timeout locks the screen → audit screen shows who viewed a patient's history and lab report. *Manual:* monthly backup restore drill recorded in `docs/OPS.md`.

**W16. Feedback:** OPD visit completed → feedback request after N hours → patient taps 2 → Admin alerted → follow-up note recorded → report shows the rating under that doctor.

**W17. Branch isolation:** a branch A cashier cannot see branch B counters, shifts, stock or displays; a patient registered at branch A is found at branch B with full history.

**W18. Emergency (if enabled):** unknown patient registered → triage Red → appears top of `/er` → labs and medicines ordered → admitted (Bed Allotment carries ER charges) → identity found later → merged with existing patient.
