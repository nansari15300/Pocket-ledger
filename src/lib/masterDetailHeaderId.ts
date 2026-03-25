/**
 * Master-detail pages (party, bank-cash, …) sync selected id here so the header Report button
 * does not flicker when useSearchParams briefly loses ?selected= during router.replace (Next.js).
 */
const STORAGE_PREFIX = "pl_md_hdr_";

/** Custom event so AppHeader re-renders after sessionStorage write (same-tab). */
export const PL_MASTER_DETAIL_HEADER_SYNC = "pl-master-detail-header-sync";

export function readMasterDetailHeaderId(routeKey: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const v = sessionStorage.getItem(STORAGE_PREFIX + routeKey);
    return v && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Persist selected entity id for header Report fallback; clears when id is null. */
export function writeMasterDetailHeaderId(routeKey: string, id: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (id) sessionStorage.setItem(STORAGE_PREFIX + routeKey, id);
    else sessionStorage.removeItem(STORAGE_PREFIX + routeKey);
    window.dispatchEvent(new Event(PL_MASTER_DETAIL_HEADER_SYNC));
  } catch {
    /* private mode / quota */
  }
}
