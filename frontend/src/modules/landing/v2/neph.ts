/**
 * Nephrology & Dialysis — website copy in English and Urdu (D-99). Live facts (stations, sessions this month, nephrologists, shift times,
 * prices) come from the ERP (dialysis.public_facts); everything a non-developer may want to change lives here.
 * [confirm] = placeholder for LMC's nephrology team / accounts to check before go-live (numbers, prices, policies).
 */
import { useEffect, useState } from "react";
import { getCall } from "@/services/frappe";
import type { Lang } from "./content";

export interface NephFacts { stations: number; isolation: number; sessions_month: number; shifts: number; nephrologists: number; shift_times: Record<string, [string, string]>; prices: Record<string, number> }
let p: Promise<NephFacts> | null = null;
export function useNephFacts(): NephFacts | null {
  const [v, setV] = useState<NephFacts | null>(null);
  useEffect(() => { let on = true; (p ??= getCall<NephFacts>("hospital_vvs.api.dialysis.public_facts").catch((e) => { p = null; throw e; })).then((x) => on && setV(x)).catch(() => {}); return () => { on = false; }; }, []);
  return v;
}

/** Direct dialysis-unit line [confirm]; empty = the hospital landline. */
export const PHONE_DIALYSIS = "";
/** Dialyser policy shown on the page [confirm]. */
export const DIALYSER_POLICY: "single-use" | "reuse" = "single-use";
export const PD_OFFERED = false;          // peritoneal dialysis programme [confirm]
export const TRANSPLANT_OFFERED = true;   // pre-transplant work-up + post-transplant follow-up [confirm]

