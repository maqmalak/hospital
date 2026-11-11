// 11 — Every ward page.
export default async function (page, h) {
  await h.title("Every ward page", "Inpatient and emergency screens.");
  await h.as("nurse");
  await h.visit("/er", "Emergency: triage board, bays, doctor assignment and disposition.", "Emergency");
  await h.visit("/ward", "Wards & beds: the live bed map; mark beds clean, reserve or under maintenance.", "Wards & beds");
  await h.visit("/ipd", "Admissions: everyone in hospital, days, doctor, balance; open the chart.", "Admissions");
  await h.visit("/ipd/mar", "Drug round: doses due by ward; chart administered, held or refused.", "Drug round");
  await h.visit("/ns", "Nursing stations: bedside calls and response times.", "Nursing stations");
  await h.visit("/ipd/kitchen", "Diet list: today's diets for the kitchen.", "Diet list");
  await h.visit("/roster", "Nurse roster: who is on duty in each ward and shift.", "Nurse roster");
  await h.as("reception");
  await h.visit("/ipd_slip", "IPD bill: running bill, advances, discount, final bill, settlement and refund.", "IPD bill");
  await h.visit("/ipd/pre-auth", "Insurance pre-auth: approvals before an insured admission.", "Insurance pre-auth");
  await h.visit("/ipd_report", "IPD reports: admissions, discharges, occupancy and revenue.", "IPD reports");
  await h.visit("/display/ward", "Ward kiosk display: the bed board for the ward screen.", "Ward kiosk display");
  await h.hush();
}
