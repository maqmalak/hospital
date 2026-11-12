/**
 * VVSDesk landing page copy (D-69), English and Urdu. All copy is original. Placeholders in [brackets] are for the owner to
 * replace (numbers, prices, testimonials, contact details) — nothing here is a real figure or a real customer.
 * Edit CONFIG for the things that change most: WhatsApp number, demo endpoint, prices, stats, contact.
 */
export const CONFIG = {
  whatsapp: "92XXXXXXXXXX",            // international format, digits only — [replace]
  whatsappText: "Hi VVSDesk, I'd like to know more about the hospital system.",
  demoEndpoint: "/api/method/hospital_vvs.api.public.book_demo",  // [API endpoint placeholder] — creates an ERPNext Lead
  phone: "+92 [XXX XXXXXXX]",
  email: "[hello@vvsdesk.pk]",
  address: "[Office address, City, Pakistan]",
  // null = show the [X] placeholder; a number = animated counter
  // SAMPLE figures (owner asked for numbers instead of [X]) — replace with real, verifiable numbers before the page goes public
  stats: { hospitals: 35, patients: 4200, reports: 18500, cities: 9 } as Record<string, number | null>,
  // monthly price in PKR; yearly shows 12 × monthly (no yearly discount set). Enterprise is a starting price ("from").
  prices: { clinic: 10000, hospital: 20000, enterprise: 50000 } as Record<string, number>,
  social: { facebook: "#", linkedin: "#", youtube: "#", instagram: "#" },
};

export type Lang = "en" | "ur";

