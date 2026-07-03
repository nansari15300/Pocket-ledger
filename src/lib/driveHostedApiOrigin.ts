"use client";

import { POCKET_LEDGER_HOSTED_API_ORIGIN, getBillingApiUrl } from "@/lib/billingApiOrigin";

function isLocalDevBrowserHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * Drive OAuth + `/api/local-cloud-sync/drive/*` — localhost dev par hamesha pocket-ledger.com
 * (local `.env` me GOOGLE_CLIENT_* / galat NEXT_PUBLIC_APP_URL se bachne ke liye).
 */
export function resolveDriveHostedApiUrl(apiPath: string): string {
  const path = String(apiPath || "").trim();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (isLocalDevBrowserHost()) {
    return `${POCKET_LEDGER_HOSTED_API_ORIGIN.replace(/\/+$/, "")}${normalizedPath}`;
  }
  return getBillingApiUrl(normalizedPath);
}
