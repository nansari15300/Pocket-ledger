import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { isCompanyOwner } from "@/lib/server/companyOwner";
import type { PlanId } from "@/config/plans";

/** `companyId` = Firestore doc id; `localCompanyId` = SQLite row id jab alag ho (offline-first) */
type Body = { companyId?: string; localCompanyId?: string };

const TWENTY_DAYS_MS = 20 * 24 * 60 * 60 * 1000;

function normalizeCompanyPlanId(raw: unknown): PlanId {
  const s = String(raw ?? "basic").trim();
  if (s === "basic" || s === "advance" || s === "pro" || s === "pro-plus") return s;
  return "basic";
}

/** Owner ya shared email — plan entitlements sabko same company doc se */
function canReadCompanyPlan(decoded: admin.auth.DecodedIdToken, data: Record<string, unknown>): boolean {
  if (isCompanyOwner(decoded, data as { ownerId?: string; ownerEmail?: string })) return true;
  const emails = Array.isArray(data.sharedWithEmails) ? data.sharedWithEmails : [];
  const e = String(decoded.email || "")
    .toLowerCase()
    .trim();
  if (!e) return false;
  return emails.some((x: unknown) => String(x || "").toLowerCase().trim() === e);
}

/**
 * POST: Bearer token + companyId — Firestore companies/{id} se authoritative plan (Admin SDK).
 * Client SQLite / localStorage cache isi se align hota hai (offline + SaaS sync).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 });
    }

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
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }
    const localCompanyId =
      typeof body.localCompanyId === "string" && body.localCompanyId.trim()
        ? body.localCompanyId.trim()
        : companyId /* backward compat: same id */;

    const ref = getAdminDb().collection("companies").doc(companyId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "company_not_found" }, { status: 404 });
    }

    const data = snap.data() || {};
    if (data.isDeleted === true) {
      return NextResponse.json({ error: "company_deleted" }, { status: 404 });
    }

    if (!canReadCompanyPlan(decoded, data)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const planId = normalizeCompanyPlanId(data.planId);
    let planExpiryMs: number | null = null;
    if (typeof data.planExpiryMs === "number" && Number.isFinite(data.planExpiryMs)) {
      planExpiryMs = data.planExpiryMs;
    } else {
      const pe = data.planExpiry as { toMillis?: () => number } | undefined;
      if (pe && typeof pe.toMillis === "function") planExpiryMs = pe.toMillis();
    }

    const stripeCustomerId =
      typeof data.stripeCustomerId === "string" && data.stripeCustomerId.trim() ? data.stripeCustomerId.trim() : null;
    const stripeSubscriptionId =
      typeof data.stripeSubscriptionId === "string" && data.stripeSubscriptionId.trim()
        ? data.stripeSubscriptionId.trim()
        : null;
    const lastStripeCheckoutSessionId =
      typeof data.lastStripeCheckoutSessionId === "string" && data.lastStripeCheckoutSessionId.trim()
        ? data.lastStripeCheckoutSessionId.trim()
        : null;

    // Offline window: har online sync par max 20 din extend; paid par subscription end se zyada nahi
    const now = Date.now();
    const prevRaw = data.offlineLicenseValidUntilMs;
    const prevUntil =
      typeof prevRaw === "number" && Number.isFinite(prevRaw) ? prevRaw : now;
    const base = Math.max(now, prevUntil);
    let chunkMs: number;
    if (planId === "basic" || planExpiryMs == null) {
      chunkMs = TWENTY_DAYS_MS;
    } else {
      chunkMs = Math.min(TWENTY_DAYS_MS, Math.max(0, planExpiryMs - base));
    }
    let offlineLicenseValidUntilMs = base + chunkMs;
    if (planExpiryMs != null) {
      offlineLicenseValidUntilMs = Math.min(offlineLicenseValidUntilMs, planExpiryMs);
    }

    await ref.set(
      {
        linkedLocalCompanyId: localCompanyId,
        offlineLicenseValidUntilMs,
        offlineLicenseUpdatedAtMs: now,
        offlineLicenseLastChunkMs: chunkMs,
      },
      { merge: true }
    );

    return NextResponse.json({
      companyId,
      authoritativeCompanyId: companyId,
      localCompanyId,
      planId,
      planExpiryMs,
      stripeCustomerId,
      stripeSubscriptionId,
      lastStripeCheckoutSessionId,
      offlineLicenseValidUntilMs,
    });
  } catch (e) {
    console.error("[sync-plan]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
