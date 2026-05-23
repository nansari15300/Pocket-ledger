import type { NextRequest } from "next/server";
import { isAllowedEmbeddedBillingClientOrigin } from "@/lib/server/billingApiCors";

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
