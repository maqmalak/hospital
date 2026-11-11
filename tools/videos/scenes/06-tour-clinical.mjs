// 06 — Every clinical page.
export default async function (page, h) {
  await h.title("Every clinical page", "The screens nurses and doctors use in the OPD.");
  await h.as("nurse");
  await h.visit("/opd/vitals", "OPD vitals: the nurse records vitals, complaint and priority, then sends the token to the doctor.", "Nurse · OPD vitals");
  await h.as("doctor");
  await h.visit("/physician-queue", "Physician queue: four columns — with the nurse, waiting, with the doctor, done.", "Physician queue");
  await h.visit("/pw-prescription", "Prescription workspace: pending patients, medicines with safety alerts, diagnosis, lab tests, Urdu advice, sign & print.", "Prescription workspace");
  await h.visit("/pw-history", "Patient history: visits, vitals trend, prescriptions, results and admissions.", "Patient history");
  await h.visit("/masters", "Clinical masters: medicines, allergies, ICD-10 and interaction rules.", "Clinical masters");
  await h.visit("/my-share", "My commission: the doctor's share of fees, earned when the patient pays.", "My commission");
  await h.hush();
}
