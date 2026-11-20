/**
 * MRI & CT Scan page — website copy in English and Urdu (D-98). Live catalogue, prices, radiologists and hours come from the ERP
 * (radiology.catalogue); everything else a non-developer may want to change lives here.
 * [confirm] = placeholder to be checked by LMC radiology before go-live (equipment models, field strength, slice count, numbers).
 */
import type { Lang } from "./content";

/** Equipment shown on the page [confirm] — replace with the installed models. */
export const EQUIPMENT = {
  mri: { name: "1.5 Tesla MRI scanner [confirm]", bore: "Wide-bore, quiet mode [confirm]" },
  ct: { name: "Multi-slice CT scanner [confirm]", slices: "128-slice, low-dose protocols [confirm]" },
};

const en = {
  title: "MRI & CT Scan", metaDesc: "MRI and CT scans at Lyallpur Medical Complex, Faisalabad: brain, spine, joints, CT angiography, KUB and more — consultant radiologist reports, online booking and safety screening.",
  eyebrow: "MRI & CT · ground floor, radiology wing", h1a: "See inside, clearly.", h1b: "MRI & CT, reported by consultants.",
  lead: "Radiation-free MRI for the brain, spine and joints, and fast low-dose CT around the clock — with careful safety screening, clear preparation and digitally signed reports on your phone.",
  book: "Book MRI / CT", reports: "Download my report", call: "Call radiology",
  ctaEmergency: "CT for emergencies 24/7", ctaWalkIn: "Same-day CT slots most days",
  stats: [["MRI", "Radiation-free"], ["24/7", "Emergency CT"], ["24 hrs", "Routine reports"], ["2 hrs", "Urgent CT reports"], ["PMDC", "Consultant radiologists"]] as [string, string][],
  tabsTitle: "Choose your scan", tabsSub: "Live list with preparation, report time and price. Filter by body part or contrast, then tap “Book”.",
  tabMri: "MRI", tabCt: "CT scan", searchPh: "Search — e.g. lumbar spine, brain, KUB", allParts: "All body parts",
  contrast: { all: "Any", No: "Without contrast", Optional: "± contrast", Yes: "With contrast" } as Record<string, string>,
  contrastLabel: "Contrast", partLabel: "Body part", noMatch: "No scan matches. Call radiology — we will guide you.",
  priceNote: "Prices in Pakistani rupees per examination; contrast, sedation and urgent reporting are charged separately where shown. Panel and insurance rates may differ.",
  withContrast: "Contrast +", report: "Report", min: "min",
  prepTitle: "Preparation", prepSub: "Good preparation means clear images and no repeat visit. Your booking SMS repeats the instructions for your scan.",
  prep: [
    ["MRI — any body part", ["Remove all metal: jewellery, hairpins, watch, belt, hearing aids, coins, cards with magnetic strips.", "Wear clothes without metal or change into our gown; lockers are provided.", "No fasting is needed unless contrast is planned — then 4 hours without food; water is fine.", "The scan takes 20-45 minutes and is noisy: ear plugs or headphones are given. Lie still for the sharpest images."]],
    ["MRI with contrast (gadolinium)", ["4 hours without food; keep drinking water.", "Bring a serum creatinine report from the last 3 months if you are over 60, diabetic or have kidney disease.", "Tell us about any previous reaction to contrast, asthma, or pregnancy / breastfeeding."]],
    ["CT without contrast (brain, chest, KUB, bones)", ["No preparation for a plain CT brain, sinuses or bones.", "CT KUB: drink 4-5 glasses of water an hour before; do not empty your bladder.", "Remove metal over the area scanned."]],
    ["CT with contrast (abdomen, angiography)", ["4-6 hours without food; water and regular medicines are fine.", "Serum creatinine / eGFR report is required — we can test it on the spot.", "Diabetics on metformin: tell us; it may be paused for 48 hours after contrast as your doctor advises.", "For abdomen CT you may drink oral contrast over 1 hour before the scan."]],
    ["Children and anxious patients", ["Sedation for small children is given only by an anaesthetist, with written parent consent.", "Child sedation: no milk or food for 4-6 hours, as told at booking.", "Claustrophobic? Tell us at booking — we can plan a short protocol, a parent in the room, or mild sedation."]],
    ["What to bring", ["CNIC / B-form and MR number if you have one.", "Doctor's referral slip and previous MRI / CT reports or CDs for comparison.", "Creatinine report for contrast scans, and any implant card (pacemaker, valve, stent, cochlear implant).", "Panel or insurance card if applicable."]],
  ] as [string, string[]][],
  mriSafetyTitle: "MRI safety", mriSafetySub: "The MRI magnet is always on. Before every scan you answer a short safety questionnaire and a radiographer checks it with you.",
  mriSafety: [
    ["Pacemaker or defibrillator", "Never enter the MRI room without radiologist clearance — many devices are not MRI-safe. Bring your device card."],
    ["Implants & metal", "Aneurysm clips, cochlear implants, nerve stimulators, metal fragments in the eye — tell us; the radiologist decides."],
    ["Pregnancy", "MRI is avoided in the first trimester unless essential; gadolinium is not given in pregnancy."],
    ["Claustrophobia", "Wide-bore scanner, music, a call button in your hand and a radiographer watching you at all times."],
  ] as [string, string][],
  ctSafetyTitle: "CT safety", ctSafetySub: "CT uses X-rays. We use the lowest dose that answers the question, and record the dose for every scan.",
  ctSafety: [
    ["Low-dose protocols", "Dose is adjusted to the body size and the question; children get paediatric settings."],
    ["Kidney check before contrast", "Your eGFR is checked before iodinated contrast. If it is below 30 the radiologist reviews before going ahead."],
    ["Allergy history", "A previous contrast reaction or asthma is screened; premedication or an alternative test is planned."],
    ["Pregnancy check", "Women of child-bearing age are asked — CT of the abdomen and pelvis is avoided in pregnancy."],
  ] as [string, string][],
  stepsTitle: "Your visit, step by step", stepsSub: "From booking to report — you always know what happens next.",
  steps: [["Book", "Online, phone or at the counter — pick a slot on MRI-1 or CT-1."], ["Safety questions", "Answer the MRI / contrast questionnaire; implants are reviewed by a radiologist."],
    ["Pay at the counter", "Charges slip with your token and room; panel cards verified."], ["Prepare", "Change, remove metal, IV line for contrast; consent signed."],
    ["Scan", "MRI 20-45 min, CT 5-15 min, with a technologist beside you."], ["Report", "Consultant radiologist reports; SMS when it is signed — download with QR verification."]] as [string, string][],
  teamTitle: "Our radiologists", teamSub: "PMDC-registered consultants read every MRI and CT.", teamEmpty: "Radiologist profiles will appear here.",
  equipTitle: "Equipment", equipSub: "Modern scanners, maintained under service contract and quality-checked every day.",
  faqTitle: "Questions patients ask",
  faq: [
    ["What is the difference between MRI and CT?", "MRI uses a strong magnet and radio waves — no radiation — and is best for brain, spine, joints and soft tissue. CT uses X-rays, takes minutes, and is best for emergencies, lungs, stones, bleeding and bones."],
    ["Is MRI safe with a pacemaker?", "Only if the device is MRI-conditional and a radiologist clears it. Never go into the MRI room before that check. Tell us at booking and bring the device card."],
    ["Why do I need a creatinine test?", "Contrast is cleared by the kidneys. A recent creatinine / eGFR shows the kidneys can clear it safely. We can test it here the same day."],
    ["How long does the report take?", "Routine MRI and CT are reported within 24 hours; urgent and emergency CT within about 2 hours. You get an SMS when the report is signed."],
    ["Can I get a refund if I cancel?", "Yes, before the scan is performed. Refunds are approved by the cash supervisor and a refund slip is printed for you."],
    ["Will I get the images?", "Yes — a CD or online link on request, and your doctor sees the report in the hospital record."],
  ] as [string, string][],
  locTitle: "Where to find us", locText: "MRI and CT suites, ground floor, radiology wing [confirm] — follow the Radiology signs from the main lobby. Pay at the reception counter; your slip shows the room (MRI-1 / CT-1) and token.",
  ctaTitle: "Need an MRI or CT?", ctaText: "Book online in two minutes, or bring your doctor's slip to the reception counter.",
  safety: "Safety", report24: "Report within 24 hrs", hours: "Hours",
};
type Copy = typeof en;

