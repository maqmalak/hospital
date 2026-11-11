// 15 — Every finance page.
export default async function (page, h) {
  await h.title("Every finance page", "Money in, money out, receivables, doctors, panels and tax.");
  await h.as("accounts");
  await h.visit("/finance", "Finance overview: revenue by department, collections by mode, receivables, payables and cash.", "Finance overview");
  await h.visit("/expenses", "Expenses: bills with approval by amount; recurring expenses drafted on their date.", "Expenses");
  await h.visit("/doctor-share", "Doctor share: each doctor's share, earned when the patient pays; paid as suppliers.", "Doctor share");
  await h.visit("/panels", "Panels & insurers: companies, rates and credit limits.", "Panels & insurers");
  await h.visit("/claims", "Insurance claims: from final bills to settlement.", "Insurance claims");
  await h.visit("/welfare", "Welfare & zakat: approved patients' discounts charged to the fund.", "Welfare & zakat");
  await h.visit("/online-payments", "Online card payments: gateway payments and settlement.", "Online card payments");
  await h.visit("/fbr", "FBR reporting: invoices reported to FBR.", "FBR reporting");
  await h.visit("/reports", "Reports: OPD, lab, pharmacy, IPD, cash and doctors.", "Reports");
  await h.as("supervisor");
  await h.visit("/billing/discount-approvals", "Discount approvals: discounts above a cashier's limit.", "Discount approvals");
  await h.visit("/cash/reports", "Cash reports: shifts, differences and collections.", "Cash reports");
  await h.hush();
}
