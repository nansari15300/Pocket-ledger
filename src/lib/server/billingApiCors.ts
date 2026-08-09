import type { NextRequest } from "next/server";
import { isPocketLedgerAppHostname } from "@/lib/pocketLedgerAppHosts";

/**
 * Static EXE / APK / Next dev: browser `fetch` → `https://pocket-ledger.com/api/...` cross-origin.
 * Server ko `Access-Control-Allow-Origin` (preflight + POST) dena zaroori — warna checkout/plan sync "Failed to fetch".
 */

/** Capacitor bundled shell = `https://localhost`; EXE/dev = localhost ports — in sab ko allow karo. */
export function isAllowedEmbeddedBillingClientOrigin(origin: string): boolean {
  if (!origin || typeof origin !== "string") return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  // Electron embedded static server + `next dev` + Capacitor `androidScheme: https`, hostname localhost
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  // Same prod host (self) — pocket-ledger.com and pocketledger.com (+ subdomains)
  if (isPocketLedgerAppHostname(host)) return true;
  // Capacitor / Ionic WebView (legacy scheme)
  if (u.protocol === "capacitor:" || u.protocol === "ionic:") return true;
  // Raw IPv4 — LAN (192.168.x) ya public WAN (P2P admin http://110.x.x.x:5000) dono embedded client ke liye.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  return false;
}

function getAllowedBillingCorsOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin || typeof origin !== "string") return null;
  return isAllowedEmbeddedBillingClientOrigin(origin) ? origin : null;
}

/** Middleware matcher — static client cross-origin billing + local Drive sync APIs. */
export function isPocketLedgerBillingApiCorsPath(pathname: string): boolean {
  if (pathname.startsWith("/api/billing/")) return true;
  if (pathname.startsWith("/api/local-cloud-sync/")) return true;
  if (pathname.startsWith("/api/auth/google/")) return true;
  if (pathname === "/api/auth/pl-firebase-handoff") return true;
  if (pathname.startsWith("/api/payments/webhook/")) return false;
  if (pathname.startsWith("/api/payments/")) return true;
  return (
    pathname === "/api/company/sync-plan" ||
    pathname === "/api/company/downgrade-plan" ||
    pathname === "/api/company/repair-stripe-plan-expiry" ||
    pathname === "/api/company/billing-auto-renew" ||
    pathname === "/api/company/billing-payments-statement" ||
    pathname === "/api/company/recycle-bin-finalize" ||
    pathname === "/api/admin/recycle-bin/delete-company"
  );
}

/** Har JSON response + OPTIONS ke saath merge karo — unknown origin par khali (browser default deny). */
export function corsHeadersForPocketLedgerBillingApi(req: NextRequest): HeadersInit {
  const allow = getAllowedBillingCorsOrigin(req);
  if (!allow) return {};
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
