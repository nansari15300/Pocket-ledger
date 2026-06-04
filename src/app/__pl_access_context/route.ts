import { NextResponse } from "next/server";
import { isDevPlLocalServerEnabled } from "@/lib/devPlLocalServer/nodeBridge";
import { resolvePlAccessContextFromHeaders } from "@/lib/devPlLocalServer/store";

/** Dev (`npm run dev`): same contract as Electron `localAppServer` `/__pl_access_context`. */
export async function GET(req: Request) {
  if (!isDevPlLocalServerEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const ctx = resolvePlAccessContextFromHeaders(req.headers);
    return NextResponse.json(ctx, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "invalid_or_missing_token" }, { status: 403 });
  }
}
