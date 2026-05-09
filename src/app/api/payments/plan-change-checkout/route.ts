import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { mergeGatewayKeysWithEnv, type GatewayKeys } from "@/ai/flows/gateway-keys";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_PLANS, type PlanId, normalizePlanIdForClient } from "@/config/plans";
import { getEffectivePlanPrices } from "@/lib/server/getEffectivePlanPrices";
import { isCompanyOwner } from "@/lib/server/companyOwner";
import {
  BILLING_TERM_OPTIONS,
  classifyPlanChange,
  quotePaidPlanPurchase,
  daysLeftRounded,
  type SubscriptionTermKey,
} from "@/lib/subscriptionPlanMath";
import { PAID_PLAN_IDS } from "@/lib/payments/stripeCheckoutFulfill";
import {
  PENDING_PLAN_CHANGES_COLLECTION,
  PENDING_PLAN_CHANGE_TTL_MS,
} from "@/lib/payments/planChangeApply";
import { getPublicAppOriginForPaymentRedirects } from "@/lib/checkoutPublicOrigin";

type AdminKeysResult = {
  stored: GatewayKeys;
  adminReadOk: boolean;
  docExists: boolean;
  adminError?: string;
};

async function getGatewayKeysFromAdmin(): Promise<AdminKeysResult> {
  try {
    const db = getAdminDb();
    const snap = await db.doc("app_settings/payment_gateways").get();
    return {
      stored: (snap.exists ? (snap.data() as GatewayKeys) : {}) as GatewayKeys,
      adminReadOk: true,
      docExists: snap.exists,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[plan-change-checkout] gateway read failed", e);
    return { stored: {}, adminReadOk: false, docExists: false, adminError: msg };
  }
}

function hasStripeInEnv(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY?.trim() || process.env.STRIPE_TEST_SECRET_KEY?.trim());
}

function stripeConfigHelpMessage(adminResult: AdminKeysResult): string {
  const envHint = hasStripeInEnv()
    ? "STRIPE_SECRET_KEY is set but empty after merge — restart dev/server after editing .env.local."
    : "Add STRIPE_SECRET_KEY=sk_test_… to .env.local, then restart dev.";

  if (!adminResult.adminReadOk) {
    return `Stripe unavailable (Admin SDK). ${adminResult.adminError || ""} ${envHint}`;
  }
  if (!adminResult.docExists) {
    return `Save Stripe secret in Admin → Bank Settings. ${envHint}`;
  }
  if (!adminResult.stored.stripeSecretKey?.trim()) {
    return `Bank Settings: paste Stripe secret. ${envHint}`;
  }
  return `Stripe not configured. ${envHint}`;
}

const VALID_TERMS = new Set(BILLING_TERM_OPTIONS.map((o) => o.value));

type ProrationGateway = "stripe" | "khalti" | "esewa";

type Body = {
  companyId?: string;
  targetPlanId?: PlanId;
  term?: SubscriptionTermKey;
  /** Defaults to stripe; Khalti/eSewa use pending_plan_changes + `/api/payments/complete-plan-change-*`. */
  gateway?: ProrationGateway;
};

function normalizeProrationGateway(raw: unknown): ProrationGateway {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "stripe";
  if (s === "khalti" || s === "esewa" || s === "stripe") return s;
  return "stripe";
}

