# ROLE
You are a senior full-stack engineer and UI/UX designer specialising in healthcare software. Work autonomously: plan first, then build in phases, test each phase, and report progress after each one. Ask a question only if something is truly blocking. Otherwise make sensible decisions and list them in your progress report.

# OBJECTIVE
Design and build a modern, elegant "Nursery & Newborn Care" module for [Hospital Name], [City, Country]. It adds to the existing hospital website and the Radiology module and must reuse the same design system and code structure.

# DESIGN SYSTEM (must stay consistent with the existing site)
- Base palette: deep teal/medical blue primary, soft mint secondary, warm gold/coral accent, off-white backgrounds.
- Nursery sub-theme: add soft, gentle tints (powder blue, blush pink, cream, sage) for this module only, while keeping the main brand colours for navigation, buttons and headers. Avoid gendered colour-coding of babies.
- Fonts: "Plus Jakarta Sans" (body), "Fraunces" or "Playfair Display" (headings).
- Style: rounded cards (16–24px), glassmorphism, soft shadows, plenty of white space, warm and reassuring imagery.
- Animations: gentle scroll-reveal fade-ups, soft floating shapes in the hero, animated counters, smooth hover lifts. Calm and slow, never flashy. Respect "prefers-reduced-motion".
- Fully responsive (mobile-first), WCAG 2.2 AA accessible, bilingual ready (English / Urdu with RTL support).

# MODULE SCOPE

## PART A — PUBLIC PAGE: "Nursery & Newborn Care"
1. Hero: soft photo of a modern nursery / mother holding a newborn, headline "Gentle Care from the Very First Breath". CTAs: "Book a Maternity Tour", "Parent Portal Login", "NICU Helpline: [phone]".
2. Animated stat counters: babies delivered per year, NICU beds, neonatologists, 24/7 paediatric cover, survival/care-quality figures (placeholders until real data is supplied).
3. Care units (cards with image gallery, features, "Learn more"):
   - Well-Baby Nursery: routine newborn care, observation, bathing, cord care.
   - Rooming-In / Mother & Baby Rooms: baby stays with mother; private and semi-private options with per-day pricing.
   - NICU (Level [II/III]): incubators, ventilators, CPAP, phototherapy, neonatal monitoring, isolation bay.
   - SCBU / Step-down Unit.
   - Kangaroo Mother Care (KMC) area.
   - Breastfeeding / lactation room.
4. Newborn services: newborn examination by a paediatrician, Apgar assessment, vitamin K, birth vaccinations per the national EPI schedule (e.g. BCG, OPV-0, Hepatitis B birth dose; confirm against the current [country] schedule), newborn hearing screening, newborn metabolic screening, jaundice checks & phototherapy, CCHD pulse-oximetry screening, hip/eye checks, lactation counselling, circumcision (on request), newborn photography (with parent consent).
5. Safety & security section: infant ID bands matching mother's band, infant security tags with exit alarms, restricted access, CCTV, staff ID verification, strict hand hygiene, "baby only handed to verified parent" policy.
6. Visitor policy: visiting hours, number of visitors, sibling rules, NICU-specific rules (parents 24/7, others restricted), hygiene steps.
7. Neonatal team: doctor & nurse cards (photo, qualification, experience, timings).
8. Parent guide (accordion): what to bring for baby, feeding tips, cord care, danger signs to watch for (fever, poor feeding, yellow skin, breathing difficulty), when to return for follow-up.
9. Packages: normal delivery + nursery package, C-section package, NICU per-day charges (pricing cards; mark prices as placeholders).
10. FAQs, testimonials, location on the Wayfinding map (floor and wing), and contact strip.

## PART B — PROCESS FLOW (animated stepper/timeline on the public page)
1. Birth (labour room / OT)
2. Immediate care: Apgar score, drying, skin-to-skin, cord clamping, ID bands applied to mother & baby
3. Newborn assessment: weight, length, head circumference, temperature, full exam
4. Placement decision: Rooming-in / Well-Baby Nursery / NICU
5. Routine care: feeding plan, vitamin K, birth vaccinations, screenings
6. Daily monitoring: vitals, feeds, output, weight, jaundice checks
7. Parent education: feeding, bathing, cord care, safe sleep
8. Discharge readiness check
9. Discharge: summary, vaccination card, birth notification, follow-up appointment
10. Follow-up visit & immunisation reminders

## PART C — STAFF DASHBOARD (role-based)
Roles: Nurse, Neonatologist/Paediatrician, Ward Admin, Security, Super Admin.

