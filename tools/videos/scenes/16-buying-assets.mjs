// 16 — Buying, fixed assets and consumption, following one purchase.
export default async function (page, h) {
  await h.title("Buying, fixed assets and consumption", "From a material request to a supplier invoice, assets with depreciation, and consumption.",
    ["Material request", "Purchase order", "Receipt", "Supplier invoice", "Fixed assets", "Consumption"]);
  await h.as("store");
  await h.visit("/buying", "Buying: open orders, receipts due, supplier balances and this month's purchases.", "Store keeper · Buying");
  await h.visit("/material_request", "Material requests: wards, lab and pharmacy ask; the store approves.", "Material request");
  await h.visit("/suppliers", "Suppliers: Pakistani pharmaceutical distributors with NTN / STRN and terms.", "Suppliers");
  await h.visit("/purchase_order", "Purchase orders: items, rates, delivery date — sent to the supplier.", "Purchase order");
  await h.visit("/purchase_receipt", "Purchase receipts: goods into the right store, medicines with batch and expiry; machines get a location.", "Receipt");
  await h.as("accounts");
  await h.visit("/purchase_invoice", "Supplier invoices: the bill against the receipt, paid by accounts.", "Supplier invoice");
  await h.visit("/assets", "Fixed assets: X-ray, ultrasound, ventilators, generator — location, custodian, useful life, monthly depreciation.", "Fixed assets");
  await h.as("store");
  await h.visit("/consumption", "Consumption: consumables issued to wards, OT and the lab, charged to each department.", "Consumption");
  await h.hush();
}
