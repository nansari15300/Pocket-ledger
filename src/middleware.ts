import { NextRequest, NextResponse } from "next/server";
import {
  corsHeadersForPocketLedgerBillingApi,
  isPocketLedgerBillingApiCorsPath,
} from "@/lib/server/billingApiCors";

/**
 * Static APK/EXE + web dev: `http://localhost:3000` → `https://pocket-ledger.com/api/...` cross-origin.
 * Billing, Drive OAuth, aur local-cloud-sync sab ke liye CORS preflight.
 */
export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (!isPocketLedgerBillingApiCorsPath(pathname)) {
    return NextResponse.next();
  }

  const cors = corsHeadersForPocketLedgerBillingApi(req);
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: cors });
  }

  const res = NextResponse.next();
  for (const [key, value] of Object.entries(cors)) {
    if (typeof value === "string") res.headers.set(key, value);
  }
  return res;
}

export const config = {
  matcher: [
    "/api/payments/:path*",
    "/api/billing/:path*",
    "/api/local-cloud-sync/:path*",
    "/api/auth/google/:path*",
    "/api/auth/pl-firebase-handoff",
    "/api/company/sync-plan",
    "/api/company/downgrade-plan",
    "/api/company/repair-stripe-plan-expiry",
    "/api/company/billing-auto-renew",
    "/api/company/billing-payments-statement",
    "/api/company/recycle-bin-finalize",
    "/api/admin/recycle-bin/delete-company",
    "/api/ads/:path*",
  ],
};
