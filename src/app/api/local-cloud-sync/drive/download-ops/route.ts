export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { driveDownloadOperations } from "@/lib/localCloudSync/server/driveTransportServer";

export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as { companyId?: string; afterOpSeq?: number };
  const companyId = String(body.companyId || "").trim();
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  const afterOpSeq = Number(body.afterOpSeq) || 0;
  try {
    const operations = await driveDownloadOperations(auth.uid, companyId, afterOpSeq);
    return NextResponse.json({ operations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
