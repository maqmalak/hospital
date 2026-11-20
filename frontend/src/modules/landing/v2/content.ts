/**
 * Website v2 copy and editable facts (D-80). Everything a non-developer may need to change lives here.
 * Items marked [confirm] are reasonable defaults the hospital must check before go-live (floor guide, visiting hours,
 * amenities). Live facts (doctors, departments, ward day-rates, packages, beds) come from the ERP, not from this file.
 */

export const CONFIG = {
  // phones: empty = the main landline from Clinic Settings
  phones: { emergency: "", reception: "", appointments: "", ambulance: "", nicu: "" } as Record<string, string>,   // nicu: NICU helpline [confirm]
  whatsapp: "92XXXXXXXXXX",          // international format, digits only — hidden while it contains X
  email: "",                         // e.g. info@lyallpurhospital.pk — empty = not shown
  social: { facebook: "", instagram: "", youtube: "", linkedin: "" } as Record<string, string>,
  mapQuery: "",                      // exact Google Maps place / plus code; empty = Clinic Settings address
  beds: 120,                         // brand board figure; 0 = live count of Hospital Bed records
  showPrices: true,                  // ward day-rates and package prices from the ERP
  visitingHours: "11:00 am – 1:00 pm and 5:00 pm – 7:00 pm",   // [confirm]
  opdHours: "Monday to Saturday, 9:00 am – 9:00 pm",             // [confirm]
  pharmacyHours: "Open 24 hours, 7 days a week",                 // [confirm]
  accreditations: [] as { name: string; logo?: string }[],      // e.g. { name: "Punjab Healthcare Commission" } — shown only when filled
  testimonials: [] as { quote: string; name: string; detail?: string }[],  // real, consented patient quotes only — hidden while empty
  leadership: [] as { name: string; role: string; photo?: string }[],        // hidden while empty
};

export const IMG = (f: string) => `${import.meta.env.BASE_URL}brand/site/${f}.webp`;
export const PHOTOS = {
  building: IMG("building"), reception: IMG("reception"), lounge: IMG("lounge"), corridor: IMG("corridor"),
  room: IMG("room"), icu: IMG("icu"), pharmacy: IMG("pharmacy"),
};

export type Lang = "en" | "ur";

