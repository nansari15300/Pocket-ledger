import { currencyMinorUnitEn } from "./currencyMinorUnit";
import type { QuotationLetterLang } from "./types";

const NE_0_99 = [
  "शून्य",
  "एक",
  "दुई",
  "तीन",
  "चार",
  "पाँच",
  "छ",
  "सात",
  "आठ",
  "नौ",
  "दश",
  "एघार",
  "बाह्र",
  "तेह्र",
  "चौध",
  "पन्ध्र",
  "सोह्र",
  "सत्र",
  "अठार",
  "उन्नाइस",
  "बीस",
  "एक्काइस",
  "बाइस",
  "तेइस",
  "चौबीस",
  "पच्चीस",
  "छब्बीस",
  "सत्ताइस",
  "अठ्ठाइस",
  "उनन्तीस",
  "तीस",
  "एकतीस",
  "बत्तीस",
  "तेत्तीस",
  "चौँतीस",
  "पैँतीस",
  "छत्तीस",
  "सैँतीस",
  "अठतीस",
  "उनन्चालीस",
  "चालीस",
  "एकचालीस",
  "बयालीस",
  "त्रिचालीस",
  "चवालीस",
  "पैँतालीस",
  "छयालीस",
  "सच्चालीस",
  "अठचालीस",
  "उनन्चास",
  "पचास",
  "एकाउन्न",
  "बाउन्न",
  "त्रिपन्न",
  "चउन्न",
  "पचपन्न",
  "छपन्न",
  "सन्ताउन्न",
  "अन्ठाउन्न",
  "उनन्साठी",
  "साठी",
  "एकसट्ठी",
  "बैसट्ठी",
  "त्रिसट्ठी",
  "चौंसट्ठी",
  "पैंसट्ठी",
  "छयसट्ठी",
  "सतसट्ठी",
  "अठसट्ठी",
  "उनन्सत्तरी",
  "सत्तरी",
  "एकहत्तर",
  "बहत्तर",
  "त्रिहत्तर",
  "चौहत्तर",
  "पचहत्तर",
  "छयहत्तर",
  "सतहत्तर",
  "अठहत्तर",
  "उनासी",
  "असी",
  "एकासी",
  "बयासी",
  "त्रियासी",
  "चौरासी",
  "पचासी",
  "छयासी",
  "सतासी",
  "अठासी",
  "उनान्नब्बे",
  "नब्बे",
  "एकान्नब्बे",
  "बयान्नब्बे",
  "त्रियान्नब्बे",
  "चौरान्नब्बे",
  "पन्चान्नब्बे",
  "छयान्नब्बे",
  "सन्तान्नब्बे",
  "अठान्नब्बे",
  "उनान्सय",
];

const HI_0_99 = [
  "शून्य",
  "एक",
  "दो",
  "तीन",
  "चार",
  "पाँच",
  "छह",
  "सात",
  "आठ",
  "नौ",
  "दस",
  "ग्यारह",
  "बारह",
  "तेरह",
  "चौदह",
  "पंद्रह",
  "सोलह",
  "सत्रह",
  "अठारह",
  "उन्नीस",
  "बीस",
  "इक्कीस",
  "बाईस",
  "तेईस",
  "चौबीस",
  "पच्चीस",
  "छब्बीस",
  "सत्ताईस",
  "अट्ठाईस",
  "उनतीस",
  "तीस",
  "इकतीस",
  "बत्तीस",
  "तैंतीस",
  "चौंतीस",
  "पैंतीस",
  "छत्तीस",
  "सैंतीस",
  "अड़तीस",
  "उनतालीस",
  "चालीस",
  "इकतालीस",
  "बयालीस",
  "तैंतालीस",
  "चौवालीस",
  "पैंतालीस",
  "छियालीस",
  "सैंतालीस",
  "अड़तालीस",
  "उनचास",
  "पचास",
  "इक्यावन",
  "बावन",
  "तिरपन",
  "चौवन",
  "पचपन",
  "छप्पन",
  "सत्तावन",
  "अट्ठावन",
  "उनसठ",
  "साठ",
  "इकसठ",
  "बासठ",
  "तिरसठ",
  "चौंसठ",
  "पैंसठ",
  "छियासठ",
  "सड़सठ",
  "अड़सठ",
  "उनहत्तर",
  "सत्तर",
  "इकहत्तर",
  "बहत्तर",
  "तिहत्तर",
  "चौहत्तर",
  "पचहत्तर",
  "छिहत्तर",
  "सतहत्तर",
  "अठहत्तर",
  "उनासी",
  "अस्सी",
  "इक्यासी",
  "बयासी",
  "तिरासी",
  "चौरासी",
  "पचासी",
  "छियासी",
  "सत्तासी",
  "अट्ठासी",
  "नवासी",
  "नब्बे",
  "इक्यानवे",
  "बानवे",
  "तिरानवे",
  "चौरानवे",
  "पचानवे",
  "छियानवे",
  "सत्तानवे",
  "अट्ठानवे",
  "निन्यानवे",
];

const NE_SCALES = [
  "हजार",
  "लाख",
  "करोड",
  "अरब",
  "खरब",
  "नील",
  "पद्म",
  "शंख",
  "महाशंख",
  "जलधि",
  "अंत्य",
  "मध्य",
  "परार्ध",
];

