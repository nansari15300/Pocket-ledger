export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";

/** Attachment delta upload — Drive files/ subfolder (v1 stub returns path; extend with google drive create). */
export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    companyId?: string;
    fileId?: string;
    sha256Hex?: string;
    contentType?: string;
    base64?: string;
  };
  const companyId = String(body.companyId || "").trim();
  const fileId = String(body.fileId || "").trim();
  if (!companyId || !fileId) {
    return NextResponse.json({ error: "companyId and fileId required" }, { status: 400 });
  }
  // TODO: dedupe by sha256Hex — abhi path reserve karo taaki client hash track kar sake
  const remotePath = `accounting-sync/company_${companyId}/files/${fileId}`;
  void auth.uid;
  void body.base64;
  void body.sha256Hex;
  void body.contentType;
  return NextResponse.json({ ok: true, remotePath });
}
