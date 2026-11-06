# 11 — React Routes

Rebuild every portal page in the guide's *Portal Pages Reference* and keep the same paths so existing links and QR codes keep working. Roles are enforced on the server; this table drives `Page Access Rule` defaults.

| Route | Screen | Roles |
|---|---|---|
| `/login` (`/pw-login`) | Login (2FA where required) | Public |
| `/`, `/pw-home` | Control board (tiles by role, branch and module switches) | All staff |
| `/pw-dashboard` | Dashboard (`10-reports.md`) | Admin, Doctor, Accountant |
| `/registration` | Patient registration, search, duplicate check, patient card print | Receptionist |
| `/patients/merge` | Merge duplicate patients | Admin |
| `/book-appointment` | Public booking | Public |
| `/my-appointment/:token` | View / reschedule / cancel booking | Token |
| `/appointments` | Appointment management, channel filter, WhatsApp inbox | Receptionist, Admin |
| `/physician-queue` | Live queue + waiting-room display mode | All staff |
| `/opd_slip` | OPD slip create/print | Receptionist |
| `/pw-prescription` | Prescription workspace with safety alerts | Doctor |
| `/pw-history` | Patient history timeline | Doctor, Admin, Nurse |
| `/er` | Emergency board, triage, ER notes | Doctor, Nurse, Receptionist |
| `/ward`, `/ipd` | Bed map + per-patient timeline | Doctor, Nurse, Admin |
| `/ipd_slip`, `/ipd_report` | IPD running bill/final bill, IPD reports | Receptionist, Admin, Doctor |
| `/roster` | Nurse duty roster | Admin, Nurse (head) |
| `/lab/samples` | Sample collection, labels, receiving, rejection | Lab User |
| `/tests` | Result entry, WhatsApp status, resend/revoke report link | Lab User |
| `/lab/verify` | Verification and sign-off | Pathologist |
| `/lab/outsourced` | Outsourced dispatch and report entry | Lab User, Pathologist |
| `/lab-report/:token` | Patient report view + PDF download | Token |
| `/medicine_invoice` | Opens ERPNext `/app/point-of-sale` | Pharmacy Cashier, Admin |
| `/pharmacy/pick` | Picking queue (tablet) | Finder |
| `/pharmacy/review` | Review & count, substitutions, clinical checks | Reviewer |
| `/pharmacy/dispense` | Handover: call, recall, collect, hand over | Dispenser |
| `/pharmacy/items` | Medicine master | Admin, Store Keeper |
| `/pharmacy/reports` | Pharmacy reports | Admin, Reviewer, Store Keeper |
| `/store/transfers` | Material requests and transfers | Store Keeper |
| `/store/cycle-count` | Count sheets and variances | Store Keeper, Admin |
| `/store/returns` | Supplier returns, expired write-off requests | Store Keeper, Admin |
| `/display/counter/:deviceKey` | Customer display at billing counter | Device key |
| `/display/queue/:deviceKey` | Waiting-area token display / kiosk | Device key |
| `/cash/shift` (`/pos-opening`) | Open shift, live summary, Pay In / Pay Out / Cash Drop | All cash-handling roles |
| `/cash/close` (`/pos-closing`) | Blind count, expected vs counted, excess/short | All cash-handling roles |
| `/cash/approvals` | Closings beyond tolerance, cash drop confirmations | Cash Supervisor, Admin |
| `/cash/reports` | Shift and day-end cash reports | Cash Supervisor, Accountant, Admin |
| `/billing/discount-approvals` | Pending discount requests | Approver roles |
| `/general_invoice`, `/payment_entry` | General billing and payments | Receptionist, Accountant |
| `/panels` | Panel setup, statements, receipts | Accountant |
| `/insurance/preauth`, `/insurance/claims` | Pre-authorizations and claims | Accountant, Receptionist (pre-auth request) |
| `/welfare` | Welfare/zakat schemes, approvals, fund balances | Accountant, Admin |
| `/doctor-share` | Share ledger, payout runs, doctor statements | Accountant (doctors: own statement) |
| `/expenses` | Expense entry and approvals | Accountant, Admin |
| `/purchase_order`, `/purchase_invoice` | Purchasing lists and approvals | Store Keeper, Accountant, Admin |
| `/pw-pos-setup` | Opens ERPNext POS Profile | Admin |
| `/reports` | Report catalogue (`10-reports.md`) | By report |
| `/feedback` | Patient feedback and follow-up | Admin |
| `/audit` | Audit and access logs | Admin |
| `/pw-data-manager` | CSV/XLSX import and migration | Admin |
| `/pw-print-previsit` | Pre-visit token print | Receptionist |
| `/online-visit` | Public telemedicine request + status by token | Public |
| `/ov-staff` | Online Visit dashboard | OV Staff, OV Doctor |
| `/ns/:station` | Nursing station | Nurse |
| `/patient/:token` | Bedside patient messaging | Token |
| `/pc-assign` | Patient-to-station assignment | Admin, Nurse |
| `/settings` | Clinic Settings editor | Admin |

## Frontend requirements
- **Auth:** Frappe session login, CSRF on every mutating request, user + roles + branch + allowed routes loaded at boot; idle lock screen; public/token routes work signed out.
- **Realtime:** queue, bed map, ER board, pharmacy pipeline, displays, OV queue and nursing station update live via `publish_realtime`, branch-scoped channels; polling fallback.
- **i18n + RTL:** every string translated; layout flips for ur/ar; names shown in the chosen language; multi-language prints.
- **Printing:** through the print agent with printer map; browser print fallback; thermal 80 mm and label layouts.
- **Scanning:** every patient, sample, item and receipt field accepts barcode/QR scanner input.
- **Responsive:** displays, tablets (pick, nursing, room portal) and public portals work on phones/tablets; staff screens desktop-first but tablet-usable.
- **Module switches:** hide routes, tiles and sections for disabled modules.
- **Errors:** show Frappe's `_server_messages` / exception text clearly; never fail silently.
