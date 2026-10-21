/**
 * Devanagari -> Roman transliteration + a loose "sound skeleton" so a name written in Devanagari
 * (e.g. an Alias Name) and the same name printed/typed in Roman match each other
 * ("Jay Syarsekalika Oil Center" <-> Devanagari spelling). No imports: shared by OCR, tests and the Combobox.
 */
const IND: Record<string, string> = {
  "\u0905": "a", "\u0906": "a", "\u0907": "i", "\u0908": "i", "\u0909": "u", "\u090A": "u", "\u090B": "ri",
  "\u090D": "e", "\u090F": "e", "\u0910": "ai", "\u0911": "o", "\u0913": "o", "\u0914": "au",
};
const CONS: Record<string, string> = {
  "\u0915": "k", "\u0916": "kh", "\u0917": "g", "\u0918": "gh", "\u0919": "n", "\u091A": "ch", "\u091B": "chh",
  "\u091C": "j", "\u091D": "jh", "\u091E": "n", "\u091F": "t", "\u0920": "th", "\u0921": "d", "\u0922": "dh",
  "\u0923": "n", "\u0924": "t", "\u0925": "th", "\u0926": "d", "\u0927": "dh", "\u0928": "n", "\u0929": "n",
  "\u092A": "p", "\u092B": "ph", "\u092C": "b", "\u092D": "bh", "\u092E": "m", "\u092F": "y", "\u0930": "r",
  "\u0931": "r", "\u0932": "l", "\u0933": "l", "\u0934": "l", "\u0935": "v", "\u0936": "sh", "\u0937": "sh",
  "\u0938": "s", "\u0939": "h", "\u0958": "k", "\u0959": "kh", "\u095A": "g", "\u095B": "z", "\u095C": "r",
  "\u095D": "rh", "\u095E": "f", "\u095F": "y",
};
const MATRA: Record<string, string> = {
  "\u093E": "a", "\u093F": "i", "\u0940": "i", "\u0941": "u", "\u0942": "u", "\u0943": "ri", "\u0945": "e",
  "\u0946": "e", "\u0947": "e", "\u0948": "ai", "\u0949": "o", "\u094A": "o", "\u094B": "o", "\u094C": "au",
};
const VIRAMA = "\u094D";
const NUKTA = "\u093C";

export function hasDevanagari(s: string): boolean {
  return /[\u0900-\u097F]/.test(s);
}

export function devanagariToRoman(input: string): string {
  const s = String(input ?? "").normalize("NFC");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === NUKTA) continue;
    if (CONS[ch]) {
      out += CONS[ch];
      let j = i + 1;
      if (s[j] === NUKTA) j++;
      const nx = s[j];
      if (nx === VIRAMA) { i = j; continue; }
      if (nx && MATRA[nx]) { out += MATRA[nx]; i = j; continue; }
      out += "a"; // inherent vowel
      continue;
    }
    if (IND[ch]) { out += IND[ch]; continue; }
    if (MATRA[ch]) { out += MATRA[ch]; continue; }
    if (ch === "\u0902" || ch === "\u0901") { out += "n"; continue; }
    if (ch === "\u0903") { out += "h"; continue; }
    if (ch === VIRAMA) continue;
    if (ch >= "\u0966" && ch <= "\u096F") { out += String(ch.charCodeAt(0) - 0x0966); continue; }
    out += ch;
  }
  return out;
}

function skelWord(w: string): string {
  let x = w
    .replace(/ph/g, "f").replace(/sh/g, "s").replace(/ch/g, "c")
    .replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/q/g, "k").replace(/z/g, "j")
    .replace(/w/g, "v").replace(/x/g, "ks");
  const first = x[0] ?? "";
  x = first + x.slice(1).replace(/h/g, "").replace(/[aeiouy]/g, "");
  return x.replace(/(.)\1+/g, "$1");
}

/** Loose phonetic skeleton (works for Roman and Devanagari input). */
export function nameSkeleton(input: string): string {
  return devanagariToRoman(String(input ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(skelWord)
    .join(" ");
}

/** Typed query (Roman or Devanagari) vs target text: every query word must prefix-match a target word by skeleton. */
export function skeletonQueryMatches(query: string, target: string): boolean {
  const q = nameSkeleton(query).split(" ").filter(Boolean);
  if (q.join("").length < 3) return false;
  const t = nameSkeleton(target).split(" ").filter(Boolean);
  return q.every((qw) => t.some((tw) => tw.startsWith(qw)));
}
