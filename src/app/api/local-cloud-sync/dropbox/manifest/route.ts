export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerUid } from "@/lib/localCloudSync/server/apiAuth";
import { dropboxGetManifest, dropboxUpdateManifest } from "@/lib/localCloudSync/server/dropboxTransportServer";
import type { CloudSyncManifest } from "@/lib/localCloudSync/types";

export async function POST(req: NextRequest) {
  const auth = await verifyBearerUid(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    companyId?: string;
    companyName?: string;
    dropboxCompanyPath?: string;
    action?: "get" | "set";
    manifest?: CloudSyncManifest;
  };
  const companyId = String(body.companyId || "").trim();
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : undefined;
  const dropboxCompanyPath =
    typeof body.dropboxCompanyPath === "string" ? body.dropboxCompanyPath.trim() : undefined;
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  try {
    if (body.action === "set" && body.manifest) {
      await dropboxUpdateManifest(auth.uid, companyId, body.manifest, companyName);
      return NextResponse.json({ ok: true });
    }
    const manifest = await dropboxGetManifest(auth.uid, companyId, companyName, dropboxCompanyPath);
    return NextResponse.json(manifest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
