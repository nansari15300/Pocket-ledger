import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { isSuperAdminServer } from "@/lib/server/isSuperAdminServer";
import { type Plan, type PlanId, PLAN_TIER_ORDER } from "@/config/plans";
import { buildDefaultPlansFirestoreDoc, sanitizePlanForFirestoreWrite } from "@/lib/mergeAppSettingsPlans";

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
    };

    const db = getAdminDb();
    const ref = db.doc("app_settings/plans");

    if (body?.seedDefaults === true) {
      await ref.set(buildDefaultPlansFirestoreDoc(), { merge: true });
      return NextResponse.json({ ok: true });
    }

    const planId = body?.planId;
    const rawPlan = body?.plan;
    if (!planId || !isPlanId(planId) || !rawPlan || typeof rawPlan !== "object") {
      return NextResponse.json({ error: "planId and plan required" }, { status: 400 });
    }

    const withId = { ...rawPlan, id: planId };
    const coerced = coerceLimitedTimeOfferDate(withId as Record<string, unknown>);
    const payload = sanitizePlanForFirestoreWrite(coerced as unknown as Plan);
    await ref.set({ [planId]: payload }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/app-settings/plans]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
