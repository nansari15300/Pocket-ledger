export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { evaluateWebAppOnlineAccess } from "@/lib/server/webAppOnlineAccess";

/** GET: Bearer token — authoritative hosted web `/app` access (online plan or shared online company). */
export async function GET(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getAdminDb();
    const result = await evaluateWebAppOnlineAccess(db, auth.uid, auth.email);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auth/web-access]", e);
    return NextResponse.json({ error: msg, allowed: false }, { status: 500 });
  }
}
