"use client";

import { normalizePlanIdForClient, type PlanId, planTierIndex } from "@/config/plans";

/**
 * Account-level plan: highest tier among companies the Firebase user owns.
 * Local row may stay "basic" while another owned company or Stripe mirror already has "advance" — entitlements use this.
 */
export function highestPlanIdAmongOwnedCompanies(
  allCompanies: ReadonlyArray<{ planId?: string | null | undefined; isOwned?: boolean; ownerId?: string }>,
  firebaseUid: string | undefined | null
): PlanId | null {
  if (!firebaseUid?.trim()) return null;
  const uid = firebaseUid.trim();
  const owned = allCompanies.filter(
    (c) => c.isOwned === true && String(c.ownerId || "").trim() === uid
  );
  if (owned.length === 0) return null;
  let best: PlanId = "basic";
  let bestIdx = -1;
  for (const c of owned) {
    const id = normalizePlanIdForClient(c.planId);
    const idx = planTierIndex(id);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = id;
    }
  }
  return best;
}

/** Resolved SKU for hooks/UI: owned aggregate first, then active company (e.g. shared or loading). */
export function resolveEffectiveAccountPlanId(
  allCompanies: ReadonlyArray<{ planId?: string | null | undefined; isOwned?: boolean; ownerId?: string }>,
  firebaseUid: string | undefined | null,
  activeCompanyPlanId: string | undefined | null
): PlanId {
  const fromOwned = highestPlanIdAmongOwnedCompanies(allCompanies, firebaseUid);
  if (fromOwned) return fromOwned;
  return normalizePlanIdForClient(activeCompanyPlanId);
}

type CompanyPlanRow = {
  planId?: string | null | undefined;
  isOwned?: boolean;
  ownerId?: string;
  ownerEmail?: string | null;
};

/** Firebase user is owner of this company row (billing / account SKU). */
export function isCompanyOwnedByFirebaseUser(
  company: CompanyPlanRow | null | undefined,
  firebaseUid: string | undefined | null,
  firebaseEmail?: string | null
): boolean {
  if (!company) return false;
  if (company.isOwned === true) return true;
  const uid = String(firebaseUid || "").trim();
  const oid = String(company.ownerId || "").trim();
  if (uid && oid && uid === oid) return true;
  const ue = String(firebaseEmail || "")
    .toLowerCase()
    .trim();
  const oe = String(company.ownerEmail || "")
    .toLowerCase()
    .trim();
  return !!ue && !!oe && ue === oe;
}

/**
 * Active company ke liye plan tier:
 * - **Owned** → account-level best owned SKU (`resolveEffectiveAccountPlanId`)
 * - **Shared** → isi company doc ka `planId` (owner subscription — shared user ka apna basic plan yahan mix na ho)
 */
export function resolvePlanIdForActiveCompany(
  company: CompanyPlanRow | null | undefined,
  allCompanies: ReadonlyArray<CompanyPlanRow>,
  firebaseUid: string | undefined | null,
  firebaseEmail?: string | null
): PlanId {
  if (!company) {
    return resolveEffectiveAccountPlanId(allCompanies, firebaseUid, null);
  }
  if (isCompanyOwnedByFirebaseUser(company, firebaseUid, firebaseEmail)) {
    return resolveEffectiveAccountPlanId(allCompanies, firebaseUid, company.planId);
  }
  return normalizePlanIdForClient(company.planId);
}
