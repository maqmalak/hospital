// 07 — Lab test: walk-in at the lab → paid at reception → sample → result → verification → report.
import * as F from "../flows.mjs";
export default async function (page, h) {
  const J = { ...(await F.prepare(h)), p: F.newPatient(true) };
  await h.title("A lab test from order to report", "Walk-in at the lab: order, pay at reception, sample, result, verification, report.",
    ["Register & order", "Pay at reception", "Collect sample", "Enter result", "Verify", "Report"]);
  await F.labWalkIn(h, J);
  await F.labPayAtCounter(h, J);
  await F.labSample(h, J);
  await F.labResult(h, J);
  await F.labVerify(h, J);
  await h.as("lab");
  await h.go("/lab/orders", 2800);
  await h.say("Back in Lab orders the test is verified: View report, print & hand over, or send the report link on WhatsApp.", "Delivered");
}
