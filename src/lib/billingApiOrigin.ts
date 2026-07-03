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
 * Override: `NEXT_PUBLIC_BILLING_API_ORIGIN=http://127.0.0.1:3000` se local billing API test kar sakte ho.
 */
import { isCapacitorNativeApp } from "@/lib/isCapacitorNative";
import { isElectronDesktopApp } from "@/lib/isElectronDesktop";
import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

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

/** Windows: `localhost` kabhi IPv6 `[::1]` par static export pakad leta hai — dev API `127.0.0.1` par chale. */
export function normalizeDevLoopbackBillingOrigin(origin: string): string {
  const normalized = normalizeBillingOrigin(origin);
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "development") {
    return normalized;
  }
  try {
    const withScheme = /^https?:\/\//i.test(normalized) ? normalized : `http://${normalized}`;
    const u = new URL(withScheme);
    if (u.hostname.toLowerCase() === "localhost") {
      u.hostname = "127.0.0.1";
      return normalizeBillingOrigin(u.origin);
    }
  } catch {
    /* fall through */
  }
  return normalized;
}

/** Static/APK/EXE: local static server par Google OAuth secrets nahi — hosted API force. */
function shouldForceHostedBillingApiOrigin(): boolean {
  if (typeof window === "undefined") return false;
  return isCapacitorNativeApp() || isElectronDesktopApp() || isStaticAppBuild();
}

/** Web browser dev (`npm run dev`): Drive/billing hamesha hosted — `.env.local` loopback / galat OAuth mat use karo. */
function shouldUseHostedBillingApiInWebDev(): boolean {
  if (typeof process === "undefined" || process.env.NODE_ENV !== "development") return false;
  if (typeof window === "undefined") return true;
  return !isCapacitorNativeApp() && !isElectronDesktopApp() && !isStaticAppBuild();
}

/** Billing API base — dev web default pocket-ledger.com (Drive OAuth secrets wahan); override env se local. */
export function getBillingApiBaseOrigin(): string {
  // Capacitor APK / Electron EXE / static bundle — `.env.local` localhost bake ho to bhi pocket-ledger.com par jao.
  if (shouldForceHostedBillingApiOrigin()) {
    return normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN);
  }

  if (shouldUseHostedBillingApiInWebDev()) {
    const fromEnv =
      typeof process !== "undefined" ? String(process.env.NEXT_PUBLIC_BILLING_API_ORIGIN ?? "").trim() : "";
    if (fromEnv && !isLoopbackBillingOrigin(fromEnv)) {
      return normalizeBillingOrigin(fromEnv);
    }
    return normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN);
  }

  const fromEnv =
    typeof process !== "undefined" ? String(process.env.NEXT_PUBLIC_BILLING_API_ORIGIN ?? "").trim() : "";
  const staticBundle =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_STATIC_BUILD === "1";

  if (fromEnv) {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      return normalizeDevLoopbackBillingOrigin(fromEnv);
    }
    if (!isLoopbackBillingOrigin(fromEnv)) {
      return normalizeBillingOrigin(fromEnv);
    }
  }

  if (staticBundle && typeof process !== "undefined" && process.env.NODE_ENV !== "development") {
    return normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN);
  }

  return "";
}

/** Relative `/api/...` ko hamesha absolute HTTPS URL banao — native HTTP stack ke liye zaroori. */
export function resolveHostedApiAbsoluteUrl(apiPathOrUrl: string): string {
  const raw = String(apiPathOrUrl || "").trim();
  if (/^https?:\/\//i.test(raw)) {
    if (
      typeof window !== "undefined" &&
      shouldUseHostedBillingApiInWebDev() &&
      isLoopbackBillingOrigin(raw)
    ) {
      try {
        const u = new URL(raw);
        return `${normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN)}${u.pathname}${u.search}`;
      } catch {
        return normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN);
      }
    }
    if (typeof window !== "undefined" && shouldForceHostedBillingApiOrigin() && isLoopbackBillingOrigin(raw)) {
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
  if (!origin) {
    origin = normalizeBillingOrigin(POCKET_LEDGER_HOSTED_API_ORIGIN);
  }
  return `${origin}${path}`;
}

export function getBillingApiUrl(apiPath: string): string {
  return resolveHostedApiAbsoluteUrl(apiPath);
}