const ur: Copy = {
  ...en,
  title: "ایم آر آئی اور سی ٹی اسکین", eyebrow: "ایم آر آئی اور سی ٹی · گراؤنڈ فلور، ریڈیالوجی ونگ", h1a: "اندر کی واضح تصویر۔", h1b: "ایم آر آئی اور سی ٹی، کنسلٹنٹ رپورٹ کے ساتھ۔",
  lead: "دماغ، ریڑھ کی ہڈی اور جوڑوں کے لیے بغیر شعاعوں کے ایم آر آئی، اور چوبیس گھنٹے تیز، کم شعاعوں والا سی ٹی — حفاظتی جانچ، واضح تیاری اور ڈیجیٹل دستخط شدہ رپورٹ آپ کے فون پر۔",
  book: "ایم آر آئی / سی ٹی بک کریں", reports: "اپنی رپورٹ ڈاؤن لوڈ کریں", call: "ریڈیالوجی کو کال کریں",
  ctaEmergency: "ایمرجنسی سی ٹی 24/7", ctaWalkIn: "زیادہ تر دنوں میں اسی دن سی ٹی",
  stats: [["MRI", "بغیر شعاعوں کے"], ["24/7", "ایمرجنسی سی ٹی"], ["24 گھنٹے", "عام رپورٹ"], ["2 گھنٹے", "فوری سی ٹی رپورٹ"], ["PMDC", "کنسلٹنٹ ریڈیالوجسٹ"]],
  tabsTitle: "اپنا اسکین منتخب کریں", tabsSub: "تیاری، رپورٹ کا وقت اور قیمت کے ساتھ تازہ فہرست۔ جسم کے حصے یا کنٹراسٹ سے فلٹر کریں، پھر \"بک\" دبائیں۔",
  tabMri: "ایم آر آئی", tabCt: "سی ٹی اسکین", searchPh: "تلاش کریں — مثلاً کمر، دماغ، گردے", allParts: "جسم کے تمام حصے",
  contrast: { all: "کوئی بھی", No: "کنٹراسٹ کے بغیر", Optional: "± کنٹراسٹ", Yes: "کنٹراسٹ کے ساتھ" },
  contrastLabel: "کنٹراسٹ", partLabel: "جسم کا حصہ", noMatch: "کوئی اسکین نہیں ملا۔ ریڈیالوجی کو کال کریں — ہم رہنمائی کریں گے۔",
  priceNote: "قیمتیں پاکستانی روپے میں فی معائنہ؛ کنٹراسٹ، بے ہوشی اور فوری رپورٹ کے الگ چارجز جہاں درج ہیں۔ پینل اور انشورنس ریٹ مختلف ہو سکتے ہیں۔",
  withContrast: "کنٹراسٹ +", report: "رپورٹ", min: "منٹ",
  prepTitle: "تیاری", prepSub: "اچھی تیاری سے تصویر واضح آتی ہے اور دوبارہ آنا نہیں پڑتا۔ بکنگ کے ایس ایم ایس میں ہدایات دہرائی جاتی ہیں۔",
  prep: [
    ["ایم آر آئی — جسم کا کوئی بھی حصہ", ["تمام دھاتی اشیاء اتار دیں: زیور، پن، گھڑی، بیلٹ، آلۂ سماعت، سکے، مقناطیسی کارڈ۔", "بغیر دھات کے کپڑے پہنیں یا ہمارا گاؤن لیں؛ لاکر موجود ہیں۔", "کنٹراسٹ نہ ہو تو فاقہ ضروری نہیں — کنٹراسٹ کے لیے 4 گھنٹے کچھ نہ کھائیں؛ پانی پی سکتے ہیں۔", "اسکین 20 سے 45 منٹ کا ہے اور آواز آتی ہے: ایئر پلگ دیے جاتے ہیں۔ بالکل ساکت لیٹیں۔"]],
    ["کنٹراسٹ کے ساتھ ایم آر آئی", ["4 گھنٹے کچھ نہ کھائیں؛ پانی پیتے رہیں۔", "60 سال سے زیادہ، شوگر یا گردے کے مریض پچھلے 3 ماہ کی کریٹینین رپورٹ لائیں۔", "پہلے کنٹراسٹ سے ری ایکشن، دمہ، حمل یا دودھ پلانے کے بارے میں بتائیں۔"]],
    ["کنٹراسٹ کے بغیر سی ٹی (دماغ، سینہ، گردے، ہڈیاں)", ["سادہ سی ٹی دماغ، سائنس یا ہڈیوں کے لیے کوئی تیاری نہیں۔", "سی ٹی KUB: ایک گھنٹہ پہلے 4-5 گلاس پانی پئیں؛ پیشاب نہ کریں۔", "اسکین والے حصے سے دھات اتار دیں۔"]],
    ["کنٹراسٹ کے ساتھ سی ٹی (پیٹ، انجیوگرافی)", ["4 سے 6 گھنٹے کچھ نہ کھائیں؛ پانی اور معمول کی دوائیں لے سکتے ہیں۔", "کریٹینین / eGFR رپورٹ ضروری ہے — یہیں ٹیسٹ ہو سکتا ہے۔", "میٹفارمن لینے والے شوگر کے مریض بتائیں؛ ڈاکٹر کے مشورے سے 48 گھنٹے روکی جا سکتی ہے۔", "پیٹ کے سی ٹی کے لیے اسکین سے پہلے ایک گھنٹے میں پینے والا کنٹراسٹ دیا جا سکتا ہے۔"]],
    ["بچے اور گھبرانے والے مریض", ["چھوٹے بچوں کو بے ہوشی صرف اینستھیزیا ڈاکٹر دیتے ہیں، والدین کی تحریری رضامندی سے۔", "بچے کی بے ہوشی: بکنگ پر بتائے گئے وقت تک 4-6 گھنٹے دودھ یا کھانا نہ دیں۔", "بند جگہ سے گھبراہٹ؟ بکنگ پر بتائیں — مختصر پروٹوکول، ساتھ والدین یا ہلکی دوا کا انتظام ہو سکتا ہے۔"]],
    ["ساتھ کیا لائیں", ["شناختی کارڈ / ب فارم اور ایم آر نمبر اگر ہو۔", "ڈاکٹر کی پرچی اور پچھلی ایم آر آئی / سی ٹی رپورٹس یا سی ڈی۔", "کنٹراسٹ اسکین کے لیے کریٹینین رپورٹ، اور کسی امپلانٹ کا کارڈ (پیس میکر، والو، اسٹینٹ)۔", "پینل یا انشورنس کارڈ اگر ہو۔"]],
  ],
  mriSafetyTitle: "ایم آر آئی حفاظت", mriSafetySub: "ایم آر آئی کا مقناطیس ہمیشہ چالو رہتا ہے۔ ہر اسکین سے پہلے آپ ایک مختصر حفاظتی سوالنامہ بھرتے ہیں اور ریڈیوگرافر آپ کے ساتھ اسے چیک کرتا ہے۔",
  mriSafety: [
    ["پیس میکر یا ڈیفبریلیٹر", "ریڈیالوجسٹ کی اجازت کے بغیر ایم آر آئی روم میں ہرگز نہ جائیں — کئی آلات محفوظ نہیں ہوتے۔ آلے کا کارڈ ساتھ لائیں۔"],
    ["امپلانٹ اور دھات", "دماغی کلپ، کوکلیئر امپلانٹ، اعصابی آلات، آنکھ میں دھات کے ذرات — بتائیں؛ فیصلہ ریڈیالوجسٹ کرے گا۔"],
    ["حمل", "پہلے تین ماہ میں ایم آر آئی صرف ضرورت پر؛ حمل میں گیڈولینیم نہیں دیا جاتا۔"],
    ["بند جگہ کا خوف", "کھلا اسکینر، موسیقی، ہاتھ میں کال بٹن اور ریڈیوگرافر کی مسلسل نگرانی۔"],
  ],
  ctSafetyTitle: "سی ٹی حفاظت", ctSafetySub: "سی ٹی میں ایکس رے استعمال ہوتی ہیں۔ ہم سوال کا جواب دینے والی کم سے کم مقدار استعمال کرتے ہیں اور ہر اسکین کی ڈوز درج کرتے ہیں۔",
  ctSafety: [
    ["کم ڈوز پروٹوکول", "ڈوز جسم کے سائز اور سوال کے مطابق؛ بچوں کے لیے الگ سیٹنگ۔"],
    ["کنٹراسٹ سے پہلے گردوں کی جانچ", "آئیوڈین کنٹراسٹ سے پہلے eGFR چیک ہوتا ہے۔ 30 سے کم ہو تو ریڈیالوجسٹ پہلے جائزہ لیتا ہے۔"],
    ["الرجی کی تاریخ", "پچھلا کنٹراسٹ ری ایکشن یا دمہ دیکھا جاتا ہے؛ پیشگی دوا یا متبادل ٹیسٹ تجویز ہوتا ہے۔"],
    ["حمل کی جانچ", "خواتین سے پوچھا جاتا ہے — حمل میں پیٹ اور پیڑو کا سی ٹی نہیں کیا جاتا۔"],
  ],
  stepsTitle: "آپ کا وزٹ، قدم بہ قدم", stepsSub: "بکنگ سے رپورٹ تک — آپ کو ہمیشہ معلوم ہوتا ہے کہ آگے کیا ہوگا۔",
  steps: [["بکنگ", "آن لائن، فون یا کاؤنٹر پر — MRI-1 یا CT-1 پر وقت چنیں۔"], ["حفاظتی سوالات", "ایم آر آئی / کنٹراسٹ سوالنامہ؛ امپلانٹ کا جائزہ ریڈیالوجسٹ لیتا ہے۔"],
    ["کاؤنٹر پر ادائیگی", "ٹوکن اور کمرہ نمبر کے ساتھ چارجز سلپ؛ پینل کارڈ کی تصدیق۔"], ["تیاری", "کپڑے بدلیں، دھات اتاریں، کنٹراسٹ کے لیے ڈرپ؛ رضامندی پر دستخط۔"],
    ["اسکین", "ایم آر آئی 20-45 منٹ، سی ٹی 5-15 منٹ، ٹیکنالوجسٹ ساتھ۔"], ["رپورٹ", "کنسلٹنٹ رپورٹ کرتا ہے؛ دستخط پر ایس ایم ایس — QR تصدیق کے ساتھ ڈاؤن لوڈ کریں۔"]],
  teamTitle: "ہمارے ریڈیالوجسٹ", teamSub: "ہر ایم آر آئی اور سی ٹی PMDC رجسٹرڈ کنسلٹنٹ پڑھتے ہیں۔", teamEmpty: "ریڈیالوجسٹ کی تفصیل یہاں آئے گی۔",
  equipTitle: "مشینیں", equipSub: "جدید اسکینر، سروس معاہدے کے تحت اور روزانہ کوالٹی چیک کے ساتھ۔",
  faqTitle: "مریضوں کے سوالات",
  faq: [
    ["ایم آر آئی اور سی ٹی میں کیا فرق ہے؟", "ایم آر آئی مقناطیس اور ریڈیو لہروں سے بنتا ہے — کوئی شعاع نہیں — اور دماغ، ریڑھ کی ہڈی، جوڑوں کے لیے بہترین ہے۔ سی ٹی ایکس رے سے چند منٹ میں بنتا ہے اور ایمرجنسی، پھیپھڑوں، پتھری، خون اور ہڈیوں کے لیے بہترین ہے۔"],
    ["کیا پیس میکر کے ساتھ ایم آر آئی محفوظ ہے؟", "صرف اگر آلہ ایم آر آئی کے لیے موزوں ہو اور ریڈیالوجسٹ اجازت دے۔ بکنگ پر بتائیں اور آلے کا کارڈ لائیں۔"],
    ["کریٹینین ٹیسٹ کیوں ضروری ہے؟", "کنٹراسٹ گردوں سے خارج ہوتا ہے۔ تازہ کریٹینین / eGFR سے پتہ چلتا ہے کہ گردے اسے محفوظ طریقے سے نکال سکتے ہیں۔ یہیں اسی دن ٹیسٹ ہو سکتا ہے۔"],
    ["رپورٹ کتنی دیر میں ملتی ہے؟", "عام ایم آر آئی اور سی ٹی کی رپورٹ 24 گھنٹے میں؛ فوری اور ایمرجنسی سی ٹی تقریباً 2 گھنٹے میں۔ دستخط ہونے پر ایس ایم ایس آتا ہے۔"],
    ["منسوخی پر رقم واپس ملتی ہے؟", "جی ہاں، اسکین ہونے سے پہلے۔ واپسی کیش سپروائزر منظور کرتا ہے اور آپ کو ریفنڈ سلپ دی جاتی ہے۔"],
    ["کیا تصاویر ملیں گی؟", "جی ہاں — درخواست پر سی ڈی یا آن لائن لنک، اور ڈاکٹر ہسپتال کے ریکارڈ میں رپورٹ دیکھتا ہے۔"],
  ],
  locTitle: "ہم کہاں ہیں", locText: "ایم آر آئی اور سی ٹی، گراؤنڈ فلور، ریڈیالوجی ونگ — مرکزی لابی سے ریڈیالوجی کے نشانات دیکھیں۔ ریسیپشن کاؤنٹر پر ادائیگی کریں؛ سلپ پر کمرہ (MRI-1 / CT-1) اور ٹوکن درج ہوتا ہے۔",
  ctaTitle: "ایم آر آئی یا سی ٹی کی ضرورت ہے؟", ctaText: "دو منٹ میں آن لائن بک کریں، یا ڈاکٹر کی پرچی ریسیپشن کاؤنٹر پر لائیں۔",
  safety: "حفاظت", report24: "رپورٹ 24 گھنٹے میں", hours: "اوقات",
};

export const MRCT: Record<Lang, Copy> = { en, ur };
