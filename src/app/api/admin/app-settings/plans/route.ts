import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { isSuperAdminServer } from "@/lib/server/isSuperAdminServer";
import {
  sanitizeOnlineDemoOffer,
  type OnlineDemoOffer,
  type Plan,
  type PlanId,
  PLAN_TIER_ORDER,
} from "@/config/plans";
import {
  buildDefaultPlansFirestoreDoc,
  buildOnlineDemoOfferWritePatch,
  readOnlineDemoOfferFromPlansDoc,
  sanitizePlanForFirestoreWrite,
} from "@/lib/mergeAppSettingsPlans";
import {
  buildDeviceUserAddOnOfferWritePatch,
  sanitizeDeviceUserAddOnOffer,
  type DeviceUserAddOnOffer,
} from "@/lib/planAddOns";

function coerceLimitedTimeOfferDate(plan: Record<string, unknown>): Record<string, unknown> {
  const ltd = plan.limitedTimeOfferDate;
  if (typeof ltd === "string" && ltd.trim()) {
    const d = new Date(ltd);
    if (!Number.isNaN(d.getTime())) {
      return { ...plan, limitedTimeOfferDate: admin.firestore.Timestamp.fromDate(d) };
    }
    return plan;
  }
  if (!ltd || typeof ltd !== "object") return plan;
  const s = (ltd as { seconds?: unknown; _seconds?: unknown }).seconds ?? (ltd as { _seconds?: unknown })._seconds;
  const n = (ltd as { nanoseconds?: unknown; _nanoseconds?: unknown }).nanoseconds ?? (ltd as { _nanoseconds?: unknown })._nanoseconds;
  if (typeof s === "number" && typeof n === "number") {
    return { ...plan, limitedTimeOfferDate: new admin.firestore.Timestamp(s, n) };
  }
  return plan;
}

function isPlanId(s: string): s is PlanId {
  return (PLAN_TIER_ORDER as readonly string[]).includes(s);
}

async function applyExistingDemoAction(opts: {
  db: admin.firestore.Firestore;
  previousPlanId: string;
  nextOffer: OnlineDemoOffer;
  action: "retain" | "reset" | "replace";
}) {
  const { db, previousPlanId, nextOffer, action } = opts;
  if (action === "retain") return;
  if (nextOffer.enabled === true && action !== "replace") return;

  const activeDemoCompanies = await db
    .collection("companies")
    .where("demoPlanId", "==", previousPlanId)
    .where("demoPlanActive", "==", true)
    .get();
  const now = Date.now();
  const replacementDays = nextOffer.days;
  const writes = activeDemoCompanies.docs.map((company) => {
    if (action === "replace") {
      const expiryMs = now + replacementDays * 86_400_000;
      return {
        ref: company.ref,
        patch: {
          planId: nextOffer.planId,
          planExpiry: admin.firestore.Timestamp.fromMillis(expiryMs),
          planExpiryMs: expiryMs,
          demoPlanId: nextOffer.planId,
          demoPlanDays: replacementDays,
          demoPlanActive: true,
        },
      };
    }
    return {
      ref: company.ref,
      patch: {
        planId: "basic",
        planExpiry: admin.firestore.Timestamp.fromMillis(now),
        planExpiryMs: now,
        demoPlanActive: false,
        demoPlanDisabledAtMs: now,
      },
    };
  });

  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + 450)) batch.set(write.ref, write.patch, { merge: true });
    await batch.commit();
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json(
        {
          error: "Server: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (.env.local)",
          code: "ADMIN_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    getAdminDb();
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const email = decoded.email ?? undefined;
    if (!(await isSuperAdminServer(decoded.uid, email))) {
      return NextResponse.json({ error: "Forbidden — SuperAdmin only" }, { status: 403 });
    }

    const body = (await req.json()) as {
      seedDefaults?: boolean;
      planId?: string;
      plan?: Record<string, unknown>;
      onlineDemo?: OnlineDemoOffer;
      deviceUserAddOns?: DeviceUserAddOnOffer;
      /** Only used when a SuperAdmin turns a demo off (or replaces days). */
      existingDemoAction?: "retain" | "reset" | "replace";
    };

    const db = getAdminDb();
    const ref = db.doc("app_settings/plans");

    if (body?.seedDefaults === true) {
      await ref.set(buildDefaultPlansFirestoreDoc(), { merge: true });
      return NextResponse.json({ ok: true });
    }

    if (body?.onlineDemo != null) {
      const snap = await ref.get();
      const previous = readOnlineDemoOfferFromPlansDoc(
        snap.exists ? (snap.data() as Record<string, unknown>) : undefined
      );
      const nextOffer = sanitizeOnlineDemoOffer(body.onlineDemo);
      await ref.set(
        {
          ...buildOnlineDemoOfferWritePatch(nextOffer),
          entitlementCapConvention: "zero_means_none",
        },
        { merge: true }
      );
      const action = body.existingDemoAction;
      if (
        previous.enabled === true &&
        nextOffer.enabled !== true &&
        (action === "reset" || action === "replace")
      ) {
        await applyExistingDemoAction({
          db,
          previousPlanId: previous.planId,
          nextOffer,
          action,
        });
      }
      return NextResponse.json({ ok: true, onlineDemo: nextOffer });
    }

    if (body?.deviceUserAddOns != null) {
      const nextOffer = sanitizeDeviceUserAddOnOffer(body.deviceUserAddOns);
      await ref.set(
        {
          ...buildDeviceUserAddOnOfferWritePatch(nextOffer),
          entitlementCapConvention: "zero_means_none",
        },
        { merge: true }
      );
      return NextResponse.json({ ok: true, deviceUserAddOns: nextOffer });
    }

    const planId = body?.planId;
    const rawPlan = body?.plan;
    if (!planId || !isPlanId(planId) || !rawPlan || typeof rawPlan !== "object") {
      return NextResponse.json({ error: "planId and plan required" }, { status: 400 });
    }

    // Plan detail saves must not fight the catalog-level onlineDemo card.
    const { demo: _ignoredDemo, ...planWithoutDemo } = rawPlan as Record<string, unknown>;
    const withId = { ...planWithoutDemo, id: planId };
    const coerced = coerceLimitedTimeOfferDate(withId);
    const payload = sanitizePlanForFirestoreWrite(coerced as unknown as Plan);
    await ref.set(
      { [planId]: payload, entitlementCapConvention: "zero_means_none" },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/app-settings/plans]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
