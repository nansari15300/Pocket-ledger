/** Local supplier templates (learning): identifier → account id, per company (device-local). */
import type { OcrIdentifiers } from "./identifiers";

const KEY = (companyId: string) => `pl.ocr.templates.${companyId || "default"}`;
type Store = Record<string, { partyId: string; at: number }>;

function read(companyId: string): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY(companyId)) || "{}") as Store;
  } catch {
    return {};
  }
}

function keysOf(ids: OcrIdentifiers): string[] {
  return [
    ids.pan && `pan:${ids.pan}`,
    ...ids.phones.map((p) => `phone:${p.slice(-10)}`),
    ...ids.emails.map((e) => `email:${e}`),
    ...ids.bankAccountNos.map((a) => `bank:${a}`),
    ids.regNo && `reg:${ids.regNo.toLowerCase()}`,
  ].filter(Boolean) as string[];
}

export function lookupTemplateParty(companyId: string, ids: OcrIdentifiers): string | null {
  const s = read(companyId);
  const found = new Set(keysOf(ids).map((k) => s[k]?.partyId).filter(Boolean));
  return found.size === 1 ? [...found][0]! : null;
}

export function learnTemplateParty(companyId: string, ids: OcrIdentifiers, partyId: string) {
  // never learn a system ledger (Sales/Purchase Account...) as a supplier/customer
  if (["sales_account", "purchase_account", "owners_capital", "opening_balance_ledger"].includes(partyId)) return;
  try {
    const s = read(companyId);
    for (const k of keysOf(ids)) s[k] = { partyId, at: Date.now() };
    localStorage.setItem(KEY(companyId), JSON.stringify(s));
  } catch {
    /* storage full / private mode */
  }
}
