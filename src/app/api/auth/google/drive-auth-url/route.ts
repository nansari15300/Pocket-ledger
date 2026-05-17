export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { buildGoogleDriveAuthUrl, type DriveOAuthState } from "@/lib/localCloudSync/server/driveOAuthServer";

/** Client-safe Drive connect — OAuth URL sirf server par `googleapis` se. */
export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json()) as DriveOAuthState;
  const returnPath = String(body.returnPath || "/company").trim();
  const uid = String(body.uid || auth.uid).trim();
  if (uid !== auth.uid) {
    return NextResponse.json({ error: "uid mismatch" }, { status: 403 });
  }

  try {
    const url = buildGoogleDriveAuthUrl({
      returnPath,
      uid,
      email: body.email,
      formData: body.formData,
    });
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
