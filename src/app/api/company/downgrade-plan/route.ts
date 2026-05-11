import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { type PlanId, normalizePlanIdForClient } from "@/config/plans";
import { parseBillingDowngradeBlockedPlanIds } from "@/lib/billingFrozenPlanSnapshots";
import { getEffectivePlanPrices, getEffectivePlanIsFree } from "@/lib/server/getEffectivePlanPrices";
import { getBillingPolicySettings } from "@/lib/server/getBillingPolicySettings";
import { isCompanyOwner } from "@/lib/server/companyOwner";
import { classifyPlanChange, quoteDowngradeNewExpiry, daysLeftRounded } from "@/lib/subscriptionPlanMath";

type Body = {
  companyId?: string;
  targetPlanId?: PlanId;
};

/** Kai companies par `planExpiry` Timestamp miss ho `planExpiryMs` se sync — downgrade quote dono se le. */
function resolvePlanExpiryMillis(cdata: {
  planExpiry?: admin.firestore.Timestamp;
  planExpiryMs?: number;
}): number | null {
  const fromTs = cdata.planExpiry?.toMillis?.() ?? null;
  if (fromTs != null && Number.isFinite(fromTs)) return fromTs;
  if (typeof cdata.planExpiryMs === "number" && Number.isFinite(cdata.planExpiryMs)) return cdata.planExpiryMs;
  return null;
}

