export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { driveDownloadFileByRemotePath } from "@/lib/localCloudSync/server/driveTransportServer";

/** `drive:` remote path se attachment / backup bytes download. */
export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as { companyId?: string; remotePath?: string };
  void body.companyId;
  const remotePath = String(body.remotePath || "").trim();
  if (!remotePath) return NextResponse.json({ error: "remotePath required" }, { status: 400 });
  try {
    const file = await driveDownloadFileByRemotePath(auth.uid, remotePath);
    if (!file) return NextResponse.json({ base64: null, contentType: null });
    return NextResponse.json({ base64: file.base64, contentType: file.contentType });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