/** Shared chrome + home page copy, English and Urdu. Inner pages are English for now. */
export const UI = {
  en: {
    name: "Lyallpur Medical Complex", tagline: "LMC", city: "Faisalabad, Pakistan",
    top: { emergency: "Emergency 24/7", search: "Search", lang: "اردو", theme: "Theme" },
    nav: { home: "Home", about: "About", departments: "Departments", services: "Services", doctors: "Doctors", rooms: "Rooms", patients: "Patients & Visitors",
      pharmacy: "Pharmacy", map: "Hospital map", directions: "Directions", news: "Health blog", careers: "Careers", contact: "Contact", book: "Book appointment",
      all: "View all", menu: "Menu", close: "Close" },
    hero: { eyebrow: "Faisalabad · People's Colony", words: "Compassionate care, advanced medicine.", sub: "Consultants, round-the-clock emergency, modern diagnostics and comfortable rooms — under one roof, with one medical record that follows you from your first visit.",
      book: "Book appointment", find: "Find a doctor", emergency: "Emergency" },
    quick: [["Departments", "Specialties under one roof"], ["Services", "Tests, scans, surgery and more"], ["Get directions", "People's Colony No 1, Faisalabad"], ["Patient portal", "Reports, visits and bookings"]] as [string, string][],
    stats: { beds: "Beds", doctors: "Consultants", departments: "Departments", floors: "Floors" },
    sections: {
      depts: ["Specialties", "Departments built around you", "Specialist teams who share one record, so your care is joined up from clinic to ward."],
      services: ["Services", "Everything you need, in one building", "Tests, scans, surgery, dialysis, intensive care and your medicines — all under one roof, on one record."],
      doctors: ["Our consultants", "Meet the doctors", "Clinic days, fees and the next free slot — live from our booking system."],
      tour: ["Inside the hospital", "Spaces designed for healing", "Calm, clean and easy to find your way around."],
      news: ["Health blog", "Advice from our clinicians", "Practical guidance for you and your family."],
      testimonials: ["Patient stories", "In their words", ""],
      accreditations: ["Recognition", "Accreditations", ""],
    },
    cta: { title: "Need to see a doctor?", sub: "Choose a consultant and a time online — it takes under two minutes.", book: "Book appointment", call: "Call the hospital" },
    footer: { about: "A multi-specialty hospital and research centre in People's Colony No 1, Faisalabad — consultants, diagnostics, surgery and inpatient care under one roof.",
      quick: "Quick links", depts: "Departments", contact: "Contact", newsletter: "Health tips by email", newsSub: "Occasional, useful, never spam.", subscribe: "Subscribe",
      emailPh: "Your email", rights: "All rights reserved.", privacy: "Privacy", terms: "Terms", staff: "Staff login", thanks: "Thank you — you're on the list.",
      subFail: "Please check the email address and try again.", subBusy: "Too many tries from this connection — please try later." },
    float: { emergency: "Emergency 24/7", whatsapp: "WhatsApp", top: "Back to top" },
    search: { ph: "Search doctors, departments, services, places…", none: "Nothing found. Try “cardiology” or “pharmacy”.", pages: "Pages", doctors: "Doctors", depts: "Departments", services: "Services", places: "Places" },
    common: { book: "Book appointment", more: "Learn more", next: "Next available", today: "Available today", fee: "Consultation", profile: "View profile", directions: "Get directions", openMap: "Open in Google Maps", call: "Call" },
  },
  ur: {
    name: "لائل پور میڈیکل کمپلیکس", tagline: "LMC", city: "فیصل آباد، پاکستان",
    top: { emergency: "ایمرجنسی 24/7", search: "تلاش", lang: "English", theme: "تھیم" },
    nav: { home: "ہوم", about: "ہمارے بارے میں", departments: "شعبے", services: "خدمات", doctors: "ڈاکٹر", rooms: "کمرے", patients: "مریض اور ملاقاتی",
      pharmacy: "فارمیسی", map: "ہسپتال کا نقشہ", directions: "راستہ", news: "صحت بلاگ", careers: "ملازمتیں", contact: "رابطہ", book: "اپائنٹمنٹ بک کریں",
      all: "سب دیکھیں", menu: "مینو", close: "بند کریں" },
    hero: { eyebrow: "فیصل آباد · پیپلز کالونی", words: "ہمدردانہ نگہداشت، جدید علاج۔", sub: "ماہر کنسلٹنٹس، چوبیس گھنٹے ایمرجنسی، جدید تشخیص اور آرام دہ کمرے — ایک ہی چھت تلے، اور ایک ہی میڈیکل ریکارڈ جو پہلے دورے سے آپ کے ساتھ رہتا ہے۔",
      book: "اپائنٹمنٹ بک کریں", find: "ڈاکٹر تلاش کریں", emergency: "ایمرجنسی" },
    quick: [["شعبے", "تمام شعبے ایک چھت تلے"], ["خدمات", "ٹیسٹ، اسکین، سرجری اور مزید"], ["راستہ معلوم کریں", "پیپلز کالونی نمبر 1، فیصل آباد"], ["مریض پورٹل", "رپورٹس، وزٹ اور بکنگ"]] as [string, string][],
    stats: { beds: "بستر", doctors: "کنسلٹنٹس", departments: "شعبے", floors: "منزلیں" },
    sections: {
      depts: ["شعبہ جات", "آپ کے لیے بنائے گئے شعبے", "ماہر ٹیمیں جو ایک ہی ریکارڈ سے کام کرتی ہیں، تاکہ کلینک سے وارڈ تک علاج مربوط رہے۔"],
      services: ["خدمات", "ہر سہولت، ایک ہی عمارت میں", "ٹیسٹ، اسکین، سرجری، ڈائیلاسز، انتہائی نگہداشت اور ادویات — سب ایک چھت تلے، ایک ہی ریکارڈ پر۔"],
      doctors: ["ہمارے کنسلٹنٹس", "ڈاکٹروں سے ملیں", "کلینک کے دن، فیس اور اگلا خالی وقت — براہِ راست ہمارے بکنگ سسٹم سے۔"],
      tour: ["ہسپتال کے اندر", "شفا کے لیے بنائی گئی جگہیں", "پُرسکون، صاف ستھری اور راستہ تلاش کرنے میں آسان۔"],
      news: ["صحت بلاگ", "ہمارے معالجین کے مشورے", "آپ اور آپ کے خاندان کے لیے عملی رہنمائی۔"],
      testimonials: ["مریضوں کی رائے", "ان کے الفاظ میں", ""],
      accreditations: ["اعتراف", "منظوریاں", ""],
    },
    cta: { title: "ڈاکٹر سے ملنا ہے؟", sub: "آن لائن کنسلٹنٹ اور وقت منتخب کریں — دو منٹ سے کم لگتے ہیں۔", book: "اپائنٹمنٹ بک کریں", call: "ہسپتال کو کال کریں" },
    footer: { about: "پیپلز کالونی نمبر 1، فیصل آباد میں ملٹی اسپیشلٹی ہسپتال اور ریسرچ سینٹر — کنسلٹنٹس، تشخیص، سرجری اور داخلہ علاج ایک ہی چھت تلے۔",
      quick: "اہم لنکس", depts: "شعبے", contact: "رابطہ", newsletter: "ای میل پر صحت کے مشورے", newsSub: "کبھی کبھار، مفید، کوئی اسپام نہیں۔", subscribe: "سبسکرائب",
      emailPh: "آپ کی ای میل", rights: "جملہ حقوق محفوظ ہیں۔", privacy: "پرائیویسی", terms: "شرائط", staff: "اسٹاف لاگ ان", thanks: "شکریہ — آپ فہرست میں شامل ہو گئے۔",
      subFail: "براہ کرم ای میل ایڈریس چیک کر کے دوبارہ کوشش کریں۔", subBusy: "اس کنکشن سے بہت زیادہ کوششیں — براہ کرم بعد میں کوشش کریں۔" },
    float: { emergency: "ایمرجنسی 24/7", whatsapp: "واٹس ایپ", top: "اوپر جائیں" },
    search: { ph: "ڈاکٹر، شعبے، خدمات یا جگہ تلاش کریں…", none: "کچھ نہیں ملا۔ “cardiology” یا “pharmacy” آزمائیں۔", pages: "صفحات", doctors: "ڈاکٹر", depts: "شعبے", services: "خدمات", places: "جگہیں" },
    common: { book: "اپائنٹمنٹ بک کریں", more: "مزید جانیں", next: "اگلا دستیاب وقت", today: "آج دستیاب", fee: "فیس", profile: "پروفائل دیکھیں", directions: "راستہ دیکھیں", openMap: "گوگل میپس میں کھولیں", call: "کال کریں" },
  },
};
export type UICopy = typeof UI.en;

