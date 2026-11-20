/**
 * Nursery & Newborn Care — website copy in English and Urdu (D-95). Everything a non-developer may need to change lives here.
 * [confirm] = placeholder to be checked by LMC's paediatric team before go-live (clinical values, EPI schedule, prices, numbers).
 * Live facts (cot counts, ward day-rates, doctors) come from the ERP, not from this file.
 */
import { useEffect, useState } from "react";
import { getCall } from "@/services/frappe";
import type { Lang } from "./content";

export interface NurseryFacts {
  units: { nicu: number; nursery: number; rooming: number }; staff: number; rates: { nicu?: number; nursery?: number; rooming?: number };
  doctors: string[]; floor?: string; births_month?: number;
}
let p: Promise<NurseryFacts> | null = null;
export function useNurseryFacts(): NurseryFacts | null {
  const [v, setV] = useState<NurseryFacts | null>(null);
  useEffect(() => { let on = true; (p ??= getCall<NurseryFacts>("hospital_vvs.api.nursery.public_facts").catch((e) => { p = null; throw e; })).then((x) => on && setV(x)).catch(() => {}); return () => { on = false; }; }, []);
  return v;
}

/** Placeholder package prices in Rs [confirm] — used only when the ERP has no rate. */
export const PACKAGE_PRICES = { normal: 65000, csection: 145000, nicuDay: 18000, roomDay: 9000 };
/** NICU level shown on the page [confirm]. */
export const NICU_LEVEL = "III";