const en = {
  title: "Nephrology & Dialysis", metaDesc: "Kidney care and haemodialysis at Lyallpur Medical Complex, Faisalabad: CKD clinic, regular and emergency dialysis, isolation stations for hepatitis B and C, packages and Sehat Card.",
  pill: "Nephrology · Dialysis unit", h1a: "Kidney care that", h1b: "fits your life.",
  lead: "Consultant nephrologists, a modern haemodialysis unit with RO-treated water and separate hepatitis stations, and a fixed weekly schedule you can plan your life around.",
  book: "Book nephrologist", reserve: "Reserve a dialysis slot", call: "Dialysis unit",
  legend: ["Blood", "Dialysate · counter-current", "Toxins cleared"] as [string, string, string],
  stats: { stations: "Dialysis stations", sessions: "Sessions in 30 days", shifts: "Shifts a day", nephs: "Nephrologists", emergency: "Emergency dialysis" },
  servicesTitle: "Services", servicesSub: "From the first kidney test to long-term dialysis — one team, one record.",
  services: [
    ["clinic", "Nephrology OPD & CKD clinic", "CKD stages 1–5, kidney function trends, blood pressure and anaemia management, medicines adjusted for kidney function."],
    ["bp", "Hypertension & diabetes kidney care", "Protecting the kidneys of people with diabetes and high blood pressure — protein in urine, BP targets, medicines."],
    ["stone", "Kidney stones & UTI follow-up", "Recurrent stones and infections, metabolic work-up and prevention, with urology when needed."],
    ["aki", "Acute kidney injury & electrolytes", "Sudden kidney failure, high potassium, low sodium — in the ward, emergency and ICU."],
    ["hd", "Haemodialysis — regular & emergency", "Maintenance dialysis on fixed days and shifts; emergency dialysis 24/7; isolated ultrafiltration."],
    ["icu", "ICU bedside dialysis", "Portable machines for critically ill patients who cannot be moved."],
    ["access", "Vascular access", "Temporary and permanent (tunnelled) catheters placed by the nephrologist; AV fistula referral, care and surveillance."],
    ["biopsy", "Kidney biopsy & renal imaging", "Ultrasound-guided biopsy; renal ultrasound and Doppler in Radiology; renal function tests in the Lab."],
    ["tx", "Transplant work-up & follow-up", "Pre-transplant evaluation of recipient and donor, and long-term follow-up after a transplant."],
    ["diet", "Diet & fluid counselling", "Practical advice on salt, potassium, phosphate and fluid — in Urdu, with local food examples."],
    ["guest", "Guest / holiday dialysis", "Visiting Faisalabad? Book sessions in advance with your current unit's summary and viral screening."],
  ] as [string, string, string][],
  pdNote: "Peritoneal dialysis training & follow-up", pdOff: "Peritoneal dialysis: ask the nephrologist about referral.",
  featuresTitle: "The dialysis unit", featuresSub: "Built around safety, cleanliness and comfort for 4-hour sessions, two or three times a week.",
  features: [["machines", "Modern machines", "Volumetric UF control, online monitoring and alarms at every station."], ["water", "RO water plant", "Double-pass reverse osmosis; water tested every morning and cultured every month."],
    ["dialyser", "Single-use dialysers", "A new dialyser and blood lines for every session [confirm policy]."], ["iso", "Isolation stations", "Separate stations and machines for hepatitis B and hepatitis C patients."],
    ["staff", "Trained dialysis team", "Dialysis nurses and technicians under the nephrologist on duty."], ["comfort", "Comfort", "Reclining chairs, blankets, TV / Wi-Fi and seating for one attendant."]] as [string, string, string][],
  stepsTitle: "Your path to regular dialysis", stepsSub: "Most steps happen on your first visit; we guide you through each one.",
  steps: [["Nephrologist consultation", "Assessment, CKD stage and the decision to start dialysis."], ["Lab tests & viral screening", "RFTs, CBC, electrolytes and HBsAg, Anti-HCV, HIV."], ["Vascular access plan", "Catheter now, AV fistula for the long term."],
    ["Dialysis prescription", "Duration, dialyser, flows, dry weight and anticoagulation."], ["Schedule assigned", "Fixed days (e.g. Mon/Thu) and shift at a station in the right zone."], ["Pay at the Charges Counter", "Session, package or Sehat Card — slip with token and station."],
    ["Pre-dialysis check", "Weight, BP, temperature and access check."], ["Dialysis session", "About 4 hours with readings every 30–60 minutes."], ["Post-dialysis check", "Weight, BP and access haemostasis before you go home."],
    ["Monthly labs & review", "Adequacy (URR / Kt/V), Hb, iron, minerals — nephrologist review."], ["Ongoing care plan", "Medicines, diet and access care adjusted every month."]] as [string, string][],
  guideTitle: "Starting dialysis — a guide", guideSub: "Questions every new patient and family asks.",
  guide: [
    ["What dialysis is", ["Dialysis does part of the kidneys' work: it removes waste, extra salt and water from the blood through a filter (dialyser).", "Most patients need 2–3 sessions a week of about 4 hours each, for life or until a transplant."]],
    ["What to bring", ["Dialysis card / MR number, CNIC and your schedule card.", "Latest lab and viral screening reports; your medicines list.", "A light snack, warm clothes and one attendant."]],
    ["Fistula & catheter care", ["Fistula arm: no BP cuff, no blood tests, no tight sleeves or watches; feel the 'buzz' (thrill) every day.", "Catheter: keep the dressing dry and closed; never let anyone open it except the dialysis team."]],
    ["Fluid & diet basics", ["Weight gain between sessions should stay under about 2–2.5 kg: limit fluids (tea, water, soups) to about 1 litre a day plus your urine output.", "Avoid extra salt, achar, packaged snacks; limit potassium-rich foods (bananas, oranges, tomatoes, dried fruit) and phosphate (cola, processed cheese)."]],
    ["Medicines", ["Take blood pressure medicines as advised — some are held on dialysis mornings.", "EPO and iron are usually given during dialysis; phosphate binders with meals."]],
    ["Rescheduling", ["Need to change a session? Request it in My Dialysis or call the unit at least one day before.", "A missed session is dangerous — come for the next available slot."]],
  ] as [string, string[]][],
  warnTitle: "Warning signs — come to Emergency now", warn: ["Breathlessness or can't lie flat", "Swelling of face or legs getting worse quickly", "Chest pain or palpitations", "Fever or shivering (especially with a catheter)", "Bleeding from the fistula or catheter", "Very low urine or severe weakness"],
  callEmergency: "Call emergency",
  pkgTitle: "Packages & charges", pkgSub: "Prices in Pakistani rupees. Packages are valid for 45 days; the balance is printed on every counter slip.",
  pkg: { single: "Single session", emergency: "Emergency session", m8: "Monthly package — 8 sessions", m12: "Monthly package — 12 sessions", m13: "Monthly package — 13 sessions", cath: "Catheter placement", perSession: "per session", sessions: "sessions" },
  sehat: "Panel & Sehat Card", sehatText: "We accept corporate panels and Sehat Card. Bring the card and approval; sessions are recorded as credit and claimed by the hospital.",
  teamTitle: "Our nephrologists", teamSub: "Consultant nephrologists lead the clinic and the dialysis unit.",
  faqTitle: "Questions patients ask",
  faq: [["How long is a session?", "About 4 hours on the machine, plus 20–30 minutes for checks before and after."], ["How many sessions per week?", "Usually 2 or 3, as prescribed by your nephrologist after looking at your labs and weight gain."],
    ["Can I travel?", "Yes. Plan ahead: we can book guest dialysis here for visitors, and give you a transfer letter for another unit."], ["Is it painful?", "The fistula needles cause a short pinch; most patients relax, sleep or watch TV during dialysis."],
    ["Do you accept Sehat Card?", "Yes, for eligible patients. Bring the card; the counter records the session as Sehat Card credit."], ["What if I test positive for hepatitis?", "You will dialyse on a dedicated station and machine for your infection — never shared with negative patients."]] as [string, string][],
  locTitle: "Where to find us", locText: "Dialysis unit, 1st floor, Nephrology wing — lift from the main lobby. Pay at the Reception counter first.",
  ctaTitle: "Need dialysis in Faisalabad?", ctaText: "Reserve a slot online — the dialysis in-charge will call you to confirm days and shift.",
  // reserve form
  rTitle: "Reserve a dialysis slot", rSub: "Tell us about the patient. The dialysis in-charge reviews every request and calls you; you get an SMS / WhatsApp once approved.",
  rType: "Type of dialysis", rTypes: { New: "New to dialysis", Regular: "Regular patient (already on dialysis)", Guest: "Guest / holiday", Emergency: "Emergency", "Transfer in": "Transfer from another centre" } as Record<string, string>,
  rName: "Patient's full name", rAge: "Age", rGender: "Gender", rPhone: "Mobile number", rMr: "MR number (if any)", rCnic: "CNIC (optional)", rRef: "Referring doctor", rRefOut: "Outside doctor's name",
  rDays: "Preferred days", rShift: "Preferred shift", rAccess: "Current access", rHosp: "Current dialysis centre (for transfers)", rNotes: "Anything else we should know", rFile: "Latest viral screening report (HBsAg, Anti-HCV, HIV)",
  rFileHint: "PDF or photo, up to 5 MB — seen only by the dialysis team.", rConsent: "Send my confirmation and reminders by SMS / WhatsApp.", rSubmit: "Send request", rDone: "Request received", rDoneText: "Your reference is",
  rDoneNext: "The dialysis in-charge will call you, usually within one working day. For an emergency, come to Emergency now.", none: "Not yet / not sure",
  myDialysis: "My Dialysis — patient portal",
};
type Copy = typeof en;

