import { esc, money, qrSvg } from "@/lib/print";
import type { Bill } from "./shared";

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Gulzar&display=swap" rel="stylesheet">`;
const A4 = `@page{size:A4;margin:12mm}body{font:11.5px/1.45 Inter,Arial,sans-serif;color:#0f172a;margin:0}
  h1{font-size:18px;margin:0}h2{font-size:13px;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#0f766e}
  table{width:100%;border-collapse:collapse}th,td{padding:5px 6px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
  th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.05em}.n{text-align:right;font-variant-numeric:tabular-nums}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f766e;padding-bottom:8px;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px 14px}.k{font-size:9.5px;color:#64748b;text-transform:uppercase}.v{font-weight:600}
  .tot td{font-weight:700}.big td{font-size:14px;font-weight:800;border-top:2px solid #0f172a}.muted{color:#64748b}.stamp{display:inline-block;border:2px solid #0f766e;
  color:#0f766e;padding:2px 10px;border-radius:6px;font-weight:800;letter-spacing:.1em}.sig{margin-top:40px;display:flex;justify-content:space-between}
  .sig div{border-top:1px solid #0f172a;width:45%;padding-top:4px;text-align:center;font-size:10px}`;

function header(clinic: Bill["clinic"], title: string, right: string) {
  return `<div class="head"><div>${clinic.logo ? `<img src="${esc(clinic.logo)}" style="height:38px;margin-bottom:4px"/>` : ""}<h1>${esc(clinic.name)}</h1>
  <div class="muted">${esc(clinic.address || "")}${clinic.phone ? ` · ${esc(clinic.phone)}` : ""}</div></div>
  <div style="text-align:right"><div class="stamp">${esc(title)}</div><div class="muted" style="margin-top:4px">${right}</div></div></div>`;
}

