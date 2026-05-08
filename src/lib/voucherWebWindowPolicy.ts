import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/** Web cloud: pehle sirf latest N vouchers Firestore listener — APK/static/local company par poori list jaisa pehle. */
export const WEB_CLOUD_VOUCHER_INITIAL_LIMIT = 50;

/** Browser + cloud-backed company (SQLite-first local company excluded). */
export function shouldUseWebCloudWindowedVouchers(isLocalCompanySelected: boolean): boolean {
  return !isStaticAppBuild() && !isLocalCompanySelected;
}
