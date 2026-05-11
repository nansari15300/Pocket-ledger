/**
 * Paid plan ki `planExpiry` beet chuki ho aur owner ne opt-out na kiya ho — company ko Basic par server-side.
 * `sync-plan` call par chalta hai taaki app khulte hi expiry resolve ho.
 */
import * as admin from "firebase-admin";
import { normalizePlanIdForClient, type PlanId } from "@/config/plans";
import { isCompanyOwner } from "@/lib/server/companyOwner";

const PAID: PlanId[] = ["advance", "pro", "pro-plus"];

function planExpiryMsFromCompanyData(data: Record<string, unknown>): number | null {
  if (typeof data.planExpiryMs === "number" && Number.isFinite(data.planExpiryMs)) {
    return data.planExpiryMs;
  }
  const pe = data.planExpiry as { toMillis?: () => number } | undefined;
  if (pe && typeof pe.toMillis === "function") return pe.toMillis();
  return null;
}

export async function applyExpiredPaidPlanAutoDowngradeIfEligible(args: {
  db: admin.firestore.Firestore;
  companyRef: admin.firestore.DocumentReference;
  snapData: Record<string, unknown>;
  decoded: admin.auth.DecodedIdToken;
  nowMs?: number;
}): Promise<boolean> {
  const now = args.nowMs ?? Date.now();
  if (!isCompanyOwner(args.decoded, args.snapData as { ownerId?: string; ownerEmail?: string })) {
    return false;
  }

  const planId = normalizePlanIdForClient(args.snapData.planId != null ? String(args.snapData.planId) : undefined);
  if (!PAID.includes(planId)) return false;

  const expMs = planExpiryMsFromCompanyData(args.snapData);
  if (expMs == null || expMs >= now) return false;

  /** `undefined` / missing = default ON (expire par Basic); sirf explicit `false` se band. */
  const autoDowngrade = args.snapData.autoDowngradeToBasicWhenExpired;
  if (autoDowngrade === false) return false;

  const batch = args.db.batch();
  batch.update(args.companyRef, {
    planId: "basic",
    planExpiry: admin.firestore.FieldValue.delete(),
    planExpiryMs: admin.firestore.FieldValue.delete(),
    stripeSubscriptionId: admin.firestore.FieldValue.delete(),
    planUpgradedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastAutoDowngradeToBasicAt: admin.firestore.FieldValue.serverTimestamp(),
    lastAutoDowngradeToBasicReason: "paid_plan_expired_no_renewal",
  });
  const histRef = args.companyRef.collection("subscription_history").doc();
  batch.set(histRef, {
    oldPlanId: planId,
    newPlanId: "basic",
    oldExpiryMs: expMs,
    newExpiryMs: null,
    source: "auto_downgrade_paid_expired",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return true;
}
