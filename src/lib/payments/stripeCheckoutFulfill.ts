/**
 * Shared Stripe Checkout → Firestore payment doc + company plan upgrade (webhook + browser sync fallback).
 */
import "server-only";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import type { PlanId } from "@/config/plans";
import { applyPlanChangeOneTimeToFirestore } from "@/lib/payments/planChangeApply";

/** Paid SKUs only; basic stays free and is not granted via checkout. */
export const PAID_PLAN_IDS = new Set<PlanId>(["advance", "pro", "pro-plus"]);

/** Same key resolution as webhook so sync route matches live account. */
export function getStripeForPayments(): Stripe {
  const secretKey =
    process.env.STRIPE_SECRET_KEY?.trim() ||
    (process.env.NODE_ENV === "development"
      ? process.env.STRIPE_TEST_SECRET_KEY?.trim()
      : undefined);
  if (!secretKey) {
    throw new Error(
      process.env.NODE_ENV === "development"
        ? "Stripe server key missing: set STRIPE_SECRET_KEY or STRIPE_TEST_SECRET_KEY in .env.local, then restart dev."
        : "STRIPE_SECRET_KEY is not configured"
    );
  }
  return new Stripe(secretKey, {
    apiVersion: "2025-12-15.clover" as any,
  });
}

function subscriptionPeriodEndMs(sub: unknown): number | null {
  const end = (sub as { current_period_end?: number })?.current_period_end;
  return typeof end === "number" ? end * 1000 : null;
}

/**
 * Whether company doc should get planId/planExpiry after checkout.session.completed.
 * payment_status alone can lag for subscription mode; then we trust subscription status.
 */
export async function shouldUpgradeCompanyAfterCheckout(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  planId: string | undefined,
  billingIntent: string | undefined
): Promise<boolean> {
  if (billingIntent === "donation") return false;
  if (!planId) return false;
  if (!PAID_PLAN_IDS.has(planId as PlanId)) return false;

  const ps = session.payment_status;
  if (ps === "paid" || ps === "no_payment_required") return true;

  const subRef = session.subscription;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;
  if (session.mode !== "subscription" || !subId) return false;

  const sub = await stripe.subscriptions.retrieve(subId);
  const st = sub.status;
  return st === "active" || st === "trialing";
}

export type StripeCheckoutFulfillResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * One-time Stripe Checkout (`mode: payment`) after prorated plan math — metadata written by `/api/payments/plan-change-checkout`.
 */
async function fulfillPlanChangeOneTimePayment(
  session: Stripe.Checkout.Session,
  db: admin.firestore.Firestore
): Promise<StripeCheckoutFulfillResult> {
  const metadata = session.metadata || {};
  const companyId = metadata.companyId?.trim();
  const userId = metadata.userId?.trim();
  const targetPlanId = metadata.targetPlanId?.trim();
  const previousPlanId = metadata.previousPlanId?.trim() ?? "";

  if (!companyId) return { ok: false as const, reason: "missing_companyId" };
  if (!targetPlanId || !PAID_PLAN_IDS.has(targetPlanId as PlanId)) {
    return { ok: false as const, reason: "invalid_targetPlanId" };
  }

  const ps = session.payment_status;
  if (ps !== "paid" && ps !== "no_payment_required") {
    return { ok: false as const, reason: "payment_not_complete" };
  }

  const netFromMeta = Number(metadata.netNpr ?? "");
  const expectedPaisa = Number.isFinite(netFromMeta) ? Math.round(netFromMeta * 100) : null;
  const actualPaisa =
    session.amount_total != null && typeof session.amount_total === "number" ? session.amount_total : null;
  // Guard against tampered metadata vs charged amount (tolerate rounding).
  if (expectedPaisa != null && actualPaisa != null && Math.abs(expectedPaisa - actualPaisa) > 2) {
    console.warn("[stripe fulfill] plan-change amount mismatch", { expectedPaisa, actualPaisa, sessionId: session.id });
    return { ok: false as const, reason: "amount_mismatch" };
  }

  const newPlanExpiryMs = Number(metadata.newPlanExpiryMs ?? "");
  if (!Number.isFinite(newPlanExpiryMs) || newPlanExpiryMs <= 0) {
    return { ok: false as const, reason: "invalid_newPlanExpiryMs" };
  }

  const prevExpMsRaw = metadata.previousPlanExpiryMs;
  const previousPlanExpiryMs =
    prevExpMsRaw != null && prevExpMsRaw !== "" ? Number(prevExpMsRaw) : null;

  const planChangeHistory = {
    oldPlanId: previousPlanId || null,
    newPlanId: targetPlanId,
    oldExpiryMs: previousPlanExpiryMs != null && Number.isFinite(previousPlanExpiryMs) ? previousPlanExpiryMs : null,
    newExpiryMs: newPlanExpiryMs,
    oldDaysLeft:
      metadata.previousDaysLeft != null && metadata.previousDaysLeft !== ""
        ? Number(metadata.previousDaysLeft)
        : null,
    newDaysLeft: metadata.newDaysLeft != null && metadata.newDaysLeft !== "" ? Number(metadata.newDaysLeft) : null,
    grossNpr: metadata.grossNpr != null && metadata.grossNpr !== "" ? Number(metadata.grossNpr) : null,
    creditNpr: metadata.creditNpr != null && metadata.creditNpr !== "" ? Number(metadata.creditNpr) : null,
    netNpr: metadata.netNpr != null && metadata.netNpr !== "" ? Number(metadata.netNpr) : null,
    termKey: metadata.termKey?.trim() || null,
    changeKind: metadata.changeKind?.trim() || null,
  };

  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  const applied = await applyPlanChangeOneTimeToFirestore({
    db,
    companyId,
    userId: userId || null,
    paymentId: session.id,
    gateway: "stripe",
    amountNpr: session.amount_total != null ? session.amount_total / 100 : 0,
    currency: session.currency || "npr",
    targetPlanId: targetPlanId as PlanId,
    previousPlanId: previousPlanId || null,
    planChangeHistory,
    newPlanExpiryMs,
    paymentStatus: session.payment_status,
    stripeCustomerId,
    stripeSessionId: session.id,
    historyExtra: { stripeSessionId: session.id },
    historySource: "stripe_plan_change",
  });

  if (applied.ok === false) {
    return { ok: false as const, reason: applied.reason };
  }
  return { ok: true as const };
}

