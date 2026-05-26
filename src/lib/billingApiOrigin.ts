/**
 * Hosted Next API routes — static/APK/EXE me relative `/api/...` 404 deta hai.
 *
 * Uses:
 * - Billing & plans: `/api/payments/*`, `/api/company/sync-plan`, …
 * - Local company Google Drive: `/api/auth/google/drive-auth-url`, `/api/local-cloud-sync/drive/*`
 *
 * `npm run build:static` (`STATIC_BUILD=1`): env khali ho to default **`https://pocket-ledger.com`**.
 *
 * ⚠️ MAT HATANA — static/APK par yahi origin plan + Drive sync/backup ke liye zaroori hai;
 * refactors me is default ko mat hatao / mat relative `/api` par wapas karo.
 *
 * Override: build par `NEXT_PUBLIC_BILLING_API_ORIGIN=https://...` set karo.
 */
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";

/** Static export par env miss ho to plan/checkout POST yahi production origin par jaayein. */
export const POCKET_LEDGER_HOSTED_API_ORIGIN = "https://pocket-ledger.com";

function normalizeBillingOrigin(origin: string): string {
  return String(origin || "").trim().replace(/\/+$/, "");
}

function isLoopbackBillingOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(origin);
  }
}

/** Billing API ka base URL (trailing slash strip) — khali ho to same-origin relative paths (dev full Next). */
export function getBillingApiBaseOrigin(): string {
  // Capacitor APK — `.env.local` me `localhost:3000` bake ho to bhi pocket-ledger.com par jao.
  if (typeof window !== "undefined" && isCapacitorNativeApp()) {
    return normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN);
  }

  const fromEnv =
    typeof process !== "undefined" ? String(process.env.NEXT_PUBLIC_BILLING_API_ORIGIN ?? "").trim() : "";
  const staticBundle =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_STATIC_BUILD === "1";

  // Dev (`npm run dev`) + `.env.local` localhost — same-origin API; APK fix yahan mat lagao (Capacitor + build-static.js alag).
  if (fromEnv) return normalizeBillingOrigin(fromEnv);

  // Static export / APK bundle (production build) — hosted API; dev mode me niche "" → same-origin fallback.
  if (staticBundle && typeof process !== "undefined" && process.env.NODE_ENV !== "development") {
    return normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN);
  }

  return "";
}

/** Relative `/api/...` ko hamesha absolute HTTPS URL banao — native HTTP stack ke liye zaroori. */
export function resolveHostedApiAbsoluteUrl(apiPathOrUrl: string): string {
  const raw = String(apiPathOrUrl || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    if (typeof window !== "undefined" && isCapacitorNativeApp() && isLoopbackBillingOrigin(raw)) {
      try {
        const u = new URL(raw);
        return `${normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN)}${u.pathname}${u.search}`;
      } catch {
        return normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN);
      }
    }
    return raw;
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  let origin = getBillingApiBaseOrigin();
  // Full Next dev / production same-origin — env khali ho to current page origin (localhost ya pocket-ledger.com).
  if (!origin && typeof window !== "undefined" && window.location?.origin) {
    origin = normalizeBillingOrigin(window.location.origin);
  }
  if (!origin) {
    origin = normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN);
  }
  return `${origin}${path}`;
}

export function getBillingApiUrl(apiPath: string): string {
  return resolveHostedApiAbsoluteUrl(apiPath);
}
