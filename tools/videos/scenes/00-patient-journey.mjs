// 00 — One patient through the whole hospital: online appointment → OPD → lab → admission → discharge.
import * as F from "../flows.mjs";

export default async function (page, h) {
  const J = { ...(await F.prepare(h)), p: F.newPatient() };
  await h.title("The full patient journey", `${J.p.name} — from an online booking to discharge, through every desk of VVS Hospital.`,
    ["Online appointment", "Reception", "OPD slip", "Nurse vitals", "Doctor", "Lab paid at reception", "Sample & result", "Verification", "Admission", "Ward care", "Discharge & bill"]);
  await h.chapter(1, "Online appointment", "The patient books a time with the doctor on the website.");
  await F.bookOnline(h, J);
  await h.chapter(2, "Arrival at reception", "Confirm the booking, register the patient, issue the OPD slip and token.");
  await F.receptionArrival(h, J);
  await F.register(h, J);
  await F.opdSlip(h, J);
  await h.chapter(3, "Nurse and doctor", "Vitals first, then the doctor examines, prescribes and orders a blood test.");
  await F.vitals(h, J);
  await F.prescribe(h, J);
  await h.chapter(4, "Laboratory", "Pay at reception, collect the sample, enter the result, the pathologist verifies.");
  await F.labPayAtCounter(h, J);
  await F.labSample(h, J);
  await F.labResult(h, J);
  await F.labVerify(h, J);
  await h.chapter(5, "Admission", "The fever is high and the patient is dehydrated: the doctor admits.");
  await F.admit(h, J);
  await F.wardCare(h, J);
  await h.chapter(6, "Discharge", "Discharge summary, final bill, settlement and the bed back to cleaning.");
  await F.discharge(h, J);
  await h.title("Journey complete", `${J.p.name} (${J.mr}) — booked online, seen in OPD, tested, admitted and discharged. Every step posted its bills and records in ERPNext.`);
}
