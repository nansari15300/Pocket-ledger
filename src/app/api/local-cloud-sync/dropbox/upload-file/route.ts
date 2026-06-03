export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import {
  dropboxDefaultAttachmentPath,
  dropboxUploadAttachmentFile,
} from "@/lib/localCloudSync/server/dropboxTransportServer";

export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  let body: {
    companyId?: string;
    companyName?: string;
    fileId?: string;
    remotePath?: string;
    sha256Hex?: string;
    contentType?: string;
    base64?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? `Invalid upload request body: ${e.message}` : "Invalid upload request body" },
      { status: 400 }
    );
  }
  const companyId = String(body.companyId || "").trim();
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : undefined;
  const fileId = String(body.fileId || "").trim();
  const base64 = String(body.base64 || "");
  if (!companyId || !base64) {
    return NextResponse.json({ error: "companyId and base64 required" }, { status: 400 });
  }
  const remotePath =
    String(body.remotePath || "").trim() ||
    dropboxDefaultAttachmentPath(companyId, companyName, fileId || "file");
  try {
    const res = await dropboxUploadAttachmentFile(
      auth.uid,
      remotePath,
      base64,
      body.contentType,
      body.sha256Hex
    );
    return NextResponse.json({ ok: true, remotePath: res.remotePath, deduped: res.deduped ?? false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
