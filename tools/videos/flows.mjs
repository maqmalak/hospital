// Shared steps of the patient journey (D-63). Each step acts as the right staff member through the real screens; when a
// screen interaction is not possible (layout changed, item out of stock) the same action is done through the app's API
// as that user, so the recording still shows the true result. J carries names between steps.
import { bench } from "./lib.mjs";

const info = (what, kw = {}) => bench("hospital_vvs.devtools.video.info", { what, ...kw });
const stamp = () => Date.now().toString().slice(-6);
const FIRST_M = ["Bilal", "Hamza", "Usman", "Faisal", "Kamran", "Naveed", "Zubair", "Asad", "Tariq", "Shahid"];
const FIRST_F = ["Ayesha", "Sana", "Hira", "Mehwish", "Iqra", "Rabia", "Nadia", "Saima", "Amna", "Bushra"];
const LAST = ["Raza", "Awan", "Malik", "Qureshi", "Butt", "Siddiqui", "Bhatti", "Iqbal", "Javed", "Abbasi"];

export function newPatient(female = false) {
  const s = stamp();
  const first = (female ? FIRST_F : FIRST_M)[Number(s[3])];
  return { name: `${first} ${LAST[Number(s[5])]} ${LAST[Number(s[4])]}`, age: String(22 + (Number(s) % 45)), gender: female ? "Female" : "Male",
    phone: `300${Math.floor(1000000 + Math.random() * 8999999)}` };
}

/** Try the screen; on failure log it and run the API fallback. */
async function ui(label, fn, fallback) {
  try { return await fn(); } catch (e) {
    console.warn(`  · ${label}: screen step skipped (${e.message.split("\n")[0].slice(0, 120)}) — using the API`);
    if (fallback) return fallback();
    return null;
  }
}

export async function prepare(h) {
  info("prepare");
  const d = info("doctor");
  return { doctor: d.name, doctorName: d.doctor_name };
}

// ---------------------------------------------------------------- online appointment
export async function bookOnline(h, J) {
  await h.context.clearCookies();
  await h.page.evaluate(() => { try { sessionStorage.removeItem("hv.video.role"); } catch { /* ignore */ } document.getElementById("hv-role")?.remove(); }).catch(() => {});
  await h.context.addInitScript(() => { try { sessionStorage.removeItem("hv.video.role"); } catch { /* ignore */ } });
  await h.go("/book-appointment", 2500);
  await h.say("The patient opens the hospital website on their phone: no account needed.", "Patient · Online booking");
  const p = h.page;
  await h.type(p.getByPlaceholder("Doctor or speciality"), J.doctorName.replace("Dr. ", "").split(" ")[0], 900);
  await h.click(p.locator("button", { hasText: J.doctorName }).first(), 1800);
  await h.say("Choose the doctor, then a day and a free time. The time is held for 10 minutes while booking.", "Step · Doctor and time");
  await h.click(p.locator("button:not([disabled])", { hasText: /^\s*\d{2}:\d{2}/ }).first(), 1500);
  await h.type(p.getByPlaceholder("300 1234567"), J.p.phone, 500);
  await h.click(p.getByRole("button", { name: /^Next$/ }).first(), 1800);
  const name = p.locator("label", { hasText: "Patient name" }).locator("xpath=following-sibling::div//input").first();
  await h.type(name, J.p.name, 400);
  await h.type(p.locator("label", { hasText: /^Age$/ }).locator("xpath=following-sibling::input").first(), J.p.age, 300, false);
  await h.click(p.getByRole("button", { name: J.p.gender, exact: true }).first(), 500, false);
  await h.say("New number: the patient types the name, age and gender; updates come on WhatsApp.", "Step · Details");
  await h.click(p.getByRole("button", { name: /^Next$/ }).last(), 1500);
  await h.say("Pay at the clinic, or online with JazzCash / card where switched on.", "Step · Payment");
  await h.click(p.getByRole("button", { name: /Send booking request/ }), 3500);
  await h.say("Booking request sent. The patient gets a booking number; reception confirms it on WhatsApp.", "Booked");
  const a = info("appointment", { phone: J.p.phone });
  J.appointment = a?.name;
  J.bookingRef = a?.booking_ref;
}

