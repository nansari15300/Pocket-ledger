import type { PlServerSharedCompanySummary } from "@/lib/localServerShareableCompanies";

/** Host server config: kaun si local companies remote gate clients ko dikhani hain. */
export function normalizeSharedLocalCompanyIds(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    const s = String(id || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 200) break;
  }
  return out;
}

/**
 * `null` = legacy (config field missing) → saari shareable local companies.
 * `[]` = admin ne save kiya lekin koi tick nahi.
 * `[ids]` = sirf tick ki hui companies.
 */
export function filterShareableCompaniesForHostConfig<T extends { id: string }>(
  companies: T[],
  sharedLocalCompanyIds: string[] | null | undefined
): T[] {
  const normalized = normalizeSharedLocalCompanyIds(sharedLocalCompanyIds);
  if (normalized === null) return companies;
  if (!normalized.length) return [];
  const allowed = new Set(normalized);
  return companies.filter((c) => allowed.has(String(c.id || "").trim()));
}

export function sharedLocalCompanyIdsFromSummaries(
  rows: PlServerSharedCompanySummary[]
): string[] {
  return rows.map((r) => String(r.id || "").trim()).filter(Boolean);
}