/**
 * Owner-only: move to a lower (or free) SKU; remaining value → equivalent days on target yearly rate — no payment.
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

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }
    if (!targetPlanId || !["basic", "advance", "pro", "pro-plus"].includes(targetPlanId)) {
      return NextResponse.json({ error: "Invalid targetPlanId" }, { status: 400 });
    }

    const db = getAdminDb();
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const cdata = companySnap.data() as {
      ownerId?: string;
      ownerEmail?: string;
      planId?: string;
      planExpiry?: admin.firestore.Timestamp;
      planExpiryMs?: number;
      billingBlockedDowngradePlanIds?: unknown;
    };
    if (!isCompanyOwner(decoded, cdata)) {
      return NextResponse.json({ error: "Only the company owner can change plans" }, { status: 403 });
    }

    const currentPlanId = normalizePlanIdForClient(cdata.planId != null ? String(cdata.planId) : undefined);
    if (currentPlanId === targetPlanId) {
      return NextResponse.json({ error: "Already on this plan" }, { status: 400 });
    }

    const billingPolicy = await getBillingPolicySettings(db);
    const blocked = parseBillingDowngradeBlockedPlanIds(cdata.billingBlockedDowngradePlanIds);
    // Post-upgrade tier lock sirf tab jab global "allow downgrade" OFF ho; ON ho to owner wapas neeche paid tier ja sakta hai.
    if (blocked.includes(normalizePlanIdForClient(targetPlanId)) && !billingPolicy.planDowngradeEnabled) {
      return NextResponse.json(
        {
          error:
            "This plan tier is locked after your upgrade. Stay on your current plan or contact support if you need a change.",
        },
        { status: 403 }
      );
    }

    const targetIsFree = await getEffectivePlanIsFree(targetPlanId);
    /** Any admin-marked free tier: one-click switch (upgrade/downgrade) without payment. */
    if (targetIsFree) {
      const nowMs = Date.now();
      const currentExpiryMs = resolvePlanExpiryMillis(cdata);
      const previousDaysLeft = daysLeftRounded(nowMs, currentExpiryMs);
      const planChangeHistory = {
        oldPlanId: currentPlanId,
        newPlanId: targetPlanId,
        oldExpiryMs: currentExpiryMs,
        newExpiryMs: null as number | null,
        oldDaysLeft: previousDaysLeft,
        newDaysLeft: 0,
        grossNpr: null as number | null,
        creditNpr: null as number | null,
        netNpr: 0,
        termKey: null as string | null,
        changeKind: "downgrade" as const,
      };
      const paymentDocId = `free_select_${uuidv4()}`;
      const paymentRef = companyRef.collection("payments").doc(paymentDocId);
      const batch = db.batch();
      batch.update(companyRef, {
        planId: targetPlanId,
        planExpiry: admin.firestore.FieldValue.delete(),
        // Numeric mirror hatao — warna client pehle `planExpiryMs` padh kar purani paid expiry dikhata.
        planExpiryMs: admin.firestore.FieldValue.delete(),
        planUpgradedAt: admin.firestore.FieldValue.serverTimestamp(),
        billingFrozenUsageLedger: [],
        billingBlockedDowngradePlanIds: [],
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
        planChangeOneTime: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const histRef = companyRef.collection("subscription_history").doc();
      batch.set(histRef, {
        ...planChangeHistory,
        source: "free_plan_select",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return NextResponse.json({ ok: true, planChangeHistory });
    }

    const kind = classifyPlanChange(currentPlanId, targetPlanId);
    if (kind !== "downgrade") {
      return NextResponse.json(
        { error: "Downgrade only: pick a plan below your current tier (or Basic for free)." },
        { status: 400 }
      );
    }
    // Paid → cheaper paid: admin toggle off ho to reject; `basic` ID hamesha chhodo (free path ya legacy paid-basic edge).
    if (!billingPolicy.planDowngradeEnabled && targetPlanId !== "basic") {
      return NextResponse.json(
        {
          error:
            "Downgrades to a lower paid plan are disabled. You can still switch to Basic (free) when it is available from your current plan.",
        },
        { status: 403 }
      );
    }

    const nowMs = Date.now();
    const currentExpiryMs = resolvePlanExpiryMillis(cdata);
    const curPrices = await getEffectivePlanPrices(currentPlanId);

    const previousDaysLeft = daysLeftRounded(nowMs, currentExpiryMs);

    let newExpiryMs: number | null = null;
    let newDaysLeft = 0;

    if (targetPlanId === "basic") {
      newExpiryMs = null;
      newDaysLeft = 0;
    } else {
      const tgtPrices = await getEffectivePlanPrices(targetPlanId);
      const q = quoteDowngradeNewExpiry({
        nowMs,
        currentExpiryMs,
        currentYearly: curPrices.yearly,
        targetYearly: tgtPrices.yearly,
      });
      newExpiryMs = q.newExpiryMs;
      newDaysLeft = q.extraDays;
    }

    const planChangeHistory = {
      oldPlanId: currentPlanId,
      newPlanId: targetPlanId,
      oldExpiryMs: currentExpiryMs,
      newExpiryMs,
      oldDaysLeft: previousDaysLeft,
      newDaysLeft,
      grossNpr: null as number | null,
      creditNpr: null as number | null,
      netNpr: 0,
      termKey: null as string | null,
      changeKind: "downgrade" as const,
    };

    const paymentDocId = `downgrade_${uuidv4()}`;
    const paymentRef = companyRef.collection("payments").doc(paymentDocId);
    const batch = db.batch();

    if (targetPlanId === "basic") {
      batch.update(companyRef, {
        planId: "basic",
        planExpiry: admin.firestore.FieldValue.delete(),
        planExpiryMs: admin.firestore.FieldValue.delete(),
        planUpgradedAt: admin.firestore.FieldValue.serverTimestamp(),
        billingFrozenUsageLedger: [],
        billingBlockedDowngradePlanIds: [],
      });
    } else if (newExpiryMs != null) {
      batch.update(companyRef, {
        planId: targetPlanId,
        planExpiry: admin.firestore.Timestamp.fromMillis(newExpiryMs),
        // `useCompany` / billing pehle `planExpiryMs` dekhte hain — sirf Timestamp se purani high-tier din chipak jati thi.
        planExpiryMs: newExpiryMs,
        planUpgradedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

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
      ...(newExpiryMs != null ? { planExpiryMs: newExpiryMs } : {}),
      planChangeOneTime: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const histRef = companyRef.collection("subscription_history").doc();
    batch.set(histRef, {
      ...planChangeHistory,
      source: "downgrade",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return NextResponse.json({ ok: true, planChangeHistory });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[downgrade-plan]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