const en = {
  title: "Nursery & Newborn Care", metaDesc: "Newborn care at Lyallpur Medical Complex, Faisalabad: rooming-in, well-baby nursery, NICU, birth vaccinations, jaundice care and lactation support.",
  hero: { eyebrow: "Paediatrics · Newborn care", h1a: "Gentle care from", h1b: "the very first breath.", sub: "Paediatricians present at birth, mother-and-baby rooms, a calm well-baby nursery and a fully equipped NICU — with your baby's own medical record from the first minute.",
    book: "Book a maternity visit", find: "Find a paediatrician", helpline: "NICU helpline" },
  stats: { nicu: "NICU cots", nursery: "Nursery cots", staff: "Neonatal staff", cover: "Paediatric cover" },
  units: ["Where your baby is cared for", "Care units", "From rooming-in beside you to intensive care, every unit is staffed by nurses trained in newborn care."],
  unitList: [
    ["Well-Baby Nursery", "Warm, quiet and watched around the clock — for babies who need a little extra observation or while mother rests.", "nursery"],
    ["Mother & Baby Rooms", "Rooming-in: your baby stays beside your bed day and night, so feeding and bonding start naturally.", "rooming"],
    ["NICU (Level " + NICU_LEVEL + ")", "Incubators, CPAP, ventilators, phototherapy and continuous monitoring for premature and sick newborns.", "nicu"],
    ["Step-down / SCBU", "Special-care cots for babies who are getting stronger and almost ready to go home.", "scbu"],
    ["Kangaroo Mother Care", "A dedicated space for skin-to-skin care — proven to help small babies grow, feed and stay warm.", "kmc"],
    ["Breastfeeding room", "A private, comfortable room with lactation support, breast pumps and milk storage.", "feed"],
  ] as [string, string, string][],
  services: ["Newborn services", "Everything your baby needs in the first days", "Routine care follows national guidance; your paediatrician explains every step. [confirm with LMC paediatric team]"],
  serviceList: [
    ["Paediatrician newborn examination", "A head-to-toe check within the first hours and again before discharge."],
    ["Apgar score", "Breathing, heart rate, colour, tone and reflexes at 1 and 5 minutes."],
    ["Vitamin K", "One injection soon after birth to prevent bleeding."],
    ["Birth vaccinations (EPI)", "BCG, OPV-0 and Hepatitis B birth dose — per the current EPI Punjab schedule [verify]."],
    ["Hearing screening", "A quick, painless test before you go home."],
    ["Jaundice check & phototherapy", "Skin and blood bilirubin checks; phototherapy in the nursery or at your bedside."],
    ["Pulse-oximetry (CCHD) screening", "A simple oxygen check to pick up hidden heart conditions."],
    ["Lactation counselling", "Help with latching, positioning and expressing — day and night."],
    ["Circumcision on request", "Performed by a surgeon when the baby is well, with your written consent."],
  ] as [string, string][],
  safety: ["Baby safety", "Your baby never leaves our sight", "Security is built into every step — from the delivery room to the front door."],
  safetyList: [
    ["Matching ID bands", "Mother and baby wear matching numbered bands from the moment of birth."],
    ["Infant security tags", "An electronic tag on every baby sounds an alarm at the unit exits."],
    ["Restricted access", "Nursery and NICU doors open only for staff and registered parents."],
    ["CCTV", "Corridors and unit entrances are monitored 24/7."],
    ["Verified hand-over", "A baby is handed only to the verified mother or parent — bands are matched every time."],
  ] as [string, string][],
  visiting: ["Visiting", "Visiting policy", "Calm visiting protects newborns from infection and lets mothers rest. [confirm]"],
  visitList: [
    ["Mother & Baby rooms", "11:00 am – 1:00 pm and 5:00 pm – 7:00 pm; two visitors at a time; one female attendant may stay."],
    ["NICU", "Parents welcome 24/7. Grandparents by arrangement with the nurse in charge. No children under 12."],
    ["Hand hygiene", "Wash or sanitise your hands every time you enter, and before touching the baby."],
    ["If you are unwell", "Please do not visit with a cough, cold, fever or rash — ask us about a video call instead."],
  ] as [string, string][],
  journey: ["Your baby's first days", "From birth to the first vaccines", "What happens, in order — most of it while your baby stays with you."],
  steps: [
    ["Birth", "Paediatrician or neonatal nurse present."], ["Immediate care", "Apgar, skin-to-skin, ID bands."], ["Newborn assessment", "Weight, length and head size."],
    ["Placement", "Rooming-in, nursery or NICU."], ["Routine care", "Feeding, vitamin K, vaccines, screening."], ["Daily monitoring", "Temperature, feeds, weight, jaundice."],
    ["Parent education", "Feeding, bathing, cord care, safe sleep."], ["Discharge check", "Paediatrician's final examination."], ["Discharge papers", "Summary, vaccination card, birth slip."],
    ["Follow-up", "Reminders for clinic visits and vaccines."],
  ] as [string, string][],
  guide: ["Parent guide", "Questions every new parent has", "Short, practical answers from our nurses and paediatricians."],
  guideList: [
    ["What to bring for baby", ["4–6 soft cotton outfits and caps", "Swaddle cloths and a warm blanket", "Newborn nappies and soft wipes", "Mother's CNIC and MR card (for the birth slip)", "A car seat or a safe carrier for going home"]],
    ["Feeding", ["Start breastfeeding within the first hour", "Feed on demand — usually 8–12 times in 24 hours", "Colostrum (first milk) is all a healthy baby needs at first", "Ask the lactation counsellor for help at any time"]],
    ["Cord care", ["Keep the cord clean and dry; fold the nappy below it", "Do not apply oil, ash, surma or powder", "It falls off in 5–15 days", "Redness, swelling, pus or a bad smell — see a doctor"]],
    ["Safe sleep", ["Always on the back, on a firm flat surface", "No pillows, soft toys or heavy quilts in the cot", "Keep the room comfortably warm, not hot", "Room-share, but do not sleep with the baby on a sofa"]],
  ] as [string, string[]][],
  danger: { title: "Danger signs — come to emergency immediately", list: ["Fever, or feeling cold to touch", "Poor feeding or not waking for feeds", "Yellow skin or eyes, especially in the first day or spreading to legs", "Fast or difficult breathing, grunting", "Very sleepy, floppy or unusually irritable", "Fits (convulsions) or blue lips"], call: "Call emergency" },
  packages: ["Packages", "Maternity & newborn packages", "Indicative prices — your final bill depends on the length of stay and any extra care. [confirm]"],
  packageList: [["Normal delivery + nursery", "2 days · mother & baby room · newborn exam, vitamin K, birth vaccines", "normal"], ["C-section + nursery", "4 days · private room · newborn care package", "csection"],
    ["NICU", "Per day · incubator, monitoring, neonatal nursing (medicines extra)", "nicuDay"], ["Mother & Baby room", "Per day · rooming-in, attendant bed, lactation support", "roomDay"]] as [string, string, string][],
  perDay: "per day", from: "from", enquire: "Ask about this package",
  team: ["Our team", "Paediatricians & obstetricians", "Clinic days, fees and the next free slot — live from our booking system."],
  faq: ["FAQs", "Questions parents ask us", ""],
  faqList: [
    ["Will my baby stay with me?", "Yes — healthy babies room-in with their mothers. The nursery is there if your baby needs observation or you need rest."],
    ["When are the birth vaccinations given?", "BCG, OPV-0 and the Hepatitis B birth dose are given before discharge, ideally within 24 hours of birth. You receive a vaccination card with the next due dates. [verify against EPI Punjab]"],
    ["Can parents stay in the NICU?", "Parents are welcome in the NICU at any time, and mothers are encouraged to give kangaroo care and breast milk."],
    ["How do I get the birth registration slip?", "Before discharge you receive a hospital birth record slip to take to NADRA / your union council. It is also downloadable from the patient portal."],
    ["How will I get updates if my baby is in the NICU?", "Your nurse shares approved updates in the patient portal (My Baby), and the doctor meets you daily."],
  ] as [string, string][],
  where: { title: "Where to find us", text: "The Labour Room, Mother & Baby Rooms, Nursery and NICU are together on the second floor, maternity wing — follow the pink and blue signs.", map: "Open hospital map", dir: "Get directions" },
  cta: { title: "Expecting a baby?", sub: "Book an antenatal visit with our gynaecologist — we will plan your delivery and your baby's first days together.", book: "Book a maternity visit", call: "Call the hospital" },
  portal: { title: "Already a parent with us?", sub: "Sign in to My Baby for updates, papers and vaccine reminders.", go: "Open My Baby" },
  placeholder: "Figures and prices are indicative and subject to confirmation.",
};

