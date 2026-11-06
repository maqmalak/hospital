import { esc, money, qrSvg } from "./print";

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Noto+Nastaliq+Urdu:wght@400;600&display=swap" rel="stylesheet">`;
const URDU = `font-family:'Noto Nastaliq Urdu',serif;direction:rtl`;

export interface SlipPrint {
  name: string; token_no: number; posting_date: string; posting_time: string; patient: string; patient_name: string; purpose: string;
  doctor: { doctor_name: string; doctor_name_ur?: string; specialization?: string; consultation_room?: string };
  items: { item_name: string; qty: number; rate: number; amount: number }[]; gross_total: number; discount_amount: number; net_total: number;
  payer_type: string; payer_share: number; patient_share: number; payment_mode: string; cash_tendered?: number; change_amount?: number;
  is_free_follow_up: number; invoice?: { name: string } | null; cashier: string;
  clinic: { name: string; name_ur?: string; address?: string; phone?: string };
}

/** 80 mm OPD slip: big token, doctor & room, bill, QR (MR no.) for scanning at the next counter. */
export function opdSlipHtml(s: SlipPrint) {
  const row = (k: string, v: string, b = false) => `<div class="r${b ? " b" : ""}"><span>${k}</span><span>${v}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>@page{size:80mm auto;margin:3mm}body{font:12px/1.35 Inter,sans-serif;width:74mm;margin:0;color:#000}
  .c{text-align:center}.r{display:flex;justify-content:space-between}.b{font-weight:800}.hr{border-top:1px dashed #000;margin:2mm 0}.xs{font-size:10px}
  .tok{font-size:44px;font-weight:800;line-height:1;margin:1mm 0}.ur{${URDU};font-size:13px}</style></head><body>
  <div class="c b" style="font-size:15px">${esc(s.clinic.name)}</div>${s.clinic.name_ur ? `<div class="c ur">${esc(s.clinic.name_ur)}</div>` : ""}
  <div class="c xs">${esc(s.clinic.address || "")}${s.clinic.phone ? ` · ${esc(s.clinic.phone)}` : ""}</div><div class="hr"></div>
  <div class="c xs">OPD ${esc(s.purpose).toUpperCase()} · TOKEN</div><div class="c tok">${s.token_no}</div>
  <div class="c b">${esc(s.doctor.doctor_name)}</div>${s.doctor.doctor_name_ur ? `<div class="c ur">${esc(s.doctor.doctor_name_ur)}</div>` : ""}
  <div class="c xs">${esc(s.doctor.specialization || "")}${s.doctor.consultation_room ? ` · Room ${esc(s.doctor.consultation_room)}` : ""}</div>
  <div class="hr"></div>${row("MR No.", `<b>${esc(s.patient)}</b>`)}${row("Patient", esc(s.patient_name))}${row("Date", `${esc(s.posting_date)} ${esc(s.posting_time)}`)}${row("Slip", esc(s.name))}
  <div class="hr"></div>${s.items.map((i) => row(`${i.qty} × ${esc(i.item_name)}`, money(i.amount))).join("")}
  ${s.discount_amount ? row("Discount", `−${money(s.discount_amount)}`) : ""}${s.payer_share ? row(`${esc(s.payer_type)} share`, `−${money(s.payer_share)}`) : ""}
  <div class="hr"></div>${row("PAID", money(s.patient_share), true)}${row(esc(s.payment_mode), s.cash_tendered ? `${money(s.cash_tendered)} · change ${money(s.change_amount)}` : "")}
  ${s.is_free_follow_up ? `<div class="c b">FREE FOLLOW-UP</div>` : ""}${s.invoice ? `<div class="c xs">Invoice ${esc(s.invoice.name)}</div>` : ""}
  <div class="c" style="margin-top:2mm">${qrSvg(s.patient, 0.7)}</div><div class="c xs">Cashier: ${esc(s.cashier)}</div>
  <div class="c xs" style="margin-top:1mm">Please keep this slip and wait for your token.</div></body></html>`;
}

export interface CardData { name: string; patient_name: string; patient_name_ur?: string; gender: string; age?: number; phone?: string; photo?: string;
  blood_group?: string; guardian?: string; registered: string }

