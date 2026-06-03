export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { dropboxDownloadOperations } from "@/lib/localCloudSync/server/dropboxTransportServer";

export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    companyId?: string;
    companyName?: string;
    dropboxCompanyPath?: string;
    afterOpSeq?: number;
  };
  const companyId = String(body.companyId || "").trim();
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : undefined;
  const dropboxCompanyPath =
    typeof body.dropboxCompanyPath === "string" ? body.dropboxCompanyPath.trim() : undefined;
  const afterOpSeq = Number(body.afterOpSeq);
  if (!companyId || !Number.isFinite(afterOpSeq)) {
    return NextResponse.json({ error: "companyId and afterOpSeq required" }, { status: 400 });
  }
  try {
    const operations = await dropboxDownloadOperations(
      auth.uid,
      companyId,
      afterOpSeq,
      companyName,
      dropboxCompanyPath
    );
    return NextResponse.json({ operations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