const HI_SCALES = [
  "हज़ार",
  "लाख",
  "करोड़",
  "अरब",
  "खरब",
  "नील",
  "पद्म",
  "शंख",
  "महाशंख",
  "जलधि",
  "अंत्य",
  "मध्य",
  "परार्ध",
];

const EN_ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES = [
  "",
  "thousand",
  "million",
  "billion",
  "trillion",
  "quadrillion",
  "quintillion",
  "sextillion",
  "septillion",
  "octillion",
  "nonillion",
  "decillion",
  "undecillion",
  "duodecillion",
  "tredecillion",
  "quattuordecillion",
  "quindecillion",
  "sexdecillion",
  "septendecillion",
  "octodecillion",
  "novemdecillion",
  "vigintillion",
];

function intDigitString(n: number): string {
  const num = Math.max(0, Math.floor(Math.abs(Number.isFinite(n) ? n : 0)));
  if (num <= Number.MAX_SAFE_INTEGER) return String(num);
  return num.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 }).replace(/\D/g, "") || "0";
}

function southAsianGroupWords(n: number, ones: string[], hundredWord: string, scales: string[]): string {
  const digits = intDigitString(n);
  if (!digits || digits === "0") return ones[0];
  const low = Number(digits.slice(-3) || "0");
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  const last3 = (v: number) => {
    const hundred = Math.floor(v / 100);
    const rem = v % 100;
    const out: string[] = [];
    if (hundred > 0) out.push(`${ones[hundred]} ${hundredWord}`);
    if (rem > 0) out.push(ones[rem]);
    return out.join(" ");
  };
  if (low > 0) parts.unshift(last3(low));
  let i = 0;
  while (rest.length > 0) {
    const g = Number(rest.slice(-2) || "0");
    rest = rest.slice(0, -2);
    if (g > 0) {
      const name = scales[i] || "";
      parts.unshift(name ? `${ones[g]} ${name}` : ones[g]);
    }
    i += 1;
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function en0to999(n: number): string {
  const v = Math.max(0, Math.floor(n)) % 1000;
  if (v === 0) return "";
  const hundred = Math.floor(v / 100);
  const rem = v % 100;
  const parts: string[] = [];
  if (hundred > 0) parts.push(`${EN_ONES[hundred]} hundred`);
  if (rem > 0) {
    if (rem < 20) parts.push(EN_ONES[rem]);
    else {
      const ten = EN_TENS[Math.floor(rem / 10)];
      const one = EN_ONES[rem % 10];
      parts.push(one ? `${ten} ${one}` : ten);
    }
  }
  return parts.join(" ");
}

function westernGroupWords(n: number): string {
  const digits = intDigitString(n);
  if (!digits || digits === "0") return "zero";
  const belowMillion = Number(digits.length > 6 ? digits.slice(-6) : digits);
  const above = digits.length > 6 ? digits.slice(0, -6) : "";
  const parts: string[] = [];
  if (above) {
    const groups: number[] = [];
    let rest = above;
    while (rest.length > 0) {
      groups.push(Number(rest.slice(-3) || "0"));
      rest = rest.slice(0, -3);
    }
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (!g) continue;
      const w = en0to999(g);
      const name = EN_SCALES[i + 2] || "";
      parts.push(name ? `${w} ${name}` : w);
    }
  }
  const lakh = Math.floor(belowMillion / 100000);
  const thousand = Math.floor((belowMillion % 100000) / 1000);
  const low = belowMillion % 1000;
  if (lakh > 0) parts.push(`${en0to999(lakh)} lakh`);
  if (thousand > 0) parts.push(`${en0to999(thousand)} thousand`);
  if (low > 0) parts.push(en0to999(low));
  return parts.join(" ").replace(/\s+/g, " ").trim() || "zero";
}

function titleCaseWords(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export const AMOUNT_WORDS_LABELS: Record<QuotationLetterLang, string> = {
  en: "In words",
  ne: "अक्षरमा",
  hi: "शब्दों में",
};

export function quotationAmountInWords(
  amount: number,
  lang: QuotationLetterLang,
  currencyCode?: string | null
): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const [rupees, paisa] = safe.toFixed(2).split(".").map(Number);
  if (lang === "ne") {
    let text = `रूपैयाँ ${southAsianGroupWords(rupees, NE_0_99, "सय", NE_SCALES)}`;
    if (paisa > 0) text += ` पैसा ${southAsianGroupWords(paisa, NE_0_99, "सय", NE_SCALES)}`;
    return `${text} मात्र`;
  }
  if (lang === "hi") {
    let text = `रुपये ${southAsianGroupWords(rupees, HI_0_99, "सौ", HI_SCALES)}`;
    if (paisa > 0) text += ` पैसे ${southAsianGroupWords(paisa, HI_0_99, "सौ", HI_SCALES)}`;
    return `${text} मात्र`;
  }
  let english = westernGroupWords(rupees);
  if (paisa > 0) english += ` and ${westernGroupWords(paisa)} ${currencyMinorUnitEn(currencyCode, paisa)}`;
  return `${titleCaseWords(english)} Only`;
}
