// 12 — Pharmacy: prescription → POS → payment → pipeline.
import * as F from "../flows.mjs";
export default async function (page, h) {
  const J = { ...(await F.prepare(h)), p: F.newPatient() };
  await h.title("Pharmacy: prescription to handover", "Load the doctor's prescription, take payment, and the pick → review → handover pipeline.",
    ["Prescription", "POS", "Pay", "Pipeline"]);
  await h.as("reception");
  await h.go("/registration", 2000);
  await F.register(h, J);
  await F.opdSlip(h, J);
  await F.vitals(h, J);
  await F.prescribe(h, J, { lab: null });
  await F.pharmacySale(h, J);
}
