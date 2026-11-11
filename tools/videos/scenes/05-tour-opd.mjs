// 05 — Every front-desk page.
export default async function (page, h) {
  await h.title("Every front-desk page", "A tour of the reception screens and what each one is for.");
  await h.as("reception");
  await h.visit("/pw-home", "The reception Desktop: today's numbers and a tile for every screen.", "Desktop");
  await h.visit("/registration", "Patient registration: search, duplicate check, Urdu name, patient card with QR.", "Patient registration");
  await h.visit("/counter", "Reception counter: OPD, services, lab tests, IPD advances and dues in one cart and one receipt.", "Reception counter");
  await h.visit("/opd_slip", "OPD slip: doctor, fee from the schedule, vitals if the counter takes them, token and receipt.", "OPD slip");
  await h.visit("/appointments", "Appointments: counter, website and WhatsApp bookings by doctor and time; confirm, arrived, reschedule.", "Appointments");
  await h.visit("/appointments/inbox", "WhatsApp inbox: chats the booking bot hands over to reception.", "WhatsApp inbox");
  await h.visit("/patients", "Patients: every record, with visits, bills and documents.", "Patients");
  await h.visit("/physician-queue", "Physician queue: tokens with the nurse, waiting, with the doctor and done.", "Physician queue");
  await h.visit("/doctors", "Doctors: schedules, fees, leave and online booking.", "Doctors");
  await h.visit("/messages", "Message log: every WhatsApp / SMS sent, delivered or failed.", "Message log");
  await h.hush();
}
