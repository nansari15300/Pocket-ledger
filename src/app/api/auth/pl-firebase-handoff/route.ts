import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { corsHeadersForPocketLedgerBillingApi } from "@/lib/server/billingApiCors";
import { getAdminApp, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersForPocketLedgerBillingApi(req),
  });
}

/** Cross-port PL server jump: verify Firebase ID token → short-lived custom token for destination origin. */
export async function POST(req: NextRequest) {
  const cors = corsHeadersForPocketLedgerBillingApi(req);
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: cors });
  }

  const authHeader = req.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!idToken) {
    return NextResponse.json({ error: "missing_token" }, { status: 401, headers: cors });
  }

  try {
    getAdminApp();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const customToken = await admin.auth().createCustomToken(decoded.uid);
    return NextResponse.json({ customToken }, { headers: cors });
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 401, headers: cors });
  }
}
