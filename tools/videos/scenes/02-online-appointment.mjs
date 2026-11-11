// 02 — Online appointment: website booking → reception confirms → arrival → registration → OPD slip.
import * as F from "../flows.mjs";
export default async function (page, h) {
  const J = { ...(await F.prepare(h)), p: F.newPatient(true) };
  await h.title("Online appointment to check-in", "The patient books on the website; reception confirms, registers and issues the slip.",
    ["Book online", "Confirm", "Arrived", "Register", "OPD slip & token"]);
  await F.bookOnline(h, J);
  await F.receptionArrival(h, J);
  await F.register(h, J);
  await F.opdSlip(h, J);
  await h.hush(); await h.pause(600);
}
