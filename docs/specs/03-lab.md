# 03 — Laboratory

## Status flow

```
Ordered → Sample Collected → Received in Lab → In Progress → Result Entered
        → Verified (Pathologist) → Released
  Rejected sample → Recollect (new sample, same order)
  Outsourced: Received in Lab → Dispatched → Report Received → Verified → Released
```

## DocTypes

- **Lab Test Template:** name, code, department (Hematology, Chemistry, ...), sample type (Blood EDTA, Serum, Urine, Swab, ...), container, volume, **turnaround time (TAT, hours)**, price item, numeric parameters (unit, normal ranges by age/gender, **critical low/high**) or text report, method, outsourced flag + Reference Lab, analyzer parameter codes (optional), auto-verify eligible flag, consumables per test (optional, child: item, qty).
- **Test Invoice:** groups tests per visit; links prescription / OPD slip / bed allotment / ER visit; referring doctor (internal or external, for referral share); payer split; WhatsApp opt-in and number (default: patient phone); cashier shift.
- **Lab Sample:** unique **barcode ID**, test invoice, tests covered, sample type, container, collected by/at, received by/at, rejection reason (hemolysed, clotted, insufficient, wrong container, unlabeled, other), recollect link, location.
- **Lab Result:** per test; numeric rows with value, unit, range, flags (Low / High / **Critical**), previous result (delta) shown; or text/rich report; status per flow; entered by/at; verified by/at; pathologist comment/interpretation; submittable after verification (signed record — `02-opd.md`).
- **Critical Value Log:** result, parameter, value, notified person, method (phone / in person / message), read-back confirmed, notified by, time.
- **Reference Lab** (Supplier), **Outsourced Dispatch** (date, reference lab, samples, courier, expected back).
- **Lab Report Access Token** and **Message Log** (see below and `01-appointments-messaging.md`).

## Screens & rules

**Sample collection (`/lab/samples`)**
- Queue of paid/ordered tests. Collector selects the patient → system groups tests by sample type/container → **prints barcode labels** (label printer via print agent; e.g. 50×25 mm with barcode, MR no., name, test codes, time).
- Lab receiving scans each barcode → Received (or Rejected with reason → recollect request appears in the collection queue, and the patient is notified if they've left).

**Result entry (`/tests`)**
- Scan sample barcode to open its tests. Enter values; flags computed server-side from age/gender ranges. Previous result for the same parameter shown alongside.
- A **critical** value immediately sends a realtime alert to the ordering doctor (and ward nurse station for IPD/ER), optionally SMS/WhatsApp to the doctor (setting). The result cannot be released until a **Critical Value Log** entry is made.

**Verification (`/lab/verify`, PW Pathologist)**
- List of Result Entered tests, critical first. Pathologist reviews values, deltas and flags; can send back for re-run with reason, add interpretation, then **verify & sign**. Signature appears on the report.
- Setting: auto-verify for templates marked eligible when all values are within normal range (default off).

**Release**
- A Test Invoice's report is **Released** when every test on it is verified (or the user releases a partial report, if allowed by setting, marked "Partial").
- Amending a verified result follows the signed-record rules: new version with reason, old version kept; if already released, revoke the old report link and send `lab_report_updated`.

**Outsourced tests (`/lab/outsourced`)**
- Dispatch list per reference lab; enter results or attach the received PDF; pathologist verifies; release as normal. Reference lab cost is posted as a Purchase Invoice to the supplier (for margin reporting).

**Analyzer interface (optional, Phase 7)**
- Do not build device drivers. Provide a whitelisted, API-key-protected endpoint that accepts results from interface middleware: sample barcode + analyzer parameter code + value + unit + flags. Map codes via **Analyzer Parameter Map**. Results land as Result Entered (never auto-verified unless the template allows).

**Lab billing:** Lab POS Profile; payer split; refunds for cancelled tests only before sample processing (setting).

**Reagent consumption (optional):** on result entry, deduct the template's consumables from the lab store (Material Issue) — module switch.

## WhatsApp notifications (lab)

1. **Thank-you** when the Test Invoice is paid: thanks the patient for testing with the clinic, number of tests, and the expected report time (latest TAT of its tests, respecting lab working hours).
2. **Report ready** when the report is **Released**: link to a **temporary portal session** at `/lab-report/:token`.
3. **Report updated** when a released report is amended.

## Temporary report portal (`/lab-report/:token`)

- **No login.** The token (random, ≥ 32 bytes, URL-safe) is the only credential. Store only its **hash**; look up by hash with a constant-time compare.
- If verification is on, the patient enters the last 4 digits of their phone (or year of birth). Lock for 15 minutes after 5 failed attempts.
- Valid token → short-lived, read-only session scoped to that one Test Invoice: patient name, MR no., tests and statuses, view and **Download PDF** (Print Designer lab report format).
- Each download increments a counter. The link stops working after expiry, max downloads or staff revoke. Expired page shows a friendly message and the clinic phone.
- Staff can **resend** (new token, old revoked) or **revoke** from `/tests`.
- Rate-limit, `noindex`, `Cache-Control: no-store`, log every access (time, IP) on the token record.
- **Lab Report Access Token** fields: test invoice, patient, token hash, expires at, max downloads, download count, failed attempts, locked until, verified flag, revoked flag, created by, last accessed at/IP.

**Settings (Clinic Settings → Lab):** send thank-you, send report-ready, report link expiry (hours, default 72), max downloads (default 5), require verification, verification method, auto-verify on/off, allow partial release, critical value notification channels, lab working hours for TAT, label size, refund rule.
