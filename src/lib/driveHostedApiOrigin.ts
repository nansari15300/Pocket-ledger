"use client";

import { getBillingApiUrl } from "@/lib/billingApiOrigin";

/**
 * Drive OAuth + sync — localhost dev par bhi pocket-ledger.com (GOOGLE_CLIENT_SECRET deploy par hai).
 * OAuth callback production par token save karta hai; status/upload APIs bhi wahi hosted origin use karein.
 */
export function resolveDriveHostedApiUrl(apiPath: string): string {
  const path = String(apiPath || "").trim();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return getBillingApiUrl(normalizedPath);
}
