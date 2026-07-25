"use client";

import { normalizePlanIdForClient, type PlanId } from "@/config/plans";

export type AccountPlanLocalCacheEntry = {
  planId: PlanId;
  planExpiryMs: number | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  updatedAtMs: number;
};

const KEY_PREFIX = "pocket-ledger:accountPlanLocalCache:";

function keyForUid(firebaseUid: string): string {
  return `${KEY_PREFIX}${firebaseUid.trim()}`;
}

export function readAccountPlanLocalCache(
  firebaseUid: string | undefined | null
): AccountPlanLocalCacheEntry | null {
  if (typeof window === "undefined" || !firebaseUid?.trim()) return null;
  try {
    const raw = window.localStorage.getItem(keyForUid(firebaseUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountPlanLocalCacheEntry>;
    const planId = normalizePlanIdForClient(parsed.planId);
    const planExpiryMs =
      typeof parsed.planExpiryMs === "number" && Number.isFinite(parsed.planExpiryMs)
        ? parsed.planExpiryMs
        : null;
    const updatedAtMs =
      typeof parsed.updatedAtMs === "number" && Number.isFinite(parsed.updatedAtMs)
        ? parsed.updatedAtMs
        : 0;
    return {
      planId,
      planExpiryMs,
      stripeCustomerId: parsed.stripeCustomerId,
      stripeSubscriptionId: parsed.stripeSubscriptionId,
      updatedAtMs,
    };
  } catch {
    return null;
  }
}

export function writeAccountPlanLocalCache(
  firebaseUid: string | undefined | null,
  entry: {
    planId?: string | null;
    planExpiryMs?: number | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  }
): void {
  if (typeof window === "undefined" || !firebaseUid?.trim()) return;
  const planId = normalizePlanIdForClient(entry.planId);
  try {
    const payload: AccountPlanLocalCacheEntry = {
      planId,
      planExpiryMs:
        typeof entry.planExpiryMs === "number" && Number.isFinite(entry.planExpiryMs)
          ? entry.planExpiryMs
          : null,
      stripeCustomerId: entry.stripeCustomerId || undefined,
      stripeSubscriptionId: entry.stripeSubscriptionId || undefined,
      updatedAtMs: Date.now(),
    };
    window.localStorage.setItem(keyForUid(firebaseUid), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
