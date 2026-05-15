/**
 * Billing & Plans: `/api/payments/*`, `/api/company/sync-plan`, `/api/company/downgrade-plan` server par JSON dete hain.
 *
 * `npm run build:static` (`STATIC_BUILD=1`): `out/` me koi Next API route nahi — relative `/api/...` static host par 404.
 * Isliye static bundle me env khali ho to default **`https://pocket-ledger.com`** (live billing + sync-plan).
 * Override: build par `NEXT_PUBLIC_BILLING_API_ORIGIN=https://...` set karo.
 */
/** Static export par env miss ho to plan/checkout POST yahi production origin par jaayein. */
const STATIC_BUILD_DEFAULT_BILLING_ORIGIN = "https://pocket-ledger.com";

/** Billing API ka base URL (trailing slash strip) — khali ho to same-origin relative paths (dev full Next). */
export function getBillingApiBaseOrigin(): string {
  const fromEnv =
    typeof process !== "undefined" ? String(process.env.NEXT_PUBLIC_BILLING_API_ORIGIN ?? "").trim() : "";
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  // Static APK/web export: local `/api` exist nahi karta — pocket-ledger.com par hosted APIs.
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_STATIC_BUILD === "1") {
    return STATIC_BUILD_DEFAULT_BILLING_ORIGIN.replace(/\/+$/, "");
  }
  return "";
}

export function getBillingApiUrl(apiPath: string): string {
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const origin = getBillingApiBaseOrigin();
  if (origin) return `${origin}${path}`;
  return path;
}
