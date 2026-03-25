/**
 * Shared Firestore writes for prorated plan renew / upgrade (one-time payment, any gateway).
 * Stripe webhook + sync + Khalti/eSewa completion routes all funnel through this for consistent payment rows / admin history.
 */
import * as admin from "firebase-admin";
import type { PlanId } from "@/config/plans";
import { PAID_PLAN_IDS } from "@/lib/payments/stripeCheckoutFulfill";

/** Snapshot stored on payment docs + merged into admin plan-change History dialog. */
export type PlanChangeHistoryFirestore = {
  oldPlanId: string | null;
  newPlanId: string;
  oldExpiryMs: number | null;
  newExpiryMs: number;
  oldDaysLeft: number | null;
  newDaysLeft: number | null;
  grossNpr: number | null;
  creditNpr: number | null;
  netNpr: number | null;
  termKey: string | null;
  changeKind: string | null;
};

export type ApplyPlanChangeOneTimeInput = {
  db: admin.firestore.Firestore;
  companyId: string;
  userId: string | null;
  paymentId: string;
  gateway: "stripe" | "khalti" | "esewa";
  amountNpr: number;
  currency: string;
  targetPlanId: PlanId;
  previousPlanId: string | null;
  planChangeHistory: PlanChangeHistoryFirestore;
  newPlanExpiryMs: number;
  paymentStatus: string;
  /** Stripe-only: links company to customer for future invoices. */
  stripeCustomerId?: string | null;
  /** Marks company.lastStripeCheckoutSessionId when set (Stripe one-time renew). */
  stripeSessionId?: string | null;
  /** Extra fields on subscription_history (e.g. stripeSessionId). */
  historyExtra?: Record<string, unknown>;
  /** Distinct source string per gateway for ops / debugging. */
  historySource: string;
};

export type ApplyPlanChangeResult = { ok: true } | { ok: false; reason: string };

/**
 * Idempotent: if this paymentId already fulfilled (`planChangeFulfillComplete`), no-op success (avoids duplicate history rows on webhook retry).
 */
export async function applyPlanChangeOneTimeToFirestore(input: ApplyPlanChangeOneTimeInput): Promise<ApplyPlanChangeResult> {
  const {
    db,
    companyId,
    userId,
    paymentId,
    gateway,
    amountNpr,
    currency,
    targetPlanId,
    previousPlanId,
    planChangeHistory,
    newPlanExpiryMs,
    paymentStatus,
    stripeCustomerId,
    stripeSessionId,
    historyExtra,
    historySource,
  } = input;

  if (!PAID_PLAN_IDS.has(targetPlanId)) {
    return { ok: false, reason: "invalid_targetPlanId" };
  }

  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    return { ok: false, reason: "company_not_found" };
  }

  const paymentRef = companyRef.collection("payments").doc(paymentId);
  const paySnap = await paymentRef.get();
  // Idempotent retries (webhook + client sync): do not duplicate `subscription_history` rows.
  if (paySnap.exists && paySnap.get("planChangeFulfillComplete") === true) {
    return { ok: true };
  }

  await paymentRef.set(
    {
      paymentId,
      userId,
      planId: targetPlanId,
      amount: amountNpr,
      currency: currency.toLowerCase(),
      gateway,
      status: paymentStatus,
      billingIntent: "subscribe",
      planChangeFrom: previousPlanId,
      planChangeTo: targetPlanId,
      planChangeHistory,
      planExpiryMs: newPlanExpiryMs,
      planChangeOneTime: true,
      planChangeFulfillComplete: true,
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const planExpiry = admin.firestore.Timestamp.fromMillis(newPlanExpiryMs);
  const companyPatch: Record<string, unknown> = {
    planId: targetPlanId,
    planUpgradedAt: admin.firestore.FieldValue.serverTimestamp(),
    planExpiry,
  };
  if (stripeSessionId) {
    companyPatch.lastStripeCheckoutSessionId = stripeSessionId;
  }
  if (stripeCustomerId) {
    companyPatch.stripeCustomerId = stripeCustomerId;
  }
  await companyRef.update(companyPatch);

  await companyRef.collection("subscription_history").add({
    ...planChangeHistory,
    source: historySource,
    gateway,
    paymentId,
    ...(historyExtra ?? {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

/** Root collection: server-created checkout intents for Khalti/eSewa proration (client only has pendingId). */
export const PENDING_PLAN_CHANGES_COLLECTION = "pending_plan_changes";

/** Pending docs older than this are rejected (TTL-style, no Cloud Function required). */
export const PENDING_PLAN_CHANGE_TTL_MS = 60 * 60 * 1000;