export interface Dept {
  slug: string; name: string; ur: string; icon: string; img: string; summary: string; overview: string;
  services: string[]; technology: string[]; match: string[]; floor: string;
}

/** Departments (names follow the hospital's Medical Department records). `match` links doctors by specialty. */
export const DEPARTMENTS: Dept[] = [
  { slug: "general-medicine", name: "General Medicine (OPD)", ur: "جنرل میڈیسن (او پی ڈی)", icon: "stethoscope", img: PHOTOS.reception, floor: "1",
    summary: "Your first stop for fever, infections, diabetes, blood pressure and everyday illness.",
    overview: "Our general physicians see adults for acute illness and long-term conditions. They order tests, start treatment and, when you need a specialist, refer you within the hospital so your history goes with you.",
    services: ["Walk-in and booked consultations", "Diabetes and blood-pressure clinics", "Fever, infection and dengue assessment", "Pre-employment and fitness check-ups", "Vaccination advice"],
    technology: ["Electronic medical record shared across departments", "Same-day laboratory reporting", "SMS / WhatsApp report links"], match: ["general physician", "physician", "medicine"] },
  { slug: "cardiology", name: "Cardiology", ur: "امراض قلب", icon: "heart", img: PHOTOS.icu, floor: "1",
    summary: "Heart clinics, ECG and echocardiography, with the CCU on hand.",
    overview: "Our cardiologists assess chest pain, palpitations, breathlessness and high blood pressure, and follow patients after heart attacks. Urgent cases move straight to monitored beds.",
    services: ["Cardiology clinic", "ECG", "Echocardiography", "Exercise tolerance testing", "Hypertension and cholesterol management", "Coronary care (CCU)"],
    technology: ["12-lead ECG", "Cardiac monitors in critical care", "Cath lab"], match: ["cardio"] },
  { slug: "emergency", name: "Emergency & Trauma", ur: "ایمرجنسی اور ٹراما", icon: "siren", img: PHOTOS.corridor, floor: "G",
    summary: "Open 24 hours. Triage on arrival, monitored bays, rapid decisions.",
    overview: "The emergency department is staffed day and night. Every patient is triaged on arrival so the sickest are seen first, then stabilised, investigated and treated, admitted or referred.",
    services: ["24/7 triage and resuscitation", "Trauma and fracture care", "Chest pain and stroke pathways", "Poisoning and heat-stroke care", "Ambulance handover bay"],
    technology: ["Monitored emergency bays", "Bedside X-ray and laboratory priority", "Defibrillators and ventilators"], match: ["emergency"] },
  { slug: "neurology", name: "Neurology", ur: "اعصابی امراض", icon: "brain", img: PHOTOS.lounge, floor: "1",
    summary: "Headache, epilepsy, stroke and nerve disorders.",
    overview: "Neurologists diagnose and treat conditions of the brain, spine and nerves, working closely with radiology for CT and MRI.",
    services: ["Neurology clinic", "Stroke assessment and follow-up", "Epilepsy and seizure care", "Headache and migraine clinic", "Nerve and muscle disorders"],
    technology: ["CT and MRI imaging", "Shared imaging reports"], match: ["neuro"] },
  { slug: "nephrology", name: "Nephrology & Dialysis", ur: "گردے اور ڈائیلاسز", icon: "droplets", img: PHOTOS.room, floor: "1",
    summary: "Kidney care and haemodialysis sessions.",
    overview: "Kidney specialists manage chronic kidney disease, kidney stones and electrolyte problems, and run regular haemodialysis sessions with monitoring throughout.",
    services: ["Kidney clinic", "Haemodialysis", "Electrolyte and fluid management", "Dialysis access follow-up"], technology: ["Dialysis machines with RO water", "Laboratory renal profiles"], match: ["nephro", "kidney"] },
  { slug: "orthopaedics", name: "Orthopaedics", ur: "ہڈی و جوڑ", icon: "bone", img: PHOTOS.corridor, floor: "1",
    summary: "Fractures, joints, spine and sports injuries.",
    overview: "Orthopaedic surgeons treat broken bones, joint pain, back problems and sports injuries — from plaster and physiotherapy to surgery.",
    services: ["Fracture clinic", "Joint pain and arthritis", "Back and spine problems", "Sports injuries", "Orthopaedic surgery"], technology: ["Digital X-ray", "Operation theatres"], match: ["ortho"] },
  { slug: "gynaecology", name: "Gynaecology & Obstetrics", ur: "زچہ و بچہ / امراض نسواں", icon: "baby", img: PHOTOS.room, floor: "6",
    summary: "Antenatal care, safe delivery and women's health.",
    overview: "Our gynaecologists look after women through pregnancy, delivery and beyond — antenatal clinics, normal and caesarean delivery, and gynaecological care.",
    services: ["Antenatal clinic", "Normal delivery", "Caesarean section", "Ultrasound scans", "Gynaecology clinic", "Family planning advice"], technology: ["Ultrasound", "Labour room and theatre"], match: ["gynae", "obstet"] },
  { slug: "paediatrics", name: "Paediatrics", ur: "امراض اطفال", icon: "baby", img: PHOTOS.lounge, floor: "6",
    summary: "Care for babies, children and teenagers.",
    overview: "Paediatricians care for children from birth to adolescence — illness, growth, vaccinations and admissions to our children's ward.",
    services: ["Children's clinic", "Newborn check-ups", "Growth and nutrition", "Vaccination", "Children's ward"], technology: ["Paediatric monitoring", "Child-friendly ward"], match: ["paed", "pedia", "child"] },
  { slug: "general-surgery", name: "General Surgery", ur: "جنرل سرجری", icon: "scissors", img: PHOTOS.icu, floor: "3",
    summary: "Planned and emergency surgery with day-care options.",
    overview: "Surgeons perform planned and emergency operations — hernia, gallbladder, appendix and more — with recovery on the ward or as day care when safe.",
    services: ["Surgical clinic", "Hernia and gallbladder surgery", "Appendectomy", "Day-care procedures", "Wound care"], technology: ["Modern operation theatres", "Post-operative recovery area"], match: ["surg"] },
  { slug: "ent", name: "ENT", ur: "ناک، کان، گلا", icon: "ear", img: PHOTOS.reception, floor: "1",
    summary: "Ear, nose and throat — clinic and surgery.",
    overview: "ENT specialists treat hearing problems, sinus disease, tonsils and voice disorders, in clinic and in theatre.",
    services: ["ENT clinic", "Hearing assessment", "Sinus care", "Tonsil and adenoid surgery"], technology: ["ENT examination unit", "Operation theatres"], match: ["ent"] },
  { slug: "dermatology", name: "Dermatology", ur: "جلدی امراض", icon: "sparkles", img: PHOTOS.lounge, floor: "1",
    summary: "Skin, hair and nail conditions.",
    overview: "Dermatologists diagnose and treat skin, hair and nail problems — acne, eczema, infections and allergies.",
    services: ["Skin clinic", "Acne and eczema", "Hair and nail problems", "Allergy assessment"], technology: ["Dermatology procedures room"], match: ["derma", "skin"] },
  { slug: "radiology", name: "Radiology & Imaging", ur: "ریڈیالوجی اور امیجنگ", icon: "scan", img: PHOTOS.corridor, floor: "2",
    summary: "MRI, CT, X-ray and ultrasound with reports in the shared record.",
    overview: "Radiology provides the scans your doctor needs, with reports added to your record so every department sees them.",
    services: ["MRI", "CT scan", "Digital X-ray", "Ultrasound and Doppler"], technology: ["MRI scanner", "CT scanner", "Digital radiography", "Ultrasound"], match: ["radiolog"] },
  { slug: "laboratory", name: "Pathology & Laboratory", ur: "پیتھالوجی اور لیبارٹری", icon: "flask", img: PHOTOS.pharmacy, floor: "2",
    summary: "Blood, urine and culture tests — reports to your phone.",
    overview: "The laboratory runs routine and specialised tests. Results are verified by a pathologist and sent to your phone as a secure link with a QR code to confirm they are genuine.",
    services: ["Blood tests", "Urine and stool tests", "Cultures", "Hormone and special tests", "Home sample collection on request"], technology: ["Automated analysers", "QR-verified digital reports"], match: ["patholog", "lab"] },
];

