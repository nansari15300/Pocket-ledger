import { isStaticAppBuild } from "@/lib/isStaticAppBuild";
import { browserHistoryHref } from "@/lib/webAppBasePath";

/** Master–detail pages jinka list URL ?selected= se alag hota hai — back pe sirf list, query hataana */
export type MasterDetailListRouteKey =
  | "party"
  | "bank-cash"
  | "staff"
  | "items"
  | "tax"
  | "incomes"
  | "quotations";

/**
 * List-only path (bina ?selected=). Static APK ma trailingSlash true → `/party/`; dev ma `/party`.
 * router.replace() se push() jasto double history entry nahi — hardware back pehle list par rahe.
 */
export function masterDetailListHref(key: MasterDetailListRouteKey): string {
  const base = `/${key}`;
  return isStaticAppBuild() ? `${base}/` : base;
}

/**
 * Detail → list href. `view=groups` (aur bank-cash `view=clearing`) rakho jab address bar me ho.
 * Optional `href` — party jaisi custom list URL override.
 */
export function masterDetailBackToListHref(
  key: MasterDetailListRouteKey,
  options?: { href?: string }
): string {
  if (options?.href) return options.href;
  const base = masterDetailListHref(key);
  if (typeof window === "undefined") return base;
  try {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "groups") return `${base}?view=groups`;
    if (key === "bank-cash" && view === "clearing") return `${base}?view=clearing`;
  } catch {
    /* ignore */
  }
  return base;
}

/**
 * Detail → list: pehle address bar se `?selected=` hatao (sync replaceState).
 * Sirf `router.replace` async hai — usse pehle setSelected(null) pe sync effect
 * purani location se detail wapas khol deta hai (do-click back).
 * Returns href for `router.replace(href, { scroll: false })`.
 */
export function applyMasterDetailBackToListUrl(
  key: MasterDetailListRouteKey,
  options?: { href?: string }
): string {
  const href = masterDetailBackToListHref(key, options);
  if (typeof window !== "undefined") {
    try {
      window.history.replaceState(window.history.state, "", browserHistoryHref(href));
    } catch {
      /* ignore */
    }
  }
  return href;
}