export async function receptionArrival(h, J) {
  await h.as("reception");
  await h.go("/appointments", 3000);
  await h.say("Reception: today's bookings from the counter, the website and WhatsApp. The new web booking waits for confirmation.", "Reception · Appointments");
  const listView = async () => { const b = h.page.getByRole("button", { name: /^List$/ }).first(); if (await b.count()) await h.click(b, 1500, false); };
  await listView();
  const row = h.page.locator("tr", { hasText: J.p.name }).last();
  await ui("confirm booking", async () => { await h.click(row.getByRole("button", { name: /Confirm/ }).first(), 2200); },
    () => h.call("appointments.set_status", { name: J.appointment, status: "Confirmed" }));
  await h.say("Confirmed — the patient gets the confirmation and a reminder before the visit.", "Confirm");
  await h.go("/appointments", 2000);
  await listView();
  await ui("arrived", async () => { await h.click(h.page.locator("tr", { hasText: J.p.name }).last().getByRole("button", { name: /Arrived/ }), 2500); },
    async () => { await h.call("appointments.set_status", { name: J.appointment, status: "Arrived" }); await h.go("/registration", 2000); });
  await h.say("The patient arrives: Arrived opens registration, because a web booking is not yet a hospital patient.", "Arrived");
}

// ---------------------------------------------------------------- OPD
export async function register(h, J) {
  await h.as("reception");
  if (!h.page.url().includes("/registration")) await h.go("/registration", 2200);
  const p = h.page;
  await h.say("Search first: by MR number, mobile, CNIC or name. Not found — register.", "Reception · Registration");
  await h.type(p.getByPlaceholder("Muhammad Ali Khan"), J.p.name, 900);
  await h.say("The Urdu name fills itself as the English name is typed.", "Urdu name");
  await h.click(p.locator("button", { hasText: new RegExp(`^${J.p.gender}$`) }).first(), 500, false);
  await h.type(p.getByPlaceholder("Age"), J.p.age, 300, false);
  await h.type(p.getByPlaceholder("300 1234567"), J.p.phone, 500, false);
  await h.click(p.getByRole("button", { name: /Register & OPD slip/ }), 3000);
  await p.waitForURL(/\/opd_slip\?patient=MR-/, { timeout: 15000 });
  J.mr = new URL(p.url()).searchParams.get("patient");
  if (J.appointment) await h.call("appointments.link_patient", { name: J.appointment, patient: J.mr }).catch(() => {});
  await h.say(`Registered as ${J.mr}. The OPD slip opens for the patient.`, "MR number");
}

export async function opdSlip(h, J) {
  await h.as("reception");
  if (!h.page.url().includes("/opd_slip")) await h.go(`/opd_slip?patient=${J.mr}`, 2500);
  const p = h.page;
  await h.click(p.getByRole("button", { name: new RegExp(J.doctorName) }).first(), 1500);
  await h.say(`${J.doctorName}: the fee comes from the doctor's fee schedule; follow-up and welfare rates apply by themselves.`, "Reception · OPD slip");
  await h.click(p.getByRole("button", { name: /Save & print/ }), 3000);
  await h.say("Paid in the reception shift. The fee receipt and the token print; the token goes to the nurse first.", "Token");
  await h.pause(800);
}

export async function vitals(h, J) {
  await h.as("nurse");
  await h.go("/opd/vitals", 2600);
  const p = h.page;
  await h.say("Nurse: patients waiting for vitals, urgent and elderly first, with their last readings.", "Nurse · OPD vitals");
  await h.click(p.getByRole("button", { name: new RegExp(J.p.name) }).first(), 1500);
  for (const [label, v] of [["BP systolic", "128"], ["BP diastolic", "84"], ["Pulse", "78"], ["Temperature", "100.4"], ["SpO₂", "98"], ["Weight", "72"], ["Height", "172"]]) {
    await h.fill(p.getByLabel(new RegExp(`^${label}`)), v, 250);
  }
  await h.say("BP, pulse, temperature, SpO₂, weight and height — BMI is worked out, impossible readings are refused.", "Vitals");
  await h.click(p.getByRole("button", { name: /Save & send to/ }), 2500);
  await h.say("Sent: the token moves to Waiting on the doctor's list.", "To the doctor");
}

