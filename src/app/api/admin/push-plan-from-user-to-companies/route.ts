import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { isSuperAdminServer } from "@/lib/server/isSuperAdminServer";
import { syncOwnedCompaniesFromUserDocCanonicalPlan } from "@/lib/server/accountCanonicalPlan";

type Body = { ownerId?: string };

/**
 * SuperAdmin: pehle `users/{ownerId}` par `accountCanonical*` edit (console), phir yeh POST —
 * owned `companies` par wahi plan / expiry / Stripe mirror (har company doc manually na kholo).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json({ error: "admin_not_configured" }, { status: 503 });
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "missing_token" }, { status: 401 });
    }

    getAdminDb();
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    const superOk = await isSuperAdminServer(decoded.uid, decoded.email ?? undefined);
    if (!superOk) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const ownerId = typeof body.ownerId === "string" ? body.ownerId.trim() : "";
    if (!ownerId) {
      return NextResponse.json({ error: "ownerId_required" }, { status: 400 });
    }

    const db = getAdminDb();
    const result = await syncOwnedCompaniesFromUserDocCanonicalPlan(db, ownerId);
    if (result.ok === false) {
      if (result.reason === "user_not_found") {
        return NextResponse.json({ ok: false, reason: result.reason }, { status: 404 });
      }
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true, companiesPatched: result.companiesPatched });
  } catch (e) {
    console.error("[push-plan-from-user-to-companies]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
