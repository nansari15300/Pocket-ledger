import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { type PlanId } from "@/config/plans";
import { getEffectivePlanPrices } from "@/lib/server/getEffectivePlanPrices";
import { isCompanyOwner } from "@/lib/server/companyOwner";
import { classifyPlanChange, quoteDowngradeNewExpiry, daysLeftRounded } from "@/lib/subscriptionPlanMath";

function normalizeCompanyPlanId(raw: unknown): PlanId {
  const s = String(raw ?? "basic").trim();
  if (s === "basic" || s === "advance" || s === "pro" || s === "pro-plus") return s;
  return "basic";
}

type Body = {
  companyId?: string;
  targetPlanId?: PlanId;
};

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

    const cdata = companySnap.data() as { ownerId?: string; ownerEmail?: string; planId?: string; planExpiry?: admin.firestore.Timestamp };
    if (!isCompanyOwner(decoded, cdata)) {
      return NextResponse.json({ error: "Only the company owner can change plans" }, { status: 403 });
    }

    const currentPlanId = normalizeCompanyPlanId(cdata.planId);
    const kind = classifyPlanChange(currentPlanId, targetPlanId);
    if (kind !== "downgrade") {
      return NextResponse.json(
        { error: "Downgrade only: pick a plan below your current tier (or Basic for free)." },
        { status: 400 }
      );
    }

    const nowMs = Date.now();
    const currentExpiryMs = cdata.planExpiry?.toMillis?.() ?? null;
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
        planUpgradedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (newExpiryMs != null) {
      batch.update(companyRef, {
        planId: targetPlanId,
        planExpiry: admin.firestore.Timestamp.fromMillis(newExpiryMs),
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
