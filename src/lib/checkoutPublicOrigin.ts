import type { NextRequest } from "next/server";
import { isAllowedEmbeddedBillingClientOrigin } from "@/lib/server/billingApiCors";
import { isPocketLedgerAppHostname } from "@/lib/pocketLedgerAppHosts";

/** Env-style base (scheme optional) → absolute http(s) origin. */
export function normalizePaymentOrigin(raw: string): string {
  let base = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    const local =
      /^localhost\b/i.test(base) ||
      /^127\.\d+\.\d+\.\d+/.test(base) ||
      /^\[::1\]/.test(base);
    base = `${local ? "http" : "https"}://${base}`;
  }
  return base;
}

/**
 * `0.0.0.0` / `::` = server bind address; browser inko open nahi kar sakta (ERR_ADDRESS_INVALID).
 * Stripe success_url me inhe mat bhejo — NEXT_PUBLIC_BASE_URL ya localhost fallback use karo.
 */
function isUnusableBrowserRedirectHost(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase();
  return h === "0.0.0.0" || h === "::" || h === "[::]" || h === "";
}

/**
 * Stripe / Khalti return URLs: absolute origin.
 * APK/EXE cross-origin checkout: `Origin: https://localhost` → success/cancel wapas app WebView me.
 */
export function getPublicAppOriginForPaymentRedirects(req: NextRequest): string {
  const clientOrigin = req.headers.get("origin");
  if (clientOrigin && isAllowedEmbeddedBillingClientOrigin(clientOrigin)) {
    return clientOrigin.replace(/\/+$/, "");
  }

  try {
    const host = req.nextUrl.hostname;
    const fromReq = req.nextUrl?.origin;
    if (fromReq && /^https?:\/\//i.test(fromReq) && !isUnusableBrowserRedirectHost(host)) {
      return fromReq.replace(/\/+$/, "");
    }
  } catch {
    /* fall through */
  }

  const raw = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (raw) {
    return normalizePaymentOrigin(raw);
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/\/+$/, "")}`;
  }

  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  throw new Error(
    "Set NEXT_PUBLIC_BASE_URL to a full URL with scheme (e.g. https://yourdomain.com or http://localhost:3000)."
  );
}

/**
 * Path prefix for Stripe/Khalti/eSewa return pages.
 * Hosted web: `/app`. Capacitor/EXE static shells: ``. Next dev on :3000 with basePath: `/app`.
 */
export function getPaymentReturnPathPrefix(req: NextRequest, appOrigin: string): string {
  try {
    const u = new URL(appOrigin);
    if (u.protocol === "capacitor:" || u.protocol === "ionic:") return "";
    const host = u.hostname.toLowerCase();
    if (isPocketLedgerAppHostname(host)) return "/app";
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      const port = u.port;
      // Capacitor `https://localhost` (no port) / EXE static ports → no basePath.
      // Next web `localhost:3000` under hosted `/app` basePath → include `/app`.
      if (port === "3000" || port === "3001") {
        const env = String(process.env.NEXT_PUBLIC_WEB_APP_BASE_PATH || "").trim();
        if (env === "/app") return "/app";
      }
      return "";
    }
  } catch {
    /* fall through */
  }

  try {
    const pathname = req.nextUrl?.pathname || "";
    if (pathname === "/app" || pathname.startsWith("/app/")) return "/app";
  } catch {
    /* fall through */
  }

  const env = String(process.env.NEXT_PUBLIC_WEB_APP_BASE_PATH || "").trim();
  return env === "/app" ? "/app" : "";
}

/** Absolute success/cancel URL for payment gateways (includes `/app` when needed). */
export function getPublicAppHrefForPaymentRedirects(req: NextRequest, path: string): string {
  const origin = getPublicAppOriginForPaymentRedirects(req).replace(/\/+$/, "");
  const prefix = getPaymentReturnPathPrefix(req, origin);
  let p = String(path || "").trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (prefix && !(p === prefix || p.startsWith(`${prefix}/`))) {
    p = `${prefix}${p}`;
  }
  return `${origin}${p}`;
}