export interface ServiceGroup { id: string; title: string; icon: string; /** "" → illustrated panel until a real photo is supplied */ img: string; text: string; items: string[]; /** own page (D-91/D-95) instead of /site/services#id */ href?: string }
/** Where a service links: its own page when it has one, else its section on /site/services. */
export const serviceLink = (s: ServiceGroup) => s.href ?? `/site/services#${s.id}`;
export const SERVICES: ServiceGroup[] = [
  { id: "laboratory", title: "Laboratory", icon: "microscope", img: "", text: "Routine and special tests, verified by a pathologist and sent to your phone.", items: ["Blood and urine tests", "Cultures and sensitivities", "Hormone and thyroid tests", "Health check-up profiles"] },
  { id: "mri", title: "MRI", icon: "magnet", img: "", text: "Detailed, radiation-free scans of the brain, spine, joints and soft tissue, reported by a radiologist.", items: ["Brain and spine MRI", "Joint and sports-injury MRI", "Abdomen and pelvis MRI", "Contrast studies"] },
  { id: "ct-scan", title: "CT scan", icon: "scan", img: "", text: "Fast cross-sectional imaging — for emergencies, chest and abdomen, and planning treatment.", items: ["Head CT (stroke and injury)", "Chest and abdomen CT", "CT with contrast", "CT angiography"] },
  { id: "ultrasound", title: "Ultrasound", icon: "waves", img: "", text: "Safe, painless scans with no radiation — including pregnancy and Doppler studies.", items: ["Abdomen and pelvis", "Pregnancy (obstetric) scans", "Doppler studies", "Thyroid, breast and soft tissue"], href: "/site/radiology" },
  { id: "x-ray", title: "X-ray", icon: "bone", img: "", text: "Digital X-rays in minutes, with images in your record for every doctor to see.", items: ["Chest X-ray", "Bones and joints", "Spine", "Portable X-ray for wards and ICU"], href: "/site/radiology" },
  { id: "surgery", title: "Surgery", icon: "scissors", img: PHOTOS.icu, text: "Planned and emergency operations in modern theatres.", items: ["General surgery", "Orthopaedic surgery", "Gynaecological surgery", "ENT surgery"] },
  { id: "daycare", title: "Day care", icon: "clock", img: PHOTOS.room, text: "Minor procedures and infusions without an overnight stay.", items: ["Day-care procedures", "Infusions", "Dressings", "Minor operations"] },
  { id: "emergency", title: "Emergency 24/7", icon: "siren", img: PHOTOS.corridor, text: "Triage, resuscitation and monitored bays, day and night.", items: ["Triage on arrival", "Trauma care", "Chest pain & stroke", "Ambulance handover"] },
  { id: "critical", title: "Critical care (ICU / CCU)", icon: "activity", img: PHOTOS.icu, text: "Monitored beds and specialist nursing around the clock.", items: ["Intensive care", "Coronary care", "Ventilator support", "Family waiting area"] },
  { id: "nursery", title: "Nursery & Newborn Care", icon: "baby", img: "", text: "Rooming-in, a well-baby nursery and paediatricians for every newborn — from the very first breath.", items: ["Newborn examination", "Birth vaccinations", "Jaundice care & phototherapy", "Lactation support"], href: "/site/nursery" },
  { id: "nicu", title: "NICU", icon: "heart", img: PHOTOS.icu, text: "Neonatal intensive care for premature and sick babies, with parents welcome 24/7.", items: ["Incubators & CPAP", "Ventilator support", "Phototherapy", "Kangaroo mother care"], href: "/site/nursery#nicu" },
  { id: "dialysis", title: "Dialysis", icon: "droplets", img: PHOTOS.room, text: "Scheduled haemodialysis with monitoring throughout.", items: ["Haemodialysis", "Kidney clinic", "Access follow-up"] },
  { id: "telemedicine", title: "Online consultation", icon: "video", img: PHOTOS.lounge, text: "See a consultant by video for follow-ups and advice.", items: ["Video follow-ups", "e-Prescription", "Report review"] },
  { id: "pharmacy", title: "Pharmacy", icon: "pill", img: PHOTOS.pharmacy, text: "In-house pharmacy for prescriptions and ward medicines.", items: ["Prescriptions", "Ward medicines", "Medicine counselling"] },
];

