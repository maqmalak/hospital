// 09 — Emergency: arrival → triage → doctor → admitted.
import * as F from "../flows.mjs";
export default async function (page, h) {
  const J = { ...(await F.prepare(h)), p: F.newPatient() };
  await h.title("Emergency", "Arrival, triage, the doctor, then a disposition: admit, send home, refer, LAMA or expired.",
    ["Arrival", "Triage", "Doctor", "Disposition"]);
  await h.as("reception");
  const r = await h.call("patients.register", { data: JSON.stringify({ patient_name: J.p.name, gender: J.p.gender, age: J.p.age, phone: J.p.phone, city: "Lahore", relation_type: "S/O", guardian_name: "Abdul Karim" }), duplicate_reason: "Help video" });
  J.mr = r.name;
  await F.emergency(h, J, { admitTo: true });
  await h.as("nurse");
  await h.go(`/ipd/${J.adm}`, 3000);
  await h.say("The admission chart carries the ER notes, vitals and charges from the emergency.", "In the ward");
}
