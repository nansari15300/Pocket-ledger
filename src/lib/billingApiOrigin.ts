/**
 * Billing & Plans: `/api/payments/*`, `/api/company/sync-plan`, `/api/company/downgrade-plan` server par JSON dete hain.
 *
 * `npm run build:static` (`STATIC_BUILD=1`): `scripts/build-static.js` build ke dauran `src/app/api` hata deta hai —
 * exported `out/` me koi API route nahi. Agar `NEXT_PUBLIC_BILLING_API_ORIGIN` build par khali raha to yahan relative path
 * return hota hai → deploy domain par `/api/...` = 404 HTML → checkout `res.json()` fail.
 *
 * Fix: build se pehle `.env.local` me `NEXT_PUBLIC_BILLING_API_ORIGIN=https://...` (jahan full Next + API live ho) set karo.
 */
export function getBillingApiUrl(apiPath: string): string {
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const origin =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BILLING_API_ORIGIN?.trim() : "";
  if (origin) {
    return `${origin.replace(/\/+$/, "")}${path}`;
  }
  return path;
}
