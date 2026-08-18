export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { evaluateWebAppOnlineAccess } from "@/lib/server/webAppOnlineAccess";

async function verifyWebAccessBearer(
  req: NextRequest
): Promise<{ uid: string; email: string | null } | { error: string; status: number }> {
  // Do NOT reuse Drive-gated verifyBearerUid — web access must work even when Drive sync is off.
  if (!isFirebaseAdminConfigured()) {
    return { error: "Firebase Admin not configured", status: 503 };
  }
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return { error: "Missing Authorization Bearer token", status: 401 };
  getAdminDb();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return { error: "Invalid auth token", status: 401 };
  }
}

/** GET: Bearer token — authoritative hosted web `/app` access (online plan or shared online company). */
export async function GET(req: NextRequest) {
  const auth = await verifyWebAccessBearer(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error, allowed: false }, { status: auth.status });
  }

  try {
    const db = getAdminDb();
    const result = await evaluateWebAppOnlineAccess(db, auth.uid, auth.email);
    return NextResponse.json({
      ...result,
      email: auth.email,
      uid: auth.uid,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auth/web-access]", e);
    return NextResponse.json({ error: msg, allowed: false }, { status: 500 });
  }
}
