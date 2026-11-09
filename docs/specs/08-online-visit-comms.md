# 08 — Online Visit & Patient Communications

## Online Visit (telemedicine)
- **Online Visit Request:** patient details (or link to existing patient by phone + OTP), language, location, complaint, symptoms, duration, conditions, current meds, photos (attachments), fee, payment method, proof, access token (hashed), status (Pending / Accepted / Rejected / Completed / Cancelled), assigned OV doctor, video link, fee collected + reference, prescription (a normal signed Prescription linked to the visit), follow-up, doctor notes, refund reference/notes.
- **Public portal (`/online-visit`):** 4-step form in en/ur/ar, mobile-first → token page shows status, video link when ready, and the prescription when completed.
- **Staff dashboard (`/ov-staff`):** live queue, accept/reject, assign doctor, share video link, collect/verify fee, refunds.
- Patients need no login; access is by token only (same token rules as the lab portal: hashed, rate-limited, `no-store`).
- Messages via the shared messaging layer (`01-appointments-messaging.md`).

## Patient Communications (nursing)
- **Nursing Station** (ward, name, branch), **Patient Comms Profile** (patient, bed allotment, station, access token, active) — created on admission, deactivated on discharge, **Comms Message** (profile, direction, text, voice-to-text flag, read flag, sender), **Station Assignment** (`/pc-assign`), **Broadcast** (station, text).
- **Patient room portal (`/patient/:token`):** bedside tablet/phone; quick buttons (nurse, water, pain, bathroom help) plus text and voice-to-text (Urdu/English); sees replies live.
- **Nursing station (`/ns/:station`):** realtime list of patients with unread counts, urgency by quick-button type, reply, broadcast to all patients of the station, on-duty nurses from the roster (`06-ipd.md`).
- Response-time report per station.

## Build decisions (Phase 4)
See `DECISIONS.md` D-35 … D-37: online fees posted outside cashier shifts, token + last-4-digits rule for the prescription, Jitsi link by default, prescription is a normal signed Prescription linked to the request.

## Build decisions (Phase 5)
See `DECISIONS.md` D-44: Nursing Station DocType linked from Ward; assignment is a profile field (`/pc-assign`); bedside and station pages poll; Pain / Nurse urgent by setting; response time = first staff reply.