export async function prescribe(h, J, { lab = "Complete Blood Count", medicine = "Panadol" } = {}) {
  await h.as("doctor");
  await h.go("/pw-prescription", 3000);
  const p = h.page;
  await h.say("Doctor: pending patients — at vitals, and ready. The patient with vitals done is ready.", "Doctor · Prescription workspace");
  await h.click(p.getByRole("button", { name: new RegExp(J.p.name) }).first(), 2500);
  await h.say("The nurse's vitals, the complaint and earlier visits are on screen.", "The patient");
  await ui("medicine", async () => {
    await h.type(p.getByPlaceholder("Medicine — brand or generic"), medicine, 1200);
    const hit = p.locator("div.absolute button", { hasText: new RegExp(medicine) }).first();
    await hit.waitFor({ timeout: 8000 });
    await hit.dispatchEvent("mousedown");
    await h.pause(1200);
  });
  await h.say("Dose, frequency and days fill the quantity. Allergy, duplicate and dose alerts appear as medicines are added.", "Medicine");
  await ui("diagnosis", async () => { await h.click(p.locator("button", { hasText: /^\+ / }).filter({ hasNotText: lab || "@@" }).first(), 900); });
  if (lab) {
    await ui("lab test", async () => { await h.click(p.locator("button", { hasText: `+ ${lab}` }).first(), 1200); });
    await h.say(`${lab} ordered: a lab order is made and paid at reception.`, "Lab test");
  }
  await h.click(p.getByRole("button", { name: /Sign & print/ }), 3000);
  await h.say("Signed: the prescription prints in English and Urdu and can no longer be edited.", "Signed");
  J.rx = info("rx", { patient: J.mr })?.name;
}

// ---------------------------------------------------------------- lab
export async function labPayAtCounter(h, J) {
  await h.as("reception");
  await h.go("/counter", 3000);
  const p = h.page;
  await h.say("Reception counter: one cart for everything the patient owes.", "Reception · Counter");
  await ui("counter patient", async () => {
    await h.type(p.getByPlaceholder("Patient: MR, phone, name (F2)"), J.mr, 1500);
    await p.keyboard.press("Enter");
    await h.pause(2000);
  });
  await h.say("The doctor's lab order is waiting to be paid — it appears in the cart for this patient.", "Lab order");
  const lab = info("lab", { patient: J.mr });
  J.ti = lab?.name;
  if (lab && lab.status !== "Paid") {
    const gross = (await h.get("lab.order", { name: J.ti }))?.gross_total ?? 0;
    await h.call("counter.checkout", { data: { patient: J.mr, branch: "Lahore Main", lines: [{ kind: "Lab Order", target: J.ti }], tenders: [{ mode_of_payment: "Cash", amount: gross || 3000 }] } });
  }
  await h.say("Paid in cash — the receipt shows the test, and the lab sees the order as Paid.", "Paid");
}

export async function labSample(h, J) {
  await h.as("lab");
  await h.go("/lab/orders", 2800);
  await h.say("Lab: every order shows Paid or Unpaid. Samples are collected only after payment.", "Lab · Orders");
  await h.go("/lab/samples", 2800);
  const p = h.page;
  await h.say("Lab samples: paid orders waiting for collection.", "Lab · Samples");
  const lab = info("lab", { patient: J.mr });
  const s = lab?.samples?.[0];
  if (s) {
    await ui("collect", async () => { await h.click(p.locator("div, tr", { hasText: J.p.name }).filter({ has: p.getByRole("button", { name: /^Collect/ }) }).last().getByRole("button", { name: /^Collect/ }).first(), 2200); },
      () => h.call("lab.sample_action", { name: s.name, action: "collect" }));
    await h.say("Collected: the barcode label prints for the tube.", "Collect");
    for (const x of info("lab", { patient: J.mr })?.samples ?? []) {  // every tube of the order (one per sample type)
      if (x.status === "Pending") await h.call("lab.sample_action", { name: x.name, action: "collect" }).catch(() => {});
      await h.call("lab.sample_action", { name: x.name, action: "receive" }).catch(() => {});
    }
    await h.go("/lab/samples", 2000);
    await h.say("Received in the lab: the test is on the worklist.", "Receive");
  }
}

export async function labResult(h, J) {
  await h.as("lab");
  await h.go("/tests", 2800);
  await h.say("Lab results: enter values; the normal range and the High / Low flag show beside each one.", "Lab · Results");
  const lab = info("lab", { patient: J.mr });
  for (const it of lab?.items ?? []) {
    const f = await h.get("lab.result_form", { invoice_item: it.name });
    const values = Object.fromEntries((f.parameters ?? []).map((x) => [x.parameter, x.normal_low != null && x.normal_high != null ? String(+((x.normal_low + x.normal_high) / 2).toFixed(1)) : (x.normal_text || "Negative")]));
    await h.call("lab.save_result", { invoice_item: it.name, values: JSON.stringify(values) });
  }
  await h.go("/tests", 2200);
  await h.say("Results entered and sent to the pathologist.", "Entered");
}

