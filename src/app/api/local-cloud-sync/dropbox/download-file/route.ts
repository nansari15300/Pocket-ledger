export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import {
  dropboxDownloadFileAtCompanyPath,
  dropboxDownloadFileByRemotePath,
} from "@/lib/localCloudSync/server/dropboxTransportServer";

export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    companyId?: string;
    companyName?: string;
    branchRelativePath?: string;
    remotePath?: string;
  };

  try {
    const branchRelativePath = String(body.branchRelativePath || "").trim();
    const companyId = String(body.companyId || "").trim();
    if (branchRelativePath && companyId) {
      const file = await dropboxDownloadFileAtCompanyPath(
        auth.uid,
        companyId,
        body.companyName,
        branchRelativePath
      );
      if (!file) return NextResponse.json({ base64: null, contentType: null });
      return NextResponse.json({ base64: file.base64, contentType: file.contentType });
    }

    const remotePath = String(body.remotePath || "").trim();
    if (!remotePath) {
      return NextResponse.json({ error: "remotePath or branchRelativePath required" }, { status: 400 });
    }
    const file = await dropboxDownloadFileByRemotePath(auth.uid, remotePath);
    if (!file) return NextResponse.json({ base64: null, contentType: null });
    return NextResponse.json({ base64: file.base64, contentType: file.contentType });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
