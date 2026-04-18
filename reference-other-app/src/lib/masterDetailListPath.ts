import { isStaticAppBuild } from "@/lib/isStaticAppBuild";

/** Master–detail pages jinka list URL ?selected= se alag hota hai — back pe sirf list, query hataana */
export type MasterDetailListRouteKey =
  | "party"
  | "bank-cash"
  | "staff"
  | "items"
  | "tax"
  | "incomes";

/**
 * List-only path (bina ?selected=). Static APK ma trailingSlash true → `/party/`; dev ma `/party`.
 * router.replace() se push() jasto double history entry nahi — hardware back pehle list par rahe.
 */
export function masterDetailListHref(key: MasterDetailListRouteKey): string {
  const base = `/${key}`;
  return isStaticAppBuild() ? `${base}/` : base;
}
