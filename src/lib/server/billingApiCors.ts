import type { NextRequest } from "next/server";

/**
 * Static EXE / APK / Next dev: browser `fetch` → `https://pocket-ledger.com/api/...` cross-origin.
 * Server ko `Access-Control-Allow-Origin` (preflight + POST) dena zaroori — warna "Could not sync plan" toast.
 */
function getAllowedBillingCorsOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (!origin || typeof origin !== "string") return null;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  // Electron embedded static server + `next dev`
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return origin;
  // Same prod host (self) + preview deploys
  if (host === "pocket-ledger.com" || host.endsWith(".pocket-ledger.com")) return origin;
  // Capacitor / Ionic WebView
  if (u.protocol === "capacitor:" || u.protocol === "ionic:") return origin;
  // LAN / emulator (optional dev device)
  if (
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
  ) {
    return origin;
  }
  return null;
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
