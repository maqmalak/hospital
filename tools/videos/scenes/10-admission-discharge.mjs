// 10 — Admission to discharge.
import * as F from "../flows.mjs";
export default async function (page, h) {
  const J = { ...(await F.prepare(h)), p: F.newPatient(true) };
  await h.title("Admission to discharge", "Admit with an advance, ward care, discharge summary, final bill, settlement and discharge.",
    ["Admit", "Vitals & notes", "Medicines & diet", "Discharge summary", "Final bill", "Discharge"]);
  await h.as("reception");
  const r = await h.call("patients.register", { data: JSON.stringify({ patient_name: J.p.name, gender: J.p.gender, age: J.p.age, phone: J.p.phone, city: "Lahore", relation_type: "D/O", guardian_name: "Abdul Karim" }), duplicate_reason: "Help video" });
  J.mr = r.name;
  await F.admit(h, J);
  await F.wardCare(h, J);
  await F.discharge(h, J);
}
