"use client";

import { listLocalCompanies, upsertLocalCompany } from "@/lib/localCompanyStore";
import { writeCompanyPlanLocalCache } from "@/lib/companyPlanLocalCache";
import { bumpLocalCompanyRegistry } from "@/lib/applyStripePlanToLocalCompany";
import { normalizePlanIdForClient, type PlanId } from "@/config/plans";

/** Project account subscription onto every owned local SQLite company row (online + offline). */
export async function applyAccountCanonicalPlanToAllLocalCompanies(
  firebaseUid: string,
  args: {
    planId: PlanId | string;
    planExpiryMs: number | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  }
): Promise<void> {
  const uid = String(firebaseUid || "").trim();
  if (!uid) return;
  const planId = normalizePlanIdForClient(args.planId);
  const planPatch: Record<string, unknown> = {
    planId,
    planExpiryMs: args.planExpiryMs,
    planUpgradedAtMs: Date.now(),
  };
  if (args.stripeCustomerId?.trim()) planPatch.stripeCustomerId = args.stripeCustomerId.trim();
  if (args.stripeSubscriptionId?.trim()) planPatch.stripeSubscriptionId = args.stripeSubscriptionId.trim();

  const owned = (await listLocalCompanies()).filter((c) => String(c.ownerId || "").trim() === uid);
  if (owned.length === 0) return;

  for (const row of owned) {
    await upsertLocalCompany({
      ...row,
      ...planPatch,
    });
    writeCompanyPlanLocalCache(row.id, {
      planId,
      planExpiryMs: args.planExpiryMs,
    });
  }
  bumpLocalCompanyRegistry();
}
