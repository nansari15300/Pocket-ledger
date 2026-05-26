import { NextRequest, NextResponse } from "next/server";
import {
  corsHeadersForPocketLedgerBillingApi,
  isPocketLedgerBillingApiCorsPath,
} from "@/lib/server/billingApiCors";

/**
 * Static APK/EXE: `https://localhost` → `https://pocket-ledger.com/api/payments/*` cross-origin.
 * Pehle sirf sync-plan par CORS tha — checkout "Failed to fetch" isi wajah se aata tha.
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
    "/api/company/sync-plan",
    "/api/company/downgrade-plan",
    "/api/company/repair-stripe-plan-expiry",
    "/api/company/billing-auto-renew",
    "/api/company/billing-payments-statement",
    // Local company Drive sync — static/APK cross-origin (billingApiCors.ts paths).
    "/api/auth/google/drive-auth-url",
    "/api/auth/google/drive-disconnect",
    "/api/local-cloud-sync/drive/:path*",
  ],
};
