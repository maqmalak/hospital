/**
 * Lyallpur Medical Complex public website (D-75): copy in English and Urdu, and the few settings the hospital fills in.
 * Name, address, main phone and the doctors come live from the hospital system (Clinic Settings, Doctor records).
 * Anything left empty (or still containing X) below is hidden on the page until it is set.
 */
export const CONFIG = {
  whatsapp: "92XXXXXXXXXX",            // international format, digits only — [replace]; hidden while it contains X
  emergencyPhone: "",                  // a separate emergency line; empty = the main phone from Clinic Settings
  email: "",                           // e.g. info@lyallpurhospital.pk — empty = not shown
  social: { facebook: "", instagram: "", youtube: "" } as Record<string, string>,  // empty = not shown
};

export type Lang = "en" | "ur";

const en = {
  meta: {
    title: "Lyallpur Medical Complex — Medical & Research Center",
    description: "Specialist doctors, emergency care, laboratory, imaging, pharmacy and inpatient wards under one roof. Book your appointment online.",
  },
  name: "Lyallpur Medical Complex", tagline: "Medical & Research Center",
  nav: { departments: "Departments", services: "Services", doctors: "Doctors", patients: "Patients & Visitors", about: "About", contact: "Contact", book: "Book appointment",
    staff: "Staff login", menu: "Menu", close: "Close menu", lang: "اردو", emergency: "Emergency" },
  hero: {
    eyebrow: "Medical & Research Center",
    h1a: "Care you can trust,", h1b: "medicine you can see.",
    sub: "Specialist consultants, diagnostics, pharmacy and inpatient care together under one roof — with one medical record that follows you from the first visit to the last.",
    book: "Book an appointment", call: "Call the hospital",
    cards: { next: "Next available", nextNone: "Book online", nextSub: "with our consultants", lab: "Lab reports", labSub: "sent to your phone when ready", er: "Emergency", erSub: "Call before you come" },
  },
  quick: [
    ["Book an appointment", "Choose a doctor and a time online"],
    ["Find a doctor", "Consultants and their clinic days"],
    ["Our services", "Departments and diagnostics"],
    ["Emergency", "Call the hospital now"],
  ],
  about: {
    eyebrow: "About us", title: "A hospital built around the patient",
    body: "Lyallpur Medical Complex brings consultants, nurses, diagnostics and pharmacy together so that care is joined up. Every department works from the same patient record — your doctor sees your tests, scans and medicines in one place, and nothing has to be repeated.",
    doctors: "consultants", specialties: "specialties", departments: "departments",
    points: [
      ["Consultant-led care", "Qualified specialists see you in their own clinics, on fixed clinic days."],
      ["One medical record", "Visits, results and prescriptions stay together, across every department."],
      ["Diagnostics on site", "Laboratory and imaging in the same building, results added to your file."],
      ["Panels & insurance", "Corporate panels and insurance handled at reception — ask about yours."],
    ],
  },
  departments: {
    eyebrow: "Departments", title: "Departments & specialties",
    sub: "From a first consultation to surgery and recovery, our departments share one patient file — so your care stays connected.",
    items: [
      ["General OPD", "Walk-in and booked consultations with nurse vitals before every visit and a clear written prescription."],
      ["Internal Medicine", "Diabetes, blood pressure, chest and infection care, with ward admission when needed."],
      ["Cardiology", "ECG, echo and heart clinics, with follow-up visits booked before you leave."],
      ["Neurology", "Headache, epilepsy and stroke care, with inpatient observation when needed."],
      ["Nephrology", "Kidney clinics for stones, infections and chronic kidney disease, linked to our dialysis unit."],
      ["Orthopaedics", "Joint, sports injury and fracture care, with physiotherapy to follow."],
      ["Obstetrics & Gynaecology", "Antenatal clinics, delivery and postnatal follow-up for mother and baby."],
      ["Paediatrics", "Child health clinics, vaccinations and a children's ward with parents close by."],
      ["General Surgery", "Planned and emergency operations, day-case procedures and wound care."],
      ["ENT", "Ear, nose and throat clinics, hearing checks and minor procedures."],
      ["Dermatology", "Skin, hair and nail clinics, allergy care and minor skin procedures."],
      ["Emergency", "Triage on arrival, monitored bays and a quick decision to treat, admit or refer."],
    ],
  },
  services: {
    eyebrow: "Services", title: "Diagnostics & treatment",
    sub: "Scans, tests and treatment in the same building — reports go straight into your file, where your doctor sees them.",
    items: [
      ["MRI", "Detailed scans of the brain, spine, joints and soft tissue, reported by a radiologist."],
      ["CT Scan", "Fast cross-sectional imaging for head, chest and abdomen — including emergency scans."],
      ["X-Ray", "Digital X-rays for chest, bones and joints, with the image and report added to your file."],
      ["Laboratory", "Blood, urine and culture tests with barcoded samples and results sent to your phone."],
      ["Dialysis", "Haemodialysis sessions in a dedicated unit, scheduled around you and supervised by the kidney team."],
      ["Ultrasound", "Abdominal, pregnancy and vascular ultrasound, with reports the same visit."],
      ["Pharmacy", "Medicines checked by a pharmacist against your prescription, by batch and expiry."],
      ["Inpatient wards", "Comfortable wards with nursing round the clock, a running bill and clear discharge papers."],
    ],
  },
  doctors: {
    eyebrow: "Our doctors", title: "Meet our consultants",
    sub: "Choose a specialty to see who consults, on which days — and book a time that suits you.",
    all: "All", book: "Book", fee: "Consultation", next: "Next available", none: "Clinic days not published yet", more: "See all doctors and book",
  },
  patients: {
    eyebrow: "Patients & visitors", title: "Before you come to hospital",
    items: [
      ["Your appointment", "Book online or at reception. Please arrive 15 minutes early so the nurse can take your vitals."],
      ["What to bring", "Your CNIC, previous prescriptions and reports, and a list of the medicines you take."],
      ["Lab results", "Results are added to your record and can be sent to your phone — no need to come back to collect."],
      ["Panels & insurance", "Bring your panel card or insurance details; reception will confirm your cover before treatment."],
      ["Admission", "Our team will guide you through admission, the ward, visiting and your discharge papers."],
      ["Privacy", "Your record is seen only by the staff caring for you, and every access is logged."],
    ],
  },
  cta: { title: "Need to see a doctor?", sub: "Book online in a couple of minutes, or call us and our team will help.", book: "Book an appointment", call: "Call" },
  contact: {
    eyebrow: "Contact", title: "Visit or call us", address: "Address", phone: "Phone", whatsapp: "WhatsApp", email: "Email",
    directions: "Get directions", emergency: "Emergency", hours: "Clinic days and times are shown with each doctor when you book.",
  },
  footer: { rights: "All rights reserved.", powered: "Hospital system by", links: "Quick links" },
};

