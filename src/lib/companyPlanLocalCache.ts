/**
 * Offline / mirror race: SQLite kabhi Basic ho jati hai jab Firestore par plan Pro hai —
 * billing + server sync ke baad yahan planId + expiry cache se normalizeLocalCompany overlay karta hai.
 *
 * **`resolveEffectivePlanIdForVoucherQuota`**: SQLite + yahi cache — vouchers save limit check UI jaisi plan tier use kare.
 */
import { higherPlanByTier, normalizePlanIdForClient, type PlanId } from "@/config/plans";

const PREFIX_TOKEN = "pocket-ledger:companyPlan:";

export type CompanyPlanLocalCacheEntry = {
  planId: string;
  planExpiryMs: number;
  lastStripeCheckoutSessionId?: string;
  updatedAtMs: number;
  /** Server `sync-plan` RS256 — SQLite/planId edit se paid fake bypass mushkil. */
  planEntitlementJws?: string;
  entitlementVerifiedAtMs?: number;
  entitlementSignatureOk?: boolean;
  entitlementPlanIdFromJwt?: string;
  entitlementPlanExpMsFromJwt?: number;
  entitlementOfflineUntilMsFromJwt?: number;
  /** JWT `device` claim === `getOrCreateClientDeviceId()` — clone / export mismatch flag. */
  entitlementDeviceMatch?: boolean;
};

const TTL_MS = 400 * 24 * 60 * 60 * 1000;

type WriteCompanyPlanLocalCacheInput = Pick<CompanyPlanLocalCacheEntry, "planId" | "planExpiryMs"> & {
  lastStripeCheckoutSessionId?: string;
} & Partial<
  Pick<
    CompanyPlanLocalCacheEntry,
    | "planEntitlementJws"
    | "entitlementVerifiedAtMs"
    | "entitlementSignatureOk"
    | "entitlementPlanIdFromJwt"
    | "entitlementPlanExpMsFromJwt"
    | "entitlementOfflineUntilMsFromJwt"
    | "entitlementDeviceMatch"
  >
>;

export function writeCompanyPlanLocalCache(companyId: string, partial: WriteCompanyPlanLocalCacheInput): void {
  if (typeof window === "undefined" || !companyId?.trim()) return;
  try {
    const prev = readCompanyPlanLocalCache(companyId.trim());
    const entry: CompanyPlanLocalCacheEntry = {
      // Stripe/admin kabhi `proplus` bheje — localStorage me canonical `pro-plus` taaki UI/device/voucher sab align rahein
      planId: normalizePlanIdForClient(partial.planId.trim()),
      planExpiryMs: partial.planExpiryMs,
      lastStripeCheckoutSessionId: partial.lastStripeCheckoutSessionId ?? prev?.lastStripeCheckoutSessionId,
      updatedAtMs: Date.now(),
      planEntitlementJws:
        partial.planEntitlementJws !== undefined ? partial.planEntitlementJws : prev?.planEntitlementJws,
      entitlementVerifiedAtMs:
        partial.entitlementVerifiedAtMs !== undefined
          ? partial.entitlementVerifiedAtMs
          : prev?.entitlementVerifiedAtMs,
      entitlementSignatureOk:
        partial.entitlementSignatureOk !== undefined
          ? partial.entitlementSignatureOk
          : prev?.entitlementSignatureOk,
      entitlementPlanIdFromJwt:
        partial.entitlementPlanIdFromJwt !== undefined
          ? partial.entitlementPlanIdFromJwt
          : prev?.entitlementPlanIdFromJwt,
      entitlementPlanExpMsFromJwt:
        partial.entitlementPlanExpMsFromJwt !== undefined
          ? partial.entitlementPlanExpMsFromJwt
          : prev?.entitlementPlanExpMsFromJwt,
      entitlementOfflineUntilMsFromJwt:
        partial.entitlementOfflineUntilMsFromJwt !== undefined
          ? partial.entitlementOfflineUntilMsFromJwt
          : prev?.entitlementOfflineUntilMsFromJwt,
      entitlementDeviceMatch:
        partial.entitlementDeviceMatch !== undefined
          ? partial.entitlementDeviceMatch
          : prev?.entitlementDeviceMatch,
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
    // Purane entries: optional entitlement fields missing — `?? undefined` behavior OK
    return p;
  } catch {
    return null;
  }
}

/**
 * `useCompany` `normalizeLocalCompany` jaisa planId tier — vouchers daily/month quota offline/online ek hi Paid tier dekhe,
 * kyunki SQLite mirror kabhi Stripe/server sync ke pehle "basic" reh sakti hai.
 */
export function resolveEffectivePlanIdForVoucherQuota(
  companyId: string,
  sqliteRow: { planId?: string | null; planExpiryMs?: unknown } | null
): PlanId {
  let planId = (sqliteRow?.planId && String(sqliteRow.planId).trim()) || "basic";
  const sqliteMs =
    typeof sqliteRow?.planExpiryMs === "number" && Number.isFinite(sqliteRow.planExpiryMs)
      ? sqliteRow.planExpiryMs
      : null;
  const cached = readCompanyPlanLocalCache(companyId.trim());
  if (cached) {
    const cp = normalizePlanIdForClient(cached.planId);
    const sqliteBasic = planId === "basic";
    const cachePaid = cp !== "basic";
    const expBetter = sqliteMs == null || cached.planExpiryMs > sqliteMs;
    if (cachePaid && (sqliteBasic || expBetter)) {
      planId = cp;
    }
  }
  return normalizePlanIdForClient(planId);
}

type PlanRowHint = { planId?: string | null; planExpiryMs?: unknown };

/**
 * Online voucher save: Firestore company doc + SQLite registry dono — phir `resolveEffectivePlanIdForVoucherQuota` (Stripe cache overlay).
 * Sirf Firestore se `planId` → Basic (5) cap jab actual tier mirror me pro-plus ho.
 */
export function resolvePlanIdForVoucherEnforcement(
  companyId: string,
  sqliteRow: PlanRowHint | null,
  firestoreRow: PlanRowHint | null
): PlanId {
  const mergedTier = higherPlanByTier(firestoreRow?.planId, sqliteRow?.planId);
  const sqlMs =
    typeof sqliteRow?.planExpiryMs === "number" && Number.isFinite(sqliteRow.planExpiryMs)
      ? sqliteRow.planExpiryMs
      : null;
  const fsMs =
    typeof firestoreRow?.planExpiryMs === "number" && Number.isFinite(firestoreRow.planExpiryMs)
      ? firestoreRow.planExpiryMs
      : null;
  const mergedMs = sqlMs != null && fsMs != null ? Math.max(sqlMs, fsMs) : sqlMs ?? fsMs;
  return resolveEffectivePlanIdForVoucherQuota(companyId, { planId: mergedTier, planExpiryMs: mergedMs });
}