1. Ward board: visual bed/cot map (Nursery, NICU, Rooming-in), colour-coded status: Stable / Observation / Critical / Phototherapy / Ready for Discharge. Click a cot for the baby's chart.
2. Baby registration: auto-generated Baby MR No. linked to the mother's MR No.; baby name or "Baby of [Mother's Name]"; sex; date & time of birth; delivery type; gestational age; birth weight, length, head circumference; Apgar at 1 & 5 min; blood group; ID-band and security-tag numbers; attending doctor.
3. Baby chart (tabs):
   - Vitals: temperature, heart rate, respiratory rate, SpO2, with charts and abnormal-value alerts.
   - Feeding log: breastfeed / expressed milk / formula, time, volume, tolerance.
   - Output log: urine and stool.
   - Weight chart: daily weight with % change from birth weight.
   - Jaundice tracker: bilirubin values plotted against age in hours, phototherapy start/stop.
   - Medications & vaccinations: given by, time, batch no.
   - Screenings: hearing, metabolic, CCHD, with result status.
   - Doctor's notes and nursing notes, with timestamps and an audit log.
   - NICU extras: respiratory support (CPAP/ventilator settings), IV fluids, incubator temperature.
4. Alerts: critical vitals, missed feeds, overdue vaccinations/screenings, security-tag alarm, and discharge pending.
5. Security log: tag activation/deactivation, baby movement in/out of the ward with staff ID, and mother–baby band matching at every handover.
6. Discharge workflow: checklist (feeding established, weight stable, jaundice cleared, screenings done, vaccinations given, parent education complete, security tag removed and logged), then generate the discharge summary.
7. Analytics: births per day/month, NICU occupancy, average length of stay, admissions by reason, feeding type ratios (charts).

## PART D — DOCUMENTS (printable A4 + PDF)
Design elegant, print-friendly templates with hospital header, logo, QR verification code and doctor signature:
1. Newborn Discharge Summary (birth details, measurements, Apgar, course in hospital, investigations, vaccinations, feeding advice, danger signs, follow-up date).
2. Birth Notification / Birth Record slip (for official birth registration).
3. Vaccination Card (EPI schedule with given/due dates).
4. NICU Daily Progress Report.
Include realistic sample data for one healthy term baby and one NICU preterm baby with jaundice.

## PART E — PARENT PORTAL
- Login with mother's MR No. + mobile OTP.
- Baby profile card: name, birth details, current location (Rooming-in / Nursery / NICU).
- Daily update feed from nurses (approved messages only; no raw clinical data unless the doctor publishes it).
- NICU parents: visiting slots, optional secure "photo of the day" shared by staff (consent-based).
- Download discharge summary, vaccination card and birth record.
- Vaccination & follow-up reminders via SMS/WhatsApp.
- Feeding & care guides, and a "Danger Signs" quick card with an emergency call button.

# TECHNICAL REQUIREMENTS
- Stack: match the existing project ([Next.js + Tailwind CSS + Framer Motion], [Supabase / Node backend]). Inspect the existing codebase first and reuse its components, layout, routing and data patterns.
- Data model: Mother ↔ Baby (one-to-many for twins/triplets), Cot/Bed, Admission, Vitals, Feeds, Medications, Vaccinations, Screenings, Notes, SecurityEvents, Discharge.
- Security: role-based access control, encrypted patient data, full audit logs, OTP login for parents, no baby photos or names on public pages.
- PDF generation: [React-PDF / Puppeteer].
- Integrations ready: HIS/EMR, labour room module, billing, SMS/WhatsApp API.
- Seed the database with realistic sample data (including twins and one NICU case). No lorem ipsum.

# EXECUTION PLAN (follow in order)
1. Explore the existing codebase and write a short plan: files to add/change, data model, routes.
2. Build Part A (public page) + Part B (process stepper).
3. Build the data model, seed data and Part C (staff dashboard).
4. Build Part D (document templates and PDF export).
5. Build Part E (parent portal).
6. Test everything: responsive layouts, accessibility, role permissions, alerts, PDF output, and the twin-birth case.
7. Final report: what was built, decisions made, known limitations, and next steps.

# RULES
- Do not change existing modules except to add navigation links and shared components.
- Keep code clean, typed, componentised and commented.
- Mark all clinical values, schedules and prices as placeholders to be verified by the hospital's paediatric team.
- Commit after each phase with a clear message.

# ACCEPTANCE CRITERIA
- Public page loads with a Lighthouse score of 90+ and matches the hospital design system.
- A nurse can register a baby, link it to the mother, log vitals/feeds and see alerts.
- A doctor can complete the discharge checklist and generate a signed PDF summary.
- A parent can log in with OTP and download the discharge summary and vaccination card.
- Unauthorised roles cannot view or edit clinical data (verified by tests).