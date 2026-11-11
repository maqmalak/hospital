// 04 — Reception counter: one cart (lab order from the lab, services), discount, payment, receipt.
import * as F from "../flows.mjs";
export default async function (page, h) {
  const J = { ...(await F.prepare(h)), p: F.newPatient() };
  await h.title("Reception counter", "Everything a patient owes in one cart: OPD fees, services, lab tests sent from the lab, IPD advances and dues.",
    ["Find the patient", "Cart", "Discount % or Rs", "Pay", "Receipt"]);
  await F.labWalkIn(h, J, ["Complete Blood Count"]);
  await h.as("reception");
  await h.go("/counter", 3200);
  await h.say("The counter: search a patient (F2), or add doctors, services and tests (F3). The 'From the lab' tab lists tests waiting to be paid.", "Reception · Counter");
  const tab = page.getByRole("button", { name: /From the lab/ }).first();
  if (await tab.count()) { await h.click(tab, 2200); await h.say("The lab's order for this patient is waiting here.", "From the lab"); }
  await h.say("A discount can be typed in % or in Rs. Within the cashier's limit it applies at once; above it the supervisor approves.", "Discount");
  await F.labPayAtCounter(h, J);
  await h.go("/cash/shift", 2800);
  await h.say("Every receipt lands in the cashier's shift, by payment mode.", "Shift");
}
