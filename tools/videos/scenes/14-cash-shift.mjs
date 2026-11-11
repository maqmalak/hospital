// 14 — Cashier shift: open → pay in → close (card and wallets filled in) → supervisor.
export default async function (page, h) {
  await h.title("Cashier shift", "Open with a float, collect, pay in / out, cash drop, close with the note count.",
    ["Open", "Collect", "Pay in / out", "Close", "Supervisor"]);
  await h.as("reception");
  await h.go("/cash/shift", 3200);
  await h.say("Cashier shift: the open shift with collections by mode, movements and every bill.", "Reception · Shift");
  await h.scroll(500, 1500); await h.scroll(-500, 600);
  await h.say("Pay in / Pay out record petty cash with a reason; Cash drop sends extra cash to the safe — the supervisor confirms it.", "Movements");
  await h.go("/cash/close", 3200);
  await h.say("Close shift: the expected figures by payment mode are at the top.", "Close");
  const my = await h.get("cash.my_shift");
  const cash = Math.round((my.shift?.modes ?? []).find((m) => m.mode_of_payment === "Cash")?.expected ?? 0);
  let left = cash;
  for (const d of my.denominations ?? []) {
    const n = Math.floor(left / d);
    if (!n) continue;
    left -= n * d;
    const box = page.locator("div.rounded-2xl", { hasText: `Rs ${d.toLocaleString()}` }).locator("input").first();
    if (await box.count()) await h.fill(box, String(n), 350);
  }
  await h.say("Count the notes by denomination. Card and JazzCash are filled in from the system — change them only if the slip differs.", "Count");
  await h.focus(page.getByText("Card / online (auto-filled)").first(), 2000).catch(() => {});
  await h.say("Submit count: balanced or within the tolerance closes the shift; a bigger difference waits for the cash supervisor.", "Submit");
  await h.as("supervisor");
  await h.go("/cash/approvals", 3000);
  await h.say("Cash supervisor: approve a short or excess, ask for a recount, confirm cash drops.", "Supervisor · Approvals");
  await h.go("/cash/reports", 3000);
  await h.say("Cash reports: shifts by counter and cashier, differences and collections by mode.", "Reports");
}