const en = {
  meta: {
    title: "VVSDesk – Hospital Management System Software in Pakistan | WhatsApp Booking & Lab Reports",
    description: "VVSDesk is hospital management software for Pakistan: OPD, IPD, lab, pharmacy and billing in one system, with WhatsApp booking and lab reports.",
  },
  nav: { features: "Features", whatsapp: "WhatsApp", pricing: "Pricing", why: "Why VVSDesk", faq: "FAQ", demo: "Book a Demo", login: "Login to ERP", menu: "Menu", close: "Close menu", chat: "Chat on WhatsApp", lang: "اردو" },
  hero: {
    eyebrow: "Hospital management system for Pakistan",
    h1a: "Run your entire hospital from one desk",
    h1b: "— and reach patients on WhatsApp.",
    sub: "VVSDesk connects OPD, IPD, pharmacy, lab, billing and appointments in one system, with booking and lab reports delivered straight to your patients' WhatsApp.",
    cta: "Book a Free Demo", cta2: "Chat on WhatsApp",
    trust: ["Cloud or on-premise", "Urdu & English", "PHC / SHCC documentation-ready", "Your data, your server"],
    shotAlt: "VVSDesk desktop showing the hospital's apps — OPD, clinic, laboratory, IPD, pharmacy, cash and finance — with live counts",
    chat: { name: "VVS Hospital", status: "online", m1: "Assalam-o-Alaikum Ahmed sahib 👋", m2: "Your CBC report is ready 📄", file: "CBC-Report.pdf · 1 page", m3: "JazakAllah! Can I book a follow-up with Dr. Ayesha?", m4: "Sure — Thursday 11:15 am is free. Reply 1 to confirm.", time: "10:42" },
  },
  problems: {
    title: "The everyday problems, solved at the source",
    items: [
      { p: "Long OPD queues", s: "Online and WhatsApp booking spreads patients across the day, and the token screen tells everyone where they stand." },
      { p: "Patients calling for reports", s: "Verified lab reports go out on WhatsApp by themselves — a secure PDF, no phone calls, no printing queues." },
      { p: "Billing leakage", s: "Every test, medicine and bed-day is billed from the order itself, so nothing given is left unbilled." },
    ],
  },
  wa: {
    eyebrow: "WhatsApp-first", title: "Your patients already use WhatsApp. Now your hospital does too.",
    sub: "Patients don't need another app. Bookings, reminders, reports and bills reach them on the number they already have.",
    items: [
      { t: "Book on WhatsApp or the web portal", d: "Patients pick a doctor and a time in a short chat or on your website. The booking lands in reception's list with the patient's details.", chat: ["I want to see a child specialist", "Dr. Sana Malik is free today at 4:30 pm and tomorrow at 10:00 am. Which one?", "Today 4:30", "Booked ✅ Token 7 · Please arrive 10 minutes early."] },
      { t: "Confirmations and reminders, automatically", d: "A confirmation goes out the moment reception approves, and a reminder before the visit — so fewer empty slots.", chat: ["Reminder: your appointment with Dr. Imran Qureshi is tomorrow at 11:00 am.", "Reply 1 to confirm or 2 to reschedule.", "1", "Thank you — see you tomorrow."] },
      { t: "Lab reports the moment they're verified", d: "As soon as the pathologist signs, the report is sent as a secure PDF with a QR code anyone can check.", chat: ["Your Lipid Profile report is ready 📄", "LipidProfile.pdf", "Thank you!", "Show this QR to any doctor to verify the report."] },
      { t: "Payment links, discharge summaries, follow-ups", d: "Send a payment link for an advance, the discharge summary when the patient leaves, and a follow-up reminder a week later.", chat: ["Discharge summary for Bushra Mirza is attached.", "DischargeSummary.pdf", "Please book a follow-up in 7 days. Reply BOOK.", "BOOK"] },
    ],
  },
  modules: {
    eyebrow: "Modules", title: "Everything a hospital runs on — arranged the way a patient moves",
    learn: "Learn more",
    groups: [
      { g: "Front desk", items: [["Patient registration & MRN", "One record per patient, duplicate check, Urdu name, QR patient card."], ["Appointments & queue", "Counter, web and WhatsApp bookings with live token screens."], ["Patient web portal", "Book visits, see reports and pay online without calling."]] },
      { g: "Clinical", items: [["OPD", "Slip, nurse vitals, doctor queue and signed prescriptions."], ["IPD, ward & beds", "Live bed map, admissions, transfers and the running bill."], ["EMR", "Visits, vitals, prescriptions and results on one timeline."], ["Nursing & vitals", "Drug rounds, charting, diets and bedside calls."], ["Emergency", "Triage board, bays and disposition to ward or home."], ["OT scheduling", "Procedures, consent and theatre slots per admission."]] },
      { g: "Diagnostics", items: [["Laboratory (LIS)", "Paid-before-sample orders, barcodes, ranges, verification."], ["Radiology", "Imaging orders and reports linked to the visit and bill."]] },
      { g: "Pharmacy & stock", items: [["Pharmacy POS", "Load the prescription, pick by batch, pay now or at handover."], ["Inventory & procurement", "Requests, purchase orders, receipts and supplier bills."], ["Expiry & batch tracking", "First-expiry-first picking and near-expiry alerts."]] },
      { g: "Finance", items: [["Billing", "One cart per patient across OPD, lab, pharmacy and IPD."], ["Panel, corporate & insurance", "Pre-authorisations, payer shares and claims."], ["Accounting", "Ledgers, vouchers, trial balance and statements built in."], ["FBR-ready invoicing", "Invoices prepared for FBR POS reporting."]] },
      { g: "Management", items: [["HR & payroll", "Staff, shifts, attendance and salaries on the same platform."], ["Doctor share", "Commission per fee and procedure, earned when the patient pays."], ["Reports & dashboards", "Live charts for every department, by role."], ["Role-based access", "Each person sees only the screens and branches of their job."]] },
    ],
  },
  why: {
    eyebrow: "Why VVSDesk", title: "What makes VVSDesk different", typical: "Typical HMS", ours: "VVSDesk",
    rows: [
      ["Pricing on request, after a sales call", "Transparent plans you can compare before you call"],
      ["WhatsApp as a paid add-on, if at all", "WhatsApp booking, reminders and reports built in"],
      ["Proprietary system — your data is hard to take with you", "Built on the open-source ERPNext platform, with full data export: no vendor lock-in"],
      ["Cloud only", "Cloud, or on your own server inside the hospital"],
      ["Accounting and HR sold as separate products", "Accounting, HR and payroll included in the same system"],
    ],
  },
  how: {
    eyebrow: "How it works", title: "From first call to go-live",
    steps: [["Free demo", "We walk your team through VVSDesk with your own departments and workflows."], ["Data migration & setup", "We move patients, doctors, rates and stock from your old system or spreadsheets."], ["Staff training", "Role-by-role training on-site or remotely, in Urdu or English."], ["Go live & support", "We stay with you on launch day and after, with ongoing support."]],
  },
  stats: { title: "VVSDesk in numbers", hospitals: "hospitals", patients: "daily patients managed", reports: "reports delivered on WhatsApp", cities: "cities", note: "[Placeholder figures — replace with real numbers]" },
  pricing: {
    eyebrow: "Pricing", title: "Simple plans, priced in rupees", monthly: "Monthly", yearly: "Yearly", perMonth: "/month", perYear: "/year", popular: "Most popular", from: "from",
    custom: "Running more than one branch? We price multi-branch groups individually.", cta: "Book a demo", note: "Prices in Pakistani rupees, per hospital. Enterprise is customised to your departments and branches.",
    tiers: [
      { k: "clinic", n: "Clinic", d: "For single-doctor and small clinics", f: ["Registration & appointments", "OPD & prescriptions", "WhatsApp booking & reminders", "Billing & cash shifts", "Up to [X] users"] },
      { k: "hospital", n: "Hospital", d: "For hospitals with wards and a lab", f: ["Everything in Clinic", "IPD, beds & nursing", "Laboratory with WhatsApp reports", "Pharmacy POS & stock", "Panels & insurance claims", "Accounting & doctor share"] },
      { k: "enterprise", n: "Enterprise", d: "For large and multi-specialty hospitals", f: ["Everything in Hospital", "HR & payroll", "On-premise deployment", "Custom reports & integrations", "Priority support"] },
    ],
  },
  testimonials: {
    eyebrow: "Testimonials", title: "What hospital teams say", note: "[Placeholder testimonials — replace with real customer quotes and permission]", logos: "[Client logos]",
    items: [
      { q: "[Quote about faster OPD and fewer phone calls for reports.]", n: "[Name]", r: "[Designation]", h: "[Hospital name]", c: "[City]" },
      { q: "[Quote about billing accuracy and daily cash closing.]", n: "[Name]", r: "[Designation]", h: "[Hospital name]", c: "[City]" },
      { q: "[Quote about training, support and Urdu screens for staff.]", n: "[Name]", r: "[Designation]", h: "[Hospital name]", c: "[City]" },
    ],
  },
  security: {
    eyebrow: "Compliance & security", title: "Built for inspections, kept private by design",
    items: [["Role-based access", "Every user sees only the screens, branches and patients their job needs."], ["Audit trail on every record", "Who viewed or changed a patient record, and when, is kept for review."], ["Daily encrypted backups", "Backups are encrypted and checked, with a copy kept away from the server."], ["PHC & SHCC documentation support", "Records and registers organised to help you prepare for Punjab and Sindh Healthcare Commission inspections."], ["Hosting in Pakistan or on your server", "Choose a Pakistan-based cloud or keep everything on a server inside your hospital."]],
    note: "VVSDesk supports your documentation; certification and licensing remain with your hospital.",
  },
  faq: {
    eyebrow: "FAQ", title: "Questions hospitals ask us",
    items: [
      ["How much does VVSDesk cost?", "Clinic is PKR 10,000 a month, Hospital PKR 20,000 a month, and Enterprise starts from PKR 50,000 a month, customised to your departments. Multi-branch groups get a custom quote."],
      ["Cloud or on-premise?", "Both. Use a Pakistan-based cloud server, or install VVSDesk on a server inside your hospital so your data never leaves the building."],
      ["Can we migrate data from our old system?", "Yes. We import patients, doctors, fee schedules, rates, suppliers and opening stock from your previous software or Excel sheets during setup."],
      ["Does WhatsApp booking need a separate number?", "We recommend a dedicated WhatsApp Business number for the hospital so bookings and reports come from one trusted name. We help you set it up."],
      ["Does it work in Urdu?", "Yes. Every screen switches between English and Urdu, patient names can be kept in Urdu, and prescriptions and slips print in Urdu."],
      ["How long does setup take?", "A clinic can go live in days. A hospital with wards, lab and pharmacy usually takes a few weeks, depending on data migration and training."],
      ["What about internet outages?", "With an on-premise installation, VVSDesk runs on your local network without internet. Counters can keep billing and sync when the connection returns."],
      ["What training and support do you provide?", "Role-by-role training for reception, doctors, nurses, lab, pharmacy and accounts — on-site or online — plus manuals, videos and ongoing support after go-live."],
    ],
  },
  cta: {
    title: "See VVSDesk running your hospital in 30 minutes.", sub: "Tell us a little about your hospital and we'll set up a demo with your departments.",
    name: "Your name", hospital: "Hospital name", city: "City", beds: "Number of beds", wa: "WhatsApp number", submit: "Book Demo", sending: "Sending…",
    ok: "Thank you — we'll contact you on WhatsApp shortly.", err: "Something went wrong. Please try again or message us on WhatsApp.",
    bedOptions: ["Clinic (no beds)", "1–25 beds", "26–50 beds", "51–100 beds", "100+ beds"], required: "Please fill in every field.", phoneHint: "03XX XXXXXXX",
  },
  footer: {
    tagline: "Hospital management with WhatsApp built in — made for Pakistan.",
    product: "Product", company: "Company", resources: "Resources", contact: "Contact",
    links: { product: ["Features", "WhatsApp", "Pricing", "Modules"], company: ["About", "Careers", "Partners", "Contact"], resources: ["Help centre", "Guides & videos", "Data export", "Privacy policy"] },
    rights: "All rights reserved.",
  },
  float: "Chat with us on WhatsApp",
};

