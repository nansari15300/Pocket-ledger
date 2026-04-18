"use client";

/**
 * Master–detail party page: `/party` + `?selected=<id>` (not `/party/[id]`).
 * `OVERDUE_ACCOUNT_ID` — party/page.tsx ke saath align (overdue virtual row).
 */
export const PARTY_PAGE_OVERDUE_SELECTED_ID = "__overdue__";

/** `/party` ya `/party/` (trailing slash) */
export function isPartyMasterDetailPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").replace(/\/+$/, "") || "/";
  return p === "/party";
}
