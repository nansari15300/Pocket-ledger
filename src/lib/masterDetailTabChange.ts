import { masterDetailListHref, type MasterDetailListRouteKey } from "@/lib/masterDetailListPath";

/** Default tab pe `view` query omit (e.g. accounts / parties / staff). */
export function masterDetailTabViewQuery(tab: string, defaultTab: string): string | null {
  return tab === defaultTab ? null : tab;
}

/** List-only ya desktop selection ke saath master-detail tab URL. */
export function masterDetailTabHref(
  routeKey: MasterDetailListRouteKey,
  options: {
    tab: string;
    defaultTab: string;
    selectedId?: string | null;
    /** Mobile tab switch: `?selected=` omit — list pe raho jab tak row tap na ho */
    listOnly?: boolean;
  }
): string {
  const base = masterDetailListHref(routeKey);
  const params = new URLSearchParams();
  const view = masterDetailTabViewQuery(options.tab, options.defaultTab);
  if (view) params.set("view", view);
  if (!options.listOnly && options.selectedId) {
    params.set("selected", options.selectedId);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function replaceMasterDetailTabUrl(
  href: string,
  router: { replace: (href: string, opts?: { scroll?: boolean }) => void },
  syncRouter: boolean
): void {
  if (typeof window !== "undefined") {
    try {
      window.history.replaceState(window.history.state, "", href);
    } catch {
      /* ignore */
    }
  }
  if (syncRouter) {
    router.replace(href, { scroll: false });
  }
}

/** Mobile: tab switch par list; desktop: memory / pehli row pick */
export function tabSwitchSelection<T extends { id: string }>(
  isMobile: boolean,
  desktopPick: T | null
): T | null {
  return isMobile ? null : desktopPick;
}