const ur: typeof en = {
  meta: en.meta,
  nav: { features: "خصوصیات", whatsapp: "واٹس ایپ", pricing: "قیمتیں", why: "VVSDesk کیوں", faq: "سوالات", demo: "ڈیمو بک کریں", login: "ای آر پی میں لاگ ان", menu: "مینو", close: "مینو بند کریں", chat: "واٹس ایپ پر بات کریں", lang: "English" },
  hero: {
    eyebrow: "پاکستان کے لیے ہسپتال مینجمنٹ سسٹم",
    h1a: "پورا ہسپتال ایک ڈیسک سے چلائیں",
    h1b: "— اور مریضوں تک واٹس ایپ پر پہنچیں۔",
    sub: "VVSDesk او پی ڈی، آئی پی ڈی، فارمیسی، لیب، بلنگ اور اپائنٹمنٹس کو ایک نظام میں جوڑتا ہے، اور بکنگ اور لیب رپورٹیں سیدھی مریض کے واٹس ایپ پر پہنچاتا ہے۔",
    cta: "مفت ڈیمو بک کریں", cta2: "واٹس ایپ پر بات کریں",
    trust: ["کلاؤڈ یا اپنا سرور", "اردو اور انگریزی", "PHC / SHCC دستاویزات کے لیے تیار", "آپ کا ڈیٹا، آپ کا سرور"],
    shotAlt: en.hero.shotAlt,
    chat: { name: "وی وی ایس ہسپتال", status: "آن لائن", m1: "السلام علیکم احمد صاحب 👋", m2: "آپ کی CBC رپورٹ تیار ہے 📄", file: "CBC-Report.pdf · 1 صفحہ", m3: "جزاک اللہ! کیا ڈاکٹر عائشہ کے ساتھ فالو اپ بک ہو سکتا ہے؟", m4: "جی — جمعرات صبح 11:15 خالی ہے۔ تصدیق کے لیے 1 لکھیں۔", time: "10:42" },
  },
  problems: {
    title: "روزمرہ کے مسائل، جڑ سے حل",
    items: [
      { p: "او پی ڈی میں لمبی قطاریں", s: "آن لائن اور واٹس ایپ بکنگ مریضوں کو دن بھر میں تقسیم کرتی ہے، اور ٹوکن اسکرین سب کو ان کی باری بتاتی ہے۔" },
      { p: "رپورٹ کے لیے مریضوں کی کالیں", s: "تصدیق شدہ لیب رپورٹیں خود بخود واٹس ایپ پر چلی جاتی ہیں — محفوظ PDF، نہ کال، نہ پرنٹ کی قطار۔" },
      { p: "بلنگ میں رساؤ", s: "ہر ٹیسٹ، دوا اور بستر کا دن آرڈر ہی سے بل ہوتا ہے، اس لیے دی گئی کوئی چیز بل کے بغیر نہیں رہتی۔" },
    ],
  },
  wa: {
    eyebrow: "واٹس ایپ سب سے پہلے", title: "آپ کے مریض پہلے ہی واٹس ایپ استعمال کرتے ہیں۔ اب آپ کا ہسپتال بھی۔",
    sub: "مریضوں کو نئی ایپ کی ضرورت نہیں۔ بکنگ، یاد دہانیاں، رپورٹیں اور بل اسی نمبر پر پہنچتے ہیں جو ان کے پاس پہلے سے ہے۔",
    items: [
      { t: "واٹس ایپ یا ویب پورٹل پر بکنگ", d: "مریض مختصر چیٹ یا آپ کی ویب سائٹ پر ڈاکٹر اور وقت منتخب کرتے ہیں۔ بکنگ مریض کی تفصیل کے ساتھ ریسیپشن کی فہرست میں آ جاتی ہے۔", chat: ["مجھے بچوں کے ڈاکٹر کو دکھانا ہے", "ڈاکٹر ثناء ملک آج شام 4:30 اور کل صبح 10 بجے دستیاب ہیں۔ کون سا وقت؟", "آج 4:30", "بک ہو گیا ✅ ٹوکن 7 · براہ کرم 10 منٹ پہلے آئیں۔"] },
      { t: "تصدیق اور یاد دہانی، خود بخود", d: "ریسیپشن کی منظوری پر فوراً تصدیق اور ملاقات سے پہلے یاد دہانی جاتی ہے — اس لیے خالی وقت کم۔", chat: ["یاد دہانی: کل صبح 11 بجے ڈاکٹر عمران قریشی سے آپ کی ملاقات ہے۔", "تصدیق کے لیے 1، وقت بدلنے کے لیے 2 لکھیں۔", "1", "شکریہ — کل ملاقات ہوگی۔"] },
      { t: "تصدیق ہوتے ہی لیب رپورٹ", d: "پیتھالوجسٹ کے دستخط کرتے ہی رپورٹ QR کوڈ کے ساتھ محفوظ PDF میں بھیج دی جاتی ہے جسے کوئی بھی جانچ سکتا ہے۔", chat: ["آپ کی لپڈ پروفائل رپورٹ تیار ہے 📄", "LipidProfile.pdf", "شکریہ!", "رپورٹ کی تصدیق کے لیے یہ QR کسی بھی ڈاکٹر کو دکھائیں۔"] },
      { t: "ادائیگی لنک، ڈسچارج سمری، فالو اپ", d: "پیشگی کے لیے ادائیگی لنک، رخصتی پر ڈسچارج سمری اور ایک ہفتے بعد فالو اپ کی یاد دہانی بھیجیں۔", chat: ["بشریٰ مرزا کی ڈسچارج سمری منسلک ہے۔", "DischargeSummary.pdf", "براہ کرم 7 دن میں فالو اپ بک کریں۔ BOOK لکھیں۔", "BOOK"] },
    ],
  },
  modules: {
    eyebrow: "ماڈیولز", title: "ہسپتال کی ہر ضرورت — مریض کے سفر کی ترتیب سے", learn: "مزید جانیں",
    groups: [
      { g: "فرنٹ ڈیسک", items: [["مریض کی رجسٹریشن اور MRN", "ہر مریض کا ایک ریکارڈ، ڈپلیکیٹ جانچ، اردو نام، QR کارڈ۔"], ["اپائنٹمنٹس اور قطار", "کاؤنٹر، ویب اور واٹس ایپ بکنگ، لائیو ٹوکن اسکرین کے ساتھ۔"], ["مریض ویب پورٹل", "کال کیے بغیر بکنگ، رپورٹیں اور آن لائن ادائیگی۔"]] },
      { g: "طبی", items: [["او پی ڈی", "پرچی، نرس کے وائٹلز، ڈاکٹر کی قطار اور دستخط شدہ نسخے۔"], ["آئی پی ڈی، وارڈ اور بستر", "لائیو بیڈ میپ، داخلے، منتقلی اور جاری بل۔"], ["EMR", "دورے، وائٹلز، نسخے اور نتائج ایک ٹائم لائن پر۔"], ["نرسنگ اور وائٹلز", "دوا کے راؤنڈ، چارٹنگ، غذا اور بستر سے کال۔"], ["ایمرجنسی", "ٹرائیج بورڈ، بے اور وارڈ یا گھر بھیجنا۔"], ["آپریشن تھیٹر شیڈول", "ہر داخلے کے لیے آپریشن، رضامندی اور تھیٹر کا وقت۔"]] },
      { g: "تشخیص", items: [["لیبارٹری (LIS)", "نمونے سے پہلے ادائیگی، بارکوڈ، رینج، تصدیق۔"], ["ریڈیالوجی", "امیجنگ آرڈر اور رپورٹیں دورے اور بل سے منسلک۔"]] },
      { g: "فارمیسی اور اسٹاک", items: [["فارمیسی POS", "نسخہ لوڈ کریں، بیچ سے چنیں، ابھی یا حوالگی پر ادائیگی۔"], ["انوینٹری اور خریداری", "درخواستیں، خریداری آرڈر، رسیدیں اور سپلائر بل۔"], ["میعاد اور بیچ ٹریکنگ", "پہلے ختم ہونے والا پہلے، اور قریب میعاد کی اطلاع۔"]] },
      { g: "مالیات", items: [["بلنگ", "او پی ڈی، لیب، فارمیسی اور آئی پی ڈی کے لیے مریض کی ایک کارٹ۔"], ["پینل، کارپوریٹ اور انشورنس", "پیشگی منظوری، ادا کنندہ کا حصہ اور دعوے۔"], ["اکاؤنٹنگ", "لیجر، واؤچر، ٹرائل بیلنس اور گوشوارے شامل۔"], ["FBR کے لیے تیار انوائس", "FBR POS رپورٹنگ کے لیے تیار انوائسز۔"]] },
      { g: "انتظامیہ", items: [["HR اور پے رول", "عملہ، شفٹیں، حاضری اور تنخواہیں اسی پلیٹ فارم پر۔"], ["ڈاکٹر کا حصہ", "فیس اور آپریشن پر کمیشن، مریض کی ادائیگی پر۔"], ["رپورٹیں اور ڈیش بورڈ", "ہر شعبے کے لائیو چارٹ، کردار کے مطابق۔"], ["کردار پر مبنی رسائی", "ہر شخص صرف اپنے کام کی اسکرینیں اور برانچ دیکھتا ہے۔"]] },
    ],
  },
  why: {
    eyebrow: "VVSDesk کیوں", title: "VVSDesk کو کیا مختلف بناتا ہے", typical: "عام HMS", ours: "VVSDesk",
    rows: [
      ["قیمت صرف سیلز کال کے بعد", "واضح پلان، کال سے پہلے موازنہ کریں"],
      ["واٹس ایپ اضافی قیمت پر، اگر ہو", "واٹس ایپ بکنگ، یاد دہانی اور رپورٹیں شامل"],
      ["بند نظام — ڈیٹا ساتھ لے جانا مشکل", "اوپن سورس ERPNext پلیٹ فارم پر، مکمل ڈیٹا ایکسپورٹ: کوئی پابندی نہیں"],
      ["صرف کلاؤڈ", "کلاؤڈ، یا ہسپتال کے اندر آپ کا اپنا سرور"],
      ["اکاؤنٹنگ اور HR الگ پروڈکٹ", "اکاؤنٹنگ، HR اور پے رول اسی نظام میں شامل"],
    ],
  },
  how: {
    eyebrow: "طریقہ کار", title: "پہلی کال سے لانچ تک",
    steps: [["مفت ڈیمو", "ہم آپ کی ٹیم کو آپ کے اپنے شعبوں کے ساتھ VVSDesk دکھاتے ہیں۔"], ["ڈیٹا منتقلی اور سیٹ اپ", "مریض، ڈاکٹر، نرخ اور اسٹاک پرانے نظام یا ایکسل سے منتقل کرتے ہیں۔"], ["عملے کی تربیت", "کردار وار تربیت، ہسپتال میں یا آن لائن، اردو یا انگریزی میں۔"], ["لانچ اور مدد", "لانچ کے دن اور بعد میں بھی ہم مسلسل ساتھ رہتے ہیں۔"]],
  },
  stats: { title: "VVSDesk اعداد میں", hospitals: "ہسپتال", patients: "روزانہ مریض", reports: "واٹس ایپ پر بھیجی گئی رپورٹیں", cities: "شہر", note: "[عارضی اعداد — اصل اعداد سے بدلیں]" },
  pricing: {
    eyebrow: "قیمتیں", title: "سادہ پلان، روپوں میں", monthly: "ماہانہ", yearly: "سالانہ", perMonth: "/ماہ", perYear: "/سال", popular: "سب سے مقبول", from: "سے شروع",
    custom: "ایک سے زیادہ برانچ؟ ملٹی برانچ گروپس کی قیمت الگ طے ہوتی ہے۔", cta: "ڈیمو بک کریں", note: "قیمتیں پاکستانی روپے میں، فی ہسپتال۔ انٹرپرائز آپ کے شعبوں اور برانچوں کے مطابق طے ہوتا ہے۔",
    tiers: [
      { k: "clinic", n: "کلینک", d: "ایک ڈاکٹر اور چھوٹے کلینکس کے لیے", f: ["رجسٹریشن اور اپائنٹمنٹس", "او پی ڈی اور نسخے", "واٹس ایپ بکنگ اور یاد دہانی", "بلنگ اور کیش شفٹ", "[X] صارفین تک"] },
      { k: "hospital", n: "ہسپتال", d: "وارڈ اور لیب والے ہسپتالوں کے لیے", f: ["کلینک کی ہر چیز", "آئی پی ڈی، بستر اور نرسنگ", "لیب اور واٹس ایپ رپورٹیں", "فارمیسی POS اور اسٹاک", "پینل اور انشورنس دعوے", "اکاؤنٹنگ اور ڈاکٹر کا حصہ"] },
      { k: "enterprise", n: "انٹرپرائز", d: "بڑے اور ملٹی اسپیشلٹی ہسپتالوں کے لیے", f: ["ہسپتال کی ہر چیز", "HR اور پے رول", "اپنے سرور پر تنصیب", "حسب ضرورت رپورٹیں اور انضمام", "ترجیحی مدد"] },
    ],
  },
  testimonials: {
    eyebrow: "آراء", title: "ہسپتال کی ٹیمیں کیا کہتی ہیں", note: "[عارضی آراء — اصل صارفین کی اجازت سے بدلیں]", logos: "[کلائنٹ لوگو]",
    items: en.testimonials.items,
  },
  security: {
    eyebrow: "تعمیل اور حفاظت", title: "معائنے کے لیے تیار، رازداری بنیادی طور پر",
    items: [["کردار پر مبنی رسائی", "ہر صارف صرف وہ اسکرینیں، برانچ اور مریض دیکھتا ہے جو اس کے کام کے لیے ضروری ہیں۔"], ["ہر ریکارڈ کا آڈٹ ٹریل", "کس نے کب مریض کا ریکارڈ دیکھا یا بدلا، جائزے کے لیے محفوظ رہتا ہے۔"], ["روزانہ انکرپٹڈ بیک اپ", "بیک اپ انکرپٹ اور جانچے جاتے ہیں، ایک نقل سرور سے دور رکھی جاتی ہے۔"], ["PHC اور SHCC دستاویزات میں مدد", "ریکارڈ اور رجسٹر اس طرح منظم کہ پنجاب اور سندھ ہیلتھ کیئر کمیشن کے معائنے کی تیاری آسان ہو۔"], ["پاکستان میں یا اپنے سرور پر", "پاکستان میں کلاؤڈ منتخب کریں یا سب کچھ ہسپتال کے اندر اپنے سرور پر رکھیں۔"]],
    note: "VVSDesk آپ کی دستاویزات میں مدد کرتا ہے؛ سرٹیفکیشن اور لائسنس ہسپتال کی ذمہ داری رہتے ہیں۔",
  },
  faq: {
    eyebrow: "سوالات", title: "ہسپتال ہم سے کیا پوچھتے ہیں",
    items: [
      ["VVSDesk کی قیمت کیا ہے؟", "کلینک 10,000 روپے ماہانہ، ہسپتال 20,000 روپے ماہانہ، اور انٹرپرائز 50,000 روپے ماہانہ سے شروع، آپ کے شعبوں کے مطابق۔ ملٹی برانچ گروپس کی قیمت الگ طے ہوتی ہے۔"],
      ["کلاؤڈ یا اپنا سرور؟", "دونوں۔ پاکستان میں کلاؤڈ سرور استعمال کریں، یا VVSDesk ہسپتال کے اندر سرور پر لگائیں تاکہ ڈیٹا عمارت سے باہر نہ جائے۔"],
      ["کیا پرانے نظام سے ڈیٹا منتقل ہو سکتا ہے؟", "جی ہاں۔ سیٹ اپ کے دوران مریض، ڈاکٹر، فیس، نرخ، سپلائرز اور ابتدائی اسٹاک پرانے سافٹ ویئر یا ایکسل سے درآمد کرتے ہیں۔"],
      ["کیا واٹس ایپ بکنگ کے لیے الگ نمبر چاہیے؟", "ہم ہسپتال کے لیے الگ واٹس ایپ بزنس نمبر تجویز کرتے ہیں تاکہ بکنگ اور رپورٹیں ایک قابل اعتماد نام سے آئیں۔ سیٹ اپ میں ہم مدد کرتے ہیں۔"],
      ["کیا یہ اردو میں چلتا ہے؟", "جی ہاں۔ ہر اسکرین انگریزی اور اردو میں بدلتی ہے، مریضوں کے نام اردو میں رکھے جا سکتے ہیں، اور نسخے اور پرچیاں اردو میں پرنٹ ہوتی ہیں۔"],
      ["سیٹ اپ میں کتنا وقت لگتا ہے؟", "کلینک چند دنوں میں شروع ہو سکتا ہے۔ وارڈ، لیب اور فارمیسی والا ہسپتال عموماً چند ہفتے لیتا ہے، ڈیٹا منتقلی اور تربیت کے مطابق۔"],
      ["انٹرنیٹ بند ہو تو؟", "اپنے سرور پر تنصیب کے ساتھ VVSDesk بغیر انٹرنیٹ کے مقامی نیٹ ورک پر چلتا ہے۔ کاؤنٹر بلنگ جاری رکھتے ہیں اور کنکشن آنے پر ہم آہنگ ہو جاتے ہیں۔"],
      ["آپ کیا تربیت اور مدد دیتے ہیں؟", "ریسیپشن، ڈاکٹرز، نرسز، لیب، فارمیسی اور اکاؤنٹس کے لیے کردار وار تربیت — ہسپتال میں یا آن لائن — ساتھ کتابچے، ویڈیوز اور لانچ کے بعد مسلسل مدد۔"],
    ],
  },
  cta: {
    title: "30 منٹ میں دیکھیں VVSDesk آپ کا ہسپتال کیسے چلاتا ہے۔", sub: "اپنے ہسپتال کے بارے میں تھوڑا بتائیں، ہم آپ کے شعبوں کے ساتھ ڈیمو تیار کریں گے۔",
    name: "آپ کا نام", hospital: "ہسپتال کا نام", city: "شہر", beds: "بستروں کی تعداد", wa: "واٹس ایپ نمبر", submit: "ڈیمو بک کریں", sending: "بھیجا جا رہا ہے…",
    ok: "شکریہ — ہم جلد واٹس ایپ پر رابطہ کریں گے۔", err: "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں یا واٹس ایپ پر پیغام بھیجیں۔",
    bedOptions: ["کلینک (بستر نہیں)", "1–25 بستر", "26–50 بستر", "51–100 بستر", "100+ بستر"], required: "براہ کرم تمام خانے پُر کریں۔", phoneHint: "03XX XXXXXXX",
  },
  footer: {
    tagline: "واٹس ایپ کے ساتھ ہسپتال مینجمنٹ — پاکستان کے لیے۔",
    product: "پروڈکٹ", company: "کمپنی", resources: "وسائل", contact: "رابطہ",
    links: { product: ["خصوصیات", "واٹس ایپ", "قیمتیں", "ماڈیولز"], company: ["ہمارے بارے میں", "ملازمتیں", "شراکت دار", "رابطہ"], resources: ["مدد کا مرکز", "گائیڈز اور ویڈیوز", "ڈیٹا ایکسپورٹ", "رازداری کی پالیسی"] },
    rights: "جملہ حقوق محفوظ ہیں۔",
  },
  float: "واٹس ایپ پر ہم سے بات کریں",
};

export const COPY = { en, ur };
export type Copy = typeof en;