const ur: Copy = {
  ...en,
  title: "امراضِ گردہ و ڈائیلاسز", pill: "نیفرالوجی · ڈائیلاسز یونٹ", h1a: "گردوں کی ایسی دیکھ بھال", h1b: "جو آپ کی زندگی کے ساتھ چلے۔",
  lead: "کنسلٹنٹ نیفرالوجسٹ، آر او پانی اور ہیپاٹائٹس کے الگ اسٹیشنوں والا جدید ہیموڈائیلاسز یونٹ، اور ایک مقررہ ہفتہ وار شیڈول جس کے مطابق آپ اپنی زندگی ترتیب دے سکیں۔",
  book: "نیفرالوجسٹ سے وقت لیں", reserve: "ڈائیلاسز سلاٹ بک کریں", call: "ڈائیلاسز یونٹ",
  legend: ["خون", "ڈائیلیسیٹ · مخالف سمت بہاؤ", "فاضل مادے صاف"],
  stats: { stations: "ڈائیلاسز اسٹیشن", sessions: "30 دن میں سیشن", shifts: "روزانہ شفٹیں", nephs: "نیفرالوجسٹ", emergency: "ایمرجنسی ڈائیلاسز" },
  servicesTitle: "خدمات", servicesSub: "گردے کے پہلے ٹیسٹ سے طویل مدتی ڈائیلاسز تک — ایک ٹیم، ایک ریکارڈ۔",
  services: [
    ["clinic", "نیفرالوجی او پی ڈی اور سی کے ڈی کلینک", "گردوں کی بیماری کے مراحل 1 تا 5، ٹیسٹوں کا رجحان، بلڈ پریشر اور خون کی کمی کا علاج۔"],
    ["bp", "بلڈ پریشر اور شوگر میں گردوں کی حفاظت", "شوگر اور بلڈ پریشر کے مریضوں کے گردوں کی حفاظت — پیشاب میں پروٹین، بی پی کے ہدف، ادویات۔"],
    ["stone", "گردے کی پتھری اور یو ٹی آئی فالو اپ", "بار بار پتھری اور انفیکشن، وجوہات کی جانچ اور بچاؤ۔"],
    ["aki", "اچانک گردوں کی ناکامی اور نمکیات", "اچانک گردے فیل ہونا، پوٹاشیم زیادہ، سوڈیم کم — وارڈ، ایمرجنسی اور آئی سی یو میں۔"],
    ["hd", "ہیموڈائیلاسز — باقاعدہ اور ایمرجنسی", "مقررہ دنوں اور شفٹ میں ڈائیلاسز؛ ایمرجنسی ڈائیلاسز 24/7؛ الٹرا فلٹریشن۔"],
    ["icu", "آئی سی یو میں بستر پر ڈائیلاسز", "شدید بیمار مریضوں کے لیے پورٹیبل مشینیں۔"],
    ["access", "ویسکولر رسائی", "عارضی اور مستقل کیتھیٹر؛ اے وی فسٹولا کے لیے ریفرل اور دیکھ بھال۔"],
    ["biopsy", "گردے کی بائیوپسی اور امیجنگ", "الٹراساؤنڈ کی مدد سے بائیوپسی؛ ریڈیالوجی میں الٹراساؤنڈ اور ڈوپلر؛ لیب میں گردوں کے ٹیسٹ۔"],
    ["tx", "ٹرانسپلانٹ سے پہلے اور بعد", "ٹرانسپلانٹ سے پہلے مریض اور ڈونر کی جانچ، اور بعد میں طویل فالو اپ۔"],
    ["diet", "خوراک اور پانی کی رہنمائی", "نمک، پوٹاشیم، فاسفیٹ اور پانی کے بارے میں عملی مشورہ — مقامی کھانوں کی مثالوں کے ساتھ۔"],
    ["guest", "مہمان / چھٹیوں میں ڈائیلاسز", "فیصل آباد آ رہے ہیں؟ اپنے یونٹ کی رپورٹ اور وائرل ٹیسٹ کے ساتھ پہلے سے سیشن بک کریں۔"],
  ],
  featuresTitle: "ڈائیلاسز یونٹ", featuresSub: "ہفتے میں دو تین بار، چار گھنٹے کے سیشن کے لیے حفاظت، صفائی اور آرام۔",
  features: [["machines", "جدید مشینیں", "ہر اسٹیشن پر یو ایف کنٹرول، مانیٹرنگ اور الارم۔"], ["water", "آر او واٹر پلانٹ", "ڈبل پاس ریورس اوسموسس؛ پانی کی روزانہ جانچ اور ماہانہ کلچر۔"],
    ["dialyser", "ایک بار استعمال والے ڈائیلائزر", "ہر سیشن کے لیے نیا ڈائیلائزر اور بلڈ لائنز۔"], ["iso", "علیحدہ اسٹیشن", "ہیپاٹائٹس بی اور سی کے مریضوں کے لیے الگ اسٹیشن اور مشینیں۔"],
    ["staff", "تربیت یافتہ ٹیم", "ڈیوٹی نیفرالوجسٹ کی نگرانی میں ڈائیلاسز نرسیں اور ٹیکنیشن۔"], ["comfort", "آرام", "آرام دہ کرسیاں، کمبل، ٹی وی / وائی فائی اور ایک تیماردار کی نشست۔"]],
  stepsTitle: "باقاعدہ ڈائیلاسز تک آپ کا سفر", stepsSub: "زیادہ تر مراحل پہلے دن ہی مکمل ہو جاتے ہیں؛ ہم ہر قدم پر رہنمائی کرتے ہیں۔",
  steps: [["نیفرالوجسٹ سے مشورہ", "معائنہ، بیماری کا مرحلہ اور ڈائیلاسز کا فیصلہ۔"], ["لیب ٹیسٹ اور وائرل اسکریننگ", "گردوں کے ٹیسٹ، سی بی سی اور ہیپاٹائٹس بی، سی، ایچ آئی وی۔"], ["رسائی کا منصوبہ", "ابھی کیتھیٹر، طویل مدت کے لیے فسٹولا۔"],
    ["ڈائیلاسز نسخہ", "دورانیہ، ڈائیلائزر، بہاؤ، خشک وزن اور ہیپرین۔"], ["شیڈول", "مقررہ دن (مثلاً پیر/جمعرات) اور شفٹ، درست زون کے اسٹیشن پر۔"], ["چارجز کاؤنٹر پر ادائیگی", "سیشن، پیکج یا صحت کارڈ — ٹوکن اور اسٹیشن کے ساتھ رسید۔"],
    ["ڈائیلاسز سے پہلے جانچ", "وزن، بلڈ پریشر، درجہ حرارت اور رسائی کی جانچ۔"], ["ڈائیلاسز سیشن", "تقریباً 4 گھنٹے، ہر 30–60 منٹ بعد ریڈنگ۔"], ["ڈائیلاسز کے بعد جانچ", "گھر جانے سے پہلے وزن، بی پی اور خون رکنے کی جانچ۔"],
    ["ماہانہ ٹیسٹ اور جائزہ", "یو آر آر / کے ٹی وی، ہیموگلوبن، آئرن، معدنیات — ڈاکٹر کا جائزہ۔"], ["مسلسل نگہداشت", "ہر ماہ ادویات، خوراک اور رسائی کی دیکھ بھال میں تبدیلی۔"]],
  guideTitle: "ڈائیلاسز کا آغاز — رہنمائی", guideSub: "وہ سوال جو ہر نیا مریض اور خاندان پوچھتا ہے۔",
  guide: [
    ["ڈائیلاسز کیا ہے", ["ڈائیلاسز گردوں کا کچھ کام کرتا ہے: فلٹر کے ذریعے خون سے فاضل مادے، زائد نمک اور پانی نکالتا ہے۔", "زیادہ تر مریضوں کو ہفتے میں 2–3 سیشن، ہر ایک تقریباً 4 گھنٹے کا، درکار ہوتا ہے۔"]],
    ["ساتھ کیا لائیں", ["ڈائیلاسز کارڈ / ایم آر نمبر، شناختی کارڈ اور شیڈول کارڈ۔", "تازہ لیب اور وائرل رپورٹس؛ ادویات کی فہرست۔", "ہلکا ناشتہ، گرم کپڑے اور ایک تیماردار۔"]],
    ["فسٹولا اور کیتھیٹر کی دیکھ بھال", ["فسٹولا والے بازو پر بی پی کف، خون کا ٹیسٹ، تنگ آستین یا گھڑی نہیں؛ روزانہ تھرتھراہٹ محسوس کریں۔", "کیتھیٹر: پٹی خشک اور بند رکھیں؛ ڈائیلاسز ٹیم کے سوا کوئی نہ کھولے۔"]],
    ["پانی اور خوراک", ["سیشنوں کے درمیان وزن تقریباً 2–2.5 کلو سے کم بڑھنا چاہیے: روزانہ تقریباً ایک لیٹر پانی (چائے، سوپ سمیت) اور پیشاب کے برابر۔", "زائد نمک، اچار، پیک شدہ اسنیکس سے پرہیز؛ کیلا، مالٹا، ٹماٹر، خشک میوہ اور کولا کم کریں۔"]],
    ["ادویات", ["بلڈ پریشر کی دوائیں ڈاکٹر کے مشورے کے مطابق — کچھ ڈائیلاسز والی صبح نہیں لی جاتیں۔", "ای پی او اور آئرن عموماً ڈائیلاسز کے دوران؛ فاسفیٹ کی دوا کھانے کے ساتھ۔"]],
    ["شیڈول میں تبدیلی", ["سیشن بدلنا ہو تو \"میرا ڈائیلاسز\" میں درخواست دیں یا ایک دن پہلے یونٹ کو کال کریں۔", "سیشن چھوڑنا خطرناک ہے — اگلی دستیاب سلاٹ پر ضرور آئیں۔"]],
  ],
  warnTitle: "خطرے کی علامات — فوراً ایمرجنسی آئیں", warn: ["سانس پھولنا یا لیٹ نہ سکنا", "چہرے یا ٹانگوں کی سوجن تیزی سے بڑھنا", "سینے میں درد یا دل کی دھڑکن تیز", "بخار یا کپکپی (خاص طور پر کیتھیٹر کے ساتھ)", "فسٹولا یا کیتھیٹر سے خون بہنا", "پیشاب بہت کم یا شدید کمزوری"],
  callEmergency: "ایمرجنسی کال کریں",
  pkgTitle: "پیکج اور چارجز", pkgSub: "قیمتیں پاکستانی روپے میں۔ پیکج 45 دن کے لیے؛ باقی سیشن ہر رسید پر درج ہوتے ہیں۔",
  pkg: { single: "ایک سیشن", emergency: "ایمرجنسی سیشن", m8: "ماہانہ پیکج — 8 سیشن", m12: "ماہانہ پیکج — 12 سیشن", m13: "ماہانہ پیکج — 13 سیشن", cath: "کیتھیٹر لگانا", perSession: "فی سیشن", sessions: "سیشن" },
  sehat: "پینل اور صحت کارڈ", sehatText: "ہم کارپوریٹ پینل اور صحت کارڈ قبول کرتے ہیں۔ کارڈ اور منظوری ساتھ لائیں؛ سیشن ادھار میں درج ہوتا ہے۔",
  teamTitle: "ہمارے نیفرالوجسٹ", teamSub: "کنسلٹنٹ نیفرالوجسٹ کلینک اور ڈائیلاسز یونٹ کی سربراہی کرتے ہیں۔",
  faqTitle: "مریضوں کے سوالات",
  faq: [["سیشن کتنا لمبا ہوتا ہے؟", "مشین پر تقریباً 4 گھنٹے، اور پہلے اور بعد کی جانچ کے لیے 20–30 منٹ۔"], ["ہفتے میں کتنے سیشن؟", "عموماً 2 یا 3، نیفرالوجسٹ کے تجویز کردہ۔"],
    ["کیا میں سفر کر سکتا ہوں؟", "جی ہاں۔ پہلے سے منصوبہ بنائیں؛ ہم دوسرے یونٹ کے لیے منتقلی خط دیتے ہیں۔"], ["کیا اس میں درد ہوتا ہے؟", "فسٹولا کی سوئی سے ہلکی چبھن؛ زیادہ تر مریض آرام کرتے یا ٹی وی دیکھتے ہیں۔"],
    ["کیا صحت کارڈ قبول ہے؟", "جی ہاں، اہل مریضوں کے لیے۔ کارڈ ساتھ لائیں۔"], ["اگر ہیپاٹائٹس مثبت ہو؟", "آپ کا ڈائیلاسز الگ اسٹیشن اور مشین پر ہوگا — منفی مریضوں کے ساتھ کبھی نہیں۔"]],
  locTitle: "ہم کہاں ہیں", locText: "ڈائیلاسز یونٹ، پہلی منزل، نیفرالوجی ونگ — مرکزی لابی سے لفٹ۔ پہلے ریسیپشن کاؤنٹر پر ادائیگی کریں۔",
  ctaTitle: "فیصل آباد میں ڈائیلاسز چاہیے؟", ctaText: "آن لائن سلاٹ بک کریں — ڈائیلاسز انچارج دن اور شفٹ کی تصدیق کے لیے کال کریں گے۔",
  rTitle: "ڈائیلاسز سلاٹ بک کریں", rSub: "مریض کے بارے میں بتائیں۔ ڈائیلاسز انچارج ہر درخواست دیکھ کر کال کرتے ہیں؛ منظوری پر ایس ایم ایس / واٹس ایپ آتا ہے۔",
  rType: "ڈائیلاسز کی قسم", rTypes: { New: "ڈائیلاسز پہلی بار", Regular: "باقاعدہ مریض", Guest: "مہمان / چھٹیاں", Emergency: "ایمرجنسی", "Transfer in": "دوسرے سینٹر سے منتقلی" },
  rName: "مریض کا پورا نام", rAge: "عمر", rGender: "جنس", rPhone: "موبائل نمبر", rMr: "ایم آر نمبر (اگر ہو)", rCnic: "شناختی کارڈ (اختیاری)", rRef: "ریفر کرنے والے ڈاکٹر", rRefOut: "باہر کے ڈاکٹر کا نام",
  rDays: "پسندیدہ دن", rShift: "پسندیدہ شفٹ", rAccess: "موجودہ رسائی", rHosp: "موجودہ ڈائیلاسز سینٹر", rNotes: "کوئی اور بات", rFile: "تازہ وائرل اسکریننگ رپورٹ (ہیپاٹائٹس بی، سی، ایچ آئی وی)",
  rFileHint: "پی ڈی ایف یا تصویر، 5 ایم بی تک — صرف ڈائیلاسز ٹیم دیکھے گی۔", rConsent: "تصدیق اور یاد دہانی ایس ایم ایس / واٹس ایپ پر بھیجیں۔", rSubmit: "درخواست بھیجیں", rDone: "درخواست موصول ہو گئی", rDoneText: "آپ کا حوالہ نمبر",
  rDoneNext: "ڈائیلاسز انچارج عموماً ایک کاروباری دن میں کال کریں گے۔ ایمرجنسی میں ابھی ایمرجنسی آئیں۔", none: "ابھی نہیں / معلوم نہیں",
  myDialysis: "میرا ڈائیلاسز — مریض پورٹل",
};

export const NEPH: Record<Lang, Copy> = { en, ur };