export async function labVerify(h, J) {
  await h.as("pathologist");
  await h.go("/lab/verify", 3000);
  const p = h.page;
  await h.say("Pathologist: results waiting, critical first, with the previous values.", "Pathologist · Verification");
  const card = p.locator("div.rounded-3xl", { hasText: J.p.name }).first();
  await ui("verify", async () => {
    await h.type(card.getByPlaceholder(/Interpretation/), "Within normal limits.", 400);
    await h.click(card.getByRole("button", { name: /Verify & sign/ }), 2500);
  }, async () => {
    const rows = await h.get("lab.verify_list");
    for (const r of rows.filter((x) => x.patient === J.mr)) await h.call("lab.verify", { result: r.name, interpretation: "Within normal limits." });
  });
  await h.say("Verified and signed. The report prints with the QR code and can be sent on WhatsApp.", "Report ready");
}

// ---------------------------------------------------------------- inpatient
export async function admit(h, J, { reason = "High grade fever, vomiting", diagnosis = "Enteric fever", advance = 20000 } = {}) {
  await h.as("reception");
  await h.go("/ward", 3000);
  await h.say("Wards & beds: the live bed map — free, occupied, cleaning and reserved beds by ward.", "Reception · Beds");
  await h.go("/ipd", 2800);
  const p = h.page;
  await h.say("Admissions: everyone in hospital. The doctor has decided to admit — Admit patient.", "Admissions");
  const bed = info("free_bed");
  await ui("admit dialog", async () => {
    await h.click(p.getByRole("button", { name: /Admit patient/ }), 1500);
    const dlg = h.dialog();
    await h.type(dlg.getByPlaceholder(/Search patient/), J.mr, 1200);
    await p.keyboard.press("Enter");
    await h.pause(1200);
    await dlg.locator("select").first().selectOption(bed.name);
    await dlg.locator("select").nth(1).selectOption(J.doctor);
    await h.pause(600);
    await h.type(dlg.getByPlaceholder("Chief complaint"), reason, 400);
    await h.fill(dlg.getByPlaceholder("0", { exact: true }).last(), String(advance), 400);
    await h.say("Bed, admitting doctor, reason, an estimate — and the advance.", "Admit");
    await h.click(dlg.getByRole("button", { name: /^Admit$/ }), 3500);
  }, async () => {
    await h.page.keyboard.press("Escape").catch(() => {});
    await h.call("ipd.admit", { data: { patient: J.mr, bed: bed.name, doctor: J.doctor, reason, diagnosis, planned_days: 3, advance, payment_mode: "Cash" } });
    await h.go("/ipd", 2200);
  });
  const a = info("admission", { patient: J.mr });
  J.adm = a?.name;
  await h.say(`Admitted ${J.adm} to bed ${bed?.bed_no}. The advance is in the reception shift; the family gets a bedside QR link.`, "Admitted");
}

export async function wardCare(h, J) {
  await h.as("nurse");
  await h.go(`/ipd/${J.adm}`, 3200);
  await h.say("The admission chart: vitals, notes, orders, medicines, labs, diet and the running bill on one page.", "Nurse · Chart");
  await h.call("ipd.add_vitals", { data: { bed_allotment: J.adm, bp_systolic: 124, bp_diastolic: 80, pulse: 92, temperature: 100.8, spo2: 97 } });
  await h.call("ipd.add_note", { data: { bed_allotment: J.adm, note_type: "Nursing", note: "IV line in place, fever managed with paracetamol. Comfortable." } });
  await h.go(`/ipd/${J.adm}`, 2500);
  await h.say("Vitals charted and a nursing note added.", "Charting");
  await h.as("doctor");
  const meds = await h.call("ipd.search_items", { q: "Panadol", stock_only: 1 }).catch(() => []);
  if (meds?.[0]) await h.call("ipd.order_medicine", { data: { bed_allotment: J.adm, patient: J.mr, item: meds[0].name, dose: "1", frequency: "TDS", days: 3, override_reason: "Demo" } }).catch((e) => console.warn("  · order medicine:", e.message.slice(0, 120)));
  await h.call("ipd.order_diet", { data: { bed_allotment: J.adm, diet_type: "Soft" } }).catch(() => {});
  await h.go(`/ipd/${J.adm}`, 2500);
  await h.say("Doctor's round: medicine ordered (it goes to the drug round) and a soft diet for the kitchen.", "Doctor · Orders");
  await h.as("nurse");
  await h.go("/ipd/mar", 3000);
  await h.say("Drug round: doses due by ward. The nurse charts each dose Administered, Held or Refused.", "Nurse · Drug round");
  await h.go("/ipd/kitchen", 2500);
  await h.say("Diet list: today's diets for the kitchen.", "Diet");
}

