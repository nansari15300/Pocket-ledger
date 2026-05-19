/**
 * Inter-company lookup — mobile normalize + match (company / party phone).
 */

/** Sirf digits — search / store compare */
export function normalizeInterCompanyPhone(input: string | null | undefined): string {
  return String(input ?? "").replace(/\D/g, "");
}

/** Kam se kam 7 digit tab search chale */
export function isSearchableInterCompanyPhone(digits: string): boolean {
  return digits.length >= 7;
}

/** Do numbers match (exact ya suffix — country code) */
export function interCompanyPhonesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const da = normalizeInterCompanyPhone(a);
  const db = normalizeInterCompanyPhone(b);
  if (!da || !db) return false;
  if (da === db) return true;
  return da.endsWith(db) || db.endsWith(da);
}