/** Patient card: CR80 (85.6 × 54 mm) or 80 mm slip. The QR holds only the MR number. */
export function patientCardHtml(p: CardData, clinic: { name: string; name_ur?: string; phone?: string }, format = "CR80 Card") {
  const cr80 = format.startsWith("CR80");
  const size = cr80 ? "85.6mm 54mm" : "80mm auto";
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>@page{size:${size};margin:0}body{margin:0;font:11px/1.3 Inter,sans-serif;color:#0f172a}
  .card{box-sizing:border-box;width:${cr80 ? "85.6mm" : "74mm"};${cr80 ? "height:54mm;" : ""}padding:3mm;border-radius:3mm;background:linear-gradient(135deg,#ecfeff,#f0fdf4);border:0.3mm solid #0f766e;position:relative;overflow:hidden;margin:${cr80 ? 0 : "3mm"}}
  .band{position:absolute;inset:0 0 auto 0;height:9mm;background:linear-gradient(90deg,#0f766e,#10b981);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 3mm;font-weight:800;font-size:11px}
  .body{display:flex;gap:2.5mm;margin-top:8mm}.ph{width:16mm;height:19mm;border-radius:2mm;background:#cbd5e1;object-fit:cover}.mr{font-size:14px;font-weight:800;letter-spacing:.5px;color:#0f766e}
  .nm{font-size:12px;font-weight:800}.ur{${URDU};font-size:12px}.xs{font-size:9px;color:#334155}.qr{margin-inline-start:auto}</style></head><body>
  <div class="card"><div class="band"><span>${esc(clinic.name)}</span><span>PATIENT CARD</span></div>
  <div class="body">${p.photo ? `<img class="ph" src="${esc(p.photo)}">` : `<div class="ph"></div>`}
  <div><div class="mr">${esc(p.name)}</div><div class="nm">${esc(p.patient_name)}</div>${p.patient_name_ur ? `<div class="ur">${esc(p.patient_name_ur)}</div>` : ""}
  <div class="xs">${esc(p.guardian || "")}</div><div class="xs">${esc(p.gender)}${p.age != null ? ` · ${p.age} y` : ""}${p.blood_group ? ` · ${esc(p.blood_group)}` : ""}</div>
  <div class="xs">${esc(p.phone || "")} · since ${esc(p.registered)}</div></div><div class="qr">${qrSvg(p.name, 0.62)}</div></div>
  <div class="xs" style="position:absolute;bottom:2mm;left:3mm">Show this card at every visit${clinic.phone ? ` · ${esc(clinic.phone)}` : ""}</div></div></body></html>`;
}

export interface RxPrint {
  rx: { name: string; prescription_date: string; medicines: { item_name: string; generic?: string; dose?: string; frequency?: string; route?: string; duration?: string; qty?: number; instructions?: string; no_substitution?: number }[];
    diagnoses: { diagnosis: string; diagnosis_name: string }[]; lab_tests: { test_name: string; urgent?: number }[]; examination_notes?: string; advice?: string;
    follow_up_date?: string; signed_at?: string; docstatus: number; amendment_reason?: string };
  patient: { patient_name: string; patient_name_ur?: string; gender: string; age?: number; phone?: string; relation_type?: string; guardian_name?: string };
  doctor: { doctor_name: string; doctor_name_ur?: string; qualification?: string; registration_no?: string; show_license?: number; signature?: string; specialization?: string };
  vitals?: { bp_systolic?: number; bp_diastolic?: number; pulse?: number; temperature?: number; spo2?: number; weight?: number; rbs?: number; chief_complaint?: string } | null;
  clinic: { name: string; name_ur?: string; address?: string; phone?: string; logo?: string }; amended: boolean; version: number; mr: string;
}

/** A4 / A5 prescription with letterhead, vitals, ℞ table, signature; "Amended — version N" when amended. */
export function prescriptionHtml(d: RxPrint, size = "A4") {
  const v = d.vitals;
  const vit = v ? [v.bp_systolic ? `BP ${v.bp_systolic}/${v.bp_diastolic}` : "", v.pulse ? `Pulse ${v.pulse}` : "", v.temperature ? `Temp ${v.temperature}°F` : "",
    v.spo2 ? `SpO₂ ${v.spo2}%` : "", v.weight ? `Wt ${v.weight} kg` : "", v.rbs ? `RBS ${v.rbs}` : ""].filter(Boolean).join(" · ") : "";
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>@page{size:${size};margin:12mm}body{font:12px/1.45 Inter,sans-serif;color:#0f172a;margin:0}
  .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f766e;padding-bottom:3mm}.cl{font-size:20px;font-weight:800;color:#0f766e}
  .ur{${URDU}}.dr{text-align:end}.dr b{font-size:14px}.muted{color:#475569;font-size:11px}.pt{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;background:#f0fdfa;border-radius:2mm;padding:3mm;margin:4mm 0}
  .pt div span{display:block;font-size:10px;color:#64748b}.rx{font-size:30px;font-weight:800;color:#0f766e;font-family:serif}table{width:100%;border-collapse:collapse}td,th{padding:2mm;border-bottom:1px solid #e2e8f0;text-align:start;vertical-align:top}
  th{font-size:10px;text-transform:uppercase;color:#64748b}.grid{display:grid;grid-template-columns:1fr 2fr;gap:6mm}.box h4{margin:0 0 1mm;font-size:11px;color:#0f766e;text-transform:uppercase}
  .sig{margin-top:14mm;display:flex;justify-content:flex-end;text-align:center}.sig img{height:14mm}.amend{border:2px solid #b91c1c;color:#b91c1c;font-weight:800;padding:1mm 3mm;border-radius:2mm;display:inline-block}
  .foot{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #cbd5e1;padding-top:2mm;font-size:10px;color:#64748b;display:flex;justify-content:space-between}</style></head><body>
  <div class="head"><div><div class="cl">${esc(d.clinic.name)}</div>${d.clinic.name_ur ? `<div class="ur" style="font-size:15px">${esc(d.clinic.name_ur)}</div>` : ""}<div class="muted">${esc(d.clinic.address || "")} ${d.clinic.phone ? "· " + esc(d.clinic.phone) : ""}</div></div>
  <div class="dr"><b>${esc(d.doctor.doctor_name)}</b>${d.doctor.doctor_name_ur ? `<div class="ur">${esc(d.doctor.doctor_name_ur)}</div>` : ""}<div class="muted">${esc(d.doctor.qualification || "")} · ${esc(d.doctor.specialization || "")}</div>
  ${d.doctor.show_license && d.doctor.registration_no ? `<div class="muted">Reg. ${esc(d.doctor.registration_no)}</div>` : ""}</div></div>
  ${d.amended ? `<div style="margin-top:3mm"><span class="amend">AMENDED — VERSION ${d.version}</span> <span class="muted">${esc(d.rx.amendment_reason || "")}</span></div>` : ""}
  <div class="pt"><div><span>Patient</span><b>${esc(d.patient.patient_name)}</b>${d.patient.patient_name_ur ? `<div class="ur">${esc(d.patient.patient_name_ur)}</div>` : ""}</div>
  <div><span>MR No.</span><b>${esc(d.mr)}</b></div><div><span>Age / Gender</span>${d.patient.age ?? "-"} y · ${esc(d.patient.gender)}</div><div><span>Date · Rx No.</span>${esc(d.rx.prescription_date)} · ${esc(d.rx.name)}</div></div>
  ${vit ? `<div class="muted" style="margin-bottom:3mm"><b>Vitals:</b> ${vit}${v?.chief_complaint ? ` &nbsp; <b>Complaint:</b> ${esc(v.chief_complaint)}` : ""}</div>` : ""}
  <div class="grid"><div>${d.rx.diagnoses.length ? `<div class="box"><h4>Diagnosis</h4>${d.rx.diagnoses.map((x) => `<div>${esc(x.diagnosis_name)} <span class="muted">(${esc(x.diagnosis)})</span></div>`).join("")}</div><br>` : ""}
  ${d.rx.examination_notes ? `<div class="box"><h4>Examination</h4><div>${esc(d.rx.examination_notes)}</div></div><br>` : ""}
  ${d.rx.lab_tests.length ? `<div class="box"><h4>Investigations</h4>${d.rx.lab_tests.map((l) => `<div>• ${esc(l.test_name)}${l.urgent ? " <b>(urgent)</b>" : ""}</div>`).join("")}</div>` : ""}</div>
  <div><div class="rx">℞</div><table><tr><th>#</th><th>Medicine</th><th>Dose · Frequency</th><th>Duration</th><th>Qty</th></tr>
  ${d.rx.medicines.map((m, i) => `<tr><td>${i + 1}</td><td><b>${esc(m.item_name)}</b>${m.generic ? `<div class="muted">${esc(m.generic)}</div>` : ""}${m.instructions ? `<div class="muted">${esc(m.instructions)}</div>` : ""}${m.no_substitution ? `<div class="muted"><b>No substitution</b></div>` : ""}</td>
  <td>${esc(m.dose || "")} · ${esc(m.frequency || "")}<div class="muted">${esc(m.route || "")}</div></td><td>${esc(m.duration || "")}</td><td>${m.qty ?? ""}</td></tr>`).join("")}</table>
  ${d.rx.advice ? `<div class="box" style="margin-top:4mm"><h4>Advice</h4><div>${esc(d.rx.advice)}</div></div>` : ""}
  ${d.rx.follow_up_date ? `<div style="margin-top:3mm"><b>Follow-up:</b> ${esc(d.rx.follow_up_date)}</div>` : ""}</div></div>
  <div class="sig"><div>${d.doctor.signature ? `<img src="${esc(d.doctor.signature)}"><br>` : "<br><br>"}<b>${esc(d.doctor.doctor_name)}</b><div class="muted">${d.rx.docstatus === 1 ? `Signed ${esc(d.rx.signed_at || "")}` : "DRAFT — not signed"}</div></div></div>
  <div class="foot"><span>${esc(d.clinic.name)} · ${esc(d.mr)}</span><span>${qrSvg(d.mr, 0.4)}</span></div></body></html>`;
}