export async function discharge(h, J) {
  await h.as("doctor");
  await h.go(`/ipd/${J.adm}`, 3000);
  await h.say("Fever settled — the doctor writes the discharge summary on the admission.", "Doctor · Discharge");
  // due doses must be charted before the bill (clearance)
  await h.as("nurse");
  const due = await h.get("ipd.mar_board", { hours: 0 }).catch(() => ({ doses: [] }));
  for (const d of (due.doses ?? []).filter((x) => x.patient === J.mr)) await h.call("ipd.chart_dose", { name: d.name, status: "Administered" }).catch(() => {});
  await h.as("doctor");
  await h.call("ipd.sign_summary", { name: J.adm, data: { final_diagnosis: "Enteric fever", treatment_summary: "IV fluids, antipyretics and antibiotics; fever settled.",
    discharge_type: "Normal", condition_at_discharge: "Improved", follow_up_days: 7, medicines: [{ medicine: "Cefixime 400 mg", dose: "1", frequency: "BD", days: 7 }] } });
  await h.go(`/ipd/${J.adm}`, 2800);
  await h.scroll(700, 1500);
  await h.say("Summary signed: diagnosis, treatment, condition, medicines at home and follow-up.", "Summary signed");
  await h.as("reception");
  await h.go(`/ipd_slip?adm=${J.adm}`, 3000);
  await h.say("IPD bill: bed days by the midnight census, nursing, medicines, labs and the advance already paid.", "Reception · IPD bill");
  await ui("final bill", async () => {
    h.page.once("dialog", (d) => d.accept());
    await h.click(h.page.getByRole("button", { name: /Make final bill/ }), 3500);
  }, () => h.call("ipd.final_bill", { name: J.adm }));
  const bill = await h.get("ipd.bill", { name: J.adm });
  const b = bill.bill ?? bill;
  if ((b.balance ?? 0) > 0.5) await h.call("ipd.take_payment", { amount: Math.round(b.balance), payment_mode: "Cash", purpose: "Settlement", name: J.adm });
  else if ((b.credit ?? 0) > 0.5) await h.call("ipd.take_payment", { amount: Math.round(b.credit * 100) / 100, payment_mode: "Cash", purpose: "Refund", name: J.adm });
  await h.go(`/ipd_slip?adm=${J.adm}`, 2600);
  await h.say("Final bill made; the balance is settled (or the extra advance refunded).", "Settled");
  await h.call("ipd.complete_discharge", { name: J.adm });
  await h.go(`/ipd/${J.adm}`, 2600);
  await h.say("Discharged: the bed goes to cleaning, the bedside link stops and the summary prints.", "Discharged");
  await h.go("/ward", 2500);
  await h.say("Back on the bed map, the bed shows Cleaning until housekeeping marks it available.", "Bed to cleaning");
}

