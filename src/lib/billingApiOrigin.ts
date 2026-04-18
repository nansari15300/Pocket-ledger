/**
 * Billing & Plans: `/api/payments/*`, `/api/company/sync-plan`, `/api/company/downgrade-plan` server par JSON dete hain.
 * Static APK (`output: "export"`) me ye routes build me hata diye jaate hain — production web app URL yahan set karo.
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
