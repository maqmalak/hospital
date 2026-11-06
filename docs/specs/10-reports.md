# 10 — Reports & Dashboards

Build as ERPNext Script/Query Reports where possible (exportable to Excel/PDF), with React views for the key dashboards. All reports filter by branch and date.

## Dashboard (`/pw-dashboard`)
Today: OPD visits (new vs follow-up) by doctor, revenue by billing type and payment mode, bed occupancy, ER patients waiting, pending lab tests and TAT breaches, pharmacy tickets by stage, open cashier shifts, low ratings to follow up.

## Daily / operational
- Day-end collection by counter, cashier and payment mode (links to `05-cash.md` reports)
- OPD count by doctor/department, average waiting and consultation time
- Appointments by channel (Web / WhatsApp / Reception), no-show rate
- Lab: tests by department, TAT achieved vs target, rejected samples by reason, critical values and notification time
- Pharmacy: sales and margin, pipeline stage times (`04-pharmacy.md` reports)

## Clinical / statutory
- Disease statistics by ICD diagnosis, age group and gender (for health department reporting)
- Admissions, discharges by type (incl. LAMA, referred, expired), census, bed occupancy %, average length of stay
- ER visits by triage level and disposition
- Controlled drug register

## Financial
- Revenue by department, doctor, service and branch
- Doctor share payable and paid
- Discounts by user, reason and department; welfare/zakat utilization and fund balances
- Panel and insurance AR aging, claim status, deductions
- Refunds by reason
- Expenses by category

## Quality
- Patient feedback averages and comments by department/doctor/month
- Nursing response times
- Message delivery success rate
