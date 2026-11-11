// 13 — Every pharmacy and store page.
export default async function (page, h) {
  await h.title("Every pharmacy and store page", "The pharmacy counter, its pipeline and the medicine store.");
  await h.as("cashier");
  await h.visit("/medicine_invoice", "Pharmacy POS: prescriptions, walk-in and credit sales, returns, offline mode.", "Pharmacy POS");
  await h.as("finder");
  await h.visit("/pharmacy/pick", "Pharmacy pick: the finder picks each line and scans the batch.", "Pharmacy pick");
  await h.as("reviewer");
  await h.visit("/pharmacy/review", "Pharmacy review: the pharmacist checks batch, expiry and prescription.", "Pharmacy review");
  await h.visit("/pharmacy/tickets", "Pharmacy pipeline: every ticket and its stage.", "Pharmacy pipeline");
  await h.visit("/pharmacy/reports", "Pharmacy reports: sales, margins, controlled drugs, expiry.", "Pharmacy reports");
  await h.as("dispenser");
  await h.visit("/pharmacy/dispense", "Pharmacy handover: hand over and take payment if pay-at-handover.", "Pharmacy handover");
  await h.as("store");
  await h.visit("/pharmacy/items", "Medicine master: brand, generic, strength, pack, reorder level.", "Medicine master");
  await h.visit("/store/receive", "Receive stock: against the purchase order, with batch and expiry.", "Receive stock");
  await h.visit("/store/transfers", "Store transfers: main store to pharmacy, wards and lab.", "Store transfers");
  await h.visit("/store/cycle-count", "Cycle count: count a shelf, post the differences.", "Cycle count");
  await h.visit("/store/returns", "Expiry & returns: near-expiry, quarantine, return to supplier.", "Expiry & returns");
  await h.hush();
}