/** Running / interim / final bill on A4, grouped by charge type with package cover and payer split. */
export function billHtml(b: Bill, kind: "Interim bill" | "Final bill" | "Advance request", advanceAsk = 0) {
  const a = b.admission;
  const groups: Record<string, typeof b.lines> = {};
  b.lines.forEach((l) => { (groups[l.charge_type] ||= []).push(l); });
  const rows = Object.entries(groups).map(([t, ls]) => `<tr><td colspan="5" style="background:#f8fafc;font-weight:700">${esc(t)}</td></tr>` + ls.map((l) =>
    `<tr><td>${esc(l.description)}</td><td class="n">${l.qty}</td><td class="n">${money(l.rate)}</td><td class="n">${l.covered_amount ? `−${money(l.covered_amount)}` : ""}</td>
    <td class="n">${money(l.amount - l.covered_amount)}</td></tr>`).join("")).join("");
  const info = [["Patient", `${esc(b.patient?.patient_name)}<br><span class="muted">${esc(b.patient?.name)}</span>`], ["Admission", esc(a?.name)],
    ["Admitted", esc(a?.admit_datetime?.slice(0, 16))], [a?.release_datetime ? "Released" : "As of", esc((a?.release_datetime || b.until)?.slice(0, 16))],
    ["Ward / bed", `${esc(a?.ward)} · ${esc(b.bed_no)}`], ["Doctor", esc(a?.doctor_name)], ["Billing", `${esc(a?.payer_type)}${a?.payer ? ` · ${esc(a.payer)}` : ""}`],
    ["Days", String(b.days ?? "")]].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  const totals = [["Gross", money(b.gross)], b.package_covered ? ["Package cover", `−${money(b.package_covered)}`] : null, b.discount ? ["Discount", `−${money(b.discount)}`] : null,
    b.payer_share ? [`${a?.payer_type} share (${b.coverage_percent ?? ""}%)`, `−${money(b.payer_share)}`] : null, ["Patient share", money(b.patient_share)],
    b.advances ? ["Advances", `−${money(b.advances)}`] : null, b.settled ? ["Paid", `−${money(b.settled)}`] : null, b.refunded ? ["Refunded", money(b.refunded)] : null]
    .filter(Boolean).map((r) => `<tr class="tot"><td colspan="4" class="n">${r![0]}</td><td class="n">${r![1]}</td></tr>`).join("");
  const due = kind === "Advance request" ? `<tr class="big"><td colspan="4" class="n">ADVANCE REQUESTED</td><td class="n">${money(advanceAsk)}</td></tr>`
    : `<tr class="big"><td colspan="4" class="n">${b.credit ? "REFUND DUE TO PATIENT" : "BALANCE DUE"}</td><td class="n">${money(b.credit || b.balance)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${A4}</style></head><body>
  ${header(b.clinic, kind.toUpperCase(), `${new Date().toLocaleString()}${b.final_invoice ? `<br>Invoice ${esc(b.final_invoice)}` : ""}`)}
  <div class="grid">${info}</div>
  ${kind === "Advance request" ? `<h2>Advance request</h2><p>The running bill for this stay stands at <b>${money(b.patient_share)}</b> with <b>${money(b.advances)}</b>
    received. Please deposit <b>${money(advanceAsk)}</b> at the admission desk.</p>` : ""}
  <h2>Charges</h2><table><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Covered</th><th class="n">Amount</th></tr></thead>
  <tbody>${rows}${totals}${due}</tbody></table>
  ${b.payments.length ? `<h2>Payments</h2><table><thead><tr><th>Date</th><th>Receipt</th><th>Type</th><th>Mode</th><th class="n">Amount</th></tr></thead><tbody>
  ${b.payments.map((p) => `<tr><td>${esc(p.posting_date)}</td><td>${esc(p.name)}</td><td>${esc(p.hv_purpose || p.payment_type)}</td><td>${esc(p.mode_of_payment)}</td>
  <td class="n">${p.payment_type === "Pay" ? "−" : ""}${money(p.paid_amount)}</td></tr>`).join("")}</tbody></table>` : ""}
  ${kind === "Interim bill" ? `<p class="muted" style="margin-top:10px">Interim bill: bed days and nursing are counted to the time printed. The final bill is made at discharge.</p>` : ""}
  <div class="sig"><div>Billing officer</div><div>Patient / attendant</div></div></body></html>`;
}

export interface SummaryPrint {
  summary: { name: string; discharge_type: string; final_diagnosis: string; treatment_summary?: string; procedures_done?: string; condition_at_discharge?: string;
    follow_up_plan?: string; follow_up_date?: string; referred_to?: string; death_datetime?: string; cause_of_death?: string; signed_at?: string;
    medicines: { item?: string; medicine?: string; dose?: string; frequency?: string; days?: number; instructions?: string }[] };
  doctor: { doctor_name: string; qualification?: string; registration_no?: string; specialization?: string };
  patient: { name: string; patient_name: string; gender: string; age?: number; phone?: string; guardian_name?: string; relation_type?: string };
  clinic: Bill["clinic"]; admission: { name: string; admit_datetime: string; release_datetime?: string; ward: string; bed_no?: string; days: number };
  procedures: { procedure_type: string; completed_at?: string }[];
}