/** Facilities patients ask about, with the floor (see FLOORS). */
export const AMENITIES = {
  private: ["Private bathroom", "Attendant bed or sofa", "Television", "Wi-Fi", "Nurse call bell", "Daily housekeeping"],   // [confirm]
  general: ["Separate male, female and children's wards", "Nurse station on every ward", "Curtained beds", "Visitor seating"], // [confirm]
  critical: ["Cardiac monitors on every bed", "Ventilators", "1:1 or 1:2 nursing for the sickest patients", "Family waiting area"], // [confirm]
};

export interface Place { id: string; name: string; zone: Zone; keywords?: string }
export type Zone = "care" | "diagnostic" | "critical" | "ward" | "public" | "admin" | "emergency";
export interface Floor { id: string; label: string; places: Place[] }

/** Floor guide [confirm with the hospital before go-live]. Based on the brand board signage (Floor 3: ICU / CCU, theatres, cath lab). */
export const FLOORS: Floor[] = [
  { id: "B", label: "Basement", places: [
    { id: "parking-b", name: "Parking", zone: "public", keywords: "car park" }, { id: "store", name: "Stores", zone: "admin" }, { id: "lifts-b", name: "Lifts", zone: "public" }] },
  { id: "G", label: "Ground floor", places: [
    { id: "emergency", name: "Emergency (24/7)", zone: "emergency", keywords: "er accident trauma casualty" }, { id: "reception", name: "Reception & registration", zone: "public", keywords: "front desk help" },
    { id: "pharmacy", name: "Pharmacy", zone: "public", keywords: "medicine chemist" }, { id: "cafeteria", name: "Cafeteria", zone: "public", keywords: "food tea canteen" },
    { id: "prayer", name: "Prayer room", zone: "public", keywords: "masjid namaz" }, { id: "atm", name: "ATM", zone: "public", keywords: "cash bank" },
    { id: "billing", name: "Billing & cash", zone: "admin", keywords: "payment" }, { id: "restrooms-g", name: "Restrooms", zone: "public", keywords: "toilet washroom" }] },
  { id: "1", label: "First floor", places: [
    { id: "opd", name: "OPD consultant clinics", zone: "care", keywords: "doctor clinic outpatient" }, { id: "cardio-clinic", name: "Cardiology clinic & ECG", zone: "care", keywords: "heart echo" },
    { id: "dialysis", name: "Dialysis unit", zone: "care", keywords: "kidney nephrology" }, { id: "neuro-clinic", name: "Neurology clinic", zone: "care" },
    { id: "restrooms-1", name: "Restrooms", zone: "public", keywords: "toilet washroom" }] },
  { id: "2", label: "Second floor", places: [
    { id: "lab", name: "Laboratory & sample collection", zone: "diagnostic", keywords: "blood test pathology" }, { id: "radiology", name: "Radiology", zone: "diagnostic", keywords: "imaging" },
    { id: "mri", name: "MRI", zone: "diagnostic" }, { id: "ct", name: "CT scan", zone: "diagnostic" }, { id: "xray", name: "X-ray", zone: "diagnostic" },
    { id: "ultrasound", name: "Ultrasound", zone: "diagnostic", keywords: "scan doppler" }] },
  { id: "3", label: "Third floor", places: [
    { id: "icu", name: "ICU / CCU", zone: "critical", keywords: "intensive coronary care" }, { id: "ot", name: "Operation theatres", zone: "critical", keywords: "surgery ot" },
    { id: "cathlab", name: "Cath lab", zone: "critical", keywords: "angiography" }, { id: "icu-wait", name: "Family waiting area", zone: "public" }] },
  { id: "4", label: "Fourth floor", places: [{ id: "private", name: "Private rooms", zone: "ward", keywords: "room suite" }, { id: "ns-4", name: "Nurse station", zone: "ward" }] },
  { id: "5", label: "Fifth floor", places: [{ id: "ward-m", name: "General ward (male)", zone: "ward" }, { id: "ward-f", name: "General ward (female)", zone: "ward" }, { id: "ns-5", name: "Nurse station", zone: "ward" }] },
  { id: "6", label: "Sixth floor", places: [{ id: "labour", name: "Labour & maternity", zone: "ward", keywords: "delivery gynae" }, { id: "children", name: "Children's ward", zone: "ward", keywords: "paediatric" }] },
  { id: "7", label: "Seventh floor", places: [{ id: "admin", name: "Administration", zone: "admin", keywords: "office management" }, { id: "records", name: "Medical records", zone: "admin" }, { id: "hall", name: "Conference hall", zone: "admin" }] },
];