/**
 * Idempotent: merge payment doc; always re-run upgrade check (handles webhook retry after payment write only).
 */
export async function fulfillStripeCheckoutSessionCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  db: admin.firestore.Firestore
): Promise<StripeCheckoutFulfillResult> {
  const metadata = session.metadata || {};

  // Prorated upgrades/renews use Checkout `mode: payment` + metadata.planChange (not subscription mode).
  if (session.mode === "payment" && metadata.planChange === "true") {
    return fulfillPlanChangeOneTimePayment(session, db);
  }

  const companyId = metadata.companyId?.trim();
  const planId = metadata.planId?.trim();
  const userId = metadata.userId?.trim();
  const billingIntent = (metadata.billingIntent?.trim() || "subscribe") as "donation" | "subscribe";

  if (!companyId) {
    return { ok: false as const, reason: "missing_companyId" };
  }

  const paymentRef = db.collection("companies").doc(companyId).collection("payments").doc(session.id);

  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const stripeSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

  // Persist period end on the payment doc so admin/history shows per-checkout expiry (company.planExpiry is latest only).
  let planExpiryMs: number | null = null;
  if (session.mode === "subscription" && stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      const endMs = subscriptionPeriodEndMs(sub);
      if (endMs != null) planExpiryMs = endMs;
    } catch (e) {
      console.warn("[stripe fulfill] subscription retrieve for planExpiryMs", e);
    }
  }

  // merge: safe for duplicate webhook / sync retries without clobbering fields
  await paymentRef.set(
    {
      paymentId: session.id,
      userId: userId || null,
      planId: planId || null,
      amount: session.amount_total != null ? session.amount_total / 100 : 0,
      currency: session.currency || "usd",
      gateway: "stripe",
      status: session.payment_status,
      stripeCustomerId,
      stripeSubscriptionId,
      billingIntent,
      ...(planExpiryMs != null ? { planExpiryMs } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const upgrade = await shouldUpgradeCompanyAfterCheckout(stripe, session, planId, billingIntent);
  if (!upgrade) {
    if (planId && PAID_PLAN_IDS.has(planId as PlanId) && billingIntent !== "donation") {
      console.warn("[stripe fulfill] skipped plan upgrade", {
        sessionId: session.id,
        payment_status: session.payment_status,
        mode: session.mode,
        planId,
      });
    }
    return { ok: true as const };
  }

  let planExpiry: admin.firestore.Timestamp | null =
    planExpiryMs != null ? admin.firestore.Timestamp.fromMillis(planExpiryMs) : null;
  if (!planExpiry && session.mode === "subscription" && stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      const endMs = subscriptionPeriodEndMs(sub);
      if (endMs != null) planExpiry = admin.firestore.Timestamp.fromMillis(endMs);
    } catch (e) {
      console.warn("[stripe fulfill] subscription retrieve for company planExpiry", e);
    }
  }

  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    console.error("[stripe fulfill] company not found:", companyId);
    return { ok: false as const, reason: "company_not_found" };
  }

  const patch: Record<string, unknown> = {
    planId,
    lastStripeCheckoutSessionId: session.id,
    planUpgradedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (planExpiry) patch.planExpiry = planExpiry;
  if (stripeCustomerId) patch.stripeCustomerId = stripeCustomerId;
  if (stripeSubscriptionId) patch.stripeSubscriptionId = stripeSubscriptionId;

  await companyRef.update(patch);
  return { ok: true as const };
}
