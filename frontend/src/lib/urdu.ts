/**
 * English → Urdu name transliteration, entirely in the browser (patient names never leave the clinic).
 * 1. A dictionary of common Pakistani first names, family names and titles (exact spellings people use).
 * 2. Phonetic rules for any other word. Rules are approximate — reception can correct the Urdu field, and once edited
 *    by hand it is no longer overwritten.
 */

const NAMES: Record<string, string> = {
  // titles / connectors
  dr: "ڈاکٹر", "dr.": "ڈاکٹر", mr: "مسٹر", mrs: "مسز", miss: "مس", hafiz: "حافظ", haji: "حاجی", syed: "سید", sayed: "سید", syeda: "سیدہ", mian: "میاں",
  rana: "رانا", raja: "راجہ", chaudhry: "چوہدری", chaudhary: "چوہدری", ch: "چوہدری", "ch.": "چوہدری", malik: "ملک", sheikh: "شیخ", shaikh: "شیخ", mirza: "مرزا",
  khawaja: "خواجہ", khwaja: "خواجہ", pir: "پیر", sardar: "سردار", nawab: "نواب", begum: "بیگم", bibi: "بی بی", bano: "بانو", khanum: "خانم",
  ul: "ال", "ud": "الد", din: "دین", uddin: "الدین", "ud-din": "الدین", ullah: "اللہ", allah: "اللہ", ur: "الر", rehman: "رحمان", rahman: "رحمان",
  // male first names
  muhammad: "محمد", mohammad: "محمد", mohammed: "محمد", muhammed: "محمد", mohd: "محمد", m: "محمد", ali: "علی", ahmed: "احمد", ahmad: "احمد", hassan: "حسن", hasan: "حسن",
  hussain: "حسین", husain: "حسین", hussein: "حسین", usman: "عثمان", osman: "عثمان", umar: "عمر", omar: "عمر", bilal: "بلال", hamza: "حمزہ", imran: "عمران",
  zubair: "زبیر", kashif: "کاشف", tariq: "طارق", tarik: "طارق", faisal: "فیصل", asad: "اسد", shahid: "شاہد", naveed: "نوید", navid: "نوید", kamran: "کامران",
  adnan: "عدنان", arslan: "ارسلان", awais: "اویس", owais: "اویس", babar: "بابر", danish: "دانش", farhan: "فرحان", fahad: "فہد", fawad: "فواد", haris: "حارث",
  haroon: "ہارون", harun: "ہارون", irfan: "عرفان", ismail: "اسماعیل", jawad: "جواد", junaid: "جنید", kaleem: "کلیم", kamal: "کمال", kashan: "کاشان", khalid: "خالد",
  khurram: "خرم", mansoor: "منصور", mansur: "منصور", moin: "معین", mubashir: "مبشر", mudassar: "مدثر", mujahid: "مجاہد", mustafa: "مصطفیٰ", nabeel: "نبیل",
  nadeem: "ندیم", nasir: "ناصر", nauman: "نعمان", noman: "نعمان", qasim: "قاسم", rashid: "راشد", rizwan: "رضوان", rehan: "ریحان", raheel: "راحیل", saad: "سعد",
  sajid: "ساجد", salman: "سلمان", saqib: "ثاقب", sarfraz: "سرفراز", shahbaz: "شہباز", shahzad: "شہزاد", shakeel: "شکیل", shoaib: "شعیب", sohail: "سہیل",
  suleman: "سلیمان", sulaiman: "سلیمان", talha: "طلحہ", tahir: "طاہر", taimur: "تیمور", taimoor: "تیمور", tanveer: "تنویر", umair: "عمیر", waqas: "وقاص",
  waseem: "وسیم", wasim: "وسیم", yasir: "یاسر", yousaf: "یوسف", yousuf: "یوسف", yusuf: "یوسف", zahid: "زاہد", zain: "زین", zeeshan: "ذیشان", zafar: "ظفر",
  abdul: "عبد", abdullah: "عبداللہ", aamir: "عامر", amir: "عامر", aslam: "اسلم", akram: "اکرم", akbar: "اکبر", anwar: "انور", arif: "عارف", ashraf: "اشرف",
  asif: "آصف", azhar: "اظہر", ejaz: "اعجاز", ijaz: "اعجاز", fazal: "فضل", ghulam: "غلام", hamid: "حامد", iqbal: "اقبال", javed: "جاوید", javaid: "جاوید",
  latif: "لطیف", mahmood: "محمود", mehmood: "محمود", mahmud: "محمود", majid: "ماجد", maqsood: "مقصود", munir: "منیر", murad: "مراد", mushtaq: "مشتاق",
  naeem: "نعیم", nawaz: "نواز", pervaiz: "پرویز", pervez: "پرویز", parvez: "پرویز", qaiser: "قیصر", rafiq: "رفیق", rauf: "رؤف", rasheed: "رشید", riaz: "ریاض",
  saeed: "سعید", said: "سعید", sajjad: "سجاد", sami: "سمیع", sarwar: "سرور", shafiq: "شفیق", shakir: "شاکر", sharif: "شریف", tanvir: "تنویر", wajid: "واجد",
  younas: "یونس", younis: "یونس", yunus: "یونس", zaheer: "ظہیر", zulfiqar: "ذوالفقار", ibrahim: "ابراہیم", ishaq: "اسحاق", yaqoob: "یعقوب", musa: "موسیٰ", isa: "عیسیٰ",
  ayaan: "ایان", ayan: "ایان", rayan: "ریان", aryan: "آریان", abdurrehman: "عبدالرحمان", sohaib: "صہیب", huzaifa: "حذیفہ", hammad: "حماد", ammar: "عمار",
  // female first names
  ayesha: "عائشہ", aisha: "عائشہ", fatima: "فاطمہ", fatimah: "فاطمہ", zainab: "زینب", maryam: "مریم", mariam: "مریم", sana: "ثناء", hina: "حنا", rabia: "رابعہ",
  amna: "آمنہ", aamna: "آمنہ", nida: "ندا", saima: "صائمہ", sadia: "سعدیہ", iqra: "اقراء", mehwish: "مہوش", kiran: "کرن", bushra: "بشریٰ", farah: "فرح",
  nazia: "نازیہ", shazia: "شازیہ", uzma: "عظمیٰ", asma: "اسماء", samina: "ثمینہ", rubina: "روبینہ", nasreen: "نسرین", parveen: "پروین", perveen: "پروین",
  shabana: "شبانہ", shaista: "شائستہ", tahira: "طاہرہ", tasneem: "تسنیم", yasmeen: "یاسمین", yasmin: "یاسمین", zahida: "زاہدہ", zarina: "زرینہ", kausar: "کوثر",
  kulsoom: "کلثوم", khadija: "خدیجہ", hafsa: "حفصہ", alina: "علینہ", aleena: "علینہ", areeba: "اریبہ", anam: "انعم", ayeza: "عائزہ", eman: "ایمان", iman: "ایمان",
  hira: "حرا", hareem: "حریم", laiba: "لائبہ", maham: "ماہم", mahnoor: "ماہ نور", maira: "مائرہ", noor: "نور", nadia: "نادیہ", rida: "ردا", sidra: "سدرہ",
  sobia: "صوبیہ", sumaira: "سمیرا", tayyaba: "طیبہ", urooj: "عروج", zara: "زارا", zoya: "زویا", amina: "آمنہ", noreen: "نورین", sajida: "ساجدہ", shamim: "شمیم",
  nargis: "نرگس", saba: "صبا", iram: "ارم", nusrat: "نصرت", rukhsana: "رخسانہ", robina: "روبینہ", humaira: "حمیرا", fozia: "فوزیہ", fouzia: "فوزیہ", sughra: "صغریٰ",
  // family / caste names
  khan: "خان", butt: "بٹ", bhatti: "بھٹی", qureshi: "قریشی", raza: "رضا", rizvi: "رضوی", naqvi: "نقوی", zaidi: "زیدی", jafri: "جعفری", abbasi: "عباسی",
  hashmi: "ہاشمی", gillani: "گیلانی", gilani: "گیلانی", bukhari: "بخاری", shah: "شاہ", siddiqui: "صدیقی", siddiqi: "صدیقی", farooqi: "فاروقی", usmani: "عثمانی",
  ansari: "انصاری", awan: "اعوان", janjua: "جنجوعہ", gondal: "گوندل", cheema: "چیمہ", bajwa: "باجوہ", warraich: "وڑائچ", virk: "ورک", sandhu: "سندھو",
  jutt: "جٹ", jatt: "جٹ", arain: "آرائیں", rajput: "راجپوت", mughal: "مغل", memon: "میمن", baloch: "بلوچ", khattak: "خٹک", yousafzai: "یوسفزئی", afridi: "آفریدی",
  durrani: "درانی", niazi: "نیازی", leghari: "لغاری", mazari: "مزاری", soomro: "سومرو", shaikhani: "شیخانی", akhtar: "اختر", hussaini: "حسینی", haider: "حیدر",
  hyder: "حیدر", abbas: "عباس", jaffar: "جعفر", javaid2: "جاوید", tufail: "طفیل", nisar: "نثار", ilyas: "الیاس", ghauri: "غوری", ghori: "غوری", lodhi: "لودھی",
  chishti: "چشتی", kazmi: "کاظمی", jilani: "جیلانی", alvi: "علوی", rehmani: "رحمانی", sabir: "صابر", saleem: "سلیم", salim: "سلیم", aziz: "عزیز", baig: "بیگ",
  beg: "بیگ", chughtai: "چغتائی", dar: "ڈار", lone: "لون", mir: "میر", wani: "وانی", kiani: "کیانی", satti: "ستی", minhas: "منہاس", tiwana: "ٹوانہ",
}

