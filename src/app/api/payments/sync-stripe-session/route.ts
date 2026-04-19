import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  buildVerifiedLocalPlanApplyPayload,
  fulfillStripeCheckoutSessionCompleted,
  getStripeForPayments,
} from "@/lib/payments/stripeCheckoutFulfill";

/**
 * After redirect from Stripe, client calls this so the plan updates even when webhooks
 * do not reach the dev machine or arrive late. User must match session metadata.userId.
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

    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const stripe = getStripeForPayments();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    // Ownership: same Firebase uid as checkout.metadata (Stripe stores strings only).
    const metaUid = session.metadata?.userId?.trim();
    if (!metaUid) {
      return NextResponse.json(
        {
          error:
            "This Stripe session has no userId in metadata, so the server cannot verify you. Pay again from Billing while signed in, or check that checkout was created by this app.",
        },
        { status: 403 }
      );
    }
    if (metaUid !== decoded.uid) {
      return NextResponse.json(
        {
          error:
            "This payment belongs to another account. Sign in with the same Google/email you used when clicking Pay.",
        },
        { status: 403 }
      );
    }

    // Only block known bad states; some API payloads omit `status` even after success redirect — trust metadata + fulfill.
    const lifecycle = session.status as string | undefined;
    if (lifecycle === "expired") {
      return NextResponse.json({ error: "Checkout session expired" }, { status: 400 });
    }
    if (lifecycle === "open") {
      return NextResponse.json({ error: "Checkout session not finished yet — wait a few seconds and refresh this page." }, { status: 409 });
    }

    const db = getAdminDb();
    const result = await fulfillStripeCheckoutSessionCompleted(stripe, session, db);
    if (result.ok === false) {
      // Offline/local-only company: Firestore me doc nahi — payment verified ho to payload client ko bhejo (local SQLite apply).
      if (result.reason === "company_not_found") {
        const localPayload = await buildVerifiedLocalPlanApplyPayload(stripe, session);
        if (localPayload) {
          return NextResponse.json({ ok: true, localApply: true, payload: localPayload });
        }
      }
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      ...(result.mirrorLocal ? { mirrorLocal: result.mirrorLocal } : {}),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-stripe-session]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