// ---------------------------------------------------------------- pharmacy
export async function pharmacySale(h, J) {
  bench("hospital_vvs.devtools.e2e.state", { what: "open_shift", user: "cashier@vvs.demo", counter: "Pharmacy 1" });
  await h.as("cashier");
  await h.go("/medicine_invoice", 3500);
  const p = h.page;
  await h.say("Pharmacy POS: shift, online status and shortcut keys across the top; medicines by category.", "Pharmacy cashier · POS");
  let loaded = false;
  if (J.mr) {
    await ui("load prescription", async () => {
      await p.keyboard.press("F4");
      await h.pause(1200);
      await h.type(p.getByPlaceholder(/Ali Khan · MR-/), J.mr, 2000);
      await h.say("F4 · Load prescription: search by patient, MR, mobile or Rx number.", "Prescription");
      await h.click(p.getByRole("dialog").getByText(/RX-\d/).first(), 2500);  // choosing the prescription loads it into the cart
      loaded = true;
    }, async () => { await p.keyboard.press("Escape").catch(() => {}); await h.pause(500); });
  }
  if (!loaded) {
    await ui("add medicine", async () => {
      await h.type(p.getByPlaceholder(/Scan barcode or search brand/), "Panadol", 1500);
      await h.click(p.locator("button:not([disabled])", { hasText: /Panadol/ }).first(), 1500);
    }, async () => { await p.keyboard.press("Escape").catch(() => {}); });
  }
  await h.say("Lines come with quantities; batches are picked first-expiry-first, and stock is checked.", "Cart");
  await ui("pay", async () => {
    const now = p.getByRole("button", { name: /^Pay now$/ }).first();
    if (await now.count()) await h.click(now, 800, false);
    await h.click(p.getByRole("button", { name: /^Pay\b/ }).last(), 1500);
    await h.click(p.getByRole("button", { name: /^Exact/ }).first(), 900);
    await h.say("Exact amount in cash — or split between cash, card and JazzCash with the transaction ID.", "Payment");
    await h.click(p.getByRole("button", { name: /Confirm/ }).first(), 3000);
  });
  await h.say("Paid: the receipt prints and the ticket goes to the pick → review → handover pipeline.", "Paid");
  await h.as("reviewer");
  await h.go("/pharmacy/tickets", 3000);
  await h.say("Pharmacy pipeline: every ticket and its stage — the finder picks, the pharmacist reviews, the dispenser hands over.", "Pipeline");
}

// ---------------------------------------------------------------- emergency
export async function emergency(h, J, { admitTo = true } = {}) {
  await h.as("nurse");
  await h.go("/er", 3000);
  await h.say("Emergency board: patients by triage colour and waiting time, the free ER bays on the side.", "Nurse · Emergency");
  const reg = { patient: J.mr, branch: "Lahore Main", chief_complaint: "High fever with rigors, vomiting since morning", arrival_mode: "Walk-in",
    triage_level: "Yellow", vitals: { bp_systolic: 100, bp_diastolic: 64, pulse: 118, spo2: 95 } };
  J.er = await h.call("er.register", { data: reg });
  await h.go("/er", 2500);
  await h.say("Registered and triaged Yellow with vitals. Unknown patients can be registered by gender and approximate age.", "Arrival & triage");
  await h.as("reception");
  await h.call("er.assign", { name: J.er, doctor: J.doctor }).catch(() => {});
  await h.as("doctor");
  await h.go("/er", 2500);
  await h.say("The doctor takes the patient: notes, medicines and urgent labs go on the ER visit.", "Doctor");
  if (admitTo) {
    const bed = info("free_bed");
    await h.as("reception");
    await h.call("er.dispose", { name: J.er, disposition: "Admitted", note: "Needs IV fluids and observation", admit: JSON.stringify({ bed: bed.name, doctor: J.doctor }) });
    J.adm = info("admission", { patient: J.mr })?.name;
    await h.go("/er", 2500);
    await h.say(`Disposition: admitted to bed ${bed.bed_no}. Every ER charge moves to the admission bill.`, "Admitted");
  } else {
    await h.call("er.dispose", { name: J.er, disposition: "Discharged Home", note: "Treated", payment_mode: "Cash" });
    await h.go("/er", 2500);
    await h.say("Disposition: discharged home — the ER bill is taken in the reception shift.", "Home");
  }
}

// ---------------------------------------------------------------- walk-in at the lab
export async function labWalkIn(h, J, tests = ["Complete Blood Count", "Lipid Profile"]) {
  await h.as("lab");
  await h.go("/lab/orders", 3000);
  await h.say("A walk-in patient comes straight to the lab with a doctor's slip.", "Lab · Walk-in");
  const r = await h.call("patients.register", { data: JSON.stringify({ patient_name: J.p.name, gender: J.p.gender, age: J.p.age, phone: J.p.phone, city: "Lahore",
    relation_type: "S/O", guardian_name: "Abdul " + J.p.name.split(" ").pop() }), duplicate_reason: "Help video" });
  J.mr = r.name;
  const tpl = await h.get("lab.templates", {});
  const names = (tpl?.rows ?? []).filter((t) => t.is_active !== 0 && !t.outsourced).map((t) => t.name);
  const pick = tests.filter((t) => names.includes(t));
  await h.call("lab.create_order", { data: JSON.stringify({ patient: J.mr, tests: pick.length ? pick : names.slice(0, 1), pay: 0 }) });
  await h.go("/lab/orders", 2600);
  await h.say(`Registered here (${J.mr}) and the tests ordered — Save & send to reception: the order shows Unpaid.`, "Order");
}
