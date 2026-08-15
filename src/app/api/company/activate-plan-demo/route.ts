import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { normalizePlanIdForClient, PLAN_TIER_ORDER, type PlanId } from "@/config/plans";
import { readOnlineDemoOfferFromPlansDoc } from "@/lib/mergeAppSettingsPlans";

const MS_PER_DAY = 86_400_000;

export async function POST(req: NextRequest) {
  try {
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json({ error: "online_demo_unavailable" }, { status: 503 });
    }
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
    if (!token) return NextResponse.json({ error: "missing_token" }, { status: 401 });

    let caller: admin.auth.DecodedIdToken;
    try {
      caller = await admin.auth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { companyId?: unknown; planId?: unknown };
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    if (!companyId) {
      return NextResponse.json({ error: "companyId_required" }, { status: 400 });
    }

    const db = getAdminDb();
    const [companySnap, plansSnap] = await Promise.all([
      db.collection("companies").doc(companyId).get(),
      db.doc("app_settings/plans").get(),
    ]);
    if (!companySnap.exists) return NextResponse.json({ error: "company_not_found" }, { status: 404 });

    const company = companySnap.data() as Record<string, unknown>;
    const ownerId = String(company.ownerId || "").trim();
    const ownerEmail = String(company.ownerEmail || "").trim().toLowerCase();
    if (ownerId !== caller.uid && (!ownerEmail || ownerEmail !== String(caller.email || "").trim().toLowerCase())) {
      return NextResponse.json({ error: "owner_only" }, { status: 403 });
    }

    const plansRaw = plansSnap.exists ? (plansSnap.data() as Record<string, unknown>) : undefined;
    const offer = readOnlineDemoOfferFromPlansDoc(plansRaw);
    if (!offer.enabled) {
      return NextResponse.json({ error: "demo_disabled" }, { status: 403 });
    }

    // Optional body.planId must match the configured demo plan (billing sends it).
    const requested = typeof body.planId === "string" ? normalizePlanIdForClient(body.planId) : offer.planId;
    if (requested !== offer.planId || !PLAN_TIER_ORDER.includes(offer.planId as PlanId)) {
      return NextResponse.json({ error: "demo_plan_mismatch" }, { status: 400 });
    }

    const planId = offer.planId;
    const days = offer.days;
    const now = Date.now();
    const expiryMs = now + days * MS_PER_DAY;
    const owned = await db.collection("companies").where("ownerId", "==", caller.uid).get();
    const targets = owned.docs.length ? owned.docs : [companySnap];

    let hadDemoBefore = false;
    let hasActiveDemo = false;
    for (const row of targets) {
      const current = row.data() as Record<string, unknown>;
      if (current.demoPlanActivatedAtMs || current.demoPlanId) hadDemoBefore = true;
      const currentExpiry = Number(current.planExpiryMs || 0);
      if (current.demoPlanActive === true && currentExpiry > now) hasActiveDemo = true;
    }
    // Tick off → one demo lifetime only; first activation still allowed.
    if (hadDemoBefore && !hasActiveDemo && offer.allowExtendAfterExpiry !== true) {
      return NextResponse.json({ error: "demo_renew_not_allowed" }, { status: 403 });
    }

    const batch = db.batch();
    for (const row of targets) {
      const current = row.data() as Record<string, unknown>;
      // Never overwrite a paid subscription with a free demo.
      const currentPlan = normalizePlanIdForClient(String(current.planId || "basic"));
      const currentExpiry = Number(current.planExpiryMs || 0);
      if (currentPlan !== "basic" && currentExpiry > now && current.demoPlanActive !== true) continue;
      batch.set(
        row.ref,
        {
          planId,
          planExpiry: admin.firestore.Timestamp.fromMillis(expiryMs),
          planExpiryMs: expiryMs,
          planUpgradedAtMs: now,
          demoPlanActive: true,
          demoPlanId: planId,
          demoPlanDays: days,
          demoPlanActivatedAtMs: now,
        },
        { merge: true }
      );
    }
    await batch.commit();
    return NextResponse.json({ ok: true, planId, days, expiryMs });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "demo_activation_failed" },
      { status: 500 }
    );
  }
}
