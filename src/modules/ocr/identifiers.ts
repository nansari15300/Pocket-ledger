/** Bill identifiers used for account lookup (Find account panel) + template learning. */
import { normalizeOcrLine } from "./normalize";
import type { OcrPartyLike } from "./types";

export type OcrIdentifiers = {
  pan?: string;
  phones: string[];
  emails: string[];
  address?: string;
  bankAccountNos: string[];
  regNo?: string;
  contactPerson?: string;
  paymentMode?: string;
};

export function extractIdentifiers(rawLines: string[], ownPan?: string | null, pan?: string | null): OcrIdentifiers {
  const lines = rawLines.map(normalizeOcrLine).filter(Boolean);
  const text = lines.join("\n");
  const own = (ownPan || "").replace(/\D/g, "");
  const phones = new Set<string>();
  for (const m of text.matchAll(/(?:\+?977[\s-]?)?(9[78]\d{8}|0\d{1,2}[\s-]?\d{6,7})(?!\d)/g)) {
    phones.add(m[1].replace(/\D/g, ""));
  }
  const emails = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) emails.add(m[0].toLowerCase());
  const bank = new Set<string>();
  for (const l of lines) {
    if (!/\b(a\/?c|acc(?:oun)?t)\s*(no|number|#)?\b|खाता\s*नं/i.test(l)) continue;
    const m = l.replace(/(\d)[\s-](?=\d)/g, "$1").match(/(?<!\d)\d{8,20}(?!\d)/);
    if (m) bank.add(m[0]);
  }
  const regLine = lines.find((l) => /\b(reg(?:istration)?\.?\s*no|regd\.?\s*no|company\s*reg)\b|दर्ता\s*नं/i.test(l));
  const regNo = regLine?.replace(/.*?(no\.?|नं\.?)\s*[:.-]?\s*/i, "").match(/[A-Za-z0-9\-/]{2,20}/)?.[0];
  const addrLine = lines.slice(0, 8).find((l) => /\b(address|addr|ward|tole|marg|road|municipality|nagarpalika|gaunpalika|nepal)\b|ठेगाना|वडा|नगरपालिका|गाउँपालिका/i.test(l));
  const contactLine = lines.find((l) => /\b(contact\s*person|attn\.?|prop(?:rietor)?\.?)\b|सम्पर्क\s*व्यक्ति|प्रोप्राइटर/i.test(l));
  const p = (pan || "").replace(/\D/g, "");
  return {
    pan: p && p !== own ? p : undefined,
    phones: [...phones].slice(0, 4),
    emails: [...emails].slice(0, 3),
    address: addrLine?.replace(/^(address|addr|ठेगाना)\s*[:.-]?\s*/i, "").slice(0, 120) || undefined,
    bankAccountNos: [...bank].slice(0, 3),
    regNo: regNo || undefined,
    contactPerson: contactLine?.replace(/^.*?(person|attn\.?|prop(?:rietor)?\.?|व्यक्ति|प्रोप्राइटर)\s*[:.-]?\s*/i, "").slice(0, 60) || undefined,
  };
}

type AnyParty = OcrPartyLike & { email?: string; address?: string; bankAccountNo?: string; accountNumber?: string; registrationNo?: string };

const digits = (s?: string) => (s || "").replace(/\D/g, "");
const last10 = (s?: string) => digits(s).slice(-10);

export type IdentifierHit = { kind: string; value: string; party: OcrPartyLike };

/** Scan ALL accounts by each identifier. */
export function findPartiesByIdentifiers(ids: OcrIdentifiers, parties: readonly OcrPartyLike[]): IdentifierHit[] {
  const hits: IdentifierHit[] = [];
  const seen = new Set<string>();
  const push = (kind: string, value: string, party: OcrPartyLike) => {
    const k = `${kind}|${party.id}`;
    if (seen.has(k)) return;
    seen.add(k);
    hits.push({ kind, value, party });
  };
  for (const raw of parties as readonly AnyParty[]) {
    if (raw.isDeleted) continue;
    if (ids.pan && digits(raw.pan) === ids.pan) push("PAN", ids.pan, raw);
    for (const ph of ids.phones) if (ph.length >= 7 && last10(raw.phone) && last10(raw.phone) === ph.slice(-10)) push("Phone", ph, raw);
    for (const em of ids.emails) if ((raw.email || "").toLowerCase().trim() === em) push("Email", em, raw);
    for (const ac of ids.bankAccountNos) if ([raw.bankAccountNo, raw.accountNumber].some((x) => digits(x) === ac)) push("Bank A/c", ac, raw);
    if (ids.regNo && (raw.registrationNo || "").toLowerCase() === ids.regNo.toLowerCase()) push("Reg. No", ids.regNo, raw);
    if (ids.address && raw.address) {
      const a = ids.address.toLowerCase(), b = raw.address.toLowerCase();
      if (a.length >= 6 && (a.includes(b) || b.includes(a))) push("Address", ids.address, raw);
    }
  }
  return hits;
}

/** "xx accounts have no PAN" coverage info. */
export function identifierCoverage(parties: readonly OcrPartyLike[]) {
  const live = (parties as readonly AnyParty[]).filter((p) => !p.isDeleted);
  const noPan = live.filter((p) => digits(p.pan).length !== 9);
  const noPhone = live.filter((p) => digits(p.phone).length < 7);
  const noEmail = live.filter((p) => !(p.email || "").includes("@"));
  const noAddress = live.filter((p) => !(p.address || "").trim());
  return { total: live.length, noPan, noPhone, noEmail, noAddress };
}
