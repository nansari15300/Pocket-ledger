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