const DIGRAPH: [string, string][] = [
  ["kh", "خ"], ["gh", "غ"], ["sh", "ش"], ["ch", "چ"], ["zh", "ژ"], ["ph", "ف"], ["th", "تھ"], ["dh", "دھ"], ["bh", "بھ"], ["jh", "جھ"], ["kk", "ک"],
  ["ck", "ک"], ["qu", "قو"], ["ee", "ی"], ["oo", "و"], ["ou", "و"], ["aa", "ا"], ["ai", "ائ"], ["ay", "ے"], ["ey", "ے"], ["ei", "ی"],
];
const SINGLE: Record<string, string> = { b: "ب", p: "پ", t: "ت", d: "د", r: "ر", z: "ز", s: "س", f: "ف", q: "ق", k: "ک", g: "گ", l: "ل", m: "م", n: "ن",
  w: "و", v: "و", h: "ہ", y: "ی", j: "ج", c: "ک", x: "کس" };
const isV = (c: string) => "aeiou".includes(c);
const beforeLastSound = (rest: string) => (rest.length === 1 && !isV(rest)) || (rest.length === 2 && !isV(rest[0]) && !isV(rest[1]) && DIGRAPH.some(([k]) => k === rest));

/** Phonetic fallback for one word. */
export function translitWord(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return word;
  if (NAMES[w]) return NAMES[w];
  // compound endings that Pakistani names use a lot
  for (const [suf, ur] of [["uddin", "الدین"], ["ullah", "اللہ"], ["ur rehman", "الرحمان"]] as const) {
    if (w.endsWith(suf) && w.length > suf.length + 1) return translitWord(w.slice(0, -suf.length)) + ur;
  }
  let out = "";
  let i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2);
    const dg = DIGRAPH.find(([k]) => k === two);
    if (dg && !(two === "ai" && i === 0)) { out += i === 0 && "aeiou".includes(two[0]) ? "ا" + dg[1].replace(/^ا/, "") : dg[1]; i += 2; continue; }
    const ch = w[i];
    const first = i === 0, last = i === w.length - 1;
    if (isV(ch)) {
      if (first) out += ch === "o" || ch === "u" ? "او" : ch === "i" || ch === "e" ? "ا" : "ا";
      else if (last) out += ch === "a" ? (w.length > 3 ? "ہ" : "ا") : ch === "e" ? "ے" : ch === "i" ? "ی" : "و";
      else if (ch !== "e" && beforeLastSound(w.slice(i + 1))) out += ""; // short vowel before the last sound is not written (Nadir → نادر, Shahrukh → شاہرخ)
      else if (ch === "a") out += "ا";
      else if (ch === "i" || ch === "e") out += "ی";
      else out += "و";
    } else if (ch === "h" && last && w[i - 1] === "a") {
      out = out.replace(/ا$/, "") + "ہ";
    } else if (i > 0 && w[i - 1] === ch) {
      // doubled consonant: written once
    } else {
      out += SINGLE[ch] ?? "";
    }
    i++;
  }
  return out;
}

/** "Muhammad Ali Khan" → "محمد علی خان". Keeps multi-word dictionary hits like "ur rehman". */
export function toUrdu(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const pair = `${words[i]} ${words[i + 1] ?? ""}`.toLowerCase().trim();
    if (pair === "ur rehman" || pair === "ur rahman") { out.push("الرحمان"); i++; continue; }
    if (pair === "ul haq" || pair === "ul haque") { out.push("الحق"); i++; continue; }
    out.push(translitWord(words[i]));
  }
  return out.join(" ");
}

/** True when the text already contains Urdu/Arabic letters (then no auto-fill is needed). */
export const hasUrdu = (s: string) => /[؀-ۿ]/.test(s);
