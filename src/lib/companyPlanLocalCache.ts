/**
 * Offline / mirror race: SQLite kabhi Basic ho jati hai jab Firestore par plan Pro hai —
 * billing + server sync ke baad yahan planId + expiry cache se normalizeLocalCompany overlay karta hai.
 */
const PREFIX_TOKEN = "pocket-ledger:companyPlan:";

export type CompanyPlanLocalCacheEntry = {
  planId: string;
  planExpiryMs: number;
  lastStripeCheckoutSessionId?: string;
  updatedAtMs: number;
};

const TTL_MS = 400 * 24 * 60 * 60 * 1000;

export function writeCompanyPlanLocalCache(
  companyId: string,
  partial: Pick<CompanyPlanLocalCacheEntry, "planId" | "planExpiryMs"> & {
    lastStripeCheckoutSessionId?: string;
  }
): void {
  if (typeof window === "undefined" || !companyId?.trim()) return;
  try {
    const entry: CompanyPlanLocalCacheEntry = {
      planId: partial.planId.trim(),
      planExpiryMs: partial.planExpiryMs,
      lastStripeCheckoutSessionId: partial.lastStripeCheckoutSessionId,
      updatedAtMs: Date.now(),
    };
    window.localStorage.setItem(PREFIX_TOKEN + companyId.trim(), JSON.stringify(entry));
  } catch {
    /* private mode / quota */
  }
}

/** Server ne basic / downgrade bheja ho to purana Pro cache hatao */
export function clearCompanyPlanLocalCache(companyId: string): void {
  if (typeof window === "undefined" || !companyId?.trim()) return;
  try {
    window.localStorage.removeItem(PREFIX_TOKEN + companyId.trim());
  } catch {
    /* ignore */
  }
}

export function readCompanyPlanLocalCache(companyId: string): CompanyPlanLocalCacheEntry | null {
  if (typeof window === "undefined" || !companyId?.trim()) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX_TOKEN + companyId.trim());
    if (!raw?.trim()) return null;
    const p = JSON.parse(raw) as CompanyPlanLocalCacheEntry;
    if (!p?.planId?.trim() || typeof p.planExpiryMs !== "number" || !Number.isFinite(p.planExpiryMs)) return null;
    if (Date.now() - (p.updatedAtMs || 0) > TTL_MS) return null;
    return p;
  } catch {
    return null;
  }
}