const ur: typeof en = {
  meta: {
    title: "لائل پور میڈیکل کمپلیکس — میڈیکل اینڈ ریسرچ سینٹر",
    description: "ماہر ڈاکٹر، ایمرجنسی، لیبارٹری، امیجنگ، فارمیسی اور داخلہ وارڈ ایک ہی چھت تلے۔ آن لائن اپائنٹمنٹ بک کریں۔",
  },
  name: "لائل پور میڈیکل کمپلیکس", tagline: "میڈیکل اینڈ ریسرچ سینٹر",
  nav: { departments: "شعبے", services: "خدمات", doctors: "ڈاکٹر", patients: "مریض اور ملاقاتی", about: "ہمارے بارے میں", contact: "رابطہ", book: "اپائنٹمنٹ بک کریں",
    staff: "اسٹاف لاگ ان", menu: "مینو", close: "مینو بند کریں", lang: "English", emergency: "ایمرجنسی" },
  hero: {
    eyebrow: "میڈیکل اینڈ ریسرچ سینٹر",
    h1a: "قابلِ اعتماد علاج،", h1b: "واضح اور شفاف۔",
    sub: "ماہر کنسلٹنٹ، تشخیص، فارمیسی اور داخلہ علاج ایک ہی چھت تلے — اور ایک ہی میڈیکل ریکارڈ جو پہلے دورے سے آخری تک آپ کے ساتھ رہتا ہے۔",
    book: "اپائنٹمنٹ بک کریں", call: "ہسپتال کو کال کریں",
    cards: { next: "اگلا دستیاب وقت", nextNone: "آن لائن بک کریں", nextSub: "ہمارے کنسلٹنٹس کے ساتھ", lab: "لیب رپورٹس", labSub: "تیار ہوتے ہی آپ کے فون پر", er: "ایمرجنسی", erSub: "آنے سے پہلے کال کریں" },
  },
  quick: [
    ["اپائنٹمنٹ بک کریں", "آن لائن ڈاکٹر اور وقت منتخب کریں"],
    ["ڈاکٹر تلاش کریں", "کنسلٹنٹس اور ان کے کلینک کے دن"],
    ["ہماری خدمات", "شعبے اور تشخیص"],
    ["ایمرجنسی", "ابھی ہسپتال کو کال کریں"],
  ],
  about: {
    eyebrow: "ہمارے بارے میں", title: "مریض کے گرد بنایا گیا ہسپتال",
    body: "لائل پور میڈیکل کمپلیکس کنسلٹنٹس، نرسوں، تشخیص اور فارمیسی کو یکجا کرتا ہے تاکہ علاج مربوط رہے۔ ہر شعبہ مریض کے ایک ہی ریکارڈ سے کام کرتا ہے — آپ کا ڈاکٹر ٹیسٹ، اسکین اور ادویات ایک جگہ دیکھتا ہے، اور کچھ دہرانا نہیں پڑتا۔",
    doctors: "کنسلٹنٹس", specialties: "شعبہ جات", departments: "ڈیپارٹمنٹس",
    points: [
      ["کنسلٹنٹ کی زیرِ نگرانی علاج", "مستند ماہرین اپنے کلینک میں مقررہ دنوں پر معائنہ کرتے ہیں۔"],
      ["ایک میڈیکل ریکارڈ", "دورے، نتائج اور نسخے ہر شعبے میں ایک ساتھ رہتے ہیں۔"],
      ["تشخیص اسی عمارت میں", "لیبارٹری اور امیجنگ ایک ہی جگہ، نتائج آپ کی فائل میں۔"],
      ["پینل اور انشورنس", "کارپوریٹ پینل اور انشورنس استقبالیہ پر — اپنے بارے میں پوچھیں۔"],
    ],
  },
  departments: {
    eyebrow: "شعبے", title: "شعبے اور مہارتیں",
    sub: "پہلے معائنے سے آپریشن اور صحت یابی تک، ہمارے تمام شعبے مریض کی ایک فائل استعمال کرتے ہیں — تاکہ آپ کا علاج جڑا رہے۔",
    items: [
      ["جنرل او پی ڈی", "واک اِن اور بک شدہ معائنے، ہر دورے سے پہلے نرس کے وائٹلز اور واضح تحریری نسخہ۔"],
      ["میڈیسن", "ذیابیطس، بلڈ پریشر، سینے اور انفیکشن کا علاج، ضرورت پر وارڈ میں داخلہ۔"],
      ["امراضِ قلب", "ای سی جی، ایکو اور دل کے کلینک، جانے سے پہلے اگلی ملاقات بک۔"],
      ["نیورولوجی", "سر درد، مرگی اور فالج کا علاج، ضرورت پر داخلی نگرانی۔"],
      ["امراضِ گردہ", "پتھری، انفیکشن اور گردوں کی دائمی بیماری کے کلینک، ڈائیلاسز یونٹ سے منسلک۔"],
      ["آرتھوپیڈکس", "جوڑوں، کھیل کی چوٹ اور فریکچر کا علاج، بعد میں فزیوتھراپی۔"],
      ["زچگی و امراضِ نسواں", "حمل کے دوران کلینک، زچگی اور ماں و بچے کی بعد از پیدائش دیکھ بھال۔"],
      ["امراضِ اطفال", "بچوں کے کلینک، حفاظتی ٹیکے اور بچوں کا وارڈ، والدین قریب۔"],
      ["جنرل سرجری", "طے شدہ اور ہنگامی آپریشن، ڈے کیس اور زخموں کی دیکھ بھال۔"],
      ["ناک، کان، گلا", "ناک، کان اور گلے کے کلینک، سماعت کی جانچ اور چھوٹے طریقہ علاج۔"],
      ["امراضِ جلد", "جلد، بال اور ناخن کے کلینک، الرجی اور جلد کے چھوٹے طریقہ علاج۔"],
      ["ایمرجنسی", "آمد پر ٹرائیج، نگرانی والے بیڈ اور علاج، داخلہ یا ریفر کا فوری فیصلہ۔"],
    ],
  },
  services: {
    eyebrow: "خدمات", title: "تشخیص اور علاج",
    sub: "اسکین، ٹیسٹ اور علاج ایک ہی عمارت میں — رپورٹیں سیدھی آپ کی فائل میں جاتی ہیں جہاں ڈاکٹر انہیں دیکھتا ہے۔",
    items: [
      ["ایم آر آئی", "دماغ، ریڑھ کی ہڈی، جوڑوں اور نرم بافتوں کے تفصیلی اسکین، ریڈیالوجسٹ کی رپورٹ کے ساتھ۔"],
      ["سی ٹی اسکین", "سر، سینے اور پیٹ کی تیز امیجنگ — ہنگامی اسکین سمیت۔"],
      ["ایکسرے", "سینے، ہڈیوں اور جوڑوں کے ڈیجیٹل ایکسرے، تصویر اور رپورٹ آپ کی فائل میں۔"],
      ["لیبارٹری", "خون، پیشاب اور کلچر ٹیسٹ، بارکوڈ والے نمونے اور نتائج آپ کے فون پر۔"],
      ["ڈائیلاسز", "مخصوص یونٹ میں ہیمو ڈائیلاسز، آپ کی سہولت سے شیڈول اور گردوں کی ٹیم کی نگرانی میں۔"],
      ["الٹراساؤنڈ", "پیٹ، حمل اور خون کی نالیوں کا الٹراساؤنڈ، اسی دورے میں رپورٹ۔"],
      ["فارمیسی", "فارماسسٹ نسخے کے مطابق بیچ اور میعاد دیکھ کر دوا دیتا ہے۔"],
      ["داخلہ وارڈ", "آرام دہ وارڈ، چوبیس گھنٹے نرسنگ، جاری بل اور واضح ڈسچارج کاغذات۔"],
    ],
  },
  doctors: {
    eyebrow: "ہمارے ڈاکٹر", title: "ہمارے کنسلٹنٹس سے ملیں",
    sub: "شعبہ منتخب کریں، دیکھیں کون کن دنوں میں معائنہ کرتا ہے — اور اپنی سہولت کا وقت بک کریں۔",
    all: "سب", book: "بک کریں", fee: "فیس", next: "اگلا دستیاب", none: "کلینک کے دن ابھی شائع نہیں ہوئے", more: "تمام ڈاکٹر دیکھیں اور بک کریں",
  },
  patients: {
    eyebrow: "مریض اور ملاقاتی", title: "ہسپتال آنے سے پہلے",
    items: [
      ["آپ کی اپائنٹمنٹ", "آن لائن یا استقبالیہ پر بک کریں۔ براہِ کرم 15 منٹ پہلے پہنچیں تاکہ نرس وائٹلز لے سکے۔"],
      ["ساتھ کیا لائیں", "شناختی کارڈ، پرانے نسخے اور رپورٹس، اور جو ادویات آپ لیتے ہیں ان کی فہرست۔"],
      ["لیب کے نتائج", "نتائج آپ کے ریکارڈ میں شامل ہوتے ہیں اور فون پر بھیجے جا سکتے ہیں — لینے دوبارہ آنے کی ضرورت نہیں۔"],
      ["پینل اور انشورنس", "پینل کارڈ یا انشورنس کی تفصیل ساتھ لائیں؛ استقبالیہ علاج سے پہلے کوریج کی تصدیق کرے گا۔"],
      ["داخلہ", "ہماری ٹیم داخلے، وارڈ، ملاقات اور ڈسچارج کے کاغذات میں رہنمائی کرے گی۔"],
      ["رازداری", "آپ کا ریکارڈ صرف آپ کا علاج کرنے والا عملہ دیکھتا ہے، اور ہر رسائی محفوظ کی جاتی ہے۔"],
    ],
  },
  cta: { title: "ڈاکٹر سے ملنا ہے؟", sub: "چند منٹ میں آن لائن بک کریں، یا کال کریں — ہماری ٹیم مدد کرے گی۔", book: "اپائنٹمنٹ بک کریں", call: "کال کریں" },
  contact: {
    eyebrow: "رابطہ", title: "تشریف لائیں یا کال کریں", address: "پتہ", phone: "فون", whatsapp: "واٹس ایپ", email: "ای میل",
    directions: "راستہ دیکھیں", emergency: "ایمرجنسی", hours: "ہر ڈاکٹر کے کلینک کے دن اور اوقات بکنگ کے وقت دکھائے جاتے ہیں۔",
  },
  footer: { rights: "جملہ حقوق محفوظ ہیں۔", powered: "ہسپتال سسٹم", links: "فوری روابط" },
};

export const COPY = { en, ur };
export type Copy = typeof en;
