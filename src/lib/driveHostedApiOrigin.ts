"use client";

import { getBillingApiUrl } from "@/lib/billingApiOrigin";

function isLocalDevBrowserHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * Drive OAuth + sync — localhost dev par bhi pocket-ledger.com (GOOGLE_CLIENT_SECRET deploy par hai).
 */
export function resolveDriveHostedApiUrl(apiPath: string): string {
  const path = String(apiPath || "").trim();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (isLocalDevBrowserHost()) {
    return normalizedPath;
  }
  return getBillingApiUrl(normalizedPath);
}
