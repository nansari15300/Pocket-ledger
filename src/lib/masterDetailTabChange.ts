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

/**
 * Tab `replaceState` ke baad `useSearchParams` stale reh sakta hai — address bar pehle.
 * Location pe `selected`/`view` nahi → null (stale React searchParams ignore).
 */
export function readMasterDetailLocationQuery(): {
  view: string | null;
  selectedId: string | null;
} {
  if (typeof window === "undefined") {
    return { view: null, selectedId: null };
  }
  try {
    const loc = new URLSearchParams(window.location.search);
    return {
      view: loc.has("view") ? loc.get("view") : null,
      selectedId: loc.has("selected") ? loc.get("selected") : null,
    };
  } catch {
    return { view: null, selectedId: null };
  }
}

export function readMasterDetailSelections(storageKey: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { selections?: Record<string, string> };
    return parsed?.selections ?? {};
  } catch {
    return {};
  }
}

export function writeMasterDetailPageState(
  storageKey: string,
  tab: string,
  selectedId?: string | null
): void {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as { selections?: Record<string, string>; activeView?: string }) : { selections: {} };
    parsed.activeView = tab;
    if (selectedId) {
      parsed.selections = { ...(parsed.selections ?? {}), [tab]: selectedId };
    }
    localStorage.setItem(storageKey, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

/** Active tab ki list se memory / pehli row — Party-style instant tab select. */
export function pickRememberedListSelection<T extends { id: string }>(
  storageKey: string,
  tab: string,
  items: readonly T[],
  excludeIds?: ReadonlySet<string> | readonly string[]
): T | null {
  if (!items.length) return null;
  const exclude = excludeIds
    ? new Set(Array.isArray(excludeIds) || excludeIds instanceof Set ? [...excludeIds] : [])
    : null;
  const remembered = readMasterDetailSelections(storageKey)[tab];
  if (remembered) {
    const found = items.find((i) => i.id === remembered && (!exclude || !exclude.has(i.id)));
    if (found) return found;
  }
  return items.find((i) => !exclude || !exclude.has(i.id)) ?? items[0] ?? null;
}

/** Desktop canonical: default tab pe `view` omit; selected optional. */
export function masterDetailCanonicalHref(
  routeKey: MasterDetailListRouteKey,
  options: { tab: string; defaultTab: string; selectedId?: string | null }
): string {
  return masterDetailTabHref(routeKey, {
    tab: options.tab,
    defaultTab: options.defaultTab,
    selectedId: options.selectedId,
    listOnly: !options.selectedId,
  });
}
