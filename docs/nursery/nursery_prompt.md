# ROLE
You are a senior full-stack engineer and UI/UX designer working inside the existing Lyallpur Medical Complex (LMC) hospital management system. The public website runs at http://hospital.localhost:5183/hms/site (Vite dev server). Work autonomously: inspect the codebase, plan, build in phases, test each phase, and report after each one. Ask only if truly blocked; otherwise decide and list your decisions in the report.

# OBJECTIVE
Add a modern, elegant "Nursery & Newborn Care" module to LMC, Faisalabad (People's Colony No 1). The module has a public section on the website, a staff module inside the HMS (behind "Staff login"), and a parent section inside the existing Patient Portal. It must look and behave as if it had always been part of the site.

# STEP 0 — STUDY THE EXISTING SITE FIRST (mandatory)
Before writing code:
- Find the stack, folder structure, routing (the /hms/site prefix), shared layout, header/footer, theme tokens, UI components, data/API layer, auth/roles and the patient record (MR) model.
- Reuse what exists. Do NOT create a new design system, new header, new buttons or new card styles.
- Write a short plan: files to add, files to touch, data model changes, routes.

# DESIGN — MATCH THE CURRENT LMC LOOK
Copy these patterns from the existing homepage:
- Dark teal hero sections with a soft gradient over a large photo; off-white content sections below.
- Large elegant serif display headings (same font as "Compassionate care, advanced medicine."), clean sans-serif body text.
- Small uppercase pill labels above headings (like "FAISALABAD · PEOPLE'S COLONY", "SPECIALTIES", "OUR CONSULTANTS").
- Coral/red rounded-square icon tiles on glass cards; aqua/teal primary buttons (like "Staff login"); outlined secondary buttons; red emergency button.
- Stat strip style (like "120 BEDS · 8 CONSULTANTS · 13 DEPARTMENTS · 8 FLOORS").
- Doctor card style from "Meet the doctors" (initials avatar, qualification, next available slot, fee, weekday dots, Book button), using live data from the booking system.
- Keep the top bar (Emergency 24/7, Ctrl K search, اردو toggle, light/dark toggle), sticky header, floating "Emergency 24/7" button, footer.
- Nursery touch: add only a soft accent for this module (warm cream, powder blue, gentle blush tints in backgrounds and illustrations) while keeping LMC teal and coral as the main colours. No gendered colour-coding of babies.
- Animations: same scroll-reveal and hover-lift behaviour already used on the site; calm and slow; respect prefers-reduced-motion.
- Must work in light AND dark mode, in English AND Urdu (RTL), and on mobile.

# INTEGRATION POINTS ON THE EXISTING SITE
- Header "Services" menu: add "Nursery & Newborn Care" (and "NICU").
- Departments: link from "Paediatrics" and "Gynaecology & Obstetrics" pages to the new module; show Dr. Sana Malik (Paediatrician) and Dr. Farah Naz (Gynaecologist) from existing doctor data, not hard-coded.
- Homepage: add the service to the services grid, and add "Nursery" and "NICU" photos to the "Inside the hospital" gallery.
- Rooms page: add "Mother & Baby Room (Rooming-in)" options.
- Ctrl K search: index the new pages (nursery, NICU, newborn vaccination, birth certificate, visiting hours).
- Urdu translations for every new string, using the site's existing i18n setup.

# PART A — PUBLIC PAGE: /hms/site/nursery (match routing convention)
1. Hero: dark teal gradient over a soft nursery photo; pill label "PAEDIATRICS · NEWBORN CARE"; serif headline "Gentle care from the very first breath."; buttons: "Book a maternity visit", "Find a paediatrician", red "NICU helpline: [number]".
2. Stat strip: NICU cots, nursery cots, neonatal staff, 24/7 paediatric cover (placeholders until confirmed).
3. Care units (glass cards with coral icon tiles + gallery): Well-Baby Nursery, Mother & Baby Rooms (rooming-in), NICU (Level [II/III]: incubators, CPAP, ventilator, phototherapy, monitoring), Step-down / SCBU, Kangaroo Mother Care area, Breastfeeding room.
4. Newborn services: paediatrician newborn exam, Apgar, vitamin K, birth vaccinations per Pakistan EPI (BCG, OPV-0, Hepatitis B birth dose — verify against current EPI Punjab schedule), hearing screening, jaundice check & phototherapy, pulse-oximetry (CCHD) screening, lactation counselling, circumcision on request.
5. Baby safety: matching mother–baby ID bands, infant security tags with exit alarm, restricted access, CCTV, "baby handed only to verified mother/parent".
6. Visiting policy: hours, visitor limits, NICU rules (parents 24/7, others restricted), hand hygiene.
7. Animated process timeline (horizontal on desktop, vertical on mobile):
   Birth → Immediate care (Apgar, skin-to-skin, ID bands) → Newborn assessment (weight, length, head size) → Placement (Rooming-in / Nursery / NICU) → Routine care (feeding, vitamin K, vaccines, screening) → Daily monitoring → Parent education → Discharge check → Discharge papers → Follow-up & vaccination reminders.
8. Parent guide accordion: what to bring for baby, feeding, cord care, safe sleep, danger signs (fever, poor feeding, yellow skin, fast breathing, lethargy) with an "Call emergency" button.
9. Packages (pricing cards in Rs, placeholders): Normal delivery + nursery, C-section + nursery, NICU per day, Mother & Baby room per day.
10. Team (live doctor cards), FAQs, location (floor/wing, link to Get directions), closing CTA band like the homepage "Need to see a doctor?".

# PART B — STAFF MODULE (inside HMS, behind Staff login)
Use the existing auth and roles; add roles if missing: Nursery Nurse, NICU Nurse, Neonatologist/Paediatrician, Ward Admin, Security.
1. Ward board: visual cot map (Nursery / NICU / Rooming-in), status colours: Stable, Observation, Critical, Phototherapy, Ready for discharge.
2. Baby registration: new MR number linked to the mother's existing MR record (support twins/triplets); "Baby of [Mother]" until named; sex; date/time of birth; delivery type; gestational age; birth weight, length, head circumference; Apgar 1 & 5 min; blood group; ID-band and security-tag numbers; attending doctor.
3. Baby chart tabs: Vitals (temp, HR, RR, SpO2 with charts and alerts) · Feeds (breast/expressed/formula, volume) · Urine & stool · Daily weight (% change from birth) · Jaundice (bilirubin vs age in hours, phototherapy on/off) · Medicines & vaccines (who, when, batch no.) · Screenings · Doctor and nursing notes · NICU support (CPAP/ventilator settings, IV fluids, incubator temp). Full audit log on every entry.
4. Alerts: abnormal vitals, missed feeds, due vaccines/screenings, security-tag alarm, pending discharge.
5. Security log: tag on/off, baby in/out of ward with staff ID, band match at each handover.
6. Discharge checklist (feeding established, weight acceptable, jaundice cleared, screenings done, vaccines given, parent taught, tag removed) → generate discharge papers.
7. Reports: births per day/month, cot occupancy, NICU admissions by reason, average stay (charts in the existing HMS style).
8. Billing: link nursery/NICU charges to the existing billing module.

# PART C — DOCUMENTS (A4 print + PDF, LMC letterhead, QR verification, doctor signature, English/Urdu)
1. Newborn discharge summary  2. Birth record slip (for NADRA / union council birth registration)  3. EPI vaccination card with due dates  4. NICU daily progress report.
Seed with realistic samples: one healthy term baby and one preterm NICU baby with jaundice.

# PART D — PATIENT PORTAL (existing "Patient portal")
Mother logs in as she does now and sees a "My Baby" section: baby profile and current location, nurse updates approved for parents, NICU visiting slots, optional staff-shared "photo of the day" (consent-based), downloads (discharge summary, vaccination card, birth slip), vaccination/follow-up reminders via the existing SMS/WhatsApp setup, care guides and danger-signs card.

# RULES
- Do not break or restyle existing pages; only add links and reuse components.
- No baby names, photos or medical data on public pages.
- All clinical values, the vaccine schedule and prices are placeholders to be confirmed by LMC's paediatric team; mark them clearly.
- Clean, typed, commented code; commit after each phase.

# EXECUTION ORDER
0 Study codebase & plan → 1 Public page + menu/search/i18n links → 2 Data model + seed → 3 Staff module → 4 Documents/PDF → 5 Patient portal → 6 Test (light/dark, English/Urdu RTL, mobile, roles, twins, PDFs) → 7 Final report.

# ACCEPTANCE CRITERIA
- The new page is indistinguishable in style from the current LMC homepage, in both themes and both languages.
- "Nursery & Newborn Care" appears in the Services menu, homepage services grid and Ctrl K search.
- A nurse can register a baby against the mother's MR, log vitals/feeds and see alerts.
- A paediatrician can complete the discharge checklist and print a signed PDF summary.
- The mother can log in to the Patient Portal and download the baby's papers.
- Roles without permission cannot view or edit baby records.