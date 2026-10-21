/** Text normalization rules (spec §4). */
const DEV_DIGITS = "०१२३४५६७८९";

export function devanagariDigitsToAscii(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));
}

/** O/o→0, l/I→1, S→5, B→8 only inside numeric-looking tokens. */
export function fixNumericToken(tok: string): string {
  if (!/\d/.test(tok)) return tok;
  if (!/^[\dOolISB.,\-/]+$/.test(tok)) return tok;
  return tok.replace(/[Oo]/g, "0").replace(/[lI]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
}

export function normalizeOcrLine(s: string): string {
  const t = devanagariDigitsToAscii(s.normalize("NFC"))
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return t.split(" ").map(fixNumericToken).join(" ");
}

const AMOUNT_RE =
  /^(\d{1,3}(,\d{2})*(,\d{3})(\.\d{1,2})?|\d{1,3}(,\d{3})+(\.\d{1,2})?|\d+(\.\d{1,2})?)$/;

/** Strict amount parse (Western + lakh grouping, max 2 decimals, `/-` suffix). */
export function parseStrictAmount(raw: string): number | null {
  let s = raw.trim().replace(/^(rs\.?|npr|रु\.?|रू\.?|₹)\s*/i, "").replace(/\/-$/, "").trim();
  if (!s) return null;
  // Printed 5-decimal values (175.20000 / 11,504.16000): trailing zeros after 2 decimals are noise.
  s = s.replace(/(\.\d{2})0+$/, "$1").replace(/(\.\d)0+$/, "$1");
  if (!AMOUNT_RE.test(s)) return null;
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** All amount-looking tokens in a line, left→right. */
export function amountsInLine(line: string): number[] {
  const out: number[] = [];
  const re = /(?:rs\.?|npr|रु\.?|रू\.?)?\s*(?<![\d.,])(\d[\d,]*(?:\.\d{1,5})?)(?![\d.,]*\d)(?:\/-)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const n = parseStrictAmount(m[1]);
    if (n != null) out.push(n);
  }
  return out;
}

const PARTY_SUFFIXES =
  /\b(pvt\.?|private|ltd\.?|limited|traders?|suppliers?|enterprises?|udhyog|udyog|company|co\.?|and|&)\b|प्रा\.?\s*लि\.?|ट्रेडर्स|उद्योग|सप्लायर्स|इन्टरप्राइजेज/gi;

export function normalizeName(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(PARTY_SUFFIXES, " ")
    // keep \p{M}: Devanagari vowel signs / virama are combining marks (stripping them mangled Hindi names + aliases)
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** OCR confusions inside an identifier part that is mostly digits (B3 -> 83, O1 -> 01, l5 -> 15). */
export function fixDigitConfusions(part: string): string {
  if (!/\d/.test(part) || !/^[\dOoIlSB]+$/.test(part)) return part;
  return part.replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
}