export const ZONES: Record<Zone, { label: string; color: string }> = {
  emergency: { label: "Emergency", color: "#E5322F" }, care: { label: "Clinics", color: "#0E5E6F" }, diagnostic: { label: "Diagnostics", color: "#7C5CC4" },
  critical: { label: "Critical care & theatres", color: "#D9822B" }, ward: { label: "Wards & rooms", color: "#2E9E7B" }, public: { label: "Public & services", color: "#5B7083" }, admin: { label: "Administration", color: "#94A3B8" },
};

export const FAQS: [string, string][] = [
  ["Do I need an appointment to see a doctor?", "Booking online or by phone saves waiting, but OPD clinics also see walk-in patients by token. In an emergency, come straight to the emergency department — no appointment is needed."],
  ["What should I bring to my visit?", "Your CNIC (or the patient's B-form for children), previous prescriptions and reports, and a list of the medicines you take. If you have a patient card, bring it — it carries your MR number."],
  ["How do I get my lab report?", "When the report is ready we send a secure link by SMS or WhatsApp. It opens on your phone and carries a QR code anyone can scan to confirm the report is genuine. Printed copies are available at the laboratory counter."],
  ["What are the visiting hours?", `Ward visiting hours are ${CONFIG.visitingHours}. One attendant may stay with each patient. Critical-care visits are short and arranged with the nurse in charge.`],
  ["Do you accept insurance and corporate panels?", "Yes, for panels and insurers we work with. Bring your panel card or authorisation letter; our billing desk confirms cover before treatment where possible."],
  ["How are bills paid?", "At the billing desk by cash or card, and by the bank and mobile-wallet channels shown on your bill. Admitted patients receive interim bills, and a final bill at discharge."],
  ["Is there parking?", "Yes — parking is available at the hospital. Ambulances use the emergency entrance, which must be kept clear."],
];

