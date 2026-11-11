// 03 — OPD visit: walk-in registration → OPD slip → nurse vitals → doctor prescription.
import * as F from "../flows.mjs";
export default async function (page, h) {
  const J = { ...(await F.prepare(h)), p: F.newPatient() };
  await h.title("An OPD visit", "Register a walk-in patient, issue the slip and token, the nurse takes vitals and the doctor prescribes.",
    ["Register", "OPD slip", "Vitals", "Prescription", "Signed"]);
  await h.as("reception");
  await h.go("/registration", 2500);
  await F.register(h, J);
  await F.opdSlip(h, J);
  await F.vitals(h, J);
  await F.prescribe(h, J);
  await h.hush(); await h.pause(600);
}