export function summaryHtml(d: SummaryPrint) {
  const s = d.summary;
  const info = [["Patient", esc(d.patient.patient_name)], ["MR No.", esc(d.patient.name)], ["Age / sex", `${d.patient.age ?? ""} / ${esc(d.patient.gender)}`],
    ["Guardian", `${esc(d.patient.relation_type || "")} ${esc(d.patient.guardian_name || "")}`], ["Admitted", esc(d.admission.admit_datetime?.slice(0, 16))],
    ["Discharged", esc(d.admission.release_datetime?.slice(0, 16) || "")], ["Ward / bed", `${esc(d.admission.ward)} · ${esc(d.admission.bed_no)}`],
    ["Discharge", esc(s.discharge_type)]].map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  const block = (t: string, v?: string) => (v ? `<h2>${t}</h2><div style="white-space:pre-wrap">${esc(v)}</div>` : "");
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${A4}</style></head><body>
  ${header(d.clinic, s.discharge_type === "Expired" ? "DEATH SUMMARY" : "DISCHARGE SUMMARY", `${esc(s.name)}<br>${esc(d.admission.name)}`)}
  <div class="grid">${info}</div>
  ${block("Final diagnosis", s.final_diagnosis)}${block("Treatment given", s.treatment_summary)}
  ${d.procedures.length || s.procedures_done ? `<h2>Procedures</h2>${d.procedures.map((p) => `<div>• ${esc(p.procedure_type)} <span class="muted">${esc(p.completed_at?.slice(0, 10) || "")}</span></div>`).join("")}
    ${s.procedures_done ? `<div>${esc(s.procedures_done)}</div>` : ""}` : ""}
  ${s.condition_at_discharge ? `<h2>Condition at discharge</h2><div>${esc(s.condition_at_discharge)}</div>` : ""}
  ${s.medicines?.length ? `<h2>Medicines to take at home</h2><table><thead><tr><th>Medicine</th><th>Dose</th><th>How often</th><th class="n">Days</th><th>Instructions</th></tr></thead>
  <tbody>${s.medicines.map((m) => `<tr><td>${esc(m.medicine || m.item)}</td><td>${esc(m.dose)}</td><td>${esc(m.frequency)}</td><td class="n">${m.days ?? ""}</td><td>${esc(m.instructions)}</td></tr>`).join("")}</tbody></table>` : ""}
  ${block("Follow-up", [s.follow_up_plan, s.follow_up_date ? `Next visit: ${s.follow_up_date}` : ""].filter(Boolean).join("\n"))}
  ${s.referred_to ? block("Referred to", s.referred_to) : ""}
  ${s.discharge_type === "Expired" ? block("Death", `Date and time: ${s.death_datetime || ""}\nCause: ${s.cause_of_death || ""}`) : ""}
  <div class="sig"><div>${esc(d.doctor.doctor_name)}${d.doctor.qualification ? ` · ${esc(d.doctor.qualification)}` : ""}${d.doctor.registration_no ? `<br>PMDC ${esc(d.doctor.registration_no)}` : ""}
  <br>Signed ${esc(s.signed_at?.slice(0, 16) || "")}</div><div>Received by patient / attendant</div></div></body></html>`;
}

/** Admission wristband (25 × 250 mm strip) — name, MR, admission, ward, allergies, QR of the MR number only. */
export function wristbandHtml(p: { name: string; patient_name: string; gender?: string; age?: number; admission: string; ward: string; bed_no?: string;
  doctor?: string; allergies?: string[]; blood_group?: string }) {
  const allergy = p.allergies?.length ? `<b style="color:#b91c1c">ALLERGY: ${esc(p.allergies.join(", "))}</b>` : "No known allergy";
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:250mm 25mm;margin:0}body{margin:0;font-family:Arial,sans-serif}
  .w{width:250mm;height:25mm;box-sizing:border-box;padding:2mm 4mm 2mm 30mm;display:flex;gap:4mm;align-items:center;${p.allergies?.length ? "border-left:8mm solid #dc2626" : "border-left:8mm solid #0f766e"}}
  .t{font-size:8pt;line-height:1.25}.b{font-size:11pt;font-weight:700}</style></head><body><div class="w">${qrSvg(p.name, 0.6)}
  <div class="t"><div class="b">${esc(p.patient_name)}</div><div>${esc(p.name)} · ${esc(p.gender || "")} ${p.age ?? ""}y${p.blood_group ? ` · ${esc(p.blood_group)}` : ""}</div>
  <div>${esc(p.admission)} · ${esc(p.ward)} ${esc(p.bed_no || "")}</div><div>${esc(p.doctor || "")}</div><div>${allergy}</div></div></div></body></html>`;
}