/**
 * Prorated Stripe one-time checkout: credit unused time at current yearly rate, charge net NPR, extend planExpiry.
 * Zero net applies Firestore + audit payment row immediately (no Stripe session).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    getAdminDb();
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    const targetPlanId = body.targetPlanId;
    const term = body.term;
    const gateway = normalizeProrationGateway(body.gateway);

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }
    if (!targetPlanId || !PAID_PLAN_IDS.has(targetPlanId)) {
      return NextResponse.json({ error: "Invalid paid targetPlanId" }, { status: 400 });
    }
    if (!term || !VALID_TERMS.has(term)) {
      return NextResponse.json({ error: "Invalid subscription term" }, { status: 400 });
    }

    const db = getAdminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const cdata = companySnap.data() as { ownerId?: string; ownerEmail?: string; planId?: string; planExpiry?: admin.firestore.Timestamp };
    if (!isCompanyOwner(decoded, cdata)) {
      return NextResponse.json({ error: "Only the company owner can change plans" }, { status: 403 });
    }

    const currentPlanId = normalizePlanIdForClient(cdata.planId != null ? String(cdata.planId) : undefined);
    // One-time proration builds on an active paid SKU; Basic → paid stays on recurring `/api/payments/initiate`.
    if (currentPlanId === "basic" || !PAID_PLAN_IDS.has(currentPlanId)) {
      return NextResponse.json(
        {
          error:
            "New subscriptions from Basic use the checkout below (recurring). Proration applies after you are on a paid plan.",
        },
        { status: 400 }
      );
    }
    const changeKind = classifyPlanChange(currentPlanId, targetPlanId);
    if (changeKind === "downgrade") {
      return NextResponse.json(
        { error: "Use the downgrade action (no payment) for lower tiers." },
        { status: 400 }
      );
    }

    const nowMs = Date.now();
    const currentExpiryMs = cdata.planExpiry?.toMillis?.() ?? null;
    const curPrices = await getEffectivePlanPrices(currentPlanId);
    const tgtPrices = await getEffectivePlanPrices(targetPlanId);

    const quote = quotePaidPlanPurchase({
      nowMs,
      currentExpiryMs,
      currentYearly: curPrices.yearly,
      targetMonthly: tgtPrices.monthly,
      targetYearly: tgtPrices.yearly,
      term,
    });

    const previousDaysLeft = daysLeftRounded(nowMs, currentExpiryMs);
    const newDaysLeft = daysLeftRounded(nowMs, quote.newExpiryMs);

    const planChangeHistory = {
      oldPlanId: currentPlanId,
      newPlanId: targetPlanId,
      oldExpiryMs: currentExpiryMs,
      newExpiryMs: quote.newExpiryMs,
      oldDaysLeft: previousDaysLeft,
      newDaysLeft,
      grossNpr: quote.grossNpr,
      creditNpr: quote.creditNpr,
      netNpr: quote.netNpr,
      termKey: term,
      changeKind,
    };

    // Zero net must run before alternate gateways (no Khalti/eSewa session for NPR 0).
    if (quote.netNpr <= 0) {
      const paymentDocId = `plan_change_${uuidv4()}`;
      const paymentRef = companyRef.collection("payments").doc(paymentDocId);
      const batch = db.batch();
      batch.update(companyRef, {
        planId: targetPlanId,
        planExpiry: admin.firestore.Timestamp.fromMillis(quote.newExpiryMs),
        planUpgradedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batch.set(paymentRef, {
        paymentId: paymentDocId,
        userId: decoded.uid,
        planId: targetPlanId,
        amount: 0,
        currency: "npr",
        gateway: "internal",
        status: "completed",
        billingIntent: "subscribe",
        planChangeFrom: currentPlanId,
        planChangeTo: targetPlanId,
        planChangeHistory,
        planExpiryMs: quote.newExpiryMs,
        planChangeOneTime: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const histRef = companyRef.collection("subscription_history").doc();
      batch.set(histRef, {
        ...planChangeHistory,
        source: "server_proration_zero_net",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return NextResponse.json({ ok: true, applied: true, quote });
    }

    // Khalti/eSewa proration: persist server-side intent so return callbacks cannot forge company/plan/amount.
    if (gateway === "khalti" || gateway === "esewa") {
      const adminResult = await getGatewayKeysFromAdmin();
      const keys = mergeGatewayKeysWithEnv(adminResult.stored);
      const pendingId = uuidv4();
      const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + PENDING_PLAN_CHANGE_TTL_MS);
      const pendingRef = db.collection(PENDING_PLAN_CHANGES_COLLECTION).doc(pendingId);

      await pendingRef.set({
        companyId,
        userId: decoded.uid,
        targetPlanId,
        previousPlanId: currentPlanId,
        termKey: term,
        changeKind,
        planChangeHistory,
        newPlanExpiryMs: quote.newExpiryMs,
        netNpr: quote.netNpr,
        grossNpr: quote.grossNpr,
        creditNpr: quote.creditNpr,
        gateway,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
      });

      const appOrigin = getPublicAppOriginForPaymentRedirects(req);

      if (gateway === "khalti") {
        if (!keys.khaltiPublicKey) {
          await pendingRef.delete().catch(() => {});
          return NextResponse.json({ error: "Khalti is not configured (public key)." }, { status: 500 });
        }
        return NextResponse.json({
          gateway: "khalti" as const,
          pendingId,
          publicKey: keys.khaltiPublicKey,
          amount: Math.round(quote.netNpr * 100),
          product_identity: pendingId,
          product_name: `Plan renew: ${currentPlanId} → ${targetPlanId}`,
          returnUrl: `${appOrigin}/billing/plan-change/khalti?pendingId=${encodeURIComponent(pendingId)}`,
          quote,
        });
      }

      if (!keys.esewaMerchantCode || !keys.esewaSecretKey) {
        await pendingRef.delete().catch(() => {});
        return NextResponse.json({ error: "eSewa is not configured (merchant code + secret)." }, { status: 500 });
      }

      const product_code = keys.esewaMerchantCode;
      const total_amount_in_rupees = quote.netNpr;
      const message = `total_amount=${total_amount_in_rupees},transaction_uuid=${pendingId},product_code=${product_code}`;
      const signature = crypto.createHmac("sha256", keys.esewaSecretKey).update(message).digest("base64");
      const isTestMode = product_code === "EPAYTEST";
      const eSewaUrl = isTestMode ? "https://uat.esewa.com.np/epay/main" : "https://epay.esewa.com.np/api/epay/main/v2/form";

      return NextResponse.json({
        gateway: "esewa" as const,
        pendingId,
        url: eSewaUrl,
        amount: total_amount_in_rupees,
        oid: pendingId,
        successUrl: `${appOrigin}/billing/plan-change/esewa`,
        failUrl: `${appOrigin}/billing/cancel`,
        merchantCode: product_code,
        signature,
        signedFieldNames: "total_amount,transaction_uuid,product_code",
        quote,
      });
    }

    const adminResult = await getGatewayKeysFromAdmin();
    const keys = mergeGatewayKeysWithEnv(adminResult.stored);
    if (!keys.stripeSecretKey) {
      return NextResponse.json({ error: stripeConfigHelpMessage(adminResult) }, { status: 500 });
    }

    const stripe = new Stripe(keys.stripeSecretKey, { apiVersion: "2025-12-15.clover" as any });
    const appOrigin = getPublicAppOriginForPaymentRedirects(req);
    const currency = DEFAULT_PLANS[targetPlanId].currency.toLowerCase();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `Plan ${changeKind}: ${currentPlanId} → ${targetPlanId} (${term})`,
            },
            unit_amount: Math.round(quote.netNpr * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${appOrigin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/billing/cancel`,
      metadata: {
        planChange: "true",
        companyId,
        userId: decoded.uid,
        targetPlanId,
        previousPlanId: currentPlanId,
        newPlanExpiryMs: String(quote.newExpiryMs),
        previousPlanExpiryMs: currentExpiryMs != null ? String(currentExpiryMs) : "",
        previousDaysLeft: String(previousDaysLeft),
        newDaysLeft: String(newDaysLeft),
        grossNpr: String(quote.grossNpr),
        creditNpr: String(quote.creditNpr),
        netNpr: String(quote.netNpr),
        termKey: term,
        changeKind,
        billingIntent: "subscribe",
        paymentGateway: "stripe",
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, quote });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[plan-change-checkout]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
