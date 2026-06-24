export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { driveDeleteFileByRemotePath } from "@/lib/localCloudSync/server/driveTransportServer";

export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as { remotePath?: string };
  const remotePath = String(body.remotePath || "").trim();
  if (!remotePath) return NextResponse.json({ error: "remotePath required" }, { status: 400 });
  try {
    await driveDeleteFileByRemotePath(auth.uid, remotePath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