type Copy = typeof en;
const ur: Copy = {
  title: "نرسری اور نومولود کی دیکھ بھال", metaDesc: "لائلپور میڈیکل کمپلیکس فیصل آباد میں نومولود کی دیکھ بھال: ماں کے ساتھ کمرہ، نرسری، این آئی سی یو، پیدائشی ویکسین، یرقان کا علاج اور دودھ پلانے میں مدد۔",
  hero: { eyebrow: "امراض اطفال · نومولود کی دیکھ بھال", h1a: "پہلی سانس سے", h1b: "نرم اور محفوظ دیکھ بھال۔", sub: "پیدائش کے وقت ماہرِ اطفال موجود، ماں اور بچے کے کمرے، پُرسکون نرسری اور مکمل این آئی سی یو — اور پہلے لمحے سے بچے کا اپنا میڈیکل ریکارڈ۔",
    book: "زچگی کے لیے وقت لیں", find: "ماہرِ اطفال تلاش کریں", helpline: "این آئی سی یو ہیلپ لائن" },
  stats: { nicu: "این آئی سی یو کاٹ", nursery: "نرسری کاٹ", staff: "نومولود عملہ", cover: "ماہرِ اطفال کی سہولت" },
  units: ["آپ کے بچے کی دیکھ بھال کہاں ہوتی ہے", "نگہداشت کے یونٹ", "ماں کے پاس کمرے سے لے کر انتہائی نگہداشت تک، ہر یونٹ میں نومولود کی تربیت یافتہ نرسیں موجود ہیں۔"],
  unitList: [
    ["نرسری", "گرم، پُرسکون اور چوبیس گھنٹے نگرانی — ان بچوں کے لیے جنہیں تھوڑی اضافی نگرانی درکار ہو یا جب ماں آرام کر رہی ہو۔", "nursery"],
    ["ماں اور بچے کے کمرے", "بچہ دن رات ماں کے بستر کے ساتھ رہتا ہے تاکہ دودھ پلانا اور تعلق قدرتی طور پر شروع ہو۔", "rooming"],
    ["این آئی سی یو (لیول " + NICU_LEVEL + ")", "قبل از وقت اور بیمار نومولود کے لیے انکیوبیٹر، سی پیپ، وینٹی لیٹر، فوٹو تھراپی اور مسلسل نگرانی۔", "nicu"],
    ["اسٹیپ ڈاؤن / ایس سی بی یو", "ان بچوں کے لیے خصوصی کاٹ جو مضبوط ہو رہے ہیں اور گھر جانے کے قریب ہیں۔", "scbu"],
    ["کینگرو مدر کیئر", "جلد سے جلد ملا کر رکھنے کی مخصوص جگہ — چھوٹے بچوں کی نشوونما، دودھ اور گرمائش کے لیے مفید۔", "kmc"],
    ["دودھ پلانے کا کمرہ", "دودھ پلانے میں مدد، بریسٹ پمپ اور دودھ محفوظ کرنے کی سہولت کے ساتھ نجی کمرہ۔", "feed"],
  ],
  services: ["نومولود کی خدمات", "پہلے دنوں میں بچے کی ہر ضرورت", "معمول کی دیکھ بھال قومی رہنمائی کے مطابق ہے؛ ماہرِ اطفال ہر مرحلہ سمجھاتے ہیں۔ [تصدیق درکار]"],
  serviceList: [
    ["ماہرِ اطفال کا معائنہ", "پہلے چند گھنٹوں میں اور ڈسچارج سے پہلے مکمل معائنہ۔"],
    ["اپگار اسکور", "ایک اور پانچ منٹ پر سانس، دل کی دھڑکن، رنگت، پٹھوں اور ردِعمل کی جانچ۔"],
    ["وٹامن کے", "خون بہنے سے بچاؤ کے لیے پیدائش کے بعد ایک انجکشن۔"],
    ["پیدائشی ویکسین (ای پی آئی)", "بی سی جی، او پی وی-0 اور ہیپاٹائٹس بی کی پیدائشی خوراک — موجودہ ای پی آئی پنجاب شیڈول کے مطابق [تصدیق]۔"],
    ["سماعت کی جانچ", "گھر جانے سے پہلے فوری اور بے درد ٹیسٹ۔"],
    ["یرقان کی جانچ اور فوٹو تھراپی", "جلد اور خون میں بلیروبن کی جانچ؛ نرسری یا ماں کے پاس فوٹو تھراپی۔"],
    ["پلس آکسی میٹری (سی سی ایچ ڈی) اسکریننگ", "دل کی چھپی بیماریوں کی تشخیص کے لیے آکسیجن کی سادہ جانچ۔"],
    ["دودھ پلانے کی رہنمائی", "دودھ پکڑانے، صحیح انداز اور دودھ نکالنے میں دن رات مدد۔"],
    ["ختنہ (درخواست پر)", "بچے کی صحت بہتر ہونے پر، آپ کی تحریری اجازت سے سرجن کرتے ہیں۔"],
  ],
  safety: ["بچے کی حفاظت", "آپ کا بچہ ہماری نظروں سے اوجھل نہیں ہوتا", "ڈلیوری روم سے صدر دروازے تک ہر قدم پر حفاظت۔"],
  safetyList: [
    ["ملتے جلتے شناختی بینڈ", "پیدائش کے لمحے سے ماں اور بچہ ایک جیسے نمبر والے بینڈ پہنتے ہیں۔"],
    ["سیکیورٹی ٹیگ", "ہر بچے پر الیکٹرانک ٹیگ، جو یونٹ سے باہر جانے پر الارم بجاتا ہے۔"],
    ["محدود رسائی", "نرسری اور این آئی سی یو کے دروازے صرف عملے اور رجسٹرڈ والدین کے لیے کھلتے ہیں۔"],
    ["سی سی ٹی وی", "راہداریوں اور یونٹ کے داخلی راستوں کی چوبیس گھنٹے نگرانی۔"],
    ["تصدیق شدہ حوالگی", "بچہ صرف تصدیق شدہ ماں یا والدین کے حوالے کیا جاتا ہے — ہر بار بینڈ ملائے جاتے ہیں۔"],
  ],
  visiting: ["ملاقات", "ملاقات کے اصول", "پُرسکون ملاقات نومولود کو انفیکشن سے بچاتی ہے اور ماں کو آرام دیتی ہے۔ [تصدیق درکار]"],
  visitList: [
    ["ماں اور بچے کے کمرے", "صبح 11 سے دوپہر 1 اور شام 5 سے 7 بجے؛ ایک وقت میں دو ملاقاتی؛ ایک خاتون تیماردار رہ سکتی ہیں۔"],
    ["این آئی سی یو", "والدین چوبیس گھنٹے آ سکتے ہیں۔ دادا دادی/نانا نانی نرس انچارج کی اجازت سے۔ 12 سال سے کم بچے نہیں۔"],
    ["ہاتھوں کی صفائی", "ہر بار اندر آتے ہوئے اور بچے کو چھونے سے پہلے ہاتھ دھوئیں یا سینیٹائز کریں۔"],
    ["اگر آپ بیمار ہیں", "کھانسی، زکام، بخار یا دانوں کی صورت میں ملاقات نہ کریں — ویڈیو کال کے بارے میں پوچھیں۔"],
  ],
  journey: ["بچے کے پہلے دن", "پیدائش سے پہلی ویکسین تک", "ترتیب وار کیا ہوتا ہے — زیادہ تر بچہ آپ کے پاس ہی رہتا ہے۔"],
  steps: [
    ["پیدائش", "ماہرِ اطفال یا نومولود نرس موجود۔"], ["فوری دیکھ بھال", "اپگار، جلد سے جلد ملانا، شناختی بینڈ۔"], ["نومولود کا جائزہ", "وزن، لمبائی اور سر کی پیمائش۔"],
    ["جگہ کا تعین", "ماں کے ساتھ، نرسری یا این آئی سی یو۔"], ["معمول کی دیکھ بھال", "دودھ، وٹامن کے، ویکسین، اسکریننگ۔"], ["روزانہ نگرانی", "درجہ حرارت، دودھ، وزن، یرقان۔"],
    ["والدین کی رہنمائی", "دودھ پلانا، نہلانا، ناف کی دیکھ بھال، محفوظ نیند۔"], ["ڈسچارج سے پہلے معائنہ", "ماہرِ اطفال کا آخری معائنہ۔"], ["ڈسچارج کاغذات", "خلاصہ، ویکسین کارڈ، پیدائشی پرچی۔"],
    ["فالو اپ", "کلینک اور ویکسین کی یاد دہانیاں۔"],
  ],
  guide: ["والدین کے لیے رہنمائی", "ہر نئے والدین کے سوالات", "ہماری نرسوں اور ماہرینِ اطفال کے مختصر اور عملی جوابات۔"],
  guideList: [
    ["بچے کے لیے کیا لائیں", ["4 سے 6 نرم سوتی کپڑے اور ٹوپیاں", "لپیٹنے کے کپڑے اور گرم کمبل", "نومولود کے ڈائپر اور نرم وائپس", "ماں کا شناختی کارڈ اور ایم آر کارڈ (پیدائشی پرچی کے لیے)", "گھر جانے کے لیے کار سیٹ یا محفوظ کیریئر"]],
    ["دودھ پلانا", ["پہلے گھنٹے میں دودھ پلانا شروع کریں", "طلب پر دودھ پلائیں — عموماً 24 گھنٹوں میں 8 سے 12 بار", "شروع میں صحت مند بچے کے لیے پہلا دودھ (کولوسٹرم) کافی ہے", "کسی بھی وقت دودھ پلانے کی رہنما سے مدد لیں"]],
    ["ناف کی دیکھ بھال", ["ناف صاف اور خشک رکھیں؛ ڈائپر اس سے نیچے موڑیں", "تیل، راکھ، سرمہ یا پاؤڈر نہ لگائیں", "یہ 5 سے 15 دن میں گر جاتی ہے", "سرخی، سوجن، پیپ یا بدبو ہو تو ڈاکٹر کو دکھائیں"]],
    ["محفوظ نیند", ["ہمیشہ پیٹھ کے بل، سخت اور ہموار سطح پر", "کاٹ میں تکیے، نرم کھلونے یا بھاری رضائی نہ رکھیں", "کمرہ مناسب گرم رکھیں، زیادہ گرم نہیں", "ایک کمرے میں سوئیں، مگر صوفے پر بچے کے ساتھ نہ سوئیں"]],
  ],
  danger: { title: "خطرے کی علامات — فوراً ایمرجنسی آئیں", list: ["بخار، یا جسم ٹھنڈا محسوس ہونا", "دودھ نہ پینا یا دودھ کے لیے نہ جاگنا", "جلد یا آنکھوں کا پیلا ہونا، خاص طور پر پہلے دن یا ٹانگوں تک پھیلنا", "تیز یا مشکل سانس، کراہنا", "بہت سست، ڈھیلا یا غیر معمولی چڑچڑا", "جھٹکے (دورے) یا ہونٹ نیلے ہونا"], call: "ایمرجنسی کال کریں" },
  packages: ["پیکجز", "زچگی اور نومولود پیکجز", "اندازاً قیمتیں — حتمی بل قیام کی مدت اور اضافی دیکھ بھال پر منحصر ہے۔ [تصدیق درکار]"],
  packageList: [["نارمل ڈلیوری + نرسری", "2 دن · ماں اور بچے کا کمرہ · نومولود معائنہ، وٹامن کے، پیدائشی ویکسین", "normal"], ["آپریشن + نرسری", "4 دن · پرائیویٹ کمرہ · نومولود نگہداشت پیکج", "csection"],
    ["این آئی سی یو", "یومیہ · انکیوبیٹر، نگرانی، نومولود نرسنگ (ادویات الگ)", "nicuDay"], ["ماں اور بچے کا کمرہ", "یومیہ · بچہ ساتھ، تیماردار کا بستر، دودھ پلانے میں مدد", "roomDay"]],
  perDay: "یومیہ", from: "سے شروع", enquire: "اس پیکج کے بارے میں پوچھیں",
  team: ["ہماری ٹیم", "ماہرینِ اطفال اور گائناکالوجسٹ", "کلینک کے دن، فیس اور اگلا خالی وقت — ہمارے بکنگ سسٹم سے براہِ راست۔"],
  faq: ["سوالات", "والدین کے عام سوالات", ""],
  faqList: [
    ["کیا بچہ میرے ساتھ رہے گا؟", "جی ہاں — صحت مند بچے ماں کے ساتھ رہتے ہیں۔ اگر بچے کو نگرانی یا آپ کو آرام درکار ہو تو نرسری موجود ہے۔"],
    ["پیدائشی ویکسین کب لگتی ہیں؟", "بی سی جی، او پی وی-0 اور ہیپاٹائٹس بی کی پیدائشی خوراک ڈسچارج سے پہلے، بہتر ہے 24 گھنٹوں کے اندر۔ اگلی تاریخوں کے ساتھ ویکسین کارڈ دیا جاتا ہے۔ [ای پی آئی پنجاب سے تصدیق]"],
    ["کیا والدین این آئی سی یو میں رہ سکتے ہیں؟", "والدین کسی بھی وقت این آئی سی یو آ سکتے ہیں، اور ماؤں کو کینگرو کیئر اور اپنا دودھ دینے کی ترغیب دی جاتی ہے۔"],
    ["پیدائش کے اندراج کی پرچی کیسے ملے گی؟", "ڈسچارج سے پہلے نادرا / یونین کونسل کے لیے ہسپتال کی پیدائشی پرچی دی جاتی ہے۔ یہ پیشنٹ پورٹل سے بھی ڈاؤن لوڈ ہو سکتی ہے۔"],
    ["این آئی سی یو میں بچے کی خبر کیسے ملے گی؟", "نرس منظور شدہ معلومات پیشنٹ پورٹل (میرا بچہ) میں دیتی ہیں، اور ڈاکٹر روزانہ آپ سے ملتے ہیں۔"],
  ],
  where: { title: "ہم کہاں ہیں", text: "لیبر روم، ماں اور بچے کے کمرے، نرسری اور این آئی سی یو دوسری منزل پر زچگی ونگ میں اکٹھے ہیں — گلابی اور نیلے نشانات دیکھیں۔", map: "ہسپتال کا نقشہ", dir: "راستہ دیکھیں" },
  cta: { title: "بچے کی آمد متوقع ہے؟", sub: "ہماری گائناکالوجسٹ سے زچگی سے پہلے کا وقت لیں — ہم ڈلیوری اور بچے کے پہلے دنوں کی منصوبہ بندی ساتھ کریں گے۔", book: "زچگی کے لیے وقت لیں", call: "ہسپتال کو کال کریں" },
  portal: { title: "پہلے سے ہمارے پاس والدین ہیں؟", sub: "اپ ڈیٹس، کاغذات اور ویکسین کی یاد دہانی کے لیے \"میرا بچہ\" میں سائن ان کریں۔", go: "میرا بچہ کھولیں" },
  placeholder: "اعداد و شمار اور قیمتیں اندازاً ہیں اور تصدیق سے مشروط ہیں۔",
};

export const NURSERY: Record<Lang, Copy> = { en, ur };
