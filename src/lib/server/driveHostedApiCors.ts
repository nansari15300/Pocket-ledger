import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { corsHeadersForPocketLedgerBillingApi } from "@/lib/server/billingApiCors";

/** Drive OAuth + local-cloud-sync API — route handler JSON + OPTIONS CORS (static/APK localhost). */
export function driveHostedApiOptions(req: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeadersForPocketLedgerBillingApi(req) });
}

export function driveHostedApiJson(
  req: NextRequest,
  body: unknown,
  status = 200
): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeadersForPocketLedgerBillingApi(req) });
}
