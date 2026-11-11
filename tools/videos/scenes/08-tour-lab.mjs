// 08 — Every lab page.
export default async function (page, h) {
  await h.title("Every lab page", "The laboratory screens, from order to verified report.");
  await h.as("lab");
  await h.visit("/lab/orders", "Lab orders: order, Paid / Unpaid, track every sample to the released report.", "Lab orders");
  await h.visit("/lab/samples", "Lab samples: collect and label paid orders, receive in the lab, reject and recollect.", "Lab samples");
  await h.visit("/tests", "Lab results: worklist by department; values with ranges, flags and previous results.", "Lab results");
  await h.visit("/lab/outsourced", "Outsourced tests: dispatch to a reference lab, record their result and attach the report.", "Outsourced tests");
  await h.visit("/lab/templates", "Test templates: parameters, units, ranges by age and gender, price.", "Test templates");
  await h.as("pathologist");
  await h.visit("/lab/verify", "Lab verification: the pathologist verifies and signs, or sends back.", "Lab verification");
  await h.hush();
}
