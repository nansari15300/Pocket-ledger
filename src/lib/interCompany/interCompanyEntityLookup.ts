/**
 * Target / source account — naam, mobile, bank A/c se entity + company track.
 */
import type { InterCompanyEntityDetail } from "@/lib/interCompany/interCompanyEntityTypes";
import {
  interCompanyAcNoPrefix,
  isValidInterCompanyAcNo,
  normalizeInterCompanyAcNo,
  readInterCompanyAcNoFromDoc,
} from "@/lib/interCompany/interCompanyAccountNo";
import {
  interCompanyPhonesMatch,
  isSearchableInterCompanyPhone,
  normalizeInterCompanyPhone,
} from "@/lib/interCompany/interCompanyPhone";

/** Dropdown — sirf account / party naam */
export function interCompanyEntityComboboxOptions(entities: InterCompanyEntityDetail[]) {
  return entities
    .map((e) => ({ value: `${e.kind}:${e.id}`, label: e.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function parseInterCompanyEntityValue(value: string): { kind: string; id: string } | null {
  const i = value.indexOf(":");
  if (i <= 0) return null;
  return { kind: value.slice(0, i), id: value.slice(i + 1) };
}

export function interCompanyEntityValue(entity: InterCompanyEntityDetail): string {
  return `${entity.kind}:${entity.id}`;
}

export function filterInterCompanyEntitiesByName(
  entities: InterCompanyEntityDetail[],
  q: string
): InterCompanyEntityDetail[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return entities.filter((e) => e.label.toLowerCase().includes(needle));
}

/** Type dropdown (Party/Staff/…) — account naam / A/c / mobile sirf isi kind par */
export function filterInterCompanyEntitiesByKind(
  entities: InterCompanyEntityDetail[],
  kind: InterCompanyEntityDetail["kind"]
): InterCompanyEntityDetail[] {
  return entities.filter((e) => e.kind === kind);
}

/** Bank ledger A/c number (party ke paas bank account number) */
export function filterInterCompanyEntitiesByBankAcNo(
  entities: InterCompanyEntityDetail[],
  digits: string
): InterCompanyEntityDetail[] {
  const d = digits.replace(/\D/g, "");
  if (d.length < 3) return [];
  return entities.filter((e) => {
    const ac = String(e.accountNumber ?? "").replace(/\D/g, "");
    return ac && (ac === d || ac.endsWith(d) || ac.includes(d));
  });
}

export function readEntityMobile(entity: InterCompanyEntityDetail): string {
  return normalizeInterCompanyPhone(entity.phone);
}

export function readEntityAcNoField(entity: InterCompanyEntityDetail): string {
  const ic = readInterCompanyAcNoFromDoc(entity);
  if (ic) return ic;
  if (entity.kind === "bank" && entity.accountNumber) {
    return String(entity.accountNumber).replace(/\D/g, "");
  }
  return readEntityMobile(entity);
}

export function filterInterCompanyEntitiesByInterCoAcNo(
  entities: InterCompanyEntityDetail[],
  raw: string
): InterCompanyEntityDetail[] {
  const norm = normalizeInterCompanyAcNo(raw);
  if (!isValidInterCompanyAcNo(norm)) return [];
  return entities.filter((e) => readInterCompanyAcNoFromDoc(e) === norm);
}

/** Mobile se accounts — party / bank / staff jinke phone match */
export function filterInterCompanyEntitiesByPhone(
  entities: InterCompanyEntityDetail[],
  phoneDigits: string
): InterCompanyEntityDetail[] {
  if (!phoneDigits) return [];
  return entities.filter((e) => e.phone && interCompanyPhonesMatch(e.phone, phoneDigits));
}

/** PAN normalize — uppercase alphanumeric */
export function normalizeInterCompanyPan(input: string | null | undefined): string {
  return String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function filterInterCompanyEntitiesByPan(
  entities: InterCompanyEntityDetail[],
  rawPan: string
): InterCompanyEntityDetail[] {
  const needle = normalizeInterCompanyPan(rawPan);
  if (needle.length < 4) return [];
  return entities.filter((e) => {
    const pan = normalizeInterCompanyPan(e.pan);
    return pan && (pan === needle || pan.includes(needle));
  });
}

export function readEntityPan(entity: InterCompanyEntityDetail): string {
  return normalizeInterCompanyPan(entity.pan);
}

/** C / legacy 15 = company; P/B/S/T/E = entity; warna bank ledger A/c */
export function classifyAccountAcInput(
  digits: string
): "company_inter_co" | "entity_inter_co" | "entity_bank_ac" | "invalid" {
  const d = normalizeInterCompanyAcNo(digits);
  if (isValidInterCompanyAcNo(d)) {
    const p = interCompanyAcNoPrefix(d);
    if (p === "C" || /^\d{15}$/.test(d)) return "company_inter_co";
    return "entity_inter_co";
  }
  if (d.replace(/[A-Z]/g, "").length >= 3) return "entity_bank_ac";
  return "invalid";
}

/** IC voucher clearing row — sirf isClearing bank/cash; saved id edit par hamesha include */
export function filterInterCompanyClearingBankEntities(
  entities: InterCompanyEntityDetail[],
  selectedBankId?: string
): InterCompanyEntityDetail[] {
  const banks = entities.filter((e) => e.kind === "bank");
  const clearing = banks.filter((e) => e.isClearing === true);
  const sid = String(selectedBankId || "").trim();
  if (sid && !clearing.some((e) => e.id === sid)) {
    const saved = banks.find((e) => e.id === sid);
    if (saved) return [...clearing, saved];
  }
  return clearing;
}

export { isSearchableInterCompanyPhone, normalizeInterCompanyPhone, interCompanyPhonesMatch };