export interface Article { slug: string; title: string; tag: string; minutes: number; img: string; excerpt: string; body: string[] }
export const ARTICLES: Article[] = [
  { slug: "blood-pressure-numbers", title: "Know your blood-pressure numbers", tag: "Heart health", minutes: 4, img: PHOTOS.icu,
    excerpt: "High blood pressure rarely causes symptoms — which is why checking it matters.",
    body: ["High blood pressure (hypertension) is one of the most common reasons adults visit our clinics. It usually causes no symptoms at all, yet over the years it strains the heart, kidneys, brain and eyes.",
      "A reading below 120/80 is ideal. Readings repeatedly at 140/90 or above on separate days usually mean hypertension. Anything above 180/120 — especially with chest pain, breathlessness, severe headache or weakness — needs emergency care.",
      "Small changes help: less salt (watch pickles, papad and namkeen), regular walking, keeping a healthy weight and stopping smoking. If your doctor prescribes medicine, take it every day even when you feel well.",
      "Check your blood pressure at least once a year from age 18, and more often if you have diabetes, kidney disease or a family history of heart disease."] },
  { slug: "summer-heat-stroke", title: "Staying safe in Faisalabad's summer heat", tag: "Seasonal", minutes: 3, img: PHOTOS.corridor,
    excerpt: "Heat exhaustion can turn into heat stroke quickly. Here's what to watch for.",
    body: ["Summer temperatures in Faisalabad often pass 45 °C. Older people, young children, outdoor workers and anyone with heart or kidney disease are most at risk.",
      "Heat exhaustion causes heavy sweating, weakness, dizziness, headache and nausea. Move to a cool place, loosen clothing, sip water or ORS and rest.",
      "Heat stroke is an emergency: a very high temperature, hot dry skin, confusion, fainting or fits. Call for help, cool the person with water and fanning, and bring them to emergency immediately.",
      "Prevent it by drinking water through the day, avoiding the sun between noon and 4 pm, wearing light loose clothes and never leaving children in parked cars."] },
  { slug: "dengue-season", title: "Dengue: protect your family this season", tag: "Infections", minutes: 4, img: PHOTOS.lounge,
    excerpt: "Dengue peaks after the monsoon. Prevention starts at home.",
    body: ["Dengue is spread by the Aedes mosquito, which breeds in clean standing water and bites mostly in the early morning and evening.",
      "Empty, cover or clean anything that holds water — coolers, flower pots, tyres, water tanks — at least once a week. Use repellent, nets and full-sleeved clothes.",
      "Typical symptoms are sudden high fever, severe body and eye pain, headache and rash. Use paracetamol for fever and avoid aspirin and ibuprofen unless a doctor advises them.",
      "See a doctor if the fever lasts more than two days. Come to emergency at once for bleeding gums or nose, black stools, persistent vomiting, severe abdominal pain, or drowsiness — especially as the fever settles."] },
  { slug: "when-to-go-to-emergency", title: "When to go to emergency — and when to book a clinic", tag: "Patient guide", minutes: 3, img: PHOTOS.reception,
    excerpt: "Knowing where to go saves time — and sometimes lives.",
    body: ["Come straight to emergency, day or night, for chest pain, difficulty breathing, sudden weakness or numbness of the face or limbs, slurred speech, fits, serious injuries, heavy bleeding, poisoning, or a child who is unusually drowsy.",
      "For fever, cough, joint pain, skin problems or review of long-term conditions, an OPD appointment is usually right. Booking online lets you choose a time and avoid waiting.",
      "If you are not sure, call the hospital — our staff will guide you."] },
];

export const CAREERS = {
  intro: "We are growing, and we look for people who care about patients and about doing things properly. Tell us about yourself — we keep every application on file and contact you when a suitable post opens.",
  areas: [["Nursing", "Staff nurses and charge nurses for wards, ICU and theatres."], ["Medical officers", "MBBS doctors for emergency, wards and OPD."], ["Allied health", "Laboratory technologists, radiographers, dialysis and OT technicians."],
    ["Pharmacy", "Pharmacists and pharmacy assistants."], ["Administration", "Reception, billing, IT and housekeeping."]] as [string, string][],
};
